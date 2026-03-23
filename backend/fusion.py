import math
from typing import Dict, List, Tuple

from models import IngestPayload
from filters import KalmanFilter2D, MovingAverageFilter
from quantum import QuantumRefiner
from utils import (
    KNOWN_BLE_BEACONS,
    WIFI_ROUTER_DB,
    clamp,
    gps_to_local,
    group_count,
    rssi_to_distance,
    weighted_average_2d,
    weighted_centroid,
)

class SensorFusionEngine:
    def __init__(self):
        # We track Kalman filters per device
        self.kalman_filters: Dict[str, KalmanFilter2D] = {}

        # Quantum refiner is stateless
        self.quantum_refiner = QuantumRefiner()

        # Dead reckoning tracking
        self.last_positions: Dict[str, Tuple[float, float]] = {}
        self.last_update_ts: Dict[str, float] = {}
        self.gps_reference: Dict[str, Tuple[float, float]] = {}
        self.last_confidence: Dict[str, float] = {}

        # Per-device, per-source RSSI smoothing filters
        self.rssi_smoothers: Dict[str, Dict[str, MovingAverageFilter]] = {}
        self.latest_peer_links: Dict[str, Dict[str, Tuple[float, float]]] = {}

    def _smooth_rssi(self, device_id: str, source_id: str, rssi: float) -> float:
        if device_id not in self.rssi_smoothers:
            self.rssi_smoothers[device_id] = {}
        if source_id not in self.rssi_smoothers[device_id]:
            self.rssi_smoothers[device_id][source_id] = MovingAverageFilter(window_size=4)
        return self.rssi_smoothers[device_id][source_id].update(rssi)

    def _dead_reckoning(self, payload: IngestPayload, base_x: float, base_y: float) -> Tuple[float, float]:
        if not payload.imu or payload.imu.steps <= 0:
            return base_x, base_y
        stride_m = 0.68
        distance = payload.imu.steps * stride_m
        theta = math.radians(payload.imu.direction)
        if payload.device_id in self.last_positions:
            px, py = self.last_positions[payload.device_id]
        else:
            px, py = base_x, base_y
        dr_x = px + math.cos(theta) * distance
        dr_y = py + math.sin(theta) * distance
        return dr_x, dr_y

    def process(
        self,
        payload: IngestPayload,
        normalized_ts: float,
        apply_quantum: bool = True,
    ) -> Tuple[float, float, float, float]:
        """
        Takes raw data payload, applies rough mapping, dead reckoning, Kalman filtering,
        and finally quantum refinement to output the (x, y, z, confidence).
        """
        device_id = payload.device_id

        if device_id not in self.kalman_filters:
            self.kalman_filters[device_id] = KalmanFilter2D(dt=1.0)

        kf = self.kalman_filters[device_id]
        prev_ts = self.last_update_ts.get(device_id, normalized_ts)
        dt = max(0.05, min(2.0, normalized_ts - prev_ts))

        # 1. Indoor/Outdoor Detection
        # If GPS accuracy < 20 -> outdoor mode
        outdoor_mode = False
        gps_x, gps_y = 0.0, 0.0
        if payload.gps and payload.gps.accuracy < 20.0:
            outdoor_mode = True
            if device_id not in self.gps_reference:
                self.gps_reference[device_id] = (payload.gps.lat, payload.gps.lon)
            ref_lat, ref_lon = self.gps_reference[device_id]
            gps_x, gps_y = gps_to_local(payload.gps.lat, payload.gps.lon, ref_lat, ref_lon)

        # 2. RSSI stabilization + rough mapping
        router_positions = WIFI_ROUTER_DB.get_all()
        smoothed_wifi = [
            (ap.source_id, self._smooth_rssi(device_id, f"wifi:{ap.source_id}", ap.rssi))
            for ap in payload.wifi
        ]
        smoothed_ble = [(b.id, self._smooth_rssi(device_id, f"ble:{b.id}", b.rssi)) for b in payload.ble]
        smoothed_peers = [(p.id, self._smooth_rssi(device_id, f"peer:{p.id}", p.rssi)) for p in payload.peers]

        wifi_x, wifi_y, wifi_z, wifi_weight = weighted_centroid(
            measurements=smoothed_wifi,
            location_map=router_positions,
            env_factor=3.0,
        )
        ble_x, ble_y, ble_z, ble_weight = weighted_centroid(
            measurements=smoothed_ble,
            location_map=KNOWN_BLE_BEACONS,
            env_factor=2.0,
        )

        rough_z = wifi_z if wifi_weight >= ble_weight else ble_z
        if payload.floor_hint is not None:
            # Floor hint is in floors; convert to meters for visualization and filtering.
            rough_z = float(payload.floor_hint) * 3.0

        wifi_sources = group_count(smoothed_wifi)
        ble_sources = group_count(smoothed_ble)

        # 3. Sensor Fusion / Measurement Update
        weighted_points: List[Tuple[float, float, float]] = []

        if wifi_weight > 0:
            weighted_points.append((wifi_x, wifi_y, 0.45 + min(0.30, wifi_sources * 0.05)))
        if ble_weight > 0:
            weighted_points.append((ble_x, ble_y, 0.25 + min(0.25, ble_sources * 0.07)))

        # If outdoor mode is on, GPS contributes strongly.
        if outdoor_mode and payload.gps:
            gps_weight = 0.75 if payload.gps.accuracy < 10 else 0.60
            weighted_points.append((gps_x, gps_y, gps_weight))

        # Peer-to-peer ranging contributes when referenced phones are already tracked.
        current_pos = self.last_positions.get(device_id, (0.0, 0.0))
        peer_links: Dict[str, Tuple[float, float]] = {}
        for peer_id, peer_rssi in smoothed_peers:
            if peer_id not in self.last_positions:
                continue

            peer_x, peer_y = self.last_positions[peer_id]
            est_dist = rssi_to_distance(peer_rssi, tx_power=-58, env_factor=2.2)
            peer_links[peer_id] = (est_dist, peer_rssi)

            # Keep self on a ring around peer using previous heading from peer->self.
            vec_x = current_pos[0] - peer_x
            vec_y = current_pos[1] - peer_y
            norm = math.hypot(vec_x, vec_y)
            if norm < 1e-3:
                vec_x, vec_y, norm = 1.0, 0.0, 1.0
            unit_x = vec_x / norm
            unit_y = vec_y / norm

            peer_candidate_x = peer_x + unit_x * est_dist
            peer_candidate_y = peer_y + unit_y * est_dist
            peer_weight = 0.18 + min(0.16, (95 + peer_rssi) * 0.003)
            weighted_points.append((peer_candidate_x, peer_candidate_y, peer_weight))

        self.latest_peer_links[device_id] = peer_links

        fusion_x, fusion_y, total_weight = weighted_average_2d(weighted_points)

        # IMU dead reckoning as short-term correction.
        dr_x, dr_y = self._dead_reckoning(payload, fusion_x, fusion_y)
        if payload.imu and payload.imu.steps > 0:
            fusion_x = 0.65 * fusion_x + 0.35 * dr_x
            fusion_y = 0.65 * fusion_y + 0.35 * dr_y

        # Fallback to dead reckoning only if no absolute source exists.
        if total_weight <= 0 and payload.imu and payload.imu.steps > 0:
            fusion_x, fusion_y = dr_x, dr_y

        # 4. Classical Filtering Layer (Kalman)
        kf.predict(dt=dt)

        # Update with fused measurement
        filtered_x, filtered_y = kf.update([fusion_x, fusion_y])

        # Save for dead reckoning next tick
        self.last_positions[device_id] = (filtered_x, filtered_y)
        self.last_update_ts[device_id] = normalized_ts

        # Confidence score from sensor availability and signal health.
        signal_score = 0.0
        if wifi_weight > 0:
            signal_score += min(0.45, 0.12 * wifi_sources)
        if ble_weight > 0:
            signal_score += min(0.25, 0.10 * ble_sources)
        if payload.imu:
            signal_score += 0.10
        if payload.gps and payload.gps.accuracy < 20:
            signal_score += 0.30
        if smoothed_peers:
            signal_score += min(0.20, 0.06 * len(smoothed_peers))
        confidence = clamp(signal_score, 0.10, 0.95)

        # 5. Quantum Layer Refinement (target-only when configured by caller)
        if apply_quantum:
            final_x, final_y, final_confidence = self.quantum_refiner.refine(
                filtered_x,
                filtered_y,
                confidence,
                wifi_measurements=smoothed_wifi,
                router_positions=router_positions,
            )
        else:
            final_x, final_y, final_confidence = filtered_x, filtered_y, confidence

        self.last_confidence[device_id] = final_confidence

        return final_x, final_y, rough_z, final_confidence

    def get_relative_links(self) -> List[dict]:
        links: List[dict] = []
        for src, peers in self.latest_peer_links.items():
            for tgt, (distance, rssi) in peers.items():
                links.append(
                    {
                        "source_device_id": src,
                        "target_device_id": tgt,
                        "estimated_distance_m": round(distance, 3),
                        "rssi": round(rssi, 1),
                    }
                )
        return links

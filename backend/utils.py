import math
import time
from collections import defaultdict
from typing import Dict, Iterable, List, Tuple

KNOWN_WIFI_APS: Dict[str, Tuple[float, float, float]] = {
    "AP_1": (0.0, 0.0, 0.0),
    "AP_2": (10.0, 0.0, 0.0),
    "AP_3": (0.0, 10.0, 0.0),
    "AP_4": (10.0, 10.0, 0.0),
    "AP_5": (0.0, 0.0, 3.0),
    "AP_6": (10.0, 0.0, 3.0),
    "AP_7": (0.0, 10.0, 3.0),
    "AP_8": (10.0, 10.0, 3.0),
    "AP_9": (25.0, 25.0, 0.0),
    "00:11:22:33:44:01": (0.0, 0.0, 0.0),
    "00:11:22:33:44:02": (10.0, 0.0, 0.0),
    "00:11:22:33:44:03": (0.0, 10.0, 0.0),
    "00:11:22:33:44:04": (10.0, 10.0, 0.0),
    "00:11:22:33:44:05": (0.0, 0.0, 3.0),
    "00:11:22:33:44:06": (10.0, 0.0, 3.0),
    "00:11:22:33:44:07": (0.0, 10.0, 3.0),
    "00:11:22:33:44:08": (10.0, 10.0, 3.0),
}

KNOWN_BLE_BEACONS: Dict[str, Tuple[float, float, float]] = {
    "BLE_1": (5.0, 5.0, 0.0),
    "BLE_2": (3.0, 7.0, 0.0),
    "BLE_3": (7.0, 3.0, 0.0),
    "BLE_4": (5.0, 5.0, 3.0),
    "BLE_5": (3.0, 7.0, 3.0),
    "BLE_6": (7.0, 3.0, 3.0),
}


class WiFiRouterDatabase:
    """In-memory router position database used by ingest/fusion APIs."""

    def __init__(self, routers: Dict[str, Tuple[float, float, float]]):
        self._routers = dict(routers)

    def get_all(self) -> Dict[str, Tuple[float, float, float]]:
        return dict(self._routers)

    def upsert(self, bssid: str, pos: Tuple[float, float, float]) -> None:
        self._routers[bssid] = pos


WIFI_ROUTER_DB = WiFiRouterDatabase(KNOWN_WIFI_APS)

def rssi_to_distance(rssi: float, tx_power: int = -59, env_factor: float = 2.2) -> float:
    """
    Convert RSSI to approximate distance using the log-distance path loss model.
    tx_power: RSSI at 1 meter.
    env_factor: Environmental attenuation factor (2.0 for free space, 3-4 for indoor).
    """
    if rssi >= 0:
        return 30.0
    ratio = (tx_power - rssi) / (10.0 * env_factor)
    return min(30.0, max(0.5, math.pow(10, ratio)))

def weighted_centroid(
    measurements: Iterable[Tuple[str, float]],
    location_map: Dict[str, Tuple[float, float, float]],
    env_factor: float,
) -> Tuple[float, float, float, float]:
    """
    Compute rough (x, y, z) position using a weighted centroid based on distance.
    measurements: List of (id, rssi)
    Returns: x, y, z, total_weight
    """
    x_sum, y_sum, z_sum, weight_sum = 0.0, 0.0, 0.0, 0.0
    
    for source_id, rssi in measurements:
        if source_id in location_map:
            dist = rssi_to_distance(rssi, env_factor=env_factor)
            weight = 1.0 / (dist + 1e-6)
            ap_x, ap_y, ap_z = location_map[source_id]
            
            x_sum += ap_x * weight
            y_sum += ap_y * weight
            z_sum += ap_z * weight
            weight_sum += weight
            
    if weight_sum > 0:
        return (x_sum / weight_sum), (y_sum / weight_sum), (z_sum / weight_sum), weight_sum
    return 0.0, 0.0, 0.0, 0.0

def gps_to_local(lat: float, lon: float, ref_lat: float = 0.0, ref_lon: float = 0.0) -> Tuple[float, float]:
    """
    Convert GPS lat/lon to local coordinates (rough approximation in meters).
    """
    # 1 degree of latitude is ~111,320 meters
    x = (lon - ref_lon) * 111320.0 * math.cos(math.radians(ref_lat))
    y = (lat - ref_lat) * 111320.0
    return x, y


class ClockSynchronizer:
    """Tracks per-device clock offset to map device timestamps into server time."""

    def __init__(self, alpha: float = 0.15):
        self.alpha = alpha
        self._offsets: Dict[str, float] = {}

    def normalize(self, device_id: str, device_timestamp: float, server_received_ts: float) -> float:
        observed_offset = server_received_ts - device_timestamp
        if device_id not in self._offsets:
            self._offsets[device_id] = observed_offset
        else:
            prev = self._offsets[device_id]
            self._offsets[device_id] = (1.0 - self.alpha) * prev + self.alpha * observed_offset
        return device_timestamp + self._offsets[device_id]


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def weighted_average_2d(points: List[Tuple[float, float, float]]) -> Tuple[float, float, float]:
    """Points are (x, y, w). Returns fused (x, y, total_weight)."""
    if not points:
        return 0.0, 0.0, 0.0
    wx = 0.0
    wy = 0.0
    wsum = 0.0
    for x, y, w in points:
        if w <= 0:
            continue
        wx += x * w
        wy += y * w
        wsum += w
    if wsum <= 0:
        return 0.0, 0.0, 0.0
    return wx / wsum, wy / wsum, wsum


def group_count(measurements: Iterable[Tuple[str, float]]) -> int:
    groups = defaultdict(int)
    for source_id, _ in measurements:
        groups[source_id] += 1
    return len(groups)

def get_server_timestamp() -> float:
    """Returns current server time as a unix timestamp in seconds."""
    return time.time()

import uvicorn
import logging
import asyncio
import time
import math
from dataclasses import dataclass, field
from typing import Dict, List

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fusion import SensorFusionEngine
from models import (
    DetectorInfo,
    IngestAck,
    IngestPayload,
    PositionResponse,
    RelativeLinkResponse,
    RouterPositionResponse,
    TargetInfo,
    TargetSelectionRequest,
    TargetTrackingResponse,
)
from utils import ClockSynchronizer, WIFI_ROUTER_DB, get_server_timestamp

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("tracker")

app = FastAPI(title="Real-time Indoor/Outdoor Tracking System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@dataclass
class BufferedPacket:
    payload: IngestPayload
    normalized_ts: float
    received_server_ts: float


@dataclass
class DeviceState:
    last_processed_sequence: int = -1
    packet_buffer: Dict[int, BufferedPacket] = field(default_factory=dict)
    latest_position: PositionResponse | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


device_states: Dict[str, DeviceState] = {}

# Core engine
fusion_engine = SensorFusionEngine()
clock_sync = ClockSynchronizer(alpha=0.15)

# Buffer configuration
BUFFER_TIME_WINDOW = 3.0
MAX_BUFFER_PACKETS = 64
OUT_OF_ORDER_WAIT = 0.8
selected_target_id: str | None = None


def _get_or_create_device_state(device_id: str) -> DeviceState:
    if device_id not in device_states:
        device_states[device_id] = DeviceState()
    return device_states[device_id]


def _prune_stale_packets(device_state: DeviceState, now_ts: float):
    stale_sequences = []
    for seq, packet in device_state.packet_buffer.items():
        if now_ts - packet.received_server_ts > BUFFER_TIME_WINDOW:
            stale_sequences.append(seq)
    for seq in stale_sequences:
        device_state.packet_buffer.pop(seq, None)


def _pop_ready_packets(device_state: DeviceState, now_ts: float) -> List[BufferedPacket]:
    """
    Pops packets in sequence order when possible.
    If a gap exists for too long, force-process the smallest available sequence.
    """
    ready: List[BufferedPacket] = []

    while True:
        expected = device_state.last_processed_sequence + 1
        if expected in device_state.packet_buffer:
            pkt = device_state.packet_buffer.pop(expected)
            ready.append(pkt)
            device_state.last_processed_sequence = expected
            continue

        if not device_state.packet_buffer:
            break

        min_seq = min(device_state.packet_buffer)
        oldest_pkt = device_state.packet_buffer[min_seq]
        gap_waited = now_ts - oldest_pkt.received_server_ts

        if gap_waited >= OUT_OF_ORDER_WAIT:
            pkt = device_state.packet_buffer.pop(min_seq)
            ready.append(pkt)
            device_state.last_processed_sequence = min_seq
            continue

        break

    return ready


async def process_payload(payload: IngestPayload, normalized_ts: float):
    """
    Process the payload through the fusion engine and update the global state.
    """
    try:
        start_time = time.time()

        # Core data processing pipeline; quantum refinement is target-only.
        apply_quantum = selected_target_id is not None and payload.device_id == selected_target_id
        x, y, z, conf = fusion_engine.process(payload, normalized_ts, apply_quantum=apply_quantum)

        # Update state
        device_state = _get_or_create_device_state(payload.device_id)
        device_state.latest_position = PositionResponse(
            device_id=payload.device_id,
            x=round(x, 3),
            y=round(y, 3),
            z=round(z, 3),
            confidence=round(conf, 3)
        )

        latency = (time.time() - start_time) * 1000.0
        logger.info(f"Processed seq {payload.sequence} for {payload.device_id} in {latency:.2f}ms")
    except Exception as e:
        logger.error(f"Error processing payload for {payload.device_id}: {str(e)}")


@app.post("/ingest", response_model=IngestAck, status_code=202)
async def ingest_data(payload: IngestPayload, background_tasks: BackgroundTasks) -> IngestAck:
    """
    Accepts device sensor packets and schedules background processing.
    """
    device_id = payload.device_id
    now_ts = get_server_timestamp()
    normalized_ts = clock_sync.normalize(device_id, payload.timestamp, now_ts)
    state = _get_or_create_device_state(device_id)

    async with state.lock:
        if payload.sequence is None or payload.sequence <= 0:
            payload.sequence = state.last_processed_sequence + 1 if state.last_processed_sequence >= 0 else 1

        if state.last_processed_sequence == -1 and not state.packet_buffer:
            state.last_processed_sequence = payload.sequence - 1

        if payload.sequence <= state.last_processed_sequence:
            return IngestAck(
                status="dropped",
                normalized_timestamp=normalized_ts,
                dropped=True,
                reason="stale-sequence",
            )

        if len(state.packet_buffer) >= MAX_BUFFER_PACKETS:
            _prune_stale_packets(state, now_ts)
            if len(state.packet_buffer) >= MAX_BUFFER_PACKETS:
                # Prevent unbounded memory usage under packet loss bursts.
                oldest_seq = min(state.packet_buffer)
                state.packet_buffer.pop(oldest_seq, None)

        state.packet_buffer[payload.sequence] = BufferedPacket(
            payload=payload,
            normalized_ts=normalized_ts,
            received_server_ts=now_ts,
        )

        _prune_stale_packets(state, now_ts)
        ready = _pop_ready_packets(state, now_ts)

    for packet in ready:
        background_tasks.add_task(process_payload, packet.payload, packet.normalized_ts)

    return IngestAck(status="accepted", normalized_timestamp=normalized_ts)

def _estimate_target_from_detectors(target_id: str, detectors: List[PositionResponse]) -> tuple[float, float, float] | None:
    links = fusion_engine.get_relative_links()
    observations = [
        l for l in links
        if l["target_device_id"] == target_id and any(d.device_id == l["source_device_id"] for d in detectors)
    ]

    if not observations:
        return None

    det_by_id = {d.device_id: d for d in detectors}
    wx = 0.0
    wy = 0.0
    wsum = 0.0
    for obs in observations:
        det = det_by_id.get(obs["source_device_id"])
        if det is None:
            continue
        d = max(0.5, float(obs["estimated_distance_m"]))
        # Closer detector observations get stronger weight.
        w = 1.0 / d
        wx += det.x * w
        wy += det.y * w
        wsum += w

    if wsum <= 0:
        return None
    conf = min(0.75, 0.25 + 0.08 * len(observations))
    return wx / wsum, wy / wsum, conf


@app.get("/positions", response_model=TargetTrackingResponse)
async def get_positions():
    """
    Returns selected target and detector positions for target tracking mode.
    """
    global selected_target_id

    latest_positions: List[PositionResponse] = []
    for state in device_states.values():
        if state.latest_position is not None:
            latest_positions.append(state.latest_position)

    if not latest_positions:
        return TargetTrackingResponse(target=None, detectors=[], target_lost=True)

    if selected_target_id is None:
        # Default target selection: highest-confidence device currently available.
        selected_target_id = max(latest_positions, key=lambda p: p.confidence).device_id

    target_pos = next((p for p in latest_positions if p.device_id == selected_target_id), None)
    detector_positions = [p for p in latest_positions if p.device_id != selected_target_id]

    # If target is missing or too weak, estimate from detector observations.
    if target_pos is None or target_pos.confidence < 0.20:
        estimate = _estimate_target_from_detectors(selected_target_id, detector_positions)
        if estimate is not None:
            ex, ey, ec = estimate
            target_pos = PositionResponse(
                device_id=selected_target_id,
                x=round(ex, 3),
                y=round(ey, 3),
                z=0.0,
                confidence=round(ec, 3),
            )

    target_info = None
    nearest_detector_id = None
    target_lost = True
    if target_pos is not None:
        target_info = TargetInfo(
            device_id=target_pos.device_id,
            x=target_pos.x,
            y=target_pos.y,
            confidence=target_pos.confidence,
        )
        target_lost = target_pos.confidence < 0.25

        if detector_positions:
            nearest = min(
                detector_positions,
                key=lambda d: math.hypot(d.x - target_pos.x, d.y - target_pos.y),
            )
            nearest_detector_id = nearest.device_id

    detectors = [
        DetectorInfo(device_id=p.device_id, x=p.x, y=p.y)
        for p in detector_positions
    ]

    return TargetTrackingResponse(
        target=target_info,
        detectors=detectors,
        nearest_detector_id=nearest_detector_id,
        target_lost=target_lost,
    )


@app.post("/target", response_model=TargetTrackingResponse)
async def set_target(request: TargetSelectionRequest):
    """Sets the device to be tracked as target."""
    global selected_target_id
    selected_target_id = request.target_id
    return await get_positions()


@app.get("/target")
async def get_target():
    return {"target_id": selected_target_id}


@app.get("/devices")
async def get_devices():
    return {
        "devices": [
            state.latest_position.device_id
            for state in device_states.values()
            if state.latest_position is not None
        ]
    }


@app.get("/relative", response_model=List[RelativeLinkResponse])
async def get_relative_positions():
    """
    Returns the latest peer-to-peer relative ranging links between devices.
    """
    return fusion_engine.get_relative_links()


@app.get("/routers", response_model=List[RouterPositionResponse])
async def get_routers():
    """Returns known WiFi router positions used by trilateration/centroid logic."""
    routers = []
    for bssid, (x, y, z) in WIFI_ROUTER_DB.get_all().items():
        routers.append(RouterPositionResponse(bssid=bssid, x=x, y=y, z=z))
    return routers

@app.on_event("startup")
async def startup_event():
    logger.info("Starting Real-time Tracking System...")
    logger.info("Hybrid Classical-Quantum Pipeline initialized.")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

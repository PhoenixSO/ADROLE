from typing import List, Optional

from pydantic import BaseModel, Field

class WiFiAP(BaseModel):
    bssid: Optional[str] = None
    ssid: Optional[str] = None
    rssi: float

    @property
    def source_id(self) -> str:
        return self.bssid or self.ssid or "unknown-ap"

class BLEBeacon(BaseModel):
    id: str
    rssi: float

class IMUData(BaseModel):
    steps: int
    direction: float  # In degrees or radians

class GPSData(BaseModel):
    lat: float
    lon: float
    accuracy: float


class PeerObservation(BaseModel):
    id: str
    rssi: float

class IngestPayload(BaseModel):
    device_id: str
    timestamp: float
    sequence: Optional[int] = None
    floor_hint: Optional[int] = None
    wifi: List[WiFiAP] = Field(default_factory=list)
    ble: List[BLEBeacon] = Field(default_factory=list)
    peers: List[PeerObservation] = Field(default_factory=list)
    imu: Optional[IMUData] = None
    gps: Optional[GPSData] = None


class IngestAck(BaseModel):
    status: str
    normalized_timestamp: float
    dropped: bool = False
    reason: Optional[str] = None

class PositionResponse(BaseModel):
    device_id: str
    x: float
    y: float
    z: float
    confidence: float


class RelativeLinkResponse(BaseModel):
    source_device_id: str
    target_device_id: str
    estimated_distance_m: float
    rssi: float


class RouterPositionResponse(BaseModel):
    bssid: str
    x: float
    y: float
    z: float


class TargetSelectionRequest(BaseModel):
    target_id: str


class TargetInfo(BaseModel):
    device_id: str
    x: float
    y: float
    confidence: float
    role: str = "target"


class DetectorInfo(BaseModel):
    device_id: str
    x: float
    y: float
    role: str = "detector"


class TargetTrackingResponse(BaseModel):
    target: Optional[TargetInfo] = None
    detectors: List[DetectorInfo] = Field(default_factory=list)
    nearest_detector_id: Optional[str] = None
    target_lost: bool = False

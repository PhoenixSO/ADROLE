const defaultApi = localStorage.getItem("trackerApiBase") || "http://localhost:8000";

const els = {
  apiBase: document.getElementById("apiBase"),
  saveApi: document.getElementById("saveApi"),
  startDemo: document.getElementById("startDemo"),
  stopDemo: document.getElementById("stopDemo"),
  startMesh: document.getElementById("startMesh"),
  stopMesh: document.getElementById("stopMesh"),
  scenarioSelect: document.getElementById("scenarioSelect"),
  applyScenario: document.getElementById("applyScenario"),
  targetSelect: document.getElementById("targetSelect"),
  applyTarget: document.getElementById("applyTarget"),
  toggleAutoRotate: document.getElementById("toggleAutoRotate"),
  resetCamera: document.getElementById("resetCamera"),
  focusTarget: document.getElementById("focusTarget"),
  statusText: document.getElementById("statusText"),
  kpiDevices: document.getElementById("kpiDevices"),
  kpiConfidence: document.getElementById("kpiConfidence"),
  kpiHighConfidence: document.getElementById("kpiHighConfidence"),
  kpiLatency: document.getElementById("kpiLatency"),
  table: document.getElementById("positionsTable"),
  relativeTable: document.getElementById("relativeTable"),
  cards: document.getElementById("deviceCards"),
  webglCanvas: document.getElementById("webglCanvas"),
  meshCanvas: document.getElementById("meshCanvas"),
  deviceStatus: document.getElementById("deviceStatus"),
  canvas: document.getElementById("mapCanvas"),
};

const ctx = els.canvas.getContext("2d");
const meshCtx = els.meshCanvas ? els.meshCanvas.getContext("2d") : null;
let apiBase = defaultApi;
let refreshTimer = null;
let lastData = [];
let lastTrackingData = { target: null, detectors: [], nearest_detector_id: null, target_lost: false };
let lastRelativeLinks = [];
let lastRouters = [];
let demoTimer = null;
let meshModeTimer = null;
let meshModeActive = false;
let meshTick = 0;
const seqByDevice = {};
const demoMotionByDevice = {};
let demoSequenceBase = Math.floor(Date.now() / 1000) * 1000;

// Three.js variables
let scene, camera, renderer, deviceMeshes = {}, routerMeshes = {}, animationId = null;
let cameraAngle = 0;
let orbitControls = null;
let shiftDragActive = false;
let floorBandGroup = null;
let detectorLineGroup = null;
let layoutGroup = null;
let deviceLabelSprites = {};
let hoveredDeviceId = null;
const deviceTargetPositions = {};
const deviceTargetScales = {};
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(2, 2);
const defaultCameraPosition = new THREE.Vector3(42, 34, 42);
const defaultCameraTarget = new THREE.Vector3(0, 4, 0);
const cameraTransitionState = {
  active: false,
  target: new THREE.Vector3(),
  position: new THREE.Vector3(),
};

const layoutBounds = {
  minX: -70,
  maxX: 70,
  minZ: -70,
  maxZ: 70,
};

const obstacleFootprints = [];

const FLOOR_HEIGHT_M = 3.0;

const wifiAnchors = [
  { id: "AP_1", x: 0, y: 0, z: 0 },
  { id: "AP_2", x: 10, y: 0, z: 0 },
  { id: "AP_3", x: 0, y: 10, z: 0 },
  { id: "AP_4", x: 10, y: 10, z: 0 },
  { id: "AP_5", x: 0, y: 0, z: FLOOR_HEIGHT_M },
  { id: "AP_6", x: 10, y: 0, z: FLOOR_HEIGHT_M },
  { id: "AP_7", x: 0, y: 10, z: FLOOR_HEIGHT_M },
  { id: "AP_8", x: 10, y: 10, z: FLOOR_HEIGHT_M },
  { id: "AP_9", x: 25, y: 25, z: 0 },
];

const bleAnchors = [
  { id: "BLE_1", x: 5, y: 5, z: 0 },
  { id: "BLE_2", x: 3, y: 7, z: 0 },
  { id: "BLE_3", x: 7, y: 3, z: 0 },
  { id: "BLE_4", x: 5, y: 5, z: FLOOR_HEIGHT_M },
  { id: "BLE_5", x: 3, y: 7, z: FLOOR_HEIGHT_M },
  { id: "BLE_6", x: 7, y: 3, z: FLOOR_HEIGHT_M },
];

const demoDevices = [
  { device_id: "OFFICE_1", cluster: "office", floor: 0, lat: 28.6139, lon: 77.2090, path: "officeLoop", origin: { x: -2, y: -1 }, speed: 0.85, pauseChance: 0.25, seed: 11 },
  { device_id: "OFFICE_2", cluster: "office", floor: 0, lat: 28.6141, lon: 77.2093, path: "corridorLoop", origin: { x: 1, y: 0 }, speed: 0.92, pauseChance: 0.18, seed: 17 },
  { device_id: "WH_A", cluster: "warehouse", floor: 1, lat: 28.6137, lon: 77.2087, path: "warehouseLoop", origin: { x: 0, y: 2 }, speed: 0.58, pauseChance: 0.28, seed: 23 },
  { device_id: "WH_B", cluster: "warehouse", floor: 1, lat: 28.6140, lon: 77.2091, path: "warehouseLoop", origin: { x: 2, y: -1 }, speed: 0.62, pauseChance: 0.22, seed: 29 },
  { device_id: "OUTDOOR_1", cluster: "outdoor", floor: -1, lat: 28.6135, lon: 77.2085, path: "outdoorLoop", origin: { x: 15, y: 12 }, speed: 1.35, pauseChance: 0.06, seed: 31 },
  { device_id: "OUTDOOR_2", cluster: "outdoor", floor: -1, lat: 28.6143, lon: 77.2095, path: "outdoorLoop", origin: { x: 18, y: 9 }, speed: 1.28, pauseChance: 0.08, seed: 37 },
];

const baseDeviceProfile = Object.fromEntries(
  demoDevices.map((d) => [
    d.device_id,
    {
      speed: d.speed,
      pauseChance: d.pauseChance,
      origin: { ...d.origin },
      path: d.path,
    },
  ])
);

const scenarioProfiles = {
  balanced: {
    label: "Balanced",
    speedMultiplier: { office: 1.0, warehouse: 1.0, outdoor: 1.0 },
    pauseMultiplier: { office: 1.0, warehouse: 1.0, outdoor: 1.0 },
    rssiNoiseScale: 1.0,
    obstructionScale: 1.0,
    indoorGpsBias: 1.0,
  },
  "office-heavy": {
    label: "Office-heavy",
    speedMultiplier: { office: 1.25, warehouse: 0.82, outdoor: 0.78 },
    pauseMultiplier: { office: 0.85, warehouse: 1.15, outdoor: 1.25 },
    rssiNoiseScale: 0.95,
    obstructionScale: 1.1,
    indoorGpsBias: 1.18,
  },
  "warehouse-heavy": {
    label: "Warehouse-heavy",
    speedMultiplier: { office: 0.82, warehouse: 1.22, outdoor: 0.86 },
    pauseMultiplier: { office: 1.12, warehouse: 0.86, outdoor: 1.18 },
    rssiNoiseScale: 1.12,
    obstructionScale: 1.25,
    indoorGpsBias: 1.28,
  },
  "outdoor-heavy": {
    label: "Outdoor-heavy",
    speedMultiplier: { office: 0.75, warehouse: 0.82, outdoor: 1.35 },
    pauseMultiplier: { office: 1.25, warehouse: 1.18, outdoor: 0.75 },
    rssiNoiseScale: 1.05,
    obstructionScale: 0.85,
    indoorGpsBias: 0.9,
  },
};

let activeScenarioKey = "balanced";

// Path definitions in meters, then offset by each device origin.
const pathDefinitions = {
  corridorLoop: [
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 3 },
    { x: 8, y: 8 }, { x: 4, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 3 }
  ],
  officeLoop: [
    { x: 0, y: 0 }, { x: 2.5, y: 0.5 }, { x: 3.0, y: 2.5 }, { x: 1.5, y: 4.0 },
    { x: -0.5, y: 3.0 }, { x: -1.0, y: 1.2 }
  ],
  warehouseLoop: [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 7 },
    { x: 14, y: 15 }, { x: 7, y: 15 }, { x: 0, y: 15 }, { x: 0, y: 7 }
  ],
  outdoorLoop: [
    { x: 0, y: 0 }, { x: 10, y: -4 }, { x: 18, y: 0 }, { x: 22, y: 8 },
    { x: 18, y: 18 }, { x: 8, y: 22 }, { x: -2, y: 16 }, { x: -4, y: 6 }
  ]
};

// Circular obstruction volumes represented as db losses when line-of-sight passes near them.
const obstructions = [
  { x: 4.5, y: 4.0, floor: 0, radius: 2.4, lossDb: 7.5 },
  { x: 8.5, y: 6.5, floor: 0, radius: 3.0, lossDb: 5.5 },
  { x: 7.0, y: 11.0, floor: 1, radius: 3.8, lossDb: 8.0 },
  { x: 11.5, y: 4.0, floor: 1, radius: 2.8, lossDb: 6.0 },
];

const motionStateByDevice = {};

els.apiBase.value = apiBase;
els.saveApi.addEventListener("click", () => {
  apiBase = els.apiBase.value.trim().replace(/\/$/, "") || "http://localhost:8000";
  localStorage.setItem("trackerApiBase", apiBase);
  syncPositions();
});

els.startDemo.addEventListener("click", startDemoStream);
els.stopDemo.addEventListener("click", stopDemoStream);
els.startMesh.addEventListener("click", startMeshMode);
els.stopMesh.addEventListener("click", stopMeshMode);
els.applyScenario.addEventListener("click", () => applyScenario(els.scenarioSelect.value));
els.scenarioSelect.addEventListener("change", () => applyScenario(els.scenarioSelect.value));
els.applyTarget.addEventListener("click", applyTargetSelection);
els.toggleAutoRotate?.addEventListener("click", () => {
  if (!orbitControls) {
    initWebGL();
  }
  if (!orbitControls) {
    return;
  }
  orbitControls.autoRotate = !orbitControls.autoRotate;
  els.toggleAutoRotate.textContent = orbitControls.autoRotate ? "Auto Rotate: On" : "Auto Rotate: Off";
});
els.resetCamera?.addEventListener("click", () => resetCameraView());
els.focusTarget?.addEventListener("click", () => focusCameraOnTarget());
els.cards?.addEventListener("click", (event) => {
  const card = event.target.closest(".device-card[data-device-id]");
  if (!card) {
    return;
  }
  focusCameraOnDevice(card.dataset.deviceId);
});

function setStatus(text, isError = false) {
  els.statusText.textContent = text;
  els.statusText.style.color = isError ? "#fecdd3" : "#c5d4ec";
}

function animateNumberText(el, targetValue, formatter) {
  if (!el) {
    return;
  }
  const start = Number(el.dataset.value || 0);
  const end = Number(targetValue || 0);
  const started = performance.now();
  const duration = 320;

  const step = (now) => {
    const t = Math.min((now - started) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = start + (end - start) * eased;
    el.dataset.value = String(current);
    el.textContent = formatter(current);
    if (t < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

function beginCameraTransition(target, position) {
  cameraTransitionState.active = true;
  cameraTransitionState.target.copy(target);
  cameraTransitionState.position.copy(position);
}

function resetCameraView() {
  if (!camera || !orbitControls) {
    return;
  }
  beginCameraTransition(defaultCameraTarget.clone(), defaultCameraPosition.clone());
}

function focusCameraOnDevice(deviceId) {
  if (!camera || !orbitControls || !deviceId) {
    return;
  }
  const point = lastData.find((p) => p.device_id === deviceId);
  if (!point) {
    setStatus(`Unable to focus: ${deviceId} not in latest frame.`, true);
    return;
  }
  const target = new THREE.Vector3(Number(point.x) * 2, 3.5, Number(point.y) * 2);
  const position = new THREE.Vector3(target.x + 18, target.y + 15, target.z + 18);
  beginCameraTransition(target, position);
  setStatus(`Focused on ${deviceId}.`);
}

function focusCameraOnTarget() {
  if (!camera || !orbitControls) {
    return;
  }

  let target = lastTrackingData?.target || null;
  if (!target && Array.isArray(lastTrackingData?.detectors) && lastTrackingData.detectors.length > 0) {
    target = buildTargetFromDetectors(lastTrackingData.detectors);
  }
  if (!target) {
    setStatus("No target available to focus.", true);
    return;
  }

  const world = new THREE.Vector3(Number(target.x) * 2, 3.0, Number(target.y) * 2);
  beginCameraTransition(world, new THREE.Vector3(world.x + 20, world.y + 16, world.z + 20));
}

function flattenTrackingPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((p) => ({
      device_id: p.device_id,
      x: Number(p.x),
      y: Number(p.y),
      z: Number(p.z || 0),
      confidence: Number(p.confidence),
      role: "detector",
    }));
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const points = [];
  if (payload.target) {
    points.push({
      device_id: payload.target.device_id,
      x: Number(payload.target.x),
      y: Number(payload.target.y),
      z: 0,
      confidence: Number(payload.target.confidence),
      role: "target",
    });
  }
  (payload.detectors || []).forEach((d) => {
    points.push({
      device_id: d.device_id,
      x: Number(d.x),
      y: Number(d.y),
      z: 0,
      confidence: 0.65,
      role: "detector",
    });
  });
  return points;
}

function normalizeTrackingPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      target: null,
      detectors: payload.map((p) => ({
        device_id: p.device_id,
        x: Number(p.x),
        y: Number(p.y),
        role: "detector",
      })),
      nearest_detector_id: null,
      target_lost: false,
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      target: null,
      detectors: [],
      nearest_detector_id: null,
      target_lost: false,
    };
  }

  return {
    target: payload.target || null,
    detectors: Array.isArray(payload.detectors) ? payload.detectors : [],
    nearest_detector_id: payload.nearest_detector_id || null,
    target_lost: Boolean(payload.target_lost),
  };
}

function buildTargetFromDetectors(detectors) {
  if (!Array.isArray(detectors) || detectors.length === 0) {
    return null;
  }
  const total = detectors.length;
  const sum = detectors.reduce(
    (acc, d) => {
      acc.x += Number(d.x) || 0;
      acc.y += Number(d.y) || 0;
      return acc;
    },
    { x: 0, y: 0 }
  );
  return {
    device_id: "AUTO_TARGET",
    x: Number((sum.x / total).toFixed(3)),
    y: Number((sum.y / total).toFixed(3)),
    confidence: clampValue(0.35 + total * 0.04, 0.35, 0.85),
    role: "target",
  };
}

async function refreshDeviceSelector() {
  try {
    const [devicesResponse, targetResponse] = await Promise.all([
      fetch(`${apiBase}/devices`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
      fetch(`${apiBase}/target`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
    ]);
    if (!devicesResponse.ok) {
      return;
    }
    const payload = await devicesResponse.json();
    const targetPayload = targetResponse.ok ? await targetResponse.json() : {};
    const backendTarget = targetPayload.target_id;
    const devices = Array.isArray(payload.devices) ? payload.devices : [];
    const selected = els.targetSelect.value;
    els.targetSelect.innerHTML = devices.length
      ? devices.map((id) => `<option value="${id}">${id}</option>`).join("")
      : '<option value="">No devices</option>';

    if (backendTarget && devices.includes(backendTarget)) {
      els.targetSelect.value = backendTarget;
    } else if (devices.includes(selected)) {
      els.targetSelect.value = selected;
    }
  } catch {
    // Best effort UI update; do nothing on transient errors.
  }
}

async function applyTargetSelection() {
  const targetId = els.targetSelect.value;
  if (!targetId) {
    setStatus("No target selected.", true);
    return;
  }
  try {
    const response = await fetch(`${apiBase}/target`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: targetId }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    setStatus(`Tracking target ${targetId}.`);
    await syncPositions();
  } catch (error) {
    setStatus(`Unable to set target: ${error.message}`, true);
  }
}

async function ensureDemoTargetSelection() {
  const defaultTarget = demoDevices[0]?.device_id;
  if (!defaultTarget) {
    return;
  }
  try {
    await fetch(`${apiBase}/target`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: defaultTarget }),
    });
  } catch {
    // Non-blocking: demo stream should continue even if target selection fails.
  }
}

function confidencePercent(conf) {
  return Math.round(Math.max(0, Math.min(1, conf)) * 100);
}

function modeFromPoint(point) {
  return point.confidence >= 0.7 ? "Outdoor" : "Indoor";
}

function renderKpis(points, latencyMs) {
  const count = points.length;
  const avg = count === 0
    ? 0
    : points.reduce((sum, p) => sum + p.confidence, 0) / count;
  const high = points.filter((p) => p.confidence >= 0.7).length;

  animateNumberText(els.kpiDevices, count, (v) => String(Math.round(v)));
  animateNumberText(els.kpiConfidence, confidencePercent(avg), (v) => `${Math.round(v)}%`);
  animateNumberText(els.kpiHighConfidence, high, (v) => String(Math.round(v)));
  animateNumberText(els.kpiLatency, Math.round(latencyMs), (v) => `${Math.round(v)} ms`);
}

function renderCards(points) {
  if (points.length === 0) {
    els.cards.innerHTML = '<div class="device-card"><span class="card-status"></span><div class="meta"><strong>No devices yet</strong><small>Send /ingest payloads to see updates.</small></div><div class="conf-ring" style="--fill:0%"><span>0%</span></div></div>';
    return;
  }

  els.cards.innerHTML = points
    .map((p, i) => {
      const conf = confidencePercent(p.confidence);
      const onlineClass = conf >= 40 ? "online" : "offline";
      return `
      <article class="device-card ${onlineClass}" data-device-id="${p.device_id}" style="animation-delay:${Math.min(i * 40, 200)}ms">
        <span class="card-status"></span>
        <div class="meta">
          <strong>${p.device_id}</strong>
          <small>x: ${p.x.toFixed(2)} | y: ${p.y.toFixed(2)} | z: ${p.z.toFixed(2)}</small>
        </div>
        <div class="conf-ring" style="--fill:${conf}%"><span>${conf}%</span></div>
      </article>`;
    })
    .join("");
}

function createFloorLabelSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const c = canvas.getContext("2d");
  c.fillStyle = "rgba(10, 31, 40, 0.75)";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  c.fillStyle = "#f4fbff";
  c.font = "bold 24px Space Grotesk";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(20, 5, 1);
  return sprite;
}

function registerFootprint(x, z, w, d, padding = 1.2) {
  obstacleFootprints.push({
    minX: x - w / 2 - padding,
    maxX: x + w / 2 + padding,
    minZ: z - d / 2 - padding,
    maxZ: z + d / 2 + padding,
  });
}

function createAbstractObject({
  size = [3, 2, 3],
  position = [0, 1, 0],
  color = 0xadb9d8,
  emissive = 0x0f1828,
  opacity = 1,
  roughness = 0.55,
}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.18,
      roughness,
      metalness: 0.22,
      transparent: opacity < 1,
      opacity,
    })
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRoundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createDeviceLabel(deviceId, confidence, role = "detector") {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 124;
  const c = canvas.getContext("2d");

  const borderColor = role === "target" ? "#ff675f" : "#6db4ff";
  const chipColor = role === "target" ? "rgba(255,103,95,0.18)" : "rgba(109,180,255,0.18)";

  c.shadowColor = "rgba(0, 0, 0, 0.35)";
  c.shadowBlur = 12;
  createRoundedRectPath(c, 8, 10, 344, 102, 18);
  c.fillStyle = "rgba(15, 24, 42, 0.88)";
  c.fill();
  c.shadowBlur = 0;

  c.lineWidth = 3;
  c.strokeStyle = borderColor;
  createRoundedRectPath(c, 8, 10, 344, 102, 18);
  c.stroke();

  c.fillStyle = chipColor;
  createRoundedRectPath(c, 18, 20, 70, 26, 9);
  c.fill();

  c.font = "600 14px Poppins, Roboto, Space Grotesk, sans-serif";
  c.fillStyle = borderColor;
  c.textAlign = "center";
  c.fillText(role.toUpperCase(), 53, 38);

  c.font = "700 30px Orbitron, Poppins, Roboto, Space Grotesk, sans-serif";
  c.fillStyle = "#eff6ff";
  c.textAlign = "left";
  c.fillText(deviceId, 102, 48);

  c.font = "600 20px Poppins, Roboto, Space Grotesk, sans-serif";
  c.fillStyle = "#9ec2ff";
  c.fillText(`conf ${confidencePercent(confidence)}%`, 22, 88);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(10.5, 3.6, 1);
  sprite.renderOrder = 8;
  sprite.userData = { labelKey: `${deviceId}|${confidencePercent(confidence)}|${role}` };
  return sprite;
}

function createAbstractLayout() {
  const group = new THREE.Group();
  obstacleFootprints.length = 0;

  // Open indoor floor plane with subtle modern tone.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.9, metalness: 0.08 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  group.add(floor);

  // Neon-like low boundary lines (open room, no ceiling).
  const boundaryPoints = [
    new THREE.Vector3(layoutBounds.minX, 0.02, layoutBounds.minZ),
    new THREE.Vector3(layoutBounds.maxX, 0.02, layoutBounds.minZ),
    new THREE.Vector3(layoutBounds.maxX, 0.02, layoutBounds.maxZ),
    new THREE.Vector3(layoutBounds.minX, 0.02, layoutBounds.maxZ),
    new THREE.Vector3(layoutBounds.minX, 0.02, layoutBounds.minZ),
  ];
  const boundaryGeom = new THREE.BufferGeometry().setFromPoints(boundaryPoints);
  const boundary = new THREE.Line(
    boundaryGeom,
    new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.92 })
  );
  group.add(boundary);

  // Abstract partitions and blocks.
  const panelA = createAbstractObject({ size: [0.55, 5.2, 13], position: [-18, 2.6, -8], color: 0x2b3852, emissive: 0x0f1d33, opacity: 0.92 });
  const panelB = createAbstractObject({ size: [12, 4.5, 0.55], position: [7, 2.25, 18], color: 0x2d3554, emissive: 0x111f35, opacity: 0.92 });
  const panelC = createAbstractObject({ size: [0.5, 3.8, 8], position: [11, 1.9, 2.2], color: 0x334061, emissive: 0x122645, opacity: 0.9 });
  group.add(panelA);
  group.add(panelB);
  group.add(panelC);

  const abstractBlocks = [
    { size: [8.5, 1.2, 4.8], position: [-18, 0.6, -13], color: 0x344976, emissive: 0x102846 },
    { size: [6.2, 0.8, 3.8], position: [-2.2, 0.4, 2.0], color: 0x2f4470, emissive: 0x142a48 },
    { size: [2.2, 3.4, 2.2], position: [16, 1.7, -10.5], color: 0x4d3a7d, emissive: 0x2b1b56 },
    { size: [3.4, 2.2, 1.6], position: [6.5, 1.1, -3.2], color: 0x295d82, emissive: 0x124063 },
    { size: [2.0, 2.6, 5.2], position: [-7.8, 1.3, 11.2], color: 0x513985, emissive: 0x2b1f5c },
  ];
  abstractBlocks.forEach((cfg) => {
    const block = createAbstractObject(cfg);
    group.add(block);
    registerFootprint(cfg.position[0], cfg.position[2], cfg.size[0], cfg.size[2]);
  });

  const accentLineGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-24, 0.06, 10),
    new THREE.Vector3(-8, 0.06, 10),
    new THREE.Vector3(-8, 0.06, 16),
    new THREE.Vector3(3, 0.06, 16),
  ]);
  const accentLine = new THREE.Line(
    accentLineGeom,
    new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.82 })
  );
  group.add(accentLine);

  // Low-height boundary bars as open structure cues.
  [
    { size: [60, 0.25, 0.35], pos: [0, 0.14, layoutBounds.minZ + 0.15] },
    { size: [60, 0.25, 0.35], pos: [0, 0.14, layoutBounds.maxZ - 0.15] },
    { size: [0.35, 0.25, 44], pos: [layoutBounds.minX + 0.15, 0.14, 0] },
    { size: [0.35, 0.25, 44], pos: [layoutBounds.maxX - 0.15, 0.14, 0] },
  ].forEach((bar) => {
    group.add(
      createAbstractObject({
        size: bar.size,
        position: bar.pos,
        color: 0x2a3a61,
        emissive: 0x18305f,
        opacity: 0.78,
        roughness: 0.45,
      })
    );
  });

  return group;
}

function clampToLayoutWithObstacles(worldX, worldZ) {
  let x = Math.max(layoutBounds.minX, Math.min(layoutBounds.maxX, worldX));
  let z = Math.max(layoutBounds.minZ, Math.min(layoutBounds.maxZ, worldZ));

  // Simple push-out against furniture footprints.
  obstacleFootprints.forEach((o) => {
    if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ) {
      const distances = [
        { side: "minX", d: Math.abs(x - o.minX) },
        { side: "maxX", d: Math.abs(o.maxX - x) },
        { side: "minZ", d: Math.abs(z - o.minZ) },
        { side: "maxZ", d: Math.abs(o.maxZ - z) },
      ];
      distances.sort((a, b) => a.d - b.d);
      const nearestSide = distances[0].side;
      if (nearestSide === "minX") x = o.minX - 0.2;
      if (nearestSide === "maxX") x = o.maxX + 0.2;
      if (nearestSide === "minZ") z = o.minZ - 0.2;
      if (nearestSide === "maxZ") z = o.maxZ + 0.2;
    }
  });

  return { x, z };
}

function ensureFloorBands() {
  if (!scene || floorBandGroup) {
    return;
  }

  floorBandGroup = new THREE.Group();
  const floorBands = [
    { label: "Outdoor -1", floor: -1, color: 0x0f8f5f },
    { label: "Ground 0", floor: 0, color: 0x25a0db },
    { label: "Floor 1", floor: 1, color: 0xd46836 },
  ];

  floorBands.forEach((band) => {
    const y = band.floor * FLOOR_HEIGHT_M * 2;

    const diskGeom = new THREE.CircleGeometry(28, 64);
    const diskMat = new THREE.MeshBasicMaterial({
      color: band.color,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    });
    const disk = new THREE.Mesh(diskGeom, diskMat);
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(0, y, 0);
    floorBandGroup.add(disk);

    const ringGeom = new THREE.RingGeometry(27.2, 28, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: band.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, y + 0.02, 0);
    floorBandGroup.add(ring);

    const label = createFloorLabelSprite(band.label, `#${band.color.toString(16).padStart(6, "0")}`);
    label.position.set(-24, y + 1.4, -24);
    floorBandGroup.add(label);
  });

  scene.add(floorBandGroup);
}

function initWebGL() {
  // Scene setup
  const canvas = els.webglCanvas;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);
  scene.fog = new THREE.Fog(0x020617, 180, 520);

  // Camera
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.copy(defaultCameraPosition);
  camera.lookAt(defaultCameraTarget);

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;

  orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.enableZoom = true;
  orbitControls.enableRotate = true;
  orbitControls.enablePan = true;
  orbitControls.minDistance = 18;
  orbitControls.maxDistance = 160;
  orbitControls.minPolarAngle = 0.2;
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
  orbitControls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  orbitControls.target.copy(defaultCameraTarget);
  orbitControls.autoRotate = false;
  orbitControls.autoRotateSpeed = 0.9;
  orbitControls.update();

  // Lighting
  const ambLight = new THREE.AmbientLight(0x97b4ff, 0.48);
  scene.add(ambLight);

  const dirLight = new THREE.DirectionalLight(0xc7dbff, 0.9);
  dirLight.position.set(100, 100, 100);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.bias = -0.0002;
  scene.add(dirLight);

  const pointLight = new THREE.PointLight(0x22d3ee, 0.65, 260);
  pointLight.position.set(-50, 50, 50);
  scene.add(pointLight);

  const accentLight = new THREE.PointLight(0xa78bfa, 0.48, 200);
  accentLight.position.set(40, 26, -16);
  scene.add(accentLight);

  // Ground grid
  const gridHelper = new THREE.GridHelper(120, 12, 0x0ea5e9, 0x1e293b);
  gridHelper.position.y = -20;
  scene.add(gridHelper);

  // Axes helper
  const axesHelper = new THREE.AxesHelper(30);
  scene.add(axesHelper);

  // Add abstract indoor layout
  layoutGroup = createAbstractLayout();
  scene.add(layoutGroup);

  ensureFloorBands();

  // Start animation loop
  animate();

  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  });

  canvas.addEventListener("mouseleave", () => {
    pointerNdc.x = 2;
    pointerNdc.y = 2;
    hoveredDeviceId = null;
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  window.addEventListener("keydown", (event) => {
    if (!orbitControls) {
      return;
    }
    if (event.key === "Shift" && !shiftDragActive) {
      shiftDragActive = true;
      orbitControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    }
  });

  window.addEventListener("keyup", (event) => {
    if (!orbitControls) {
      return;
    }
    if (event.key === "Shift") {
      shiftDragActive = false;
      orbitControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    }
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

function updateWebGL(points, trackingData = null) {
  if (!scene) {
    initWebGL();
  }

  ensureFloorBands();

  // Remove meshes that no longer exist and clear stale targets
  Object.keys(deviceMeshes).forEach((id) => {
    if (!points.find((p) => p.device_id === id)) {
      scene.remove(deviceMeshes[id]);
      delete deviceMeshes[id];
      delete deviceTargetPositions[id];
      delete deviceTargetScales[id];
      if (deviceLabelSprites[id]) {
        scene.remove(deviceLabelSprites[id]);
        if (deviceLabelSprites[id].material?.map) {
          deviceLabelSprites[id].material.map.dispose();
        }
        deviceLabelSprites[id].material.dispose();
        delete deviceLabelSprites[id];
      }
    }
  });

  // Create/update meshes
  points.forEach((p) => {
    if (!deviceMeshes[p.device_id]) {
      const isTarget = p.role === "target";
      const geometry = new THREE.SphereGeometry(isTarget ? 1.4 : 0.9, 22, 22);
      const material = new THREE.MeshStandardMaterial({
        color: isTarget ? 0xff655b : 0x4f8cff,
        emissive: isTarget ? 0x4b1212 : 0x142b5f,
        emissiveIntensity: isTarget ? 0.5 : 0.35,
        metalness: 0.28,
        roughness: 0.38,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { deviceId: p.device_id, role: p.role || "detector" };
      scene.add(mesh);
      deviceMeshes[p.device_id] = mesh;

      const confidence = Number(p.confidence) || 0;
      const label = createDeviceLabel(p.device_id, confidence, p.role || "detector");
      scene.add(label);
      deviceLabelSprites[p.device_id] = label;

      const clamped = clampToLayoutWithObstacles(Number(p.x) * 2, Number(p.y) * 2);
      const initialY = Number(p.z || 0) * 2 + (p.role === "target" ? 1.2 : 0.8);
      mesh.position.set(clamped.x, initialY, clamped.z);
      label.position.set(clamped.x, initialY + 2.8, clamped.z);

      deviceTargetPositions[p.device_id] = new THREE.Vector3(clamped.x, initialY, clamped.z);
      deviceTargetScales[p.device_id] = isTarget ? 1.15 : 1.0;
    }

    const mesh = deviceMeshes[p.device_id];
    const clamped = clampToLayoutWithObstacles(Number(p.x) * 2, Number(p.y) * 2);
    const targetY = Number(p.z || 0) * 2 + (p.role === "target" ? 1.2 : 0.8);
    deviceTargetPositions[p.device_id] = new THREE.Vector3(clamped.x, targetY, clamped.z);
    deviceTargetScales[p.device_id] = p.role === "target" ? 1.15 : 1.0;

    mesh.userData.role = p.role || "detector";
    const targetColor = p.role === "target" ? 0xff655b : 0x4f8cff;
    const targetEmissive = p.role === "target" ? 0x4b1212 : 0x142b5f;
    mesh.material.color.lerp(new THREE.Color(targetColor), 0.22);
    mesh.material.emissive.lerp(new THREE.Color(targetEmissive), 0.22);

    const existingLabel = deviceLabelSprites[p.device_id];
    const labelKey = `${p.device_id}|${confidencePercent(Number(p.confidence) || 0)}|${p.role || "detector"}`;
    if (!existingLabel || existingLabel.userData?.labelKey !== labelKey) {
      if (existingLabel) {
        scene.remove(existingLabel);
        if (existingLabel.material?.map) {
          existingLabel.material.map.dispose();
        }
        existingLabel.material.dispose();
      }
      const newLabel = createDeviceLabel(p.device_id, Number(p.confidence) || 0, p.role || "detector");
      const targetPos = deviceTargetPositions[p.device_id] || new THREE.Vector3(clamped.x, targetY, clamped.z);
      newLabel.position.set(targetPos.x, targetPos.y + 2.8, targetPos.z);
      scene.add(newLabel);
      deviceLabelSprites[p.device_id] = newLabel;
    }
  });

  if (!detectorLineGroup) {
    detectorLineGroup = new THREE.Group();
    scene.add(detectorLineGroup);
  }
  while (detectorLineGroup.children.length > 0) {
    const child = detectorLineGroup.children.pop();
    detectorLineGroup.remove(child);
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      child.material.dispose();
    }
  }

  const target = points.find((p) => p.role === "target");
  if (target && trackingData?.detectors?.length) {
    const targetPos = deviceTargetPositions[target.device_id] || null;
    if (targetPos) {
      trackingData.detectors.forEach((d) => {
        const detectorPos = deviceTargetPositions[d.device_id];
        if (!detectorPos) {
          return;
        }
        const lineGeom = new THREE.BufferGeometry().setFromPoints([detectorPos.clone(), targetPos.clone()]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x5f9dff, transparent: true, opacity: 0.35 });
        detectorLineGroup.add(new THREE.Line(lineGeom, lineMat));
      });
    }
  }

  if (camera && scene) {
    raycaster.setFromCamera(pointerNdc, camera);
    const intersects = raycaster.intersectObjects(Object.values(deviceMeshes), false);
    hoveredDeviceId = intersects.length > 0 ? intersects[0].object.userData.deviceId : null;
  }

  // Update device status
  renderDeviceStatus(points, trackingData);
}

function updateRouterMeshes(routers) {
  if (!scene) {
    initWebGL();
  }

  Object.keys(routerMeshes).forEach((id) => {
    if (!routers.find((r) => r.bssid === id)) {
      scene.remove(routerMeshes[id]);
      delete routerMeshes[id];
    }
  });

  routers.forEach((router) => {
    if (!routerMeshes[router.bssid]) {
      const geom = new THREE.BoxGeometry(1.8, 1.8, 1.8);
      const mat = new THREE.MeshStandardMaterial({ color: 0x25a0db, emissive: 0x103b56, metalness: 0.6, roughness: 0.3 });
      const cube = new THREE.Mesh(geom, mat);
      cube.userData = { routerId: router.bssid };
      scene.add(cube);
      routerMeshes[router.bssid] = cube;
    }

    const mesh = routerMeshes[router.bssid];
    mesh.position.set(router.x * 2, router.z * 2, router.y * 2);
  });
}

function renderDeviceStatus(points, trackingData = null) {
  if (points.length === 0) {
    els.deviceStatus.innerHTML =
      '<div style="color: #999;">No devices connected.</div>';
    return;
  }

  els.deviceStatus.innerHTML = points
    .map((p) => {
      const conf = confidencePercent(p.confidence);
      const mode = p.role === "target" ? "TARGET" : "DETECTOR";
      const statusClass = p.role === "target" ? "status-offline" : "status-online";
      const nearest = trackingData?.nearest_detector_id === p.device_id ? " | nearest" : "";
      return `
      <div class="device-status-item">
        <span class="status-dot ${statusClass}"></span>
        <strong>${p.device_id}</strong>
        <span style="color: #666;">${mode}${nearest} | ${conf}% | x:${p.x.toFixed(1)} y:${p.y.toFixed(1)}</span>
      </div>`;
    })
    .join("");
}

function animate() {
  animationId = requestAnimationFrame(animate);

  if (orbitControls && cameraTransitionState.active) {
    orbitControls.target.lerp(cameraTransitionState.target, 0.1);
    camera.position.lerp(cameraTransitionState.position, 0.1);
    if (
      orbitControls.target.distanceTo(cameraTransitionState.target) < 0.08 &&
      camera.position.distanceTo(cameraTransitionState.position) < 0.12
    ) {
      cameraTransitionState.active = false;
    }
  }

  if (orbitControls) {
    orbitControls.update();
  }

  Object.entries(deviceMeshes).forEach(([id, mesh]) => {
    const targetPos = deviceTargetPositions[id];
    if (!targetPos) {
      return;
    }
    mesh.position.x += (targetPos.x - mesh.position.x) * 0.1;
    mesh.position.y += (targetPos.y - mesh.position.y) * 0.1;
    mesh.position.z += (targetPos.z - mesh.position.z) * 0.1;

    const hoverBoost = hoveredDeviceId === id ? 1.22 : 1.0;
    const baseScale = deviceTargetScales[id] || 1.0;
    const pulse = 1 + Math.sin(performance.now() * 0.003 + mesh.position.x * 0.2) * 0.035;
    const scale = baseScale * hoverBoost * pulse;
    mesh.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.16);

    const label = deviceLabelSprites[id];
    if (label) {
      const yOffset = mesh.userData.role === "target" ? 3.3 : 2.8;
      const labelPos = new THREE.Vector3(mesh.position.x, mesh.position.y + yOffset, mesh.position.z);
      label.position.lerp(labelPos, 0.22);
      label.lookAt(camera.position);
      const labelScale = hoveredDeviceId === id ? 1.18 : 1.0;
      label.scale.lerp(new THREE.Vector3(10.5 * labelScale, 3.6 * labelScale, 1), 0.2);
    }
  });

  renderer.render(scene, camera);
}

function render3DBars(points, trackingData = null) {
  updateWebGL(points, trackingData);
}

function renderTable(points) {
  if (points.length === 0) {
    els.table.innerHTML = '<tr><td colspan="6">No position records available.</td></tr>';
    return;
  }

  els.table.innerHTML = points
    .map((p) => {
      const mode = p.role === "target" ? "Target" : "Detector";
      const modeClass = p.role === "target" ? "mode-indoor" : "mode-outdoor";
      return `
      <tr>
        <td>${p.device_id}</td>
        <td>${p.x.toFixed(3)}</td>
        <td>${p.y.toFixed(3)}</td>
        <td>${p.z.toFixed(3)}</td>
        <td>${confidencePercent(p.confidence)}%</td>
        <td><span class="mode-chip ${modeClass}">${mode}</span></td>
      </tr>`;
    })
    .join("");
}

function renderRelativeTable(links, points) {
  if (!els.relativeTable) {
    return;
  }
  if (!Array.isArray(links) || links.length === 0) {
    els.relativeTable.innerHTML = '<tr><td colspan="6">No peer-to-peer links available.</td></tr>';
    return;
  }

  const byId = new Map(points.map((p) => [p.device_id, p]));

  els.relativeTable.innerHTML = links
    .map((l) => {
      const src = byId.get(l.source_device_id);
      const tgt = byId.get(l.target_device_id);
      let absoluteDistanceText = "-";
      let errorText = "-";

      if (src && tgt) {
        const absoluteDistance = Math.hypot(src.x - tgt.x, src.y - tgt.y, src.z - tgt.z);
        const error = Math.abs(absoluteDistance - l.estimated_distance_m);
        const errorClass = error <= 3.0 ? "delta-good" : "delta-warn";
        absoluteDistanceText = absoluteDistance.toFixed(2);
        errorText = `<span class="delta-chip ${errorClass}">${error.toFixed(2)}</span>`;
      }

      return `
      <tr>
        <td>${l.source_device_id}</td>
        <td>${l.target_device_id}</td>
        <td>${Number(l.estimated_distance_m).toFixed(2)}</td>
        <td>${absoluteDistanceText}</td>
        <td>${errorText}</td>
        <td>${Number(l.rssi).toFixed(1)} dBm</td>
      </tr>`;
    })
    .join("");
}

function drawMap(points) {
  const w = els.canvas.width;
  const h = els.canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(0, 127, 137, 0.12)";
  ctx.lineWidth = 1;
  for (let x = 40; x < w; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 40; y < h; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  if (points.length === 0) {
    ctx.fillStyle = "#4c6876";
    ctx.font = "600 18px Space Grotesk";
    ctx.fillText("Awaiting live position data...", 36, 48);
    return;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - 2;
  const maxX = Math.max(...xs) + 2;
  const minY = Math.min(...ys) - 2;
  const maxY = Math.max(...ys) + 2;

  const mapX = (x) => ((x - minX) / Math.max(maxX - minX, 1e-3)) * (w - 90) + 45;
  const mapY = (y) => h - (((y - minY) / Math.max(maxY - minY, 1e-3)) * (h - 90) + 45);

  points.forEach((p) => {
    const px = mapX(p.x);
    const py = mapY(p.y);
    const conf = confidencePercent(p.confidence);
    const isTarget = p.role === "target";

    ctx.beginPath();
    ctx.fillStyle = isTarget ? "rgba(225, 59, 45, 0.26)" : "rgba(43, 115, 223, 0.20)";
    ctx.arc(px, py, isTarget ? 26 : 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = isTarget ? "#e13b2d" : "#2b73df";
    ctx.arc(px, py, isTarget ? 10 : 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0c2430";
    ctx.font = "700 12px Space Grotesk";
    ctx.fillText(isTarget ? `${p.device_id} (TARGET)` : p.device_id, px + 12, py - 10);
    ctx.font = "500 11px Space Grotesk";
    ctx.fillStyle = "#375765";
    ctx.fillText(`(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) ${conf}%`, px + 12, py + 8);
  });
}

function drawMeshGraph(points, links) {
  if (!meshCtx || !els.meshCanvas) {
    return;
  }

  const w = els.meshCanvas.width;
  const h = els.meshCanvas.height;
  meshCtx.clearRect(0, 0, w, h);

  meshCtx.strokeStyle = "rgba(0, 127, 137, 0.10)";
  meshCtx.lineWidth = 1;
  for (let x = 50; x < w; x += 100) {
    meshCtx.beginPath();
    meshCtx.moveTo(x, 0);
    meshCtx.lineTo(x, h);
    meshCtx.stroke();
  }
  for (let y = 50; y < h; y += 100) {
    meshCtx.beginPath();
    meshCtx.moveTo(0, y);
    meshCtx.lineTo(w, y);
    meshCtx.stroke();
  }

  if (!points || points.length === 0) {
    meshCtx.fillStyle = "#4c6876";
    meshCtx.font = "600 18px Space Grotesk";
    meshCtx.fillText("Mesh mode idle. Start P2P Mesh to visualize links.", 26, 40);
    return;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - 3;
  const maxX = Math.max(...xs) + 3;
  const minY = Math.min(...ys) - 3;
  const maxY = Math.max(...ys) + 3;

  const mapX = (x) => ((x - minX) / Math.max(maxX - minX, 1e-3)) * (w - 100) + 50;
  const mapY = (y) => h - (((y - minY) / Math.max(maxY - minY, 1e-3)) * (h - 100) + 50);
  const byId = new Map(points.map((p) => [p.device_id, p]));

  (links || []).forEach((l) => {
    const a = byId.get(l.source_device_id);
    const b = byId.get(l.target_device_id);
    if (!a || !b) {
      return;
    }
    const strength = clampValue((95 + Number(l.rssi)) / 40, 0.12, 0.85);
    meshCtx.strokeStyle = `rgba(0, 127, 137, ${strength})`;
    meshCtx.lineWidth = 1.4 + strength * 2;
    meshCtx.beginPath();
    meshCtx.moveTo(mapX(a.x), mapY(a.y));
    meshCtx.lineTo(mapX(b.x), mapY(b.y));
    meshCtx.stroke();
  });

  points.forEach((p) => {
    const x = mapX(p.x);
    const y = mapY(p.y);
    const conf = confidencePercent(p.confidence);
    const color = conf >= 70 ? "#0f8f5f" : "#d46836";

    meshCtx.fillStyle = "rgba(0, 127, 137, 0.14)";
    meshCtx.beginPath();
    meshCtx.arc(x, y, 18, 0, Math.PI * 2);
    meshCtx.fill();

    meshCtx.fillStyle = color;
    meshCtx.beginPath();
    meshCtx.arc(x, y, 7, 0, Math.PI * 2);
    meshCtx.fill();

    meshCtx.fillStyle = "#0c2430";
    meshCtx.font = "700 12px Space Grotesk";
    meshCtx.fillText(p.device_id, x + 10, y - 8);
    meshCtx.font = "500 11px Space Grotesk";
    meshCtx.fillStyle = "#456272";
    meshCtx.fillText(`${conf}%`, x + 10, y + 8);
  });
}

async function syncPositions() {
  if (meshModeActive) {
    return;
  }

  const started = performance.now();

  try {
    const [positionsResponse, relativeResponse, routerResponse] = await Promise.all([
      fetch(`${apiBase}/positions`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
      fetch(`${apiBase}/relative`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
      fetch(`${apiBase}/routers`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
    ]);

    if (!positionsResponse.ok) {
      throw new Error(`HTTP ${positionsResponse.status}`);
    }

    const trackingPayload = await positionsResponse.json();
    const relativePayload = relativeResponse.ok ? await relativeResponse.json() : [];
    const routersPayload = routerResponse.ok ? await routerResponse.json() : [];

    if (!trackingPayload || typeof trackingPayload !== "object") {
      throw new Error("Invalid payload from /positions");
    }
    if (!Array.isArray(relativePayload)) {
      throw new Error("Invalid payload from /relative");
    }
    if (!Array.isArray(routersPayload)) {
      throw new Error("Invalid payload from /routers");
    }

    const normalizedFromRaw = normalizeTrackingPayload(trackingPayload);
    const hasExplicitTarget = Boolean(normalizedFromRaw.target);
    let normalizedTracking = normalizedFromRaw;
    if (!normalizedTracking.target && normalizedTracking.detectors.length > 0) {
      normalizedTracking = {
        ...normalizedTracking,
        target: buildTargetFromDetectors(normalizedTracking.detectors),
      };
    }

    console.debug("[demo-debug] /positions payload", normalizedTracking);

    lastTrackingData = normalizedTracking;
    lastData = flattenTrackingPayload(normalizedTracking);
    lastRelativeLinks = relativePayload;
    lastRouters = routersPayload;
    const latency = performance.now() - started;

    await refreshDeviceSelector();
    renderKpis(lastData, latency);
    renderCards(lastData);
    render3DBars(lastData, lastTrackingData);
    updateRouterMeshes(lastRouters);
    renderTable(lastData);
    renderRelativeTable(lastRelativeLinks, lastData);
    drawMap(lastData);
    drawMeshGraph(lastData, lastRelativeLinks);
    if (!hasExplicitTarget) {
      setStatus(`Live stream active. Tracking ${lastData.length} device(s).`);
    } else {
      const target = lastTrackingData.target;
      if (!target) {
        setStatus(`No target available yet. Waiting for detections...`);
      } else if (lastTrackingData.target_lost) {
        setStatus(`Target ${target.device_id} is lost (low confidence ${confidencePercent(target.confidence)}%).`, true);
      } else {
        const nearest = lastTrackingData.nearest_detector_id ? ` nearest detector: ${lastTrackingData.nearest_detector_id}.` : "";
        setStatus(`Tracking ${target.device_id} at (${Number(target.x).toFixed(2)}, ${Number(target.y).toFixed(2)}) | confidence ${confidencePercent(target.confidence)}%.${nearest}`);
      }
    }
  } catch (error) {
    const latency = performance.now() - started;
    renderKpis(lastData, latency);
    render3DBars(lastData, lastTrackingData);
    updateRouterMeshes(lastRouters);
    drawMap(lastData);
    renderRelativeTable(lastRelativeLinks, lastData);
    drawMeshGraph(lastData, lastRelativeLinks);
    setStatus(`Connection issue: ${error.message}`, true);
  }
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function activeScenario() {
  return scenarioProfiles[activeScenarioKey] || scenarioProfiles.balanced;
}

function applyScenario(key) {
  const scenario = scenarioProfiles[key] || scenarioProfiles.balanced;
  activeScenarioKey = key in scenarioProfiles ? key : "balanced";
  if (els.scenarioSelect) {
    els.scenarioSelect.value = activeScenarioKey;
  }

  demoDevices.forEach((d) => {
    const base = baseDeviceProfile[d.device_id];
    const speedMult = scenario.speedMultiplier[d.cluster] ?? 1.0;
    const pauseMult = scenario.pauseMultiplier[d.cluster] ?? 1.0;

    d.speed = Number((base.speed * speedMult).toFixed(3));
    d.pauseChance = clampValue(base.pauseChance * pauseMult, 0.03, 0.55);
    d.path = base.path;
    d.origin = { ...base.origin };

    if (activeScenarioKey === "office-heavy" && d.cluster === "office") {
      d.origin = { x: base.origin.x - 1.2, y: base.origin.y - 0.8 };
    }
    if (activeScenarioKey === "warehouse-heavy" && d.cluster === "warehouse") {
      d.origin = { x: base.origin.x + 1.5, y: base.origin.y + 1.0 };
    }
    if (activeScenarioKey === "outdoor-heavy" && d.cluster === "outdoor") {
      d.origin = { x: base.origin.x + 2.0, y: base.origin.y + 1.0 };
    }
  });

  setStatus(`Scenario switched to ${scenario.label}.`);
}

function clampValue(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function rssiToDistance(rssi, txPower = -58, envFactor = 2.2) {
  const ratio = (txPower - rssi) / (10.0 * envFactor);
  return clampValue(Math.pow(10.0, ratio), 0.8, 35.0);
}

function buildUndirectedConstraints(observations) {
  const grouped = new Map();
  observations.forEach((obs) => {
    const a = obs.source_device_id;
    const b = obs.target_device_id;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const prev = grouped.get(key) || { a: a < b ? a : b, b: a < b ? b : a, totalDist: 0, totalRssi: 0, count: 0 };
    prev.totalDist += obs.estimated_distance_m;
    prev.totalRssi += obs.rssi;
    prev.count += 1;
    grouped.set(key, prev);
  });

  return Array.from(grouped.values()).map((g) => ({
    a: g.a,
    b: g.b,
    distance: g.totalDist / g.count,
    rssi: g.totalRssi / g.count,
  }));
}

function estimateMeshLayout(nodes, constraints) {
  const pos = {};
  const radius = 10 + nodes.length * 1.2;
  nodes.forEach((node, idx) => {
    const angle = (Math.PI * 2 * idx) / Math.max(nodes.length, 1);
    pos[node.device_id] = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  const anchors = nodes.slice(0, 2).map((n) => n.device_id);
  if (anchors.length > 1) {
    const lock = constraints.find((c) => (c.a === anchors[0] && c.b === anchors[1]) || (c.a === anchors[1] && c.b === anchors[0]));
    pos[anchors[0]] = { x: 0, y: 0 };
    pos[anchors[1]] = { x: lock ? lock.distance : 8.0, y: 0 };
  }

  for (let iter = 0; iter < 80; iter += 1) {
    constraints.forEach((c) => {
      const pa = pos[c.a];
      const pb = pos[c.b];
      if (!pa || !pb) {
        return;
      }

      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const err = dist - c.distance;
      const gain = 0.09;
      const adjustX = (dx / dist) * err * gain;
      const adjustY = (dy / dist) * err * gain;

      if (!anchors.includes(c.a)) {
        pa.x += adjustX;
        pa.y += adjustY;
      }
      if (!anchors.includes(c.b)) {
        pb.x -= adjustX;
        pb.y -= adjustY;
      }
    });
  }

  return pos;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function toHeading(dx, dy) {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return angle >= 0 ? angle : angle + 360;
}

function getDevicePositionOnPath(device, tick) {
  const path = pathDefinitions[device.path] || pathDefinitions.officeLoop;
  const state = motionStateByDevice[device.device_id] || {
    segment: 0,
    t: randomInRange(0, 0.8),
    dwellTicks: 0,
  };

  if (state.dwellTicks > 0) {
    state.dwellTicks -= 1;
  } else {
    const current = path[state.segment % path.length];
    const next = path[(state.segment + 1) % path.length];
    const segLen = Math.max(0.1, Math.hypot(next.x - current.x, next.y - current.y));

    const speedWave = Math.sin((tick + device.seed) / 5.0) * 0.12;
    const jitter = randomInRange(-0.05, 0.05);
    const stepMeters = Math.max(0.2, device.speed + speedWave + jitter);
    state.t += stepMeters / segLen;

    while (state.t >= 1.0) {
      state.t -= 1.0;
      state.segment = (state.segment + 1) % path.length;
      if (Math.random() < device.pauseChance) {
        state.dwellTicks = 1 + Math.floor(Math.random() * 2);
        break;
      }
    }
  }

  const current = path[state.segment % path.length];
  const next = path[(state.segment + 1) % path.length];
  const x = device.origin.x + current.x + (next.x - current.x) * state.t;
  const y = device.origin.y + current.y + (next.y - current.y) * state.t;

  const dx = next.x - current.x;
  const dy = next.y - current.y;
  const heading = toHeading(dx, dy) + randomInRange(-4.5, 4.5);

  motionStateByDevice[device.device_id] = state;
  return { x, y, heading: heading < 0 ? heading + 360 : heading % 360 };
}

function obstructionLossDb(devicePos, anchor, deviceFloor) {
  let dbLoss = 0;
  for (const obs of obstructions) {
    if (obs.floor !== deviceFloor) {
      continue;
    }
    const closestDist = pointToSegmentDistance(
      obs.x,
      obs.y,
      devicePos.x,
      devicePos.y,
      anchor.x,
      anchor.y
    );
    if (closestDist <= obs.radius) {
      dbLoss += obs.lossDb;
    }
  }
  return dbLoss;
}

function modelRssi(anchor, devicePos, floor, tick, txPower, envFactor, noiseAmp) {
  const scenario = activeScenario();
  const dz = Math.abs(anchor.z - devicePos.z);
  const distance = Math.max(1.0, Math.hypot(devicePos.x - anchor.x, devicePos.y - anchor.y, dz));
  const floorLoss = (dz / FLOOR_HEIGHT_M) * 12.0;
  const obsLoss = obstructionLossDb(devicePos, anchor, floor) * scenario.obstructionScale;
  const clusterWave = Math.sin((tick + devicePos.waveSeed) / 6.0) * 1.3;
  const effectiveNoise = noiseAmp * scenario.rssiNoiseScale;
  const noise = randomInRange(-effectiveNoise, effectiveNoise);
  const rssi = txPower - 10.0 * envFactor * Math.log10(distance) - floorLoss - obsLoss + clusterWave + noise;
  return Math.round(Math.max(-95, Math.min(-34, rssi)));
}

function strongestSignals(values, count, idKey) {
  return values
    .sort((a, b) => b.rssi - a.rssi)
    .slice(0, count)
    .map((item) => ({ [idKey]: item[idKey], rssi: item.rssi }));
}

function buildPeerObservations(device, devicePos, allDeviceStates, tick) {
  const peers = [];
  for (const other of allDeviceStates) {
    if (other.device_id === device.device_id) {
      continue;
    }
    const peerAnchor = { x: other.x, y: other.y, z: other.z };
    const peerRssi = modelRssi(peerAnchor, devicePos, device.floor, tick + device.seed, -58, 2.2, 2.2);
    const dist = Math.hypot(devicePos.x - other.x, devicePos.y - other.y, devicePos.z - other.z);
    if (dist <= 30.0) {
      peers.push({ id: other.device_id, rssi: peerRssi });
    }
  }
  return peers.sort((a, b) => b.rssi - a.rssi).slice(0, 3);
}

function computeNodeConfidence(deviceId, estimated, constraints) {
  const attached = constraints.filter((c) => c.a === deviceId || c.b === deviceId);
  if (attached.length === 0) {
    return 0.25;
  }

  const base = estimated[deviceId];
  if (!base) {
    return 0.25;
  }

  const residual = attached.reduce((sum, c) => {
    const otherId = c.a === deviceId ? c.b : c.a;
    const other = estimated[otherId];
    if (!other) {
      return sum + 8.0;
    }
    const d = Math.hypot(base.x - other.x, base.y - other.y);
    return sum + Math.abs(d - c.distance);
  }, 0) / attached.length;

  return clampValue(0.95 - residual / 10.0, 0.22, 0.95);
}

function runLocalMeshTick() {
  meshTick += 1;

  const states = demoDevices.map((d) => {
    const pos = getDevicePositionOnPath(d, meshTick);
    return {
      device_id: d.device_id,
      x: pos.x,
      y: pos.y,
      z: d.floor * FLOOR_HEIGHT_M,
      floor: d.floor,
      seed: d.seed,
    };
  });

  const observations = [];
  states.forEach((src) => {
    states.forEach((tgt) => {
      if (src.device_id === tgt.device_id) {
        return;
      }

      const srcPos = { x: src.x, y: src.y, z: src.z, waveSeed: src.seed };
      const tgtAnchor = { x: tgt.x, y: tgt.y, z: tgt.z };
      const directDist = Math.hypot(src.x - tgt.x, src.y - tgt.y, src.z - tgt.z);

      if (directDist > 34.0) {
        return;
      }

      const rssi = modelRssi(tgtAnchor, srcPos, src.floor, meshTick + src.seed, -58, 2.2, 2.2);
      observations.push({
        source_device_id: src.device_id,
        target_device_id: tgt.device_id,
        estimated_distance_m: Number(rssiToDistance(rssi, -58, 2.2).toFixed(3)),
        rssi,
      });
    });
  });

  const constraints = buildUndirectedConstraints(observations);
  const estimated = estimateMeshLayout(states, constraints);

  const points = states.map((s) => ({
    device_id: s.device_id,
    x: estimated[s.device_id]?.x ?? 0,
    y: estimated[s.device_id]?.y ?? 0,
    z: s.z,
    confidence: computeNodeConfidence(s.device_id, estimated, constraints),
  }));

  lastData = points;
  lastRelativeLinks = observations;

  renderKpis(points, 0.0);
  renderCards(points);
  render3DBars(points);
  renderTable(points);
  renderRelativeTable(observations, points);
  drawMap(points);
  drawMeshGraph(points, observations);
  setStatus(`P2P mesh running locally (${points.length} phones). No cloud required.`);
}

function buildDemoPayload(device, tick, stateLookup, allDeviceStates) {
  const nextSeq = (seqByDevice[device.device_id] ?? demoSequenceBase + device.seed * 1000) + 1;
  seqByDevice[device.device_id] = nextSeq;

  const pathState = stateLookup[device.device_id];
  const pathPos = { heading: pathState.heading };
  const devicePos = {
    x: pathState.x,
    y: pathState.y,
    z: pathState.z,
    waveSeed: device.seed,
  };

  const wifiSamples = wifiAnchors.map((anchor) => ({
    ssid: anchor.id,
    rssi: modelRssi(anchor, devicePos, device.floor, tick + nextSeq, -43, 2.6, 1.8),
  }));
  const bleSamples = bleAnchors.map((anchor) => ({
    id: anchor.id,
    rssi: modelRssi(anchor, devicePos, device.floor, tick + nextSeq, -60, 2.0, 2.6),
  }));

  const scenario = activeScenario();
  const gpsAccuracy = device.floor === -1
    ? randomInRange(5.0, 11.5)
    : randomInRange(22.0 * scenario.indoorGpsBias, 48.0 * scenario.indoorGpsBias);
  
  return {
    device_id: device.device_id,
    timestamp: Date.now() / 1000,
    sequence: nextSeq,
    floor_hint: device.floor,
    // Use `ssid` for compatibility with the active backend schema.
    wifi: strongestSignals(wifiSamples, 5, "ssid"),
    ble: strongestSignals(bleSamples, 4, "id"),
    peers: buildPeerObservations(device, devicePos, allDeviceStates, tick),
    imu: {
      steps: device.cluster === "outdoor"
        ? (Math.random() > 0.15 ? 2 : 1)
        : (Math.random() > 0.35 ? 1 : 0),
      direction: pathPos.heading,
    },
    gps: {
      lat: device.lat + (devicePos.x / 111000) + randomInRange(-0.00003, 0.00003),
      lon: device.lon + (devicePos.y / 98000) + randomInRange(-0.00003, 0.00003),
      accuracy: gpsAccuracy,
    },
  };
}

async function postDemoTick(tick) {
  const states = demoDevices.map((d) => {
    const pos = getDevicePositionOnPath(d, tick);
    const motion = demoMotionByDevice[d.device_id] || {
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
    };

    const jitterScale = Math.max(0.05, d.speed * 0.06);
    motion.vx = motion.vx * 0.78 + randomInRange(-jitterScale, jitterScale) * 0.22;
    motion.vy = motion.vy * 0.78 + randomInRange(-jitterScale, jitterScale) * 0.22;
    motion.x += (pos.x - motion.x) * 0.24 + motion.vx;
    motion.y += (pos.y - motion.y) * 0.24 + motion.vy;

    demoMotionByDevice[d.device_id] = motion;

    return {
      device_id: d.device_id,
      floor: d.floor,
      x: motion.x,
      y: motion.y,
      z: d.floor * FLOOR_HEIGHT_M,
      heading: pos.heading,
    };
  });
  const stateLookup = Object.fromEntries(states.map((s) => [s.device_id, s]));

  console.debug(
    "[demo-debug] states before ingest",
    tick,
    states.map((s) => ({ id: s.device_id, x: Number(s.x.toFixed(2)), y: Number(s.y.toFixed(2)) }))
  );

  const responses = await Promise.all(
    demoDevices.map(async (d) => {
      const payload = buildDemoPayload(d, tick, stateLookup, states);
      const response = await fetch(`${apiBase}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ack = await response.json().catch(() => ({}));
      return { device_id: d.device_id, status: response.status, ack };
    })
  );

  console.debug("[demo-debug] ingest ack", responses);
}

function startDemoStream() {
  if (meshModeActive) {
    stopMeshMode(false);
  }
  if (demoTimer) {
    setStatus("Demo stream is already running.");
    return;
  }
  Object.keys(demoMotionByDevice).forEach((id) => {
    delete demoMotionByDevice[id];
  });
  demoSequenceBase = Math.floor(Date.now() / 1000) * 1000;
  ensureDemoTargetSelection();
  let tick = 0;
  demoTimer = setInterval(async () => {
    tick += 1;
    try {
      await postDemoTick(tick);
    } catch (error) {
      setStatus(`Demo stream error: ${error.message}`, true);
    }
  }, 900);
  startPolling();
  setStatus(`Demo stream started (${activeScenario().label}). Data is being pushed to /ingest.`);
}

function stopDemoStream() {
  if (!demoTimer) {
    setStatus("Demo stream is already stopped.");
    return;
  }
  clearInterval(demoTimer);
  demoTimer = null;
  setStatus("Demo stream stopped.");
}

function startMeshMode() {
  if (meshModeActive) {
    setStatus("P2P mesh mode is already running.");
    return;
  }
  stopDemoStream();
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  meshModeActive = true;
  meshTick = 0;
  runLocalMeshTick();
  meshModeTimer = setInterval(runLocalMeshTick, 900);
  setStatus(`P2P mesh mode started (${activeScenario().label}, local BLE simulation, no cloud dependency).`, false);
}

function stopMeshMode(restartPolling = true) {
  if (!meshModeActive) {
    if (restartPolling) {
      setStatus("P2P mesh mode is already stopped.");
    }
    return;
  }
  if (meshModeTimer) {
    clearInterval(meshModeTimer);
    meshModeTimer = null;
  }
  meshModeActive = false;
  if (restartPolling) {
    startPolling();
  }
  setStatus("P2P mesh mode stopped.");
}

function startPolling() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  syncPositions();
  refreshTimer = setInterval(syncPositions, 1000);
}

applyScenario("balanced");
refreshDeviceSelector();
startPolling();
window.addEventListener("beforeunload", () => {
  clearInterval(refreshTimer);
  if (demoTimer) {
    clearInterval(demoTimer);
  }
  if (meshModeTimer) {
    clearInterval(meshModeTimer);
  }
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
});

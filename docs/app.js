const CAMERA_RESOLUTIONS = [
  { value: "auto", label: "Auto" },
  { value: "640x480", label: "640 x 480" },
  { value: "1280x720", label: "1280 x 720" },
  { value: "1920x1080", label: "1920 x 1080" },
];

const CAMERA_ASPECT_RATIOS = ["auto", "16:9", "4:3"];
const CAMERA_FPS_OPTIONS = ["auto", "15", "20", "25", "30"];
const CAMERA_CONFIG_FIELDS = [
  "cameraResolution",
  "cameraAspectRatio",
  "cameraFps",
  "cameraFitMode",
  "cameraZoom",
  "digitalScale",
  "digitalOffsetX",
  "digitalOffsetY",
  "cameraDeviceId",
];

const DEFAULT_CONFIG = {
  lineA: [{ x: 0.38, y: 0.04 }, { x: 0.38, y: 0.98 }],
  lineB: [{ x: 0.62, y: 0.04 }, { x: 0.62, y: 0.98 }],
  roi: [{ x: 0.02, y: 0.04 }, { x: 0.98, y: 0.04 }, { x: 0.98, y: 0.98 }, { x: 0.02, y: 0.98 }],
  lineOrientation: "vertical",
  entryDirection: "LEFT_TO_RIGHT",
  lineAPosition: 0.38,
  lineBPosition: 0.62,
  lineSeparation: 0.24,
  minLineSeparation: 0.05,
  calibrationId: null,
  sessionId: null,
  deviceId: null,
  zoneId: null,
  cameraResolution: "1280x720",
  cameraAspectRatio: "auto",
  cameraFps: "15",
  cameraFitMode: "fit",
  cameraZoom: null,
  digitalScale: 1,
  digitalOffsetX: 0,
  digitalOffsetY: 0,
  cameraDeviceId: "",
};

const DIRECTIONS_BY_ORIENTATION = {
  vertical: ["LEFT_TO_RIGHT", "RIGHT_TO_LEFT"],
  horizontal: ["BOTTOM_TO_TOP", "TOP_TO_BOTTOM"],
};

const DETECTION_THRESHOLD = 0.30;
const TRACK_MATCH_DISTANCE = 180;
const TRACK_TTL_MS = 2600;
const REPORT_TIMEZONE = "America/Guayaquil";
const TIME_BUCKET_MINUTES = 60;
const LIVE_RATE_WINDOW_MINUTES = 5;
const GROUP_WINDOW_SECONDS = 2;
const CAMERA_NAME = "ENTRADA_01";
const MIN_LINE_SEPARATION = 0.05;
const CAMERA_START_TIMEOUT_MS = 25000;
const ROI_EDGE_TOLERANCE = 0.10;
const LINE_EDGE_TOLERANCE = 0.12;
const LEGACY_INSET_ROI = [{ x: 0.08, y: 0.12 }, { x: 0.92, y: 0.12 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }];

const state = {
  stream: null,
  model: null,
  running: false,
  count: 0,
  realCount: 0,
  history: [],
  events: [],
  sessions: [],
  days: {},
  currentSessionId: null,
  tracks: new Map(),
  nextTrackId: 1,
  activeView: "count",
  activeTool: "lineA",
  calibrationDraft: null,
  calibrationStatus: "Ajusta A, B o Zona y guarda.",
  calibrationStatusKind: "ok",
  calibrationProbe: {
    active: false,
    tracks: new Map(),
    events: [],
  },
  dragging: null,
  lastFrameSentAt: 0,
  lastDebugLogAt: 0,
  debugStats: {
    detectedPersons: 0,
    activeTracks: 0,
    entriesConfirmed: 0,
    last1Minute: 0,
    last5Minutes: 0,
    liveRatePerMinute: 0,
    projectedPeoplePerHour: 0,
    currentBucket: "--",
  },
  cameraDevices: [],
  cameraCapabilities: {},
  cameraSettings: {},
  config: cloneConfig(DEFAULT_CONFIG),
};

const els = {
  camera: document.querySelector("#camera"),
  calibrationMirror: document.querySelector("#calibrationMirror"),
  helpMirror: document.querySelector("#helpMirror"),
  overlay: document.querySelector("#overlay"),
  calibrationOverlay: document.querySelector("#calibrationOverlay"),
  helpOverlay: document.querySelector("#helpOverlay"),
  videoEmpty: document.querySelector("#videoEmpty"),
  cameraFix: document.querySelector("#cameraFix"),
  openExternalBrowser: document.querySelector("#openExternalBrowser"),
  copyAppLink: document.querySelector("#copyAppLink"),
  cameraHelpText: document.querySelector("#cameraHelpText"),
  calibrationEmpty: document.querySelector("#calibrationEmpty"),
  countValue: document.querySelector("#countValue"),
  detectedCount: document.querySelector("#detectedCount"),
  activeTrackCount: document.querySelector("#activeTrackCount"),
  realCount: document.querySelector("#realCount"),
  accuracyValue: document.querySelector("#accuracyValue"),
  requestedResolution: document.querySelector("#requestedResolution"),
  realResolution: document.querySelector("#realResolution"),
  todayLabel: document.querySelector("#todayLabel"),
  historyTotal: document.querySelector("#historyTotal"),
  historyDate: document.querySelector("#historyDate"),
  historyList: document.querySelector("#historyList"),
  toggleCamera: document.querySelector("#toggleCamera"),
  resetCount: document.querySelector("#resetCount"),
  clearDay: document.querySelector("#clearDay"),
  currentBucketLabel: document.querySelector("#currentBucketLabel"),
  currentBucketCount: document.querySelector("#currentBucketCount"),
  liveRateValue: document.querySelector("#liveRateValue"),
  hourProjectionValue: document.querySelector("#hourProjectionValue"),
  last15Value: document.querySelector("#last15Value"),
  last30Value: document.querySelector("#last30Value"),
  maxGroupValue: document.querySelector("#maxGroupValue"),
  avgGroupValue: document.querySelector("#avgGroupValue"),
  peakHourLabel: document.querySelector("#peakHourLabel"),
  averageHourLabel: document.querySelector("#averageHourLabel"),
  saveCalibration: document.querySelector("#saveCalibration"),
  cancelCalibration: document.querySelector("#cancelCalibration"),
  restoreCalibration: document.querySelector("#restoreCalibration"),
  expandRoi: document.querySelector("#expandRoi"),
  swapLines: document.querySelector("#swapLines"),
  testCalibration: document.querySelector("#testCalibration"),
  calibrationStatus: document.querySelector("#calibrationStatus"),
  cameraDevice: document.querySelector("#cameraDevice"),
  cameraResolution: document.querySelector("#cameraResolution"),
  cameraAspectRatio: document.querySelector("#cameraAspectRatio"),
  cameraFps: document.querySelector("#cameraFps"),
  cameraFitMode: document.querySelector("#cameraFitMode"),
  cameraZoom: document.querySelector("#cameraZoom"),
  cameraZoomValue: document.querySelector("#cameraZoomValue"),
  cameraZoomStatus: document.querySelector("#cameraZoomStatus"),
  digitalScale: document.querySelector("#digitalScale"),
  digitalScaleValue: document.querySelector("#digitalScaleValue"),
  digitalOffsetX: document.querySelector("#digitalOffsetX"),
  digitalOffsetXValue: document.querySelector("#digitalOffsetXValue"),
  digitalOffsetY: document.querySelector("#digitalOffsetY"),
  digitalOffsetYValue: document.querySelector("#digitalOffsetYValue"),
  cameraRequestedValue: document.querySelector("#cameraRequestedValue"),
  cameraRealValue: document.querySelector("#cameraRealValue"),
  recommendedCamera: document.querySelector("#recommendedCamera"),
  wideView: document.querySelector("#wideView"),
  resetFraming: document.querySelector("#resetFraming"),
  statusText: document.querySelector("#statusText"),
  statusPill: document.querySelector("#statusPill"),
  viewTitle: document.querySelector("#viewTitle"),
};

let todayKey = guayaquilDateKey(new Date());

loadState();
ensureCalibrationDraft();
wireUi();
renderAll();
setStatus("Listo");

function wireUi() {
  els.toggleCamera.addEventListener("click", () => {
    if (state.running) {
      stopCamera();
    } else {
      startCamera();
    }
  });

  els.resetCount.addEventListener("click", () => {
    state.sessions.push({ type: "SESSION_RESET", timestamp: guayaquilIso(new Date()), timestampMs: Date.now() });
    state.tracks.clear();
    saveState();
    renderAll();
    setStatus("Sesion reiniciada");
  });

  els.clearDay.addEventListener("click", () => {
    const confirmed = confirm("Esto borra los datos de HOY en este dispositivo. El historial de otros dias se conserva. ¿Continuar?");
    if (!confirmed) return;
    state.count = 0;
    state.events = [];
    state.sessions = [];
    state.currentSessionId = null;
    state.realCount = 0;
    state.tracks.clear();
    state.debugStats.entriesConfirmed = 0;
    if (state.running) startSession(false);
    saveState();
    renderAll();
    setStatus("Dia borrado");
  });

  els.realCount.addEventListener("input", () => {
    state.realCount = Math.max(0, Number(els.realCount.value || 0));
    saveState();
    renderDebugMetrics();
  });

  if (els.copyAppLink) {
    els.copyAppLink.addEventListener("click", async () => {
      const url = appUrl();
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Link copiado");
        setCameraHelpText("Link copiado. Pegalo en Safari o Chrome.");
      } catch (_error) {
        prompt("Copia este link y pegalo en Safari o Chrome:", url);
      }
    });
  }

  if (els.openExternalBrowser) {
    els.openExternalBrowser.addEventListener("click", (event) => {
      if (els.openExternalBrowser.dataset.action !== "retry") return;
      event.preventDefault();
      startCamera();
    });
  }

  wireCameraControls();

  els.saveCalibration.addEventListener("click", () => {
    ensureCalibrationDraft();
    const validation = validateCalibration(state.calibrationDraft);
    if (!validation.ok) {
      setCalibrationStatus(validation.message, "error");
      setStatus("Revisar");
      return;
    }
    state.config = normalizeConfig(state.calibrationDraft);
    state.calibrationDraft = cloneConfig(state.config);
    state.tracks.clear();
    saveState();
    renderAll();
    setCalibrationStatus("Calibracion guardada.", "ok");
    setStatus("Calibrado");
  });

  els.cancelCalibration.addEventListener("click", () => {
    state.calibrationDraft = cloneConfig(state.config);
    state.dragging = null;
    setCalibrationStatus("Cambios cancelados.", "ok");
    renderAll();
  });

  els.restoreCalibration.addEventListener("click", () => {
    const confirmed = confirm("Restaurar la calibracion por defecto en esta pantalla?");
    if (!confirmed) return;
    state.calibrationDraft = normalizeConfig(DEFAULT_CONFIG);
    setCalibrationStatus("Calibracion restaurada. Presiona Guardar.", "warning");
    renderAll();
    setStatus("Restaurado");
  });

  if (els.expandRoi) {
    els.expandRoi.addEventListener("click", () => {
      ensureCalibrationDraft();
      const next = cloneConfig(state.calibrationDraft);
      next.roi = cloneConfig(DEFAULT_CONFIG.roi);
      syncLineSpansToRoi(next);
      updateCalibrationMetadata(next);
      state.calibrationDraft = next;
      setCalibrationStatus("Zona ampliada al borde. Presiona Guardar.", "warning");
      renderAll();
      setStatus("Zona al borde");
    });
  }

  els.swapLines.addEventListener("click", () => {
    ensureCalibrationDraft();
    const next = cloneConfig(state.calibrationDraft);
    [next.lineA, next.lineB] = [next.lineB, next.lineA];
    updateCalibrationMetadata(next);
    state.calibrationDraft = next;
    setCalibrationStatus("Lineas A y B intercambiadas. Presiona Guardar.", "warning");
    renderAll();
  });

  els.testCalibration.addEventListener("click", () => {
    state.calibrationProbe.active = !state.calibrationProbe.active;
    state.calibrationProbe.tracks.clear();
    state.calibrationProbe.events = [];
    els.testCalibration.classList.toggle("active", state.calibrationProbe.active);
    setCalibrationStatus(state.calibrationProbe.active ? "Prueba activa: no suma al contador oficial." : "Prueba detenida.", "ok");
    renderAll();
  });

  document.querySelectorAll("[data-orientation]").forEach((button) => {
    button.addEventListener("click", () => {
      setCalibrationOrientation(button.dataset.orientation);
    });
  });

  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      setCalibrationDirection(button.dataset.direction);
    });
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll(".tool").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTool = button.dataset.tool;
      document.querySelectorAll(".tool").forEach((item) => item.classList.toggle("active", item === button));
      drawCalibration();
    });
  });

  addCalibrationPointerEvents();
}

function wireCameraControls() {
  if (els.cameraDevice) {
    els.cameraDevice.addEventListener("change", () => {
      setCameraFields({ cameraDeviceId: els.cameraDevice.value }, { restart: true });
    });
  }

  if (els.cameraResolution) {
    els.cameraResolution.addEventListener("change", () => {
      setCameraFields({ cameraResolution: els.cameraResolution.value }, { restart: true });
    });
  }

  if (els.cameraAspectRatio) {
    els.cameraAspectRatio.addEventListener("change", () => {
      setCameraFields({ cameraAspectRatio: els.cameraAspectRatio.value }, { restart: true });
    });
  }

  if (els.cameraFps) {
    els.cameraFps.addEventListener("change", () => {
      setCameraFields({ cameraFps: els.cameraFps.value }, { restart: true });
    });
  }

  if (els.cameraFitMode) {
    els.cameraFitMode.addEventListener("change", () => {
      setCameraFields({ cameraFitMode: els.cameraFitMode.value });
    });
  }

  if (els.digitalScale) {
    els.digitalScale.addEventListener("input", () => {
      setCameraFields({ digitalScale: Number(els.digitalScale.value) });
    });
  }

  if (els.digitalOffsetX) {
    els.digitalOffsetX.addEventListener("input", () => {
      setCameraFields({ digitalOffsetX: Number(els.digitalOffsetX.value) });
    });
  }

  if (els.digitalOffsetY) {
    els.digitalOffsetY.addEventListener("input", () => {
      setCameraFields({ digitalOffsetY: Number(els.digitalOffsetY.value) });
    });
  }

  if (els.cameraZoom) {
    els.cameraZoom.addEventListener("input", () => {
      applyRealZoom(Number(els.cameraZoom.value));
    });
  }

  if (els.recommendedCamera) {
    els.recommendedCamera.addEventListener("click", () => {
      applyRecommendedCamera();
    });
  }

  if (els.wideView) {
    els.wideView.addEventListener("click", () => {
      applyWideView();
    });
  }

  if (els.resetFraming) {
    els.resetFraming.addEventListener("click", () => {
      resetCameraFraming();
    });
  }

  if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === "function") {
    navigator.mediaDevices.addEventListener("devicechange", refreshVideoDevices);
  }

  refreshVideoDevices();
}

async function startCamera() {
  if (state.running) return;
  resetCameraEmpty();
  let cameraOpened = false;
  try {
    setStatus("Camara");
    applyCameraView(activeCameraConfig());
    state.stream = await requestCameraStream();
    cameraOpened = true;
    await attachCameraStream(state.stream);
    state.running = true;
    startSession();
    els.videoEmpty.hidden = true;
    els.calibrationEmpty.hidden = true;
    els.toggleCamera.innerHTML = '<span class="icon">■</span><span>Detener</span>';
    setStatus("Cargando IA");
    await loadModel();
    if (!state.running || !state.stream) return;
    setStatus("Contando");
    requestAnimationFrame(loop);
  } catch (error) {
    if (cameraOpened && !error.cameraReason) {
      error.cameraReason = "model";
    }
    const info = cameraFailureInfo(error);
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    state.running = false;
    endSession();
    els.videoEmpty.hidden = false;
    els.calibrationEmpty.hidden = false;
    els.toggleCamera.innerHTML = '<span class="icon">▶</span><span>Iniciar</span>';
    setCameraEmpty(info.title, info.message);
    showCameraFix(info);
    setStatus(info.status);
    console.warn("Camera start failed", error);
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
  state.stream = null;
  state.running = false;
  endSession();
  els.videoEmpty.hidden = false;
  els.calibrationEmpty.hidden = false;
  resetCameraEmpty();
  els.toggleCamera.innerHTML = '<span class="icon">▶</span><span>Iniciar</span>';
  setStatus("Detenido");
}

async function requestCameraStream() {
  if (!isSecureCameraContext()) {
    throw cameraStartError("insecure", "La camara solo funciona con HTTPS o localhost.");
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw cameraStartError("unsupported", "Este navegador no permite abrir la camara desde la pagina.");
  }

  const attempts = await cameraConstraintAttempts();
  let lastError = null;
  for (const constraints of attempts) {
    try {
      return await getUserMediaWithTimeout(constraints);
    } catch (error) {
      lastError = error;
      if (isPermissionError(error)) break;
    }
  }
  throw lastError || cameraStartError("unknown", "No se pudo abrir la camara.");
}

async function cameraConstraintAttempts() {
  const config = activeCameraConfig();
  const desktop = !isMobileDevice();
  const preferred = buildVideoConstraints(config);
  const compact = buildVideoConstraints({ ...config, cameraResolution: "640x480" });
  const hd = buildVideoConstraints({ ...config, cameraResolution: "1280x720" });
  const attempts = [];
  const devices = await refreshVideoDevices();

  if (config.cameraDeviceId) {
    attempts.push({ audio: false, video: buildVideoConstraints(config, { deviceId: config.cameraDeviceId }) });
  }

  if (desktop) {
    attempts.push(
      { audio: false, video: preferred },
      { audio: false, video: hd },
      { audio: false, video: compact },
      { audio: false, video: true },
      { audio: false, video: { facingMode: { ideal: "environment" }, ...compact } },
    );
  } else {
    attempts.push(
      { audio: false, video: { facingMode: { ideal: "environment" }, ...preferred } },
      { audio: false, video: { facingMode: { ideal: "environment" }, ...hd } },
      { audio: false, video: { facingMode: { ideal: "environment" }, ...compact } },
      { audio: false, video: preferred },
      { audio: false, video: { facingMode: "user", ...compact } },
      { audio: false, video: true },
    );
  }

  rankWideDevices(devices).forEach((device) => {
    if (!device.deviceId) return;
    attempts.push({
      audio: false,
      video: {
        deviceId: { exact: device.deviceId },
        ...preferred,
      },
    });
  });
  return uniqueConstraintAttempts(attempts);
}

async function listVideoInputDevices() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function") return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput");
  } catch (_error) {
    return [];
  }
}

async function refreshVideoDevices() {
  state.cameraDevices = await listVideoInputDevices();
  renderCameraControls();
  return state.cameraDevices;
}

function buildVideoConstraints(config, options = {}) {
  const video = {};
  const resolution = parseResolution(options.cameraResolution || config.cameraResolution);
  const fps = parseFps(options.cameraFps || config.cameraFps);
  const aspectRatio = parseAspectRatio(options.cameraAspectRatio || config.cameraAspectRatio);

  if (resolution) {
    video.width = { ideal: resolution.width };
    video.height = { ideal: resolution.height };
  } else {
    video.width = { ideal: 1280 };
    video.height = { ideal: 720 };
  }

  if (fps) {
    video.frameRate = { ideal: fps };
  } else {
    video.frameRate = { ideal: 24, max: 30 };
  }

  if (aspectRatio) {
    video.aspectRatio = { ideal: aspectRatio };
  }

  if (options.deviceId) {
    video.deviceId = { exact: options.deviceId };
  }

  return video;
}

function parseResolution(value) {
  const match = /^(\d{3,5})x(\d{3,5})$/i.exec(String(value || ""));
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseFps(value) {
  const fps = Number(value);
  return Number.isFinite(fps) && fps > 0 ? fps : null;
}

function parseAspectRatio(value) {
  if (value === "16:9") return 16 / 9;
  if (value === "4:3") return 4 / 3;
  return null;
}

function rankWideDevices(devices) {
  return [...devices].sort((left, right) => deviceWideScore(right) - deviceWideScore(left));
}

function deviceWideScore(device) {
  const label = String(device.label || "").toLowerCase();
  let score = 0;
  if (/ultra|wide|0\.5|0,5|gran angular|angle/i.test(label)) score += 100;
  if (/back|rear|environment|trasera|posterior/i.test(label)) score += 35;
  if (/front|user|frontal|facetime/i.test(label)) score -= 20;
  return score;
}

function uniqueConstraintAttempts(attempts) {
  const seen = new Set();
  return attempts.filter((attempt) => {
    const key = JSON.stringify(attempt);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function waitForVideoReady(video, timeoutMs = 3500) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("playing", done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    video.addEventListener("loadedmetadata", done, { once: true });
    video.addEventListener("playing", done, { once: true });
  });
}

async function refreshCameraTrackInfo() {
  const track = currentVideoTrack();
  if (!track) {
    state.cameraCapabilities = {};
    state.cameraSettings = {};
    return;
  }
  state.cameraCapabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
  state.cameraSettings = typeof track.getSettings === "function" ? track.getSettings() : {};
  if (state.cameraSettings.deviceId && !state.config.cameraDeviceId) {
    setCameraFields({ cameraDeviceId: state.cameraSettings.deviceId }, { save: true, render: false, restart: false });
  }
  await refreshVideoDevices();
}

function currentVideoTrack() {
  return state.stream && typeof state.stream.getVideoTracks === "function"
    ? state.stream.getVideoTracks()[0] || null
    : null;
}

function zoomCapability() {
  const zoom = state.cameraCapabilities && state.cameraCapabilities.zoom;
  if (!zoom || !Number.isFinite(zoom.min) || !Number.isFinite(zoom.max)) return null;
  return {
    min: Number(zoom.min),
    max: Number(zoom.max),
    step: Number.isFinite(zoom.step) && zoom.step > 0 ? Number(zoom.step) : 0.1,
  };
}

async function applyConfiguredRealZoom() {
  const caps = zoomCapability();
  if (!caps) {
    setCameraFields({ cameraZoom: null }, { save: false, render: false, restart: false });
    return false;
  }
  const requested = Number.isFinite(Number(state.config.cameraZoom)) ? Number(state.config.cameraZoom) : caps.min;
  return applyRealZoom(requested, { save: false });
}

async function applyRealZoom(value, options = {}) {
  const track = currentVideoTrack();
  const caps = zoomCapability();
  if (!track || !caps || typeof track.applyConstraints !== "function") {
    renderCameraControls();
    return false;
  }

  const zoom = clampNumber(Number(value), caps.min, caps.max, caps.min);
  try {
    await track.applyConstraints({ advanced: [{ zoom }] });
    state.cameraSettings = typeof track.getSettings === "function" ? track.getSettings() : state.cameraSettings;
    setCameraFields({ cameraZoom: zoom }, { save: options.save !== false, render: false, restart: false });
    renderCameraControls();
    return true;
  } catch (error) {
    console.warn("Zoom control failed", error);
    setStatus("Zoom no disponible");
    renderCameraControls();
    return false;
  }
}

function activeCameraConfig() {
  return state.activeView === "calibrate" ? draftConfig() : state.config;
}

function setCameraFields(fields, options = {}) {
  const nextConfig = cloneConfig(state.config);
  const nextDraft = cloneConfig(draftConfig());
  Object.entries(fields).forEach(([key, value]) => {
    if (!CAMERA_CONFIG_FIELDS.includes(key)) return;
    const normalizedValue = normalizeCameraField(key, value);
    nextConfig[key] = normalizedValue;
    nextDraft[key] = normalizedValue;
  });
  state.config = normalizeConfig(nextConfig, { align: false });
  state.calibrationDraft = normalizeConfig(nextDraft, { align: false });
  if (options.save !== false) saveState();
  if (options.applyView !== false) {
    applyCameraView(activeCameraConfig());
    drawCalibration();
  }
  if (options.render !== false) renderCameraControls();
  if (options.restart && state.stream) {
    restartCameraStream();
  }
}

function normalizeCameraField(key, value) {
  if (key === "cameraResolution") return normalizeCameraResolution(value);
  if (key === "cameraAspectRatio") return CAMERA_ASPECT_RATIOS.includes(value) ? value : DEFAULT_CONFIG.cameraAspectRatio;
  if (key === "cameraFps") return CAMERA_FPS_OPTIONS.includes(String(value)) ? String(value) : DEFAULT_CONFIG.cameraFps;
  if (key === "cameraFitMode") return value === "cover" ? "cover" : "fit";
  if (key === "cameraZoom") return Number.isFinite(Number(value)) ? Number(value) : null;
  if (key === "digitalScale") return clampNumber(Number(value), 1, 2.5, DEFAULT_CONFIG.digitalScale);
  if (key === "digitalOffsetX") return clampNumber(Number(value), -50, 50, DEFAULT_CONFIG.digitalOffsetX);
  if (key === "digitalOffsetY") return clampNumber(Number(value), -50, 50, DEFAULT_CONFIG.digitalOffsetY);
  if (key === "cameraDeviceId") return String(value || "");
  return value;
}

function normalizeCameraResolution(value) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, "");
  if (text === "auto") return "auto";
  return parseResolution(text) ? text : DEFAULT_CONFIG.cameraResolution;
}

function applyCameraView(config = activeCameraConfig()) {
  const fit = config.cameraFitMode === "cover" ? "cover" : "contain";
  const scale = clampNumber(Number(config.digitalScale), 1, 2.5, 1);
  const offsetX = clampNumber(Number(config.digitalOffsetX), -50, 50, 0);
  const offsetY = clampNumber(Number(config.digitalOffsetY), -50, 50, 0);
  document.querySelectorAll(".video-wrap").forEach((wrap) => {
    wrap.style.setProperty("--camera-fit", fit);
    wrap.style.setProperty("--camera-scale", String(scale));
    wrap.style.setProperty("--camera-offset-x", `${offsetX}%`);
    wrap.style.setProperty("--camera-offset-y", `${offsetY}%`);
  });
}

async function restartCameraStream() {
  if (!state.stream) return;
  setStatus("Reiniciando");
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.running = false;
  state.tracks.clear();
  els.videoEmpty.hidden = false;
  els.calibrationEmpty.hidden = false;
  els.toggleCamera.innerHTML = '<span class="icon">▶</span><span>Iniciar</span>';
  await startCamera();
}

async function applyRecommendedCamera() {
  const device = bestWideDevice();
  const fields = {
    cameraResolution: "1280x720",
    cameraAspectRatio: "auto",
    cameraFps: "15",
    cameraFitMode: "fit",
    digitalScale: 1,
    digitalOffsetX: 0,
    digitalOffsetY: 0,
  };
  if (device) fields.cameraDeviceId = device.deviceId;
  const caps = zoomCapability();
  fields.cameraZoom = caps ? caps.min : null;
  setCameraFields(fields, { restart: Boolean(device || state.stream) });
  if (caps) await applyRealZoom(caps.min);
  setStatus("Camara recomendada");
}

async function applyWideView() {
  const device = bestWideDevice();
  const fields = {
    cameraResolution: "1280x720",
    cameraAspectRatio: "auto",
    cameraFps: "15",
    cameraFitMode: "fit",
    digitalScale: 1,
    digitalOffsetX: 0,
    digitalOffsetY: 0,
  };
  if (device) fields.cameraDeviceId = device.deviceId;
  const caps = zoomCapability();
  fields.cameraZoom = caps ? caps.min : null;
  setCameraFields(fields, { restart: Boolean(state.stream) });
  if (caps) await applyRealZoom(caps.min);
  setStatus("Vista amplia");
}

async function resetCameraFraming() {
  const caps = zoomCapability();
  setCameraFields({
    cameraResolution: DEFAULT_CONFIG.cameraResolution,
    cameraAspectRatio: DEFAULT_CONFIG.cameraAspectRatio,
    cameraFps: DEFAULT_CONFIG.cameraFps,
    cameraFitMode: DEFAULT_CONFIG.cameraFitMode,
    cameraZoom: caps ? caps.min : null,
    digitalScale: DEFAULT_CONFIG.digitalScale,
    digitalOffsetX: DEFAULT_CONFIG.digitalOffsetX,
    digitalOffsetY: DEFAULT_CONFIG.digitalOffsetY,
  }, { restart: Boolean(state.stream) });
  if (caps) await applyRealZoom(caps.min);
  setStatus("Encuadre restaurado");
}

function bestWideDevice() {
  return rankWideDevices(state.cameraDevices).find((device) => device.deviceId) || null;
}

function getUserMediaWithTimeout(constraints) {
  let timer = null;
  let timedOut = false;
  const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(cameraStartError("timeout", "Timeout starting video source"));
    }, CAMERA_START_TIMEOUT_MS);
  });
  mediaPromise.then((stream) => {
    if (timedOut) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }).catch(() => {});
  return Promise.race([
    mediaPromise,
    timeout,
  ]).then((stream) => {
    clearTimeout(timer);
    return stream;
  }).catch((error) => {
    clearTimeout(timer);
    throw error;
  });
}

async function attachCameraStream(stream) {
  const playPromises = [els.camera, els.calibrationMirror, els.helpMirror].map((video) => {
    video.srcObject = stream;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      return playPromise.catch(() => {});
    }
    return Promise.resolve();
  });
  await Promise.allSettled(playPromises);
  await waitForVideoReady(els.camera);
  await refreshCameraTrackInfo();
  await applyConfiguredRealZoom();
  renderCameraControls();
}

function cameraStartError(reason, message) {
  const error = new Error(message);
  error.cameraReason = reason;
  return error;
}

function isSecureCameraContext() {
  return location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
}

function isPermissionError(error) {
  return ["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(error && error.name);
}

function isLikelyInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /WhatsApp|FBAN|FBAV|Instagram|Line|MicroMessenger|Snapchat|TikTok/i.test(ua);
}

function isMobileDevice() {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
}

function cameraFailureInfo(error) {
  const name = error && error.name;
  const message = error && error.message ? error.message : "";
  if (error && error.cameraReason === "insecure") {
    return {
      title: "Abre el link seguro",
      message: "La camara necesita HTTPS. Usa el link de GitHub Pages.",
      status: "Sin HTTPS",
      help: appUrl(),
    };
  }
  if (error && error.cameraReason === "unsupported") {
    return {
      title: "Abre en Safari/Chrome",
      message: "Este navegador no deja usar la camara desde aqui.",
      status: "Navegador",
      action: "external",
      help: "Toca Abrir en Safari/Chrome o copia el link y pegalo fuera de WhatsApp.",
    };
  }
  if (error && error.cameraReason === "model") {
    return {
      title: "Camara abierta, falta IA",
      message: "No cargo el modelo de deteccion. Revisa internet y vuelve a iniciar.",
      status: "Sin IA",
      action: "retry",
      help: "La camara funciona, pero falta cargar la deteccion de personas.",
    };
  }
  if (isLikelyInAppBrowser()) {
    return {
      title: "Abre en Safari/Chrome",
      message: "WhatsApp puede bloquear la camara. Abre este link en Safari o Chrome.",
      status: "Abrir Safari",
      action: "external",
      help: "Toca Abrir en Safari/Chrome. Si no abre, copia el link y pegalo en Safari.",
    };
  }
  if ((error && error.cameraReason === "timeout") || /timeout starting video source/i.test(message)) {
    return {
      title: "No arranco la camara",
      message: "La compu no pudo iniciar la camara seleccionada.",
      status: "Reintentar",
      action: "retry",
      help: "Cierra otras apps que usen camara. Si sigue igual, entra a Calibrar y prueba Auto o 640 x 480.",
    };
  }
  if (isPermissionError(error)) {
    return {
      title: "Permite la camara",
      message: "El navegador tiene bloqueado el permiso de camara para esta pagina.",
      status: "Permiso",
      action: isMobileDevice() ? "external" : "retry",
      help: "En iPhone toca el icono del sitio en la barra de Safari, permite Camara y vuelve a presionar Iniciar.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      title: "No encontre camara",
      message: "El navegador no ve una camara disponible.",
      status: "Sin camara",
      action: "retry",
      help: "Cierra otras apps que usen camara y vuelve a intentarlo.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      title: "Camara ocupada",
      message: "Otra app o pestaña esta usando la camara.",
      status: "Ocupada",
      action: "retry",
      help: "Cierra camara, videollamadas u otras pestañas y vuelve a iniciar.",
    };
  }
  return {
    title: "No pude abrir la camara",
    message: "Revisa el permiso de camara y vuelve a intentar.",
    status: "Sin camara",
    action: isMobileDevice() ? "external" : "retry",
    help: message || "Abre el link en Safari o Chrome y permite la camara.",
  };
}

function setCameraEmpty(title, message) {
  const titleEl = els.videoEmpty.querySelector("strong");
  const messageEl = els.videoEmpty.querySelector("span");
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
}

function resetCameraEmpty() {
  setCameraEmpty("Listo para contar", "Presiona INICIAR y permite la camara.");
  if (els.cameraFix) els.cameraFix.hidden = true;
  if (els.openExternalBrowser) {
    els.openExternalBrowser.dataset.action = "external";
    els.openExternalBrowser.textContent = "Abrir en Safari/Chrome";
    els.openExternalBrowser.href = externalBrowserUrl();
    els.openExternalBrowser.target = "_blank";
  }
}

function showCameraFix(info) {
  if (!els.cameraFix) return;
  els.cameraFix.hidden = false;
  if (els.openExternalBrowser) {
    const retry = info.action === "retry";
    els.openExternalBrowser.dataset.action = retry ? "retry" : "external";
    els.openExternalBrowser.textContent = retry ? "Reintentar camara" : "Abrir en Safari/Chrome";
    els.openExternalBrowser.href = retry ? "#" : externalBrowserUrl();
    els.openExternalBrowser.target = retry ? "" : "_blank";
  }
  setCameraHelpText(info.help);
}

function setCameraHelpText(text) {
  if (els.cameraHelpText) {
    els.cameraHelpText.textContent = text || "Abre este link en Safari o Chrome y permite la camara.";
  }
}

function appUrl() {
  return `${location.origin}${location.pathname}${location.search || ""}`;
}

function externalBrowserUrl() {
  const current = appUrl();
  if (/Android/i.test(navigator.userAgent || "") && location.protocol === "https:") {
    return `intent://${location.host}${location.pathname}${location.search || ""}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  return current;
}

async function loadModel() {
  if (state.model) return;
  if (!window.cocoSsd) {
    throw new Error("No cargo el modelo de deteccion. Revisa internet y vuelve a abrir el link.");
  }
  try {
    state.model = await window.cocoSsd.load({ base: "mobilenet_v2" });
  } catch (_error) {
    state.model = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
  }
}

async function loop() {
  if (!state.running) return;
  ensureCurrentDay();
  if (els.camera.videoWidth > 0) {
    const calibrationMode = state.activeView === "calibrate";
    const activeConfig = calibrationMode ? draftConfig() : state.config;
    const predictions = await state.model.detect(els.camera);
    const people = predictions
      .filter((item) => item.class === "person" && item.score >= DETECTION_THRESHOLD)
      .map((item) => ({
        box: {
          x: item.bbox[0],
          y: item.bbox[1],
          w: item.bbox[2],
          h: item.bbox[3],
        },
        score: item.score,
      }));
    const tracks = updateTracks(people, activeConfig);
    state.debugStats.detectedPersons = people.length;
    state.debugStats.activeTracks = tracks.length;
    if (calibrationMode) {
      updateCalibrationProbe(tracks);
    } else {
      updateCount(tracks, state.config);
    }
    renderDebugMetrics();
    logDebugCounts(people.length, tracks.length);
    drawOverlay(els.overlay, tracks, state.config);
    drawOverlay(els.calibrationOverlay, tracks, draftConfig(), { calibration: true });
    drawOverlay(els.helpOverlay, tracks, state.config);
    maybeSendFrameToLocalProcessor();
  }
  requestAnimationFrame(loop);
}

function updateTracks(detections, config = state.config) {
  const now = performance.now();
  const active = [];
  const candidates = [];
  const matchedTrackIds = new Set();
  const matchedDetectionIds = new Set();

  for (const [id, track] of state.tracks) {
    detections.forEach((detection, index) => {
      const center = bottomCenter(detection.box);
      const distance = Math.hypot(center.x - track.point.x, center.y - track.point.y);
      const overlap = boxIou(track.box, detection.box);
      const adaptiveDistance = Math.max(TRACK_MATCH_DISTANCE, boxDiagonal(track.box) * 0.45);
      if (distance <= adaptiveDistance || overlap >= 0.08) {
        candidates.push({ id, index, score: overlap * 1000 - distance });
      }
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  candidates.forEach((candidate) => {
    if (matchedTrackIds.has(candidate.id) || matchedDetectionIds.has(candidate.index)) return;
    const track = state.tracks.get(candidate.id);
    const detection = detections[candidate.index];
    if (!track || !detection) return;
    const point = bottomCenter(detection.box);
    if (!track.firstPoint) track.firstPoint = track.point;
    track.previousPoint = track.point;
    track.point = point;
    track.box = detection.box;
    track.score = detection.score;
    track.lastSeen = now;
    matchedTrackIds.add(candidate.id);
    matchedDetectionIds.add(candidate.index);
    active.push({ id: candidate.id, ...track });
  });

  for (const [id, track] of state.tracks) {
    if (!matchedTrackIds.has(id) && now - track.lastSeen > TRACK_TTL_MS) {
      state.tracks.delete(id);
    }
  }

  detections.forEach((detection, index) => {
    if (matchedDetectionIds.has(index)) return;
    const point = bottomCenter(detection.box);
    const id = state.nextTrackId++;
    const track = {
      firstPoint: point,
      point,
      previousPoint: null,
      box: detection.box,
      score: detection.score,
      phase: "new",
      counted: false,
      lastSeen: now,
    };
    state.tracks.set(id, track);
    active.push({ id, ...track });
  });

  return active.filter((track) => trackInCountingZone(track, config));
}

function updateCount(tracks, config = state.config) {
  tracks.forEach((track) => {
    const stored = state.tracks.get(track.id);
    if (!stored || stored.counted || !track.previousPoint) return;

    let countedThisTrack = false;
    orderedCrossings(track.previousPoint, track.point, config).forEach((crossing) => {
      if (countedThisTrack) return;
      console.debug(`Track ${track.id} crossed ${crossing}`);
      if (shouldCountLateEntry(stored, track, crossing, config)) {
        confirmTrackEntry(stored, track);
        countedThisTrack = true;
        return;
      }
      if (applyCrossing(stored, crossing)) {
        confirmTrackEntry(stored, track);
        countedThisTrack = true;
      }
    });

    if (!countedThisTrack && shouldCompleteEdgeEntry(stored, track, config)) {
      confirmTrackEntry(stored, track);
    }
  });
}

function confirmTrackEntry(stored, track) {
  stored.phase = "counted";
  stored.counted = true;
  registerEntry(track);
  console.debug(`Track ${track.id} ENTRY CONFIRMED`);
  saveState();
  renderAll();
  setStatus("Entrada");
}

function logDebugCounts(detectedPersons, activeTracks) {
  const now = performance.now();
  if (now - state.lastDebugLogAt < 1000) return;
  state.lastDebugLogAt = now;
  console.debug(`DETECTED persons: ${detectedPersons}`);
  console.debug(`ACTIVE tracks: ${activeTracks}`);
}

function registerEntry(track) {
  ensureCurrentDay();
  const now = new Date();
  const previous = state.events[state.events.length - 1];
  const parts = guayaquilParts(now);
  const event = {
    timestamp: guayaquilIso(now),
    timestampMs: now.getTime(),
    date: formatDate(guayaquilDateKey(now)),
    dateKey: guayaquilDateKey(now),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    camera: CAMERA_NAME,
    event: "ENTRY",
    track_id: track.id,
    age_group: track.ageGroup || "SIN_DETERMINAR",
    age_confidence: Number(track.ageConfidence || 0),
    total_count: state.events.length + 1,
    seconds_since_previous_entry: previous ? round((now.getTime() - previous.timestampMs) / 1000, 3) : null,
    hour_bucket: bucketLabel(now, TIME_BUCKET_MINUTES),
    minute_bucket: minuteBucketLabel(now),
    group_id: null,
    group_size: 1,
  };
  state.events.push(event);
  annotateGroups(state.events);
  state.count = state.events.length;
  state.debugStats.entriesConfirmed = state.count;
}

function ensureCurrentDay() {
  const key = guayaquilDateKey(new Date());
  if (key === todayKey) return;
  endSession();
  saveCurrentDay();
  todayKey = key;
  state.count = 0;
  state.realCount = 0;
  state.history = [];
  state.events = [];
  state.sessions = [];
  state.currentSessionId = null;
  state.tracks.clear();
  state.debugStats.entriesConfirmed = 0;
  if (state.running) startSession(false);
  saveState();
  renderAll();
}

function startSession(shouldSave = true) {
  if (state.currentSessionId) return;
  const now = new Date();
  const session = {
    id: state.sessions.length + 1,
    camera: CAMERA_NAME,
    start: guayaquilIso(now),
    startMs: now.getTime(),
    end: null,
    endMs: null,
  };
  state.sessions.push(session);
  state.currentSessionId = session.id;
  if (shouldSave) saveState();
}

function endSession(shouldSave = true) {
  if (!state.currentSessionId) return;
  const now = new Date();
  const session = state.sessions.find((item) => item.id === state.currentSessionId);
  if (session && !session.end) {
    session.end = guayaquilIso(now);
    session.endMs = now.getTime();
  }
  state.currentSessionId = null;
  if (shouldSave) saveState();
}

function saveCurrentDay() {
  state.days[todayKey] = {
    date: todayKey,
    count: state.count,
    realCount: state.realCount,
    events: state.events,
    sessions: state.sessions,
    summary: buildDailySummary(state.events, state.sessions),
  };
}

function buildDailySummary(events, sessions, now = new Date()) {
  annotateGroups(events);
  const bucketStarts = new Set();
  events.forEach((event) => bucketStarts.add(bucketInfo(new Date(event.timestampMs), TIME_BUCKET_MINUTES).startMs));
  sessions.forEach((session) => {
    if (!session.startMs) return;
    const endMs = session.endMs || now.getTime();
    let cursor = bucketInfo(new Date(session.startMs), TIME_BUCKET_MINUTES).startMs;
    const final = bucketInfo(new Date(endMs), TIME_BUCKET_MINUTES).startMs;
    while (cursor <= final) {
      bucketStarts.add(cursor);
      cursor += TIME_BUCKET_MINUTES * 60000;
    }
  });
  bucketStarts.add(bucketInfo(now, TIME_BUCKET_MINUTES).startMs);

  const rows = Array.from(bucketStarts).sort((a, b) => a - b).map((startMs) => {
    const endMs = startMs + TIME_BUCKET_MINUTES * 60000;
    const bucketEvents = events.filter((event) => event.timestampMs >= startMs && event.timestampMs < endMs);
    const ages = ageCounts(bucketEvents);
    const minutes = minuteCounts(bucketEvents);
    const coverageSeconds = coverageSecondsForPeriod(sessions, startMs, endMs, now.getTime());
    const coveragePercentage = round(Math.min(100, (coverageSeconds / (TIME_BUCKET_MINUTES * 60)) * 100), 1);
    const estimated = coverageSeconds > 0 && bucketEvents.length > 0
      ? round(bucketEvents.length * ((TIME_BUCKET_MINUTES * 60) / coverageSeconds), 1)
      : null;
    return {
      hour: bucketLabelFromStart(startMs, TIME_BUCKET_MINUTES),
      count: bucketEvents.length,
      ...ages,
      age_percentages: agePercentages(ages, bucketEvents.length),
      avg_seconds_between_entries: averageInterval(bucketEvents),
      peak_people_per_minute: Math.max(0, ...Object.values(minutes)),
      peak_minute: peakMinute(minutes),
      coverage_seconds: round(coverageSeconds, 3),
      coverage_percentage: coveragePercentage,
      actual_count: bucketEvents.length,
      estimated_full_hour_count: estimated,
      ...groupStats(bucketEvents),
      variation_percent: null,
    };
  });

  rows.forEach((row, index) => {
    if (index === 0) return;
    const previous = rows[index - 1];
    if (previous.count > 0) {
      row.variation_percent = round(((row.count - previous.count) / previous.count) * 100, 1);
    }
  });

  const recent1 = eventsSince(events, now, 1);
  const recent5 = eventsSince(events, now, LIVE_RATE_WINDOW_MINUTES);
  const recent15 = eventsSince(events, now, 15);
  const recent30 = eventsSince(events, now, 30);
  const rate = recent5.length / LIVE_RATE_WINDOW_MINUTES;
  const currentBucket = bucketLabel(now, TIME_BUCKET_MINUTES);
  const currentRow = rows.find((row) => row.hour === currentBucket) || null;
  const ranked = [...rows].sort((a, b) => b.count - a.count);
  const covered = rows.filter((row) => row.coverage_seconds > 0);

  return {
    timezone: REPORT_TIMEZONE,
    total_today: events.length,
    current_bucket: currentBucket,
    current_bucket_count: currentRow ? currentRow.count : 0,
    current_bucket_age_counts: currentRow ? ageCountsFromRow(currentRow) : emptyAgeCounts(),
    last_1_minute: recent1.length,
    last_5_minutes: recent5.length,
    last_15_minutes: recent15.length,
    last_30_minutes: recent30.length,
    live_rate_per_minute: round(rate, 2),
    projected_people_per_hour: round(rate * 60, 1),
    peak_hour: ranked[0] || null,
    second_peak_hour: ranked[1] || null,
    lowest_hour: covered.length ? [...covered].sort((a, b) => a.count - b.count)[0] : null,
    average_people_per_hour: covered.length ? round(covered.reduce((sum, row) => sum + row.count, 0) / covered.length, 1) : 0,
    hourly_summary: rows,
    ...groupStats(events),
  };
}

function ageCounts(events) {
  const counts = emptyAgeCounts();
  events.forEach((event) => {
    counts[ageField(event.age_group)] += 1;
  });
  return counts;
}

function emptyAgeCounts() {
  return { children: 0, adolescents: 0, youth: 0, adults: 0, older_adults: 0, undetermined: 0 };
}

function ageCountsFromRow(row) {
  return {
    children: row.children,
    adolescents: row.adolescents,
    youth: row.youth,
    adults: row.adults,
    older_adults: row.older_adults,
    undetermined: row.undetermined,
  };
}

function ageField(value) {
  const key = String(value || "SIN_DETERMINAR").toUpperCase().replaceAll(" ", "_");
  const mapping = {
    NINO: "children",
    "NIÑO": "children",
    CHILDREN: "children",
    ADOLESCENTE: "adolescents",
    TEEN: "adolescents",
    JOVEN: "youth",
    "JÓVEN": "youth",
    YOUTH: "youth",
    ADULTO: "adults",
    ADULT: "adults",
    ADULTO_MAYOR: "older_adults",
    ADULTOS_MAYORES: "older_adults",
    OLDER_ADULT: "older_adults",
  };
  return mapping[key] || "undetermined";
}

function agePercentages(counts, total) {
  const percentages = {};
  Object.entries(counts).forEach(([key, value]) => {
    percentages[key] = total > 0 ? round((value / total) * 100, 1) : 0;
  });
  return percentages;
}

function minuteCounts(events) {
  return events.reduce((counts, event) => {
    const key = event.minute_bucket || minuteBucketLabel(new Date(event.timestampMs));
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function peakMinute(counts) {
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function averageInterval(events) {
  const intervals = events
    .map((event) => event.seconds_since_previous_entry)
    .filter((value) => Number.isFinite(value));
  if (!intervals.length) return null;
  return round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length, 3);
}

function eventsSince(events, now, minutes) {
  const startMs = now.getTime() - minutes * 60000;
  return events.filter((event) => event.timestampMs >= startMs);
}

function coverageSecondsForPeriod(sessions, startMs, endMs, nowMs) {
  return sessions.reduce((total, session) => {
    if (!session.startMs) return total;
    const sessionEndMs = session.endMs || nowMs;
    const overlapStart = Math.max(startMs, session.startMs);
    const overlapEnd = Math.min(endMs, sessionEndMs);
    return overlapEnd > overlapStart ? total + (overlapEnd - overlapStart) / 1000 : total;
  }, 0);
}

function annotateGroups(events) {
  const ordered = [...events].sort((a, b) => a.timestampMs - b.timestampMs);
  let group = [];
  let groupStart = 0;
  let groupId = 0;

  const flush = () => {
    if (!group.length) return;
    groupId += 1;
    group.forEach((event) => {
      event.group_id = groupId;
      event.group_size = group.length;
    });
    group = [];
  };

  ordered.forEach((event) => {
    if (!group.length) {
      group = [event];
      groupStart = event.timestampMs;
      return;
    }
    if ((event.timestampMs - groupStart) / 1000 <= GROUP_WINDOW_SECONDS) {
      group.push(event);
    } else {
      flush();
      group = [event];
      groupStart = event.timestampMs;
    }
  });
  flush();
}

function groupStats(events) {
  const groups = new Map();
  events.forEach((event) => {
    if (!event.group_id) return;
    groups.set(event.group_id, event.group_size || 1);
  });
  const sizes = Array.from(groups.values());
  if (!sizes.length) return { groups_count: 0, average_group_size: 0, max_group_size: 0 };
  return {
    groups_count: sizes.length,
    average_group_size: round(sizes.reduce((sum, value) => sum + value, 0) / sizes.length, 2),
    max_group_size: Math.max(...sizes),
  };
}

function orderedCrossings(previous, current, config = state.config) {
  const crossed = [];
  if (crossedLine(previous, current, config.lineA, config)) {
    crossed.push({ name: "A", axis: lineAxisMid(config.lineA, config) });
  }
  if (crossedLine(previous, current, config.lineB, config)) {
    crossed.push({ name: "B", axis: lineAxisMid(config.lineB, config) });
  }
  const delta = axisValue(current, config) - axisValue(previous, config);
  crossed.sort((left, right) => (delta < 0 ? right.axis - left.axis : left.axis - right.axis));
  return crossed.map((item) => item.name);
}

function applyCrossing(track, crossing) {
  if (track.counted || track.phase === "counted" || track.phase === "exit") return false;

  const crossingPhase = crossing === "A" ? "crossedA" : "crossedB";

  if (track.phase === "new") {
    track.phase = crossingPhase;
    return false;
  }

  if (track.phase === crossingPhase) {
    track.phase = "new";
    return false;
  }

  if (track.phase === "crossedA" && crossing === "B") {
    track.phase = "counted";
    track.counted = true;
    return true;
  }

  if (track.phase === "crossedB" && crossing === "A") {
    track.phase = "exit";
    return false;
  }

  return false;
}

function shouldCountLateEntry(stored, track, crossing, config = state.config) {
  if (stored.counted || stored.phase !== "new" || crossing !== "B") return false;
  if (!track.previousPoint || !track.firstPoint) return false;
  return crossedDestinationInEntryDirection(track.previousPoint, track.point, config)
    && pointStartedBeforeDestination(track.firstPoint, config)
    && pointInRoiBounds(track.point, config.roi, ROI_EDGE_TOLERANCE);
}

function shouldCompleteEdgeEntry(stored, track, config = state.config) {
  if (stored.counted || stored.phase !== "crossedA" || !track.previousPoint) return false;
  if (!movingInEntryDirection(track.previousPoint, track.point, config)) return false;
  if (crossedDestinationInEntryDirection(track.previousPoint, track.point, config)) return true;
  return passedDestinationGate(track.point, config, 0.04) && boxTouchesFrameEdge(track.box);
}

function crossedDestinationInEntryDirection(previous, current, config = state.config) {
  return movingInEntryDirection(previous, current, config)
    && crossedLineAxis(previous, current, config.lineB, config);
}

function crossedLineAxis(previous, current, line, config = state.config) {
  if (!previous || !current) return false;
  const gate = lineAxisPixel(line, config);
  const previousAxis = pointAxisPixel(previous, config);
  const currentAxis = pointAxisPixel(current, config);
  return (previousAxis < gate && currentAxis >= gate) || (previousAxis > gate && currentAxis <= gate);
}

function movingInEntryDirection(previous, current, config = state.config) {
  const delta = pointAxisPixel(current, config) - pointAxisPixel(previous, config);
  const minimum = Math.max(1, axisPixelSize(config) * 0.002);
  return delta * entryDirectionSign(config) >= minimum;
}

function pointStartedBeforeDestination(point, config = state.config) {
  const gate = lineAxisPixel(config.lineB, config);
  const axis = pointAxisPixel(point, config);
  return (axis - gate) * entryDirectionSign(config) < 0;
}

function passedDestinationGate(point, config = state.config, tolerance = 0) {
  const gate = lineAxisPixel(config.lineB, config);
  const axis = pointAxisPixel(point, config);
  const tolerancePx = axisPixelSize(config) * tolerance;
  return (axis - gate) * entryDirectionSign(config) >= -tolerancePx;
}

function entryDirectionSign(config = state.config) {
  if (config.lineOrientation === "horizontal") {
    return config.entryDirection === "BOTTOM_TO_TOP" ? -1 : 1;
  }
  return config.entryDirection === "RIGHT_TO_LEFT" ? -1 : 1;
}

function pointAxisPixel(point, config = state.config) {
  return config.lineOrientation === "horizontal" ? point.y : point.x;
}

function lineAxisPixel(line, config = state.config) {
  return lineAxisMid(line, config) * axisPixelSize(config);
}

function axisPixelSize(config = state.config) {
  return config.lineOrientation === "horizontal"
    ? (els.camera.videoHeight || els.calibrationOverlay.height || 1)
    : (els.camera.videoWidth || els.calibrationOverlay.width || 1);
}

function boxTouchesFrameEdge(box) {
  const width = els.camera.videoWidth || 1;
  const height = els.camera.videoHeight || 1;
  const marginX = width * 0.035;
  const marginY = height * 0.055;
  return box.x <= marginX
    || box.x + box.w >= width - marginX
    || box.y <= marginY
    || box.y + box.h >= height - marginY;
}

function lineAxisMid(line, config = state.config) {
  const axis = config.lineOrientation === "horizontal" ? "y" : "x";
  return (line[0][axis] + line[1][axis]) / 2;
}

function axisValue(point, config = state.config) {
  return config.lineOrientation === "horizontal" ? point.y : point.x;
}

function lineAt(axisPosition, config = draftConfig()) {
  const bounds = roiBounds(config.roi);
  const position = clamp(axisPosition);
  if (config.lineOrientation === "horizontal") {
    return [{ x: bounds.left, y: position }, { x: bounds.right, y: position }];
  }
  return [{ x: position, y: bounds.top }, { x: position, y: bounds.bottom }];
}

function roiBounds(roi) {
  const xs = roi.map((point) => point.x);
  const ys = roi.map((point) => point.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function isLegacyInsetRoi(roi) {
  if (!isRoi(roi)) return false;
  const current = roiBounds(roi);
  const legacy = roiBounds(LEGACY_INSET_ROI);
  return Math.abs(current.left - legacy.left) <= 0.025
    && Math.abs(current.right - legacy.right) <= 0.025
    && Math.abs(current.top - legacy.top) <= 0.025
    && Math.abs(current.bottom - legacy.bottom) <= 0.025;
}

function isLine(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function isRoi(value) {
  return Array.isArray(value)
    && value.length >= 3
    && value.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function normalizeOrientation(value) {
  return value === "horizontal" ? "horizontal" : "vertical";
}

function allowedDirections(orientation) {
  return DIRECTIONS_BY_ORIENTATION[normalizeOrientation(orientation)];
}

function normalizeDirection(value, orientation) {
  const options = allowedDirections(orientation);
  return options.includes(value) ? value : options[0];
}

function defaultLinePositions(orientation, direction) {
  const normalizedOrientation = normalizeOrientation(orientation);
  const normalizedDirection = normalizeDirection(direction, normalizedOrientation);
  if (normalizedOrientation === "horizontal") {
    return normalizedDirection === "TOP_TO_BOTTOM" ? [0.35, 0.65] : [0.65, 0.35];
  }
  return normalizedDirection === "RIGHT_TO_LEFT" ? [0.65, 0.35] : [0.35, 0.65];
}

function inferLineOrientation(config) {
  if (config.lineOrientation === "horizontal" || config.lineOrientation === "vertical") return config.lineOrientation;
  if (isLine(config.lineA) && Math.abs(config.lineA[0].y - config.lineA[1].y) < Math.abs(config.lineA[0].x - config.lineA[1].x)) {
    return "horizontal";
  }
  return "vertical";
}

function updateCalibrationMetadata(config) {
  config.lineOrientation = normalizeOrientation(config.lineOrientation);
  config.entryDirection = normalizeDirection(config.entryDirection, config.lineOrientation);
  config.minLineSeparation = Number.isFinite(config.minLineSeparation) ? clamp(config.minLineSeparation) : MIN_LINE_SEPARATION;
  syncLineSpansToRoi(config);
  config.lineAPosition = round(linePosition(config.lineA, config), 4);
  config.lineBPosition = round(linePosition(config.lineB, config), 4);
  config.lineSeparation = round(Math.abs(config.lineAPosition - config.lineBPosition), 4);
  config.calibrationId = config.calibrationId || makeId("cal");
  config.sessionId = config.sessionId || null;
  config.deviceId = config.deviceId || null;
  config.zoneId = config.zoneId || null;
  return config;
}

function makeId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function linePosition(line, config = state.config) {
  return clamp(lineAxisMid(line, config));
}

function setLinePositions(config, aPosition, bPosition) {
  config.lineA = lineAt(aPosition, config);
  config.lineB = lineAt(bPosition, config);
  updateCalibrationMetadata(config);
  return config;
}

function syncLineSpansToRoi(config) {
  if (!isRoi(config.roi)) config.roi = cloneConfig(DEFAULT_CONFIG.roi);
  if (!isLine(config.lineA) || !isLine(config.lineB)) {
    const [aPosition, bPosition] = defaultLinePositions(config.lineOrientation, config.entryDirection);
    config.lineA = lineAt(aPosition, config);
    config.lineB = lineAt(bPosition, config);
    return;
  }
  const aPosition = linePosition(config.lineA, config);
  const bPosition = linePosition(config.lineB, config);
  config.lineA = lineAt(aPosition, config);
  config.lineB = lineAt(bPosition, config);
}

function directionPositionsValid(aPosition, bPosition, config) {
  const orientation = normalizeOrientation(config.lineOrientation);
  const direction = normalizeDirection(config.entryDirection, orientation);
  if (orientation === "vertical") {
    return direction === "RIGHT_TO_LEFT" ? aPosition > bPosition : aPosition < bPosition;
  }
  return direction === "TOP_TO_BOTTOM" ? aPosition < bPosition : aPosition > bPosition;
}

function alignLinesToDirection(config) {
  const aPosition = linePosition(config.lineA, config);
  const bPosition = linePosition(config.lineB, config);
  if (directionPositionsValid(aPosition, bPosition, config)) return config;

  if (directionPositionsValid(bPosition, aPosition, config)) {
    [config.lineA, config.lineB] = [config.lineB, config.lineA];
  } else {
    const [defaultA, defaultB] = defaultLinePositions(config.lineOrientation, config.entryDirection);
    setLinePositions(config, defaultA, defaultB);
  }
  updateCalibrationMetadata(config);
  return config;
}

function normalizeConfig(config, options = {}) {
  const shouldAlign = options.align !== false;
  const normalized = cloneConfig(DEFAULT_CONFIG);
  if (!config || typeof config !== "object") return normalized;

  normalized.lineOrientation = normalizeOrientation(inferLineOrientation(config));
  normalized.entryDirection = normalizeDirection(config.entryDirection, normalized.lineOrientation);

  if (isRoi(config.roi)) {
    normalized.roi = isLegacyInsetRoi(config.roi) ? cloneConfig(DEFAULT_CONFIG.roi) : config.roi;
  }

  if (isLine(config.lineA)) normalized.lineA = config.lineA;
  if (isLine(config.lineB)) normalized.lineB = config.lineB;
  if (Number.isFinite(config.minLineSeparation)) normalized.minLineSeparation = config.minLineSeparation;
  if (config.calibrationId) normalized.calibrationId = config.calibrationId;
  if (config.sessionId) normalized.sessionId = config.sessionId;
  if (config.deviceId) normalized.deviceId = config.deviceId;
  if (config.zoneId) normalized.zoneId = config.zoneId;
  CAMERA_CONFIG_FIELDS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      normalized[key] = normalizeCameraField(key, config[key]);
    }
  });

  updateCalibrationMetadata(normalized);
  if (shouldAlign) {
    alignLinesToDirection(normalized);
  }
  return normalized;
}

function ensureCalibrationDraft() {
  if (!state.calibrationDraft) {
    state.calibrationDraft = cloneConfig(state.config);
  }
  state.calibrationDraft = normalizeConfig(state.calibrationDraft, { align: false });
  return state.calibrationDraft;
}

function draftConfig() {
  return state.calibrationDraft || ensureCalibrationDraft();
}

function setCalibrationOrientation(orientation) {
  const next = cloneConfig(draftConfig());
  next.lineOrientation = normalizeOrientation(orientation);
  next.entryDirection = normalizeDirection(next.entryDirection, next.lineOrientation);
  const [aPosition, bPosition] = defaultLinePositions(next.lineOrientation, next.entryDirection);
  setLinePositions(next, aPosition, bPosition);
  state.calibrationDraft = next;
  setCalibrationStatus("Orientacion lista. Presiona Guardar.", "warning");
  renderAll();
}

function setCalibrationDirection(direction) {
  const next = cloneConfig(draftConfig());
  next.entryDirection = normalizeDirection(direction, next.lineOrientation);
  const [aPosition, bPosition] = defaultLinePositions(next.lineOrientation, next.entryDirection);
  setLinePositions(next, aPosition, bPosition);
  state.calibrationDraft = next;
  setCalibrationStatus("Direccion lista. Presiona Guardar.", "warning");
  renderAll();
}

function validateCalibration(config) {
  if (!isRoi(config.roi)) {
    return { ok: false, kind: "error", message: "Zona invalida." };
  }
  if (!isLine(config.lineA) || !isLine(config.lineB)) {
    return { ok: false, kind: "error", message: "Lineas invalidas." };
  }
  updateCalibrationMetadata(config);
  const bounds = roiBounds(config.roi);
  if (bounds.right - bounds.left < 0.05 || bounds.bottom - bounds.top < 0.05) {
    return { ok: false, kind: "error", message: "Zona demasiado pequena." };
  }
  const separation = Math.abs(config.lineAPosition - config.lineBPosition);
  const minimum = Math.max(0.01, Number(config.minLineSeparation || MIN_LINE_SEPARATION));
  if (separation <= 0.001) {
    return { ok: false, kind: "error", message: "A y B estan encima. Separalas." };
  }
  if (separation < minimum) {
    return {
      ok: false,
      kind: "warning",
      message: `Lineas muy cerca: ${(separation * 100).toFixed(1)}%. Minimo ${(minimum * 100).toFixed(0)}%.`,
    };
  }
  if (!directionPositionsValid(config.lineAPosition, config.lineBPosition, config)) {
    return { ok: false, kind: "warning", message: "El orden A/B no coincide con la direccion." };
  }
  return { ok: true, kind: "ok", message: calibrationDistanceLabel(config) };
}

function calibrationDistanceLabel(config) {
  const axisPixels = config.lineOrientation === "horizontal"
    ? els.camera.videoHeight || els.calibrationOverlay.height || 1
    : els.camera.videoWidth || els.calibrationOverlay.width || 1;
  const pixels = Math.round(Math.abs(config.lineAPosition - config.lineBPosition) * axisPixels);
  return `Separacion: ${pixels}px · ${(Math.abs(config.lineAPosition - config.lineBPosition) * 100).toFixed(1)}%`;
}

function refreshCalibrationStatus() {
  const validation = validateCalibration(draftConfig());
  setCalibrationStatus(validation.message, validation.kind);
}

function setCalibrationStatus(message, kind = "ok") {
  state.calibrationStatus = message;
  state.calibrationStatusKind = kind;
  if (!els.calibrationStatus) return;
  els.calibrationStatus.textContent = message;
  els.calibrationStatus.classList.toggle("warning", kind === "warning");
  els.calibrationStatus.classList.toggle("error", kind === "error");
}

function renderCalibrationControls() {
  const config = draftConfig();
  document.querySelectorAll("[data-orientation]").forEach((button) => {
    button.classList.toggle("active", button.dataset.orientation === config.lineOrientation);
  });
  document.querySelectorAll("[data-direction]").forEach((button) => {
    const visible = allowedDirections(config.lineOrientation).includes(button.dataset.direction);
    button.hidden = !visible;
    button.classList.toggle("active", button.dataset.direction === config.entryDirection);
  });
  document.querySelectorAll(".tool").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.activeTool);
  });
  if (els.testCalibration) {
    els.testCalibration.classList.toggle("active", state.calibrationProbe.active);
  }
  setCalibrationStatus(state.calibrationStatus || calibrationDistanceLabel(config), state.calibrationStatusKind || "ok");
}

function renderCameraControls() {
  const config = activeCameraConfig();
  setSelectOptions(els.cameraResolution, cameraResolutionOptions(), config.cameraResolution);
  setSelectOptions(els.cameraAspectRatio, [
    { value: "auto", label: "Auto" },
    { value: "16:9", label: "16:9" },
    { value: "4:3", label: "4:3" },
  ], config.cameraAspectRatio);
  setSelectOptions(els.cameraFps, [
    { value: "auto", label: "Auto" },
    { value: "15", label: "15 FPS" },
    { value: "20", label: "20 FPS" },
    { value: "25", label: "25 FPS" },
    { value: "30", label: "30 FPS" },
  ], config.cameraFps);
  setSelectOptions(els.cameraFitMode, [
    { value: "fit", label: "Mostrar todo / FIT" },
    { value: "cover", label: "Llenar / COVER" },
  ], config.cameraFitMode);
  setSelectOptions(els.cameraDevice, cameraDeviceOptions(), config.cameraDeviceId);

  setRangeValue(els.digitalScale, els.digitalScaleValue, config.digitalScale, (value) => `${Math.round(value * 100)}%`);
  setRangeValue(els.digitalOffsetX, els.digitalOffsetXValue, config.digitalOffsetX, (value) => `${Math.round(value)}`);
  setRangeValue(els.digitalOffsetY, els.digitalOffsetYValue, config.digitalOffsetY, (value) => `${Math.round(value)}`);
  renderZoomControl(config);

  const requested = requestedCameraLabel(config);
  const real = realCameraLabel();
  if (els.requestedResolution) els.requestedResolution.textContent = requested;
  if (els.realResolution) els.realResolution.textContent = real;
  if (els.cameraRequestedValue) els.cameraRequestedValue.textContent = requested;
  if (els.cameraRealValue) els.cameraRealValue.textContent = `Real: ${real}`;
}

function setSelectOptions(select, options, value) {
  if (!select) return;
  const hash = JSON.stringify(options);
  if (select.dataset.optionsHash !== hash) {
    select.innerHTML = options.map((option) => (
      `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
    )).join("");
    select.dataset.optionsHash = hash;
  }
  select.value = value;
  if (!select.value && options.length) {
    select.value = options[0].value;
  }
}

function cameraResolutionOptions() {
  const options = [...CAMERA_RESOLUTIONS];
  const settings = state.cameraSettings || {};
  const current = settings.width && settings.height ? `${settings.width}x${settings.height}` : "";
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: `${settings.width} x ${settings.height} actual` });
  }
  return options;
}

function cameraDeviceOptions() {
  const options = [{ value: "", label: "Auto" }];
  state.cameraDevices.forEach((device, index) => {
    if (!device.deviceId) return;
    const label = device.label || `Camara ${index + 1}`;
    const suffix = deviceWideScore(device) >= 100 ? " (gran angular)" : "";
    options.push({ value: device.deviceId, label: `${label}${suffix}` });
  });
  return options;
}

function setRangeValue(input, output, value, formatter) {
  if (!input) return;
  input.value = String(value);
  if (output) output.textContent = formatter ? formatter(Number(value)) : String(value);
}

function renderZoomControl(config) {
  if (!els.cameraZoom) return;
  const caps = zoomCapability();
  if (!caps) {
    els.cameraZoom.disabled = true;
    els.cameraZoom.min = "1";
    els.cameraZoom.max = "1";
    els.cameraZoom.step = "0.1";
    els.cameraZoom.value = "1";
    if (els.cameraZoomValue) els.cameraZoomValue.textContent = "No disponible";
    if (els.cameraZoomStatus) {
      els.cameraZoomStatus.textContent = state.stream
        ? "Esta camara no permite controlar zoom directamente."
        : "Abre la camara para leer capacidades reales.";
    }
    return;
  }

  const value = Number.isFinite(Number(config.cameraZoom))
    ? clampNumber(Number(config.cameraZoom), caps.min, caps.max, caps.min)
    : Number(state.cameraSettings.zoom || caps.min);
  els.cameraZoom.disabled = false;
  els.cameraZoom.min = String(caps.min);
  els.cameraZoom.max = String(caps.max);
  els.cameraZoom.step = String(caps.step);
  els.cameraZoom.value = String(value);
  if (els.cameraZoomValue) els.cameraZoomValue.textContent = `${round(value, 2)}x`;
  if (els.cameraZoomStatus) {
    els.cameraZoomStatus.textContent = `Zoom real disponible: ${caps.min}x a ${caps.max}x`;
  }
}

function requestedCameraLabel(config) {
  const resolution = config.cameraResolution === "auto" ? "Auto" : config.cameraResolution.replace("x", " x ");
  const fps = config.cameraFps === "auto" ? "FPS auto" : `${config.cameraFps} FPS`;
  const ratio = config.cameraAspectRatio === "auto" ? "Auto" : config.cameraAspectRatio;
  return `${resolution} · ${ratio} · ${fps}`;
}

function realCameraLabel() {
  const settings = state.cameraSettings || {};
  if (!settings.width || !settings.height) return "--";
  const fps = settings.frameRate ? ` · ${round(settings.frameRate, 1)} FPS` : "";
  return `${settings.width} x ${settings.height}${fps}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function updateCalibrationProbe(tracks) {
  if (!state.calibrationProbe.active) return;
  const config = draftConfig();
  let probeCount = 0;
  tracks.forEach((track) => {
    const memory = state.calibrationProbe.tracks.get(track.id) || { phase: "new", counted: false };
    if (track.previousPoint) {
      orderedCrossings(track.previousPoint, track.point, config).forEach((crossing) => {
        if (applyCrossing(memory, crossing)) {
          probeCount += 1;
          state.calibrationProbe.events.push({ id: track.id, timestamp: Date.now() });
        }
      });
    }
    state.calibrationProbe.tracks.set(track.id, memory);
  });
  if (probeCount > 0) {
    setCalibrationStatus(`Prueba: +${probeCount} entrada. Oficial no cambia.`, "ok");
  }
}

function drawOverlay(canvas, tracks, config = state.config, options = {}) {
  const video = els.camera.videoWidth ? els.camera : null;
  if (!video) return;

  resizeCanvas(canvas, video.videoWidth, video.videoHeight);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoi(ctx, config.roi, canvas);
  drawLine(ctx, config.lineA, canvas, "#15f070", "A", config);
  drawLine(ctx, config.lineB, canvas, "#f7bd31", "B", config);
  if (options.calibration) {
    drawCalibrationGuides(ctx, canvas, config);
  }

  tracks.forEach((track) => {
    ctx.strokeStyle = "#15f070";
    ctx.lineWidth = 3;
    ctx.strokeRect(track.box.x, track.box.y, track.box.w, track.box.h);
    ctx.fillStyle = "rgba(1, 10, 5, 0.86)";
    ctx.fillRect(track.box.x, Math.max(0, track.box.y - 24), 72, 22);
    ctx.fillStyle = "#15f070";
    ctx.font = "16px system-ui";
    ctx.fillText(`ID ${track.id}`, track.box.x + 7, Math.max(17, track.box.y - 7));
    ctx.beginPath();
    ctx.arc(track.point.x, track.point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawCalibration() {
  drawOverlay(els.calibrationOverlay, [], draftConfig(), { calibration: true });
}

function drawLine(ctx, line, canvas, color, label) {
  const [a, b] = line.map((point) => toPx(point, canvas));
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.fillRect(a.x - 5, a.y - 5, 10, 10);
  ctx.fillRect(b.x - 5, b.y - 5, 10, 10);
  ctx.font = "bold 16px system-ui";
  ctx.fillText(label, a.x + 8, Math.max(18, a.y - 8));
}

function drawCalibrationGuides(ctx, canvas, config) {
  const a = lineCenterPx(config.lineA, canvas);
  const b = lineCenterPx(config.lineB, canvas);
  ctx.save();
  ctx.strokeStyle = "rgba(108, 231, 255, 0.9)";
  ctx.fillStyle = "rgba(108, 231, 255, 0.95)";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  drawArrow(ctx, a, b);
  ctx.font = "bold 14px system-ui";
  ctx.fillText("ORIGEN", clampPx(a.x - 34, canvas.width - 70), clampPx(a.y - 18, canvas.height - 18));
  ctx.fillText("DESTINO", clampPx(b.x - 38, canvas.width - 76), clampPx(b.y + 28, canvas.height - 14));
  ctx.fillStyle = "rgba(1, 8, 5, 0.72)";
  ctx.fillRect(10, 10, 210, 28);
  ctx.fillStyle = "#eafff1";
  ctx.fillText("Entrada: A -> B", 22, 30);
  ctx.restore();
}

function lineCenterPx(line, canvas) {
  const [a, b] = line.map((point) => toPx(point, canvas));
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function drawArrow(ctx, start, end) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = 16;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function clampPx(value, max) {
  return Math.max(10, Math.min(max, value));
}

function drawRoi(ctx, roi, canvas) {
  const points = roi.map((point) => toPx(point, canvas));
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function addCalibrationPointerEvents() {
  const canvas = els.calibrationOverlay;
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Some mobile browsers reject pointer capture for synthetic or interrupted touches.
      }
    }
    const point = pointerToNorm(event, canvas);
    state.dragging = { start: point, current: point, pointerId: event.pointerId };
    applyDragGeometry();
    drawCalibration();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    event.preventDefault();
    state.dragging.current = pointerToNorm(event, canvas);
    applyDragGeometry();
    drawCalibration();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!state.dragging) return;
    event.preventDefault();
    applyDragGeometry();
    state.dragging = null;
    refreshCalibrationStatus();
    drawCalibration();
  });
  canvas.addEventListener("pointercancel", () => {
    state.dragging = null;
    drawCalibration();
  });
}

function applyDragGeometry() {
  const { start, current } = state.dragging;
  const config = draftConfig();
  if (state.activeTool === "lineA") {
    config.lineA = lineAt(config.lineOrientation === "horizontal" ? current.y : current.x, config);
  } else if (state.activeTool === "lineB") {
    config.lineB = lineAt(config.lineOrientation === "horizontal" ? current.y : current.x, config);
  } else {
    const left = Math.min(start.x, current.x);
    const right = Math.max(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const bottom = Math.max(start.y, current.y);
    if (right - left < 0.02 || bottom - top < 0.02) {
      setCalibrationStatus("Zona demasiado pequena.", "warning");
      return;
    }
    config.roi = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    syncLineSpansToRoi(config);
  }
  updateCalibrationMetadata(config);
  state.calibrationDraft = config;
  const validation = validateCalibration(config);
  setCalibrationStatus(validation.message, validation.kind);
}

function setView(view) {
  state.activeView = view;
  if (view === "calibrate") {
    ensureCalibrationDraft();
    state.tracks.clear();
    refreshCalibrationStatus();
  }
  document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item.id === `view-${view}`));
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const titles = { count: "Conteo", calibrate: "Calibrador", history: "Historial", help: "Primeros pasos" };
  els.viewTitle.textContent = titles[view] || "Conteo";
  applyCameraView(activeCameraConfig());
  renderAll();
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function renderAll() {
  state.count = state.events.length;
  const summary = buildDailySummary(state.events, state.sessions);
  applyCameraView(activeCameraConfig());
  els.countValue.textContent = state.count;
  els.todayLabel.textContent = formatDate(todayKey);
  els.historyTotal.textContent = state.count;
  els.historyDate.textContent = formatDate(todayKey);
  els.realCount.value = state.realCount;
  renderHistory(summary);
  renderDebugMetrics(summary);
  renderLiveSummary(summary);
  renderCalibrationControls();
  renderCameraControls();
  drawCalibration();
}

function renderDebugMetrics(summary = buildDailySummary(state.events, state.sessions)) {
  els.detectedCount.textContent = state.debugStats.detectedPersons;
  els.activeTrackCount.textContent = state.debugStats.activeTracks;
  state.debugStats.entriesConfirmed = state.count;
  state.debugStats.last1Minute = summary.last_1_minute;
  state.debugStats.last5Minutes = summary.last_5_minutes;
  state.debugStats.liveRatePerMinute = summary.live_rate_per_minute;
  state.debugStats.projectedPeoplePerHour = summary.projected_people_per_hour;
  state.debugStats.currentBucket = summary.current_bucket;
  if (state.realCount > 0) {
    const accuracy = Math.min(999.9, (state.count / state.realCount) * 100);
    els.accuracyValue.textContent = `${accuracy.toFixed(1)}%`;
  } else {
    els.accuracyValue.textContent = "--";
  }
}

function renderLiveSummary(summary) {
  els.currentBucketLabel.textContent = summary.current_bucket;
  els.currentBucketCount.textContent = `${summary.current_bucket_count} ingresos`;
  els.liveRateValue.textContent = `${summary.live_rate_per_minute}/min`;
  els.hourProjectionValue.textContent = `Proyección ${summary.projected_people_per_hour}/hora`;
  els.last15Value.textContent = summary.last_15_minutes;
  els.last30Value.textContent = `Últimos 30 min: ${summary.last_30_minutes}`;
  els.maxGroupValue.textContent = summary.max_group_size;
  els.avgGroupValue.textContent = `Promedio ${summary.average_group_size}`;
  els.peakHourLabel.textContent = summary.peak_hour
    ? `Hora pico: ${summary.peak_hour.hour} · ${summary.peak_hour.count}`
    : "Hora pico: --";
  els.averageHourLabel.textContent = `Promedio: ${summary.average_people_per_hour}/hora`;
}

function renderHistory(summary = buildDailySummary(state.events, state.sessions)) {
  const rows = summary.hourly_summary.filter((item) => item.count > 0 || item.coverage_seconds > 0).reverse();
  els.historyList.innerHTML = rows.length
    ? rows.map((item) => {
      const variation = item.variation_percent === null ? "" : ` · ${item.variation_percent > 0 ? "+" : ""}${item.variation_percent}%`;
      const estimate = item.estimated_full_hour_count === null ? "" : ` · Est. ${item.estimated_full_hour_count}`;
      return `<div class="history-row"><span>${item.hour}<br><small>Cobertura ${item.coverage_percentage}%${variation}${estimate}</small></span><strong>${item.count}</strong></div>`;
    }).join("")
    : '<div class="history-row"><span>Sin entradas todavia<br><small>La camara aun no registra ingresos.</small></span><strong>0</strong></div>';
}

function loadState() {
  const saved = JSON.parse(localStorage.getItem("afluencia-counter") || "{}");
  state.days = saved.days && typeof saved.days === "object" ? saved.days : {};
  if (saved.date && saved.date !== todayKey && !state.days[saved.date]) {
    state.days[saved.date] = {
      date: saved.date,
      count: Number(saved.count || 0),
      realCount: Number(saved.realCount || 0),
      events: Array.isArray(saved.events) ? saved.events : [],
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      summary: null,
    };
  }

  const today = state.days[todayKey] || (saved.date === todayKey ? saved : null);
  if (today) {
    state.events = normalizeEvents(today.events || []);
    if (!state.events.length && Number(today.count || 0) > 0) {
      state.events = createLegacyEvents(Number(today.count || 0), todayKey);
    }
    annotateGroups(state.events);
    state.sessions = normalizeSessions(today.sessions || []);
    state.count = state.events.length || Number(today.count || 0);
    state.realCount = Number(today.realCount || 0);
    state.history = Array.isArray(today.history) ? today.history : [];
  }
  if (saved.config) {
    state.config = normalizeConfig(saved.config);
  }
}

function saveState() {
  saveCurrentDay();
  localStorage.setItem("afluencia-counter", JSON.stringify({
    date: todayKey,
    count: state.count,
    realCount: state.realCount,
    events: state.events,
    sessions: state.sessions,
    days: state.days,
    history: state.history,
    config: state.config,
    timezone: REPORT_TIMEZONE,
  }));
}

function pushHistory(label, total) {
  state.history.push({
    label,
    total,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });
}

function resizeCanvas(canvas, width, height) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function bottomCenter(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h };
}

function boxIou(a, b) {
  const interLeft = Math.max(a.x, b.x);
  const interTop = Math.max(a.y, b.y);
  const interRight = Math.min(a.x + a.w, b.x + b.w);
  const interBottom = Math.min(a.y + a.h, b.y + b.h);
  const interWidth = Math.max(0, interRight - interLeft);
  const interHeight = Math.max(0, interBottom - interTop);
  const intersection = interWidth * interHeight;
  if (intersection <= 0) return 0;
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  return intersection / Math.max(1, areaA + areaB - intersection);
}

function boxDiagonal(box) {
  return Math.hypot(box.w, box.h);
}

function toPx(point, canvas) {
  return { x: point.x * canvas.width, y: point.y * canvas.height };
}

function pointerToNorm(event, canvas) {
  const rect = mediaContentRect(canvas, draftConfig());
  return {
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height),
  };
}

function mediaContentRect(element, config = activeCameraConfig()) {
  const rect = element.getBoundingClientRect();
  const naturalWidth = els.camera.videoWidth || element.width || rect.width || 1;
  const naturalHeight = els.camera.videoHeight || element.height || rect.height || 1;
  const fit = config.cameraFitMode === "cover" ? "cover" : "fit";
  const ratio = naturalWidth / naturalHeight;
  const boxRatio = rect.width / Math.max(1, rect.height);
  const useHeight = fit === "cover" ? boxRatio > ratio : boxRatio < ratio;
  let width = useHeight ? rect.width : rect.height * ratio;
  let height = useHeight ? rect.width / ratio : rect.height;

  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  return { left, top, width, height };
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function crossedLine(previous, current, line, config = state.config) {
  const a = { x: line[0].x * els.camera.videoWidth, y: line[0].y * els.camera.videoHeight };
  const b = { x: line[1].x * els.camera.videoWidth, y: line[1].y * els.camera.videoHeight };
  const orientation = config.lineOrientation === "horizontal" ? "horizontal" : "vertical";
  const axis = orientation === "horizontal" ? "y" : "x";
  const otherAxis = orientation === "horizontal" ? "x" : "y";
  const delta = current[axis] - previous[axis];
  if (Math.abs(delta) < 1) return false;

  const gate = (a[axis] + b[axis]) / 2;
  const crossedAxis = (previous[axis] < gate && current[axis] >= gate) || (previous[axis] > gate && current[axis] <= gate);
  if (!crossedAxis) return false;

  const progress = (gate - previous[axis]) / delta;
  if (progress < 0 || progress > 1) return false;

  const crossingOther = previous[otherAxis] + (current[otherAxis] - previous[otherAxis]) * progress;
  const span = Math.abs(a[otherAxis] - b[otherAxis]);
  const frameOther = orientation === "horizontal" ? (els.camera.videoWidth || 1) : (els.camera.videoHeight || 1);
  const tolerance = Math.max(8, span * LINE_EDGE_TOLERANCE, frameOther * 0.04);
  const lineMin = Math.min(a[otherAxis], b[otherAxis]) - tolerance;
  const lineMax = Math.max(a[otherAxis], b[otherAxis]) + tolerance;
  return crossingOther >= lineMin && crossingOther <= lineMax;
}

function pointInPolygon(point, polygon) {
  const px = point.x / (els.camera.videoWidth || 1);
  const py = point.y / (els.camera.videoHeight || 1);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function trackInCountingZone(track, config = state.config) {
  if (pointInPolygon(track.point, config.roi)) return true;
  if (pointInRoiBounds(track.point, config.roi, ROI_EDGE_TOLERANCE)) return true;
  if (track.previousPoint && (crossedLineAxis(track.previousPoint, track.point, config.lineA, config)
    || crossedLineAxis(track.previousPoint, track.point, config.lineB, config))) {
    return pointInRoiBounds(track.previousPoint, config.roi, ROI_EDGE_TOLERANCE)
      || pointInRoiBounds(track.point, config.roi, ROI_EDGE_TOLERANCE);
  }
  return false;
}

function pointInRoiBounds(point, roi, tolerance = 0) {
  const px = point.x / (els.camera.videoWidth || 1);
  const py = point.y / (els.camera.videoHeight || 1);
  const bounds = roiBounds(roi);
  return px >= bounds.left - tolerance
    && px <= bounds.right + tolerance
    && py >= bounds.top - tolerance
    && py <= bounds.bottom + tolerance;
}

function guayaquilParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function guayaquilDateKey(date) {
  const parts = guayaquilParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function guayaquilIso(date) {
  const parts = guayaquilParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}-05:00`;
}

function guayaquilLocalMs(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0, 0) + 5 * 60 * 60000;
}

function bucketInfo(date, minutes) {
  const parts = guayaquilParts(date);
  const bucketMinute = minutes < 60 ? Math.floor(parts.minute / minutes) * minutes : 0;
  const startParts = { ...parts, minute: bucketMinute, second: 0 };
  const startMs = guayaquilLocalMs(startParts);
  return { startMs, endMs: startMs + minutes * 60000 };
}

function bucketLabel(date, minutes) {
  return bucketLabelFromStart(bucketInfo(date, minutes).startMs, minutes);
}

function bucketLabelFromStart(startMs, minutes) {
  const start = guayaquilParts(new Date(startMs));
  const end = guayaquilParts(new Date(startMs + minutes * 60000 - 60000));
  return `${pad2(start.hour)}:${pad2(start.minute)}-${pad2(end.hour)}:${pad2(end.minute)}`;
}

function minuteBucketLabel(date) {
  const start = guayaquilParts(date);
  const end = guayaquilParts(new Date(bucketInfo(date, 1).endMs));
  return `${pad2(start.hour)}:${pad2(start.minute)}-${pad2(end.hour)}:${pad2(end.minute)}`;
}

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function normalizeEvents(events) {
  return Array.isArray(events)
    ? events.map((event, index) => ({
      ...event,
      timestampMs: Number(event.timestampMs || Date.parse(event.timestamp || new Date())),
      total_count: Number(event.total_count || index + 1),
      age_group: event.age_group || "SIN_DETERMINAR",
      age_confidence: Number(event.age_confidence || 0),
      group_id: event.group_id || null,
      group_size: Number(event.group_size || 1),
    }))
    : [];
}

function normalizeSessions(sessions) {
  return Array.isArray(sessions)
    ? sessions.map((session, index) => ({
      ...session,
      id: Number(session.id || index + 1),
      startMs: Number(session.startMs || Date.parse(session.start || new Date())),
      endMs: session.endMs ? Number(session.endMs) : null,
      camera: session.camera || CAMERA_NAME,
    }))
    : [];
}

function createLegacyEvents(count, dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const baseMs = guayaquilLocalMs({ year, month, day, hour: 0, minute: 0, second: 0 });
  const events = [];
  for (let index = 0; index < count; index++) {
    const timestampMs = baseMs + index * 1000;
    const timestamp = guayaquilIso(new Date(timestampMs));
    events.push({
      timestamp,
      timestampMs,
      date: formatDate(dateKey),
      dateKey,
      hour: 0,
      minute: 0,
      second: index % 60,
      camera: CAMERA_NAME,
      event: "ENTRY",
      track_id: null,
      age_group: "SIN_DETERMINAR",
      age_confidence: 0,
      total_count: index + 1,
      seconds_since_previous_entry: index === 0 ? null : 1,
      hour_bucket: "00:00-00:59",
      minute_bucket: "00:00-00:01",
      group_id: null,
      group_size: 1,
    });
  }
  annotateGroups(events);
  return events;
}

function maybeSendFrameToLocalProcessor() {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!isLocal || performance.now() - state.lastFrameSentAt < 180) return;
  state.lastFrameSentAt = performance.now();

  const canvas = document.createElement("canvas");
  canvas.width = els.camera.videoWidth;
  canvas.height = els.camera.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(els.camera, 0, 0);
  canvas.toBlob((blob) => {
    fetch("/frame", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob }).catch(() => {});
  }, "image/jpeg", 0.65);
}

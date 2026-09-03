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

const FAST_COUNTING_VERSION = "frontal-proximity-20260903";

const DEFAULT_CONFIG = {
  lineA: [{ x: 0.30, y: 0.03 }, { x: 0.30, y: 0.99 }],
  lineB: [{ x: 0.46, y: 0.03 }, { x: 0.46, y: 0.99 }],
  roi: [{ x: 0.01, y: 0.03 }, { x: 0.99, y: 0.03 }, { x: 0.99, y: 0.99 }, { x: 0.01, y: 0.99 }],
  lineOrientation: "vertical",
  countingMode: "LATERAL",
  entryDirection: "LEFT_TO_RIGHT",
  lineAPosition: 0.30,
  lineBPosition: 0.46,
  lineSeparation: 0.16,
  minLineSeparation: 0.04,
  entryProximityThreshold: 0.66,
  depthCalibration: {
    enabled: false,
    farLabel: "aprox. 3 m",
    midLabel: "aprox. 2 m",
    nearLabel: "aprox. 1 m",
  },
  fastCountingVersion: FAST_COUNTING_VERSION,
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
  horizontal: ["TOP_TO_BOTTOM", "BOTTOM_TO_TOP"],
};

const DETECTION_THRESHOLD = 0.30;
const TRACK_MATCH_DISTANCE = 180;
const TRACK_TTL_MS = 3600;
const TRACK_PREDICTION_MAX_MS = 1200;
const FRONTAL_OCCLUSION_GRACE_MS = 1600;
const ORIGIN_SIDE_TOLERANCE = 0.055;
const FAST_ENTRY_COMPLETION_TOLERANCE = 0.08;
const FRONTAL_FAST_ENTRY_TOLERANCE = 0.12;
const FRONTAL_EDGE_MARGIN = 0.055;
const REPORT_TIMEZONE = "America/Guayaquil";
const TIME_BUCKET_MINUTES = 60;
const LIVE_RATE_WINDOW_MINUTES = 5;
const GROUP_WINDOW_SECONDS = 2;
const REPORT_BUILD_VERSION = "frontal-proximity-20260903";
const CAMERA_NAME = "ENTRADA_01";
const MIN_LINE_SEPARATION = 0.04;
const CAMERA_START_TIMEOUT_MS = 25000;
const ROI_EDGE_TOLERANCE = 0.10;
const LINE_EDGE_TOLERANCE = 0.12;
const LEGACY_INSET_ROI = [{ x: 0.08, y: 0.12 }, { x: 0.92, y: 0.12 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }];
const FRONTAL_EXTENDED_ROI = [{ x: 0.01, y: 0.03 }, { x: 0.99, y: 0.03 }, { x: 0.99, y: 0.99 }, { x: 0.01, y: 0.99 }];
const AGE_REPORT_LABELS = {
  children: "Ninos",
  adolescents: "Adolescentes",
  youth: "Jovenes",
  adults: "Adultos",
  older_adults: "Adultos mayores",
  undetermined: "Sin clasificar",
};

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
    entryCandidates: 0,
    ignoredTracks: 0,
    entriesConfirmed: 0,
    trackRows: [],
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
  entryCandidateCount: document.querySelector("#entryCandidateCount"),
  ignoredTrackCount: document.querySelector("#ignoredTrackCount"),
  entriesConfirmedCount: document.querySelector("#entriesConfirmedCount"),
  trackDebugList: document.querySelector("#trackDebugList"),
  realCount: document.querySelector("#realCount"),
  accuracyValue: document.querySelector("#accuracyValue"),
  requestedResolution: document.querySelector("#requestedResolution"),
  realResolution: document.querySelector("#realResolution"),
  todayLabel: document.querySelector("#todayLabel"),
  historyTotal: document.querySelector("#historyTotal"),
  historyDate: document.querySelector("#historyDate"),
  historyList: document.querySelector("#historyList"),
  downloadReport: document.querySelector("#downloadReport"),
  downloadCsv: document.querySelector("#downloadCsv"),
  historyInsights: document.querySelector("#historyInsights"),
  hourlyChart: document.querySelector("#hourlyChart"),
  recentChart: document.querySelector("#recentChart"),
  ageChart: document.querySelector("#ageChart"),
  dailyChart: document.querySelector("#dailyChart"),
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
  centerLines: document.querySelector("#centerLines"),
  swapLines: document.querySelector("#swapLines"),
  testCalibration: document.querySelector("#testCalibration"),
  proximityThreshold: document.querySelector("#proximityThreshold"),
  proximityThresholdValue: document.querySelector("#proximityThresholdValue"),
  calibrateDepth: document.querySelector("#calibrateDepth"),
  extendFrontalZones: document.querySelector("#extendFrontalZones"),
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

  if (els.downloadReport) {
    els.downloadReport.addEventListener("click", downloadDailyReport);
  }

  if (els.downloadCsv) {
    els.downloadCsv.addEventListener("click", downloadEventsCsv);
  }

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

  if (els.centerLines) {
    els.centerLines.addEventListener("click", () => {
      ensureCalibrationDraft();
      const next = cloneConfig(state.calibrationDraft);
      centerLinePair(next);
      updateCalibrationMetadata(next);
      state.calibrationDraft = next;
      setCalibrationStatus("A y B centradas. Presiona Guardar.", "warning");
      renderAll();
      setStatus("Lineas centradas");
    });
  }

  if (els.extendFrontalZones) {
    els.extendFrontalZones.addEventListener("click", () => {
      ensureCalibrationDraft();
      const next = cloneConfig(state.calibrationDraft);
      next.lineOrientation = "horizontal";
      next.entryDirection = normalizeDirection(next.entryDirection, next.lineOrientation);
      extendFrontalZones(next);
      updateCalibrationMetadata(next);
      state.calibrationDraft = next;
      state.activeTool = "linePair";
      setCalibrationStatus("Zonas frontales extendidas al borde. Presiona Guardar.", "warning");
      renderAll();
      setStatus("Zonas al borde");
    });
  }

  if (els.calibrateDepth) {
    els.calibrateDepth.addEventListener("click", () => {
      ensureCalibrationDraft();
      const next = cloneConfig(state.calibrationDraft);
      next.lineOrientation = "horizontal";
      next.entryDirection = "TOP_TO_BOTTOM";
      next.entryProximityThreshold = Number(next.entryProximityThreshold || DEFAULT_CONFIG.entryProximityThreshold);
      extendFrontalZones(next);
      setLinePositions(next, 0.36, 0.62);
      next.depthCalibration = { ...DEFAULT_CONFIG.depthCalibration, enabled: true };
      state.calibrationDraft = next;
      state.activeTool = "linePair";
      setCalibrationStatus("Profundidad aproximada lista: Lejos, medio y cerca. Ajusta A/B si hace falta y guarda.", "warning");
      renderAll();
      setStatus("Profundidad");
    });
  }

  if (els.proximityThreshold) {
    els.proximityThreshold.addEventListener("input", () => {
      ensureCalibrationDraft();
      state.calibrationDraft.entryProximityThreshold = clampNumber(els.proximityThreshold.value, 0.5, 0.9, DEFAULT_CONFIG.entryProximityThreshold);
      updateCalibrationMetadata(state.calibrationDraft);
      setCalibrationStatus(calibrationDistanceLabel(state.calibrationDraft), "warning");
      renderAll();
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
    updateTrackDebugStats(tracks, people.length);
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
      const adaptiveDistance = isFrontalMode(config)
        ? Math.max(TRACK_MATCH_DISTANCE * 1.45, boxDiagonal(track.box) * 1.35, boxDiagonal(detection.box) * 0.95)
        : Math.max(TRACK_MATCH_DISTANCE, boxDiagonal(track.box) * 0.45);
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
    const previousPoint = track.point;
    const previousBox = track.box;
    const previousProximity = Number(track.proximityScore || 0);
    const elapsed = Math.max(16, now - (track.lastSeen || now));
    track.previousPoint = previousPoint;
    track.point = point;
    track.box = detection.box;
    track.score = detection.score;
    track.velocity = {
      x: (point.x - previousPoint.x) / elapsed,
      y: (point.y - previousPoint.y) / elapsed,
    };
    track.lastDirection = movementDirection(previousPoint, point, config);
    track.lastSeen = now;
    track.missingSince = null;
    track.visible = true;
    track.predicted = false;
    updateFrontalTrackMemory(track, {
      previousPoint,
      previousBox,
      previousProximity,
      elapsedMs: elapsed,
      config,
    });
    matchedTrackIds.add(candidate.id);
    matchedDetectionIds.add(candidate.index);
    active.push({ id: candidate.id, ...track });
  });

  for (const [id, track] of state.tracks) {
    if (matchedTrackIds.has(id)) continue;
    const missingFor = now - track.lastSeen;
    if (missingFor > TRACK_TTL_MS) {
      state.tracks.delete(id);
      continue;
    }
    if (shouldKeepOccludedTrack(track, config)) {
      if (!track.missingSince) track.missingSince = now;
      active.push(predictedTrackSnapshot(id, track, now, config));
    }
  }

  detections.forEach((detection, index) => {
    if (matchedDetectionIds.has(index)) return;
    const point = bottomCenter(detection.box);
    const id = state.nextTrackId++;
    const originStatus = classifyTrackOrigin(point, config);
    const ignoredEntry = originStatus === "destination";
    const track = {
      firstPoint: point,
      point,
      previousPoint: null,
      box: detection.box,
      score: detection.score,
      velocity: null,
      phase: ignoredEntry ? "ignore" : "new",
      counted: false,
      crossedA: false,
      crossedB: false,
      originStatus,
      originValid: originStatus === "valid",
      ignoredEntry,
      lastDirection: "none",
      lastSeen: now,
      missingSince: null,
      visible: true,
      predicted: false,
    };
    initializeFrontalTrackMemory(track, config);
    state.tracks.set(id, track);
    active.push({ id, ...track });
  });

  return active.filter((track) => trackInCountingZone(track, config));
}

function shouldKeepOccludedTrack(track, config = state.config) {
  if (!track || track.counted || track.phase === "counted" || track.phase === "exit" || track.phase === "ignore") return false;
  if (isFrontalMode(config)) {
    const missingFor = performance.now() - (track.lastSeen || performance.now());
    return missingFor <= FRONTAL_OCCLUSION_GRACE_MS
      && isEntryCandidate(track)
      && frontalVisited(track, "MID")
      && (track.apparentMotion === "APPROACHING" || Number(track.approachFrames || 0) > 0 || Number(track.proximityScore || 0) >= frontalProximityThreshold(config) - 0.12);
  }
  return isEntryCandidate(track) && (track.phase === "crossedA" || track.crossedA);
}

function predictedTrackSnapshot(id, track, now, config = state.config) {
  const canPredict = canPredictTowardDestination(track, config);
  const elapsed = Math.min(TRACK_PREDICTION_MAX_MS, Math.max(0, now - track.lastSeen));
  const delta = canPredict ? {
    x: (track.velocity?.x || 0) * elapsed,
    y: (track.velocity?.y || 0) * elapsed,
  } : { x: 0, y: 0 };
  const point = { x: track.point.x + delta.x, y: track.point.y + delta.y };
  return {
    id,
    ...track,
    previousPoint: canPredict ? track.point : null,
    point,
    box: offsetBox(track.box, delta.x, delta.y),
    edgeExit: detectFrameEdgeExit(offsetBox(track.box, delta.x, delta.y), config),
    visible: false,
    predicted: canPredict,
    missingFor: now - track.lastSeen,
  };
}

function canPredictTowardDestination(track, config = state.config) {
  if (!track.velocity || !isEntryCandidate(track)) return false;
  if (!isFrontalMode(config) && track.phase !== "crossedA") return false;
  if (isFrontalMode(config) && !frontalVisited(track, "MID")) return false;
  const nextPoint = {
    x: track.point.x + track.velocity.x * TRACK_PREDICTION_MAX_MS,
    y: track.point.y + track.velocity.y * TRACK_PREDICTION_MAX_MS,
  };
  return movingInEntryDirection(track.point, nextPoint, config);
}

function offsetBox(box, deltaX, deltaY) {
  return {
    x: box.x + deltaX,
    y: box.y + deltaY,
    w: box.w,
    h: box.h,
  };
}

function initializeFrontalTrackMemory(track, config = state.config) {
  if (!isFrontalMode(config)) return track;
  const zone = frontalZone(track.point, config);
  const proximityScore = frontalProximityScore(track, config);
  track.firstZone = zone;
  track.zone = zone;
  track.zoneHistory = [zone];
  track.crossedMid = false;
  track.reachedNear = zone === "NEAR" && track.originValid;
  track.proximityScore = proximityScore;
  track.maxProximityScore = proximityScore;
  track.initialProximityScore = proximityScore;
  track.bboxGrowthRate = 0;
  track.apparentMotion = "STABLE";
  track.approachFrames = 0;
  track.recedeFrames = 0;
  track.edgeExit = detectFrameEdgeExit(track.box, config);
  track.entryConfirmType = null;
  return track;
}

function updateFrontalTrackMemory(track, context) {
  const { previousPoint, previousBox, previousProximity, elapsedMs, config } = context;
  if (!isFrontalMode(config)) return track;
  if (!track.zoneHistory) initializeFrontalTrackMemory(track, config);

  const crossings = previousPoint ? orderedCrossings(previousPoint, track.point, config) : [];
  const previousZone = track.zone || (previousPoint ? frontalZone(previousPoint, config) : null);
  const currentZone = frontalZone(track.point, config);
  const growthRate = bboxGrowthRate(previousBox, track.box);
  const proximityScore = frontalProximityScore(track, config, growthRate);
  const motion = apparentDepthMotion({
    previousPoint,
    currentPoint: track.point,
    previousBox,
    currentBox: track.box,
    previousProximity,
    currentProximity: proximityScore,
    elapsedMs,
    config,
  });

  if (crossings.includes("A")) {
    appendFrontalZone(track, "MID");
    track.crossedA = true;
    track.crossedMid = isEntryCandidate(track);
  }
  if (crossings.includes("B")) {
    appendFrontalZone(track, "NEAR");
    track.crossedB = true;
    track.reachedNear = isEntryCandidate(track);
  }
  if (previousZone && previousZone !== currentZone && previousZone === "FAR" && currentZone === "NEAR") {
    appendFrontalZone(track, "MID");
    track.crossedMid = isEntryCandidate(track);
  }
  appendFrontalZone(track, currentZone);

  track.zone = currentZone;
  track.bboxGrowthRate = round(growthRate, 3);
  track.proximityScore = round(proximityScore, 3);
  track.maxProximityScore = round(Math.max(Number(track.maxProximityScore || 0), proximityScore), 3);
  track.apparentMotion = motion;
  track.approachFrames = motion === "APPROACHING" ? Number(track.approachFrames || 0) + 1 : (motion === "RECEDING" ? 0 : Number(track.approachFrames || 0));
  track.recedeFrames = motion === "RECEDING" ? Number(track.recedeFrames || 0) + 1 : (motion === "APPROACHING" ? 0 : Number(track.recedeFrames || 0));
  track.edgeExit = detectFrameEdgeExit(track.box, config);
  return track;
}

function updateFrontalCount(tracks, config = state.config) {
  tracks.forEach((track) => {
    const stored = state.tracks.get(track.id);
    if (!stored || stored.counted) return;
    if (track.edgeExit && track.edgeExit !== "NONE") {
      stored.edgeExit = track.edgeExit;
    }
    if (track.predicted) {
      stored.predicted = true;
      stored.missingFor = track.missingFor;
    }

    const decision = frontalEntryDecision(stored, track, config);
    if (decision.count) {
      stored.entryConfirmType = decision.type;
      confirmTrackEntry(stored, {
        ...track,
        entryConfirmType: decision.type,
        proximityScore: stored.proximityScore,
        edgeExit: stored.edgeExit,
        zoneHistory: stored.zoneHistory,
        apparentMotion: stored.apparentMotion,
      });
      return;
    }
    if (decision.ignore) {
      stored.phase = "ignore";
      stored.ignoredEntry = true;
      stored.ignoreReason = decision.reason;
    }
  });
}

function frontalEntryDecision(stored, track, config = state.config) {
  if (!isFrontalMode(config)) return { count: false };
  if (stored.ignoredEntry || stored.originStatus === "destination") {
    return { count: false, ignore: true, reason: "ORIGIN_NEAR" };
  }
  if (!isEntryCandidate(stored)) {
    return { count: false };
  }

  const zone = track.zone || stored.zone || frontalZone(track.point, config);
  const threshold = frontalProximityThreshold(config);
  const hasMid = Boolean(stored.crossedMid || frontalVisited(stored, "MID"));
  const reachedNear = Boolean(stored.reachedNear || frontalVisited(stored, "NEAR") || zone === "NEAR");
  const approaching = stored.apparentMotion === "APPROACHING" || Number(stored.approachFrames || 0) > 0;
  const proximity = Math.max(Number(stored.proximityScore || 0), Number(stored.maxProximityScore || 0), Number(track.proximityScore || 0));
  const grewEnough = Number(stored.bboxGrowthRate || 0) >= 0.025 || proximity - Number(stored.initialProximityScore || 0) >= 0.16;
  const compatibleEdge = frontalEdgeCompatible(track, config) || frontalEdgeCompatible(stored, config);

  if (hasMid && reachedNear && approaching) {
    return { count: true, type: "ENTRY_FULL" };
  }
  if (hasMid && approaching && proximity >= threshold && compatibleEdge) {
    return { count: true, type: "ENTRY_EDGE" };
  }
  if (hasMid && approaching && grewEnough && proximity >= threshold - FRONTAL_FAST_ENTRY_TOLERANCE && compatibleEdge) {
    return { count: true, type: "ENTRY_FAST" };
  }
  if (hasMid && stored.apparentMotion === "RECEDING" && (zone === "FAR" || Number(stored.recedeFrames || 0) >= 2)) {
    return { count: false, ignore: true, reason: "RETURNED" };
  }
  return { count: false };
}

function frontalZone(point, config = state.config) {
  const progress = frontalDepthProgress(point, config);
  if (progress < 0) return "FAR";
  if (progress < 1) return "MID";
  return "NEAR";
}

function frontalDepthProgress(point, config = state.config) {
  if (!point) return 0;
  const axisSize = axisPixelSize(config);
  const axis = pointAxisPixel(point, config) / Math.max(1, axisSize);
  const a = linePosition(config.lineA, config);
  const b = linePosition(config.lineB, config);
  const span = Math.max(Math.abs(b - a), Number(config.minLineSeparation || MIN_LINE_SEPARATION), 0.01);
  return ((axis - a) * entryDirectionSign(config)) / span;
}

function frontalProximityScore(track, config = state.config, growthRate = 0) {
  const width = els.camera.videoWidth || els.calibrationOverlay.width || 1;
  const height = els.camera.videoHeight || els.calibrationOverlay.height || 1;
  const box = track.box || { x: 0, y: 0, w: 0, h: 0 };
  const heightScore = scale01(box.h / height, 0.18, 0.72);
  const widthScore = scale01(box.w / width, 0.10, 0.54);
  const areaScore = scale01(boxArea(box) / Math.max(1, width * height), 0.028, 0.32);
  const depthScore = clamp(frontalDepthProgress(track.point, config));
  const growthScore = scale01(growthRate, 0.015, 0.18);
  const edgeBoost = detectFrameEdgeExit(box, config) !== "NONE" ? 0.06 : 0;
  return round(clamp(
    heightScore * 0.26
    + widthScore * 0.15
    + areaScore * 0.16
    + depthScore * 0.33
    + growthScore * 0.10
    + edgeBoost,
  ), 3);
}

function apparentDepthMotion(context) {
  const { previousPoint, currentPoint, previousBox, currentBox, previousProximity, currentProximity, config } = context;
  if (!previousPoint || !currentPoint || !previousBox || !currentBox) return "STABLE";
  const depthDelta = frontalDepthProgress(currentPoint, config) - frontalDepthProgress(previousPoint, config);
  const growthRate = bboxGrowthRate(previousBox, currentBox);
  const proximityDelta = Number(currentProximity || 0) - Number(previousProximity || 0);
  let approachEvidence = 0;
  let recedeEvidence = 0;

  if (depthDelta > 0.012) approachEvidence += 1;
  if (depthDelta > 0.035) approachEvidence += 1;
  if (growthRate > 0.025) approachEvidence += 1;
  if (proximityDelta > 0.025) approachEvidence += 1;

  if (depthDelta < -0.012) recedeEvidence += 1;
  if (depthDelta < -0.035) recedeEvidence += 1;
  if (growthRate < -0.035) recedeEvidence += 1;
  if (proximityDelta < -0.035) recedeEvidence += 1;

  if (approachEvidence >= 2 || (depthDelta > 0.02 && growthRate > -0.06)) return "APPROACHING";
  if (recedeEvidence >= 2 || (depthDelta < -0.02 && growthRate < 0.04)) return "RECEDING";
  return "STABLE";
}

function bboxGrowthRate(previousBox, currentBox) {
  if (!previousBox || !currentBox) return 0;
  const previousArea = Math.max(1, boxArea(previousBox));
  return (boxArea(currentBox) - previousArea) / previousArea;
}

function boxArea(box) {
  return Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0));
}

function detectFrameEdgeExit(box, config = state.config) {
  if (!box) return "NONE";
  const width = els.camera.videoWidth || els.calibrationOverlay.width || 1;
  const height = els.camera.videoHeight || els.calibrationOverlay.height || 1;
  const marginX = width * FRONTAL_EDGE_MARGIN;
  const marginY = height * FRONTAL_EDGE_MARGIN;
  const edges = [];
  if (box.x <= marginX) edges.push("LEFT");
  if (box.x + box.w >= width - marginX) edges.push("RIGHT");
  if (entryDirectionSign(config) >= 0 && box.y + box.h >= height - marginY) edges.push("BOTTOM");
  if (entryDirectionSign(config) < 0 && box.y <= marginY) edges.push("TOP");
  return edges.length ? edges.join("+") : "NONE";
}

function frontalEdgeCompatible(track, config = state.config) {
  const edge = track.edgeExit || detectFrameEdgeExit(track.box, config);
  if (!edge || edge === "NONE") return false;
  if (entryDirectionSign(config) < 0) return /LEFT|RIGHT|TOP/.test(edge);
  return /LEFT|RIGHT|BOTTOM/.test(edge);
}

function appendFrontalZone(track, zone) {
  if (!zone) return;
  if (!Array.isArray(track.zoneHistory)) track.zoneHistory = [];
  if (track.zoneHistory[track.zoneHistory.length - 1] !== zone) {
    track.zoneHistory.push(zone);
  }
  if (track.zoneHistory.length > 8) {
    track.zoneHistory = track.zoneHistory.slice(-8);
  }
}

function frontalVisited(track, zone) {
  return Array.isArray(track.zoneHistory) && track.zoneHistory.includes(zone);
}

function frontalZonePath(track) {
  return Array.isArray(track.zoneHistory) && track.zoneHistory.length
    ? track.zoneHistory.join("->")
    : "--";
}

function frontalProximityThreshold(config = state.config) {
  return clampNumber(config.entryProximityThreshold, 0.5, 0.9, DEFAULT_CONFIG.entryProximityThreshold);
}

function scale01(value, minimum, maximum) {
  if (maximum <= minimum) return 0;
  return clamp((Number(value || 0) - minimum) / (maximum - minimum));
}

function updateCount(tracks, config = state.config) {
  if (isFrontalMode(config)) {
    updateFrontalCount(tracks, config);
    return;
  }
  tracks.forEach((track) => {
    const stored = state.tracks.get(track.id);
    if (!stored || stored.counted || !track.previousPoint) return;

    let countedThisTrack = false;
    orderedCrossings(track.previousPoint, track.point, config).forEach((crossing) => {
      if (countedThisTrack) return;
      maybePromoteUncertainOrigin(stored, track, crossing, config);
      console.debug(`Track ${track.id} crossed ${crossing}`);
      if (shouldCountLateEntry(stored, track, crossing, config)) {
        confirmTrackEntry(stored, track);
        countedThisTrack = true;
        return;
      }
      if (applyCrossing(stored, crossing, config, track)) {
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
  stored.crossedA = true;
  stored.crossedB = true;
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
    counting_mode: state.config.countingMode || (isFrontalMode(state.config) ? "FRONTAL" : "LATERAL"),
    confirmation_type: track.entryConfirmType || (isFrontalMode(state.config) ? "ENTRY_FULL" : "A_TO_B"),
    proximity_score: Number.isFinite(Number(track.proximityScore)) ? round(track.proximityScore, 3) : null,
    edge_exit: track.edgeExit || "NONE",
    zone_path: Array.isArray(track.zoneHistory) ? track.zoneHistory.join("->") : "",
    apparent_motion: track.apparentMotion || "",
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

function applyCrossing(track, crossing, config = state.config, movementTrack = track) {
  if (track.counted || track.phase === "counted" || track.phase === "exit" || track.phase === "ignore") return false;
  if (track.ignoredEntry || track.originStatus === "destination") {
    track.phase = "ignore";
    track.ignoredEntry = true;
    return false;
  }

  if (crossing === "A") track.crossedA = true;
  if (crossing === "B") track.crossedB = true;

  if (track.phase === "new") {
    if (crossing === "A") {
      if (!isEntryCandidate(track)) return false;
      track.phase = "crossedA";
      return false;
    }
    track.phase = "exit";
    track.ignoredEntry = true;
    return false;
  }

  if (track.phase === "crossedA") {
    if (crossing === "B") {
      if (!isEntryCandidate(track) || !movingInEntryDirection(movementTrack.previousPoint, movementTrack.point, config)) {
        track.phase = "exit";
        track.ignoredEntry = true;
        return false;
      }
      track.phase = "counted";
      track.counted = true;
      return true;
    }
    track.phase = "new";
    return false;
  }

  if (track.phase === "crossedB" && crossing === "A") {
    track.phase = "exit";
    track.ignoredEntry = true;
    return false;
  }

  return false;
}

function maybePromoteUncertainOrigin(stored, track, crossing, config = state.config) {
  if (!stored || stored.originStatus !== "uncertain" || crossing !== "A") return;
  if (!track.previousPoint || !track.point) return;
  if (!crossedOriginInEntryDirection(track.previousPoint, track.point, config)) return;
  stored.originStatus = "valid";
  stored.originValid = true;
  stored.ignoredEntry = false;
}

function shouldCountLateEntry(stored, track, crossing, config = state.config) {
  if (stored.counted || stored.phase !== "new" || crossing !== "B") return false;
  if (!isEntryCandidate(stored)) return false;
  if (!track.previousPoint || !track.firstPoint) return false;
  return crossedDestinationInEntryDirection(track.previousPoint, track.point, config)
    && pointStartedOnOriginSide(stored.firstPoint || track.firstPoint, config)
    && pointInRoiBounds(track.point, config.roi, ROI_EDGE_TOLERANCE);
}

function shouldCompleteEdgeEntry(stored, track, config = state.config) {
  if (stored.counted || stored.phase !== "crossedA" || !track.previousPoint) return false;
  if (!isEntryCandidate(stored)) return false;
  if (!movingInEntryDirection(track.previousPoint, track.point, config)) return false;
  if (crossedDestinationInEntryDirection(track.previousPoint, track.point, config)) return true;
  return passedDestinationGate(track.point, config, FAST_ENTRY_COMPLETION_TOLERANCE) && boxTouchesFrameEdge(track.box);
}

function crossedOriginInEntryDirection(previous, current, config = state.config) {
  return movingInEntryDirection(previous, current, config)
    && crossedLineAxis(previous, current, config.lineA, config);
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
  if (!previous || !current) return false;
  const delta = pointAxisPixel(current, config) - pointAxisPixel(previous, config);
  const minimum = Math.max(1, axisPixelSize(config) * 0.002);
  return delta * entryDirectionSign(config) >= minimum;
}

function pointStartedOnOriginSide(point, config = state.config) {
  const gate = lineAxisPixel(config.lineA, config);
  const axis = pointAxisPixel(point, config);
  const tolerancePx = axisPixelSize(config) * ORIGIN_SIDE_TOLERANCE;
  return (axis - gate) * entryDirectionSign(config) <= tolerancePx;
}

function pointOnDestinationSide(point, config = state.config) {
  const gate = lineAxisPixel(config.lineB, config);
  const axis = pointAxisPixel(point, config);
  const tolerancePx = axisPixelSize(config) * ORIGIN_SIDE_TOLERANCE;
  return (axis - gate) * entryDirectionSign(config) >= -tolerancePx;
}

function classifyTrackOrigin(point, config = state.config) {
  if (isFrontalMode(config)) {
    const zone = frontalZone(point, config);
    if (zone === "FAR") return "valid";
    if (zone === "NEAR") return "destination";
    if (frontalDepthProgress(point, config) <= 0.38) return "valid";
    return "uncertain";
  }
  if (pointStartedOnOriginSide(point, config)) return "valid";
  if (pointOnDestinationSide(point, config)) return "destination";
  return "uncertain";
}

function isEntryCandidate(track) {
  return Boolean(track && (track.originValid || track.originStatus === "valid"));
}

function isIgnoredTrack(track) {
  return Boolean(track && (track.ignoredEntry || track.phase === "exit" || track.phase === "ignore" || track.originStatus === "destination"));
}

function movementDirection(previous, current, config = state.config) {
  if (!previous || !current) return "none";
  const delta = pointAxisPixel(current, config) - pointAxisPixel(previous, config);
  const minimum = Math.max(1, axisPixelSize(config) * 0.002);
  if (Math.abs(delta) < minimum) return "none";
  return delta * entryDirectionSign(config) > 0 ? "entry" : "reverse";
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

function extendFrontalZones(config) {
  const bounds = roiBounds(isRoi(config.roi) ? config.roi : DEFAULT_CONFIG.roi);
  config.roi = [
    { x: FRONTAL_EXTENDED_ROI[0].x, y: Math.min(bounds.top, FRONTAL_EXTENDED_ROI[0].y) },
    { x: FRONTAL_EXTENDED_ROI[1].x, y: Math.min(bounds.top, FRONTAL_EXTENDED_ROI[1].y) },
    { x: FRONTAL_EXTENDED_ROI[2].x, y: Math.max(bounds.bottom, FRONTAL_EXTENDED_ROI[2].y) },
    { x: FRONTAL_EXTENDED_ROI[3].x, y: Math.max(bounds.bottom, FRONTAL_EXTENDED_ROI[3].y) },
  ];
  syncLineSpansToRoi(config);
  return config;
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

function isFrontalMode(config = state.config) {
  return normalizeOrientation(config.lineOrientation) === "horizontal";
}

function normalizeDirection(value, orientation) {
  const options = allowedDirections(orientation);
  return options.includes(value) ? value : options[0];
}

function defaultLinePositions(orientation, direction) {
  const normalizedOrientation = normalizeOrientation(orientation);
  const normalizedDirection = normalizeDirection(direction, normalizedOrientation);
  if (normalizedOrientation === "horizontal") {
    return normalizedDirection === "TOP_TO_BOTTOM" ? [0.36, 0.62] : [0.64, 0.38];
  }
  return normalizedDirection === "RIGHT_TO_LEFT" ? [0.70, 0.54] : [0.30, 0.46];
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
  config.countingMode = isFrontalMode(config) ? "FRONTAL" : "LATERAL";
  config.entryDirection = normalizeDirection(config.entryDirection, config.lineOrientation);
  config.minLineSeparation = Number.isFinite(config.minLineSeparation) ? clamp(config.minLineSeparation) : MIN_LINE_SEPARATION;
  config.entryProximityThreshold = clampNumber(config.entryProximityThreshold, 0.5, 0.9, DEFAULT_CONFIG.entryProximityThreshold);
  if (!config.depthCalibration || typeof config.depthCalibration !== "object") {
    config.depthCalibration = cloneConfig(DEFAULT_CONFIG.depthCalibration);
  }
  syncLineSpansToRoi(config);
  config.lineAPosition = round(linePosition(config.lineA, config), 4);
  config.lineBPosition = round(linePosition(config.lineB, config), 4);
  config.lineSeparation = round(Math.abs(config.lineAPosition - config.lineBPosition), 4);
  config.fastCountingVersion = FAST_COUNTING_VERSION;
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

function applyFastCountingMigration(config, rawConfig) {
  if (!config || !rawConfig || rawConfig.fastCountingVersion === FAST_COUNTING_VERSION) return false;
  const shouldTighten = config.lineSeparation >= 0.18 || nearWideDefaultLines(config);
  if (shouldTighten) {
    const [aPosition, bPosition] = defaultLinePositions(config.lineOrientation, config.entryDirection);
    setLinePositions(config, aPosition, bPosition);
  }
  if (isFrontalMode(config)) {
    extendFrontalZones(config);
    if (config.lineSeparation < 0.20) {
      const [aPosition, bPosition] = defaultLinePositions(config.lineOrientation, config.entryDirection);
      setLinePositions(config, aPosition, bPosition);
    }
    if (!Number.isFinite(Number(rawConfig.entryProximityThreshold))) {
      config.entryProximityThreshold = DEFAULT_CONFIG.entryProximityThreshold;
    }
  }
  config.fastCountingVersion = FAST_COUNTING_VERSION;
  return true;
}

function nearWideDefaultLines(config) {
  const a = Number(config.lineAPosition);
  const b = Number(config.lineBPosition);
  return nearLinePair(a, b, 0.35, 0.65)
    || nearLinePair(a, b, 0.65, 0.35)
    || nearLinePair(a, b, 0.38, 0.62)
    || nearLinePair(a, b, 0.62, 0.38);
}

function nearLinePair(a, b, expectedA, expectedB) {
  return Math.abs(a - expectedA) <= 0.035 && Math.abs(b - expectedB) <= 0.035;
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
  if (Number.isFinite(Number(config.entryProximityThreshold))) {
    normalized.entryProximityThreshold = Number(config.entryProximityThreshold);
  }
  if (config.depthCalibration && typeof config.depthCalibration === "object") {
    normalized.depthCalibration = {
      ...DEFAULT_CONFIG.depthCalibration,
      ...config.depthCalibration,
    };
  }
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
  if (isFrontalMode(next)) {
    extendFrontalZones(next);
    next.entryProximityThreshold = Number(next.entryProximityThreshold || DEFAULT_CONFIG.entryProximityThreshold);
  }
  const [aPosition, bPosition] = defaultLinePositions(next.lineOrientation, next.entryDirection);
  setLinePositions(next, aPosition, bPosition);
  state.calibrationDraft = next;
  state.activeTool = "linePair";
  const message = next.lineOrientation === "horizontal"
    ? "Frontal listo: A arriba/lejos y B abajo/cerca. Presiona Guardar."
    : "Lateral listo: A y B van de lado a lado. Presiona Guardar.";
  setCalibrationStatus(message, "warning");
  renderAll();
}

function setCalibrationDirection(direction) {
  const next = cloneConfig(draftConfig());
  next.entryDirection = normalizeDirection(direction, next.lineOrientation);
  if (isFrontalMode(next)) {
    extendFrontalZones(next);
  }
  const [aPosition, bPosition] = defaultLinePositions(next.lineOrientation, next.entryDirection);
  setLinePositions(next, aPosition, bPosition);
  state.calibrationDraft = next;
  const message = next.lineOrientation === "horizontal"
    ? "Ingreso frontal ajustado. Presiona Guardar."
    : "Direccion lista. Presiona Guardar.";
  setCalibrationStatus(message, "warning");
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
  if (isFrontalMode(config)) {
    return `Frontal: FAR/MID/NEAR · Separacion ${pixels}px · Prox ${Math.round(config.entryProximityThreshold * 100)}%`;
  }
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
  const frontal = isFrontalMode(config);
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
  document.querySelectorAll("[data-frontal-control]").forEach((item) => {
    item.hidden = !frontal;
  });
  if (els.proximityThreshold) {
    els.proximityThreshold.value = String(config.entryProximityThreshold || DEFAULT_CONFIG.entryProximityThreshold);
  }
  if (els.proximityThresholdValue) {
    els.proximityThresholdValue.textContent = `${Math.round((config.entryProximityThreshold || DEFAULT_CONFIG.entryProximityThreshold) * 100)}%`;
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
    const memory = state.calibrationProbe.tracks.get(track.id) || {
      phase: "new",
      counted: false,
      crossedA: false,
      crossedB: false,
      originStatus: "valid",
      originValid: true,
      ignoredEntry: false,
    };
    if (isFrontalMode(config)) {
      Object.assign(memory, {
        ...track,
        counted: Boolean(memory.counted || track.counted),
        originStatus: memory.originStatus || track.originStatus,
        originValid: Boolean(memory.originValid || track.originValid),
        ignoredEntry: Boolean(memory.ignoredEntry || track.ignoredEntry),
        phase: memory.phase || track.phase || "new",
        zoneHistory: memory.zoneHistory || track.zoneHistory || [],
        crossedMid: Boolean(memory.crossedMid || track.crossedMid),
        reachedNear: Boolean(memory.reachedNear || track.reachedNear),
        approachFrames: Math.max(Number(memory.approachFrames || 0), Number(track.approachFrames || 0)),
        recedeFrames: Math.max(Number(memory.recedeFrames || 0), Number(track.recedeFrames || 0)),
        maxProximityScore: Math.max(Number(memory.maxProximityScore || 0), Number(track.maxProximityScore || 0)),
      });
      const decision = frontalEntryDecision(memory, track, config);
      if (!memory.counted && decision.count) {
        memory.counted = true;
        memory.phase = "counted";
        memory.entryConfirmType = decision.type;
        probeCount += 1;
        state.calibrationProbe.events.push({ id: track.id, timestamp: Date.now(), type: decision.type });
      }
      state.calibrationProbe.tracks.set(track.id, memory);
      return;
    }
    if (track.previousPoint) {
      memory.previousPoint = track.previousPoint;
      memory.point = track.point;
      orderedCrossings(track.previousPoint, track.point, config).forEach((crossing) => {
        if (applyCrossing(memory, crossing, config)) {
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
  if (isFrontalMode(config)) {
    drawFrontalZones(ctx, canvas, config);
  }
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
    const labelHeight = isFrontalMode(config) ? 40 : 22;
    const labelWidth = isFrontalMode(config) ? 150 : 72;
    const labelTop = Math.max(0, track.box.y - labelHeight - 2);
    ctx.fillStyle = "rgba(1, 10, 5, 0.86)";
    ctx.fillRect(track.box.x, labelTop, labelWidth, labelHeight);
    ctx.fillStyle = "#15f070";
    ctx.font = "bold 14px system-ui";
    ctx.fillText(`ID ${track.id}`, track.box.x + 7, labelTop + 16);
    if (isFrontalMode(config)) {
      ctx.font = "12px system-ui";
      const prox = Math.round(Number(track.proximityScore || 0) * 100);
      const motion = track.apparentMotion === "APPROACHING" ? "APPROACH" : track.apparentMotion === "RECEDING" ? "AWAY" : "STABLE";
      ctx.fillText(`${motion} · PROX ${prox}%`, track.box.x + 7, labelTop + 32);
    }
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

function drawFrontalZones(ctx, canvas, config) {
  const bounds = roiBounds(config.roi);
  const left = bounds.left * canvas.width;
  const right = bounds.right * canvas.width;
  const top = bounds.top * canvas.height;
  const bottom = bounds.bottom * canvas.height;
  const yA = lineAxisMid(config.lineA, config) * canvas.height;
  const yB = lineAxisMid(config.lineB, config) * canvas.height;
  const sign = entryDirectionSign(config);
  const farStart = sign >= 0 ? top : bottom;
  const farEnd = yA;
  const midStart = yA;
  const midEnd = yB;
  const nearStart = yB;
  const nearEnd = sign >= 0 ? bottom : top;

  ctx.save();
  drawFrontalBand(ctx, left, right, farStart, farEnd, "rgba(108, 231, 255, 0.09)", "ZONA LEJANA");
  drawFrontalBand(ctx, left, right, midStart, midEnd, "rgba(21, 240, 112, 0.09)", "ZONA MEDIA");
  drawFrontalBand(ctx, left, right, nearStart, nearEnd, "rgba(247, 189, 49, 0.10)", "ZONA CERCANA");
  ctx.restore();
}

function drawFrontalBand(ctx, left, right, y1, y2, fill, label) {
  const top = Math.min(y1, y2);
  const height = Math.abs(y2 - y1);
  if (height < 4) return;
  ctx.fillStyle = fill;
  ctx.fillRect(left, top, right - left, height);
  ctx.fillStyle = "rgba(234, 255, 241, 0.82)";
  ctx.font = "bold 13px system-ui";
  ctx.fillText(label, left + 10, top + Math.min(22, Math.max(15, height / 2)));
}

function drawCalibrationGuides(ctx, canvas, config) {
  const a = lineCenterPx(config.lineA, canvas);
  const b = lineCenterPx(config.lineB, canvas);
  const isFrontal = normalizeOrientation(config.lineOrientation) === "horizontal";
  ctx.save();
  ctx.strokeStyle = "rgba(108, 231, 255, 0.9)";
  ctx.fillStyle = "rgba(108, 231, 255, 0.95)";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  drawArrow(ctx, a, b);
  if (isFrontal) {
    drawFrontalFlowGuides(ctx, canvas, config);
  }
  ctx.font = "bold 14px system-ui";
  ctx.fillText(isFrontal ? "A LEJOS" : "ORIGEN", clampPx(a.x - 34, canvas.width - 70), clampPx(a.y - 18, canvas.height - 18));
  ctx.fillText(isFrontal ? "B CERCA" : "DESTINO", clampPx(b.x - 38, canvas.width - 76), clampPx(b.y + 28, canvas.height - 14));
  ctx.fillStyle = "rgba(1, 8, 5, 0.72)";
  ctx.fillRect(10, 10, isFrontal ? 315 : 210, 28);
  ctx.fillStyle = "#eafff1";
  ctx.fillText(isFrontal ? `Frontal: FAR -> MID -> NEAR · Prox ${Math.round(frontalProximityThreshold(config) * 100)}%` : "Entrada: A -> B", 22, 30);
  ctx.restore();
}

function drawFrontalFlowGuides(ctx, canvas, config) {
  const bounds = roiBounds(config.roi);
  const yA = lineAxisMid(config.lineA, config) * canvas.height;
  const yB = lineAxisMid(config.lineB, config) * canvas.height;
  const left = bounds.left * canvas.width;
  const right = bounds.right * canvas.width;
  const lanes = [0.25, 0.5, 0.75];
  ctx.save();
  ctx.strokeStyle = "rgba(108, 231, 255, 0.65)";
  ctx.fillStyle = "rgba(108, 231, 255, 0.8)";
  ctx.lineWidth = 2;
  lanes.forEach((lane) => {
    const x = left + (right - left) * lane;
    drawArrow(ctx, { x, y: yA + 10 }, { x, y: yB - 10 });
  });
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
    state.dragging = { start: point, current: point, pointerId: event.pointerId, baseConfig: cloneConfig(draftConfig()) };
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
  const { start, current, baseConfig } = state.dragging;
  const config = draftConfig();
  if (state.activeTool === "lineA") {
    config.lineA = lineAt(config.lineOrientation === "horizontal" ? current.y : current.x, config);
  } else if (state.activeTool === "lineB") {
    config.lineB = lineAt(config.lineOrientation === "horizontal" ? current.y : current.x, config);
  } else if (state.activeTool === "linePair") {
    moveLinePair(config, baseConfig || config, start, current);
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

function moveLinePair(config, baseConfig, start, current) {
  const orientation = normalizeOrientation(config.lineOrientation);
  const axis = orientation === "horizontal" ? "y" : "x";
  const delta = current[axis] - start[axis];
  const baseA = linePosition(baseConfig.lineA, config);
  const baseB = linePosition(baseConfig.lineB, config);
  const [nextA, nextB] = constrainLinePair(baseA + delta, baseB + delta, config);
  config.lineA = lineAt(nextA, config);
  config.lineB = lineAt(nextB, config);
}

function centerLinePair(config) {
  const a = linePosition(config.lineA, config);
  const b = linePosition(config.lineB, config);
  const separation = Math.abs(a - b);
  const bounds = lineAxisBounds(config);
  const center = (bounds.min + bounds.max) / 2;
  const direction = a <= b ? 1 : -1;
  const [nextA, nextB] = constrainLinePair(
    center - (separation / 2) * direction,
    center + (separation / 2) * direction,
    config,
  );
  config.lineA = lineAt(nextA, config);
  config.lineB = lineAt(nextB, config);
}

function constrainLinePair(aPosition, bPosition, config) {
  const bounds = lineAxisBounds(config);
  const pairMin = Math.min(aPosition, bPosition);
  const pairMax = Math.max(aPosition, bPosition);
  let offset = 0;
  if (pairMin < bounds.min) offset = bounds.min - pairMin;
  if (pairMax + offset > bounds.max) offset = bounds.max - pairMax;
  return [
    clampNumber(aPosition + offset, bounds.min, bounds.max, aPosition),
    clampNumber(bPosition + offset, bounds.min, bounds.max, bPosition),
  ];
}

function lineAxisBounds(config) {
  const bounds = roiBounds(config.roi);
  if (normalizeOrientation(config.lineOrientation) === "horizontal") {
    return { min: bounds.top, max: bounds.bottom };
  }
  return { min: bounds.left, max: bounds.right };
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
  if (els.entryCandidateCount) els.entryCandidateCount.textContent = state.debugStats.entryCandidates;
  if (els.ignoredTrackCount) els.ignoredTrackCount.textContent = state.debugStats.ignoredTracks;
  if (els.entriesConfirmedCount) els.entriesConfirmedCount.textContent = state.count;
  state.debugStats.entriesConfirmed = state.count;
  state.debugStats.last1Minute = summary.last_1_minute;
  state.debugStats.last5Minutes = summary.last_5_minutes;
  state.debugStats.liveRatePerMinute = summary.live_rate_per_minute;
  state.debugStats.projectedPeoplePerHour = summary.projected_people_per_hour;
  state.debugStats.currentBucket = summary.current_bucket;
  renderTrackDebugList();
  if (state.realCount > 0) {
    const accuracy = Math.min(999.9, (state.count / state.realCount) * 100);
    els.accuracyValue.textContent = `${accuracy.toFixed(1)}%`;
  } else {
    els.accuracyValue.textContent = "--";
  }
}

function updateTrackDebugStats(tracks, visibleCount = state.debugStats.detectedPersons) {
  const mergedTracks = tracks.map((track) => {
    const stored = state.tracks.get(track.id) || {};
    return {
      id: track.id,
      ...stored,
      ...track,
      phase: stored.phase || track.phase,
      counted: Boolean(stored.counted || track.counted),
      crossedA: Boolean(stored.crossedA || track.crossedA),
      crossedB: Boolean(stored.crossedB || track.crossedB),
      originStatus: stored.originStatus || track.originStatus,
      originValid: Boolean(stored.originValid || track.originValid),
      ignoredEntry: Boolean(stored.ignoredEntry || track.ignoredEntry),
    };
  });
  state.debugStats.detectedPersons = visibleCount;
  state.debugStats.activeTracks = mergedTracks.length;
  state.debugStats.entryCandidates = mergedTracks.filter((track) => isEntryCandidate(track) && !isIgnoredTrack(track) && !track.counted).length;
  state.debugStats.ignoredTracks = mergedTracks.filter((track) => isIgnoredTrack(track)).length;
  state.debugStats.trackRows = mergedTracks
    .sort((left, right) => left.id - right.id)
    .slice(0, 12)
    .map((track) => trackDebugText(track));
}

function trackDebugText(track) {
  if (isFrontalMode(state.config)) {
    const edge = track.edgeExit && track.edgeExit !== "NONE" ? `EDGE ${track.edgeExit}` : "EDGE --";
    const motion = track.apparentMotion || "STABLE";
    const proximity = Math.round(Number(track.proximityScore || 0) * 100);
    const stateLabel = track.counted
      ? `COUNTED ${track.entryConfirmType || ""}`.trim()
      : isIgnoredTrack(track)
        ? `IGNORE ${track.ignoreReason || ""}`.trim()
        : String(track.phase || "new").toUpperCase();
    const visibility = track.predicted ? "OCULTO" : "VISIBLE";
    return `ID ${track.id} ${frontalZonePath(track)} ${motion} PROX ${proximity}% ${edge} ${stateLabel} ${visibility}`;
  }
  const originLabels = {
    valid: "ORIGEN OK",
    uncertain: "ORIGEN DUDOSO",
    destination: "DESDE B",
  };
  const dirLabels = {
    entry: "DIR A->B",
    reverse: "DIR B->A",
    none: "DIR --",
  };
  const origin = originLabels[track.originStatus] || "ORIGEN --";
  const direction = dirLabels[track.lastDirection] || "DIR --";
  const crossedA = track.crossedA || track.phase === "crossedA" || track.phase === "counted";
  const crossedB = track.crossedB || track.phase === "counted";
  const stateLabel = track.counted
    ? "COUNTED"
    : isIgnoredTrack(track)
      ? "NO CONTAR"
      : String(track.phase || "new").toUpperCase();
  const visibility = track.predicted ? "OCULTO" : "VISIBLE";
  return `ID ${track.id} ${origin} ${direction} A ${crossedA ? "SI" : "NO"} B ${crossedB ? "SI" : "NO"} ${stateLabel} ${visibility}`;
}

function renderTrackDebugList() {
  if (!els.trackDebugList) return;
  const rows = state.debugStats.trackRows || [];
  els.trackDebugList.innerHTML = rows.length
    ? rows.map((row) => `<span>${escapeHtml(row)}</span>`).join("")
    : "<span>Sin tracks activos</span>";
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
  renderHistoryInsights(summary);
  renderHistoryCharts(summary);
}

function renderHistoryInsights(summary) {
  if (!els.historyInsights) return;
  const insights = buildHistoryInsights(summary);
  els.historyInsights.innerHTML = insights.map((item) => `
    <article>
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.detail)}</small>
    </article>
  `).join("");
}

function renderHistoryCharts(summary) {
  const hourlyItems = historyRowsForDisplay(summary).map((row) => ({
    label: row.hour,
    value: row.count,
    detail: `Cobertura ${row.coverage_percentage}%`,
  }));
  const recentItems = recentMinuteSeries(state.events).map((row) => ({
    label: row.label,
    value: row.count,
    detail: "cada 5 min",
  }));
  const ageItems = ageChartItems(state.events);
  const dayItems = dailyComparisonData().slice(-7).map((day) => ({
    label: formatDate(day.dateKey),
    value: day.count,
    detail: day.realCount > 0 ? `Real ${day.realCount}` : "Guardado",
  }));

  renderBarChart(els.hourlyChart, hourlyItems, "ingresos");
  renderBarChart(els.recentChart, recentItems, "ing.");
  renderBarChart(els.ageChart, ageItems, "pers.");
  renderBarChart(els.dailyChart, dayItems, "ing.");
}

function buildHistoryInsights(summary) {
  const accuracy = accuracySnapshot();
  const peak = summary.peak_hour && summary.peak_hour.count > 0
    ? { value: summary.peak_hour.hour, detail: `${summary.peak_hour.count} ingresos en la hora con mayor movimiento.` }
    : { value: "--", detail: "Aun no hay suficientes ingresos para definir hora pico." };

  return [
    {
      label: "Resultado del dia",
      value: String(summary.total_today),
      detail: "Entradas confirmadas por cruce valido.",
    },
    {
      label: "Hora pico",
      value: peak.value,
      detail: peak.detail,
    },
    {
      label: "Ritmo actual",
      value: `${summary.live_rate_per_minute}/min`,
      detail: `Proyeccion ${summary.projected_people_per_hour}/hora con la lectura reciente.`,
    },
    {
      label: "Grupos",
      value: String(summary.groups_count),
      detail: `Maximo ${summary.max_group_size}; promedio ${summary.average_group_size}.`,
    },
    {
      label: "Precision",
      value: accuracy.value,
      detail: accuracy.detail,
    },
    {
      label: "Lectura logica",
      value: trafficTrendLabel(summary),
      detail: trafficTrendDetail(summary),
    },
  ];
}

function renderBarChart(container, items, unit) {
  if (!container) return;
  const visibleItems = items.filter((item) => Number.isFinite(Number(item.value)));
  const maxValue = Math.max(1, ...visibleItems.map((item) => Number(item.value || 0)));
  const hasData = visibleItems.some((item) => Number(item.value) > 0);

  if (!visibleItems.length || !hasData) {
    container.innerHTML = '<div class="chart-empty">Sin datos para graficar todavia.</div>';
    return;
  }

  container.innerHTML = visibleItems.map((item) => {
    const value = Number(item.value || 0);
    const width = value > 0 ? Math.max(5, round((value / maxValue) * 100, 1)) : 0;
    return `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(item.label)}</span>
        <div class="bar-meter" aria-label="${escapeHtml(item.label)} ${value} ${escapeHtml(unit)}">
          <span style="width: ${width}%"></span>
        </div>
        <strong>${value}</strong>
        <small>${escapeHtml(item.detail || unit)}</small>
      </div>
    `;
  }).join("");
}

function historyRowsForDisplay(summary) {
  const rows = summary.hourly_summary.filter((item) => item.count > 0 || item.coverage_seconds > 0);
  if (rows.length) return rows;
  return summary.hourly_summary.slice(-1);
}

function ageChartItems(events) {
  const counts = ageCounts(events);
  return Object.entries(AGE_REPORT_LABELS).map(([key, label]) => ({
    label,
    value: counts[key] || 0,
    detail: "detectado",
  }));
}

function dailyComparisonData() {
  const days = new Map();
  Object.entries(state.days || {}).forEach(([dateKey, day]) => {
    const dayEvents = Array.isArray(day.events) ? day.events : [];
    days.set(dateKey, {
      dateKey,
      count: dayEvents.length || Number(day.count || 0),
      realCount: Number(day.realCount || 0),
    });
  });
  days.set(todayKey, {
    dateKey: todayKey,
    count: state.events.length,
    realCount: state.realCount,
  });
  return Array.from(days.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function recentMinuteSeries(events, now = new Date(), windowMinutes = 30, bucketMinutes = 5) {
  const endMs = bucketInfo(now, bucketMinutes).endMs;
  const startMs = endMs - windowMinutes * 60000;
  const rows = [];
  for (let cursor = startMs; cursor < endMs; cursor += bucketMinutes * 60000) {
    const next = cursor + bucketMinutes * 60000;
    const count = events.filter((event) => event.timestampMs >= cursor && event.timestampMs < next).length;
    const labelParts = guayaquilParts(new Date(cursor));
    rows.push({
      startMs: cursor,
      endMs: next,
      label: `${pad2(labelParts.hour)}:${pad2(labelParts.minute)}`,
      count,
    });
  }
  return rows;
}

function accuracySnapshot() {
  if (state.realCount <= 0) {
    return {
      value: "--",
      detail: "Ingresa el conteo real para comparar la precision.",
      percentage: null,
      difference: null,
    };
  }
  const difference = state.count - state.realCount;
  const percentage = round((state.count / state.realCount) * 100, 1);
  const sign = difference > 0 ? "+" : "";
  return {
    value: `${percentage}%`,
    detail: `Diferencia ${sign}${difference} frente al conteo real.`,
    percentage,
    difference,
  };
}

function trafficTrendLabel(summary) {
  if (!summary.total_today) return "Sin flujo";
  if (summary.last_15_minutes > 0) return "Activo";
  if (summary.last_30_minutes > 0) return "Bajo";
  return "Sin movimiento";
}

function trafficTrendDetail(summary) {
  const rows = historyRowsForDisplay(summary).filter((row) => row.coverage_seconds > 0 || row.count > 0);
  const current = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  if (!summary.total_today) return "El reporte queda listo cuando existan entradas.";
  if (!current || !previous || previous.count === 0) {
    return `Ultimos 15 min: ${summary.last_15_minutes}; ultimos 30 min: ${summary.last_30_minutes}.`;
  }
  const diff = current.count - previous.count;
  if (diff > 0) return `Subio ${diff} ingreso(s) frente a la hora anterior.`;
  if (diff < 0) return `Bajo ${Math.abs(diff)} ingreso(s) frente a la hora anterior.`;
  return "Se mantiene igual que la hora anterior.";
}

function downloadDailyReport() {
  ensureCurrentDay();
  const summary = buildDailySummary(state.events, state.sessions);
  const pdf = buildReportPdf(summary);
  downloadBlob(pdf, "application/pdf", `reporte-afluencia-${todayKey}.pdf`);
  setStatus("PDF descargado");
}

function downloadEventsCsv() {
  ensureCurrentDay();
  const csv = buildEventsCsv();
  downloadBlob(`\ufeff${csv}`, "text/csv;charset=utf-8", `historial-afluencia-${todayKey}.csv`);
  setStatus("CSV descargado");
}

function buildEventsCsv() {
  const headers = [
    "fecha",
    "hora",
    "evento",
    "track_id",
    "modo_conteo",
    "confirmacion",
    "proximidad",
    "borde_salida",
    "zonas",
    "movimiento",
    "grupo_edad",
    "confianza_edad",
    "total_acumulado",
    "segundos_desde_anterior",
    "grupo_id",
    "tamano_grupo",
    "camara",
  ];
  const rows = [...state.events]
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((event) => [
      event.date || formatDate(event.dateKey || todayKey),
      formatClock(event.timestampMs),
      event.event || "ENTRY",
      event.track_id ?? "",
      event.counting_mode || "",
      event.confirmation_type || "",
      event.proximity_score ?? "",
      event.edge_exit || "",
      event.zone_path || "",
      event.apparent_motion || "",
      event.age_group || "SIN_DETERMINAR",
      event.age_confidence ?? "",
      event.total_count ?? "",
      event.seconds_since_previous_entry ?? "",
      event.group_id ?? "",
      event.group_size ?? "",
      event.camera || CAMERA_NAME,
    ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function buildReportPdf(summary) {
  const pdf = createPdfDocument();
  const accuracy = accuracySnapshot();
  const hourlyRows = historyRowsForDisplay(summary);
  const events = [...state.events].sort((a, b) => a.timestampMs - b.timestampMs);
  const recentItems = recentMinuteSeries(state.events).map((item) => ({ label: item.label, value: item.count }));
  const ageItems = ageChartItems(state.events);
  const dayItems = dailyComparisonData().slice(-14).map((item) => ({ label: formatDate(item.dateKey), value: item.count }));

  pdf.addHeader("Reporte de historial", [
    `Fecha: ${formatDate(todayKey)}`,
    `Camara: ${CAMERA_NAME}`,
    `Zona horaria: ${REPORT_TIMEZONE}`,
    `Generado: ${formatDateTime(Date.now())}`,
    `Version: ${REPORT_BUILD_VERSION}`,
  ]);

  pdf.addCards([
    { label: "Ingresos hoy", value: summary.total_today, detail: "Entradas confirmadas por la logica A/B." },
    {
      label: "Hora pico",
      value: summary.peak_hour && summary.peak_hour.count > 0 ? summary.peak_hour.hour : "--",
      detail: summary.peak_hour && summary.peak_hour.count > 0 ? `${summary.peak_hour.count} ingresos.` : "Sin hora pico definida.",
    },
    { label: "Promedio por hora", value: `${summary.average_people_per_hour}/h`, detail: "Sobre horas con camara activa." },
    { label: "Ultimos 30 min", value: summary.last_30_minutes, detail: "Movimiento reciente registrado." },
    { label: "Grupo maximo", value: summary.max_group_size, detail: `Promedio de grupo ${summary.average_group_size}.` },
    { label: "Precision", value: accuracy.value, detail: accuracy.detail },
  ]);

  pdf.addSection("Resultados logicos");
  pdf.addInsightGrid(buildHistoryInsights(summary));

  pdf.addSection("Graficos");
  pdf.addBarChart("Ingresos por hora", hourlyRows.map((item) => ({ label: item.hour, value: item.count })), "ingresos");
  pdf.addBarChart("Ultimos 30 minutos", recentItems, "ingresos");
  pdf.addBarChart("Clasificacion detectada", ageItems, "personas");
  pdf.addBarChart("Comparativo por dia", dayItems, "ingresos");

  pdf.addTable(
    "Resumen por hora",
    ["Hora", "Ingresos", "Cobertura", "Est. hora", "Min. pico", "Pico/min", "Grupo prom."],
    hourlyRows.map((row) => [
      row.hour,
      row.count,
      `${row.coverage_percentage}%`,
      row.estimated_full_hour_count === null ? "--" : row.estimated_full_hour_count,
      row.peak_minute || "--",
      row.peak_people_per_minute,
      row.average_group_size,
    ]),
    [88, 58, 70, 70, 78, 62, 80],
  );

  pdf.addTable(
    "Detalle de entradas",
    ["#", "Hora", "Track", "Conf.", "Prox", "Borde", "Zonas", "Total"],
    events.map((event, index) => [
      index + 1,
      formatClock(event.timestampMs),
      event.track_id ?? "",
      event.confirmation_type || "",
      event.proximity_score === null || event.proximity_score === undefined ? "--" : `${Math.round(Number(event.proximity_score) * 100)}%`,
      event.edge_exit || "NONE",
      event.zone_path || "",
      event.total_count ?? index + 1,
    ]),
    [28, 50, 44, 78, 42, 58, 210, 42],
  );

  pdf.addTable(
    "Sesiones de camara",
    ["Sesion", "Camara", "Inicio", "Fin"],
    state.sessions.map((session) => [
      session.id ?? "",
      session.camera || CAMERA_NAME,
      formatDateTime(session.startMs),
      session.endMs ? formatDateTime(session.endMs) : "Activa",
    ]),
    [70, 120, 150, 150],
  );

  pdf.addNote("Lectura recomendada: usa el total diario como resultado principal. La proyeccion por hora es orientativa y depende de que la camara haya estado activa durante suficiente tiempo.");
  return pdf.output();
}

function createPdfDocument() {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const colors = {
    green: [0.027, 0.604, 0.271],
    ink: [0.063, 0.125, 0.094],
    muted: [0.373, 0.455, 0.416],
    line: [0.851, 0.898, 0.867],
    panel: [0.961, 0.984, 0.969],
    softGreen: [0.933, 0.976, 0.949],
    white: [1, 1, 1],
  };
  const pages = [];
  let page = null;
  let y = margin;

  addPage();

  function addPage() {
    page = { ops: [] };
    pages.push(page);
    y = margin;
    drawFooter();
  }

  function addHeader(title, details) {
    ensureSpace(128);
    drawText("AFLUENCIA COUNTER", margin, y, 9, { bold: true, color: colors.green });
    y += 17;
    drawText(title, margin, y, 25, { bold: true, color: colors.ink });
    y += 24;
    details.forEach((line) => {
      drawText(line, margin, y, 9, { color: colors.muted });
      y += 12;
    });
    y += 7;
    drawLine(margin, y, pageWidth - margin, y, colors.green, 1.4);
    y += 22;
  }

  function addSection(title) {
    ensureSpace(34);
    drawText(title, margin, y, 14, { bold: true, color: colors.ink });
    y += 17;
    drawLine(margin, y, pageWidth - margin, y, colors.line, 0.7);
    y += 12;
  }

  function addCards(cards) {
    const gap = 10;
    const columns = 3;
    const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
    const cardHeight = 76;
    for (let index = 0; index < cards.length; index += columns) {
      ensureSpace(cardHeight + 12);
      cards.slice(index, index + columns).forEach((card, offset) => {
        const x = margin + offset * (cardWidth + gap);
        drawRect(x, y, cardWidth, cardHeight, colors.white, colors.line);
        drawText(card.label, x + 10, y + 16, 8, { bold: true, color: colors.muted });
        const value = String(card.value ?? "--");
        const valueSize = value.length > 10 ? 15 : value.length > 6 ? 19 : 28;
        drawText(value, x + 10, y + 43, valueSize, { bold: true, color: colors.green });
        drawWrappedText(card.detail, x + 10, y + 60, cardWidth - 20, 7.5, { color: colors.muted, maxLines: 2 });
      });
      y += cardHeight + 12;
    }
  }

  function addInsightGrid(items) {
    const gap = 10;
    const columns = 2;
    const itemWidth = (contentWidth - gap) / columns;
    const itemHeight = 76;
    if (!items.length) {
      ensureSpace(24);
      drawText("Sin resultados todavia.", margin, y, 10, { color: colors.muted });
      y += 20;
      return;
    }
    for (let index = 0; index < items.length; index += columns) {
      ensureSpace(itemHeight + 10);
      items.slice(index, index + columns).forEach((item, offset) => {
        const x = margin + offset * (itemWidth + gap);
        drawRect(x, y, itemWidth, itemHeight, colors.panel, colors.line);
        drawText(item.label, x + 10, y + 15, 8, { bold: true, color: colors.muted });
        drawText(item.value, x + 10, y + 36, 15, { bold: true, color: colors.ink });
        drawWrappedText(item.detail, x + 10, y + 53, itemWidth - 20, 7.5, { color: colors.muted, maxLines: 2 });
      });
      y += itemHeight + 10;
    }
  }

  function addBarChart(title, items, unit) {
    const visible = items
      .filter((item) => Number.isFinite(Number(item.value)))
      .map((item) => ({ label: item.label, value: Number(item.value || 0) }));
    const hasData = visible.some((item) => item.value > 0);
    ensureSpace(44);
    drawText(title, margin, y, 12, { bold: true, color: colors.ink });
    y += 17;

    if (!visible.length || !hasData) {
      drawRect(margin, y, contentWidth, 28, colors.panel, colors.line);
      drawText("Sin datos para graficar todavia.", margin + 10, y + 18, 9, { color: colors.muted });
      y += 40;
      return;
    }

    const maxValue = Math.max(1, ...visible.map((item) => item.value));
    const labelWidth = 112;
    const valueWidth = 46;
    const barWidth = contentWidth - labelWidth - valueWidth - 12;
    const rowHeight = 18;

    visible.forEach((item) => {
      ensureSpace(rowHeight + 8);
      const barX = margin + labelWidth;
      const barY = y + 3;
      const fillWidth = item.value > 0 ? Math.max(4, (item.value / maxValue) * barWidth) : 0;
      drawText(fitPdfText(item.label, labelWidth - 8, 8), margin, y + 12, 8, { color: colors.ink });
      drawRect(barX, barY, barWidth, 8, colors.panel, colors.line);
      if (fillWidth > 0) {
        drawRect(barX, barY, fillWidth, 8, colors.green, null);
      }
      drawText(`${item.value} ${unit}`, barX + barWidth + 8, y + 12, 8, { bold: true, color: colors.green });
      y += rowHeight;
    });
    y += 12;
  }

  function addTable(title, headers, rows, widths) {
    addSection(title);
    const tableRows = rows.length ? rows : [["Sin datos registrados."]];
    const rowHeight = 20;
    const headerHeight = 22;

    const drawHeaderRow = () => {
      ensureSpace(headerHeight + rowHeight);
      drawRect(margin, y, contentWidth, headerHeight, colors.softGreen, colors.line);
      let x = margin;
      headers.forEach((header, index) => {
        drawText(fitPdfText(header, widths[index] - 6, 7.2), x + 4, y + 14, 7.2, { bold: true, color: colors.ink });
        x += widths[index];
      });
      y += headerHeight;
    };

    drawHeaderRow();
    tableRows.forEach((row, rowIndex) => {
      if (y + rowHeight > pageHeight - margin - 18) {
        addPage();
        drawText(`${title} cont.`, margin, y, 11, { bold: true, color: colors.ink });
        y += 17;
        drawHeaderRow();
      }
      const background = rowIndex % 2 === 0 ? colors.white : colors.panel;
      drawRect(margin, y, contentWidth, rowHeight, background, colors.line);
      let x = margin;
      headers.forEach((_header, index) => {
        const cell = row[index] ?? "";
        drawText(fitPdfText(cell, widths[index] - 6, 7.4), x + 4, y + 13, 7.4, { color: colors.ink });
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 14;
  }

  function addNote(value) {
    ensureSpace(58);
    drawRect(margin, y, contentWidth, 44, colors.softGreen, colors.green);
    drawWrappedText(value, margin + 12, y + 16, contentWidth - 24, 9, { color: colors.ink, maxLines: 3 });
    y += 58;
  }

  function ensureSpace(required) {
    if (y + required <= pageHeight - margin - 18) return;
    addPage();
  }

  function drawFooter() {
    const footerY = pageHeight - 21;
    drawLine(margin, footerY - 10, pageWidth - margin, footerY - 10, colors.line, 0.5);
    drawText(`Afluencia Counter - Pagina ${pages.length}`, margin, footerY, 8, { color: colors.muted });
  }

  function drawWrappedText(value, x, top, maxWidth, size, options = {}) {
    const lines = wrapPdfText(value, maxWidth, size).slice(0, options.maxLines || 99);
    const lineHeight = options.lineHeight || size * 1.25;
    lines.forEach((line, index) => {
      drawText(line, x, top + index * lineHeight, size, options);
    });
    return top + lines.length * lineHeight;
  }

  function drawText(value, x, top, size, options = {}) {
    const font = options.bold ? "/F2" : "/F1";
    const color = pdfRgb(options.color || colors.ink);
    page.ops.push(`BT ${color} rg ${font} ${pdfNum(size)} Tf 1 0 0 1 ${pdfNum(x)} ${pdfNum(pageHeight - top)} Tm (${escapePdfText(value)}) Tj ET`);
  }

  function drawRect(x, top, width, height, fillColor, strokeColor) {
    const left = pdfNum(x);
    const bottom = pdfNum(pageHeight - top - height);
    const rect = `${left} ${bottom} ${pdfNum(width)} ${pdfNum(height)} re`;
    if (fillColor && strokeColor) {
      page.ops.push(`${pdfRgb(fillColor)} rg ${pdfRgb(strokeColor)} RG 0.6 w ${rect} B`);
    } else if (fillColor) {
      page.ops.push(`${pdfRgb(fillColor)} rg ${rect} f`);
    } else if (strokeColor) {
      page.ops.push(`${pdfRgb(strokeColor)} RG 0.6 w ${rect} S`);
    }
  }

  function drawLine(x1, top1, x2, top2, color, width) {
    page.ops.push(`${pdfRgb(color)} RG ${pdfNum(width)} w ${pdfNum(x1)} ${pdfNum(pageHeight - top1)} m ${pdfNum(x2)} ${pdfNum(pageHeight - top2)} l S`);
  }

  function output() {
    const pageIds = pages.map((_item, index) => 3 + index * 2);
    const fontNormalId = 3 + pages.length * 2;
    const fontBoldId = fontNormalId + 1;
    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

    pages.forEach((item, index) => {
      const pageId = pageIds[index];
      const contentId = pageId + 1;
      const content = item.ops.join("\n");
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNum(pageWidth)} ${pdfNum(pageHeight)}] /Resources << /Font << /F1 ${fontNormalId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });

    objects[fontNormalId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[fontBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let index = 1; index < objects.length; index += 1) {
      offsets[index] = pdf.length;
      pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let index = 1; index < objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return pdf;
  }

  return { addHeader, addSection, addCards, addInsightGrid, addBarChart, addTable, addNote, output };
}

function wrapPdfText(value, maxWidth, size) {
  const text = normalizePdfText(value);
  const maxChars = Math.max(8, Math.floor(maxWidth / Math.max(1, size * 0.52)));
  const lines = [];
  text.split(/\s+/).filter(Boolean).forEach((word) => {
    let current = lines.pop() || "";
    if (!current) {
      while (word.length > maxChars) {
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      lines.push(word);
      return;
    }
    const next = `${current} ${word}`;
    if (next.length <= maxChars) {
      lines.push(next);
    } else {
      lines.push(current);
      while (word.length > maxChars) {
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      lines.push(word);
    }
  });
  return lines.length ? lines : [""];
}

function fitPdfText(value, maxWidth, size) {
  const text = normalizePdfText(value);
  const maxChars = Math.max(4, Math.floor(maxWidth / Math.max(1, size * 0.52)));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 3))}...`;
}

function normalizePdfText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("→", "->")
    .replaceAll("←", "<-")
    .replaceAll("·", "-")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdfText(value) {
  return normalizePdfText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function pdfRgb(color) {
  return color.map((value) => pdfNum(value)).join(" ");
}

function pdfNum(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function buildReportHtml(summary) {
  const generatedAt = formatDateTime(Date.now());
  const rows = historyRowsForDisplay(summary);
  const events = [...state.events].sort((a, b) => a.timestampMs - b.timestampMs);
  const recentItems = recentMinuteSeries(state.events).map((item) => ({ label: item.label, value: item.count }));
  const ageItems = ageChartItems(state.events);
  const dayItems = dailyComparisonData().slice(-14).map((item) => ({ label: formatDate(item.dateKey), value: item.count }));
  const insights = buildHistoryInsights(summary);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reporte de afluencia ${escapeHtml(formatDate(todayKey))}</title>
  <style>
    :root { color-scheme: light; --green: #079a45; --ink: #102018; --muted: #5f746a; --line: #d9e5dd; --panel: #f5fbf7; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7faf8; color: var(--ink); font-family: Arial, Helvetica, sans-serif; }
    main { width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 36px; }
    header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; border-bottom: 2px solid var(--green); padding-bottom: 18px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    h2 { margin: 26px 0 12px; font-size: 18px; }
    p { margin: 4px 0; color: var(--muted); }
    .tag { color: var(--green); font-weight: 700; text-transform: uppercase; font-size: 12px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
    .card, .chart, .insight { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
    .card span, .insight span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 700; }
    .card strong { display: block; margin-top: 6px; color: var(--green); font-size: 30px; line-height: 1; }
    .card small, .insight small { display: block; margin-top: 8px; color: var(--muted); line-height: 1.35; }
    .insights { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .insight strong { display: block; margin-top: 5px; font-size: 20px; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .chart svg { width: 100%; height: auto; display: block; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { padding: 9px 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 12px; }
    th { background: var(--panel); color: #2c4938; text-transform: uppercase; font-size: 11px; }
    tr:last-child td { border-bottom: 0; }
    .note { margin-top: 14px; padding: 12px 14px; border-left: 4px solid var(--green); background: #eef9f2; color: #31513d; }
    @media print { main { width: 100%; padding: 0; } .card, .chart, .insight, table { break-inside: avoid; } }
    @media (max-width: 760px) { .cards, .charts, .insights { grid-template-columns: 1fr; } header { display: block; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <span class="tag">Afluencia Counter</span>
        <h1>Reporte de historial</h1>
        <p>Fecha: ${escapeHtml(formatDate(todayKey))}</p>
        <p>Camara: ${escapeHtml(CAMERA_NAME)} · Zona horaria: ${escapeHtml(REPORT_TIMEZONE)}</p>
      </div>
      <div>
        <p>Generado: ${escapeHtml(generatedAt)}</p>
        <p>Version: ${escapeHtml(REPORT_BUILD_VERSION)}</p>
      </div>
    </header>

    <section class="cards">
      ${reportCard("Ingresos hoy", summary.total_today, "Entradas confirmadas por la logica A/B.")}
      ${reportCard("Hora pico", summary.peak_hour && summary.peak_hour.count > 0 ? summary.peak_hour.hour : "--", summary.peak_hour && summary.peak_hour.count > 0 ? `${summary.peak_hour.count} ingresos.` : "Sin hora pico definida.")}
      ${reportCard("Promedio por hora", `${summary.average_people_per_hour}/h`, "Calculado sobre horas con camara activa.")}
      ${reportCard("Ultimos 30 min", summary.last_30_minutes, "Movimiento reciente registrado.")}
      ${reportCard("Grupo maximo", summary.max_group_size, `Promedio de grupo ${summary.average_group_size}.`)}
      ${reportCard("Precision", accuracySnapshot().value, accuracySnapshot().detail)}
    </section>

    <h2>Resultados logicos</h2>
    <section class="insights">
      ${insights.map((item) => `
        <article class="insight">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </article>
      `).join("")}
    </section>

    <h2>Graficos</h2>
    <section class="charts">
      <article class="chart">
        <h2>Ingresos por hora</h2>
        ${buildReportBarSvg(rows.map((item) => ({ label: item.hour, value: item.count })), "ingresos")}
      </article>
      <article class="chart">
        <h2>Ultimos 30 minutos</h2>
        ${buildReportBarSvg(recentItems, "ingresos")}
      </article>
      <article class="chart">
        <h2>Clasificacion detectada</h2>
        ${buildReportBarSvg(ageItems, "personas")}
      </article>
      <article class="chart">
        <h2>Comparativo por dia</h2>
        ${buildReportBarSvg(dayItems, "ingresos")}
      </article>
    </section>

    <h2>Resumen por hora</h2>
    ${buildHourlyTable(rows)}

    <h2>Detalle de entradas</h2>
    ${buildEventsTable(events)}

    <h2>Sesiones de camara</h2>
    ${buildSessionsTable(state.sessions)}

    <p class="note">Lectura recomendada: usa el total diario como resultado principal. La proyeccion por hora es orientativa y depende de que la camara haya estado activa durante suficiente tiempo.</p>
  </main>
</body>
</html>`;
}

function reportCard(label, value, detail) {
  return `<article class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function buildReportBarSvg(items, unit) {
  const visible = items.filter((item) => Number.isFinite(Number(item.value)));
  const hasData = visible.some((item) => Number(item.value) > 0);
  if (!visible.length || !hasData) {
    return '<p>Sin datos para graficar todavia.</p>';
  }
  const width = 720;
  const height = 260;
  const padding = { left: 46, right: 18, top: 18, bottom: 54 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...visible.map((item) => Number(item.value || 0)));
  const barGap = Math.max(6, 16 - visible.length);
  const barWidth = Math.max(12, (plotWidth - barGap * (visible.length - 1)) / visible.length);
  const bars = visible.map((item, index) => {
    const value = Number(item.value || 0);
    const barHeight = (value / maxValue) * plotHeight;
    const x = padding.left + index * (barWidth + barGap);
    const y = padding.top + plotHeight - barHeight;
    const label = String(item.label || "");
    return `
      <rect x="${round(x, 2)}" y="${round(y, 2)}" width="${round(barWidth, 2)}" height="${round(barHeight, 2)}" rx="4" fill="#079a45"></rect>
      <text x="${round(x + barWidth / 2, 2)}" y="${round(y - 6, 2)}" text-anchor="middle" font-size="12" font-weight="700" fill="#102018">${value}</text>
      <text x="${round(x + barWidth / 2, 2)}" y="${height - 28}" text-anchor="middle" font-size="10" fill="#5f746a" transform="rotate(-35 ${round(x + barWidth / 2, 2)} ${height - 28})">${escapeHtml(label)}</text>
    `;
  }).join("");

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico de ${escapeHtml(unit)}">
    <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#f5fbf7"></rect>
    <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#b8c9bf"></line>
    <text x="${padding.left}" y="14" font-size="11" fill="#5f746a">Max ${maxValue} ${escapeHtml(unit)}</text>
    ${bars}
  </svg>`;
}

function buildHourlyTable(rows) {
  const body = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.hour)}</td>
        <td>${row.count}</td>
        <td>${row.coverage_percentage}%</td>
        <td>${row.estimated_full_hour_count === null ? "--" : row.estimated_full_hour_count}</td>
        <td>${row.peak_minute || "--"}</td>
        <td>${row.peak_people_per_minute}</td>
        <td>${row.average_group_size}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="7">Sin entradas todavia.</td></tr>';
  return `<table>
    <thead><tr><th>Hora</th><th>Ingresos</th><th>Cobertura</th><th>Est. hora</th><th>Min. pico</th><th>Pico/min</th><th>Grupo prom.</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function buildEventsTable(events) {
  const body = events.length
    ? events.map((event, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatClock(event.timestampMs))}</td>
        <td>${escapeHtml(event.track_id ?? "")}</td>
        <td>${escapeHtml(event.confirmation_type || "")}</td>
        <td>${event.proximity_score === null || event.proximity_score === undefined ? "--" : `${Math.round(Number(event.proximity_score) * 100)}%`}</td>
        <td>${escapeHtml(event.edge_exit || "NONE")}</td>
        <td>${escapeHtml(event.zone_path || "")}</td>
        <td>${escapeHtml(event.total_count ?? index + 1)}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="8">Sin entradas todavia.</td></tr>';
  return `<table>
    <thead><tr><th>#</th><th>Hora</th><th>Track ID</th><th>Confirmacion</th><th>Prox.</th><th>Borde</th><th>Zonas</th><th>Total</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function buildSessionsTable(sessions) {
  const body = sessions.length
    ? sessions.map((session) => `
      <tr>
        <td>${escapeHtml(session.id ?? "")}</td>
        <td>${escapeHtml(session.camera || CAMERA_NAME)}</td>
        <td>${escapeHtml(formatDateTime(session.startMs))}</td>
        <td>${escapeHtml(session.endMs ? formatDateTime(session.endMs) : "Activa")}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="4">Sin sesiones guardadas.</td></tr>';
  return `<table>
    <thead><tr><th>Sesion</th><th>Camara</th><th>Inicio</th><th>Fin</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function formatClock(ms) {
  if (!Number.isFinite(Number(ms))) return "--";
  const parts = guayaquilParts(new Date(ms));
  return `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

function formatDateTime(ms) {
  if (!Number.isFinite(Number(ms))) return "--";
  const parts = guayaquilParts(new Date(ms));
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
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
    if (applyFastCountingMigration(state.config, saved.config)) {
      state.calibrationDraft = cloneConfig(state.config);
      saveState();
    }
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
  if (isFrontalMode(config)
    && isEntryCandidate(track)
    && frontalVisited(track, "MID")
    && (frontalEdgeCompatible(track, config) || Number(track.proximityScore || 0) >= frontalProximityThreshold(config) - 0.12)) {
    return true;
  }
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
      counting_mode: event.counting_mode || "",
      confirmation_type: event.confirmation_type || "",
      proximity_score: Number.isFinite(Number(event.proximity_score)) ? Number(event.proximity_score) : null,
      edge_exit: event.edge_exit || "NONE",
      zone_path: event.zone_path || "",
      apparent_motion: event.apparent_motion || "",
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
      counting_mode: "LEGACY",
      confirmation_type: "LEGACY",
      proximity_score: null,
      edge_exit: "NONE",
      zone_path: "",
      apparent_motion: "",
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

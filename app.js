const DEFAULT_CONFIG = {
  lineA: [{ x: 0.38, y: 0.12 }, { x: 0.38, y: 0.92 }],
  lineB: [{ x: 0.62, y: 0.12 }, { x: 0.62, y: 0.92 }],
  roi: [{ x: 0.08, y: 0.12 }, { x: 0.92, y: 0.12 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }],
  entryDirection: "LEFT_TO_RIGHT",
  lineOrientation: "vertical",
};

const ENTRY_SEQUENCES = {
  LEFT_TO_RIGHT: ["A", "B"],
  RIGHT_TO_LEFT: ["B", "A"],
};

const DETECTION_THRESHOLD = 0.30;
const TRACK_MATCH_DISTANCE = 180;
const TRACK_TTL_MS = 2600;
const REPORT_TIMEZONE = "America/Guayaquil";
const TIME_BUCKET_MINUTES = 60;
const LIVE_RATE_WINDOW_MINUTES = 5;
const GROUP_WINDOW_SECONDS = 2;
const CAMERA_NAME = "ENTRADA_01";

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
  calibrationEmpty: document.querySelector("#calibrationEmpty"),
  countValue: document.querySelector("#countValue"),
  detectedCount: document.querySelector("#detectedCount"),
  activeTrackCount: document.querySelector("#activeTrackCount"),
  realCount: document.querySelector("#realCount"),
  accuracyValue: document.querySelector("#accuracyValue"),
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
  restoreCalibration: document.querySelector("#restoreCalibration"),
  statusText: document.querySelector("#statusText"),
  statusPill: document.querySelector("#statusPill"),
  viewTitle: document.querySelector("#viewTitle"),
};

let todayKey = guayaquilDateKey(new Date());

loadState();
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

  els.saveCalibration.addEventListener("click", () => {
    saveState();
    setStatus("Calibrado");
  });

  els.restoreCalibration.addEventListener("click", () => {
    state.config = cloneConfig(DEFAULT_CONFIG);
    saveState();
    renderAll();
    setStatus("Restaurado");
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

async function startCamera() {
  try {
    setStatus("Cargando");
    await loadModel();
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    [els.camera, els.calibrationMirror, els.helpMirror].forEach((video) => {
      video.srcObject = state.stream;
      video.play();
    });
    state.running = true;
    startSession();
    els.videoEmpty.hidden = true;
    els.calibrationEmpty.hidden = true;
    els.toggleCamera.innerHTML = '<span class="icon">■</span><span>Detener</span>';
    setStatus("Contando");
    requestAnimationFrame(loop);
  } catch (error) {
    setStatus("Sin camara");
    alert("No pude abrir la camara. Revisa que el navegador tenga permiso de camara.\n\n" + error.message);
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
  els.toggleCamera.innerHTML = '<span class="icon">▶</span><span>Iniciar</span>';
  setStatus("Detenido");
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
    const tracks = updateTracks(people);
    state.debugStats.detectedPersons = people.length;
    state.debugStats.activeTracks = tracks.length;
    updateCount(tracks);
    renderDebugMetrics();
    logDebugCounts(people.length, tracks.length);
    drawOverlay(els.overlay, tracks);
    drawOverlay(els.calibrationOverlay, tracks);
    drawOverlay(els.helpOverlay, tracks);
    maybeSendFrameToLocalProcessor();
  }
  requestAnimationFrame(loop);
}

function updateTracks(detections) {
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

  return active.filter((track) => pointInPolygon(track.point, state.config.roi));
}

function updateCount(tracks) {
  tracks.forEach((track) => {
    const stored = state.tracks.get(track.id);
    if (!stored || stored.counted || !track.previousPoint) return;

    orderedCrossings(track.previousPoint, track.point).forEach((crossing) => {
      console.debug(`Track ${track.id} crossed ${crossing}`);
      if (applyCrossing(stored, crossing)) {
        registerEntry(track);
        console.debug(`Track ${track.id} ENTRY CONFIRMED`);
        saveState();
        renderAll();
        setStatus("Entrada");
      }
    });
  });
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

function orderedCrossings(previous, current) {
  const crossed = [];
  if (crossedLine(previous, current, state.config.lineA)) {
    crossed.push({ name: "A", x: lineMidX(state.config.lineA) });
  }
  if (crossedLine(previous, current, state.config.lineB)) {
    crossed.push({ name: "B", x: lineMidX(state.config.lineB) });
  }
  const dx = current.x - previous.x;
  crossed.sort((left, right) => (dx < 0 ? right.x - left.x : left.x - right.x));
  return crossed.map((item) => item.name);
}

function applyCrossing(track, crossing) {
  if (track.counted || track.phase === "counted" || track.phase === "exit") return false;

  const [firstLine, secondLine] = ENTRY_SEQUENCES[state.config.entryDirection] || ENTRY_SEQUENCES.LEFT_TO_RIGHT;
  const crossingPhase = crossing === "A" ? "crossedA" : "crossedB";
  const firstPhase = firstLine === "A" ? "crossedA" : "crossedB";
  const secondPhase = secondLine === "A" ? "crossedA" : "crossedB";

  if (track.phase === "new") {
    track.phase = crossingPhase;
    return false;
  }

  if (track.phase === crossingPhase) {
    track.phase = "new";
    return false;
  }

  if (track.phase === firstPhase && crossing === secondLine) {
    track.phase = "counted";
    track.counted = true;
    return true;
  }

  if (track.phase === secondPhase && crossing === firstLine) {
    track.phase = "exit";
    return false;
  }

  return false;
}

function lineMidX(line) {
  return (line[0].x + line[1].x) / 2;
}

function verticalLineAt(x) {
  const bounds = roiBounds(state.config.roi);
  return [{ x: clamp(x), y: bounds.top }, { x: clamp(x), y: bounds.bottom }];
}

function roiBounds(roi) {
  const ys = roi.map((point) => point.y);
  return {
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
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

function normalizeConfig(config) {
  const normalized = cloneConfig(DEFAULT_CONFIG);
  if (!config || typeof config !== "object") return normalized;

  if (isRoi(config.roi)) {
    normalized.roi = config.roi;
  }

  if (config.lineOrientation === "vertical") {
    if (isLine(config.lineA)) normalized.lineA = config.lineA;
    if (isLine(config.lineB)) normalized.lineB = config.lineB;
  }

  if (ENTRY_SEQUENCES[config.entryDirection]) {
    normalized.entryDirection = config.entryDirection;
  }
  return normalized;
}

function drawOverlay(canvas, tracks) {
  const video = els.camera.videoWidth ? els.camera : null;
  if (!video) return;

  resizeCanvas(canvas, video.videoWidth, video.videoHeight);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoi(ctx, state.config.roi, canvas);
  drawLine(ctx, state.config.lineA, canvas, "#15f070", "LINEA A");
  drawLine(ctx, state.config.lineB, canvas, "#f7bd31", "LINEA B");

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
  drawOverlay(els.calibrationOverlay, []);
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
  ctx.font = "14px system-ui";
  ctx.fillText(label, a.x + 8, a.y - 8);
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
    const point = pointerToNorm(event, canvas);
    state.dragging = { start: point, current: point };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    state.dragging.current = pointerToNorm(event, canvas);
    applyDragGeometry();
    drawCalibration();
  });
  canvas.addEventListener("pointerup", () => {
    if (!state.dragging) return;
    applyDragGeometry();
    state.dragging = null;
    saveState();
    drawCalibration();
  });
}

function applyDragGeometry() {
  const { start, current } = state.dragging;
  if (state.activeTool === "lineA") {
    state.config.lineA = verticalLineAt(current.x);
  } else if (state.activeTool === "lineB") {
    state.config.lineB = verticalLineAt(current.x);
  } else {
    const left = Math.min(start.x, current.x);
    const right = Math.max(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const bottom = Math.max(start.y, current.y);
    state.config.roi = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  }
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item.id === `view-${view}`));
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const titles = { count: "Conteo", calibrate: "Calibrador", history: "Historial", help: "Primeros pasos" };
  els.viewTitle.textContent = titles[view] || "Conteo";
  renderAll();
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function renderAll() {
  state.count = state.events.length;
  const summary = buildDailySummary(state.events, state.sessions);
  els.countValue.textContent = state.count;
  els.todayLabel.textContent = formatDate(todayKey);
  els.historyTotal.textContent = state.count;
  els.historyDate.textContent = formatDate(todayKey);
  els.realCount.value = state.realCount;
  renderHistory(summary);
  renderDebugMetrics(summary);
  renderLiveSummary(summary);
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
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height),
  };
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function crossedLine(previous, current, line) {
  const a = { x: line[0].x * els.camera.videoWidth, y: line[0].y * els.camera.videoHeight };
  const b = { x: line[1].x * els.camera.videoWidth, y: line[1].y * els.camera.videoHeight };
  const dx = current.x - previous.x;
  if (Math.abs(dx) < 1) return false;

  const gateX = (a.x + b.x) / 2;
  const crossedX = (previous.x < gateX && current.x >= gateX) || (previous.x > gateX && current.x <= gateX);
  if (!crossedX) return false;

  const progress = (gateX - previous.x) / dx;
  if (progress < 0 || progress > 1) return false;

  const crossingY = previous.y + (current.y - previous.y) * progress;
  const top = Math.min(a.y, b.y) - 8;
  const bottom = Math.max(a.y, b.y) + 8;
  return crossingY >= top && crossingY <= bottom;
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

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

const state = {
  stream: null,
  model: null,
  running: false,
  count: 0,
  history: [],
  tracks: new Map(),
  nextTrackId: 1,
  activeView: "count",
  activeTool: "lineA",
  dragging: null,
  lastFrameSentAt: 0,
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
  todayLabel: document.querySelector("#todayLabel"),
  historyTotal: document.querySelector("#historyTotal"),
  historyDate: document.querySelector("#historyDate"),
  historyList: document.querySelector("#historyList"),
  toggleCamera: document.querySelector("#toggleCamera"),
  resetCount: document.querySelector("#resetCount"),
  saveCalibration: document.querySelector("#saveCalibration"),
  restoreCalibration: document.querySelector("#restoreCalibration"),
  statusText: document.querySelector("#statusText"),
  statusPill: document.querySelector("#statusPill"),
  viewTitle: document.querySelector("#viewTitle"),
};

const todayKey = new Date().toISOString().slice(0, 10);

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
    state.count = 0;
    state.tracks.clear();
    pushHistory("Reinicio", state.count);
    saveState();
    renderAll();
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
  els.videoEmpty.hidden = false;
  els.toggleCamera.innerHTML = '<span class="icon">▶</span><span>Iniciar</span>';
  setStatus("Detenido");
}

async function loadModel() {
  if (state.model) return;
  if (!window.cocoSsd) {
    throw new Error("No cargo el modelo de deteccion. Revisa internet y vuelve a abrir el link.");
  }
  state.model = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
}

async function loop() {
  if (!state.running) return;
  if (els.camera.videoWidth > 0) {
    const predictions = await state.model.detect(els.camera);
    const people = predictions
      .filter((item) => item.class === "person" && item.score >= 0.45)
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
    updateCount(tracks);
    drawOverlay(els.overlay, tracks);
    drawOverlay(els.calibrationOverlay, tracks);
    drawOverlay(els.helpOverlay, tracks);
    maybeSendFrameToLocalProcessor();
  }
  requestAnimationFrame(loop);
}

function updateTracks(detections) {
  const now = performance.now();
  const unmatched = detections.map((_, index) => index);
  const active = [];

  for (const [id, track] of state.tracks) {
    let bestDetection = -1;
    let bestDistance = 999999;
    unmatched.forEach((index) => {
      const center = bottomCenter(detections[index].box);
      const distance = Math.hypot(center.x - track.point.x, center.y - track.point.y);
      if (distance < bestDistance && distance < 120) {
        bestDistance = distance;
        bestDetection = index;
      }
    });
    if (bestDetection >= 0) {
      const detection = detections[bestDetection];
      const point = bottomCenter(detection.box);
      track.previousPoint = track.point;
      track.point = point;
      track.box = detection.box;
      track.score = detection.score;
      track.lastSeen = now;
      active.push({ id, ...track });
      unmatched.splice(unmatched.indexOf(bestDetection), 1);
    }
  }

  unmatched.forEach((index) => {
    const detection = detections[index];
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

  for (const [id, track] of state.tracks) {
    if (now - track.lastSeen > 1500) {
      state.tracks.delete(id);
    }
  }

  return active.filter((track) => pointInPolygon(track.point, state.config.roi));
}

function updateCount(tracks) {
  tracks.forEach((track) => {
    const stored = state.tracks.get(track.id);
    if (!stored || stored.counted || !track.previousPoint) return;

    orderedCrossings(track.previousPoint, track.point).forEach((crossing) => {
      if (applyCrossing(stored, crossing)) {
        state.count += 1;
        pushHistory("Entrada", state.count);
        saveState();
        renderAll();
        setStatus("Entrada");
      }
    });
  });
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
  els.countValue.textContent = state.count;
  els.todayLabel.textContent = formatDate(todayKey);
  els.historyTotal.textContent = state.count;
  els.historyDate.textContent = formatDate(todayKey);
  renderHistory();
  drawCalibration();
}

function renderHistory() {
  const rows = state.history.slice(-6).reverse();
  els.historyList.innerHTML = rows.length
    ? rows.map((item) => `<div class="history-row"><span>${item.label}<br><small>${item.time}</small></span><strong>${item.total}</strong></div>`).join("")
    : '<div class="history-row"><span>Sin entradas todavia</span><strong>0</strong></div>';
}

function loadState() {
  const saved = JSON.parse(localStorage.getItem("afluencia-counter") || "{}");
  if (saved.date === todayKey) {
    state.count = Number(saved.count || 0);
    state.history = Array.isArray(saved.history) ? saved.history : [];
  }
  if (saved.config) {
    state.config = normalizeConfig(saved.config);
  }
}

function saveState() {
  localStorage.setItem("afluencia-counter", JSON.stringify({
    date: todayKey,
    count: state.count,
    history: state.history,
    config: state.config,
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

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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

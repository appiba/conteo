const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function noop() {}

function fakeContext() {
  return new Proxy({}, {
    get(target, key) {
      if (!(key in target)) target[key] = noop;
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

class FakeElement {
  constructor(selector = "") {
    this.selector = selector;
    this.id = selector.startsWith("#") ? selector.slice(1) : "";
    this.dataset = {};
    this.style = { setProperty: noop, removeProperty: noop };
    this.classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
    this.children = [];
    this.hidden = false;
    this.value = "0";
    this.textContent = "";
    this.innerHTML = "";
    this.checked = false;
    this.disabled = false;
    this.width = 640;
    this.height = 480;
    this.videoWidth = 640;
    this.videoHeight = 480;
  }

  addEventListener() {}
  removeEventListener() {}
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  getContext() { return fakeContext(); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 480 }; }
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
}

function makeButton(dataset) {
  const button = new FakeElement("button");
  button.dataset = { ...dataset };
  return button;
}

const storage = new Map();
const elements = new Map();
const quickButtons = [
  makeButton({ quickCountMode: "ENTRY_ONLY" }),
  makeButton({ quickCountMode: "EXIT_ONLY" }),
  makeButton({ quickCountMode: "BIDIRECTIONAL" }),
];
const calibrationModeButtons = [
  makeButton({ countMode: "ENTRY_ONLY" }),
  makeButton({ countMode: "EXIT_ONLY" }),
  makeButton({ countMode: "BIDIRECTIONAL" }),
];
const orientationButtons = [
  makeButton({ orientation: "vertical" }),
  makeButton({ orientation: "horizontal" }),
];
const directionButtons = [
  makeButton({ direction: "LEFT_TO_RIGHT" }),
  makeButton({ direction: "RIGHT_TO_LEFT" }),
  makeButton({ direction: "TOP_TO_BOTTOM" }),
  makeButton({ direction: "BOTTOM_TO_TOP" }),
];

const document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, new FakeElement(selector));
    return elements.get(selector);
  },
  querySelectorAll(selector) {
    if (selector === "[data-quick-count-mode]") return quickButtons;
    if (selector === "[data-count-mode]") return calibrationModeButtons;
    if (selector === "[data-orientation]") return orientationButtons;
    if (selector === "[data-direction]") return directionButtons;
    if (selector === ".tab") return ["count", "calibrate", "history", "help"].map((view) => makeButton({ view }));
    if (selector === ".tool") return ["lineA", "lineB", "linePair", "roi"].map((tool) => makeButton({ tool }));
    if (selector === ".view") {
      return ["count", "calibrate", "history", "help"].map((view) => {
        const element = new FakeElement(`#view-${view}`);
        element.id = `view-${view}`;
        return element;
      });
    }
    if (selector === ".video-wrap" || selector === "[data-frontal-control]") return [new FakeElement(selector)];
    return [];
  },
  createElement(tagName) {
    const element = new FakeElement(tagName);
    element.tagName = String(tagName).toUpperCase();
    return element;
  },
};

const context = {
  console: { debug: noop, log: noop, warn: noop, error: noop },
  document,
  window: { setTimeout: noop },
  navigator: {
    userAgent: "node",
    maxTouchPoints: 0,
    clipboard: { writeText: async () => {} },
    mediaDevices: { addEventListener: noop },
  },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
  location: { protocol: "https:", hostname: "appiba.github.io", origin: "https://appiba.github.io", pathname: "/conteo/", search: "" },
  performance: { now: () => Date.now() },
  requestAnimationFrame: noop,
  URL: { createObjectURL: () => "blob:test", revokeObjectURL: noop },
  Blob,
  Intl,
  Date,
  Math,
  JSON,
  Number,
  String,
  Array,
  Map,
  Set,
  Object,
  RegExp,
  Error,
  Promise,
  prompt: noop,
  confirm: () => false,
  crypto: { randomUUID: () => "test-id" },
};
context.globalThis = context;

const appPath = path.join(__dirname, "..", "docs", "app.js");
const source = fs.readFileSync(appPath, "utf8") + `
globalThis.__appTest = {
  state,
  DEFAULT_CONFIG,
  COUNT_MODES,
  normalizeConfig,
  updateCount,
  buildDailySummary,
  setQuickCountMode,
};
`;

vm.runInNewContext(source, context, { filename: appPath });

const app = context.__appTest;

function point(x, y = 240) {
  return { x, y };
}

function boxAt(pointValue) {
  return { x: pointValue.x - 18, y: pointValue.y - 70, w: 36, h: 70 };
}

function configure(countMode) {
  app.state.config = app.normalizeConfig({
    ...app.DEFAULT_CONFIG,
    lineA: [{ x: 0.30, y: 0.02 }, { x: 0.30, y: 0.98 }],
    lineB: [{ x: 0.46, y: 0.02 }, { x: 0.46, y: 0.98 }],
    roi: [{ x: 0.01, y: 0.02 }, { x: 0.99, y: 0.02 }, { x: 0.99, y: 0.98 }, { x: 0.01, y: 0.98 }],
    lineOrientation: "vertical",
    entryDirection: "LEFT_TO_RIGHT",
    countMode,
  });
  app.state.calibrationDraft = app.normalizeConfig(app.state.config);
  app.state.events = [];
  app.state.sessions = [];
  app.state.tracks = new Map();
  app.state.count = 0;
}

function createTrack(id, firstPoint) {
  const track = {
    id,
    firstPoint,
    previousPoint: null,
    point: firstPoint,
    box: boxAt(firstPoint),
    phase: "new",
    counted: false,
    crossedA: false,
    crossedB: false,
    candidateDirection: null,
    lastCountedEvent: null,
    originStatus: firstPoint.x <= 192 ? "valid" : firstPoint.x >= 294 ? "destination" : "uncertain",
    originValid: firstPoint.x <= 192,
    entryOriginValid: firstPoint.x <= 192,
    exitOriginValid: firstPoint.x >= 294,
    ignoredEntry: false,
    visible: true,
  };
  if (track.originStatus === "destination" && app.state.config.countMode === "ENTRY_ONLY") {
    track.phase = "ignore";
    track.ignoredEntry = true;
  }
  app.state.tracks.set(id, track);
  return track;
}

function advance(id, currentPoint) {
  const stored = app.state.tracks.get(id) || createTrack(id, currentPoint);
  const previousPoint = stored.point;
  stored.previousPoint = previousPoint;
  stored.point = currentPoint;
  stored.box = boxAt(currentPoint);
  const snapshot = { ...stored, previousPoint, point: currentPoint, box: stored.box };
  app.updateCount([snapshot], app.state.config);
}

function runPath(id, points) {
  configure(app.state.config.countMode);
  createTrack(id, points[0]);
  points.slice(1).forEach((nextPoint) => advance(id, nextPoint));
  return app.buildDailySummary(app.state.events, app.state.sessions, new Date("2026-09-03T15:00:00-05:00"));
}

configure("ENTRY_ONLY");
let summary = runPath(1, [point(90), point(210), point(260), point(330)]);
assert.strictEqual(summary.entries_today, 1, "A->B debe sumar una entrada");
assert.strictEqual(summary.exits_today, 0);

configure("ENTRY_ONLY");
summary = runPath(1, [point(340), point(270), point(210), point(120)]);
assert.strictEqual(summary.entries_today, 0, "B->A no debe sumar entrada en ENTRY_ONLY");

configure("ENTRY_ONLY");
summary = runPath(1, [point(90), point(210), point(160), point(80)]);
assert.strictEqual(summary.entries_today, 0, "A y regreso no debe contar");

configure("ENTRY_ONLY");
createTrack(1, point(90));
createTrack(2, point(95, 280));
[point(210), point(260), point(330)].forEach((nextPoint, index) => {
  advance(1, nextPoint);
  advance(2, point(nextPoint.x + 5, 280 + index));
});
summary = app.buildDailySummary(app.state.events, app.state.sessions, new Date("2026-09-03T15:00:00-05:00"));
assert.strictEqual(summary.entries_today, 2, "dos tracks A->B deben sumar dos entradas");

configure("BIDIRECTIONAL");
createTrack(1, point(90));
createTrack(2, point(340));
[0, 1, 2].forEach((index) => {
  advance(1, [point(210), point(260), point(330)][index]);
  advance(2, [point(270), point(210), point(120)][index]);
});
summary = app.buildDailySummary(app.state.events, app.state.sessions, new Date("2026-09-03T15:00:00-05:00"));
assert.strictEqual(summary.entries_today, 1, "mixto debe conservar entradas");
assert.strictEqual(summary.exits_today, 1, "mixto debe conservar salidas");
assert.strictEqual(summary.total_flow, 2, "mixto debe mostrar flujo total");
assert.strictEqual(summary.net_balance, 0, "una entrada y una salida balancea en cero");

app.setQuickCountMode("EXIT_ONLY");
assert.strictEqual(app.state.config.countMode, "EXIT_ONLY", "el selector rapido debe guardar el modo");

console.log("web bidirectional tests OK");

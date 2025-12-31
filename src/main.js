// main.js
import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function $(id) { return document.getElementById(id); }
function setText(id, value) { const el = $(id); if (el) el.textContent = value; }

// -------------------- Complex (existing) --------------------
const c = (re, im) => ({ re, im });
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cConj = (a) => ({ re: a.re, im: -a.im });
const cAbs2 = (a) => a.re * a.re + a.im * a.im;
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s });

function cmul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function normalizeState(state) {
  const n2 = cAbs2(state.alpha) + cAbs2(state.beta);
  const n = Math.sqrt(n2) || 1;
  state.alpha = cScale(state.alpha, 1 / n);
  state.beta = cScale(state.beta, 1 / n);
  return state;
}

function fmtComplex(z, digits = 2, eps = 1e-10) {
  const re = Math.abs(z.re) < eps ? 0 : z.re;
  const im = Math.abs(z.im) < eps ? 0 : z.im;
  const reStr = re.toFixed(digits);
  if (im === 0) return reStr;
  const sign = im >= 0 ? "+" : "-";
  const imStr = Math.abs(im).toFixed(digits);
  return `${reStr} ${sign} ${imStr}i`;
}

const SQ = 1 / Math.sqrt(2);

const EXACT_COMPLEX = [
  { re: 1, im: 0, latex: "1" },
  { re: -1, im: 0, latex: "-1" },
  { re: 0, im: 1, latex: "i" },
  { re: 0, im: -1, latex: "-i" },
  { re: SQ, im: 0, latex: "\\tfrac{1}{\\sqrt{2}}" },
  { re: -SQ, im: 0, latex: "-\\tfrac{1}{\\sqrt{2}}" },
  { re: 0, im: SQ, latex: "\\tfrac{i}{\\sqrt{2}}" },
  { re: 0, im: -SQ, latex: "-\\tfrac{i}{\\sqrt{2}}" },
  { re: SQ, im: SQ, latex: "\\tfrac{1+i}{\\sqrt{2}}" },
  { re: SQ, im: -SQ, latex: "\\tfrac{1-i}{\\sqrt{2}}" },
  { re: -SQ, im: SQ, latex: "-\\tfrac{1-i}{\\sqrt{2}}" },
  { re: -SQ, im: -SQ, latex: "-\\tfrac{1+i}{\\sqrt{2}}" },
  { re: Math.cos(Math.PI / 4), im: Math.sin(Math.PI / 4), latex: "e^{i\\pi/4}" },
  { re: Math.cos(-Math.PI / 4), im: Math.sin(-Math.PI / 4), latex: "e^{-i\\pi/4}" },
  { re: Math.cos(Math.PI / 2), im: Math.sin(Math.PI / 2), latex: "e^{i\\pi/2}" },
  { re: Math.cos(-Math.PI / 2), im: Math.sin(-Math.PI / 2), latex: "e^{-i\\pi/2}" },
];

function approx(a, b, tol = 1e-6) { return Math.abs(a - b) < tol; }

function toFraction(x, maxDen = 128, tol = 1e-6) {
  if (!Number.isFinite(x)) return { num: 0, den: 1 };
  if (Math.abs(x) < tol) return { num: 0, den: 1 };
  const sign = x < 0 ? -1 : 1;
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  let b = Math.abs(x);
  do {
    const a = Math.floor(b);
    const h = a * h1 + h2;
    const k = a * k1 + k2;
    h2 = h1; h1 = h;
    k2 = k1; k1 = k;
    const frac = h / k;
    if (k > maxDen || Math.abs(frac - Math.abs(x)) < tol) {
      return { num: sign * h, den: k };
    }
    b = 1 / (b - a);
  } while (true);
}

function fracLatex({ num, den }) {
  if (den === 1) return String(num);
  return `\\tfrac{${num}}{${den}}`;
}

function formatExactComplex(z, tol = 1e-6) {
  const re = Math.abs(z.re) < tol ? 0 : z.re;
  const im = Math.abs(z.im) < tol ? 0 : z.im;

  const exact = EXACT_COMPLEX.find((t) => approx(re, t.re, tol) && approx(im, t.im, tol));
  if (exact) return exact.latex;

  const reFrac = toFraction(re, 128, tol);
  const imFrac = toFraction(im, 128, tol);

  if (Math.abs(im) < tol) return fracLatex(reFrac);
  if (Math.abs(re) < tol) return `${fracLatex(imFrac)}i`;

  const sign = im >= 0 ? "+" : "-";
  const imStr = fracLatex({ num: Math.abs(imFrac.num), den: imFrac.den });
  return `${fracLatex(reFrac)} ${sign} ${imStr}i`;
}

// -------------------- Bloch vector (existing) --------------------
const BLOCH_Y_SIGN = -1;

function getBlochVectorFromState(state) {
  normalizeState(state);
  const a = state.alpha;
  const b = state.beta;

  const ab = cmul(a, cConj(b)); // α β*
  const x = 2 * ab.re;
  const y = BLOCH_Y_SIGN * 2 * ab.im;
  const z = cAbs2(a) - cAbs2(b);

  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

// -------------------- Gates (existing) --------------------

const GATES = {
  X: { matrix: [[c(0, 0), c(1, 0)], [c(1, 0), c(0, 0)]], axis: { x: 1, y: 0, z: 0 }, angle: Math.PI },
  Y: { matrix: [[c(0, 0), c(0, -1)], [c(0, 1), c(0, 0)]], axis: { x: 0, y: 1, z: 0 }, angle: Math.PI },
  Z: { matrix: [[c(1, 0), c(0, 0)], [c(0, 0), c(-1, 0)]], axis: { x: 0, y: 0, z: 1 }, angle: Math.PI },
  H: { matrix: [[c(SQ, 0), c(SQ, 0)], [c(SQ, 0), c(-SQ, 0)]], axis: { x: 1 / Math.SQRT2, y: 0, z: 1 / Math.SQRT2 }, angle: Math.PI },
  S: { matrix: [[c(1, 0), c(0, 0)], [c(0, 0), c(0, 1)]], axis: { x: 0, y: 0, z: 1 }, angle: Math.PI / 2 },
  T: {
    matrix: (() => {
      const a = Math.PI / 4;
      return [[c(1, 0), c(0, 0)], [c(0, 0), c(Math.cos(a), Math.sin(a))]];
    })(),
    axis: { x: 0, y: 0, z: 1 },
    angle: Math.PI / 4,
  },

  Sdg: {
    matrix: [[c(1, 0), c(0, 0)], [c(0, 0), c(0, -1)]],
    axis: { x: 0, y: 0, z: 1 },
    angle: -Math.PI / 2,
  },
  Tdg: {
    matrix: (() => {
      const a = -Math.PI / 4;
      return [[c(1, 0), c(0, 0)], [c(0, 0), c(Math.cos(a), Math.sin(a))]];
    })(),
    axis: { x: 0, y: 0, z: 1 },
    angle: -Math.PI / 4,
  },
};

const INVERSE_GATE = {
  X: "X",
  Y: "Y",
  Z: "Z",
  H: "H",
  S: "Sdg",
  T: "Tdg",
};

function applyGateToState(state, gateName) {
  const gate = GATES[gateName];
  if (!gate) return state;

  const M = gate.matrix;
  const a = state.alpha;
  const b = state.beta;

  const newA = cAdd(cmul(M[0][0], a), cmul(M[0][1], b));
  const newB = cAdd(cmul(M[1][0], a), cmul(M[1][1], b));

  state.alpha = newA;
  state.beta = newB;

  normalizeState(state);
  return state;
}

// -------------------- MathJax label helper (existing) --------------------
function makeLatexLabel(latex, scale = 0.12) {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.visibility = "hidden";
    container.style.pointerEvents = "none";
    container.innerHTML = `\\(${latex}\\)`;
    document.body.appendChild(container);

    if (typeof MathJax === "undefined") {
      const material = new THREE.SpriteMaterial({ color: 0xffffff });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(scale, scale, scale);
      document.body.removeChild(container);
      resolve(sprite);
      return;
    }

    MathJax.typesetPromise([container]).then(() => {
      const svg = container.querySelector("svg");
      if (!svg) {
        const material = new THREE.SpriteMaterial({ color: 0xffffff });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(scale, scale, scale);
        document.body.removeChild(container);
        resolve(sprite);
        return;
      }

      svg.setAttribute("fill", "#ffffff");
      svg.setAttribute("stroke", "#ffffff");
      svg.querySelectorAll("*").forEach((el) => {
        el.setAttribute("fill", "#ffffff");
        el.setAttribute("stroke", "#ffffff");
      });

      const xml = new XMLSerializer().serializeToString(svg);
      const svg64 = btoa(xml);
      const image64 = "data:image/svg+xml;base64," + svg64;

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(image64, (texture) => {
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(scale, scale, scale);
        document.body.removeChild(container);
        resolve(sprite);
      });
    });
  });
}

// -------------------- Bloch widget (existing; palette remains neutral) --------------------
class BlochSphereWidget {
  constructor({ mountEl, qubitIndex }) {
    this.mountEl = mountEl;
    this.qubitIndex = qubitIndex;
    this.state = normalizeState({ alpha: c(1, 0), beta: c(0, 0) });

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.blochGroup = null;
    this.arrow = null;
    this.point = null;

    this.tracePoints = [];
    this.traceLine = null;

    this.isAnimating = false;
    this.animStart = 0;
    this.animDuration = 450;
    this.animAxis = null;
    this.animFrom = null;
    this.animAngle = 0;
    this._animResolve = null;

    this.MAX_TRACE = 1800;
    this._raf = null;
  }

  init() {
    const width = this.mountEl.clientWidth || 300;
    const height = this.mountEl.clientHeight || 300;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c0e);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(2.8, 2.2, 2.8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.mountEl.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(3, 4, 2);
    this.scene.add(dir);

    this.blochGroup = new THREE.Group();
    this.scene.add(this.blochGroup);
    this.blochGroup.rotation.x = -Math.PI / 2;

    const sphereGeom = new THREE.SphereGeometry(1, 48, 48);
    const sphereMat = new THREE.MeshPhongMaterial({
      color: 0x121418,
      transparent: true,
      opacity: 0.38,
    });
    this.blochGroup.add(new THREE.Mesh(sphereGeom, sphereMat));

    const sphereWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(sphereGeom),
      new THREE.LineBasicMaterial({ color: 0x2b2f36, opacity: 0.55, transparent: true })
    );
    this.blochGroup.add(sphereWire);

    const axisLine = (p1, p2, color) =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([p1, p2]),
        new THREE.LineBasicMaterial({ color })
      );

    // axis bursts allowed
    this.blochGroup.add(
      axisLine(new THREE.Vector3(-1.2, 0, 0), new THREE.Vector3(1.2, 0, 0), 0xff5555),
      axisLine(new THREE.Vector3(0, -1.2, 0), new THREE.Vector3(0, 1.2, 0), 0x55ff88),
      axisLine(new THREE.Vector3(0, 0, -1.2), new THREE.Vector3(0, 0, 1.2), 0x6f8dff)
    );

    (async () => {
      const L0 = await makeLatexLabel("|0\\rangle"); L0.position.set(0, 0, 1.25); this.blochGroup.add(L0);
      const L1 = await makeLatexLabel("|1\\rangle"); L1.position.set(0, 0, -1.25); this.blochGroup.add(L1);
      const Lp = await makeLatexLabel("|+\\rangle"); Lp.position.set(1.25, 0, 0); this.blochGroup.add(Lp);
      const Lm = await makeLatexLabel("|-\\rangle"); Lm.position.set(-1.25, 0, 0); this.blochGroup.add(Lm);
      const Li = await makeLatexLabel("|i\\rangle"); Li.position.set(0, 1.25, 0); this.blochGroup.add(Li);
      const Lmi = await makeLatexLabel("|-i\\rangle"); Lmi.position.set(0, -1.25, 0); this.blochGroup.add(Lmi);
    })();

    const v = getBlochVectorFromState(this.state);
    const vec = new THREE.Vector3(v.x, v.y, v.z);

    this.arrow = new THREE.ArrowHelper(
      vec.clone().normalize(),
      new THREE.Vector3(0, 0, 0),
      0.9,
      0xffdd66,
      0.12,
      0.06
    );
    this.blochGroup.add(this.arrow);

    this.point = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 24, 24),
      new THREE.MeshPhongMaterial({ color: 0xffdd66, emissive: 0xffb844 })
    );
    this.point.position.copy(vec);
    this.blochGroup.add(this.point);

    this.tracePoints = [vec.clone()];
    this.traceLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this.tracePoints),
      new THREE.LineBasicMaterial({ color: 0xfff277, transparent: true, depthTest: false })
    );
    this.traceLine.renderOrder = 10;
    this.blochGroup.add(this.traceLine);

    this._animateLoop();
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.renderer?.domElement?.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    if (this.traceLine?.geometry) this.traceLine.geometry.dispose();
    this.renderer?.dispose?.();
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const w = this.mountEl.clientWidth || 300;
    const h = this.mountEl.clientHeight || 300;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setStateAndTrace(state, traceVecs) {
    this.isAnimating = false;
    this._animResolve?.();
    this._animResolve = null;

    this.state = normalizeState({
      alpha: c(state.alpha.re, state.alpha.im),
      beta: c(state.beta.re, state.beta.im),
    });

    this.tracePoints = (traceVecs && traceVecs.length)
      ? traceVecs.map(v => new THREE.Vector3(v.x, v.y, v.z))
      : [new THREE.Vector3(...Object.values(getBlochVectorFromState(this.state)))];

    this._rebuildTraceGeometry();
    this._redrawFromState(false);
  }

  applyGateAsync(gateName, { animate = true, duration = 450 } = {}) {
    const gate = GATES[gateName];
    if (!gate) return Promise.resolve();

    if (!animate) {
      const before = getBlochVectorFromState(this.state);
      const beforeV = new THREE.Vector3(before.x, before.y, before.z);
      applyGateToState(this.state, gateName);
      const axis = new THREE.Vector3(gate.axis.x, gate.axis.y, gate.axis.z).normalize();
      this._addGateArc(beforeV, axis, gate.angle);
      this._redrawFromState(false);
      return Promise.resolve();
    }

    if (this.isAnimating) return Promise.resolve();

    return new Promise((resolve) => {
      const before = getBlochVectorFromState(this.state);
      const beforeV = new THREE.Vector3(before.x, before.y, before.z);

      applyGateToState(this.state, gateName);

      const axis = new THREE.Vector3(gate.axis.x, gate.axis.y, gate.axis.z).normalize();

      this.isAnimating = true;
      this.animStart = performance.now();
      this.animDuration = duration;
      this.animAxis = axis;
      this.animFrom = beforeV.clone();
      this.animAngle = gate.angle;
      this._animResolve = () => resolve();
    });
  }

  _animateLoop() {
    this._raf = requestAnimationFrame(() => this._animateLoop());
    this.controls?.update?.();
    if (this.isAnimating) this._animateGateStep();
    this.renderer?.render?.(this.scene, this.camera);
  }

  _animateGateStep() {
    const now = performance.now();
    const t = Math.min((now - this.animStart) / this.animDuration, 1);
    const theta = this.animAngle * t;
    const current = this._rotateVectorAroundAxis(this.animFrom, this.animAxis, theta).normalize();

    this.arrow.setDirection(current.clone().normalize());
    this.point.position.copy(current);

    this.tracePoints.push(current.clone());
    if (this.tracePoints.length > this.MAX_TRACE) this.tracePoints.shift();
    this._rebuildTraceGeometry();

    if (t >= 1) {
      this.isAnimating = false;
      this._redrawFromState(false);
      const r = this._animResolve;
      this._animResolve = null;
      if (r) r();
    }
  }

  _redrawFromState(resetTrace = false) {
    const v = getBlochVectorFromState(this.state);
    const vec = new THREE.Vector3(v.x, v.y, v.z);
    this.arrow.setDirection(vec.clone().normalize());
    this.point.position.copy(vec);

    if (resetTrace) {
      this.tracePoints = [vec.clone()];
      this._rebuildTraceGeometry();
    }
  }

  _rebuildTraceGeometry() {
    if (!this.traceLine) return;
    this.traceLine.geometry.dispose();
    this.traceLine.geometry = new THREE.BufferGeometry().setFromPoints(this.tracePoints);
  }

  _rotateVectorAroundAxis(vec, axis, angle) {
    const v = vec.clone();
    const k = axis.clone().normalize();
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const term1 = v.clone().multiplyScalar(cosA);
    const term2 = new THREE.Vector3().crossVectors(k, v).multiplyScalar(sinA);
    const term3 = k.clone().multiplyScalar(k.dot(v) * (1 - cosA));
    return term1.add(term2).add(term3);
  }

  _addGateArc(startVec, axis, angle, steps = 48) {
    const v0 = startVec.clone().normalize();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const theta = angle * t;
      const vt = this._rotateVectorAroundAxis(v0, axis, theta).normalize();
      this.tracePoints.push(vt.clone());
      if (this.tracePoints.length > this.MAX_TRACE) this.tracePoints.shift();
    }
    this._rebuildTraceGeometry();
  }
}

// -------------------- App state --------------------
const MAX_QUBITS = 10;
let qubitCount = 1;
let selectedQubit = 0;
let widgets = [];

// -------------------- Bloch layout --------------------
function rebuildBlochGrid() {
  const grid = $("bloch-grid");
  if (!grid) throw new Error("Missing #bloch-grid in index.html");

  grid.innerHTML = "";

  widgets.forEach(({ widget, ro }) => {
    ro?.disconnect?.();
    widget?.destroy?.();
  });
  widgets = [];

  for (let i = 0; i < qubitCount; i++) {
    const tile = document.createElement("div");
    tile.className = "bloch-tile" + (i === selectedQubit ? " selected" : "");

    const header = document.createElement("div");
    header.className = "bloch-tile-header";
    header.textContent = `Qubit q${i}`;
    tile.appendChild(header);

    const mount = document.createElement("div");
    mount.className = "tile-canvas";
    tile.appendChild(mount);

    tile.addEventListener("click", () => {
      selectedQubit = i;
      refreshSelectedUI();
      updateProbPopover();
      updateBackendMath();
    });

    grid.appendChild(tile);

    const widget = new BlochSphereWidget({ mountEl: mount, qubitIndex: i });
    widget.init();

    const ro = new ResizeObserver(() => widget.resize());
    ro.observe(mount);
    ro.observe(tile);

    widgets.push({ tileEl: tile, mountEl: mount, widget, ro });
  }

  refreshSelectedUI();
  requestAnimationFrame(resizeAllWidgets);
}

function resizeAllWidgets() {
  widgets.forEach(({ widget }) => widget.resize());
}

function refreshSelectedUI() {
  widgets.forEach(({ tileEl }, idx) => tileEl.classList.toggle("selected", idx === selectedQubit));
}

function syncQubitCountUI() {
  setText("qubitCountNum", String(qubitCount));
  // keep the /10 part in HTML; only update count number
  const addBtn = $("addQubitTop");
  const remBtn = $("removeQubitTop");
  const addBtn2 = $("addQubit");
  const remBtn2 = $("removeQubit");
  if (addBtn) addBtn.disabled = qubitCount >= MAX_QUBITS;
  if (remBtn) remBtn.disabled = qubitCount <= 1;
  if (addBtn2) addBtn2.disabled = qubitCount >= MAX_QUBITS;
  if (remBtn2) remBtn2.disabled = qubitCount <= 1;
}

// -------------------- Primary splitter --------------------
const SPLIT_STORAGE_KEY = "primarySplitLeftPx";
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function applyStoredSplit() {
  const saved = localStorage.getItem(SPLIT_STORAGE_KEY);
  if (!saved) return;
  const px = Number(saved);
  if (!Number.isFinite(px) || px <= 0) return;
  document.documentElement.style.setProperty("--splitLeft", `${px}px`);
}

function initPrimarySplitter() {
  const splitter = $("primarySplitter");
  const main = $("main");
  if (!splitter || !main) return;

  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const minLeft = 340;
    const minRight = 420;
    const maxLeft = rect.width - minRight;

    const leftPx = clamp(x, minLeft, Math.max(minLeft, maxLeft));
    document.documentElement.style.setProperty("--splitLeft", `${leftPx}px`);
    localStorage.setItem(SPLIT_STORAGE_KEY, String(Math.round(leftPx)));
    requestAnimationFrame(resizeAllWidgets);
  };

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("split-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };

  splitter.addEventListener("pointerdown", (e) => {
    const isMobile = window.matchMedia("(max-width: 980px)").matches;
    if (isMobile) return;

    dragging = true;
    document.body.classList.add("split-dragging");
    splitter.setPointerCapture?.(e.pointerId);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", stop, { passive: true });
    window.addEventListener("pointercancel", stop, { passive: true });
  });

  window.addEventListener("resize", () => requestAnimationFrame(resizeAllWidgets));
}

// -------------------- Circuit model/render (existing) --------------------
const C_LABEL_W = 90;
const C_STEP_W = 64;
const C_ROW_H = 64;
const C_TOP_PAD = 34;

const INITIAL_STEP_COUNT = 12;

let stepCount = INITIAL_STEP_COUNT;
let singleQ = [];
let multiQ = [];
let pendingCX = null;

const PALETTE_GATES = ["H", "X", "Y", "Z", "S", "T", "CX", "CLEAR"];

let draggingGate = null;
let draggingFrom = null;
let draggingOp = null;

function initCircuitModel() {
  singleQ = Array.from({ length: qubitCount }, () => Array(stepCount).fill(null));
  multiQ = Array.from({ length: stepCount }, () => []);
  pendingCX = null;
  updateSelectionState();
}

function ensureCircuitDimensions() {
  if (!singleQ.length || !multiQ.length) initCircuitModel();

  if (singleQ.length !== qubitCount) {
    const newSingle = Array.from({ length: qubitCount }, (_, q) => {
      const oldRow = singleQ[q] || [];
      return Array.from({ length: stepCount }, (_, s) => oldRow[s] ?? null);
    });
    singleQ = newSingle;
  }

  singleQ = singleQ.map((row) => {
    if (row.length === stepCount) return row;
    if (row.length < stepCount) return row.concat(Array(stepCount - row.length).fill(null));
    return row.slice(0, stepCount);
  });

  if (multiQ.length !== stepCount) {
    const old = multiQ;
    multiQ = Array.from({ length: stepCount }, (_, s) => (old[s] ? [...old[s]] : []));
  }

  for (let s = 0; s < stepCount; s++) {
    multiQ[s] = multiQ[s].filter(
      (op) => op.type !== "CX" || (op.control < qubitCount && op.target < qubitCount)
    );
  }

  if (pendingCX && (pendingCX.control >= qubitCount || pendingCX.step >= stepCount)) {
    pendingCX = null;
    updateSelectionState();
  }
}

function stepFromX(x) {
  const xInSteps = x - C_LABEL_W;
  const idx = Math.floor(xInSteps / C_STEP_W);
  return Math.max(0, Math.min(stepCount - 1, idx));
}
function wireFromY(y) {
  const idx = Math.floor((y - C_TOP_PAD) / C_ROW_H);
  return Math.max(0, Math.min(qubitCount - 1, idx));
}
function wireCenterY(q) { return C_TOP_PAD + q * C_ROW_H + C_ROW_H / 2; }
function stepCenterX(s) { return C_LABEL_W + s * C_STEP_W + C_STEP_W / 2; }

function gateColorClass(g) {
  if (g === "X") return "gate-x";
  if (g === "Y") return "gate-y";
  if (g === "Z") return "gate-z";
  if (g === "H") return "gate-h";
  if (g === "S" || g === "Sdg") return "gate-s";
  if (g === "T" || g === "Tdg") return "gate-t";
  return "";
}

function clearAt(q, s) {
  singleQ[q][s] = null;
  multiQ[s] = multiQ[s].filter((op) => !(op.type === "CX" && (op.control === q || op.target === q)));
}

function placeSingleGate(q, s, gate) {
  if (gate === "CLEAR") { clearAt(q, s); return; }
  if (!GATES[gate]) return;
  singleQ[q][s] = gate;
  multiQ[s] = multiQ[s].filter((op) => !(op.type === "CX" && (op.control === q || op.target === q)));
}

function placeCX(q, s) {
  if (!pendingCX) { pendingCX = { step: s, control: q }; updateSelectionState(); return; }
  if (pendingCX.step !== s) { pendingCX = { step: s, control: q }; updateSelectionState(); return; }

  const control = pendingCX.control;
  const target = q;
  pendingCX = null;
  updateSelectionState();
  if (control === target) return;

  singleQ[control][s] = null;
  singleQ[target][s] = null;

  multiQ[s] = multiQ[s].filter((op) => {
    if (op.type !== "CX") return true;
    const touches = [op.control, op.target].includes(control) || [op.control, op.target].includes(target);
    return !touches;
  });

  multiQ[s].push({ type: "CX", control, target });
}

function placeCXDirect(step, control, target) {
  if (control === target) return;

  singleQ[control][step] = null;
  singleQ[target][step] = null;

  multiQ[step] = multiQ[step].filter((op) => {
    if (op.type !== "CX") return true;
    const touches = [op.control, op.target].includes(control) || [op.control, op.target].includes(target);
    return !touches;
  });

  multiQ[step].push({ type: "CX", control, target });
}

// -------------------- Gate matrix LaTeX (used for hover preview) --------------------
function gateMatrixLatex(g) {
  const gate = GATES[g];
  const identity = [[c(1, 0), c(0, 0)], [c(0, 0), c(1, 0)]];
  const M = gate?.matrix ?? identity;
  const f = (z) => formatExactComplex(z);
  return `\\[
${g || "I"} =
\\begin{pmatrix}
${f(M[0][0])} & ${f(M[0][1])} \\\\
${f(M[1][0])} & ${f(M[1][1])}
\\end{pmatrix}
\\]`;
}

function matrixLatex(label, matrix) {
  const f = (z) => formatExactComplex(z);
  return `\\[
${label} =
\\begin{pmatrix}
${f(matrix[0][0])} & ${f(matrix[0][1])} \\\\
${f(matrix[1][0])} & ${f(matrix[1][1])}
\\end{pmatrix}
\\]`;
}

function densityMatrix(state) {
  const a = state.alpha;
  const b = state.beta;
  const aConj = cConj(a);
  const bConj = cConj(b);
  return [
    [cmul(a, aConj), cmul(a, bConj)],
    [cmul(aConj, b), cmul(b, bConj)],
  ];
}

function updateGateHoverMath(gateName) {
  const el = $("gateHoverMath");
  if (!el) return;

  if (!gateName || !GATES[gateName] || gateName === "CX" || gateName === "CLEAR") {
    el.innerHTML = `\\[\\text{Hover a 1-qubit gate to preview its matrix.}\\]`;
    if (typeof MathJax !== "undefined") MathJax.typesetPromise([el]);
    return;
  }

  el.innerHTML = gateMatrixLatex(gateName);
  if (typeof MathJax !== "undefined") MathJax.typesetPromise([el]);
}

// -------------------- Gate library palette renderer (fix drag/drop reliability + hover preview) --------------------
function renderGatePalette() {
  const row = $("gatePaletteRow");
  if (!row) return;
  row.innerHTML = "";

  PALETTE_GATES.forEach((g) => {
    const item = document.createElement("div");
    item.className = "palette-gate";
    item.setAttribute("draggable", "true");
    item.dataset.gate = g;

    const box = document.createElement("div");
    box.className = "gate-box " + gateColorClass(g);
    box.textContent = g === "CLEAR" ? "🧽" : g;

    item.appendChild(box);

    // Hover matrix preview (MathJax)
    item.addEventListener("mouseenter", () => updateGateHoverMath(g));
    item.addEventListener("mouseleave", () => updateGateHoverMath(null));

    // IMPORTANT: setData must happen in dragstart, and some browsers require a value.
    item.addEventListener("dragstart", (e) => {
      draggingGate = g;
      draggingFrom = { kind: "palette" };
      draggingOp = null;

      try {
        e.dataTransfer.setData("text/plain", String(g));
      } catch {}
      e.dataTransfer.effectAllowed = "copy";

      // Some browsers need a drag image; keep it invisible + default.
      if (e.dataTransfer.setDragImage) {
        e.dataTransfer.setDragImage(box, 20, 20);
      }
    });

    item.addEventListener("dragend", () => {
      draggingGate = null;
      draggingFrom = null;
      draggingOp = null;
      hideDropHighlight();
    });

    row.appendChild(item);
  });

  // Drag-to-library-to-remove behavior relies on these handlers
  row.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = (draggingFrom && draggingFrom.kind !== "palette") ? "move" : "copy";
  };

  row.ondrop = (e) => {
    e.preventDefault();

    // If a gate was dragged from circuit into the library, it should disappear.
    // Existing logic already "removes on dragstart" for circuit gates; we just finalize UI state.
    draggingGate = null;
    draggingFrom = null;
    draggingOp = null;
    hideDropHighlight();

    renderCircuit();
    rebuildToStep(activeStep);
  };
}

// -------------------- Drag helpers --------------------
function getGridLocalXY(e, gridEl, canvasEl) {
  const r = gridEl.getBoundingClientRect();
  const xInGrid = (e.clientX - r.left) + gridEl.scrollLeft;
  const yInGrid = (e.clientY - r.top) + gridEl.scrollTop;
  const x = xInGrid - canvasEl.offsetLeft;
  const y = yInGrid - canvasEl.offsetTop;
  return { x, y };
}

let dropHighlightEl = null;

function showDropHighlight(stepIdx, wireIdx) {
  if (!dropHighlightEl) return;
  const x = stepCenterX(stepIdx);
  const y = wireCenterY(wireIdx);
  dropHighlightEl.style.transform = `translate(${x - 23}px, ${y - 23}px)`;
  dropHighlightEl.classList.add("on");
}

function hideDropHighlight() {
  if (!dropHighlightEl) return;
  dropHighlightEl.classList.remove("on");
  dropHighlightEl.style.transform = `translate(-9999px, -9999px)`;
}

// -------------------- Step cursor + playback (existing) --------------------
let activeStep = -1;
let playing = false;
let playTimer = null;
let stepBusy = false;

function updateActiveStepUI() {
  setText("activeStepLabel", activeStep < 0 ? "–" : String(activeStep));
  setText("stepCountLabel", String(stepCount));

  document.querySelectorAll(".cstep-highlight").forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle("on", s === activeStep);
  });

  updateBackendMath();
}

function rotateVectorAroundAxis(vec, axis, angle) {
  const v = vec.clone();
  const k = axis.clone().normalize();
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const term1 = v.clone().multiplyScalar(cosA);
  const term2 = new THREE.Vector3().crossVectors(k, v).multiplyScalar(sinA);
  const term3 = k.clone().multiplyScalar(k.dot(v) * (1 - cosA));
  return term1.add(term2).add(term3);
}

function rebuildToStep(stepIdx) {
  const states = Array.from({ length: qubitCount }, () => normalizeState({ alpha: c(1,0), beta: c(0,0) }));
  const traces = Array.from({ length: qubitCount }, () => []);

  for (let q = 0; q < qubitCount; q++) {
    const v0 = getBlochVectorFromState(states[q]);
    traces[q].push({ x: v0.x, y: v0.y, z: v0.z });
  }

  if (stepIdx >= 0) {
    for (let s = 0; s <= stepIdx; s++) {
      for (let q = 0; q < qubitCount; q++) {
        const g = singleQ[q]?.[s];
        if (g && GATES[g]) {
          const gate = GATES[g];
          const axis = new THREE.Vector3(gate.axis.x, gate.axis.y, gate.axis.z).normalize();
          const before = getBlochVectorFromState(states[q]);
          const beforeV = new THREE.Vector3(before.x, before.y, before.z).normalize();

          applyGateToState(states[q], g);

          const steps = 36;
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const theta = gate.angle * t;
            const vt = rotateVectorAroundAxis(beforeV, axis, theta).normalize();
            traces[q].push({ x: vt.x, y: vt.y, z: vt.z });
          }
        }
      }
      // CX ignored for Bloch stepping (existing behavior)
    }
  }

  for (let q = 0; q < qubitCount; q++) {
    const w = widgets[q]?.widget;
    if (!w) continue;
    w.setStateAndTrace(states[q], traces[q]);
  }

  updateProbPopover();
  updateBackendMath();
}

function stopPlayback() {
  playing = false;
  document.body.classList.remove("is-playing");
  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }
  const icon = $("playIcon");
  if (icon) icon.textContent = "▶";
}

function startPlayback() {
  if (playing) return;
  playing = true;
  document.body.classList.add("is-playing");
  const icon = $("playIcon");
  if (icon) icon.textContent = "⏸";
  scheduleNextTick();
}

function togglePlayback() {
  if (playing) stopPlayback();
  else startPlayback();
}

function scheduleNextTick() {
  if (!playing) return;
  const dt = 480;

  playTimer = setTimeout(async () => {
    await stepForward();
    if (activeStep >= stepCount - 1) {
      stopPlayback();
      return;
    }
    scheduleNextTick();
  }, dt);
}

async function stepBack() {
  if (stepBusy) return;
  stopPlayback();
  if (activeStep <= -1) return;

  stepBusy = true;
  const s = activeStep;

  const jobs = [];
  for (let q = 0; q < qubitCount; q++) {
    const g = singleQ[q]?.[s];
    if (!g) continue;
    const inv = INVERSE_GATE[g];
    if (!inv) continue;
    const w = widgets[q]?.widget;
    if (!w) continue;
    jobs.push(w.applyGateAsync(inv, { animate: true, duration: 450 }));
  }

  await Promise.all(jobs);

  activeStep = clamp(activeStep - 1, -1, stepCount - 1);
  updateActiveStepUI();
  rebuildToStep(activeStep);

  stepBusy = false;
}

async function stepForward() {
  if (stepBusy) return;
  if (activeStep >= stepCount - 1) return;

  stepBusy = true;
  const next = activeStep + 1;

  const jobs = [];
  for (let q = 0; q < qubitCount; q++) {
    const g = singleQ[q]?.[next];
    if (!g) continue;
    const w = widgets[q]?.widget;
    if (!w) continue;
    jobs.push(w.applyGateAsync(g, { animate: true, duration: 450 }));
  }

  await Promise.all(jobs);

  activeStep = clamp(next, -1, stepCount - 1);
  updateActiveStepUI();
  updateProbPopover();
  updateBackendMath();

  stepBusy = false;
}

function resetStepCursor() {
  stopPlayback();
  activeStep = -1;
  updateActiveStepUI();
  rebuildToStep(activeStep);
}

// -------------------- Circuit render (existing) --------------------
function renderCircuit() {
  const canvas = $("circuit-canvas");
  const grid = $("circuit-grid");
  if (!canvas || !grid) return;

  ensureCircuitDimensions();
  canvas.innerHTML = "";

  const width = C_LABEL_W + stepCount * C_STEP_W + 20;
  const height = C_TOP_PAD + qubitCount * C_ROW_H + 18;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  dropHighlightEl = document.createElement("div");
  dropHighlightEl.className = "cdrop-highlight";
  canvas.appendChild(dropHighlightEl);

  for (let s = 0; s < stepCount; s++) {
    const lbl = document.createElement("div");
    lbl.className = "cstep-label";
    lbl.style.left = `${C_LABEL_W + s * C_STEP_W}px`;
    lbl.style.width = `${C_STEP_W}px`;
    lbl.textContent = `t${s}`;
    canvas.appendChild(lbl);
  }

  for (let q = 0; q < qubitCount; q++) {
    const y = wireCenterY(q);

    const label = document.createElement("div");
    label.className = "cwire-label";
    label.style.top = `${y - 12}px`;
    label.textContent = `q${q}`;
    canvas.appendChild(label);

    const ket = document.createElement("div");
    ket.className = "cwire-ket";
    ket.style.top = `${y + 8}px`;
    ket.innerHTML = q === 0 ? `\\(|0\\rangle\\)` : "";
    canvas.appendChild(ket);
  }

  for (let s = 0; s < stepCount; s++) {
    const hi = document.createElement("div");
    hi.className = "cstep-highlight";
    hi.dataset.step = String(s);
    hi.style.left = `${C_LABEL_W + s * C_STEP_W}px`;
    hi.style.width = `${C_STEP_W}px`;
    canvas.appendChild(hi);
  }

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("circuit-svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  for (let q = 0; q < qubitCount; q++) {
    const y = wireCenterY(q);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", C_LABEL_W);
    line.setAttribute("x2", C_LABEL_W + stepCount * C_STEP_W);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "rgba(245,245,245,0.20)");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
  }

  for (let s = 0; s < stepCount; s++) {
    for (const op of multiQ[s]) {
      if (op.type !== "CX") continue;
      const x = stepCenterX(s);
      const y1 = wireCenterY(op.control);
      const y2 = wireCenterY(op.target);

      const vline = document.createElementNS(svgNS, "line");
      vline.setAttribute("x1", x);
      vline.setAttribute("x2", x);
      vline.setAttribute("y1", y1);
      vline.setAttribute("y2", y2);
      vline.setAttribute("stroke", "rgba(245,245,245,0.88)");
      vline.setAttribute("stroke-width", "2");
      vline.setAttribute("stroke-linecap", "round");
      svg.appendChild(vline);
    }
  }

  canvas.appendChild(svg);

  // Single-qubit gates
  for (let q = 0; q < qubitCount; q++) {
    for (let s = 0; s < stepCount; s++) {
      const g = singleQ[q][s];
      if (!g) continue;

      const x = stepCenterX(s);
      const y = wireCenterY(q);

      const gate = document.createElement("div");
      gate.className = `cgate ${gateColorClass(g)}`;
      gate.style.left = `${x - 21}px`;
      gate.style.top = `${y - 21}px`;
      gate.textContent = g;
      gate.setAttribute("draggable", "true");

      gate.addEventListener("dragstart", (e) => {
        draggingGate = g;
        draggingFrom = { kind: "single", q, s };
        draggingOp = null;
        singleQ[q][s] = null;
        pendingCX = null;
        updateSelectionState();

        try { e.dataTransfer.setData("text/plain", String(g)); } catch {}
        e.dataTransfer.effectAllowed = "move";

        requestAnimationFrame(() => renderCircuit());
      });

      gate.addEventListener("dragend", () => {
        draggingGate = null;
        draggingFrom = null;
        draggingOp = null;
        hideDropHighlight();
        renderCircuit();
        rebuildToStep(activeStep);
      });

      gate.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        clearAt(q, s);
        renderCircuit();
        rebuildToStep(activeStep);
      });

      canvas.appendChild(gate);
    }
  }

  // CX markers
  for (let s = 0; s < stepCount; s++) {
    for (const op of multiQ[s]) {
      if (op.type !== "CX") continue;
      const x = stepCenterX(s);

      // control
      {
        const y = wireCenterY(op.control);
        const g = document.createElement("div");
        g.className = "cgate";
        g.style.left = `${x - 21}px`;
        g.style.top = `${y - 21}px`;

        const dot = document.createElement("div");
        dot.className = "ccontrol";
        g.appendChild(dot);

        g.setAttribute("draggable", "true");

        g.addEventListener("dragstart", (e) => {
          draggingGate = "CX";
          draggingFrom = { kind: "cx", step: s, role: "control" };
          draggingOp = { ...op };
          multiQ[s] = multiQ[s].filter((o) => o !== op);
          pendingCX = null;
          updateSelectionState();

          try { e.dataTransfer.setData("text/plain", "CX"); } catch {}
          e.dataTransfer.effectAllowed = "move";

          requestAnimationFrame(() => renderCircuit());
        });

        g.addEventListener("dragend", () => {
          draggingGate = null;
          draggingFrom = null;
          draggingOp = null;
          hideDropHighlight();
          renderCircuit();
          rebuildToStep(activeStep);
        });

        canvas.appendChild(g);
      }

      // target
      {
        const y = wireCenterY(op.target);
        const g = document.createElement("div");
        g.className = "cgate";
        g.style.left = `${x - 21}px`;
        g.style.top = `${y - 21}px`;

        const tgt = document.createElement("div");
        tgt.className = "ctarget";
        g.appendChild(tgt);

        g.setAttribute("draggable", "true");

        g.addEventListener("dragstart", (e) => {
          draggingGate = "CX";
          draggingFrom = { kind: "cx", step: s, role: "target" };
          draggingOp = { ...op };
          multiQ[s] = multiQ[s].filter((o) => o !== op);
          pendingCX = null;
          updateSelectionState();

          try { e.dataTransfer.setData("text/plain", "CX"); } catch {}
          e.dataTransfer.effectAllowed = "move";

          requestAnimationFrame(() => renderCircuit());
        });

        g.addEventListener("dragend", () => {
          draggingGate = null;
          draggingFrom = null;
          draggingOp = null;
          hideDropHighlight();
          renderCircuit();
          rebuildToStep(activeStep);
        });

        canvas.appendChild(g);
      }
    }
  }

  // Drop behavior
  grid.ondragover = (e) => {
    // This MUST exist for drop to fire.
    e.preventDefault();

    const gate = draggingGate || e.dataTransfer.getData("text/plain");
    if (!gate) { hideDropHighlight(); return; }

    e.dataTransfer.dropEffect = (draggingFrom && draggingFrom.kind !== "palette") ? "move" : "copy";

    const { x, y } = getGridLocalXY(e, grid, canvas);
    const s = stepFromX(x);
    const q = wireFromY(y);
    showDropHighlight(s, q);
  };

  grid.ondragleave = (e) => {
    const related = e.relatedTarget;
    if (!related || !grid.contains(related)) hideDropHighlight();
  };

  grid.ondrop = (e) => {
    e.preventDefault();
    hideDropHighlight();

    const gate = draggingGate || e.dataTransfer.getData("text/plain");
    if (!gate) {
      draggingGate = null; draggingFrom = null; draggingOp = null;
      return;
    }

    const { x, y } = getGridLocalXY(e, grid, canvas);
    const s = stepFromX(x);
    const q = wireFromY(y);

    if (draggingFrom && draggingFrom.kind === "cx" && draggingOp) {
      const role = draggingFrom.role;
      const old = draggingOp;

      draggingGate = null;
      draggingFrom = null;

      const control = (role === "control") ? q : old.control;
      const target  = (role === "target") ? q : old.target;

      draggingOp = null;

      if (control === target) {
        renderCircuit();
        rebuildToStep(activeStep);
        return;
      }

      placeCXDirect(s, control, target);
      pendingCX = null;
      updateSelectionState();

      renderCircuit();
      rebuildToStep(activeStep);
      return;
    }

    draggingGate = null;
    draggingFrom = null;
    draggingOp = null;

    if (gate === "CX") {
      placeCX(q, s);
      renderCircuit();
      rebuildToStep(activeStep);
      return;
    }

    placeSingleGate(q, s, gate);
    pendingCX = null;
    updateSelectionState();

    renderCircuit();
    rebuildToStep(activeStep);
  };

  updateActiveStepUI();

  if (typeof MathJax !== "undefined") MathJax.typesetPromise([canvas]);
}

function clearCircuit() {
  stopPlayback();
  initCircuitModel();
  renderCircuit();
  activeStep = -1;
  updateActiveStepUI();
  rebuildToStep(activeStep);
}

// -------------------- Qubit count (now always accessible from topbar) --------------------
function setQubitCount(n) {
  qubitCount = Math.max(1, Math.min(MAX_QUBITS, n));
  if (selectedQubit >= qubitCount) selectedQubit = qubitCount - 1;

  ensureCircuitDimensions();
  rebuildBlochGrid();
  renderCircuit();

  activeStep = clamp(activeStep, -1, stepCount - 1);
  updateActiveStepUI();
  rebuildToStep(activeStep);

  syncQubitCountUI();
}

function addQubit() { if (qubitCount < MAX_QUBITS) setQubitCount(qubitCount + 1); }
function removeQubit() { if (qubitCount > 1) setQubitCount(qubitCount - 1); }

// -------------------- UI state (gate library is always visible now) --------------------
const uiState = {
  backendOpen: false,
  probOpen: false,
  menuOpen: false,
};

function updateBackdrop() {
  const on = uiState.backendOpen || uiState.probOpen || uiState.menuOpen;
  const b = $("overlayBackdrop");
  if (b) b.setAttribute("aria-hidden", on ? "false" : "true");
}

function openBackendDrawer() {
  uiState.backendOpen = true;
  document.body.classList.add("backend-open");
  const showMatrixToggle = $("toggleShowMatrix");
  if (showMatrixToggle) {
    showMatrixToggle.checked = true;
    document.body.classList.add("show-matrix");
  }
  $("backendDrawer")?.setAttribute("aria-hidden", "false");
  updateBackdrop();
  updateBackendMath();
}
function closeBackendDrawer() {
  uiState.backendOpen = false;
  document.body.classList.remove("backend-open");
  $("backendDrawer")?.setAttribute("aria-hidden", "true");
  updateBackdrop();
}
function toggleBackendDrawer() {
  if (uiState.backendOpen) closeBackendDrawer();
  else openBackendDrawer();
}

function openProbPopover() {
  uiState.probOpen = true;
  document.body.classList.add("prob-open");
  updateBackdrop();
  updateProbPopover();
}
function closeProbPopover() {
  uiState.probOpen = false;
  document.body.classList.remove("prob-open");
  updateBackdrop();
}
function toggleProbPopover() {
  if (uiState.probOpen) closeProbPopover();
  else openProbPopover();
}

function openMenu() {
  uiState.menuOpen = true;
  document.body.classList.add("menu-open");
  $("moreMenuBtn")?.setAttribute("aria-expanded", "true");
  updateBackdrop();
}
function closeMenu() {
  uiState.menuOpen = false;
  document.body.classList.remove("menu-open");
  $("moreMenuBtn")?.setAttribute("aria-expanded", "false");
  updateBackdrop();
}
function toggleMenu() {
  if (uiState.menuOpen) closeMenu();
  else openMenu();
}

function updateSelectionState() {
  const hasSel = !!pendingCX;
  document.body.classList.toggle("has-selection", hasSel);
}

const GATELIB_COLLAPSE_KEY = "gateLibCollapsed";
const GATELIB_POS_KEY = "gateLibPos";

function setGateLibCollapsed(collapsed) {
  document.body.classList.toggle("gate-lib-collapsed", !!collapsed);
  try { localStorage.setItem(GATELIB_COLLAPSE_KEY, collapsed ? "1" : "0"); } catch {}
}

function toggleGateLibCollapsed() {
  const isCollapsed = document.body.classList.contains("gate-lib-collapsed");
  setGateLibCollapsed(!isCollapsed);
}

function applyGateLibPosition(pos) {
  const panel = $("gateLibrary");
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  const pad = 8;
  const defaultTop = window.innerHeight - rect.height - 18;
  const defaultLeft = 18;
  const left = clamp(pos?.left ?? defaultLeft, pad, Math.max(pad, window.innerWidth - rect.width - pad));
  const top = clamp(pos?.top ?? defaultTop, pad, Math.max(pad, window.innerHeight - rect.height - pad));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  return { left, top };
}

function initGateLibraryDrag() {
  const panel = $("gateLibrary");
  if (!panel) return;

  let savedPos = null;
  try { savedPos = JSON.parse(localStorage.getItem(GATELIB_POS_KEY)); } catch {}
  let currentPos = applyGateLibPosition(savedPos);

  let start = null;

  const startDrag = (ev) => {
    if (ev.button !== 0) return;
    if (ev.target && ev.target.closest("[draggable]")) return;
    if (ev.target && ev.target.closest("button, input, select, label")) return;
    const rect = panel.getBoundingClientRect();
    start = {
      x: ev.clientX,
      y: ev.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    panel.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  };

  const moveDrag = (ev) => {
    if (!start) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    const pad = 8;
    const nextLeft = clamp(start.left + dx, pad, Math.max(pad, window.innerWidth - start.width - pad));
    const nextTop = clamp(start.top + dy, pad, Math.max(pad, window.innerHeight - start.height - pad));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    currentPos = { left: nextLeft, top: nextTop };
  };

  const endDrag = () => {
    if (!start) return;
    try { localStorage.setItem(GATELIB_POS_KEY, JSON.stringify(currentPos)); } catch {}
    start = null;
  };

  panel.addEventListener("pointerdown", startDrag);
  panel.addEventListener("pointermove", moveDrag);
  panel.addEventListener("pointerup", endDrag);
  panel.addEventListener("pointercancel", endDrag);

  window.addEventListener("resize", () => {
    currentPos = applyGateLibPosition(currentPos);
  });
}

// -------------------- Bloch overlay controls --------------------
function setTrajectoryVisible(on) {
  widgets.forEach(({ widget }) => {
    if (widget?.traceLine) widget.traceLine.visible = !!on;
  });
}

// -------------------- Prob popover --------------------
function formatProbabilityLatex(p) {
  const clamped = Math.max(0, Math.min(1, p));
  const frac = toFraction(clamped, 256, 1e-6);
  return fracLatex(frac);
}

function updateProbPopover() {
  const host = $("probHistogram");
  if (!host) return;

  const w = widgets[selectedQubit]?.widget;
  if (!w) return;

  const p0 = cAbs2(w.state.alpha);
  const p1 = cAbs2(w.state.beta);
  const alpha = formatExactComplex(w.state.alpha);
  const beta = formatExactComplex(w.state.beta);

  host.innerHTML = `
    <div class="bar prob-row">
      <div class="prob-state">|0⟩</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(1, p0)) * 100}%"></div></div>
      <div class="prob-math">\\(\\Pr(|0\\rangle) = |\\alpha|^{2} = ${formatProbabilityLatex(p0)}\\)</div>
    </div>
    <div class="bar prob-row">
      <div class="prob-state">|1⟩</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(1, p1)) * 100}%"></div></div>
      <div class="prob-math">\\(\\Pr(|1\\rangle) = |\\beta|^{2} = ${formatProbabilityLatex(p1)}\\)</div>
    </div>
    <div class="prob-statevector">\\(|\\psi\\rangle = ${alpha}\\,|0\\rangle + ${beta}\\,|1\\rangle\\)</div>
  `;

  if (typeof MathJax !== "undefined") MathJax.typesetPromise([host]);
}

// -------------------- Backend MathJax view --------------------
function computeStateAtStep(stepIdx, q) {
  const st = normalizeState({ alpha: c(1,0), beta: c(0,0) });
  if (stepIdx < 0) return st;
  for (let s = 0; s <= stepIdx; s++) {
    const g = singleQ[q]?.[s];
    if (g && GATES[g]) applyGateToState(st, g);
  }
  return st;
}

function updateBackendMath() {
  if (!uiState.backendOpen) return;

  const simplify = $("toggleSimplify")?.checked ?? true;
  const tol = simplify ? 1e-4 : 1e-7;
  const showMatrix = $("toggleShowMatrix")?.checked ?? false;
  document.body.classList.toggle("show-matrix", !!showMatrix);

  const g = (activeStep >= 0) ? singleQ[selectedQubit]?.[activeStep] : null;

  const prevState = computeStateAtStep(activeStep - 1, selectedQubit);
  const curState  = computeStateAtStep(activeStep, selectedQubit);

  const prevA = formatExactComplex(prevState.alpha, tol);
  const prevB = formatExactComplex(prevState.beta, tol);
  const curA  = formatExactComplex(curState.alpha, tol);
  const curB  = formatExactComplex(curState.beta, tol);

  const gateStr = g ? `\\text{Gate: } ${g}` : `\\text{Gate: } I`;
  const updateStr = g ? `|\\psi_{t}\\rangle = ${g}\\,|\\psi_{t-1}\\rangle` : `|\\psi\\rangle = |0\\rangle`;

  const stateLine = g
    ? `\\[
|\\psi_{t-1}\\rangle =
\\begin{pmatrix}
${prevA} \\\\
${prevB}
\\end{pmatrix}
\\quad\\Rightarrow\\quad
|\\psi_{t}\\rangle =
\\begin{pmatrix}
${curA} \\\\
${curB}
\\end{pmatrix}
\\]`
    : `\\[
|\\psi\\rangle =
\\begin{pmatrix}
1 \\\\
0
\\end{pmatrix}
\\]`;

  const blochStr = `\\[\\vec{r}' = R(U)\\,\\vec{r}\\]`;
  const notesStr = `\\[\\text{Showing single-qubit reduced state when entangled.}\\]`;

  const elGate = $("currentGateLatex");
  const elUpd = $("stateUpdateLatex");
  const elBloch = $("blochUpdateLatex");
  const elNotes = $("notesLatex");
  const elMat = $("optionalMatrixLatex");

  if (elGate) elGate.innerHTML = `\\[${gateStr}\\]`;
  if (elUpd) elUpd.innerHTML = `\\[${updateStr}\\]${stateLine}`;
  if (elBloch) elBloch.innerHTML = blochStr;
  if (elNotes) elNotes.innerHTML = notesStr;
  if (elMat) {
    const gateLatex = gateMatrixLatex(g || "I");
    const rhoLatex = matrixLatex(`\\rho_{${selectedQubit + 1}}`, densityMatrix(curState));
    elMat.innerHTML = showMatrix ? gateLatex + rhoLatex : "";
  }

  if (typeof MathJax !== "undefined") {
    const nodes = [elGate, elUpd, elBloch, elNotes, elMat].filter(Boolean);
    MathJax.typesetPromise(nodes);
  }
}

async function copyBackendLatex() {
  const parts = [
    $("currentGateLatex")?.textContent ?? "",
    $("stateUpdateLatex")?.textContent ?? "",
    $("blochUpdateLatex")?.textContent ?? "",
    $("notesLatex")?.textContent ?? "",
    $("optionalMatrixLatex")?.textContent ?? "",
  ].filter(Boolean).join("\n\n");
  try { await navigator.clipboard.writeText(parts); } catch {}
}

// -------------------- Keyboard --------------------
function shouldIgnoreKey(e) {
  const el = e.target;
  if (!el) return false;
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

function closeAllOverlays() {
  closeMenu();
  closeProbPopover();
  closeBackendDrawer();
}

function onGlobalKeydown(e) {
  if (shouldIgnoreKey(e)) return;

  if (e.key === "ArrowLeft") { e.preventDefault(); stepBack(); }
  else if (e.key === "ArrowRight") { e.preventDefault(); stepForward(); }
  else if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); togglePlayback(); }
  else if (e.key === "r" || e.key === "R") { e.preventDefault(); resetStepCursor(); }
  else if (e.key === "m" || e.key === "M") { e.preventDefault(); toggleBackendDrawer(); }
  else if (e.key === "Escape") {
    e.preventDefault();
    closeAllOverlays();
    pendingCX = null;
    updateSelectionState();
  }
}

// -------------------- Boot (UI wiring only) --------------------
window.addEventListener("load", () => {
  applyStoredSplit();

  initCircuitModel();
  rebuildBlochGrid();
  renderCircuit();
  updateActiveStepUI();
  rebuildToStep(activeStep);

  initPrimarySplitter();

  // Gate library: always visible + render once
  renderGatePalette();
  updateGateHoverMath(null);
  initGateLibraryDrag();

  // Keep qubit UI in sync at boot
  syncQubitCountUI();

  // Topbar wiring
  $("prevStep")?.addEventListener("click", () => stepBack());
  $("nextStep")?.addEventListener("click", () => stepForward());
  $("playPause")?.addEventListener("click", () => togglePlayback());
  $("resetState")?.addEventListener("click", () => resetStepCursor());

  // Qubit controls (topbar)
  $("addQubitTop")?.addEventListener("click", () => addQubit());
  $("removeQubitTop")?.addEventListener("click", () => removeQubit());

  // Circuit toolstrip qubit buttons (kept)
  $("addQubit")?.addEventListener("click", () => addQubit());
  $("removeQubit")?.addEventListener("click", () => removeQubit());

  // Bloch overlay wiring
  $("toggleTrajectory")?.addEventListener("change", (e) => setTrajectoryVisible(!!e.target.checked));
  $("openProbPopover")?.addEventListener("click", (e) => { e.stopPropagation(); toggleProbPopover(); });
  $("openBackendDrawer")?.addEventListener("click", (e) => { e.stopPropagation(); toggleBackendDrawer(); });
  $("toggleTrajectoryBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const cb = $("toggleTrajectory");
    const next = !(cb?.checked ?? true);
    if (cb) cb.checked = next;
    setTrajectoryVisible(next);
  });
  $("openProbBtn")?.addEventListener("click", (e) => { e.stopPropagation(); toggleProbPopover(); });
  $("openMathBtn")?.addEventListener("click", (e) => { e.stopPropagation(); openBackendDrawer(); });

  // deleteSelection: conservative
  $("deleteSelection")?.addEventListener("click", () => {
    pendingCX = null;
    updateSelectionState();
  });

  // Backend drawer wiring
  $("closeBackendDrawer")?.addEventListener("click", () => closeBackendDrawer());
  $("toggleSimplify")?.addEventListener("change", () => updateBackendMath());
  $("toggleShowMatrix")?.addEventListener("change", () => updateBackendMath());
  $("copyLatex")?.addEventListener("click", () => copyBackendLatex());

  // Drawer resizing: drag the math panel (or handle) to resize/close
  {
    const handle = $("drawerHandle");
    const panel = $("unitaryMath");
    const drawer = $("backendDrawer");
    const parseLen = (val, fallbackPx) => {
      if (!val) return fallbackPx;
      const trimmed = String(val).trim();
      if (trimmed.endsWith("vh")) {
        const n = parseFloat(trimmed);
        return Number.isFinite(n) ? (window.innerHeight * n) / 100 : fallbackPx;
      }
      const n = parseFloat(trimmed);
      return Number.isFinite(n) ? n : fallbackPx;
    };
    const getBounds = () => {
      const root = getComputedStyle(document.documentElement);
      const minH = parseLen(root.getPropertyValue("--drawerMinH"), 160);
      const maxH = parseLen(root.getPropertyValue("--drawerMaxH"), window.innerHeight * 0.95);
      return { minH, maxH };
    };
    const getCurrentHeight = () => {
      if (drawer) return drawer.getBoundingClientRect().height;
      const root = getComputedStyle(document.documentElement);
      return parseLen(root.getPropertyValue("--drawerH"), window.innerHeight * 0.32);
    };
    const attachResize = (el) => {
      if (!el || !drawer) return;
      let startY = null;
      let startH = null;
      el.addEventListener("pointerdown", (ev) => {
        if (!uiState.backendOpen || ev.button !== 0) return;
        startY = ev.clientY;
        startH = getCurrentHeight();
        el.setPointerCapture?.(ev.pointerId);
        ev.preventDefault();
      });
      el.addEventListener("pointermove", (ev) => {
        if (startY == null || startH == null) return;
        const dy = ev.clientY - startY;
        if (dy > 140) {
          startY = null;
          startH = null;
          closeBackendDrawer();
          return;
        }
        const { minH, maxH } = getBounds();
        const nextH = Math.max(minH, Math.min(maxH, startH - dy));
        drawer.style.height = `${nextH}px`;
      });
      const resetDrag = () => { startY = null; startH = null; };
      el.addEventListener("pointerup", resetDrag);
      el.addEventListener("pointercancel", resetDrag);
    };
    attachResize(handle);
    attachResize(panel);
  }

  // More menu
  $("moreMenuBtn")?.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });

  $("menuClearCircuit")?.addEventListener("click", () => {
    closeMenu();
    const ok = window.confirm("Clear the circuit? This cannot be undone.");
    if (!ok) return;
    clearCircuit();
  });

  ["menuExportJson","menuExportPng","menuTheme","menuShortcuts","menuSimulation"].forEach((id) => {
    $(id)?.addEventListener("click", () => closeMenu());
  });

  // Backdrop closes overlays (drawer/prob/menu only)
  $("overlayBackdrop")?.addEventListener("click", () => closeAllOverlays());

  // Click outside closes menu/prob (gate library stays)
  document.addEventListener("click", (e) => {
    const menu = $("moreMenuPopover");
    const menuBtn = $("moreMenuBtn");
    if (uiState.menuOpen && menu && menuBtn && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();

    const prob = $("probPopover");
    const probBtn = $("openProbPopover");
    if (uiState.probOpen && prob && probBtn && !prob.contains(e.target) && !probBtn.contains(e.target)) closeProbPopover();
  });

  // Global hotkeys
  window.addEventListener("keydown", onGlobalKeydown);


  // Restore collapsed state
try {
  const saved = localStorage.getItem(GATELIB_COLLAPSE_KEY);
  if (saved === "1") setGateLibCollapsed(true);
} catch {}

// Button click
$("gateLibToggle")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleGateLibCollapsed();
});

  // Selection state boot
  updateSelectionState();

  // Trail default matches checkbox
  setTrajectoryVisible($("toggleTrajectory")?.checked ?? true);

  // Ensure Bloch renderer keeps up with circuit-grid resize
  const circuitGrid = $("circuit-grid");
  if (circuitGrid) {
    const ro = new ResizeObserver(() => requestAnimationFrame(resizeAllWidgets));
    ro.observe(circuitGrid);
  }
});

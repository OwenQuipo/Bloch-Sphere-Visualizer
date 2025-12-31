// main.js
import "./styles/index.css";
import * as THREE from "three";
import { CoinFlipAnimator } from "./visuals/coin-flip";
import { BlochSphereWidget } from "./visuals/bloch-sphere";
import { $, setText } from "./utils/dom";
import {
  EXACT_COMPLEX,
  GATES,
  INVERSE_GATE,
  BLOCH_Y_SIGN,
  P0,
  P1,
  SQ,
  PAULI_X,
  PAULI_Y,
  PAULI_Z,
  ID2,
  CX4,
  SWAP4,
  addRho,
  approx,
  apply4Unitary,
  applyCXApprox,
  applyGateToRho,
  applyGateToState,
  applyProjectorOn4,
  blochFromRho,
  buildProductRho2,
  c,
  cAbs2,
  cAdd,
  cAddScaled,
  cConj,
  cScale,
  cmul,
  densityFromState,
  formatExactComplex,
  fracLatex,
  getBlochVectorFromState,
  isEntangledFromRho,
  mat4Adjoint,
  mat4Mul,
  matAdjoint,
  matMul2,
  normalizeState,
  partialTraceQubit,
  probsFromRho,
  rhoToPureState,
  scaleRho,
  tensor2,
  singleOn4,
  toFraction,
  trace2MatSquared,
  expectationPauliPair,
  fmtComplex,
} from "./quantum/quantum";
import { typesetNode } from "./utils/mathjax";
const CX_REVERSED = mat4Mul(mat4Mul(SWAP4, CX4), SWAP4);

// -------------------- App state --------------------
const MAX_QUBITS = 10;
let qubitCount = 2;
let selectedQubit = 0;
let widgets = [];
let initialStates = [];

const INIT_STATE_MAP = {
  "0": { alpha: c(1, 0), beta: c(0, 0), label: "|0\\rangle" },
  "1": { alpha: c(0, 0), beta: c(1, 0), label: "|1\\rangle" },
  "+": { alpha: c(SQ, 0), beta: c(SQ, 0), label: "|+\\rangle" },
  "-": { alpha: c(SQ, 0), beta: c(-SQ, 0), label: "|-\\rangle" },
  "i": { alpha: c(SQ, 0), beta: c(0, SQ), label: "|i\\rangle" },
  "-i": { alpha: c(SQ, 0), beta: c(0, -SQ), label: "|-i\\rangle" },
};
const TIP_MAP = {
  prevStep: "⬅️ Step back one gate",
  nextStep: "➡️ Step forward one gate",
  playPause: "⏯ Play / pause timeline",
  resetState: "🔄 Reset visualization state",
  addQubitTop: "➕ Add a qubit wire",
  removeQubitTop: "➖ Remove a qubit wire",
  addQubit: "➕ Add a qubit wire",
  removeQubit: "➖ Remove a qubit wire",
  openProbPopover: "📊 Show probabilities",
  openBackendDrawer: "📐 Open math drawer",
  toggleTrajectory: "🧭 Toggle Bloch trail",
  toggleTrajectoryBtn: "🧭 Toggle Bloch trail",
  toggleMeasurementAnim: "🪙 Toggle measurement flip animation",
  gateLibToggle: "📚 Collapse / expand gate library",
  moreMenuBtn: "⋮ More options",
  menuClearCircuit: "🧹 Clear entire circuit",
  menuExportJson: "💾 Export circuit JSON",
  menuExportPng: "🖼 Export screenshot",
  inspectRho: "⧉ Inspect density matrix",
  measureQ0: "📏 Measure qubit 0",
  measureQ1: "📏 Measure qubit 1",
  copyLatex: "⧉ Copy LaTeX",
  closeBackendDrawer: "✕ Close drawer",
  openProbBtn: "📊 Show probabilities",
  openMathBtn: "📐 Open math drawer",
};
let latestGlobalRho = null;
let measurementOverrideRho = null;
let measurementOutcomes = []; // [step][qubit] => 0/1/null
let measurementOdds = []; // [step][qubit] => { p0, p1 } | null
let measuredVisualOutcomes = []; // per-qubit latest measured result (manual or gate collapse)
let measurementAnimEnabled = true;
let coinAnimator = null;
let measurementAnimRunId = 0;
let entangledPairIndices = [0, 1];
const BLOCH_TILE_SIZE_KEY = "blochTileMinPx";
const SETTINGS_POS_KEY = "settingsPanelPos";
const SETTINGS_COLLAPSE_KEY = "settingsPanelCollapsed";
let tooltipEl = null;
let tooltipTimer = null;
let tooltipTarget = null;
let tooltipRefreshQueued = false;
const PURITY_EPS = 1e-6;

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
    const selPill = document.createElement("span");
    selPill.className = "selection-pill";
    selPill.textContent = "Selected";
    header.appendChild(selPill);
    tile.appendChild(header);

    const mount = document.createElement("div");
    mount.className = "tile-canvas";
    tile.appendChild(mount);

    const purity = document.createElement("div");
    purity.className = "purity-chip";
    purity.textContent = "ρ purity: 1.00";
    tile.appendChild(purity);

    const meas = document.createElement("div");
    meas.className = "measurement-badge";
    meas.textContent = "";
    tile.appendChild(meas);

    const stateChip = document.createElement("div");
    stateChip.className = "state-chip";
    stateChip.textContent = "";
    tile.appendChild(stateChip);

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

    widgets.push({ tileEl: tile, mountEl: mount, widget, ro, purityEl: purity, measEl: meas, stateChipEl: stateChip });
  }

  refreshSelectedUI();
  requestAnimationFrame(resizeAllWidgets);
  queueTooltipRefresh();
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
function isPairMember(q) { return q === entangledPairIndices[0] || q === entangledPairIndices[1]; }

function applyStoredSplit() {
  const saved = localStorage.getItem(SPLIT_STORAGE_KEY);
  if (!saved) return;
  const px = Number(saved);
  if (!Number.isFinite(px) || px <= 0) return;
  document.documentElement.style.setProperty("--splitLeft", `${px}px`);
}

function applyBlochTileSize(px) {
  const clamped = clamp(px, 160, 520);
  document.documentElement.style.setProperty("--blochTileMin", `${clamped}px`);
  const label = $("blochTileSizeVal");
  if (label) label.textContent = `${clamped}px`;
  const slider = $("blochTileSize");
  if (slider && Number(slider.value) !== clamped) slider.value = String(clamped);
}

function initBlochTileSizer() {
  const saved = Number(localStorage.getItem(BLOCH_TILE_SIZE_KEY));
  const initial = Number.isFinite(saved) ? saved : 320;
  applyBlochTileSize(initial);
  const slider = $("blochTileSize");
  if (slider) {
    slider.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      applyBlochTileSize(val);
      localStorage.setItem(BLOCH_TILE_SIZE_KEY, String(clamp(val, 160, 520)));
      requestAnimationFrame(resizeAllWidgets);
    });
  }
}

function initSettingsPanelDrag() {
  const panel = $("blochOverlay");
  const header = $("settingsHeader");
  if (!panel || !header) return;

  const applyPos = (pos) => {
    panel.classList.remove("corner-tl", "corner-tr", "corner-bl", "corner-br");
    if (pos?.corner) {
      panel.classList.add(`corner-${pos.corner}`);
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
    } else if (Number.isFinite(pos?.left) && Number.isFinite(pos?.top)) {
      panel.style.left = `${pos.left}px`;
      panel.style.top = `${pos.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }
  };

  const savedRaw = localStorage.getItem(SETTINGS_POS_KEY);
  if (savedRaw) {
    try { applyPos(JSON.parse(savedRaw)); } catch {}
  } else {
    applyPos({ corner: "bl" });
  }

  let drag = null;
  const onMove = (e) => {
    if (!drag) return;
    const left = drag.startLeft + (e.clientX - drag.startX);
    const top = drag.startTop + (e.clientY - drag.startY);
    applyPos({ left, top });
  };
  const endDrag = () => {
    if (!drag) return;
    localStorage.setItem(SETTINGS_POS_KEY, JSON.stringify({ left: drag.lastLeft ?? panel.offsetLeft, top: drag.lastTop ?? panel.offsetTop }));
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  };
  header.addEventListener("pointerdown", (e) => {
    drag = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: panel.offsetLeft,
      startTop: panel.offsetTop,
    };
    window.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      drag.lastLeft = drag.startLeft + (ev.clientX - drag.startX);
      drag.lastTop = drag.startTop + (ev.clientY - drag.startY);
      applyPos({ left: drag.lastLeft, top: drag.lastTop });
    });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  });

  document.querySelectorAll(".corner-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const corner = btn.dataset.corner;
      applyPos({ corner });
      localStorage.setItem(SETTINGS_POS_KEY, JSON.stringify({ corner }));
    });
  });

  const collapseBtn = $("settingsCollapse");
  const body = $("settingsBody");
  const restoreCollapsed = localStorage.getItem(SETTINGS_COLLAPSE_KEY) === "1";
  if (restoreCollapsed) panel.classList.add("collapsed");
  collapseBtn?.addEventListener("click", () => {
    const now = panel.classList.toggle("collapsed");
    localStorage.setItem(SETTINGS_COLLAPSE_KEY, now ? "1" : "0");
  });
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

const PALETTE_GATES = ["H", "X", "Y", "Z", "S", "T", "CX", "M", "CLEAR"];

let draggingGate = null;
let draggingFrom = null;
let draggingOp = null;

function initCircuitModel() {
  singleQ = Array.from({ length: qubitCount }, () => Array(stepCount).fill(null));
  multiQ = Array.from({ length: stepCount }, () => []);
  pendingCX = null;
  ensureInitialStates();
  measurementOverrideRho = null;
  latestGlobalRho = null;
  measurementOutcomes = Array.from({ length: stepCount }, () => Array(qubitCount).fill(null));
  measurementOdds = Array.from({ length: stepCount }, () => Array(qubitCount).fill(null));
  measuredVisualOutcomes = Array.from({ length: qubitCount }, () => null);
  updateSelectionState();
}

function ensureCircuitDimensions() {
  if (!singleQ.length || !multiQ.length) initCircuitModel();
  ensureInitialStates();
  measurementOverrideRho = null;

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

  if (!measurementOutcomes.length) {
    measurementOutcomes = Array.from({ length: stepCount }, () => Array(qubitCount).fill(null));
  } else {
    if (measurementOutcomes.length !== stepCount) {
      const old = measurementOutcomes;
      measurementOutcomes = Array.from({ length: stepCount }, (_, s) => old[s] ? [...old[s]].slice(0, qubitCount) : Array(qubitCount).fill(null));
    }
    measurementOutcomes = measurementOutcomes.map((row) => {
      if (row.length === qubitCount) return row;
      if (row.length < qubitCount) return row.concat(Array(qubitCount - row.length).fill(null));
      return row.slice(0, qubitCount);
    });
  }
  if (!measurementOdds.length) {
    measurementOdds = Array.from({ length: stepCount }, () => Array(qubitCount).fill(null));
  } else {
    if (measurementOdds.length !== stepCount) {
      const old = measurementOdds;
      measurementOdds = Array.from({ length: stepCount }, (_, s) => old[s] ? [...old[s]].slice(0, qubitCount) : Array(qubitCount).fill(null));
    }
    measurementOdds = measurementOdds.map((row) => {
      if (row.length === qubitCount) return row;
      if (row.length < qubitCount) return row.concat(Array(qubitCount - row.length).fill(null));
      return row.slice(0, qubitCount);
    });
  }
  measuredVisualOutcomes = Array.from({ length: qubitCount }, (_, i) => measuredVisualOutcomes[i] ?? null);

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

function clearMeasurementOutcomesFrom(stepIdx) {
  if (!measurementOutcomes?.length) return;
  for (let s = stepIdx; s < stepCount; s++) {
    if (measurementOutcomes[s]) measurementOutcomes[s].fill(null);
    if (measurementOdds[s]) measurementOdds[s].fill(null);
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
  if (g === "M") return "gate-m";
  return "";
}

function clearAt(q, s) {
  singleQ[q][s] = null;
  multiQ[s] = multiQ[s].filter((op) => !(op.type === "CX" && (op.control === q || op.target === q)));
  clearMeasurementOutcomesFrom(s);
}

function placeSingleGate(q, s, gate) {
  if (gate === "CLEAR") { clearAt(q, s); return; }
  if (!GATES[gate]) return;
  singleQ[q][s] = gate;
  multiQ[s] = multiQ[s].filter((op) => !(op.type === "CX" && (op.control === q || op.target === q)));
  clearMeasurementOutcomesFrom(s);
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
  clearMeasurementOutcomesFrom(s);
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
  clearMeasurementOutcomesFrom(step);
}

function circuitIsEmpty() {
  const noSingles = singleQ.every((row) => row.every((cell) => !cell));
  const noMulti = multiQ.every((ops) => ops.length === 0);
  return noSingles && noMulti;
}

function seedReferenceCircuit() {
  if (!circuitIsEmpty()) return;
  qubitCount = Math.max(qubitCount, 2);
  ensureCircuitDimensions();
  placeSingleGate(0, 1, "H");
  placeCXDirect(3, 0, 1);
  placeSingleGate(0, 5, "M");
}

function ensureInitialStates() {
  initialStates = Array.from({ length: qubitCount }, (_, idx) => initialStates[idx] ?? "0");
}

function setInitialStateForQubit(q, state) {
  if (q < 0 || q >= qubitCount) return;
  const s = INIT_STATE_MAP[state] ? state : "0";
  initialStates[q] = s;
  renderCircuit();
  rebuildToStep(activeStep);
}

function getInitialState(q) {
  const key = INIT_STATE_MAP[initialStates[q]] ? initialStates[q] : "0";
  const base = INIT_STATE_MAP[key];
  return {
    alpha: c(base.alpha.re, base.alpha.im),
    beta: c(base.beta.re, base.beta.im),
  };
}

let initStateMenuEl = null;

function ensureInitStateMenu() {
  if (initStateMenuEl) return initStateMenuEl;
  const menu = document.createElement("div");
  menu.id = "initStateMenu";
  menu.innerHTML = `
    <div class="init-title">Initial state</div>
    <div class="init-options">
      <button type="button" data-state="0">\\(|0\\rangle\\)</button>
      <button type="button" data-state="1">\\(|1\\rangle\\)</button>
      <button type="button" data-state="+">\\(|+\\rangle\\)</button>
      <button type="button" data-state="-">\\(|-\\rangle\\)</button>
      <button type="button" data-state="i">\\(|i\\rangle\\)</button>
      <button type="button" data-state="-i">\\(|-i\\rangle\\)</button>
    </div>
  `;
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-state]");
    if (!btn) return;
    const q = Number(menu.dataset.q ?? -1);
    setInitialStateForQubit(q, btn.dataset.state);
    hideInitStateMenu();
  });
  document.body.appendChild(menu);
  typesetNode(menu);
  initStateMenuEl = menu;
  return menu;
}

function showInitStateMenu(q, anchorEl) {
  const menu = ensureInitStateMenu();
  const rect = anchorEl.getBoundingClientRect();
  menu.dataset.q = String(q);
  menu.style.left = `${rect.left + window.scrollX}px`;
  menu.style.top = `${rect.bottom + 6 + window.scrollY}px`;
  menu.classList.add("on");
}

function hideInitStateMenu() {
  if (!initStateMenuEl) return;
  initStateMenuEl.classList.remove("on");
  initStateMenuEl.dataset.q = "";
}

// -------------------- Tooltips (global hover help) --------------------
function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  const el = document.createElement("div");
  el.id = "hoverTooltip";
  document.body.appendChild(el);
  tooltipEl = el;
  return el;
}

function hideTooltip() {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
  tooltipTarget = null;
  if (tooltipEl) tooltipEl.classList.remove("on");
}

function showTooltip(target) {
  if (!target) return;
  const tip = target.dataset.tip || target.getAttribute("title") || target.getAttribute("aria-label") || target.textContent?.trim();
  if (!tip) return;
  const el = ensureTooltipEl();
  el.innerHTML = `🔘 ${tip}`;
  const rect = target.getBoundingClientRect();
  const pad = 8;
  const x = rect.left + rect.width / 2;
  const y = rect.top - 10;
  el.style.left = `${Math.max(pad, Math.min(window.innerWidth - pad, x))}px`;
  el.style.top = `${Math.max(pad, y)}px`;
  el.classList.add("on");
}

function attachTooltipHandlers(nodes) {
  nodes.forEach((btn) => {
    if (btn.dataset.tipBound) return;
    btn.dataset.tipBound = "1";
    btn.addEventListener("pointerenter", () => {
      hideTooltip();
      tooltipTarget = btn;
      tooltipTimer = setTimeout(() => showTooltip(btn), 520);
    });
    const cancel = () => hideTooltip();
    btn.addEventListener("pointerleave", cancel);
    btn.addEventListener("pointerdown", cancel);
    btn.addEventListener("keydown", cancel);
  });
}

function initTooltips() {
  const selectors = [
    "button",
    "input[type=button]",
    "input[type=submit]",
    "label.micro-toggle",
    ".palette-gate",
    ".cgate",
    ".gate-box",
    ".micro-btn",
    ".icon-btn",
    ".menu-item",
    ".micro-icon",
  ];
  const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
  nodes.forEach((n) => {
    if (!n.dataset.tip) {
      const mapped = TIP_MAP[n.id];
      const label = mapped || n.getAttribute("aria-label") || n.getAttribute("title") || n.textContent?.trim();
      if (label) n.dataset.tip = label;
    }
  });
  attachTooltipHandlers(nodes.filter((n) => !n.dataset.tipBound));
}

function queueTooltipRefresh() {
  if (tooltipRefreshQueued) return;
  tooltipRefreshQueued = true;
  requestAnimationFrame(() => {
    tooltipRefreshQueued = false;
    initTooltips();
  });
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
  return densityFromState(state);
}

function computeBlochTraces(stepIdx) {
  const pairIndices = findPrimaryPair(stepIdx);
  const [pairA, pairB] = pairIndices;
  const stateList = Array.from({ length: qubitCount }, (_, q) => normalizeState(getInitialState(q)));
  let rho4 = buildProductRho2(stateList[pairA], stateList[pairB]);

  const traces = Array.from({ length: qubitCount }, () => []);
  const measuredLatest = Array.from({ length: qubitCount }, () => null);
  const measuredEvents = [];

  const pushAllVecs = () => {
    for (let q = 0; q < qubitCount; q++) {
      if (q === pairA || q === pairB) {
        const rhoPart = partialTraceQubit(rho4, q === pairA ? 1 : 0);
        const v = blochFromRho(rhoPart);
        stateList[q] = stateFromRho(rhoPart);
        traces[q]?.push(v);
      } else {
        traces[q]?.push(getBlochVectorFromState(stateList[q]));
      }
    }
  };

  pushAllVecs();

  if (stepIdx >= 0) {
    for (let s = 0; s <= stepIdx; s++) {
      for (let q = 0; q < qubitCount; q++) {
        const g = singleQ[q]?.[s];
        if (g && GATES[g]) {
          if (g === "M") {
            const storedOdds = measurementOdds?.[s]?.[q];
            if (q === pairA || q === pairB) {
              const localIdx = q === pairA ? 0 : 1;
              const probs = storedOdds || measureProbabilities(rho4, localIdx);
              let outcome = measurementOutcomes?.[s]?.[q];
              if (outcome == null) {
                const total = Math.max(0, probs.p0 + probs.p1) || 1;
                const r = Math.random();
                outcome = (r < probs.p0 / total) ? 0 : 1;
                if (measurementOutcomes[s]) measurementOutcomes[s][q] = outcome;
              }
              if (!storedOdds && measurementOdds[s]) {
                measurementOdds[s][q] = { p0: probs.p0, p1: probs.p1 };
              }
              const { rho: collapsed } = collapseOnOutcome(rho4, localIdx, outcome);
              rho4 = collapsed;
              measuredLatest[q] = outcome;
              measuredEvents.push({ qubit: q, outcome, step: s, probs });
              pushAllVecs();
              continue;
            } else {
              const state = stateList[q];
              const rho = densityFromState(state);
              const probs = storedOdds || probsFromRho(rho);
              let outcome = measurementOutcomes?.[s]?.[q];
              if (outcome == null) {
                const total = Math.max(0, probs.p0 + probs.p1) || 1;
                const r = Math.random();
                outcome = (r < probs.p0 / total) ? 0 : 1;
                if (measurementOutcomes[s]) measurementOutcomes[s][q] = outcome;
              }
              if (!storedOdds && measurementOdds[s]) {
                measurementOdds[s][q] = { p0: probs.p0, p1: probs.p1 };
              }
              stateList[q] = outcome === 0 ? normalizeState({ alpha: c(1, 0), beta: c(0, 0) }) : normalizeState({ alpha: c(0, 0), beta: c(1, 0) });
              measuredLatest[q] = outcome;
              measuredEvents.push({ qubit: q, outcome, step: s, probs });
              pushAllVecs();
              continue;
            }
          }

          if (q === pairA || q === pairB) {
            const U = GATES[g].matrix;
            const beforeRho = partialTraceQubit(rho4, q === pairA ? 1 : 0);
            const beforeV = blochFromRho(beforeRho);
            const U4 = singleOn4(U, q === pairA ? 0 : 1);
            rho4 = apply4Unitary(rho4, U4);
            const axis = new THREE.Vector3(GATES[g].axis.x, GATES[g].axis.y, GATES[g].axis.z).normalize();
            const beforeVec = new THREE.Vector3(beforeV.x, beforeV.y, beforeV.z);
            const steps = 36;
            for (let i = 1; i <= steps; i++) {
              const t = i / steps;
              const theta = GATES[g].angle * t;
              const vt = rotateVectorAroundAxis(beforeVec, axis, theta);
              if (q === 0) traces[0]?.push({ x: vt.x, y: vt.y, z: vt.z });
              if (q === 1) traces[1]?.push({ x: vt.x, y: vt.y, z: vt.z });
            }
            const afterRho = partialTraceQubit(rho4, q === pairA ? 1 : 0);
            const afterV = blochFromRho(afterRho);
            stateList[q] = stateFromRho(afterRho);
            traces[q]?.push(afterV);
          } else {
            const before = getBlochVectorFromState(stateList[q]);
            const beforeVec = new THREE.Vector3(before.x, before.y, before.z);
            stateList[q] = applyGateToState(stateList[q], g);
            const after = getBlochVectorFromState(stateList[q]);
            const afterVec = new THREE.Vector3(after.x, after.y, after.z);
            const axis = new THREE.Vector3(GATES[g].axis.x, GATES[g].axis.y, GATES[g].axis.z).normalize();
            const steps = 36;
            for (let i = 1; i <= steps; i++) {
              const t = i / steps;
              const theta = GATES[g].angle * t;
              const vt = rotateVectorAroundAxis(beforeVec, axis, theta);
              traces[q]?.push({ x: vt.x, y: vt.y, z: vt.z });
            }
            traces[q]?.push({ x: afterVec.x, y: afterVec.y, z: afterVec.z });
          }
        }
      }

      for (const op of multiQ[s]) {
        if (op.type !== "CX") continue;
        const control = op.control;
        const target = op.target;
        if ((control === pairA && target === pairB) || (control === pairB && target === pairA)) {
          const cxMat = control === pairA ? CX4 : CX_REVERSED;
          rho4 = apply4Unitary(rho4, cxMat);
        } else {
          const controlState = control === pairA || control === pairB
            ? stateFromRho(partialTraceQubit(rho4, control === pairA ? 1 : 0))
            : cloneState(stateList[control]);
          const targetState = target === pairA || target === pairB
            ? stateFromRho(partialTraceQubit(rho4, target === pairA ? 1 : 0))
            : cloneState(stateList[target]);

          const updatedTarget = applyCXApprox(controlState, targetState);
          if (target < qubitCount) stateList[target] = updatedTarget;

          if (control === pairA || control === pairB || target === pairA || target === pairB) {
            const pa = stateToPure(stateList[pairA]);
            const pb = stateToPure(stateList[pairB]);
            rho4 = buildProductRho2(pa, pb);
          }
        }
        pushAllVecs();
      }
    }
  }

  const states = Array.from({ length: qubitCount }, (_, idx) => {
    if (idx === pairA || idx === pairB) return stateList[idx];
    return stateList[idx];
  });

  return { states, traces, rho2: rho4, measuredEvents, measuredLatest, pairIndices };
}

function updateGateHoverMath(gateName) {
  const el = $("gateHoverMath");
  if (!el) return;

  if (gateName === "M") {
    el.innerHTML = `\\[\\text{Measurement symbol (visual only; no collapse).}\\]`;
    if (typeof MathJax !== "undefined") MathJax.typesetPromise([el]);
    return;
  }

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
    item.dataset.tip = `Drag gate ${g}`;

    const box = document.createElement("div");
    box.className = "gate-box " + gateColorClass(g);
    if (g === "CLEAR") {
      box.textContent = "🧽";
    } else if (g === "M") {
      box.classList.add("gate-measure");
      const mIcon = document.createElement("div");
      mIcon.className = "measure-icon";
      box.appendChild(mIcon);
    } else {
      box.textContent = g;
    }

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
  measurementOverrideRho = null;

  measuredVisualOutcomes = Array.from({ length: qubitCount }, () => null);
  refreshMeasurementClasses();

  const { states, traces, rho2, measuredEvents, measuredLatest, pairIndices } = computeBlochTraces(stepIdx);
  entangledPairIndices = pairIndices;
  latestGlobalRho = rho2;
  const entangledNow = !!rho2 && isEntangledFromRho(rho2);
  const eventsThisStep = (measuredEvents || []).filter((ev) => ev.step === stepIdx);
  const shouldAnimateMeasure = measurementAnimEnabled && !!coinAnimator && stepIdx >= 0 && eventsThisStep.length > 0;
  const holdMap = new Map();

  for (let q = 0; q < qubitCount; q++) {
    const w = widgets[q]?.widget;
    if (!w) continue;
    const state = states[q] ?? normalizeState(getInitialState(q));
    const trace = traces[q] ?? [];
    const hold = shouldAnimateMeasure && eventsThisStep.some((ev) => ev.qubit === q);
    const hideArrow = hold || (entangledNow && measuredVisualOutcomes[q] == null && isPairMember(q));
    const hideTrace = hideArrow;
    w.setStateAndTrace(state, trace, { hideArrow, hideTrace });
    const rho = densityFromState(state);
    const purity = trace2MatSquared(rho);
    updatePurityChip(widgets[q]?.purityEl, purity);
    const m = measuredLatest?.[q] ?? null;

    const measBadge = widgets[q]?.measEl;
    const stateChip = widgets[q]?.stateChipEl;

    if (hold) {
      holdMap.set(q, { state, trace, outcome: m });
      if (measBadge) {
        measBadge.textContent = "Measuring…";
        measBadge.classList.add("on", "pending");
      }
      if (stateChip) {
        stateChip.textContent = "Measurement pending";
        stateChip.classList.add("on", "pending");
        stateChip.classList.remove("entangled");
      }
    } else {
      applyMeasurementVisual(q, m, { cue: false });
      updateStateChip(q, state, rho2);
    }
  }

  updateEntanglementIndicators(rho2);
  updateProbPopover();
  updateBackendMath();
  updateCorrelationsPanel();
  updateGlobalStateBadges();

  // cue the most recent measurement events (if any) to emphasize collapse
  measuredEvents?.forEach(({ qubit, outcome, step }) => {
    if (shouldAnimateMeasure && step === stepIdx && holdMap.has(qubit)) return;
    applyMeasurementVisual(qubit, outcome, { cue: false, snap: true });
  });

  if (shouldAnimateMeasure) {
    return playMeasurementAnimations(eventsThisStep, holdMap, rho2);
  }
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
  clearMeasurementOutcomesFrom(activeStep + 1);
  updateActiveStepUI();
  const animPromise = rebuildToStep(activeStep);
  if (animPromise?.then) await animPromise;

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
  const animPromise = rebuildToStep(activeStep);
  if (animPromise?.then) await animPromise;

  stepBusy = false;
}

function resetStepCursor() {
  stopPlayback();
  activeStep = -1;
  clearMeasurementOutcomesFrom(0);
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
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      showInitStateMenu(q, label);
    });
    canvas.appendChild(label);

    const ket = document.createElement("div");
    ket.className = "cwire-ket";
    ket.style.top = `${y + 8}px`;
    const initLabel = INIT_STATE_MAP[initialStates[q]]?.label || "|0\\rangle";
    ket.innerHTML = `\\(${initLabel}\\)`;
    ket.dataset.q = String(q);
    ket.dataset.tip = "Set initial state |ψ⟩ for this wire";

    ket.addEventListener("click", (e) => {
      e.stopPropagation();
      showInitStateMenu(q, ket);
    });
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
    line.setAttribute("stroke", "var(--circuit-wire)");
    line.setAttribute("stroke-width", "3");
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
      vline.setAttribute("stroke", "var(--circuit-wire)");
      vline.setAttribute("stroke-width", "2.2");
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
      gate.dataset.gate = g;
      gate.style.left = `${x - 21}px`;
      gate.style.top = `${y - 21}px`;
      gate.dataset.tip = g === "M" ? "Measurement gate" : `Gate ${g}`;
      if (g === "M") {
        gate.classList.add("cgate-measure");
        const icon = document.createElement("div");
        icon.className = "measure-icon";
        gate.appendChild(icon);
      } else {
        gate.textContent = g;
      }
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
        g.className = "cgate cx-node";
        g.dataset.gate = "CX";
        g.style.left = `${x - 21}px`;
        g.style.top = `${y - 21}px`;
        g.dataset.tip = "CX control";

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
        g.className = "cgate cx-node";
        g.dataset.gate = "CX";
        g.style.left = `${x - 21}px`;
        g.style.top = `${y - 21}px`;
        g.dataset.tip = "CX target";

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
  queueTooltipRefresh();
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
  ensureInitialStates();
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
  let activePointerId = null;

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
    activePointerId = ev.pointerId;
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
    if (activePointerId != null) {
      panel.releasePointerCapture?.(activePointerId);
    }
    activePointerId = null;
    start = null;
  };

  panel.addEventListener("pointerdown", startDrag);
  panel.addEventListener("pointermove", moveDrag);
  panel.addEventListener("pointerup", endDrag);
  panel.addEventListener("pointercancel", endDrag);
  panel.addEventListener("pointerleave", endDrag);
  window.addEventListener("pointerup", endDrag, { passive: true });

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

function formatStateKet(alpha, beta, tol = 1e-6) {
  const isZero = (z) => Math.abs(z.re) < tol && Math.abs(z.im) < tol;
  const isOne = (z) => Math.abs(z.re - 1) < tol && Math.abs(z.im) < tol;
  const isNegOne = (z) => Math.abs(z.re + 1) < tol && Math.abs(z.im) < tol;

  const term = (z, basis) => {
    if (isZero(z)) return null;
    if (isOne(z)) return `|${basis}\\rangle`;
    if (isNegOne(z)) return `-|${basis}\\rangle`;
    return `${formatExactComplex(z, tol)}\\,|${basis}\\rangle`;
  };

  const terms = [term(alpha, "0"), term(beta, "1")].filter(Boolean);
  if (!terms.length) return "0";

  return terms
    .map((t, idx) => {
      if (idx === 0) return t;
      if (t.startsWith("-")) return `- ${t.slice(1)}`;
      return `+ ${t}`;
    })
    .join(" ");
}

function updatePurityChip(el, purity) {
  if (!el) return;
  const clamped = Math.max(0, Math.min(1, purity));
  el.textContent = `ρ purity: ${clamped.toFixed(2)}`;
  el.style.setProperty("--purity", String(clamped));
  const mixed = clamped < 1 - PURITY_EPS;
  el.classList.toggle("mixed", mixed);
  const tile = el.closest(".bloch-tile");
  tile?.classList.toggle("mixed", mixed);
}

function applyMeasurementVisual(q, outcome, { cue = false, snap = false } = {}) {
  const entry = widgets[q];
  if (!entry) return;
  measuredVisualOutcomes[q] = outcome;
  const { tileEl, measEl, widget, purityEl, stateChipEl } = entry;

  if (outcome == null) {
    tileEl?.classList.remove("measured");
    measEl.innerHTML = "";
    measEl.classList.remove("on");
    measEl.classList.remove("pending");
    stateChipEl?.classList.remove("pending");
    refreshMeasurementClasses();
    return;
  }

  tileEl?.classList.remove("entangled", "mixed");
  tileEl?.classList.add("measured");
  measEl.innerHTML = `State collapsed: \\(|${outcome}\\rangle\\)`;
  measEl.classList.add("on");
  measEl.classList.remove("pending");
  typesetNode(measEl);
  if (stateChipEl) {
    stateChipEl.innerHTML = `\\(|\\psi_{${q}}\\rangle = |${outcome}\\rangle\\)`;
    stateChipEl.classList.remove("entangled");
    stateChipEl.classList.remove("pending");
    typesetNode(stateChipEl);
  }

  // Snap arrow to Z with full length if requested
  if (snap && widget) {
    const pure = outcome === 0
      ? { alpha: c(1, 0), beta: c(0, 0) }
      : { alpha: c(0, 0), beta: c(1, 0) };
    widget.setStateAndTrace(normalizeState(pure), [{ x: 0, y: 0, z: outcome === 0 ? 1 : -1 }]);
    updatePurityChip(purityEl, 1);
  }

  refreshMeasurementClasses();
}

function revealHeldMeasurement(q, held, rho2) {
  if (!held) return;
  const entry = widgets[q];
  if (entry?.widget) {
    entry.widget.setStateAndTrace(held.state, held.trace, { hideArrow: false, hideTrace: false });
  }
  if (entry?.stateChipEl) {
    entry.stateChipEl.classList.remove("pending");
  }
  applyMeasurementVisual(q, held.outcome, { cue: true, snap: true });
  updateStateChip(q, held.state, rho2);
}

function playMeasurementAnimations(events, holdMap, rho2) {
  if (!events?.length || !coinAnimator || !measurementAnimEnabled) return null;
  measurementAnimRunId += 1;
  const runId = measurementAnimRunId;
  document.body.classList.add("coin-anim-visible");

  const seq = (async () => {
    for (const ev of events) {
      const label = `q${ev.qubit}`;
      await coinAnimator.play(ev.outcome, { label, probs: ev.probs });
      if (runId !== measurementAnimRunId) return;
      revealHeldMeasurement(ev.qubit, holdMap.get(ev.qubit), rho2);
    }
  })();

  return seq.finally(() => {
    if (runId === measurementAnimRunId) document.body.classList.remove("coin-anim-visible");
  });
}

function refreshMeasurementClasses() {
  widgets.forEach((entry, idx) => {
    const tile = entry?.tileEl;
    if (!tile) return;
    tile.classList.remove("measured-hit", "measured-miss", "measure-pulse");
  });
}

function updateProbPopover() {
  const host = $("probHistogram");
  if (!host) return;

  const w = widgets[selectedQubit]?.widget;
  if (!w) return;

  const rho = densityFromState(w.state);
  const { p0, p1 } = probsFromRho(rho);

  host.innerHTML = `
    <div class="bar prob-row">
      <div class="prob-state">|0⟩</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(1, p0)) * 100}%"></div></div>
      <div class="prob-math">\\(\\Pr(|0\\rangle) = ${formatProbabilityLatex(p0)}\\)</div>
    </div>
    <div class="bar prob-row">
      <div class="prob-state">|1⟩</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(1, p1)) * 100}%"></div></div>
      <div class="prob-math">\\(\\Pr(|1\\rangle) = ${formatProbabilityLatex(p1)}\\)</div>
    </div>
  `;

  if (typeof MathJax !== "undefined") MathJax.typesetPromise([host]);
}

// -------------------- Entanglement + correlations --------------------
function getCurrentRho4() {
  return measurementOverrideRho || latestGlobalRho;
}

function measureProbabilities(rho4, qubit) {
  const proj0 = qubit === 0 ? tensor2(P0, ID2) : tensor2(ID2, P0);
  const proj1 = qubit === 0 ? tensor2(P1, ID2) : tensor2(ID2, P1);
  let p0 = 0;
  let p1 = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      p0 += cmul(proj0[i][j], rho4[j][i]).re;
      p1 += cmul(proj1[i][j], rho4[j][i]).re;
    }
  }
  return { p0: Math.max(0, p0), p1: Math.max(0, p1) };
}

function collapseOnOutcome(rho4, qubit, outcome) {
  const probs = measureProbabilities(rho4, qubit);
  const total = Math.max(0, probs.p0 + probs.p1);
  const prob = outcome === 0 ? probs.p0 : probs.p1;
  const proj = outcome === 0 ? P0 : P1;
  const P = qubit === 0 ? tensor2(proj, ID2) : tensor2(ID2, proj);
  const Pdag = mat4Adjoint(P);
  let collapsed = mat4Mul(mat4Mul(P, rho4), Pdag);
  if (prob > 0) collapsed = collapsed.map((row) => row.map((z) => cScale(z, 1 / prob)));
  return { rho: collapsed, prob, outcome };
}

function stateFromRho(rho) {
  const pure = rhoToPureState(rho);
  if (pure) return pure;
  return {
    rho: rho.map((row) => row.map((z) => ({ re: z.re, im: z.im }))),
  };
}

function cloneState(state) {
  if (!state) return null;
  if (state.rho) {
    return {
      rho: state.rho.map((row) => row.map((z) => ({ re: z.re, im: z.im }))),
    };
  }
  return {
    alpha: c(state.alpha.re, state.alpha.im),
    beta: c(state.beta.re, state.beta.im),
  };
}

function stateToPure(state) {
  if (!state) return normalizeState({ alpha: c(1, 0), beta: c(0, 0) });
  if (state.rho) {
    const pure = rhoToPureState(state.rho);
    if (pure) return pure;
    const { p0, p1 } = probsFromRho(state.rho);
    return normalizeState({
      alpha: c(Math.sqrt(Math.max(0, p0)), 0),
      beta: c(Math.sqrt(Math.max(0, p1)), 0),
    });
  }
  return normalizeState({
    alpha: c(state.alpha.re, state.alpha.im),
    beta: c(state.beta.re, state.beta.im),
  });
}

function findPrimaryPair(stepIdx) {
  const maxStep = Math.max(0, Math.min(stepCount - 1, stepIdx ?? stepCount - 1));
  for (let s = 0; s <= maxStep; s++) {
    for (const op of multiQ[s] || []) {
      if (op.type === "CX" && op.control < qubitCount && op.target < qubitCount) {
        return [op.control, op.target];
      }
    }
  }
  const fallbackA = 0;
  const fallbackB = Math.min(1, Math.max(0, qubitCount - 1));
  return [fallbackA, fallbackB];
}

function updateCorrelationsPanel() {
  const rho = getCurrentRho4();
  const panel = $("correlationsPanel");
  if (!panel) return;
  if (!rho) {
    panel.style.opacity = "0";
    return;
  }

  const vals = {
    XX: expectationPauliPair(rho, PAULI_X, PAULI_X),
    YY: expectationPauliPair(rho, PAULI_Y, PAULI_Y),
    ZZ: expectationPauliPair(rho, PAULI_Z, PAULI_Z),
  };

  ["XX", "YY", "ZZ"].forEach((k) => {
    const bar = $(`corr${k}`);
    const lab = $(`corr${k}Val`);
    const v = Math.max(-1, Math.min(1, vals[k]));
    if (bar) {
      const width = Math.abs(v) * 100;
      bar.style.width = `${width}%`;
      bar.style.left = v >= 0 ? "50%" : `${50 - width}%`;
    }
    if (lab) lab.textContent = v.toFixed(2);
  });
}

function updateEntanglementIndicators(rho4) {
  const entangled = !!rho4 && isEntangledFromRho(rho4);
  document.body.classList.toggle("entangled", entangled);
  document.body.classList.toggle("corr-active", entangled);
  widgets.forEach(({ tileEl }, idx) => {
    const ent = entangled && isPairMember(idx) && measuredVisualOutcomes[idx] == null;
    tileEl.classList.toggle("entangled", ent);
  });
}

function describeBellState(rho4, eps = 1e-3) {
  // Checks overlap with Bell projectors.
  const proj = {
    phiPlus: [
      [c(0.5,0), c(0,0), c(0,0), c(0.5,0)],
      [c(0,0), c(0,0), c(0,0), c(0,0)],
      [c(0,0), c(0,0), c(0,0), c(0,0)],
      [c(0.5,0), c(0,0), c(0,0), c(0.5,0)],
    ],
    phiMinus: [
      [c(0.5,0), c(0,0), c(0,0), c(-0.5,0)],
      [c(0,0), c(0,0), c(0,0), c(0,0)],
      [c(0,0), c(0,0), c(0,0), c(0,0)],
      [c(-0.5,0), c(0,0), c(0,0), c(0.5,0)],
    ],
    psiPlus: [
      [c(0,0), c(0,0), c(0,0), c(0,0)],
      [c(0,0), c(0.5,0), c(0.5,0), c(0,0)],
      [c(0,0), c(0.5,0), c(0.5,0), c(0,0)],
      [c(0,0), c(0,0), c(0,0), c(0,0)],
    ],
    psiMinus: [
      [c(0,0), c(0,0), c(0,0), c(0,0)],
      [c(0,0), c(0.5,0), c(-0.5,0), c(0,0)],
      [c(0,0), c(-0.5,0), c(0.5,0), c(0,0)],
      [c(0,0), c(0,0), c(0,0), c(0,0)],
    ],
  };
  const overlap = (P) => {
    let s = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s += cmul(P[i][j], rho4[j][i]).re;
    return s;
  };
  const scores = {
    "Bell Φ+": overlap(proj.phiPlus),
    "Bell Φ-": overlap(proj.phiMinus),
    "Bell Ψ+": overlap(proj.psiPlus),
    "Bell Ψ-": overlap(proj.psiMinus),
  };
  const best = Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
  return best[1] > 1 - eps ? best[0] : null;
}

function updateGlobalStateBadges() {
  const rho = getCurrentRho4();
  const entangled = !!rho && isEntangledFromRho(rho);
  const bell = rho ? describeBellState(rho) : null;
  widgets.forEach((w, idx) => {
    const badge = w?.stateChipEl;
    if (!badge) return;
    if (measuredVisualOutcomes[idx] != null) {
      // already handled by measurement visual
      badge.classList.remove("entangled");
      return;
    }
    if (entangled && isPairMember(idx)) {
      if (bell) {
        const bellLatex = bellToLatex(bell);
        badge.innerHTML = `\\(${bellLatex}\\)`;
      } else {
        badge.innerHTML = `\\(\\text{Entangled state}\\)`;
      }
      badge.classList.add("on");
      badge.classList.add("entangled");
      typesetNode(badge);
    }
  });
}

function reducedStateDirac(rho) {
  const { p0, p1 } = probsFromRho(rho);
  const pseudoAlpha = { re: Math.sqrt(p0), im: 0 };
  const pseudoBeta = { re: Math.sqrt(p1), im: 0 };
  return formatStateKet(pseudoAlpha, pseudoBeta, 1e-6);
}

function formatDiracPlain(rho, qIdx = 0, eps = 1e-6) {
  const pure = rhoToPureState(rho, eps);
  const fmt = (z) => {
    const re = Math.abs(z.re) < eps ? 0 : z.re;
    const im = Math.abs(z.im) < eps ? 0 : z.im;
    if (im === 0) return re.toFixed(2);
    const sign = im >= 0 ? "+" : "-";
    return `${re.toFixed(2)} ${sign} ${Math.abs(im).toFixed(2)}i`;
  };
  if (pure) {
    return `|ψ_${qIdx}⟩ = ${fmt(pure.alpha)}|0⟩ + ${fmt(pure.beta)}|1⟩`;
  }
  // fallback: magnitudes from diagonal
  const { p0, p1 } = probsFromRho(rho);
  const a = Math.sqrt(Math.max(0, p0)).toFixed(2);
  const b = Math.sqrt(Math.max(0, p1)).toFixed(2);
  return `|ψ_${qIdx}⟩ = ${a}|0⟩ + ${b}|1⟩`;
}

function formatDiracLatex(rho, qIdx = 0, eps = 1e-6) {
  const pure = rhoToPureState(rho, eps);
  if (pure) {
    const a = formatExactComplex(pure.alpha);
    const b = formatExactComplex(pure.beta);
    return `|\\psi_{${qIdx}}\\rangle = ${a}\\,|0\\rangle + ${b}\\,|1\\rangle`;
  }
  const { p0, p1 } = probsFromRho(rho);
  const a = formatExactComplex({ re: Math.sqrt(Math.max(0, p0)), im: 0 });
  const b = formatExactComplex({ re: Math.sqrt(Math.max(0, p1)), im: 0 });
  return `|\\psi_{${qIdx}}\\rangle = ${a}\\,|0\\rangle + ${b}\\,|1\\rangle`;
}

function isSuperposed(rho, eps = 1e-3) {
  const { p0, p1 } = probsFromRho(rho);
  return p0 > eps && p1 > eps && p0 < 1 - eps && p1 < 1 - eps;
}

function bellToLatex(label) {
  if (label.includes("Φ+") || label.includes("Phi") || label.includes("phi")) return "|\\Phi^{+}\\rangle";
  if (label.includes("Φ-") || label.includes("Phi-") || label.includes("phi-")) return "|\\Phi^{-}\\rangle";
  if (label.includes("Ψ+") || label.includes("Psi") || label.includes("psi")) return "|\\Psi^{+}\\rangle";
  if (label.includes("Ψ-") || label.includes("Psi-") || label.includes("psi-")) return "|\\Psi^{-}\\rangle";
  return label;
}

function updateStateChip(q, state, globalRho4) {
  const entry = widgets[q];
  if (!entry) return;
  const chip = entry.stateChipEl;
  if (!chip) return;

  const rho = densityFromState(state);
  const diracLatex = formatDiracLatex(rho, q);

  const entangledPair = isPairMember(q);
  const entangled = entangledPair && !!globalRho4 && isEntangledFromRho(globalRho4) && measuredVisualOutcomes[q] == null;
  const bell = entangled ? describeBellState(globalRho4) : null;
  const superposed = isSuperposed(rho);

  const suffix = entangled && bell ? `\\quad(${bellToLatex(bell)})` : "";
  chip.innerHTML = `\\(${diracLatex}${suffix}\\)`;
  chip.classList.add("on");
  chip.classList.toggle("entangled", superposed);
  typesetNode(chip);
}

function showInspectPopover() {
  const pop = $("inspectPopover");
  if (!pop) return;
  const rho = getCurrentRho4();
  if (!rho) return;
  const grid = $("inspectGrid");
  if (grid) {
    grid.innerHTML = "";
    const maxVal = Math.max(...rho.flat().map((z) => Math.abs(z.re)), 1);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const z = rho[i][j];
        const norm = Math.min(1, Math.abs(z.re) / maxVal);
        const hue = z.re >= 0 ? 190 : 10;
        const cell = document.createElement("div");
        cell.className = "inspect-cell";
        cell.style.background = `hsla(${hue},70%,70%,${0.2 + 0.6 * norm})`;
        cell.textContent = z.re.toFixed(2);
        grid.appendChild(cell);
      }
    }
  }
  pop.classList.add("on");
}
function closeInspectPopover() { $("inspectPopover")?.classList.remove("on"); }

function computeBlochTracesFromRho(rho4) {
  const traces = Array.from({ length: qubitCount }, () => []);
  const [pairA, pairB] = entangledPairIndices;
  const rhoA = partialTraceQubit(rho4, 1);
  const rhoB = partialTraceQubit(rho4, 0);
  const vA = blochFromRho(rhoA);
  const vB = blochFromRho(rhoB);
  traces[pairA]?.push(vA);
  traces[pairB]?.push(vB);
  const states = Array.from({ length: qubitCount }, (_, idx) => {
    if (idx === pairA) return stateFromRho(rhoA);
    if (idx === pairB) return stateFromRho(rhoB);
    return stateFromRho(densityFromState(getInitialState(idx)));
  });
  widgets.forEach((w, i) => {
    const rho = i === pairA ? rhoA : (i === pairB ? rhoB : null);
    if (rho) updatePurityChip(w?.purityEl, trace2MatSquared(rho));
  });
  return { states, traces };
}

function measureQubit(idx) {
  if (!isPairMember(idx)) return;
  const rho = getCurrentRho4();
  if (!rho) return;
  const localIdx = idx === entangledPairIndices[0] ? 0 : 1;
  const probs = measureProbabilities(rho, localIdx);
  const total = Math.max(0, probs.p0 + probs.p1) || 1;
  const r = Math.random();
  const outcome = r < probs.p0 / total ? 0 : 1;

  const { rho: collapsed } = collapseOnOutcome(rho, localIdx, outcome);

  measurementOverrideRho = collapsed;
  latestGlobalRho = collapsed;
  const { states, traces } = computeBlochTracesFromRho(collapsed);
  for (let q = 0; q < qubitCount; q++) {
    const w = widgets[q]?.widget;
    if (!w) continue;
    w.setStateAndTrace(states[q], traces[q], { hideArrow: false });
    updateStateChip(q, states[q], collapsed);
  }
  applyMeasurementVisual(idx, outcome, { cue: true, snap: true });
  updateEntanglementIndicators(collapsed);
  updateCorrelationsPanel();
  updateProbPopover();
  updateBackendMath();
  document.body.classList.add("measurement-flash");
  setTimeout(() => document.body.classList.remove("measurement-flash"), 280);
  showToast(`Measured q${idx} = ${outcome}`);
}

function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 1500);
}

// -------------------- Backend MathJax view --------------------
function computeStateAtStep(stepIdx, q) {
  const states = computeStatesUpTo(stepIdx);
  return states[q];
}

function computeStatesUpTo(stepIdx) {
  const { states } = computeBlochTraces(stepIdx);
  return states;
}

function updateBackendMath() {
  if (!uiState.backendOpen) return;

  const simplify = $("toggleSimplify")?.checked ?? true;
  const tol = simplify ? 1e-4 : 1e-7;
  const showMatrix = $("toggleShowMatrix")?.checked ?? false;
  document.body.classList.toggle("show-matrix", !!showMatrix);

  const g = (activeStep >= 0) ? singleQ[selectedQubit]?.[activeStep] : null;
  const isMeasure = g === "M";

  const prevState = computeStateAtStep(activeStep - 1, selectedQubit);
  const curState  = computeStateAtStep(activeStep, selectedQubit);

  const prevRho = densityFromState(prevState);
  const curRho = densityFromState(curState);
  const prevP0 = Math.max(0, prevRho[0][0].re);
  const prevP1 = Math.max(0, prevRho[1][1].re);
  const curP0 = Math.max(0, curRho[0][0].re);
  const curP1 = Math.max(0, curRho[1][1].re);

  const prevA = formatExactComplex({ re: Math.sqrt(prevP0), im: 0 }, tol);
  const prevB = formatExactComplex({ re: Math.sqrt(prevP1), im: 0 }, tol);
  const curA  = formatExactComplex({ re: Math.sqrt(curP0), im: 0 }, tol);
  const curB  = formatExactComplex({ re: Math.sqrt(curP1), im: 0 }, tol);

  const gateStr = g ? `\\text{Gate: } ${isMeasure ? "\\text{Measure}" : g}` : `\\text{Gate: } I`;
  const updateStr = g
    ? (isMeasure ? `\\text{Measurement (visual only; state unchanged in this view)}` : `|\\psi_{t}\\rangle = ${g}\\,|\\psi_{t-1}\\rangle`)
    : `|\\psi\\rangle = |0\\rangle`;

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
    const rhoLatex = matrixLatex(`\\rho_{${selectedQubit + 1}}`, curRho);
    elMat.innerHTML = (showMatrix && !isMeasure) ? gateLatex + rhoLatex : "";
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
  seedReferenceCircuit();
  rebuildBlochGrid();
  renderCircuit();
  updateActiveStepUI();
  rebuildToStep(activeStep);

  initPrimarySplitter();
  initBlochTileSizer();
  initSettingsPanelDrag();

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
  $("toggleMeasurementAnim")?.addEventListener("change", (e) => {
    measurementAnimEnabled = !!e.target.checked;
    if (!measurementAnimEnabled) document.body.classList.remove("coin-anim-visible");
  });

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

  $("inspectRho")?.addEventListener("click", (e) => { e.stopPropagation(); showInspectPopover(); });
  $("closeInspect")?.addEventListener("click", () => closeInspectPopover());
  $("measureQ0")?.addEventListener("click", () => measureQubit(0));
  $("measureQ1")?.addEventListener("click", () => measureQubit(1));

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

    if (initStateMenuEl && !initStateMenuEl.contains(e.target)) {
      hideInitStateMenu();
    }

    const inspectPopoverEl = $("inspectPopover");
    if (!inspectPopoverEl?.contains(e.target) && e.target !== $("inspectRho")) {
      closeInspectPopover();
    }
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

  // Measurement animation boot
  const coinMount = $("coinMount");
  const coinLabel = $("coinOutcomeLabel");
  const coinOdds = $("coinOdds");
  if (coinMount) {
    coinAnimator = new CoinFlipAnimator({ mountEl: coinMount, statusEl: coinLabel, oddsEl: coinOdds });
    coinAnimator.init();
    window.addEventListener("resize", () => coinAnimator?.resize?.());
  }

  // Hover tooltips for all interactable buttons
  initTooltips();
});

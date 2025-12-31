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

function cAddScaled(a, b, scale) {
  return { re: a.re + b.re * scale, im: a.im + b.im * scale };
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

function densityFromState(state) {
  if (state?.rho) return state.rho;
  const a = state.alpha;
  const b = state.beta;
  const aConj = cConj(a);
  const bConj = cConj(b);
  return [
    [cmul(a, aConj), cmul(a, bConj)],
    [cmul(aConj, b), cmul(b, bConj)],
  ];
}

function getBlochVectorFromState(state) {
  const rho = densityFromState(state);
  return blochFromRho(rho);
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
  // Measurement: visual only, treated as identity for math/animation.
  M: { matrix: [[c(1, 0), c(0, 0)], [c(0, 0), c(1, 0)]], axis: { x: 0, y: 0, z: 1 }, angle: 0 },
};

const INVERSE_GATE = {
  X: "X",
  Y: "Y",
  Z: "Z",
  H: "H",
  S: "Sdg",
  T: "Tdg",
  M: "M",
};
const P0 = [[c(1,0), c(0,0)], [c(0,0), c(0,0)]];
const P1 = [[c(0,0), c(0,0)], [c(0,0), c(1,0)]];

function matMul2(A, B) {
  const out = [
    [c(0, 0), c(0, 0)],
    [c(0, 0), c(0, 0)],
  ];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      out[i][j] = cAdd(
        cmul(A[i][0], B[0][j]),
        cmul(A[i][1], B[1][j])
      );
    }
  }
  return out;
}

function matAdjoint(M) {
  return [
    [cConj(M[0][0]), cConj(M[1][0])],
    [cConj(M[0][1]), cConj(M[1][1])],
  ];
}

function applyGateToRho(rho, U) {
  const Udag = matAdjoint(U);
  return matMul2(matMul2(U, rho), Udag);
}

function applyProjectorOn4(rho4, qubit, outcome) {
  const proj = outcome === 0 ? P0 : P1;
  const P = qubit === 0 ? tensor2(proj, ID2) : tensor2(ID2, proj);
  const Pdag = mat4Adjoint(P);
  return mat4Mul(mat4Mul(P, rho4), Pdag);
}

function scaleRho(rho, s) {
  return rho.map((row) => row.map((z) => cScale(z, s)));
}

function addRho(a, b) {
  return [
    [cAdd(a[0][0], b[0][0]), cAdd(a[0][1], b[0][1])],
    [cAdd(a[1][0], b[1][0]), cAdd(a[1][1], b[1][1])],
  ];
}

function probsFromRho(rho) {
  const p0 = Math.max(0, rho[0][0].re);
  const p1 = Math.max(0, rho[1][1].re);
  const s = p0 + p1;
  if (s <= 0) return { p0: 0, p1: 0 };
  return { p0: p0 / s, p1: p1 / s };
}

function applyCXApprox(controlState, targetState) {
  const rhoC = densityFromState(controlState);
  const rhoT = densityFromState(targetState);
  const p1 = Math.max(0, Math.min(1, rhoC[1][1].re));
  const p0 = Math.max(0, Math.min(1, 1 - p1));

  const rhoT_X = applyGateToRho(rhoT, GATES.X.matrix);
  const mixed = addRho(scaleRho(rhoT, p0), scaleRho(rhoT_X, p1));

  targetState.rho = mixed;
  delete targetState.alpha;
  delete targetState.beta;
  return targetState;
}

function applyGateToState(state, gateName) {
  const gate = GATES[gateName];
  if (!gate) return state;

  // Density-aware path
  if (state.rho) {
    state.rho = applyGateToRho(state.rho, gate.matrix);
    return state;
  }

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

  setStateAndTrace(state, traceVecs, { hideArrow = false, hideTrace = false } = {}) {
    this.isAnimating = false;
    this._animResolve?.();
    this._animResolve = null;
    this.forceHideArrow = !!hideArrow;
    this.forceHideTrace = !!hideTrace;

    if (state.rho) {
      const pure = rhoToPureState(state.rho);
      if (pure) {
        this.state = normalizeState({ alpha: c(pure.alpha.re, pure.alpha.im), beta: c(pure.beta.re, pure.beta.im) });
      } else {
        this.state = {
          rho: state.rho.map((row) => row.map((z) => ({ re: z.re, im: z.im }))),
        };
      }
    } else {
      this.state = normalizeState({
        alpha: c(state.alpha.re, state.alpha.im),
        beta: c(state.beta.re, state.beta.im),
      });
    }

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
      if (!this.state.rho) {
        const axis = new THREE.Vector3(gate.axis.x, gate.axis.y, gate.axis.z).normalize();
        this._addGateArc(beforeV, axis, gate.angle);
      }
      this._redrawFromState(false);
      return Promise.resolve();
    }

    if (this.isAnimating) return Promise.resolve();

    return new Promise((resolve) => {
      const before = getBlochVectorFromState(this.state);
      const beforeV = new THREE.Vector3(before.x, before.y, before.z);

      applyGateToState(this.state, gateName);

      if (this.state.rho) {
        this._redrawFromState(true);
        resolve();
        return;
      }

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
    const current = this._rotateVectorAroundAxis(this.animFrom, this.animAxis, theta);

    const len = current.length();
    const eps = 1e-4;
    const dir = len > eps ? current.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const scaledLen = Math.max(0, Math.min(1, len));
    this.arrow.setDirection(dir);
    this.arrow.setLength(Math.max(0.08, scaledLen), 0.12, 0.06);
    const opacity = Math.max(0.2, Math.min(1, len));
    const visible = len > eps;
    if (this.arrow.line && this.arrow.line.material) {
      this.arrow.line.material.transparent = true;
      this.arrow.line.material.opacity = visible ? opacity : 0;
    }
    if (this.arrow.cone && this.arrow.cone.material) {
      this.arrow.cone.material.transparent = true;
      this.arrow.cone.material.opacity = visible ? opacity : 0;
    }
    this.point.position.copy(visible ? current : new THREE.Vector3(0, 0, 0));

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
    const len = vec.length();
    const eps = 1e-4;
    const dir = len > eps ? vec.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const scaledLen = Math.max(0, Math.min(1, len));
    this.arrow.setDirection(dir);
    this.arrow.setLength(Math.max(0.08, scaledLen), 0.12, 0.06);
    const opacity = Math.max(0.2, Math.min(1, len));
    const visible = len > eps && !this.forceHideArrow;
    if (this.arrow.line && this.arrow.line.material) {
      this.arrow.line.material.transparent = true;
      this.arrow.line.material.opacity = visible ? opacity : 0;
    }
    if (this.arrow.cone && this.arrow.cone.material) {
      this.arrow.cone.material.transparent = true;
      this.arrow.cone.material.opacity = visible ? opacity : 0;
    }
    this.point.position.copy(visible ? vec : new THREE.Vector3(0, 0, 0));

    if (resetTrace) {
      this.tracePoints = [vec.clone()];
      this._rebuildTraceGeometry();
    }

    if (this.traceLine?.material) {
      this.traceLine.visible = !this.forceHideTrace;
      this.traceLine.material.opacity = this.forceHideTrace ? 0 : 1;
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

// -------------------- Measurement coin animation (top-down) --------------------
function makeCoinFaceTexture(label) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const center = size / 2;
  const radius = size * 0.42;

  const grad = ctx.createRadialGradient(center - radius * 0.2, center - radius * 0.2, radius * 0.2, center, center, radius);
  grad.addColorStop(0, "#fefefe");
  grad.addColorStop(0.5, "#e4e6ec");
  grad.addColorStop(1, "#c9ceda");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(40,44,54,0.35)";
  ctx.lineWidth = size * 0.02;
  ctx.beginPath();
  ctx.arc(center, center, radius * 0.88, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#0b0c0e";
  ctx.font = `${Math.floor(size * 0.28)}px "Times New Roman", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, center, center);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

class CoinFlipAnimator {
  constructor({ mountEl, statusEl, oddsEl }) {
    this.mountEl = mountEl;
    this.statusEl = statusEl;
    this.oddsEl = oddsEl;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.coinGroup = null;
    this.shadowMesh = null;
    this._raf = null;

    this.playing = false;
    this.playStart = 0;
    this.playDuration = 1400;
    this.targetIsOne = false;
    this._resolve = null;
    this.resultHoldMs = 750;
  }

  init() {
    if (!this.mountEl || this.scene) return;
    const width = this.mountEl.clientWidth || 220;
    const height = this.mountEl.clientHeight || 220;
    const aspect = width / height;
    const viewSize = 1.7;

    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.1,
      30
    );
    this.camera.position.set(0, 10, 0);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.mountEl.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1.6, 2.4, 1.8);
    this.scene.add(dir);

    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.94, metalness: 0.04 })
    );
    table.rotation.x = -Math.PI / 2;
    this.scene.add(table);

    this.coinGroup = new THREE.Group();
    this.coinGroup.position.y = 0.08;
    this.scene.add(this.coinGroup);

    const radius = 0.6;
    const thickness = 0.08;
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, thickness, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd8dce6, metalness: 0.55, roughness: 0.34 })
    );
    this.coinGroup.add(rim);

    const headsTex = makeCoinFaceTexture("|0⟩");
    const tailsTex = makeCoinFaceTexture("|1⟩");
    const faceGeom = new THREE.CircleGeometry(radius, 64);
    const top = new THREE.Mesh(
      faceGeom,
      new THREE.MeshStandardMaterial({ map: headsTex, metalness: 0.32, roughness: 0.38 })
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = thickness / 2 + 0.002;
    this.coinGroup.add(top);

    const bottom = new THREE.Mesh(
      faceGeom,
      new THREE.MeshStandardMaterial({ map: tailsTex, metalness: 0.32, roughness: 0.38 })
    );
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = -thickness / 2 - 0.002;
    this.coinGroup.add(bottom);

    this.shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 1.5, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false })
    );
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.001;
    this.shadowMesh.scale.set(1.2, 1.2, 1.2);
    this.scene.add(this.shadowMesh);

    this._tick();
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = this.mountEl.clientWidth || 220;
    const height = this.mountEl.clientHeight || 220;
    const aspect = width / height;
    const viewSize = 1.7;
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setStatus(text) {
    if (!this.statusEl) return;
    const hasKet = typeof text === "string" && text.includes("|") && text.includes("⟩");
    if (hasKet) {
      const latex = text.replace(/\|/g, "\\(|").replace(/⟩/g, "\\rangle\\)");
      this.statusEl.innerHTML = latex;
      typesetNode(this.statusEl);
    } else {
      this.statusEl.textContent = text;
    }
  }

  setOdds(probs) {
    if (!this.oddsEl) return;
    if (!probs) {
      this.oddsEl.textContent = "Odds: –";
      return;
    }
    const total = Math.max(0, probs.p0 + probs.p1) || 1;
    const p0 = Math.round((Math.max(0, probs.p0) / total) * 100);
    const p1 = Math.max(0, 100 - p0);
    this.oddsEl.innerHTML = `Odds: \\(|0\\rangle\\) ${p0}\\% \\cdot \\(|1\\rangle\\) ${p1}\\%`;
    typesetNode(this.oddsEl);
  }

  play(outcome, { label, probs } = {}) {
    if (!this.scene) this.init();
    this.targetIsOne = outcome === 1 || outcome === "tails" || outcome === "|1⟩";
    this.playStart = performance.now();
    this.playDuration = 1400 + Math.random() * 220;
    this.playing = true;
    this.setStatus(label ? `${label}: flipping…` : "Flipping…");
    this.setOdds(probs);

    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  _tick() {
    this._raf = requestAnimationFrame(() => this._tick());
    this._update(performance.now());
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _update(now) {
    if (!this.playing) return;
    const t = Math.min((now - this.playStart) / this.playDuration, 1);
    const easeOut = t * t * (3 - 2 * t);

    const arc = Math.sin(Math.PI * Math.min(1, t * 1.05)) * 1.35 + 0.05;
    const flips = 3; // keep integer to make final face deterministic
    const baseX = flips * Math.PI * 2 * easeOut + (this.targetIsOne ? Math.PI : 0);
    const wobble = Math.sin(t * Math.PI * 6) * 0.28 * (1 - t);
    const bank = Math.sin(t * Math.PI * 2.1) * 0.55 * (1 - t * 0.6);

    this.coinGroup.position.y = arc;
    this.coinGroup.rotation.set(baseX + bank, 0.22 * Math.sin(t * Math.PI * 1.6), wobble);

    const landing = t > 0.86 ? (1 - t) * 6 : 0;
    const squash = Math.max(0, landing * 0.08);
    this.coinGroup.scale.set(1 + squash * 0.25, 1 - squash * 0.35, 1 + squash * 0.25);

    const shadowScale = 1 + arc * 0.32;
    const shadowFade = Math.max(0.12, 0.42 - arc * 0.16);
    this.shadowMesh.scale.set(shadowScale * 1.3, shadowScale * 1.1, 1);
    if (this.shadowMesh.material) this.shadowMesh.material.opacity = shadowFade;

    if (t >= 1) {
      this.playing = false;
      this.coinGroup.position.y = 0.08;
      this.coinGroup.rotation.set(this.targetIsOne ? Math.PI : 0, 0, 0);
      this.coinGroup.scale.set(1, 1, 1);
      this.setStatus(this.targetIsOne ? "|1⟩" : "|0⟩");
      this.setOdds(null);
      const r = this._resolve;
      if (r) {
        setTimeout(() => {
          const cb = this._resolve;
          this._resolve = null;
          if (cb) cb();
        }, this.resultHoldMs);
      }
    }
  }
}

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

// -------------------- Two-qubit helpers --------------------
const PAULI_X = [[c(0,0), c(1,0)], [c(1,0), c(0,0)]];
const PAULI_Y = [[c(0,0), c(0,-1)], [c(0,1), c(0,0)]];
const PAULI_Z = [[c(1,0), c(0,0)], [c(0,0), c(-1,0)]];
const ID2 = [[c(1,0), c(0,0)], [c(0,0), c(1,0)]];

function tensor2(A, B) {
  // 2x2 ⊗ 2x2 => 4x4
  const out = Array.from({ length: 4 }, () => Array(4).fill(c(0,0)));
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
        for (let l = 0; l < 2; l++) {
          const idxRow = i * 2 + k;
          const idxCol = j * 2 + l;
          out[idxRow][idxCol] = cmul(A[i][j], B[k][l]);
        }
      }
    }
  }
  return out;
}

function mat4Mul(A, B) {
  const out = Array.from({ length: 4 }, () => Array(4).fill(c(0,0)));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = c(0,0);
      for (let k = 0; k < 4; k++) {
        sum = cAdd(sum, cmul(A[i][k], B[k][j]));
      }
      out[i][j] = sum;
    }
  }
  return out;
}

function mat4Adjoint(M) {
  const out = Array.from({ length: 4 }, () => Array(4).fill(c(0,0)));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i][j] = cConj(M[j][i]);
    }
  }
  return out;
}

function apply4Unitary(rho, U) {
  const Udag = mat4Adjoint(U);
  return mat4Mul(mat4Mul(U, rho), Udag);
}

function buildProductRho2(q0, q1) {
  const a = q0.alpha, b = q0.beta;
  const c0 = q1.alpha, d = q1.beta;
  const psi = [
    cmul(a, c0), // |00>
    cmul(a, d),  // |01>
    cmul(b, c0), // |10>
    cmul(b, d),  // |11>
  ];
  const rho = Array.from({ length: 4 }, () => Array(4).fill(c(0,0)));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      rho[i][j] = cmul(psi[i], cConj(psi[j]));
    }
  }
  return rho;
}

function singleOn4(U, qubit) {
  return qubit === 0 ? tensor2(U, ID2) : tensor2(ID2, U);
}

const CX4 = [
  [c(1,0), c(0,0), c(0,0), c(0,0)],
  [c(0,0), c(1,0), c(0,0), c(0,0)],
  [c(0,0), c(0,0), c(0,0), c(1,0)],
  [c(0,0), c(0,0), c(1,0), c(0,0)],
];

function partialTraceQubit(rho4, tracedQubit) {
  // returns 2x2
  const out = [
    [c(0,0), c(0,0)],
    [c(0,0), c(0,0)],
  ];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      let sum = c(0,0);
      for (let k = 0; k < 2; k++) {
        const row = tracedQubit === 0 ? k * 2 + i : i * 2 + k;
        const col = tracedQubit === 0 ? k * 2 + j : j * 2 + k;
        sum = cAdd(sum, rho4[row][col]);
      }
      out[i][j] = sum;
    }
  }
  return out;
}

function trace2MatSquared(rho) {
  let acc = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const term = cmul(rho[i][j], rho[j][i]);
      acc += term.re;
    }
  }
  return acc;
}

function rhoToPureState(rho, eps = 1e-6) {
  const purity = trace2MatSquared(rho);
  if (purity < 1 - eps) return null;
  const rho00 = Math.max(0, rho[0][0].re);
  const rho11 = Math.max(0, rho[1][1].re);
  const rho01 = rho[0][1];
  const aMag = Math.sqrt(rho00);
  let alpha = c(aMag, 0);
  let beta = c(0, 0);
  if (aMag > 1e-6) {
    const bConj = cScale(rho01, 1 / aMag); // rho01 = a b*
    beta = cConj(bConj);
  } else {
    beta = c(Math.sqrt(rho11), 0);
  }
  return normalizeState({ alpha, beta });
}

function blochFromRho(rho) {
  const rx = rho[0][1].re + rho[1][0].re;
  const ry = BLOCH_Y_SIGN * (rho[0][1].im - rho[1][0].im);
  const rz = rho[0][0].re - rho[1][1].re;
  return { x: rx, y: ry, z: rz };
}

function expectationPauliPair(rho4, A, B) {
  const op = tensor2(A, B);
  let acc = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const term = cmul(rho4[i][j], op[j][i]);
      acc += term.re;
    }
  }
  return acc;
}

function isEntangledFromRho(rho4, eps = 1e-6) {
  const rhoA = partialTraceQubit(rho4, 1);
  const rhoB = partialTraceQubit(rho4, 0);
  const purityA = trace2MatSquared(rhoA);
  const purityB = trace2MatSquared(rhoB);
  return purityA < 1 - eps && purityB < 1 - eps ? true : (purityA < 1 - eps || purityB < 1 - eps);
}

function computeBlochTraces(stepIdx) {
  const q0Init = normalizeState(getInitialState(0));
  const q1Init = normalizeState(getInitialState(1));
  let rho4 = buildProductRho2(q0Init, q1Init);

  const traces = Array.from({ length: qubitCount }, () => []);
  const measuredLatest = Array.from({ length: qubitCount }, () => null);
  const measuredEvents = [];
  const pushVecs = () => {
    const rhoA = partialTraceQubit(rho4, 1);
    const rhoB = partialTraceQubit(rho4, 0);
    const vA = blochFromRho(rhoA);
    const vB = blochFromRho(rhoB);
    traces[0]?.push(vA);
    traces[1]?.push(vB);
  };
  pushVecs();

  if (stepIdx >= 0) {
    for (let s = 0; s <= stepIdx; s++) {
      for (let q = 0; q < Math.min(qubitCount, 2); q++) {
        const g = singleQ[q]?.[s];
        if (g && GATES[g]) {
          if (g === "M") {
            // Measure qubit q in Z basis; sample once and reuse for this circuit state.
            const storedOdds = measurementOdds?.[s]?.[q];
            const probs = storedOdds || measureProbabilities(rho4, q);
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
            const { rho: collapsed } = collapseOnOutcome(rho4, q, outcome);
            rho4 = collapsed;
            measuredLatest[q] = outcome;
            measuredEvents.push({ qubit: q, outcome, step: s, probs });
            pushVecs();
            continue;
          }

          const U = GATES[g].matrix;
          const beforeRho = partialTraceQubit(rho4, q === 0 ? 1 : 0);
          const beforeV = blochFromRho(beforeRho);
          const U4 = singleOn4(U, q);
          rho4 = apply4Unitary(rho4, U4);
          const afterRho = partialTraceQubit(rho4, q === 0 ? 1 : 0);
          const afterV = blochFromRho(afterRho);

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
        }
      }
      for (const op of multiQ[s]) {
        if (op.type === "CX" && op.control < 2 && op.target < 2) {
          rho4 = apply4Unitary(rho4, CX4);
          pushVecs();
        }
      }
    }
  }

  const states = Array.from({ length: qubitCount }, (_, idx) => {
    if (idx === 0) {
      const rhoA = partialTraceQubit(rho4, 1);
      const pure = rhoToPureState(rhoA);
      return pure || { rho: rhoA };
    }
    if (idx === 1) {
      const rhoB = partialTraceQubit(rho4, 0);
      const pure = rhoToPureState(rhoB);
      return pure || { rho: rhoB };
    }
    return normalizeState(getInitialState(idx));
  });

  return { states, traces, rho2: rho4, measuredEvents, measuredLatest };
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

  const { states, traces, rho2, measuredEvents, measuredLatest } = computeBlochTraces(stepIdx);
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
    const hideArrow = hold || (entangledNow && measuredVisualOutcomes[q] == null && q < 2);
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
    const ent = entangled && idx < 2 && measuredVisualOutcomes[idx] == null;
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
    if (entangled) {
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

function typesetNode(el) {
  if (typeof MathJax === "undefined" || !el) return;
  MathJax.typesetPromise([el]).catch(() => {});
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

  const entangled = !!globalRho4 && isEntangledFromRho(globalRho4);
  const bell = globalRho4 ? describeBellState(globalRho4) : null;

  const suffix = entangled && bell ? `\\quad(${bellToLatex(bell)})` : "";
  chip.innerHTML = `\\(${diracLatex}${suffix}\\)`;
  chip.classList.add("on");
  chip.classList.toggle("entangled", entangled);
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
  const rhoA = partialTraceQubit(rho4, 1);
  const rhoB = partialTraceQubit(rho4, 0);
  const vA = blochFromRho(rhoA);
  const vB = blochFromRho(rhoB);
  traces[0]?.push(vA);
  traces[1]?.push(vB);
  const states = Array.from({ length: qubitCount }, (_, idx) => {
    if (idx === 0) {
      const pure = rhoToPureState(rhoA);
      return pure || { rho: rhoA };
    }
    if (idx === 1) {
      const pure = rhoToPureState(rhoB);
      return pure || { rho: rhoB };
    }
    return normalizeState(getInitialState(idx));
  });
  widgets.forEach((w, i) => {
    const rho = i === 0 ? rhoA : (i === 1 ? rhoB : null);
    if (rho) updatePurityChip(w?.purityEl, trace2MatSquared(rho));
  });
  return { states, traces };
}

function measureQubit(idx) {
  const rho = getCurrentRho4();
  if (!rho) return;
  const probs = measureProbabilities(rho, idx);
  const total = Math.max(0, probs.p0 + probs.p1) || 1;
  const r = Math.random();
  const outcome = r < probs.p0 / total ? 0 : 1;

  const { rho: collapsed } = collapseOnOutcome(rho, idx, outcome);

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

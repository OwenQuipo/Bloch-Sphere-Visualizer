// === Imports ===
import * as THREE from 'three';
import { OrbitControls } from '../qubit visualizer/OrbitControls.js';

//
// ---------- Complex numbers & qubit state ----------
//
const c = (re, im) => ({ re, im });
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a, b) => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re
});
const cConj = (a) => ({ re: a.re, im: -a.im });
const cAbs2 = (a) => a.re * a.re + a.im * a.im;
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s });

// Start at |0⟩
let state = { alpha: c(1, 0), beta: c(0, 0) };

function normalizeState() {
  const n2 = cAbs2(state.alpha) + cAbs2(state.beta);
  const n = Math.sqrt(n2) || 1;
  state.alpha = cScale(state.alpha, 1 / n);
  state.beta = cScale(state.beta, 1 / n);
}

const SQ = 1 / Math.sqrt(2);

// Gates: SU(2) matrix + Bloch rotation axis & angle (in Bloch coords)
const GATES = {
  X: {
    matrix: [
      [c(0, 0), c(1, 0)],
      [c(1, 0), c(0, 0)]
    ],
    axis: { x: 1, y: 0, z: 0 },
    angle: Math.PI
  },
  Y: {
    matrix: [
      [c(0, 0), c(0, -1)],
      [c(0, 1), c(0, 0)]
    ],
    axis: { x: 0, y: 1, z: 0 },
    angle: Math.PI
  },
  Z: {
    matrix: [
      [c(1, 0), c(0, 0)],
      [c(0, 0), c(-1, 0)]
    ],
    axis: { x: 0, y: 0, z: 1 },
    angle: Math.PI
  },
  H: {
    matrix: [
      [c(SQ, 0), c(SQ, 0)],
      [c(SQ, 0), c(-SQ, 0)]
    ],
    // Approximate rotation axis of H in Bloch space
    axis: { x: 1 / Math.SQRT2, y: 0, z: 1 / Math.SQRT2 },
    angle: Math.PI
  },
  S: {
    matrix: [
      [c(1, 0), c(0, 0)],
      [c(0, 0), c(0, 1)]
    ],
    axis: { x: 0, y: 0, z: 1 },   // rotation about Z (|0>, |1> axis)
    angle: Math.PI / 2
  },
  T: {
    matrix: (() => {
      const a = Math.PI / 4;
      return [
        [c(1, 0), c(0, 0)],
        [c(0, 0), c(Math.cos(a), Math.sin(a))]
      ];
    })(),
    axis: { x: 0, y: 0, z: 1 },   // rotation about Z
    angle: Math.PI / 4
  }
};

//
// ---------- Animation state ----------
//
let isAnimating = false;
let animStart = 0;
let animDuration = 450; // ms
let animAxis = null;    // THREE.Vector3
let animFrom = null;    // THREE.Vector3
let animAngle = 0;

//
// ---------- Bloch vector from state (Bloch coords) ----------
//
function getBlochVector() {
  normalizeState();
  const a = state.alpha;
  const b = state.beta;

  // ab = a * b*
  const ab = cMul(a, cConj(b));
  const x = 2 * ab.re;
  const y = -2 * ab.im;
  const z = cAbs2(a) - cAbs2(b);

  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

//
// ---------- Apply gate (with optional smooth animation) ----------
//
function applyGate(name) {
  if (isAnimating) return;

  const gate = GATES[name];
  if (!gate) return;

  const toggleEl = document.getElementById('animToggle');
  const useAnim = toggleEl ? toggleEl.checked : false;

  // Bloch vector before gate (in Bloch coords)
  const before = getBlochVector();
  const beforeV = new THREE.Vector3(before.x, before.y, before.z);

  // Apply unitary in Hilbert space
  const M = gate.matrix;
  const a = state.alpha;
  const b = state.beta;

  const newA = cAdd(cMul(M[0][0], a), cMul(M[0][1], b));
  const newB = cAdd(cMul(M[1][0], a), cMul(M[1][1], b));

  state.alpha = newA;
  state.beta = newB;
  normalizeState();
  updateStateDisplay();

  const axis = new THREE.Vector3(
    gate.axis.x,
    gate.axis.y,
    gate.axis.z
  ).normalize();

  if (!useAnim) {
    addGateArc(beforeV, axis, gate.angle);
    updateBloch();
    return;
  }

  // Smooth animation
  isAnimating = true;
  animStart = performance.now();
  animDuration = 450;
  animAxis = axis;
  animFrom = beforeV.clone();
  animAngle = gate.angle;

  animateGate();
}

function resetTo(which) {
  if (isAnimating) return;

  if (which === '|0>') {
    state = { alpha: c(1, 0), beta: c(0, 0) };
  } else {
    state = { alpha: c(0, 0), beta: c(1, 0) };
  }
  normalizeState();
  updateStateDisplay();
  updateBloch();
}

//
// ---------- LaTeX state display (inline, compact) ----------
//
function updateStateDisplay() {
  const el = document.getElementById('stateDisplay');
  if (!el) return;

  const a = state.alpha;
  const b = state.beta;

  const latex =
    `\\(|\\psi\\rangle = (${a.re.toFixed(2)} + ${a.im.toFixed(2)}i)|0\\rangle` +
    ` + (${b.re.toFixed(2)} + ${b.im.toFixed(2)}i)|1\\rangle\\)`;

  el.innerHTML = latex;
  if (typeof MathJax !== 'undefined') {
    MathJax.typesetPromise([el]);
  }
}

//
// ---------- LaTeX Bloch vector display (Bloch coords, compact) ----------
//
function updateBlochVectorDisplay() {
  const el = document.getElementById('blochVector');
  if (!el) return;

  const v = getBlochVector();

  const latex =
    `\\(\\vec{r} = (${v.x.toFixed(2)},\\ ${v.y.toFixed(2)},\\ ${v.z.toFixed(2)})\\)`;

  el.innerHTML = latex;
  if (typeof MathJax !== 'undefined') {
    MathJax.typesetPromise([el]);
  }
}

//
// ---------- LaTeX → sprite label helper (for axis labels, white text) ----------
//
function makeLatexLabel(latex, scale = 0.12) {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';
    container.innerHTML = `\\(${latex}\\)`;
    document.body.appendChild(container);

    MathJax.typesetPromise([container]).then(() => {
      const svg = container.querySelector('svg');

      // Force white fill/stroke for dark background
      svg.setAttribute('fill', '#ffffff');
      svg.setAttribute('stroke', '#ffffff');
      svg.querySelectorAll('*').forEach(el => {
        el.setAttribute('fill', '#ffffff');
        el.setAttribute('stroke', '#ffffff');
      });

      const xml = new XMLSerializer().serializeToString(svg);
      const svg64 = btoa(xml);
      const image64 = 'data:image/svg+xml;base64,' + svg64;

      const textureLoader = new THREE.TextureLoader();
      const texture = textureLoader.load(image64, () => {
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(scale, scale, scale);

        document.body.removeChild(container);
        resolve(sprite);
      });
    });
  });
}

//
// ---------- THREE.js scene ----------
//
let scene, camera, renderer, controls;
let arrow, point;
let tracePoints = [];
let traceLine;

function init3D() {
  const container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);

  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(2.8, 2.2, 2.8);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(3, 4, 2);
  scene.add(dir);

  const blochGroup = new THREE.Group();
  scene.add(blochGroup);

  // Rotate Bloch world so +Z (|0⟩) is visually up (world +Y)
  // (We keep all math in Bloch coords; this is purely visual.)
  blochGroup.rotation.x = -Math.PI / 2;

  // Sphere around origin (Bloch coords)
  const sphereGeom = new THREE.SphereGeometry(1, 48, 48);
  const sphereMat = new THREE.MeshPhongMaterial({
    color: 0x0c1224,
    transparent: true,
    opacity: 0.42
  });
  const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
  blochGroup.add(sphereMesh);

  const sphereWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(sphereGeom),
    new THREE.LineBasicMaterial({
      color: 0x394bff,
      opacity: 0.5,
      transparent: true
    })
  );
  blochGroup.add(sphereWire);

  const axis = (p1, p2, color) =>
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([p1, p2]),
      new THREE.LineBasicMaterial({ color })
    );

  // Bloch X-axis (|+> / |−>)
  const xAxis = axis(
    new THREE.Vector3(-1.2, 0, 0),
    new THREE.Vector3(1.2, 0, 0),
    0xff5555
  );

  // Bloch Y-axis (|i> / |−i>)
  const yAxis = axis(
    new THREE.Vector3(0, -1.2, 0),
    new THREE.Vector3(0, 1.2, 0),
    0x55ff88
  );

  // Bloch Z-axis (|0> / |1>)
  const zAxis = axis(
    new THREE.Vector3(0, 0, -1.2),
    new THREE.Vector3(0, 0, 1.2),
    0x6f8dff
  );

  blochGroup.add(xAxis, yAxis, zAxis);

  // Axis labels as LaTeX (in Bloch coords; group rotation handles visuals)
  (async () => {
    const L0 = await makeLatexLabel('|0\\rangle');
    L0.position.set(0, 0, 1.25);      // +Z (north pole)
    blochGroup.add(L0);

    const L1 = await makeLatexLabel('|1\\rangle');
    L1.position.set(0, 0, -1.25);     // -Z (south pole)
    blochGroup.add(L1);

    const Lp = await makeLatexLabel('|+\\rangle');
    Lp.position.set(1.25, 0, 0);      // +X
    blochGroup.add(Lp);

    const Lm = await makeLatexLabel('|-\\rangle');
    Lm.position.set(-1.25, 0, 0);     // -X
    blochGroup.add(Lm);

    const Li = await makeLatexLabel('|i\\rangle');
    Li.position.set(0, 1.25, 0);      // +Y
    blochGroup.add(Li);

    const Lmi = await makeLatexLabel('|-i\\rangle');
    Lmi.position.set(0, -1.25, 0);    // -Y
    blochGroup.add(Lmi);
  })();

  // Initial vector (|0⟩ => Bloch north)
  const v = getBlochVector();
  const vec = new THREE.Vector3(v.x, v.y, v.z);

  arrow = new THREE.ArrowHelper(
    vec.clone().normalize(),
    new THREE.Vector3(0, 0, 0),
    0.9,
    0xffdd66,
    0.12,
    0.06
  );
  blochGroup.add(arrow);

  point = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 24, 24),
    new THREE.MeshPhongMaterial({ color: 0xffdd66, emissive: 0xffb844 })
  );
  point.position.copy(vec);
  blochGroup.add(point);

  tracePoints = [vec.clone()];
  traceLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(tracePoints),
    new THREE.LineBasicMaterial({
      color: 0xfff277,
      transparent: true,
      depthTest: false
    })
  );
  traceLine.renderOrder = 10;
  blochGroup.add(traceLine);

  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  const container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

//
// ---------- Rotation + path helpers (Bloch coords) ----------
//
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

function addGateArc(startVec, axis, angle, steps = 48) {
  const v0 = startVec.clone().normalize();

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const theta = angle * t;
    const vt = rotateVectorAroundAxis(v0, axis, theta).normalize();
    tracePoints.push(vt.clone());
  }

  traceLine.geometry.dispose();
  traceLine.geometry = new THREE.BufferGeometry().setFromPoints(tracePoints);
}

//
// ---------- Update Bloch (visual arrow, point) ----------
//
function updateBloch() {
  const v = getBlochVector();
  const vec = new THREE.Vector3(v.x, v.y, v.z);

  arrow.setDirection(vec.clone().normalize());
  point.position.copy(vec);

  updateBlochVectorDisplay();
}

//
// ---------- Smooth gate animation loop ----------
//
function animateGate() {
  if (!isAnimating) return;

  const now = performance.now();
  const t = Math.min((now - animStart) / animDuration, 1);

  const theta = animAngle * t;
  const current = rotateVectorAroundAxis(animFrom, animAxis, theta).normalize();

  arrow.setDirection(current.clone().normalize());
  point.position.copy(current);

  tracePoints.push(current.clone());
  traceLine.geometry.dispose();
  traceLine.geometry = new THREE.BufferGeometry().setFromPoints(tracePoints);

  if (t < 1) {
    requestAnimationFrame(animateGate);
  } else {
    isAnimating = false;
    updateBloch(); // snap to exact final state from the actual state vector
  }
}

//
// ---------- Hard reset (state + trace) ----------
//
function hardReset() {
  if (isAnimating) isAnimating = false;

  state = { alpha: c(1, 0), beta: c(0, 0) };
  normalizeState();
  updateStateDisplay();

  const v = getBlochVector();
  const vec = new THREE.Vector3(v.x, v.y, v.z);

  arrow.setDirection(vec.clone().normalize());
  point.position.copy(vec);

  tracePoints = [vec.clone()];
  traceLine.geometry.dispose();
  traceLine.geometry = new THREE.BufferGeometry().setFromPoints(tracePoints);

  updateBlochVectorDisplay();
}

//
// ---------- UI wiring ----------
//
function attachGateButtons() {
  document.querySelectorAll('button[data-gate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = btn.getAttribute('data-gate');
      if (g === 'RESET1') return resetTo('|1>');
      applyGate(g);
    });
  });

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', hardReset);
  }
}

//
// ---------- Boot ----------
//
window.addEventListener('load', () => {
  state = { alpha: c(1, 0), beta: c(0, 0) };
  normalizeState();

  updateStateDisplay();
  attachGateButtons();
  init3D();
  updateBloch();
});

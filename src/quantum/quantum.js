// Quantum math and gate utilities split from main bundle for readability.

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
const SWAP4 = [
  [c(1,0), c(0,0), c(0,0), c(0,0)],
  [c(0,0), c(0,0), c(1,0), c(0,0)],
  [c(0,0), c(1,0), c(0,0), c(0,0)],
  [c(0,0), c(0,0), c(0,0), c(1,0)],
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

export {
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
};

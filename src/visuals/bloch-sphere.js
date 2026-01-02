// Bloch sphere widget separated for clarity.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GATES, getBlochVectorFromState, normalizeState, c, rhoToPureState, densityFromState, applyGateToState } from "../quantum/quantum";

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const BLOCH_THEMES = {
  dark: {
    bg: "#050505",
    sphere: "#0f0f0f",
    wire: "#ffffff",
    axis: "#67d5ff",
    arrow: "#ffffff",
    emissive: "#7a7a7a",
    trace: "#ffffff",
  },
  light: {
    bg: "#f8f8f6",
    sphere: "#ffffff",
    wire: "#2a2a2a",
    axis: "#c91873",
    arrow: "#000000",
    emissive: "#444444",
    trace: "#000000",
  },
};

function getCssColor(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  return raw?.trim() || fallback;
}

function makeNoiseTexture(colorA, colorB, size = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const colorAStyle = colorA.getStyle ? colorA.getStyle() : colorA;
  const colorBStyle = colorB.getStyle ? colorB.getStyle() : colorB;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = Math.random() > 0.5 ? colorAStyle : colorBStyle;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // radial alpha mask to keep the fog circular, avoiding square artifacts on dark mode
  const alpha = ctx.getImageData(0, 0, size, size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const falloff = Math.max(0, 1 - r);
      const idx = (y * size + x) * 4 + 3;
      alpha.data[idx] = Math.round(alpha.data[idx] * Math.pow(falloff, 1.5));
    }
  }
  ctx.putImageData(alpha, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeGlyphTexture(text = "ENT") {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// -------------------- MathJax label helper (existing) --------------------
function makeLatexLabel(latex, scale = 0.12, color = "#ffffff") {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.visibility = "hidden";
    container.style.pointerEvents = "none";
    container.innerHTML = `\\(${latex}\\)`;
    document.body.appendChild(container);

    const finalizeSprite = (material) => {
      material.depthTest = false;
      material.depthWrite = false;
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(scale, scale, scale);
      document.body.removeChild(container);
      resolve(sprite);
    };

    if (typeof MathJax === "undefined") {
      const material = new THREE.SpriteMaterial({ color: new THREE.Color(color) });
      finalizeSprite(material);
      return;
    }

    MathJax.typesetPromise([container]).then(() => {
      const svg = container.querySelector("svg");
      if (!svg) {
        const material = new THREE.SpriteMaterial({ color: new THREE.Color(color) });
        finalizeSprite(material);
        return;
      }

      svg.setAttribute("fill", color);
      svg.setAttribute("stroke", color);
      svg.querySelectorAll("*").forEach((el) => {
        el.setAttribute("fill", color);
        el.setAttribute("stroke", color);
      });

      const xml = new XMLSerializer().serializeToString(svg);
      const svg64 = btoa(xml);
      const image64 = "data:image/svg+xml;base64," + svg64;

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(image64, (texture) => {
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, color: new THREE.Color(color) });
        finalizeSprite(material);
      });
    });
  });
}

// -------------------- Bloch widget --------------------
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

    this.currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    this.palette = this._getPalette(this.currentTheme);
    this.labelSprites = [];
    this.axisMaterials = [];
    this.sphereMat = null;
    this.sphereWireMat = null;
    this.baseCameraPos = null;

    this.entanglement = {
      level: 0,
      colorA: new THREE.Color(getCssColor("--pop-cyan", "#67d5ff")),
      colorB: new THREE.Color(getCssColor("--pop-pink", "#ff6fa3")),
      mix: new THREE.Color("#ffffff"),
      fogTexture: null,
      fogMaterial: null,
      fogSprite: null,
      fogOffset: new THREE.Vector2(Math.random(), Math.random()),
      fogSeed: Math.random() * 1000,
      glyphTexture: null,
      glyphSprite: null,
      glyphScale: 0,
      flash: 0,
      rgbShift: new THREE.Vector2(0, 0),
      cameraShake: 0,
      lastTick: performance.now(),
    };
    this.entanglement.mix.copy(this.entanglement.colorA.clone().lerp(this.entanglement.colorB, 0.5));
  }

  init() {
    const width = this.mountEl.clientWidth || 300;
    const height = this.mountEl.clientHeight || 300;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.palette.bg);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(2.8, 2.2, 2.8);
    this.baseCameraPos = this.camera.position.clone();

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.domElement.style.imageRendering = "pixelated";
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
    this.sphereMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(this.palette.sphere),
      transparent: true,
      opacity: 0.42,
    });
    this.blochGroup.add(new THREE.Mesh(sphereGeom, this.sphereMat));

    this.sphereWireMat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.palette.wire), opacity: 0.55, transparent: true });
    const sphereWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(sphereGeom),
      this.sphereWireMat
    );
    this.blochGroup.add(sphereWire);

    const axisLine = (p1, p2) => {
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.palette.axis) });
      this.axisMaterials.push(mat);
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), mat);
    };

    this.blochGroup.add(
      axisLine(new THREE.Vector3(-1.2, 0, 0), new THREE.Vector3(1.2, 0, 0)),
      axisLine(new THREE.Vector3(0, -1.2, 0), new THREE.Vector3(0, 1.2, 0)),
      axisLine(new THREE.Vector3(0, 0, -1.2), new THREE.Vector3(0, 0, 1.2))
    );

    (async () => {
      const labelColor = this.palette.label;
      const addLabel = async (latex, pos) => {
        const sprite = await makeLatexLabel(latex, 0.12, labelColor);
        sprite.position.set(...pos);
        sprite.material?.color?.set(labelColor);
        this.labelSprites.push(sprite);
        this.blochGroup.add(sprite);
      };
      await addLabel("|0\\rangle", [0, 0, 1.25]);
      await addLabel("|1\\rangle", [0, 0, -1.25]);
      await addLabel("|+\\rangle", [1.25, 0, 0]);
      await addLabel("|-\\rangle", [-1.25, 0, 0]);
      await addLabel("|i\\rangle", [0, 1.25, 0]);
      await addLabel("|-i\\rangle", [0, -1.25, 0]);
    })();

    const v = getBlochVectorFromState(this.state);
    const vec = new THREE.Vector3(v.x, v.y, v.z);

    this.arrow = new THREE.ArrowHelper(
      vec.clone().normalize(),
      new THREE.Vector3(0, 0, 0),
      0.9,
      new THREE.Color(this.palette.arrow),
      0.12,
      0.06
    );
    this.blochGroup.add(this.arrow);

    this.point = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 24, 24),
      new THREE.MeshPhongMaterial({ color: new THREE.Color(this.palette.arrow), emissive: new THREE.Color(this.palette.emissive) })
    );
    this.point.position.copy(vec);
    this.blochGroup.add(this.point);

    this.tracePoints = [vec.clone()];
    this.traceLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this.tracePoints),
      new THREE.LineBasicMaterial({ color: new THREE.Color(this.palette.trace), transparent: true, depthTest: false })
    );
    this.traceLine.renderOrder = 10;
    this.blochGroup.add(this.traceLine);

    this._initFogOverlay();
    this._initGlyph();

    this._applyPalette();
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
    this._tickEntanglement();
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
    this._applyVectorVisuals(dir, scaledLen, len > eps && !this.forceHideArrow, current);

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
    const visible = len > eps && !this.forceHideArrow;
    this._applyVectorVisuals(dir, scaledLen, visible, vec);

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

  setTheme(theme) {
    this.currentTheme = theme === "light" ? "light" : "dark";
    this.palette = this._getPalette(this.currentTheme);
    this.entanglement.colorA.set(getCssColor("--pop-cyan", "#67d5ff"));
    this.entanglement.colorB.set(getCssColor("--pop-pink", "#ff6fa3"));
    this.entanglement.mix.copy(this.entanglement.colorA.clone().lerp(this.entanglement.colorB, 0.5));
    this._refreshFogTexture();
    this._applyPalette();
    this._redrawFromState(false);
  }

  setEntanglementVisuals({ level = 0, colorA, colorB, flash = 0, rgbShift, cameraShake = 0 } = {}) {
    this.entanglement.level = Math.max(0, Math.min(1, level));
    let paletteChanged = false;
    if (colorA && !this.entanglement.colorA.equals(colorA)) {
      this.entanglement.colorA.copy(colorA);
      paletteChanged = true;
    }
    if (colorB && !this.entanglement.colorB.equals(colorB)) {
      this.entanglement.colorB.copy(colorB);
      paletteChanged = true;
    }
    if (flash > 0) this.entanglement.flash = Math.max(this.entanglement.flash, flash);
    if (rgbShift) this.entanglement.rgbShift.copy(rgbShift);
    else this.entanglement.rgbShift.set(0, 0);
    this.entanglement.cameraShake = cameraShake;
    if (paletteChanged) {
      this.entanglement.mix.copy(this.entanglement.colorA.clone().lerp(this.entanglement.colorB, 0.5));
      this._refreshFogTexture();
    }
  }

  _applyPalette() {
    if (!this.palette) return;
    const p = this.palette;
    this.scene.background = new THREE.Color(p.bg);
    this.renderer?.setClearColor(new THREE.Color(p.bg), 1);
    if (this.sphereMat) this.sphereMat.color.set(p.sphere);
    if (this.sphereWireMat) this.sphereWireMat.color.set(p.wire);
    this.axisMaterials.forEach((m) => m.color.set(p.axis));
    if (this.arrow) this.arrow.setColor(new THREE.Color(p.arrow));
    if (this.point?.material) {
      this.point.material.color.set(p.arrow);
      this.point.material.emissive.set(p.emissive);
    }
    if (this.traceLine?.material) this.traceLine.material.color.set(p.trace);
    this.labelSprites.forEach((sprite) => sprite.material?.color?.set(p.label));
    if (this.renderer?.domElement) this.renderer.domElement.style.backgroundColor = p.bg;
    if (this.sphereMat) {
      this.sphereMat.emissive = new THREE.Color(p.axis).multiplyScalar(0.08);
      this.sphereMat.emissiveIntensity = 0.5;
    }
    if (this.entanglement.fogMaterial) this.entanglement.fogMaterial.color.set(this.entanglement.mix);
    if (this.entanglement.glyphSprite?.material) this.entanglement.glyphSprite.material.color.set(this.entanglement.mix);
  }

  _applyVectorVisuals(dir, len01, visible, rawVec) {
    const scale = lerp(1, 0.25, this.entanglement.level);
    const opacityScale = lerp(1, 0.25, this.entanglement.level);
    this.arrow.setDirection(dir);
    this.arrow.setLength(Math.max(0.08, len01 * scale), 0.12 * scale, 0.06 * scale);
    const opacity = Math.max(0.2, Math.min(1, len01)) * opacityScale;
    if (this.arrow.line && this.arrow.line.material) {
      this.arrow.line.material.transparent = true;
      this.arrow.line.material.opacity = visible ? opacity : 0;
    }
    if (this.arrow.cone && this.arrow.cone.material) {
      this.arrow.cone.material.transparent = true;
      this.arrow.cone.material.opacity = visible ? opacity : 0;
    }
    this.point.visible = visible;
    if (visible) {
      this.point.position.copy(rawVec.clone().multiplyScalar(scale));
    } else {
      this.point.position.set(0, 0, 0);
    }
  }

  _initFogOverlay() {
    const tex = makeNoiseTexture(this.entanglement.colorA, this.entanglement.colorB, 12);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: this.entanglement.mix,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 2.4, 2.4);
    sprite.renderOrder = 5;
    this.blochGroup.add(sprite);
    this.entanglement.fogTexture = tex;
    this.entanglement.fogMaterial = mat;
    this.entanglement.fogSprite = sprite;
  }

  _initGlyph() {
    const glyphTex = makeGlyphTexture("Φ+");
    const glyphMat = new THREE.SpriteMaterial({
      map: glyphTex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      color: this.entanglement.mix,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(glyphMat);
    sprite.position.set(1.5, 0.2, 1.1);
    sprite.scale.set(0.001, 0.001, 0.001);
    sprite.renderOrder = 12;
    this.blochGroup.add(sprite);
    this.entanglement.glyphTexture = glyphTex;
    this.entanglement.glyphSprite = sprite;
  }

  _refreshFogTexture() {
    if (!this.entanglement.fogMaterial) return;
    const tex = makeNoiseTexture(this.entanglement.colorA, this.entanglement.colorB, 12);
    this.entanglement.fogTexture?.dispose?.();
    this.entanglement.fogTexture = tex;
    this.entanglement.fogMaterial.map = tex;
    this.entanglement.fogMaterial.color.copy(this.entanglement.mix);
  }

  _tickEntanglement() {
    const now = performance.now();
    const dt = Math.max(0, (now - this.entanglement.lastTick) / 1000);
    this.entanglement.lastTick = now;
    const level = this.entanglement.level;

    if (this.entanglement.fogMaterial && this.entanglement.fogTexture && this.entanglement.fogSprite) {
      const easedLevel = easeOutCubic(level);
      const opacity = lerp(0, 0.8, easedLevel);
      this.entanglement.fogMaterial.opacity = opacity * (1 + this.entanglement.flash * 0.8);
      this.entanglement.fogMaterial.color.copy(this.entanglement.mix);
      this.entanglement.fogSprite.visible = opacity > 0.01;
      // Keep fog stationary (no scrolling) to hide sprite edges.
      this.entanglement.fogTexture.offset.set(0.5 * this.entanglement.rgbShift.x, 0.5 * this.entanglement.rgbShift.y);
      this.entanglement.fogSprite.scale.setScalar(2.05);
    }

    if (this.entanglement.glyphSprite?.material) {
      const target = level > 0.05 ? 1 : 0;
      const speed = level > 0.05 ? 4 : 6;
      this.entanglement.glyphScale = THREE.MathUtils.lerp(this.entanglement.glyphScale, target, 1 - Math.exp(-dt * speed));
      const eased = easeOutBack(this.entanglement.glyphScale);
      const pulse = 1 + 0.05 * Math.sin(now * 0.005);
      const finalScale = 0.6 * eased * pulse;
      this.entanglement.glyphSprite.scale.set(finalScale, finalScale, finalScale);
      this.entanglement.glyphSprite.material.opacity = Math.min(1, eased) * Math.max(0, level);
      this.entanglement.glyphSprite.material.color.copy(this.entanglement.mix);
    }

    if (this.camera) {
      if (this.entanglement.cameraShake > 0) {
        const basePos = this.baseCameraPos || this.camera.position.clone();
        const shakeAmp = this.entanglement.cameraShake * (0.5 + 0.5 * Math.sin(now * 0.09));
        const jitter = new THREE.Vector3(
          (Math.random() - 0.5) * shakeAmp,
          (Math.random() - 0.5) * shakeAmp,
          (Math.random() - 0.5) * shakeAmp
        );
        this.camera.position.copy(basePos.clone().add(jitter));
        this.camera.lookAt(0, 0, 0);
      } else {
        this.baseCameraPos = this.camera.position.clone();
      }
    }

    if (this.sphereMat) {
      const flashBoost = this.entanglement.flash * 0.9;
      this.sphereMat.emissiveIntensity = 0.5 + flashBoost;
    }

    if (this.entanglement.flash > 0) {
      this.entanglement.flash = Math.max(0, this.entanglement.flash - dt * 4);
    }
    if (this.entanglement.fogMaterial) this.entanglement.fogMaterial.needsUpdate = true;
  }

  _getPalette(theme) {
    const base = BLOCH_THEMES[theme] || BLOCH_THEMES.dark;
    return {
      ...base,
      label: getCssColor("--bloch-label", base.axis),
    };
  }
}

export { BlochSphereWidget, makeLatexLabel };

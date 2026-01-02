import * as THREE from "three";

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function getCssColor(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  return raw?.trim() || fallback;
}

class EntanglementVisuals {
  constructor({ containerEl, widgets = [], pair = [0, 1], pairs = null } = {}) {
    this.containerEl = containerEl;
    this.widgets = widgets;
    this.pairs = pairs || [pair];

    this.currentLevel = 0;
    this.levelAnim = null;

    this.colorA = new THREE.Color(getCssColor("--pop-cyan", "#67d5ff"));
    this.colorB = new THREE.Color(getCssColor("--pop-pink", "#ff6fa3"));

    this.burst = {
      flashUntil: 0,
      rgbUntil: 0,
      shakeUntil: 0,
    };

    this.segmentCount = 10;
    this.baseJitter = 6;
    this.pulseSpeed = 0.6;
    this._phaseSeeds = Array.from({ length: this.segmentCount }, () => Math.random() * Math.PI * 2);
    this._resizeObserver = null;

    this.canvas = null;
    this.ctx = null;

    this._raf = null;
    this._lastTime = performance.now();

    this._initScene();
    this._loop();
  }

  setWidgets(widgets = []) {
    this.widgets = widgets;
  }

  setPair(pair = [0, 1]) {
    this.pairs = [pair];
  }

  setPairs(pairs = []) {
    if (!pairs?.length) {
      this.pairs = [];
      return;
    }
    this.pairs = pairs.map((p) => [p[0], p[1]]);
  }

  refreshPalette() {
    this.colorA.set(getCssColor("--pop-cyan", "#67d5ff"));
    this.colorB.set(getCssColor("--pop-pink", "#ff6fa3"));
  }

  isAnimating() {
    return !!this.levelAnim;
  }

  setEntanglementLevel(level) {
    const clamped = Math.max(0, Math.min(1, level));
    this.currentLevel = clamped;
    this.levelAnim = null;
  }

  clearEntanglement(duration = 420) {
    this._startLevelAnim(0, duration);
  }

  triggerEntanglementBurst(durationMs = 150) {
    const now = performance.now();
    this.burst.flashUntil = now + 30;
    this.burst.rgbUntil = now + durationMs + 60;
    this.burst.shakeUntil = now + 140;
    this._startLevelAnim(1, 480, durationMs);
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._resizeObserver?.disconnect?.();
    if (this.canvas?.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    this.ctx = null;
  }

  _startLevelAnim(target, duration = 360, delayMs = 0) {
    const now = performance.now();
    this.levelAnim = {
      from: this.currentLevel,
      to: Math.max(0, Math.min(1, target)),
      start: now + delayMs,
      duration: Math.max(50, duration),
    };
  }

  _initScene() {
    if (!this.containerEl) return;
    const { clientWidth: w = 400, clientHeight: h = 400 } = this.containerEl;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.position = "absolute";
    this.canvas.style.left = "0";
    this.canvas.style.top = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.zIndex = "2";
    this.ctx = this.canvas.getContext("2d");
    this.containerEl.appendChild(this.canvas);
    this._watchResize();
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    this._update();
  }

  resize() {
    if (!this.canvas || !this.containerEl) return;
    const rect = this.containerEl.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
  }

  _update() {
    const now = performance.now();
    const dt = Math.max(0, (now - this._lastTime) / 1000);
    this._lastTime = now;

    const anim = this.levelAnim;
    if (anim) {
      if (now < anim.start) {
        // hold
      } else if (now >= anim.start + anim.duration) {
        this.currentLevel = anim.to;
        this.levelAnim = null;
      } else {
        const t = (now - anim.start) / anim.duration;
        this.currentLevel = lerp(anim.from, anim.to, easeOutCubic(t));
      }
    }

    this._updateBlochVisuals(now);
    this._updateTether(now, dt);
  }

  _updateBlochVisuals(now) {
    const flash = now < this.burst.flashUntil ? 1 : 0;
    const rgbSplit = now < this.burst.rgbUntil ? new THREE.Vector2((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35) : null;
    const shake = now < this.burst.shakeUntil ? 0.05 : 0;
    const level = this.currentLevel;
    const activePairs = this.pairs || [];
    const involved = new Set();
    activePairs.forEach(([a, b]) => { involved.add(a); involved.add(b); });
    this.widgets.forEach((entry, idx) => {
      const w = entry?.widget;
      if (!w || !w.setEntanglementVisuals) return;
      const isPair = involved.has(idx);
      const pairIdx = activePairs.findIndex((p) => p[0] === idx || p[1] === idx);
      const color = pairIdx % 2 === 0 ? this.colorA : this.colorB;
      w.setEntanglementVisuals({
        level: isPair ? level : 0,
        colorA: color,
        colorB: color,
        flash: isPair ? flash : 0,
        rgbShift: rgbSplit,
        cameraShake: isPair ? shake : 0,
      });
    });
  }

  _updateTether(now, dt) {
    if (!this.canvas || !this.ctx || !this.containerEl) return;
    const anchors = this._computeAnchors();
    const level = this.currentLevel;
    const opacity = lerp(0, 0.9, level);
    const hasAnchors = !!anchors?.length;

    if (!hasAnchors || opacity < 0.01) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    this._resizeIfNeeded();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const jitterAmp = lerp(0, this.baseJitter * 1.2, level) * (0.5 + 0.5 * Math.sin(now * 0.018 * 18));
    const pulsePhase = (now * 0.001 * this.pulseSpeed) % 1;

    this.ctx.lineCap = "square";
    this.ctx.lineJoin = "miter";
    this.ctx.globalAlpha = 1;
    const blend = (t, c1, c2) => {
      const col = new THREE.Color(c1).lerp(new THREE.Color(c2), t);
      return col.getStyle();
    };

    anchors.forEach(({ ax, ay, bx, by, colorA, colorB }) => {
      const jitter = () => (Math.random() - 0.5) * jitterAmp;
      const cx = (ax + bx) / 2 + jitter();
      const cy = (ay + by) / 2 + jitter();
      for (let i = 0; i < this.segmentCount; i++) {
        const t0 = i / this.segmentCount;
        const t1 = (i + 1) / this.segmentCount;
        const px0 = ax + (cx - ax) * t0 + jitter();
        const py0 = ay + (cy - ay) * t0 + jitter();
        const px1 = ax + (cx - ax) * t1 + jitter();
        const py1 = ay + (cy - ay) * t1 + jitter();
        const qx0 = cx + (bx - cx) * t0 + jitter();
        const qy0 = cy + (by - cy) * t0 + jitter();
        const qx1 = cx + (bx - cx) * t1 + jitter();
        const qy1 = cy + (by - cy) * t1 + jitter();

        const tPulse = (t0 + pulsePhase) % 1;
        const alpha = (0.4 + 0.4 * Math.sin(tPulse * Math.PI * 2)) * opacity;
        const col1 = blend(t0, colorA, colorB);
        const col2 = blend(t1, colorA, colorB);

        this.ctx.strokeStyle = col1;
        this.ctx.globalAlpha = alpha;
        this.ctx.lineWidth = 5;
        this.ctx.beginPath();
        this.ctx.moveTo(px0, py0);
        this.ctx.lineTo(px1, py1);
        this.ctx.stroke();

        this.ctx.strokeStyle = col2;
        this.ctx.beginPath();
        this.ctx.moveTo(qx0, qy0);
        this.ctx.lineTo(qx1, qy1);
        this.ctx.stroke();
      }
    });
  }

  _resizeIfNeeded() {
    const rect = this.containerEl.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width)) || window.innerWidth;
    const height = Math.max(1, Math.floor(rect.height)) || window.innerHeight;
    const canvas = this.canvas;
    if (canvas && (canvas.width !== width || canvas.height !== height)) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }
    return { width, height };
  }

  _computeAnchors() {
    if (!this.containerEl || !this.widgets?.length) return null;
    if (!this.pairs?.length) return null;
    const root = this.containerEl.getBoundingClientRect();
    const scrollX = this.containerEl.scrollLeft;
    const scrollY = this.containerEl.scrollTop;
    const anchors = [];
    this.pairs.forEach((pair, idx) => {
      const [aIdx, bIdx] = pair;
      const a = this.widgets[aIdx];
      const b = this.widgets[bIdx];
      if (!a || !b) return;
      const aRect = (a.widget?.renderer?.domElement || a.mountEl)?.getBoundingClientRect?.();
      const bRect = (b.widget?.renderer?.domElement || b.mountEl)?.getBoundingClientRect?.();
      if (!aRect || !bRect) return;
      const ax = aRect.left + aRect.width / 2 - root.left + scrollX;
      const ay = aRect.top + aRect.height / 2 - root.top + scrollY;
      const bx = bRect.left + bRect.width / 2 - root.left + scrollX;
      const by = bRect.top + bRect.height / 2 - root.top + scrollY;
      const colorA = (idx % 2 === 0 ? this.colorA : this.colorB).getStyle();
      const colorB = colorA;
      anchors.push({ ax, ay, bx, by, colorA, colorB });
    });
    return anchors;
  }

  _watchResize() {
    if (!this.containerEl || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.containerEl);
  }
}

export { EntanglementVisuals };

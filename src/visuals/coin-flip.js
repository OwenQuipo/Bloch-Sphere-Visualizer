// Measurement coin flip animation extracted for clarity.
import * as THREE from "three";
import { typesetNode } from "../utils/mathjax";

const COIN_THEMES = {
  dark: {
    face: "#f5f5f5",
    rim: "#ffffff",
    text: "#050505",
    table: "#050505",
    shadow: 0.24,
  },
  light: {
    face: "#0b0b0b",
    rim: "#000000",
    text: "#f7f7f7",
    table: "#f8f8f6",
    shadow: 0.18,
  },
};

function getCssColor(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  return raw?.trim() || fallback;
}

// -------------------- Measurement coin animation (top-down) --------------------
function makeCoinFaceTexture(label, palette) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const center = size / 2;
  const radius = size * 0.42;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = palette.face;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.arc(center, center, radius * 0.86, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = palette.text;
  ctx.font = `${Math.floor(size * 0.24)}px "Press Start 2P", "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, center, center);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
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

    this.theme = document.documentElement.getAttribute("data-theme") || "dark";
  }

  init() {
    if (!this.mountEl || this.scene) return;
    this._clearHighlights();
    const width = this.mountEl.clientWidth || 220;
    const height = this.mountEl.clientHeight || 220;
    const aspect = width / height;
    const viewSize = 1.7;
    const palette = this._getPalette();

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

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.domElement.style.imageRendering = "pixelated";
      this.mountEl.appendChild(this.renderer.domElement);
      this.renderer.domElement.addEventListener("webglcontextlost", (e) => this._handleContextLost(e), false);
    } catch (err) {
      console.error("Coin flip renderer init failed:", err);
      return;
    }

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1.6, 2.4, 1.8);
    this.scene.add(dir);

    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.table), roughness: 0.94, metalness: 0.04 })
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
      new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.rim), metalness: 0.25, roughness: 0.6 })
    );
    this.coinGroup.add(rim);

    const headsTex = makeCoinFaceTexture("|0⟩", palette);
    const tailsTex = makeCoinFaceTexture("|1⟩", palette);
    const faceGeom = new THREE.CircleGeometry(radius, 64);
    const top = new THREE.Mesh(
      faceGeom,
      new THREE.MeshStandardMaterial({ map: headsTex, metalness: 0.1, roughness: 0.5 })
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = thickness / 2 + 0.002;
    this.coinGroup.add(top);

    const bottom = new THREE.Mesh(
      faceGeom,
      new THREE.MeshStandardMaterial({ map: tailsTex, metalness: 0.1, roughness: 0.5 })
    );
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = -thickness / 2 - 0.002;
    this.coinGroup.add(bottom);

    this.shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 1.5, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.text), transparent: true, opacity: palette.shadow, depthWrite: false })
    );
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.001;
    this.shadowMesh.scale.set(1.2, 1.2, 1.2);
    this.scene.add(this.shadowMesh);

    this._tick();
  }

  _handleContextLost(e) {
    if (e?.preventDefault) e.preventDefault();
    this._resetScene();
    requestAnimationFrame(() => this.init());
  }

  _resetScene() {
    this.playing = false;
    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer?.dispose?.();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.coinGroup = null;
    this.shadowMesh = null;
    this._resolve?.();
    this._resolve = null;
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
    this._clearHighlights();
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
    this.oddsEl.classList.remove("coin-miss");
    if (!probs) {
      this.oddsEl.textContent = "Odds: –";
      return;
    }
    const total = Math.max(0, probs.p0 + probs.p1) || 1;
    const p0 = Math.round((Math.max(0, probs.p0) / total) * 100);
    const p1 = Math.max(0, 100 - p0);
    this.oddsEl.textContent = `Odds: |0⟩ ${p0}% | |1⟩ ${p1}%`;
  }

  play(outcome, { label, probs } = {}) {
    if (!this.scene) this.init();
    this._clearHighlights();
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
    if (this.fallback) return;
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
    const shadowFade = Math.max(0.12, (this._getPalette().shadow ?? 0.2) - arc * 0.12);
    this.shadowMesh.scale.set(shadowScale * 1.3, shadowScale * 1.1, 1);
    if (this.shadowMesh.material) this.shadowMesh.material.opacity = shadowFade;

    if (t >= 1) {
      this.playing = false;
      this.coinGroup.position.y = 0.08;
      this.coinGroup.rotation.set(this.targetIsOne ? Math.PI : 0, 0, 0);
      this.coinGroup.scale.set(1, 1, 1);
      this.setStatus(this.targetIsOne ? "|1⟩" : "|0⟩");
      this._applyOutcomeHighlight(this.targetIsOne ? 1 : 0);
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

  _clearHighlights() {
    if (this.statusEl) {
      this.statusEl.classList.remove("coin-hit", "coin-pulse");
    }
    if (this.oddsEl) {
      this.oddsEl.classList.remove("coin-miss");
    }
  }

  _applyOutcomeHighlight() {
    if (this.statusEl) {
      this.statusEl.classList.add("coin-hit", "coin-pulse");
    }
    if (this.oddsEl) {
      this.oddsEl.classList.add("coin-miss");
    }
  }

  setTheme(theme) {
    this.theme = theme === "light" ? "light" : "dark";
    this._resetScene();
    requestAnimationFrame(() => this.init());
  }

  _getPalette() {
    const base = COIN_THEMES[this.theme] || COIN_THEMES.dark;
    return {
      ...base,
      table: getCssColor("--bg", base.table),
      text: base.text,
    };
  }
}

export { CoinFlipAnimator };

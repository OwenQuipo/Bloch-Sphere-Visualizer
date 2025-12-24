<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Qubit Visualizer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- MathJax for LaTeX rendering -->
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>

  <link rel="stylesheet" href="./styles.css" />
</head>

<body>
  <div id="qubit-visualizer">
    <!-- =========================
         Topbar (always visible)
         ========================= -->
    <header id="topbar" role="banner">
      <div id="title" aria-label="App title">Qubit Visualizer</div>

      <div class="spacer"></div>

      <!-- step controls compact (always visible) -->
      <div id="stepControls" class="step-controls" aria-label="Step controls">
        <button id="prevStep" class="icon-btn" title="Prev step (ArrowLeft)" aria-label="Prev step">
          <span class="ico">←</span>
        </button>

        <button id="playPause" class="icon-btn" title="Play/Pause (Space)" aria-label="Play/Pause">
          <span class="ico" id="playIcon">▶</span>
        </button>

        <button id="nextStep" class="icon-btn" title="Next step (ArrowRight)" aria-label="Next step">
          <span class="ico">→</span>
        </button>

        <div id="stepCounter" class="step-counter" aria-label="Step counter">
          Step <span id="activeStepLabel">–</span>/<span id="stepCountLabel">12</span>
        </div>
      </div>

      <div class="spacer"></div>

      <!-- Qubit controls (always visible) -->
      <div class="qubit-controls" aria-label="Qubit controls">
        <button id="removeQubitTop" class="icon-btn" title="Remove qubit" aria-label="Remove qubit">
          <span class="ico">−</span>
        </button>
        <div id="qubitCountLabel" class="step-counter" aria-label="Qubit count">Qubits <span id="qubitCountNum">1</span>/10</div>
        <button id="addQubitTop" class="icon-btn" title="Add qubit" aria-label="Add qubit">
          <span class="ico">＋</span>
        </button>
      </div>

      <button id="resetState" class="icon-btn" title="Reset visualization state (R)" aria-label="Reset visualization state">
        <span class="ico">⟲</span>
      </button>

      <!-- kebab menu -->
      <div id="moreMenu" class="menu">
        <button id="moreMenuBtn" class="icon-btn" aria-haspopup="menu" aria-expanded="false" title="More">
          <span class="ico">⋮</span>
        </button>

        <div id="moreMenuPopover" class="menu-popover" role="menu" aria-label="More menu">
          <button class="menu-item danger" id="menuClearCircuit" role="menuitem">Clear circuit…</button>

          <div class="menu-sep"></div>

          <div class="menu-group" role="none">
            <div class="menu-label">Export…</div>
            <button class="menu-item" id="menuExportJson" role="menuitem">Export JSON</button>
            <button class="menu-item" id="menuExportPng" role="menuitem">Export PNG</button>
          </div>

          <div class="menu-sep"></div>

          <div class="menu-group" role="none">
            <div class="menu-label">Settings…</div>
            <button class="menu-item" id="menuTheme" role="menuitem">Theme</button>
            <button class="menu-item" id="menuShortcuts" role="menuitem">Shortcuts</button>
            <button class="menu-item" id="menuSimulation" role="menuitem">Simulation</button>
          </div>
        </div>
      </div>
    </header>

    <!-- =========================
         Main split view (always visible)
         ========================= -->
    <main id="main" role="main">
      <!-- Bloch pane -->
      <section id="blochPane" class="pane" aria-label="Bloch pane">
        <div id="blochCanvas" aria-label="Bloch canvas region">
          <div id="bloch-grid"></div>
        </div>

        <!-- micro overlay (bottom-left) -->
        <div id="blochOverlay" class="micro-overlay" aria-label="Bloch overlay">
          <label class="micro-toggle" title="Toggle trajectory trail">
            <input id="toggleTrajectory" type="checkbox" checked />
            <span class="micro-pill">Trail</span>
          </label>

          <button id="openProbPopover" class="micro-btn" title="Probabilities">
            Probs
          </button>

          <button id="openBackendDrawer" class="micro-btn" title="Backend math">
            Math
          </button>
        </div>

        <!-- Prob popover (anchored near overlay) -->
        <div id="probPopover" class="popover" aria-label="Probabilities popover">
          <div id="probHistogram" class="mini-histogram" aria-label="Probability histogram"></div>
          <div id="probNote" class="popover-note">Probabilities reflect measurement of the full register.</div>
        </div>
      </section>

      <!-- primary splitter -->
      <div id="primarySplitter" class="splitter" aria-label="Resize panes" title="Drag to resize"></div>

      <!-- Circuit pane -->
      <section id="circuitPane" class="pane" aria-label="Circuit pane">
        <!-- circuit toolstrip (kept, but not required for qubit add/remove anymore) -->
        <div id="circuitToolstrip" class="toolstrip" aria-label="Circuit toolstrip">
          <button id="addQubit" class="icon-btn" title="Add qubit"><span class="ico">＋</span></button>
          <button id="removeQubit" class="icon-btn" title="Remove qubit"><span class="ico">−</span></button>
          <button id="deleteSelection" class="icon-btn" title="Delete selected"><span class="ico">⌫</span></button>
          <button id="openGateLibrary" class="icon-btn" title="Gate Library"><span class="ico">▦</span></button>
        </div>

        <!-- Circuit canvas area (existing IDs preserved) -->
        <div id="circuitCanvas">
          <div id="circuit-grid">
            <div id="circuit-canvas"></div>
          </div>
        </div>
      </section>
    </main>

    <!-- =========================
         Gate library (ALWAYS visible)
         ========================= -->
      <div class="gateLibTopControls">
        <button class="iconChip" id="toggleTrajectoryBtn" type="button" title="Toggle trail">Trail</button>
        <button class="iconChip" id="openProbBtn" type="button" title="Probabilities">Probs</button>
        <button class="iconChip" id="openMathBtn" type="button" title="Backend math">Math</button>
      </div>

    <div id="gateLibrary" class="floating-panel always-open" aria-label="Gate library">
      <div class="floating-header">
        <button id="gateLibToggle" class="icon-btn" type="button" title="Minimize/Maximize (L)">
        <span class="ico">▾</span>
        </button>

        <div class="floating-title">Gate Library</div>
        <div class="floating-hint">Hover a gate to preview its matrix</div>
      </div>

      <!-- hover math preview -->
      <div id="gateHoverMath" class="gate-hover-math" aria-label="Gate matrix preview"></div>

      <!-- Existing palette renderer expects #gatePaletteRow -->
      <div id="gatePaletteRow" class="gate-library-grid"></div>
    </div>

    <!-- =========================
         Backend drawer (bottom, on demand)
         ========================= -->
    <div id="backendDrawer" class="drawer" aria-hidden="true">
      <div id="backendHeader" class="drawer-header">
        <div class="drawer-left">Unitary / State Update</div>

        <div class="drawer-right">
          <label class="drawer-toggle" title="Simplify">
            <input id="toggleSimplify" type="checkbox" checked />
            <span>Simplify</span>
          </label>

          <label class="drawer-toggle" title="Show matrix">
            <input id="toggleShowMatrix" type="checkbox" />
            <span>Show matrix</span>
          </label>

          <button id="copyLatex" class="icon-btn" title="Copy LaTeX" aria-label="Copy LaTeX">
            <span class="ico">⧉</span>
          </button>

          <button id="closeBackendDrawer" class="icon-btn" title="Close (Esc)" aria-label="Close drawer">
            <span class="ico">×</span>
          </button>
        </div>
      </div>

      <div id="unitaryMath" class="mathjax-panel">
        <div class="math-col">
          <div class="math-block">
            <div class="math-label">Gate</div>
            <div id="currentGateLatex" class="math-content"></div>
          </div>

          <div class="math-block">
            <div class="math-label">Update</div>
            <div id="stateUpdateLatex" class="math-content"></div>
          </div>

          <div class="math-block" id="matrixBlock">
            <div class="math-label">Matrix</div>
            <div id="optionalMatrixLatex" class="math-content"></div>
          </div>
        </div>

        <div class="math-col">
          <div class="math-block">
            <div class="math-label">Bloch mapping</div>
            <div id="blochUpdateLatex" class="math-content"></div>
          </div>

          <div class="math-block">
            <div class="math-label">Notes</div>
            <div id="notesLatex" class="math-content"></div>
          </div>
        </div>
      </div>

      <div id="drawerHandle" class="drawer-handle" title="Drag down to close"></div>
    </div>

    <!-- lightweight backdrop for overlays (NOT used for gate library anymore) -->
    <div id="overlayBackdrop" class="backdrop" aria-hidden="true"></div>
  </div>

  <script type="module" src="./main.js"></script>
</body>
</html>


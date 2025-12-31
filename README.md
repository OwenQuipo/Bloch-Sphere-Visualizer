# Bloch Sphere Visualizer

An interactive Three.js + MathJax web app for building simple quantum circuits, animating gates on the Bloch sphere, and previewing measurement outcomes (including a top-down coin flip animation).

## Features
- Drag-and-drop circuit composer with H, X, Y, Z, S, T, CX, and measurement gates.
- Per-qubit Bloch spheres with animated gate arcs, trail toggle, purity, and entanglement indicators.
- Measurement visuals: snap-to-axis collapse, optional coin-flip animation with odds and delayed reveal.
- Probability, backend math, and density-matrix inspection drawers, all rendered with MathJax.
- Initial state picker per wire (|0⟩, |1⟩, |+⟩, |−⟩, |i⟩, |−i⟩).

## Quick Start
- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Preview build: `npm run preview`

## Usage Tips
- Click the ket label on a wire to set its initial state.
- Drag gates from the library onto the grid; right-click a placed gate to remove it.
- Use step controls or spacebar to play/pause timeline progression.
- Hover controls to see tooltips describing their actions.

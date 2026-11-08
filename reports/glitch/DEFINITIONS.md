# Defect Severity Definitions & Rubric

This document defines the defect severity classification rubric applied across BackSilence development, verification gates, and release tracking.

---

## Severity Levels

### P0 — Showstopper (Fatal)
A defect that prevents the game from executing, causes a complete crash, results in a total loss of telemetry/rendering (e.g., solid black/white screen), memory leaks causing inevitable browser tab crash, or breaks physics/simulation determinism such that multiplayer replay hashes desync or AI navigation collapses entirely.
- **Release Rule:** Zero open P0 defects permitted under any circumstances.
- **Examples:**
  - Game crashes on load or unhandled promise rejection in main game loop.
  - Monster spawning inside impassable geometry or player collision hull.
  - Replay simHash divergence between identical seeds.

### P1 — Severe (Gameplay / Aesthetic Violation)
A defect that fundamentally violates core game design rules or core visual identity, including visible geometry holes (void exposure), broken acoustic rules (dry movement alerting predator, water sound playing on dry tiles, freeze rule non-functional), audio distortion / clipping / missing spatial positioning, or inverted creature animations.
- **Release Rule:** Zero open P1 defects permitted for release candidates.
- **Examples:**
  - Water rendered as saturated cyan/blue instead of olive green.
  - Locomotion on dry platforms alerting the blind predator.
  - Monster mesh detaching or floating away from its bone rig.
  - Horizon fog color mismatch creating an artificial bright white band.

### P2 — Noticeable (Presentation / Visual Alignment)
A defect that is readily noticeable to an observant user but does not disrupt gameplay mechanics or violate physical game rules. Includes texture seams where UV wrapping is unquantized, HUD bounding box intersections, camera near plane clipping through player chin during severe drops, or duplicate scanline rendering.
- **Release Rule:** All P2 defects must be tracked in the Defect Register with root causes documented and prioritized for resolution.
- **Examples:**
  - Visible vertical texture seam along round columns or pillars.
  - Simultaneous CSS fallback scanlines overlaid on WebGL VHS shader pass.
  - Telemetry loss instant cut without smooth fade transition.

### P3 — Cosmetic (Subtle Polish / Low Impact)
Minor aesthetic nuances, subtle edge cases, minor decal depth adjustments, typography spacing adjustments, or small wording clarifications that do not impede user experience or architectural fidelity.
- **Release Rule:** Logged for ongoing polish passes; non-blocking.
- **Examples:**
  - Subtle decal shadow rounding.
  - Minor phrasing nuance in secondary settings tooltips.



---

## Defect Classes & Automated Detection Rubric (Decision D137)

The visual defect detector (`scripts/visual/artifact-detector.mjs`) automatically scans all frames against this machine-checkable rubric:

| Defect Class | Detection Metric | Trigger Threshold | Root Cause & Resolution |
|:---|:---|:---:|:---|
| `aliasing` | Sobel gradient magnitude ($>0.80$) + directional edge tangent oscillation ($\Delta_{\text{tangent}} > 0.40$) | $\ge 18.0\%$ directional staircasing on hard edges | Distance-based grid dissolve at 10–25m, normal map attenuation (85%), MSAA 8x/4x on composer, and Low-tier FXAA |
| `specular-blowout` | Saturated clamped highlights ($L \ge 0.98$) with chromaticity loss ($\max(RGB) - \min(RGB) < 0.04$) | $\ge 0.30\%$ of total frame pixels | Wet ceramic roughness floor raised to 0.22, filmic shoulder roll-off above $L_0=0.86$ capping at $\le 0.965$ |
| `black-void` | Contiguous unrendered black pixels ($L < 0.05$) in upper 35% of frame | $>5.0\%$ of frame area or $>15\%$ of upper third (exempts jumpscares) | Enclosed ceiling geometry closure across all 11 map builders; ray-up skybox leak prevention |
| `debug-leak` | Pure-white text glyph clusters ($R,G,B > 0.95$, width 40–400px, height 7–35px) in perimeter bands | Cluster match detected in bottom 15% | Pointer lock overlays and debug stats panels suppressed during automated capture mode |
| `flatness` | Luminance standard deviation & fraction near frame mean ($\pm 2\%$) | $\text{stdDev} < 0.015$ or $\text{fracNearMean} > 50\%$ | Restored multi-point illumination, directional shadows, height-fog absorption, and ambient occlusion |
| `z-fight` | Scanline autocorrelation ($r_1 < -0.25, r_2 > 0.20$) with high-amplitude alternations ($>15$) | $\ge 2$ flagged scanlines with score $\ge 1.5$ | Depth-bias offsets on submerged surfaces, water mesh separation, and polygon offset on coping decals |
| `hard-fog-seams` | Row-to-row average luminance step discontinuity in fog band $y \in [0.15, 0.40]$ | Step $\Delta L > 0.450$ between adjacent rows | Continuous analytical exponential-squared fog attenuation and smooth horizon gradient transitions |
| `magenta-hue` | Isolated saturated magenta debug locator pixels ($h \in [280^\circ, 360^\circ] \cup [0^\circ, 20^\circ \land B > G], S > 0.50$) | $> 8$ magenta pixels detected in frame | Replacement of placeholder locator dummies with canonical procedural mesh models |
| `hud-overlap` | 2D axis-aligned bounding box intersection between registered UI components | Positive overlap area between any two distinct HUD boxes | Responsive flexbox layout manager and dynamic anchoring for noise meter, telemetry, and objective HUD |
| `untextured-primitives` | Contiguous pixels matching raw engine untextured gray (`#808080` / `vec3(0.5)`) | $\ge 5.0\%$ of frame area | Complete PBR procedural material assignment to all geometry props, vaults, and columns |

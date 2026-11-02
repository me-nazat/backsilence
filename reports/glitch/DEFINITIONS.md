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


# BackSilence — Project Handover & Architecture Guide

**Version:** 2.2.0  
**Date:** 2026-11-05  
**Target:** Engineering Handover, Production Operation, and Architecture Reference  

---

## 1. Executive Summary

BackSilence is a browser-based, zero-external-binary-asset 3D survival-horror game inspired by the liminal Backrooms "Poolrooms" aesthetic. The player wades through flooded subterranean tiled architectures inhabited by an acoustic-only blind predator. The singular core rule governing the world is:
> *"It can't see you. It hears the water."*

All 3D models, textures, animations, and audio waveforms are synthesized purely at runtime (procedural geometry, procedural Canvas textures, WebGL2 GLSL shaders, and Web Audio API additive/FM synthesis).

---

## 2. Core Architecture & Subsystems

```
src/
├── app/                  # Configuration, global constants, event bus, settings
│   └── Config.ts         # Authoritative world scale: TILE_METERS = 0.15, TEXTURE_METERS = 2.4
├── sim/                  # 60 Hz deterministic fixed-timestep simulation
│   ├── SimWorld.ts       # Player physics, collision hulls, world state snapshots
│   ├── AcousticBus.ts    # Inverse-square sound propagation, hearing radius, 29-row rulebook
│   └── MonsterAI.ts      # Blind predator state machine, navmesh/waterline traversal, freeze rule
├── game/                 # Game loop session, camera, water, and monster visualization
│   ├── GameSession.ts    # Main session coordinator, input wiring, still ducking, auto-exposure
│   ├── water/            # WaterSystem, WaterMaterial, GpuWaveSimulation, Splashes (crown/ink)
│   └── monster/          # MonsterRig (procedural bones/skin), Jumpscare, MonsterProbe
├── procedural/           # Procedural asset generators
│   ├── textures/         # TileMaterialFactory (0.15m ceramic tiles, caustics, contact darkening)
│   ├── geometry/         # TiledCylinder, CatwalkBuilder, Architecture props
│   └── shaders/          # vhs.glsl.ts (god rays, 3D LUT tension grading, DOF, motion blur)
├── engine/               # Three.js WebGL2 renderer wrapper, PostFX composer, quality tiers
├── audio/                # Web Audio synthesis engine, Mixer (listening dip), spatial voices
├── world/                # 11 map builders, layout validators, puzzle generators
└── ui/                   # Modular DOM UI, Design System component kit, screens
```

---

## 3. Inviolable Architectural Constants

1. **One Tile Scale (`WORLD.TILE_METERS = 0.15`):**
   - Every mosaic tile in BackSilence is exactly $0.15\text{ m} \times 0.15\text{ m}$ (matching reference footage: ~1 tile per 6% of wall height).
   - Texture repeat is exactly $16 \times 16$ tiles ($2.40\text{ m}$).
   - Any departure from $0.15\text{ m} \pm 5\%$ fails automated gates (`npm run glitch:scan`, `tests/tile-scale-uniqueness.test.ts`).
2. **Deterministic 60 Hz Simulation:**
   - Simulation state advances at a fixed 60 Hz timestep independent of render frame rate.
   - Multiplayer replay determinism is validated via bitwise FNV-1a `simHash`.
3. **Acoustic Truth Table:**
   - 29 distinct sound actions are codified in `ACOUSTIC_RULEBOOK.md` and synced with `AcousticBus.ts`.
   - Dry platform locomotion emits 0 water noise and alerts zero predators.
   - Halting in water locks the predator's hearing target to the splash coordinate without live tracking.
4. **Authentic Olive Palette:**
   - Water surface and absorption hues are strictly constrained to the measured olive-to-leaf green spectrum ($85^\circ - 113^\circ$). Saturated cyan, teal, or blue hues are forbidden.
5. **Creature v2 Readability & Anatomy Laws (`MonsterRig.ts`, `MonsterAnimator.ts`, `MonsterGait.ts`):**
   - Seed-pod dome head (0.28m width, aspect 1.25, 32 recessed dark pits `#241c14`, small dark mouth slit, zero visible eyes/horns).
   - Long forelimbs (1.35m = 2.08x torso length) ending in 4 curved splayed claws (0.28m) dragging through water; broad flat wading feet (`buildFlatWadingFootGeometry`, 0.26m length, 0.15m width).
   - Screen-space readability law enforced across contract shots: 6m coverage $\ge 3.0\%$ (height $\ge 14\%$, contrast $\ge 0.35$), 15m coverage $\ge 0.55\%$ (height $\ge 6\%$, contrast $\ge 0.35$), 35m coverage $\ge 0.12\%$, jumpscare coverage $\ge 25.0\%$.
   - Named kinematic posture library: `wade-stalk` (1.1s cadence, 0.72 rad hunch), `listen-freeze` (still, 0.38 rad tilt), `trench-pace` (lateral lip pacing), `lunge` (forward surge, 0.65 rad unhinge), and `jumpscare-bracket` (0.82m face distance, pitch +0.15 rad, arms bracketing viewport, in-water +0.42m head water-rise with $\ge 5$ droplet splatters).
6. **Directed Encounter Arc, Fairness Laws & Video-3 Leap-Cross (`EncounterArc.ts`, `Director.ts`, `MonsterBrain.ts`, `MonsterAudio.ts`):**
   - Canonical 6-beat encounter arc (Telegraph, Silhouette Hold, Stalk, Trench Standoff, Silence Window, Terminal Lunge) matching Video-2.
   - First-sight guarantee: exactly one sighting in $[40\text{ s}, 75\text{ s}]$ (0 before $30\text{ s}$) across 100/100 seeded cold starts for `campaign` and `training_pool`.
   - Fairness laws: `INVESTIGATE` state deals 0 damage, terminal lunge strictly requires qualifying noise $\le 4.0\text{ s}$ within $\le 4.0\text{ m}$, movement speed capped at $\le 7.4\text{ m/s}$, no off-screen kills at $> 1.5\text{ m}$, recovery window $\ge 20.0\text{ s}$ between lunges, standing still on dry tile 100% survivable.
   - Video-3 Leap-Cross Variant: rare ($\le 1$ per run), pre-leap crouch + hiss $\ge 0.6\text{ s}$, single parabolic arc $\le 0.7\text{ s}$, double ink-splash on landing.
   - Layered encounter audio mix: 6 layers, silence-as-information snapshot ducking (-18dB ambient, -24dB music, -12dB SFX, un-ducked breath) with $\ge 250\text{ ms}$ crossfades.

---

## 4. Verification & Quality Gates

The project contains 17 automated verification gates executed via `npm run verify` and summarized via `node scripts/gates/summary.mjs`:

```bash
# Complete verification pipeline
npm run verify

# Gate summary report
node scripts/gates/summary.mjs

# Specialized quality gates
npm run glitch:scan              # Scans golden baseline shots for visual defects
npm run audit:reports-honesty   # Asserts zero self-assigned subjective grades in reports
npm run audit:docs-truth        # Asserts documentation claims match codebase reality
npm run shots:check             # Asserts zero pixel regressions across 47 golden shots
npm run reference:verify        # Verifies SHA-256 integrity of all 37 reference frames
npm run reference:compare       # Runs SSIM/MAE comparisons against reference frames
```

---

## 5. Defect Register Status & Visual Glitch Census

All 17 historical defects (G1–G17) are resolved and closed in `reports/glitch/REGISTER.md`:
- **P0 Defects:** 0 Open (G6 dry sound alert, G9 invalid monster spawn resolved).
- **P1 Defects:** 0 Open (G1 tile scale conflict, G2 inverted footstep cadence, G3 floating mesh, G4 teal water, G5 debug marker leak, G8 horizon fog band, G11 noise meter zero, G14 pebble bounce, G16 fog color mismatch, G17 audio listener desync resolved).
- **P2 Defects:** 0 Open (G7 near plane clip, G10 wave wrap-around, G12 dual scanlines, G13 abrupt death cut, G15 pillar texture seam resolved).
- **P3 Defects:** 0 Open.

Additionally, Prompt 1 established a comprehensive, screenshot-evidenced visual glitch census across all 11 maps × 3 quality tiers:
- [Visual Glitch Census](reports/glitch/CENSUS.md) — 151 tracked defects serving as official burn-down targets across Prompts 2–9.
  - **Prompt 2 Closures:** C1 (ceiling void), C2 (15m creature silhouette), C3 (debug text leaks), C7, C8, C9, C11, C52, C54, C55, C57, C60, C62, C64, C66, C68, C70, C72, C74, C76, C78.
  - **Prompt 3 Closures:** C4 (submerged floor z-fighting), C21, C22, C27..C45 (waterline meniscus, viscous low-frequency swell, ink & foam contact vocabulary).
  - **Prompt 4 Closures:** C10 (pillar UV seam), C12 (waterline wainscot contrast & horizon silhouettes), C121, C126, C140, C151 (edge aliasing on arches, slabs, and pillars via bullnose coping and filleted reveals), C123, C127, C142 (specular clipping via curved normals and wayfinding numerals), and 11-map vaulted ceiling unification (`VaultBuilder.ts`).
  - **Prompt 5 Closures:** C2 (Creature silhouette readability at 15 m and screen-space contrast vs fog closed via Creature v2 seed-pod proportions, 15 m screen coverage 0.852%, Michelson contrast 0.3536 >= 0.35, waterline law, kinematic posture library, and jumpscare framing contract).
  - **Prompt 6 Closures:** All 35 `debug-leak` defect rows closed (C3, C52, C54, C57, C60, C62, C64, C66, C68, C70, C72, C74, C76, C78, C81, C83, C86, C89, C91, C93, C95, C97, C99, C100, C102, C110, C119, C122, C124, C128, C133, C136, C141, C146, C149) via strict `?debug=1` containment check.

---

## 6. Development & Deployment Commands

```bash
# Development server (port 5173)
npm run dev

# Production build (outputs to dist/)
npm run build

# Preview production build (port 4173)
npm run preview

# Headless CDP smoke tests (S1–S14)
npm run smoke

# Headless balance bot swarm (13,200 simulated runs)
npm run balance

# Six-beat encounter rehearsal harness (Prompt 6)
node scripts/monster/encounter-arc.mjs --map natatorium

# Spectral & dynamic baseline audio comparison
npm run audio:compare
```


# BackSilence — Project Handover & Architecture Guide

**Version:** 2.0.0  
**Date:** 2026-11-02  
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
npm run shots:check             # Asserts zero pixel regressions across 46 golden shots
npm run reference:verify        # Verifies SHA-256 integrity of all 37 reference frames
npm run reference:compare       # Runs SSIM/MAE comparisons against reference frames
```

---

## 5. Defect Register Status

All 17 tracked defects (G1–G17) are resolved and closed in `reports/glitch/REGISTER.md`:
- **P0 Defects:** 0 Open (G6 dry sound alert, G9 invalid monster spawn resolved).
- **P1 Defects:** 0 Open (G1 tile scale conflict, G2 inverted footstep cadence, G3 floating mesh, G4 teal water, G5 debug marker leak, G8 horizon fog band, G11 noise meter zero, G14 pebble bounce, G16 fog color mismatch, G17 audio listener desync resolved).
- **P2 Defects:** 0 Open (G7 near plane clip, G10 wave wrap-around, G12 dual scanlines, G13 abrupt death cut, G15 pillar texture seam resolved).
- **P3 Defects:** 0 Open.

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
```


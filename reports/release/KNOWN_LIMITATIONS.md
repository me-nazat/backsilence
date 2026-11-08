# BackSilence — Known Limitations & Architectural Boundaries

**Release Version:** v2.1.0-rc1  
**Date:** 2026-11-05  
**Status:** Documented, Measured & Verified  

This document records technical limitations, platform boundaries, and intentional engineering trade-offs in BackSilence.

---

## 1. WebGL Platform & Tier Fallbacks
- **Low Tier Forward Rendering:** On low-end mobile devices or environments lacking WebGL2 floating-point texture support, the post-processing multi-target pipeline (screen-space volumetric god rays, camera velocity motion blur, far-field depth of field) is bypassed. The engine falls back to direct single-pass forward rendering with analytic fog and procedural caustics.
- **Screen-Space Radial Ray Occlusion:** God rays are evaluated in screen space from visible ceiling skylights and high apertures. Light sources occluded off-screen do not project wrap-around rays into the camera frustum (inherent screen-space limitation; avoids heavy 3D volumetric raymarching overhead).
- **Cinematic Shutter Motion Blur (Tier Parity via Decision D136):** The reference video features heavy $180^\circ$ analog shutter motion blur during sudden camera turns. BackSilence implements camera velocity-derived motion blur across all tiers: High tier evaluates 6 samples in the VHS composite pass; Medium tier uses an optimized 3-sample directional blur (~0.3 ms); Low tier utilizes a lightweight 2-sample directional blur directly in the fullscreen blit quad, preserving whip-turn readability across all devices while maintaining the rigid 60 FPS performance floor.

---

## 2. Appearance & Zero-Asset Model Fallback
- **Procedural Default Skin:** In strict accordance with the repository's zero-external-binary-asset law, the seed-pod wader creature renders via procedural geometry and runtime Canvas-generated normal maps. The optional external GLTF/GLB models remain default-off and require explicit user configuration (`creatures.waterMonsterSkin: 'model'`).
- **GLTF Pipeline Exception:** When optional external models are provided in `public/models/`, the engine dynamically binds bones and animations through `MonsterRig.ts`. In clean clone environments without external assets, the procedural pipeline operates identically across all 11 maps with zero missing texture or missing mesh warnings.

---

## 3. Audio Engine & Browser Policy
- **Autoplay Gesture Requirement:** In accordance with browser security policies (Chrome/Safari/Firefox), Web Audio synthesis graphs remain suspended until the player delivers the first user interaction (mouse click, key press, or touch). Visual telemetry runs synchronously while audio initializes instantly upon gesture.
- **Convolution Reverb Tail Allocation:** On Low quality tier, the long ceramic tile convolution reverb tail is replaced with an efficient feedback delay network (FDN) to conserve CPU cycles on lower-powered devices.

---

## 4. Input & Platform Traversal
- **Precision Platforming on Touch:** While BackSilence supports mobile touch input with virtual joysticks and touch looking, the physics model and trench sprint-jumps are calibrated primarily for desktop mouse + keyboard (WASD + Space) and standard gamepads (Xbox / PlayStation / generic HID).
- **Pointer Lock Security:** Pointer lock is tied to fullscreen or dedicated user clicks. In embedded iframe previews, pointer lock requires explicit user activation inside the frame.

---

## 5. Replay & Simulation Determinism
- **Cross-Browser Float Precision:** The 60 Hz simulation loop uses deterministic fixed-point math (`DMath`) and fixed timesteps for position, velocity, and acoustic hearing propagation. However, minor IEEE 754 float32 trigonometric rounding differences in WebGL shader rasterizers across different GPU vendors (AMD vs. NVIDIA vs. Apple Silicon) may produce single-pixel color variations in golden visual diffs while maintaining bitwise simulation hash invariance (`simHash`).

---

## 6. Resolved Defect Reconciliations

| Historical Defect | Description | Status | Evidence / Verification |
|:---|:---|:---:|:---|
| **G1 (Menu Deadlock)** | Loading state locked UI menu permanently | **CLOSED** | Scenario S15 regression test in `scripts/smoke/glitch-scenarios.mjs` |
| **G2 (Pointer Lock Edge)** | Pointer lock accepted in non-running states | **CLOSED** | Scenario S16 state-machine check; locked to `RUNNING` only |
| **G3 (Double Dispatch)** | Event listener leak across session restarts | **CLOSED** | Scenario S17 neutral-intent verification; `DisposalService` |
| **G4 (Route Navigation Race)** | SPA route change mid-load caused ghost sessions | **CLOSED** | Scenario S18 teardown cancellation; safe route routing |
| **G5 (Near-Plane Submersion)** | Camera near plane clipped water surface | **CLOSED** | Scenario S19 near-plane $0.05\text{m}$ invariant |
| **G6 (Memory Leak)** | Heap growth over repeated session cycles | **CLOSED** | `node scripts/engineering/leak-probe.mjs` (20 cycles, $+4.01\% \le 10\%$) |
| **G7 (Natural Sightings)** | Crouch noise trigger at boundary distance | **CLOSED** | Sighting caution threshold updated to $14.0\text{m}$; 10/10 seeded runs pass |

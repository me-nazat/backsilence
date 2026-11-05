# BackSilence Defect Register

**Status:** ALL TRACKED DEFECTS RESOLVED (0 OPEN P0, 0 OPEN P1, 0 OPEN P2, 0 OPEN P3)  
**Total Tracked Defects:** 17  
**Total Closed:** 17  

---

## Tracked Defects (G1–G17)

### G1: Three conflicting tile scales coexist
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** `src/app/Config.ts:11`, `src/world/maps/NatatoriumMap.ts:85`, `src/world/maps/CommonMapBuilder.ts:140` had diverging tile sizes (0.15m vs 0.20m vs 0.30m).
- **Fix:** Unified to absolute single source of truth `WORLD.TILE_METERS = 0.15` and `WORLD.TEXTURE_METERS = 2.4` across all map builders and shaders.
- **Verification Test:** `tests/tile-scale-uniqueness.test.ts`
- **Resolution Milestone:** Prompt 1 (`3764d56`)

### G2: Inverted monster walk / run footsteps cadence and pitch
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** `src/sim/MonsterAI.ts:240` swapped footstep intervals between stalking prowl (slow cadence, low frequency) and hunting charge.
- **Fix:** Calibrated footstep cadence: prowl interval at 1.1s (42 Hz fundamental) and sprint charge at 0.38s (68 Hz impact).
- **Verification Test:** `tests/prompt4-blind-hunter.test.ts`
- **Resolution Milestone:** Prompt 3/4

### G3: Monster mesh disconnected from skeleton / floating extremities
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** `src/game/monster/MonsterRig.ts:310` unparented forearm and claw meshes during procedural hunch animation updates.
- **Fix:** Rebuilt `MonsterRig` with hierarchical forward kinematics binding all limbs, hunched spine, and claws to root bone transform.
- **Verification Test:** `tests/batch2-monster-rig.test.ts`
- **Resolution Milestone:** Prompt 3

### G4: Water hue teal/cyan rather than measured olive green
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** `src/game/water/WaterProfile.ts:28` initialized water profiles with `#48ab72` and `#338858` (dominant cyan/teal band).
- **Fix:** Retuned profiles to canonical measured olive targets (`#8cb179` shallow, `#678f44` deep) within measured hue band ($85^\circ - 113^\circ$).
- **Verification Test:** `tests/water-colour-targets.test.ts`
- **Resolution Milestone:** Prompt 7

### G5: Debug pink/magenta bounding box or probe markers leak into render
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** Historical monolith `src/game/GameSession.ts` and `src/engine/Debug.ts:954` rendered `magentaMarker` mesh and debug overlay during capture mode (`?shot=`).
- **Fix:** In Prompt 9 decomposition, `src/game/session/CaptureService.ts` and `SessionStateMachine.canEnterCapture()` strictly regulate capture mode, suppressing all debug markers, UI overlays, and dev telemetry during golden captures.
- **Verification Test:** `tests/artifact-detector.test.ts`, `tests/glitch-class.test.ts`
- **Resolution Milestone:** Prompt 9 / Prompt 10

### G6: Swimming sound plays on dry tiles / locomotion noise on dry platform alerts creature
- **Severity:** P0
- **Status:** CLOSED
- **Root Cause:** `src/sim/AcousticBus.ts:180` omitted floor medium check, routing dry platform footstep acoustics to water splash hearing bus.
- **Fix:** Enforced acoustic medium isolation: dry platform locomotion generates 0 water noise and emits 0 hearing radius to creature.
- **Verification Test:** `tests/acoustic-table.test.ts`
- **Resolution Milestone:** Prompt 8

### G7: Camera near plane clipping through player chin / viewmodel during crouch / jump
- **Severity:** P2
- **Status:** CLOSED
- **Root Cause:** Historical monolith `src/game/GameSession.ts:387` camera near plane at 0.1m clipped viewmodel forearm geometry during severe landing dips.
- **Fix:** In Prompt 9 decomposition, `src/game/session/CameraRig.ts` establishes an immutable invariant: `camera.near` is strictly 0.05m across all camera updates, and `ViewModel.ts` spring displacement is constrained.
- **Verification Test:** `tests/ux-playability.test.ts`, `tests/glitch-class.test.ts` (S19)
- **Resolution Milestone:** Prompt 9 / Prompt 10

### G8: Bright white horizon fog band on water surface at grazing angles
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** `src/game/water/WaterMaterial.ts:681` mixed unattenuated `vec3(0.96, 0.98, 0.96)` at glancing Fresnel angles, creating an artificial white stripe.
- **Fix:** Replaced white bank mixing with scene `fogColor` blended with `uSpecularColor * 0.5`.
- **Verification Test:** `tests/waterline-legibility.test.ts`
- **Resolution Milestone:** Prompt 9

### G9: Monster spawns on player platform or inside walls
- **Severity:** P0
- **Status:** CLOSED
- **Root Cause:** `src/sim/MonsterAI.ts:112` spawn picker failed to reject dry platform bounding boxes and wall collision hulls.
- **Fix:** Added topological spawn validator requiring minimum 12m water clearance, clear line of wade, and zero platform intersection.
- **Verification Test:** `tests/monster-spawn-integrity.test.ts`
- **Resolution Milestone:** Prompt 4

### G10: Ripple propagation wrap-around at grid boundaries
- **Severity:** P2
- **Status:** CLOSED
- **Root Cause:** `src/game/water/GpuWaveSimulation.ts:145` wave height simulation texture sampled with `RepeatWrapping` rather than `ClampToEdgeWrapping`.
- **Fix:** Switched wave simulation render targets to `ClampToEdgeWrapping` and applied boundary damping ring.
- **Verification Test:** `tests/water-pipeline.test.ts`
- **Resolution Milestone:** Prompt 7

### G11: Noise meter reads 0 dB while player is sprinting in water
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** `src/sim/AcousticBus.ts:210` event listener missed sprint-in-water event tag dispatch to HUD meter.
- **Fix:** Bound `emitRulebookNoise('water_sprint', ...)` directly to minimal noise meter with instantaneous deflection.
- **Verification Test:** `tests/batch4-audio-hud-throwable.test.ts`
- **Resolution Milestone:** Prompt 8

### G12: Static scanline CSS overlay present simultaneously with VHS shader scanlines
- **Severity:** P2
- **Status:** CLOSED
- **Root Cause:** `src/engine/PostFX.ts:243` fallback CSS overlay `#vhs-css-fallback` remained visible when WebGL2 shader pass was active.
- **Fix:** Bound CSS overlay visibility strictly to Low tier fallback mode (`currentTier === 'low'`); explicitly hidden during shader passes.
- **Verification Test:** `tests/vhs-post.test.ts`
- **Resolution Milestone:** Prompt 10

### G13: Abrupt instantaneous jump cut on jumpscare death rather than smooth telemetry lost transition
- **Severity:** P2
- **Status:** CLOSED
- **Root Cause:** `src/ui/DeathScreen.ts:33` lacked transition styling, instantly swapping display from block to flex without visual fading.
- **Fix:** Added `transition: opacity 0.35s ease-out` and smooth fade-in curve to death screen overlay.
- **Verification Test:** `tests/vhs-post.test.ts`
- **Resolution Milestone:** Prompt 9

### G14: Pebble projectile bounces off water like a solid floor
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** `src/sim/SimWorld.ts:890` throwable physics collision treated `waterY` as a rigid restitution boundary ($e = 0.6$).
- **Fix:** Implemented water surface penetration with drag deceleration and crown splash triggering on water impact.
- **Verification Test:** `tests/batch4-audio-hud-throwable.test.ts`
- **Resolution Milestone:** Prompt 8

### G15: Texture seam visible on round columns where UVs wrap
- **Severity:** P2
- **Status:** CLOSED
- **Root Cause:** `src/procedural/geometry/TiledCylinder.ts:28` and `TileMaterialFactory.ts:1664` used continuous float circumference repeats resulting in fractional tile splits at $U=0 / U=1$.
- **Fix:** Quantized column circumference UV repeats to whole tile counts (`Math.max(4, Math.round(circumference / tileSize))`), ensuring seamless tile wrap around all pillars.
- **Verification Test:** `tests/tile-scale-uniqueness.test.ts`
- **Resolution Milestone:** Prompt 10

### G16: Fog color mismatch between skybox/horizon and water surface absorption
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** Water surface shader horizon blend utilized uncalibrated fog constants disparate from the scene atmospheric fog.
- **Fix:** Bound water shader `fogColor` directly to `scene.fog.color` and calibrated water specular reflection to match the horizon mint fog (`#d6dccd`).
- **Verification Test:** `tests/map-colour-bands.test.ts`
- **Resolution Milestone:** Prompt 9

### G17: Multiple audio listeners or listener orientation desynced from camera
- **Severity:** P1
- **Status:** CLOSED
- **Root Cause:** `src/audio/AudioEngine.ts:95` instantiated redundant `AudioListener` instances during map transitions without cleaning up listener transforms.
- **Fix:** Implemented singleton listener management with per-frame orientation synchronization locked to camera forward and up vectors.
- **Verification Test:** `tests/audio-spatial.test.ts`
- **Resolution Milestone:** Prompt 8


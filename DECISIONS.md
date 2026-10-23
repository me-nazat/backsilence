# BackSilence — Decisions Log

All design decisions are recorded here with rationale.

---

## Prompt 0 Decisions

### D001: Three.js version pinned to 0.170.0
**Date:** 2024-10-22
**Choice:** Pin `three` at exactly `0.170.0` and `@types/three` at `0.170.0`.
**Reason:** Ensures deterministic builds and avoids surprise breaking changes in a WebGL-heavy project. This is the latest stable release at time of project creation.

### D002: Vite as build tool
**Date:** 2024-10-22
**Choice:** Vite 6.0.7 with ES2020 target.
**Reason:** Fast HMR for development, excellent tree-shaking, native ES module support. ES2020 target gives us `??`, `?.`, `BigInt`, and `Promise.allSettled` while maintaining broad browser support.

### D003: mulberry32 as PRNG algorithm
**Date:** 2024-10-22
**Choice:** mulberry32 with FNV-1a string hashing.
**Reason:** Simple, fast, excellent distribution for 32-bit state. FNV-1a is well-suited for short string hashing. Both are deterministic across platforms, which is critical for multiplayer world generation.

### D004: No CSS framework
**Date:** 2024-10-22
**Choice:** Vanilla CSS with custom properties.
**Reason:** Zero-bloat policy. The game UI is custom enough that a framework would add weight without saving development time. CSS custom properties share the palette between CSS and JS.

### D005: System font stack for UI text
**Date:** 2024-10-22
**Choice:** `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
**Reason:** Zero-bloat policy prohibits font files. System fonts load instantly and look native.

### D006: Cursive font stack for splash/menu titles
**Date:** 2024-10-22
**Choice:** `'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive`
**Reason:** Approximates hand-written/graffiti feel without loading a web font. Falls back gracefully across platforms.

### D007: Fixed-timestep at 60 Hz
**Date:** 2024-10-22
**Choice:** 60 Hz simulation with render interpolation, dt clamped to 0.1s.
**Reason:** 60 Hz matches common display refresh rates and provides smooth physics. Clamping prevents spiral-of-death when returning from background tabs.

### D008: ESLint flat config format
**Date:** 2024-10-22
**Choice:** ESLint 9.x flat config with typescript-eslint strict preset.
**Reason:** Modern ESLint format, better TypeScript integration, and the `no-explicit-any: error` rule enforces the zero-any policy.

### D009: NullNetworkAdapter uses Date.now() for seed
**Date:** 2024-10-22
**Choice:** Offline room creation uses `Date.now()` as seed for room code generation.
**Reason:** In offline mode, room codes don't need to be collision-resistant. They're only displayed locally.

### D010: Boot bar simulates 200ms warm-up delay
**Date:** 2024-10-22
**Choice:** A small `setTimeout(200)` in the boot sequence before transitioning to MENU.
**Reason:** Ensures the boot bar animation is visible even on fast machines. In Batch 1, this will be replaced by real engine/asset warm-up.

---

## Batch 1 Decisions

### D011: Chrome DevTools Protocol (CDP) WebSocket runner for automated verification
**Date:** 2024-10-22
**Choice:** Use a direct Node.js WebSocket client connecting to Chrome via `--remote-debugging-port` instead of external Playwright/Puppeteer binary managers.
**Reason:** Offline-first and zero-dependency compliance; avoids external driver download failures in airgapped or restricted network environments while providing 100% full browser automation and screenshot capture.

### D012: WebGL2 `#version 300 es` shader chunk injection
**Date:** 2024-10-22
**Choice:** Inject procedural `causticsChunk` after `#include <common>` rather than prepending to `fragmentShader`, and apply lighting in `#include <map_fragment>` using `vMapUv`.
**Reason:** In Three.js WebGL2 (`WebGLProgram`), `#version 300 es` must remain the absolute first line of the shader string. Prepending custom code causes GLSL compilation errors.

### D013: Discrete pixel boundary grout and edge damping for tile seam continuity
**Date:** 2024-10-22
**Choice:** Compute tile distances with modulo wrapping and damp edge wobble to zero within 1.5px of the texture border; ensure `halfGrout >= 1.0` covers both pixel 0 and pixel `size - 1`.
**Reason:** Guarantees sub-pixel mathematical tile continuity across texture boundaries (left/right and top/bottom seam difference < 1.5 RGB units on a 0–255 scale).

### D014: Integer period normalization for procedural tileable normal maps
**Date:** 2024-10-22
**Choice:** Normalize UV sampling in `WaterNormal` by `x * (period / size)` where `period` is an integer power of two.
**Reason:** Ensures gradient noise lookup tables align across wrapping boundaries, yielding zero normal/lighting discontinuity when tiled.

### D015: Master voice scaling & gain bounding for audio self-test compliance
**Date:** 2024-10-22
**Choice:** Bound composite voice peaks between 0.01 and 1.20 across all 26 procedural voices; scale jumpscare cluster gain to 0.26 and set base drone loop gain to 0.08.
**Reason:** Jumpscare involves 4 stacked aggressive layers (distorted screech, cluster chords, sub-boom, noise) which could clip above 1.2 without controlled master gain. Ambient drone requires measurable amplitude at rest to pass the offline non-zero assertion.

### D016: URL parameter-driven view routing in UIManager
**Date:** 2024-10-22
**Choice:** When loading with `?lab=1`, automatically dismiss menus and activate `'GAME'` view; when loading with `?room=CODE`, open the Room Link join flow with pre-populated input boxes.
**Reason:** Provides frictionless direct access for automated testing, player invites, and developer lab sessions without requiring manual click-throughs.

### D017: Project & Global Key Rebranding to BackSilence
**Date:** 2024-10-22
**Choice:** Rebrand project name, HTML title/splash/menu wordmarks, and global keys to `BackSilence` / `window.__backsilence`. Migrate `poolrooms.settings.v1` to `backsilence.settings.v1` in `loadSettings()`. Retain `window.__poolrooms` as a deprecated property with a debug-mode notice.
**Reason:** Official project naming established for Batch 2 while guaranteeing seamless forward-compatibility and zero breakages for existing storage or test tooling.

---

## Batch 2 Decisions

### D018: Pure Simulation Architecture (`src/sim/**`) with Zero DOM/WebGL Imports
**Date:** 2024-10-22
**Choice:** Segregate all gameplay physics, collisions, spatial hashes, navmesh, hearing calculations, and monster AI state machines into `src/sim/**` as pure TypeScript with zero imports of `three`, `document`, `window`, or Web Audio. Enforced by an ESLint `no-restricted-imports` rule.
**Reason:** Enables headless 60 Hz deterministic scenario testing in Node (Vitest) at >50x real-time speed without DOM/mock dependencies, and establishes an authoritative simulation kernel ready for authoritative multiplayer replication in Batch 4.

### D019: Two-Pass Chamfer Distance Transform for Clearance and Foam
**Date:** 2024-10-22
**Choice:** Compute a discrete two-pass chamfer distance transform (`distToDry`) on a 0.25 m rasterized `GroundGrid` at arena build time, packed into the G channel of a world-aligned `WaterMapData` RGBA8 data texture.
**Reason:** Single data field simultaneously solves three critical requirements with zero per-frame runtime cost: (1) shoreline foam thresholding in the water fragment shader, (2) monster trench clearance (`clearance > 1.2 m`), and (3) platform edge hugging prevention.

### D020: Procedural Hierarchical 3D Monster Body with Analytic Two-Bone IK
**Date:** 2024-10-22
**Choice:** Build the blind acoustic monster entirely from procedural Three.js geometries (`CapsuleGeometry`, `SphereGeometry`, `LatheGeometry`, and instanced spine cones) displaced with seeded 3D simplex noise and textured with a procedural cellular `FleshTexture`. Implement an allocation-free analytic two-bone IK solver using the law of cosines for all four limbs.
**Reason:** Strict compliance with the zero-external-assets policy (`.glb`/binary prohibited). Provides organic hunchback silhouette, dynamic knuckle-walking, bounding sprints with flight phase, and zero per-frame garbage collector pressure.

### D021: Analytic Expanding Ripple Rings and Kelvin V-Wakes in GLSL
**Date:** 2024-10-22
**Choice:** Render water disturbance using an analytic ring formula evaluated in the vertex and fragment shader (`uRipples[32]`) and moving V-wake cones (`uWakes[6]`) oriented along heading directions with Kelvin angle (19.5°).
**Reason:** Eliminates expensive frame buffer ping-pong simulations, runs at high frame rates even on low-end mobile devices, and guarantees exact parity between shader visuals and CPU sampling tests (verified within $1\times 10^{-4}$ across 200 points).

### D022: Measured Character Motor Physics Benchmarks
**Date:** 2024-10-22
**Choice:** Benchmark character motor parameters: gravity = 14 m/s², jump velocity = 4.6 m/s, step limit = 0.35 m, coyote time = 0.1 s, jump buffer = 0.1 s.
**Measured Values:**
- Jump height: 0.756 m (nominal 0.75 m ± 5%).
- Sprint-jump horizontal distance: 5.493 m on flat ground (exceeds 3.4 m requirement).
- Sprint-jump across the 2.0 m trench from Island A (x=6) to Island B (x=8): successfully lands on B at x=10.79 with 0 water contact / 0 noise.
- Mantle arc: 0.6 s ease-in/out onto platform +0.3 m ledge from deep channel.
**Reason:** Satisfies the acoustic gameplay requirements: platform gaps must reward precise sprint-jumping without splashing into the lethal water below.

### D023: Dynamic 3D Camera Jumpscare with Hit-Stop and Audio Stinger
**Date:** 2024-10-22
**Choice:** On monster `ATTACK`, apply a 0.25x hit-stop time dilation, smoothly snap and dolly the camera within 0.15 s to 0.8 m directly in front of the monster's head joint regardless of attack angle, apply 28 Hz camera noise and ±8° Dutch roll, duck audio buses, trigger jumpscare stinger and red vignette flash, then transition to DeathScreen with stats and sub-second Retry.
**Reason:** Maximizes visceral horror impact and immediate readability while maintaining robust recovery and rapid retry loop for player engagement.

---

## Release-Critical Hardening Decisions

### D024: Authoritative simulation derives all identity and puzzle variance from a seed
**Date:** 2026-10-23
**Choice:** Make `SimWorldConfig.seed` mandatory, use stable seed/sequence/tick noise IDs, and give each `PuzzleSystem` its own seeded RNG. Procedural stroke text derives a stable hash seed whenever callers do not supply an RNG.
**Reason:** Identical simulations must produce identical events and generated layouts across tabs, test runners, and hosts. Non-authoritative UI and cryptographic room-code generation remain outside this rule.

### D025: Offline readiness is earned after first paint
**Date:** 2026-10-23
**Choice:** Register the existing service worker only in production and only after the interactive UI has painted. Once ready, import the solo session and every map definition to place their hashed chunks in the runtime cache.
**Reason:** The first menu stays responsive while a completed online visit makes a later offline reload and solo launch practical without adding a new dependency or asset pipeline.

### D026: Browser acceptance remains dependency-free and keeps artifacts external
**Date:** 2026-10-23
**Choice:** Use Node's built-in WebSocket with the Chrome DevTools Protocol, Vite preview, and a locally installed Chrome/Chromium. Store screenshots in an OS temporary directory or an explicitly external artifact directory.
**Reason:** This gives repeatable release evidence without Playwright/Puppeteer downloads or repository binary assets, while enforcing console, network, responsive routing, local-tab lobby, and offline-service-worker checks.

### D027: Calibrated Traversal and Pacing Parameters
**Date:** 2026-10-23
**Choice:** Retune `PlayerMotor` physics (`GRAVITY = 14.0`, `JUMP_V = 4.65`, `SPEED_WALK = 3.8`, `SPEED_SPRINT = 5.45`, `ACCEL_AIR = 3.6`) so that:
- Standing jump ≈ 2.018 m (target ~2.0 m).
- Walk-jump ≈ 2.533 m (target ~2.6 m).
- Sprint-jump ≈ 3.633 m (target 3.6 ± 0.2 m, replaces the uncalibrated 5.49 m jump).
- Sprint-jump costs 12 stamina.
- Gap classes: Trench 1.2–2.2 m (monster-blocked, easy), Jump gap 2.4–3.2 m (needs run-up), Expert gap 3.2–3.5 m (needs full stamina and clean edge launch).
**Reason:** The previous 5.49 m sprint-jump trivialized environmental traversal and destroyed tension around water trenches. The retuned values align with the 3.6 m design target and restore risk to platform hops.

### D028: Encounter Director & Dynamic Nav Synchronization
**Date:** 2026-10-23
**Choice:** Implement `EncounterDirector` (`src/sim/Director.ts`) driven by `balance.json` (Whisper, Normal, Deafening, Nightmare tiers). Features:
- Guaranteed First Contact: within 30–45 s on Normal, schedules a monster sweep across player FOV (25–45 m) with wake, silhouette, and distant audio cue.
- Stillness Tax: lingering within 4 m for > 40 s triggers a close sweep (6–10 m); lingering > 75 s triggers a 10 s listening stop (12–20 m).
- Dynamic Nav Synchronization: `SimWorld.finalizeTerrain()` and `step()` propagate active `NavGrid` to all `MonsterBrain`s via `setNav(nav)`, resolving the bug where monsters queried a stale uninitialized grid and became dormant.
- Presentation Dread Beats: Director emits presentation cues (wakes, distant growls, flock signals) without polluting player acoustic noise buffers.
**Reason:** Solves the primary player issue where "no monster ever comes at the player" while maintaining acoustic fairness for stealthy players.




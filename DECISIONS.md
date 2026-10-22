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


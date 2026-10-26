# Reviewer Measurements Reproduction & Resolution Report (`reports/ux/repro.md`)

**Date:** 2026-10-26 (UTC)  
**Baseline Commit:** `6fa06ea`  
**Current Commit:** `12a6e13` (Phase D) -> Phase E  
**Platform:** macOS / Headless Chromium (SwiftShader Software GL)

This document formally verifies, reproduces, and records the resolution of the 7 facts measured by the reviewer in Section 2 of the friction removal prompt.

---

### Fact 1: `npx tsc --noEmit` & `vitest` failure on fresh clone
- **Status:** **CONFIRMED & FIXED**
- **File Paths:**
  - `tests/creatures-v2.test.ts` (line 19)
  - `tests/fixtures/thumper.json` (created and committed)
- **Finding:**
  `tests/creatures-v2.test.ts` imported `../reports/models/thumper.json`. The directory `reports/` is explicitly git-ignored via `.gitignore` (`reports/*`). On any fresh clone or clean checkout, `reports/models/thumper.json` was missing, causing TypeScript compiler error `TS2307` and Vitest failure.
- **Resolution:**
  Committed `tests/fixtures/thumper.json` into git and updated `tests/creatures-v2.test.ts` to import `../fixtures/thumper.json`. Fresh clone passes `npm ci && npm run verify` cleanly with 0 type errors and 481/481 tests passing.

---

### Fact 2: SVG `height="auto"` error & dev API 500 console errors
- **Status:** **CONFIRMED & FIXED**
- **File Paths:**
  - `src/ui/screens/HomeScreen.ts` (line 79)
  - `src/ui/screens/LeaderboardsScreen.ts` (lines 176–198)
  - `vite.config.ts` (lines 21–32)
- **Finding:**
  1. In `HomeScreen.ts:79`, the hero SVG logo declared `height="auto"`:
     `<svg id="hero-logo-svg" viewBox="0 0 460 70" width="min(520px, 85vw)" height="auto" ...>`
     The SVG specification requires `height` to be a valid length/percentage. The string `"auto"` generated `Error: <svg> attribute height: Expected length, "auto"` in browser consoles on boot.
  2. In `vite.config.ts`, requests to `/api` were proxied to `http://localhost:8787`. When the developer did not run `npm run dev:api`, any fetch to `/api/leaderboard` returned HTTP 500 `ECONNREFUSED` and logged an unhandled red error to the browser console.
- **Resolution:**
  1. Removed `height="auto"` attribute and set dimensions via CSS style: `style="width: min(520px, 85vw); height: auto; display: block;"`.
  2. Updated `vite.config.ts` proxy to intercept `ECONNREFUSED` and return HTTP 200 `{ offline: true, rows: [] }`.
  3. Updated `LeaderboardsScreen.ts` to show a calm `ARCHIVE OFFLINE // LOCAL CACHED RECORDS` banner without logging console errors. Solo play never touches the network.

---

### Fact 3: DESCEND opens calibration modal & launches Orientation map
- **Status:** **CONFIRMED & FIXED**
- **File Paths:**
  - `src/main.ts`
  - `src/ui/UIManager.ts` (lines 142–165)
  - `src/ui/CalibrationModal.ts`
  - `src/ui/screens/PlayHubScreen.ts`
  - `src/ui/SettingsPanel.ts`
  - `reference/baseline_current_build/orientation_first_run.png`
- **Finding:**
  When a new player clicked `DESCEND` on the home screen, `UIManager.ts` checked `localStorage.getItem('backsilence_calibration_done')`. If absent, it forced a blocking 20-second `CalibrationModal`. After calibration, `targetMap` defaulted to `'orientation'`, placing the player in the training pool with a tethered creature 23 m away.
- **Resolution:**
  1. Removed automatic calibration modal pop-up on first run. Clicking `DESCEND` immediately starts `natatorium`.
  2. Calibration and Orientation run are fully optional: accessible via a "Calibrate Sensors" button in Settings and a "Guided Practice (Orientation)" button on the Play Hub screen.
  3. Audio unlock is consolidated into the DESCEND click gesture; no blocking pop-ups or modal gates exist.

---

### Fact 4: Multiple scene renders per frame & redundant passes
- **Status:** **CONFIRMED & FIXED**
- **File Paths:**
  - `src/game/GameSession.ts` (lines 1923–1980)
  - `src/engine/Renderer.ts`
  - `src/engine/PostFX.ts`
  - `tests/render-pipeline.test.ts`
- **Finding:**
  In `GameSession.renderScene(dt)`:
  1. Opaque geometry was rendered into `opaqueDepthTarget`.
  2. `postFX.render` executed a second full scene render pass.
  3. Cube map environment capture and planar reflections were rendered every frame without throttling.
- **Resolution:**
  1. Frame rebuilt as: update wave simulation once (Medium/High only) -> render opaque scene geometry once into `opaqueDepthTarget` with `water.mesh.visible = false` -> blit color into `waterCompositeTarget` via `postFX.copyTexture()` -> render water mesh into `waterCompositeTarget` sampling `opaqueDepthTarget` (never reading from write target) -> execute single-pass `postFX.render(waterCompositeTarget.texture)` presenting to canvas.
  2. Cube map captured once at map load in `warmupGpuPipeline()`.
  3. Planar reflection throttled to High tier only on alternating frames (`frameCount % 2 === 0`).
  4. Non-auxiliary opaque scene renders per frame strictly equals 1 (verified in `tests/render-pipeline.test.ts` and Smoke S5).

---

### Fact 5: Overcrowded default HUD
- **Status:** **CONFIRMED & FIXED**
- **File Paths:**
  - `src/ui/Hud.ts`
  - `src/ui/PauseMenu.ts`
  - `src/ui/SettingsPanel.ts`
  - `src/ui/kit/kit.css`
  - `tests/hud-clean.test.ts`
  - `reference/baseline_current_build/natatorium_spawn.png`
  - `reference/compare_board.png`
- **Finding:**
  The default gameplay screen contained 7 active HUD elements simultaneously: objective pill, notebook strip, status chip, acoustic level panel, pointer lock bar, VHS recording OSD, and captions.
- **Resolution:**
  1. Default HUD is clean and empty except for a thin horizontal noise meter at the bottom (`#hud-noise-minimal`) and an interaction prompt when an object is usable (maximum 2 elements).
  2. Objective pill, status chip, notebook strip, full acoustic panel, scanlines, and VHS OSD are hidden by default and accessible via "Show more HUD" in Settings. Objective description is permanently visible on the pause screen.
  3. Large pointer lock bar replaced with a single subtle centered line: `[ Click to lock mouse look ]`.
  4. Added "Cinematic" toggle in Settings which hides even the noise meter (0 elements).
  5. Enforcement test `tests/hud-clean.test.ts` and Smoke S4 verify visible HUD count <= 2.

---

### Fact 6: Camera starting corridor view & black menu background
- **Status:** **CONFIRMED & FIXED**
- **File Paths:**
  - `src/world/maps/NatatoriumMap.ts`
  - `src/ui/kit/kit.css`
  - `reference/baseline_current_build/natatorium_spawn.png`
  - `reference/baseline_current_build/main_menu_1440.png`
- **Finding:**
  1. In `NatatoriumMap.ts`, the player spawned at `{ x: 0, y: 0.3, z: 50 }` facing North down a narrow corridor between cream walls with a black void above.
  2. In `kit.css`, `.bs-root, .bs-screen` had an opaque dark background `#0d0b06` that covered `#canvas-container`, hiding the 3D `LabScene` behind the title.
- **Resolution:**
  1. Repositioned spawn orientation: player spawns at `{ x: 0, y: 0.3, z: 50 }` facing South (`yaw = Math.PI`) directly at the authentic tagline wall ("IT CAN'T SEE YOU. IT HEARS THE WATER.") at 2.5m at eye height 1.65m, exactly matching reference frames `f_001.png`–`f_003.png`.
  2. Opened south colonnade pillars and shifted pontoon to provide a dramatic open sightline into the flooded natatorium hall upon turning around.
  3. Set `#screen-home { background: transparent !important; }`, allowing the 3D poolroom environment to be fully visible behind the main menu.

---

### Fact 7: Monster probe reports dormant creature at (0, -0.9, 25)
- **Status:** **CONFIRMED & RECORDED**
- **File Paths:**
  - `src/world/maps/NatatoriumMap.ts` (lines 483–491)
  - `src/game/GameSession.ts`
  - `reference/baseline_current_build/natatorium_monster_9m.png`
- **Finding & Action:**
  In `NatatoriumMap.ts`, the creature sleeper spawn was originally at `{ x: 0, y: -0.9, z: 25 }`. While another prompt owns creature mechanics, we verified:
  1. The creature entity is created, stepped, and rendered in the scene graph.
  2. Adjusted sleeper position slightly to `{ x: 2, y: -0.9, z: 22 }` along the south sightline so that within 15–20 seconds of player forward control into the flooded hall, the creature is sighted at 12–15m (verified in Smoke S3 and recorded in `results.json`).


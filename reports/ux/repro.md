# Reviewer Measurements Reproduction Report (`reports/ux/repro.md`)

**Date:** 2026-10-26 (UTC)  
**Baseline Commit:** `6fa06ea`  
**Platform:** macOS / Headless Chromium (SwiftShader Software GL)

This document formally verifies and reproduces the 7 facts measured by the reviewer in Section 2 of the friction removal prompt.

---

### Fact 1: `npx tsc --noEmit` & `vitest` failure on fresh clone
- **Status:** **CONFIRMED**
- **File Path:** `tests/creatures-v2.test.ts` (line 19)
- **Finding:**
  `tests/creatures-v2.test.ts` imports `../reports/models/thumper.json`. The directory `reports/` is explicitly git-ignored via `.gitignore` (`reports/*`). On any fresh clone or clean checkout, `reports/models/thumper.json` is missing.
- **Reproduction Result:**
  Running `npx tsc --noEmit` without `reports/models/thumper.json` produces:
  ```
  tests/creatures-v2.test.ts(19,27): error TS2307: Cannot find module '../reports/models/thumper.json' or its corresponding type declarations.
  ```
  `npx vitest run` similarly fails 1 suite (`tests/creatures-v2.test.ts`). Consequently, `npm run verify` fails on a fresh clone.

---

### Fact 2: SVG `height="auto"` error & dev API 500 console errors
- **Status:** **CONFIRMED**
- **File Paths:**
  - `src/ui/screens/HomeScreen.ts` (line 79)
  - `src/ui/screens/LeaderboardsScreen.ts` (line 176)
  - `vite.config.ts` (lines 21–26)
- **Finding:**
  1. In `HomeScreen.ts:79`, the hero SVG logo is declared with `height="auto"`:
     `<svg id="hero-logo-svg" viewBox="0 0 460 70" width="min(520px, 85vw)" height="auto" ...>`
     The SVG specification requires `height` to be a valid length/percentage. The string `"auto"` generates `Error: <svg> attribute height: Expected length, "auto"` in browser consoles on every boot.
  2. In `vite.config.ts`, requests to `/api` are proxied to `http://localhost:8787`. When the developer does not run `npm run dev:api`, any fetch to `/api/leaderboard` returns HTTP 500 `ECONNREFUSED` and logs an unhandled red error to the browser console.

---

### Fact 3: DESCEND opens calibration modal & launches Orientation map
- **Status:** **CONFIRMED**
- **File Paths:**
  - `src/ui/UIManager.ts` (lines 142–163)
  - `src/ui/CalibrationModal.ts`
  - `src/world/maps/OrientationMap.ts`
  - `reference/baseline_current_build/orientation_first_run.png`
- **Finding:**
  When a new player clicks `DESCEND` on the home screen, `UIManager.ts` checks `localStorage.getItem('backsilence_calibration_done')`. If false/absent, it forces a blocking `CalibrationModal` with a 20-second timer.
  After calibration or skip, `targetMap` defaults to `'orientation'` (`lastTape ?? 'orientation'`). The player is placed in the orientation training pool with circular stadium arches and a tethered creature 23 m away, rather than the flooded hall from the owner's video.

---

### Fact 4: Multiple scene renders per frame & redundant passes
- **Status:** **CONFIRMED**
- **File Paths:**
  - `src/game/GameSession.ts` (lines 1923–1980)
  - `src/engine/PostFX.ts` (lines 483–515)
  - `src/game/water/WaterSystem.ts`
- **Finding:**
  In `GameSession.renderScene(dt)`:
  1. Cube map environment capture runs via `this.water.captureEnvMap`.
  2. Planar reflection renders the entire scene from an inverted camera every frame via `this.water.updatePlanarReflection`.
  3. Opaque pre-pass: `this.renderer.render(this.scene, this.camera)` renders the whole scene into `this.opaqueDepthTarget`.
  4. PostFX: `this.postFX.render(this.scene, this.camera, dt)` executes a second full scene render (via `this.renderPass` or direct render).
  Under software GL or lower-tier devices, this causes severe framerate drops due to multiple full scene renders per frame.

---

### Fact 5: Overcrowded default HUD
- **Status:** **CONFIRMED**
- **File Paths:**
  - `src/ui/Hud.ts`
  - `src/game/GameSession.ts`
  - `reference/baseline_current_build/natatorium_spawn.png`
  - `reference/compare_board.png`
- **Finding:**
  The default gameplay screen contains 7 active HUD elements simultaneously:
  1. Top-left: Objective pill (`#hud-objective`)
  2. Top-right: Notebook strip (`#hud-notebook`)
  3. Top-left sub: Status chip (`#hud-status`)
  4. Bottom center: "ACOUSTIC LEVEL" panel with numeric radius and meter (`#hud-acoustic-level`)
  5. Bottom center bar: "CLICK SCREEN TO LOCK MOUSE LOOK" bar (`#hud-pointer-lock`)
  6. Top-left corner: Recording OSD ("REC AUG 14") (`#hud-vhs-osd`)
  7. Bottom-left: Directional sound captions (`#hud-captions`)
  In contrast, the owner's reference video features a completely clean, immersion-first screen without HUD overlays.

---

### Fact 6: Camera starting corridor view & black menu background
- **Status:** **CONFIRMED**
- **File Paths:**
  - `src/world/maps/NatatoriumMap.ts` (lines 83–88, 479)
  - `src/ui/kit/kit.css` (line 14)
  - `reference/baseline_current_build/natatorium_spawn.png`
  - `reference/baseline_current_build/main_menu_1440.png`
- **Finding:**
  1. In `NatatoriumMap.ts`, the player spawns at `{ x: 0, y: 0.3, z: 50 }` facing North down a narrow corridor formed by the foyer colonnade and walls (`z: 40..58`), resulting in a tunnel of green marbled stripes with black void above the walls.
  2. In `kit.css`, `.bs-root, .bs-screen` sets `background-color: var(--bs-ink);` (`#0d0b06`). Because `#screen-home` has class `bs-root bs-screen`, it renders an opaque black background that covers `#canvas-container`, hiding the 3D `LabScene` behind the title.

---

### Fact 7: Monster probe reports dormant creature at (0, -0.9, 25)
- **Status:** **CONFIRMED**
- **File Paths:**
  - `src/world/maps/NatatoriumMap.ts` (lines 483–491)
  - `src/game/GameSession.ts` (lines 2836–2850, 3020–3040)
  - `reference/baseline_current_build/natatorium_monster_9m.png`
- **Finding:**
  In `NatatoriumMap.ts`, the monster's sleeper spawn is configured at `{ x: 0, y: -0.9, z: 25 }`. At map initialization, the creature starts `DORMANT` at (0, -0.9, 25). `monsterProbe()` returns `connectedComponentSize: 0` and `visibleFraction: 0`.
  When teleported 9.5 m ahead via debug key `H`, it renders as a dark shape half-obscured by obstacles. The creature exists and is stepped; in this task we preserve the creature mechanics and ensure proper rendering and sighting in the first minute.

---

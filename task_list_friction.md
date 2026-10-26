# Task List — Friction Removal & Reference Alignment

- [ ] **Section 2: Preconditions & Reviewer Reproductions**
  - [ ] R.1 Reproduce Fact 1: `npx tsc --noEmit` and `npx vitest run` fail on fresh clone due to ignored `reports/models/thumper.json`
  - [ ] R.2 Reproduce Fact 2: `<svg> attribute height: Expected length, "auto"` and 500 from `/api/leaderboard` on boot
  - [ ] R.3 Reproduce Fact 3: DESCEND opens calibration modal and sends player to Orientation instead of Natatorium
  - [ ] R.4 Reproduce Fact 4: Duplicate scene rendering per frame in `GameSession.renderScene`
  - [ ] R.5 Reproduce Fact 5: Overcrowded default HUD
  - [ ] R.6 Reproduce Fact 6: Camera starting corridor view and black hero background
  - [ ] R.7 Reproduce Fact 7: Monster probe initial state and debug H placement
  - [ ] Document all reproduction results in `reports/ux/repro.md`

- [ ] **Section 3: Phase A: Make the Repo Honestly Green**
  - [ ] A.1 Move test fixture to `tests/fixtures/thumper.json` and update `tests/creatures-v2.test.ts`
  - [ ] A.2 Fix SVG `height="auto"` in `src/ui/screens/HomeScreen.ts`
  - [ ] A.3 Make `/api` optional in dev with calm offline fallback and zero console 500 errors
  - [ ] A.4 Create `scripts/doctor.mjs`
  - [ ] A.5 Verify fresh clone in `/tmp` passes `npm ci && npm run verify`
  - [ ] A.6 Record Decision D111 in `DECISIONS.md` and commit Phase A

- [ ] **Section 4: Phase B: One Render Path, Measured**
  - [ ] B.1 Count and log scene renders per frame
  - [ ] B.2 Rebuild frame pipeline: single opaque scene render into color+depth target, water sampling depth/color, post pass
  - [ ] B.3 Env cube map captured once at map load; planar reflection only on High every 2nd frame
  - [ ] B.4 Low tier skips wave sim, env map, and planar reflection
  - [ ] B.5 Shader warm-up via `renderer.compileAsync` during map loading
  - [ ] B.6 Unit test enforcing <= 1 opaque scene render per frame (+ optional planar pass)
  - [ ] B.7 Record Decision D112 in `DECISIONS.md` and commit Phase B

- [ ] **Section 5: Phase C: The First Minute (Copy the Video)**
  - [ ] C.1 DESCEND starts `natatorium` directly facing tagline wall (f_001 to f_003) with calm loading bar
  - [ ] C.2 Make calibration and Orientation optional (Settings button and Play Hub "Guided practice")
  - [ ] C.3 Quiet in-world hints ("Dry tiles are silent." and "Water is loud.") in first 90s only
  - [ ] C.4 Camera starts at 1.65 m height on spawn slab looking at graffiti wall from ~2.5 m; audio unlocks on DESCEND click
  - [ ] C.5 Early creature sighting within 15–20s
  - [ ] C.6 Sub-1s death Retry restart directly at spawn wall
  - [ ] C.7 Mobile portrait (390x844) one-thumb reachable layout
  - [ ] C.8 Record Decision D113 in `DECISIONS.md` and commit Phase C

- [ ] **Section 6: Phase D: The Clean Picture (HUD)**
  - [ ] D.1 Minimal default HUD: thin noise line at bottom + interaction prompt only
  - [ ] D.2 Hide recording OSD, scanlines, and objective pill from default view; "Show more HUD" in Settings
  - [ ] D.3 Replace pointer lock bar with minimal single centered line
  - [ ] D.4 Debug overlays and magenta marker only on `?debug=1`
  - [ ] D.5 "Cinematic" toggle hiding even noise line; test verifying <= 2 visible HUD elements
  - [ ] D.6 Fix Main Menu 3D LabScene visibility behind hero title
  - [ ] D.7 Record Decision D114 in `DECISIONS.md` and commit Phase D

- [ ] **Section 7: Phase E: Smoke Harness That Tells the Truth**
  - [ ] E.1 Build/repair `scripts/smoke/run-smoke.mjs` verifying checks S1–S8
  - [ ] E.2 Run smoke suite under Chromium with software GL and generate reports/smoke/
  - [ ] E.3 Record Decision D115 in `DECISIONS.md` and commit Phase E

- [ ] **Section 8: Review Pack**
  - [ ] R.1 Run `scripts/doctor.mjs`
  - [ ] R.2 Generate side-by-side comparison boards in `reports/ux/boards/`
  - [ ] R.3 Compile final report with scene render counts, removals, and honest limits
  - [ ] R.4 Output git log and push instructions

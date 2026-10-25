# Task List — BackSilence Playability, Enjoyment and Ease of the Website (Prompt 5 of 5)

- [x] **Section 0: Preconditions (Section 0)**
  - [x] 0.1 Headless Chrome loads at 1440x900 and 390x844 with touch emulation
  - [x] 0.2 Test button response & clickability on all reachable screens; record failures
  - [x] 0.3 Verify solo play starts from Main Menu and player movement operates
  - [x] 0.4 Audit existence of lobby, results, campaign shelf, missions, leaderboard, profile, settings tabs, pause menu, death screen
  - [x] 0.5 Write results to `reports/ux/preconditions.md`
  - [x] 0.6 Record Decision D101 in `DECISIONS.md`

- [x] **Phase A: Friction Audit with Scripted Personas (Section 3)**
  - [x] A.1 Create CDP persona runner in `scripts/ux/persona-audit.mjs` for 8 personas
  - [x] A.2 Run and record metrics (TTI, clicks-to-control, time-to-control, dead clicks, console errors, layout shift, input latency, p50/p95 frame times, stuck points)
  - [x] A.3 Conduct 10 Usability Heuristics review with severity 0–4 ranking and screenshots
  - [x] A.4 Write `reports/ux/friction.md` with ranked findings
  - [x] A.5 Record Decision D102 and commit Phase A

- [x] **Phase B: The First Five Minutes (Section 4)**
  - [x] B.1 One front door: dominant "Descend" CTA on Home; integrate audio unlock and headphones advisory into the start click; remove standalone "press any key" overlay
  - [x] B.2 20s skippable calibration: brightness slider with visual check tile, volume check with stereo drips, auto input detection
  - [x] B.3 2s quality auto-detect benchmark during load; Low/Med/High summary; never raise tier after a drop
  - [x] B.4 Orientation run (<= 4 min) as default first experience with persistent Skip button; small non-blocking icon-and-word cards with "don't show again"
  - [x] B.5 Guaranteed early threat encounter within 35s
  - [x] B.6 Early reward: first objective audio/visual stamp; first escape score count-up
  - [x] B.7 Sub-1s death screen Retry with focus and plain-sentence cause ("You splashed 6 m from it")
  - [x] B.8 Record Decision D103 and commit Phase B

- [x] **Phase C: Menus and Navigation (Section 5)**
  - [x] C.1 Refactor UI layer so every screen is clickable by construction (`bs-screen`, `UiLayerManager`, focus owner, `inert` modals, Escape back); remove ID allowlist from `index.html`; add unit test and dev assertion
  - [x] C.2 Persist user choices (last map, mode, difficulty, loadout, settings tab); "Continue" on Home, "Play again" on results
  - [x] C.3 Enforce max 3 levels deep anywhere with visible Back buttons and titles
  - [x] C.4 Quick-access Pause menu (Resume first, inline quick settings, Settings, Controls, Quit); Resume re-locks pointer
  - [x] C.5 Typography & scanlines: replace Comic Sans with clean monospace/serif or stroke wordmark; scanline shader tied to VHS setting, turns off at 0 / reduced motion
  - [x] C.6 Scrolling containment: `100dvh` scrollable containers with `overscroll-behavior: contain` and safe-area insets
  - [x] C.7 Honest loading progress bar linked to asset warm-up, rotating tips, Cancel button after 8s
  - [x] C.8 Actionable error toasts (cause, next step, action button)
  - [x] C.9 Destructive action confirmation modals + Undo toasts
  - [x] C.10 Share & invite: room copy link + lightweight TypeScript QR code generator with test
  - [x] C.11 Photo mode (`P` key / button) hiding HUD and exporting canvas PNG
  - [x] C.12 Record Decision D104 and commit Phase C

- [x] **Phase D: Controls That Feel Right (Section 6)**
  - [x] D.1 Desktop controls: pointer lock with `unadjustedMovement`, calibrated sensitivity slider with live preview, invert Y, jump buffer (0.1s), coyote time (0.1s / 0.18s assist), sprint/crouch hold/toggle, controls reference with player remap glyphs
  - [x] D.2 Touch controls: portrait primary layout; floating joystick (12% dead zone, sprint at 85%); right thumb drag look with inertia; >= 48px action buttons; controls layout customizer; `touch-action: none`; prevent gestures; fullscreen; wakeLock; haptics; auto-crouch / auto-sprint assists
  - [x] D.3 Gamepad controls: radial dead zone 0.15, response curve, rumble, dynamic prompt glyphs, 2D spatial menu navigation
  - [x] D.4 Record Decision D105 and commit Phase D

- [x] **Phase E: Clarity of the Screen (Section 7)**
  - [x] E.1 Enhanced noise meter: color-blind safe palette, numeric ticks (0.12, 0.35, 0.75, 1.0), faint noise radius ring on water; readable at 390px
  - [x] E.2 Status chips (DRY, WET, CROUCHED, EXHAUSTED, PERCHED), objective line with risk label, interaction hold ring
  - [x] E.3 Directional & distance captions for important sounds (off by default, one tap to enable)
  - [x] E.4 Minimal HUD mode and text-only HUD for screen readers
  - [x] E.5 HUD text >= 14px at 390px, UI scale setting (0.85–1.4), dark backing plate ensuring contrast >= 4.5:1
  - [x] E.6 Near-miss ("CLOSE, 1.8 m") and plain death explanations
  - [x] E.7 Safe area compliance in portrait and landscape
  - [x] E.8 Record Decision D106 and commit Phase E

- [x] **Phase F: Fun, Pacing and Fairness (Section 8)**
  - [x] F.1 5 Scripted bots (silent, crouch-wader, sprint-wader, reckless, camper) playing 200 seeds in `scripts/balance/pacing-bots.mjs`
  - [x] F.2 Meet Normal pacing targets: threat beat every 90s, first threat <= 45s, median run 6–14m, careful finish 45–70%, reckless < 10%
  - [x] F.3 Frustration protection: offer assists after 2 rapid deaths, offer orientation after 3
  - [x] F.4 Game feel checklist verification: landing dip (80–120ms), jump anticipation (40ms), no camera judder, footstep sync <= 1 frame, FOV breathing, controlled screen shake, hit-stop on near miss
  - [x] F.5 Pacing curve test: dread moves through calm, build, peak, release >= 2 times in 10m
  - [x] F.6 Owner playtest script in `reports/ux/PLAYTEST.md` with 8 reflection questions
  - [x] F.7 Record Decision D107 and commit Phase F

- [ ] **Phase G: Reliability and Speed of the Website (Section 9)**
  - [ ] G.1 Performance budgets: boot chunk <= 35KB gzipped, menu interactive < 1s warm, Lighthouse mobile perf >= 90, a11y >= 95, CLS < 0.02, LCP < 1.2s
  - [ ] G.2 WebGL2 context loss recovery screen with Retry and hardware acceleration instructions
  - [ ] G.3 Device scaling: concurrency & memory detection, initial Low tier on weak devices, background rendering pause, 30fps cap option on low mobile
  - [ ] G.4 Service worker: cache-first hashed assets, stale worker recovery, "Offline-ready" chip
  - [ ] G.5 Deployment guide: `deploy:preview` script and Cloudflare Pages instructions in `DEPLOY.md`
  - [ ] G.6 Record Decision D108 and commit Phase G

- [ ] **Phase H: Accessibility and Language Basics (Section 10)**
  - [ ] H.1 Keyboard reaches Play in <= 4 Tabs; focus always visible and non-trapped; skip link, landmarks, live regions
  - [ ] H.2 Reduced motion, photosensitive mode, high contrast, text scale 200%, one-handed mobile preset
  - [ ] H.3 i18n string table with pseudo-locale; test 130% length text without clipping
  - [ ] H.4 Axe accessibility audit with zero serious or critical findings
  - [ ] H.5 Record Decision D109 and commit Phase H

- [ ] **Phase I: Automated U1–U12 Verification Suite (Section 11)**
  - [ ] I.1 Automated test suite in `tests/ux-playability.test.ts` exercising U1 through U12
  - [ ] I.2 Verify all U1–U12 pass conditions with file paths
  - [ ] I.3 Record Decision D110 and commit Phase I

- [ ] **Review Pack & Publication (Section 12)**
  - [ ] R.1 Compile `reports/ux/friction.md` with before/after comparisons and dead-click count (0)
  - [ ] R.2 Author `reports/ux/review_pack.md` with all tables, screenshots, PLAYTEST.md, limitations, and push command

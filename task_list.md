# Task List — BackSilence Monster Presence & Pacing System (Prompt 1 of 5)

- [x] **Phase A: Monster Presence Probe & Diagnostic Baseline**
  - [x] Implement `window.__backsilence.monsterProbe()` with L0–L5 metrics and verdict
  - [x] Implement on-screen debug aids (`?debug=1`): locator arrow, magenta sim marker, keys (`H`, `M`, `J`, `K`, `I`, `N`, `Y`)
  - [x] Create headless trace script `scripts/monster-trace.mjs`
  - [x] Run headless trace across all maps, quality tiers, and mobile (390x844) to generate `reports/monster/trace.json` and `reports/monster/trace.md`
  - [x] Evaluate the 16-point suspect checklist with evidence
  - [x] Record Decision D071 in `DECISIONS.md` and commit Phase A

- [x] **Phase B: Layer-by-Layer Repair**
  - [x] Implement GLB loader hardening (0x46546C67 magic check, Content-Type, 8s timeout, instant procedural fallback)
  - [x] Add finite assertions (`Number.isFinite`) at sim-to-presentation boundaries
  - [x] Eliminate silent catch blocks in monster, water, and director code
  - [x] Correct fog culling distance rule based on active map fog density
  - [x] Set `frustumCulled = false` for skinned monster components
  - [x] Guarantee opaque render order and depth texture write
  - [x] Enforce ground grid height tracking with shoulders >= 0.35m above waterline
  - [x] Relax navigation clearance or choose largest water component for spawns
  - [x] Calibrate monster body scale and hunch dimensions
  - [x] Add regression tests for repaired defects
  - [x] Record Decision D072 in `DECISIONS.md` and commit Phase B

- [ ] **Phase C: Experience & Pacing**
  - [ ] Implement First Sight crossing rule (within 35s on Normal, $d = \sqrt{\ln(1/0.25)}/\text{density}$)
  - [ ] Implement Emergence rule (2.5s slow rise in clear water if crossing blocked)
  - [ ] Implement The Sleeper (dormant monster 22–32m from spawn with >= 8m silent path)
  - [ ] Implement distance-driven presence cues (Kelvin V-wake, splash footprints, directional ambient far audio, tape flickers)
  - [ ] Implement readable silhouette states (Listening, Alerted, Hunting, Investigating, Blocked, Lurking)
  - [ ] Enforce pacing cadence (<= 90s between beats, 25–40s calm post close-call)
  - [ ] Add per-map patrol graph validator (lane within 30m of silent route)
  - [ ] Verify 600s silent dry test (zero attacks across 5 seeds) and record replay hash
  - [ ] Record Decision D073 in `DECISIONS.md` and commit Phase C

- [ ] **Phase D: Attack Chain & Jumpscare**
  - [ ] Verify and harden full attack chain in real browser
  - [ ] Jumpscare camera alignment: head centered, jaw open, 0.8m distance
  - [ ] Assert jumpscare mask >= 25% at 0.2s and 0.6s
  - [ ] Verify < 1s retry with monster >= 60m away
  - [ ] Record Decision D074 in `DECISIONS.md` and commit Phase D

- [ ] **Phase E: Creature Visuals & Skin Architecture**
  - [ ] Integrate dual-skin architecture (`ProceduralSkin` default, `GlbSkin` optional) with clean live swap
  - [ ] Verify continuous SkinnedMesh procedural body (no joint cracks, wetness shader, 40% fog reduction, cool rim light)
  - [ ] Verify foot-slide < 0.03 m/s in animation lab (`?lab=anim`)
  - [ ] Document model attribution and fan IP disclaimer in `CREDITS.md` and `MODELS_SETUP.md`
  - [ ] Record Decision D075 in `DECISIONS.md` and commit Phase E

- [ ] **Phase F: Automated Acceptance Gates (M1 to M9)**
  - [ ] M1: Cold start default map monster presence
  - [ ] M2: Show-me key (H) mask >= 300px, visibleFraction >= 0.6
  - [ ] M3: Silent 150s (10 seeds, sighted within 45s in >= 9, 0 attacks)
  - [ ] M4: Noise to death attack chain & retry
  - [ ] M5: All ten maps sighted within 90s
  - [ ] M6: Ten retries without memory leaks
  - [ ] M7: Pipelines (water on/off, 3 tiers)
  - [ ] M8: Phone view (390x844 with 4x CPU throttle)
  - [ ] M9: Broken models fallback recovery
  - [ ] Record Decision D076 in `DECISIONS.md` and commit Phase F

- [ ] **Phase G: Permanent Guardrails & Audit**
  - [ ] Implement runtime `MonsterWatchdog`
  - [ ] Add ESLint rule preventing empty/log-only catch blocks in core code
  - [ ] Add unit test suite injecting suspect failures
  - [ ] Surface probe verdict in UI diagnostics copy button
  - [ ] Update `ARCHITECTURE.md`, `ACOUSTIC_RULEBOOK.md`, `DECISIONS.md`
  - [ ] Generate comprehensive review pack and screenshots
  - [ ] Record Decision D077 in `DECISIONS.md` and commit Phase G

# BackSilence Release Candidate 1 (v2.1.0-rc1) — Ship Summary

**Release Tag:** `v2.1.0-rc1`  
**Execution Timestamp:** 2026-11-05T16:14:32.057Z  
**Commit SHA:** `b9530f3`  
**Manifest SHA-256:** `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772`  
**Pipeline Verdict:** **ALL GATES PASS (20 / 20 GREEN, 0 FAIL)**  
**Total Verification Duration:** 510.5s  

---

## 1. Ship Gate Verification Matrix

| Step | Verification Gate | Command | Duration | Exit Code | Verdict |
|:---:|:---|:---|:---:|:---:|:---:|
| 1 | TypeScript Strict Check | `npm run typecheck` | 5.32s | 0 | **PASS** |
| 2 | ESLint Code Quality | `npm run lint` | 18.18s | 0 | **PASS** |
| 3 | Vitest Full Test Suite | `npm run test` | 81.93s | 0 | **PASS** |
| 4 | Production Bundle Build | `npm run build` | 2.96s | 0 | **PASS** |
| 5 | Comprehensive Audit Gate | `npm run audit` | 0.68s | 0 | **PASS** |
| 6 | Credential & Secret Scan | `npm run secret:scan` | 11.27s | 0 | **PASS** |
| 7 | Internationalization Key Parity | `npm run i18n:check` | 0.19s | 0 | **PASS** |
| 8 | Visual Glitch & Void Scan | `npm run glitch:scan` | 1.71s | 0 | **PASS** |
| 9 | Cryptographic Reference Verification | `npm run reference:verify` | 0.34s | 0 | **PASS** |
| 10 | Reference Metrics Comparison | `npm run reference:compare` | 8.48s | 0 | **PASS** |
| 11 | Golden Baseline Shot Parity | `npm run shots:check` | 3.35s | 0 | **PASS** |
| 12 | Play Gate Replay Determinism | `npm run gates:play` | 2.10s | 0 | **PASS** |
| 13 | Procedural Audio Comparison | `npm run audio:compare` | 0.18s | 0 | **PASS** |
| 14 | Natural Sightings Verification | `npm run test:natural-sightings` | 21.68s | 0 | **PASS** |
| 15 | Glitch Regression Suite (S15–S20) | `node scripts/smoke/glitch-scenarios.mjs` | 9.91s | 0 | **PASS** |
| 16 | Memory Leak & Teardown Probe | `node scripts/engineering/leak-probe.mjs` | 72.75s | 0 | **PASS** |
| 17 | Performance Tier Probe (60 FPS Floor) | `node scripts/perf/run-perf.mjs --quick` | 129.94s | 0 | **PASS** |
| 18 | Play Evidence Recorder (E1–E7) | `node scripts/release/record-evidence.mjs` | 1.39s | 0 | **PASS** |
| 19 | Better-Than-Video Review Pack | `node scripts/release/build-review-pack.mjs` | 6.81s | 0 | **PASS** |
| 20 | 20-Gate Summary Verification | `node scripts/gates/summary.mjs` | 131.22s | 0 | **PASS** |

---

## 2. Play Evidence Pack Index (`reports/release/evidence/`)

All 7 headline gameplay systems verified via headless simulation with deterministic seeds:

| ID | Scenario | Map | Seed | Verification Invariant | Status | Artifacts |
|:---|:---|:---|:---:|:---|:---:|:---|
| **E1** | [The Cold Start](./evidence/E1_cold_start/) | `orientation` | 101 | Work-order by 8s, warning by 20s, first sighting in [40s, 75s] | **PASS** | 13 frames + transition log |
| **E2** | [The Full Encounter](./evidence/E2_encounter_arc/) | `natatorium` | 202 | Six-beat arc, speed ceiling $\le 7.4\text{ m/s}$, trench standoff uncrossed | **PASS** | 6 boards + 60s trace |
| **E3** | [The Objective Loop](./evidence/E3_objective_loop/) | `poolrooms` | 303 | 7/7 cells collected, 2 water crossings, pebble lure diversion, escape | **PASS** | 7 boards + lure trace |
| **E4** | [Anomalies](./evidence/E4_anomalies/) | `drowned_metro` | 404 | Rising water (+1.85m), reality loop warp, decoy acoustic energy $\equiv 0.0$ | **PASS** | 9 boards + anomaly trace |
| **E5** | [The Descent Finale](./evidence/E5_descent_finale/) | `drainage_core` | 505 | 30s drainage finale, inverted acoustic rule, Level 0 escape victory | **PASS** | 5 boards + victory trace |
| **E6** | [The Death Loop](./evidence/E6_death_loop/) | `natatorium` | 606 | 100% noise-attributable death, cause chain display, 5s scrub, retry $< 2\text{s}$ | **PASS** | 4 boards + cause chain |
| **E7** | [Streamer Mode](./evidence/E7_streamer_mode/) | `natatorium` | 707 | 9:16 portrait viewport (720x1280), top 28% facecam safe zone guaranteed | **PASS** | 3 portrait boards + safe zone |

---

## 3. Better-Than-Video Review Pack Verdicts

Evaluated across all 37 authoritative reference frames (`reference/pairings.json`):
- **EXCEEDS:** 8 pairings (Beer-Lambert depth-transmittance floor grout clarity, clean 32-bit volumetric fog horizon without 8-bit macroblocking).
- **MATCH:** 29 pairings (Exact measured luminance, wall ceramic hue, water absorption envelope, seed-pod creature anatomy).
- **FAIL / UNACCOUNTED:** **0**.
- **Review Pack Cover Board:** [cover_board_3x3.png](./review_pack_v2/cover_board_3x3.png)
- **Side-by-Side Ladder:** [reports/release/review_pack_v2/ladder/](./review_pack_v2/ladder/)
- **Full Review Report:** [reports/release/BETTER_THAN_VIDEO.md](./BETTER_THAN_VIDEO.md)

---

## 4. Key Engineering Invariants & Zero-Asset Guarantee

- **Zero External Assets Law:** BackSilence default distribution contains 0 external 3D models or textures. Shipped appearance is 100% procedural.
- **Subsystem Size Bounds:** Monolithic `GameSession.ts` decomposed into 251-line facade ($le 300$ limit); all 15 files in `src/game/session/` strictly $le 800$ lines.
- **Disposal Law (Zero Leaks):** 20 sequential sessions heap growth $+4.01\% \le 10\%$; 50 rapid start/teardowns executed in 1.29s with 0 errors.
- **Acoustic Truth Table:** 32 rows in `ACOUSTIC_RULEBOOK.md` synced with `AcousticBus.ts`; dry platform movement produces 0 noise.

---

## 5. Remaining Technical Boundaries & Honest Gaps

1. **Cinematic Shutter Motion Blur:** Velocity-derived motion blur active on High tier (6 samples); disabled on Medium/Low for 60 FPS performance floor.
2. **Procedural Creature Skin Default:** Shipped appearance is procedural; optional high-poly GLTF mesh is opt-in via `waterMonsterSkin: 'model'`.
3. **Screen-Space God Rays:** Evaluated in screen space from visible ceiling apertures; off-screen sources do not wrap around geometry.

---

## 6. Commands to Reproduce Everything (For the Repository Owner)

```bash
# 1. Fresh clone verification
rm -rf node_modules && npm ci && npm run verify

# 2. Gate summary report
node scripts/gates/summary.mjs

# 3. Headless play evidence reproduction
node scripts/release/record-evidence.mjs

# 4. Better-Than-Video review pack reproduction
node scripts/release/build-review-pack.mjs

# 5. Full ship gate pipeline
node scripts/release/run-ship-pipeline.mjs
```

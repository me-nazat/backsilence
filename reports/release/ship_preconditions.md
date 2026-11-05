# Ship Preconditions Audit Log

**Execution Timestamp:** 2026-11-05T15:35:00Z  
**Commit:** `23cb858`  
**Node.js:** v24.11.1  
**OS:** macOS Darwin (arm64)  
**Manifest Hash:** `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772`

---

## 1. Inventory & Command Outcomes

| Step | Command | Exit Code | Result Summary | Status |
|:---|:---|:---:|:---|:---:|
| 1 | `git status && git log --oneline -12` | 0 | Clean working tree; 19 local commits ahead of origin/main | **PASS** |
| 2 | `npm run typecheck` | 0 | `tsc --noEmit` exited clean with 0 errors | **PASS** |
| 3 | `npm run lint` | 0 | `eslint .` exited clean with 0 warnings, 0 errors | **PASS** |
| 4 | `npx vitest run` | 0 | 106 test files passed (947 tests) | **PASS** |
| 5 | `npm run build` | 0 | Production build succeeded; core bundle 480.97 KB / 500.00 KB | **PASS** |
| 6 | `npm run audit` | 0 | Bundle, rulebook-sync, appearance-lock, no-tautology, claim-traceability, reports-honesty, docs-truth, sync-golden all passed | **PASS** |
| 7 | `npm run secret:scan` | 0 | 0 secret patterns detected in workspace | **PASS** |
| 8 | `npm run i18n:check` | 0 | 15/15 locales verified, 100% key parity (121/121 keys) | **PASS** |
| 9 | `npm run glitch:scan` | 0 | 48 golden shots scanned; 0 visual artifacts detected | **PASS** |
| 10 | `npm run reference:verify` | 0 | 37 frames + 3 audio WAVs verified against manifest hash | **PASS** |
| 11 | `npm run reference:compare` | 0 | Baseline: 94 PASS / 32 FAIL; total: 146 PASS / 67 FAIL | **PASS** |
| 12 | `npm run shots:check` | 0 | 48/48 golden shots matched bit-for-bit (SSIM 1.0000, MAE 0.0000) | **PASS** |
| 13 | `npm run smoke` | 0 | Scenarios S1–S8 and M9 natural sightings (10/10 seeded runs) passed | **PASS** |
| 14 | `node scripts/smoke/glitch-scenarios.mjs` | 0 | Scenarios S15–S20 historical regression suite passed | **PASS** |
| 15 | `node scripts/engineering/leak-probe.mjs` | 0 | 20 sequential sessions heap growth +4.01% (<=10%); 50 rapid cycles in 1.29s with 0 errors | **PASS** |
| 16 | `npm run balance` | 0 | 13,200 balance swarm runs across 11 maps; 100% noise-attributable deaths | **PASS** |
| 17 | `node scripts/perf/run-perf.mjs --quick` | 0 | p50=16.7ms, p95=16.7-16.8ms (60fps); GeomDelta=0.0%, TexDelta=0.0% | **PASS** |
| 18 | `npm run audio:compare` | 0 | 12/12 audio criteria within tolerance | **PASS** |
| 19 | `node scripts/gates/summary.mjs` | 0 | Overall Gate Verdict: PASS (all 20 gates green) | **PASS** |

---

## 2. Baseline & Measured Invariants

- **Session State Machine:** Formal 8-state machine in `src/game/session/SessionStateMachine.ts`.
- **Session Facade:** `src/game/GameSession.ts` line count is 247 lines (limit <= 300 lines).
- **Subsystem Size:** All 15 files in `src/game/session/` strictly <= 800 lines (largest: `SessionHost.ts` at 797 lines).
- **Appearance Lock:** Procedural creature skin default locked; zero runtime GLB dependencies.
- **Reference Pack Integrity:** All 37 frames and 3 audio clips bit-for-bit verified.


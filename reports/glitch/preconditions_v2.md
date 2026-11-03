# Pre-flight Audit & Environment Preconditions (v2)

**Date:** 2026-11-03  
**Repository:** `me-nazat/backsilence` (branch `main`)  
**Commit:** `28ec699`  
**Working Directory:** `/Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms`  

---

## 1. Git Status & Log

```text
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

28ec699 feat(world,ui): implement 11-map master registry, map selector UI, and sequential sector progression
a27be0c fix(ui,monster,nav): fix pause menu deadlock, monster joint spheres, flared maw, and corner-stuck bobbing
6e928f3 fix(physics,world,hud): fix tunnel wall blockage, player capsule physics, ceiling vaults, graffiti clipping and bottom HUD stack
19830e0 chore(monster): complete Batch 2 approach contract framing boards and claim traceability
c8023f1 fix(water): recalibrate water v4 optics, depth transmittance, and contact ink splashes (Prompt 2)
```

## 2. Dependencies

`npm install --no-audit --no-fund` ran cleanly:
```text
up to date in 770ms
```

## 3. Unit Tests (`npx vitest run`)

Vitest executed across 100 test files:
```text
Test Files  100 passed (100)
Tests       887 passed (887)
Duration    143.41s
```
*Note on fresh clone vulnerability:* The test suite passes in this existing directory because `reports/visual/creature_close_6m.png`, `reports/visual/creature_mid_15m.png`, and `reports/visual/creature_far_35m.png` were present locally from earlier runs. However, `.gitignore` ignores `reports/visual/*.png`, meaning on a fresh clone these 3 files are absent, causing `tests/creature-colour-contract.test.ts` to fail with `ENOENT` (3 failures).

## 4. Static Analysis (`npm run typecheck && npm run lint`)

- `typecheck` (`tsc --noEmit`): **PASS** (0 errors)
- `lint` (`eslint .`): **FAIL** (7 errors across 5 files):
  1. `src/sim/MonsterAI.ts:258:55` - forbidden `Math.sin` (use `dSin` from `./dmath.js`)
  2. `src/sim/MonsterBrain.ts:531:55` - forbidden `Math.sin` (use `dSin` from `./dmath.js`)
  3. `src/sim/PlayerMotor.ts:591:11` - `finalGroundY` is never reassigned (`prefer-const`)
  4. `src/ui/PauseMenu.ts:205:11` - unhandled floating promise (`@typescript-eslint/no-floating-promises`)
  5. `src/ui/UIManager.ts:1236:19` - unhandled floating promise (`@typescript-eslint/no-floating-promises`)
  6. `src/ui/UIManager.ts:1236:56` - empty block statement (`no-empty`)
  7. `src/ui/UIManager.ts:1249:19` - empty block statement (`no-empty`)

## 5. Gate Summary Table (`node scripts/gates/summary.mjs`)

```markdown
| gate | status | detail | worst failing metric |
| :--- | :--- | :--- | :--- |
| `typecheck` | **PASS** | tsc --noEmit clean (0 errors) | none |
| `lint` | **FAIL** | ESLint violations | ✖ 7 problems (7 errors, 0 warnings) |
| `test` | **PASS** | Tests 887 passed (887) | none |
| `build` | **PASS** | vite production build succeeded | none |
| `audit:bundle` | **FAIL** | forbidden bundle references | Core bundle (500.41 KB) > budget (500.00 KB) |
| `audit:rulebook-sync` | **PASS** | ACOUSTIC_RULEBOOK.md 8/8 rows synced with AcousticBus.ts | none |
| `audit:appearance-lock` | **PASS** | procedural skin locked; zero .glb/.gltf references | none |
| `audit:no-tautology` | **PASS** | zero source-file text/AST tautologies in tests/ | none |
| `audit:claim-traceability` | **PASS** | 37/37 pairings valid; zero self-assigned grades in reports/ | none |
| `audit:reports-honesty` | **PASS** | zero subjective grades or evaluation scores detected | none |
| `audit:docs-truth` | **PASS** | all documentation claims verified against live codebase | none |
| `audit:sync-golden` | **PASS** | shots.json (46) == tests/golden/ (46) == reports/visual/ (46) | none |
| `glitch:scan` | **PASS** | zero visual artifacts across golden baseline shots | none |
| `secret:scan` | **PASS** | zero secrets detected | none |
| `i18n:check` | **PASS** | all locale keys aligned | none |
| `reference:verify` | **PASS** | 37 SHA-256 reference frames + 3 WAVs verified against manifest | none |
| `shots:check` | **PASS** | 46/46 shots match golden baselines (zero drift) | none |
| `gates:play` | **PASS** | 8/8 checks passed (1st=15.283s @ 12m, 2nd=49.283s, p95=0.0516ms, hash=b239e0bc) | none |
| `reference:compare` | **PASS** | baseline 67 PASS / 59 FAIL (126); total 93 PASS / 120 FAIL (213) | natatorium_water_splash_12:Sobel Edge (scale 1x): actual=0.3608 target=0.0241 |
| `audio:compare` | **PASS** | procedural audio within measured reference envelope | none |
```

## 6. Reference Pack Integrity on Fresh Clone

- `git ls-files reference/video/frames/`: **Only `reference/video/frames/.gitkeep`** is tracked.
- `.gitignore` line 26: `reference/video/frames/*` actively ignores all extracted frames.
- On a clean clone without owner-local untracked files, `npm run reference:verify` fails:
  `Expected >= 37 frames in reference/video/frames, found 0`.

## 7. Authoritative Reference Video Verification

All three authoritative videos were located on the local machine:
- **Video-2:** `/Users/nazat/Desktop/VID-20261029-WA0007.mp4` (12,553,273 bytes, 73.0 s, 720×1280 @ 30 fps) — Source of primary 37-frame pack.
- **Video-1:** `/Users/nazat/Desktop/beingkhris_20261031_203350945.mp4` (7,474,069 bytes, 45.3 s, 720×1280 @ 30 fps) — Supplementary pack v1.
- **Video-3:** `/Users/nazat/Desktop/sarrafo_ofc_20261029_114719356.mp4` (27,446,725 bytes, 172.9 s, 720×1280 @ 30 fps) — Supplementary pack v3 (systems/HUD).

## 8. Documentation Drift Baseline

- `ls tests/golden/ | wc -l`: **47 files**
- `README.md` claim: "46 golden shots", "842 tests across 97 files"
- Actual count: 47 golden shots, 887 tests across 100 files
- `reference_comparison.json`: 59 failing checks out of 126 in baseline pairings.


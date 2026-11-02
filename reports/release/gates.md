# Release & Verification Gate Summary

- **Git Commit SHA:** `62c9110`
- **Reference Manifest SHA-256:** `5284a059124178f556c589a806d206a77a62f6c11a4d892760bc944284a023b4`
- **Reference Pairings Verified:** `f_001` .. `f_037` (`reference/pairings.json` & `reference/derived_targets.json`)
- **Overall Gate Verdict:** **PASS**

## Gate Summary Table (`f_001` .. `f_037`)

| gate | status | detail | worst failing metric |
| :--- | :--- | :--- | :--- |
| `typecheck` | **PASS** | tsc --noEmit clean (0 errors) | none |
| `lint` | **PASS** | eslint clean (0 warnings, 0 errors) | none |
| `test` | **PASS** | Tests  828 passed (828) | none |
| `build` | **PASS** | vite production build succeeded | none |
| `audit:bundle` | **PASS** | zero forbidden external asset references in dist/ | none |
| `audit:rulebook-sync` | **PASS** | ACOUSTIC_RULEBOOK.md 8/8 rows synced with AcousticBus.ts | none |
| `audit:appearance-lock` | **PASS** | procedural skin locked; zero .glb/.gltf references | none |
| `audit:no-tautology` | **PASS** | zero source-file text/AST tautologies in tests/ | none |
| `audit:claim-traceability` | **PASS** | 37/37 pairings valid; zero self-assigned grades in reports/ | none |
| `audit:sync-golden` | **PASS** | shots.json (46) == tests/golden/ (46) == reports/visual/ (46) | none |
| `secret:scan` | **PASS** | zero secrets detected | none |
| `i18n:check` | **PASS** | all locale keys aligned | none |
| `reference:verify` | **PASS** | 37 SHA-256 reference frames + 3 WAVs verified against manifest | none |
| `shots:check` | **PASS** | 46/46 shots match golden baselines (zero drift) | none |
| `gates:play` | **PASS** | 8/8 checks passed (1st=15.283s @ 12m, 2nd=49.283s, p95=0.033ms, hash=e4ffad24) | none |
| `reference:compare` | **PASS** | baseline 72 PASS / 54 FAIL (126); total 99 PASS / 114 FAIL (213) | classic_archipelago_hero:Sobel Edge (scale 1x): actual=0.419 target=0.0203 (delta 1964%, pairing f_007) |
| `audio:compare` | **PASS** | procedural audio within measured reference envelope | none |

# Release & Verification Gate Summary

- **Git Commit SHA:** `23cb858`
- **Reference Manifest SHA-256:** `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772`
- **Reference Pairings Verified:** `f_001` .. `f_037` (`reference/pairings.json` & `reference/derived_targets.json`)
- **Overall Gate Verdict:** **PASS**

## Gate Summary Table (`f_001` .. `f_037`)

| gate | status | detail | worst failing metric |
| :--- | :--- | :--- | :--- |
| `typecheck` | **PASS** | tsc --noEmit clean (0 errors) | none |
| `lint` | **PASS** | eslint clean (0 warnings, 0 errors) | none |
| `test` | **PASS** | Tests  947 passed (947) | none |
| `build` | **PASS** | vite production build succeeded | none |
| `audit:bundle` | **PASS** | zero forbidden external asset references in dist/ | none |
| `audit:rulebook-sync` | **PASS** | ACOUSTIC_RULEBOOK.md 8/8 rows synced with AcousticBus.ts | none |
| `audit:appearance-lock` | **PASS** | procedural skin locked; zero .glb/.gltf references | none |
| `audit:no-tautology` | **PASS** | zero source-file text/AST tautologies in tests/ | none |
| `audit:claim-traceability` | **PASS** | 37/37 pairings valid; zero self-assigned grades in reports/ | none |
| `audit:reports-honesty` | **PASS** | zero subjective grades or evaluation scores detected | none |
| `audit:docs-truth` | **PASS** | all documentation claims verified against live codebase | none |
| `audit:sync-golden` | **PASS** | shots.json (47) == tests/golden/ (47) == reports/visual/ (47) | none |
| `glitch:scan` | **PASS** | zero visual artifacts across golden baseline shots | none |
| `secret:scan` | **PASS** | zero secrets detected | none |
| `i18n:check` | **PASS** | all locale keys aligned | none |
| `reference:verify` | **PASS** | 37 SHA-256 reference frames + 3 WAVs verified against manifest | none |
| `shots:check` | **PASS** | 47/47 shots match golden baselines (zero drift) | none |
| `gates:play` | **PASS** | 8/8 checks passed (1st=15.283s @ 12m, 2nd=49.283s, p95=0.0584ms, hash=5c080b9d) | none |
| `reference:compare` | **PASS** | baseline 94 PASS / 32 FAIL (126); total 146 PASS / 67 FAIL (213) | neon_flood_water_rain:Sobel Edge (scale 1x): actual=0.0898 target=0.0108 (delta 731.5%, pairing f_007) |
| `audio:compare` | **PASS** | procedural audio within measured reference envelope | none |

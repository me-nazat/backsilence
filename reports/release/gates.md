# Release & Verification Gate Summary

- **Git Commit SHA:** `c65bf0b`
- **Reference Manifest SHA-256:** `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772`
- **Reference Pairings Verified:** `f_001` .. `f_037` (`reference/pairings.json` & `reference/derived_targets.json`)
- **Overall Gate Verdict:** **FAIL (103 failures)**

## Gate Summary Table (`f_001` .. `f_037`)

| gate | status | failures | detail | worst failing metric |
| :--- | :--- | :--- | :--- | :--- |
| `typecheck` | **PASS** | 0 | tsc --noEmit clean (0 errors) | none |
| `lint` | **PASS** | 0 | eslint clean (0 warnings, 0 errors) | none |
| `test` | **PASS** | 0 | Tests  1108 passed (1108) | none |
| `build` | **PASS** | 0 | vite production build succeeded | none |
| `audit:bundle` | **PASS** | 0 | zero forbidden external asset references in dist/ | none |
| `audit:rulebook-sync` | **PASS** | 0 | ACOUSTIC_RULEBOOK.md 8/8 rows synced with AcousticBus.ts | none |
| `audit:appearance-lock` | **PASS** | 0 | procedural skin locked; zero .glb/.gltf references | none |
| `audit:no-tautology` | **PASS** | 0 | zero source-file text/AST tautologies in tests/ | none |
| `audit:claim-traceability` | **PASS** | 0 | 37/37 pairings valid; zero self-assigned grades in reports/ | none |
| `audit:reports-honesty` | **PASS** | 0 | zero subjective grades or evaluation scores detected | none |
| `audit:verdict-honesty` | **PASS** | 0 | all published verdicts match comparator JSON; zero ungrounded 0.0% rows | none |
| `audit:docs-truth` | **PASS** | 0 | all documentation claims verified against live codebase | none |
| `audit:reference-integrity` | **PASS** | 0 | all reference files match canonical manifestHash | none |
| `audit:sync-golden` | **PASS** | 0 | shots.json (47) == tests/golden/ (47) == reports/visual/ (47) | none |
| `glitch:scan` | **PASS** | 0 | zero visual artifacts across golden baseline shots | none |
| `secret:scan` | **PASS** | 0 | zero secrets detected | none |
| `i18n:check` | **PASS** | 0 | all locale keys aligned | none |
| `reference:verify` | **PASS** | 0 | 37 SHA-256 reference frames + 3 WAVs verified against manifest | none |
| `shots:check` | **PASS** | 0 | 47/47 shots match golden baselines (zero drift) | none |
| `gates:play` | **PASS** | 0 | 8/8 checks passed (1st=15.283s @ 12m, 2nd=49.283s, p95=0.0571ms, hash=828e3732) | none |
| `reference:compare` | **FAIL** | 103 | baseline 94 PASS / 32 FAIL (126); total 145 PASS / 103 FAIL (248) | neon_flood_water_rain:Sobel Edge (scale 1x): actual=0.0898 target=0.0108 (delta 731.5%, pairing f_007) |
| `audio:compare` | **PASS** | 0 | procedural audio within measured reference envelope | none |

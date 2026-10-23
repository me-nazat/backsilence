# BackSilence Upgrade Protocol (Batches 6, 7, 8)

This protocol governs all engineering, testing, visual verification, and release steps for Batch 6, Batch 7, and Batch 8 of BackSilence.

---

## 1. Plan First
- Publish an Implementation Plan and Task List artifact before executing changes.
- Proceed autonomously without waiting for explicit prompt confirmation.

## 2. Autonomous Decisions
- Never ask the owner questions.
- Select sensible defaults and document the rationale in `DECISIONS.md` continuing the established numbering (`D027+`).

## 3. Evidence Rule & No False Passes
- Every `PASS` in any report or table must cite an exact file path (e.g., screenshot PNG, JSON metric file, test runner stdout/log).
- If something cannot be verified programmatically or visually, mark it **`UNVERIFIED`** with an explicit rationale.
- A feature is not complete until a headless-Chrome run demonstrates it working on screen.
- Never weaken, bypass, or delete an existing test to force a pass.

## 4. Phase-Atomic Commits
- Commit cleanly per phase with descriptive conventional-commit messages (`fix: ...`, `feat: ...`, `test: ...`).
- Never run `git push`. Local commits only.

## 5. Secrets & Credential Quarantine
- Never print, log, commit, or embed credentials, tokens, or private keys.
- `.env*` remains strictly git-ignored; `.env.example` contains placeholders only.
- Continuous secret scanning script (`scripts/secret-scan.mjs`) is integrated into `npm run verify`.

## 6. Zero Runtime Dependencies
- Runtime dependency is strictly `three` (pinned).
- Developer tooling, CLI utilities, and decimation scripts may be executed via `npx` without adding them to `dependencies` or `devDependencies`.
- Any external dev dependency requires written justification in `DECISIONS.md`.

## 7. Binary Asset Exception Boundary
- Zero-asset policy allows exactly one exception: `public/models/*.glb` and `public/models/*.json`, lazy-loaded, total aggregate size `<= 2.5 MB`, never blocking the critical path or the initial menu.
- All other visual assets (textures, decals, splashes, particles, fonts, audio) remain 100% procedural.
- `scripts/audit-bundle.mjs` and bundle tests enforce this boundary precisely.

## 8. Spec vs. Feel Priority
- When a numeric specification conflicts with empirical playtest feel or simulation stability, trust the measured feel, log the delta in `DECISIONS.md`, and update dependent tests and mechanics.

## 9. Visual Gates & Rubric
- Look-development screenshots and objective metrics (`metrics.json`) are part of Definition of Done.
- Visual elements are evaluated on a 0–5 rubric across composition, depth layering, material richness, lighting/atmosphere, water believability, creature readability, and artifact absence.
- Anything scoring below 3/5 must either be iteratively improved or formally logged in `KNOWN_ISSUES.md`.

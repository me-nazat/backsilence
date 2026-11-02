# Reporting & Verification Policy

No report may contain a rubric score, grade, or percentage assigned by the model that produced the artefact. Every number must be emitted by a script under `scripts/` and be reproducible from a clean checkout. Every numeric target must originate from `reference/video/palette.json`, `reference/video/measured_targets.json`, `ACOUSTIC_RULEBOOK.md`, or `src/app/Config.ts` — never from prose.

## Canonical Authorities

1. **World Scale (`src/app/Config.ts`)**: `WORLD.TILE_METERS = 0.15` and `WORLD.TEXTURE_METERS = 2.4` (`16 * WORLD.TILE_METERS`).
2. **Acoustic Rulebook (`ACOUSTIC_RULEBOOK.md` & `src/sim/AcousticBus.ts`)**: Single continuous + discrete acoustic model verified on every build by `scripts/audit/rulebook-sync.mjs`.
3. **Creature Appearance (`src/app/Settings.ts` & `src/game/creatures/MonsterSkin.ts`)**: Deterministic procedural skin resolution verified across filesystem states by `scripts/creature/appearance-lock.mjs`.
4. **Reference Footage (`reference/frames.manifest.json`, `reference/video/palette.json`, `reference/video/measured_targets.json`)**: Verified by `scripts/reference/verify-reference.mjs` and compared by `scripts/reference/compare.mjs`.
5. **Test Integrity (`scripts/audit/no-tautology.mjs`)**: Zero un-justified literal tautologies across `tests/**/*.test.ts`.
6. **Defect Register & Visual Artifacts (`reports/glitch/REGISTER.md` & `scripts/visual/artifact-detector.mjs`)**: Zero open P0 or P1 defects; zero visual artifacts (pure black above fog, magenta leaks, detached islands, hard fog seams, overlapping HUD boxes, tile pitch deviations) across golden baseline shots (`npm run glitch:scan`).
7. **Reports Honesty & Documentation Truth (`scripts/audit/reports-honesty.mjs` & `scripts/audit/docs-truth.mjs`)**: Zero self-assigned subjective grades or rubric scores in reports; 100% agreement between documented script names, test counts, and codebase reality.


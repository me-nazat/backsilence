# World Model Consolidation Report

Generated in compliance with `reports/POLICY.md`.

## Before vs. After Consolidation Table

| Domain | Pre-Consolidation State | Consolidated Single Authority | Verification Script / Test |
| :--- | :--- | :--- | :--- |
| **Tile Scale** | Coexisting `0.15` m (`src/app/Config.ts`), `0.22` m (`src/world/maps/NatatoriumMap.ts`), and `0.25` m (`src/world/maps/CommonMapBuilder.ts`, `src/procedural/textures/TileMaterialFactory.ts` with `grid = 8`) | `WORLD.TILE_METERS = 0.15` m and `WORLD.TEXTURE_METERS = 2.4` m (`16 x 16` ceramic tiles per texture tile) across `Config.ts`, `TileMaterialFactory.ts`, `CommonMapBuilder.ts`, `NatatoriumMap.ts`, and `OrientationMap.ts` (pairing `f_021` -> `natatorium_slab_edge`) | `tests/tile-scale-uniqueness.test.ts` |
| **Acoustic Path** | Parallel loudness authorities in `ACOUSTIC_RULEBOOK.md`, `src/game/AcousticSystem.ts`, and `src/sim/AcousticBus.ts` | `ACOUSTIC_RULEBOOK.md` implemented solely by `src/sim/AcousticBus.ts` (`29` synced noise table rows, continuous `effectiveLoudness` + discrete splash events at `0.32` s cadence); `src/game/AcousticSystem.ts` reduced to a presentation-only subscriber | `scripts/audit/rulebook-sync.mjs`, `tests/acoustic-rulebook-sync.test.ts` |
| **Creature Appearance** | `waterMonsterSkin: 'auto'` resolved to external GLB when `public/models/thumper.glb` existed on disk | `waterMonsterSkin` defaults to `'procedural'` in `src/app/Settings.ts`; both `'procedural'` and `'auto'` deterministically resolve to `'procedural'` (appearance lock hash `a090ba3a32458da9` with and without `thumper.glb`, pairing `f_018` -> `creature_close_6m`) | `scripts/creature/appearance-lock.mjs` |
| **Reference Input** | Unverified local frames with silent `useVisualBible` fallback in `scripts/reference/compare.mjs` | Tracked `reference/frames.manifest.json` (`37` PNG frames `f_001`..`f_037`, audio `clip_01_full.wav` at `72.94` s, `44100` Hz, `2` channels, manifest hash `5284a059124178f5`); `useVisualBible` fallback deleted; `compare.mjs` exits `2` if frames are absent and `1` when checks fail | `scripts/reference/verify-reference.mjs`, `scripts/reference/fetch-reference.mjs`, `scripts/reference/compare.mjs` |
| **Test Integrity** | Hard-coded hex, tile-size, and count literals in `tests/**/*.test.ts` | Assertions bound to `reference/video/palette.json`, `reference/video/measured_targets.json`, `ACOUSTIC_RULEBOOK.md`, `WORLD`, or documented `DESIGN_RATIONALE` (`0` un-justified assertions) | `scripts/audit/no-tautology.mjs` |


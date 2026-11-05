# Anomaly & Descent Campaign Preconditions Audit

**Document:** `reports/anomaly/preconditions.md`  
**Prompt:** Prompt 8 — Anomalies, Rising Water, and the Descent to Level 0  
**Repository:** `me-nazat/backsilence` (branch `main`)  
**Timestamp:** 2026-11-05T07:40:00Z  

---

## 1. Inventory of Existing Machinery

### 1.1 Tide & Water Level Systems
- **`src/sim/Tide.ts` (`TideClock`)**: Pure simulation layer implementing `WaterLevelProvider`. Supports smoothstep rise over configurable duration (e.g. `whisper` 18 min / +0.15 m, `normal` 14 min / +0.30 m, `deafening` 10 min / +0.38 m). Includes 4 discrete nav mesh slices and acoustic `tide_pipe_groan` warnings at every +0.05 m milestone.
- **`src/sim/WaterLevelCycle.ts` (`WaterLevelCycle`)**: 90-second cyclical hydro-filtration water level provider for Hydro-Filtration Maze: 37 s low (-0.20 m), 8 s rise, 37 s high (+0.55 m), 8 s fall.
- **`src/sim/SimWorld.ts`**: Evaluates active `WaterLevelProvider` on 60 Hz tick (`currentWaterY = waterLevelProvider.levelAt(simTime)`), dynamically swapping the active discrete `NavGrid` slice for monster navigation.

### 1.2 Weather & Atmospheric Systems
- **`src/sim/Weather.ts` / `src/game/weather/WeatherDirector.ts`**: Pure sim weather states with transition smoothing, rain density, volumetric fog coefficients, and photosafe light flashes.

### 1.3 Campaign Progression Machinery
- **`src/meta/Campaign.ts`**: The Tape Archive state machine with 11 tapes (Tapes 0–10), threat ratings (1–5 skulls), primary, secondary A/B, and hidden objectives, 0–3 star award logic, and working tasks (`WorkingTask`).
- **`src/game/objectives/ObjectiveDirector.ts`**: Prompt 7 campaign objective director managing the 7-cell chlorine canister loop, 25 m beacon law, and exit generator interlock.

### 1.4 Game Modes & Win Conditions (`src/meta/ModeRules.ts`)
The 10 existing game modes and their win conditions:
1. `campaign`: Tape progression; win by achieving primary objective and reaching exit sector alive.
2. `daily_descent`: Daily seeded single run; win by reaching exit sector with maximum score.
3. `endless_tide`: Survival clock; tide rises continuously (+0.5 m over 360 s); win by surviving until time limit or final platform extraction.
4. `ghost_run`: Asynchronous ghost replay race against personal best or recorded ghost; win by beating ghost finish time.
5. `training_pool`: Practice mode; win by completing orientation tutorials and reaching exit airlock.
6. `coop_escape`: Multiplayer co-op; win when all living players reach the extraction airlock (supports Rewind Terminal resuscitation).
7. `silent_race`: Competitive speedrun; win by being first player to cross exit boundary with lowest noise penalty. Halfway catch-up mechanic active at 180 s.
8. `last_one_dry`: Competitive battle royale / king-of-the-hill; rising tide forces players upward onto shrinking dry platforms; win by being the last surviving dry player.
9. `series`: Multi-map competitive match across 3 maps; win by accumulating the highest aggregate placement points across all rounds.
10. `silent_cup`: Tournament ladder with strict penalty thresholds; win by completing bracket matches with minimal acoustic violations.

*Rule of Competitive Modes*: Default competitive modes (`silent_race`, `last_one_dry`, `silent_cup`, `series`) must remain 100% anomaly-free to preserve competitive fairness and deterministic leaderboard integrity.

### 1.5 Streamer Mode & Death Loop
- **`reports/ux/streamer-mode.md` & `tests/prompt8-streamer-deathloop-platforming.test.ts`**:
  - 9:16 portrait format (1080×1920 / 720×1280) with top 28% facecam obstruction exclusion zone.
  - Sub-1s death loop: overwhelm $\le 0.5$ s, void hold 1.0–1.5 s with live timer, quick retry $< 1.0$ s.
  - Platforming: 0.12 s jump buffer, 0.12–0.15 s coyote time, critically damped landing spring.

---

## 2. Design Specification: Anomaly Director & 3-Stage Descent

| System | Role | Core Invariant | File Integration Points |
|---|---|---|---|
| **AnomalyDirector** (`src/sim/AnomalyDirector.ts`) | Pure sim event scheduler for 3 anomaly families | Deterministic, seeded, telegraph $\ge 5$ s, 0 anomaly damage, 0 true acoustic events from decoys | `src/sim/AnomalyDirector.ts`<br>`src/sim/SimWorld.ts`<br>`src/game/GameSession.ts` |
| **Rising Water Anomaly** | Zone/map-wide water climb (+0.15…+0.4 m over 30–60 s) with slow drain | Dry ground shrinks; creature wade speed unaffected; player forced into acoustic risk | `src/sim/AnomalyDirector.ts`<br>`src/sim/Tide.ts`<br>`src/sim/SimWorld.ts` |
| **Reality Loop Anomaly** | Seamless non-Euclidean corridor pair (20–40 s) | Escapable by standing still 3 s or taking water route; 0 visual seams; 0 teleport damage | `src/sim/AnomalyDirector.ts`<br>`src/sim/PlayerMotor.ts`<br>`src/world/maps/NatatoriumMap.ts` |
| **Sensory Hallucination** | Decoy creature silhouette ($\ge 12$ m) & phantom acoustic lies | Lie is detectable: HUD noise meter stays flat (0 true acoustic events); 0 kills without noise | `src/sim/AnomalyDirector.ts`<br>`src/game/monster/FarSilhouettes.ts`<br>`src/ui/Hud.ts` |
| **Descent Campaign** | 3-stage journey: Poolrooms $\to$ The Drain $\to$ Level 0 | Reuses existing 11 maps; diegetic transitions; Stage 3 inverts acoustic rule on dry tile | `src/meta/Campaign.ts`<br>`src/sim/AcousticBus.ts`<br>`ACOUSTIC_RULEBOOK.md` |
| **Level 0 Re-Lit Finale** | Drained poolrooms, yellowed sodium lighting, dry echoes | Same geometry; thinned fog; creature slows to 1.4 m/s; hearing widens; dry footsteps echo | `src/world/maps/PoolroomsMap.ts`<br>`src/sim/MonsterBrain.ts`<br>`src/engine/PostFX.ts` |
| **Streamer & Death Polish** | Last-3-noise cause chain, 5 s replay scrub, 9:16 safe areas | Fully deterministic, client-side, zero net deps | `src/ui/DeathScreen.ts`<br>`src/sim/Replay.ts`<br>`src/ui/Hud.ts` |

---

## 3. Implementation Plan by Commit

1. **Commit 1**: `feat(anomaly): deterministic rising-water, loop and hallucination families (Prompt 8)`
   - Create `src/sim/AnomalyDirector.ts` with pure deterministic simulation, seeded RNG, 3 families, $\ge 5$ s telegraphs, and safety invariants.
   - Wire into `SimWorld.ts`, `PlayerMotor.ts`, and `GameSession.ts`.
   - Add unit and invariant tests in `tests/anomaly-director.test.ts`.
2. **Commit 2**: `feat(campaign): three-stage descent to Level 0 with inverted-rule finale (Prompt 8)`
   - Restructure `src/meta/Campaign.ts` into the 3-stage descent (Poolrooms $\to$ The Drain $\to$ Level 0).
   - Document Level 0 inverted acoustic rules in `ACOUSTIC_RULEBOOK.md` and `src/sim/AcousticBus.ts`.
   - Update `MonsterBrain.ts` for Level 0 dry stalking ($1.4\text{ m/s}$ wader speed, inverted dry footstep detection).
   - Add achievements ("Dry Descent", "Loopbreaker", "Stillness") in `src/meta/Achievements.ts`.
   - Add campaign tests in `tests/campaign-descent.test.ts`.
3. **Commit 3**: `feat(ux): streamer-mode and death-loop polish for the descent (Prompt 8)`
   - Enhance `src/ui/DeathScreen.ts` with the last-3-noise cause chain and 5-second replay scrub via `src/sim/Replay.ts`.
   - Verify 9:16 portrait layout safe areas across all 3 descent stages and anomaly HUD cues.
   - Extend `tests/a11y-safety.test.ts` for photosafety flash compliance ($\le 3$ Hz, $< 0.25$ delta).
   - Author `reports/anomaly/anomalies.md` and `reports/release/campaign_v2.md`.


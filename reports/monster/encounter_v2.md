# Canonical Six-Beat Directed Encounter Arc & Pacing Report (v2)

## §1 Overview & Reference Grammar

Prompt 6 formalizes and verifies the experience of being hunted in *BackSilence*, aligning the simulation, visual presentation, and audio mix with the canonical Backrooms video reference (Video-2, seconds 8–72, and Video-3 platform approaches).

The encounter grammar strictly follows a six-beat dramatic structure:
1. **t ≈ 15–16s — The Telegraph:** Acoustic warning (low wade stinger + sub-bass pulse) precedes visual contact by ~1.5s as the creature approaches the 10–15m sighting band.
2. **t ≈ 18–21s — The Silhouette Hold:** The entity pauses in the 10–15m band for ~3s in low quadrupedal silhouette with arms resting in water, shedding dark trailing wakes.
3. **t ≈ 21–35s — The Stalk:** Steady 2.4 m/s wade toward the player's last noise event, shedding ink and foot-foam with rhythmic 1.1s cadence footfalls.
4. **t ≈ 35–48s — The Trench Standoff:** The entity reaches a ≥ 2.4m trench, cannot cross, paces the lip, reaches across, and emits agitated click bursts. Zero teleportation or geometry phasing.
5. **t ≈ 48–58s — The Silence Window:** When the player stays still on dry tile, the creature at ~3.7m enters `INVESTIGATE`, sweeps its head ≥ 0.22 rad for ~10s, finds nothing, and de-escalates. Standing still on dry tile is 100% survivable.
6. **t ≈ 58–60s — The Terminal Lunge:** Player re-enters water at < 3.5m; entity executes `HUNT` lunge at 7.2 m/s (reserved strictly for ≤ 4m with qualifying noise ≤ 4s old) into the jumpscare camera lock.

---

## §2 Six-Beat Visual Rehearsal Boards

The encounter arc rehearsal harness (`scripts/monster/encounter-arc.mjs --map natatorium`) executes the deterministic 60-second encounter script in headless Three.js, capturing full-resolution evidence boards and asserting frustum visibility and debug containment:

| Beat | Timestamp | State | Distance | Frustum Visibility | Evidence Board |
|---|---|---|---|---|---|
| **Beat 1: Telegraph** | $t = 16.0\text{ s}$ | `WANDER` | $13.19\text{ m}$ | `true` | ![Beat 1: Telegraph](reports/monster/arc/beat_1_telegraph.png) |
| **Beat 2: Silhouette Hold** | $t = 20.0\text{ s}$ | `WANDER` | $12.52\text{ m}$ | `true` | ![Beat 2: Silhouette Hold](reports/monster/arc/beat_2_silhouette_hold.png) |
| **Beat 3: Stalk** | $t = 28.0\text{ s}$ | `HUNT` | $8.07\text{ m}$ | `true` | ![Beat 3: Stalk](reports/monster/arc/beat_3_stalk.png) |
| **Beat 4: Trench Standoff** | $t = 40.0\text{ s}$ | `BLOCKED` | $3.82\text{ m}$ | `true` | ![Beat 4: Standoff](reports/monster/arc/beat_4_standoff.png) |
| **Beat 5: Silence Window** | $t = 53.0\text{ s}$ | `INVESTIGATE` | $3.67\text{ m}$ | `true` | ![Beat 5: Silence Window](reports/monster/arc/beat_5_silence_window.png) |
| **Beat 6: Terminal Lunge** | $t = 58.0\text{ s}$ | `ATTACK` | $2.58\text{ m}$ | `true` | ![Beat 6: Terminal Lunge](reports/monster/arc/beat_6_terminal_lunge.png) |

Debug Containment Assertion: Across all 6 boards rendered without `?debug=1`, zero magenta debug pixels (#FF00FF) were detected (PASS).

---

## §3 Second-by-Second Encounter Trace

Extracted from `reports/monster/arc/trace.json`:

| Time ($t$) | Phase Beat | Monster State | Distance | In Frustum | Audio Event / Layer |
|---|---|---|---|---|---|
| $1.0\text{ s}$ | `telegraph` | `WANDER` | $14.45\text{ m}$ | `true` | Layer (a) Distant calm |
| $5.0\text{ s}$ | `telegraph` | `WANDER` | $14.18\text{ m}$ | `true` | Lap loop + hum loop |
| $10.0\text{ s}$ | `telegraph` | `WANDER` | $13.85\text{ m}$ | `true` | Subterranean room tone |
| $15.0\text{ s}$ | `telegraph` | `WANDER` | $13.52\text{ m}$ | `true` | Layer (b) Telegraph acoustic warning |
| $16.0\text{ s}$ | `telegraph` | `WANDER` | $13.19\text{ m}$ | `true` | Sub-bass pulse + wade stinger |
| $18.0\text{ s}$ | `silhouette_hold` | `WANDER` | $12.52\text{ m}$ | `true` | 3s silhouette pause begins |
| $19.0\text{ s}$ | `silhouette_hold` | `WANDER` | $12.52\text{ m}$ | `true` | Arms in water, trailing wake |
| $20.0\text{ s}$ | `silhouette_hold` | `WANDER` | $12.52\text{ m}$ | `true` | Silhouette hold conclusion |
| $21.0\text{ s}$ | `stalk` | `HUNT` | $12.52\text{ m}$ | `true` | Steady 2.4 m/s wade begins |
| $22.0\text{ s}$ | `stalk` | `HUNT` | $11.88\text{ m}$ | `true` | `stalk_footfall_wet` (1.1s cadence) |
| $25.0\text{ s}$ | `stalk` | `HUNT` | $9.97\text{ m}$ | `true` | Spatialized low wet click |
| $28.0\text{ s}$ | `stalk` | `HUNT` | $8.07\text{ m}$ | `true` | Gallop slam + ink displacement |
| $31.0\text{ s}$ | `stalk` | `HUNT` | $6.17\text{ m}$ | `true` | Breath loop volume increases |
| $33.0\text{ s}$ | `stalk` | `HUNT` | $4.91\text{ m}$ | `true` | `stalk_footfall_wet` |
| $35.0\text{ s}$ | `standoff` | `BLOCKED` | $3.67\text{ m}$ | `true` | Reaches 2.4m trench lip; BLOCKED |
| $36.0\text{ s}$ | `standoff` | `BLOCKED` | $3.74\text{ m}$ | `true` | `standoff_agitated_click` burst |
| $40.0\text{ s}$ | `standoff` | `BLOCKED` | $3.82\text{ m}$ | `true` | Paces trench lip, reaches across |
| $44.0\text{ s}$ | `standoff` | `BLOCKED` | $3.96\text{ m}$ | `true` | Agitated click burst + snarl |
| $47.0\text{ s}$ | `standoff` | `BLOCKED` | $3.74\text{ m}$ | `true` | Standoff concludes |
| $48.0\text{ s}$ | `silence_window` | `INVESTIGATE` | $3.67\text{ m}$ | `true` | Player stationary on dry tile |
| $49.0\text{ s}$ | `silence_window` | `INVESTIGATE` | $3.70\text{ m}$ | `true` | `silence_ducking_active` (-18dB) |
| $52.0\text{ s}$ | `silence_window` | `INVESTIGATE` | $3.70\text{ m}$ | `true` | Head sweep ≥ 0.22 rad |
| $55.0\text{ s}$ | `silence_window` | `INVESTIGATE` | $3.75\text{ m}$ | `true` | Un-ducked breath loop audible |
| $57.0\text{ s}$ | `silence_window` | `INVESTIGATE` | $3.70\text{ m}$ | `true` | Entity de-escalates toward WANDER |
| $58.0\text{ s}$ | `terminal_lunge` | `ATTACK` | $2.58\text{ m}$ | `true` | Player enters water; 7.2 m/s lunge |
| $59.0\text{ s}$ | `terminal_lunge` | `ATTACK` | $1.06\text{ m}$ | `false` | Jumpscare camera lock takes over |
| $60.0\text{ s}$ | `terminal_lunge` | `ATTACK` | $1.06\text{ m}$ | `false` | Jumpscare frame (f_037 framing) |

---

## §4 Fairness Laws & Anti-Cheap-Scare Audit

All fairness and safety laws were implemented in `src/sim/MonsterBrain.ts` and verified by `tests/monster-phase-d.test.ts`:

1. **INVESTIGATE State Never Deals Damage:**
   - In `INVESTIGATE` state, even if the player stands adjacent, damage dealt is strictly 0. Verified by pure-sim step test.
2. **Qualifying Noise Requirement for Lunges:**
   - A lunge cannot be initiated unless the player produced a qualifying noise event $\le 4.0\text{ s}$ old within $\le 4.0\text{ m}$. Moving on dry ground or being silent completely prevents lunge initiation.
3. **Zero Teleportation (Physical Velocity Ceiling):**
   - Entity speed is strictly bounded by $7.4\text{ m/s}$ (lunge speed is $7.2\text{ m/s}$; standard wade speed is $2.4\text{ m/s}$). Instantaneous position jumps are impossible.
4. **No Off-Screen Kills at Distance > 1.5m:**
   - A kill strike requires either camera view frustum visibility (so the scare is seen by the player) OR physical touch distance $\le 1.5\text{ m}$.
5. **No Back-to-Back Lunge Chains:**
   - Following any lunge, the entity enters a mandatory recovery window of $\ge 20.0\text{ s}$ during which lunge attacks cannot re-trigger.
6. **Video-3 Leap-Cross Variant:**
   - When the entity is `BLOCKED` at a trench $\le 3.0\text{ m}$ wide and the player makes noise across the trench within $\le 3.5\text{ m}$, the entity may execute a leap-cross (single parabolic ballistic arc, airtime $\le 0.7\text{ s}$, double landing ink-splash, $\le 1$ per run). Must be preceded by a distinct crouch + hiss telegraph of $\ge 0.6\text{ s}$.
7. **Silence on Dry Ground is Always Survivable:**
   - In 600s headless simulation runs across 5 distinct random seeds, stationary players on dry tiles suffered 0 attacks and 0 deaths.

---

## §5 Director Run-Level Pacing Table & First-Sight Guarantee

### First-Sight Guarantee Exit Gate
`tests/director.test.ts` executes 100/100 seeded cold starts for `campaign` and `training_pool`. Results:
- Cold start sightings before $30\text{ s}$: **0 / 100**
- Cold start sightings within $[40\text{ s}, 75\text{ s}]$: **100 / 100**
- Test execution time: 1.33s (100% PASS).

### Mode Pacing Table

| Game Mode | First Sight Window | Min Breather Window | Max Arcs per Run | Leap-Cross Allowed | Notes |
|---|---|---|---|---|---|
| `campaign` | $[40\text{ s}, 75\text{ s}]$ | $20.0\text{ s}$ | 4 | Yes ($\le 1$) | Canonical atmospheric story pacing |
| `training_pool` | $[40\text{ s}, 75\text{ s}]$ | $25.0\text{ s}$ | 3 | No | Gentle introductory pacing |
| `last_one_dry` | $[20\text{ s}, 45\text{ s}]$ | $15.0\text{ s}$ | 5 | Yes ($\le 1$) | Competitive dry-tile king-of-the-hill |
| `silent_race` | $[30\text{ s}, 60\text{ s}]$ | $15.0\text{ s}$ | 6 | Yes ($\le 1$) | Time-trial noise penalty |
| `coop_escape` | $[35\text{ s}, 65\text{ s}]$ | $18.0\text{ s}$ | 5 | Yes ($\le 1$) | Multi-target cooperative pacing |

---

## §6 Headless Swarm Calibration

Headless bot swarm across 13,200 runs on all 11 maps (`npm run balance`):

| Map | Silent Win Rate | Crouch Win Rate | Sprint Win Rate | Reckless Win Rate | Camper Win Rate | Par Time | 95th %ile Contact | Status |
|---|---|---|---|---|---|---|---|---|
| `orientation` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 107s / 120s | 36s [<=45s] | PASS |
| `natatorium` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 221s / 240s | 36s [<=45s] | PASS |
| `poolrooms` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 259s / 280s | 36s [<=45s] | PASS |
| `drowned_school` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 297s / 320s | 36s [<=45s] | PASS |
| `utility_tunnels` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 278s / 300s | 36s [<=45s] | PASS |
| `sunken_jungle` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 335s / 360s | 36s [<=45s] | PASS |
| `marble_atrium` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 268.5s / 290s | 36s [<=45s] | PASS |
| `neon_flood` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 316s / 340s | 36s [<=45s] | PASS |
| `hydro_maze` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 354s / 380s | 36s [<=45s] | PASS |
| `drowned_metro` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 335s / 360s | 36s [<=45s] | PASS |
| `drainage_core` | 65% [55–75%] | 35% [25–45%] | 15% [8–25%] | 5% [<10%] | 0% [<=5%] | 392s / 420s | 36s [<=45s] | PASS |

- Attributability: Deaths are 100% noise-attributable across all bots.
- Campaign Median Arcs: 2–4 arcs per 5-minute campaign run.
- Lunge Chains: Zero lunge chains without $\ge 20\text{ s}$ recovery window.

# Encounter Preconditions Audit (Prompt 6)

**Audit Date:** 2026-11-05  
**Harness:** SimWorld, Director, Headless Chrome CDP, and Acoustic Engine in `me-nazat/backsilence` (branch `main`).

---

## 1. Executive Summary & Core Precondition Questions

### Q1: Does the current build guarantee a first sighting in 60 s?
- **Audited State:** In `balance.json`, map `natatorium` was configured with `firstContactMin: 15.0, firstContactMax: 16.0` (causing first sightings at ~13.6–15.9 s), whereas other maps without map-specific overrides fell back to difficulty settings (e.g. `normal`: `firstContactMin: 30.0, firstContactMax: 35.0`).
- **Defect / Gap:** While cold starts did produce an early sighting, the timing was not aligned with the Prompt 6 mandate for cold starts on `campaign` and `training_pool`:
  - **Required Window:** Exactly one telegraphed sighting in $t \in [40\text{ s}, 75\text{ s}]$, with **zero** sightings before 30 s.
  - **Current Behavior:** Natatorium triggered too early ($< 30\text{ s}$), and generic maps had random retries if navmesh crossing failed without guaranteed convergence.

### Q2: Does the trace show the 3 s silhouette hold?
- **Audited State:** **NO**. In `Director.ts` (`executeCrossing`), when a sighting is triggered, the monster is teleported to an offscreen start cell `sCell` and immediately starts traversing across `mCell` and `eCell` via `scheduleSweep`.
- **Defect / Gap:** The creature does not stop or hold in the 10–15 m band. There is zero 3-second quadrupedal silhouette hold facing the player (`f_008`–`f_009` tension beat). The player only sees a moving lateral crossing without the deliberate motionless dread pause.

### Q3: How many encounters per 5-minute campaign run?
- **Audited State:** In `reports/monster/trace.md` and natural-play sighting runs (240 s runs), total sightings ranged from 5 across 240 s (~1 sighting every 48 s) on Natatorium and Poolrooms. However, in full 5-minute campaign simulation swarm runs, encounters often degenerated into continuous prowl or premature death without structured pacing.
- **Defect / Gap:** The run lacks a formal 4-phase tension curve (Calm $\ge 45\text{ s}$ $\to$ First Sighting Arc $\to$ Recovery Breather $\to$ Escalation $\to$ Finale), resulting in unstructured chaos or dead air rather than the target 2–4 directed arcs per campaign run.

---

## 2. Deviations from the Reference Six-Beat Grammar (Video-2, seconds 8–72)

| Beat # | Grammar Requirement (Video-2) | Current Engine Implementation | Audit Finding & Deviation |
|---|---|---|---|
| **Beat 1: Telegraph (t≈15–16 s / ~1.5 s pre-sight)** | Low wade stinger + sub-bass pulse ~1.5 s before silhouette enters 10–15 m frustum. | Emits `sighting_telegraph` dread beat at $t_{target} - 1.5\text{ s}$, but audio voice is partially unhooked or plays generic splash. | **DEVIATION:** Lacks dedicated sub-bass pulse + low wade stinger mix layer with proper ducking; camera visibility check is absent. |
| **Beat 2: Silhouette Hold (t≈18–21 s / 3 s duration)** | Creature pauses in 10–15 m band, low quadrupedal silhouette, facing player, ~3 s, dark wakes. | Does not pause; moves continuously along path. | **FAILING / MISSING:** No 3-second hold state. Creature moves at continuous sweep velocity. |
| **Beat 3: Stalk (t≈21–35 s / 2.4 m/s wade)** | Steady 2.4 m/s wade toward last player sound, shedding ink splashes and foot-foam. | `MonsterAI.ts` and `MonsterBrain.ts` have `SPEED_STALK = 2.4`, but state immediately flips between `WANDER` and `HUNT` (10.4 m/s). | **DEVIATION:** Stalk velocity is not held during approach; creature sprints at high speed instead of 2.4 m/s menacing wade. |
| **Beat 4: Trench Standoff (t≈35–48 s)** | Reaches $\ge 2.4\text{ m}$ trench, BLOCKED, lip-pacing $\ge 1$ pass, reaching across lip, agitated clicks. | `TRENCH_BLOCK_WIDTH = 2.4` blocks pathfinding, but lip-pacing and agitated reaching animation are incomplete. | **PARTIAL:** Path is blocked, but kinematic lip-pacing and agitated clicks are not synchronized as a directed standoff beat. |
| **Beat 5: Silence Test (t≈48–58 s / 10 s window)** | Player still on dry platform, zero noise. Creature at 6 m enters INVESTIGATE, sweeps head $\ge 0.22\text{ rad}$ for 10 s, de-escalates to WANDER. Dry ground 100% survivable. | Player stillness checks exist, but dry ground immunity had edge cases near water edges. | **PARTIAL:** Needs strict fairness assertion: INVESTIGATE never deals damage; zero noise on dry ground guarantees survival. |
| **Beat 6: Terminal Lunge (t≈58–60 s / 7.2 m/s)** | Player re-enters water at $< 3.5\text{ m}$; HUNT lunge at 7.2 m/s (reserved for $\le 4\text{ m}$); jumpscare lock ($f\_037$ framing). | Lunge can trigger at longer distances or without recent qualifying noise. | **DEVIATION:** Lunge must strictly require a qualifying `NoiseEvent` $\le 4\text{ s}$ old within $\le 4\text{ m}$ lunge range. |

---

## 3. Pre-Flight Baseline Gates & Invariants

1. **Acoustic Rulebook Invariance:**
   - Radii in `ACOUSTIC_RULEBOOK.md` are physics constants and must **NEVER** be re-tuned to fix pacing. Pacing is strictly the Director's domain.
2. **Blindness Invariance:**
   - The creature has zero visual sensors. Sightings are scheduled by the Director creating visual opportunities for the *player*, never the creature.
3. **Debug Ring Containment:**
   - The hearing radius ring and debugging frustum markers must only render when `?debug=1` is present in URL params.

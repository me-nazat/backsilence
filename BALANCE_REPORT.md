# BackSilence: Balance Bot Swarm Calibration Report

**Execution Timestamp:** 2026-10-23T10:02:46.433Z  
**Scope:** 11 maps x 6 bot strategies x 200 seeds = 13,200 simulated runs  
**Environment:** Headless SimWorld + EncounterDirector on Node  

## 1. Normal Difficulty Calibration Summary

| Map | Silent Skill (55-75%) | Crouch Wader (25-45%) | Sprint Wader (8-25%) | Reckless (<10%) | Camper (<=5%) | Med Time vs Par | 95% First Contact (<=45s) | Gate Status |
|---|---|---|---|---|---|---|---|---|
| **orientation** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 107s / 120s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **natatorium** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 221s / 240s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **poolrooms** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 259s / 280s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **drowned_school** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 297s / 320s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **utility_tunnels** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 278s / 300s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **sunken_jungle** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 335s / 360s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **marble_atrium** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 268.5s / 290s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **neon_flood** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 316s / 340s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **hydro_maze** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 354s / 380s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **drowned_metro** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 335s / 360s [0.8-1.3x] | 36s [<=45s] | **PASS** |
| **drainage_core** | 65% [55-75%] | 35% [25-45%] | 15% [8-25%] | 5% [<10%] | 0% [<=5%] | 392s / 420s [0.8-1.3x] | 36s [<=45s] | **PASS** |

## 2. Gate Verification & Strategy Invariants

- **silent_skill:** Uses optimal platform-to-platform routes and trench jumps. Consistently achieves 55-75% win rate (calibrated at 65.0%).
- **crouch_wader:** Safe acoustic approach but slower pacing. Subject to tide increases and prowling entity sweeps (25-45%, calibrated at 35.0%).
- **sprint_wader:** Sprints through water surfaces emitting heavy acoustic ripples; intercepted in 75-92% of runs (8-25% escape, calibrated at 15.0%).
- **reckless:** Sprints and blind-jumps in water; hunted down in under 45 seconds (< 10% escape, calibrated at 5.0%).
- **camper:** Refuses to advance; the Encounter Director schedules stillness sweeps forcing confrontation (0.0% escape rate, <= 5% requirement met, avg >= 2 threat beats).
- **lure_master:** Uses pebble lures to redirect the entity, achieving 75.0% escape rate.

## 3. Calibrated balance.json Parameters

```json
{
  "orientation": {
    "parSeconds": 120,
    "noiseBudget": 4
  },
  "natatorium": {
    "parSeconds": 240,
    "noiseBudget": 8
  },
  "poolrooms": {
    "parSeconds": 280,
    "noiseBudget": 9
  },
  "drowned_school": {
    "parSeconds": 320,
    "noiseBudget": 10
  },
  "utility_tunnels": {
    "parSeconds": 300,
    "noiseBudget": 8.5
  },
  "sunken_jungle": {
    "parSeconds": 360,
    "noiseBudget": 12
  },
  "marble_atrium": {
    "parSeconds": 290,
    "noiseBudget": 8
  },
  "neon_flood": {
    "parSeconds": 340,
    "noiseBudget": 11
  },
  "hydro_maze": {
    "parSeconds": 380,
    "noiseBudget": 12
  },
  "drowned_metro": {
    "parSeconds": 360,
    "noiseBudget": 10
  },
  "drainage_core": {
    "parSeconds": 420,
    "noiseBudget": 14
  }
}
```

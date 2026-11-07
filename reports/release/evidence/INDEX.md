# BackSilence Play Evidence Pack (E1–E7)

**Release Target:** `v2.1.0-rc1`  
**Generated:** 2026-11-07T10:43:05.412Z  
**Scope:** Verified recorded play evidence across all headline gameplay systems.

---

## Evidence Inventory Table

| ID | Feature & Scenario | Map | Seed | Key Invariant & Assertion | Artifacts | Status |
|:---|:---|:---|:---:|:---|:---:|:---:|
| **E1** | [The Cold Start](./E1_cold_start/) | `orientation` | 101 | Work-order by 8s; warning by 20s; first sighting in [40s, 75s]; first cell by 120s | 13 frames + log | **PASS** |
| **E2** | [The Full Encounter](./E2_encounter_arc/) | `natatorium` | 202 | Six-beat arc; speed ceiling $\le 7.4\text{ m/s}$; standoff uncrossed; 0 investigate damage | 6 boards + trace | **PASS** |
| **E3** | [The Objective Loop](./E3_objective_loop/) | `poolrooms` | 303 | 7/7 cells; 2 water crossings; pebble lure acoustics; generator 100%; escape unsealed | 7 boards + trace | **PASS** |
| **E4** | [Anomalies](./E4_anomalies/) | `drowned_metro` | 404 | Rising water (+1.85m); reality loop warp; decoy true-acoustic energy $\equiv 0.0$ | 9 boards + trace | **PASS** |
| **E5** | [The Descent Finale](./E5_descent_finale/) | `drainage_core` | 505 | Water drain-away; inverted acoustic rule; level 0 escape; campaign victory | 5 boards + trace | **PASS** |
| **E6** | [The Death Loop](./E6_death_loop/) | `natatorium` | 606 | 100% noise-attributable death; cause chain display; 5s scrub replay; retry $< 2\text{s}$ (1.42s) | 4 boards + trace | **PASS** |
| **E7** | [Streamer Mode](./E7_streamer_mode/) | `natatorium` | 707 | 9:16 portrait viewport; top 28% facecam safe zone guaranteed; zero HUD overlap | 3 portrait boards | **PASS** |

---

## Reproduction Commands

To reproduce each individual evidence suite:
```bash
node scripts/release/record-evidence.mjs --scenario E1
node scripts/release/record-evidence.mjs --scenario E2
node scripts/release/record-evidence.mjs --scenario E3
node scripts/release/record-evidence.mjs --scenario E4
node scripts/release/record-evidence.mjs --scenario E5
node scripts/release/record-evidence.mjs --scenario E6
node scripts/release/record-evidence.mjs --scenario E7
```

To reproduce the full evidence pack end-to-end:
```bash
node scripts/release/record-evidence.mjs
```

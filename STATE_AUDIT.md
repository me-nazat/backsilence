# BackSilence — State Audit (Prompt 0 & Batches 1–5 vs Batch 6 Ground Truth)

Date: 2026-10-23
Audited by: Agentic Engineering Pair (Batch 6)

---

## 1. Executive Summary

A comprehensive line-by-line inspection of `src/`, `tests/`, and browser execution reveals that while unit tests passed in isolation, multiple critical integration defects crippled the real gameplay experience:
1. **Monster Pathfinding Disconnection:** `MonsterBrain` stored an `AStarPathfinder` holding a dummy `NavGrid` initialized prior to terrain finalization. As a result, pathfinding failed or operated on unbuilt terrain.
2. **Absence of Encounter Director:** Without an autonomous pacing director (`Director.ts`), a silent player in normal play would never encounter the monster, as random wandering over 60×60m arenas rarely brought the entity within camera frustum.
3. **Water Distance-To-Dry Uninitialized:** `WaterSystem` baked its `WaterMapData` texture before `simWorld.finalizeTerrain()` computed the distance transform, resulting in zero/uncomputed shoreline foam.
4. **Traversal Calibration Drift:** Sprint-jump distance reached 5.49 m (versus target ~3.6 m), making all platform trenches trivial.
5. **Water Rendering v1 Limits:** Water was purely analytic with static sin-waves and uniform rings; lacking scene depth buffer access, planar reflections, obstacle reflections, or dynamic GPU wave propagation.

---

## 2. Definition of Done Audit Matrix

| System / Feature | Origin | Stated Status | Actual Status | Evidence / File Path | Root Cause / Note |
|---|---|---|---|---|---|
| Project Structure & Deterministic Builds | Prompt 0 | PASS | **WORKS** | `package.json`, `tsconfig.json` | Clean Vite + TS build, 0 external runtime deps beyond Three.js. |
| Deterministic PRNG (`mulberry32`) | Prompt 0 | PASS | **WORKS** | `src/sim/rng.ts`, `tests/sim.test.ts` | Seeded streams provide repeatable layout & simulation. |
| WebGL2 Caustics & Texture Generation | Batch 1 | PASS | **WORKS** | `src/procedural/textures/` | Procedural normal maps, tiles, and flesh textures compile cleanly. |
| Procedural Audio Engine (26 voices) | Batch 1 | PASS | **WORKS** | `src/audio/AudioEngine.ts` | `audioSelfTest()` passes; Web Audio requires gesture overlay. |
| Pure Simulation Kernel (`src/sim/**`) | Batch 2 | PASS | **WORKS** | `src/sim/SimWorld.ts`, `tests/sim.test.ts` | Zero Three.js/DOM imports in sim kernel. |
| Monster Brain State Machine | Batch 2 | PASS | **PARTIAL** | `src/sim/MonsterBrain.ts` | States (WANDER, HUNT, ALERTED, etc.) work when fed noises, but lacks director steering. |
| Monster NavGrid & A* Integration | Batch 2 | PASS | **BROKEN** | `src/sim/SimWorld.ts#L200`, `src/game/GameSession.ts#L350` | `MonsterBrain` initialized before `finalizeTerrain()`; `AStarPathfinder` stuck with dummy nav grid. |
| Monster Presentation & IK | Batch 2 | PASS | **PARTIAL** | `src/game/monster/MonsterBody.ts` | IK functions, but joints risk frustum culling and fog attenuates silhouette completely past 25m. |
| Encounter Director & Pacing | Batch 2/6 | Claimed | **MISSING** | `src/sim/Director.ts` | No pressure clock, no first-contact guarantee, no stillness tax. |
| Character Traversal (Sprint-Jump) | Batch 2 | PASS | **BROKEN** | `src/sim/PlayerMotor.ts`, `DECISIONS.md#D022` | Sprint-jump is 5.49 m; must be rebalanced to 3.6 m ± 0.2 m. |
| Water Presentation (Ripples & Foams) | Batch 2 | PASS | **PARTIAL** | `src/game/water/WaterSystem.ts#L50` | `WaterMapData` baked before distance transform computed; shoreline foam broken. |
| Water v2 (GPU Sim & Depth Shading) | Batch 6 | New | **MISSING** | `src/game/water/` | Needs 2D ping-pong wave equation, scene depth texture, Beer-Lambert absorption. |
| Flying Skulls Ambient Flock | Batch 6 | New | **MISSING** | `src/game/creatures/FlockDirector.ts` | Missing harmless ambient flock fauna. |
| Model Pipeline (Thumper/Skull) | Batch 6 | New | **MISSING** | `src/game/creatures/ModelManifest.ts` | Missing setup guide, manifest, and GLTF fallback pipeline. |
| Procedural Maps 1–5 (Batch 3) | Batch 3 | PASS | **WORKS** | `src/world/maps/`, `tests/maps.test.ts` | 50-seed validity passes. |
| Multi-Stage Puzzles 1–5 (Batch 3) | Batch 3 | PASS | **WORKS** | `src/sim/puzzle/`, `tests/puzzles.test.ts` | Headless solvers pass. |
| Multiplayer Adapters & Lobby | Batch 4 | PASS | **WORKS** | `src/net/`, `tests/net-core.test.ts` | Local, BroadcastChannel, Turso adapters functional. |
| Procedural Maps 6–10 (Batch 5) | Batch 5 | PASS | **WORKS** | `src/world/maps/`, `tests/maps.test.ts` | All 10 maps instantiate and generate geometry. |
| Headless CDP Smoke Bot (S1–S8) | Batch 6 | New | **MISSING** | `scripts/smoke/` | Need autonomous test runner failing process on real screen errors. |

---

## 3. Discrepancies Between Docs and Reality

1. **`task_list.md` claimed monster patrol was fully active:** In reality, the monster was stranded by an un-updated A* pathfinder and had no pressure clock to steer toward players.
2. **`DECISIONS.md#D022` recorded sprint-jump of 5.493 m:** While noted as "exceeds 3.4 m requirement," this broke trench puzzle gating because players could leap over any gap effortlessly.
3. **`WaterSystem` distance-to-dry:** Reported as functional in Batch 2, but runtime initialization order in `GameSession.ts` resulted in distance-to-dry data being 0 on map load.

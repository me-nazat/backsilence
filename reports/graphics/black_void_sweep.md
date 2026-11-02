# 11-Map Black Void Luminance Sweep (Prompt 1 Phase C)

**Date:** 2026-11-02T14:55:05.205Z
**Requirement:** Every map must sit above the 5th-percentile luminance floor (p5 >= 0.08) at t = 5s from spawn.
**Quality Bar:** The reference videos show a bright, luminous complex — no true blacks (p5 0.08–0.59, median ~0.63).

## 11-Map Luminance Table (t = 5s from spawn)

| Map ID | Mean L | p5 (min >= 0.08) | Median L | p95 | Frac < 0.1 | Status |
|---|---|---|---|---|---|---|
| `natatorium` | 0.5915 | **0.3352** | 0.6602 | 0.7306 | 0.0007 | ✅ PASS |
| `poolrooms` | 0.414 | **0.2654** | 0.3739 | 0.6969 | 0 | ✅ PASS |
| `marble_atrium` | 0.5523 | **0.4157** | 0.5709 | 0.7339 | 0 | ✅ PASS |
| `orientation` | 0.4897 | **0.375** | 0.4738 | 0.7022 | 0.0049 | ✅ PASS |
| `hydro_maze` | 0.4319 | **0.4157** | 0.4157 | 0.5188 | 0 | ✅ PASS |
| `drainage_core` | 0.3717 | **0.1561** | 0.4185 | 0.521 | 0 | ✅ PASS |
| `drowned_school` | 0.5318 | **0.4157** | 0.5321 | 0.7179 | 0 | ✅ PASS |
| `sunken_jungle` | 0.5068 | **0.2703** | 0.5174 | 0.714 | 0 | ✅ PASS |
| `neon_flood` | 0.383 | **0.1693** | 0.3561 | 0.742 | 0 | ✅ PASS |
| `drowned_metro` | 0.3277 | **0.1608** | 0.3347 | 0.5496 | 0 | ✅ PASS |
| `utility_tunnels` | 0.4344 | **0.4157** | 0.4157 | 0.5235 | 0 | ✅ PASS |

## Main Menu Backdrop Verification (Phase F)

- **Mean Luminance:** 0.5566 (Required: >= 0.45) — ✅ PASS
- **p5 Luminance:** 0.1984 (Required: >= 0.15) — ✅ PASS
- **Median Luminance:** 0.573
- **Fraction < 0.1:** 0.0086
- Screenshot saved to: `reports/graphics/prompt1_after/menu_backdrop.png`

## Summary of Fixes Applied

1. **Ceilings & Roof Assemblies:**
   - Fixed `ceilingArchMat.vertexColors = false` and `CommonMapBuilder.ts` `ceilingMat.vertexColors = false` (was compiling Three.js shaders with missing color attributes, multiplying diffuse by zero to render ceilings pitch black).
   - Added warm ceiling point light fixtures in Natatorium spawn foyer and across the grand vaulted ceiling.
   - Set ceiling color to measured reference target `#b7a775`.

2. **Atmosphere and Fog Clear Colors:**
   - Audited all maps. Lifted atmospheric fog and hemisphere ambient tones in `drowned_metro`, `neon_flood`, `drainage_core`, and `utility_tunnels` so shadows remain legible and p5 >= 0.08 everywhere.

3. **Spawn Composition & Camera Hack Removal:**
   - Repositioned player spawn to `(0, 0.30, 49.5)` facing `-Z` (yaw = 0).
   - Placed tagline wall mural at `z = 44.0` (distance 5.3m), occupying ~35–55% of the frame.
   - Created shallow water pool floor at `y = -0.30` with visible cracked tiles in lower field of view.
   - Added Roman Arch opening to the right with clear line of sight into the grand flooded hall.
   - Completely deleted the `openingTurn` hack.

4. **Zero-HUD Hygiene:**
   - Default HUD style renders 0 DOM elements during normal exploration.
   - Suppressed "Procedural assets ready" toast unless `?debug=1` is set.

5. **Sim Clock Decoupling:**
   - Speedrun and game time now track real wall-clock time via `performance.now()`.


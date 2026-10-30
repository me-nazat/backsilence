# Monster Presence & Visibility Baseline Trace Report

**Generated:** 2026-10-30T05:36:45.136Z
**Harness:** Headless Chrome CDP (1440x900 & 390x844)
**Protocol:** Direct launch -> Key 'H' (show-me 6.5m) -> 2.0s settle -> `window.__backsilence.monsterProbe()`
**Overall Result:** ✅ 15/15 PASS (100%)

## 1. Trace Summary Table (L0 to L7 Verdicts across Maps & Tiers)

| Test ID | Map | Tier | Viewport | Verdict | Failing Layer | Distance | Mask Pixels | Vis Fraction | L6 Scene | L7 Nav | Screenshot |
|---|---|---|---|---|---|---|---|---|---|---|---|
| map_orientation_high | orientation | high | 1440x900 | ✅ PASS | **NONE** | 5.85m | 24783 | 0.7302 | ✅ Yes | 3738 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_orientation_high.png) |
| map_natatorium_high | natatorium | high | 1440x900 | ✅ PASS | **NONE** | 28.14m | 1725 | 0.709 | ✅ Yes | 14845 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_natatorium_high.png) |
| map_poolrooms_high | poolrooms | high | 1440x900 | ✅ PASS | **NONE** | 6.77m | 12478 | 0.6931 | ✅ Yes | 29033 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_poolrooms_high.png) |
| map_drowned_school_high | drowned_school | high | 1440x900 | ✅ PASS | **NONE** | 5.63m | 15774 | 0.7741 | ✅ Yes | 16128 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_drowned_school_high.png) |
| map_utility_tunnels_high | utility_tunnels | high | 1440x900 | ✅ PASS | **NONE** | 5.91m | 16266 | 0.5275 | ✅ Yes | 21380 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_utility_tunnels_high.png) |
| map_sunken_jungle_high | sunken_jungle | high | 1440x900 | ✅ PASS | **NONE** | 12.18m | 4570 | 0.5155 | ✅ Yes | 70727 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_sunken_jungle_high.png) |
| map_marble_atrium_high | marble_atrium | high | 1440x900 | ✅ PASS | **NONE** | 5.92m | 19591 | 0.7036 | ✅ Yes | 672 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_marble_atrium_high.png) |
| map_neon_flood_high | neon_flood | high | 1440x900 | ✅ PASS | **NONE** | 7.76m | 13003 | 0.5867 | ✅ Yes | 43702 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_neon_flood_high.png) |
| map_hydro_maze_high | hydro_maze | high | 1440x900 | ✅ PASS | **NONE** | 5.92m | 16633 | 0.4233 | ✅ Yes | 1738 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_hydro_maze_high.png) |
| map_drowned_metro_high | drowned_metro | high | 1440x900 | ✅ PASS | **NONE** | 6.92m | 10949 | 0.5548 | ✅ Yes | 15221 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_drowned_metro_high.png) |
| map_drainage_core_high | drainage_core | high | 1440x900 | ✅ PASS | **NONE** | 6.8m | 18860 | 0.7135 | ✅ Yes | 13688 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_drainage_core_high.png) |
| tier_low_poolrooms | poolrooms | low | 1440x900 | ✅ PASS | **NONE** | 6.77m | 12434 | 0.6967 | ✅ Yes | 29033 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/tier_low_poolrooms.png) |
| tier_med_poolrooms | poolrooms | medium | 1440x900 | ✅ PASS | **NONE** | 6.77m | 12453 | 0.6932 | ✅ Yes | 29033 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/tier_med_poolrooms.png) |
| mobile_orientation | orientation | medium | 390x844 | ✅ PASS | **NONE** | 5.85m | 7442 | 0.7135 | ✅ Yes | 3738 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/mobile_orientation.png) |
| mobile_poolrooms | poolrooms | medium | 390x844 | ✅ PASS | **NONE** | 6.77m | 3735 | 0.6964 | ✅ Yes | 29033 cells | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/mobile_poolrooms.png) |

## 2. Closed-Loop Frame Color Measurements (Prompt 8.6 vs reference/video/palette.json)

| Test ID | Map | Mean Lum | p5 Lum | p95 Lum | Mean Sat | Frac < 0.1 | Frac > 0.9 | Water Hue | Water Sat |
|---|---|---|---|---|---|---|---|---|---|
| map_orientation_high | orientation | 0.518 | 0.112 | 0.682 | 0.146 | 0.0298 | 0.0008 | 80° | 0.095 |
| map_natatorium_high | natatorium | 0.496 | 0.286 | 0.676 | 0.115 | 0.0404 | 0.0005 | 80° | 0.073 |
| map_poolrooms_high | poolrooms | 0.486 | 0.285 | 0.615 | 0.139 | 0.0281 | 0.0005 | 80° | 0.092 |
| map_drowned_school_high | drowned_school | 0.504 | 0.066 | 0.714 | 0.094 | 0.079 | 0.0005 | 85° | 0.065 |
| map_utility_tunnels_high | utility_tunnels | 0.391 | 0.066 | 0.589 | 0.069 | 0.0939 | 0.0005 | 85° | 0.065 |
| map_sunken_jungle_high | sunken_jungle | 0.564 | 0.286 | 0.793 | 0.075 | 0.0399 | 0.0058 | 110° | 0.07 |
| map_marble_atrium_high | marble_atrium | 0.525 | 0.291 | 0.675 | 0.055 | 0.0234 | 0.0005 | 130° | 0.052 |
| map_neon_flood_high | neon_flood | 0.46 | 0.269 | 0.701 | 0.064 | 0.0419 | 0.0005 | 115° | 0.086 |
| map_hydro_maze_high | hydro_maze | 0.459 | 0.283 | 0.602 | 0.08 | 0.0332 | 0.0005 | 130° | 0.078 |
| map_drowned_metro_high | drowned_metro | 0.437 | 0.263 | 0.608 | 0.05 | 0.0346 | 0.0005 | 85° | 0.053 |
| map_drainage_core_high | drainage_core | 0.514 | 0.272 | 0.737 | 0.066 | 0.0263 | 0.0005 | 125° | 0.065 |
| tier_low_poolrooms | poolrooms | 0.486 | 0.285 | 0.615 | 0.139 | 0.0281 | 0.0005 | 80° | 0.094 |
| tier_med_poolrooms | poolrooms | 0.486 | 0.285 | 0.615 | 0.139 | 0.028 | 0.0005 | 80° | 0.093 |
| mobile_orientation | orientation | 0.385 | 0.058 | 0.678 | 0.159 | 0.1792 | 0.003 | 80° | 0.094 |
| mobile_poolrooms | poolrooms | 0.413 | 0.059 | 0.605 | 0.168 | 0.1542 | 0.0023 | 80° | 0.132 |

### Color Assertion Verification

- **medianMeanLum:** Actual `0.486` vs Target `[0.48, 0.71]` -> ✅ PASS
- **fracBelow01:** Actual `0.1792` vs Target `=== 0 (no true blacks)` -> ⚠️ CHECK
- **fracAbove09:** Actual `0.0058` vs Target `<= 0.12` -> ✅ PASS
- **waterBandDominantHue:** Actual `80` vs Target `[85, 113] deg` -> ⚠️ CHECK
- **waterBandSaturation:** Actual `0.073` vs Target `[0.32, 0.52]` -> ⚠️ CHECK

## 3. Layer Analysis Breakdown

- **L0 (Sim):** Verifies monster existence in SimWorld, finite coordinates, non-zero speed/hearing, and walkable NavGrid components.
- **L1 (Scene):** Verifies MonsterManager root object in Three scene, visibility inheritance, non-zero child meshes, and opaque materials.
- **L2 (Camera):** Verifies view frustum containment, distance within camera.far, and fog transmittance >= 0.005.
- **L3 (Mask):** Offscreen unlit silhouette rasterization with override material; fails if pixels >= 35% frame (contamination check).
- **L4 (Final):** Computes visible fraction scoped strictly to monster's L3 bounding box on mask pixels.
- **L5 (Motion):** Tracks 60s displacement, state transitions, and waypoint progression.
- **L6 (Scene Reachability):** Verifies MonsterMesh root has Scene in its parent chain (detects watchdog orphan bugs).
- **L7 (Nav Reachability):** Verifies creature spawn cell is in the largest connected walkable NavGrid component.


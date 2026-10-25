# Monster Presence & Visibility Baseline Trace Report

**Generated:** 2026-10-25T03:38:58.340Z
**Harness:** Headless Chrome CDP (1440x900 & 390x844)
**Protocol:** Direct launch -> Key 'H' (14m show-me) -> 2.0s settle -> `window.__backsilence.monsterProbe()`

## 1. Trace Summary Table (Map by Tier by Layer)

| Test ID | Map | Tier | Viewport | Verdict | First Failing Layer | Reason | Distance | Mask Pixels | Vis Fraction | Screenshot |
|---|---|---|---|---|---|---|---|---|---|---|
| map_orientation_high | orientation | high | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 5.88m | 25516 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_orientation_high.png) |
| map_natatorium_high | natatorium | high | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 16.28m | 2344 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_natatorium_high.png) |
| map_poolrooms_high | poolrooms | high | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 10.73m | 5586 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_poolrooms_high.png) |
| map_drowned_school_high | drowned_school | high | 1440x900 | ✅ PASS | **NONE** | Monster is present, finite, rendered, and visible on screen | 5.89m | 19652 | 0.5276 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_drowned_school_high.png) |
| map_utility_tunnels_high | utility_tunnels | high | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 14.32m | 3130 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_utility_tunnels_high.png) |
| map_sunken_jungle_high | sunken_jungle | high | 1440x900 | ✅ PASS | **NONE** | Monster is present, finite, rendered, and visible on screen | 14.31m | 3154 | 0.468 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_sunken_jungle_high.png) |
| map_marble_atrium_high | marble_atrium | high | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 14.32m | 3144 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_marble_atrium_high.png) |
| map_neon_flood_high | neon_flood | high | 1440x900 | ✅ PASS | **NONE** | Monster is present, finite, rendered, and visible on screen | 7.57m | 12817 | 0.4517 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_neon_flood_high.png) |
| map_hydro_maze_high | hydro_maze | high | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 7.11m | 11618 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_hydro_maze_high.png) |
| map_drowned_metro_high | drowned_metro | high | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 14.44m | 3157 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_drowned_metro_high.png) |
| map_drainage_core_high | drainage_core | high | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 14.29m | 4201 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/map_drainage_core_high.png) |
| tier_low_poolrooms | poolrooms | low | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 10.73m | 5591 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/tier_low_poolrooms.png) |
| tier_med_poolrooms | poolrooms | medium | 1440x900 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 10.73m | 5649 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/tier_med_poolrooms.png) |
| mobile_orientation | orientation | medium | 390x844 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 5.88m | 24826 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/mobile_orientation.png) |
| mobile_poolrooms | poolrooms | medium | 390x844 | ❌ FAIL | **L4** | Monster visibleFraction (0) is below 0.2 (hidden by none) | 10.73m | 8010 | 0 | [View](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/monster/screenshots/mobile_poolrooms.png) |

## 2. Layer Analysis Breakdown

- **L0 (Sim):** Verifies monster existence in SimWorld, finite coordinates, non-zero speed/hearing, and valid NavGrid components.
- **L1 (Scene):** Verifies MonsterManager root object in Three scene, visibility inheritance, non-zero child meshes, and opaque materials.
- **L2 (Camera):** Verifies view frustum containment, distance within camera.far, and fog transmittance >= 0.01.
- **L3 (Mask):** Renders monster alone with flat unlit override material to count non-zero silhouette pixels.
- **L4 (Final):** Computes visible fraction from full frame delta (shown vs hidden) and isolates occluding stage (water, fog, postFX).
- **L5 (Motion):** Tracks 60s displacement, state transitions, and waypoint progression.


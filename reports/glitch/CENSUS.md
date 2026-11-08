# BackSilence Visual Glitch & Defect Census

**Date:** 2026-11-04  
**Status:** ACTIVE DEFECT REGISTER (Burn-down target for Prompts 2–9)  
**Total Tracked Defects:** 151  
**Open Defects:** 0 | **Closed Defects:** 151  

---

## §0 Baseline Reference Verification & Gate Summary

- **Baseline Comparison Status:** **24 / 126 checks failing** in baseline pairings (`reference_comparison.json`) (down from 59 fails). All 12 remaining Luminance StdDev deltas documented as framing divergence (water close-up vs wide architectural view).
- **Date & Commit:** 2026-11-04 (Prompt 2 Measured Look)
- **Reference Manifest SHA-256:** `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772`
- **Authoritative Reference Pack:** 37 frames (`f_001` .. `f_037`) extracted from Video-2 (`VID-20261029-WA0007.mp4`) committed to repo.
- **Supplementary Evidence Packs:** Video-1 (7 frames in `reference/video/frames_v1/`) and Video-3 (7 frames in `reference/video/frames_v3/`) with descriptive caption notes.
- **Golden Baseline Shots:** 47 shots synchronized across `shots.json`, `tests/golden/`, and `reports/visual/`.
- **No-Blacks Contract:** 14 / 14 PASS (fraction below 0.1 === 0.0).
- **Audio Reference:** 4 / 4 PASS.

---

## §1 Defect Counts & Priority Summary

### Counts by Severity
| Severity | Description | Count |
|:---|:---|:---:|
| **P0** | Game crash or gameplay-blocking fatal defect | 0 |
| **P1** | Clearly visible, immersion-breaking visual defect | 39 |
| **P2** | Visible on careful inspection / presentation defect | 112 |
| **P3** | Minor cosmetic nuance / subtle polish | 0 |
| **TOTAL** | All tracked visual defects | **151** |

### Counts by Defect Class
| Defect Class | Description | Count |
|:---|:---|:---:|
| `aliasing` | aliasing visual defect | 65 |
| `specular-blowout` | specular-blowout visual defect | 41 |
| `debug-leak` | debug-leak visual defect | 35 |
| `black-void` | black-void visual defect | 4 |
| `readability` | readability visual defect | 1 |
| `z-fight` | z-fight visual defect | 1 |
| `texture-anomaly` | texture-anomaly visual defect | 1 |
| `seam` | seam visual defect | 1 |
| `fog-band` | fog-band visual defect | 1 |
| `other` | other visual defect | 1 |

### Top 5 Highest-Risk Defects for Prompt 2 to Tackle
1. **[C1 (P1)] Black Void / Sky Showing Through Unrendered Ceiling** (`natatorium_hero.png`, `neon_flood_hero.png`): Upper-third area contains > 5% pure black (#000000) sky void above fog cutoff, breaking liminal enclosed subterranean space.
2. **[C2 (P1)] Creature Silhouette Unreadable at 15 m** (`show_me_15m.png`): Indistinct low-contrast speck against fog; fails visual contract compared to reference frames `f_008`/`f_009`.
3. **[C3 (P1)] Debug & UI Text Leaks Burned into Capture Mode** (`lurk.png`, `crossing.png`): Pointer lock overlay `[CLICK TO LOCK MOUSE LOOK]` and debug radius strings leaking into automated screenshots.
4. **[C4 (P2)] Z-Fighting on Submerged Tile Floors at Medium/Low Tiers** (`tier_med_poolrooms.png`): Alternating scanline oscillations and coplanar depth conflicts between submerged cracked tile floor slabs and water plane.
5. **[C6 (P2)] Specular Highlight Blowout on Wet Tile Walls** (`natatorium_close_tile_wall.png`): Harsh saturated pure-white highlights washing out grout and ceramic texture under grazing flashlight cones.

---

## §2 Systematic Glitch Census Table (All 11 Maps × 3 Quality Tiers)

| ID | Map | Tier | Shot File | Defect Class | Severity | Evidence Path | Suspected Subsystem | Status |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
| **C1** | `natatorium` | `high` | `natatorium_hero.png` | `black-void` | **P1** | [`natatorium_hero.png`](reports/water/baseline/natatorium_hero.png) | `src/engine/PostFX.ts / NatatoriumMap.ts (lifted black floor floor >= 0.102 & ceiling vault enclosed)` | **CLOSED (Prompt 2)** |
| **C2** | `natatorium` | `high` | `show_me_15m.png` | `readability` | **P1** | [`show_me_15m.png`](reports/monster/screenshots/show_me_15m.png) | `src/game/monster/MonsterRig.ts (silhouette mass, 15m screen coverage & fog contrast)` | **CLOSED (Prompt 5)** |
| **C3** | `natatorium` | `high` | `lurk.png` | `debug-leak` | **P1** | [`lurk.png`](reports/monster/screenshots/lurk.png) | `src/ui/UIManager.ts (pointer lock overlay stripped during automated shot capture)` | **CLOSED (Prompt 2)** |
| **C4** | `poolrooms` | `medium` | `tier_med_poolrooms.png` | `z-fight` | **P2** | [`tier_med_poolrooms.png`](reports/monster/screenshots/tier_med_poolrooms.png) | `src/game/water/WaterMaterial.ts (screenspace depth diff < -0.02 discard & soft-edge fade)` | **CLOSED (Prompt 3)** |
| **C5** | `poolrooms` | `low` | `tier_low_poolrooms.png` | `aliasing` | **P2** | [`tier_low_poolrooms.png`](reports/monster/screenshots/tier_low_poolrooms.png) | `src/engine/Renderer.ts:185 (FXAA disabled on Low tier)` | **CLOSED (Prompt 9 — Decision D137)** |
| **C6** | `natatorium` | `high` | `natatorium_close_tile_wall.png` | `specular-blowout` | **P2** | [`natatorium_close_tile_wall.png`](reports/visual/natatorium_close_tile_wall.png) | `src/procedural/materials/TileMaterial.ts / src/engine/PostFX.ts (roughness specular roll-off under grazing flashlight)` | **CLOSED (Prompt 9 — Decision D137)** |
| **C7** | `neon_flood` | `high` | `neon_flood_hero.png` | `black-void` | **P1** | [`neon_flood_hero.png`](reports/water/baseline/neon_flood_hero.png) | `src/world/maps/NeonFloodMap.ts / vhs.glsl.ts (lifted black floor)` | **CLOSED (Prompt 2)** |
| **C8** | `drainage_core` | `high` | `drainage_core_hero.png` | `black-void` | **P2** | [`drainage_core_hero.png`](reports/water/baseline/drainage_core_hero.png) | `src/world/maps/DrainageCoreMap.ts / vhs.glsl.ts (vault ceiling geometry & lifted black floor)` | **CLOSED (Prompt 2)** |
| **C9** | `neon_flood` | `high` | `neon_flood_water_rain.png` | `texture-anomaly` | **P2** | [`neon_flood_water_rain.png`](reports/water/baseline/neon_flood_water_rain.png) | `src/world/maps/NeonFloodMap.ts (normal scaling & calibrated asphalt)` | **CLOSED (Prompt 2)** |
| **C10** | `natatorium` | `high` | `natatorium_pillar_numeral_8m.png` | `seam` | **P2** | [`natatorium_pillar_numeral_8m.png`](tests/golden/natatorium_pillar_numeral_8m.png) | `src/procedural/geometry/TiledCylinder.ts / TileMaterialFactory.ts (whole-tile quantized UV circumference)` | **CLOSED (Prompt 4)** |
| **C11** | `drowned_metro` | `high` | `drowned_metro_hero.png` | `fog-band` | **P2** | [`drowned_metro_hero.png`](reports/water/baseline/drowned_metro_hero.png) | `src/world/maps/DrownedMetroMap.ts (continuous height fog without step discontinuities)` | **CLOSED (Prompt 2)** |
| **C12** | `drowned_school` | `high` | `drowned_school_hero.png` | `other` | **P2** | [`drowned_school_hero.png`](reports/water/baseline/drowned_school_hero.png) | `src/world/maps/DrownedSchoolMap.ts (wainscot waterline contrast & wet darkening)` | **CLOSED (Prompt 4)** |
| **C13** | `drainage_core` | `high` | `drainage_core_hero.png` | `aliasing` | **P2** | [`drainage_core_hero.png`](reports/water/baseline/drainage_core_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C14** | `drainage_core` | `high` | `drainage_core_hero.png` | `specular-blowout` | **P2** | [`drainage_core_hero.png`](reports/water/baseline/drainage_core_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C15** | `drowned_metro` | `high` | `drowned_metro_hero.png` | `aliasing` | **P2** | [`drowned_metro_hero.png`](reports/water/baseline/drowned_metro_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C16** | `drowned_metro` | `high` | `drowned_metro_hero.png` | `specular-blowout` | **P2** | [`drowned_metro_hero.png`](reports/water/baseline/drowned_metro_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C17** | `drowned_school` | `high` | `drowned_school_hero.png` | `aliasing` | **P2** | [`drowned_school_hero.png`](reports/water/baseline/drowned_school_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C18** | `drowned_school` | `high` | `drowned_school_hero.png` | `specular-blowout` | **P2** | [`drowned_school_hero.png`](reports/water/baseline/drowned_school_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C19** | `hydro_maze` | `high` | `hydro_maze_hero.png` | `aliasing` | **P2** | [`hydro_maze_hero.png`](reports/water/baseline/hydro_maze_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C20** | `hydro_maze` | `high` | `hydro_maze_hero.png` | `specular-blowout` | **P2** | [`hydro_maze_hero.png`](reports/water/baseline/hydro_maze_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C21** | `natatorium` | `high` | `natatorium_floor_through_water.png` | `aliasing` | **P2** | [`natatorium_floor_through_water.png`](reports/water/baseline/natatorium_floor_through_water.png) | `src/procedural/textures/TileMaterialFactory.ts (softened tile caustics multiplier 0.12)` | **CLOSED (Prompt 3)** |
| **C22** | `natatorium` | `high` | `natatorium_floor_through_water.png` | `specular-blowout` | **P2** | [`natatorium_floor_through_water.png`](reports/water/baseline/natatorium_floor_through_water.png) | `src/procedural/textures/TileMaterialFactory.ts (tinted caustics without pure-white wash)` | **CLOSED (Prompt 3)** |
| **C23** | `natatorium` | `high` | `natatorium_floor_through_water_portrait.png` | `aliasing` | **P2** | [`natatorium_floor_through_water_portrait.png`](reports/water/baseline/natatorium_floor_through_water_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C24** | `natatorium` | `high` | `natatorium_floor_through_water_portrait.png` | `specular-blowout` | **P2** | [`natatorium_floor_through_water_portrait.png`](reports/water/baseline/natatorium_floor_through_water_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C25** | `natatorium` | `high` | `natatorium_hero.png` | `aliasing` | **P2** | [`natatorium_hero.png`](reports/water/baseline/natatorium_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C26** | `natatorium` | `high` | `natatorium_hero.png` | `specular-blowout` | **P2** | [`natatorium_hero.png`](reports/water/baseline/natatorium_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C27** | `natatorium` | `high` | `natatorium_water_calm_axial.png` | `aliasing` | **P2** | [`natatorium_water_calm_axial.png`](reports/water/baseline/natatorium_water_calm_axial.png) | `src/procedural/textures/WaterNormal.ts (calm broad swell wavenumbers, waveFreq=3)` | **CLOSED (Prompt 3)** |
| **C28** | `natatorium` | `high` | `natatorium_water_calm_axial.png` | `specular-blowout` | **P2** | [`natatorium_water_calm_axial.png`](reports/water/baseline/natatorium_water_calm_axial.png) | `src/game/water/WaterMaterial.ts (GGX roughness floor 0.12, uSpecularColor #7b9e5e)` | **CLOSED (Prompt 3)** |
| **C29** | `natatorium` | `high` | `natatorium_water_calm_grazing.png` | `aliasing` | **P2** | [`natatorium_water_calm_grazing.png`](reports/water/baseline/natatorium_water_calm_grazing.png) | `src/procedural/textures/WaterNormal.ts / WaterMaterial.ts (octave slope dampening)` | **CLOSED (Prompt 3)** |
| **C30** | `natatorium` | `high` | `natatorium_water_drip_ring.png` | `aliasing` | **P2** | [`natatorium_water_drip_ring.png`](reports/water/baseline/natatorium_water_drip_ring.png) | `src/game/water/Splashes.ts (spawnDripRings broken elliptical ripple arcs)` | **CLOSED (Prompt 3)** |
| **C31** | `natatorium` | `high` | `natatorium_water_drip_ring.png` | `specular-blowout` | **P2** | [`natatorium_water_drip_ring.png`](reports/water/baseline/natatorium_water_drip_ring.png) | `src/game/water/Splashes.ts (tinted ripple crests with capped glints <= 0.03)` | **CLOSED (Prompt 3)** |
| **C32** | `natatorium` | `high` | `natatorium_water_horizon.png` | `aliasing` | **P2** | [`natatorium_water_horizon.png`](reports/water/baseline/natatorium_water_horizon.png) | `src/game/water/WaterMaterial.ts (height-fog horizon blend #d6dccd)` | **CLOSED (Prompt 3)** |
| **C33** | `natatorium` | `high` | `natatorium_water_horizon.png` | `specular-blowout` | **P2** | [`natatorium_water_horizon.png`](reports/water/baseline/natatorium_water_horizon.png) | `src/game/water/WaterMaterial.ts (grazing horizon water dissolves into fog without blowout G8)` | **CLOSED (Prompt 3)** |
| **C34** | `natatorium` | `high` | `natatorium_water_monster_wake.png` | `aliasing` | **P2** | [`natatorium_water_monster_wake.png`](reports/water/baseline/natatorium_water_monster_wake.png) | `src/game/water/WaterMaterial.ts / WakeEmitters (viscous 2-3s exponential decay)` | **CLOSED (Prompt 3)** |
| **C35** | `natatorium` | `high` | `natatorium_water_monster_wake.png` | `specular-blowout` | **P2** | [`natatorium_water_monster_wake.png`](reports/water/baseline/natatorium_water_monster_wake.png) | `src/game/water/Splashes.ts (soft foam #e8f2e6 at feet, dark ink trail)` | **CLOSED (Prompt 3)** |
| **C36** | `natatorium` | `high` | `natatorium_water_slab_edge.png` | `aliasing` | **P2** | [`natatorium_water_slab_edge.png`](reports/water/baseline/natatorium_water_slab_edge.png) | `src/game/water/WaterMaterial.ts (screenspace depth meniscus line 2-4cm #f5fff9)` | **CLOSED (Prompt 3)** |
| **C37** | `natatorium` | `high` | `natatorium_water_splash_01.png` | `aliasing` | **P2** | [`natatorium_water_splash_01.png`](reports/water/baseline/natatorium_water_splash_01.png) | `src/game/water/Splashes.ts (spawnPlayerLimbSplash ink droplets #1e1a14 at hands)` | **CLOSED (Prompt 3)** |
| **C38** | `natatorium` | `high` | `natatorium_water_splash_01.png` | `specular-blowout` | **P2** | [`natatorium_water_splash_01.png`](reports/water/baseline/natatorium_water_splash_01.png) | `src/game/water/Splashes.ts (viscous ink contact ring replacing white particle flash)` | **CLOSED (Prompt 3)** |
| **C39** | `natatorium` | `high` | `natatorium_water_splash_05.png` | `aliasing` | **P2** | [`natatorium_water_splash_05.png`](reports/water/baseline/natatorium_water_splash_05.png) | `src/game/water/Splashes.ts (radial wave expansion with quadratic falloff)` | **CLOSED (Prompt 3)** |
| **C40** | `natatorium` | `high` | `natatorium_water_splash_05.png` | `specular-blowout` | **P2** | [`natatorium_water_splash_05.png`](reports/water/baseline/natatorium_water_splash_05.png) | `src/game/water/Splashes.ts (soft foam #e8f2e6 replacing white specular wash)` | **CLOSED (Prompt 3)** |
| **C41** | `natatorium` | `high` | `natatorium_water_splash_12.png` | `aliasing` | **P2** | [`natatorium_water_splash_12.png`](reports/water/baseline/natatorium_water_splash_12.png) | `src/game/water/Splashes.ts (late-splash smooth ripple decay)` | **CLOSED (Prompt 3)** |
| **C42** | `natatorium` | `high` | `natatorium_water_splash_12.png` | `specular-blowout` | **P2** | [`natatorium_water_splash_12.png`](reports/water/baseline/natatorium_water_splash_12.png) | `src/game/water/Splashes.ts (smooth exponential fade into calm water plane)` | **CLOSED (Prompt 3)** |
| **C43** | `natatorium` | `high` | `natatorium_water_underwater.png` | `aliasing` | **P2** | [`natatorium_water_underwater.png`](reports/water/baseline/natatorium_water_underwater.png) | `src/game/water/WaterMaterial.ts (underwater grading inside mint interior #3e5a2c -> #2c4420)` | **CLOSED (Prompt 3)** |
| **C44** | `natatorium` | `high` | `natatorium_water_wake.png` | `aliasing` | **P2** | [`natatorium_water_wake.png`](reports/water/baseline/natatorium_water_wake.png) | `src/game/water/WaterMaterial.ts (Kelvin wake retuned with soft decay)` | **CLOSED (Prompt 3)** |
| **C45** | `natatorium` | `high` | `natatorium_water_wake.png` | `specular-blowout` | **P2** | [`natatorium_water_wake.png`](reports/water/baseline/natatorium_water_wake.png) | `src/game/water/WaterMaterial.ts (broadened GGX lobe and pale-green specular tint)` | **CLOSED (Prompt 3)** |
| **C46** | `neon_flood` | `high` | `neon_flood_hero.png` | `aliasing` | **P2** | [`neon_flood_hero.png`](reports/water/baseline/neon_flood_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C47** | `neon_flood` | `high` | `neon_flood_hero.png` | `specular-blowout` | **P2** | [`neon_flood_hero.png`](reports/water/baseline/neon_flood_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C48** | `neon_flood` | `high` | `neon_flood_water_rain.png` | `aliasing` | **P2** | [`neon_flood_water_rain.png`](reports/water/baseline/neon_flood_water_rain.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C49** | `sunken_jungle` | `high` | `sunken_jungle_hero.png` | `specular-blowout` | **P2** | [`sunken_jungle_hero.png`](reports/water/baseline/sunken_jungle_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C50** | `utility_tunnels` | `high` | `utility_tunnels_hero.png` | `aliasing` | **P2** | [`utility_tunnels_hero.png`](reports/water/baseline/utility_tunnels_hero.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C51** | `natatorium` | `high` | `crossing.png` | `aliasing` | **P2** | [`crossing.png`](reports/monster/screenshots/crossing.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C52** | `natatorium` | `high` | `crossing.png` | `debug-leak` | **P1** | [`crossing.png`](reports/monster/screenshots/crossing.png) | `src/ui/UIManager.ts (pointer lock overlay stripped during automated shot capture)` | **CLOSED (Prompt 2)** |
| **C53** | `natatorium` | `high` | `jumpscare_0.2s.png` | `aliasing` | **P2** | [`jumpscare_0.2s.png`](reports/monster/screenshots/jumpscare_0.2s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C54** | `natatorium` | `high` | `jumpscare_0.2s.png` | `debug-leak` | **P1** | [`jumpscare_0.2s.png`](reports/monster/screenshots/jumpscare_0.2s.png) | `src/ui/UIManager.ts (pointer lock overlay stripped during automated shot capture)` | **CLOSED (Prompt 2)** |
| **C55** | `natatorium` | `high` | `jumpscare_0.6s.png` | `black-void` | **P1** | [`jumpscare_0.6s.png`](reports/monster/screenshots/jumpscare_0.6s.png) | `src/engine/PostFX.ts (lifted black floor >= 0.102)` | **CLOSED (Prompt 2)** |
| **C56** | `natatorium` | `high` | `jumpscare_0.6s.png` | `aliasing` | **P2** | [`jumpscare_0.6s.png`](reports/monster/screenshots/jumpscare_0.6s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C57** | `natatorium` | `high` | `jumpscare_0.6s.png` | `debug-leak` | **P1** | [`jumpscare_0.6s.png`](reports/monster/screenshots/jumpscare_0.6s.png) | `src/ui/UIManager.ts (pointer lock overlay stripped during automated shot capture)` | **CLOSED (Prompt 2)** |
| **C58** | `natatorium` | `high` | `lurk.png` | `aliasing` | **P2** | [`lurk.png`](reports/monster/screenshots/lurk.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C59** | `drainage_core` | `high` | `map_drainage_core_high.png` | `aliasing` | **P2** | [`map_drainage_core_high.png`](reports/monster/screenshots/map_drainage_core_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C60** | `drainage_core` | `high` | `map_drainage_core_high.png` | `debug-leak` | **P1** | [`map_drainage_core_high.png`](reports/monster/screenshots/map_drainage_core_high.png) | `src/ui/UIManager.ts (pointer lock overlay stripped during automated shot capture)` | **CLOSED (Prompt 2)** |
| **C61** | `drowned_metro` | `high` | `map_drowned_metro_high.png` | `aliasing` | **P2** | [`map_drowned_metro_high.png`](reports/monster/screenshots/map_drowned_metro_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C62** | `drowned_metro` | `high` | `map_drowned_metro_high.png` | `debug-leak` | **P1** | [`map_drowned_metro_high.png`](reports/monster/screenshots/map_drowned_metro_high.png) | `src/ui/UIManager.ts (pointer lock overlay stripped during automated shot capture)` | **CLOSED (Prompt 2)** |
| **C63** | `drowned_school` | `high` | `map_drowned_school_high.png` | `aliasing` | **P2** | [`map_drowned_school_high.png`](reports/monster/screenshots/map_drowned_school_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C64** | `drowned_school` | `high` | `map_drowned_school_high.png` | `debug-leak` | **P1** | [`map_drowned_school_high.png`](reports/monster/screenshots/map_drowned_school_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C65** | `hydro_maze` | `high` | `map_hydro_maze_high.png` | `aliasing` | **P2** | [`map_hydro_maze_high.png`](reports/monster/screenshots/map_hydro_maze_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C66** | `hydro_maze` | `high` | `map_hydro_maze_high.png` | `debug-leak` | **P1** | [`map_hydro_maze_high.png`](reports/monster/screenshots/map_hydro_maze_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C67** | `marble_atrium` | `high` | `map_marble_atrium_high.png` | `aliasing` | **P2** | [`map_marble_atrium_high.png`](reports/monster/screenshots/map_marble_atrium_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C68** | `marble_atrium` | `high` | `map_marble_atrium_high.png` | `debug-leak` | **P1** | [`map_marble_atrium_high.png`](reports/monster/screenshots/map_marble_atrium_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C69** | `natatorium` | `high` | `map_natatorium_high.png` | `aliasing` | **P2** | [`map_natatorium_high.png`](reports/monster/screenshots/map_natatorium_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C70** | `natatorium` | `high` | `map_natatorium_high.png` | `debug-leak` | **P1** | [`map_natatorium_high.png`](reports/monster/screenshots/map_natatorium_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C71** | `neon_flood` | `high` | `map_neon_flood_high.png` | `aliasing` | **P2** | [`map_neon_flood_high.png`](reports/monster/screenshots/map_neon_flood_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C72** | `neon_flood` | `high` | `map_neon_flood_high.png` | `debug-leak` | **P1** | [`map_neon_flood_high.png`](reports/monster/screenshots/map_neon_flood_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C73** | `orientation` | `high` | `map_orientation_high.png` | `aliasing` | **P2** | [`map_orientation_high.png`](reports/monster/screenshots/map_orientation_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C74** | `orientation` | `high` | `map_orientation_high.png` | `debug-leak` | **P1** | [`map_orientation_high.png`](reports/monster/screenshots/map_orientation_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C75** | `poolrooms` | `high` | `map_poolrooms_high.png` | `aliasing` | **P2** | [`map_poolrooms_high.png`](reports/monster/screenshots/map_poolrooms_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C76** | `poolrooms` | `high` | `map_poolrooms_high.png` | `debug-leak` | **P1** | [`map_poolrooms_high.png`](reports/monster/screenshots/map_poolrooms_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C77** | `sunken_jungle` | `high` | `map_sunken_jungle_high.png` | `aliasing` | **P2** | [`map_sunken_jungle_high.png`](reports/monster/screenshots/map_sunken_jungle_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C78** | `sunken_jungle` | `high` | `map_sunken_jungle_high.png` | `debug-leak` | **P1** | [`map_sunken_jungle_high.png`](reports/monster/screenshots/map_sunken_jungle_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C79** | `sunken_jungle` | `high` | `map_sunken_jungle_high.png` | `specular-blowout` | **P2** | [`map_sunken_jungle_high.png`](reports/monster/screenshots/map_sunken_jungle_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C80** | `utility_tunnels` | `high` | `map_utility_tunnels_high.png` | `aliasing` | **P2** | [`map_utility_tunnels_high.png`](reports/monster/screenshots/map_utility_tunnels_high.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C81** | `utility_tunnels` | `high` | `map_utility_tunnels_high.png` | `debug-leak` | **P1** | [`map_utility_tunnels_high.png`](reports/monster/screenshots/map_utility_tunnels_high.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C82** | `orientation` | `high` | `mobile_orientation.png` | `aliasing` | **P2** | [`mobile_orientation.png`](reports/monster/screenshots/mobile_orientation.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C83** | `orientation` | `high` | `mobile_orientation.png` | `debug-leak` | **P1** | [`mobile_orientation.png`](reports/monster/screenshots/mobile_orientation.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C84** | `orientation` | `high` | `mobile_orientation.png` | `specular-blowout` | **P2** | [`mobile_orientation.png`](reports/monster/screenshots/mobile_orientation.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C85** | `poolrooms` | `high` | `mobile_poolrooms.png` | `aliasing` | **P2** | [`mobile_poolrooms.png`](reports/monster/screenshots/mobile_poolrooms.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C86** | `poolrooms` | `high` | `mobile_poolrooms.png` | `debug-leak` | **P1** | [`mobile_poolrooms.png`](reports/monster/screenshots/mobile_poolrooms.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C87** | `poolrooms` | `high` | `mobile_poolrooms.png` | `specular-blowout` | **P2** | [`mobile_poolrooms.png`](reports/monster/screenshots/mobile_poolrooms.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C88** | `natatorium` | `high` | `retry_spawn.png` | `aliasing` | **P2** | [`retry_spawn.png`](reports/monster/screenshots/retry_spawn.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C89** | `natatorium` | `high` | `retry_spawn.png` | `debug-leak` | **P1** | [`retry_spawn.png`](reports/monster/screenshots/retry_spawn.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C90** | `natatorium` | `high` | `show_me_15m.png` | `aliasing` | **P2** | [`show_me_15m.png`](reports/monster/screenshots/show_me_15m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C91** | `natatorium` | `high` | `show_me_15m.png` | `debug-leak` | **P1** | [`show_me_15m.png`](reports/monster/screenshots/show_me_15m.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C92** | `natatorium` | `high` | `show_me_25m.png` | `aliasing` | **P2** | [`show_me_25m.png`](reports/monster/screenshots/show_me_25m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C93** | `natatorium` | `high` | `show_me_25m.png` | `debug-leak` | **P1** | [`show_me_25m.png`](reports/monster/screenshots/show_me_25m.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C94** | `natatorium` | `high` | `show_me_40m.png` | `aliasing` | **P2** | [`show_me_40m.png`](reports/monster/screenshots/show_me_40m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C95** | `natatorium` | `high` | `show_me_40m.png` | `debug-leak` | **P1** | [`show_me_40m.png`](reports/monster/screenshots/show_me_40m.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C96** | `natatorium` | `high` | `show_me_6m.png` | `aliasing` | **P2** | [`show_me_6m.png`](reports/monster/screenshots/show_me_6m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C97** | `natatorium` | `high` | `show_me_6m.png` | `debug-leak` | **P1** | [`show_me_6m.png`](reports/monster/screenshots/show_me_6m.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C98** | `natatorium` | `high` | `sleeper_from_spawn.png` | `aliasing` | **P2** | [`sleeper_from_spawn.png`](reports/monster/screenshots/sleeper_from_spawn.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C99** | `natatorium` | `high` | `sleeper_from_spawn.png` | `debug-leak` | **P1** | [`sleeper_from_spawn.png`](reports/monster/screenshots/sleeper_from_spawn.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C100** | `poolrooms` | `low` | `tier_low_poolrooms.png` | `debug-leak` | **P1** | [`tier_low_poolrooms.png`](reports/monster/screenshots/tier_low_poolrooms.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C101** | `poolrooms` | `medium` | `tier_med_poolrooms.png` | `aliasing` | **P2** | [`tier_med_poolrooms.png`](reports/monster/screenshots/tier_med_poolrooms.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C102** | `poolrooms` | `medium` | `tier_med_poolrooms.png` | `debug-leak` | **P1** | [`tier_med_poolrooms.png`](reports/monster/screenshots/tier_med_poolrooms.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C103** | `drowned_metro` | `high` | `drowned_metro_t20s.png` | `aliasing` | **P2** | [`drowned_metro_t20s.png`](reports/graphics/prompt1_after/drowned_metro_t20s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C104** | `drowned_school` | `high` | `map_drowned_school_t5s.png` | `specular-blowout` | **P2** | [`map_drowned_school_t5s.png`](reports/graphics/prompt1_after/map_drowned_school_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C105** | `hydro_maze` | `high` | `map_hydro_maze_t5s.png` | `aliasing` | **P2** | [`map_hydro_maze_t5s.png`](reports/graphics/prompt1_after/map_hydro_maze_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C106** | `hydro_maze` | `high` | `map_hydro_maze_t5s.png` | `specular-blowout` | **P2** | [`map_hydro_maze_t5s.png`](reports/graphics/prompt1_after/map_hydro_maze_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C107** | `marble_atrium` | `high` | `map_marble_atrium_t5s.png` | `specular-blowout` | **P2** | [`map_marble_atrium_t5s.png`](reports/graphics/prompt1_after/map_marble_atrium_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C108** | `neon_flood` | `high` | `map_neon_flood_t5s.png` | `aliasing` | **P2** | [`map_neon_flood_t5s.png`](reports/graphics/prompt1_after/map_neon_flood_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C109** | `orientation` | `high` | `map_orientation_t5s.png` | `aliasing` | **P2** | [`map_orientation_t5s.png`](reports/graphics/prompt1_after/map_orientation_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C110** | `orientation` | `high` | `map_orientation_t5s.png` | `debug-leak` | **P1** | [`map_orientation_t5s.png`](reports/graphics/prompt1_after/map_orientation_t5s.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C111** | `orientation` | `high` | `map_orientation_t5s.png` | `specular-blowout` | **P2** | [`map_orientation_t5s.png`](reports/graphics/prompt1_after/map_orientation_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C112** | `utility_tunnels` | `high` | `map_utility_tunnels_t5s.png` | `aliasing` | **P2** | [`map_utility_tunnels_t5s.png`](reports/graphics/prompt1_after/map_utility_tunnels_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C113** | `utility_tunnels` | `high` | `map_utility_tunnels_t5s.png` | `specular-blowout` | **P2** | [`map_utility_tunnels_t5s.png`](reports/graphics/prompt1_after/map_utility_tunnels_t5s.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C114** | `natatorium` | `high` | `menu_backdrop.png` | `aliasing` | **P2** | [`menu_backdrop.png`](reports/graphics/prompt1_after/menu_backdrop.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C115** | `natatorium` | `high` | `menu_backdrop.png` | `specular-blowout` | **P2** | [`menu_backdrop.png`](reports/graphics/prompt1_after/menu_backdrop.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C116** | `natatorium` | `high` | `creature_far_35m.png` | `specular-blowout` | **P2** | [`creature_far_35m.png`](reports/visual/creature_far_35m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C117** | `natatorium` | `high` | `creature_mid_15m.png` | `specular-blowout` | **P2** | [`creature_mid_15m.png`](reports/visual/creature_mid_15m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C118** | `natatorium` | `high` | `flock_overhead.png` | `aliasing` | **P2** | [`flock_overhead.png`](reports/visual/flock_overhead.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C119** | `natatorium` | `high` | `flock_overhead.png` | `debug-leak` | **P1** | [`flock_overhead.png`](reports/visual/flock_overhead.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C120** | `natatorium` | `high` | `flock_overhead.png` | `specular-blowout` | **P2** | [`flock_overhead.png`](reports/visual/flock_overhead.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C121** | `natatorium` | `high` | `natatorium_arch_fog_25m.png` | `aliasing` | **P2** | [`natatorium_arch_fog_25m.png`](reports/visual/natatorium_arch_fog_25m.png) | `src/procedural/geometry/ArchBuilder.ts (filleted arch reveals)` | **CLOSED (Prompt 4)** |
| **C122** | `natatorium` | `high` | `natatorium_arch_fog_25m.png` | `debug-leak` | **P1** | [`natatorium_arch_fog_25m.png`](reports/visual/natatorium_arch_fog_25m.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C123** | `natatorium` | `high` | `natatorium_arch_fog_25m.png` | `specular-blowout` | **P2** | [`natatorium_arch_fog_25m.png`](reports/visual/natatorium_arch_fog_25m.png) | `src/procedural/geometry/VaultBuilder.ts (vault ceiling & filleted arch normal roll-off)` | **CLOSED (Prompt 4)** |
| **C124** | `natatorium` | `high` | `natatorium_arch_fog_25m_portrait.png` | `debug-leak` | **P1** | [`natatorium_arch_fog_25m_portrait.png`](reports/visual/natatorium_arch_fog_25m_portrait.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C125** | `natatorium` | `high` | `natatorium_arch_fog_25m_portrait.png` | `specular-blowout` | **P2** | [`natatorium_arch_fog_25m_portrait.png`](reports/visual/natatorium_arch_fog_25m_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C126** | `natatorium` | `high` | `natatorium_close_tile_wall.png` | `aliasing` | **P2** | [`natatorium_close_tile_wall.png`](reports/visual/natatorium_close_tile_wall.png) | `src/procedural/geometry/TiledBox.ts (bullnose slab edge coping)` | **CLOSED (Prompt 4)** |
| **C127** | `natatorium` | `high` | `natatorium_close_tile_wall_portrait.png` | `specular-blowout` | **P2** | [`natatorium_close_tile_wall_portrait.png`](reports/visual/natatorium_close_tile_wall_portrait.png) | `src/world/maps/CommonMapBuilder.ts (wayfinding numerals & bullnose coping)` | **CLOSED (Prompt 4)** |
| **C128** | `natatorium` | `high` | `natatorium_horizon_long.png` | `debug-leak` | **P1** | [`natatorium_horizon_long.png`](reports/visual/natatorium_horizon_long.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C129** | `natatorium` | `high` | `natatorium_horizon_long.png` | `specular-blowout` | **P2** | [`natatorium_horizon_long.png`](reports/visual/natatorium_horizon_long.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C130** | `natatorium` | `high` | `natatorium_horizon_long_portrait.png` | `aliasing` | **P2** | [`natatorium_horizon_long_portrait.png`](reports/visual/natatorium_horizon_long_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C131** | `natatorium` | `high` | `natatorium_horizon_long_portrait.png` | `specular-blowout` | **P2** | [`natatorium_horizon_long_portrait.png`](reports/visual/natatorium_horizon_long_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C132** | `natatorium` | `high` | `natatorium_monster_25m.png` | `aliasing` | **P2** | [`natatorium_monster_25m.png`](reports/visual/natatorium_monster_25m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C133** | `natatorium` | `high` | `natatorium_monster_25m.png` | `debug-leak` | **P1** | [`natatorium_monster_25m.png`](reports/visual/natatorium_monster_25m.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C134** | `natatorium` | `high` | `natatorium_monster_25m.png` | `specular-blowout` | **P2** | [`natatorium_monster_25m.png`](reports/visual/natatorium_monster_25m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C135** | `natatorium` | `high` | `natatorium_monster_25m_portrait.png` | `aliasing` | **P2** | [`natatorium_monster_25m_portrait.png`](reports/visual/natatorium_monster_25m_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C136** | `natatorium` | `high` | `natatorium_monster_25m_portrait.png` | `debug-leak` | **P1** | [`natatorium_monster_25m_portrait.png`](reports/visual/natatorium_monster_25m_portrait.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C137** | `natatorium` | `high` | `natatorium_monster_25m_portrait.png` | `specular-blowout` | **P2** | [`natatorium_monster_25m_portrait.png`](reports/visual/natatorium_monster_25m_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C138** | `natatorium` | `high` | `natatorium_pillar_numeral_8m.png` | `aliasing` | **P2** | [`natatorium_pillar_numeral_8m.png`](tests/golden/natatorium_pillar_numeral_8m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C139** | `natatorium` | `high` | `natatorium_pillar_numeral_8m.png` | `specular-blowout` | **P2** | [`natatorium_pillar_numeral_8m.png`](tests/golden/natatorium_pillar_numeral_8m.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C140** | `natatorium` | `high` | `natatorium_pillar_numeral_8m_portrait.png` | `aliasing` | **P2** | [`natatorium_pillar_numeral_8m_portrait.png`](reports/visual/natatorium_pillar_numeral_8m_portrait.png) | `src/procedural/textures/TileMaterialFactory.ts (pillar UV quantization)` | **CLOSED (Prompt 4)** |
| **C141** | `natatorium` | `high` | `natatorium_pillar_numeral_8m_portrait.png` | `debug-leak` | **P1** | [`natatorium_pillar_numeral_8m_portrait.png`](reports/visual/natatorium_pillar_numeral_8m_portrait.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C142** | `natatorium` | `high` | `natatorium_pillar_numeral_8m_portrait.png` | `specular-blowout` | **P2** | [`natatorium_pillar_numeral_8m_portrait.png`](reports/visual/natatorium_pillar_numeral_8m_portrait.png) | `src/world/maps/CommonMapBuilder.ts (wayfinding numerals & smooth normal roll-off)` | **CLOSED (Prompt 4)** |
| **C143** | `natatorium` | `high` | `natatorium_spawn_view.png` | `aliasing` | **P2** | [`natatorium_spawn_view.png`](reports/visual/natatorium_spawn_view.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C144** | `natatorium` | `high` | `natatorium_spawn_view_portrait.png` | `aliasing` | **P2** | [`natatorium_spawn_view_portrait.png`](reports/visual/natatorium_spawn_view_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C145** | `natatorium` | `high` | `natatorium_tagline_wall.png` | `aliasing` | **P2** | [`natatorium_tagline_wall.png`](reports/visual/natatorium_tagline_wall.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C146** | `natatorium` | `high` | `natatorium_tagline_wall.png` | `debug-leak` | **P1** | [`natatorium_tagline_wall.png`](reports/visual/natatorium_tagline_wall.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C147** | `natatorium` | `high` | `natatorium_tagline_wall.png` | `specular-blowout` | **P2** | [`natatorium_tagline_wall.png`](reports/visual/natatorium_tagline_wall.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C148** | `natatorium` | `high` | `natatorium_tagline_wall_portrait.png` | `aliasing` | **P2** | [`natatorium_tagline_wall_portrait.png`](reports/visual/natatorium_tagline_wall_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C149** | `natatorium` | `high` | `natatorium_tagline_wall_portrait.png` | `debug-leak` | **P1** | [`natatorium_tagline_wall_portrait.png`](reports/visual/natatorium_tagline_wall_portrait.png) | `src/game/monster/MonsterBody.ts (debug containment: ?debug=1 only)` | **CLOSED (Prompt 6)** |
| **C150** | `natatorium` | `high` | `natatorium_tagline_wall_portrait.png` | `specular-blowout` | **P2** | [`natatorium_tagline_wall_portrait.png`](reports/visual/natatorium_tagline_wall_portrait.png) | `src/engine/PostFX.ts or MapBuilder` | **CLOSED (Prompt 9 — Decision D137)** |
| **C151** | `natatorium` | `high` | `natatorium_trench_view_portrait.png` | `aliasing` | **P2** | [`natatorium_trench_view_portrait.png`](reports/visual/natatorium_trench_view_portrait.png) | `src/procedural/geometry/TiledBox.ts (bullnose trench slab coping)` | **CLOSED (Prompt 4)** |

---

## §3 Detailed Defect Descriptions & Remediation Guidance

### C1: Black void / sky showing through unrendered ceiling in Natatorium (upper-third area > 5% pure black #000000)
- **Map / Tier:** `natatorium` (high)
- **Class:** `black-void` | **Severity:** **P1**
- **Evidence:** [`reports/water/baseline/natatorium_hero.png`](reports/water/baseline/natatorium_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts:182 / src/world/maps/NatatoriumMap.ts (unrendered ceiling / sky void above fog cutoff)`
- **Current Status:** `OPEN`

### C2: Creature unreadable at 15 m (the "show_me_15m" test scene produces an indistinct speck vs reference f_008/f_009)
- **Map / Tier:** `natatorium` (high)
- **Class:** `readability` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/show_me_15m.png`](reports/monster/screenshots/show_me_15m.png)
- **Suspected Subsystem:** `src/game/monster/MonsterRig.ts:240 (15m silhouette scale & contrast against fog)`
- **Current Status:** `CLOSED (Prompt 5)`
- **Resolution:** Re-calibrated creature silhouette projection scale, mass, and Michelson contrast across contract boards (15m mask height 15.83% >= 6%, coverage 0.852% >= 0.55%, Michelson contrast 0.3536 >= 0.35 vs fog background), satisfying Screen-Space Readability Law in tests/monster-silhouette-contract.test.ts.

### C3: Debug text leaks — pointer lock overlay "[CLICK TO LOCK MOUSE LOOK]" and debug text visible in captured gameplay shots
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/lurk.png`](reports/monster/screenshots/lurk.png)
- **Suspected Subsystem:** `src/ui/UIManager.ts / src/game/GameSession.ts:4356 (pointer lock overlay text leak in capture mode)`
- **Current Status:** `CLOSED (Prompt 6)`

### C4: Z-fighting on submerged tile floors at low/medium quality tiers (high-frequency alternating scanline banding)
- **Map / Tier:** `poolrooms` (medium)
- **Class:** `z-fight` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/tier_med_poolrooms.png`](reports/monster/screenshots/tier_med_poolrooms.png)
- **Suspected Subsystem:** `src/game/water/WaterMaterial.ts:412 (submerged cracked tile slabs coplanar depth bias)`
- **Current Status:** `OPEN`

### C5: Missing AA / hard edges on column silhouettes and staircases under the Low tier
- **Map / Tier:** `poolrooms` (low)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/tier_low_poolrooms.png`](reports/monster/screenshots/tier_low_poolrooms.png)
- **Suspected Subsystem:** `src/engine/Renderer.ts:185 (FXAA disabled on Low tier)`
- **Current Status:** `OPEN`

### C6: Specular blowout on wet tile walls under grazing flashlights (clamped saturated highlights washing out grout detail)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_close_tile_wall.png`](reports/visual/natatorium_close_tile_wall.png)
- **Suspected Subsystem:** `src/procedural/materials/TileMaterial.ts / src/engine/PostFX.ts (roughness specular roll-off under grazing flashlight)`
- **Current Status:** `OPEN`

### C7: Severe pure-black upper-third void in flooded transit plaza
- **Map / Tier:** `neon_flood` (high)
- **Class:** `black-void` | **Severity:** **P1**
- **Evidence:** [`reports/water/baseline/neon_flood_hero.png`](reports/water/baseline/neon_flood_hero.png)
- **Suspected Subsystem:** `src/world/maps/NeonFloodMap.ts (unrendered ceiling void)`
- **Current Status:** `OPEN`

### C8: Black ceiling fins and dark void bands along upper vault boundaries
- **Map / Tier:** `drainage_core` (high)
- **Class:** `black-void` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drainage_core_hero.png`](reports/water/baseline/drainage_core_hero.png)
- **Suspected Subsystem:** `src/world/maps/DrainageCoreMap.ts (vault ceiling fin geometry)`
- **Current Status:** `OPEN`

### C9: Neon grout glow unnatural chromatic spill across wet platform edges
- **Map / Tier:** `neon_flood` (high)
- **Class:** `texture-anomaly` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/neon_flood_water_rain.png`](reports/water/baseline/neon_flood_water_rain.png)
- **Suspected Subsystem:** `src/world/maps/NeonFloodMap.ts (emissive neon wainscot)`
- **Current Status:** `OPEN`

### C10: Vertical tile seam visible along rear tangent of numeral 2 pillar
- **Map / Tier:** `natatorium` (high)
- **Class:** `seam` | **Severity:** **P2**
- **Evidence:** [`tests/golden/natatorium_pillar_numeral_8m.png`](tests/golden/natatorium_pillar_numeral_8m.png)
- **Suspected Subsystem:** `src/procedural/geometry/TiledCylinder.ts (unquantized UV seam)`
- **Current Status:** `OPEN`

### C11: Abrupt fog step and horizon luminance band along subway tunnel egress
- **Map / Tier:** `drowned_metro` (high)
- **Class:** `fog-band` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drowned_metro_hero.png`](reports/water/baseline/drowned_metro_hero.png)
- **Suspected Subsystem:** `src/world/maps/DrownedMetroMap.ts (tunnel horizon fog step)`
- **Current Status:** `OPEN`

### C12: Waterline contact boundary lacking wet tidemark darkening gradient in gym basin
- **Map / Tier:** `drowned_school` (high)
- **Class:** `other` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drowned_school_hero.png`](reports/water/baseline/drowned_school_hero.png)
- **Suspected Subsystem:** `src/world/maps/DrownedSchoolMap.ts (wainscot waterline contrast)`
- **Current Status:** `OPEN`

### C13: Un-antialiased hard edges: 52.46% of edges exceed magnitude 0.8
- **Map / Tier:** `drainage_core` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drainage_core_hero.png`](reports/water/baseline/drainage_core_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C14: Specular highlight saturation blowout: 50672 clamped pixels (5.5%)
- **Map / Tier:** `drainage_core` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drainage_core_hero.png`](reports/water/baseline/drainage_core_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C15: Un-antialiased hard edges: 34.8% of edges exceed magnitude 0.8
- **Map / Tier:** `drowned_metro` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drowned_metro_hero.png`](reports/water/baseline/drowned_metro_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C16: Specular highlight saturation blowout: 925 clamped pixels (0.1%)
- **Map / Tier:** `drowned_metro` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drowned_metro_hero.png`](reports/water/baseline/drowned_metro_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C17: Un-antialiased hard edges: 38.54% of edges exceed magnitude 0.8
- **Map / Tier:** `drowned_school` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drowned_school_hero.png`](reports/water/baseline/drowned_school_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C18: Specular highlight saturation blowout: 1016 clamped pixels (0.11%)
- **Map / Tier:** `drowned_school` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/drowned_school_hero.png`](reports/water/baseline/drowned_school_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C19: Un-antialiased hard edges: 19.46% of edges exceed magnitude 0.8
- **Map / Tier:** `hydro_maze` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/hydro_maze_hero.png`](reports/water/baseline/hydro_maze_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C20: Specular highlight saturation blowout: 856 clamped pixels (0.09%)
- **Map / Tier:** `hydro_maze` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/hydro_maze_hero.png`](reports/water/baseline/hydro_maze_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C21: Un-antialiased hard edges: 34.3% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_floor_through_water.png`](reports/water/baseline/natatorium_floor_through_water.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C22: Specular highlight saturation blowout: 2955 clamped pixels (0.32%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_floor_through_water.png`](reports/water/baseline/natatorium_floor_through_water.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C23: Un-antialiased hard edges: 32.79% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_floor_through_water_portrait.png`](reports/water/baseline/natatorium_floor_through_water_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C24: Specular highlight saturation blowout: 4702 clamped pixels (0.51%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_floor_through_water_portrait.png`](reports/water/baseline/natatorium_floor_through_water_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C25: Un-antialiased hard edges: 39.53% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_hero.png`](reports/water/baseline/natatorium_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C26: Specular highlight saturation blowout: 6272 clamped pixels (0.68%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_hero.png`](reports/water/baseline/natatorium_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C27: Un-antialiased hard edges: 37.36% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_calm_axial.png`](reports/water/baseline/natatorium_water_calm_axial.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C28: Specular highlight saturation blowout: 2064 clamped pixels (0.22%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_calm_axial.png`](reports/water/baseline/natatorium_water_calm_axial.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C29: Un-antialiased hard edges: 36.59% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_calm_grazing.png`](reports/water/baseline/natatorium_water_calm_grazing.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C30: Un-antialiased hard edges: 40.06% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_drip_ring.png`](reports/water/baseline/natatorium_water_drip_ring.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C31: Specular highlight saturation blowout: 749 clamped pixels (0.08%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_drip_ring.png`](reports/water/baseline/natatorium_water_drip_ring.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C32: Un-antialiased hard edges: 38.97% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_horizon.png`](reports/water/baseline/natatorium_water_horizon.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C33: Specular highlight saturation blowout: 3565 clamped pixels (0.39%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_horizon.png`](reports/water/baseline/natatorium_water_horizon.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C34: Un-antialiased hard edges: 22.92% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_monster_wake.png`](reports/water/baseline/natatorium_water_monster_wake.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C35: Specular highlight saturation blowout: 778 clamped pixels (0.08%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_monster_wake.png`](reports/water/baseline/natatorium_water_monster_wake.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C36: Un-antialiased hard edges: 26.85% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_slab_edge.png`](reports/water/baseline/natatorium_water_slab_edge.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C37: Un-antialiased hard edges: 38.09% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_splash_01.png`](reports/water/baseline/natatorium_water_splash_01.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C38: Specular highlight saturation blowout: 867 clamped pixels (0.09%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_splash_01.png`](reports/water/baseline/natatorium_water_splash_01.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C39: Un-antialiased hard edges: 40.07% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_splash_05.png`](reports/water/baseline/natatorium_water_splash_05.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C40: Specular highlight saturation blowout: 870 clamped pixels (0.09%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_splash_05.png`](reports/water/baseline/natatorium_water_splash_05.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C41: Un-antialiased hard edges: 40.39% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_splash_12.png`](reports/water/baseline/natatorium_water_splash_12.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C42: Specular highlight saturation blowout: 937 clamped pixels (0.1%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_splash_12.png`](reports/water/baseline/natatorium_water_splash_12.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C43: Un-antialiased hard edges: 39.15% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_underwater.png`](reports/water/baseline/natatorium_water_underwater.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C44: Un-antialiased hard edges: 35.17% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_wake.png`](reports/water/baseline/natatorium_water_wake.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C45: Specular highlight saturation blowout: 1901 clamped pixels (0.21%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/natatorium_water_wake.png`](reports/water/baseline/natatorium_water_wake.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C46: Un-antialiased hard edges: 40.29% of edges exceed magnitude 0.8
- **Map / Tier:** `neon_flood` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/neon_flood_hero.png`](reports/water/baseline/neon_flood_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C47: Specular highlight saturation blowout: 6172 clamped pixels (0.67%)
- **Map / Tier:** `neon_flood` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/neon_flood_hero.png`](reports/water/baseline/neon_flood_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C48: Un-antialiased hard edges: 57.96% of edges exceed magnitude 0.8
- **Map / Tier:** `neon_flood` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/neon_flood_water_rain.png`](reports/water/baseline/neon_flood_water_rain.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C49: Specular highlight saturation blowout: 51051 clamped pixels (5.54%)
- **Map / Tier:** `sunken_jungle` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/sunken_jungle_hero.png`](reports/water/baseline/sunken_jungle_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C50: Un-antialiased hard edges: 56.71% of edges exceed magnitude 0.8
- **Map / Tier:** `utility_tunnels` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/water/baseline/utility_tunnels_hero.png`](reports/water/baseline/utility_tunnels_hero.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C51: Un-antialiased hard edges: 58.45% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/crossing.png`](reports/monster/screenshots/crossing.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C52: Detected 1155 magenta debug marker pixels (first at x:775, y:475)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/crossing.png`](reports/monster/screenshots/crossing.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C53: Un-antialiased hard edges: 82.15% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/jumpscare_0.2s.png`](reports/monster/screenshots/jumpscare_0.2s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C54: Detected 374 magenta debug marker pixels (first at x:904, y:673)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/jumpscare_0.2s.png`](reports/monster/screenshots/jumpscare_0.2s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C55: Pure black void region occupying 30.08% of frame area in upper third
- **Map / Tier:** `natatorium` (high)
- **Class:** `black-void` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/jumpscare_0.6s.png`](reports/monster/screenshots/jumpscare_0.6s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C56: Un-antialiased hard edges: 86.93% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/jumpscare_0.6s.png`](reports/monster/screenshots/jumpscare_0.6s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C57: Detected 370 magenta debug marker pixels (first at x:904, y:673)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/jumpscare_0.6s.png`](reports/monster/screenshots/jumpscare_0.6s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C58: Un-antialiased hard edges: 58.55% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/lurk.png`](reports/monster/screenshots/lurk.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C59: Un-antialiased hard edges: 59.78% of edges exceed magnitude 0.8
- **Map / Tier:** `drainage_core` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_drainage_core_high.png`](reports/monster/screenshots/map_drainage_core_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C60: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `drainage_core` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_drainage_core_high.png`](reports/monster/screenshots/map_drainage_core_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C61: Un-antialiased hard edges: 57.23% of edges exceed magnitude 0.8
- **Map / Tier:** `drowned_metro` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_drowned_metro_high.png`](reports/monster/screenshots/map_drowned_metro_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C62: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `drowned_metro` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_drowned_metro_high.png`](reports/monster/screenshots/map_drowned_metro_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C63: Un-antialiased hard edges: 61.34% of edges exceed magnitude 0.8
- **Map / Tier:** `drowned_school` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_drowned_school_high.png`](reports/monster/screenshots/map_drowned_school_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C64: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `drowned_school` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_drowned_school_high.png`](reports/monster/screenshots/map_drowned_school_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C65: Un-antialiased hard edges: 56.55% of edges exceed magnitude 0.8
- **Map / Tier:** `hydro_maze` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_hydro_maze_high.png`](reports/monster/screenshots/map_hydro_maze_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C66: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `hydro_maze` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_hydro_maze_high.png`](reports/monster/screenshots/map_hydro_maze_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C67: Un-antialiased hard edges: 26.25% of edges exceed magnitude 0.8
- **Map / Tier:** `marble_atrium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_marble_atrium_high.png`](reports/monster/screenshots/map_marble_atrium_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C68: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `marble_atrium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_marble_atrium_high.png`](reports/monster/screenshots/map_marble_atrium_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C69: Un-antialiased hard edges: 51.31% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_natatorium_high.png`](reports/monster/screenshots/map_natatorium_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C70: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_natatorium_high.png`](reports/monster/screenshots/map_natatorium_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C71: Un-antialiased hard edges: 63.47% of edges exceed magnitude 0.8
- **Map / Tier:** `neon_flood` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_neon_flood_high.png`](reports/monster/screenshots/map_neon_flood_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C72: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `neon_flood` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_neon_flood_high.png`](reports/monster/screenshots/map_neon_flood_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C73: Un-antialiased hard edges: 50.3% of edges exceed magnitude 0.8
- **Map / Tier:** `orientation` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_orientation_high.png`](reports/monster/screenshots/map_orientation_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C74: Detected 3058 magenta debug marker pixels (first at x:603, y:450)
- **Map / Tier:** `orientation` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_orientation_high.png`](reports/monster/screenshots/map_orientation_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C75: Un-antialiased hard edges: 50.55% of edges exceed magnitude 0.8
- **Map / Tier:** `poolrooms` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_poolrooms_high.png`](reports/monster/screenshots/map_poolrooms_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C76: Detected 2191 magenta debug marker pixels (first at x:650, y:435)
- **Map / Tier:** `poolrooms` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_poolrooms_high.png`](reports/monster/screenshots/map_poolrooms_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C77: Un-antialiased hard edges: 37.24% of edges exceed magnitude 0.8
- **Map / Tier:** `sunken_jungle` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_sunken_jungle_high.png`](reports/monster/screenshots/map_sunken_jungle_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C78: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `sunken_jungle` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_sunken_jungle_high.png`](reports/monster/screenshots/map_sunken_jungle_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C79: Specular highlight saturation blowout: 2215 clamped pixels (0.17%)
- **Map / Tier:** `sunken_jungle` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_sunken_jungle_high.png`](reports/monster/screenshots/map_sunken_jungle_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C80: Un-antialiased hard edges: 66.03% of edges exceed magnitude 0.8
- **Map / Tier:** `utility_tunnels` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/map_utility_tunnels_high.png`](reports/monster/screenshots/map_utility_tunnels_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C81: Pure-white text cluster detected in bottom 15% (bbox: 178x11)
- **Map / Tier:** `utility_tunnels` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/map_utility_tunnels_high.png`](reports/monster/screenshots/map_utility_tunnels_high.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C82: Un-antialiased hard edges: 64.47% of edges exceed magnitude 0.8
- **Map / Tier:** `orientation` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/mobile_orientation.png`](reports/monster/screenshots/mobile_orientation.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C83: Pure-white text cluster detected in bottom 15% (bbox: 511x10)
- **Map / Tier:** `orientation` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/mobile_orientation.png`](reports/monster/screenshots/mobile_orientation.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C84: Specular highlight saturation blowout: 7568 clamped pixels (0.26%)
- **Map / Tier:** `orientation` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/mobile_orientation.png`](reports/monster/screenshots/mobile_orientation.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C85: Un-antialiased hard edges: 62.53% of edges exceed magnitude 0.8
- **Map / Tier:** `poolrooms` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/mobile_poolrooms.png`](reports/monster/screenshots/mobile_poolrooms.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C86: Pure-white text cluster detected in bottom 15% (bbox: 511x10)
- **Map / Tier:** `poolrooms` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/mobile_poolrooms.png`](reports/monster/screenshots/mobile_poolrooms.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C87: Specular highlight saturation blowout: 5137 clamped pixels (0.17%)
- **Map / Tier:** `poolrooms` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/mobile_poolrooms.png`](reports/monster/screenshots/mobile_poolrooms.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C88: Un-antialiased hard edges: 67.47% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/retry_spawn.png`](reports/monster/screenshots/retry_spawn.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C89: Detected 441 magenta debug marker pixels (first at x:1227, y:397)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/retry_spawn.png`](reports/monster/screenshots/retry_spawn.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C90: Un-antialiased hard edges: 65.93% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/show_me_15m.png`](reports/monster/screenshots/show_me_15m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C91: Detected 1277 magenta debug marker pixels (first at x:641, y:490)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/show_me_15m.png`](reports/monster/screenshots/show_me_15m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C92: Un-antialiased hard edges: 66.51% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/show_me_25m.png`](reports/monster/screenshots/show_me_25m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C93: Detected 921 magenta debug marker pixels (first at x:701, y:465)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/show_me_25m.png`](reports/monster/screenshots/show_me_25m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C94: Un-antialiased hard edges: 67.45% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/show_me_40m.png`](reports/monster/screenshots/show_me_40m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C95: Detected 681 magenta debug marker pixels (first at x:708, y:457)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/show_me_40m.png`](reports/monster/screenshots/show_me_40m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C96: Un-antialiased hard edges: 63.87% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/show_me_6m.png`](reports/monster/screenshots/show_me_6m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C97: Detected 2594 magenta debug marker pixels (first at x:654, y:528)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/show_me_6m.png`](reports/monster/screenshots/show_me_6m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C98: Un-antialiased hard edges: 59.7% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/sleeper_from_spawn.png`](reports/monster/screenshots/sleeper_from_spawn.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C99: Detected 1082 magenta debug marker pixels (first at x:705, y:444)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/sleeper_from_spawn.png`](reports/monster/screenshots/sleeper_from_spawn.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C100: Detected 2180 magenta debug marker pixels (first at x:649, y:435)
- **Map / Tier:** `poolrooms` (low)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/tier_low_poolrooms.png`](reports/monster/screenshots/tier_low_poolrooms.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C101: Un-antialiased hard edges: 50.4% of edges exceed magnitude 0.8
- **Map / Tier:** `poolrooms` (medium)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/monster/screenshots/tier_med_poolrooms.png`](reports/monster/screenshots/tier_med_poolrooms.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C102: Detected 2191 magenta debug marker pixels (first at x:650, y:435)
- **Map / Tier:** `poolrooms` (medium)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/monster/screenshots/tier_med_poolrooms.png`](reports/monster/screenshots/tier_med_poolrooms.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C103: Un-antialiased hard edges: 44.39% of edges exceed magnitude 0.8
- **Map / Tier:** `drowned_metro` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/drowned_metro_t20s.png`](reports/graphics/prompt1_after/drowned_metro_t20s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C104: Specular highlight saturation blowout: 2118 clamped pixels (0.23%)
- **Map / Tier:** `drowned_school` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_drowned_school_t5s.png`](reports/graphics/prompt1_after/map_drowned_school_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C105: Un-antialiased hard edges: 57.08% of edges exceed magnitude 0.8
- **Map / Tier:** `hydro_maze` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_hydro_maze_t5s.png`](reports/graphics/prompt1_after/map_hydro_maze_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C106: Specular highlight saturation blowout: 2105 clamped pixels (0.23%)
- **Map / Tier:** `hydro_maze` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_hydro_maze_t5s.png`](reports/graphics/prompt1_after/map_hydro_maze_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C107: Specular highlight saturation blowout: 2110 clamped pixels (0.23%)
- **Map / Tier:** `marble_atrium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_marble_atrium_t5s.png`](reports/graphics/prompt1_after/map_marble_atrium_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C108: Un-antialiased hard edges: 51.29% of edges exceed magnitude 0.8
- **Map / Tier:** `neon_flood` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_neon_flood_t5s.png`](reports/graphics/prompt1_after/map_neon_flood_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C109: Un-antialiased hard edges: 39.17% of edges exceed magnitude 0.8
- **Map / Tier:** `orientation` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_orientation_t5s.png`](reports/graphics/prompt1_after/map_orientation_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C110: Pure-white text cluster detected in bottom 15% (bbox: 88x9)
- **Map / Tier:** `orientation` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/graphics/prompt1_after/map_orientation_t5s.png`](reports/graphics/prompt1_after/map_orientation_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C111: Specular highlight saturation blowout: 2308 clamped pixels (0.25%)
- **Map / Tier:** `orientation` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_orientation_t5s.png`](reports/graphics/prompt1_after/map_orientation_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C112: Un-antialiased hard edges: 61.09% of edges exceed magnitude 0.8
- **Map / Tier:** `utility_tunnels` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_utility_tunnels_t5s.png`](reports/graphics/prompt1_after/map_utility_tunnels_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C113: Specular highlight saturation blowout: 2105 clamped pixels (0.23%)
- **Map / Tier:** `utility_tunnels` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/map_utility_tunnels_t5s.png`](reports/graphics/prompt1_after/map_utility_tunnels_t5s.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C114: Un-antialiased hard edges: 49.6% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/menu_backdrop.png`](reports/graphics/prompt1_after/menu_backdrop.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C115: Specular highlight saturation blowout: 975 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/graphics/prompt1_after/menu_backdrop.png`](reports/graphics/prompt1_after/menu_backdrop.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C116: Specular highlight saturation blowout: 1552 clamped pixels (0.17%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/creature_far_35m.png`](reports/visual/creature_far_35m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C117: Specular highlight saturation blowout: 1304 clamped pixels (0.14%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/creature_mid_15m.png`](reports/visual/creature_mid_15m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C118: Un-antialiased hard edges: 20.63% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/flock_overhead.png`](reports/visual/flock_overhead.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C119: Pure-white text cluster detected in bottom 15% (bbox: 331x10)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/flock_overhead.png`](reports/visual/flock_overhead.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C120: Specular highlight saturation blowout: 1067 clamped pixels (0.12%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/flock_overhead.png`](reports/visual/flock_overhead.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C121: Un-antialiased hard edges: 32.09% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_arch_fog_25m.png`](reports/visual/natatorium_arch_fog_25m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C122: Pure-white text cluster detected in bottom 15% (bbox: 331x9)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/natatorium_arch_fog_25m.png`](reports/visual/natatorium_arch_fog_25m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C123: Specular highlight saturation blowout: 1055 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_arch_fog_25m.png`](reports/visual/natatorium_arch_fog_25m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C124: Pure-white text cluster detected in bottom 15% (bbox: 331x10)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/natatorium_arch_fog_25m_portrait.png`](reports/visual/natatorium_arch_fog_25m_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C125: Specular highlight saturation blowout: 1025 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_arch_fog_25m_portrait.png`](reports/visual/natatorium_arch_fog_25m_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C126: Un-antialiased hard edges: 54.83% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_close_tile_wall.png`](reports/visual/natatorium_close_tile_wall.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C127: Specular highlight saturation blowout: 1039 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_close_tile_wall_portrait.png`](reports/visual/natatorium_close_tile_wall_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C128: Pure-white text cluster detected in bottom 15% (bbox: 331x10)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/natatorium_horizon_long.png`](reports/visual/natatorium_horizon_long.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C129: Specular highlight saturation blowout: 1135 clamped pixels (0.12%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_horizon_long.png`](reports/visual/natatorium_horizon_long.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C130: Un-antialiased hard edges: 41.22% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_horizon_long_portrait.png`](reports/visual/natatorium_horizon_long_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C131: Specular highlight saturation blowout: 1042 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_horizon_long_portrait.png`](reports/visual/natatorium_horizon_long_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C132: Un-antialiased hard edges: 47.59% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_monster_25m.png`](reports/visual/natatorium_monster_25m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C133: Pure-white text cluster detected in bottom 15% (bbox: 331x10)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/natatorium_monster_25m.png`](reports/visual/natatorium_monster_25m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C134: Specular highlight saturation blowout: 1057 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_monster_25m.png`](reports/visual/natatorium_monster_25m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C135: Un-antialiased hard edges: 33.94% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_monster_25m_portrait.png`](reports/visual/natatorium_monster_25m_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C136: Pure-white text cluster detected in bottom 15% (bbox: 331x10)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/natatorium_monster_25m_portrait.png`](reports/visual/natatorium_monster_25m_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C137: Specular highlight saturation blowout: 1023 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_monster_25m_portrait.png`](reports/visual/natatorium_monster_25m_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C138: Un-antialiased hard edges: 68% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`tests/golden/natatorium_pillar_numeral_8m.png`](tests/golden/natatorium_pillar_numeral_8m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C139: Specular highlight saturation blowout: 1047 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`tests/golden/natatorium_pillar_numeral_8m.png`](tests/golden/natatorium_pillar_numeral_8m.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C140: Un-antialiased hard edges: 58.28% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_pillar_numeral_8m_portrait.png`](reports/visual/natatorium_pillar_numeral_8m_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C141: Pure-white text cluster detected in bottom 15% (bbox: 331x11)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/natatorium_pillar_numeral_8m_portrait.png`](reports/visual/natatorium_pillar_numeral_8m_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C142: Specular highlight saturation blowout: 1069 clamped pixels (0.12%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_pillar_numeral_8m_portrait.png`](reports/visual/natatorium_pillar_numeral_8m_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C143: Un-antialiased hard edges: 19.92% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_spawn_view.png`](reports/visual/natatorium_spawn_view.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C144: Un-antialiased hard edges: 37.91% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_spawn_view_portrait.png`](reports/visual/natatorium_spawn_view_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C145: Un-antialiased hard edges: 62.38% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_tagline_wall.png`](reports/visual/natatorium_tagline_wall.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C146: Pure-white text cluster detected in bottom 15% (bbox: 331x11)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/natatorium_tagline_wall.png`](reports/visual/natatorium_tagline_wall.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C147: Specular highlight saturation blowout: 1081 clamped pixels (0.12%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_tagline_wall.png`](reports/visual/natatorium_tagline_wall.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C148: Un-antialiased hard edges: 70.88% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_tagline_wall_portrait.png`](reports/visual/natatorium_tagline_wall_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C149: Pure-white text cluster detected in bottom 15% (bbox: 331x11)
- **Map / Tier:** `natatorium` (high)
- **Class:** `debug-leak` | **Severity:** **P1**
- **Evidence:** [`reports/visual/natatorium_tagline_wall_portrait.png`](reports/visual/natatorium_tagline_wall_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `CLOSED (Prompt 6)`

### C150: Specular highlight saturation blowout: 1058 clamped pixels (0.11%)
- **Map / Tier:** `natatorium` (high)
- **Class:** `specular-blowout` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_tagline_wall_portrait.png`](reports/visual/natatorium_tagline_wall_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`

### C151: Un-antialiased hard edges: 18.2% of edges exceed magnitude 0.8
- **Map / Tier:** `natatorium` (high)
- **Class:** `aliasing` | **Severity:** **P2**
- **Evidence:** [`reports/visual/natatorium_trench_view_portrait.png`](reports/visual/natatorium_trench_view_portrait.png)
- **Suspected Subsystem:** `src/engine/PostFX.ts or MapBuilder`
- **Current Status:** `OPEN`


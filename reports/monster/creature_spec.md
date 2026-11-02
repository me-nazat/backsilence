# Reference Creature Specification (`f_001`, `f_008`–`f_012`, `f_018`–`f_024`, `f_035`–`f_037`)

Every row in this specification table is sourced directly from `reference/video/notes.md`, `reference/video/palette.json`, and the tracked reference frames (`f_001`, `f_008`–`f_012`, `f_018`–`f_024`, `f_035`–`f_037`). Automated structural assertions in `tests/monster-silhouette-contract.test.ts` and colour assertions in `tests/creature-colour-contract.test.ts` parse this table directly.

## Measurable Anatomy & Material Table (`f_010`, `f_018`, `f_021`, `f_035`, `f_037`)

| Property ID | Target Value | Allowed Band / Rule | Unit | Reference Source |
| :--- | :--- | :--- | :--- | :--- |
| `body_skin_colour` | `#5a5035` | `rgb(90, 80, 53)` ±10% | hex / RGB | `reference/video/palette.json` (`monster_body_t34`), `f_010` (*"Hunched, dark olive-brown body"*), `f_018` (*"Pale brown-grey skin"*) |
| `head_skin_colour` | `#59462d` | `rgb(89, 70, 45)` ±10% | hex / RGB | `reference/video/palette.json` (`monster_head_t34`), `f_018` (*"big rounded head with dark pits"*), `f_037` (*"Dark brown torso and head"*) |
| `blotch_coverage_max` | `0.10` | `<= 0.12` | fraction | `reference/video/notes.md` `f_018`–`f_020` (*"Pale brown-grey skin with reddish blotches"*) |
| `blotch_chroma_delta_max` | `0.04` | `<= 0.05` | ΔC | `reference/video/notes.md` `f_018`–`f_020` (*"Pale brown-grey skin with reddish blotches"*) |
| `head_shape` | `rounded_seed_pod_dome` | `aspect 1.0..1.35` | dome | `reference/video/notes.md` `f_018`–`f_020` (*"big rounded head with dark pits like a seed pod"*) |
| `head_pit_count` | `32` | `28..40` | count | `reference/video/notes.md` `f_018`–`f_020` (*"big rounded head with dark pits like a seed pod"*) |
| `head_pit_density_min` | `65.0` | `>= 50.0` | pits/m² | `reference/video/notes.md` `f_018`–`f_020` (*"dark pits like a seed pod"*) |
| `visible_eye_count` | `0` | `== 0` | count | `reference/video/notes.md` `f_001` (*"IT CAN'T SEE YOU. IT HEARS THE WATER."*), `f_018` |
| `horn_count` | `0` | `== 0` | count | `reference/video/notes.md` `f_018` (*"big rounded head with dark pits like a seed pod"*) |
| `dorsal_ridge_count` | `0` | `== 0` | count | `reference/video/notes.md` `f_010`–`f_012`, `f_018`–`f_020`, `f_037` (gaunt hunched back without dorsal spines or carapace) |
| `jaw_structure` | `single_small_dark_mouth` | `1` hinged jaw (`0` split petals) | count | `reference/video/notes.md` `f_018`–`f_020` (*"small dark mouth"*) |
| `facial_marking_colour` | `#4a2520` | subdued maroon facial marking (`R <= G * 1.15` after composite) | hex | `reference/video/notes.md` `f_018` (*"Pale brown-grey skin with reddish blotches, big rounded head with dark pits like a seed pod, small dark mouth"*) |
| `torso_length_m` | `0.65` | `0.58..0.72` | m | `reference/video/notes.md` `f_010`, `f_037` (*"Hunched, dark olive-brown body"* with visible gaunt ribcage) |
| `shoulder_span_m` | `1.25` | `1.15..1.35` | m | `reference/video/notes.md` `f_010`, `f_037` (*"Dark brown torso and head fill the lower frame against pale fog; arms spread wide"*) |
| `forelimb_length_m` | `1.35` | `1.25..1.50` (`0.65` upper + `0.70` forearm) | m | `reference/video/notes.md` `f_010`–`f_012` (*"long forearms, head carried low. Dark paint-like splash shapes at its hands and feet"*), `f_018` (*"thick forearms"*) |
| `forelimb_to_torso_ratio` | `2.077` | `>= 1.85` | ratio | `reference/video/notes.md` `f_010`–`f_012` (*"Hunched, dark olive-brown body, long forearms, head carried low"*) |
| `finger_count_per_hand` | `4` | `4..5` | count | `reference/video/notes.md` `f_010` (*"splash shapes at its hands"*), `f_037` (*"arms spread wide"*) |
| `finger_claw_length_m` | `0.28` | `0.24..0.34` | m | `reference/video/notes.md` `f_010`, `f_037` (long splayed clawed fingers dragging through water) |
| `hindlimb_length_m` | `1.13` | `1.00..1.25` (`0.58` thigh + `0.55` shin) | m | `reference/video/notes.md` `f_010`, `f_018`, `f_035` (low quadrupedal wading stance) |
| `tail_length_m` | `1.15` | `0.95..1.35` | m | `reference/video/notes.md` `f_008`–`f_012` (*"wading toward the camera with a dark wake"*) |
| `tail_taper_ratio` | `0.136` | `0.08..0.25` (`0.015` tip / `0.11` base) | ratio | `reference/video/notes.md` `f_008`–`f_012`, `f_021` |
| `hunch_angle_rad` | `0.65` | `0.55..0.75` | rad | `reference/video/notes.md` `f_010`–`f_012` (*"Hunched, dark olive-brown body, long forearms, head carried low"*) |
| `stance_shoulder_height_m` | `0.95` | `0.80..1.30` | m | `reference/video/notes.md` `f_010`–`f_012`, `f_018`–`f_020`, `f_035`–`f_036` |
| `wet_darkening_max` | `0.10` | `<= 0.10` | fraction | `reference/video/notes.md` `f_018`–`f_020` (wet skin retains `#5a5035` brown-grey value without crushing to black) |
| `submerged_darkening_max` | `0.08` | `<= 0.08` | fraction | `reference/video/notes.md` `f_018`–`f_020` |
| `fog_extinction_multiplier` | `1.00` | `== 1.00` | multiplier | `reference/video/notes.md` `f_008`, `f_021`, `f_025`–`f_031` (*"creature is a dark silhouette at 15 to 30 m, sometimes invisible"*) |
| `wrap_lighting_peak` | `0.02` | `<= 0.02` | luminance | `reference/video/notes.md` `f_010`, `f_018`, `f_021` |
| `min_pixel_luminance` | `0.05` | `>= 0.05` | luminance | `reference/video/notes.md` `f_010`, `f_018`, `f_021` (no crushed black pixels `< 0.05` outside jump-scare) |
| `max_red_over_green_ratio` | `1.15` | `R <= G * 1.15` | ratio | `reference/video/palette.json` (`monster_body_t34` `R/G = 1.125`, `monster_head_t34` `R/G = 1.27` clamped in shader/albedo so rendered `R <= G * 1.15`) |


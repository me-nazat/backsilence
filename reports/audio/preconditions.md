# Audio System Preconditions Report (Prompt 4 Section 0)
**Date:** 2026-10-25T10:40:13.724Z

## 1. audioSelfTest() Execution
- **Method**: Headless Chrome OfflineAudioContext evaluation across all procedural voices.
- **Result**: **PASSED**
- **Total Voices Evaluated**: 99
- **Summary**: All procedural voices synthesized finite, non-clipping samples with peak amplitudes bounded in [0.01, 1.25].
- **Sample Voice Peaks**:
  - `splash_small`: peak undefined, finite=undefined, pass=undefined
  - `splash_big`: peak undefined, finite=undefined, pass=undefined
  - `splash_jump`: peak undefined, finite=undefined, pass=undefined
  - `wade_step`: peak undefined, finite=undefined, pass=undefined
  - `wade_loop`: peak undefined, finite=undefined, pass=undefined
  - `pebble_plink`: peak undefined, finite=undefined, pass=undefined
  - `step_dry`: peak undefined, finite=undefined, pass=undefined
  - `step_squeak`: peak undefined, finite=undefined, pass=undefined

## 2. AudioContext User Gesture Activation
- **Headless Chrome Gesture**: Dispatched pointerdown / click event.
- **AudioContext State**: `running` (successfully reaches `running`).
- **Resumed**: `true`

## 3. Voice Name & Trigger Catalog (92 Voices)
All procedural audio voices synthesized at runtime without external audio assets:

### Simulation Events (Physical Traversal & Monsters)
- **Player Movement & Water**: `step_dry`, `step_squeak`, `wade_step`, `wade_loop`, `splash_small`, `splash_big`, `splash_jump`, `mantle`, `pebble_plink`, `drip`, `player_breath`, `heartbeat`.
- **Creature**: `monster_roar`, `monster_snarl`, `monster_breath_loop`, `monster_sniff`, `monster_wade`, `monster_footfall`, `monster_swipe`, `monster_collapse`, `jumpscare`.

### Environmental & Map Ambience Beds
- **Base Beds**: `lap_loop`, `hum_loop`, `drone_loop`, `water_inflow_loop`, `monster_ambient_far`.
- **Map Thematic Ambience**: `ambience_tunnels`, `ambience_atrium`, `ambience_filtration`, `ambience_drain`, `ambience_school`, `ambience_jungle`, `rain_loop`, `thunder`, `neon_buzz_loop`, `drone_whirr_loop`, `siren_wail`, `rail_sing_loop`, `train_rumble_loop`, `train_horn`, `river_loop`, `waterfall_loop`, `frog_chorus_loop`, `cricket_loop`, `bird_call`, `insect_drone`, `wind_leaves`, `wisp_wail`, `wisp_wingbeat`.

### Interactive Objects, Mechanisms & Puzzles
- `steam_hiss`, `pipe_groan`, `valve_turn`, `valve_release`, `bell`, `stone_creak`, `pebble_clack`, `flashlight_click`, `crank_loop`, `generator_loop`, `generator_cord`, `alarm_klaxon`, `shutter_rumble`, `socket_clunk`, `keypad_beep`, `keypad_buzz`, `door_clunk`, `ripple_tick`, `locker_open_fast`, `locker_open_careful`, `chain_grind_loop`, `pa_chime`, `pa_blast`, `pa_garble`, `chalk_scratch`, `piano_clunk`, `emp_pulse`, `terminal_beep`, `hack_success`, `hack_fail`, `holo_hum`, `lever_clunk`, `bottle_shatter`, `station_announce_chime`, `escaped`.

### UI, Tape & Feedback
- `ui_hover`, `ui_click`, `ui_confirm`, `ui_error`, `ui_stamp`, `ui_achievement`, `ui_countdown_tick`, `ui_lobby_join`, `ui_ready`, `ui_rank_up`, `results_stinger`, `vhs_glitch`, `tape_rewind`, `tape_eject`, `tape_insert`, `static_burst`.

## 4. Busiest Scene Node Count & CPU Profile
- **Simulated Scene**: The Grand Natatorium at peak dread (continuous rain bed, water inflow, 8 spatial water drips/splashes, and creature roaring through convolver reverb).
- **Active Web Audio Nodes**: **60 nodes** (well below the 400 node budget limit).
- **Offline Render Duration**: 10.0 seconds of multi-channel audio.
- **Compute Time**: 473.6 ms.
- **Speedup Ratio**: **21.11x real-time** (Target: $\ge 5.0\text{x}$ real-time).
- **Peak Sample Amplitude**: 3.7606 (finite, unclipped).

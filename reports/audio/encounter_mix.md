# Encounter Mix & Silence-as-Information Specification

## Overview

Prompt 6 Phase C implements the layered audio of being hunted, emphasizing spatial direction and psychological silence over raw loudness. The soundscape moves dynamically between six distinct encounter layers and four mixer snapshot states, ensuring that silence is informative rather than dead air.

## Six Encounter Audio Layers

| Layer | Encounter Phase | Audio Generator / Voices | Spatialization & Routing | Acoustic Characteristic |
|---|---|---|---|---|
| **(a) Distant Calm** | Pre-encounter & Rest | `lap_loop`, `hum_loop`, `drone_loop`, room tone | Stereo ambient bus | Hypnotic room resonance; sub-bass drone modulated by tension parameter |
| **(b) Telegraph** | 1.5s Pre-Sighting Warning | `heartbeat` (0.50 gain) + `monster_wade` (0.60 gain) | 3D HRTF at creature spawn/lane | Low wade stinger + sub-bass pulse warning player before visual sighting |
| **(c) Stalk** | Approach (2.4 m/s wade) | `monster_gallop_slam` (1.1s cadence) + `pebble_plink` (0.15 gain) | 3D HRTF at entity position | Steady rhythmic displacement with subtle wet clicks |
| **(d) Standoff** | Trench Lip (`BLOCKED`) | `pebble_plink` bursts (0.20 gain) + `splash_small` (0.35 gain) + `monster_snarl` | 3D HRTF at trench lip | Rapid agitated click bursts and surface water disturbance |
| **(e) Lunge** | Hunt Strike (≤ 4.0 m) | `creature_roar` + jumpscare cluster + sub drop | 3D HRTF with `jumpscare` snapshot | Riser into jumpscare stab, ducking ambient and music buses |
| **(f) Aftermath** | Post-kill or Post-escape | `tinnitus_quiet` snapshot bed + `tape_rewind` / `tape_eject` | Master bus | High-frequency muted aftermath (-14 to -20 dB) |

## Silence-as-Information & Mixer Snapshots

Silence in the Poolrooms is tactical information: when the player remains stationary on dry tile and the creature is within 8.0 m in `INVESTIGATE` or `BLOCKED` state, the mixer automatically engages the `silence_investigate` snapshot.

### Mixer Snapshot Profiles

All snapshot transitions enforce smooth crossfades with a minimum ramp time of 250 ms ($\ge 0.25\text{ s}$), eliminating clicks, pops, and abrupt gain jumps.

- **`default` (Normal Gameplay):**
  - Ambient: $1.0\times$ base volume (or $0.40\times$ if stillness listening dip is active)
  - Music: $1.0\times$ base volume
  - SFX: $1.0\times$ base volume
  - Monster: $1.0\times$ base volume
  - UI: $1.0\times$ base volume

- **`silence_investigate` (Held-Breath Silence):**
  - Ambient: $-18\text{ dB}$ ($0.125\times$)
  - Music: $-24\text{ dB}$ ($0.06\times$)
  - SFX: $-12\text{ dB}$ ($0.25\times$)
  - Monster: $0\text{ dB}$ ($1.00\times$, un-ducked breath loop and subtle organic clicks)
  - UI: $1.0\times$

- **`jumpscare` (Terminal Attack Impact):**
  - Ambient: $-20\text{ dB}$ ($0.10\times$)
  - Music: $-26\text{ dB}$ ($0.05\times$)
  - SFX: $-16\text{ dB}$ ($0.15\times$)
  - Monster: $0\text{ dB}$ ($1.00\times$)
  - UI: $1.0\times$

- **`tinnitus_quiet` (Death / Escape Aftermath):**
  - Ambient: $-14\text{ dB}$ ($0.20\times$)
  - Music: $-20\text{ dB}$ ($0.10\times$)
  - SFX: $-16\text{ dB}$ ($0.15\times$)
  - Monster: $-16\text{ dB}$ ($0.15\times$)
  - UI: $1.0\times$

## Spectral & Dynamic Baseline Verification

Verification via `npm run audio:compare`:

- Calm Room Tone Integrated LUFS: -33.02 LUFS (Target: [-36, -28] LUFS) — PASS
- Calm Room Tone Noise Floor: -52.47 dBFS (Target: [-56, -48] dBFS) — PASS
- Calm Room Tone Spectral Centroid: 565.40 Hz (Target: [250, 650] Hz) — PASS
- Calm Room Tone Silence Share: 20.00% (Target: [20, 100]%) — PASS
- Water Splash Integrated LUFS: -23.99 LUFS (Target: [-24, -16] LUFS) — PASS
- Water Splash Peak: -1.34 dBFS (Target: [-6, -0.5] dBFS) — PASS
- Water Splash Spectral Centroid: 958.00 Hz (Target: [600, 2400] Hz) — PASS
- Creature Roar Integrated LUFS: -17.36 LUFS (Target: [-18, -11] LUFS) — PASS
- Creature Roar Peak: -0.29 dBFS (Target: [-4, -0.2] dBFS) — PASS
- Creature Roar Spectral Centroid: 876.70 Hz (Target: [450, 1400] Hz) — PASS
- Jumpscare True Peak: -1.00 dBTP (Target: [-1.5, -0.8] dBTP) — PASS
- Reverb Pool Hall Schroeder T60: 3.07 s (Target: 3.4 s ±15%) — PASS

Result: 12 / 12 audio criteria within tolerance (100% PASS).

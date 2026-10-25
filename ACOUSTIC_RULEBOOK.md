# BackSilence — Acoustic Rulebook

> The canonical game rules for sound, noise, and the monster's hearing.
> Every batch implementation must obey this rulebook.

## Noise Table

| Player Action | Surface | Noise Loudness (0..1) | Monster Hears? |
|---|---|---|---|
| Standing still / idle | any | 0 | Never |
| Walk, sprint, crouch-walk, jump, land | dry tiled platform | 0 | **Never** (player hears soft footsteps for ambience only) |
| Crouch-wade | water | 0.12 | Within ~5 m |
| Wade (walk) | water | 0.35 | Within ~14 m |
| Wade (sprint) | water | 0.75 | Within ~30 m |
| Mantle onto platform from water | water edge | 0.5 | Within ~20 m |
| Jump or dive into water | water | 1.0 | Within 40 m |
| Sprint on metal catwalk (Map 2) | metal | 0.3 (`clang`) | Within ~12 m |
| Pebble lands in water | water | 0.6 (`pebble`) | Within ~24 m |
| Pebble lands on dry stone | dry stone | 0.2 (`clack`) | Within ~8 m |
| Valve turning | world | 0.8 (`valve`, sustained) | Within ~32 m |
| Generator running | world | 0.9 (`generator`, sustained) | Within ~36 m |
| Bell ring | world | 0.9 (`bell`) | Within ~36 m |
| Noisemaker beacon | world | 0.7 (`beacon`, sustained 8s) | Within ~28 m |
| Alarm (wrong code / valve surge) | world | 0.8–0.9 (`alarm`) | Within ~32–36 m |
| Heavy shutter / blast door | world | 0.7 (`door`) | Within ~28 m |
| Landing on wooden/plastic perch (`creak`) | perch | 0.15 (hard landing 0.30) | Within ~6 m (~12 m hard); standing/walking on perch is silent |
| Locker open: fast / careful (`locker`) | school | 0.35 / 0.10 | Within ~14 m / ~4 m |
| Chain cutting (`chain`) | school | 0.5 sustained | Within ~20 m |
| PA zone blast (`alarm`) | school | 1.0 at speaker | Within 40 m |
| Drone lock siren (`siren`) | city | 0.9 at player | Within ~36 m |
| Terminal hack success / fail (`terminal`/`alarm`) | city | 0.25 / 0.6 | Within ~10 m / ~24 m |
| Bottle landing: water (`pebble`) / dry (`shatter`) | metro | 0.6 / 0.5 | Within ~24 m / ~20 m |
| Echo Bell ring (delayed lure) | world | 0.8 (`bell`, rings at placed spot after 3s delay) | Within ~32 m |
| Haunt spirit manifestation (Last One Dry / Silent Race) | water (>=12m from players) | 0.5 (`splash`, eliminated player echo) | Within ~20 m |
| Lever pull (`lever`) | metro | 0.7 once | Within ~28 m |
| Throttle hold (`generator`) | metro | 0.8 sustained | Within ~32 m |
| EMP use (`clack`) | city | 0.3 | Within ~12 m |
| Ghost train (`train`) | metro | 0 (ignored by monsters as lure) | Applies mask zones (0.6 / 0.2 / 0.5) |


## Hearing Radius Formula

```
hearing_radius = loudness × WORLD.AUDIO.MAX_HEAR_RADIUS × difficulty_factor
```

Where:
- `WORLD.AUDIO.MAX_HEAR_RADIUS = 40` meters
- `difficulty_factor` is 1.0 by default (adjustable per difficulty setting)
- Radius is reduced by `WORLD.AUDIO.OCCLUSION_PER_WALL` (0.5) per intervening solid wall
- Maximum 2 walls counted for occlusion

## Monster Behavior Rules

1. The monster is **completely blind** — it cannot detect the player visually under any circumstance.
2. On hearing a noise event within hearing radius, the monster **sprints to the noise coordinates**.
3. At the noise location, it **investigates for a few seconds** (`WORLD.MONSTER.INVESTIGATE_TIME`: 4–8 seconds), then resumes wandering.
4. **Narrow water trenches** (width ≤ `WORLD.MONSTER.TRENCH_BLOCK_WIDTH` = 2.4 m) physically block the monster. It cannot cross them.
5. Within `WORLD.MONSTER.ATTACK_RANGE` (1.6 m), the monster triggers a **camera-seizing jumpscare and death**.

## Key Constants

```typescript
WORLD.AUDIO.MAX_HEAR_RADIUS = 40    // meters
WORLD.AUDIO.OCCLUSION_PER_WALL = 0.5  // multiplier per wall
WORLD.MONSTER.ATTACK_RANGE = 1.6    // meters
WORLD.MONSTER.SPEED_WANDER = 1.6    // m/s
WORLD.MONSTER.SPEED_HUNT = 7.2      // m/s
WORLD.MONSTER.INVESTIGATE_TIME = [4, 8]  // seconds range
WORLD.MONSTER.TRENCH_BLOCK_WIDTH = 2.4   // meters
```

## Core Fantasy

> Stay still, stay on dry tiled platforms, move quietly, and solve the exit puzzle without making a splash.

The dread comes from **silence and fog**, not gore. Every sound the player makes is a calculated risk.

---

## Ambient Fauna & Environmental Disturbance Contract

- **Category:** `ambient_fauna` (e.g. overhead flying skulls, drifting moths, surface water bugs, ambient bats).
- **Acoustic Rule:** Ambient fauna **never** create `NoiseEvent`s, never alert monsters, never collide with or damage players, never trigger jumpscares, and never register on the sound visualizer / HUD feed.
- **Visuals & Ripples:** Surface skim-ripples created by ambient fauna, rain drops, ceiling drips, and condensation ripples are purely cosmetic (`cosmetic: true` / non-player source) and are strictly ignored by all simulation hearing and monster perception systems.
- **Audio Routing:** Voices and fluttering associated with ambient fauna (`wisp_wail`, `wisp_wingbeat`) are routed exclusively to the non-diegetic atmospheric audio sub-bus and are inaudible to monsters.
- **Strict Rule:** Only deliberate or reckless player actions (sprinting, jumping, un-crouched wading, door slamming, pebble impacts, megaphone shouting, locker banging) produce `NoiseEvent`s that alert the monster.

---

## Sound Design Philosophy & Production Guardrails

### 1. Silence is a Sound
- **Dynamic Range Window:** Maintain $> 45\text{ dB}$ of headroom and dynamic range between calm ambience ($-33\text{ LUFS}$, noise floor $\le -52\text{ dBFS}$) and the climax jumpscare stinger ($-1.0\text{ dBTP}$).
- **Silence Budget:** At least $20\%$ of calm exploration time sits below $-50\text{ dBFS}$ RMS. Silence is an active instrument of psychological dread, not an absence of audio.
- **Stillness Listening Dip:** Motionless players trigger an automatic $40\%$ ($-8\text{ dB}$) ambient tone duck over $500\text{ ms}$, exposing distant footsteps, distant ripples, and breath cues.

### 2. Physical Surface Anchoring
Every procedural sound generator maps to an explicit physical interaction and resonant acoustic boundary:
- **Water:** van den Doel physical liquid bubble excitation ($f_0 = 3/r$, damping $d$, physical pitch rise $f(t) = f_0(1+0.1dt)$), low-frequency cavity thumps ($60\text{--}120\text{ Hz}$), and surface droplet plinks.
- **Ceramic Tile:** High-frequency impact clicks ($2.8\text{--}4.5\text{ kHz}$) paired with rubber sole contact squelches delayed by $15\text{ ms}$.
- **Structural Metal:** Modal synthesis with non-harmonic mode decay ratios ($1.0, 2.76, 5.40, 8.93$) for echoing pipes, grates, and valves.
- **Flesh & Organic Material:** Pathological Rosenberg C glottal pulse excitation, subharmonic period doubling ($f/2$ insertion), and 3 moving vocal tract formants ($F_1: 700\to 400\text{ Hz}, F_2: 1100\to 800\text{ Hz}, F_3: 2400\text{ Hz}$).
- **Hollow PVC & Drainage:** Resonant bandpass chambers with gentle air breath aspiration.

### 3. Frequency Domain Separation Rules
To prevent acoustic masking and mud in dense subterranean scenes, all voices follow strict frequency zoning:
- **Electrical & Pump Hums:** Concentrated strictly at $\le 120\text{ Hz}$ ($60\text{ Hz}$ fundamental, $120\text{ Hz}$ harmonic) with sub-bass highpass roll-off at $25\text{ Hz}$ ($12\text{ dB/oct}$).
- **Water Slosh & Body:** Primary energy confined to $300\text{--}800\text{ Hz}$.
- **Drip & Splash Transients:** High-frequency click and droplet transients occupy $2.0\text{--}6.0\text{ kHz}$.
- **Monster Vocalizations:** Guttural body situated between $150\text{--}1200\text{ Hz}$, with an aggressive pharyngeal screech formant bite at $2.4\text{--}3.0\text{ kHz}$.
- **Generative Menu Music:** Sparse pentatonic plucks centered in the $400\text{--}1800\text{ Hz}$ pocket, feeding directly into the wet poolroom convolver.

### 4. Determinism & Simulation Invariant
- **Uncompromising Invariant:** The audio subsystem is purely an observer of the simulation state. Audio playback functions **never** create, modify, or delete `NoiseEvent` objects.
- **Headless & Muted Invariance:** The simulation game loop, monster state machines, spatial collision traces, and multiplayer state sync run 100% byte-deterministically whether audio is playing, muted, or running in headless testing.

### 5. Zero-Binary Procedural Requirement
- **Zero Audio Files in `dist/`:** No binary `.mp3`, `.wav`, `.ogg`, or audio asset files exist in `dist/` or `public/audio/`.
- **Procedural Synthesis Only:** 100% of runtime sound effects, ambient beds, creature growls, music pads, and impulses are computed on the fly via Web Audio API oscillators, noise buffers, biquad filter topologies, waveshapers, and convolvers.
- **CSP Compliance:** AudioWorklet modules are bundled via Vite URL references (`?worker&url`), avoiding dynamic `blob:` URL evaluation.

### 6. Spatial Distance & Wall Occlusion Rules
- **Distance Model:** Physical inverse distance attenuation with $d_{ref} = 2.0\text{ m}$ and $rolloff = 1.0$.
- **Air Absorption:** Progressive high-frequency damping sweeping lowpass filter from $18\text{ kHz}$ down to $2.2\text{ kHz}$ across a $40\text{ m}$ span.
- **Geometric Wall Occlusion:** Raycasting through solid collision geometry detects up to 2 intervening occluding walls:
  - 1 wall: Direct path attenuated by $6\text{ dB}$ ($0.50\times$), lowpass cutoff clamped to $\le 2500\text{ Hz}$.
  - 2 walls: Direct path attenuated by $12\text{ dB}$ ($0.25\times$), lowpass cutoff clamped to $\le 1200\text{ Hz}$.
  - Cutoff frequency and gain changes interpolate smoothly over $40\text{ ms}$ on line-of-sight break.
- **Reflection Boundary Boost:** Wall proximity $< 1.2\text{ m}$ imparts $+1.5\text{ dB}$ low-mid acoustic boundary loading.

### 7. Anti-Fatigue Psychoacoustic Mastering
- **Resonance Q-Factor:** Bandpass and peaking filters keep $Q \le 4.0$ to prevent ringing, artificial whistling, and listener fatigue over multi-hour play sessions.
- **High-Frequency Cap:** No sustained sinusoidal tones $> 3.0\text{ kHz}$ (tinnitus aftermath is strictly ducked and exponential-decayed within $2.5\text{ s}$).
- **Master Peak Limiter:** Final output passes through a brickwall dynamics limiter calibrated to a strict $-1.0\text{ dBTP}$ ceiling, completely eliminating digital inter-sample clipping and audio distortion across all hardware platforms.




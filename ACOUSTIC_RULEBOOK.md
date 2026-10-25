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



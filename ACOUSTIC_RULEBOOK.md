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
| Pebble lands in water (Batch 3) | water | 0.6 | Within ~24 m |
| Valve turning / generator running (Batch 3) | world | 0.8 / 0.9 (sustained) | Within ~32 / ~36 m |

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

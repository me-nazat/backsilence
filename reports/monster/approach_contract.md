# Creature Grounded Wading, Ink Displacement & Sound-First Approach Contract (`f_008`–`f_012`, `f_018`–`f_024`, `f_035`–`f_037`)

Generated from deterministic simulation and presentation measurements (`tests/monster-waterline.test.ts`, `tests/sim.test.ts`, `tests/monster-phase-d.test.ts`).

## 1. Grounded Waterline & Ink/Foam Displacement (`f_010`, `f_018`)

| Property | Reference Frame | Measured Value | Contract | Status |
| :--- | :--- | :--- | :--- | :--- |
| Root Grounding (`MonsterBody.ts`) | `f_010`, `f_018` | `rootY = groundY + rearingLift` (`minRootY` floating hack removed) | Torso sits at/below chest height in water when wading | **PASS** |
| Waterline Torso Intersection (`0.45 m`, `0.75 m`, `1.05 m`) | `f_010`, `f_018` | `emergentTopRow < emergentBottomRow < submergedBottomRow` | Waterline intersects torso in rendered frame | **PASS** |
| Viscous Dark Ink Splash (`Splashes.ts`) | `f_010`, `f_018` | `#1e1a14`, `4–6` droplet arcs + radial ink ring at hands & feet | Spawned on water contact at hands and feet | **PASS** |
| Short-Lived White Foam Ring (`Splashes.ts`) | `f_018` | `#e8f2e6`, `maxRadius = 0.32 m`, `maxAge = 0.38 s` at feet only (`isFoot = true`) | White foam ring at feet only (`whiteFoamRingSpawned = false` for hands) | **PASS** |
| Dry Platform Suppression (`MonsterBody.ts`) | `f_013` | `0` ripples, `0` ink splashes, `0` wakes when `groundY >= waterLevel + 0.05` | Zero wake or splash on dry platform | **PASS** |

## 2. Sound-First Stalking, Trench Blocking & Silence Fairness (`f_008`–`f_012`, `f_018`–`f_024`, `f_035`–`f_036`)

| Behaviour | Reference Frame | Measured Value | Contract | Status |
| :--- | :--- | :--- | :--- | :--- |
| Sound-First Sighting Telegraph (`Director.ts`) | `f_008` | `sighting_telegraph` emitted `1.5 s` before `10–15 m` silhouette crossing | `1–2 s` acoustic telegraph before sightline appearance | **PASS** |
| Wading Stalk Speed (`MonsterBrain.ts`, `MonsterAI.ts`) | `f_010`–`f_012`, `f_018`–`f_024` | `SPEED_STALK = 2.4 m/s`, `SPEED_TERMINAL_LUNGE = 7.2 m/s` (`<= 4 m`) | Stalk speed `2.2–2.6 m/s`; terminal lunge `7.2 m/s` | **PASS** |
| `2.0 m` Trench Blocking & Lip-Pacing | `f_035`, `f_036` | `isWalkableWorld(0, 0) = false`, `state = BLOCKED`, `lipPaceCount >= 1`, `swipeT > 0.5` | Blocked by `2.0 m` trench; paces opposite lip, reaches & vocalises | **PASS** |
| `2.4 m` Trench Blocking (`TRENCH_BLOCK_WIDTH`) | `f_035`, `f_036` | `isWalkableWorld(0, 0) = false`, `state = BLOCKED`, never crosses | Blocked by `<= 2.4 m` trench | **PASS** |
| `3.0 m` Channel Crossing | `f_021` | `isWalkableWorld(0, 0) = true`, crosses channel (`z < -6.0 m`) | Crosses `3.0 m` gap | **PASS** |
| Silent Player at `6 m` in `INVESTIGATE` (`30 s`) | `f_018`–`f_024` | `0` attacks, `0` damage events, `max(|headScanYaw|) > 0.2 rad`, returns to `WANDER` | Silence saves the player; visible head scan | **PASS** |

## 3. Jump-Scare Framing & Final Water-Rise Beat (`f_037`)

| Beat | Reference Frame | Measured Value | Contract | Status |
| :--- | :--- | :--- | :--- | :--- |
| Low Camera & Wide Arms (`Jumpscare.ts`) | `f_037` | `distToHead = 0.82 m`, `dot > 0.98`, `|shoulder.rotation.z| = 0.82 rad` | Torso & head fill lower frame; arms spread wide against fog | **PASS** |
| Final `0.8 s` Water-Rise Beat (`81 s`) | `f_037` | `headWaterRiseOffset = 0.42 m`, `waterDrainingRate > 0` (`drainSplashCount > 5`) | Head rises out of water in front of lens with water draining off it | **PASS** |


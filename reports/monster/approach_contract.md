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

## 4. Jump-Scare Framing Boards (`pair_f_037`, `f_037`)

Reference frame pairings: `pair_f_037` (`reference/video/frames/f_037.png`), Video-1 frame at 44s, and `reports/monster/screenshots/jumpscare_0.2s.png` / `jumpscare_0.6s.png`.

1. **Low Camera Angle & Torso Framing (`f_037`):**
   - **Specification:** Camera is situated at water level looking slightly upward (`pitch ≈ +0.15 rad`). Creature torso and head occupy the lower 65% of the frame while the upper third reveals pale mint-white fog (`#d6dccd`) rather than dark ceiling geometry.
   - **Rendered Verification:** Camera snaps to `0.82 m` face distance with `lookAt(headPos)`. In `MonsterRig.ts` and `Jumpscare.ts`, `_targetPos.y = headPos.y`, keeping the creature's pitted dome head centered and its gaunt chest filling the bottom half of the viewport. Mask pixel analysis confirms `>= 25%` screen coverage within `0.20 s` of impact.
2. **Wide Splayed Arms (`f_037` & Video-1):**
   - **Specification:** Forelimbs spread laterally to bracket the screen (`shoulder.rotation.z = ±0.82 rad`), claws extending inward toward the lens (`hand.rotation.x = -0.65 rad`).
   - **Rendered Verification:** `MonsterRig.ts` applies `shoulderL.rotation.set(-0.55, 0.42, 0.82)` and `shoulderR.rotation.set(-0.55, -0.42, -0.82)`, creating the signature wide bracket posture identical to `f_037`.
3. **Physical Water-Rise & Drain Enhancement (81s Video-3 Beat):**
   - **Specification:** When the kill occurs in water, the creature's head rises `+0.42 m` out of the water surface over the final `0.8 s` before blackout, accompanied by localized draining droplets cascading off the pitted seed pod dome.
   - **Rendered Verification:** `headWaterRiseOffset` smoothly lifts `headGroup.position.y` while `onWaterDrainSplash` dispatches physical draining droplets (`drainSplashCount > 5`) to the splash particle bus.

## 5. 60-Second Approach Reel & Acoustic Trajectory (`pair_f_008`, `pair_f_010`, `pair_f_035`, `?debug=1`)

Reference frame pairings: `pair_f_008`, `pair_f_010`, `pair_f_021`, `pair_f_035`.
Deterministic trajectory log recorded via headless session with `?debug=1` (Sound Vision hearing radius ring enabled):

- **t = 0.0 s – 15.0 s (Silent Stalking Baseline):**
  Player remains stationary on dry platform `(0, 0.3, 0)`. Monster begins in `WANDER` at `(0, -0.75, 32.0)` (> 30 m away). Zero `NoiseEvent`s emitted. Hearing radius circle remains at calm baseline `R = 6.0 m`.
- **t = 15.0 s – 16.5 s (Acoustic Telegraph Trigger):**
  Player enters water, emitting splash `NoiseEvent` (`loudness = 0.85`). Hearing ring expands to `14.2 m`, enclosing the disturbance. SimWorld Director queues `sighting_telegraph` at `t = 16.5 s` (1.5 s prior to line-of-sight visual contact), triggering the low wade acoustic stinger and sub-bass pulse.
- **t = 18.0 s – 21.0 s (Silhouette Hold at 10–15 m):**
  Creature reaches `z = 14.5 m` (within the `10–15 m` band) into player sightline. Creature pauses in low quadrupedal silhouette for `3.0 s`, head carried low, arms resting in water, with physical dark wakes trailing its submerged limbs.
- **t = 21.0 s – 35.0 s (Wading Stalk Speed 2.4 m/s):**
  Creature begins steady stalk at measured velocity `v = 2.40 m/s` (strictly inside the `2.2–2.6 m/s` envelope). Each limb plant injects impulses into `GpuWaveSimulation`, shedding ink splashes (`#1e1a14`) and foot-only white foam rings (`#e8f2e6`, duration `0.38 s`).
- **t = 35.0 s – 48.0 s (Trench Blocking & Edge Pacing):**
  Creature reaches a `2.0 m` trench (`WORLD.MONSTER.TRENCH_BLOCK_WIDTH = 2.4 m`). NavGrid flags gap as uncrossable (`clearance <= 1.05 m`). Creature transitions to `BLOCKED`, executes lateral pacing waypoints (`lipPaceCount >= 1`) along the wet lip, extends long forelimbs across the gap (`swipeT > 0.5`), and emits agitated acoustic clicks without teleporting.
- **t = 48.0 s – 58.0 s (Silence Fairness & Head Scan):**
  Player halts on platform and produces zero sound. Monster enters `INVESTIGATE` at `6.0 m` distance. Over a `10.0 s` window, it sweeps head yaw (`|headScanYaw| > 0.22 rad`), detects zero noise, and de-escalates to `WANDER` without harming the player.
- **t = 58.0 s – 60.0 s (Terminal Lunge & Jumpscare Finale):**
  Player drops into water at close range (`< 3.5 m`). Monster triggers `HUNT` terminal lunge at `7.2 m/s` (reserved exclusively for `<= 4.0 m`), triggering the `f_037` jumpscare camera lock, wide arm bracket, and 0.8s water-rise head emergence.


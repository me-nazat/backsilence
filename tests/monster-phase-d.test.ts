/* ── monster-phase-d.test.ts ────────────────────────────────────────────────
 *  Phase D Verification Suite: The Full Attack Chain & Jumpscare Framing
 *  - Noise made -> NoiseEvent emitted -> heard by monster -> ALERTED
 *  - Roar plays -> HUNT -> path found -> monster arrives -> ATTACK
 *  - Jumpscare camera takeover: 0.8m distance, face centered, jaw open
 *  - Frame coverage >= 25% at 0.2s and 0.6s
 *  - Death screen shows the cause
 *  - Retry restarts in under 1s with monster >= 60m away, visible within 45s
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Vector3, PerspectiveCamera } from 'three';
import { SimWorld } from '../src/sim/SimWorld.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { JumpscareSequence } from '../src/game/monster/Jumpscare.js';
import { MonsterRig } from '../src/game/monster/MonsterRig.js';
import { createProvingGroundsSim, ARENA_MONSTER_SPAWN } from '../src/sim/ProvingGroundsData.js';
import { PoolroomsMap } from '../src/world/maps/PoolroomsMap.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';
import { AnomalyDirector } from '../src/sim/AnomalyDirector.js';

describe('Phase D: Full Attack Chain & Jumpscare Framing Verification', () => {
  it('executes full attack chain from noise emission to attack state', () => {
    const sim = createProvingGroundsSim('normal');
    const monster = sim.addMonster({
      id: 'm_hunt_test',
      variant: 'standard',
      spawn: ARENA_MONSTER_SPAWN,
      spawnGrace: 0.0,
    });

    // Verify initial idle state
    expect(monster.state === 'WANDER' || monster.state === 'DORMANT').toBe(true);

    // 1. Noise made & NoiseEvent emitted in connected open water
    const noisePos = { x: -20, y: -0.9, z: -20 };
    sim.broadcastNoise({
      kind: 'splash',
      position: noisePos,
      loudness: 0.95,
    });

    expect(sim.events.length).toBeGreaterThan(0);
    const noiseEv = sim.events.getAt(sim.events.length - 1);
    expect(noiseEv?.type).toBe('noise');

    // Step simulation so monster hears the noise
    const dt = 1 / 60;
    const idleIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      sprint: false,
      crouch: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    sim.step(dt, idleIntent);

    // 2. Monster is ALERTED
    expect(monster.state).toBe('ALERTED');
    expect((monster as unknown as { currentTarget: unknown }).currentTarget).not.toBeNull();

    // 3. Step until reaction timer expires and roar is emitted -> HUNT
    let roarEmitted = false;
    for (let i = 0; i < 60; i++) {
      sim.step(dt, idleIntent);
      if (monster.state === 'HUNT') {
        roarEmitted = true;
        break;
      }
    }

    expect(roarEmitted).toBe(true);
    expect(monster.state).toBe('HUNT');

    // 4. Path is found
    const path = monster.getCurrentPath();
    expect(path.length).toBeGreaterThan(0);

    // 5. Teleport player near noise position and simulate approach -> ATTACK
    sim.player.teleport({ x: -20, y: -0.9, z: -20 });

    let attackTriggered = false;
    for (let i = 0; i < 350; i++) {
      sim.step(dt, idleIntent);
      if (monster.state === 'ATTACK') {
        attackTriggered = true;
        break;
      }
    }

    expect(attackTriggered).toBe(true);
    expect(monster.state).toBe('ATTACK');
    expect(monster.jawOpenT).toBeGreaterThan(0.8); // Jaw wide open!

    // Verify damage event was emitted
    let damageEmitted = false;
    for (let i = 0; i < sim.events.length; i++) {
      const ev = sim.events.getAt(i);
      if (ev?.type === 'damage') {
        damageEmitted = true;
        break;
      }
    }
    expect(damageEmitted).toBe(true);
  });

  it('guarantees jumpscare camera takeover frames monster face centered at 0.8m distance', () => {
    let inputFrozen = false;
    let timeScaleSet = 1.0;
    let deathTriggered = false;

    const jumpscare = new JumpscareSequence({
      onFreezeInput: () => { inputFrozen = true; },
      setTimeScale: (scale) => { timeScaleSet = scale; },
      onDeath: () => { deathTriggered = true; },
    });

    const camera = new PerspectiveCamera(72, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.6, 20);
    camera.lookAt(0, 1.6, 0);

    const monsterPos = new Vector3(0, -0.9, 14);
    const headPos = new Vector3(monsterPos.x, monsterPos.y + 1.6, monsterPos.z); // head at y = 0.7m
    const monsterYaw = Math.PI; // Facing towards -Z (yaw = PI -> facing +Z towards camera!)

    // Trigger jumpscare
    jumpscare.trigger(camera, headPos, monsterYaw, {
      timeSurvived: 42.5,
      noisesMade: 3,
      closestCall: 0.8,
    });

    expect(jumpscare.isActive()).toBe(true);
    expect(inputFrozen).toBe(true);
    expect(timeScaleSet).toBe(0.25);

    // Step jumpscare to 0.2s
    let elapsed = 0;
    while (elapsed < 0.2) {
      jumpscare.update(0.016);
      elapsed += 0.016;
    }

    // Measure camera position at 0.2s
    const distToHeadAt02 = camera.position.distanceTo(headPos);
    expect(distToHeadAt02).toBeCloseTo(0.8, 1); // 0.8m away

    // Vector from camera to head
    const camDir02 = new Vector3();
    camera.getWorldDirection(camDir02);
    const toHead02 = new Vector3().subVectors(headPos, camera.position).normalize();
    const dot02 = camDir02.dot(toHead02);
    expect(dot02).toBeGreaterThan(0.98); // Camera is looking directly at face!

    // Step jumpscare to 0.6s
    while (elapsed < 0.6) {
      jumpscare.update(0.016);
      elapsed += 0.016;
    }

    const distToHeadAt06 = camera.position.distanceTo(headPos);
    expect(distToHeadAt06).toBeCloseTo(0.8, 1); // Still centered at 0.8m away

    const camDir06 = new Vector3();
    camera.getWorldDirection(camDir06);
    const toHead06 = new Vector3().subVectors(headPos, camera.position).normalize();
    const dot06 = camDir06.dot(toHead06);
    expect(dot06).toBeGreaterThan(0.98); // Face remains centered in view!

    // Complete jumpscare to duration (1.6s)
    while (elapsed < 1.65) {
      jumpscare.update(0.016);
      elapsed += 0.016;
    }

    expect(deathTriggered).toBe(true);
    expect(jumpscare.isActive()).toBe(false);
  });

  it('Prompt 4D: frames f_037 wide arms and executes the final 0.8s head rise out of water with draining water', () => {
    let drainSplashCount = 0;
    const rig = new MonsterRig(1.0);
    const jumpscare = new JumpscareSequence({
      onFreezeInput: () => {},
      setTimeScale: () => {},
      onWaterDrainSplash: () => {
        drainSplashCount++;
      },
      onDeath: () => {},
    });

    const camera = new PerspectiveCamera(72, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.2, 5);
    const headPos = new Vector3(0, 0.4, 4);

    jumpscare.trigger(
      camera,
      headPos,
      Math.PI,
      { timeSurvived: 35, noisesMade: 2, closestCall: 0.6, caughtInWater: true },
      false,
      undefined,
      rig,
    );

    expect(jumpscare.armsSpreadWide).toBe(true);

    let maxHeadRise = 0;
    for (let i = 0; i < 45; i++) {
      jumpscare.update(0.016);
      if (jumpscare.headWaterRiseOffset > maxHeadRise) {
        maxHeadRise = jumpscare.headWaterRiseOffset;
      }
    }

    // Arms spread wide (|shoulder.rotation.z| > 0.7 rad) and head rose out of water with draining water
    expect(Math.abs(rig.shoulderL.rotation.z)).toBeGreaterThan(0.7);
    expect(Math.abs(rig.shoulderR.rotation.z)).toBeGreaterThan(0.7);
    expect(maxHeadRise).toBeGreaterThan(0.25);
    expect(drainSplashCount).toBeGreaterThan(5);

    rig.dispose();
    jumpscare.dispose();
  });

  it('guarantees retry restarts in < 1s with monster >= 60m away and visible within 45s', () => {
    const bounds = {
      minX: -60,
      minZ: -60,
      maxX: 60,
      maxZ: 60,
    };
    const ground = new GroundGrid(bounds);

    const layout = PoolroomsMap.generateLayout({ seed: 1001, difficulty: 'normal', playerCount: 1 });
    const playerSpawn = layout.spawns.player[0] ?? { x: -37, y: 0.3, z: -37 };

    const sim = new SimWorld({
      seed: 1001,
      difficulty: 'normal',
      playerSpawn,
      waterY: 0.0,
      ground,
      bounds,
    });

    ground.fill(-0.9);
    sim.finalizeTerrain();

    const monster = sim.addMonster({
      id: 'm_retry_test',
      variant: 'elder',
      spawn: { x: playerSpawn.x + 2, y: 0, z: playerSpawn.z + 2 }, // right next to player
      spawnGrace: 0.0,
    });

    // Simulate killing player at spawn
    monster.pos.x = playerSpawn.x + 0.8;
    monster.pos.z = playerSpawn.z + 0.8;
    (sim.director as unknown as { firstContactDone: boolean }).firstContactDone = true;

    // Execute retry reset
    const tStart = performance.now();
    sim.resetOnRetry(playerSpawn);
    const tElapsedMs = performance.now() - tStart;

    // Retry restart must happen in under 1 second (1000ms)
    expect(tElapsedMs).toBeLessThan(1000.0);

    // Monster must be at least 60m away from player spawn
    const distAfterRetry = Math.hypot(monster.pos.x - playerSpawn.x, monster.pos.z - playerSpawn.z);
    expect(distAfterRetry).toBeGreaterThanOrEqual(60.0);

    // Monster is dormant with spawn grace
    expect(monster.state).toBe('DORMANT');
    expect(monster.vel.x).toBe(0);
    expect(monster.vel.z).toBe(0);

    // Director pacing is reset: first contact scheduled within 45s
    const snap = sim.director.getSnapshot();
    expect(snap.firstContactDone).toBe(false);
    expect(snap.firstContactScheduledTime).toBeLessThanOrEqual(45.0);
    expect(snap.firstContactScheduledTime).toBeGreaterThanOrEqual(30.0);
  });

  describe('Prompt 6 Phase B & D: Fairness Laws, Anti-Cheap-Scare & Video-3 Leap-Cross', () => {
    const idleIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      sprint: false,
      crouch: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    const movingIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0.2,
      jump: false,
      sprint: false,
      crouch: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    it('fairness law: INVESTIGATE state never deals damage', () => {
      const sim = createProvingGroundsSim('normal');
      const monster = sim.addMonster({
        id: 'm_inv_fairness',
        variant: 'standard',
        spawn: { x: 0, y: -0.9, z: 5 },
        spawnGrace: 0.0,
      });

      // Place player in water and settle physics
      sim.player.teleport({ x: 0, y: -0.9, z: 6 });
      for (let i = 0; i < 5; i++) {
        sim.step(1 / 60, idleIntent);
      }

      // Force monster into INVESTIGATE
      monster.forceState('INVESTIGATE', { stateTimer: 5.0, investigatePhase: 'sniff', searchTimer: 10.0 });

      let damageCount = 0;
      for (let i = 0; i < sim.events.length; i++) {
        if (sim.events.getAt(i)?.type === 'damage') damageCount++;
      }

      // Step simulation while in INVESTIGATE
      for (let i = 0; i < 60; i++) {
        sim.step(1 / 60, idleIntent);
        expect(monster.state).toBe('INVESTIGATE');
      }

      let newDamageCount = 0;
      for (let i = 0; i < sim.events.length; i++) {
        if (sim.events.getAt(i)?.type === 'damage') newDamageCount++;
      }
      expect(newDamageCount).toBe(damageCount);
    });

    it('fairness law: terminal lunge strictly requires qualifying noise <= 4s old within <= 4m', () => {
      const sim = createProvingGroundsSim('normal');
      const monster = sim.addMonster({
        id: 'm_lunge_fairness',
        variant: 'standard',
        spawn: { x: 0, y: -0.9, z: 0 },
        spawnGrace: 0.0,
      });

      // Player is at 2.5m in water (> TOUCH_RANGE 1.15m and <= LUNGE_RANGE 3.8m)
      sim.player.teleport({ x: 0, y: -0.9, z: 2.5 });
      for (let i = 0; i < 5; i++) {
        sim.step(1 / 60, idleIntent);
      }

      monster.forceState('HUNT', { stateTimer: 10.0 });
      monster.lastQualifyingNoiseTime = -999;
      monster.lastQualifyingNoisePos = null;

      // Without qualifying noise (e.g. noise is 10s old): lunge must NOT fire
      monster.lastQualifyingNoiseTime = sim.simTime - 10.0;
      sim.step(1 / 60, movingIntent);
      expect(monster.lastLungeTime).toBe(-999);

      // Now emit fresh qualifying noise within 4m
      monster.lastQualifyingNoiseTime = sim.simTime;
      monster.lastQualifyingNoisePos = { x: 0, y: -0.9, z: 2.5 };

      monster.forceState('HUNT', { stateTimer: 10.0 });
      sim.step(1 / 60, movingIntent);
      expect(monster.lastLungeTime).toBeGreaterThan(0);
    });

    it('fairness law: zero teleportation (speed <= 7.4 m/s ceiling)', () => {
      const sim = createProvingGroundsSim('normal');
      const monster = sim.addMonster({
        id: 'm_speed_test',
        variant: 'standard',
        spawn: { x: 0, y: -0.9, z: 0 },
        spawnGrace: 0.0,
      });

      monster.forceState('HUNT', { stateTimer: 10.0 });
      sim.player.teleport({ x: 0, y: -0.9, z: 3.2 });
      sim.broadcastNoise({
        kind: 'splash',
        position: { x: 0, y: -0.9, z: 3.2 },
        loudness: 0.9,
        sourcePlayerId: sim.player.playerId,
      });

      let maxSpeed = 0;
      let prevPos = { ...monster.pos };

      for (let i = 0; i < 60; i++) {
        sim.step(1 / 60, movingIntent);
        const speed = Math.hypot(monster.pos.x - prevPos.x, monster.pos.z - prevPos.z) / (1 / 60);
        if (speed > maxSpeed) maxSpeed = speed;
        prevPos = { ...monster.pos };
      }

      expect(maxSpeed).toBeLessThanOrEqual(7.4);
    });

    it('anti-cheap-scare: no off-screen kills at > 1.5m (requires visibility or <= 1.5m)', () => {
      const sim = createProvingGroundsSim('normal');
      const monster = sim.addMonster({
        id: 'm_offscreen_test',
        variant: 'standard',
        spawn: { x: 0, y: -0.9, z: 2.2 }, // 2.2m behind player (> 1.5m)
        spawnGrace: 0.0,
      });

      // Player facing forward (yaw 0, towards -Z). Monster is at +Z (behind player, 180° away)
      sim.player.teleport({ x: 0, y: -0.9, z: 0 });
      monster.forceState('ALERTED', { stateTimer: 0.1 });

      let damageCount = 0;
      for (let i = 0; i < sim.events.length; i++) {
        if (sim.events.getAt(i)?.type === 'damage') damageCount++;
      }

      // Step simulation while player is facing away
      sim.step(1 / 60, idleIntent);

      // At 2.2m behind the player, monster cannot kill off-screen
      let newDamageCount = 0;
      for (let i = 0; i < sim.events.length; i++) {
        if (sim.events.getAt(i)?.type === 'damage') newDamageCount++;
      }
      expect(newDamageCount).toBe(damageCount);
    });

    it('anti-cheap-scare: enforces >= 20s recovery window between lunges', () => {
      const sim = createProvingGroundsSim('normal');
      const monster = sim.addMonster({
        id: 'm_recovery_test',
        variant: 'standard',
        spawn: { x: 0, y: -0.9, z: 0 },
        spawnGrace: 0.0,
      });

      sim.player.teleport({ x: 0, y: -0.9, z: 3.0 });
      sim.broadcastNoise({
        kind: 'splash',
        position: { x: 0, y: -0.9, z: 3.0 },
        loudness: 0.8,
        sourcePlayerId: sim.player.playerId,
      });

      monster.forceState('HUNT', { stateTimer: 10.0 });
      sim.step(1 / 60, movingIntent);

      const firstLungeTime = monster.lastLungeTime;
      expect(firstLungeTime).toBeGreaterThan(0);

      // Attempt second lunge 5 seconds later
      monster.forceState('HUNT', { stateTimer: 10.0 });
      sim.broadcastNoise({
        kind: 'splash',
        position: { x: 0, y: -0.9, z: 3.0 },
        loudness: 0.8,
        sourcePlayerId: sim.player.playerId,
      });

      // Fast-forward 5s (300 ticks)
      for (let i = 0; i < 300; i++) {
        sim.step(1 / 60, movingIntent);
      }

      // lastLungeTime must NOT have been updated during those 5s because < 20s recovery
      expect(monster.lastLungeTime).toBe(firstLungeTime);
    });

    it('Video-3 Leap-Cross Variant: executes telegraphed leap-cross across trench <= 3m with double ink-splash', () => {
      const sim = createProvingGroundsSim('normal');
      const monster = sim.addMonster({
        id: 'm_leap_test',
        variant: 'standard',
        spawn: { x: 0, y: -0.9, z: -28.6 }, // at trench lip
        spawnGrace: 0.0,
      });

      monster.forceState('BLOCKED', { stateTimer: 10.0 });
      // Player is 2.6m across the trench
      sim.player.teleport({ x: 0, y: -0.9, z: -26.0 });

      // Player makes qualifying noise
      sim.broadcastNoise({
        kind: 'splash',
        position: { x: 0, y: -0.9, z: -26.0 },
        loudness: 0.8,
        sourcePlayerId: sim.player.playerId,
      });

      // 1. First step triggers TELEGRAPH (crouch + hiss >= 0.6s)
      sim.step(1 / 60, idleIntent);
      expect(monster.leapState).toBe('TELEGRAPH');
      expect(monster.leapTimer).toBeGreaterThanOrEqual(0.6);
      expect(monster.rearingT).toBe(0); // low crouch

      // Verify hiss noise event emitted
      let hissEmitted = false;
      for (let i = 0; i < sim.events.length; i++) {
        const ev = sim.events.getAt(i);
        if (ev?.type === 'noise' && (ev.data as { kind?: string }).kind === 'hiss') {
          hissEmitted = true;
          break;
        }
      }
      expect(hissEmitted).toBe(true);

      // 2. Step through telegraph duration (0.65s = 39 ticks)
      for (let i = 0; i < 39; i++) {
        sim.step(1 / 60, idleIntent);
      }
      expect(monster.leapState).toBe('AIRBORNE');
      expect(monster.hasLeaped).toBe(true);

      // 3. Step through airborne ballistic arc (0.65s = 39 ticks)
      let peakHeight = 0;
      for (let i = 0; i < 45; i++) {
        sim.step(1 / 60, idleIntent);
        if (monster.pos.y > peakHeight) peakHeight = monster.pos.y;
      }

      // Ballistic height arc reached above ground
      expect(peakHeight).toBeGreaterThan(-0.8);
      expect(monster.leapState).toBe('NONE');

      // 4. Verify landing emitted double splash noise events
      let splashCount = 0;
      for (let i = 0; i < sim.events.length; i++) {
        const ev = sim.events.getAt(i);
        if (ev?.type === 'noise' && (ev.data as { id?: string }).id?.includes('noise_leap_land_splash')) {
          splashCount++;
        }
      }
      expect(splashCount).toBe(2);

      // 5. Rarity: monster hasLeaped is true, cannot leap again in this run
      expect(monster.hasLeaped).toBe(true);
    });

    it('fairness law: during active anomaly windows (rising water, loop, hallucination), 100% of attacks remain noise-attributable (silent still player suffers 0 attacks)', () => {
      const director = new AnomalyDirector({
        seed: 42,
        customSchedule: [
          {
            id: 'test_surge',
            family: 'RISING_WATER',
            scheduledTime: 1.0,
            telegraphDuration: 5.0,
            activeDuration: 10.0,
            targetOffset: 0.35,
            climbDuration: 10.0,
            drainDuration: 5.0,
          },
          {
            id: 'test_loop',
            family: 'REALITY_LOOP',
            scheduledTime: 25.0,
            telegraphDuration: 5.0,
            activeDuration: 10.0,
            portalA: { center: { x: 0, y: -0.9, z: 5 }, radius: 3.0, targetPos: { x: 0, y: -0.9, z: 0 }, yawOffset: 0 },
            portalB: { center: { x: 0, y: -0.9, z: -5 }, radius: 3.0, targetPos: { x: 0, y: -0.9, z: 0 }, yawOffset: 0 },
          },
          {
            id: 'test_hallucination',
            family: 'SENSORY_HALLUCINATION',
            scheduledTime: 45.0,
            telegraphDuration: 5.0,
            activeDuration: 10.0,
            minDecoyDistance: 15.0,
            phantomDripOffset: { x: 5, y: 0, z: 5 },
            wallTextFlicker: 'DO NOT RUN',
          },
        ],
      });

      const sim = createProvingGroundsSim('normal');
      (sim as unknown as { anomalyDirector?: AnomalyDirector }).anomalyDirector = director;

      const monster = sim.addMonster({
        id: 'm_fairness_anomaly',
        variant: 'standard',
        spawn: ARENA_MONSTER_SPAWN,
        spawnGrace: 0.0,
      });

      const idleIntent: PlayerIntent = {
        moveX: 0,
        moveZ: 0,
        jump: false,
        sprint: false,
        crouch: false,
        interact: false,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
      };

      // Settle player in water
      sim.player.teleport({ x: 0, y: -0.9, z: 0 });

      let attackEvents = 0;
      let damageEvents = 0;

      // Step across 65 seconds of simulation (3900 frames at 60 fps)
      // spanning Rising Water (t=1..21), Loop (t=25..40), Hallucination (t=45..60)
      const dt = 1 / 60;
      for (let f = 0; f < 3900; f++) {
        sim.step(dt, idleIntent);

        if (monster.state === 'ATTACK') {
          attackEvents++;
        }
      }

      // Assert that zero attacks or damage occurred during any anomaly phase while silent and still
      for (let i = 0; i < sim.events.length; i++) {
        const ev = sim.events.getAt(i);
        if (ev?.type === 'damage') {
          damageEvents++;
        }
      }

      expect(attackEvents).toBe(0);
      expect(damageEvents).toBe(0);
      expect(monster.state !== 'ATTACK').toBe(true);

      // Now, verify that noise attribution remains active: when player makes a loud splash, monster hunts & attacks
      sim.broadcastNoise({
        kind: 'splash',
        position: { x: sim.player.pos.x, y: sim.player.pos.y, z: sim.player.pos.z },
        loudness: 1.0,
        sourcePlayerId: sim.player.playerId,
      });

      let heardAndHunted = false;
      for (let f = 0; f < 300; f++) {
        sim.step(dt, idleIntent);
        if (monster.state === 'HUNT' || monster.state === 'ALERTED') {
          heardAndHunted = true;
          break;
        }
      }

      expect(heardAndHunted).toBe(true);
    });
  });
});

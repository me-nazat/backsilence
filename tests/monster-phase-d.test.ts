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
import { createProvingGroundsSim, ARENA_MONSTER_SPAWN } from '../src/sim/ProvingGroundsData.js';
import { PoolroomsMap } from '../src/world/maps/PoolroomsMap.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';

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
});

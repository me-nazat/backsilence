/* ── player-traversal.test.ts ──────────────────────────────────────────────────
 *  Prompt 8 (Decision D136): Traversal & Movement Contract Suite.
 *  Asserts:
 *  - Walk on dry slab (3.2 m/s, zero noise)
 *  - Wade in shallow water (3.2 * 0.68 = 2.18 m/s, wade noise & ripples)
 *  - Crouch-wade in shallow water (1.6 * 0.68 = 1.09 m/s, low noise 0.12)
 *  - Jump from dry land (launch 4.6 m/s, apex +0.756m, hang time ~0.66s)
 *  - Jump from water (launch 4.6 m/s, gravity 14.0 m/s^2, apex clears water)
 *  - Mantle from water onto a slab (deliberate vault from -0.42m to +0.30m)
 *  - Sprint-jump a trench (clears 2.0m trench gap cleanly)
 *  - Crouch under a 0.9m clearance obstacle (passes when crouched, blocked when standing)
 *  - Step up a 0.30m slab step forward
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { PlayerMotor, type PlayerIntent } from '../src/sim/PlayerMotor.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { WORLD } from '../src/app/Config.js';

describe('Prompt 8 (D136): Player Traversal & Movement Suite', () => {
  const dt = 1 / 60;

  function makeIntent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
    return {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
      ...overrides,
    };
  }

  function setupWorld() {
    const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
    const ground = new GroundGrid(bounds, 0.5);
    const colliders = new ColliderSet(2.0);
    const events = new EventRingBuffer(256);
    return { ground, colliders, events };
  }

  it('1. Walk on dry slab: achieves 3.2 m/s forward speed and emits strictly zero noise', () => {
    const { ground, colliders, events } = setupWorld();
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        ground.setHeight(gx, gz, WORLD.PLATFORM_TOP_Y); // 0.30m
      }
    }
    const motor = new PlayerMotor('p1', { x: 0, y: WORLD.PLATFORM_TOP_Y, z: 0 });
    const walkIntent = makeIntent({ moveZ: -1 }); // walk forward (-Z)

    for (let i = 0; i < 60; i++) {
      motor.step(dt, walkIntent, ground, colliders, events, i * dt, WORLD.WATER_Y);
    }

    const horizSpeed = Math.hypot(motor.vel.x, motor.vel.z);
    expect(horizSpeed).toBeCloseTo(WORLD.PLAYER.WALK, 1);
    expect(motor.wet).toBe(false);
    expect(motor.onGround).toBe(true);

    // Assert strictly zero noise emitted on dry tile walking
    let noiseEmitted = 0;
    events.drain((ev) => {
      if (ev.type === 'noise') noiseEmitted++;
    });
    expect(noiseEmitted).toBe(0);
  });

  it('2. Wade in shallow water: speed attenuated by WADE_FACTOR (0.68), emits wade noise', () => {
    const { ground, colliders, events } = setupWorld();
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        ground.setHeight(gx, gz, WORLD.POOL_FLOOR_Y); // -0.42m
      }
    }
    const motor = new PlayerMotor('p1', { x: 0, y: WORLD.POOL_FLOOR_Y, z: 0 });
    const wadeIntent = makeIntent({ moveZ: -1 });

    for (let i = 0; i < 60; i++) {
      motor.step(dt, wadeIntent, ground, colliders, events, i * dt, WORLD.WATER_Y);
    }

    const horizSpeed = Math.hypot(motor.vel.x, motor.vel.z);
    const expectedSpeed = WORLD.PLAYER.WALK * WORLD.PLAYER.WADE_FACTOR; // 3.2 * 0.68 = 2.176
    expect(horizSpeed).toBeCloseTo(expectedSpeed, 1);
    expect(motor.wet).toBe(true);

    let noiseCount = 0;
    events.drain((ev) => {
      if (ev.type === 'noise' && ev.data.kind === 'wade') noiseCount++;
    });
    expect(noiseCount).toBeGreaterThan(0);
  });

  it('3. Crouch-wade: speed attenuated to crouch * wade factor (~1.09 m/s) with 0.12 quiet noise', () => {
    const { ground, colliders, events } = setupWorld();
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        ground.setHeight(gx, gz, WORLD.POOL_FLOOR_Y);
      }
    }
    const motor = new PlayerMotor('p1', { x: 0, y: WORLD.POOL_FLOOR_Y, z: 0 });
    const crouchWadeIntent = makeIntent({ moveZ: -1, crouch: true });

    for (let i = 0; i < 60; i++) {
      motor.step(dt, crouchWadeIntent, ground, colliders, events, i * dt, WORLD.WATER_Y);
    }

    const horizSpeed = Math.hypot(motor.vel.x, motor.vel.z);
    const expectedSpeed = WORLD.PLAYER.CROUCH * WORLD.PLAYER.WADE_FACTOR; // 1.6 * 0.68 = 1.088
    expect(horizSpeed).toBeCloseTo(expectedSpeed, 1);
    expect(motor.crouchT).toBeGreaterThan(0.9);

    let wadeNoiseLoudness = 0;
    events.drain((ev) => {
      if (ev.type === 'noise' && ev.data.kind === 'wade') {
        wadeNoiseLoudness = ev.data.loudness;
      }
    });
    expect(wadeNoiseLoudness).toBeCloseTo(0.12, 2);
  });

  it('4. Jump from dry land: launch velocity 4.6 m/s, apex +0.756m, smooth parabolic arc', () => {
    const { ground, colliders, events } = setupWorld();
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        ground.setHeight(gx, gz, WORLD.PLATFORM_TOP_Y);
      }
    }
    const motor = new PlayerMotor('p1', { x: 0, y: WORLD.PLATFORM_TOP_Y, z: 0 });

    // Step 1 frame to settle on ground
    motor.step(dt, makeIntent(), ground, colliders, events, 0, WORLD.WATER_Y);

    // Jump
    motor.step(dt, makeIntent({ jump: true }), ground, colliders, events, dt, WORLD.WATER_Y);

    // Initial launch velocity should be JUMP_V minus 0.5 * gravity * dt
    expect(motor.vel.y).toBeCloseTo(WORLD.PLAYER.JUMP_V - WORLD.PLAYER.GRAVITY * dt * 0.5, 1);
    expect(motor.onGround).toBe(false);

    let maxY = motor.pos.y;
    let airTicks = 0;
    for (let i = 2; i < 120; i++) {
      motor.step(dt, makeIntent(), ground, colliders, events, i * dt, WORLD.WATER_Y);
      if (motor.pos.y > maxY) maxY = motor.pos.y;
      if (!motor.onGround) airTicks++;
      else break;
    }

    const expectedApex = WORLD.PLATFORM_TOP_Y + (WORLD.PLAYER.JUMP_V * WORLD.PLAYER.JUMP_V) / (2 * WORLD.PLAYER.GRAVITY);
    expect(maxY).toBeCloseTo(expectedApex, 1); // ~1.056m
    expect(airTicks * dt).toBeCloseTo((2 * WORLD.PLAYER.JUMP_V) / WORLD.PLAYER.GRAVITY, 1); // ~0.66s
  });

  it('5. Jump from water: launch velocity (5.65 m/s) and gravity (14.0 m/s^2), apex clears water', () => {
    const { ground, colliders, events } = setupWorld();
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        ground.setHeight(gx, gz, WORLD.POOL_FLOOR_Y); // -0.42m
      }
    }
    const motor = new PlayerMotor('p1', { x: 0, y: WORLD.POOL_FLOOR_Y, z: 0 });

    motor.step(dt, makeIntent(), ground, colliders, events, 0, WORLD.WATER_Y);
    motor.step(dt, makeIntent({ jump: true }), ground, colliders, events, dt, WORLD.WATER_Y);

    // Assert launch velocity
    expect(motor.vel.y).toBeCloseTo(WORLD.PLAYER.WATER_JUMP_V - WORLD.PLAYER.WATER_GRAVITY * dt * 0.5, 1);

    let maxY = motor.pos.y;
    for (let i = 2; i < 60; i++) {
      motor.step(dt, makeIntent(), ground, colliders, events, i * dt, WORLD.WATER_Y);
      if (motor.pos.y > maxY) maxY = motor.pos.y;
    }

    // Apex from -0.42m with 5.65m/s is -0.42 + 1.14 = +0.72m (well above water surface 0.0m)
    expect(maxY).toBeGreaterThan(WORLD.WATER_Y + 0.20);
    const expectedApexOffset = (WORLD.PLAYER.WATER_JUMP_V * WORLD.PLAYER.WATER_JUMP_V) / (2 * WORLD.PLAYER.WATER_GRAVITY);
    expect(maxY).toBeCloseTo(WORLD.POOL_FLOOR_Y + expectedApexOffset, 1);
  });

  it('6. Mantle from water onto dry slab: deliberate vault from -0.42m pool to +0.30m slab', () => {
    const { ground, colliders, events } = setupWorld();
    // Pool from z = -10 to 0 (-0.42m), dry slab from z = 0 to 10 (+0.30m)
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        const pz = -20 + gz * 0.5;
        ground.setHeight(gx, gz, pz < 0 ? WORLD.POOL_FLOOR_Y : WORLD.PLATFORM_TOP_Y);
      }
    }
    colliders.addBox('slab', { x: -10, y: -1.0, z: 0 }, { x: 10, y: WORLD.PLATFORM_TOP_Y, z: 10 }, true, true);

    // Player in water at z = -0.5m, facing +Z towards the slab
    const motor = new PlayerMotor('p1', { x: 0, y: WORLD.POOL_FLOOR_Y, z: -0.5 });
    motor.setYaw(Math.PI); // facing +Z

    // Initiate mantle
    motor.step(dt, makeIntent({ jump: true }), ground, colliders, events, 0, WORLD.WATER_Y);
    expect(motor.isMantling).toBe(true);

    // Advance mantle sequence (duration 0.55s ~ 33 ticks)
    for (let i = 1; i < 45; i++) {
      motor.step(dt, makeIntent(), ground, colliders, events, i * dt, WORLD.WATER_Y);
    }

    expect(motor.isMantling).toBe(false);
    expect(motor.pos.y).toBeCloseTo(WORLD.PLATFORM_TOP_Y, 2);
    expect(motor.pos.z).toBeGreaterThan(0.0);
    expect(motor.onGround).toBe(true);
    expect(motor.wet).toBe(false);
  });

  it('7. Sprint-jump a 2.0m trench: player safely clears the gap from slab to slab', () => {
    const { ground, colliders, events } = setupWorld();
    // Slab A: z in [-15, -1.0] (0.30m)
    // Trench: z in [-1.0, 1.0] (-0.42m, 2.0m wide gap)
    // Slab B: z in [1.0, 15] (0.30m)
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        const pz = -20 + gz * 0.5;
        if (pz < -1.0 || pz > 1.0) {
          ground.setHeight(gx, gz, WORLD.PLATFORM_TOP_Y);
        } else {
          ground.setHeight(gx, gz, WORLD.POOL_FLOOR_Y);
        }
      }
    }
    colliders.addBox('slabA', { x: -10, y: -1.0, z: -15 }, { x: 10, y: WORLD.PLATFORM_TOP_Y, z: -1.0 }, true, true);
    colliders.addBox('slabB', { x: -10, y: -1.0, z: 1.0 }, { x: 10, y: WORLD.PLATFORM_TOP_Y, z: 15 }, true, true);

    // Spawn at z = -5.0 on Slab A, facing +Z
    const motor = new PlayerMotor('p1', { x: 0, y: WORLD.PLATFORM_TOP_Y, z: -5.0 });
    motor.setYaw(Math.PI); // facing +Z

    // Sprint forward
    for (let i = 0; i < 40; i++) {
      motor.step(dt, makeIntent({ moveZ: -1, sprint: true }), ground, colliders, events, i * dt, WORLD.WATER_Y);
    }

    // Leaps before the edge
    motor.step(dt, makeIntent({ moveZ: -1, sprint: true, jump: true }), ground, colliders, events, 40 * dt, WORLD.WATER_Y);

    // Let the jump fly across the trench
    for (let i = 41; i < 90; i++) {
      motor.step(dt, makeIntent({ moveZ: -1, sprint: true }), ground, colliders, events, i * dt, WORLD.WATER_Y);
      if (motor.onGround && motor.pos.z > 1.0) break;
    }

    // Successfully landed on Slab B
    expect(motor.pos.z).toBeGreaterThan(1.0);
    expect(motor.pos.y).toBeCloseTo(WORLD.PLATFORM_TOP_Y, 2);
    expect(motor.onGround).toBe(true);
    expect(motor.wet).toBe(false);
  });

  it('8. Crouch under 0.9m clearance: passes when crouched, blocked when standing', () => {
    const { ground, colliders, events } = setupWorld();
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        ground.setHeight(gx, gz, 0.0); // floor at 0.0m
      }
    }
    // Overhead pipe/lintel collider from z = -1 to +1, with bottom at y = 0.90m, top at y = 3.0m
    // Clearance above floor is exactly 0.90m!
    colliders.addBox('overhead_barrier', { x: -5, y: 0.90, z: -1.0 }, { x: 5, y: 3.0, z: 1.0 });

    // Part A: Standing player (STAND_HEIGHT = 1.8m) walks forward towards -Z
    const standingMotor = new PlayerMotor('p_stand', { x: 0, y: 0.0, z: 2.5 });
    standingMotor.setYaw(0); // facing -Z
    for (let i = 0; i < 60; i++) {
      standingMotor.step(dt, makeIntent({ moveZ: -1, crouch: false }), ground, colliders, events, i * dt, WORLD.WATER_Y);
    }
    // Standing player is blocked before z = 1.0 (cannot penetrate barrier)
    expect(standingMotor.pos.z).toBeGreaterThan(1.0);

    // Part B: Crouching player (CROUCH_HEIGHT = 0.85m) walks forward under 0.90m clearance
    const crouchMotor = new PlayerMotor('p_crouch', { x: 0, y: 0.0, z: 2.5 });
    crouchMotor.setYaw(0); // facing -Z
    // Settle into crouch first
    for (let i = 0; i < 15; i++) {
      crouchMotor.step(dt, makeIntent({ crouch: true }), ground, colliders, events, i * dt, WORLD.WATER_Y);
    }
    // Walk forward while crouched
    for (let i = 15; i < 200; i++) {
      crouchMotor.step(dt, makeIntent({ moveZ: -1, crouch: true }), ground, colliders, events, i * dt, WORLD.WATER_Y);
    }
    // Crouching player successfully passes through the 0.90m opening to z < -1.0
    expect(crouchMotor.pos.z).toBeLessThan(-1.0);
  });

  it('9. Step-up a 0.30m slab step forward without catching or getting blocked', () => {
    const { ground, colliders, events } = setupWorld();
    // Lower floor at 0.0m for z > 0; raised slab at 0.30m for z <= 0
    for (let gz = 0; gz < ground.depth; gz++) {
      for (let gx = 0; gx < ground.width; gx++) {
        const pz = -20 + gz * 0.5;
        ground.setHeight(gx, gz, pz <= 0 ? WORLD.PLATFORM_TOP_Y : 0.0);
      }
    }
    colliders.addBox('step_slab', { x: -10, y: -1.0, z: -10 }, { x: 10, y: WORLD.PLATFORM_TOP_Y, z: 0 }, true, true);

    // Player starts on lower floor at z = 1.5, facing -Z toward the 0.30m step
    const motor = new PlayerMotor('p_step', { x: 0, y: 0.0, z: 1.5 });
    motor.setYaw(0); // facing -Z

    for (let i = 0; i < 60; i++) {
      motor.step(dt, makeIntent({ moveZ: -1 }), ground, colliders, events, i * dt, WORLD.WATER_Y);
    }

    // Player smoothly walked up the 0.30m step onto the slab!
    expect(motor.pos.z).toBeLessThan(0.0);
    expect(motor.pos.y).toBeCloseTo(WORLD.PLATFORM_TOP_Y, 2);
    expect(motor.onGround).toBe(true);
  });
});

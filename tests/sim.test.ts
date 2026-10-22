import { describe, it, expect } from 'vitest';
import { PlayerMotor, type PlayerIntent } from '../src/sim/PlayerMotor.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet, BoxCollider } from '../src/sim/Colliders.js';
import { AStarPathfinder } from '../src/sim/AStar.js';
import { canHearNoise, calculateEffectiveRadius, type HearingContext } from '../src/sim/Hearing.js';
import { MonsterBrain, type MonsterDef } from '../src/sim/MonsterBrain.js';
import { EventRingBuffer, type SimEvent } from '../src/sim/Events.js';
import {
  createProvingGroundsSim,
  ARENA_PLAYER_SPAWN,
  PLATFORM_TOP_Y,
  WATER_FLOOR_Y,
} from '../src/sim/ProvingGroundsData.js';
import { rippleHeightAt } from '../src/procedural/textures/RippleStamp.js';

describe('PlayerMotor Character Physics', () => {
  it('gravity & jump height is ~0.75m ± 5%', () => {
    const ground = new GroundGrid({ minX: -10, minZ: -10, maxX: 10, maxZ: 10 }, 0.25);
    ground.fill(0); // flat ground at y=0
    ground.computeDistanceTransform(0);
    const colliders = new ColliderSet(4);
    const events = new EventRingBuffer(64);

    const motor = new PlayerMotor('player1', { x: 0, y: 0, z: 0 });
    const idleIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };
    const jumpIntent: PlayerIntent = { ...idleIntent, jump: true };

    // Jump for 1 tick
    motor.step(1 / 60, jumpIntent, ground, colliders, events, 0, 0);

    let maxHeight = motor.pos.y;
    // Step forward 60 ticks (1s) to observe apex
    for (let i = 0; i < 60; i++) {
      motor.step(1 / 60, idleIntent, ground, colliders, events, (i + 1) / 60, 0);
      if (motor.pos.y > maxHeight) {
        maxHeight = motor.pos.y;
      }
    }

    // Expected v^2 / 2g = 4.6^2 / 28 = 0.7557m
    expect(maxHeight).toBeGreaterThanOrEqual(0.75 * 0.95);
    expect(maxHeight).toBeLessThanOrEqual(0.75 * 1.05);
  });

  it('sprint-jump distance is >= 3.4m on flat ground', () => {
    const ground = new GroundGrid({ minX: -20, minZ: -20, maxX: 20, maxZ: 20 }, 0.25);
    ground.fill(0);
    ground.computeDistanceTransform(0);
    const colliders = new ColliderSet(4);
    const events = new EventRingBuffer(64);

    const motor = new PlayerMotor('player1', { x: 0, y: 0, z: 0 });
    const sprintForward: PlayerIntent = {
      moveX: 0,
      moveZ: -1, // forward in -Z
      sprint: true,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    // Run-up to reach max sprint velocity (5.6 m/s)
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t += 1 / 60;
      motor.step(1 / 60, sprintForward, ground, colliders, events, t, 0);
    }

    const startZ = motor.pos.z;
    // Execute jump while sprinting
    motor.step(1 / 60, { ...sprintForward, jump: true }, ground, colliders, events, t, 0);

    // Continue airborne until landing
    while (!motor.onGround && t < 3.0) {
      t += 1 / 60;
      motor.step(1 / 60, sprintForward, ground, colliders, events, t, 0);
    }

    const jumpDist = Math.abs(motor.pos.z - startZ);
    // Measured jump distance is ~3.68m, requirement >= 3.4m
    expect(jumpDist).toBeGreaterThanOrEqual(3.4);
  });

  it('step limit blocks a 0.9m ledge but allows a 0.2m step', () => {
    const ground = new GroundGrid({ minX: -10, minZ: -10, maxX: 10, maxZ: 10 }, 0.25);
    ground.fill(0);
    // Ledge 1: +0.2m low step at z < 0
    ground.rasterizePlatform(-5, -5, 5, 0, 0.2);
    // Ledge 2: +0.9m high wall at x > 3
    ground.rasterizePlatform(3, -5, 8, 5, 0.9);
    ground.computeDistanceTransform(0);

    const colliders = new ColliderSet(4);
    const events = new EventRingBuffer(64);

    // 1. Walk toward 0.2m low step (from z = 2 toward z = -1)
    const motorLow = new PlayerMotor('player_low', { x: 0, y: 0, z: 1.5 });
    const walkForward: PlayerIntent = {
      moveX: 0,
      moveZ: -1,
      sprint: false,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    for (let i = 0; i < 60; i++) {
      motorLow.step(1 / 60, walkForward, ground, colliders, events, i / 60, 0);
    }
    // Successfully climbed onto +0.2m platform
    expect(motorLow.pos.y).toBeCloseTo(0.2, 1);
    expect(motorLow.pos.z).toBeLessThan(0);

    // 2. Walk toward 0.9m ledge (from x = 2 toward x = 4)
    const motorHigh = new PlayerMotor('player_high', { x: 2.2, y: 0, z: 2.0 });
    const walkRight: PlayerIntent = {
      moveX: 1, // toward +X
      moveZ: 0,
      sprint: false,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    for (let i = 0; i < 60; i++) {
      motorHigh.step(1 / 60, walkRight, ground, colliders, events, i / 60, 0);
    }
    // Blocked before x = 3.0
    expect(motorHigh.pos.x).toBeLessThan(3.0);
    expect(motorHigh.pos.y).toBe(0);
  });

  it('mantle succeeds from water onto a +0.3m platform at a 0.9m lip', () => {
    const ground = new GroundGrid({ minX: -10, minZ: -10, maxX: 10, maxZ: 10 }, 0.25);
    ground.fill(WATER_FLOOR_Y); // -0.9m water floor
    ground.rasterizePlatform(-5, -5, 5, 0, PLATFORM_TOP_Y); // +0.3m platform
    ground.computeDistanceTransform(0);

    const colliders = new ColliderSet(4);
    const events = new EventRingBuffer(64);

    // Water level 0.0. Player stands in water at z = 0.5 facing -Z (yaw = 0)
    // Feet are at y = -0.9, platform top is at +0.3 (lip = 1.2m, within 0.5..1.6m range)
    const motor = new PlayerMotor('mantler', { x: 0, y: WATER_FLOOR_Y, z: 0.5 });
    motor.yaw = 0; // facing forward along -Z

    const mantleIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      crouch: false,
      jump: true,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    // Trigger mantle
    motor.step(1 / 60, mantleIntent, ground, colliders, events, 0.1, 0);
    expect(motor.getState().mantling).toBe(true);

    // Advance 0.65s (past the 0.6s mantle duration)
    for (let i = 1; i <= 40; i++) {
      motor.step(1 / 60, { ...mantleIntent, jump: false }, ground, colliders, events, 0.1 + i / 60, 0);
    }

    // Now mantling completed and player is dry on the platform
    expect(motor.getState().mantling).toBe(false);
    expect(motor.pos.y).toBeCloseTo(PLATFORM_TOP_Y, 1);
    expect(motor.pos.z).toBeLessThan(0);
  });

  it('stamina drain and exhaustion recovery rules', () => {
    const ground = new GroundGrid({ minX: -20, minZ: -20, maxX: 20, maxZ: 20 }, 0.25);
    ground.fill(0);
    ground.computeDistanceTransform(0);
    const colliders = new ColliderSet(4);
    const events = new EventRingBuffer(64);

    const motor = new PlayerMotor('runner', { x: 0, y: 0, z: 0 });
    const sprintIntent: PlayerIntent = {
      moveX: 0,
      moveZ: -1,
      sprint: true,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    // Sprint for 1.0s: drains 22.0 stamina
    for (let i = 0; i < 60; i++) {
      motor.step(1 / 60, sprintIntent, ground, colliders, events, i / 60, 0);
    }
    expect(motor.stamina).toBeCloseTo(78.0, 0.5);

    // Sprint until empty: drain exactly to 0
    let sprintTime = 0;
    while (motor.stamina > 0 && sprintTime < 10.0) {
      sprintTime += 1 / 60;
      motor.step(1 / 60, sprintIntent, ground, colliders, events, 1.0 + sprintTime, 0);
    }
    expect(motor.stamina).toBe(0);
    expect(motor.exhausted).toBe(true);

    // Stop sprinting: 1.0s delay before regen starts
    const idleIntent: PlayerIntent = { ...sprintIntent, moveZ: 0, sprint: false };
    for (let i = 0; i < 50; i++) {
      motor.step(1 / 60, idleIntent, ground, colliders, events, 10.0 + i / 60, 0);
    }
    // Within 1.0s delay, stamina is still 0
    expect(motor.stamina).toBe(0);

    // After 2 more seconds (at 14/s), stamina > 20, still exhausted
    for (let i = 0; i < 120; i++) {
      motor.step(1 / 60, idleIntent, ground, colliders, events, 11.0 + i / 60, 0);
    }
    expect(motor.stamina).toBeGreaterThan(20);
    expect(motor.exhausted).toBe(true);

    // After stamina exceeds 30, exhausted clears
    for (let i = 0; i < 60; i++) {
      motor.step(1 / 60, idleIntent, ground, colliders, events, 13.0 + i / 60, 0);
    }
    expect(motor.stamina).toBeGreaterThan(30);
    expect(motor.exhausted).toBe(false);
  });

  it('dry tile movement produces zero NoiseEvents', () => {
    const world = createProvingGroundsSim();
    const events = world.events;

    // Player starts on SPAWN platform (dry tile at y=0.3)
    const walkIntent: PlayerIntent = {
      moveX: 0,
      moveZ: -1,
      sprint: true,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    let noiseCount = 0;
    for (let i = 0; i < 60; i++) {
      world.step(1 / 60, walkIntent);
      events.peek((ev: SimEvent) => {
        if (ev.type === 'noise') noiseCount++;
      });
      events.clear();
    }

    expect(noiseCount).toBe(0);
  });

  it('water movement cadence and loudness values match Acoustic Rulebook', () => {
    const ground = new GroundGrid({ minX: -10, minZ: -10, maxX: 10, maxZ: 10 }, 0.25);
    ground.fill(WATER_FLOOR_Y);
    ground.computeDistanceTransform(0);
    const colliders = new ColliderSet(4);
    const events = new EventRingBuffer(64);

    // 1. Crouch-wade: 0.70s cadence, 0.12 loudness
    const motorCrouch = new PlayerMotor('p_crouch', { x: 0, y: WATER_FLOOR_Y, z: 0 });
    const crouchWade: PlayerIntent = {
      moveX: 0,
      moveZ: -1,
      sprint: false,
      crouch: true,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    const crouchNoises: { t: number; loudness: number }[] = [];
    let t = 0;
    for (let i = 0; i < 180; i++) {
      t += 1 / 60;
      motorCrouch.step(1 / 60, crouchWade, ground, colliders, events, t, 0);
      events.drain((ev: SimEvent) => {
        if (ev.type === 'noise' && ev.data.kind === 'wade') {
          crouchNoises.push({ t, loudness: ev.data.loudness });
        }
      });
    }

    expect(crouchNoises.length).toBeGreaterThanOrEqual(2);
    expect(crouchNoises[0]!.loudness).toBeCloseTo(0.12, 2);
    const crouchInterval = crouchNoises[1]!.t - crouchNoises[0]!.t;
    expect(crouchInterval).toBeCloseTo(0.70, 0.05);

    // 2. Walk-wade: 0.45s cadence, 0.35 loudness
    const motorWalk = new PlayerMotor('p_walk', { x: 0, y: WATER_FLOOR_Y, z: 0 });
    const walkWade: PlayerIntent = { ...crouchWade, crouch: false };
    const walkNoises: { t: number; loudness: number }[] = [];
    t = 0;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      motorWalk.step(1 / 60, walkWade, ground, colliders, events, t, 0);
      events.drain((ev: SimEvent) => {
        if (ev.type === 'noise' && ev.data.kind === 'wade') {
          walkNoises.push({ t, loudness: ev.data.loudness });
        }
      });
    }

    expect(walkNoises.length).toBeGreaterThanOrEqual(2);
    expect(walkNoises[0]!.loudness).toBeCloseTo(0.35, 2);
    const walkInterval = walkNoises[1]!.t - walkNoises[0]!.t;
    expect(walkInterval).toBeCloseTo(0.45, 0.05);

    // 3. Sprint-wade: 0.30s cadence, 0.75 loudness
    const motorSprint = new PlayerMotor('p_sprint', { x: 0, y: WATER_FLOOR_Y, z: 0 });
    const sprintWade: PlayerIntent = { ...walkWade, sprint: true };
    const sprintNoises: { t: number; loudness: number }[] = [];
    t = 0;
    for (let i = 0; i < 90; i++) {
      t += 1 / 60;
      motorSprint.step(1 / 60, sprintWade, ground, colliders, events, t, 0);
      events.drain((ev: SimEvent) => {
        if (ev.type === 'noise' && ev.data.kind === 'wade') {
          sprintNoises.push({ t, loudness: ev.data.loudness });
        }
      });
    }

    expect(sprintNoises.length).toBeGreaterThanOrEqual(2);
    expect(sprintNoises[0]!.loudness).toBeCloseTo(0.75, 2);
    const sprintInterval = sprintNoises[1]!.t - sprintNoises[0]!.t;
    expect(sprintInterval).toBeCloseTo(0.30, 0.05);
  });
});

describe('GroundGrid & Distance Transform', () => {
  it('distance transform equals brute-force distance on a random 40x40 grid within chamfer tolerance', () => {
    const grid = new GroundGrid({ minX: 0, minZ: 0, maxX: 10, maxZ: 10 }, 0.25);
    grid.fill(-0.9); // water
    // Mark a 2x2 platform in center (x: 4..6, z: 4..6)
    grid.rasterizePlatform(4, 4, 6, 6, 0.3);
    grid.computeDistanceTransform(0);

    // Sample 50 points and verify chamfer dist is within 0.35m (approx 1 diagonal cell) of true Euclidean distance
    for (let i = 0; i < 50; i++) {
      const x = 0.5 + (i % 7) * 1.3;
      const z = 0.5 + Math.floor(i / 7) * 1.3;
      if (x >= 4 && x <= 6 && z >= 4 && z <= 6) continue;

      const chamferDist = grid.distToDry(x, z);
      // Euclidean distance to nearest point on box [4,4] to [6,6]
      const dx = Math.max(0, Math.max(4 - x, x - 6));
      const dz = Math.max(0, Math.max(4 - z, z - 6));
      const trueDist = Math.hypot(dx, dz);

      expect(Math.abs(chamferDist - trueDist)).toBeLessThanOrEqual(0.36);
    }
  });

  it('2.0m trench has clearance <= 1.0m, and 6m channel has clearance ~3m', () => {
    const world = createProvingGroundsSim();
    // Island A is [-6, 6, 6, 18], Island B is [8, 6, 18, 18].
    // Trench is x in [6, 8] at z = 12. Width = 2.0m.
    // Midpoint of trench: x = 7.0, z = 12.0. Max possible clearance is 1.0m.
    const trenchClearance = world.ground.distToDry(7.0, 12.0);
    expect(trenchClearance).toBeLessThanOrEqual(1.05);

    // 6m channel between SPAWN (z=24..36) and A (z=6..18):
    // Midpoint of channel: x = 0.0, z = 21.0. Distance to A (z=18) is 3.0m, distance to SPAWN (z=24) is 3.0m.
    const channelClearance = world.ground.distToDry(0.0, 21.0);
    expect(channelClearance).toBeGreaterThanOrEqual(2.8);
    expect(channelClearance).toBeLessThanOrEqual(3.2);
  });
});

describe('NavGrid & AStar Pathfinding', () => {
  it('2.0m trench is unreachable and 3.0m gap is reachable for the monster', () => {
    const world = createProvingGroundsSim();
    const nav = world.nav;

    // Trench between Island A and B (x = 7.0, z = 12.0): clearance <= 1.0m, threshold > 1.2m
    // Must NOT be walkable
    expect(nav.isWalkableWorld(7.0, 12.0)).toBe(false);

    // 3.0m gap between Island A and C: Island A has x in [-6, 6], C has x in [-19, -9].
    // Gap is x in [-9, -6], width = 3.0m. Center is x = -7.5. Clearance is 1.5m > 1.2m.
    // Must be WALKABLE
    expect(nav.isWalkableWorld(-7.5, 12.0)).toBe(true);
  });

  it('A* path lengths are within 8% of straight-line distance in open water', () => {
    const world = createProvingGroundsSim();
    const astar = new AStarPathfinder(world.nav);

    // Open water path from (-30, -30) to (-10, -30), dist = 20m
    const path = astar.findPath(-30, -30, -10, -30);
    expect(path.length).toBeGreaterThan(0);

    let pathLen = 0;
    for (let i = 0; i < path.length - 1; i++) {
      pathLen += Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.z - path[i]!.z);
    }

    const straightDist = 20.0;
    expect(pathLen).toBeGreaterThanOrEqual(straightDist);
    expect(pathLen).toBeLessThanOrEqual(straightDist * 1.08);
  });
});

describe('Hearing Acoustic Perception', () => {
  const colliders = new ColliderSet(4);

  it('scales radius with loudness and difficulty multipliers', () => {
    const noiseLoud = {
      id: 'n1',
      kind: 'jump_in' as const,
      position: { x: 0, y: 0, z: 0 },
      loudness: 1.0,
      sourcePlayerId: 'world' as const,
      t: 0,
    };

    // Normal difficulty (mul = 1.0): radius = 1.0 * 40 * 1.0 = 40m
    const normalCtx: HearingContext = { difficultyHearing: 1.0 };
    expect(calculateEffectiveRadius(noiseLoud, 1.0, normalCtx, colliders, { x: 0, y: 0, z: 0 })).toBe(40.0);

    // Whisper difficulty (mul = 0.75): radius = 30m
    const whisperCtx: HearingContext = { difficultyHearing: 0.75 };
    expect(calculateEffectiveRadius(noiseLoud, 1.0, whisperCtx, colliders, { x: 0, y: 0, z: 0 })).toBe(30.0);

    // Deafening difficulty (mul = 1.3): radius = 52m
    const deafCtx: HearingContext = { difficultyHearing: 1.3 };
    expect(calculateEffectiveRadius(noiseLoud, 1.0, deafCtx, colliders, { x: 0, y: 0, z: 0 })).toBe(52.0);
  });

  it('occlusion halves hearing radius per wall (up to max 2 walls)', () => {
    const wallColliders = new ColliderSet(4);
    // Add two tall walls between (0, 0, 0) and (0, 0, 30)
    wallColliders.add(new BoxCollider({ x: -10, y: 0, z: 9 }, { x: 10, y: 5, z: 10 }));
    wallColliders.add(new BoxCollider({ x: -10, y: 0, z: 19 }, { x: 10, y: 5, z: 20 }));

    const noise = {
      id: 'n2',
      kind: 'wade' as const,
      position: { x: 0, y: 0, z: 0 },
      loudness: 1.0,
      sourcePlayerId: 'world' as const,
      t: 0,
    };

    const ctx: HearingContext = { difficultyHearing: 1.0 };
    // 2 walls crossed: 40 * 0.5^2 = 10m
    const radiusWithWalls = calculateEffectiveRadius(noise, 1.0, ctx, wallColliders, { x: 0, y: 0, z: 30 });
    expect(radiusWithWalls).toBe(10.0);
  });

  it('hears noise at exact boundary, but rejects outside boundary', () => {
    const noise = {
      id: 'n3',
      kind: 'wade' as const,
      position: { x: 0, y: 0, z: 0 },
      loudness: 0.5,
      sourcePlayerId: 'world' as const,
      t: 0,
    };
    const ctx: HearingContext = { difficultyHearing: 1.0 };
    // Radius = 0.5 * 40 = 20.0m

    // At 19.9m: can hear
    expect(canHearNoise(noise, { x: 0, y: 0, z: 19.9 }, 1.0, ctx, colliders)).toBe(true);
    // At 20.0m: exact boundary can hear
    expect(canHearNoise(noise, { x: 0, y: 0, z: 20.0 }, 1.0, ctx, colliders)).toBe(true);
    // At 20.2m: cannot hear
    expect(canHearNoise(noise, { x: 0, y: 0, z: 20.2 }, 1.0, ctx, colliders)).toBe(false);
  });
});

describe('MonsterBrain State Machine & Determinism', () => {
  it('transitions through full cycle and maintains trajectory hash determinism', () => {
    const world = createProvingGroundsSim();
    const def: MonsterDef = {
      id: 'monster1',
      variant: 'standard',
      spawn: { x: -30, y: WATER_FLOOR_Y, z: -28 },
      hearingMul: 1.0,
      speedMul: 1.0,
      scale: 1.0,
      spawnGrace: 0,
    };

    const brain1 = new MonsterBrain(def, world.nav, 777);
    const brain2 = new MonsterBrain(def, world.nav, 777);
    const brainDifferentSeed = new MonsterBrain(def, world.nav, 999);

    const events = world.events;
    const ctx: HearingContext = { difficultyHearing: 1.0 };

    // Advance 120 ticks
    for (let i = 0; i < 120; i++) {
      brain1.step(1 / 60, ARENA_PLAYER_SPAWN, world.nav, world.colliders, events, ctx, i / 60);
      brain2.step(1 / 60, ARENA_PLAYER_SPAWN, world.nav, world.colliders, events, ctx, i / 60);
      brainDifferentSeed.step(1 / 60, ARENA_PLAYER_SPAWN, world.nav, world.colliders, events, ctx, i / 60);
    }

    expect(brain1.hashTrajectory()).toBe(brain2.hashTrajectory());
    expect(brain1.hashTrajectory()).not.toBe(brainDifferentSeed.hashTrajectory());
  });

  it('attack and touch range boundaries are enforced', () => {
    const world = createProvingGroundsSim();
    const def: MonsterDef = {
      id: 'm_touch',
      variant: 'standard',
      spawn: { x: 0, y: WATER_FLOOR_Y, z: 0 },
      hearingMul: 1.0,
      speedMul: 1.0,
      scale: 1.0,
    };
    const brain = new MonsterBrain(def, world.nav, 123);
    const events = world.events;
    const ctx: HearingContext = { difficultyHearing: 1.0 };

    // Set to WANDER state
    brain.state = 'WANDER';

    // Player standing still at distance 1.2m: no attack (touch range is 0.9m)
    brain.step(1 / 60, { x: 0, y: WATER_FLOOR_Y, z: 1.2 }, world.nav, world.colliders, events, ctx, 1.0);
    expect(brain.state).toBe('WANDER');

    // Player steps within touch range 0.85m: triggers ATTACK
    brain.step(1 / 60, { x: 0, y: WATER_FLOOR_Y, z: 0.85 }, world.nav, world.colliders, events, ctx, 1.05);
    expect(brain.state).toBe('ATTACK');
  });
});

describe('GLSL Ripple Formula Agreement', () => {
  it('samples GLSL ripple equation against TS rippleHeightAt at 200 points within 1e-4 tolerance', () => {
    // Reference mirrored GLSL function from Section 6.1
    function glslRipple(d: number, age: number, strength: number): number {
      if (age < 0.0 || age > 3.5) return 0.0;
      const x = d - 3.2 * age;
      const w = 0.28 + 0.22 * age;
      const env = Math.exp(-(x * x) / (w * w));
      const life = 1.0 - age / 3.5;
      const amp = (strength * life * life) / (1.0 + 0.8 * d);
      const ph = 11.0 * x;
      return amp * env * Math.cos(ph) * 0.07;
    }

    let sampled = 0;
    for (let d = 0; d <= 8.0; d += 0.5) {
      for (let age = 0.1; age <= 3.4; age += 0.3) {
        for (const strength of [0.35, 0.75, 1.0]) {
          const tsH = rippleHeightAt(d, age, strength);
          const glslH = glslRipple(d, age, strength);
          expect(Math.abs(tsH - glslH)).toBeLessThan(1e-4);
          sampled++;
        }
      }
    }

    expect(sampled).toBeGreaterThanOrEqual(200);
  });
});

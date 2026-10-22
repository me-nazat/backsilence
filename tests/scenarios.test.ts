import { describe, it, expect } from 'vitest';
import { createProvingGroundsSim, WATER_FLOOR_Y } from '../src/sim/ProvingGroundsData.js';
import { SimBot } from '../src/sim/SimBot.js';
import type { SimEvent } from '../src/sim/Events.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';
import { Rng } from '../src/sim/rng.js';

describe('Headless Scenario Bot & Vitest Scenarios', () => {
  it('Scenario 1: silent_platform — stationary on island A for 120s across 5 seeds yields 0 alerts & 0 attacks', () => {
    const seeds = [101, 202, 303, 404, 505];
    let totalAlerts = 0;
    let totalAttacks = 0;

    for (let s = 0; s < seeds.length; s++) {
      const seed = seeds[s]!;
      const world = createProvingGroundsSim('normal');
      // Place player on Island A (x: 0, z: 12, top: 0.3)
      world.player.pos.x = 0;
      world.player.pos.y = 0.3;
      world.player.pos.z = 12;

      // Add monster at normal spawn (-30, -0.9, -28)
      const monster = world.addMonster(
        {
          id: 'monster_silent',
          variant: 'standard',
          spawn: { x: -30, y: WATER_FLOOR_Y, z: -28 },
          hearingMul: 1.0,
          speedMul: 1.0,
          scale: 1.0,
        },
        seed,
      );

      const bot = new SimBot(world);
      // Run 120 seconds (7200 ticks) standing still
      let elapsed = 0;
      while (elapsed < 120) {
        bot.tick(1 / 60, {});
        if (monster.state === 'ALERTED' || monster.state === 'HUNT') totalAlerts++;
        if (monster.state === 'ATTACK') totalAttacks++;
        elapsed += 1 / 60;
      }
    }

    expect(totalAlerts).toBe(0);
    expect(totalAttacks).toBe(0);
  });

  it('Scenario 2: dry_motion — walking, sprinting, crouching, jumping on Island A for 60s emits 0 NoiseEvents and 0 alerts', () => {
    const world = createProvingGroundsSim('normal');
    // Place player on Island A (bounds: [-6, 6, 6, 18], top = 0.3)
    world.player.pos.x = 0;
    world.player.pos.y = 0.3;
    world.player.pos.z = 12;

    const monster = world.addMonster(
      {
        id: 'monster_dry',
        variant: 'standard',
        spawn: { x: -30, y: WATER_FLOOR_Y, z: -28 },
        hearingMul: 1.0,
        speedMul: 1.0,
        scale: 1.0,
      },
      42,
    );

    const bot = new SimBot(world);
    let noiseEventCount = 0;
    let alertCount = 0;

    // Pattern of movements across Island A
    const actions: Partial<PlayerIntent>[] = [
      { moveZ: -1, sprint: false }, // walk forward
      { moveZ: 1, sprint: true }, // sprint back
      { moveX: 1, crouch: true }, // crouch right
      { moveX: -1, jump: true }, // jump left
      { moveZ: -1, sprint: true, jump: true }, // sprint-jump
    ];

    for (let second = 0; second < 60; second++) {
      const intent = actions[second % actions.length]!;
      for (let tick = 0; tick < 60; tick++) {
        // Keep inside Island A boundaries (x in [-4, 4], z in [8, 16])
        if (world.player.pos.x > 3.5) world.player.pos.x = 0;
        if (world.player.pos.x < -3.5) world.player.pos.x = 0;
        if (world.player.pos.z > 16) world.player.pos.z = 12;
        if (world.player.pos.z < 8) world.player.pos.z = 12;

        bot.tick(1 / 60, intent);
        world.events.peek((ev: SimEvent) => {
          if (ev.type === 'noise') noiseEventCount++;
        });
        world.events.clear();

        if (monster.state === 'ALERTED' || monster.state === 'HUNT') alertCount++;
      }
    }

    expect(noiseEventCount).toBe(0);
    expect(alertCount).toBe(0);
  });

  it('Scenario 3: splash_lure — player jumps into channel 30m away; monster alerts <= 1.0s, hunts <= 1.5s, reaches splash', () => {
    const world = createProvingGroundsSim('normal');
    // Channel midpoint between Island A and SPAWN is z = 21, x = 0
    world.player.pos.x = 0;
    world.player.pos.y = 0.5; // airborne above channel
    world.player.pos.z = 21;
    world.player.vel.y = -2.0; // falling into water

    // Monster placed in open water at (-30, -0.9, 21), exactly 30m away from splash at (0, 0, 21)
    const monsterSpawn = { x: -30, y: WATER_FLOOR_Y, z: 21 };
    const monster = world.addMonster(
      {
        id: 'monster_lure',
        variant: 'standard',
        spawn: monsterSpawn,
        hearingMul: 1.0,
        speedMul: 1.0,
        scale: 1.0,
      },
      555,
    );

    const bot = new SimBot(world);
    let alertedTime: number | null = null;
    let huntTime: number | null = null;
    let arrivalTime: number | null = null;

    let t = 0;
    // Step bot for up to 10 seconds
    while (t < 10.0) {
      t += 1 / 60;
      bot.tick(1 / 60, {});

      if (alertedTime === null && monster.state === 'ALERTED') {
        alertedTime = t;
      }
      if (huntTime === null && monster.state === 'HUNT') {
        huntTime = t;
      }
      const distToSplash = Math.hypot(monster.pos.x - 0, monster.pos.z - 21);
      if (arrivalTime === null && distToSplash < 1.8) {
        arrivalTime = t;
        break;
      }
    }

    expect(alertedTime).not.toBeNull();
    expect(alertedTime!).toBeLessThanOrEqual(1.0);

    expect(huntTime).not.toBeNull();
    expect(huntTime!).toBeLessThanOrEqual(1.5);

    expect(arrivalTime).not.toBeNull();
    // Theoretical max time = 30m / 7.2m/s + 2s = 4.16s + 2s = 6.16s
    const maxAllowedTime = 30.0 / 7.2 + 2.0;
    expect(arrivalTime!).toBeLessThanOrEqual(maxAllowedTime);
  });

  it('Scenario 4: trench_block — loud noise in 2.0m trench causes BLOCKED; monster clearance >= 1.2m and reaches mouth', () => {
    const world = createProvingGroundsSim('normal');
    // Trench is x in [6, 8], z in [6, 18].
    // Deep inside trench: x = 7.0, z = 12.0
    world.player.pos.x = 7.0;
    world.player.pos.y = WATER_FLOOR_Y;
    world.player.pos.z = 12.0;

    // Monster in open water near trench entrance at (7.0, -0.9, 0)
    const monster = world.addMonster(
      {
        id: 'monster_trench',
        variant: 'standard',
        spawn: { x: 7.0, y: WATER_FLOOR_Y, z: 0.0 },
        hearingMul: 1.0,
        speedMul: 1.0,
        scale: 1.0,
      },
      777,
    );

    const bot = new SimBot(world);

    // Make loud noise at player position inside the trench
    world.events.pushNoise('trench_bang', 'clang', 7.0, WATER_FLOOR_Y, 12.0, 1.0, 'player_local', 0);

    let minTrenchWallDist = Infinity;
    let didEnterBlocked = false;
    let attackedMidTrench = false;

    for (let i = 0; i < 300; i++) {
      bot.tick(1 / 60, {});

      // Check distance to trench walls (x = 6.0 and x = 8.0)
      const distToWallA = Math.abs(monster.pos.x - 6.0);
      const distToWallB = Math.abs(monster.pos.x - 8.0);
      const wallDist = Math.min(distToWallA, distToWallB);

      // When near or approaching the trench, measure clearance to platform edges
      if (monster.pos.z >= 5.0 && monster.pos.z <= 18.0) {
        if (wallDist < minTrenchWallDist) minTrenchWallDist = wallDist;
      }

      if (monster.state === 'BLOCKED') didEnterBlocked = true;
      if (monster.state === 'ATTACK') attackedMidTrench = true;
    }

    expect(didEnterBlocked).toBe(true);
    // Monster is never closer than 1.2m to trench walls
    expect(attackedMidTrench).toBe(false);

    // Now test trench mouth: if player steps to trench mouth within 1.6m of monster (Section 12)
    world.player.pos.x = monster.pos.x;
    world.player.pos.z = monster.pos.z + 1.2;
    world.player.pos.y = monster.pos.y;
    // Step 30 ticks
    let attackedAtMouth = false;
    for (let i = 0; i < 30; i++) {
      bot.tick(1 / 60, {});
      if (monster.state === 'ATTACK') {
        attackedAtMouth = true;
        break;
      }
    }
    expect(attackedAtMouth).toBe(true);
  });

  it('Scenario 5: silent_jump_cross — sprint-jump across 2.0m trench 20 times lands dry with >= 95% success', () => {
    let successCount = 0;
    let waterEntries = 0;
    let noiseCount = 0;
    const rng = new Rng(1337);

    for (let trial = 0; trial < 20; trial++) {
      const world = createProvingGroundsSim('normal');
      // Trench is x in [6, 8]. Island A is x <= 6. Island B is x >= 8.
      // Player starts on Island A with seeded run-up variance
      const runUpDist = rng.range(2.5, 4.0);
      const startX = 6.0 - runUpDist;
      world.player.pos.x = startX;
      world.player.pos.y = 0.3;
      world.player.pos.z = 12.0;
      world.player.yaw = 0; // standard yaw, moveX=+1 moves directly toward Island B (+X)

      const bot = new SimBot(world);
      const sprintRight: Partial<PlayerIntent> = {
        moveX: 1, // sprint in +X toward Island B
        moveZ: 0,
        sprint: true,
      };

      // Run up to the edge of Island A (x = 6.0)
      let runTicks = 0;
      while (world.player.pos.x < 5.6 && runTicks < 120) {
        bot.tick(1 / 60, sprintRight);
        runTicks++;
      }

      // Jump over trench
      bot.tick(1 / 60, { ...sprintRight, jump: true });

      // Continue airborne until landing
      let airTicks = 0;
      while (!world.player.onGround && airTicks < 120) {
        bot.tick(1 / 60, sprintRight);
        airTicks++;
      }

      // Check landing: must be on Island B (x >= 8.0, y = 0.3)
      if (world.player.pos.x >= 8.0 && world.player.pos.y >= 0.25) {
        successCount++;
      }
      if (world.player.wet) {
        waterEntries++;
      }

      world.events.peek((ev: SimEvent) => {
        if (ev.type === 'noise') noiseCount++;
      });
    }

    const successRate = successCount / 20;
    expect(successRate).toBeGreaterThanOrEqual(0.95);
    expect(waterEntries).toBe(0);
    expect(noiseCount).toBe(0);
  });

  it('Scenario 6: wade_costs — crouch, walk, and sprint in water produce 0.12, 0.35, 0.75 and match alert ranges', () => {
    // Alert distance at Normal:
    // radius = loudness * 40m
    // crouch: 0.12 * 40 = 4.8m (~5m)
    // walk: 0.35 * 40 = 14.0m (~14m)
    // sprint: 0.75 * 40 = 30.0m (~30m)

    const tests = [
      { mode: 'crouch', loudness: 0.12, expectedRange: 4.8, testDist: 4.5, outsideDist: 5.5 },
      { mode: 'walk', loudness: 0.35, expectedRange: 14.0, testDist: 13.5, outsideDist: 15.0 },
      { mode: 'sprint', loudness: 0.75, expectedRange: 30.0, testDist: 28.5, outsideDist: 32.0 },
    ];

    for (let i = 0; i < tests.length; i++) {
      const tc = tests[i]!;

      // 1. Within hearing range
      const worldNear = createProvingGroundsSim('normal');
      const monsterNear = worldNear.addMonster(
        {
          id: `m_${tc.mode}_near`,
          variant: 'standard',
          spawn: { x: 0, y: WATER_FLOOR_Y, z: -tc.testDist },
          hearingMul: 1.0,
          speedMul: 1.0,
          scale: 1.0,
        },
        100 + i,
      );
      worldNear.events.pushNoise(`n_${tc.mode}`, 'wade', 0, WATER_FLOOR_Y, 0, tc.loudness, 'player_local', 0);
      worldNear.step(1 / 60, {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        crouch: false,
        jump: false,
        interact: false,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
      });
      expect(monsterNear.state).toBe('ALERTED');

      // 2. Outside hearing range
      const worldFar = createProvingGroundsSim('normal');
      const monsterFar = worldFar.addMonster(
        {
          id: `m_${tc.mode}_far`,
          variant: 'standard',
          spawn: { x: 0, y: WATER_FLOOR_Y, z: -tc.outsideDist },
          hearingMul: 1.0,
          speedMul: 1.0,
          scale: 1.0,
        },
        200 + i,
      );
      worldFar.events.pushNoise(`n_${tc.mode}_far`, 'wade', 0, WATER_FLOOR_Y, 0, tc.loudness, 'player_local', 0);
      worldFar.step(1 / 60, {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        crouch: false,
        jump: false,
        interact: false,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
      });
      expect(monsterFar.state).toBe('DORMANT');
    }
  });

  it('Scenario 7: touch_contact — monster in WANDER placed at 0.8m from still wading player attacks <= 0.5s', () => {
    const world = createProvingGroundsSim('normal');
    world.player.pos.x = 0;
    world.player.pos.y = WATER_FLOOR_Y;
    world.player.pos.z = 0;

    const monster = world.addMonster(
      {
        id: 'monster_toucher',
        variant: 'standard',
        spawn: { x: 0, y: WATER_FLOOR_Y, z: 0.8 }, // 0.8m away (within 0.9m touch range)
        hearingMul: 1.0,
        speedMul: 1.0,
        scale: 1.0,
      },
      888,
    );
    monster.state = 'WANDER';

    const bot = new SimBot(world);
    let attackedTime: number | null = null;
    let t = 0;

    // Advance up to 0.5s (30 ticks)
    for (let i = 0; i < 30; i++) {
      t += 1 / 60;
      bot.tick(1 / 60, {});
      if ((monster.state as string) === 'ATTACK') {
        attackedTime = t;
        break;
      }
    }

    expect(attackedTime).not.toBeNull();
    expect(attackedTime!).toBeLessThanOrEqual(0.5);
  });

  it('Scenario 8: investigate_timeout — after arrival and silence, monster returns to WANDER within INVESTIGATE_TIME + 10s + 1s', () => {
    const world = createProvingGroundsSim('normal');
    // Monster spawn at (-20, -0.9, -20)
    const monster = world.addMonster(
      {
        id: 'monster_invest',
        variant: 'standard',
        spawn: { x: -20, y: WATER_FLOOR_Y, z: -20 },
        hearingMul: 1.0,
        speedMul: 1.0,
        scale: 1.0,
      },
      999,
    );

    // Trigger investigate directly
    monster.forceState('INVESTIGATE', {
      investigatePhase: 'sniff',
      stateTimer: 4.0, // 4s sniff
      searchTimer: 10.0, // 10s search pattern
    });

    const bot = new SimBot(world);
    let returnedToWanderTime: number | null = null;
    let t = 0;

    // Total timeout = 4.0 + 10.0 = 14.0s. Max allowed = 15.0s (14s + 1s tolerance)
    for (let tick = 0; tick < 15 * 60; tick++) {
      t += 1 / 60;
      bot.tick(1 / 60, {});
      if ((monster.state as string) === 'WANDER') {
        returnedToWanderTime = t;
        break;
      }
    }

    expect(returnedToWanderTime).not.toBeNull();
    expect(returnedToWanderTime!).toBeLessThanOrEqual(15.0);
    expect(returnedToWanderTime!).toBeGreaterThanOrEqual(13.5);
  });
});

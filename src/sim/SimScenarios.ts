/* ── SimScenarios.ts ────────────────────────────────────────────────────────
 *  Automated, deterministic headless scenario runner.
 *  Executes all 8 Section 12 test scenarios in Node or browser without DOM/audio.
 * ──────────────────────────────────────────────────────────────────────── */

import { createProvingGroundsSim, WATER_FLOOR_Y } from './ProvingGroundsData.js';
import { SimBot } from './SimBot.js';
import type { SimEvent } from './Events.js';
import type { PlayerIntent } from './PlayerMotor.js';
import { Rng } from './rng.js';

export interface ScenarioResult {
  name: string;
  pass: boolean;
  metric: string;
  details?: unknown;
}

export const SCENARIO_NAMES = [
  'silent_platform',
  'dry_motion',
  'splash_lure',
  'trench_block',
  'silent_jump_cross',
  'wade_costs',
  'touch_contact',
  'investigate_timeout',
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export function listScenarios(): readonly string[] {
  return SCENARIO_NAMES;
}

export function runScenario(name: string): ScenarioResult {
  switch (name) {
    case 'silent_platform': {
      const seeds = [101, 202, 303, 404, 505];
      let totalAlerts = 0;
      let totalAttacks = 0;

      for (const seed of seeds) {
        const world = createProvingGroundsSim('normal');
        world.player.pos.x = 0;
        world.player.pos.y = 0.3;
        world.player.pos.z = 12;

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
        let elapsed = 0;
        while (elapsed < 120) {
          bot.tick(1 / 60, {});
          if (monster.state === 'ALERTED' || monster.state === 'HUNT') totalAlerts++;
          if (monster.state === 'ATTACK') totalAttacks++;
          elapsed += 1 / 60;
        }
      }

      const pass = totalAlerts === 0 && totalAttacks === 0;
      return {
        name,
        pass,
        metric: `Alerts: ${totalAlerts}, Attacks: ${totalAttacks} over 5 seeds x 120s`,
      };
    }

    case 'dry_motion': {
      const world = createProvingGroundsSim('normal');
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

      const actions: Partial<PlayerIntent>[] = [
        { moveZ: -1, sprint: false },
        { moveZ: 1, sprint: true },
        { moveX: 1, crouch: true },
        { moveX: -1, jump: true },
        { moveZ: -1, sprint: true, jump: true },
      ];

      for (let second = 0; second < 60; second++) {
        const intent = actions[second % actions.length]!;
        for (let tick = 0; tick < 60; tick++) {
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

      const pass = noiseEventCount === 0 && alertCount === 0;
      return {
        name,
        pass,
        metric: `NoiseEvents: ${noiseEventCount}, Alerts: ${alertCount} over 60s dynamic motion`,
      };
    }

    case 'splash_lure': {
      const world = createProvingGroundsSim('normal');
      world.player.pos.x = 0;
      world.player.pos.y = 0.5;
      world.player.pos.z = 21;
      world.player.vel.y = -2.0;

      const monster = world.addMonster(
        {
          id: 'monster_lure',
          variant: 'standard',
          spawn: { x: -30, y: WATER_FLOOR_Y, z: 21 },
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
      while (t < 10.0) {
        t += 1 / 60;
        bot.tick(1 / 60, {});

        if (alertedTime === null && monster.state === 'ALERTED') alertedTime = t;
        if (huntTime === null && monster.state === 'HUNT') huntTime = t;
        const distToSplash = Math.hypot(monster.pos.x - 0, monster.pos.z - 21);
        if (arrivalTime === null && distToSplash < 1.8) {
          arrivalTime = t;
          break;
        }
      }

      const maxAllowed = 30.0 / 7.2 + 2.0;
      const pass =
        alertedTime !== null &&
        alertedTime <= 1.0 &&
        huntTime !== null &&
        huntTime <= 1.5 &&
        arrivalTime !== null &&
        arrivalTime <= maxAllowed;

      return {
        name,
        pass,
        metric: `Alerted: ${alertedTime?.toFixed(2)}s (<=1.0s), Hunt: ${huntTime?.toFixed(2)}s (<=1.5s), Arrival: ${arrivalTime?.toFixed(2)}s (<=${maxAllowed.toFixed(2)}s)`,
      };
    }

    case 'trench_block': {
      const world = createProvingGroundsSim('normal');
      world.player.pos.x = 7.0;
      world.player.pos.y = WATER_FLOOR_Y;
      world.player.pos.z = 12.0;

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
      world.events.pushNoise('trench_bang', 'clang', 7.0, WATER_FLOOR_Y, 12.0, 1.0, 'player_local', 0);

      let didEnterBlocked = false;
      let attackedMidTrench = false;

      for (let i = 0; i < 300; i++) {
        bot.tick(1 / 60, {});
        if (monster.state === 'BLOCKED') didEnterBlocked = true;
        if (monster.state === 'ATTACK') attackedMidTrench = true;
      }

      // Attack at mouth check
      world.player.pos.x = monster.pos.x;
      world.player.pos.z = monster.pos.z + 1.2;
      world.player.pos.y = monster.pos.y;
      let attackedAtMouth = false;
      for (let i = 0; i < 30; i++) {
        bot.tick(1 / 60, {});
        if (monster.state === 'ATTACK') {
          attackedAtMouth = true;
          break;
        }
      }

      const pass = didEnterBlocked && !attackedMidTrench && attackedAtMouth;
      return {
        name,
        pass,
        metric: `Blocked: ${didEnterBlocked}, Mid-trench safe: ${!attackedMidTrench}, Mouth attack: ${attackedAtMouth}`,
      };
    }

    case 'silent_jump_cross': {
      let successCount = 0;
      let waterEntries = 0;
      let noiseCount = 0;
      const rng = new Rng(1337);

      for (let trial = 0; trial < 20; trial++) {
        const world = createProvingGroundsSim('normal');
        const runUpDist = rng.range(2.5, 4.0);
        world.player.pos.x = 6.0 - runUpDist;
        world.player.pos.y = 0.3;
        world.player.pos.z = 12.0;
        world.player.yaw = 0;

        const bot = new SimBot(world);
        const sprintRight: Partial<PlayerIntent> = { moveX: 1, moveZ: 0, sprint: true };

        let runTicks = 0;
        while (world.player.pos.x < 5.6 && runTicks < 120) {
          bot.tick(1 / 60, sprintRight);
          runTicks++;
        }

        bot.tick(1 / 60, { ...sprintRight, jump: true });

        let airTicks = 0;
        while (!world.player.onGround && airTicks < 120) {
          bot.tick(1 / 60, sprintRight);
          airTicks++;
        }

        if (world.player.pos.x >= 8.0 && world.player.pos.y >= 0.25) successCount++;
        if (world.player.wet) waterEntries++;

        world.events.peek((ev: SimEvent) => {
          if (ev.type === 'noise') noiseCount++;
        });
      }

      const rate = successCount / 20;
      const pass = rate >= 0.95 && waterEntries === 0 && noiseCount === 0;
      return {
        name,
        pass,
        metric: `Success: ${successCount}/20 (${(rate * 100).toFixed(0)}%), Water entries: ${waterEntries}, Noises: ${noiseCount}`,
      };
    }

    case 'wade_costs': {
      const tests = [
        { mode: 'crouch', loudness: 0.12, testDist: 4.5, outsideDist: 5.5 },
        { mode: 'walk', loudness: 0.35, testDist: 13.5, outsideDist: 15.0 },
        { mode: 'sprint', loudness: 0.75, testDist: 28.5, outsideDist: 32.0 },
      ];

      let allPass = true;
      for (let i = 0; i < tests.length; i++) {
        const tc = tests[i]!;

        const worldNear = createProvingGroundsSim('normal');
        const mNear = worldNear.addMonster(
          { id: `m_${tc.mode}_near`, variant: 'standard', spawn: { x: 0, y: WATER_FLOOR_Y, z: -tc.testDist } },
          100 + i,
        );
        worldNear.events.pushNoise(`n_${tc.mode}`, 'wade', 0, WATER_FLOOR_Y, 0, tc.loudness, 'player_local', 0);
        worldNear.step(1 / 60, { moveX: 0, moveZ: 0, sprint: false, crouch: false, jump: false, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 });

        const worldFar = createProvingGroundsSim('normal');
        const mFar = worldFar.addMonster(
          { id: `m_${tc.mode}_far`, variant: 'standard', spawn: { x: 0, y: WATER_FLOOR_Y, z: -tc.outsideDist } },
          200 + i,
        );
        worldFar.events.pushNoise(`n_${tc.mode}_far`, 'wade', 0, WATER_FLOOR_Y, 0, tc.loudness, 'player_local', 0);
        worldFar.step(1 / 60, { moveX: 0, moveZ: 0, sprint: false, crouch: false, jump: false, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 });

        if (mNear.state !== 'ALERTED' || mFar.state !== 'DORMANT') {
          allPass = false;
        }
      }

      return {
        name,
        pass: allPass,
        metric: 'Crouch (0.12 @ 4.8m), Walk (0.35 @ 14.0m), Sprint (0.75 @ 30.0m) verified boundary tests',
      };
    }

    case 'touch_contact': {
      const world = createProvingGroundsSim('normal');
      world.player.pos.x = 0;
      world.player.pos.y = WATER_FLOOR_Y;
      world.player.pos.z = 0;

      const monster = world.addMonster(
        { id: 'm_touch', variant: 'standard', spawn: { x: 0, y: WATER_FLOOR_Y, z: 0.8 } },
        888,
      );
      monster.state = 'WANDER';

      const bot = new SimBot(world);
      let attackedTime: number | null = null;
      let t = 0;
      for (let i = 0; i < 30; i++) {
        t += 1 / 60;
        bot.tick(1 / 60, {});
        if ((monster.state as string) === 'ATTACK') {
          attackedTime = t;
          break;
        }
      }

      const pass = attackedTime !== null && attackedTime <= 0.5;
      return {
        name,
        pass,
        metric: `Attacked at ${attackedTime?.toFixed(2)}s (<= 0.5s limit) when touched at 0.8m`,
      };
    }

    case 'investigate_timeout': {
      const world = createProvingGroundsSim('normal');
      const monster = world.addMonster(
        { id: 'm_invest', variant: 'standard', spawn: { x: -20, y: WATER_FLOOR_Y, z: -20 } },
        999,
      );

      monster.state = 'INVESTIGATE';
      (monster as unknown as { investigatePhase: string }).investigatePhase = 'sniff';
      (monster as unknown as { stateTimer: number }).stateTimer = 4.0;
      (monster as unknown as { searchTimer: number }).searchTimer = 10.0;

      const bot = new SimBot(world);
      let returnTime: number | null = null;
      let t = 0;
      for (let tick = 0; tick < 15 * 60; tick++) {
        t += 1 / 60;
        bot.tick(1 / 60, {});
        if ((monster.state as string) === 'WANDER') {
          returnTime = t;
          break;
        }
      }

      const pass = returnTime !== null && returnTime >= 13.5 && returnTime <= 15.0;
      return {
        name,
        pass,
        metric: `Returned to WANDER at ${returnTime?.toFixed(2)}s (expected 14.0s +- 1.0s)`,
      };
    }

    default:
      return {
        name,
        pass: false,
        metric: `Unknown scenario '${name}'`,
      };
  }
}

export function runAllScenarios(): ScenarioResult[] {
  return SCENARIO_NAMES.map(runScenario);
}

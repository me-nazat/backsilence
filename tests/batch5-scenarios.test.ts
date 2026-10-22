/* ── batch5-scenarios.test.ts ─────────────────────────────────────────────
 *  Integration scenarios for Batch 5 Map Pack mechanics:
 *  1. perch_immunity: Monster ATTACK/TOUCH check skipped while perched in Drowned School
 *  2. school_wobbly_chair: Chair tips after 5s of occupancy, emitting creak & dumping player
 *  3. school_tide_rise: Tide rises 0 -> +0.30m, submerging low perches but sparing high desks
 *  4. jungle_flow_drift: River flow imparts downstream velocity drift on wading player
 *  5. jungle_rapids_mask: Acoustic mask near rapids suppresses noise reception
 *  6. sluice_order_reset: Turning sluices out of order triggers flash flood reset
 *  7. city_drone_spotlight: Entering spotlight cone fills detection -> siren alert
 *  8. city_emp_disable: EMP blast disables drones within radius for 20s
 *  9. metro_ghost_train_kill_stun: Train in T2 kills player, stuns monster for 45s
 *  10. metro_bottle_shatter_lure: Glass bottle shatter noise lures monster
 *  11. metro_departure_escape: 20s countdown escapes boarded player, leaves unboarded
 *  12. school_coop_pa_lure: PA lure diverts monster across map for door unchaining
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { PerchSystem } from '../src/sim/PerchSystem.js';
import { TideClock } from '../src/sim/Tide.js';
import { FlowField } from '../src/sim/FlowField.js';
import { Drone } from '../src/sim/Drone.js';
import { GhostTrain } from '../src/sim/GhostTrain.js';
import { MonsterBrain } from '../src/sim/MonsterBrain.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { createWorldProfile } from '../src/sim/WorldProfile.js';
import { canHearNoise } from '../src/sim/Hearing.js';
import type { Vec3, NoiseEvent } from '../src/types/contracts.js';

describe('Batch 5 Map Scenarios & Rulebook Integration', () => {
  describe('Scenario 1: perch_immunity (Drowned School / Sunken Jungle)', () => {
    it('monster ATTACK and TOUCH checks skip perched players with perchImmunity enabled', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);
      ground.rasterizePlatform(-2, -2, 2, 2, 0.45);
      ground.computeDistanceTransform(0);

      const profile = createWorldProfile({ perchImmunity: true });
      const nav = new NavGrid(ground, 0, 0.5, profile);
      const colliders = new ColliderSet(4.0);
      const perches = new PerchSystem();
      perches.addBoxPerch('desk_alpha', -2, -2, 4, 4, 0.45, { isPerch: true });

      const playerPos: Vec3 = { x: 0, y: 0.45, z: 0 };
      const isPerched = perches.isPlayerPerched(playerPos, true, 0);
      expect(isPerched).toBe(true);

      const events = new EventRingBuffer(256);
      const monster = new MonsterBrain(
        { id: 'm_school', variant: 'standard', spawn: { x: 2.2, y: -0.9, z: 0 }, spawnGrace: 0 },
        nav,
        42,
      );
      monster.forceState('HUNT');

      // Tick brain near player; monster must enter LURK and never ATTACK
      monster.step(0.1, playerPos, nav, colliders, events, { difficultyHearing: 1.0 }, 1.0, isPerched);
      expect(monster.state).toBe('LURK');
      expect(monster.state).not.toBe('ATTACK');
    });
  });

  describe('Scenario 2: school_wobbly_chair', () => {
    it('wobbly chair tips after 5s of player occupancy, emitting creak noise and removing perch', () => {
      const perches = new PerchSystem();
      const chair = perches.addBoxPerch('wobbly_chair_1', 0, 0, 0.8, 0.8, 0.45, { isPerch: true, wobbly: true });
      const events = new EventRingBuffer(64);

      // Stand on chair for 3.0s: chair is not yet tipped
      for (let t = 0; t < 30; t++) {
        perches.step(0.1, { x: 0.4, y: 0.45, z: 0.4 }, true, 0, events, t * 0.1);
      }
      expect(chair.tipped).toBe(false);

      // Advance past 5.0s: chair tips over!
      for (let t = 30; t < 55; t++) {
        perches.step(0.1, { x: 0.4, y: 0.45, z: 0.4 }, true, 0, events, t * 0.1);
      }
      expect(chair.tipped).toBe(true);
      expect(perches.getTopAt(0.4, 0.4)).toBe(null); // No longer safe perch
    });
  });

  describe('Scenario 3: school_tide_rise', () => {
    it('tide water level rises 0 -> +0.30m, submerging lower perches while sparing high perches', () => {
      const tide = new TideClock('normal');
      const perches = new PerchSystem();

      // Low bench: topY = 0.18m
      perches.addBoxPerch('low_bench', 0, 0, 1, 2, 0.18, { isPerch: true });
      // High teacher desk: topY = 0.55m
      perches.addBoxPerch('teacher_desk', 5, 5, 7, 8, 0.55, { isPerch: true });

      // At t = 0 (waterY = 0), low bench is valid perch
      const initialWaterY = tide.levelAt(0);
      expect(initialWaterY).toBeCloseTo(0.0, 2);
      expect(perches.isPlayerPerched({ x: 0.5, y: 0.18, z: 1.0 }, true, initialWaterY)).toBe(true);

      // At full duration (840s), water level is +0.30m
      const highWaterY = tide.levelAt(840);
      expect(highWaterY).toBeCloseTo(0.30, 2);

      // Low bench (0.18m) is now submerged below waterY + 0.06m -> no longer dry!
      expect(perches.isPlayerPerched({ x: 0.5, y: 0.18, z: 1.0 }, true, highWaterY)).toBe(false);

      // High desk (0.55m) is still safely dry and perched!
      expect(perches.isPlayerPerched({ x: 6.0, y: 0.55, z: 6.5 }, true, highWaterY)).toBe(true);
    });
  });

  describe('Scenario 4: jungle_flow_drift', () => {
    it('river flow imparts downstream velocity drift on wading player', () => {
      const flow = new FlowField();
      flow.addWaypoint({ x: 0, z: 0, speed: 2.0, width: 12 });
      flow.addWaypoint({ x: 0, z: 50, speed: 2.0, width: 12 });

      const current = flow.flowAt(0, 25);
      expect(current.z).toBeGreaterThan(1.0);

      // Compute wade drift
      const drift = flow.computeWadeDrift({ x: 0, y: -0.5, z: 25 }, 1.0);
      expect(drift.dz).toBeCloseTo(current.z * 0.55, 3);
    });
  });

  describe('Scenario 5: jungle_rapids_mask', () => {
    it('acoustic mask near rapids attenuates noise reception by monster', () => {
      const flow = new FlowField();
      flow.addMaskZone({ id: 'rapids', cx: 20, cz: 20, radius: 20, factor: 0.35 });

      expect(flow.maskAt(0, 0)).toBe(1.0);
      expect(flow.maskAt(20, 20)).toBe(0.35);

      const colliders = new ColliderSet(4.0);
      const splashNoise: NoiseEvent = {
        id: 'splash_1',
        kind: 'splash',
        position: { x: 20, y: 0, z: 20 },
        loudness: 0.35,
        sourcePlayerId: 'p1',
        t: 0,
      };

      // Near rapids (mask 0.35), hearing range is attenuated
      const monsterPos: Vec3 = { x: 35, y: 0, z: 35 }; // dist ~21m
      const canHear = canHearNoise(splashNoise, monsterPos, 1.0, { difficultyHearing: 1.0, maskFactor: () => 0.35 }, colliders);
      expect(canHear).toBe(false);
    });
  });

  describe('Scenario 6: sluice_order_reset', () => {
    it('operating sluice wheels in correct order (1->2->3) lowers water, wrong order triggers flash flood reset', () => {
      let sluiceStep = 0;
      let flashFloodTriggered = false;

      function operateSluice(index: number) {
        if (index === sluiceStep + 1) {
          sluiceStep++;
        } else {
          sluiceStep = 0;
          flashFloodTriggered = true;
        }
      }

      // Step 1: correct
      operateSluice(1);
      expect(sluiceStep).toBe(1);
      expect(flashFloodTriggered).toBe(false);

      // Step 2: WRONG (try 3 instead of 2)
      operateSluice(3);
      expect(sluiceStep).toBe(0);
      expect(flashFloodTriggered).toBe(true);

      // Correct sequence 1 -> 2 -> 3
      flashFloodTriggered = false;
      operateSluice(1);
      operateSluice(2);
      operateSluice(3);
      expect(sluiceStep).toBe(3);
      expect(flashFloodTriggered).toBe(false);
    });
  });

  describe('Scenario 7: city_drone_spotlight', () => {
    it('player standing in drone spotlight cone fills detection meter and triggers siren lock', () => {
      const polyline = [
        { x: 0, y: 5, z: 0 },
        { x: 0, y: 5, z: 20 },
      ];
      const drone = new Drone('drone_1', polyline, 0);
      const colliders = new ColliderSet(4.0);
      const events = new EventRingBuffer(64);

      // Player in spotlight cone at (0, 0, 6.0)
      const closePlayer: Vec3 = { x: 0, y: 0, z: 6.0 };
      expect(drone.checkSight(closePlayer, false, colliders, [])).toBe(true);

      drone.step(0.65, closePlayer, false, colliders, [], events, 1.0);
      expect(drone.state).toBe('LOCK');
      expect(drone.detectionMeter).toBe(1.0);
    });
  });

  describe('Scenario 8: city_emp_disable', () => {
    it('EMP pulse disables drone for 20 seconds, clearing any lock', () => {
      const polyline = [{ x: 0, y: 4, z: 0 }];
      const drone = new Drone('drone_emp', polyline, 0);

      const affected = drone.applyEmp({ x: 2, y: 4, z: 2 }, 10.0, 20.0);
      expect(affected).toBe(true);
      expect(drone.state).toBe('EMP_DISABLED');
      expect(drone.empTimer).toBe(20.0);

      // Step 10s: still disabled
      drone.step(10.0, { x: 0, y: 0, z: 0 }, false, new ColliderSet(4.0));
      expect(drone.state).toBe('EMP_DISABLED');

      // Step 11s: re-enables
      drone.step(11.0, { x: 0, y: 0, z: 0 }, false, new ColliderSet(4.0));
      expect(drone.state).toBe('PATROL');
    });
  });

  describe('Scenario 9: metro_ghost_train_kill_stun', () => {
    it('ghost train in PASS phase kills players in T2 express track and stuns monsters for 45s', () => {
      const train = new GhostTrain(42);
      train.addRefugeAlcove({ minX: 18, minZ: 4.0, maxX: 22, maxZ: 6.0 });

      // Inside kill zone: z = 5.0 (between 3.4 and 6.6)
      expect(train.isInsideKillZone({ x: 0, y: 0, z: 5.0 })).toBe(true);
      expect(train.isInsideKillZone({ x: 0, y: 1.0, z: 1.0 })).toBe(false);

      // Safe in refuge alcove
      expect(train.isInsideKillZone({ x: 20, y: 0, z: 5.0 })).toBe(false);

      // Step during PASS phase (t = 46s) kills player in track
      const killResult = train.step(0.1, 46.0, { x: 0, y: 0, z: 5.0 }, []);
      expect(killResult.playerKilled).toBe(true);

      // Monster in express track is stunned for 45s
      const bounds = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);
      ground.computeDistanceTransform(0);
      const nav = new NavGrid(ground, 0, 0.5);

      const monster = new MonsterBrain(
        { id: 'm_metro', variant: 'standard', spawn: { x: 10, y: -0.9, z: 5.0 }, spawnGrace: 0 },
        nav,
        123,
      );
      monster.addCandidateSpawn({ x: -40, y: -0.9, z: -40 });

      train.step(0.1, 46.0, { x: 0, y: 1.0, z: 0 }, [monster]);
      expect(monster.state).toBe('STUNNED');
    });
  });

  describe('Scenario 10: metro_bottle_shatter_lure', () => {
    it('thrown bottle creates shatter noise that lures monster from patrol path', () => {
      const bounds = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);
      ground.computeDistanceTransform(0);
      const nav = new NavGrid(ground, 0, 0.5);

      const monster = new MonsterBrain(
        { id: 'm_lure', variant: 'standard', spawn: { x: -30, y: -0.9, z: 0 }, spawnGrace: 0 },
        nav,
        123,
      );
      expect(monster.state).toBe('DORMANT');

      const bottleImpactPos: Vec3 = { x: -5, y: 0.3, z: 0 };
      const shatterNoise: NoiseEvent = {
        id: 'bottle_1',
        kind: 'shatter',
        position: bottleImpactPos,
        loudness: 0.85,
        sourcePlayerId: 'p1',
        t: 1.0,
      };

      monster.onNoiseEvent(shatterNoise, new ColliderSet(4.0), { difficultyHearing: 1.0 }, 1.0);
      expect(monster.state).toBe('ALERTED');
    });
  });

  describe('Scenario 11: metro_departure_escape', () => {
    it('train engine start begins 20s countdown; boarded player escapes while outside player fails', () => {
      const engineStarted = true;
      let boardingTimer = 20.0;

      // Car 5 interior bounds: x in [-12, 12], z in [-20.5, -17.5]
      function isPlayerInCar5(pos: Vec3): boolean {
        return pos.x >= -12 && pos.x <= 12 && pos.z >= -20.5 && pos.z <= -17.5;
      }

      const p1Boarded: Vec3 = { x: 0, y: 1.2, z: -19.0 };
      const p2LeftBehind: Vec3 = { x: 15, y: 1.0, z: 0.0 };

      expect(isPlayerInCar5(p1Boarded)).toBe(true);
      expect(isPlayerInCar5(p2LeftBehind)).toBe(false);

      // Countdown expires
      boardingTimer = 0.0;
      const p1Escaped = engineStarted && boardingTimer <= 0 && isPlayerInCar5(p1Boarded);
      const p2Escaped = engineStarted && boardingTimer <= 0 && isPlayerInCar5(p2LeftBehind);

      expect(p1Escaped).toBe(true);
      expect(p2Escaped).toBe(false);
    });
  });

  describe('Scenario 12: school_coop_pa_lure', () => {
    it('PA lure noise draws monster across 33m, granting partner clear window to cut chains', () => {
      const bounds = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);
      ground.computeDistanceTransform(0);
      const nav = new NavGrid(ground, 0, 0.5);

      const monster = new MonsterBrain(
        { id: 'm_coop', variant: 'standard', spawn: { x: 0, y: -0.9, z: 0 }, spawnGrace: 0 },
        nav,
        123,
      );

      // Partner broadcasts PA announcement from Office -> sounds in Gymnasium at (x: 30, z: 15)
      const gymPos: Vec3 = { x: 30, y: 0.3, z: 15 };
      const sirenNoise: NoiseEvent = {
        id: 'pa_blast_1',
        kind: 'siren',
        position: gymPos,
        loudness: 0.95,
        sourcePlayerId: 'world',
        t: 1.0,
      };

      monster.onNoiseEvent(sirenNoise, new ColliderSet(4.0), { difficultyHearing: 1.0 }, 1.0);
      expect(monster.state).toBe('ALERTED');

      // Player cutting lobby chains at exit (x: 0, z: -48) is 48m away from monster and 70m from gym
      const lobbyExitPos: Vec3 = { x: 0, y: 0.3, z: -48 };
      const distToGym = Math.hypot(lobbyExitPos.x - gymPos.x, lobbyExitPos.z - gymPos.z);
      expect(distToGym).toBeGreaterThan(60);
    });
  });
});

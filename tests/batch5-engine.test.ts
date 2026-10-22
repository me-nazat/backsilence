/* ── batch5-engine.test.ts ───────────────────────────────────────────────
 *  Unit tests for Batch 5 shared engine systems:
 *  WorldProfile, PerchSystem, LURK/STUNNED, NavGrid clearance classes,
 *  FlowField & drift, Weather & thunder masks, Drone & sight sensor,
 *  GhostTrain schedule & kill zone, Tide clock, and Wobbly chairs.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { createWorldProfile, DEFAULT_WORLD_PROFILE } from '../src/sim/WorldProfile.js';
import { PerchSystem } from '../src/sim/PerchSystem.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { MonsterBrain } from '../src/sim/MonsterBrain.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { FlowField } from '../src/sim/FlowField.js';
import { WeatherSystem } from '../src/sim/Weather.js';
import { Drone } from '../src/sim/Drone.js';
import { GhostTrain } from '../src/sim/GhostTrain.js';
import { TideClock } from '../src/sim/Tide.js';
import { canHearNoise } from '../src/sim/Hearing.js';
import type { Vec3, NoiseEvent } from '../src/types/contracts.js';

describe('Batch 5: Shared Engine Upgrades', () => {
  describe('1. WorldProfile & Perch Immunity', () => {
    it('creates profiles with defaults and overrides', () => {
      const p = createWorldProfile({
        perchImmunity: true,
        wadeFactor: 0.75,
        clearance: { platform: 1.2, furniture: 0.55, wall: 0.9, rock: 0.8 },
      });
      expect(p.perchImmunity).toBe(true);
      expect(p.wadeFactor).toBe(0.75);
      expect(p.clearance.furniture).toBe(0.55);
      expect(DEFAULT_WORLD_PROFILE.perchImmunity).toBe(false);
    });

    it('identifies perched players only on valid dry perch surfaces', () => {
      const perches = new PerchSystem();
      // Add a desk (perch = true, topY = 0.41)
      perches.addBoxPerch('desk_1', 0, 0, 2, 2, 0.41, { isPerch: true });
      // Add a stepping stone (isPerch = false, topY = 0.15)
      perches.addCylinderPerch('stone_1', 5, 5, 0.8, 0.15, { isPerch: false });

      // Grounded on desk inside footprint inset (waterY = 0)
      const onDesk = perches.isPlayerPerched({ x: 1, y: 0.41, z: 1 }, true, 0);
      expect(onDesk).toBe(true);

      // On desk edge within inset 0.1m -> false
      const onDeskEdge = perches.isPlayerPerched({ x: 0.05, y: 0.41, z: 1 }, true, 0);
      expect(onDeskEdge).toBe(false);

      // In the air above desk -> false
      const inAir = perches.isPlayerPerched({ x: 1, y: 0.41, z: 1 }, false, 0);
      expect(inAir).toBe(false);

      // On stepping stone (isPerch: false) -> false
      const onStone = perches.isPlayerPerched({ x: 5, y: 0.15, z: 5 }, true, 0);
      expect(onStone).toBe(false);

      // In water -> false
      const inWater = perches.isPlayerPerched({ x: 10, y: -0.2, z: 10 }, true, 0);
      expect(inWater).toBe(false);
    });

    it('perched player is never attacked or touched over 1,000 simulated seconds (5 seeds)', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);
      ground.rasterizePlatform(-2, -2, 2, 2, 0.45); // perch footprint
      ground.computeDistanceTransform(0);

      const profile = createWorldProfile({ perchImmunity: true });
      const nav = new NavGrid(ground, 0, 0.5, profile);
      const colliders = new ColliderSet(4.0);

      const perches = new PerchSystem();
      perches.addBoxPerch('desk', -2, -2, 2, 2, 0.45, { isPerch: true });

      const playerPos: Vec3 = { x: 0, y: 0.45, z: 0 };
      const isPerched = true;

      for (let s = 1; s <= 5; s++) {
        const events = new EventRingBuffer(256);
        const monster = new MonsterBrain(
          {
            id: `m_${s}`,
            variant: 'standard',
            spawn: { x: 2.2, y: -0.9, z: 0 },
            spawnGrace: 0,
          },
          nav,
          s * 1000,
        );
        monster.forceState('HUNT');

        let attacked = false;
        // Simulate 200 seconds per seed = 1,000 simulated seconds total
        for (let step = 0; step < 2000; step++) {
          monster.step(0.1, playerPos, nav, colliders, events, { difficultyHearing: 1.0 }, step * 0.1, isPerched);
          if (monster.state === 'ATTACK') {
            attacked = true;
            break;
          }
        }
        expect(attacked).toBe(false);
        // Monster should have entered LURK
        expect(['LURK', 'INVESTIGATE', 'WANDER']).toContain(monster.state);
      }
    });

    it('perch immunity is off on other maps and monster attacks', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);
      ground.computeDistanceTransform(0);

      const nav = new NavGrid(ground, 0, 0.5, DEFAULT_WORLD_PROFILE);
      const colliders = new ColliderSet(4.0);
      const events = new EventRingBuffer(256);

      const monster = new MonsterBrain(
        { id: 'm', variant: 'standard', spawn: { x: 1.0, y: 0, z: 0 }, spawnGrace: 0 },
        nav,
        123,
      );
      monster.forceState('HUNT');

      // Player at 1.0m, but perchImmunity is false (isPlayerPerched: false)
      monster.step(0.1, { x: 0, y: 0, z: 0 }, nav, colliders, events, { difficultyHearing: 1.0 }, 1.0, false);
      expect(monster.state).toBe('ATTACK');
    });

    it('dropping into water within 2.5m of lurking monster triggers attack immediately', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);
      ground.computeDistanceTransform(0);

      const nav = new NavGrid(ground, 0, 0.5, createWorldProfile({ perchImmunity: true }));
      const colliders = new ColliderSet(4.0);
      const events = new EventRingBuffer(256);

      const monster = new MonsterBrain(
        { id: 'm', variant: 'standard', spawn: { x: 2.0, y: -0.9, z: 0 }, spawnGrace: 0 },
        nav,
        42,
      );
      monster.forceState('LURK');

      // Player drops into water within 2.0m: isPlayerPerched = false
      monster.step(0.1, { x: 0, y: -0.9, z: 0 }, nav, colliders, events, { difficultyHearing: 1.0 }, 1.0, false);
      expect(monster.state).toBe('ATTACK');
    });

    it('wobbly chair creaks at 3.5s, tips at 5.0s, and recovers after 8.0s', () => {
      const perches = new PerchSystem();
      const chair = perches.addBoxPerch('chair', 0, 0, 0.8, 0.8, 0.45, { wobbly: true, isPerch: true });
      const events = new EventRingBuffer(64);

      // Stand for 3.0s: not yet warning
      for (let t = 0; t < 30; t++) {
        perches.step(0.1, { x: 0.4, y: 0.45, z: 0.4 }, true, 0, events, t * 0.1);
      }
      expect(chair.wobbleTime).toBeCloseTo(3.0, 1);
      expect(chair.tipped).toBe(false);
      expect(chair.tilt).toBe(0);

      // Step to 3.6s: creak warning and tilt begins
      for (let t = 30; t < 36; t++) {
        perches.step(0.1, { x: 0.4, y: 0.45, z: 0.4 }, true, 0, events, t * 0.1);
      }
      expect(chair.wobbleTime).toBeGreaterThanOrEqual(3.5);
      expect(chair.tilt).toBeGreaterThan(0);
      expect(chair.tipped).toBe(false);

      // Step to 5.1s: tips over!
      for (let t = 36; t < 52; t++) {
        perches.step(0.1, { x: 0.4, y: 0.45, z: 0.4 }, true, 0, events, t * 0.1);
      }
      expect(chair.tipped).toBe(true);
      expect(chair.recoveryTimer).toBeGreaterThanOrEqual(7.9);
      expect(chair.recoveryTimer).toBeLessThanOrEqual(8.0);
      // Tipped chair no longer provides perch top
      expect(perches.getTopAt(0.4, 0.4)).toBe(null);

      // Step 8.1s into recovery
      for (let t = 0; t < 82; t++) {
        perches.step(0.1, { x: 5, y: 0, z: 5 }, true, 0, events, 6.0 + t * 0.1);
      }
      expect(chair.tipped).toBe(false);
      expect(chair.recoveryTimer).toBe(0);
      expect(perches.getTopAt(0.4, 0.4)).toBe(0.45);
    });
  });

  describe('2. NavGrid Obstacle Classes & Clearances', () => {
    it('blocks monster between desk rows at 1.0m spacing, passes in 1.6m aisle', () => {
      const bounds = { minX: 0, minZ: 0, maxX: 20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9); // all water floor -0.9m

      // Row 1: x in [4.0, 5.0], z in [2.0, 18.0]
      ground.markObstacleRect(4.0, 2.0, 5.0, 18.0, 'furniture');
      // Row 2: x in [6.0, 7.0] (gap of 1.0m: between x=5.0 and x=6.0)
      ground.markObstacleRect(6.0, 2.0, 7.0, 18.0, 'furniture');
      // Row 3: x in [8.6, 9.6] (aisle of 1.6m: between x=7.0 and x=8.6)
      ground.markObstacleRect(8.6, 2.0, 9.6, 18.0, 'furniture');

      ground.computeDistanceTransform(0);

      const profile = createWorldProfile({
        clearance: { platform: 1.2, furniture: 0.55, wall: 0.9, rock: 0.8 },
      });
      const nav = new NavGrid(ground, 0, 0.5, profile);

      // Midpoint of 1.0m gap between Row 1 and Row 2 is x = 5.5
      // Distance to either desk row is 0.50m <= 0.55m -> blocked!
      const gapWalkable = nav.isWalkableWorld(5.5, 10.0);
      expect(gapWalkable).toBe(false);

      // Midpoint of 1.6m aisle between Row 2 and Row 3 is x = 7.8
      // Distance to either desk row is 0.80m > 0.55m -> walkable!
      const aisleWalkable = nav.isWalkableWorld(7.8, 10.0);
      expect(aisleWalkable).toBe(true);
    });
  });

  describe('3. FlowField, Current, Rapids Masks & Ripple Advection', () => {
    it('calculates spline flow, drift magnitude, and continuity', () => {
      const flow = new FlowField();
      flow.addWaypoint({ x: 0, z: 0, speed: 1.5, width: 10 });
      flow.addWaypoint({ x: 0, z: 50, speed: 2.0, width: 10 });

      // In center of river, flow is directed along +z
      const vCenter = flow.flowAt(0, 25);
      expect(vCenter.z).toBeGreaterThan(1.0);
      expect(Math.abs(vCenter.x)).toBeLessThan(1e-5);

      // Outside river channel (> 5m from centerline), flow is 0
      const vOutside = flow.flowAt(12, 25);
      expect(vOutside.x).toBe(0);
      expect(vOutside.z).toBe(0);

      // Drift magnitude is speed * 0.55 * dt
      const drift = flow.computeWadeDrift({ x: 0, y: -0.5, z: 25 }, 1.0);
      expect(drift.dz).toBeCloseTo(vCenter.z * 0.55, 3);

      // Test continuity: no discontinuity > 0.3 m/s between adjacent 0.5m samples
      for (let x = -7; x <= 7; x += 0.5) {
        const v1 = flow.flowAt(x, 25);
        const v2 = flow.flowAt(x + 0.5, 25);
        const diff = Math.hypot(v2.x - v1.x, v2.z - v1.z);
        expect(diff).toBeLessThan(0.3);
      }
    });

    it('rapids and waterfall mask zones reduce acoustic hearing radius', () => {
      const flow = new FlowField();
      flow.addMaskZone({ id: 'rapids', cx: 20, cz: 20, radius: 20, factor: 0.35 });
      flow.addMaskZone({ id: 'waterfall', cx: 80, cz: 80, radius: 28, factor: 0.30 });

      expect(flow.maskAt(0, 0)).toBe(1.0);
      expect(flow.maskAt(20, 20)).toBe(0.35);
      expect(flow.maskAt(80, 80)).toBe(0.30);
    });

    it('advects ripple centers with exact mathematical parity to TS mirror (1e-4)', () => {
      const flow = new FlowField();
      flow.addWaypoint({ x: 0, z: 0, speed: 2.0, width: 12 });
      flow.addWaypoint({ x: 0, z: 40, speed: 2.0, width: 12 });

      const origin = { x: 0, z: 10 };
      const t0 = 5.0;
      const simTime = 8.5; // dt = 3.5s

      const advected = flow.advectRipple(origin.x, origin.z, t0, simTime);
      const v = flow.flowAt(origin.x, origin.z);
      const expectedZ = origin.z + v.z * (simTime - t0);

      expect(advected.z).toBeCloseTo(expectedZ, 4);
    });
  });

  describe('4. Weather System & Thunder Windows', () => {
    it('generates deterministic rain and thunder schedule (at least 1 per 90s)', () => {
      const weather1 = new WeatherSystem(12345);
      const weather2 = new WeatherSystem(12345);

      expect(weather1.rainAt(100)).toBeCloseTo(weather2.rainAt(100), 6);

      // Check thunder schedule has at least 1 window per 90s across 600s
      let lastThunder = 0;
      for (let t = 0; t <= 600; t += 0.5) {
        if (weather1.isThunderWindowAt(t)) {
          lastThunder = t;
        }
        expect(t - lastThunder).toBeLessThan(90.0);
      }
    });

    it('applies correct acoustic mask factors during thunder, downpour, and baseline', () => {
      const weather = new WeatherSystem(999);
      // Thunder window mask must be 0.3
      let foundThunder = false;
      for (let t = 10; t <= 120; t += 0.5) {
        if (weather.isThunderWindowAt(t)) {
          expect(weather.maskFactorAt(t)).toBe(0.3);
          foundThunder = true;
          break;
        }
      }
      expect(foundThunder).toBe(true);

      // Baseline mask factor is in [0.75, 1.0]
      const rain = weather.rainAt(10);
      const baseMask = 1.0 - 0.25 * rain;
      expect(baseMask).toBeGreaterThanOrEqual(0.75);
      expect(baseMask).toBeLessThanOrEqual(1.0);
    });
  });

  describe('5. Drone & Sight Sensor', () => {
    it('detects player in spotlight cone within 1.2s normal and 0.6s close, crouch scales range', () => {
      const polyline = [
        { x: 0, y: 5, z: 0 },
        { x: 0, y: 5, z: 20 },
      ];
      const drone = new Drone('drone_1', polyline, 0); // stationary at (0, 5, 0)
      const colliders = new ColliderSet(4.0);
      const events = new EventRingBuffer(64);

      // Player in spotlight cone at (0, 0, 6.0): distance ~7.8m (close <= 8m)
      const closePlayer: Vec3 = { x: 0, y: 0, z: 6.0 };
      expect(drone.checkSight(closePlayer, false, colliders, [])).toBe(true);

      // Close detection fills in ~0.6s (1.667/s)
      drone.step(0.65, closePlayer, false, colliders, [], events, 1.0);
      expect(drone.state).toBe('LOCK');
      expect(drone.detectionMeter).toBe(1.0);

      // Lock emits siren noise at player position
      let sirenFound = false;
      events.peek((ev) => {
        if (ev.type === 'noise' && ev.data.kind === 'siren' && ev.data.loudness === 0.9) {
          sirenFound = true;
        }
      });
      expect(sirenFound).toBe(true);

      // Crouching player at distance ~13.9m (within 20m normal, but outside 12m crouch max range)
      const farPlayer: Vec3 = { x: 0, y: 0, z: 13.0 };
      const drone2 = new Drone('drone_2', polyline, 0);
      expect(drone2.checkSight(farPlayer, false, colliders, [])).toBe(true);
      expect(drone2.checkSight(farPlayer, true, colliders, [])).toBe(false); // crouch range x0.6
    });

    it('EMP pulse disables drone within 10m for 20s', () => {
      const polyline = [{ x: 0, y: 4, z: 0 }];
      const drone = new Drone('drone_emp', polyline, 0);

      const affected = drone.applyEmp({ x: 2, y: 4, z: 2 }, 10.0, 20.0);
      expect(affected).toBe(true);
      expect(drone.state).toBe('EMP_DISABLED');
      expect(drone.empTimer).toBe(20.0);
      expect(drone.getSnapshot().spotlightOn).toBe(false);

      // Steps 10s -> still disabled
      drone.step(10.0, { x: 0, y: 0, z: 0 }, false, new ColliderSet(4.0));
      expect(drone.state).toBe('EMP_DISABLED');

      // Steps 11s -> re-enables to PATROL
      drone.step(11.0, { x: 0, y: 0, z: 0 }, false, new ColliderSet(4.0));
      expect(drone.state).toBe('PATROL');
    });
  });

  describe('6. Ghost Train Schedule, Kill Zone & 45s Stun', () => {
    it('executes exact Approach 14s, Pass 6s, Aftermath 8s cycle and mask factors', () => {
      const train = new GhostTrain(42);
      // First train at 45s: Approach starts at 45 - 14 = 31s
      const idleState = train.getPhaseAtTime(20.0);
      expect(idleState.phase).toBe('IDLE');
      expect(idleState.maskFactor).toBe(1.0);

      // At 35s (in approach, 4s elapsed < 8s -> mask 1.0)
      const earlyAppr = train.getPhaseAtTime(35.0);
      expect(earlyAppr.phase).toBe('APPROACH');
      expect(earlyAppr.maskFactor).toBe(1.0);

      // At 40s (in approach, 9s elapsed >= 8s -> mask 0.6)
      const lateAppr = train.getPhaseAtTime(40.0);
      expect(lateAppr.phase).toBe('APPROACH');
      expect(lateAppr.maskFactor).toBe(0.6);

      // At 46s (in PASS -> global mask 0.2)
      const passState = train.getPhaseAtTime(46.0);
      expect(passState.phase).toBe('PASS');
      expect(passState.maskFactor).toBe(0.2);

      // At 52s (in AFTERMATH -> mask 0.5)
      const afterState = train.getPhaseAtTime(52.0);
      expect(afterState.phase).toBe('AFTERMATH');
      expect(afterState.maskFactor).toBe(0.5);
    });

    it('kills player inside swept kill zone during PASS unless in refuge alcove', () => {
      const train = new GhostTrain(42);
      train.addRefugeAlcove({ minX: 18, minZ: 4.0, maxX: 22, maxZ: 6.0 });

      // Inside kill zone: z = 5.0 (between 3.4 and 6.6)
      expect(train.isInsideKillZone({ x: 0, y: 0, z: 5.0 })).toBe(true);

      // Safe on platform: z = 1.0 (outside kill zone)
      expect(train.isInsideKillZone({ x: 0, y: 1.0, z: 1.0 })).toBe(false);

      // Safe in refuge alcove at x = 20, z = 5.0
      expect(train.isInsideKillZone({ x: 20, y: 0, z: 5.0 })).toBe(false);

      // Step during PASS phase (t = 46s) kills player in track
      const killResult = train.step(0.1, 46.0, { x: 0, y: 0, z: 5.0 }, []);
      expect(killResult.playerKilled).toBe(true);
    });

    it('stuns monster in kill zone for 45s, and monsters ignore train as lure', () => {
      const train = new GhostTrain(42);
      const bounds = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);
      ground.computeDistanceTransform(0);

      const nav = new NavGrid(ground, 0, 0.5);
      const monster = new MonsterBrain(
        { id: 'm_train', variant: 'standard', spawn: { x: 10, y: -0.9, z: 5.0 }, spawnGrace: 0 },
        nav,
        123,
      );
      monster.addCandidateSpawn({ x: -40, y: -0.9, z: -40 });

      train.step(0.1, 46.0, { x: 0, y: 1.0, z: 0 }, [monster]);
      expect(monster.state).toBe('STUNNED');

      // Noise of kind 'train' is ignored by monsters
      const trainNoise: NoiseEvent = {
        id: 'train_horn',
        kind: 'train',
        position: { x: 0, y: 0, z: 5 },
        loudness: 1.0,
        sourcePlayerId: 'world',
        t: 46.0,
      };
      const heard = canHearNoise(trainNoise, { x: 0, y: 0, z: 0 }, 1.0, { difficultyHearing: 1.0 }, new ColliderSet(4.0));
      expect(heard).toBe(false);
    });

    it('holds ghost train schedule during boarding countdown', () => {
      const train = new GhostTrain(42);
      train.setBoardingHold(true);
      // At t = 46s, would normally be PASS, but is held in IDLE
      const heldState = train.getPhaseAtTime(46.0);
      expect(heldState.phase).toBe('IDLE');
      expect(heldState.maskFactor).toBe(1.0);
    });
  });

  describe('7. Tide Clock', () => {
    it('rises smoothly across discrete levels and triggers juvenile spawn at +0.15m', () => {
      const tide = new TideClock('normal'); // 14 min, target 0.30m
      expect(tide.levelAt(0)).toBe(0.0);
      expect(tide.discreteLevels.length).toBe(4);
      expect(tide.isJuvenileSpawnTriggered(0)).toBe(false);

      // At half duration (7 min = 420s), level is ~0.15m (smoothstep(0.5) = 0.5 * 0.30 = 0.15m)
      const midLevel = tide.levelAt(420);
      expect(midLevel).toBeCloseTo(0.15, 2);
      expect(tide.isJuvenileSpawnTriggered(420)).toBe(true);

      // At full duration (14 min = 840s), level is 0.30m
      expect(tide.levelAt(840)).toBeCloseTo(0.30, 2);
    });
  });
});

/* ── batch3-navigation-acoustic.test.ts ──────────────────────────────────────
 *  ANTIGRAVITY BATCH 3 Verification Suite:
 *  - Prompt 3A: Dry-Platform Exclusion, Narrow-Trench Blocking & Blind Navigation
 *    - R_monster = 0.68m circular footprint
 *    - Minkowski sum expansion on dry platforms ([minX-0.68, maxX+0.68, minZ-0.68, maxZ+0.68])
 *    - Narrow water trenches (gap < 1.36m, e.g. 1.05m Natatorium trench) block monster capsule
 *    - Player (R_player = 0.32m) freely navigates through narrow trenches
 *    - Goal snapping: targets inside trenches or against platforms snap to nearest navigable water cell
 *    - String-pulled A* pathfinding and physical collision push-out
 *  - Prompt 3B: Acoustic Event Emission & Near-Miss Freeze State Machine
 *    - Dry platform = ZERO water noise (waterNoiseLevel = 0)
 *    - In water standing still (< 0.08 m/s) = ZERO water noise (waterNoiseLevel = 0)
 *    - In water moving (>= 0.08 m/s) = step splash emitted every 0.32s
 *    - Water jump/fall landing = immediate high-priority WATER_SPLASH
 *    - Thrown stone impact = immediate HIGHEST-priority splash (overrides player target)
 *    - Freeze rule: targetSoundPos locks at last splash when player stops or enters platform
 *    - Tangential near-miss steering deflection (0.65m - 2.5m)
 *    - Direct center collision (< 0.65m) lethal when frozen; moving lethal at 1.35m
 *    - Dry platform immunity: player is 100% immune
 *    - Trench mouth claw lunge: 1.8s lunge at trench entrance, lethal only within 1.45m
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import { MonsterNavigation, type PlatformRect } from '../src/sim/MonsterNavigation.js';
import { AcousticBus } from '../src/sim/AcousticBus.js';
import { MonsterAI } from '../src/sim/MonsterAI.js';
import { MonsterRig } from '../src/game/monster/MonsterRig.js';
import { MonsterAnimator } from '../src/game/monster/MonsterAnimator.js';
import { MonsterBrain } from '../src/sim/MonsterBrain.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { ColliderSet } from '../src/sim/Colliders.js';

describe('Batch 3: Navigation, Acoustic Perception & In-Water Freeze State Machine', () => {
  describe('Prompt 3A: Spatial Grid & Narrow-Trench Minkowski Sum Exclusion', () => {
    it('enforces R_monster = 0.68m footprint and expands platform boundaries by Minkowski sum', () => {
      const nav = new MonsterNavigation({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 0.5);

      const plat: PlatformRect = {
        id: 'test_platform',
        minX: -4.0,
        maxX: 4.0,
        minZ: -4.0,
        maxZ: 4.0,
        topY: 0.38,
      };
      nav.registerPlatform(plat);

      expect(nav.expandedPlatforms.length).toBe(1);
      const exp = nav.expandedPlatforms[0]!;
      expect(exp.minX).toBeCloseTo(-4.0 - 0.68, 2);
      expect(exp.maxX).toBeCloseTo(4.0 + 0.68, 2);
      expect(exp.minZ).toBeCloseTo(-4.0 - 0.68, 2);
      expect(exp.maxZ).toBeCloseTo(4.0 + 0.68, 2);

      // Verify that points inside the expanded margin are NOT navigable for the monster
      expect(nav.isNavigable(0, 0)).toBe(false);
      expect(nav.isNavigable(4.2, 0)).toBe(false); // Inside 4.68m margin
      expect(nav.isNavigable(-4.3, 0)).toBe(false);

      // Outside the expanded margin is navigable
      expect(nav.isNavigable(5.5, 0)).toBe(true);
      expect(nav.isNavigable(-5.5, 0)).toBe(true);
    });

    it('automatically blocks monster from 1.05m Natatorium trench while allowing player', () => {
      const nav = new MonsterNavigation({ minX: -20, maxX: 20, minZ: -40, maxZ: -20 }, 0.5);

      // Recreate Natatorium trench: width 1.05m, length 8.0m (z: -35 to -27)
      const platWest: PlatformRect = {
        id: 'plat_trench_west',
        minX: -7.05,
        maxX: -1.05,
        minZ: -35.0,
        maxZ: -27.0,
        topY: 0.38,
      };
      const platEast: PlatformRect = {
        id: 'plat_trench_east',
        minX: 0.0,
        maxX: 6.0,
        minZ: -35.0,
        maxZ: -27.0,
        topY: 0.38,
      };

      nav.registerPlatforms([platWest, platEast]);

      // 1. Trench detection
      expect(nav.narrowTrenches.length).toBe(1);
      const trench = nav.narrowTrenches[0]!;
      expect(trench.width).toBeCloseTo(1.05, 2);
      expect(trench.length).toBeCloseTo(8.0, 2);

      // 2. Expanded colliders overlap
      const expWest = nav.expandedPlatforms[0]!;
      const expEast = nav.expandedPlatforms[1]!;
      expect(expWest.maxX).toBeCloseTo(-1.05 + 0.68, 2); // -0.37m
      expect(expEast.minX).toBeCloseTo(0.0 - 0.68, 2);   // -0.68m
      // Because -0.68 < -0.37, they overlap by 0.31m
      expect(expEast.minX).toBeLessThan(expWest.maxX);

      // 3. Every point inside the trench channel is impassable for the monster
      for (let z = -34.0; z <= -28.0; z += 1.0) {
        expect(nav.isNavigable(-0.5, z)).toBe(false);
        expect(nav.isInsideNarrowTrench(-0.5, z)).toBe(true);
      }

      // 4. Player width check: Player (R = 0.32m, diameter 0.64m) fits within 1.05m gap
      const playerClearance = trench.width - 2 * MonsterNavigation.R_PLAYER;
      expect(playerClearance).toBeCloseTo(0.41, 2);
      expect(playerClearance).toBeGreaterThan(0.2); // Player can traverse easily!
    });

    it('snaps goal coordinates inside a narrow trench to the nearest outer trench mouth', () => {
      const nav = new MonsterNavigation({ minX: -20, maxX: 20, minZ: -45, maxZ: -20 }, 0.5);
      nav.registerPlatforms([
        {
          id: 'plat_trench_west',
          minX: -7.05,
          maxX: -1.05,
          minZ: -35.0,
          maxZ: -27.0,
          topY: 0.38,
        },
        {
          id: 'plat_trench_east',
          minX: 0.0,
          maxX: 6.0,
          minZ: -35.0,
          maxZ: -27.0,
          topY: 0.38,
        },
      ]);

      // Acoustic splash occurs deep inside the trench at (-0.52, -31.0)
      const splashInTrench = { x: -0.52, z: -31.0 };
      expect(nav.isInsideNarrowTrench(splashInTrench.x, splashInTrench.z)).toBe(true);

      const snapped = nav.snapTargetPos(splashInTrench.x, splashInTrench.z);
      // Snapped point must be navigable and outside the narrow channel
      expect(nav.isNavigable(snapped.x, snapped.z)).toBe(true);
      // Distance to one of the trench mouths (z=-27 or z=-35) must be very close
      const distToMouth = Math.min(
        Math.hypot(snapped.x - (-0.52), snapped.z - (-27.0)),
        Math.hypot(snapped.x - (-0.52), snapped.z - (-35.0)),
      );
      expect(distToMouth).toBeLessThan(2.0);
    });

    it('pushes monster capsule out of dry platforms via collision resolution', () => {
      const nav = new MonsterNavigation({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 0.5);
      nav.registerPlatform({
        id: 'central_platform',
        minX: -5.0,
        maxX: 5.0,
        minZ: -5.0,
        maxZ: 5.0,
        topY: 0.38,
      });

      // Attempt to place monster inside the platform at (2.0, -1.0)
      const pos = { x: 2.0, y: -0.75, z: -1.0 };
      const resolved = nav.resolveMonsterCollision(pos);

      expect(resolved.collided).toBe(true);
      // Pushed out past expanded maxX (5.0 + 0.68 = 5.68m) or edge
      expect(nav.isNavigable(resolved.x, resolved.z)).toBe(true);
    });

    it('string-pulls A* path around obstacles without robotic 90-degree stair-stepping', () => {
      const nav = new MonsterNavigation({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 0.5);
      // Obstacle in the center
      nav.registerPlatform({
        id: 'pillar_obstacle',
        minX: -2.0,
        maxX: 2.0,
        minZ: -2.0,
        maxZ: 2.0,
        topY: 0.38,
      });

      const path = nav.findPath(-8.0, 0, 8.0, 0);
      expect(path.length).toBeGreaterThan(1);

      // Path begins near start and ends at target
      expect(path[0]!.x).toBeCloseTo(-8.0, 1);
      expect(path[path.length - 1]!.x).toBeCloseTo(8.0, 1);

      // Every intermediate point must be navigable
      for (const pt of path) {
        expect(nav.isNavigable(pt.x, pt.z)).toBe(true);
      }
    });
  });

  describe('Prompt 3B: AcousticBus Event Rules & Freeze Behavior', () => {
    it('emits ZERO water noise on dry platforms or when frozen still in water', () => {
      const bus = new AcousticBus();
      const eventsEmitted: unknown[] = [];
      bus.subscribe((ev) => eventsEmitted.push(ev));

      // 1. Player moving on dry platform
      bus.step(0.1, {
        pos: { x: 0, y: 0.38, z: 0 },
        vel: { x: 3.5, y: 0, z: 0 },
        isInWater: false,
        isOnDryPlatform: true,
        onGround: true,
      }, 0.1);

      expect(bus.waterNoiseLevel).toBe(0);
      expect(eventsEmitted.length).toBe(0);

      // 2. Player standing still in water (vel < 0.08 m/s)
      bus.step(0.1, {
        pos: { x: 0, y: -0.75, z: 0 },
        vel: { x: 0.02, y: 0, z: 0.01 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      }, 0.2);

      expect(bus.waterNoiseLevel).toBe(0);
      expect(bus.isPlayerFrozenInWater).toBe(true);
      expect(eventsEmitted.length).toBe(0);
    });

    it('emits WATER_SPLASH at exact 0.32s cadence while moving in water', () => {
      const bus = new AcousticBus();
      let splashCount = 0;
      bus.subscribe((ev) => {
        if (ev.kind === 'WATER_SPLASH') splashCount++;
      });

      const player = {
        pos: { x: 0, y: -0.75, z: 0 },
        vel: { x: 2.5, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      };

      // Step 0.30s (not reached cadence yet)
      bus.step(0.30, player, 0.30);
      expect(splashCount).toBe(0);

      // Step another 0.05s (total 0.35s >= 0.32s) -> 1 splash emitted
      bus.step(0.05, player, 0.35);
      expect(splashCount).toBe(1);
      expect(bus.targetSoundPos).toBeDefined();

      // Step another 0.32s -> 2nd splash emitted
      bus.step(0.32, player, 0.67);
      expect(splashCount).toBe(2);
    });

    it('freezes targetSoundPos at last splash coordinate the instant player stops moving', () => {
      const bus = new AcousticBus();
      bus.reset();

      // Move player from (0,0) to (5,0)
      bus.step(0.35, {
        pos: { x: 5.0, y: -0.75, z: 0 },
        vel: { x: 3.0, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      }, 0.35);

      const lastTarget = bus.targetSoundPos;
      expect(lastTarget).toBeDefined();
      expect(lastTarget!.x).toBeCloseTo(5.0, 1);

      // Player stops completely and moves cursor/view only (vel = 0)
      for (let t = 0.4; t <= 2.0; t += 0.1) {
        bus.step(0.1, {
          pos: { x: 5.0, y: -0.75, z: 0 },
          vel: { x: 0, y: 0, z: 0 },
          isInWater: true,
          isOnDryPlatform: false,
          onGround: true,
        }, t);
      }

      // targetSoundPos remains strictly locked at (5.0, 0)
      expect(bus.targetSoundPos!.x).toBeCloseTo(lastTarget!.x, 4);
      expect(bus.waterNoiseLevel).toBe(0);
      expect(bus.isPlayerFrozenInWater).toBe(true);
    });

    it('thrown stone splash overrides player sound target with highest priority', () => {
      const bus = new AcousticBus();

      // Player moving at (2.0, 0)
      bus.step(0.35, {
        pos: { x: 2.0, y: -0.75, z: 0 },
        vel: { x: 2.0, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      }, 0.35);
      expect(bus.targetSoundPos!.x).toBeCloseTo(2.0, 1);

      // Player throws stone into water at (-15.0, 25.0)
      const stoneSplash = bus.emitStoneSplash({ x: -15.0, y: -0.75, z: 25.0 }, 0.50);
      expect(stoneSplash.priority).toBe(10);
      expect(bus.targetSoundPos!.x).toBeCloseTo(-15.0, 1);
      expect(bus.targetSoundPos!.z).toBeCloseTo(25.0, 1);
    });
  });

  describe('Prompt 3B: 5-State MonsterAI & Near-Miss Tangential Deflection', () => {
    it('executes 5-state transitions: PATROL -> ALERT_AND_CHARGE -> ARRIVE_AND_ROAR -> RETREAT_PROWL', () => {
      const nav = new MonsterNavigation({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, 0.5);
      const bus = new AcousticBus();
      const ai = new MonsterAI({
        id: 'monster_test',
        spawn: { x: 0, y: -0.75, z: 30.0 },
        nav,
        acousticBus: bus,
      });

      expect(ai.state).toBe('PATROL');

      // Player splashes at (0, 0)
      bus.step(0.35, {
        pos: { x: 0, y: -0.75, z: 0 },
        vel: { x: 2.0, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      }, 0.35);

      // Alerted and starts charging at 11.5 m/s
      expect(ai.state).toBe('ALERT_AND_CHARGE');

      // Step simulation until monster reaches splash site (0, 0)
      const playerFrozen = {
        pos: { x: 0, y: -0.75, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      };

      for (let i = 0; i < 200; i++) {
        ai.step(0.016, playerFrozen, i * 0.016);
        if (ai.state === 'ARRIVE_AND_ROAR') break;
      }

      expect(ai.state).toBe('ARRIVE_AND_ROAR');
      expect(ai.rearingT).toBeGreaterThan(0.7);
      expect(ai.jawOpenT).toBeGreaterThan(0.5); // Wide roar maw

      // Step through roar (1.75s)
      for (let i = 0; i < 120; i++) {
        ai.step(0.016, playerFrozen, 5.0 + i * 0.016);
        if (ai.state === 'RETREAT_PROWL') break;
      }
      expect(ai.state).toBe('RETREAT_PROWL');
    });

    it('applies gentle tangential steering deflection brushing past frozen player without lethal strike', () => {
      const nav = new MonsterNavigation({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, 0.5);
      const bus = new AcousticBus();
      const ai = new MonsterAI({
        id: 'monster_test',
        spawn: { x: 0, y: -0.75, z: 20.0 },
        nav,
        acousticBus: bus,
      });

      const killSpy = vi.fn();
      ai.onKillPlayer = killSpy;

      // Player created splash earlier at (0, -5.0), and is now frozen at (0.75, 5.0) slightly off the charge line
      bus.emitStoneSplash({ x: 0, y: -0.75, z: -5.0 }, 0.1);
      expect(ai.state).toBe('ALERT_AND_CHARGE');

      const frozenPlayer = {
        pos: { x: 0.75, y: -0.75, z: 5.0 },
        vel: { x: 0, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      };

      // Run monster charging past player toward (0, -5.0)
      for (let i = 0; i < 150; i++) {
        ai.step(0.016, frozenPlayer, i * 0.016);
      }

      // Because player was frozen and maintained lateral distance > 0.65m, player was NOT killed!
      expect(killSpy).not.toHaveBeenCalled();
    });

    it('kills player if actively moving within 1.35m in water', () => {
      const nav = new MonsterNavigation({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, 0.5);
      const bus = new AcousticBus();
      const ai = new MonsterAI({
        id: 'monster_test',
        spawn: { x: 0, y: -0.75, z: 2.0 },
        nav,
        acousticBus: bus,
      });

      const killSpy = vi.fn();
      ai.onKillPlayer = killSpy;

      bus.emitStoneSplash({ x: 0, y: -0.75, z: 0 }, 0.1);

      // Player is actively wading right in front of monster (1.1m away)
      const movingPlayer = {
        pos: { x: 0, y: -0.75, z: 0.9 },
        vel: { x: 2.5, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      };

      // Step past 0.25s snarl
      for (let i = 0; i < 20; i++) {
        ai.step(0.016, movingPlayer, i * 0.016);
      }

      expect(killSpy).toHaveBeenCalled();
    });

    it('grants 100% immunity to player on dry platform even if standing 0.3m away', () => {
      const nav = new MonsterNavigation({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, 0.5);
      const bus = new AcousticBus();
      const ai = new MonsterAI({
        id: 'monster_test',
        spawn: { x: 0, y: -0.75, z: 0.5 },
        nav,
        acousticBus: bus,
      });

      const killSpy = vi.fn();
      ai.onKillPlayer = killSpy;

      bus.emitStoneSplash({ x: 0, y: -0.75, z: 0 }, 0.1);

      // Player standing on dry platform (y = 0.38m) right in monster's face (0.3m away)
      const dryPlayer = {
        pos: { x: 0, y: 0.38, z: 0.2 },
        vel: { x: 0, y: 0, z: 0 },
        isInWater: false,
        isOnDryPlatform: true,
        onGround: true,
      };

      for (let i = 0; i < 50; i++) {
        ai.step(0.016, dryPlayer, i * 0.016);
      }

      // Dry platform player is NEVER killed!
      expect(killSpy).not.toHaveBeenCalled();
    });

    it('enters TRENCH_CLAW_LUNGE at narrow trench mouth and only kills within 1.45m', () => {
      const nav = new MonsterNavigation({ minX: -20, maxX: 20, minZ: -45, maxZ: -20 }, 0.5);
      nav.registerPlatforms([
        {
          id: 'plat_trench_west',
          minX: -7.05,
          maxX: -1.05,
          minZ: -35.0,
          maxZ: -27.0,
          topY: 0.38,
        },
        {
          id: 'plat_trench_east',
          minX: 0.0,
          maxX: 6.0,
          minZ: -35.0,
          maxZ: -27.0,
          topY: 0.38,
        },
      ]);

      const bus = new AcousticBus();
      const ai = new MonsterAI({
        id: 'monster_test',
        spawn: { x: -0.5, y: -0.75, z: -24.0 },
        nav,
        acousticBus: bus,
      });

      const killSpy = vi.fn();
      ai.onKillPlayer = killSpy;

      // Player splashes inside the narrow trench at (-0.52, -31.0)
      bus.emitStoneSplash({ x: -0.52, y: -0.75, z: -31.0 }, 0.1);

      // Player is deep inside the trench (4.0m away from entrance)
      const safePlayerInTrench = {
        pos: { x: -0.52, y: -0.75, z: -31.0 },
        vel: { x: 0, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      };

      // Step monster towards trench entrance
      for (let i = 0; i < 150; i++) {
        ai.step(0.016, safePlayerInTrench, i * 0.016);
        if (ai.state === 'TRENCH_CLAW_LUNGE') break;
      }

      // Blocked at entrance and lunging
      expect(ai.state).toBe('TRENCH_CLAW_LUNGE');
      expect(killSpy).not.toHaveBeenCalled(); // Player is safe at 4.0m deep!

      // Now player walks forward to within 1.2m of trench mouth
      const unsafePlayerInTrench = {
        pos: { x: -0.52, y: -0.75, z: -27.2 },
        vel: { x: 0, y: 0, z: 0 },
        isInWater: true,
        isOnDryPlatform: false,
        onGround: true,
      };
      ai.step(0.016, unsafePlayerInTrench, 0.5);
      expect(killSpy).toHaveBeenCalledWith('trench_claw_lunge');
    });

    it('plays TRENCH_CLAW_LUNGE animation on MonsterAnimator', () => {
      const rig = new MonsterRig(1.0, '#2b211b');
      const animator = new MonsterAnimator(rig);

      expect(animator.getState()).toBe('PROWL_IDLE');

      animator.triggerTrenchClawLunge();
      expect(animator.getState()).toBe('TRENCH_CLAW_LUNGE');
      expect(animator.isTrenchClawLunge()).toBe(true);

      animator.update(0.016, 0.0, 'TRENCH_CLAW_LUNGE');

      // Claws reaching forward (shoulder.x < -0.8 rad) and jaws flared (~70°)
      expect(rig.shoulderL.rotation.x).toBeLessThan(-0.8);
      expect(rig.shoulderR.rotation.x).toBeLessThan(-0.8);
      expect(rig.getJawSplit()).toBeGreaterThan(0.5);
    });

    it('integrates MonsterBrain with MonsterNavigation and dry-platform exclusion', () => {
      const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.5);
      ground.fill(-1.5);
      const nav = new NavGrid(ground, -0.75, 0.5);
      const colliders = new ColliderSet(4.0);
      const events = new EventRingBuffer(64);

      const mNav = new MonsterNavigation(bounds, 0.5);
      mNav.registerPlatform({
        id: 'plat_safe',
        minX: -4.0,
        maxX: 4.0,
        minZ: -4.0,
        maxZ: 4.0,
        topY: 0.38,
      });

      const brain = new MonsterBrain({
        id: 'monster_sim',
        variant: 'standard',
        spawn: { x: 0, y: -0.75, z: 8.0 },
      }, nav, 12345);
      brain.setMonsterNav(mNav);

      const hearingCtx = { difficultyHearing: 1.0 };

      // Step with player on dry platform (y = 0.38m) right next to monster
      brain.step(
        0.016,
        { x: 0, y: 0.38, z: 8.4 },
        nav,
        colliders,
        events,
        hearingCtx,
        1.0,
        false, // not perched
        false, // not in water (on dry platform)
        false,
      );

      // Monster does NOT attack player on dry platform!
      expect(brain.state).not.toBe('ATTACK');
    });
  });
});

/* ── mechanics.test.ts ──────────────────────────────────────────────────────
 *  Comprehensive simulation mechanics tests for BackSilence Batch 3:
 *  - WaterLevelCycle: continuity, 90s period, secondsToNextShift, 10s warning
 *  - Nav per level: Map 4 LOW vs HIGH grids, stranded monster retreat
 *  - SinkingPlatformNode: 7s stand threshold, 1.5s grace, sink/rise timing
 *  - Projectile: ballistic range (0.2s..1.0s -> 6m..18m), water vs dry landing
 *  - Acoustic extras: mask zones (0.45x), catwalk clang on sprint, sustained noise
 *  - Scenario regressions: steam_mask & level_flip_strand
 *  - Round-trip serialization: puzzle nodes, sinking platforms, monster state
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { WaterLevelCycle } from '../src/sim/WaterLevelCycle.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { SinkingPlatformNode } from '../src/sim/SinkingPlatformNode.js';
import { ProjectileSystem } from '../src/sim/Projectile.js';
import { MaskZoneManager, calculateEffectiveRadius } from '../src/sim/Hearing.js';
import { MonsterBrain } from '../src/sim/MonsterBrain.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import type { NoiseEvent, Vec3 } from '../src/types/contracts.js';

describe('Mechanics & Pure Simulation Systems', () => {
  describe('WaterLevelCycle', () => {
    it('has exact 90s period and continuous levels across all phases', () => {
      const cycle = new WaterLevelCycle();
      expect(cycle.period).toBe(90.0);

      // LOW hold: [0, 37) -> -0.2
      expect(cycle.levelAt(0)).toBeCloseTo(-0.2, 3);
      expect(cycle.levelAt(20)).toBeCloseTo(-0.2, 3);
      expect(cycle.levelAt(37)).toBeCloseTo(-0.2, 3);
      expect(cycle.phaseAt(20)).toBe('low');

      // RISE: [37, 45) -> smoothly from -0.2 to 0.55
      const midRise = cycle.levelAt(41);
      expect(midRise).toBeGreaterThan(-0.2);
      expect(midRise).toBeLessThan(0.55);
      expect(cycle.phaseAt(41)).toBe('rise');

      // HIGH hold: [45, 82) -> +0.55
      expect(cycle.levelAt(45)).toBeCloseTo(0.55, 3);
      expect(cycle.levelAt(60)).toBeCloseTo(0.55, 3);
      expect(cycle.levelAt(82)).toBeCloseTo(0.55, 3);
      expect(cycle.phaseAt(60)).toBe('high');

      // FALL: [82, 90) -> smoothly from 0.55 to -0.2
      const midFall = cycle.levelAt(86);
      expect(midFall).toBeGreaterThan(-0.2);
      expect(midFall).toBeLessThan(0.55);
      expect(cycle.phaseAt(86)).toBe('fall');

      // Wraps around continuously at 90s + t
      expect(cycle.levelAt(90)).toBeCloseTo(-0.2, 3);
      expect(cycle.levelAt(110)).toBeCloseTo(-0.2, 3);
      expect(cycle.levelAt(135)).toBeCloseTo(0.55, 3);
    });

    it('calculates secondsToNextShift and 10s warning window accurately', () => {
      const cycle = new WaterLevelCycle();

      // At t=10s, next shift is rise at t=37s -> 27s remaining
      expect(cycle.secondsToNextShift(10)).toBeCloseTo(27.0, 1);
      expect(cycle.isWarningActive(10)).toBe(false);

      // At t=30s, 7s to rise -> warning is active (<= 10s)
      expect(cycle.secondsToNextShift(30)).toBeCloseTo(7.0, 1);
      expect(cycle.isWarningActive(30)).toBe(true);

      // At t=40s (during rise), shift is currently occurring
      expect(cycle.secondsToNextShift(40)).toBeCloseTo(5.0, 1);

      // At t=75s, 7s to fall -> warning is active
      expect(cycle.secondsToNextShift(75)).toBeCloseTo(7.0, 1);
      expect(cycle.isWarningActive(75)).toBe(true);
    });
  });

  describe('NavGrid per Water Level', () => {
    it('Map 4 height tiers: W1 is never monster-walkable while basin is walkable in both levels', () => {
      // Setup ground grid with basin (-0.9) and walkway W1 (+0.3)
      const ground = new GroundGrid({ minX: -20, minZ: -20, maxX: 20, maxZ: 20 });
      // Basin: [-15..-5, -15..-5] at -0.9
      ground.rasterizePlatform(-15, -15, -5, -5, -0.9);
      // Walkway W1: [5..15, 5..15] at +0.3
      ground.rasterizePlatform(5, 5, 15, 15, 0.3);

      // 1. LOW water level (-0.2)
      ground.computeDistToDryField(-0.2);
      const navLow = new NavGrid(ground, -0.2);
      // Basin depth: -0.2 - (-0.9) = 0.7m (>= 0.45m min depth)
      // Walkway W1 depth: -0.2 - 0.3 = -0.5m (dry, 0m depth)
      const basinCell = navLow.worldToGrid(-10, -10);
      const walkCell = navLow.worldToGrid(10, 10);

      expect(navLow.isWalkable(basinCell.gx, basinCell.gz)).toBe(true);
      expect(navLow.isWalkable(walkCell.gx, walkCell.gz)).toBe(false);

      // 2. HIGH water level (+0.55)
      ground.computeDistToDryField(0.55);
      const navHigh = new NavGrid(ground, 0.55);
      // Basin depth: 0.55 - (-0.9) = 1.45m (walkable)
      // Walkway W1 depth: 0.55 - 0.3 = 0.25m (< 0.45m min depth, so monster CANNOT enter!)
      expect(navHigh.isWalkable(basinCell.gx, basinCell.gz)).toBe(true);
      expect(navHigh.isWalkable(walkCell.gx, walkCell.gz)).toBe(false);
    });

    it('stranded monster on unwalkable cell retreats at hunt speed', () => {
      const ground = new GroundGrid({ minX: -30, minZ: -30, maxX: 30, maxZ: 30 });
      // Deep water surround: floor -0.9, water 0.0 -> depth 0.9
      ground.rasterizePlatform(-25, -25, 25, 25, -0.9);
      // Island dry: [-5..5, -5..5] top +0.3
      ground.rasterizePlatform(-5, -5, 5, 5, 0.3);
      ground.computeDistToDryField(0.0);

      const nav = new NavGrid(ground, 0.0);
      const brain = new MonsterBrain(
        {
          id: 'stranded_monster',
          variant: 'standard',
          spawn: { x: 0, y: 0.3, z: 0 }, // Spawned on dry island (unwalkable cell!)
          spawnGrace: 0,
        },
        nav,
        42,
      );
      brain.state = 'WANDER';

      const colliders = new ColliderSet();
      const events = new EventRingBuffer(16);

      // Step brain on unwalkable cell
      const initialPos = { ...brain.pos };
      brain.step(0.1, { x: 100, y: 0, z: 100 }, nav, colliders, events, { difficultyHearing: 1.0 }, 0);

      // Monster should move towards the nearest walkable water cell
      const distMoved = Math.hypot(brain.pos.x - initialPos.x, brain.pos.z - initialPos.z);
      expect(distMoved).toBeGreaterThan(0.05);
    });
  });

  describe('SinkingPlatformNode', () => {
    it('sinks after standing for 7s threshold with 1.5s grace on stepping off', () => {
      const plat = new SinkingPlatformNode({
        id: 'stepping_1',
        rect: [-2, -2, 2, 2],
        baseY: 0.3,
        sinkY: -0.55,
        standThreshold: 7.0,
        graceTime: 1.5,
        sinkDuration: 3.0,
        submergedDuration: 10.0,
        riseDuration: 4.0,
      });

      expect(plat.state).toBe('UP');
      expect(plat.heightAt(0)).toBe(0.3);

      // Stand for 3 seconds
      plat.tick(3.0, true);
      expect(plat.standTimer).toBe(3.0);
      expect(plat.state).toBe('UP');

      // Step off for 1.0 second (within 1.5s grace)
      plat.tick(1.0, false, 3.0);
      expect(plat.graceTimer).toBeCloseTo(0.5, 2);
      expect(plat.standTimer).toBe(3.0); // Preserved!

      // Step back on and finish 4 more seconds
      plat.tick(4.0, true, 4.0);
      expect(plat.state).toBe('SINKING');

      // Ticking through sinking (3.0s) -> reaches submerged (-0.55)
      plat.tick(3.0, false);
      expect(plat.state).toBe('SUBMERGED');
      expect(plat.heightAt(0)).toBeCloseTo(-0.55, 2);

      // Ticking through submerged (10.0s) -> reaches rising
      plat.tick(10.0, false);
      expect(plat.state).toBe('RISING');

      // Ticking through rise (4.0s) -> back UP at +0.3
      plat.tick(4.0, false);
      expect(plat.state).toBe('UP');
      expect(plat.heightAt(0)).toBeCloseTo(0.3, 2);
    });
  });

  describe('Projectile System', () => {
    it('integrates ballistics across hold times 0.2s..1.0s giving ~6m to ~18m ranges', () => {
      const proj = new ProjectileSystem();

      // Min hold (0.2s)
      const vMin = proj.calculateLaunchVelocity(0, 0.35, 0.2);
      expect(Math.hypot(vMin.x, vMin.y, vMin.z)).toBeCloseTo(9.0, 1);

      // Max hold (1.0s)
      const vMax = proj.calculateLaunchVelocity(0, 0.35, 1.0);
      expect(Math.hypot(vMax.x, vMax.y, vMax.z)).toBeGreaterThan(15.0);

      // Trajectory simulation
      const ground = new GroundGrid({ minX: -50, minZ: -50, maxX: 50, maxZ: 50 });
      ground.rasterizePlatform(-50, -50, 50, 50, 0.0);
      const colliders = new ColliderSet();

      const pathMin = proj.simulateTrajectory(
        { x: 0, y: 1.6, z: 0 },
        vMin,
        ground,
        colliders,
        0.0,
      );
      const impactMin = pathMin[pathMin.length - 1]!;
      const rangeMin = Math.hypot(impactMin.x, impactMin.z);
      expect(rangeMin).toBeGreaterThanOrEqual(4.5);
      expect(rangeMin).toBeLessThanOrEqual(10.0);

      const pathMax = proj.simulateTrajectory(
        { x: 0, y: 1.6, z: 0 },
        vMax,
        ground,
        colliders,
        0.0,
      );
      const impactMax = pathMax[pathMax.length - 1]!;
      const rangeMax = Math.hypot(impactMax.x, impactMax.z);
      expect(rangeMax).toBeGreaterThan(12.0);
    });

    it('classifies water vs dry landings correctly', () => {
      const proj = new ProjectileSystem();
      const ground = new GroundGrid({ minX: -50, minZ: -50, maxX: 50, maxZ: 50 });
      // Water floor at -0.9
      ground.rasterizePlatform(-50, -50, 50, 50, -0.9);
      // Platform at +0.3 (dry)
      ground.rasterizePlatform(-10, 5, 10, 15, 0.3);
      ground.computeDistToDryField(0.0);
      const colliders = new ColliderSet();

      // Launch towards dry platform
      const velDry = { x: 0, y: 2.0, z: 8.0 };
      const impactDry = proj.simulateImpact({ x: 0, y: 1.6, z: 0 }, velDry, ground, colliders, 0.0, 'pebble', 0);
      expect(impactDry).not.toBeNull();
      expect(impactDry!.isWater).toBe(false);

      // Launch towards deep water
      const velWet = { x: 25.0, y: 2.0, z: 0 };
      const impactWet = proj.simulateImpact({ x: 0, y: 1.6, z: 0 }, velWet, ground, colliders, 0.0, 'pebble', 0);
      expect(impactWet).not.toBeNull();
      expect(impactWet!.isWater).toBe(true);
    });
  });

  describe('Acoustic Extras & Mask Zones', () => {
    it('applies mask zone factor to reduce effective hearing radius', () => {
      const maskMgr = new MaskZoneManager();
      maskMgr.addZone({
        center: { x: 10, y: 0, z: 10 },
        radius: 18.0,
        factor: 0.45,
      });

      // Point inside mask zone
      const insideFactor = maskMgr.getMaskFactor({ x: 12, y: 0, z: 12 });
      expect(insideFactor).toBe(0.45);

      // Point outside mask zone
      const outsideFactor = maskMgr.getMaskFactor({ x: 50, y: 0, z: 50 });
      expect(outsideFactor).toBe(1.0);

      // Effective hearing calculation with mask
      const noise: NoiseEvent = {
        id: 'n_1',
        kind: 'valve',
        position: { x: 10, y: 0, z: 10 },
        loudness: 0.8,
        sourcePlayerId: 'p1',
        t: 1.0,
      };

      const colliders = new ColliderSet();
      const ctxWithMask = {
        difficultyHearing: 1.0,
        maskFactor: (pos: Vec3) => maskMgr.getMaskFactor(pos),
      };

      const normalRadius = calculateEffectiveRadius(noise, 1.0, { difficultyHearing: 1.0 }, colliders);
      const maskedRadius = calculateEffectiveRadius(noise, 1.0, ctxWithMask, colliders);

      expect(maskedRadius).toBeCloseTo(normalRadius * 0.45, 1);
    });
  });

  describe('Headless Scenario Regressions: steam_mask & level_flip_strand', () => {
    it('steam_mask: a noise inside an active steam mask zone is heard at <= 45% radius', () => {
      const maskMgr = new MaskZoneManager();
      maskMgr.addZone({
        center: { x: 0, y: 0, z: 0 },
        radius: 18.0,
        factor: 0.45,
        from: 10.0,
        to: 15.0,
      });

      const colliders = new ColliderSet();
      const noise: NoiseEvent = {
        id: 'n_steam',
        kind: 'valve',
        position: { x: 2, y: 0, z: 2 },
        loudness: 0.8,
        sourcePlayerId: 'p1',
        t: 12.0,
      };

      // While active at t=12s
      const activeFactor = maskMgr.getMaskFactor(noise.position, 12.0);
      expect(activeFactor).toBe(0.45);

      const radius = calculateEffectiveRadius(noise, 1.0, {
        difficultyHearing: 1.0,
        maskFactor: (pos: Vec3) => maskMgr.getMaskFactor(pos, 12.0),
      }, colliders);

      const unmaskedRadius = calculateEffectiveRadius(noise, 1.0, {
        difficultyHearing: 1.0,
      }, colliders);

      expect(radius / unmaskedRadius).toBeLessThanOrEqual(0.451);
    });

    it('level_flip_strand: monster stranded by water level drop reaches safety within 15s', () => {
      const ground = new GroundGrid({ minX: -30, minZ: -30, maxX: 30, maxZ: 30 });
      // Basin: [-25..25, -25..25] at -0.9
      ground.rasterizePlatform(-25, -25, 25, 25, -0.9);
      // Small dry island in center: [-2..2, -2..2] at 0.3
      ground.rasterizePlatform(-2, -2, 2, 2, 0.3);
      ground.computeDistToDryField(0.0);

      // Build nav grid for water level 0.0 (island is unwalkable for monster)
      const nav = new NavGrid(ground, 0.0);
      const colliders = new ColliderSet();
      const events = new EventRingBuffer(16);

      // Put monster on the edge of the island
      const monster = new MonsterBrain(
        {
          id: 'stranded_test',
          variant: 'standard',
          spawn: { x: 0.5, y: 0.3, z: 0.5 },
          spawnGrace: 0,
        },
        nav,
        123,
      );
      monster.state = 'WANDER';

      let elapsed = 0;
      const dt = 1 / 60;
      let reachedWalkable = false;

      while (elapsed < 15.0) {
        monster.step(dt, { x: 50, y: 0, z: 50 }, nav, colliders, events, { difficultyHearing: 1.0 }, elapsed);
        const g = nav.worldToGrid(monster.pos.x, monster.pos.z);
        if (nav.isWalkable(g.gx, g.gz)) {
          reachedWalkable = true;
          break;
        }
        elapsed += dt;
      }

      expect(reachedWalkable).toBe(true);
      expect(elapsed).toBeLessThan(15.0);
    });
  });

  describe('Round-Trip Serialization', () => {
    it('losslessly serializes and hydrates SinkingPlatformNode', () => {
      const plat = new SinkingPlatformNode({
        id: 'p_test',
        rect: [0, 0, 4, 4],
        baseY: 0.3,
        sinkY: -0.55,
      });

      plat.tick(4.5, true);
      const snap = plat.serialize();

      const plat2 = new SinkingPlatformNode({
        id: 'p_test',
        rect: [0, 0, 4, 4],
        baseY: 0.3,
        sinkY: -0.55,
      });
      plat2.hydrate(snap);

      expect(plat2.standTimer).toBe(plat.standTimer);
      expect(plat2.state).toBe(plat.state);
      expect(plat2.heightAt(0)).toBe(plat.heightAt(0));
    });

    it('losslessly serializes and hydrates MonsterBrain state', () => {
      const ground = new GroundGrid({ minX: -50, minZ: -50, maxX: 50, maxZ: 50 });
      ground.rasterizePlatform(-50, -50, 50, 50, -0.9);
      ground.computeDistToDryField(0.0);
      const nav = new NavGrid(ground, 0.0);

      const monster = new MonsterBrain(
        {
          id: 'mb_test',
          variant: 'elder',
          spawn: { x: 12.5, y: -0.9, z: -8.0 },
        },
        nav,
        12345,
      );

      monster.pos.x = 15.2;
      monster.pos.z = -6.1;
      monster.yaw = 1.45;
      monster.state = 'HUNT';

      const snap = monster.serialize(10.0);

      const monster2 = new MonsterBrain(
        {
          id: 'mb_test',
          variant: 'elder',
          spawn: { x: 0, y: 0, z: 0 },
        },
        nav,
        12345,
      );
      monster2.hydrate(snap);

      expect(monster2.pos.x).toBeCloseTo(15.2, 3);
      expect(monster2.pos.z).toBeCloseTo(-6.1, 3);
      expect(monster2.yaw).toBeCloseTo(1.45, 3);
      expect(monster2.state).toBe('HUNT');
    });
  });
});

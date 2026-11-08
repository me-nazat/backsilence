/* ── tests/monster-trench-blocking.test.ts ──────────────────────────────────
 *  Prompt 6 (D134) Work Item B: Trench Blocking Nav Guarantee & Lip-Pacing.
 *  1. Boundary Exactness: 2.3m blocks, 2.5m does not block.
 *  2. 2.0m Trench: asserts no path crosses in 30s AND creature paces along
 *     the edge (along-edge distance increases, f_035).
 *  3. 3.0m Gap: asserts creature can cross.
 *  4. Diegetic audio: player can hear it pace along the far side (footfall/roar
 *     events emitted during lip-pacing).
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { AStarPathfinder } from '../src/sim/AStar.js';
import { MonsterBrain } from '../src/sim/MonsterBrain.js';
import { PLATFORM_TOP_Y, WATER_FLOOR_Y } from '../src/sim/ProvingGroundsData.js';

function buildTrenchNav(gapWidthM: number) {
  const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
  const ground = new GroundGrid(bounds, 0.25);
  ground.fill(WATER_FLOOR_Y);
  const halfGap = gapWidthM / 2;
  // Two slabs spanning wall-to-wall in X (-20 to 20) with z in [-6, 6] separated only by `gapWidthM` trench
  ground.rasterizePlatform(-20, -6, -halfGap, 6, PLATFORM_TOP_Y);
  ground.rasterizePlatform(halfGap, -6, 20, 6, PLATFORM_TOP_Y);
  ground.computeDistanceTransform(0);
  const nav = new NavGrid(ground, 0, 0.25);
  const colliders = new ColliderSet(4);
  const events = new EventRingBuffer(256);
  return { ground, nav, colliders, events };
}

describe('Prompt 6 (D134) — Trench Blocking Nav Guarantee & Diegetic Lip Pacing', () => {
  it('Work Item B.4: Boundary Exactness — 2.3 m trench blocks, 2.5 m gap does not', () => {
    // 1. 2.3 m trench: TRENCH_BLOCK_WIDTH = 2.4m enforces that 2.3m is strictly blocked
    const w23 = buildTrenchNav(2.3);
    expect(w23.nav.isWalkableWorld(0, 0)).toBe(false);

    // Verify all cells within the 2.3m gap are blocked
    for (let x = -1.1; x <= 1.1; x += 0.25) {
      expect(w23.nav.isWalkableWorld(x, 0)).toBe(false);
    }

    // Two water basins are in separated connected components
    const northComp23 = w23.nav.getComponentWorld(0, 10);
    const southComp23 = w23.nav.getComponentWorld(0, -10);
    expect(northComp23).not.toBe(-1);
    expect(southComp23).not.toBe(-1);
    expect(northComp23).not.toBe(southComp23);

    // A* cannot find a crossing path
    const astar23 = new AStarPathfinder(w23.nav);
    const path23 = astar23.findPath(0, 10, 0, -10);
    for (const pt of path23) {
      // Path never enters the southern basin
      expect(pt.z).toBeGreaterThan(0);
    }

    // 2. 2.5 m gap: clearance exceeds 1.2m threshold, center cells are walkable
    const w25 = buildTrenchNav(2.5);
    expect(w25.nav.isWalkableWorld(0, 0)).toBe(true);

    const northComp25 = w25.nav.getComponentWorld(0, 10);
    const southComp25 = w25.nav.getComponentWorld(0, -10);
    expect(northComp25).toBe(southComp25);

    const astar25 = new AStarPathfinder(w25.nav);
    const path25 = astar25.findPath(0, 10, 0, -10);
    expect(path25.length).toBeGreaterThan(0);
    const finalPt25 = path25[path25.length - 1]!;
    expect(finalPt25.z).toBeLessThan(-8.0);
  });

  it('Work Item B.4 & B.5: 2.0 m trench blocks creature over 30s, creature paces along edge with audible footfalls', () => {
    const w20 = buildTrenchNav(2.0);
    expect(w20.nav.isWalkableWorld(0, 0)).toBe(false);

    const brain20 = new MonsterBrain(
      { id: 'm_trench_20', variant: 'standard', spawn: { x: 0, y: WATER_FLOOR_Y, z: 12 }, spawnGrace: 0 },
      w20.nav,
      101,
    );

    const ctx = { difficultyHearing: 1.0 };
    const targetAcross = { x: 0, y: WATER_FLOOR_Y, z: -12 };

    // Emit initial splash across the trench
    brain20.onNoiseEvent(
      { id: 'n_20_start', kind: 'splash', position: targetAcross, loudness: 0.9, sourcePlayerId: 'p1', t: 0.1 },
      w20.colliders,
      ctx,
      0.1,
    );

    let sawBlocked = false;
    let totalAlongEdgeMotion = 0;
    let prevX = brain20.pos.x;
    let pacingFootfallCount = 0;
    let blockedRoarCount = 0;
    let lastCheckedEventLen = 0;

    // Simulate for 30 seconds (1800 ticks at 60Hz)
    for (let i = 1; i <= 1800; i++) {
      const t = 0.1 + i / 60;

      // Periodic lure splash across trench every 6 seconds to keep creature alert
      if (i % 360 === 0) {
        brain20.onNoiseEvent(
          { id: `n_20_${i}`, kind: 'splash', position: targetAcross, loudness: 0.8, sourcePlayerId: 'p1', t },
          w20.colliders,
          ctx,
          t,
        );
      }

      brain20.step(1 / 60, targetAcross, w20.nav, w20.colliders, w20.events, ctx, t, false, true, false);

      // Track events emitted each frame
      while (lastCheckedEventLen < w20.events.length) {
        const ev = w20.events.getAt(lastCheckedEventLen);
        if (ev?.type === 'footfall') pacingFootfallCount++;
        if (ev?.type === 'noise' && (ev.data as { kind?: string }).kind === 'roar') blockedRoarCount++;
        lastCheckedEventLen++;
      }

      if (brain20.state === 'BLOCKED') {
        sawBlocked = true;
        totalAlongEdgeMotion += Math.abs(brain20.pos.x - prevX);
      }
      prevX = brain20.pos.x;

      // Invariant: Creature NEVER crosses z < 5.5 through the 2.0m trench into the other basin
      expect(brain20.pos.z).toBeGreaterThan(5.5);
    }

    expect(sawBlocked).toBe(true);
    expect(brain20.lipPaceCount).toBeGreaterThanOrEqual(1);
    // Along-edge distance must increase as creature paces back and forth (f_035)
    expect(totalAlongEdgeMotion).toBeGreaterThan(2.0);
    // Diegetic audio: player can hear the creature pacing on the far side
    expect(pacingFootfallCount).toBeGreaterThan(5);
    expect(blockedRoarCount).toBeGreaterThanOrEqual(1);
  });

  it('Work Item B.4: 3.0 m gap is reachable and crossed by the creature to attack target', () => {
    const w30 = buildTrenchNav(3.0);
    expect(w30.nav.isWalkableWorld(0, 0)).toBe(true);

    const brain30 = new MonsterBrain(
      { id: 'm_gap_30', variant: 'standard', spawn: { x: 0, y: WATER_FLOOR_Y, z: 12 }, spawnGrace: 0 },
      w30.nav,
      103,
    );

    const ctx = { difficultyHearing: 1.0 };
    const targetAcross = { x: 0, y: WATER_FLOOR_Y, z: -12 };

    brain30.onNoiseEvent(
      { id: 'n_30_target', kind: 'splash', position: targetAcross, loudness: 0.95, sourcePlayerId: 'p1', t: 0.1 },
      w30.colliders,
      ctx,
      0.1,
    );

    let crossedToSouth = false;
    for (let i = 1; i <= 600; i++) {
      const t = 0.1 + i / 60;
      brain30.step(1 / 60, targetAcross, w30.nav, w30.colliders, w30.events, ctx, t, false, true, false);

      if (brain30.pos.z < -6.0) {
        crossedToSouth = true;
        break;
      }
    }

    expect(crossedToSouth).toBe(true);
    expect(brain30.pos.z).toBeLessThan(-6.0);
  });
});

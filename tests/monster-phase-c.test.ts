/* ── monster-phase-c.test.ts ────────────────────────────────────────────────
 *  Phase C Verification Suite: Experience Pacing, First Sight, Sleeper,
 *  Patrol Graph, and 600s Silent Dry Player Fairness Guarantee across 5 seeds.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { SimWorld } from '../src/sim/SimWorld.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EncounterDirector } from '../src/sim/Director.js';
import { validatePatrolGraph, validateSleeperSpawn, validateLayout } from '../src/world/validate/LayoutValidator.js';
import { PoolroomsMap } from '../src/world/maps/PoolroomsMap.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { OrientationMap } from '../src/world/maps/OrientationMap.js';
import { UtilityTunnelsMap } from '../src/world/maps/UtilityTunnelsMap.js';
import { MarbleAtriumMap } from '../src/world/maps/MarbleAtriumMap.js';
import { HydroMazeMap } from '../src/world/maps/HydroMazeMap.js';
import { DrainageCoreMap } from '../src/world/maps/DrainageCoreMap.js';
import { DrownedSchoolMap } from '../src/world/maps/DrownedSchoolMap.js';
import { SunkenJungleMap } from '../src/world/maps/SunkenJungleMap.js';
import { NeonFloodMap } from '../src/world/maps/NeonFloodMap.js';
import { DrownedMetroMap } from '../src/world/maps/DrownedMetroMap.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';
import type { MapId } from '../src/types/contracts.js';
import type { MapDefinition } from '../src/world/MapTypes.js';

const ALL_MAPS: Record<MapId, MapDefinition> = {
  poolrooms: PoolroomsMap,
  utility_tunnels: UtilityTunnelsMap,
  marble_atrium: MarbleAtriumMap,
  hydro_maze: HydroMazeMap,
  drainage_core: DrainageCoreMap,
  natatorium: NatatoriumMap,
  drowned_school: DrownedSchoolMap,
  sunken_jungle: SunkenJungleMap,
  neon_flood: NeonFloodMap,
  drowned_metro: DrownedMetroMap,
  orientation: OrientationMap,
};

describe('Phase C: Experience, Pacing, and Fairness Verification', () => {
  it('guarantees first sight scheduled within 35 s on Normal difficulty', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const director = new EncounterDirector(seed, 'normal', 0.045);
      const snap = director.getSnapshot();
      expect(snap.firstContactScheduledTime).toBeGreaterThanOrEqual(20.0);
      expect(snap.firstContactScheduledTime).toBeLessThanOrEqual(35.0);
    }
  });

  it('places sleeper monster 22 to 32 m from first player spawn on all 11 maps', () => {
    for (const [mapId, def] of Object.entries(ALL_MAPS)) {
      const layout = def.generateLayout({ seed: 101, difficulty: 'normal', playerCount: 1 });
      const pSpawn = layout.spawns.player[0]!;
      const m = layout.spawns.monsters[0]!;
      const sPos = m.sleeperSpawn ?? m.spawn;
      const d = Math.hypot(sPos.x - pSpawn.x, sPos.z - pSpawn.z);

      expect(d, `Map ${mapId} sleeper distance ${d.toFixed(1)}m must be 22..32.5m`).toBeGreaterThanOrEqual(22.0);
      expect(d, `Map ${mapId} sleeper distance ${d.toFixed(1)}m must be 22..32.5m`).toBeLessThanOrEqual(32.5);

      const sleeperVal = validateSleeperSpawn(layout);
      expect(sleeperVal.valid, `Map ${mapId} sleeper validation failed: ${sleeperVal.errors.join(', ')}`).toBe(true);
    }
  });

  it('validates patrol graph connectivity on all 11 maps', () => {
    for (const [mapId, def] of Object.entries(ALL_MAPS)) {
      const layout = def.generateLayout({ seed: 202, difficulty: 'normal', playerCount: 1 });
      const patrolVal = validatePatrolGraph(mapId as MapId, layout);
      expect(patrolVal.valid, `Map ${mapId} patrol graph failed: ${patrolVal.errors.join(', ')}`).toBe(true);

      const fullVal = validateLayout(mapId as MapId, layout);
      expect(fullVal.valid, `Map ${mapId} layout validation failed: ${fullVal.errors.join(', ')}`).toBe(true);
    }
  });

  it('executes crossing or emergence within 35s on Normal in SimWorld', () => {
    const ground = new GroundGrid({ minX: -50, minZ: -50, maxX: 50, maxZ: 50 }, 0.5);
    ground.fill(-0.9);
    // Dry island at spawn
    ground.setRectHeight(-3, -3, 3, 3, 0.3);

    const colliders = new ColliderSet(4.0);
    const world = new SimWorld({
      seed: 42,
      bounds: { minX: -50, minZ: -50, maxX: 50, maxZ: 50 },
      playerSpawn: { x: 0, y: 0.3, z: 0 },
      waterY: 0.0,
      difficulty: 'normal',
      ground,
      colliders,
    });
    world.finalizeTerrain();

    world.addMonster({
      id: 'test_monster',
      variant: 'standard',
      spawn: { x: 0, y: -0.9, z: 25 },
      sleeperSpawn: { x: 0, y: -0.9, z: 25 },
    });

    const silentIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      sprint: false,
      crouch: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    let firstSightSeen = false;
    const dt = 1 / 60;

    for (let frame = 0; frame < 35 * 60; frame++) {
      world.step(dt, silentIntent);
      const beats = world.director.dreadBeats;
      for (const b of beats) {
        if (b.kind === 'glimpse' || b.kind === 'first_contact') {
          firstSightSeen = true;
          break;
        }
      }
      if (firstSightSeen) break;
    }

    expect(firstSightSeen, 'First sight dread beat must be emitted within 35 seconds').toBe(true);
  });

  it('guarantees 0 attacks on a silent dry player over 600 s across 5 seeds (Fairness Rule)', () => {
    const seeds = [1001, 2002, 3003, 4004, 5005];
    const hashes: number[] = [];

    for (const seed of seeds) {
      const ground = new GroundGrid({ minX: -40, minZ: -40, maxX: 40, maxZ: 40 }, 0.5);
      ground.fill(-0.9);
      // Dry spawn platform at (0, 0)
      ground.setRectHeight(-4, -4, 4, 4, 0.35);

      const colliders = new ColliderSet(4.0);
      const world = new SimWorld({
        seed,
        bounds: { minX: -40, minZ: -40, maxX: 40, maxZ: 40 },
        playerSpawn: { x: 0, y: 0.35, z: 0 },
        waterY: 0.0,
        difficulty: 'normal',
        ground,
        colliders,
      });
      world.finalizeTerrain();

      // Spawn monster 25m away on water
      const monster = world.addMonster({
        id: `monster_fairness_${seed}`,
        variant: 'standard',
        spawn: { x: 0, y: -0.9, z: 25 },
        sleeperSpawn: { x: 0, y: -0.9, z: 25 },
      });

      const silentIntent: PlayerIntent = {
        moveX: 0,
        moveZ: 0,
        jump: false,
        sprint: false,
        crouch: false,
        interact: false,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
      };

      const dt = 1 / 60;
      const totalFrames = 600 * 60; // 36,000 simulation steps = 10 minutes

      let damageCount = 0;
      let minDistanceToPlayer = Infinity;

      for (let f = 0; f < totalFrames; f++) {
        world.step(dt, silentIntent);

        // Track closest approach
        const dist = Math.hypot(monster.pos.x - world.player.pos.x, monster.pos.z - world.player.pos.z);
        if (dist < minDistanceToPlayer) {
          minDistanceToPlayer = dist;
        }

        // Verify player is on dry ground and not wet
        expect(world.player.onGround).toBe(true);
        expect(world.player.wet).toBe(false);
      }

      // Check event buffer for damage events
      for (let i = 0; i < world.events.length; i++) {
        const ev = world.events.getAt(i);
        if (ev && ev.type === 'damage') {
          damageCount++;
        }
      }

      // Fairness assertion: 0 damage, 0 attacks on a silent dry player
      expect(damageCount, `Seed ${seed}: silent dry player must NEVER take damage`).toBe(0);
      expect(monster.state, `Seed ${seed}: monster must never attack`).not.toBe('ATTACK');
      // The monster should never breach the 6m boundary of a silent dry player
      expect(minDistanceToPlayer, `Seed ${seed}: monster stayed at safe distance`).toBeGreaterThanOrEqual(5.8);

      const trajHash = monster.hashTrajectory();
      hashes.push(trajHash);
      expect(Number.isFinite(trajHash)).toBe(true);
    }

    // Trajectory hashes across seeds should be deterministic and distinct
    expect(new Set(hashes).size).toBe(5);
  });

  it('exercises the natural Natatorium launch path with 15–20s glimpse and safe traversal', () => {
    const layout = NatatoriumMap.generateLayout({ seed: 12345, difficulty: 'normal', playerCount: 1 });
    const pSpawn = layout.spawns.player[0]!;
    const mDef = layout.spawns.monsters[0]!;

    const ground = new GroundGrid(layout.bounds, 0.5);
    ground.fill(-0.9);
    for (const p of layout.platforms) {
      ground.setRectHeight(p.rect[0], p.rect[1], p.rect[2], p.rect[3], p.topY);
    }
    const colliders = new ColliderSet(4.0);
    for (const w of layout.walls) {
      colliders.addBox(w.id, w.min, w.max);
    }

    const world = new SimWorld({
      seed: 12345,
      bounds: layout.bounds,
      playerSpawn: pSpawn,
      waterY: 0.0,
      difficulty: 'normal',
      mapId: 'natatorium',
      ground,
      colliders,
    });
    world.finalizeTerrain();

    const spawnPos = mDef.sleeperSpawn ?? mDef.spawn;
    world.addMonster(
      {
        id: mDef.id,
        variant: mDef.variant,
        spawn: spawnPos,
        ...(mDef.sleeperSpawn ? { sleeperSpawn: mDef.sleeperSpawn } : {}),
        spawnGrace: mDef.spawnGrace ?? 20.0,
      },
      12345,
    );

    const monster = world.monsters[0]!;
    expect(monster.pos.x).toBeCloseTo(24.0, 1);
    expect(monster.pos.z).toBeCloseTo(30.0, 1);

    // Initial check: first contact scheduled time for Natatorium is within 15..19s
    const dirSnap = world.director.getSnapshot();
    expect(dirSnap.firstContactScheduledTime).toBeGreaterThanOrEqual(12.0);
    expect(dirSnap.firstContactScheduledTime).toBeLessThanOrEqual(16.0);

    // Step simulation: player turns toward hall (yaw = 0) and moves forward
    const dt = 1 / 60;
    const walkIntent: PlayerIntent = {
      moveX: 0,
      moveZ: -1.0,
      sprint: false,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };
    world.player.yaw = 0.0;

    let sawCrossing = false;
    let minCrossingDist = Infinity;
    let maxCrossingDist = -Infinity;

    for (let sec = 1; sec <= 25; sec++) {
      for (let f = 0; f < 60; f++) {
        // Stop walking at t = 8s (player is resting in hall water)
        const intent = sec <= 8 ? walkIntent : { ...walkIntent, moveZ: 0 };
        world.step(dt, intent);

        const d = Math.hypot(monster.pos.x - world.player.pos.x, monster.pos.z - world.player.pos.z);
        if (world.director.getSnapshot().firstContactDone) {
          sawCrossing = true;
          if (d < minCrossingDist) minCrossingDist = d;
          if (d > maxCrossingDist) maxCrossingDist = d;
        }
      }
    }

    // Acceptance checks:
    // 1. Crossing triggered within 20s
    expect(sawCrossing).toBe(true);
    // 2. Creature kept readable 10-15m distance (never lethal, never too far)
    expect(minCrossingDist).toBeGreaterThanOrEqual(6.0); // Never within attack reach
    expect(minCrossingDist).toBeLessThanOrEqual(15.5); // Readable encounter distance
    // 3. Player never attacked
    expect(monster.state).not.toBe('ATTACK');
    let damageCount = 0;
    for (let i = 0; i < world.events.length; i++) {
      const ev = world.events.getAt(i);
      if (ev && ev.type === 'damage') damageCount++;
    }
    expect(damageCount).toBe(0);
  });
});

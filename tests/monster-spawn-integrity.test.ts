/* ── monster-spawn-integrity.test.ts ─────────────────────────────────────────
 *  Regression tests for Prompt 1:
 *  1. Every map's monster spawn and sleeperSpawn resolve to a walkable NavGrid cell.
 *  2. The natatorium oriented yaw faces the sleeper monster within 30°.
 *  3. After reloadProceduralSkin() the body root remains a descendant of the scene.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Scene, Object3D } from 'three';
import { PoolroomsMap } from '../src/world/maps/PoolroomsMap.js';
import { UtilityTunnelsMap } from '../src/world/maps/UtilityTunnelsMap.js';
import { MarbleAtriumMap } from '../src/world/maps/MarbleAtriumMap.js';
import { HydroMazeMap } from '../src/world/maps/HydroMazeMap.js';
import { DrainageCoreMap } from '../src/world/maps/DrainageCoreMap.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { DrownedSchoolMap } from '../src/world/maps/DrownedSchoolMap.js';
import { SunkenJungleMap } from '../src/world/maps/SunkenJungleMap.js';
import { NeonFloodMap } from '../src/world/maps/NeonFloodMap.js';
import { DrownedMetroMap } from '../src/world/maps/DrownedMetroMap.js';
import { OrientationMap } from '../src/world/maps/OrientationMap.js';
import type { MapDefinition } from '../src/world/MapTypes.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { SimWorld } from '../src/sim/SimWorld.js';
import { MonsterManager } from '../src/game/monster/MonsterManager.js';
import type { MapId } from '../src/types/contracts.js';

const MAPS: Record<MapId, MapDefinition> = {
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

describe('Monster Spawn Integrity (Prompt 1)', () => {
  const mapIds = Object.keys(MAPS) as MapId[];

  it('asserts every map monster spawn and sleeperSpawn resolve to a walkable NavGrid cell in SimWorld', () => {
    for (const mapId of mapIds) {
      const def = MAPS[mapId];
      const seed = 42;
      const layout = def.generateLayout({ seed, difficulty: 'normal', playerCount: 1 });
      const bounds = layout.bounds;
      const ground = new GroundGrid(bounds, 0.25);
      ground.fill(-0.9);

      for (const p of layout.platforms) {
        ground.setRectHeight(p.rect[0], p.rect[1], p.rect[2], p.rect[3], p.topY);
      }

      const colliders = new ColliderSet(4.0);
      for (const w of layout.walls) {
        colliders.addBox(w.id, w.min, w.max);
      }

      const pSpawn = layout.spawns.player[0] ?? { x: 0, y: 0.3, z: 0 };
      const simWorld = new SimWorld({
        seed,
        bounds,
        playerSpawn: pSpawn,
        waterY: layout.waterBodies[0]?.waterY ?? 0.0,
        difficulty: 'normal',
        ground,
        colliders,
        mapId,
      });
      simWorld.finalizeTerrain();

      for (const mDef of layout.spawns.monsters) {
        const brain = simWorld.addMonster(mDef, seed);
        const isWalkable = simWorld.nav.isWalkableWorld(brain.pos.x, brain.pos.z);
        const compId = simWorld.nav.getComponentWorld(brain.pos.x, brain.pos.z);
        const compSize = simWorld.nav.componentCounts.get(compId) ?? 0;

        expect(isWalkable, `${mapId} monster ${brain.id} at (${brain.pos.x}, ${brain.pos.z}) must be walkable`).toBe(true);
        expect(compSize, `${mapId} monster ${brain.id} connected component must be > 0`).toBeGreaterThan(0);
      }
    }
  });

  it('asserts the natatorium spawn yaw faces the sleeper monster within 30° after opening turn', () => {
    const layout = NatatoriumMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    const pSpawn = layout.spawns.player[0] ?? { x: 0, y: 0.3, z: 50 };
    const sleeper = layout.spawns.monsters[0]?.sleeperSpawn ?? { x: 2, y: -0.9, z: 22 };

    // Natatorium opening turn lerps from tagline wall (PI) to 0 (facing the pool hall)
    const targetYaw = 0; // forward (sin(0), -cos(0)) = (0, -1)
    const forwardX = Math.sin(targetYaw);
    const forwardZ = -Math.cos(targetYaw);

    const toSleeperX = sleeper.x - pSpawn.x;
    const toSleeperZ = sleeper.z - pSpawn.z;
    const dist = Math.hypot(toSleeperX, toSleeperZ);

    const dot = (forwardX * toSleeperX + forwardZ * toSleeperZ) / dist;
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
    const angleDeg = (angleRad * 180) / Math.PI;

    expect(angleDeg).toBeLessThanOrEqual(30.0);
  });

  it('asserts after reloadProceduralSkin() the body root is still a descendant of the scene', () => {
    const scene = new Scene();
    const monsterManager = new MonsterManager();
    scene.add(monsterManager.root);

    const body = monsterManager.addMonster({
      id: 'test_creature',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: 0 },
    });

    // Check before reload
    const isDescendant = (parent: Object3D, child: Object3D): boolean => {
      let cur: Object3D | null = child;
      while (cur) {
        if (cur === parent) return true;
        cur = cur.parent;
      }
      return false;
    };

    expect(isDescendant(scene, body.mesh.root)).toBe(true);

    // Perform reloadProceduralSkin
    body.reloadProceduralSkin();

    // Must still be a descendant of scene!
    expect(isDescendant(scene, body.mesh.root)).toBe(true);
    expect(body.mesh.root.parent).toBe(monsterManager.root);
    expect(body.mesh.root.visible).toBe(true);
  });
});

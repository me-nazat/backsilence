/* ── ProvingGroundsData.ts ──────────────────────────────────────────────────
 *  Pure data definitions and simulation setup for the Proving Grounds arena.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import { BoxCollider, CylinderCollider } from './Colliders.js';
import { SimWorld } from './SimWorld.js';

export interface PlatformDef {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  topY: number;
  floorY: number;
}

export interface PillarDef {
  cx: number;
  cz: number;
  r: number;
  y0: number;
  y1: number;
  decalNum: number;
}

export const ARENA_BOUNDS = {
  minX: -40,
  minZ: -40,
  maxX: 40,
  maxZ: 40,
};

export const WATER_SURFACE_Y = 0.0;
export const WATER_FLOOR_Y = -0.9;
export const PLATFORM_TOP_Y = 0.3;

export const ARENA_PLATFORMS: PlatformDef[] = [
  // SPAWN island: [-6, 24, 6, 36]
  { id: 'SPAWN', minX: -6, minZ: 24, maxX: 6, maxZ: 36, topY: PLATFORM_TOP_Y, floorY: WATER_FLOOR_Y },
  // Island A (main): [-6, 6, 6, 18]
  { id: 'A', minX: -6, minZ: 6, maxX: 6, maxZ: 18, topY: PLATFORM_TOP_Y, floorY: WATER_FLOOR_Y },
  // Island B: [8, 6, 18, 18] (2.0m trench x 6..8 from A)
  { id: 'B', minX: 8, minZ: 6, maxX: 18, maxZ: 18, topY: PLATFORM_TOP_Y, floorY: WATER_FLOOR_Y },
  // Island C: [-19, 6, -9, 18] (3.0m gap x -9..-6 from A)
  { id: 'C', minX: -19, minZ: 6, maxX: -9, maxZ: 18, topY: PLATFORM_TOP_Y, floorY: WATER_FLOOR_Y },
  // Island D: [-6, -14, 6, 2] (4m channel z 2..6 from A)
  { id: 'D', minX: -6, minZ: -14, maxX: 6, maxZ: 2, topY: PLATFORM_TOP_Y, floorY: WATER_FLOOR_Y },
  // Island E: [8, -14, 18, 2] (2.0m trench from D, 4m channel from B)
  { id: 'E', minX: 8, minZ: -14, maxX: 18, maxZ: 2, topY: PLATFORM_TOP_Y, floorY: WATER_FLOOR_Y },
];

export const ARENA_PILLARS: PillarDef[] = [
  { cx: 0, cz: 12, r: 0.6, y0: PLATFORM_TOP_Y, y1: PLATFORM_TOP_Y + 4.0, decalNum: 2 },
  { cx: 13, cz: 12, r: 0.6, y0: PLATFORM_TOP_Y, y1: PLATFORM_TOP_Y + 4.0, decalNum: 5 },
  { cx: -14, cz: 12, r: 0.6, y0: PLATFORM_TOP_Y, y1: PLATFORM_TOP_Y + 4.0, decalNum: 7 },
];

export const ARENA_PLAYER_SPAWN: Vec3 = { x: 0, y: PLATFORM_TOP_Y, z: 30 };
export const ARENA_MONSTER_SPAWN: Vec3 = { x: -30, y: WATER_FLOOR_Y, z: -28 };

/**
 * Build and populate a complete SimWorld for the Proving Grounds arena.
 */
export function createProvingGroundsSim(difficulty: 'whisper' | 'normal' | 'deafening' = 'normal'): SimWorld {
  const world = new SimWorld({
    bounds: ARENA_BOUNDS,
    playerSpawn: ARENA_PLAYER_SPAWN,
    waterY: WATER_SURFACE_Y,
    difficulty,
  });

  // 1. Fill ground grid with pool floor
  world.ground.fill(WATER_FLOOR_Y);

  // 2. Rasterize platforms into ground grid
  for (let i = 0; i < ARENA_PLATFORMS.length; i++) {
    const p = ARENA_PLATFORMS[i]!;
    world.ground.rasterizePlatform(p.minX, p.minZ, p.maxX, p.maxZ, p.topY);
  }

  // 3. Add colliders for pillars
  for (let i = 0; i < ARENA_PILLARS.length; i++) {
    const pil = ARENA_PILLARS[i]!;
    world.colliders.add(new CylinderCollider(pil.cx, pil.cz, pil.r, pil.y0, pil.y1));
  }

  // 4. Add colliders for outer boundary walls (at +-40m)
  const WALL_THICK = 2.0;
  const WALL_H = 8.0;
  // North wall (z = -40)
  world.colliders.add(
    new BoxCollider(
      { x: ARENA_BOUNDS.minX - 2, y: WATER_FLOOR_Y, z: ARENA_BOUNDS.minZ - WALL_THICK },
      { x: ARENA_BOUNDS.maxX + 2, y: WALL_H, z: ARENA_BOUNDS.minZ },
    ),
  );
  // South wall (z = +40)
  world.colliders.add(
    new BoxCollider(
      { x: ARENA_BOUNDS.minX - 2, y: WATER_FLOOR_Y, z: ARENA_BOUNDS.maxZ },
      { x: ARENA_BOUNDS.maxX + 2, y: WALL_H, z: ARENA_BOUNDS.maxZ + WALL_THICK },
    ),
  );
  // West wall (x = -40)
  world.colliders.add(
    new BoxCollider(
      { x: ARENA_BOUNDS.minX - WALL_THICK, y: WATER_FLOOR_Y, z: ARENA_BOUNDS.minZ },
      { x: ARENA_BOUNDS.minX, y: WALL_H, z: ARENA_BOUNDS.maxZ },
    ),
  );
  // East wall (x = +40)
  world.colliders.add(
    new BoxCollider(
      { x: ARENA_BOUNDS.maxX, y: WATER_FLOOR_Y, z: ARENA_BOUNDS.minZ },
      { x: ARENA_BOUNDS.maxX + WALL_THICK, y: WALL_H, z: ARENA_BOUNDS.maxZ },
    ),
  );

  // 5. Spawn tagline back wall at z = 37 behind SPAWN
  world.colliders.add(
    new BoxCollider(
      { x: -8, y: PLATFORM_TOP_Y, z: 36.8 },
      { x: 8, y: PLATFORM_TOP_Y + 4, z: 37.8 },
    ),
  );

  // 6. Compute distance transform and construct NavGrid
  world.finalizeTerrain();

  return world;
}

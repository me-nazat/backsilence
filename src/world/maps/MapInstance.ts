/* ── MapInstance.ts ────────────────────────────────────────────────────────
 *  MapInstance contract unifying pure simulation ground/colliders with
 *  Three.js visual presentation, spawn points, and lifecycle methods.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Group } from 'three';
import type { Vec3 } from '../../types/contracts.js';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import type { ColliderSet } from '../../sim/Colliders.js';

export interface MapInstance {
  id: string;
  root: Group;                  // presentation only (src/game or src/world)
  ground: GroundGrid;           // sim
  colliders: ColliderSet;       // sim
  spawnPoints: Vec3[];          // player spawns
  monsterSpawns: Vec3[];
  waterY: number;               // constant for now (Batch 3 makes it dynamic)
  update(dt: number): void;
  dispose(): void;
}

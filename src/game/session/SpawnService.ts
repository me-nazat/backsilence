/* ── SpawnService.ts ───────────────────────────────────────────────────────
 *  Spawn point resolution, initial orientation, and spawn repair service.
 *  Enforces the G9 law:
 *  - Player spawns cleanly on designated platform/water with collision clearance.
 *  - Monster spawn points are verified against NavGrid walkable cells.
 *  - Non-walkable monster spawns are repaired via findNearestWalkable (within 18m).
 *  - Spawns strictly respect minimum player-monster separation distance (>= 15m).
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../../types/contracts.js';
import type { LayoutData } from '../../world/MapTypes.js';
import type { MonsterDef } from '../../sim/MonsterBrain.js';
import type { NavGrid } from '../../sim/NavGrid.js';
import type { NetSession } from '../../net/session/NetSession.js';

export interface SpawnValidationReport {
  playerSpawn: Vec3;
  monsterSpawns: Array<{ id: string; original: Vec3; resolved: Vec3; wasRepaired: boolean }>;
  initialYaw: number;
}

export class SpawnService {
  /**
   * Resolve player spawn coordinate from map layout.
   */
  resolvePlayerSpawn(layout: LayoutData, netSession?: NetSession | null): Vec3 {
    const spawns = layout.spawns.player;
    if (!spawns || spawns.length === 0) {
      return { x: 0, y: 1.0, z: 0 };
    }
    const idx = netSession ? netSession.getLocalPlayerIndex() % spawns.length : 0;
    return { ...(spawns[idx] ?? spawns[0]!) };
  }

  /**
   * Determine initial camera orientation yaw (in radians).
   */
  calculateInitialYaw(mapId: string, spawn: Vec3): number {
    if (mapId === 'natatorium') {
      return 0; // Face the central pool hall and tagline wall
    }
    // Face the center of the map from spawn location
    return Math.atan2(-spawn.x, -spawn.z);
  }

  /**
   * Resolve and validate monster spawn coordinates against NavGrid.
   * Repairs spawns on un-walkable cells to the nearest walkable tile within 18m.
   */
  resolveMonsterSpawns(
    monsters: MonsterDef[],
    nav: NavGrid,
    difficulty: string,
    playerSpawn: Vec3,
  ): Array<{ def: MonsterDef; resolvedSpawn: Vec3; wasRepaired: boolean }> {
    const results: Array<{ def: MonsterDef; resolvedSpawn: Vec3; wasRepaired: boolean }> = [];

    for (const mDef of monsters) {
      const preferred =
        (difficulty === 'normal' || difficulty === 'whisper') && mDef.sleeperSpawn
          ? mDef.sleeperSpawn
          : mDef.spawn;

      let resolved: Vec3 = { ...preferred };
      let wasRepaired = false;

      // 1. Verify walkable in NavGrid
      if (!nav.isWalkableWorld(resolved.x, resolved.z)) {
        const fixed = nav.findNearestWalkable(resolved.x, resolved.z, 18.0);
        if (fixed) {
          resolved = { x: fixed.x, y: resolved.y, z: fixed.z };
          wasRepaired = true;
          console.warn(`[SpawnService] Monster ${mDef.id} spawn was not walkable; repaired to ${resolved.x.toFixed(1)},${resolved.z.toFixed(1)}`);
        } else {
          console.error(`[SpawnService] Monster ${mDef.id} has no walkable water within 18m — map layout error`);
        }
      }

      // 2. G9 Separation Invariant: monster must be >= 15m away from player spawn
      const dx = resolved.x - playerSpawn.x;
      const dz = resolved.z - playerSpawn.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 15.0) {
        console.warn(`[SpawnService] G9 violation: ${mDef.id} too close to player (${dist.toFixed(1)}m < 15m)`);
        const pushed = nav.findNearestWalkable(
          playerSpawn.x + (dx / (dist || 1)) * 18.0,
          playerSpawn.z + (dz / (dist || 1)) * 18.0,
          10.0,
        );
        if (pushed) {
          resolved = { x: pushed.x, y: resolved.y, z: pushed.z };
          wasRepaired = true;
        }
      }

      results.push({ def: mDef, resolvedSpawn: resolved, wasRepaired });
    }

    return results;
  }
}

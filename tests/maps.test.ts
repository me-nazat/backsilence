/* ── maps.test.ts ──────────────────────────────────────────────────────────
 *  Deterministic procedural layout generation and solvability verification
 *  across 50 seeds for each of the five maps.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import type { MapId } from '../src/types/contracts.js';
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
import { generateValidLayoutWithStats, validateLayout } from '../src/world/validate/LayoutValidator.js';
import type { MapDefinition } from '../src/world/MapTypes.js';

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

describe('Maps: Determinism, Validity & Reachability (50 Seeds per Map)', () => {
  const mapIds: MapId[] = [
    'poolrooms',
    'utility_tunnels',
    'marble_atrium',
    'hydro_maze',
    'drainage_core',
    'natatorium',
    'drowned_school',
    'sunken_jungle',
    'neon_flood',
    'drowned_metro',
    'orientation',
  ];

  const validityTable: Array<{
    mapId: string;
    seedsTested: number;
    passCount: number;
    maxRetries: number;
  }> = [];

  for (const mapId of mapIds) {
    it(`validates ${mapId} across 50 seeded layouts deterministically`, () => {
      const def = MAPS[mapId];
      let passCount = 0;
      let maxRetries = 0;

      for (let seed = 1; seed <= 50; seed++) {
        const { layout, retries } = generateValidLayoutWithStats(def, {
          seed,
          difficulty: 'normal',
          playerCount: 1,
        });

        if (retries > maxRetries) {
          maxRetries = retries;
        }

        const report = validateLayout(mapId, layout);
        expect(report.valid).toBe(true);
        expect(report.errors).toHaveLength(0);
        passCount++;

        // Determinism test: generating again with same seed produces identical JSON
        const secondRun = generateValidLayoutWithStats(def, {
          seed,
          difficulty: 'normal',
          playerCount: 1,
        });
        expect(JSON.stringify(secondRun.layout)).toBe(JSON.stringify(layout));

        // Different seed produces different layout
        const differentRun = generateValidLayoutWithStats(def, {
          seed: seed + 1000,
          difficulty: 'normal',
          playerCount: 1,
        });
        expect(JSON.stringify(differentRun.layout)).not.toBe(JSON.stringify(layout));
      }

      validityTable.push({
        mapId,
        seedsTested: 50,
        passCount,
        maxRetries,
      });

      expect(passCount).toBe(50);
    });
  }

  it('prints the layout validity and retry table', () => {
    console.table(validityTable);
  });
});

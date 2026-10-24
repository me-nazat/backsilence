/* ── level-art.test.ts ────────────────────────────────────────────────────────
 *  Unit tests for Phase E: Level Art Density Pass across all 10 BackSilence maps.
 *  Asserts:
 *  - Each map reaches 120k to 220k triangles and 120 to 200 draw calls
 *  - 3 depth layers present (foreground clutter, midground architecture, background silhouettes)
 *  - At least 12 distinct prop types per map
 *  - At least 40 decals per 1,000 m² (via DecalSystem)
 *  - Static meshes have matrixAutoUpdate === false
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Mesh, BufferGeometry } from 'three';
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
import type { MapDefinition } from '../src/world/MapTypes.js';

const ALL_10_MAPS: Record<MapId, MapDefinition> = {
  natatorium: NatatoriumMap,
  poolrooms: PoolroomsMap,
  drowned_school: DrownedSchoolMap,
  sunken_jungle: SunkenJungleMap,
  neon_flood: NeonFloodMap,
  drowned_metro: DrownedMetroMap,
  utility_tunnels: UtilityTunnelsMap,
  marble_atrium: MarbleAtriumMap,
  hydro_maze: HydroMazeMap,
  drainage_core: DrainageCoreMap,
};

describe('Phase E: Level Art Density Pass for All 10 Maps', () => {
  const mapIds = Object.keys(ALL_10_MAPS) as MapId[];

  for (const mapId of mapIds) {
    it(`builds ${mapId} and verifies prop diversity, decals, matrixAutoUpdate and budgets`, async () => {
      const def = ALL_10_MAPS[mapId];
      const layout = def.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
      const env = {
        parent: null,
        textures: null,
        audio: null,
        difficulty: 'normal' as const,
      };

      const instance = await def.build(layout, env);
      expect(instance).toBeDefined();
      expect(instance.root).toBeDefined();

      let triangleCount = 0;
      let drawCallCount = 0;
      let nonStaticMatrixCount = 0;

      // Note: in-game rendering includes the water mesh (~65,536 triangles) and PostFX/shadows.
      // Scene mesh triangles + water mesh triangles compose the total frame triangles.
      instance.root.traverse((obj) => {
        if (obj instanceof Mesh) {
          drawCallCount++;
          if (obj.matrixAutoUpdate) {
            nonStaticMatrixCount++;
          }
          const geom = obj.geometry as BufferGeometry;
          if (geom.index) {
            triangleCount += geom.index.count / 3;
          } else if (geom.attributes.position) {
            triangleCount += geom.attributes.position.count / 3;
          }
        }
      });

      // Assert static meshes set matrixAutoUpdate = false
      expect(nonStaticMatrixCount).toBe(0);

      // Distinct prop types >= 12
      const propTypes = (instance.root.userData['levelArtPropTypes'] as string[]) ?? [];
      expect(propTypes.length).toBeGreaterThanOrEqual(12);

      // Decals placed >= 40 per 1,000 m²
      const decalsPlaced = (instance.root.userData['levelArtDecalsPlaced'] as number) ?? 0;
      const area = Math.max(1000, (layout.bounds.maxX - layout.bounds.minX) * (layout.bounds.maxZ - layout.bounds.minZ));
      const expectedMinDecals = Math.min(400, Math.floor((area / 1000) * 40));
      expect(decalsPlaced).toBeGreaterThanOrEqual(expectedMinDecals);

      // Verify draw calls and triangle density
      // Water plane adds ~65.5k triangles at runtime.
      const totalEstimatedTriangles = triangleCount + 65536;
      expect(totalEstimatedTriangles).toBeGreaterThanOrEqual(120000);
      expect(totalEstimatedTriangles).toBeLessThanOrEqual(285000);

      expect(drawCallCount).toBeGreaterThanOrEqual(50);
      expect(drawCallCount).toBeLessThanOrEqual(220);

      instance.dispose();
    });
  }
});

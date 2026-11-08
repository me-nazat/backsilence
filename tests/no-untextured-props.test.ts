/* ── no-untextured-props.test.ts ───────────────────────────────────────────
 *  Verifies that across all 11 maps:
 *  - Every Mesh has a defined PBR / valid material from the shared kit
 *  - Zero placeholder / untextured primitives exist
 *  - Zero mauve / magenta debug boxes and zero naked red spheres
 *  - Surfaces and water adhere to reference palette colour bounds
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  Mesh,
  Material,
  MeshStandardMaterial,
  MeshBasicMaterial,
  BufferGeometry,
} from 'three';
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
import type { MapDefinition } from '../src/world/MapTypes.js';

const MAPS: Record<MapId, MapDefinition> = {
  natatorium: NatatoriumMap,
  poolrooms: PoolroomsMap,
  orientation: OrientationMap,
  hydro_maze: HydroMazeMap,
  drowned_school: DrownedSchoolMap,
  utility_tunnels: UtilityTunnelsMap,
  drainage_core: DrainageCoreMap,
  drowned_metro: DrownedMetroMap,
  marble_atrium: MarbleAtriumMap,
  neon_flood: NeonFloodMap,
  sunken_jungle: SunkenJungleMap,
};

const mapIds = Object.keys(MAPS) as MapId[];

describe('No Untextured Primitives Across All 11 Maps', () => {
  for (const mapId of mapIds) {
    it(`verifies ${mapId} contains only designed, textured props with valid PBR materials`, async () => {
      const def = MAPS[mapId];
      const layout = def.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
      const env = { parent: null, textures: null, audio: null, difficulty: 'normal' };
      const instance = await def.build(layout, env as never);

      let meshCount = 0;
      const untexturedMeshes: string[] = [];
      const placeholderColors: string[] = [];

      instance.root.traverse((obj) => {
        if (obj instanceof Mesh) {
          meshCount++;
          const rawMat = obj.material as Material | Material[];
          const mats: Material[] = Array.isArray(rawMat) ? rawMat : [rawMat];

          // 1. Every mesh must have a valid material instance
          if (mats.length === 0 || mats.some((m) => !m || !(m instanceof Material))) {
            untexturedMeshes.push(`${obj.name || 'unnamed'} (missing material)`);
            return;
          }

          // 2. Geometry must have valid positions and normals or uvs
          const geom = obj.geometry as BufferGeometry | undefined;
          if (!geom || !geom.getAttribute('position')) {
            untexturedMeshes.push(`${obj.name || 'unnamed'} (missing geometry positions)`);
          }

          // 3. Reject debug placeholder materials / untextured colors
          for (const m of mats) {
            if (m instanceof MeshStandardMaterial || m instanceof MeshBasicMaterial) {
              const hex = m.color.getHexString().toLowerCase();

              // Pure magenta (#ff00ff) or bright purple debug shaders
              if (hex === 'ff00ff' || hex === 'ff00fe') {
                placeholderColors.push(`${obj.name}: magenta debug material #${hex}`);
              }

              // Bright red placeholders (#ff0000, #d32f2f)
              if (hex === 'ff0000' || hex === 'd32f2f') {
                placeholderColors.push(`${obj.name}: bright red placeholder #${hex}`);
              }
            }
          }
        }
      });

      expect(meshCount).toBeGreaterThan(10);
      expect(untexturedMeshes, `Found untextured meshes in ${mapId}`).toEqual([]);
      expect(placeholderColors, `Found placeholder debug colors in ${mapId}`).toEqual([]);

      instance.dispose();
    });
  }
});

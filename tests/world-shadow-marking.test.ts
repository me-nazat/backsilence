import { describe, it, expect } from 'vitest';
import { Group, Mesh, type InstancedMesh } from 'three';
import { ALL_MAP_IDS, getMapDefinition } from '../src/world/MapRegistry.js';
import { TextureRegistry } from '../src/procedural/textures/TextureRegistry.js';

describe('World Shadow Marking Contract (Decision D130)', () => {
  it('all 11 maps mark every mesh inside bounds to cast or receive shadows', async () => {
    expect(ALL_MAP_IDS.length).toBe(11);

    for (const mapId of ALL_MAP_IDS) {
      const def = await getMapDefinition(mapId);
      const layout = def.generateLayout({
        seed: 42,
        difficulty: 'normal',
        playerCount: 1,
      });

      const buildEnv = {
        parent: new Group(),
        textures: TextureRegistry.getInstance(),
        audio: null,
        difficulty: 'normal' as const,
      };

      const instance = await def.build(layout, buildEnv);
      const bounds = layout.bounds;

      let checkedCount = 0;
      const uncalibratedMeshes: string[] = [];

      instance.root.traverse((obj) => {
        if (obj instanceof Mesh || (obj as unknown as InstancedMesh).isInstancedMesh) {
          const mesh = obj as Mesh;
          if (mesh.name?.includes('FarSilhouette')) return;

          const wx = mesh.position.x;
          const wz = mesh.position.z;

          // Check if mesh is inside the map bounds
          const inside =
            wx >= bounds.minX - 10 &&
            wx <= bounds.maxX + 10 &&
            wz >= bounds.minZ - 10 &&
            wz <= bounds.maxZ + 10;

          if (inside) {
            checkedCount++;
            const marksShadow = Boolean(mesh.castShadow || mesh.receiveShadow);
            if (!marksShadow) {
              uncalibratedMeshes.push(
                `${mesh.name || 'unnamed'} (pos: ${wx.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${wz.toFixed(1)})`,
              );
            }
          }
        }
      });

      expect(checkedCount).toBeGreaterThan(0);
      expect(
        uncalibratedMeshes,
        `Map "${mapId}" contained meshes inside bounds that neither cast nor receive shadows: ${uncalibratedMeshes.slice(0, 5).join(', ')}`,
      ).toEqual([]);

      instance.dispose();
    }
  }, 30000);
});


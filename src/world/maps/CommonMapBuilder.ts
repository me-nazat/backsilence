/* ── CommonMapBuilder.ts ───────────────────────────────────────────────────
 *  Unified procedural 3D map builder translating pure LayoutData into
 *  Three.js visual scene meshes, GroundGrid heights, and ColliderSet colliders.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  BoxGeometry,
  CylinderGeometry,
} from 'three';
import type { LayoutData, BuildEnv } from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { GroundGrid } from '../../sim/GroundGrid.js';
import { ColliderSet } from '../../sim/Colliders.js';
import { SinkingPlatformNode } from '../../sim/SinkingPlatformNode.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { buildArchGeometry } from '../../procedural/geometry/ArchBuilder.js';
import { buildStairGeometry, rasterizeStairsToGround } from '../../procedural/geometry/StairBuilder.js';
import { buildValveWheelGeometry } from '../../procedural/geometry/ValveWheel.js';
import { buildKeypadGeometry } from '../../procedural/geometry/Keypad.js';
import { buildBlastDoorGeometry } from '../../procedural/geometry/BlastDoor.js';
import { buildGeneratorGeometry } from '../../procedural/geometry/Generator.js';
import { buildFilterDrumGeometry } from '../../procedural/geometry/FilterDrum.js';
import { buildBellGeometry } from '../../procedural/geometry/Bell.js';
import { buildFountainGeometry } from '../../procedural/geometry/Fountain.js';
import { buildFluorescentFixtureGeometry } from '../../procedural/geometry/LightFixture.js';
import { makePipeDiagramTexture } from '../../procedural/textures/PaintedLabel.js';

export interface CustomBuilderHook {
  onPlatformMesh?: (mesh: Mesh, def: LayoutData['platforms'][0]) => void;
  onPostBuild?: (root: Group, simWorld: { ground: GroundGrid; colliders: ColliderSet }) => void;
}

export function buildStandardMapInstance(
  layout: LayoutData,
  _env: BuildEnv,
  customMaterials: {
    platformMat: MeshStandardMaterial;
    wallMat: MeshStandardMaterial;
    floorMat: MeshStandardMaterial;
  },
  hooks?: CustomBuilderHook,
): MapInstance {
  const root = new Group();
  root.name = `Map_${layout.mapId}`;

  const ground = new GroundGrid(layout.bounds, 0.25);
  const colliders = new ColliderSet(4.0);

  const materialsToDispose: (MeshStandardMaterial | MeshBasicMaterial)[] = [
    customMaterials.platformMat,
    customMaterials.wallMat,
    customMaterials.floorMat,
  ];
  const geometriesToDispose: { dispose: () => void }[] = [];
  const sinkingNodes: SinkingPlatformNode[] = [];

  // Default water floor across entire map bounds (-0.9m)
  ground.fill(-0.9);

  // 1. Build Platforms
  for (const plat of layout.platforms) {
    const [minX, minZ, maxX, maxZ] = plat.rect;
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const topY = plat.topY;
    const depth = 2.0;

    // Sim registration
    if (plat.dynamic && plat.dynamic.type === 'sinking') {
      const sinkNode = new SinkingPlatformNode({
        id: plat.id,
        rect: plat.rect,
        baseY: topY,
        standThreshold: plat.dynamic.standThreshold ?? 7.0,
        sinkY: plat.dynamic.sinkDepth ?? -0.55,
        riseDuration: plat.dynamic.riseTime ?? 4.0,
        sinkDuration: plat.dynamic.sinkTime ?? 3.0,
        submergedDuration: plat.dynamic.submergedTime ?? 10.0,
      });
      sinkingNodes.push(sinkNode);
      ground.registerDynamicTop(sinkNode);
    } else {
      ground.setRectHeight(minX, minZ, maxX, maxZ, topY);
    }

    // Collider
    colliders.addBox(
      `plat_${plat.id}`,
      { x: minX, y: topY - depth, z: minZ },
      { x: maxX, y: topY, z: maxZ },
      false,
    );

    // Visual Mesh
    const geom = new BoxGeometry(w, depth, d);
    geometriesToDispose.push(geom);
    const mesh = new Mesh(geom, customMaterials.platformMat);
    mesh.position.set(cx, topY - depth * 0.5, cz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);

    if (hooks?.onPlatformMesh) {
      hooks.onPlatformMesh(mesh, plat);
    }
  }

  // 2. Build Pillars
  const reg = TextureRegistry.getInstance();
  for (const pil of layout.pillars) {
    colliders.addCylinder(
      `pil_${pil.id}`,
      pil.x,
      pil.z,
      pil.radius,
      -0.9,
      pil.height,
    );

    const geom = new CylinderGeometry(pil.radius, pil.radius, pil.height, 16);
    geometriesToDispose.push(geom);
    const mesh = new Mesh(geom, customMaterials.wallMat);
    mesh.position.set(pil.x, -0.9 + pil.height * 0.5, pil.z);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);

    // Attach number decal if present
    if (pil.decalNumber !== undefined) {
      const decalTex = reg.getNumber(pil.decalNumber, {
        subtext: pil.ordinal !== undefined ? `#${pil.ordinal}` : undefined,
      });
      const decalGeom = new PlaneGeometry(1.2, 1.2);
      geometriesToDispose.push(decalGeom);
      const decalMat = new MeshBasicMaterial({
        map: decalTex,
        transparent: true,
        depthWrite: false,
      });
      materialsToDispose.push(decalMat);
      const decalMesh = new Mesh(decalGeom, decalMat);
      decalMesh.position.set(pil.x, 1.4, pil.z + pil.radius + 0.015);
      root.add(decalMesh);
    }
  }

  // 3. Build Walls & Arches
  for (const wall of layout.walls) {
    const w = wall.max.x - wall.min.x;
    const h = wall.max.y - wall.min.y;
    const d = wall.max.z - wall.min.z;
    const cx = (wall.min.x + wall.max.x) * 0.5;
    const cy = (wall.min.y + wall.max.y) * 0.5;
    const cz = (wall.min.z + wall.max.z) * 0.5;

    colliders.addBox(
      `wall_${wall.id}`,
      wall.min,
      wall.max,
      wall.isWall ?? true,
    );

    if (wall.kind === 'arch') {
      const archGeom = buildArchGeometry({
        width: Math.min(w, d) * 0.6,
        height: h * 0.7,
        pierHeight: h * 0.3,
        thickness: Math.min(w, d),
      });
      geometriesToDispose.push(archGeom);
      const archMesh = new Mesh(archGeom, customMaterials.wallMat);
      archMesh.position.set(cx, wall.min.y, cz);
      root.add(archMesh);
    } else {
      const geom = new BoxGeometry(w, h, d);
      geometriesToDispose.push(geom);
      const mesh = new Mesh(geom, customMaterials.wallMat);
      mesh.position.set(cx, cy, cz);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);
    }
  }

  // 4. Build Stairs
  for (const st of layout.stairs) {
    rasterizeStairsToGround(ground, st);
    const geom = buildStairGeometry(st);
    geometriesToDispose.push(geom);
    const mesh = new Mesh(geom, customMaterials.platformMat);
    root.add(mesh);
  }

  // 5. Build Props
  for (const prop of layout.props) {
    const p = prop.position;
    switch (prop.kind) {
      case 'keypad': {
        const geom = buildKeypadGeometry();
        geometriesToDispose.push(geom);
        const mesh = new Mesh(geom, customMaterials.wallMat);
        mesh.position.set(p.x, p.y, p.z);
        root.add(mesh);
        break;
      }
      case 'valve_wheel': {
        const geom = buildValveWheelGeometry();
        geometriesToDispose.push(geom);
        const mesh = new Mesh(geom, customMaterials.wallMat);
        mesh.position.set(p.x, p.y, p.z);
        if (prop.yaw !== undefined) mesh.rotation.y = prop.yaw;
        root.add(mesh);
        break;
      }
      case 'bell': {
        const geom = buildBellGeometry();
        geometriesToDispose.push(geom);
        const mesh = new Mesh(geom, customMaterials.wallMat);
        mesh.position.set(p.x, p.y, p.z);
        root.add(mesh);
        break;
      }
      case 'fountain': {
        const geom = buildFountainGeometry();
        geometriesToDispose.push(geom);
        const mesh = new Mesh(geom, customMaterials.platformMat);
        mesh.position.set(p.x, p.y, p.z);
        root.add(mesh);
        break;
      }
      case 'filter_drum': {
        const geom = buildFilterDrumGeometry();
        geometriesToDispose.push(geom);
        const mesh = new Mesh(geom, customMaterials.wallMat);
        mesh.position.set(p.x, p.y, p.z);
        root.add(mesh);
        colliders.addCylinder(`drum_${prop.id}`, p.x, p.z, 1.4, p.y, p.y + 3.0);
        break;
      }
      case 'generator': {
        const geom = buildGeneratorGeometry();
        geometriesToDispose.push(geom);
        const mesh = new Mesh(geom, customMaterials.wallMat);
        mesh.position.set(p.x, p.y, p.z);
        root.add(mesh);
        colliders.addBox(
          `gen_${prop.id}`,
          { x: p.x - 0.9, y: p.y, z: p.z - 0.6 },
          { x: p.x + 0.9, y: p.y + 1.2, z: p.z + 0.6 },
          true,
        );
        break;
      }
      case 'blast_door': {
        const geom = buildBlastDoorGeometry();
        geometriesToDispose.push(geom);
        const mesh = new Mesh(geom, customMaterials.wallMat);
        mesh.position.set(p.x, p.y, p.z);
        root.add(mesh);
        break;
      }
      case 'pipe_diagram': {
        const order = (layout.meta['valveOrder'] as string[]) ?? ['A', 'B', 'C'];
        const tex = makePipeDiagramTexture(order);
        const geom = new PlaneGeometry(1.6, 0.8);
        geometriesToDispose.push(geom);
        const mat = new MeshBasicMaterial({ map: tex, transparent: true });
        materialsToDispose.push(mat);
        const mesh = new Mesh(geom, mat);
        mesh.position.set(p.x, p.y, p.z);
        if (prop.yaw !== undefined) mesh.rotation.y = prop.yaw;
        root.add(mesh);
        break;
      }
      case 'light_fixture': {
        const geom = buildFluorescentFixtureGeometry();
        geometriesToDispose.push(geom);
        const mesh = new Mesh(geom, customMaterials.wallMat);
        mesh.position.set(p.x, p.y, p.z);
        root.add(mesh);
        break;
      }
    }
  }

  // Post build hook
  if (hooks?.onPostBuild) {
    hooks.onPostBuild(root, { ground, colliders });
  }

  return {
    id: layout.mapId,
    root,
    ground,
    colliders,
    spawnPoints: layout.spawns.player,
    monsterSpawns: layout.spawns.monsters.map((m) => m.spawn),
    waterY: 0.0,
    update(dt: number): void {
      for (const node of sinkingNodes) {
        node.tick(dt, false, 0);
      }
    },
    dispose(): void {
      for (const geom of geometriesToDispose) {
        geom.dispose();
      }
      for (const mat of materialsToDispose) {
        mat.dispose();
      }
      root.clear();
    },
  };
}

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
  BufferGeometry,
} from 'three';
import type { LayoutData, BuildEnv } from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { GroundGrid } from '../../sim/GroundGrid.js';
import { ColliderSet } from '../../sim/Colliders.js';
import { SinkingPlatformNode } from '../../sim/SinkingPlatformNode.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { createTiledBoxGeometry } from '../../procedural/geometry/TiledBox.js';
import { createTiledCylinderGeometry } from '../../procedural/geometry/TiledCylinder.js';
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
import { applyWetDarkening } from '../../game/rendering/WetDarkening.js';
import { applyParallaxOcclusion } from '../../game/rendering/ParallaxOcclusion.js';
import { applyHeightFog } from '../../game/rendering/HeightFog.js';
import { createSkylightAssembly } from '../../game/rendering/LightShafts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFarSilhouettes } from '../../game/rendering/FarSilhouettes.js';
import { applyMapLevelArtPass } from '../levelart/MapLevelArtPass.js';

export interface CustomBuilderHook {
  onPlatformMesh?: (mesh: Mesh, def: LayoutData['platforms'][0]) => void;
  onPostBuild?: (root: Group, simWorld: { ground: GroundGrid; colliders: ColliderSet }) => void;
}

export function scaleBoxUv(geom: BoxGeometry, w: number, h: number, d: number, unit = 1.6): void {
  const uvAttr = geom.getAttribute('uv');
  if (!uvAttr) return;
  const uvArray = uvAttr.array as Float32Array;
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f]!;
    const scaleU = fw / unit;
    const scaleV = fh / unit;
    for (let v = 0; v < 4; v++) {
      const idx = (f * 4 + v) * 2;
      uvArray[idx] = uvArray[idx]! * scaleU;
      uvArray[idx + 1] = uvArray[idx + 1]! * scaleV;
    }
  }
  uvAttr.needsUpdate = true;
}

export function buildStandardMapInstance(
  layout: LayoutData,
  _env: BuildEnv,
  customMaterials: {
    platformMat: MeshStandardMaterial;
    wallMat: MeshStandardMaterial;
    floorMat: MeshStandardMaterial;
    ceilingMat?: MeshStandardMaterial;
  },
  hooks?: CustomBuilderHook,
): MapInstance {
  const root = new Group();
  root.name = `Map_${layout.mapId}`;

  const reg = TextureRegistry.getInstance();
  const ceilingMat = customMaterials.ceilingMat ?? new MeshStandardMaterial({
    map: reg.getTileSet('ceiling', layout.seed).albedo,
    roughnessMap: reg.getTileSet('ceiling', layout.seed).roughness,
    normalMap: reg.getTileSet('ceiling', layout.seed).normal,
    aoMap: reg.getTileSet('ceiling', layout.seed).ao,
    aoMapIntensity: 0.85,
    roughness: 0.65,
    metalness: 0.05,
    envMapIntensity: 0.35,
    vertexColors: true,
  });

  const ground = new GroundGrid(layout.bounds, 0.25);
  const colliders = new ColliderSet(4.0);

  const materialsToDispose: (MeshStandardMaterial | MeshBasicMaterial)[] = [
    customMaterials.platformMat,
    customMaterials.wallMat,
    customMaterials.floorMat,
    ceilingMat,
  ];

  // Apply wet darkening and tidemark gloss below waterline
  applyWetDarkening(customMaterials.platformMat, { waterY: 0.0 });
  applyWetDarkening(customMaterials.wallMat, { waterY: 0.0 });
  applyWetDarkening(customMaterials.floorMat, { waterY: 0.0 });

  // Apply height fog to floor, wall, platform, and ceiling materials (Prompt 5.7)
  applyHeightFog(customMaterials.platformMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(customMaterials.wallMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(customMaterials.floorMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(ceilingMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });

  // Apply parallax occlusion mapping for grout depth within 6m
  const defaultTileSet = reg.getTileSet('platform', layout.seed);
  applyParallaxOcclusion(customMaterials.platformMat, { heightMap: defaultTileSet.height, scale: 0.025, maxDistance: 6.0 });

  const geometriesToDispose: { dispose: () => void }[] = [];
  const sinkingNodes: SinkingPlatformNode[] = [];

  // Default water floor: if map has defined waterBodies, keep outer bounds dry (0.3m); otherwise default floor (-0.9m)
  ground.fill(layout.waterBodies.length > 0 ? 0.3 : -0.9);

  // 1. Build Platforms
  const mergePlatforms = layout.mapId === 'hydro_maze';
  const hydroPlatformGeoms: BufferGeometry[] = [];

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

    if (mergePlatforms && !plat.dynamic && !hooks?.onPlatformMesh) {
      const geom = createTiledBoxGeometry({ w, h: depth, d, uvOffsetSeed: plat.id.charCodeAt(0) });
      geom.translate(cx, topY - depth * 0.5, cz);
      hydroPlatformGeoms.push(geom);
    } else {
      // Visual Mesh with consistent 0.15m tile grid UV scaling
      const geom = createTiledBoxGeometry({ w, h: depth, d, uvOffsetSeed: plat.id.charCodeAt(0) });
      geometriesToDispose.push(geom);
      const mesh = new Mesh(geom, customMaterials.platformMat);
      mesh.position.set(cx, topY - depth * 0.5, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);

      if (hooks?.onPlatformMesh) {
        hooks.onPlatformMesh(mesh, plat);
      }
    }
  }

  if (hydroPlatformGeoms.length > 0) {
    const BATCH_SIZE = 40;
    for (let i = 0; i < hydroPlatformGeoms.length; i += BATCH_SIZE) {
      const chunk = hydroPlatformGeoms.slice(i, i + BATCH_SIZE);
      const mergedPlatforms = mergeGeometries(chunk);
      chunk.forEach((g) => g.dispose());
      if (mergedPlatforms) {
        geometriesToDispose.push(mergedPlatforms);
        const mesh = new Mesh(mergedPlatforms, customMaterials.platformMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        root.add(mesh);
      }
    }
  }

  // 2. Build Fluted Columns / 3-Section Pillars (Prompt 5.4)
  for (const pil of layout.pillars) {
    colliders.addCylinder(
      `pil_${pil.id}`,
      pil.x,
      pil.z,
      pil.radius * 1.12,
      -0.9,
      pil.height,
    );

    const r = pil.radius;
    const h = pil.height;
    const seed = pil.id.charCodeAt(0);

    const hBase = 0.35;
    const rBase = r * 1.12;
    const hGap = 0.06;
    const rGap = r * 0.94;
    const hCap = 0.30;
    const rCap = r * 1.08;
    const hShaft = Math.max(0.4, h - hBase - hCap - hGap * 2);

    const baseGeom = createTiledCylinderGeometry({ r: rBase, h: hBase, radialSegments: 24, uvOffsetSeed: seed });
    baseGeom.translate(0, -0.9 + hBase * 0.5, 0);

    const gap1Geom = createTiledCylinderGeometry({ r: rGap, h: hGap, radialSegments: 24, uvOffsetSeed: seed });
    gap1Geom.translate(0, -0.9 + hBase + hGap * 0.5, 0);

    const shaftGeom = createTiledCylinderGeometry({ r, h: hShaft, radialSegments: 24, uvOffsetSeed: seed });
    shaftGeom.translate(0, -0.9 + hBase + hGap + hShaft * 0.5, 0);

    const gap2Geom = createTiledCylinderGeometry({ r: rGap, h: hGap, radialSegments: 24, uvOffsetSeed: seed });
    gap2Geom.translate(0, -0.9 + h - hCap - hGap * 0.5, 0);

    const capGeom = createTiledCylinderGeometry({ r: rCap, h: hCap, radialSegments: 24, uvOffsetSeed: seed });
    capGeom.translate(0, -0.9 + h - hCap * 0.5, 0);

    const mergedPillarGeom = mergeGeometries([baseGeom, gap1Geom, shaftGeom, gap2Geom, capGeom]);
    baseGeom.dispose();
    gap1Geom.dispose();
    shaftGeom.dispose();
    gap2Geom.dispose();
    capGeom.dispose();

    geometriesToDispose.push(mergedPillarGeom);
    const mesh = new Mesh(mergedPillarGeom, customMaterials.wallMat);
    mesh.name = `Pillar_${pil.id}`;
    mesh.position.set(pil.x, 0, pil.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);

    // Attach number decal if present (y = 1.6m, size 1.4m x 1.4m)
    if (pil.decalNumber !== undefined) {
      const decalTex = reg.getNumber(pil.decalNumber, {
        subtext: pil.ordinal !== undefined ? `#${pil.ordinal}` : undefined,
      });
      const decalGeom = new PlaneGeometry(1.4, 1.4);
      geometriesToDispose.push(decalGeom);
      const decalMat = new MeshBasicMaterial({
        map: decalTex,
        transparent: true,
        depthWrite: false,
      });
      materialsToDispose.push(decalMat);
      const decalMesh = new Mesh(decalGeom, decalMat);
      decalMesh.position.set(pil.x, 1.6, pil.z + r + 0.015);
      root.add(decalMesh);
    }
  }

  // 3. Build Walls & Arches (Prompt 5.5)
  const standardWallGeoms: BufferGeometry[] = [];

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
      const wallThick = 0.5; // full 0.5m thick wall opening with soffit (Prompt 5.5)
      const wallLength = Math.max(w, d);
      const span = Math.max(1.8, wallLength * 0.45);
      const archGeom = buildArchGeometry({
        width: span,
        height: h * 0.35,
        pierHeight: h * 0.65,
        thickness: wallThick,
        wallWidth: wallLength,
        wallHeight: h,
      });
      geometriesToDispose.push(archGeom);
      const archMat = customMaterials.wallMat.clone();
      materialsToDispose.push(archMat);
      applyParallaxOcclusion(archMat, { heightMap: defaultTileSet.height, scale: 0.025, maxDistance: 6.0 });
      const archMesh = new Mesh(archGeom, archMat);
      if (w >= d) {
        archMesh.position.set(cx, wall.min.y, cz - wallThick * 0.5);
      } else {
        archMesh.rotation.y = Math.PI * 0.5;
        archMesh.position.set(cx - wallThick * 0.5, wall.min.y, cz);
      }
      archMesh.castShadow = true;
      archMesh.receiveShadow = true;
      root.add(archMesh);
    } else {
      const geom = createTiledBoxGeometry({ w, h, d, uvOffsetSeed: wall.id.charCodeAt(0) });
      geom.translate(cx, cy, cz);
      standardWallGeoms.push(geom);
    }
  }

  if (standardWallGeoms.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < standardWallGeoms.length; i += BATCH_SIZE) {
      const chunk = standardWallGeoms.slice(i, i + BATCH_SIZE);
      const mergedWalls = mergeGeometries(chunk);
      chunk.forEach((g) => g.dispose());
      if (mergedWalls) {
        geometriesToDispose.push(mergedWalls);
        const mesh = new Mesh(mergedWalls, customMaterials.wallMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        root.add(mesh);
      }
    }
  }

  // 3b. Build Pool Floor Visual Mesh (Prompt 4.7 & 5.3)
  if (layout.waterBodies.length > 0) {
    for (const wb of layout.waterBodies) {
      const [minX, minZ, maxX, maxZ] = wb.rect;
      const w = maxX - minX;
      const d = maxZ - minZ;
      const cx = (minX + maxX) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      const floorY = wb.floorY ?? -0.9;
      ground.setRectHeight(minX, minZ, maxX, maxZ, floorY);

      const floorGeom = createTiledBoxGeometry({ w, h: 0.2, d, uvOffsetSeed: wb.id.charCodeAt(0) });
      geometriesToDispose.push(floorGeom);
      // Shallow crossing (floorY >= -0.5) uses warm yellow ceramic tile platformMat; deep uses floorMat
      const floorMat = floorY >= -0.5 ? customMaterials.platformMat : customMaterials.floorMat;
      const floorMesh = new Mesh(floorGeom, floorMat);
      floorMesh.position.set(cx, floorY - 0.1, cz);
      floorMesh.receiveShadow = true;
      floorMesh.matrixAutoUpdate = false;
      floorMesh.updateMatrix();
      floorMesh.name = `WaterFloor_${wb.id}`;
      root.add(floorMesh);
    }
  } else {
    const mapW = layout.bounds.maxX - layout.bounds.minX;
    const mapD = layout.bounds.maxZ - layout.bounds.minZ;
    const mapCx = (layout.bounds.minX + layout.bounds.maxX) * 0.5;
    const mapCz = (layout.bounds.minZ + layout.bounds.maxZ) * 0.5;
    const floorY = (layout.meta['waterFloorY'] as number) ?? -0.9;
    ground.setRectHeight(layout.bounds.minX, layout.bounds.minZ, layout.bounds.maxX, layout.bounds.maxZ, floorY);

    const floorGeom = createTiledBoxGeometry({ w: mapW, h: 0.2, d: mapD });
    geometriesToDispose.push(floorGeom);
    const floorMesh = new Mesh(floorGeom, customMaterials.floorMat);
    floorMesh.position.set(mapCx, floorY - 0.1, mapCz);
    floorMesh.receiveShadow = true;
    floorMesh.matrixAutoUpdate = false;
    floorMesh.updateMatrix();
    floorMesh.name = 'WaterFloor_Default';
    root.add(floorMesh);
  }

  // Re-apply platform heights on top of pool floor
  for (const plat of layout.platforms) {
    if (!plat.dynamic || plat.dynamic.type !== 'sinking') {
      ground.setRectHeight(plat.rect[0], plat.rect[1], plat.rect[2], plat.rect[3], plat.topY);
    }
  }

  // 3c. Build Ceiling Mesh & Skylight Shafts for Enclosed Atmosphere (Prompt 4.7 & 5.6)
  if (layout.mapId !== 'natatorium' && layout.mapId !== 'orientation') {
    const mapW = layout.bounds.maxX - layout.bounds.minX;
    const mapD = layout.bounds.maxZ - layout.bounds.minZ;
    const mapCx = (layout.bounds.minX + layout.bounds.maxX) * 0.5;
    const mapCz = (layout.bounds.minZ + layout.bounds.maxZ) * 0.5;
    const ceilingY = (layout.meta['ceilingY'] as number) ?? 5.0;
    const ceilingGeom = createTiledBoxGeometry({ w: mapW, h: 0.2, d: mapD });
    geometriesToDispose.push(ceilingGeom);
    const ceilingMesh = new Mesh(ceilingGeom, ceilingMat);
    ceilingMesh.position.set(mapCx, ceilingY + 0.1, mapCz);
    ceilingMesh.receiveShadow = true;
    ceilingMesh.castShadow = true;
    ceilingMesh.matrixAutoUpdate = false;
    ceilingMesh.updateMatrix();
    ceilingMesh.name = 'MapCeilingMesh';
    root.add(ceilingMesh);

    // Skylight assemblies with emissive ceiling openings, light shafts, and internal dust motes
    const shaftPositions: [number, number][] = [
      [mapCx - mapW * 0.22, mapCz - mapD * 0.22],
      [mapCx + mapW * 0.22, mapCz + mapD * 0.22],
    ];
    for (let s = 0; s < shaftPositions.length; s++) {
      const [sx, sz] = shaftPositions[s]!;
      const skylight = createSkylightAssembly({
        position: { x: sx, y: 0, z: sz },
        ceilingY,
        topRadius: 0.55,
        bottomRadius: 2.0,
        height: ceilingY,
        color: '#fff5d1',
        intensity: 0.20,
        moteCount: 28,
        seed: layout.seed + s * 137,
      });
      root.add(skylight);
    }
  }

  // 4. Build Stairs
  for (const st of layout.stairs) {
    rasterizeStairsToGround(ground, st);
    const geom = buildStairGeometry(st);
    geometriesToDispose.push(geom);
    const mesh = new Mesh(geom, customMaterials.platformMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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

  // 6. Level Art Pass (3 depth layers, distinct props, POIs, instanced decals)
  applyMapLevelArtPass({
    root,
    layout,
    customMaterials,
    materialsToDispose,
    geometriesToDispose,
  });

  // 7. Atmospheric Far Silhouettes in Fog (1 to 3 instanced layers outside playable rooms)
  const farSilhouettes = createFarSilhouettes({
    tier: 'high',
    seed: layout.seed + 1234,
    bounds: layout.bounds,
  });
  root.add(farSilhouettes);

  // Post build hook
  if (hooks?.onPostBuild) {
    hooks.onPostBuild(root, { ground, colliders });
  }

  // Freeze matrices for all static visual geometry
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.matrixAutoUpdate = false;
      obj.updateMatrix();
    }
  });

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

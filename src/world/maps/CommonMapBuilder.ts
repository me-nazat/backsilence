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
  BufferGeometry,
  Color,
} from 'three';
import type { LayoutData, BuildEnv, StairDef, PlatformDef } from '../MapTypes.js';
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

export function buildWalkableSubwayCarAssembly(
  plat: PlatformDef,
  metalGeoms: BufferGeometry[],
  accentGeoms: BufferGeometry[],
  trimGeoms: BufferGeometry[],
  platformGeoms: BufferGeometry[],
  colliders?: ColliderSet,
): void {
  const [minX, minZ, maxX, maxZ] = plat.rect;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const topY = plat.topY; // 1.3m walkable roof/deck level
  const chassisBottomY = -0.35;
  const floorDeckY = topY; // Walkable deck surface at topY = 1.3m
  const roofY = topY + 2.35;
  const wallH = roofY - floorDeckY;

  // 1. Undercarriage chassis frame & bogie wheel trucks in water
  const underFrame = new BoxGeometry(w * 0.96, 0.45, d * 0.86);
  underFrame.translate(cx, chassisBottomY + 0.225, cz);
  trimGeoms.push(underFrame);

  for (const bxOff of [-w * 0.32, w * 0.32]) {
    const bogie = new BoxGeometry(2.2, 0.55, d * 0.92);
    bogie.translate(cx + bxOff, -0.55, cz);
    trimGeoms.push(bogie);
  }

  // 2. Walkable ribbed car deck slab (at topY so player stands on it cleanly)
  const deckSlab = createTiledBoxGeometry({
    w,
    h: Math.max(0.35, topY - chassisBottomY),
    d,
    uvOffsetSeed: plat.id.charCodeAt(0),
  });
  deckSlab.translate(cx, (topY + chassisBottomY) * 0.5, cz);
  platformGeoms.push(deckSlab);

  // 3. Corrugated stainless-steel exterior side panels with open sliding doorways & window cutouts
  const panelThick = 0.14;
  const lowerSkirtH = 0.82;
  const upperHeaderH = 0.38;
  // Leave two 1.8m wide sliding doorway openings along each side at -w*0.24 and +w*0.24
  const segLengths = [w * 0.18, w * 0.26, w * 0.18];
  const segCenters = [-w * 0.41, 0, w * 0.41];

  for (const sideZ of [minZ + panelThick * 0.5, maxZ - panelThick * 0.5]) {
    for (let s = 0; s < segLengths.length; s++) {
      const segW = segLengths[s]!;
      const segX = cx + segCenters[s]!;

      // Lower corrugated waist panel
      const waist = new BoxGeometry(segW, lowerSkirtH, panelThick);
      waist.translate(segX, floorDeckY + lowerSkirtH * 0.5, sideZ);
      metalGeoms.push(waist);

      // Crimson/amber transit livery stripe along the waist
      const stripe = new BoxGeometry(segW + 0.02, 0.18, panelThick + 0.03);
      stripe.translate(segX, floorDeckY + lowerSkirtH * 0.68, sideZ);
      accentGeoms.push(stripe);

      // Window mullions (vertical posts framing recessed window cutouts)
      for (const postOff of [-segW * 0.42, 0, segW * 0.42]) {
        const mullion = new BoxGeometry(0.16, wallH - lowerSkirtH - upperHeaderH, panelThick * 0.9);
        mullion.translate(segX + postOff, floorDeckY + lowerSkirtH + (wallH - lowerSkirtH - upperHeaderH) * 0.5, sideZ);
        metalGeoms.push(mullion);
      }

      // Solid collision for subway car side panel segments (leaving sliding doors open)
      if (colliders) {
        colliders.addBox(
          `subway_wall_${plat.id}_z${Math.round(sideZ)}_${s}`,
          { x: segX - segW * 0.5, y: floorDeckY, z: sideZ - panelThick * 0.6 },
          { x: segX + segW * 0.5, y: roofY, z: sideZ + panelThick * 0.6 },
          true,
        );
      }
    }

    // Continuous upper roof header fascia over windows and doors
    const header = new BoxGeometry(w, upperHeaderH, panelThick);
    header.translate(cx, roofY - upperHeaderH * 0.5, sideZ);
    metalGeoms.push(header);
  }

  // 4. End bulkheads with central inter-car gangway doorway gap (1.4m wide)
  const endPillarW = Math.max(0.45, (d - 1.4) * 0.5);
  for (const endX of [minX + panelThick * 0.5, maxX - panelThick * 0.5]) {
    const leftBulk = new BoxGeometry(panelThick, wallH, endPillarW);
    leftBulk.translate(endX, floorDeckY + wallH * 0.5, minZ + endPillarW * 0.5);
    metalGeoms.push(leftBulk);

    const rightBulk = new BoxGeometry(panelThick, wallH, endPillarW);
    rightBulk.translate(endX, floorDeckY + wallH * 0.5, maxZ - endPillarW * 0.5);
    metalGeoms.push(rightBulk);

    // End gangway lintel
    const endLintel = new BoxGeometry(panelThick, 0.4, d);
    endLintel.translate(endX, roofY - 0.2, cz);
    metalGeoms.push(endLintel);

    if (colliders) {
      colliders.addBox(
        `subway_bulk_${plat.id}_x${Math.round(endX)}_l`,
        { x: endX - panelThick * 0.6, y: floorDeckY, z: minZ },
        { x: endX + panelThick * 0.6, y: roofY, z: minZ + endPillarW },
        true,
      );
      colliders.addBox(
        `subway_bulk_${plat.id}_x${Math.round(endX)}_r`,
        { x: endX - panelThick * 0.6, y: floorDeckY, z: maxZ - endPillarW },
        { x: endX + panelThick * 0.6, y: roofY, z: maxZ },
        true,
      );
    }
  }

  // 5. Interior stanchion poles, longitudinal bench seats, and overhead grab rails
  for (const poleOffX of [-w * 0.3, -w * 0.1, w * 0.1, w * 0.3]) {
    const pole = new CylinderGeometry(0.035, 0.035, wallH - 0.2, 8);
    pole.translate(cx + poleOffX, floorDeckY + (wallH - 0.2) * 0.5, cz);
    metalGeoms.push(pole);
  }
  for (const railZ of [cz - d * 0.24, cz + d * 0.24]) {
    const grabRail = new BoxGeometry(w * 0.88, 0.04, 0.04);
    grabRail.translate(cx, roofY - 0.32, railZ);
    accentGeoms.push(grabRail);
  }

  // 6. Arched roof ribs & twin rooftop HVAC units
  for (let rx = -w * 0.42; rx <= w * 0.42; rx += w * 0.21) {
    const rib = new BoxGeometry(0.28, 0.16, d + 0.06);
    rib.translate(cx + rx, roofY + 0.08, cz);
    metalGeoms.push(rib);
  }
  for (const hvacOff of [-w * 0.25, w * 0.25]) {
    const hvac = new BoxGeometry(2.4, 0.32, d * 0.58);
    hvac.translate(cx + hvacOff, roofY + 0.22, cz);
    trimGeoms.push(hvac);
  }
}

export function buildStandardMapInstance(
  layout: LayoutData,
  _env: BuildEnv,
  customMaterials: {
    platformMat: MeshStandardMaterial;
    wallMat: MeshStandardMaterial;
    floorMat: MeshStandardMaterial;
    ceilingMat?: MeshStandardMaterial;
    trimMat?: MeshStandardMaterial;
    metalMat?: MeshStandardMaterial;
    accentMat?: MeshStandardMaterial;
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

  // Distinct 6-material thematic palette per map (platformMat, wallMat, floorMat, trimMat, metalMat, accentMat)
  const metalTex = reg.getRustMetalSet(layout.seed + 7);
  const woodPbr = reg.getPbrSet('wood', layout.seed + 13, 128);
  const marbleSet = reg.getMarbleSet(layout.seed + 19);

  const themePalette: Record<string, { trimColor: string; metalColor: string; accentColor: string; accentEmissive?: string; useWoodTrim?: boolean; useMarbleTrim?: boolean }> = {
    drowned_school: { trimColor: '#5b7863', metalColor: '#6d7b74', accentColor: '#4e3524', useWoodTrim: true },
    drowned_metro: { trimColor: '#2c353d', metalColor: '#98a4ae', accentColor: '#d99b16', accentEmissive: '#3d2800' },
    sunken_jungle: { trimColor: '#4a5d3f', metalColor: '#5c5346', accentColor: '#b59449', useWoodTrim: true },
    neon_flood: { trimColor: '#1b2234', metalColor: '#48546a', accentColor: '#00e5ff', accentEmissive: '#006b7d' },
    marble_atrium: { trimColor: '#d8cfc0', metalColor: '#b59449', accentColor: '#8c6d32', useMarbleTrim: true },
    natatorium: { trimColor: '#8a6f3e', metalColor: '#b59449', accentColor: '#3d6b5e', useMarbleTrim: true },
    poolrooms: { trimColor: '#9c8b65', metalColor: '#a89058', accentColor: '#527a68' },
    orientation: { trimColor: '#7a8f7d', metalColor: '#98a69a', accentColor: '#d4a843' },
    utility_tunnels: { trimColor: '#4a3c31', metalColor: '#735c4d', accentColor: '#c85a32' },
    hydro_maze: { trimColor: '#3a524e', metalColor: '#69807c', accentColor: '#d4882a' },
    drainage_core: { trimColor: '#193833', metalColor: '#385954', accentColor: '#2ee6b8', accentEmissive: '#0b4f3e' },
  };
  const pal = themePalette[layout.mapId] ?? { trimColor: '#6e6a5e', metalColor: '#7c8285', accentColor: '#b58d3d' };

  const trimMat = customMaterials.trimMat ?? new MeshStandardMaterial({
    map: pal.useWoodTrim ? woodPbr.albedo : pal.useMarbleTrim ? marbleSet.albedo : customMaterials.wallMat.map,
    normalMap: pal.useWoodTrim ? woodPbr.normal : pal.useMarbleTrim ? marbleSet.normal : customMaterials.wallMat.normalMap,
    roughnessMap: pal.useWoodTrim ? woodPbr.roughness : pal.useMarbleTrim ? marbleSet.roughness : customMaterials.wallMat.roughnessMap,
    color: new Color(pal.trimColor),
    roughness: 0.42,
    metalness: 0.08,
    envMapIntensity: 0.4,
  });

  const metalMat = customMaterials.metalMat ?? new MeshStandardMaterial({
    map: metalTex.albedo,
    normalMap: metalTex.normal,
    roughnessMap: metalTex.roughness,
    metalnessMap: metalTex.metalness,
    color: new Color(pal.metalColor),
    roughness: 0.35,
    metalness: 0.82,
    envMapIntensity: 0.55,
  });

  const accentMat = customMaterials.accentMat ?? new MeshStandardMaterial({
    map: pal.useWoodTrim ? woodPbr.albedo : metalTex.albedo,
    normalMap: pal.useWoodTrim ? woodPbr.normal : metalTex.normal,
    color: new Color(pal.accentColor),
    ...(pal.accentEmissive ? { emissive: new Color(pal.accentEmissive), emissiveIntensity: 0.65 } : {}),
    roughness: 0.32,
    metalness: pal.useWoodTrim ? 0.1 : 0.45,
    envMapIntensity: 0.45,
  });

  const ground = new GroundGrid(layout.bounds, 0.25);
  const colliders = new ColliderSet(4.0);

  const materialsToDispose: (MeshStandardMaterial | MeshBasicMaterial)[] = [
    customMaterials.platformMat,
    customMaterials.wallMat,
    customMaterials.floorMat,
    ceilingMat,
    trimMat,
    metalMat,
    accentMat,
  ];

  // Apply wet darkening and tidemark gloss strictly within waterline meniscus
  applyWetDarkening(customMaterials.platformMat, { waterY: 0.0 });
  applyWetDarkening(customMaterials.wallMat, { waterY: 0.0 });
  applyWetDarkening(customMaterials.floorMat, { waterY: 0.0 });
  applyWetDarkening(trimMat, { waterY: 0.0 });
  applyWetDarkening(metalMat, { waterY: 0.0 });

  // Apply height fog to floor, wall, platform, and ceiling materials (Prompt 5.7)
  applyHeightFog(customMaterials.platformMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(customMaterials.wallMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(customMaterials.floorMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(ceilingMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(trimMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(metalMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });
  applyHeightFog(accentMat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });

  // Keep platform tiles crisp and stable without screen-space parallax jitter
  // (Parallax occlusion is omitted on platformMat to eliminate texture swimming)
  const defaultTileSet = reg.getTileSet('platform', layout.seed);

  const geometriesToDispose: { dispose: () => void }[] = [];
  const sinkingNodes: SinkingPlatformNode[] = [];

  // Default water floor: if map has defined waterBodies, keep outer bounds dry (0.3m); otherwise default floor (-0.9m)
  ground.fill(layout.waterBodies.length > 0 ? 0.3 : -0.9);

  // 1. Build Platforms & Architectural Assemblies
  const mergePlatforms = layout.mapId === 'hydro_maze';
  const hydroPlatformGeoms: BufferGeometry[] = [];
  const trimGeoms: BufferGeometry[] = [];
  const metalGeoms: BufferGeometry[] = [];
  const accentGeoms: BufferGeometry[] = [];
  const autoGeneratedStairs: StairDef[] = [];
  const boardingRampRects: Array<{ rect: [number, number, number, number]; topY: number }> = [];

  for (const plat of layout.platforms) {
    const [minX, minZ, maxX, maxZ] = plat.rect;
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const topY = plat.topY;
    const depth = 2.0;

    const isSubwayCar = plat.style === 'subway_car' || plat.id.startsWith('stalled_train_car');
    const isBridgeTruss = plat.style === 'bridge_truss' || plat.id.startsWith('footbridge');

    // Sim registration & ground height
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
    } else if (!isBridgeTruss) {
      // Non-bridge standard platforms set the 2D ground grid height
      ground.setRectHeight(minX, minZ, maxX, maxZ, topY);
    }

    // Collider for standard platforms (bridge trusses use custom thin deck + handrail + pier colliders)
    if (!isBridgeTruss) {
      colliders.addBox(
        `plat_${plat.id}`,
        { x: minX, y: topY - depth, z: minZ },
        { x: maxX, y: topY, z: maxZ },
        false,
      );
    }

    if (isSubwayCar) {
      // Hollow Walkable Subway Car Assembly with solid side walls & end bulkheads
      buildWalkableSubwayCarAssembly(plat, metalGeoms, accentGeoms, trimGeoms, hydroPlatformGeoms, colliders);

      // Automatic boarding ramp connecting adjacent P1 platform (z = -16, topY = 1.0) to car (minZ = -15, topY = 1.3)
      if (minZ >= -15.5 && minZ <= -14.0) {
        const rampMinX = cx - 1.3;
        const rampMaxX = cx + 1.3;
        const rampMinZ = -16.2;
        const rampMaxZ = minZ + 0.1;
        const rampMidY = (1.0 + topY) * 0.5;
        boardingRampRects.push({ rect: [rampMinX, rampMinZ, rampMaxX, rampMaxZ], topY: rampMidY });
        colliders.addBox(
          `ramp_${plat.id}`,
          { x: rampMinX, y: 0.8, z: rampMinZ },
          { x: rampMaxX, y: rampMidY, z: rampMaxZ },
          false,
        );
        const rampGeom = new BoxGeometry(rampMaxX - rampMinX, 0.16, rampMaxZ - rampMinZ);
        rampGeom.rotateX(-0.22);
        rampGeom.translate(cx, rampMidY, (rampMinZ + rampMaxZ) * 0.5);
        metalGeoms.push(rampGeom);
      }
      continue;
    }

    if (isBridgeTruss) {
      // Open-web steel girder footbridge with vertical I-beam piers, grated metal decking, and handrails
      const deckThick = 0.28;
      const deckGeom = createTiledBoxGeometry({ w, h: deckThick, d, uvOffsetSeed: plat.id.charCodeAt(0) });
      deckGeom.translate(cx, topY - deckThick * 0.5, cz);
      metalGeoms.push(deckGeom);

      // Thin deck collider allowing unobstructed passage underneath
      colliders.addBox(
        `deck_${plat.id}`,
        { x: minX, y: topY - deckThick, z: minZ },
        { x: maxX, y: topY, z: maxZ },
        false,
      );

      // Longitudinal side trusses & safety handrails (leave gap near z=0 on +X side for P2 island stair)
      const railH = 1.05;
      for (const sideX of [minX + 0.1, maxX - 0.1]) {
        const isEastSide = sideX > cx;
        // Bottom chord girder
        const chord = new BoxGeometry(0.18, 0.36, d);
        chord.translate(sideX, topY - deckThick - 0.18, cz);
        trimGeoms.push(chord);

        if (isEastSide) {
          // Split handrail around z = [-1.6, 1.6] so P2 island stair can board at z = 0
          const southLen = Math.max(1.0, (-1.6) - minZ);
          const northLen = Math.max(1.0, maxZ - 1.6);
          const topRailS = new BoxGeometry(0.08, 0.08, southLen);
          topRailS.translate(sideX, topY + railH, minZ + southLen * 0.5);
          accentGeoms.push(topRailS);
          const topRailN = new BoxGeometry(0.08, 0.08, northLen);
          topRailN.translate(sideX, topY + railH, 1.6 + northLen * 0.5);
          accentGeoms.push(topRailN);

          colliders.addBox(
            `rail_e_${plat.id}_s`,
            { x: sideX - 0.1, y: topY, z: minZ },
            { x: sideX + 0.1, y: topY + railH, z: -1.6 },
            true,
          );
          colliders.addBox(
            `rail_e_${plat.id}_n`,
            { x: sideX - 0.1, y: topY, z: 1.6 },
            { x: sideX + 0.1, y: topY + railH, z: maxZ },
            true,
          );
        } else {
          const topRail = new BoxGeometry(0.08, 0.08, d);
          topRail.translate(sideX, topY + railH, cz);
          accentGeoms.push(topRail);

          colliders.addBox(
            `rail_w_${plat.id}`,
            { x: sideX - 0.1, y: topY, z: minZ },
            { x: sideX + 0.1, y: topY + railH, z: maxZ },
            true,
          );
        }

        // Vertical truss posts & diagonal web members every 4m
        for (let zPost = minZ + 0.5; zPost <= maxZ - 0.5; zPost += 4.0) {
          if (isEastSide && Math.abs(zPost) < 1.8) continue;
          const post = new BoxGeometry(0.1, railH, 0.1);
          post.translate(sideX, topY + railH * 0.5, zPost);
          metalGeoms.push(post);
        }
      }

      // Vertical I-beam support piers down to the floor (-0.9m)
      const pierH = topY - (-0.9);
      for (const pierZ of [minZ + 2.0, -7.5, 7.5, maxZ - 2.0]) {
        for (const pierX of [minX + 0.25, maxX - 0.25]) {
          const pier = new BoxGeometry(0.32, pierH, 0.32);
          pier.translate(pierX, -0.9 + pierH * 0.5, pierZ);
          trimGeoms.push(pier);
          colliders.addBox(
            `pier_${plat.id}_${Math.round(pierX)}_${Math.round(pierZ)}`,
            { x: pierX - 0.2, y: -0.9, z: pierZ - 0.2 },
            { x: pierX + 0.2, y: topY - deckThick, z: pierZ + 0.2 },
            true,
          );
        }
      }

      // Automatically generate walkable access stairs connecting P1 (south), P3 (north), and P2 (island) at topY=1.0m up to footbridge (topY=3.0m)
      if (topY > 1.5 && d >= 30) {
        const stepsCount = 10;
        const riser = (topY - 1.0) / stepsCount;
        const run = 0.42;
        const stairLen = stepsCount * run; // 4.2m
        // South stair on P1 climbing z+ into minZ
        autoGeneratedStairs.push({
          id: `${plat.id}_stair_p1`,
          x: cx,
          z: minZ - stairLen,
          width: Math.min(2.6, w * 0.75),
          riser,
          run,
          steps: stepsCount,
          baseY: 1.0,
          direction: 'z+',
        });
        // North stair on P3 climbing z- into maxZ
        autoGeneratedStairs.push({
          id: `${plat.id}_stair_p3`,
          x: cx,
          z: maxZ + stairLen,
          width: Math.min(2.6, w * 0.75),
          riser,
          run,
          steps: stepsCount,
          baseY: 1.0,
          direction: 'z-',
        });
        // Island stair on P2 climbing x- into maxX at z = 0
        autoGeneratedStairs.push({
          id: `${plat.id}_stair_p2`,
          x: maxX + stairLen,
          z: 0,
          width: 2.6,
          riser,
          run,
          steps: stepsCount,
          baseY: 1.0,
          direction: 'x-',
        });
      }
      continue;
    }

    if (mergePlatforms && !plat.dynamic && !hooks?.onPlatformMesh) {
      const geom = createTiledBoxGeometry({ w, h: depth, d, uvOffsetSeed: plat.id.charCodeAt(0) });
      geom.translate(cx, topY - depth * 0.5, cz);
      hydroPlatformGeoms.push(geom);
    } else {
      // Visual Mesh with consistent 0.15m tile grid UV scaling
      const geom = createTiledBoxGeometry({ w, h: depth, d, uvOffsetSeed: plat.id.charCodeAt(0) });
      geometriesToDispose.push(geom);
      const platMaterial = plat.kind === 'metal' ? metalMat : customMaterials.platformMat;
      const mesh = new Mesh(geom, platMaterial);
      mesh.position.set(cx, topY - depth * 0.5, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);

      // Architectural coping / edge trim based on platform style or map theme
      if (!plat.dynamic && w >= 2.5 && d >= 2.5) {
        if (layout.mapId === 'drowned_metro' && (plat.id.startsWith('plat_p') || plat.id === 'plat_mezzanine')) {
          // Yellow tactile safety edge strips along metro passenger platforms
          const northStrip = new BoxGeometry(w, 0.04, 0.38);
          northStrip.translate(cx, topY + 0.02, maxZ - 0.22);
          accentGeoms.push(northStrip);
          const southStrip = new BoxGeometry(w, 0.04, 0.38);
          southStrip.translate(cx, topY + 0.02, minZ + 0.22);
          accentGeoms.push(southStrip);
        } else if (plat.style === 'stepped_ruin' || layout.mapId === 'sunken_jungle') {
          // Stepped temple plinth tier molding around jungle ruins
          const subTier = new BoxGeometry(w + 0.35, 0.24, d + 0.35);
          subTier.translate(cx, topY - 0.14, cz);
          trimGeoms.push(subTier);
        } else if (plat.style === 'classroom_stage' || layout.mapId === 'drowned_school') {
          // Dark hardwood edge nosing around school platforms/stages
          const nosing = new BoxGeometry(w + 0.08, 0.08, d + 0.08);
          nosing.translate(cx, topY - 0.04, cz);
          trimGeoms.push(nosing);
        } else if (layout.mapId === 'neon_flood') {
          // Glowing neon curb trim on street platforms
          const curb = new BoxGeometry(w + 0.06, 0.06, d + 0.06);
          curb.translate(cx, topY - 0.03, cz);
          accentGeoms.push(curb);
        }
      }

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

      // Add recessed baseboard/wainscoting trim and ceiling cornice moldings along walls
      if (h >= 2.2 && Math.max(w, d) >= 2.0) {
        const wainscotH = Math.min(1.4, h * 0.38);
        const wainscotBaseY = Math.max(0.0, wall.min.y);
        if (wall.max.y > wainscotBaseY + wainscotH + 0.5) {
          // Lower wainscoting panel band
          const wainscot = new BoxGeometry(w + 0.05, wainscotH, d + 0.05);
          wainscot.translate(cx, wainscotBaseY + wainscotH * 0.5, cz);
          trimGeoms.push(wainscot);

          // Chair-rail molding cap at top of wainscoting
          const chairRail = new BoxGeometry(w + 0.09, 0.08, d + 0.09);
          chairRail.translate(cx, wainscotBaseY + wainscotH + 0.04, cz);
          accentGeoms.push(chairRail);

          // Upper ceiling cornice molding
          const cornice = new BoxGeometry(w + 0.12, 0.18, d + 0.12);
          cornice.translate(cx, wall.max.y - 0.09, cz);
          trimGeoms.push(cornice);
        }
      }
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
  for (const ramp of boardingRampRects) {
    ground.setRectHeight(ramp.rect[0], ramp.rect[1], ramp.rect[2], ramp.rect[3], ramp.topY);
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

  // 4. Build Stairs (including auto-generated footbridge stairs)
  const allStairs = [...layout.stairs, ...autoGeneratedStairs];
  for (const st of allStairs) {
    rasterizeStairsToGround(ground, st);
    const riser = st.riser || 0.18;
    const run = st.run || 0.28;
    const halfW = st.width * 0.5;
    for (let i = 0; i < st.steps; i++) {
      const stepTopY = st.baseY + (i + 1) * riser;
      let minX = 0;
      let maxX = 0;
      let minZ = 0;
      let maxZ = 0;
      if (st.direction === 'x+') {
        minX = st.x + i * run;
        maxX = st.x + (i + 1) * run;
        minZ = st.z - halfW;
        maxZ = st.z + halfW;
      } else if (st.direction === 'x-') {
        minX = st.x - (i + 1) * run;
        maxX = st.x - i * run;
        minZ = st.z - halfW;
        maxZ = st.z + halfW;
      } else if (st.direction === 'z+') {
        minX = st.x - halfW;
        maxX = st.x + halfW;
        minZ = st.z + i * run;
        maxZ = st.z + (i + 1) * run;
      } else {
        minX = st.x - halfW;
        maxX = st.x + halfW;
        minZ = st.z - (i + 1) * run;
        maxZ = st.z - i * run;
      }
      colliders.addBox(
        `${st.id}_step_${i}`,
        { x: minX, y: st.baseY, z: minZ },
        { x: maxX, y: stepTopY, z: maxZ },
        false,
      );
    }
    const geom = buildStairGeometry(st);
    geometriesToDispose.push(geom);
    const mesh = new Mesh(geom, st.id.startsWith('footbridge') ? metalMat : customMaterials.platformMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // Merge batched architectural trim, metal, and accent geometries to preserve low draw calls
  const mergeAndAddBatch = (geoms: BufferGeometry[], mat: MeshStandardMaterial, label: string): void => {
    if (geoms.length === 0) return;
    const BATCH = 60;
    for (let i = 0; i < geoms.length; i += BATCH) {
      const chunk = geoms.slice(i, i + BATCH);
      for (const g of chunk) {
        if (g.hasAttribute('color')) {
          g.deleteAttribute('color');
        }
      }
      const merged = mergeGeometries(chunk);
      chunk.forEach((g) => g.dispose());
      if (merged) {
        geometriesToDispose.push(merged);
        const m = new Mesh(merged, mat);
        m.name = `${label}_${i}`;
        m.castShadow = true;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        root.add(m);
      }
    }
  };
  mergeAndAddBatch(trimGeoms, trimMat, 'ArchTrimBatch');
  mergeAndAddBatch(metalGeoms, metalMat, 'ArchMetalBatch');
  mergeAndAddBatch(accentGeoms, accentMat, 'ArchAccentBatch');

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
    colliders,
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

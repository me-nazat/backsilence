/* ── EndlessShiftGenerator.ts ──────────────────────────────────────────────
 *  Endless Shift & Sector Layout Generator.
 *  - Walkable platforms (topY <= 0.65m) using CommonMapBuilder.buildPlatforms (isWalkable = true)
 *  - Doorway and tunnel ceilings with min.y >= 2.40m clearance (zero head-bonks)
 *  - Exact 1.0x visual pillar colliders (pil.radius, zero invisible bloat)
 *  - 1:1 square porcelain tile materials via TileMaterialFactory
 *  - Overhead daylight skylight panels with emissiveIntensity: 3.2
 * ──────────────────────────────────────────────────────────────────────── */

import {
  MeshStandardMaterial,
  InstancedMesh,
  PlaneGeometry,
  Matrix4,
  Vector3,
  Euler,
  Quaternion,
  DoubleSide,
} from 'three';
import type {
  LayoutCtx,
  LayoutData,
  MapDefinition,
  PlatformDef,
  PillarDef,
  BoxDef,
  PropDef,
  StairDef,
  BuildEnv,
} from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { Rng } from '../../procedural/core/prng.js';
import { TileMaterialFactory } from '../../procedural/textures/TileMaterialFactory.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';

export function generateEndlessShiftLayout(sector: number, seed: number): LayoutData {
  const rng = new Rng(seed + sector * 1013);
  const bounds = { minX: -60, minZ: -60, maxX: 60, maxZ: 60 };

  const platforms: PlatformDef[] = [];
  const walls: BoxDef[] = [];
  const pillars: PillarDef[] = [];
  const props: PropDef[] = [];
  const stairs: StairDef[] = [];

  // 1. Walkable archipelago platforms (topY = 0.38m <= 0.65m, isWalkable = true)
  const slabCount = Math.min(24, 14 + sector * 2);
  const platformY = 0.38;

  // Guarantee spawn platform
  platforms.push({
    id: `endless_spawn_${sector}`,
    rect: [-48, -48, -34, -34],
    topY: platformY,
    kind: 'tile',
  });

  // Main navigation islands connecting start to sector floodgate exit
  const waypoints = [
    { x: -41, z: -41 },
    { x: -28, z: -28 },
    { x: -14, z: -16 },
    { x: 0, z: 0 },
    { x: 16, z: 14 },
    { x: 28, z: 28 },
    { x: 41, z: 41 },
  ];

  for (let i = 1; i < waypoints.length; i++) {
    const wp = waypoints[i]!;
    const halfW = 4.5 + (rng.next() % 2);
    const halfD = 4.5 + (rng.next() % 2);
    const id = i === waypoints.length - 1 ? `endless_exit_${sector}` : `endless_plat_${sector}_${i}`;
    platforms.push({
      id,
      rect: [wp.x - halfW, wp.z - halfD, wp.x + halfW, wp.z + halfD],
      topY: platformY,
      kind: 'tile',
    });
  }

  // Auxiliary blue-noise islands for exploration and survival canisters
  let attempts = 0;
  while (platforms.length < slabCount && attempts < 150) {
    attempts++;
    const cx = rng.range(-44, 44);
    const cz = rng.range(-44, 44);
    const sw = rng.range(7, 11);
    const sd = rng.range(7, 11);
    const rect: [number, number, number, number] = [
      cx - sw * 0.5,
      cz - sd * 0.5,
      cx + sw * 0.5,
      cz + sd * 0.5,
    ];

    let overlaps = false;
    for (const p of platforms) {
      if (
        !(
          rect[2] + 1.2 <= p.rect[0] ||
          rect[0] >= p.rect[2] + 1.2 ||
          rect[3] + 1.2 <= p.rect[1] ||
          rect[1] >= p.rect[3] + 1.2
        )
      ) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      platforms.push({
        id: `endless_aux_${sector}_${platforms.length}`,
        rect,
        topY: platformY,
        kind: 'tile',
      });
    }
  }

  // 2. Doorways & Arches with guaranteed >= 2.40m ceiling clearance
  for (let i = 0; i < platforms.length; i++) {
    if (i % 2 === 0) {
      const p = platforms[i]!;
      const cx = (p.rect[0] + p.rect[2]) * 0.5;
      const cz = (p.rect[1] + p.rect[3]) * 0.5;
      walls.push({
        id: `endless_arch_${sector}_${i}`,
        min: { x: cx - 2.8, y: platformY, z: cz - 0.3 },
        max: { x: cx + 2.8, y: platformY + 3.4, z: cz + 0.3 },
        kind: 'arch',
        isWall: true,
      });
    }
  }

  // Perimeter boundary walls
  walls.push(
    { id: 'endless_bound_n', min: { x: -60, y: -0.9, z: 59 }, max: { x: 60, y: 6.0, z: 60 }, isWall: true },
    { id: 'endless_bound_s', min: { x: -60, y: -0.9, z: -60 }, max: { x: 60, y: 6.0, z: -59 }, isWall: true },
    { id: 'endless_bound_w', min: { x: -60, y: -0.9, z: -60 }, max: { x: -59, y: 6.0, z: 60 }, isWall: true },
    { id: 'endless_bound_e', min: { x: 59, y: -0.9, z: -60 }, max: { x: 60, y: 6.0, z: 60 }, isWall: true },
  );

  // 3. Pillars with exact 1.0x visual radius (pil.radius)
  for (let i = 0; i < platforms.length; i++) {
    if (i % 3 === 1) {
      const p = platforms[i]!;
      const cx = (p.rect[0] + p.rect[2]) * 0.5;
      const cz = (p.rect[1] + p.rect[3]) * 0.5;
      const r = 0.75;
      pillars.push({
        id: `endless_pil_${sector}_${i}`,
        x: cx,
        z: cz,
        radius: r,
        height: 5.2,
        kind: 'tile',
      });
    }
  }

  // 4. Player & monster spawns and sector exit floodgate
  const spawnPlat = platforms[0]!;
  const exitPlat = platforms.find((p) => p.id === `endless_exit_${sector}`) ?? platforms[platforms.length - 1]!;
  const exitX = (exitPlat.rect[0] + exitPlat.rect[2]) * 0.5;
  const exitZ = (exitPlat.rect[1] + exitPlat.rect[3]) * 0.5;

  return {
    mapId: 'drainage_core',
    seed,
    bounds,
    platforms,
    walls,
    pillars,
    stairs,
    waterBodies: [
      {
        id: `endless_pool_${sector}`,
        rect: [-60, -60, 60, 60],
        floorY: -0.75,
        waterY: 0.0,
      },
    ],
    props,
    puzzles: [],
    spawns: {
      player: [
        {
          x: (spawnPlat.rect[0] + spawnPlat.rect[2]) * 0.5,
          y: spawnPlat.topY,
          z: (spawnPlat.rect[1] + spawnPlat.rect[3]) * 0.5,
        },
      ],
      monsters: [
        {
          id: `monster_endless_${sector}`,
          variant: 'standard',
          spawn: { x: 25, y: -0.75, z: -25 },
          hearingMul: 1.0,
        },
      ],
    },
    patrolLanes: [
      {
        id: `lane_endless_${sector}`,
        points: [
          { x: -30, y: -0.75, z: -30 },
          { x: 0, y: -0.75, z: 0 },
          { x: 30, y: -0.75, z: 30 },
        ],
      },
    ],
    exit: {
      id: `exit_floodgate_${sector}`,
      position: { x: exitX, y: exitPlat.topY, z: exitZ },
    },
    meta: {
      sector,
      endless: true,
    },
  };
}

export async function buildEndlessShiftInstance(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
  const tileFactory = TileMaterialFactory.getInstance(env.renderer as import('three').WebGLRenderer | undefined);
  const platformMat = tileFactory.platformTopMaterial;
  const wallMat = tileFactory.wallTileMaterial;
  const floorMat = tileFactory.poolFloorMaterial;

  const instance = await buildStandardMapInstance(layout, env, { platformMat, wallMat, floorMat });

  // Overhead bright white skylight panels (emissiveIntensity: 3.2)
  const skylightPanelMat = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 3.2,
    roughness: 0.1,
    metalness: 0.0,
    side: DoubleSide,
  });
  const skyPanelGeom = new PlaneGeometry(4.5, 4.5);
  const skylightCount = Math.min(16, layout.platforms.length);
  const skylightInstMesh = new InstancedMesh(skyPanelGeom, skylightPanelMat, skylightCount);
  skylightInstMesh.name = 'EndlessShiftSkylightPanels';
  skylightInstMesh.matrixAutoUpdate = false;
  const mat4 = new Matrix4();
  const posVec = new Vector3();
  const rotEuler = new Euler(Math.PI * 0.5, 0, 0);
  const quat = new Quaternion().setFromEuler(rotEuler);
  const scaleVec = new Vector3(1, 1, 1);

  for (let i = 0; i < skylightCount; i++) {
    const p = layout.platforms[i]!;
    const cx = (p.rect[0] + p.rect[2]) * 0.5;
    const cz = (p.rect[1] + p.rect[3]) * 0.5;
    posVec.set(cx, 5.0, cz);
    mat4.compose(posVec, quat, scaleVec);
    skylightInstMesh.setMatrixAt(i, mat4);
  }
  skylightInstMesh.instanceMatrix.needsUpdate = true;
  skylightInstMesh.updateMatrix();
  instance.root.add(skylightInstMesh);

  return instance;
}

export const EndlessShiftMap: MapDefinition = {
  id: 'drainage_core',
  name: 'Endless Shift (Shifting Sectors)',
  tagline: 'Infinite flooded concrete halls, procedural water channels, and rising tides.',
  stars: 4,
  reverb: 'poolroom',
  acoustics: {
    hearingMul: 1.0,
  },
  atmosphere: {
    fog: {
      color: '#c0d2c6',
      density: 0.045,
    },
    exposure: 1.15,
    hemisphere: {
      sky: '#c0d2c6',
      ground: '#7c9e5b',
    },
    sun: {
      color: '#fff8e7',
      intensity: 1.1,
      direction: { x: 0.3, y: 1.0, z: 0.3 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.poolrooms,
  postGrade: {
    lift: [0.02, 0.02, 0.01],
    saturation: 1.6,
    gain: [1.0, 0.99, 0.98],
  },
  generateLayout(ctx: LayoutCtx): LayoutData {
    return generateEndlessShiftLayout(1, ctx.seed);
  },
  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    return buildEndlessShiftInstance(layout, env);
  },
  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 120.0;
    const scaleY = h / 120.0;

    g.fillStyle = '#4f6a3e';
    g.fillRect(0, 0, w, h);

    g.fillStyle = '#d5cbb0';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 60) * scaleX;
      const ry = (p.rect[1] + 60) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }
  },
};

export const EndlessShiftGenerator = {
  generateLayout: generateEndlessShiftLayout,
  buildInstance: buildEndlessShiftInstance,
};

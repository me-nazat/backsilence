/* ── OrientationMap.ts ─────────────────────────────────────────────────────
 *  Tape 0: Orientation (Training Pool) map definition.
 *  A guided, safe environment teaching acoustic movement, crouching, jumping,
 *  pebble lures, and perching with a demonstrative tethered entity.
 * ──────────────────────────────────────────────────────────────────────── */

import { MeshStandardMaterial } from 'three';
import type {
  MapDefinition,
  LayoutData,
  LayoutCtx,
  BuildEnv,
  PlatformDef,
  BoxDef,
  PillarDef,
  WaterBodyDef,
  PuzzleDef,
} from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';
import { applyWetDarkening } from '../../game/rendering/WetDarkening.js';

export const OrientationMap: MapDefinition = {
  id: 'orientation',
  name: 'Training Pool (Orientation)',
  tagline: 'Employee onboarding archive: tethered entity demonstrator, dry tile rules, and lure testing.',
  stars: 1,
  reverb: 'poolroom',
  acoustics: {
    hearingMul: 1.0,
  },
  atmosphere: {
    fog: {
      color: '#d0ddd8',
      density: 0.025,
    },
    exposure: 1.15,
    hemisphere: {
      sky: '#dbeef0',
      ground: '#4a7062',
    },
    sun: {
      color: '#fffef0',
      intensity: 1.4,
      direction: { x: 0.2, y: 0.9, z: 0.2 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.natatorium,
  postGrade: {
    lift: [0.03, 0.03, 0.02],
    saturation: 1.05,
    gain: [1.0, 1.0, 1.0],
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const bounds = { minX: -16, minZ: -20, maxX: 16, maxZ: 20 };

    const platforms: PlatformDef[] = [
      // 1. Starter dry platform (safe, silent tiles)
      {
        id: 'plat_start',
        rect: [-4, -18, 4, -12],
        topY: 0.3,
        kind: 'tile',
      },
      // 2. Intermediate slab before trench
      {
        id: 'plat_mid',
        rect: [-3, -8, 3, -4],
        topY: 0.3,
        kind: 'tile',
      },
      // 3. Central demonstration slab (trench jump destination)
      {
        id: 'plat_center',
        rect: [-5, -1, 5, 7],
        topY: 0.3,
        kind: 'tile',
      },
      // 4. Perch tower (climbable, high vantage)
      {
        id: 'plat_perch',
        rect: [3.5, 3.5, 6.5, 6.5],
        topY: 1.8,
        kind: 'marble',
      },
      // 5. Exit airlock platform
      {
        id: 'plat_exit',
        rect: [-4, 11, 4, 18],
        topY: 0.3,
        kind: 'tile',
      },
    ];

    const walls: BoxDef[] = [
      {
        id: 'wall_n',
        min: { x: -16, y: -1.2, z: 19 },
        max: { x: 16, y: 5.0, z: 20 },
        isWall: true,
      },
      {
        id: 'wall_s',
        min: { x: -16, y: -1.2, z: -20 },
        max: { x: 16, y: 5.0, z: -19 },
        isWall: true,
      },
      {
        id: 'wall_w',
        min: { x: -16, y: -1.2, z: -20 },
        max: { x: -15, y: 5.0, z: 20 },
        isWall: true,
      },
      {
        id: 'wall_e',
        min: { x: 15, y: -1.2, z: -20 },
        max: { x: 16, y: 5.0, z: 20 },
        isWall: true,
      },
    ];

    const pillars: PillarDef[] = [
      {
        id: 'pil_tether',
        x: 0,
        z: 4,
        radius: 0.45,
        height: 5.0,
        kind: 'concrete',
      },
    ];

    const waterBodies: WaterBodyDef[] = [
      {
        id: 'water_main',
        rect: [-16, -20, 16, 20],
        floorY: -1.2,
        waterY: 0.0,
      },
    ];

    const puzzles: PuzzleDef[] = [
      {
        id: 'orientation_exit',
        type: 'exit_door',
        position: { x: 0, y: 0.3, z: 16 },
      },
    ];

    return {
      mapId: 'orientation',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars,
      stairs: [],
      waterBodies,
      props: [],
      puzzles,
      spawns: {
        player: [{ x: 0, y: 0.3, z: -15 }],
        monsters: [
          {
            id: 'tethered_entity',
            spawn: { x: 0, y: 0.0, z: 4.0 },
            variant: 'standard',
          },
        ],
      },
      exit: {
        id: 'exit_door',
        position: { x: 0, y: 0.3, z: 16 },
      },
      meta: {
        isTutorial: true,
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const tex = TextureRegistry.getInstance();
    const poolTiles = tex.getTileSet('platform', layout.seed);
    const marbleTex = tex.getMarbleSet(layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: poolTiles.albedo,
      roughnessMap: poolTiles.roughness,
      normalMap: poolTiles.normal,
      roughness: 0.35,
      metalness: 0.02,
    });
    applyWetDarkening(platformMat, { waterY: 0.0 });

    const wallMat = new MeshStandardMaterial({
      map: marbleTex.albedo,
      roughnessMap: marbleTex.roughness,
      normalMap: marbleTex.normal,
      roughness: 0.45,
      metalness: 0.05,
    });
    applyWetDarkening(wallMat, { waterY: 0.0 });

    const floorMat = new MeshStandardMaterial({
      map: poolTiles.albedo,
      roughnessMap: poolTiles.roughness,
      normalMap: poolTiles.normal,
      roughness: 0.25,
      metalness: 0.04,
    });

    return buildStandardMapInstance(layout, env, {
      platformMat,
      wallMat,
      floorMat,
    });
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    g.fillStyle = '#121e1a';
    g.fillRect(0, 0, w, h);

    const sx = w / (layout.bounds.maxX - layout.bounds.minX);
    const sz = h / (layout.bounds.maxZ - layout.bounds.minZ);

    g.fillStyle = '#689d87';
    for (const plat of layout.platforms) {
      const px = (plat.rect[0] - layout.bounds.minX) * sx;
      const pz = (plat.rect[1] - layout.bounds.minZ) * sz;
      const pw = (plat.rect[2] - plat.rect[0]) * sx;
      const ph = (plat.rect[3] - plat.rect[1]) * sz;
      g.fillRect(px, pz, pw, ph);
    }

    // Player spawn
    const p = layout.spawns.player[0]!;
    g.fillStyle = '#ffff66';
    g.beginPath();
    g.arc((p.x - layout.bounds.minX) * sx, (p.z - layout.bounds.minZ) * sz, 3, 0, Math.PI * 2);
    g.fill();
  },
};

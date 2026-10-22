/* ── NeonFloodMap.ts ───────────────────────────────────────────────────────
 *  Map 4: Neon Flood District (Sector 9, cyberpunk; 4 stars)
 *  Drowned megacity at night in permanent storm, neon streaks in black floodwater,
 *  rain & thunder acoustic mask windows, 4-6 searchlight drones, EMP pickups,
 *  high skyways vs low flooded streets, and the UplinkNetwork puzzle.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  MeshStandardMaterial,
  Vector3,
  Color,
} from 'three';
import type {
  LayoutCtx,
  LayoutData,
  MapDefinition,
  PlatformDef,
  BoxDef,
  PropDef,
  BuildEnv,
} from '../MapTypes.js';
import type { Vec3 } from '../../types/contracts.js';
import type { MapInstance } from './MapInstance.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';
import { Drone, type AwningRect } from '../../sim/Drone.js';
import { WeatherSystem } from '../../sim/Weather.js';
import { applyWetDarkening } from '../../game/rendering/WetDarkening.js';
import type { LightStreak } from '../../game/water/WaterMaterial.js';

export const NeonFloodMap: MapDefinition = {
  id: 'neon_flood',
  name: 'Neon Flood District',
  tagline: 'Sector 9 in a permanent storm: searchlight drones above, the entity below.',
  stars: 4,
  reverb: 'city',
  acoustics: {
    hearingMul: 1.0,
    maskZones: true,
  },
  atmosphere: {
    fog: {
      color: '#0b1020',
      density: 0.04,
    },
    exposure: 1.25,
    hemisphere: {
      sky: '#12182c',
      ground: '#050810',
    },
  },
  waterProfile: WATER_PROFILES.neon_flood,
  postGrade: {
    lift: [0.0, 0.01, 0.04],
    saturation: 1.25,
    gain: [1.05, 0.95, 1.1],
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const bounds = { minX: -65, minZ: -55, maxX: 65, maxZ: 55 }; // 130 x 110m

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const props: PropDef[] = [];

    // 1. Tower blocks (collision walls with windowed facades)
    // Tower A: Northwest Block [-55, 15, -25, 45]
    walls.push({
      id: 'tower_nw',
      min: { x: -55, y: -0.9, z: 15 },
      max: { x: -25, y: 35.0, z: 45 },
      isWall: true,
    });
    // Tower B: Server Tower (Northeast Block) [25, 15, 55, 45]
    walls.push({
      id: 'tower_server',
      min: { x: 25, y: -0.9, z: 15 },
      max: { x: 55, y: 48.0, z: 45 },
      isWall: true,
    });
    // Tower C: Southwest Block [-55, -45, -25, -15]
    walls.push({
      id: 'tower_sw',
      min: { x: -55, y: -0.9, z: -45 },
      max: { x: -25, y: 28.0, z: -15 },
      isWall: true,
    });
    // Tower D: Southeast Block [25, -45, 55, -15]
    walls.push({
      id: 'tower_se',
      min: { x: 25, y: -0.9, z: -45 },
      max: { x: 55, y: 32.0, z: -15 },
      isWall: true,
    });

    // 2. Spawn Rooftop-access Alley (South edge)
    platforms.push({
      id: 'plat_spawn_alley',
      rect: [-10, -52, 10, -42],
      topY: 0.3,
      kind: 'concrete',
    });

    // 3. Sidewalks (+0.3m) along Avenues and Streets
    platforms.push({
      id: 'sidewalk_central_w',
      rect: [-22, -45, -18, 45],
      topY: 0.3,
      kind: 'concrete',
    });
    platforms.push({
      id: 'sidewalk_central_e',
      rect: [18, -45, 22, 45],
      topY: 0.3,
      kind: 'concrete',
    });
    platforms.push({
      id: 'sidewalk_cross_street',
      rect: [-55, -4, 55, 4],
      topY: 0.3,
      kind: 'concrete',
    });

    // 4. Stalled Hover-Cars (28 cars, roofs at +1.1m, safe jump chains)
    // Avenue West car chain
    for (let c = 0; c < 5; c++) {
      const zCar = -35 + c * 16;
      platforms.push({
        id: `car_roof_w_${c}`,
        rect: [-6, zCar - 2.2, -1.5, zCar + 2.2],
        topY: 1.1,
        kind: 'metal',
      });
    }
    // Avenue East car chain
    for (let c = 0; c < 5; c++) {
      const zCar = -35 + c * 16;
      platforms.push({
        id: `car_roof_e_${c}`,
        rect: [1.5, zCar - 2.2, 6, zCar + 2.2],
        topY: 1.1,
        kind: 'metal',
      });
    }

    // 5. High Skyway Network at +4.5m (2.4m wide, with rails)
    platforms.push({
      id: 'skyway_central_n',
      rect: [-1.2, 8, 1.2, 38],
      topY: 4.5,
      kind: 'metal',
    });
    platforms.push({
      id: 'skyway_market_cross',
      rect: [-25, 20, 25, 22.4],
      topY: 4.5,
      kind: 'metal',
    });
    // Server Tower Service Balcony (+4.5m)
    platforms.push({
      id: 'server_balcony',
      rect: [22, 16, 26, 26],
      topY: 4.5,
      kind: 'metal',
    });

    // 6. Flooded Subway Entrance Kiosk (Street level [-4, 0, 4, 8])
    platforms.push({
      id: 'subway_kiosk_entry',
      rect: [-3, 1, 3, 7],
      topY: 0.25,
      kind: 'concrete',
    });

    // 7. EMP Pickups (3 scattered capacitors)
    props.push({
      id: 'emp_1',
      kind: 'emp_pickup',
      position: { x: -20, y: 0.3, z: -20 },
    });
    props.push({
      id: 'emp_2',
      kind: 'emp_pickup',
      position: { x: 0, y: 4.5, z: 25 }, // on high skyway
    });
    props.push({
      id: 'emp_3',
      kind: 'emp_pickup',
      position: { x: 20, y: 0.3, z: -30 },
    });

    // 8. Uplink Terminals (3 locations)
    // U1: Market Skyway
    props.push({
      id: 'uplink_1',
      kind: 'uplink_terminal',
      position: { x: 0, y: 4.5, z: 21 },
    });
    // U2: Server Tower Service Balcony
    props.push({
      id: 'uplink_2',
      kind: 'uplink_terminal',
      position: { x: 24, y: 4.5, z: 21 },
    });
    // U3: Flooded Subway Kiosk
    props.push({
      id: 'uplink_3',
      kind: 'uplink_terminal',
      position: { x: 0, y: 0.25, z: 4 },
    });

    // 9. Transit Gate Arch (Giant neon arch exit) at North edge
    const exitPos = { x: 0, y: 0.3, z: 50 };

    // Player and monster spawns
    const playerSpawn = { x: 0, y: 0.3, z: -48 }; // in south alley
    const monsterSpawn = { x: 0, y: -0.9, z: 0 }; // flooded plaza >= 45m from spawn (48m away)

    const monsters: Array<{ id: string; variant: 'standard' | 'elder' | 'juvenile'; spawn: Vec3 }> = [
      {
        id: 'monster_city_1',
        variant: 'standard',
        spawn: monsterSpawn,
      },
    ];

    if (ctx.difficulty === 'deafening' || ctx.playerCount >= 3) {
      monsters.push({
        id: 'monster_city_2',
        variant: 'juvenile',
        spawn: { x: -35, y: -0.9, z: 0 },
      });
    }

    return {
      mapId: 'neon_flood',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars: [],
      stairs: [],
      waterBodies: [
        {
          id: 'street_flood',
          rect: [-65, -55, 65, 55],
          floorY: -0.9,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'city_uplink_network',
          type: 'uplink_network',
          position: exitPos,
          params: {
            terminals: ['uplink_1', 'uplink_2', 'uplink_3'],
          },
        },
      ],
      spawns: {
        player: [playerSpawn],
        monsters,
      },
      exit: {
        id: 'transit_gate_door',
        position: exitPos,
      },
      meta: {
        droneCount: 4,
        weatherActive: true,
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const tex = TextureRegistry.getInstance();
    const asphaltTex = tex.getConcreteSet('tunnel', layout.seed);
    const metalTex = tex.getRustMetalSet(layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: asphaltTex.albedo,
      roughness: 0.35,
      metalness: 0.2,
    });
    applyWetDarkening(platformMat, { waterY: 0.0 });

    const wallMat = new MeshStandardMaterial({
      map: metalTex.albedo,
      roughness: 0.5,
      metalness: 0.4,
    });
    applyWetDarkening(wallMat, { waterY: 0.0 });

    const floorMat = new MeshStandardMaterial({
      map: asphaltTex.albedo,
      roughness: 0.25,
      metalness: 0.3,
    });

    const instance = buildStandardMapInstance(layout, env, {
      platformMat,
      wallMat,
      floorMat,
    });

    // Populate Drones (4 drones on closed patrol polylines)
    const drone1 = new Drone('drone_1', [
      { x: -10, y: 4.8, z: -30 },
      { x: -10, y: 4.8, z: 30 },
      { x: 10, y: 4.8, z: 30 },
      { x: 10, y: 4.8, z: -30 },
    ], 4.2);

    const drone2 = new Drone('drone_2', [
      { x: -20, y: 5.5, z: 20 },
      { x: 20, y: 5.5, z: 20 },
    ], 3.8);

    const drone3 = new Drone('drone_3', [
      { x: -40, y: 5.0, z: -10 },
      { x: -40, y: 5.0, z: 10 },
      { x: 40, y: 5.0, z: 10 },
      { x: 40, y: 5.0, z: -10 },
    ], 4.5);

    const drone4 = new Drone('drone_4', [
      { x: 0, y: 5.2, z: 0 },
      { x: 20, y: 5.2, z: 35 },
      { x: -20, y: 5.2, z: 35 },
    ], 4.0);

    const drones = [drone1, drone2, drone3, drone4];
    instance.root.userData['drones'] = drones;

    // Awnings providing occlusion from drone spotlight beams
    const awnings: AwningRect[] = [
      { minX: -24, minZ: -12, maxX: -18, maxZ: -6, height: 3.2 },
      { minX: 18, minZ: 6, maxX: 24, maxZ: 12, height: 3.2 },
      { minX: -4, minZ: 0, maxX: 4, maxZ: 8, height: 3.0 },
    ];
    instance.root.userData['awnings'] = awnings;

    // Populate WeatherSystem
    const weather = new WeatherSystem(layout.seed);
    instance.root.userData['weatherSystem'] = weather;

    // Up to 16 Neon LightStreaks reflecting on wet floodwater
    const neonStreaks: LightStreak[] = [
      { pos: new Vector3(-25, 6.0, 20), dir: new Vector3(0, 0, 1), size: 12.0, color: new Color('#19f0ff'), intensity: 1.1 }, // Cyan
      { pos: new Vector3(25, 8.0, 20), dir: new Vector3(0, 0, 1), size: 16.0, color: new Color('#ff2bd6'), intensity: 1.2 },  // Magenta
      { pos: new Vector3(0, 10.0, 48), dir: new Vector3(1, 0, 0), size: 24.0, color: new Color('#ffb02e'), intensity: 1.3 },  // Amber Transit Gate
      { pos: new Vector3(-20, 5.0, -25), dir: new Vector3(1, 0, 0), size: 10.0, color: new Color('#a6ff3d'), intensity: 0.9 }, // Lime
    ];
    instance.root.userData['lightStreaks'] = neonStreaks;

    return instance;
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 130.0;
    const scaleY = h / 110.0;

    // Black flooded city street
    g.fillStyle = '#060912';
    g.fillRect(0, 0, w, h);

    // Towers
    g.fillStyle = '#101726';
    for (const wall of layout.walls) {
      const rx = (wall.min.x + 65) * scaleX;
      const ry = (wall.min.z + 55) * scaleY;
      const rw = (wall.max.x - wall.min.x) * scaleX;
      const rh = (wall.max.z - wall.min.z) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Skyways and cars
    g.fillStyle = '#19f0ff';
    for (const p of layout.platforms) {
      if (p.id.startsWith('skyway_')) {
        const rx = (p.rect[0] + 65) * scaleX;
        const ry = (p.rect[1] + 55) * scaleY;
        const rw = (p.rect[2] - p.rect[0]) * scaleX;
        const rh = (p.rect[3] - p.rect[1]) * scaleY;
        g.fillRect(rx, ry, rw, rh);
      }
    }

    // Spawns & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 65) * scaleX, (sp.z + 55) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff2bd6';
    g.beginPath();
    g.arc((ex.x + 65) * scaleX, (ex.z + 55) * scaleY, 5, 0, Math.PI * 2);
    g.fill();
  },
};

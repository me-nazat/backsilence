/* ── DrownedMetroMap.ts ───────────────────────────────────────────────────
 *  Map 5: Platform Zero, the Drowned Metro (event map; 5 stars)
 *  Vaulted tiled underground station flooded to platform edges (+1.0m),
 *  stalled 6-car train as a dry refuge corridor, throwable glass bottles,
 *  scheduled Ghost Train kill zone & 45s monster stun, and the SignalAndDepart puzzle.
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
import { GhostTrain } from '../../sim/GhostTrain.js';
import { applyWetDarkening } from '../../game/rendering/WetDarkening.js';
import type { LightStreak } from '../../game/water/WaterMaterial.js';

export const DrownedMetroMap: MapDefinition = {
  id: 'drowned_metro',
  name: 'Platform Zero, the Drowned Metro',
  tagline: 'Flooded tracks, a stalled train, and the scheduled Ghost Train in express.',
  stars: 5,
  reverb: 'station',
  acoustics: {
    hearingMul: 1.15,
    maskZones: true,
  },
  atmosphere: {
    fog: {
      color: '#a9b2a8',
      density: 0.04,
    },
    exposure: 1.0,
    hemisphere: {
      sky: '#7a8578',
      ground: '#1f2520',
    },
    sun: {
      color: '#e0eee5',
      intensity: 0.8,
      direction: { x: 0.2, y: 0.9, z: 0.1 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.drowned_metro,
  postGrade: {
    lift: [0.02, 0.03, 0.02],
    saturation: 0.95,
    gain: [0.98, 1.02, 0.96],
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const bounds = { minX: -90, minZ: -30, maxX: 90, maxZ: 30 }; // 180 x 60m

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const props: PropDef[] = [];

    // 1. Station Enclosure & Outer Vault Walls
    walls.push({
      id: 'wall_metro_south',
      min: { x: -90, y: -0.9, z: -25 },
      max: { x: 90, y: 7.0, z: -24 },
      isWall: true,
    });
    walls.push({
      id: 'wall_metro_north',
      min: { x: -90, y: -0.9, z: 24 },
      max: { x: 90, y: 7.0, z: 25 },
      isWall: true,
    });
    // Tunnel mouth walls at West & East
    walls.push({
      id: 'wall_tunnel_west',
      min: { x: -90, y: -0.9, z: -25 },
      max: { x: -88, y: 7.0, z: 25 },
      isWall: true,
    });
    walls.push({
      id: 'wall_tunnel_east',
      min: { x: 88, y: -0.9, z: -25 },
      max: { x: 90, y: 7.0, z: 25 },
      isWall: true,
    });

    // 2. High Platforms (+1.0m dry height)
    // Platform P1 (South) [-60, -14, 60, -8]
    platforms.push({
      id: 'plat_p1_south',
      rect: [-60, -14, 60, -8],
      topY: 1.0,
      kind: 'concrete',
    });

    // Island Platform P2 (Center) [-60, -8, 60, 0]
    platforms.push({
      id: 'plat_p2_island',
      rect: [-60, -8, 60, 0],
      topY: 1.0,
      kind: 'concrete',
    });

    // Platform P3 (North) [-60, 10, 60, 18]
    platforms.push({
      id: 'plat_p3_north',
      rect: [-60, 10, 60, 18],
      topY: 1.0,
      kind: 'concrete',
    });

    // 3. Stalled Train Cars in Trough T1 [-60, -24, 60, -14]
    // 6-car stalled train centered along z = -19, top at +1.3m (dry interior refuge)
    for (let car = 0; car < 6; car++) {
      const xCar = -50 + car * 20;
      platforms.push({
        id: `stalled_train_car_${car}`,
        rect: [xCar - 9, -21, xCar + 9, -17],
        topY: 1.3,
        kind: 'metal',
        style: 'subway_car',
      });
    }

    // 4. Cross-over Footbridges (+3.0m) at x = -40, 0, 40 bridging P1, P2, P3
    const bridgeX = [-40, 0, 40];
    for (let i = 0; i < bridgeX.length; i++) {
      const bx = bridgeX[i]!;
      platforms.push({
        id: `footbridge_${i}`,
        rect: [bx - 1.5, -14, bx + 1.5, 18],
        topY: 3.0,
        kind: 'metal',
        style: 'bridge_truss',
      });
    }

    // 5. Mezzanine / Ticket Hall (+4.2m) above P3
    platforms.push({
      id: 'plat_mezzanine',
      rect: [-25, 18, 25, 24],
      topY: 4.2,
      kind: 'marble',
    });

    const pillars: Array<{ id: string; x: number; z: number; radius: number; height: number; kind?: 'tile' | 'marble' | 'concrete' }> = [];
    for (let x = -48; x <= 48; x += 16) {
      pillars.push({
        id: `col_p1_${x}`,
        x,
        z: -11,
        radius: 0.42,
        height: 6.0,
        kind: 'tile',
      });
      pillars.push({
        id: `col_p2_${x}`,
        x,
        z: -4,
        radius: 0.42,
        height: 6.0,
        kind: 'tile',
      });
      pillars.push({
        id: `col_p3_${x}`,
        x,
        z: 14,
        radius: 0.42,
        height: 6.0,
        kind: 'tile',
      });
    }

    const stairs: Array<{
      id: string;
      x: number;
      z: number;
      width: number;
      riser: number;
      run: number;
      steps: number;
      baseY: number;
      direction: 'x+' | 'x-' | 'z+' | 'z-';
    }> = [
      {
        id: 'stairs_p3_to_mezz_west',
        x: -18,
        z: 14.5,
        width: 2.2,
        riser: 0.228,
        run: 0.28,
        steps: 14,
        baseY: 1.0,
        direction: 'z+',
      },
      {
        id: 'stairs_p3_to_mezz_east',
        x: 18,
        z: 14.5,
        width: 2.2,
        riser: 0.228,
        run: 0.28,
        steps: 14,
        baseY: 1.0,
        direction: 'z+',
      },
    ];

    // 6. Conductor's Cabin at East end of P1 [50, -14, 60, -8]
    platforms.push({
      id: 'conductor_cabin',
      rect: [50, -14, 60, -8],
      topY: 1.0,
      kind: 'concrete',
    });

    // 7. Express Track Refuge Alcoves in Trough T2 (Kill Zone refuge every 20m)
    // Kill zone is z in [3.4, 6.6]. Alcoves sit at z in [7.0, 9.8] along North side of T2
    const alcoveX = [-40, -20, 0, 20, 40];
    for (let i = 0; i < alcoveX.length; i++) {
      const ax = alcoveX[i]!;
      platforms.push({
        id: `refuge_alcove_${i}`,
        rect: [ax - 1.8, 7.0, ax + 1.8, 9.8],
        topY: 0.25,
        kind: 'concrete',
      });
    }

    // 8. Throwable Glass Bottles (6 items scattered on benches/cabin)
    const bottlePositions = [
      { x: -35, y: 1.0, z: -10 },
      { x: -10, y: 1.0, z: -4 },
      { x: 15, y: 1.0, z: -10 },
      { x: 35, y: 1.0, z: -4 },
      { x: -5, y: 4.2, z: 20 },
      { x: 55, y: 1.0, z: -11 },
    ];
    for (let b = 0; b < bottlePositions.length; b++) {
      const bp = bottlePositions[b]!;
      props.push({
        id: `bottle_${b}`,
        kind: 'bottle',
        position: { x: bp.x, y: bp.y, z: bp.z },
      });
    }

    // 9. Levers (L1 at west T1, L2 at east T2 next to refuge alcove)
    props.push({
      id: 'lever_1',
      kind: 'track_lever',
      position: { x: -45, y: -0.9, z: -19 },
    });
    props.push({
      id: 'lever_2',
      kind: 'track_lever',
      position: { x: 38, y: -0.9, z: 5.0 }, // directly next to refuge_alcove_4 (x = 40, z = 7)
    });

    // Conductor's Key in cabin
    props.push({
      id: 'conductor_key',
      kind: 'conductor_key',
      position: { x: 55, y: 1.0, z: -11 },
    });

    // Stalled Train Driver's Cab (depart node) at car 5 [45, 1.3, -19]
    const cabPos = { x: 45, y: 1.3, z: -19 };

    // Player spawn on Platform P1
    const playerSpawn = { x: 10, y: 1.0, z: -11 };
    // Monster spawn in flooded west end of T1 (>= 45m from player spawn)
    const monsterSpawn = { x: -45, y: -0.9, z: -19 };

    const monsters: Array<{ id: string; variant: 'standard' | 'elder' | 'juvenile'; spawn: Vec3; sleeperSpawn?: Vec3 }> = [
      {
        id: 'monster_metro_1',
        variant: 'standard',
        spawn: monsterSpawn,
        sleeperSpawn: { x: -14, y: -0.9, z: -19 },
      },
    ];

    if (ctx.difficulty === 'deafening' || ctx.playerCount >= 3) {
      monsters.push({
        id: 'monster_metro_2',
        variant: 'juvenile',
        spawn: { x: 20, y: -0.9, z: 5.0 },
      });
    }

    return {
      mapId: 'drowned_metro',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars,
      stairs,
      waterBodies: [
        {
          id: 'metro_track_beds',
          rect: [-90, -25, 90, 25],
          floorY: -0.9,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'metro_signal_and_depart',
          type: 'signal_and_depart',
          position: cabPos,
          params: {
            levers: ['lever_1', 'lever_2'],
            cabPos,
          },
        },
      ],
      spawns: {
        player: [playerSpawn],
        monsters,
      },
      patrolLanes: [
        {
          id: 'metro_track_1',
          points: [
            { x: 5, y: -0.9, z: -19 },
            { x: -14, y: -0.9, z: -19 },
            { x: -30, y: -0.9, z: -19 },
            { x: 20, y: -0.9, z: -19 },
            { x: 40, y: -0.9, z: -19 },
          ],
        },
      ],
      exit: {
        id: 'train_cab_exit',
        position: cabPos,
      },
      meta: {
        ghostTrainPeriod: 85,
        killZoneZ: [3.4, 6.6],
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const tex = TextureRegistry.getInstance();
    const subwayTileTex = tex.getTileSet('wall', layout.seed);
    const concreteTex = tex.getConcreteSet('tunnel', layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: concreteTex.albedo,
      roughnessMap: concreteTex.roughness,
      normalMap: concreteTex.normal,
      roughness: 0.5,
      metalness: 0.05,
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    applyWetDarkening(platformMat, { waterY: 0.0 });

    const wallMat = new MeshStandardMaterial({
      map: subwayTileTex.albedo,
      roughnessMap: subwayTileTex.roughness,
      normalMap: subwayTileTex.normal,
      aoMap: subwayTileTex.ao,
      aoMapIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.02,
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    applyWetDarkening(wallMat, { waterY: 0.0 });

    const floorMat = new MeshStandardMaterial({
      map: concreteTex.albedo,
      roughnessMap: concreteTex.roughness,
      normalMap: concreteTex.normal,
      roughness: 0.35,
      metalness: 0.1,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    const instance = buildStandardMapInstance(layout, env, {
      platformMat,
      wallMat,
      floorMat,
    });

    // Populate GhostTrain (period 85s, first at 45s)
    const ghostTrain = new GhostTrain(layout.seed);
    // Add refuge alcoves to GhostTrain
    for (const p of layout.platforms) {
      if (p.id.startsWith('refuge_alcove_')) {
        ghostTrain.addRefugeAlcove({
          minX: p.rect[0],
          minZ: p.rect[1],
          maxX: p.rect[2],
          maxZ: p.rect[3],
        });
      }
    }
    instance.root.userData['ghostTrain'] = ghostTrain;

    // Station light box light streaks on rippling flooded track water
    const lightStreaks: LightStreak[] = [
      { pos: new Vector3(-40, 3.5, -4), dir: new Vector3(1, 0, 0), size: 14.0, color: new Color('#e0eee5'), intensity: 0.8 },
      { pos: new Vector3(0, 3.5, -4), dir: new Vector3(1, 0, 0), size: 14.0, color: new Color('#e0eee5'), intensity: 0.8 },
      { pos: new Vector3(40, 3.5, -4), dir: new Vector3(1, 0, 0), size: 14.0, color: new Color('#e0eee5'), intensity: 0.8 },
    ];
    instance.root.userData['lightStreaks'] = lightStreaks;

    return instance;
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 180.0;
    const scaleY = h / 60.0;

    // Flooded track troughs background
    g.fillStyle = '#142624';
    g.fillRect(0, 0, w, h);

    // Platforms P1, P2, P3
    g.fillStyle = '#9aa59d';
    for (const p of layout.platforms) {
      if (p.id.startsWith('plat_p')) {
        const rx = (p.rect[0] + 90) * scaleX;
        const ry = (p.rect[1] + 30) * scaleY;
        const rw = (p.rect[2] - p.rect[0]) * scaleX;
        const rh = (p.rect[3] - p.rect[1]) * scaleY;
        g.fillRect(rx, ry, rw, rh);
      }
    }

    // Express kill track (T2, highlighted danger red zone)
    g.fillStyle = 'rgba(255, 59, 48, 0.25)';
    g.fillRect(0, (3.4 + 30) * scaleY, w, (6.6 - 3.4) * scaleY);

    // Stalled train cars
    g.fillStyle = '#657870';
    for (const p of layout.platforms) {
      if (p.id.startsWith('stalled_train_')) {
        const rx = (p.rect[0] + 90) * scaleX;
        const ry = (p.rect[1] + 30) * scaleY;
        const rw = (p.rect[2] - p.rect[0]) * scaleX;
        const rh = (p.rect[3] - p.rect[1]) * scaleY;
        g.fillRect(rx, ry, rw, rh);
      }
    }

    // Spawns & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 90) * scaleX, (sp.z + 30) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ffd60a';
    g.beginPath();
    g.arc((ex.x + 90) * scaleX, (ex.z + 30) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

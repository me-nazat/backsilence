/* ── DrainageCoreMap.ts ───────────────────────────────────────────────────
 *  Map 5: The Abyssal Drainage Core (Finale, 5 stars)
 *  Total darkness, glowing bioluminescent water and motes, flashlight + hand crank,
 *  nested concentric ring corridors, 3 generators in corner pump rooms, and 3 distinct monsters.
 * ──────────────────────────────────────────────────────────────────────── */

import { MeshStandardMaterial } from 'three';
import type { LayoutCtx, LayoutData, MapDefinition, PlatformDef, BoxDef, PropDef, StairDef, BuildEnv } from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';

export const DrainageCoreMap: MapDefinition = {
  id: 'drainage_core',
  name: 'The Abyssal Drainage Core',
  tagline: 'Total darkness and glowing bioluminescent water. Three blind entities hunt in the deep.',
  stars: 5,
  reverb: 'drain',
  acoustics: {
    hearingMul: 1.0,
  },
  atmosphere: {
    fog: {
      color: '#020706',
      density: 0.07,
    },
    exposure: 1.3,
    hemisphere: {
      sky: '#061a15',
      ground: '#010806',
    },
    sun: {
      color: '#3ff2c8',
      intensity: 0.05,
      direction: { x: 0.0, y: 1.0, z: 0.0 },
      castShadow: false,
    },
  },
  waterProfile: WATER_PROFILES.drainage_core,
  postGrade: {
    lift: [-0.03, -0.01, 0.0],
    tint: [0.92, 1.02, 1.05],
    saturation: 0.85,
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const bounds = { minX: -60, minZ: -60, maxX: 60, maxZ: 60 };

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const props: PropDef[] = [];
    const stairs: StairDef[] = [];

    // 1. Central Pit Rim Collider: 16 x 16m at (0, 0)
    // Blocked so players cannot fall into the bottomless drain shaft
    walls.push(
      { id: 'pit_rim_n', min: { x: -8, y: -0.9, z: 7.6 }, max: { x: 8, y: 1.5, z: 8.0 }, isWall: true },
      { id: 'pit_rim_s', min: { x: -8, y: -0.9, z: -8.0 }, max: { x: 8, y: 1.5, z: -7.6 }, isWall: true },
      { id: 'pit_rim_w', min: { x: -8.0, y: -0.9, z: -8 }, max: { x: -7.6, y: 1.5, z: 8 }, isWall: true },
      { id: 'pit_rim_e', min: { x: 7.6, y: -0.9, z: -8 }, max: { x: 8.0, y: 1.5, z: 8 }, isWall: true },
    );

    // Perimeter boundary walls enclosing the sector to eliminate distant voids
    walls.push(
      { id: 'bound_wall_n', min: { x: -60, y: -0.9, z: 59.5 }, max: { x: 60, y: 5.0, z: 60.5 }, isWall: true },
      { id: 'bound_wall_s', min: { x: -60, y: -0.9, z: -60.5 }, max: { x: 60, y: 5.0, z: -59.5 }, isWall: true },
      { id: 'bound_wall_w', min: { x: -60.5, y: -0.9, z: -60 }, max: { x: -59.5, y: 5.0, z: 60 }, isWall: true },
      { id: 'bound_wall_e', min: { x: 59.5, y: -0.9, z: -60 }, max: { x: 60.5, y: 5.0, z: 60 }, isWall: true },
    );

    // 2. Concentric Stepping-Stone Networks (Inner, Mid, Outer)
    // Replaced long uninterrupted footpaths with parkour stepping-stone pads separated by 2.5m–3.2m water gaps
    function addSteppingPads(
      prefix: string,
      start: number,
      end: number,
      fixedMin: number,
      fixedMax: number,
      isXAxis: boolean,
      padLen = 4.2,
      gapLen = 2.8,
    ): void {
      let cur = start;
      let padIdx = 1;
      while (cur + padLen <= end) {
        const next = cur + padLen;
        const rect: [number, number, number, number] = isXAxis
          ? [cur, fixedMin, next, fixedMax]
          : [fixedMin, cur, fixedMax, next];
        platforms.push({
          id: `${prefix}_pad_${padIdx}`,
          rect,
          topY: 0.3,
          kind: 'metal',
        });
        cur = next + gapLen;
        padIdx++;
      }
      if (cur < end && end - cur >= 1.5) {
        const rect: [number, number, number, number] = isXAxis
          ? [cur, fixedMin, end, fixedMax]
          : [fixedMin, cur, fixedMax, end];
        platforms.push({
          id: `${prefix}_pad_${padIdx}`,
          rect,
          topY: 0.3,
          kind: 'metal',
        });
      }
    }

    // Inner Ring: broken into stepping stone platform pads
    addSteppingPads('ring_in_n', -20, 20, 16, 18, true, 7.0, 2.8);
    addSteppingPads('ring_in_s', -20, 20, -18, -16, true, 7.0, 2.8);
    addSteppingPads('ring_in_w', -16, 16, -18, -16, false, 7.0, 2.8);
    addSteppingPads('ring_in_e', -16, 16, 16, 18, false, 7.0, 2.8);

    // Mid Ring: stepping stone platforms
    addSteppingPads('ring_mid_n', -36, 36, 32, 34.5, true, 7.5, 2.8);
    addSteppingPads('ring_mid_s', -36, 36, -34.5, -32, true, 7.5, 2.8);
    addSteppingPads('ring_mid_w_s', -32, -2.5, -34.5, -32, false, 6.8, 2.8);
    addSteppingPads('ring_mid_w_n', 2.5, 32, -34.5, -32, false, 6.8, 2.8);
    addSteppingPads('ring_mid_e_s', -32, -2.5, 32, 34.5, false, 6.8, 2.8);
    addSteppingPads('ring_mid_e_n', 2.5, 32, 32, 34.5, false, 6.8, 2.8);

    // Outer Ring: stepping stone platforms
    addSteppingPads('ring_out_n', -52, 52, 48, 50.5, true, 8.5, 3.0);
    addSteppingPads('ring_out_s', -52, 52, -50.5, -48, true, 8.5, 3.0);
    addSteppingPads('ring_out_w', -48, 48, -50.5, -48, false, 8.5, 3.0);
    addSteppingPads('ring_out_e', -48, 48, 48, 50.5, false, 8.5, 3.0);

    // 3. 4 Axial Spoke Catwalks connecting the rings (width 2.4m) with culvert water gaps (Prompt 5.3)
    const culvertHalf = 1.5;
    platforms.push(
      // North Spoke
      { id: 'spoke_north_1', rect: [-1.2, 18, 1.2, 25 - culvertHalf], topY: 0.3, kind: 'metal' },
      { id: 'spoke_north_2', rect: [-1.2, 25 + culvertHalf, 1.2, 41 - culvertHalf], topY: 0.3, kind: 'metal' },
      { id: 'spoke_north_3', rect: [-1.2, 41 + culvertHalf, 1.2, 48], topY: 0.3, kind: 'metal' },
      // South Spoke
      { id: 'spoke_south_1', rect: [-1.2, -48, 1.2, -41 - culvertHalf], topY: 0.3, kind: 'metal' },
      { id: 'spoke_south_2', rect: [-1.2, -41 + culvertHalf, 1.2, -25 - culvertHalf], topY: 0.3, kind: 'metal' },
      { id: 'spoke_south_3', rect: [-1.2, -25 + culvertHalf, 1.2, -18], topY: 0.3, kind: 'metal' },
      // West Spoke
      { id: 'spoke_west_1', rect: [-48, -1.2, -41 - culvertHalf, 1.2], topY: 0.3, kind: 'metal' },
      { id: 'spoke_west_2', rect: [-41 + culvertHalf, -1.2, -25 - culvertHalf, 1.2], topY: 0.3, kind: 'metal' },
      { id: 'spoke_west_3', rect: [-25 + culvertHalf, -1.2, -18, 1.2], topY: 0.3, kind: 'metal' },
      // East Spoke
      { id: 'spoke_east_1', rect: [18, -1.2, 25 - culvertHalf, 1.2], topY: 0.3, kind: 'metal' },
      { id: 'spoke_east_2', rect: [25 + culvertHalf, -1.2, 41 - culvertHalf, 1.2], topY: 0.3, kind: 'metal' },
      { id: 'spoke_east_3', rect: [41 + culvertHalf, -1.2, 48, 1.2], topY: 0.3, kind: 'metal' },
    );

    // Raised observation vantage platform & stairs (Prompt 5.3)
    platforms.push({ id: 'vantage_catwalk', rect: [-3.5, -28, 3.5, -24], topY: 1.1, kind: 'metal' });
    stairs.push({
      id: 'stair_vantage',
      x: 0.0,
      z: -22.88,
      width: 2.4,
      riser: 0.20,
      run: 0.28,
      steps: 4,
      baseY: 0.3,
      direction: 'z-',
    });

    // 4. 4 Corner Pump Rooms (14 x 14m)
    // NW: Generator 1
    platforms.push({ id: 'pump_nw', rect: [-55, 41, -41, 55], topY: 0.3, kind: 'concrete' });
    props.push({ id: 'gen_1', kind: 'generator', position: { x: -48, y: 0.3, z: 48 }, yaw: Math.PI / 4, params: { id: 'g1' } });

    // NE: Generator 2
    platforms.push({ id: 'pump_ne', rect: [41, 41, 55, 55], topY: 0.3, kind: 'concrete' });
    props.push({ id: 'gen_2', kind: 'generator', position: { x: 48, y: 0.3, z: 48 }, yaw: -Math.PI / 4, params: { id: 'g2' } });

    // SE: Generator 3
    platforms.push({ id: 'pump_se', rect: [41, -55, 55, -41], topY: 0.3, kind: 'concrete' });
    props.push({ id: 'gen_3', kind: 'generator', position: { x: 48, y: 0.3, z: -48 }, yaw: -3 * Math.PI / 4, params: { id: 'g3' } });

    // Central Arch vantage console (0, 0.3, -21)
    props.push({ id: 'core_master_console', kind: 'terminal', position: { x: 0, y: 0.3, z: -21.0 }, yaw: 0, params: { id: 'master' } });

    // SW: Locker Cache (2 noisemakers + 1 battery cell)
    platforms.push({ id: 'pump_sw', rect: [-55, -55, -41, -41], topY: 0.3, kind: 'concrete' });
    props.push({ id: 'cache_sw', kind: 'locker_cache', position: { x: -48, y: 0.3, z: -48 } });

    // 5. Blast Doors on South Wall of Inner Ring
    props.push({
      id: 'blast_door_core',
      kind: 'blast_door',
      position: { x: 0, y: 0.3, z: -21.0 },
      yaw: 0,
    });

    // Exit platform beyond blast doors
    platforms.push({
      id: 'plat_exit_core',
      rect: [-3, -27, 3, -22],
      topY: 0.3,
      kind: 'metal',
    });

    // Outer enclosure boundary walls
    walls.push(
      { id: 'drain_bound_n', min: { x: -60, y: -0.9, z: 59 }, max: { x: 60, y: 8.0, z: 60 }, isWall: true },
      { id: 'drain_bound_s', min: { x: -60, y: -0.9, z: -60 }, max: { x: 60, y: 8.0, z: -59 }, isWall: true },
      { id: 'drain_bound_w', min: { x: -60, y: -0.9, z: -60 }, max: { x: -59, y: 8.0, z: 60 }, isWall: true },
      { id: 'drain_bound_e', min: { x: 59, y: -0.9, z: -60 }, max: { x: 60, y: 8.0, z: 60 }, isWall: true },
    );

    // Player spawn in Locker Cache room (SW)
    const playerSpawn = { x: -48.0, y: 0.3, z: -46.0 };

    // Single Relentless Apex Hunter in the Drainage Core
    const monsters: Array<{
      id: string;
      variant: 'standard' | 'elder' | 'juvenile';
      spawn: { x: number; y: number; z: number };
      sleeperSpawn?: { x: number; y: number; z: number };
      hearingMul?: number;
      speedMul?: number;
      scale?: number;
      tint?: string;
      spawnGrace?: number;
    }> = [
        {
          id: 'monster_elder',
          variant: 'elder' as const,
          spawn: { x: 30, y: -0.9, z: 42 },
          sleeperSpawn: { x: -30.0, y: -0.9, z: -30.0 },
          hearingMul: 1.35,
          speedMul: 1.10,
          scale: 1.15,
          spawnGrace: 4.0,
        },
      ];

    if (ctx.difficulty === 'deafening' || ctx.playerCount >= 3) {
      monsters.push({
        id: 'monster_juv_1',
        variant: 'juvenile' as const,
        spawn: { x: -26, y: -0.9, z: -10 },
        hearingMul: 1.0,
        speedMul: 1.25,
        scale: 0.85,
      });
    }

    return {
      mapId: 'drainage_core',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars: [],
      stairs,
      waterBodies: [
        {
          id: 'deep_abyss_drain',
          rect: [-16, -16, 16, 16],
          floorY: -1.8,
          waterY: 0.0,
        },
        {
          id: 'shallow_wading_spoke',
          rect: [-54, -4, 54, 4],
          floorY: -0.75,
          waterY: 0.0,
        },
        {
          id: 'abyssal_water',
          rect: [-54, -54, 54, 54],
          floorY: -0.9,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'gen_puzzle',
          type: 'GeneratorGrid',
          position: { x: 0, y: 0.3, z: -21.0 },
          params: { playerCount: ctx.playerCount },
        },
      ],
      spawns: {
        player: [playerSpawn],
        monsters,
      },
      patrolLanes: [
        {
          id: 'drainage_channel',
          points: [
            { x: -38.0, y: -0.9, z: -38.0 },
            { x: -25.0, y: -0.9, z: -25.0 },
            { x: 0.0, y: -0.9, z: -25.0 },
            { x: 25.0, y: -0.9, z: 0.0 },
          ],
        },
      ],
      exit: {
        id: 'exit_drainage_core',
        position: { x: 0, y: 0.3, z: -25.0 },
      },
      meta: {
        playerCount: ctx.playerCount,
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const reg = TextureRegistry.getInstance();
    const concrete = reg.getConcreteSet('tunnel', layout.seed);
    const metal = reg.getRustMetalSet(layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: metal.albedo,
      roughnessMap: metal.roughness,
      normalMap: metal.normal,
      metalnessMap: metal.metalness,
      roughness: 0.45,
      metalness: 0.85,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    const wallMat = new MeshStandardMaterial({
      map: concrete.albedo,
      roughnessMap: concrete.roughness,
      normalMap: concrete.normal,
      roughness: 0.85,
      metalness: 0.05,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    const floorMat = new MeshStandardMaterial({
      map: concrete.albedo,
      roughnessMap: concrete.roughness,
      normalMap: concrete.normal,
      roughness: 0.6,
      metalness: 0.05,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    return buildStandardMapInstance(layout, env, { platformMat, wallMat, floorMat });
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 120.0;
    const scaleY = h / 120.0;

    // Pitch black / deep cyan abyss background
    g.fillStyle = '#020706';
    g.fillRect(0, 0, w, h);

    // Water glow rings
    g.strokeStyle = '#12453b';
    g.lineWidth = 4;
    g.strokeRect(9 * scaleX, 9 * scaleY, 102 * scaleX, 102 * scaleY);
    g.strokeRect(26 * scaleX, 26 * scaleY, 68 * scaleX, 68 * scaleY);
    g.strokeRect(41 * scaleX, 41 * scaleY, 38 * scaleX, 38 * scaleY);

    // Catwalk platforms
    g.fillStyle = '#2d6d63';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 60) * scaleX;
      const ry = (p.rect[1] + 60) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Generators (cyan glowing squares)
    for (const prop of layout.props) {
      if (prop.kind === 'generator') {
        const gx = (prop.position.x + 60) * scaleX;
        const gy = (prop.position.z + 60) * scaleY;
        g.fillStyle = '#3ff2c8';
        g.fillRect(gx - 3, gy - 3, 6, 6);
      }
    }

    // Central pit
    g.fillStyle = '#000000';
    g.fillRect(52 * scaleX, 52 * scaleY, 16 * scaleX, 16 * scaleY);

    // Spawn & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 60) * scaleX, (sp.z + 60) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 60) * scaleX, (ex.z + 60) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

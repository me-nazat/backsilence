/* ── DrownedSchoolMap.ts ───────────────────────────────────────────────────
 *  Map 2: The Drowned Schoolhouse (single floor, perch map; 3 stars)
 *  Shin-flooded elementary school, flickering tube lights, chalkboards,
 *  Perch system (untouchable on furniture), wobbly chairs, rising Tide Clock,
 *  PA-system lure tool, careful-vs-fast locker opening, and chained lobby doors.
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
import type { MapInstance } from './MapInstance.js';
import { Rng } from '../../procedural/core/prng.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';
import { PerchSystem } from '../../sim/PerchSystem.js';
import { applyWetDarkening } from '../../game/rendering/WetDarkening.js';
import type { LightStreak } from '../../game/water/WaterMaterial.js';

const PASSWORD_WORDS = ['HUSH', 'DRIP', 'MUTE', 'TIDE', 'WADE', 'SILT'];

export const DrownedSchoolMap: MapDefinition = {
  id: 'drowned_school',
  name: 'The Drowned Schoolhouse',
  tagline: 'Climb the desks, stay off the floor. It will not touch what is dry.',
  stars: 3,
  reverb: 'school',
  acoustics: {
    hearingMul: 1.0,
  },
  atmosphere: {
    fog: {
      color: '#9aa890',
      density: 0.055,
    },
    exposure: 0.95,
    hemisphere: {
      sky: '#8a9b85',
      ground: '#4a5b48',
    },
    sun: {
      color: '#d4ded0',
      intensity: 0.7,
      direction: { x: -0.4, y: 0.85, z: -0.3 },
      castShadow: false,
    },
  },
  waterProfile: WATER_PROFILES.drowned_school,
  postGrade: {
    lift: [0.02, 0.03, 0.025],
    saturation: 0.92,
    gain: [0.95, 0.98, 0.92],
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const rng = new Rng(ctx.seed);
    const bounds = { minX: -48, minZ: -28, maxX: 48, maxZ: 28 }; // 96 x 56m

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const props: PropDef[] = [];

    // Select 4-letter password for the class register
    const password = PASSWORD_WORDS[rng.int(0, PASSWORD_WORDS.length - 1)]!;

    // 1. Outer perimeter walls
    walls.push({
      id: 'wall_school_north',
      min: { x: -48, y: -0.34, z: 27.5 },
      max: { x: 48, y: 3.5, z: 28 },
      isWall: true,
    });
    walls.push({
      id: 'wall_school_south',
      min: { x: -48, y: -0.34, z: -28 },
      max: { x: 48, y: 3.5, z: -27.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_school_west',
      min: { x: -48, y: -0.34, z: -28 },
      max: { x: -47.5, y: 3.5, z: 28 },
      isWall: true,
    });
    walls.push({
      id: 'wall_school_east',
      min: { x: 47.5, y: -0.34, z: -28 },
      max: { x: 48, y: 3.5, z: 28 },
      isWall: true,
    });

    // 2. West Wing: Lobby, Principal's Office, Staff Lounge
    // Lobby Entry Dais (Permanent dry refuge +0.6m)
    platforms.push({
      id: 'plat_lobby_dais',
      rect: [-46, -6, -38, 6],
      topY: 0.6,
      kind: 'marble',
    });

    // Principal's Office: [-48, 14, -30, 28] with Principal's Desk (+0.46m perch)
    platforms.push({
      id: 'perch_principal_desk',
      rect: [-42, 20, -36, 24],
      topY: 0.46,
      kind: 'metal',
    });

    // Principal's office dividing wall
    walls.push({
      id: 'wall_principal_s',
      min: { x: -48, y: -0.34, z: 13.5 },
      max: { x: -30, y: 3.5, z: 14.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_west_corridor',
      min: { x: -30.5, y: -0.34, z: -28 },
      max: { x: -29.5, y: 3.5, z: 28 },
      isWall: true,
    });

    // 3. East Wing: Gymnasium & Auditorium
    // Stage (+0.9m permanent safe zone) in Auditorium: [28, 12, 46, 26]
    platforms.push({
      id: 'plat_stage_safe',
      rect: [28, 12, 46, 26],
      topY: 0.9,
      kind: 'tile',
    });

    // Gymnasium Bleachers: [42, -26, 47, -4] (steps from +0.5m to +2.0m)
    for (let tier = 0; tier < 4; tier++) {
      const stepX = 42 + tier * 1.2;
      platforms.push({
        id: `perch_bleacher_${tier}`,
        rect: [stepX, -26, stepX + 1.2, -4],
        topY: 0.5 + tier * 0.45,
        kind: 'concrete',
      });
    }

    // East wing dividing wall between Gym and Auditorium
    walls.push({
      id: 'wall_gym_auditorium',
      min: { x: 26, y: -0.34, z: 6.5 },
      max: { x: 48, y: 3.5, z: 7.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_east_corridor',
      min: { x: 25.5, y: -0.34, z: -28 },
      max: { x: 26.5, y: 3.5, z: 28 },
      isWall: true,
    });

    // 4. Central Main Corridor: [-28, -2.5, 24, 2.5]
    // Locker banks lining corridor (tops at +1.6m are valid high perches)
    platforms.push({
      id: 'perch_lockers_north',
      rect: [-24, 2.0, 16, 2.6],
      topY: 1.6,
      kind: 'metal',
    });
    platforms.push({
      id: 'perch_lockers_south',
      rect: [-24, -2.6, 16, -2.0],
      topY: 1.6,
      kind: 'metal',
    });

    // 5. Library (Mid-North): [2, 6, 24, 26]
    // Tall Bookcase shelves (+1.5m) holding the Class Register
    platforms.push({
      id: 'perch_library_shelf_register',
      rect: [6, 20, 18, 21.2],
      topY: 1.5,
      kind: 'metal',
    });
    platforms.push({
      id: 'perch_library_table',
      rect: [8, 12, 16, 16],
      topY: 0.41,
      kind: 'tile',
    });

    // 6. Cafeteria (Mid-South): [2, -26, 24, -6]
    // Cafeteria tables with benches (+0.41m)
    for (let c = 0; c < 3; c++) {
      const zTab = -22 + c * 6.5;
      platforms.push({
        id: `perch_cafe_table_${c}`,
        rect: [6, zTab, 20, zTab + 2.2],
        topY: 0.41,
        kind: 'tile',
      });
    }

    // 7. Classrooms with Desk Rows (1.0m spacing, 1.6m aisles)
    // Classroom 1 (North-West): [-26, 6, -6, 26]
    // Row 1: x in [-24, -22.5]
    platforms.push({
      id: 'perch_cr1_row1',
      rect: [-24, 8, -22.5, 22],
      topY: 0.41,
      kind: 'tile',
    });
    // Row 2: x in [-21.5, -20.0] (1.0m gap between Row 1 and Row 2 -> blocks monster!)
    platforms.push({
      id: 'perch_cr1_row2',
      rect: [-21.5, 8, -20.0, 22],
      topY: 0.41,
      kind: 'tile',
    });
    // Row 3: x in [-18.4, -16.9] (1.6m aisle between Row 2 and Row 3 -> monster walkable!)
    platforms.push({
      id: 'perch_cr1_row3',
      rect: [-18.4, 8, -16.9, 22],
      topY: 0.41,
      kind: 'tile',
    });

    // Wobbly chairs placed in classroom hop chain
    props.push({
      id: 'chair_wobbly_1',
      kind: 'wobbly_chair',
      position: { x: -20.75, y: 0.12, z: 15 },
    });
    props.push({
      id: 'chair_wobbly_2',
      kind: 'wobbly_chair',
      position: { x: 12, y: 0.12, z: -10 },
    });

    // Janitor's closet holding bolt cutters
    props.push({
      id: 'bolt_cutters',
      kind: 'bolt_cutters',
      position: { x: -4, y: 0.41, z: 10 },
    });

    // PA Console in Principal's office
    props.push({
      id: 'pa_console',
      kind: 'pa_console',
      position: { x: -39, y: 0.46, z: 22 },
    });

    // Exit Doors at Lobby (chained)
    const exitPos = { x: -47, y: 0.6, z: 0 };

    // Player spawn in Gym
    const playerSpawn = { x: 38, y: 0.5, z: -16 };
    // Monster spawn in west corridor or classroom
    const monsterSpawn = { x: -18, y: -0.34, z: -16 }; // distance ~60m >= 40m

    return {
      mapId: 'drowned_school',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars: [],
      stairs: [],
      waterBodies: [
        {
          id: 'school_flood',
          rect: [-48, -28, 48, 28],
          floorY: -0.34,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'school_pa_gambit',
          type: 'pa_gambit',
          position: exitPos,
          params: {
            password,
            paConsolePos: { x: -39, y: 0.46, z: 22 },
            boltCuttersPos: { x: -4, y: 0.41, z: 10 },
          },
        },
      ],
      spawns: {
        player: [playerSpawn],
        monsters: [
          {
            id: 'monster_school_1',
            variant: 'standard' as const,
            spawn: monsterSpawn,
            sleeperSpawn: { x: 14, y: -0.34, z: -16 },
          },
        ],
      },
      patrolLanes: [
        {
          id: 'school_hallway',
          points: [
            { x: 30, y: -0.34, z: -16 },
            { x: 14, y: -0.34, z: -16 },
            { x: 0, y: -0.34, z: -16 },
            { x: -4, y: -0.34, z: 0 },
            { x: -4, y: -0.34, z: 10 },
            { x: -35, y: -0.34, z: 0 },
          ],
        },
      ],
      exit: {
        id: 'lobby_exit_doors',
        position: exitPos,
      },
      meta: {
        password,
        perchImmunity: true,
        tideClockMinutes: ctx.difficulty === 'whisper' ? 18 : ctx.difficulty === 'deafening' ? 10 : 14,
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const tex = TextureRegistry.getInstance();
    const linoleumTiles = tex.getTileSet('platform', layout.seed);
    const concreteTex = tex.getConcreteSet('tunnel', layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: linoleumTiles.albedo,
      roughness: 0.4,
      metalness: 0.02,
    });
    applyWetDarkening(platformMat, { waterY: 0.0 });

    const wallMat = new MeshStandardMaterial({
      map: concreteTex.albedo,
      roughness: 0.6,
      metalness: 0.02,
    });
    applyWetDarkening(wallMat, { waterY: 0.0 });

    const floorMat = new MeshStandardMaterial({
      map: linoleumTiles.albedo,
      roughness: 0.25,
      metalness: 0.04,
    });

    const instance = buildStandardMapInstance(layout, env, {
      platformMat,
      wallMat,
      floorMat,
    });

    // Populate PerchSystem on the instance
    const perches = new PerchSystem();
    for (const p of layout.platforms) {
      perches.addBoxPerch(
        p.id,
        p.rect[0],
        p.rect[1],
        p.rect[2] - p.rect[0],
        p.rect[3] - p.rect[1],
        p.topY,
        { isPerch: true, wobbly: false },
      );
    }
    // Add wobbly chairs as wobbly perches
    for (const prop of layout.props) {
      if (prop.kind === 'wobbly_chair') {
        perches.addBoxPerch(
          prop.id,
          prop.position.x - 0.4,
          prop.position.z - 0.4,
          0.8,
          0.8,
          0.41,
          { isPerch: true, wobbly: true },
        );
      }
    }
    instance.root.userData['perchSystem'] = perches;

    // Tube light light streaks for rippling water
    const lightStreaks: LightStreak[] = [
      {
        pos: new Vector3(-20, 3.2, 0),
        dir: new Vector3(1, 0, 0),
        size: 16.0,
        color: new Color('#d8e5d2'),
        intensity: 0.7,
      },
      {
        pos: new Vector3(10, 3.2, 0),
        dir: new Vector3(1, 0, 0),
        size: 16.0,
        color: new Color('#d8e5d2'),
        intensity: 0.7,
      },
    ];
    instance.root.userData['lightStreaks'] = lightStreaks;

    return instance;
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 96.0;
    const scaleY = h / 56.0;

    // Flood water background
    g.fillStyle = '#22332a';
    g.fillRect(0, 0, w, h);

    // Desks, tables, and stage
    g.fillStyle = '#b5a58d';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 48) * scaleX;
      const ry = (p.rect[1] + 28) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Walls
    g.fillStyle = '#44554b';
    for (const wall of layout.walls) {
      const rx = (wall.min.x + 48) * scaleX;
      const ry = (wall.min.z + 28) * scaleY;
      const rw = Math.max(2, (wall.max.x - wall.min.x) * scaleX);
      const rh = Math.max(2, (wall.max.z - wall.min.z) * scaleY);
      g.fillRect(rx, ry, rw, rh);
    }

    // Spawns & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 48) * scaleX, (sp.z + 28) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 48) * scaleX, (ex.z + 28) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

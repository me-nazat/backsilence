/* ── HydroMazeMap.ts ───────────────────────────────────────────────────────
 *  Map 4: The Hydro-Filtration Maze (4 stars)
 *  Industrial water-treatment maze with periodic 90s water level cycle (-0.2m to +0.55m),
 *  3 height tiers (Basin -0.9, W1 +0.3, W2 +0.9), filter drums, and 3 fuse cores on W2.
 * ──────────────────────────────────────────────────────────────────────── */

import { MeshStandardMaterial } from 'three';
import type { LayoutCtx, LayoutData, MapDefinition, PlatformDef, BoxDef, PropDef, StairDef, BuildEnv } from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { Rng } from '../../procedural/core/prng.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';

export const HydroMazeMap: MapDefinition = {
  id: 'hydro_maze',
  name: 'The Hydro-Filtration Maze',
  tagline: 'An industrial filtration labyrinth that breathes, shifting water levels every 45 seconds.',
  stars: 4,
  reverb: 'tunnel',
  acoustics: {
    hearingMul: 1.0,
    maskZones: true,
  },
  atmosphere: {
    fog: {
      color: '#8fa5a0',
      density: 0.045,
    },
    exposure: 1.0,
    hemisphere: {
      sky: '#95b0ab',
      ground: '#384b47',
    },
    sun: {
      color: '#c2e0db',
      intensity: 0.8,
      direction: { x: 0.0, y: 1.0, z: 0.2 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.hydro_maze,
  postGrade: {
    tint: [0.9, 1.05, 1.03],
    saturation: 1.02,
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const rng = new Rng(ctx.seed);
    const bounds = { minX: -36, minZ: -36, maxX: 36, maxZ: 36 };

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const props: PropDef[] = [];
    const stairs: StairDef[] = [];

    // 9x9 Grid of 8m cells (-36 to +36)
    // Cell coordinates: col 0..8, row 0..8
    // Center is (4, 4) -> (0, 0) in world coords
    const cellSize = 8.0;

    // Generate spanning tree maze on 9x9 grid using recursive backtracker
    const visited = new Set<string>();
    const wallsBetween = new Set<string>(); // "c1,r1|c2,r2"

    // Helper for wall key
    function wallKey(c1: number, r1: number, c2: number, r2: number): string {
      if (c1 < c2 || (c1 === c2 && r1 < r2)) {
        return `${c1},${r1}|${c2},${r2}`;
      }
      return `${c2},${r2}|${c1},${r1}`;
    }

    // Initialize all grid walls
    for (let c = 0; c < 9; c++) {
      for (let r = 0; r < 9; r++) {
        if (c < 8) wallsBetween.add(wallKey(c, r, c + 1, r));
        if (r < 8) wallsBetween.add(wallKey(c, r, c, r + 1));
      }
    }

    // Carve maze from center (4, 4)
    const stack: [number, number][] = [[4, 4]];
    visited.add('4,4');

    while (stack.length > 0) {
      const [curC, curR] = stack[stack.length - 1]!;
      const neighbors: [number, number][] = [];
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

      for (const [dc, dr] of dirs) {
        const nc = curC + dc!;
        const nr = curR + dr!;
        if (nc >= 0 && nc < 9 && nr >= 0 && nr < 9 && !visited.has(`${nc},${nr}`)) {
          neighbors.push([nc, nr]);
        }
      }

      if (neighbors.length > 0) {
        const next = neighbors[rng.int(0, neighbors.length - 1)]!;
        wallsBetween.delete(wallKey(curC, curR, next[0], next[1]));
        visited.add(`${next[0]},${next[1]}`);
        stack.push(next);
      } else {
        stack.pop();
      }
    }

    // Braid ~12% dead ends by removing additional walls to form loops
    for (let c = 1; c < 8; c++) {
      for (let r = 1; r < 8; r++) {
        if (rng.next() < 0.12) {
          wallsBetween.delete(wallKey(c, r, c + 1, r));
        }
      }
    }

    // Assign cell height tiers:
    // W1 (+0.3m, safe at LOW, flooded at HIGH)
    // W2 (+0.9m, always dry, holds fuse cores)
    // Basin (-0.9m, flooded water)
    const cellTiers = new Map<string, 'basin' | 'walk1' | 'walk2'>();

    // Spawn is at (0, 0) in grid coords -> (-32, -32) world: W1 tier
    cellTiers.set('0,0', 'walk1');
    // Connect corridor north of spawn directly into main basin
    cellTiers.set('0,1', 'basin');
    cellTiers.set('0,2', 'basin');
    cellTiers.set('0,3', 'basin');
    cellTiers.set('0,4', 'basin');
    cellTiers.set('0,5', 'basin');
    cellTiers.set('0,6', 'basin');
    // Fuse bay is at center (4, 4): W2 tier
    cellTiers.set('4,4', 'walk2');

    // 3 Fuse core locations on W2 tiers in remote dead ends
    const coreCells: [number, number][] = [
      [8, 1], // East-North dead end
      [1, 8], // West-South dead end
      [8, 7], // East-South dead end
    ];
    for (const [cc, cr] of coreCells) {
      cellTiers.set(`${cc},${cr}`, 'walk2');
    }

    // Build platform floors for each cell
    for (let c = 0; c < 9; c++) {
      for (let r = 0; r < 9; r++) {
        const minX = -36 + c * cellSize;
        const minZ = -36 + r * cellSize;
        const maxX = minX + cellSize;
        const maxZ = minZ + cellSize;

        let tier = cellTiers.get(`${c},${r}`);
        if (!tier) {
          // Semi-random assignment: ~50% basin (-0.9), ~35% W1 (+0.3), ~15% W2 (+0.9)
          const roll = rng.next();
          tier = roll < 0.5 ? 'basin' : roll < 0.85 ? 'walk1' : 'walk2';
          cellTiers.set(`${c},${r}`, tier);
        }

        const topY = tier === 'basin' ? -0.9 : tier === 'walk1' ? 0.3 : 0.9;
        const kind = tier === 'basin' ? 'tile' : 'concrete';

        platforms.push({
          id: `cell_${c}_${r}`,
          rect: [minX, minZ, maxX, maxZ],
          topY,
          kind,
        });

        // Add filter drum obstacle to some basin / W1 cells
        if ((tier === 'basin' || tier === 'walk1') && (c + r) % 4 === 1 && !(c === 4 && r === 4)) {
          props.push({
            id: `drum_${c}_${r}`,
            kind: 'filter_drum',
            position: { x: minX + cellSize * 0.5, y: topY, z: minZ + cellSize * 0.5 },
          });
        }
      }
    }

    // Place walls for wallsBetween
    let wallCount = 0;
    for (const wk of wallsBetween) {
      const [p1, p2] = wk.split('|');
      const [c1, r1] = p1!.split(',').map(Number);
      const [c2, r2] = p2!.split(',').map(Number);

      if (c1 === c2) {
        // Horizontal wall along x
        const minX = -36 + c1! * cellSize;
        const z = -36 + Math.max(r1!, r2!) * cellSize;
        walls.push({
          id: `maze_wall_${++wallCount}`,
          min: { x: minX, y: -0.9, z: z - 0.25 },
          max: { x: minX + cellSize, y: 3.5, z: z + 0.25 },
          isWall: true,
        });
      } else {
        // Vertical wall along z
        const x = -36 + Math.max(c1!, c2!) * cellSize;
        const minZ = -36 + r1! * cellSize;
        walls.push({
          id: `maze_wall_${++wallCount}`,
          min: { x: x - 0.25, y: -0.9, z: minZ },
          max: { x: x + 0.25, y: 3.5, z: minZ + cellSize },
          isWall: true,
        });
      }
    }

    // Fuse Bay at center (4, 4)
    props.push({
      id: 'fuse_bay_center',
      kind: 'fuse_bay',
      position: { x: 0, y: 0.9, z: 0 },
    });

    // 3 Fuse Cores on W2 pedestals
    for (let i = 0; i < coreCells.length; i++) {
      const [cc, cr] = coreCells[i]!;
      const px = -36 + cc * cellSize + cellSize * 0.5;
      const pz = -36 + cr * cellSize + cellSize * 0.5;
      props.push({
        id: `fuse_core_${i + 1}`,
        kind: 'fuse_core',
        position: { x: px, y: 0.9 + 0.5, z: pz },
      });
    }

    // Exit Shutter in boundary cell (8, 4) at east edge (+36, 0.9, 0)
    props.push({
      id: 'shutter_exit',
      kind: 'blast_door',
      position: { x: 35.5, y: 0.9, z: 0 },
      yaw: Math.PI / 2,
    });

    // Outer perimeter walls
    walls.push(
      { id: 'maze_bound_n', min: { x: -36, y: -0.9, z: 35.5 }, max: { x: 36, y: 5.0, z: 36 }, isWall: true },
      { id: 'maze_bound_s', min: { x: -36, y: -0.9, z: -36 }, max: { x: 36, y: 5.0, z: -35.5 }, isWall: true },
      { id: 'maze_bound_w', min: { x: -36, y: -0.9, z: -36 }, max: { x: -35.5, y: 5.0, z: 36 }, isWall: true },
      { id: 'maze_bound_e', min: { x: 35.5, y: -0.9, z: -36 }, max: { x: 36, y: 5.0, z: 36 }, isWall: true },
    );

    // Raised observation vantage platform & stairs (Prompt 5.3)
    platforms.push({ id: 'vantage_perch', rect: [-22, -22, -16, -16], topY: 1.1, kind: 'metal' });
    stairs.push({
      id: 'stair_perch',
      x: -20,
      z: -23.12,
      width: 2.4,
      riser: 0.20,
      run: 0.28,
      steps: 4,
      baseY: 0.3,
      direction: 'z+',
    });

    // Player spawn at cell (0, 0)
    const playerSpawn = { x: -32.0, y: 0.3, z: -32.0 };
    // Monster spawn in central basin cell (3, 4)
    const monsterPos = { x: -8.0, y: -0.9, z: 0.0 };

    return {
      mapId: 'hydro_maze',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars: [],
      stairs,
      waterBodies: [
        {
          id: 'deep_sump',
          rect: [-12, -12, 12, 12],
          floorY: -1.4,
          waterY: -0.2,
        },
        {
          id: 'shallow_wading_lane',
          rect: [-36, -36, -20, -20],
          floorY: -0.75,
          waterY: -0.2,
        },
        {
          id: 'maze_water',
          rect: [-36, -36, 36, 36],
          floorY: -0.9,
          waterY: -0.2, // Cycles between -0.2 and +0.55
        },
      ],
      props,
      puzzles: [
        {
          id: 'fuse_puzzle',
          type: 'FuseCores',
          position: { x: 0, y: 0.9, z: 0 },
          params: { coreCount: 3 },
        },
      ],
      spawns: {
        player: [playerSpawn],
        monsters: [
          {
            id: 'monster_maze',
            variant: 'standard',
            spawn: monsterPos,
            sleeperSpawn: { x: -32.0, y: -0.9, z: -8.0 },
            speedMul: 0.95,
          },
        ],
      },
      patrolLanes: [
        {
          id: 'maze_spine',
          points: [
            { x: -24.0, y: -0.9, z: -24.0 },
            { x: -16.0, y: -0.9, z: -16.0 },
            { x: 0.0, y: -0.9, z: -8.0 },
            { x: 0.0, y: -0.9, z: 0.0 },
            { x: 16.0, y: -0.9, z: 0.0 },
          ],
        },
      ],
      exit: {
        id: 'exit_hydro_maze',
        position: { x: 36.0, y: 0.9, z: 0 },
      },
      meta: {
        discreteWaterLevels: [-0.2, 0.55],
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const reg = TextureRegistry.getInstance();
    const concrete = reg.getConcreteSet('filtration', layout.seed);
    const metal = reg.getRustMetalSet(layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: concrete.albedo,
      roughnessMap: concrete.roughness,
      normalMap: concrete.normal,
      roughness: 0.65,
      metalness: 0.05,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    const wallMat = new MeshStandardMaterial({
      map: concrete.albedo,
      roughnessMap: concrete.roughness,
      normalMap: concrete.normal,
      roughness: 0.8,
      metalness: 0.02,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    const floorMat = new MeshStandardMaterial({
      map: metal.albedo,
      roughnessMap: metal.roughness,
      normalMap: metal.normal,
      metalnessMap: metal.metalness,
      roughness: 0.3,
      metalness: 0.7,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    return buildStandardMapInstance(layout, env, { platformMat, wallMat, floorMat });
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 72.0;
    const scaleY = h / 72.0;

    // Churning aqua-grey background
    g.fillStyle = '#2f4f4f';
    g.fillRect(0, 0, w, h);

    // Platforms
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 36) * scaleX;
      const ry = (p.rect[1] + 36) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      // W2 lighter, W1 mid, Basin dark
      g.fillStyle = p.topY > 0.6 ? '#9eb5b0' : p.topY > 0.0 ? '#58746f' : '#233936';
      g.fillRect(rx, ry, rw, rh);
    }

    // Maze walls
    g.fillStyle = '#111a19';
    for (const wall of layout.walls) {
      const wx = (wall.min.x + 36) * scaleX;
      const wy = (wall.min.z + 36) * scaleY;
      const ww = Math.max(1, (wall.max.x - wall.min.x) * scaleX);
      const wh = Math.max(1, (wall.max.z - wall.min.z) * scaleY);
      g.fillRect(wx, wy, ww, wh);
    }

    // Fuse cores (yellow dots)
    for (const prop of layout.props) {
      if (prop.kind === 'fuse_core') {
        const cx = (prop.position.x + 36) * scaleX;
        const cy = (prop.position.z + 36) * scaleY;
        g.fillStyle = '#ffcc00';
        g.beginPath();
        g.arc(cx, cy, 3, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Spawn & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 36) * scaleX, (sp.z + 36) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 36) * scaleX, (ex.z + 36) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

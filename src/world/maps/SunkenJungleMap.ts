/* ── SunkenJungleMap.ts ───────────────────────────────────────────────────
 *  Map 3: The Sunken Jungle (organic map; 4 stars)
 *  Humid wetland threaded by a river, stepping stones vs boulders,
 *  rapids and waterfall acoustic mask zones, fauna-hush tell,
 *  and the SluiceFlow river-reading puzzle.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  MeshStandardMaterial,
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
import { FlowField } from '../../sim/FlowField.js';
import { PerchSystem } from '../../sim/PerchSystem.js';
import { applyWetDarkening } from '../../game/rendering/WetDarkening.js';
import { createLightShaftMesh, createDustMotes } from '../../game/rendering/LightShafts.js';

export const SunkenJungleMap: MapDefinition = {
  id: 'sunken_jungle',
  name: 'The Sunken Jungle',
  tagline: 'Mossy stones, deep currents, and a waterfall that masks your noise.',
  stars: 4,
  reverb: 'jungle',
  acoustics: {
    hearingMul: 0.95,
    maskZones: true,
  },
  atmosphere: {
    fog: {
      color: '#7da58a',
      density: 0.05,
    },
    exposure: 1.05,
    hemisphere: {
      sky: '#7aa085',
      ground: '#2e4a35',
    },
    sun: {
      color: '#fff8d1',
      intensity: 1.2,
      direction: { x: 0.5, y: 0.8, z: 0.3 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.sunken_jungle,
  postGrade: {
    lift: [0.01, 0.03, 0.015],
    saturation: 1.15,
    gain: [0.95, 1.05, 0.92],
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const bounds = { minX: -70, minZ: -70, maxX: 70, maxZ: 70 }; // 140 x 140m

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const props: PropDef[] = [];

    // 1. Spawn bank at South-West dry ground (+0.4m)
    platforms.push({
      id: 'plat_jungle_spawn_bank',
      rect: [-65, -65, -45, -45],
      topY: 0.4,
      kind: 'marble',
    });

    // 2. Ruined Temple Gate at South-East dry ground
    platforms.push({
      id: 'plat_temple_grounds',
      rect: [45, 45, 65, 65],
      topY: 0.5,
      kind: 'marble',
    });

    // 3. Submerged Causeway to Temple Gate: top at -0.25m (exposed only after 3 sluices opened to -0.30m)
    platforms.push({
      id: 'submerged_causeway',
      rect: [28, 48, 45, 52],
      topY: -0.25,
      kind: 'marble',
    });

    // 4. Stepping Stone Chains across River and Ponds (r = 0.6..0.8m, top = +0.15m: dry, NOT a perch)
    // Chain A: Spawn Bank to Mid Island
    const stoneChainA = [
      { x: -42, z: -48 },
      { x: -39, z: -46 },
      { x: -36, z: -44 },
      { x: -33, z: -42 },
      { x: -30, z: -40 },
    ];
    for (let i = 0; i < stoneChainA.length; i++) {
      const s = stoneChainA[i]!;
      platforms.push({
        id: `stone_a_${i}`,
        rect: [s.x - 0.7, s.z - 0.7, s.x + 0.7, s.z + 0.7],
        topY: 0.16,
        kind: 'marble',
      });
    }

    // Mid Island 1
    platforms.push({
      id: 'plat_mid_island_1',
      rect: [-28, -42, -18, -32],
      topY: 0.35,
      kind: 'marble',
    });

    // Chain B: Mid Island 1 to Central Rapids Island
    const stoneChainB = [
      { x: -15, z: -30 },
      { x: -12, z: -27 },
      { x: -9, z: -24 },
      { x: -6, z: -21 },
      { x: -3, z: -18 },
    ];
    for (let i = 0; i < stoneChainB.length; i++) {
      const s = stoneChainB[i]!;
      platforms.push({
        id: `stone_b_${i}`,
        rect: [s.x - 0.7, s.z - 0.7, s.x + 0.7, s.z + 0.7],
        topY: 0.16,
        kind: 'marble',
      });
    }

    // Central Island
    platforms.push({
      id: 'plat_central_island',
      rect: [-2, -16, 12, -2],
      topY: 0.4,
      kind: 'marble',
    });

    // Chain C: Central Island to Temple Causeway Island
    const stoneChainC = [
      { x: 15, z: 2 },
      { x: 18, z: 8 },
      { x: 21, z: 15 },
      { x: 23, z: 24 },
      { x: 25, z: 34 },
    ];
    for (let i = 0; i < stoneChainC.length; i++) {
      const s = stoneChainC[i]!;
      platforms.push({
        id: `stone_c_${i}`,
        rect: [s.x - 0.7, s.z - 0.7, s.x + 0.7, s.z + 0.7],
        topY: 0.16,
        kind: 'marble',
      });
    }

    platforms.push({
      id: 'plat_causeway_base_island',
      rect: [22, 38, 32, 48],
      topY: 0.35,
      kind: 'marble',
    });

    // 5. Boulders (Perches: untouchable, topY = +1.1m)
    const boulders = [
      { x: -35, z: -35, r: 1.8 },
      { x: -10, z: -10, r: 2.2 },
      { x: 14, z: 18, r: 2.0 },
      { x: 30, z: 20, r: 2.5 },
    ];
    for (let i = 0; i < boulders.length; i++) {
      const b = boulders[i]!;
      platforms.push({
        id: `boulder_${i}`,
        rect: [b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r],
        topY: 1.1,
        kind: 'concrete',
      });
    }

    // 6. Fallen Log bridges (narrow bridge, not a perch, landing creak 0.10)
    platforms.push({
      id: 'log_bridge_1',
      rect: [-20, -34, -14, -32.8],
      topY: 0.45,
      kind: 'tile',
    });
    platforms.push({
      id: 'log_bridge_2',
      rect: [10, -4, 16, -2.8],
      topY: 0.45,
      kind: 'tile',
    });

    // 7. Sluice Gates (S1 near Waterfall pool NW, S2 mid rapids, S3 lower rapids)
    const sluicePositions = [
      { id: 'sluice_1', x: -40, y: 0.3, z: 40 },  // S1 (Upstream)
      { id: 'sluice_2', x: 0, y: 0.3, z: 10 },    // S2 (Mid Rapids)
      { id: 'sluice_3', x: 35, y: 0.3, z: -20 },  // S3 (Downstream)
    ];
    for (const sp of sluicePositions) {
      props.push({
        id: sp.id,
        kind: 'sluice_wheel',
        position: { x: sp.x, y: sp.y, z: sp.z },
      });
    }

    // Exit portal at Temple Gate
    const exitPos = { x: 55, y: 0.5, z: 58 };

    // Player and monster spawns
    const playerSpawn = { x: -55, y: 0.4, z: -55 };
    const monsterSpawn = { x: 20, y: -0.85, z: -35 }; // in large pond >= 45m from player

    const monsters: Array<{ id: string; variant: 'standard' | 'elder' | 'juvenile'; spawn: Vec3; sleeperSpawn?: Vec3 }> = [
      {
        id: 'monster_jungle_1',
        variant: 'standard',
        spawn: monsterSpawn,
        sleeperSpawn: { x: -38, y: -0.85, z: -38 },
      },
    ];

    if (ctx.difficulty === 'deafening' || ctx.playerCount >= 3) {
      monsters.push({
        id: 'monster_jungle_2',
        variant: 'juvenile',
        spawn: { x: -30, y: -0.85, z: 25 },
      });
    }

    return {
      mapId: 'sunken_jungle',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars: [],
      stairs: [],
      waterBodies: [
        {
          id: 'jungle_flood',
          rect: [-70, -70, 70, 70],
          floorY: -0.85,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'jungle_sluice_flow',
          type: 'sluice_flow',
          position: exitPos,
          params: {
            gates: ['sluice_1', 'sluice_2', 'sluice_3'], // correct order: upstream -> downstream
          },
        },
      ],
      spawns: {
        player: [playerSpawn],
        monsters,
      },
      patrolLanes: [
        {
          id: 'jungle_river',
          points: [
            { x: -45, y: -0.85, z: -45 },
            { x: -38, y: -0.85, z: -38 },
            { x: -20, y: -0.85, z: -20 },
            { x: 0, y: -0.85, z: 0 },
            { x: 25, y: -0.85, z: 25 },
            { x: 45, y: -0.85, z: 45 },
          ],
        },
      ],
      exit: {
        id: 'temple_gate_door',
        position: exitPos,
      },
      meta: {
        waterfallPos: { x: -45, y: 0, z: 45 },
        rapidsPos: { x: 0, y: 0, z: 10 },
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const tex = TextureRegistry.getInstance();
    const stoneTex = tex.getMarbleSet(layout.seed);
    const mossTex = tex.getTileSet('floorWet', layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: stoneTex.albedo,
      roughness: 0.75,
      metalness: 0.02,
    });
    applyWetDarkening(platformMat, { waterY: 0.0 });

    const wallMat = new MeshStandardMaterial({
      map: mossTex.albedo,
      roughness: 0.8,
      metalness: 0.01,
    });
    applyWetDarkening(wallMat, { waterY: 0.0 });

    const floorMat = new MeshStandardMaterial({
      map: stoneTex.albedo,
      roughness: 0.6,
      metalness: 0.02,
    });

    const instance = buildStandardMapInstance(layout, env, {
      platformMat,
      wallMat,
      floorMat,
    });

    // Populate FlowField (spline river from NW waterfall to SE)
    const flowField = new FlowField();
    flowField.addWaypoint({ x: -45, z: 45, speed: 2.2, width: 14 });
    flowField.addWaypoint({ x: -20, z: 30, speed: 1.8, width: 12 });
    flowField.addWaypoint({ x: 0, z: 10, speed: 2.0, width: 10 }); // Rapids
    flowField.addWaypoint({ x: 25, z: -15, speed: 1.5, width: 12 });
    flowField.addWaypoint({ x: 45, z: -45, speed: 1.2, width: 14 });

    // Rapids mask (factor 0.35, r = 20m) & Waterfall mask (factor 0.30, r = 28m)
    flowField.addMaskZone({ id: 'rapids', cx: 0, cz: 10, radius: 20, factor: 0.35 });
    flowField.addMaskZone({ id: 'waterfall', cx: -45, cz: 45, radius: 28, factor: 0.30 });
    instance.root.userData['flowField'] = flowField;

    // PerchSystem: only 'boulder_' platforms are perches!
    const perches = new PerchSystem();
    for (const p of layout.platforms) {
      if (p.id.startsWith('boulder_')) {
        perches.addCylinderPerch(
          p.id,
          (p.rect[0] + p.rect[2]) * 0.5,
          (p.rect[1] + p.rect[3]) * 0.5,
          (p.rect[2] - p.rect[0]) * 0.5,
          p.topY,
          { isPerch: true },
        );
      }
    }
    instance.root.userData['perchSystem'] = perches;

    // God rays through canopy gaps
    const canopyShaft = createLightShaftMesh({
      topRadius: 1.5,
      bottomRadius: 5.0,
      height: 16.0,
      color: '#fff3c7',
      intensity: 0.25,
    });
    canopyShaft.position.set(0, 8.0, 10);
    canopyShaft.matrixAutoUpdate = false;
    canopyShaft.updateMatrix();
    instance.root.add(canopyShaft);

    // Forest fireflies / motes
    const fireflies = createDustMotes({
      count: 100,
      bounds: { minX: -50, maxX: 50, minY: 0.5, maxY: 6, minZ: -50, maxZ: 50 },
      color: '#b6ff73',
      size: 0.08,
    });
    instance.root.add(fireflies);

    return instance;
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 140.0;
    const scaleY = h / 140.0;

    // Jungle swamp water
    g.fillStyle = '#1c3d2e';
    g.fillRect(0, 0, w, h);

    // River curve
    g.strokeStyle = '#2d5a42';
    g.lineWidth = 14 * scaleX;
    g.beginPath();
    g.moveTo((-45 + 70) * scaleX, (45 + 70) * scaleY);
    g.quadraticCurveTo((0 + 70) * scaleX, (10 + 70) * scaleY, (45 + 70) * scaleX, (-45 + 70) * scaleY);
    g.stroke();

    // Platforms & Islands
    g.fillStyle = '#8f9c73';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 70) * scaleX;
      const ry = (p.rect[1] + 70) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Boulders (orange perches)
    for (const p of layout.platforms) {
      if (p.id.startsWith('boulder_')) {
        const cx = (p.rect[0] + p.rect[2]) * 0.5 + 70;
        const cy = (p.rect[1] + p.rect[3]) * 0.5 + 70;
        g.fillStyle = '#d4883b';
        g.beginPath();
        g.arc(cx * scaleX, cy * scaleY, 4, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Spawns & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 70) * scaleX, (sp.z + 70) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 70) * scaleX, (ex.z + 70) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

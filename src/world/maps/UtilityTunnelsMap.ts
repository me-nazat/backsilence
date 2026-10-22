/* ── UtilityTunnelsMap.ts ──────────────────────────────────────────────────
 *  Map 2: Sub-Aquatic Utility Tunnels (3 stars)
 *  Spine and ribs geometry, narrow catwalks, steam bursts with acoustic mask zones,
 *  3 color-coded valves A/B/C in sequence, heavy hatch wheel main gate.
 * ──────────────────────────────────────────────────────────────────────── */

import { MeshStandardMaterial } from 'three';
import type { LayoutCtx, LayoutData, MapDefinition, PlatformDef, BoxDef, PropDef, BuildEnv } from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { Rng } from '../../procedural/core/prng.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';

export const UtilityTunnelsMap: MapDefinition = {
  id: 'utility_tunnels',
  name: 'Sub-Aquatic Utility Tunnels',
  tagline: 'Claustrophobic flooded concrete conduits, steam bursts, and rattling catwalks.',
  stars: 3,
  reverb: 'tunnel',
  acoustics: {
    hearingMul: 1.15,
    maskZones: true,
  },
  atmosphere: {
    fog: {
      color: '#2a281b',
      density: 0.06,
    },
    exposure: 0.95,
    hemisphere: {
      sky: '#3d392a',
      ground: '#1f1e16',
    },
    sun: {
      color: '#ff6644',
      intensity: 0.35,
      direction: { x: 0.0, y: 1.0, z: 0.0 },
      castShadow: false,
    },
  },
  waterProfile: WATER_PROFILES.utility_tunnels,

  generateLayout(ctx: LayoutCtx): LayoutData {
    const rng = new Rng(ctx.seed);
    const bounds = { minX: -50, minZ: -30, maxX: 50, maxZ: 30 };

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const props: PropDef[] = [];

    // Valve order permutation
    const valveNames = ['A', 'B', 'C'];
    for (let i = valveNames.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const temp = valveNames[i]!;
      valveNames[i] = valveNames[j]!;
      valveNames[j] = temp;
    }
    const valveOrder = [...valveNames];

    // 1. Spine Corridor: x from -45 to +45, z from -3 to +3
    // Floor is at -0.9m (waist-deep water)
    // Spine outer enclosure walls
    walls.push(
      { id: 'spine_wall_north', min: { x: -46, y: -0.9, z: 3.0 }, max: { x: 46, y: 3.2, z: 3.4 }, isWall: true },
      { id: 'spine_wall_south', min: { x: -46, y: -0.9, z: -3.4 }, max: { x: 46, y: 3.2, z: -3.0 }, isWall: true },
      { id: 'spine_wall_west', min: { x: -46.4, y: -0.9, z: -3.4 }, max: { x: -45.0, y: 3.2, z: 3.4 }, isWall: true },
      { id: 'spine_wall_east', min: { x: 45.0, y: -0.9, z: -3.4 }, max: { x: 46.4, y: 3.2, z: 3.4 }, isWall: true },
    );

    // 2. Catwalk segments at +0.45m along alternating sides with sprint-jumpable gaps
    // Spine length is 90m (-44 to +44)
    const catwalkSegments = [
      { startX: -44, endX: -32, side: 'south' }, // gap 2.5m
      { startX: -29.5, endX: -16, side: 'north' }, // gap 2.5m
      { startX: -13.5, endX: 0, side: 'south' },  // gap 2.5m
      { startX: 2.5, endX: 16, side: 'north' },   // gap 2.5m
      { startX: 18.5, endX: 30, side: 'south' },  // gap 2.5m
      { startX: 32.5, endX: 43, side: 'north' },  // end at gate
    ];

    for (let i = 0; i < catwalkSegments.length; i++) {
      const seg = catwalkSegments[i]!;
      const minZ = seg.side === 'north' ? 1.8 : -2.8;
      const maxZ = seg.side === 'north' ? 2.8 : -1.8;
      platforms.push({
        id: `catwalk_${i}`,
        rect: [seg.startX, minZ, seg.endX, maxZ],
        topY: 0.45,
        kind: 'metal',
      });
    }

    // Spawn platform at start of spine
    platforms.push({
      id: 'plat_spawn',
      rect: [-44.5, -2.5, -41.0, 2.5],
      topY: 0.45,
      kind: 'metal',
    });

    // 3. 6 Rib Chambers alternating north (+z) and south (-z)
    // 3 of them contain valve alcoves with narrow entries (width 2.1m: monster-blocked)
    const ribConfigs = [
      { x: -30, side: 1, isValve: true, valve: valveNames[0]! },
      { x: -18, side: -1, isValve: false },
      { x: -5, side: 1, isValve: true, valve: valveNames[1]! },
      { x: 8, side: -1, isValve: false },
      { x: 22, side: 1, isValve: true, valve: valveNames[2]! },
      { x: 34, side: -1, isValve: false },
    ];

    let valveIdx = 0;
    for (const rib of ribConfigs) {
      const rx = rib.x;
      const rzMin = rib.side > 0 ? 3.0 : -18.0;
      const rzMax = rib.side > 0 ? 18.0 : -3.0;

      // Rib chamber floor at -0.9m, narrow passage at z = 3.0..5.0
      // Side walls of rib
      walls.push(
        { id: `rib_wall_l_${rx}`, min: { x: rx - 2.5, y: -0.9, z: rzMin }, max: { x: rx - 2.1, y: 3.2, z: rzMax }, isWall: true },
        { id: `rib_wall_r_${rx}`, min: { x: rx + 2.1, y: -0.9, z: rzMin }, max: { x: rx + 2.5, y: 3.2, z: rzMax }, isWall: true },
        { id: `rib_wall_back_${rx}`, min: { x: rx - 2.5, y: -0.9, z: rib.side > 0 ? 17.6 : -18.0 }, max: { x: rx + 2.5, y: 3.2, z: rib.side > 0 ? 18.0 : -17.6 }, isWall: true },
      );

      // Catwalk platform inside rib leading to valve
      const ribPlatZMin = rib.side > 0 ? 3.0 : -16.5;
      const ribPlatZMax = rib.side > 0 ? 16.5 : -3.0;
      platforms.push({
        id: `rib_plat_${rx}`,
        rect: [rx - 0.7, ribPlatZMin, rx + 0.7, ribPlatZMax],
        topY: 0.45,
        kind: 'metal',
      });

      if (rib.isValve && rib.valve) {
        const vz = rib.side > 0 ? 16.2 : -16.2;
        props.push({
          id: `valve_${rib.valve}`,
          kind: 'valve_wheel',
          position: { x: rx, y: 0.45 + 1.1, z: vz },
          yaw: rib.side > 0 ? Math.PI : 0,
          params: { valveLetter: rib.valve, orderIndex: valveIdx },
        });
        valveIdx++;
      }
    }

    // 4. Pipe Diagram Panel near spawn
    props.push({
      id: 'pipe_diagram_panel',
      kind: 'pipe_diagram',
      position: { x: -40.0, y: 1.8, z: 2.9 },
      yaw: 0,
      params: { order: valveOrder },
    });

    // 5. Main Gate (blast door / hatch wheel) at end of spine
    props.push({
      id: 'main_gate_wheel',
      kind: 'blast_door',
      position: { x: 44.0, y: 0.45, z: 0.0 },
      yaw: -Math.PI / 2,
    });

    // 6. 4 Steam Vent Pipes (mask zones)
    const ventPositions = [
      { x: -28, y: 2.8, z: 2.5 },
      { x: -6, y: 2.8, z: 2.5 },
      { x: 12, y: 2.8, z: -2.5 },
      { x: 24, y: 2.8, z: 2.5 },
    ];
    for (let i = 0; i < ventPositions.length; i++) {
      props.push({
        id: `steam_vent_${i + 1}`,
        kind: 'light_fixture',
        position: ventPositions[i]!,
        params: { isVent: true, maskRadius: 18.0, maskFactor: 0.45 },
      });
    }

    // Exit platform on other side of main gate
    platforms.push({
      id: 'plat_exit',
      rect: [44.5, -2.0, 48.0, 2.0],
      topY: 0.45,
      kind: 'metal',
    });

    // Monster spawn at far third of spine corridor in water
    const monsterPos = { x: 26.0, y: -0.9, z: 0.0 };

    return {
      mapId: 'utility_tunnels',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars: [],
      stairs: [],
      waterBodies: [
        {
          id: 'tunnel_water',
          rect: [-50, -30, 50, 30],
          floorY: -0.9,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'valve_puzzle',
          type: 'ValveSequence',
          position: { x: 44.0, y: 0.45, z: 0.0 },
          params: { order: valveOrder },
        },
      ],
      spawns: {
        player: [{ x: -43.0, y: 0.45, z: 0.0 }],
        monsters: [
          {
            id: 'monster_tunnel',
            variant: 'standard',
            spawn: monsterPos,
            hearingMul: 1.15,
          },
        ],
      },
      exit: {
        id: 'exit_utility_tunnels',
        position: { x: 46.5, y: 0.45, z: 0.0 },
      },
      meta: {
        valveOrder,
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
      roughness: 0.55,
      metalness: 0.85,
    });

    const wallMat = new MeshStandardMaterial({
      map: concrete.albedo,
      roughnessMap: concrete.roughness,
      normalMap: concrete.normal,
      roughness: 0.75,
      metalness: 0.05,
    });

    const floorMat = new MeshStandardMaterial({
      map: concrete.albedo,
      roughnessMap: concrete.roughness,
      normalMap: concrete.normal,
      roughness: 0.4,
      metalness: 0.05,
    });

    return buildStandardMapInstance(layout, env, { platformMat, wallMat, floorMat });
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 100.0;
    const scaleY = h / 60.0;

    // Dark tunnel background
    g.fillStyle = '#1c1b14';
    g.fillRect(0, 0, w, h);

    // Spine & Ribs outline
    g.fillStyle = '#3a382e';
    g.fillRect(5 * scaleX, 27 * scaleY, 90 * scaleX, 6 * scaleY);

    // Catwalks (light grey metal lines)
    g.fillStyle = '#8a887a';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 50) * scaleX;
      const ry = (p.rect[1] + 30) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Valves A, B, C (red/green/blue dots)
    const valveColors = ['#ff5555', '#55ff55', '#5599ff'];
    let vCount = 0;
    for (const prop of layout.props) {
      if (prop.kind === 'valve_wheel') {
        const px = (prop.position.x + 50) * scaleX;
        const py = (prop.position.z + 30) * scaleY;
        g.fillStyle = valveColors[vCount % 3] ?? '#ff9900';
        g.beginPath();
        g.arc(px, py, 3, 0, Math.PI * 2);
        g.fill();
        vCount++;
      }
    }

    // Spawn & Gate
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 50) * scaleX, (sp.z + 30) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 50) * scaleX, (ex.z + 30) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

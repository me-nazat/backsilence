/* ── MarbleAtriumMap.ts ───────────────────────────────────────────────────
 *  Map 3: The Echoing Marble Atrium (3 stars)
 *  Tiered neoclassical atrium: flooded lower court, sinking stepping stones,
 *  mid terrace colonnade, safe upper balcony, pebble lures, 4-bell melody sequence.
 * ──────────────────────────────────────────────────────────────────────── */

import { MeshStandardMaterial } from 'three';
import type { LayoutCtx, LayoutData, MapDefinition, PlatformDef, PillarDef, BoxDef, StairDef, PropDef, BuildEnv } from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { Rng } from '../../procedural/core/prng.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';

export const MarbleAtriumMap: MapDefinition = {
  id: 'marble_atrium',
  name: 'The Echoing Marble Atrium',
  tagline: 'Vast colonnades, sinking stepping-stones, and acoustic bronze bells under oculus light.',
  stars: 3,
  reverb: 'atrium',
  acoustics: {
    hearingMul: 1.1,
  },
  atmosphere: {
    fog: {
      color: '#cfd2d6',
      density: 0.03,
    },
    exposure: 1.15,
    hemisphere: {
      sky: '#e4e7eb',
      ground: '#7e8389',
    },
    sun: {
      color: '#fffef0',
      intensity: 1.8,
      direction: { x: 0.2, y: 1.0, z: 0.3 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.marble_atrium,

  generateLayout(ctx: LayoutCtx): LayoutData {
    const rng = new Rng(ctx.seed);
    const bounds = { minX: -40, minZ: -40, maxX: 40, maxZ: 40 };

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const pillars: PillarDef[] = [];
    const stairs: StairDef[] = [];
    const props: PropDef[] = [];

    // Seeded 4-note melody (indices 0..3)
    const melody = [
      rng.int(0, 3),
      rng.int(0, 3),
      rng.int(0, 3),
      rng.int(0, 3),
    ];
    // Ensure at least 3 distinct notes for good puzzle variety
    if (new Set(melody).size < 3) {
      melody[1] = (melody[0]! + 1) % 4;
      melody[3] = (melody[2]! + 2) % 4;
    }

    // 1. Central Fountain Plinth: 12 x 12 m at +0.3m
    platforms.push({
      id: 'plat_fountain',
      rect: [-6, -6, 6, 6],
      topY: 0.3,
      kind: 'marble',
    });

    props.push({
      id: 'fountain_center',
      kind: 'fountain',
      position: { x: 0, y: 0.3, z: 0 },
    });

    props.push({
      id: 'console_fountain',
      kind: 'melody_console',
      position: { x: 0, y: 0.3, z: -2.5 },
      params: { melody },
    });

    // 2. Mid Terrace Ring: +0.3m (4m wide, outer 32x32, inner 24x24)
    platforms.push(
      // North terrace
      { id: 'terrace_north', rect: [-16, 12, 16, 16], topY: 0.3, kind: 'marble' },
      // South terrace (spawn area)
      { id: 'terrace_south', rect: [-16, -16, 16, -12], topY: 0.3, kind: 'marble' },
      // West terrace
      { id: 'terrace_west', rect: [-16, -12, -12, 12], topY: 0.3, kind: 'marble' },
      // East terrace (exit area)
      { id: 'terrace_east', rect: [12, -12, 16, 12], topY: 0.3, kind: 'marble' },
    );

    // 3. Upper Balcony Ring: +3.0m (outer 38x38, inner 32x32)
    platforms.push(
      { id: 'balcony_north', rect: [-19, 16, 19, 19], topY: 3.0, kind: 'marble' },
      { id: 'balcony_south', rect: [-19, -19, 19, -16], topY: 3.0, kind: 'marble' },
      { id: 'balcony_west', rect: [-19, -16, -16, 16], topY: 3.0, kind: 'marble' },
      { id: 'balcony_east', rect: [16, -16, 19, 16], topY: 3.0, kind: 'marble' },
    );

    // Marble stairs from South Terrace up to South Balcony
    stairs.push({
      id: 'stairs_south_balcony',
      x: -2.0,
      z: -14.0,
      width: 4.0,
      riser: 0.18,
      run: 0.28,
      steps: 15,
      baseY: 0.3,
      direction: 'z-',
    });

    // 4. Sinking Stepping Stones in the lower flooded court (-0.9m)
    // 14 platforms (3 x 3 m) connecting fountain plinth to terraces and bells
    const steppingLocs = [
      // Routes South <-> Fountain
      { id: 'step_s1', x: 0, z: -9 },
      { id: 'step_sw1', x: -8, z: -8 },
      { id: 'step_se1', x: 8, z: -8 },
      // Routes North <-> Fountain
      { id: 'step_n1', x: 0, z: 9 },
      { id: 'step_nw1', x: -8, z: 8 },
      { id: 'step_ne1', x: 8, z: 8 },
      // Routes West <-> Fountain
      { id: 'step_w1', x: -9, z: 0 },
      { id: 'step_w2', x: -8, z: -3 },
      { id: 'step_w3', x: -8, z: 3 },
      // Routes East <-> Fountain
      { id: 'step_e1', x: 9, z: 0 },
      { id: 'step_e2', x: 8, z: -3 },
      { id: 'step_e3', x: 8, z: 3 },
      // Bell station stepping stones in court
      { id: 'step_bell_0', x: -5, z: 9 },
      { id: 'step_bell_1', x: 5, z: -9 },
    ];

    for (const st of steppingLocs) {
      platforms.push({
        id: st.id,
        rect: [st.x - 1.5, st.z - 1.5, st.x + 1.5, st.z + 1.5],
        topY: 0.3,
        kind: 'marble',
        dynamic: {
          id: st.id,
          type: 'sinking',
          standThreshold: 7.0,
          sinkDepth: -0.55,
          sinkTime: 3.0,
          submergedTime: 10.0,
          riseTime: 4.0,
        },
      });
    }

    // 5. 4 Bell Stations (notes 0..3)
    // Bell 0: On court stepping stone NW
    props.push({
      id: 'bell_0',
      kind: 'bell',
      position: { x: -5, y: 0.3 + 1.4, z: 9 },
      params: { noteIndex: 0, pitch: 0 },
    });
    // Bell 1: On court stepping stone SE
    props.push({
      id: 'bell_1',
      kind: 'bell',
      position: { x: 5, y: 0.3 + 1.4, z: -9 },
      params: { noteIndex: 1, pitch: 1 },
    });
    // Bell 2: On Mid Terrace West
    props.push({
      id: 'bell_2',
      kind: 'bell',
      position: { x: -14, y: 0.3 + 1.4, z: 0 },
      params: { noteIndex: 2, pitch: 2 },
    });
    // Bell 3: On Upper Balcony North (Safe zone)
    props.push({
      id: 'bell_3',
      kind: 'bell',
      position: { x: 0, y: 3.0 + 1.4, z: 17.5 },
      params: { noteIndex: 3, pitch: 3 },
    });

    // 6. Pebble Piles (14 scattered piles of 2-3 pebbles)
    const pebbleLocs = [
      { x: -2, z: -13 }, { x: 3, z: -13 }, { x: -14, z: -6 }, { x: -14, z: 6 },
      { x: 14, z: -6 }, { x: 14, z: 6 }, { x: -4, z: 0 }, { x: 4, z: 0 },
      { x: -5, z: 4 }, { x: 5, z: -4 }, { x: -17, z: 17 }, { x: 17, z: 17 },
      { x: -17, z: -17 }, { x: 17, z: -17 },
    ];
    for (let i = 0; i < pebbleLocs.length; i++) {
      const pl = pebbleLocs[i]!;
      props.push({
        id: `pebble_pile_${i + 1}`,
        kind: 'pebble_pile',
        position: { x: pl.x, y: 0.3, z: pl.z },
      });
    }

    // 7. Colonnades of marble columns around court
    for (let x = -11; x <= 11; x += 4) {
      pillars.push(
        { id: `col_n_${x}`, x, z: 12, radius: 0.45, height: 4.8, kind: 'marble' },
        { id: `col_s_${x}`, x, z: -12, radius: 0.45, height: 4.8, kind: 'marble' },
      );
    }
    for (let z = -8; z <= 8; z += 4) {
      pillars.push(
        { id: `col_w_${z}`, x: -12, z, radius: 0.45, height: 4.8, kind: 'marble' },
        { id: `col_e_${z}`, x: 12, z, radius: 0.45, height: 4.8, kind: 'marble' },
      );
    }

    // Exit Gate on Terrace East
    props.push({
      id: 'exit_gate_atrium',
      kind: 'blast_door',
      position: { x: 15.5, y: 0.3, z: 0 },
      yaw: Math.PI / 2,
    });

    // Outer perimeter walls
    walls.push(
      { id: 'atrium_wall_n', min: { x: -39, y: -0.9, z: 38 }, max: { x: 39, y: 8.0, z: 39 }, isWall: true },
      { id: 'atrium_wall_s', min: { x: -39, y: -0.9, z: -39 }, max: { x: 39, y: 8.0, z: -38 }, isWall: true },
      { id: 'atrium_wall_w', min: { x: -39, y: -0.9, z: -39 }, max: { x: -38, y: 8.0, z: 39 }, isWall: true },
      { id: 'atrium_wall_e', min: { x: 38, y: -0.9, z: -39 }, max: { x: 39, y: 8.0, z: 39 }, isWall: true },
    );

    // Player spawn on South Terrace
    const playerSpawn = { x: 0, y: 0.3, z: -14.0 };
    // Monster spawn in lower court NE (far from player, > 25m)
    const monsterPos = { x: 8, y: -0.9, z: 12 };

    return {
      mapId: 'marble_atrium',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars,
      stairs,
      waterBodies: [
        {
          id: 'atrium_water',
          rect: [-40, -40, 40, 40],
          floorY: -0.9,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'melody_puzzle',
          type: 'ResonanceSequence',
          position: { x: 15.5, y: 0.3, z: 0 },
          params: { melody },
        },
      ],
      spawns: {
        player: [playerSpawn],
        monsters: [
          {
            id: 'monster_atrium',
            variant: 'standard',
            spawn: monsterPos,
            hearingMul: 1.1,
          },
        ],
      },
      exit: {
        id: 'exit_marble_atrium',
        position: { x: 18.0, y: 0.3, z: 0 },
      },
      meta: {
        melody,
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const reg = TextureRegistry.getInstance();
    const marble = reg.getMarbleSet(layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: marble.albedo,
      roughnessMap: marble.roughness,
      normalMap: marble.normal,
      roughness: 0.25,
      metalness: 0.05,
    });

    const wallMat = new MeshStandardMaterial({
      map: marble.albedo,
      roughnessMap: marble.roughness,
      normalMap: marble.normal,
      roughness: 0.35,
      metalness: 0.02,
    });

    const floorMat = new MeshStandardMaterial({
      map: marble.albedo,
      roughnessMap: marble.roughness,
      normalMap: marble.normal,
      roughness: 0.15,
      metalness: 0.05,
    });

    return buildStandardMapInstance(layout, env, { platformMat, wallMat, floorMat });
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 80.0;
    const scaleY = h / 80.0;

    // Clear pool water background
    g.fillStyle = '#4a7572';
    g.fillRect(0, 0, w, h);

    // Terraces and balconies (pale marble rings)
    g.fillStyle = '#d8dbdf';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 40) * scaleX;
      const ry = (p.rect[1] + 40) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Bells (bronze gold circles)
    for (const prop of layout.props) {
      if (prop.kind === 'bell') {
        const bx = (prop.position.x + 40) * scaleX;
        const by = (prop.position.z + 40) * scaleY;
        g.fillStyle = '#d4af37';
        g.beginPath();
        g.arc(bx, by, 3, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Spawn & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 40) * scaleX, (sp.z + 40) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 40) * scaleX, (ex.z + 40) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

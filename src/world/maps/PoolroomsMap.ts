/* ── PoolroomsMap.ts ────────────────────────────────────────────────────────
 *  Map 1: The Flooded Poolrooms (Classic, 2 stars)
 *  Creamy fog, tan ceramic mosaic slabs, milky-green water, arches in haze,
 *  4 code pillars with ordinal markers, sequence keypad exit.
 * ──────────────────────────────────────────────────────────────────────── */

import { MeshStandardMaterial } from 'three';
import type { LayoutCtx, LayoutData, MapDefinition, PlatformDef, PillarDef, BoxDef, PropDef, StairDef, BuildEnv } from '../MapTypes.js';
import type { MapInstance } from './MapInstance.js';
import { Rng } from '../../procedural/core/prng.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance } from './CommonMapBuilder.js';

export const PoolroomsMap: MapDefinition = {
  id: 'poolrooms',
  name: 'Classic Archipelago',
  tagline: 'Endless tiled arches above silent milky-green water.',
  stars: 2,
  reverb: 'poolroom',
  acoustics: {
    hearingMul: 1.0,
  },
  atmosphere: {
    fog: {
      color: '#b3bb9f',
      density: 0.045,
    },
    exposure: 1.1,
    hemisphere: {
      sky: '#b3bb9f',
      ground: '#7c9e5b',
    },
    sun: {
      color: '#fff8e7',
      intensity: 1.1,
      direction: { x: 0.4, y: 1.0, z: 0.3 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.poolrooms,
  postGrade: {
    lift: [0.03, 0.025, 0.015],
    saturation: 1.06,
    gain: [1.0, 0.99, 0.97],
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const rng = new Rng(ctx.seed);
    const bounds = { minX: -48, minZ: -48, maxX: 48, maxZ: 48 };

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const pillars: PillarDef[] = [];
    const props: PropDef[] = [];
    const stairs: StairDef[] = [];

    // 1. Archipelago blue-noise slab placement (15 slabs)
    const targetCount = 16;
    const slabW = [7, 8, 9, 10, 11, 12];
    const slabD = [7, 8, 9, 10, 11, 12];

    // Guarantee corner spawn slab
    platforms.push({
      id: 'slab_spawn',
      rect: [-42, -42, -32, -32],
      topY: 0.3,
      kind: 'tile',
    });

    // Step-by-step chain toward opposite corner to guarantee a silent jump route
    // Waypoints from (-37, -37) to (+37, +37)
    const waypoints = [
      { x: -37, z: -37 },
      { x: -26, z: -30 },
      { x: -16, z: -20 },
      { x: -8, z: -10 },
      { x: 0, z: 0 },
      { x: 10, z: 8 },
      { x: 20, z: 18 },
      { x: 30, z: 28 },
      { x: 38, z: 38 },
    ];

    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i]!;
      const halfW = 4.0 + (rng.next() % 2);
      const halfD = 4.0 + (rng.next() % 2);
      const id = i === waypoints.length - 1 ? 'slab_exit' : `slab_route_${i}`;
      platforms.push({
        id,
        rect: [wp.x - halfW, wp.z - halfD, wp.x + halfW, wp.z + halfD],
        topY: 0.3,
        kind: 'tile',
      });
    }

    // Add remaining blue-noise slabs for exploration & decoy pillars
    let attempts = 0;
    let raisedCreated = false;
    while (platforms.length < targetCount && attempts < 200) {
      attempts++;
      const cx = rng.range(-38, 38);
      const cz = rng.range(-38, 38);
      const sw = slabW[rng.int(0, slabW.length - 1)] ?? 8;
      const sd = slabD[rng.int(0, slabD.length - 1)] ?? 8;
      const rect: [number, number, number, number] = [
        cx - sw * 0.5,
        cz - sd * 0.5,
        cx + sw * 0.5,
        cz + sd * 0.5,
      ];

      // Ensure min gap 1.2m and max overlap 0
      let overlaps = false;
      for (const p of platforms) {
        if (!(rect[2] + 1.2 <= p.rect[0] || rect[0] >= p.rect[2] + 1.2 || rect[3] + 1.2 <= p.rect[1] || rect[1] >= p.rect[3] + 1.2)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        const isRaised = !raisedCreated;
        if (isRaised) raisedCreated = true;
        const topY = isRaised ? 1.1 : 0.3;
        platforms.push({
          id: `slab_aux_${platforms.length}`,
          rect,
          topY,
          kind: 'tile',
        });
        if (isRaised) {
          const midX = (rect[0] + rect[2]) * 0.5;
          stairs.push({
            id: 'stair_raised_vantage',
            x: midX - 1.2,
            z: rect[1] - 1.12,
            width: 2.4,
            riser: 0.20,
            run: 0.28,
            steps: 4,
            baseY: 0.3,
            direction: 'z+',
          });
        }
      }
    }

    // 2. Select 4 distinct slabs for code pillars (separated >= 20m)
    // 4 code digits (seeded distinct digits)
    const digitsPool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    // Shuffle digitsPool deterministically
    for (let i = digitsPool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const temp = digitsPool[i]!;
      digitsPool[i] = digitsPool[j]!;
      digitsPool[j] = temp;
    }
    const codeDigits = digitsPool.slice(0, 4);
    const codeString = codeDigits.join('');

    // Pick 4 well-separated slabs (excluding spawn and exit)
    const candidateSlabs = platforms.filter((p) => p.id !== 'slab_spawn' && p.id !== 'slab_exit');
    const chosenCodeSlabs: PlatformDef[] = [];

    for (const slab of candidateSlabs) {
      if (chosenCodeSlabs.length === 4) break;
      const scx = (slab.rect[0] + slab.rect[2]) * 0.5;
      const scz = (slab.rect[1] + slab.rect[3]) * 0.5;
      let ok = true;
      for (const chosen of chosenCodeSlabs) {
        const ccx = (chosen.rect[0] + chosen.rect[2]) * 0.5;
        const ccz = (chosen.rect[1] + chosen.rect[3]) * 0.5;
        if (Math.hypot(scx - ccx, scz - ccz) < 20.0) {
          ok = false;
          break;
        }
      }
      if (ok) chosenCodeSlabs.push(slab);
    }

    // Place 4 code pillars on the chosen slabs
    for (let i = 0; i < chosenCodeSlabs.length; i++) {
      const slab = chosenCodeSlabs[i]!;
      const cx = (slab.rect[0] + slab.rect[2]) * 0.5;
      const cz = (slab.rect[1] + slab.rect[3]) * 0.5;
      pillars.push({
        id: `pillar_code_${i + 1}`,
        x: cx,
        z: cz,
        radius: 0.8,
        height: 4.5,
        decalNumber: codeDigits[i],
        ordinal: i + 1,
        kind: 'tile',
      });
    }

    // Place 5 decoy pillars (with digits but no ordinal) on other slabs
    const decoyDigits = [0, 8, 4, 9, 6];
    let decoyCount = 0;
    for (const slab of candidateSlabs) {
      if (chosenCodeSlabs.includes(slab) || decoyCount >= 5) continue;
      const cx = (slab.rect[0] + slab.rect[2]) * 0.5;
      const cz = (slab.rect[1] + slab.rect[3]) * 0.5;
      pillars.push({
        id: `pillar_decoy_${decoyCount + 1}`,
        x: cx,
        z: cz,
        radius: 0.7,
        height: 4.5,
        decalNumber: decoyDigits[decoyCount % decoyDigits.length],
        kind: 'tile',
      });
      decoyCount++;
    }

    // 3. Arches & Occlusion wall fragments on ~40% of slabs
    for (let i = 0; i < platforms.length; i++) {
      if (i % 2 === 0) {
        const slab = platforms[i]!;
        const cx = (slab.rect[0] + slab.rect[2]) * 0.5;
        const cz = (slab.rect[1] + slab.rect[3]) * 0.5;
        walls.push({
          id: `arch_wall_${i}`,
          min: { x: cx - 2.5, y: slab.topY, z: cz - 0.25 },
          max: { x: cx + 2.5, y: slab.topY + 3.2, z: cz + 0.25 },
          kind: 'arch',
          isWall: true,
        });
      }
    }

    // 4. Spawn & Exit setup
    const spawnSlab = platforms[0]!;
    const exitSlab = platforms.find((p) => p.id === 'slab_exit')!;
    const exitX = (exitSlab.rect[0] + exitSlab.rect[2]) * 0.5;
    const exitZ = exitSlab.rect[3] - 1.2;

    props.push({
      id: 'keypad_exit',
      kind: 'keypad',
      position: { x: exitX + 1.2, y: exitSlab.topY + 1.3, z: exitZ },
      yaw: 0,
    });

    // Outer perimeter walls (hidden in fog)
    walls.push(
      { id: 'bound_north', min: { x: -48, y: -0.9, z: 47 }, max: { x: 48, y: 5.0, z: 48 }, isWall: true },
      { id: 'bound_south', min: { x: -48, y: -0.9, z: -48 }, max: { x: 48, y: 5.0, z: -47 }, isWall: true },
      { id: 'bound_west', min: { x: -48, y: -0.9, z: -48 }, max: { x: -47, y: 5.0, z: 48 }, isWall: true },
      { id: 'bound_east', min: { x: 47, y: -0.9, z: -48 }, max: { x: 48, y: 5.0, z: 48 }, isWall: true },
    );

    // Monster spawn in open water >= 40m from player
    const monsterPos = { x: 22, y: -0.9, z: -25 };

    return {
      mapId: 'poolrooms',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars,
      stairs,
      waterBodies: [
        {
          id: 'deep_trench',
          rect: [10, -48, 48, 10],
          floorY: -1.4,
          waterY: 0.0,
        },
        {
          id: 'shallow_shelf',
          rect: [-48, -10, 10, 20],
          floorY: -0.3,
          waterY: 0.0,
        },
        {
          id: 'pool_water',
          rect: [-48, -48, 48, 48],
          floorY: -0.9,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'keypad_exit',
          type: 'SequenceKeypad',
          position: { x: exitX + 1.2, y: exitSlab.topY + 1.3, z: exitZ },
          params: { code: codeString },
        },
      ],
      spawns: {
        player: [{ x: (spawnSlab.rect[0] + spawnSlab.rect[2]) * 0.5, y: spawnSlab.topY, z: (spawnSlab.rect[1] + spawnSlab.rect[3]) * 0.5 }],
        monsters: [
          {
            id: 'monster_standard',
            variant: 'standard',
            spawn: monsterPos,
            sleeperSpawn: { x: -20, y: -0.9, z: -20 },
            hearingMul: 1.0,
          },
        ],
      },
      patrolLanes: [
        {
          id: 'patrol_central',
          points: [
            { x: -32, y: -0.9, z: -32 },
            { x: -20, y: -0.9, z: -20 },
            { x: 0, y: -0.9, z: 0 },
            { x: 20, y: -0.9, z: 20 },
            { x: 32, y: -0.9, z: 32 },
          ],
        },
        {
          id: 'patrol_south',
          points: [
            { x: -30, y: -0.9, z: -10 },
            { x: 0, y: -0.9, z: -20 },
            { x: 25, y: -0.9, z: -15 },
          ],
        },
      ],
      exit: {
        id: 'exit_poolrooms',
        position: { x: exitX, y: exitSlab.topY, z: exitZ },
      },
      meta: {
        code: codeString,
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const reg = TextureRegistry.getInstance();
    const platTiles = reg.getTileSet('platform', layout.seed);
    const wallTiles = reg.getTileSet('wall', layout.seed);
    const floorTiles = reg.getTileSet('floorWet', layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: platTiles.albedo,
      roughnessMap: platTiles.roughness,
      normalMap: platTiles.normal,
      aoMap: platTiles.ao,
      aoMapIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.05,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    const wallMat = new MeshStandardMaterial({
      map: wallTiles.albedo,
      roughnessMap: wallTiles.roughness,
      normalMap: wallTiles.normal,
      aoMap: wallTiles.ao,
      aoMapIntensity: 0.85,
      roughness: 0.45,
      metalness: 0.02,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    const floorMat = new MeshStandardMaterial({
      map: floorTiles.albedo,
      roughnessMap: floorTiles.roughness,
      normalMap: floorTiles.normal,
      aoMap: floorTiles.ao,
      aoMapIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.05,
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    return buildStandardMapInstance(layout, env, { platformMat, wallMat, floorMat });
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 96.0;
    const scaleY = h / 96.0;

    // Background water
    g.fillStyle = '#2d544e';
    g.fillRect(0, 0, w, h);

    // Slabs
    g.fillStyle = '#d5cbb0';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 48) * scaleX;
      const ry = (p.rect[1] + 48) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Code pillars (highlighted orange)
    for (const pil of layout.pillars) {
      const px = (pil.x + 48) * scaleX;
      const py = (pil.z + 48) * scaleY;
      g.fillStyle = pil.ordinal ? '#e08a3c' : '#222';
      g.beginPath();
      g.arc(px, py, pil.ordinal ? 3 : 2, 0, Math.PI * 2);
      g.fill();
    }

    // Spawn & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 48) * scaleX, (sp.z + 48) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 48) * scaleX, (ex.z + 48) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

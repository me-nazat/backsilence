/* ── NatatoriumMap.ts ──────────────────────────────────────────────────────
 *  Map 1 (Default): The Grand Natatorium
 *  Authentic Backrooms Poolrooms architecture based on reference videos:
 *  - Zone A: The Skylight Spawn Pool & Swim-Under Tunnel
 *  - Zone B: The Great Flooded Pillar Hall & Stepping-Stone Course (~45 dry platforms)
 *  - Zone C: Bright Lit Arched Checkpoint Corridor (S-bend, warm circular lamps)
 *  - World-space ceramic tile materials (TileMaterialFactory) with zero UV stretching
 *  - Hand-painted decals (mural splash crown, checkpoint warning, curved pillar arrows, stencils)
 * ──────────────────────────────────────────────────────────────────────── */

import {
  MeshStandardMaterial,
  Mesh,
  PlaneGeometry,
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Vector3,
  Color,
  PointLight,
  Float32BufferAttribute,
  MeshBasicMaterial,
  DoubleSide,
} from 'three';
import type {
  LayoutCtx,
  LayoutData,
  MapDefinition,
  PlatformDef,
  PillarDef,
  BoxDef,
  PropDef,
  BuildEnv,
} from '../MapTypes.js';
import type { Vec3 } from '../../types/contracts.js';
import type { MapInstance } from './MapInstance.js';
import { Rng } from '../../procedural/core/prng.js';
import { WORLD } from '../../app/Config.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance, markWorldShadows, scaleBoxUv, type CustomBuilderHook } from './CommonMapBuilder.js';
import { makeMosaicEarTexture } from '../../procedural/textures/MosaicEarTexture.js';
import { bakeVertexAO } from '../../procedural/geometry/VertexAO.js';
import { createLightShaftMesh, createDustMotes } from '../../game/rendering/LightShafts.js';
import { buildColorPanelGeometry } from '../levelart/LevelArtProps.js';
import { buildArchGeometry } from '../../procedural/geometry/ArchBuilder.js';
import { buildVaultGeometry, createVaultSkylightPanels } from '../../procedural/geometry/VaultBuilder.js';
import { TileMaterialFactory } from '../../procedural/textures/TileMaterialFactory.js';
import { DecalSystem } from '../../game/decals/DecalSystem.js';
import {
  makeSpawnWallMural,
  makeExitWarningDecal,
  makePillarWayfindingArrow,
  makePuzzleDigitDecal,
  makeHandwrittenWarningGraffiti,
  makeWarningDecal,
  makeRouteArrowDecal,
  makeThrowLureTeachingDecal,
} from '../../procedural/textures/GraffitiDecals.js';
import type { LightStreak } from '../../game/water/WaterMaterial.js';

export const NatatoriumMap: MapDefinition = {
  id: 'natatorium',
  name: 'The Natatorium (Liminal Poolrooms)',
  tagline: "Bright cream ceramic arches, giant cylindrical pillars, and translucent emerald water. It can't see you. It hears the water.",
  stars: 2,
  reverb: 'poolroom',
  acoustics: {
    hearingMul: 1.05,
  },
  atmosphere: {
    fog: {
      color: '#d6dccd',
      density: 0.0145,
    },
    exposure: 1.12,
    hemisphere: {
      sky: '#fff9e6',
      ground: '#6cb48e',
      intensity: 1.25,
    },
    sun: {
      color: '#fffdf5',
      intensity: 1.15,
      direction: { x: 0.35, y: 0.9, z: 0.25 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.natatorium,
  postGrade: {
    lift: [0.045, 0.038, 0.022],
    gamma: [0.98, 1.01, 1.02],
    gain: [1.02, 0.99, 0.95],
    saturation: 2.3,
    tint: [1.02, 1.0, 0.98],
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const rng = new Rng(ctx.seed);
    const bounds = { minX: -45, minZ: -60, maxX: 45, maxZ: 58 };

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const pillars: PillarDef[] = [];
    const props: PropDef[] = [];

    // ──────────────────────────────────────────────────────────────────────────
    // ZONE A: The Skylight Spawn Pool & Swim-Under Tunnel (Video 2 00:00–00:07)
    // ──────────────────────────────────────────────────────────────────────────

    // 1. Entry Foyer / Spawn Deck (+WORLD.PLATFORM_TOP_Y above water)
    // Player spawns at (0.0, 0.30, 49.5) standing on this dry slab facing -Z
    platforms.push({
      id: 'plat_foyer',
      rect: [-4.0, 47.5, 4.0, 54.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // Shallow water pool floor between spawn slab and tagline wall (z: 43.8 to 47.5)
    // Water level is at y = 0.0, pool floor is at y = -0.30 (depth 0.30m)
    // Cracked floor tile is clearly visible through the shallow translucent water (f_001–f_003)
    platforms.push({
      id: 'plat_spawn_pool_floor',
      rect: [-7.0, 43.8, 6.5, 47.5],
      topY: -0.30,
      kind: 'tile',
    });


    // Dry Side Room (f_013–f_015): plaster walls, tiled round pillar with spray '2'
    platforms.push({ id: 'plat_dry_room', rect: [-14.0, 44.0, -4.0, 57.5], topY: WORLD.PLATFORM_TOP_Y, kind: 'tile' });
    platforms.push({ id: 'plat_foyer_south', rect: [-4.0, 54.0, 12.0, 57.5], topY: WORLD.PLATFORM_TOP_Y, kind: 'tile' });
    pillars.push({
      id: 'pil_dry_room_2',
      x: -8.0,
      z: 48.0,
      radius: 0.75,
      height: 6.0,
      decalNumber: 2,
      decalWidth: 0.8,
      decalY: 2.0,
      kind: 'tile',
    });
    walls.push({ id: 'wall_dry_room_w', min: { x: -14.6, y: -0.75, z: 44.0 }, max: { x: -14.0, y: 6.0, z: 57.5 }, isWall: true });
    walls.push({ id: 'wall_dry_room_n', min: { x: -14.0, y: -0.75, z: 43.4 }, max: { x: -10.5, y: 6.0, z: 44.0 }, isWall: true });

    // Curved tan-tiled peninsula platforms in Zone A to the left (Video 2 00:05)
    platforms.push({
      id: 'plat_peninsula_1',
      rect: [-14, 44, -8.5, 49],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_peninsula_2',
      rect: [-18, 36, -11, 43],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_peninsula_3',
      rect: [-16, 28, -9, 35],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_peninsula_tip',
      rect: [-12, 22, -6, 27],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // Zone A central stepping-stones connecting Foyer towards the swim-under tunnel (z=44 -> z=36.5)
    platforms.push({
      id: 'plat_a_step1',
      rect: [-2.0, 38.0, 2.0, 42.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_a_step2',
      rect: [-1.6, 33.0, 1.6, 36.5],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // Zone A East stepping-stones
    platforms.push({
      id: 'plat_a_east1',
      rect: [4.0, 38.0, 9.0, 43.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_a_east2',
      rect: [10.0, 31.0, 15.0, 37.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_a_east3',
      rect: [7.0, 24.0, 12.0, 29.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ZONE B: The Great Flooded Pillar Hall & Stepping-Stone Course (~45 platforms)
    // ──────────────────────────────────────────────────────────────────────────

    // Entry stepping-stones emerging from the low bridge / swim-under tunnel (z=31.5 -> z=18)
    platforms.push({
      id: 'plat_b_entry',
      rect: [-1.6, 28.0, 1.6, 31.5],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_step_w1',
      rect: [-5.5, 23.5, -2.0, 26.5],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_step_w2',
      rect: [-11.0, 21.0, -7.0, 25.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_step_c1',
      rect: [-3.0, 18.0, 0.5, 21.5],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // Central stepping-stone course through Zone B
    platforms.push({
      id: 'plat_b_cent_1',
      rect: [-2.0, 12.5, 2.0, 16.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_cent_2',
      rect: [-2.5, 7.0, 1.5, 10.5],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_cent_3',
      rect: [-2.0, 1.5, 2.0, 5.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    // Offset island maintaining dry path while leaving (0, -1.5) open water for apex monster
    platforms.push({
      id: 'plat_b_cent_3b',
      rect: [-6.0, -1.5, -2.0, 1.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_cent_4',
      rect: [-2.0, -7.5, 2.0, -4.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_cent_5',
      rect: [-2.5, -14.0, 1.5, -9.5],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_cent_6',
      rect: [-2.0, -20.5, 2.0, -16.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_cent_7',
      rect: [-2.0, -26.0, 2.0, -22.5],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // West archipelago stepping-stones in Zone B
    platforms.push({
      id: 'plat_b_west_lane1',
      rect: [-18.0, 14.0, -13.0, 19.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_west_lane2',
      rect: [-15.0, 7.0, -10.0, 12.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_west_lane3',
      rect: [-18.0, 0.0, -13.0, 5.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_west_lane4',
      rect: [-15.0, -7.0, -10.0, -2.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_west_lane5',
      rect: [-19.0, -15.0, -14.0, -9.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_west_lane6',
      rect: [-15.0, -23.0, -10.0, -17.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // East archipelago stepping-stones in Zone B
    platforms.push({
      id: 'plat_b_east_lane1',
      rect: [8.0, 15.0, 13.0, 20.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_east_lane2',
      rect: [15.0, 9.0, 20.0, 14.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_east_lane3',
      rect: [9.0, 2.0, 14.0, 7.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_east_lane4',
      rect: [16.0, -5.0, 21.0, 0.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_east_lane5',
      rect: [9.0, -12.0, 14.0, -7.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_east_lane6',
      rect: [15.0, -19.0, 20.0, -14.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_east_lane7',
      rect: [8.0, -26.0, 13.0, -21.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // Perimeter islands
    platforms.push({
      id: 'plat_b_far_w1',
      rect: [-32.0, 12.0, -26.0, 18.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_far_w2',
      rect: [-33.0, -2.0, -27.0, 4.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_far_w3',
      rect: [-32.0, -16.0, -26.0, -10.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_far_e1',
      rect: [26.0, 12.0, 32.0, 18.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_far_e2',
      rect: [27.0, -2.0, 33.0, 4.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_b_far_e3',
      rect: [26.0, -16.0, 32.0, -10.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // Narrow Water Trench Safe-Zone (width 1.05m, length 8.0m, flanked by two 6m x 8m dry platforms)
    platforms.push({
      id: 'plat_trench_west',
      rect: [-7.05, -35.0, -1.05, -27.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_trench_east',
      rect: [0.0, -35.0, 6.0, -27.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ZONE C: Bright Lit Arched Checkpoint Corridor & Exit (Video 1 02:50–02:52)
    // ──────────────────────────────────────────────────────────────────────────

    // Approach platforms connecting trench to Zone C arch
    platforms.push({
      id: 'plat_b_approach',
      rect: [-3.5, -40.0, 3.5, -37.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_corridor_ramp',
      rect: [-3.5, -45.0, 3.5, -42.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_corridor_sbend',
      rect: [-5.0, -51.0, 1.5, -47.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });
    // Plant Room / Exit Platform
    platforms.push({
      id: 'plat_plant_room',
      rect: [-8.0, -58.0, 8.0, -53.0],
      topY: WORLD.PLATFORM_TOP_Y,
      kind: 'tile',
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Giant Cylindrical Columns, Code Pillars, and Decoy Columns
    // ──────────────────────────────────────────────────────────────────────────

    // Distinct random 4-digit puzzle code
    const digits: number[] = [];
    while (digits.length < 4) {
      const d = rng.int(1, 9);
      if (!digits.includes(d)) digits.push(d);
    }

    // 4 Ordinal Code Pillars (each >= 20m apart)
    // Pillar 1: Zone A / B Colonnade (Blue = #1)
    pillars.push({
      id: 'pil_code_1',
      x: -8.0,
      z: 30.0,
      radius: 0.75,
      height: 8.0,
      decalNumber: digits[0],
      ordinal: 1,
      clueColor: '#1e88e5',
      kind: 'tile',
    });
    // Pillar 2: East Hall (Green = #2)
    pillars.push({
      id: 'pil_code_2',
      x: 30.0,
      z: 2.0,
      radius: 0.75,
      height: 8.0,
      decalNumber: digits[1],
      ordinal: 2,
      clueColor: '#43a047',
      kind: 'tile',
    });
    // Pillar 3: West Hall (Yellow = #3)
    pillars.push({
      id: 'pil_code_3',
      x: -30.0,
      z: -6.0,
      radius: 0.75,
      height: 8.0,
      decalNumber: digits[2],
      ordinal: 3,
      clueColor: '#fbc02d',
      kind: 'tile',
    });
    // Pillar 4: Near Trench Safe Zone & Keypad Door (Red = #4)
    pillars.push({
      id: 'pil_code_4',
      x: 14.0,
      z: -36.0,
      radius: 0.75,
      height: 8.0,
      decalNumber: digits[3],
      ordinal: 4,
      clueColor: '#e53935',
      kind: 'tile',
    });

    // Giant Cylindrical Tiled Columns (radius 2.1m, height 9.0m, square UVs)
    // Also fulfill the requirement for >= 6 decoy pillars
    const giantPositions = [
      { id: 'pil_giant_1', x: -22.0, z: 18.0 },
      { id: 'pil_giant_2', x: 22.0, z: 18.0 },
      { id: 'pil_giant_3', x: -22.0, z: -2.0 },
      { id: 'pil_giant_4', x: 22.0, z: -2.0 },
      { id: 'pil_giant_5', x: -22.0, z: -22.0 },
      { id: 'pil_giant_6', x: 22.0, z: -22.0 },
      { id: 'pil_giant_7', x: -35.0, z: 8.0 },
      { id: 'pil_giant_8', x: 35.0, z: 8.0 },
      { id: 'pil_giant_9', x: -35.0, z: -12.0 },
      { id: 'pil_giant_10', x: 35.0, z: -12.0 },
    ];

    for (const gp of giantPositions) {
      pillars.push({
        id: gp.id,
        x: gp.x,
        z: gp.z,
        radius: 2.1,
        height: 9.0,
        decalNumber: rng.int(0, 9),
        ordinal: undefined,
        kind: 'tile',
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Walls, Arches, and Enclosures
    // ──────────────────────────────────────────────────────────────────────────

    // Outer Natatorium Boundary Walls (90m x 118m, height 9m)
    walls.push({
      id: 'wall_outer_south',
      min: { x: -45.0, y: -0.75, z: 57.5 },
      max: { x: 45.0, y: 9.0, z: 58.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_outer_north',
      min: { x: -45.0, y: -0.75, z: -60.5 },
      max: { x: 45.0, y: 9.0, z: -59.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_outer_west',
      min: { x: -45.5, y: -0.75, z: -60.0 },
      max: { x: -44.5, y: 9.0, z: 58.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_outer_east',
      min: { x: 44.5, y: -0.75, z: -60.0 },
      max: { x: 45.5, y: 9.0, z: 58.5 },
      isWall: true,
    });

    // Spawn Wall at z = 44.0 (facing player spawn at z = 49.5)
    // Left Wall Pier: [-7.0, 0.8], height y = -0.75m to 6.0m (flat mural wall segment)
    walls.push({
      id: 'wall_spawn_tagline',
      min: { x: -7.0, y: -0.75, z: 43.8 },
      max: { x: 0.8, y: 6.0, z: 44.2 },
      isWall: true,
    });

    // Right Wall Pier: [6.5, 12.0], height y = -0.75m to 9.0m
    walls.push({
      id: 'wall_foyer_arch_e',
      min: { x: 6.5, y: -0.75, z: 43.8 },
      max: { x: 12.0, y: 9.0, z: 44.2 },
      isWall: true,
    });
    // Overhead Arch Header Lintel: [0.8, 6.5], bottomY = 4.2m to 9.0m (width: 5.7m, clearance: 3.82m)
    walls.push({
      id: 'wall_foyer_arch_lintel',
      min: { x: 0.8, y: 4.2, z: 43.8 },
      max: { x: 6.5, y: 9.0, z: 44.2 },
      isWall: true,
    });

    // Foyer Side Enclosure Walls (height 9.0m)
    walls.push({
      id: 'wall_foyer_w',
      min: { x: -14.6, y: -0.75, z: 43.8 },
      max: { x: -14.0, y: 9.0, z: 57.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_foyer_e',
      min: { x: 12.0, y: -0.75, z: 43.8 },
      max: { x: 12.6, y: 9.0, z: 57.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_foyer_s',
      min: { x: -14.6, y: -0.75, z: 57.0 },
      max: { x: 12.6, y: 9.0, z: 57.6 },
      isWall: true,
    });

    // Dividing Wall between Zone A and Zone B (at z = 35)
    // High-clearance archway passage (width 5.5m, clearance 3.82m above 0.38m dry platform)
    // Left Wall Pier: [minX, passageMinX] = [-45.0, -2.75], height y = -0.75m to 9.0m
    walls.push({
      id: 'wall_zone_a_div_w',
      min: { x: -45.0, y: -0.75, z: 34.6 },
      max: { x: -2.75, y: 9.0, z: 35.4 },
      isWall: true,
    });
    // Right Wall Pier: [passageMaxX, maxX] = [2.75, 45.0], height y = -0.75m to 9.0m
    walls.push({
      id: 'wall_zone_a_div_e',
      min: { x: 2.75, y: -0.75, z: 34.6 },
      max: { x: 45.0, y: 9.0, z: 35.4 },
      isWall: true,
    });
    // Overhead Arch Header Lintel: [passageMinX, passageMaxX] = [-2.75, 2.75], bottomY = 4.2m to 9.0m
    // (width: 5.5m, clearance height: 3.82m above the 0.38m dry platform!)
    walls.push({
      id: 'wall_zone_a_div_lintel',
      min: { x: -2.75, y: 4.2, z: 34.6 },
      max: { x: 2.75, y: 9.0, z: 35.4 },
      isWall: true,
    });

    // Dividing Wall 1 in Zone B (at z = 8.0) pierced by 6.5m x 4.2m clearance arch
    walls.push({
      id: 'wall_arch1_w',
      min: { x: -45.0, y: -0.75, z: 7.6 },
      max: { x: -3.25, y: 9.0, z: 8.4 },
      isWall: true,
    });
    walls.push({
      id: 'wall_arch1_e',
      min: { x: 3.25, y: -0.75, z: 7.6 },
      max: { x: 45.0, y: 9.0, z: 8.4 },
      isWall: true,
    });
    walls.push({
      id: 'wall_arch1_lintel',
      min: { x: -3.25, y: 6.0, z: 7.6 },
      max: { x: 3.25, y: 9.0, z: 8.4 },
      isWall: true,
    });

    // Dividing Wall 2 in Zone B (at z = -14.0) pierced by 6.5m x 4.2m clearance arch
    walls.push({
      id: 'wall_arch2_w',
      min: { x: -45.0, y: -0.75, z: -14.4 },
      max: { x: -3.25, y: 9.0, z: -13.6 },
      isWall: true,
    });
    walls.push({
      id: 'wall_arch2_e',
      min: { x: 3.25, y: -0.75, z: -14.4 },
      max: { x: 45.0, y: 9.0, z: -13.6 },
      isWall: true,
    });
    walls.push({
      id: 'wall_arch2_lintel',
      min: { x: -3.25, y: 4.2, z: -14.4 },
      max: { x: 3.25, y: 9.0, z: -13.6 },
      isWall: true,
    });

    // Zone C Corridor Entrance Wall (at z = -44.0)
    walls.push({
      id: 'wall_corridor_div_w',
      min: { x: -45.0, y: -0.75, z: -44.5 },
      max: { x: -2.75, y: 9.0, z: -43.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_corridor_div_e',
      min: { x: 2.75, y: -0.75, z: -44.5 },
      max: { x: 45.0, y: 9.0, z: -43.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_corridor_div_lintel',
      min: { x: -2.75, y: 4.2, z: -44.5 },
      max: { x: 2.75, y: 9.0, z: -43.5 },
      isWall: true,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Props, Spawns, and Puzzles
    // ──────────────────────────────────────────────────────────────────────────

    // Drain wheel in Plant Room
    props.push({
      id: 'drain_wheel',
      kind: 'drain_wheel',
      position: { x: 0.0, y: WORLD.PLATFORM_TOP_Y, z: -54.0 },
    });

    // Collectible pebble props on dry platforms (Prompt 4B Section 2, Prompt 7)
    const pebbleSpawns = [
      { id: 'pebble_prop_0', x: -2.0, y: WORLD.PLATFORM_TOP_Y, z: 46.0 }, // First pile near foyer / spawn
      { id: 'pebble_prop_1', x: -0.5, y: WORLD.PLATFORM_TOP_Y, z: 8.5 },
      { id: 'pebble_prop_2', x: 0.0, y: WORLD.PLATFORM_TOP_Y, z: -6.0 },
      { id: 'pebble_prop_3', x: -12.5, y: WORLD.PLATFORM_TOP_Y, z: 9.5 },
      { id: 'pebble_prop_4', x: 17.5, y: WORLD.PLATFORM_TOP_Y, z: 11.5 },
      { id: 'pebble_prop_5', x: 0.0, y: WORLD.PLATFORM_TOP_Y, z: -18.0 },
    ];
    for (const p of pebbleSpawns) {
      props.push({
        id: p.id,
        kind: 'pebble',
        position: { x: p.x, y: p.y, z: p.z },
      });
    }

    // 7 Chlorine Cells for Campaign Objective Loop (Prompt 7)
    // Deterministic placement: >= 2 require >= 3m water crossings (1, 3, 4), >= 1 requires dry-room detour (0)
    const chlorineSpawns = [
      { id: 'chlorine_cell_0', x: -9.0, y: WORLD.PLATFORM_TOP_Y, z: 50.0 }, // dry-room detour on plat_dry_room
      { id: 'chlorine_cell_1', x: 12.5, y: WORLD.PLATFORM_TOP_Y, z: 34.0 }, // east stepping stone (>= 3.5m water crossing)
      { id: 'chlorine_cell_2', x: -12.5, y: WORLD.PLATFORM_TOP_Y, z: 9.5 }, // west colonnade on plat_b_west_lane2
      { id: 'chlorine_cell_3', x: -30.0, y: WORLD.PLATFORM_TOP_Y, z: 1.0 }, // deep west wing on plat_b_far_w2 (>= 4.0m water crossing)
      { id: 'chlorine_cell_4', x: 30.0, y: WORLD.PLATFORM_TOP_Y, z: 1.0 }, // deep east wing on plat_b_far_e2 (>= 4.0m water crossing)
      { id: 'chlorine_cell_5', x: 0.0, y: WORLD.PLATFORM_TOP_Y, z: -12.0 }, // mid-hall stepping slab on plat_b_cent_5
      { id: 'chlorine_cell_6', x: -4.0, y: WORLD.PLATFORM_TOP_Y, z: -31.0 }, // trench approach rim on plat_trench_west
    ];
    for (const c of chlorineSpawns) {
      props.push({
        id: c.id,
        kind: 'chlorine_cell',
        position: { x: c.x, y: c.y, z: c.z },
      });
    }

    // Generator at exit plant room (Prompt 7)
    props.push({
      id: 'exit_generator',
      kind: 'generator',
      position: { x: 0.0, y: WORLD.PLATFORM_TOP_Y, z: -57.5 },
    });

    // Buoyant props near water edges (Prompt 7 PUSH mechanic)
    const buoyantProps = [
      { id: 'skimmer_lid_foyer', kind: 'skimmer_lid', position: { x: 2.5, y: WORLD.PLATFORM_TOP_Y, z: 44.2 } },
      { id: 'skimmer_lid_stepping', kind: 'skimmer_lid', position: { x: -2.2, y: WORLD.PLATFORM_TOP_Y, z: 35.0 } },
      { id: 'buoy_midhall', kind: 'buoy', position: { x: 1.8, y: WORLD.PLATFORM_TOP_Y, z: 23.5 } },
    ];
    for (const bp of buoyantProps) {
      props.push(bp);
    }

    // 3D 4-Color Keypad Console Pedestal near exit doors (Prompt 4B Section 3)
    props.push({
      id: 'keypad_console_pedestal',
      kind: 'keypad_pedestal',
      position: { x: 2.2, y: WORLD.PLATFORM_TOP_Y, z: -56.5 },
    });

    const exitPos = { x: 0.0, y: WORLD.PLATFORM_TOP_Y, z: -58.0 };
    const playerSpawn = { x: 0.0, y: 0.30, z: 49.5 };
    // Apex monster spawn in flooded hall, distance 51.5m >= 45m from player spawn
    const monsterSpawn = { x: 0.0, y: -0.75, z: -1.5 };

    const monsters: Array<{ id: string; variant: 'standard' | 'elder' | 'juvenile'; spawn: Vec3; sleeperSpawn?: Vec3; spawnGrace?: number }> = [
      {
        id: 'monster_1',
        variant: 'standard',
        spawn: monsterSpawn,
        sleeperSpawn: { x: 2.0, y: -0.75, z: 22.0 },
        spawnGrace: 20.0,
      },
    ];

    if (ctx.difficulty === 'deafening' || ctx.playerCount >= 3) {
      monsters.push({
        id: 'monster_2',
        variant: 'juvenile',
        spawn: { x: -28.0, y: -0.75, z: -20.0 },
      });
    }

    return {
      mapId: 'natatorium',
      seed: ctx.seed,
      bounds,
      platforms,
      walls,
      pillars,
      stairs: [],
      waterBodies: [
        {
          id: 'main_pool',
          rect: [-45.0, -55.0, 45.0, 55.0],
          floorY: -0.75,
          waterY: 0.0,
        },
      ],
      props,
      puzzles: [
        {
          id: 'natatorium_exit_protocol',
          type: 'exit_protocol',
          position: exitPos,
          params: {
            code: digits.join(''),
            drainWheelPos: { x: 0.0, y: WORLD.PLATFORM_TOP_Y, z: -54.0 },
          },
        },
      ],
      spawns: {
        player: [playerSpawn],
        monsters,
      },
      patrolLanes: [
        {
          id: 'natatorium_lane_main',
          points: [
            { x: 0.0, y: -0.75, z: 26.0 },
            { x: 4.0, y: -0.75, z: 12.0 },
            { x: -4.0, y: -0.75, z: -4.0 },
            { x: 0.0, y: -0.75, z: -28.0 },
          ],
        },
      ],
      exit: {
        id: 'exit_doors',
        position: exitPos,
      },
      meta: {
        codeDigits: digits,
        waterFloorY: -0.75,
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const tex = TextureRegistry.getInstance();
    const tileFactory = TileMaterialFactory.getInstance(env.renderer as import('three').WebGLRenderer | undefined);

    const platformMat = tileFactory.platformTopMaterial;
    const wallMat = tileFactory.wallTileMaterial;
    const floorMat = tileFactory.poolFloorMaterial;
    const ceilingArchMat = tileFactory.ceilingTileMaterial;
    ceilingArchMat.envMapIntensity = 0.35;
    ceilingArchMat.vertexColors = true;
    ceilingArchMat.color.set('#b7a775');
    ceilingArchMat.aoMapIntensity = 0.85;
    ceilingArchMat.side = DoubleSide;

    // Platform hook applies multi-material groups with world-space scaling
    // Top: WORLD.TILE_METERS square ceramic tile (#d5b676, #4a3b22 grout)
    // Vertical Sides: 3 distinct horizontal rows above water + 0.08m wet-grout watermark at y=0.0
    // Completely eliminates UV stretching and cartoon black outlines
    const hooks: CustomBuilderHook = {
      onPlatformMesh: (mesh: Mesh, plat: PlatformDef) => {
        const [minX, minZ, maxX, maxZ] = plat.rect;
        const w = maxX - minX;
        const d = maxZ - minZ;
        const topY = plat.topY;
        const floorY = -0.75;
        const depth = topY - floorY;
        mesh.geometry.dispose();
        mesh.geometry = tileFactory.createPlatformGeometry(w, depth, d, topY, floorY);
        mesh.material = [tileFactory.platformTopMaterial, tileFactory.platformSideMaterial];
        mesh.position.set((minX + maxX) * 0.5, (topY + floorY) * 0.5, (minZ + maxZ) * 0.5);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
      },
    };

    const instance = buildStandardMapInstance(
      layout,
      env,
      {
        platformMat,
        wallMat,
        floorMat,
        ceilingMat: ceilingArchMat,
      },
      hooks,
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 0. Hand-Painted Wall Graffiti & Decals (DecalSystem)
    // ──────────────────────────────────────────────────────────────────────────

    // Spawn Wall Mural: "IT CAN'T SEE YOU. IT HEARS THE WATER." + Ink Splash Crown (f_001–f_003)
    const tagTex = makeSpawnWallMural({ width: 1024, height: 768 });
    const tagMesh = DecalSystem.createWallDecalMesh(tagTex, 4.0, 3.0);
    tagMesh.position.set(-3.1, 2.4, 44.22);
    tagMesh.rotation.y = 0; // facing +Z towards player at z=49.5
    tagMesh.updateMatrix();
    tagMesh.name = 'SpawnTagline';
    instance.root.add(tagMesh);

    // Exit & Checkpoint Warnings: "DON'T SPLASH, / IT KNOWS" with hand-drawn brush arrows (Video 1 02:50–02:52)
    const exitWarningTex = makeExitWarningDecal({ width: 1024, height: 512 });
    const exitWarningWall = DecalSystem.createWallDecalMesh(exitWarningTex, 3.2, 1.6);
    exitWarningWall.position.set(0.0, 2.2, -43.48);
    exitWarningWall.rotation.y = 0;
    exitWarningWall.name = 'ExitWarningWall';
    instance.root.add(exitWarningWall);

    const floorArrowTex = makePillarWayfindingArrow('right');
    const exitWarningFloor = DecalSystem.createWallDecalMesh(floorArrowTex, 1.6, 1.6);
    exitWarningFloor.rotation.x = -Math.PI * 0.5;
    exitWarningFloor.rotation.z = Math.PI; // pointing towards corridor (-Z)
    exitWarningFloor.position.set(0.0, 0.39, -42.0);
    exitWarningFloor.name = 'ExitWarningFloor';
    instance.root.add(exitWarningFloor);

    // ──────────────────────────────────────────────────────────────────────────
    // In-World Wayfinding: Handwritten "DONT SPLASH, IT KNOWS" Warnings (4-6 points)
    // and Navmesh-Validated Route Decision Arrows (Prompt 8 Task 3)
    // ──────────────────────────────────────────────────────────────────────────

    function validateArrowDirection(
      x: number,
      z: number,
      symbol: '>' | '<' | '^' | 'v',
      walls: BoxDef[],
    ): '>' | '<' | '^' | 'v' {
      const dirMap: Record<string, { dx: number; dz: number }> = {
        '>': { dx: 1, dz: 0 },
        '<': { dx: -1, dz: 0 },
        '^': { dx: 0, dz: -1 },
        'v': { dx: 0, dz: 1 },
      };
      const check = (sym: '>' | '<' | '^' | 'v'): boolean => {
        const { dx, dz } = dirMap[sym]!;
        for (let t = 0.5; t <= 2.5; t += 0.5) {
          const tx = x + dx * t;
          const tz = z + dz * t;
          for (const w of walls) {
            if (w.isWall && tx >= w.min.x && tx <= w.max.x && tz >= w.min.z && tz <= w.max.z && w.max.y > 0.5) {
              return false;
            }
          }
        }
        return true;
      };

      if (check(symbol)) return symbol;
      const candidates: ('>' | '<' | '^' | 'v')[] = ['^', '>', '<', 'v'];
      for (const c of candidates) {
        if (check(c)) return c;
      }
      return symbol;
    }

    // High-visibility warning graffiti along the critical path (respecting 0.15m tile grid)
    const warningPoints: Array<{
      id: string;
      x: number;
      y: number;
      z: number;
      isFloor: boolean;
      rotY: number;
      arrowDir: 'left' | 'right' | 'up' | 'down' | 'none';
      text?: string;
    }> = [
      // 1. Near spawn / Foyer deck boundary
      { id: 'Warning_Spawn', x: -7.85, y: 1.6, z: 46.5, isFloor: false, rotY: Math.PI / 2, arrowDir: 'right' },
      // 2. Before first deep water crossing (Zone A low arch/stepping-stone rim)
      { id: 'Warning_FirstCrossing', x: 0.0, y: 0.385, z: 34.5, isFloor: true, rotY: Math.PI, arrowDir: 'up', text: 'WATER CARRIES SOUND\nNEVER STOP' },
      // 3. Middle Pillar Hall entrance / Palm arch fork
      { id: 'Warning_PillarHall', x: -6.0, y: 1.6, z: 22.0, isFloor: false, rotY: 0, arrowDir: 'left' },
      // 4. At Trench Landmark (narrow trench rim where creature gets blocked)
      { id: 'Warning_Trench', x: 0.0, y: 0.385, z: -11.5, isFloor: true, rotY: Math.PI, arrowDir: 'down' },
      // 5. Approaching lit Arched Checkpoint / S-bend Corridor
      { id: 'Warning_ArchedCheckpoint', x: -2.0, y: 1.6, z: -43.48, isFloor: false, rotY: 0, arrowDir: 'right' },
      // 6. Near Floodgate / Plant Room exit keypad door
      { id: 'Warning_Floodgate', x: 0.0, y: 1.8, z: -53.2, isFloor: false, rotY: 0, arrowDir: 'up' },
    ];

    for (const wp of warningPoints) {
      // Snap positions to WORLD.TILE_METERS tile grid
      const gridX = Math.round(wp.x / WORLD.TILE_METERS) * WORLD.TILE_METERS;
      const gridZ = Math.round(wp.z / WORLD.TILE_METERS) * WORLD.TILE_METERS;
      const wTex = makeHandwrittenWarningGraffiti({
        text: wp.text ?? 'DONT SPLASH, IT KNOWS',
        arrowDir: wp.arrowDir,
        seed: layout.seed + Math.round(gridZ * 10),
      });
      const wMesh = DecalSystem.createWallDecalMesh(wTex, 2.6, 1.3);
      if (wp.isFloor) {
        wMesh.rotation.x = -Math.PI * 0.5;
        wMesh.rotation.z = wp.rotY;
        wMesh.position.set(gridX, wp.y, gridZ);
      } else {
        wMesh.rotation.y = wp.rotY;
        wMesh.position.set(gridX, wp.y, gridZ);
      }
      wMesh.name = `Graffiti_${wp.id}`;
      instance.root.add(wMesh);
    }

    // Flavor handwritten scrawls ("IT HEARS THE WATER" + Tallies)
    const hearsWaterTex = makeHandwrittenWarningGraffiti({
      text: 'IT HEARS THE WATER',
      arrowDir: 'none',
      seed: layout.seed + 77,
    });
    const hearsWaterMesh = DecalSystem.createWallDecalMesh(hearsWaterTex, 2.4, 1.2);
    hearsWaterMesh.position.set(-4.5, 0.385, 20.0);
    hearsWaterMesh.rotation.x = -Math.PI * 0.5;
    hearsWaterMesh.rotation.z = Math.PI;
    hearsWaterMesh.name = 'Graffiti_Flavor_HearsWater';
    instance.root.add(hearsWaterMesh);

    const tallyTex = makeWarningDecal('tally', { count: 5, seed: layout.seed + 12 });
    const tallyMesh = DecalSystem.createWallDecalMesh(tallyTex, 1.0, 1.0);
    tallyMesh.position.set(-3.2, 0.385, 20.0);
    tallyMesh.rotation.x = -Math.PI * 0.5;
    tallyMesh.rotation.z = Math.PI;
    tallyMesh.name = 'Graffiti_Flavor_Tally';
    instance.root.add(tallyMesh);

    // Prompt 7: Marker doodle teaching decal placed beside the first pebble pile
    const throwLureTex = makeThrowLureTeachingDecal({ seed: layout.seed + 19 });
    const throwLureMesh = DecalSystem.createWallDecalMesh(throwLureTex, 2.4, 1.2);
    throwLureMesh.position.set(-2.0, 0.388, 45.2);
    throwLureMesh.rotation.x = -Math.PI * 0.5;
    throwLureMesh.rotation.z = Math.PI;
    throwLureMesh.name = 'Decal_ThrowLure_Teaching';
    instance.root.add(throwLureMesh);

    // Route decision arrows validated with navmesh raycast
    const routeDecisions: Array<{ x: number; z: number; targetDir: '>' | '<' | '^' | 'v' }> = [
      { x: 0.0, z: 43.5, targetDir: '^' },      // Foyer stepping stones forward
      { x: 0.0, z: 35.0, targetDir: '^' },      // Stepping stone 2 forward across gap
      { x: 0.0, z: 18.0, targetDir: '>' },      // Mid-hall fork to East path
      { x: -6.0, z: 24.0, targetDir: '<' },     // Colonnade to Pillar #1
      { x: 0.0, z: -14.0, targetDir: '^' },     // Along trench rim
      { x: -2.0, z: -46.0, targetDir: '>' },    // Into S-bend corridor
      { x: 0.0, z: -55.0, targetDir: '^' },     // To final floodgate door
    ];

    for (let i = 0; i < routeDecisions.length; i++) {
      const rd = routeDecisions[i]!;
      const validDir = validateArrowDirection(rd.x, rd.z, rd.targetDir, layout.walls);
      const gridX = Math.round(rd.x / WORLD.TILE_METERS) * WORLD.TILE_METERS;
      const gridZ = Math.round(rd.z / WORLD.TILE_METERS) * WORLD.TILE_METERS;
      const arrowTex = makeRouteArrowDecal({ symbol: validDir, seed: layout.seed + i });
      const arrowMesh = DecalSystem.createWallDecalMesh(arrowTex, 1.2, 1.2);
      arrowMesh.rotation.x = -Math.PI * 0.5;
      arrowMesh.position.set(gridX, 0.388, gridZ);
      arrowMesh.name = `RouteArrow_${i + 1}`;
      instance.root.add(arrowMesh);
    }

    // Stencil Puzzle Digits on the 4 Code Pillars at y = 1.1m above waterline
    for (const pil of layout.pillars) {
      if (pil.ordinal !== undefined && pil.decalNumber !== undefined) {
        const clueColor = pil.clueColor ?? (pil.ordinal === 1 ? '#1e88e5' : pil.ordinal === 2 ? '#43a047' : pil.ordinal === 3 ? '#fbc02d' : '#e53935');
        const stencilTex = makePuzzleDigitDecal(pil.decalNumber, pil.ordinal !== undefined, 500 + pil.ordinal, clueColor);
        const stencilMesh = DecalSystem.createCurvedPillarDecalMesh(stencilTex, pil.radius, 1.2, 1.2);
        stencilMesh.position.set(pil.x, 1.1, pil.z);
        stencilMesh.name = `StencilDigit_${pil.id}`;
        instance.root.add(stencilMesh);
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3D 4-Color Keypad Console Pedestal (Prompt 4B Section 3)
    // ──────────────────────────────────────────────────────────────────────────
    const pedestalGroup = new Group();
    pedestalGroup.name = 'KeypadConsolePedestal';
    pedestalGroup.position.set(2.2, WORLD.PLATFORM_TOP_Y, -56.5);

    const standMat = new MeshStandardMaterial({
      color: 0x22201d,
      roughness: 0.6,
      metalness: 0.8,
    });

    const postMesh = new Mesh(new BoxGeometry(0.22, 0.95, 0.22), standMat);
    postMesh.position.set(0, 0.475, 0);
    postMesh.castShadow = true;
    pedestalGroup.add(postMesh);

    const deckGroup = new Group();
    deckGroup.position.set(0, 0.95, 0);
    deckGroup.rotation.x = 0.42;

    const deckBox = new Mesh(new BoxGeometry(0.72, 0.10, 0.44), standMat);
    deckBox.castShadow = true;
    deckGroup.add(deckBox);

    // 4 Colored Vertical Column Channels (Blue = #1, Green = #2, Yellow = #3, Red = #4)
    const colColors = [0x1e88e5, 0x43a047, 0xfbc02d, 0xe53935];
    const colStartX = -0.24;
    const colStepX = 0.16;

    for (let c = 0; c < 4; c++) {
      const colX = colStartX + c * colStepX;

      const colMat = new MeshStandardMaterial({
        color: colColors[c]!,
        roughness: 0.35,
        metalness: 0.2,
      });
      const colStrip = new Mesh(new BoxGeometry(0.12, 0.02, 0.34), colMat);
      colStrip.position.set(colX, 0.055, 0);
      colStrip.name = `KeypadChannel_${c + 1}`;
      deckGroup.add(colStrip);

      const rollerMat = new MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.4,
        metalness: 0.5,
      });
      const roller = new Mesh(new CylinderGeometry(0.045, 0.045, 0.09, 16), rollerMat);
      roller.rotation.z = Math.PI * 0.5;
      roller.position.set(colX, 0.075, 0.05);
      roller.name = `KeypadRoller_${c + 1}`;
      deckGroup.add(roller);
    }

    pedestalGroup.add(deckGroup);
    instance.root.add(pedestalGroup);

    // 3D Collectible Pebble Meshes on dry platforms (Prompt 4B Section 2)
    const stoneMat = new MeshStandardMaterial({
      color: 0x3a3835,
      roughness: 0.85,
      metalness: 0.05,
    });
    for (const prop of layout.props) {
      if (prop.kind === 'pebble') {
        const pebbleMesh = new Mesh(new DodecahedronGeometry(0.09, 1), stoneMat);
        pebbleMesh.position.set(prop.position.x, prop.position.y + 0.04, prop.position.z);
        pebbleMesh.scale.set(1.0, 0.72, 1.15);
        pebbleMesh.rotation.set(0.1, Math.random() * Math.PI, 0.05);
        pebbleMesh.castShadow = true;
        pebbleMesh.name = `Pebble_${prop.id}`;
        instance.root.add(pebbleMesh);
      }
    }

    // 3D Chlorine Cell Canisters (Prompt 7)
    const cellCanisterMat = new MeshStandardMaterial({
      color: 0x4caf50,
      roughness: 0.35,
      metalness: 0.4,
      emissive: 0x1b5e20,
      emissiveIntensity: 0.35,
    });
    const cellCapMat = new MeshStandardMaterial({
      color: 0x2e7d32,
      roughness: 0.5,
      metalness: 0.7,
    });
    for (const prop of layout.props) {
      if (prop.kind === 'chlorine_cell') {
        const cellGroup = new Group();
        cellGroup.name = `ChlorineCellNode_${prop.id}`;
        cellGroup.position.set(prop.position.x, prop.position.y, prop.position.z);

        const canMesh = new Mesh(new CylinderGeometry(0.12, 0.12, 0.40, 16), cellCanisterMat);
        canMesh.position.y = 0.20;
        canMesh.castShadow = true;
        cellGroup.add(canMesh);

        const capMesh = new Mesh(new CylinderGeometry(0.08, 0.08, 0.08, 16), cellCapMat);
        capMesh.position.y = 0.42;
        capMesh.castShadow = true;
        cellGroup.add(capMesh);

        instance.root.add(cellGroup);
      }
    }

    // 3D Exit Generator Block (Prompt 7)
    const genProp = layout.props.find((p) => p.kind === 'generator');
    if (genProp) {
      const genGroup = new Group();
      genGroup.name = 'GeneratorMesh';
      genGroup.position.set(genProp.position.x, genProp.position.y, genProp.position.z);

      const genBodyMat = new MeshStandardMaterial({
        color: 0x2a3028,
        roughness: 0.65,
        metalness: 0.6,
      });
      const bodyMesh = new Mesh(new BoxGeometry(0.8, 0.7, 0.6), genBodyMat);
      bodyMesh.position.y = 0.35;
      bodyMesh.castShadow = true;
      genGroup.add(bodyMesh);

      // Crank housing / handle (designed metal prop from shared palette)
      const crankMat = new MeshStandardMaterial({
        color: 0x424a52,
        roughness: 0.35,
        metalness: 0.85,
      });
      const crankHandle = new Mesh(new CylinderGeometry(0.04, 0.04, 0.25, 12), crankMat);
      crankHandle.rotation.z = Math.PI * 0.5;
      crankHandle.position.set(0.42, 0.45, 0.0);
      genGroup.add(crankHandle);

      // Status indicator light (machined bezel with soft olive-green indicator)
      const statusLightMesh = new Mesh(
        new CylinderGeometry(0.04, 0.04, 0.03, 12),
        new MeshStandardMaterial({ color: 0x5a8c50, emissive: 0x3a6c30, emissiveIntensity: 0.6 })
      );
      statusLightMesh.position.set(0.0, 0.72, 0.22);
      genGroup.add(statusLightMesh);

      instance.root.add(genGroup);
    }

    // 3D Buoyant Props (Skimmer Lids & Float Buoys) (Prompt 7)
    const skimmerMat = new MeshStandardMaterial({
      color: 0xded8ce,
      roughness: 0.5,
      metalness: 0.1,
    });
    const buoyMat = new MeshStandardMaterial({
      color: 0xf57c00,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0xe65100,
      emissiveIntensity: 0.25,
    });
    for (const prop of layout.props) {
      if (prop.kind === 'skimmer_lid') {
        const lidMesh = new Mesh(new CylinderGeometry(0.28, 0.28, 0.04, 24), skimmerMat);
        lidMesh.position.set(prop.position.x, prop.position.y + 0.02, prop.position.z);
        lidMesh.castShadow = true;
        lidMesh.name = `BuoyantProp_${prop.id}`;
        instance.root.add(lidMesh);
      } else if (prop.kind === 'buoy') {
        const buoyMesh = new Mesh(new CylinderGeometry(0.16, 0.16, 0.35, 16), buoyMat);
        buoyMesh.position.set(prop.position.x, prop.position.y + 0.18, prop.position.z);
        buoyMesh.rotation.z = 0.2;
        buoyMesh.castShadow = true;
        buoyMesh.name = `BuoyantProp_${prop.id}`;
        instance.root.add(buoyMesh);
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Giant Cylindrical Columns & Curved Pillar Wayfinding Arrows
    // ──────────────────────────────────────────────────────────────────────────

    // Replace giant columns with 48-segment world-space square tile UV geometry
    for (const pil of layout.pillars) {
      if (pil.radius >= 1.5) {
        const pMesh = instance.root.getObjectByName(`Pillar_${pil.id}`) as Mesh | undefined;
        if (pMesh) {
          pMesh.geometry.dispose();
          pMesh.geometry = tileFactory.createGiantColumnGeometry(pil.radius, pil.height, 48);
          pMesh.material = tileFactory.wallTileMaterial;
          pMesh.position.set(pil.x, -0.75 + pil.height * 0.5, pil.z);
          pMesh.castShadow = true;
          pMesh.receiveShadow = true;
          pMesh.matrixAutoUpdate = false;
          pMesh.updateMatrix();
        }
      }
    }

    // Wayfinding arrow decals wrapped on curved cylindrical pillars
    const arrowRightTex = makePillarWayfindingArrow('right');
    const arrowLeftTex = makePillarWayfindingArrow('left');

    const pillarArrow1 = DecalSystem.createCurvedPillarDecalMesh(arrowRightTex, 2.1, 1.6, 1.1);
    pillarArrow1.position.set(-22.0, 1.8, 18.0);
    pillarArrow1.name = 'PillarArrow_1';
    instance.root.add(pillarArrow1);

    const pillarArrow2 = DecalSystem.createCurvedPillarDecalMesh(arrowLeftTex, 2.1, 1.6, 1.1);
    pillarArrow2.position.set(22.0, 1.8, 18.0);
    pillarArrow2.rotation.y = Math.PI;
    pillarArrow2.name = 'PillarArrow_2';
    instance.root.add(pillarArrow2);

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Zone A Architectural Props & Palm-Arch Pillars (Video 2 00:05, 00:12)
    // ──────────────────────────────────────────────────────────────────────────

    // Three decorative Palm-Arch Tiled Pillars in Zone A shallow pool
    const palmPositions = [
      { x: -6.0, z: 32.0 },
      { x: 6.0, z: 32.0 },
      { x: 0.0, z: 24.0 },
    ];
    for (let i = 0; i < palmPositions.length; i++) {
      const pos = palmPositions[i]!;
      const palm = tileFactory.createPalmArchPillar(5.5, 2.2);
      palm.position.set(pos.x, 0.0, pos.z);
      palm.name = `PalmArchPillar_${i}`;
      palm.matrixAutoUpdate = false;
      palm.updateMatrix();
      instance.root.add(palm);
    }

    // High rectangular skylight window on west wall casting bright daylight across curved peninsula
    const skylightGeom = new PlaneGeometry(4.2, 2.5);
    const skylightMat = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.2,
      roughness: 0.1,
      metalness: 0.0,
    });
    const skylightMesh = new Mesh(skylightGeom, skylightMat);
    skylightMesh.position.set(-18.48, 5.5, 40.0);
    skylightMesh.rotation.y = Math.PI * 0.5;
    skylightMesh.name = 'SkylightSpawnWindow';
    instance.root.add(skylightMesh);

    // Daylight sunbeam from skylight onto curved peninsula
    const daylightBeam = new PointLight(0xfffdf5, 2.2, 24.0, 1.2);
    daylightBeam.position.set(-16.0, 5.0, 40.0);
    daylightBeam.name = 'SkylightDaylightBeam';
    instance.root.add(daylightBeam);

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Zone B Rounded Roman Archways (Video 1 00:11, 00:27, Video 2 00:08)
    // ──────────────────────────────────────────────────────────────────────────

    const romanArchMat = tileFactory.wallTileMaterial;
    const arch1Geom = buildArchGeometry({
      width: 6.5,
      height: 3.25,
      pierHeight: 4.95,
      thickness: 0.8,
      wallWidth: 7.5,
      wallHeight: 14.75,
      type: 'semicircular',
    });
    const arch1Mesh = new Mesh(arch1Geom, romanArchMat);
    arch1Mesh.position.set(0.0, -0.75, 8.0);
    arch1Mesh.castShadow = true;
    arch1Mesh.receiveShadow = true;
    arch1Mesh.name = 'RomanArch_1';
    instance.root.add(arch1Mesh);

    const arch2Geom = buildArchGeometry({
      width: 6.5,
      height: 3.25,
      pierHeight: 4.95,
      thickness: 0.8,
      wallWidth: 7.5,
      wallHeight: 14.75,
      type: 'semicircular',
    });
    const arch2Mesh = new Mesh(arch2Geom, romanArchMat);
    arch2Mesh.position.set(0.0, -0.75, -14.0);
    arch2Mesh.castShadow = true;
    arch2Mesh.receiveShadow = true;
    arch2Mesh.name = 'RomanArch_2';
    instance.root.add(arch2Mesh);

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Zone C Arched Checkpoint Corridor Glowing Ceiling Fixtures (Video 1 02:51)
    // ──────────────────────────────────────────────────────────────────────────

    const fixtureGeom = new CylinderGeometry(0.65, 0.65, 0.08, 24);
    const fixtureMat = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.5,
      roughness: 0.2,
      metalness: 0.1,
    });

    const corridorFixturePositions = [
      { x: 0.0, y: 4.8, z: -45.0 },
      { x: -2.0, y: 4.8, z: -49.0 },
      { x: 0.0, y: 4.8, z: -55.0 },
    ];

    for (let i = 0; i < corridorFixturePositions.length; i++) {
      const pos = corridorFixturePositions[i]!;
      const fixMesh = new Mesh(fixtureGeom, fixtureMat);
      fixMesh.position.set(pos.x, pos.y, pos.z);
      fixMesh.name = `CorridorCeilingFixture_${i}`;
      instance.root.add(fixMesh);

      const light = new PointLight(0xffffff, 1.8, 18.0, 1.5);
      light.position.set(pos.x, pos.y - 0.2, pos.z);
      light.name = `CorridorCeilingPointLight_${i}`;
      instance.root.add(light);
    }

    // Foyer Ceiling Warm Illumination (Spawn Area)
    const spawnLight = new PointLight(0xfff7e6, 3.5, 25.0, 1.2);
    spawnLight.position.set(0.0, 5.2, 48.0);
    spawnLight.name = 'SpawnCeilingLight';
    instance.root.add(spawnLight);

    // Warm fill light directed at tagline wall and shallow pool
    const tagFillLight = new PointLight(0xfffbe8, 2.5, 16.0, 1.2);
    tagFillLight.position.set(-2.8, 3.2, 46.5);
    tagFillLight.name = 'SpawnTagFillLight';
    instance.root.add(tagFillLight);

    // Grand Hall Vaulted Ceiling Lights (Soft cream illumination, no dark voids)
    const grandCeilingPositions = [
      { x: -12.0, y: 8.6, z: 22.0 },
      { x: 12.0, y: 8.6, z: 22.0 },
      { x: 0.0, y: 8.6, z: 0.0 },
      { x: -12.0, y: 8.6, z: -22.0 },
      { x: 12.0, y: 8.6, z: -22.0 },
    ];
    for (let i = 0; i < grandCeilingPositions.length; i++) {
      const pos = grandCeilingPositions[i]!;
      const light = new PointLight(0xfff5e0, 2.0, 32.0, 1.1);
      light.position.set(pos.x, pos.y - 0.4, pos.z);
      light.name = `GrandCeilingLight_${i}`;
      instance.root.add(light);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Ceilings & Roof Assemblies (Foyer + Grand Natatorium)
    // ──────────────────────────────────────────────────────────────────────────

    // Foyer ceiling (encloses spawn area at height 6.0m)
    const foyerCeilingGeom = new BoxGeometry(27.0, 0.4, 15.5);
    scaleBoxUv(foyerCeilingGeom, 27.0, 0.4, 15.5, WORLD.TEXTURE_METERS);
    const fCount = foyerCeilingGeom.attributes['position']?.count ?? 0;
    const fColors = new Float32Array(fCount * 3);
    fColors.fill(1.0);
    foyerCeilingGeom.setAttribute('color', new Float32BufferAttribute(fColors, 3));
    const foyerCeiling = new Mesh(foyerCeilingGeom, ceilingArchMat);
    foyerCeiling.position.set(-1.0, 6.0, 50.75);
    foyerCeiling.castShadow = true;
    foyerCeiling.receiveShadow = true;
    foyerCeiling.name = 'FoyerCeiling';
    instance.root.add(foyerCeiling);

    // Continuous seamless cream-tiled barrel vault over grand pool hall (Decision D131)
    const hallWidth = 90.0;
    const hallLength = 118.5;
    const grandRoofGeom = buildVaultGeometry({
      width: hallWidth,
      length: hallLength,
      springlineY: 9.0,
      apexY: 15.0,
      color: '#b7a775',
      radialSegments: 64,
      lengthSegments: 32,
      ribInterval: 4.0,
      ribDepth: 0.08,
      ribWidth: 0.45,
    });

    const grandRoof = new Mesh(grandRoofGeom, ceilingArchMat);
    grandRoof.position.set(0.0, 0.0, -0.75);
    grandRoof.castShadow = true;
    grandRoof.receiveShadow = true;
    grandRoof.name = 'GrandHallCeiling';
    instance.root.add(grandRoof);

    // Inset glowing white skylight panels along the barrel vault apex crown (Decision D131)
    const skylightInstMesh = createVaultSkylightPanels({
      length: hallLength,
      apexY: 15.0,
      panelWidth: 6.0,
      panelLength: 4.5,
      spacing: 16.0,
    });
    skylightInstMesh.position.set(0.0, 0.0, -0.75);
    instance.root.add(skylightInstMesh);

    // ──────────────────────────────────────────────────────────────────────────
    // 6. Submerged Ear Mosaic at Pool Floor Center
    // ──────────────────────────────────────────────────────────────────────────

    const earTexture = makeMosaicEarTexture(512);
    const earMat = new MeshStandardMaterial({
      map: earTexture,
      roughness: 0.28,
      metalness: 0.04,
    });
    const earGeom = new PlaneGeometry(14, 14);
    bakeVertexAO(earGeom, { floorY: -0.74 });
    const earMesh = new Mesh(earGeom, earMat);
    earMesh.rotation.x = -Math.PI * 0.5;
    earMesh.position.set(0.0, -0.74, 0.0);
    earMesh.name = 'MosaicEar';
    instance.root.add(earMesh);

    // ──────────────────────────────────────────────────────────────────────────
    // 7. Light Shafts, Motes, and Water Surface Streaks
    // ──────────────────────────────────────────────────────────────────────────

    const lightStreaks: LightStreak[] = [];
    const shaft = createLightShaftMesh({
      topRadius: 1.8,
      bottomRadius: 6.5,
      height: 14.0,
      color: '#fffdf5',
      intensity: 0.08,
    });
    shaft.position.set(0.0, 7.0, 0.0);
    instance.root.add(shaft);

    const grandHallMotes = createDustMotes({
      count: 36,
      bounds: { minX: -3.5, maxX: 3.5, minY: 1.0, maxY: 12.5, minZ: -3.5, maxZ: 3.5 },
      color: '#fffbe8',
      size: 0.06,
      seed: 991,
    });
    instance.root.add(grandHallMotes);

    const skylightZ = [-24, -8, 8, 24];
    for (let i = 0; i < skylightZ.length; i++) {
      const z = skylightZ[i]!;
      lightStreaks.push({
        pos: new Vector3(0.0, 7.0, z),
        dir: new Vector3(1, 0, 0),
        size: 28.0,
        color: new Color('#fff6e0'),
        intensity: 0.85,
      });
    }
    instance.root.userData['lightStreaks'] = lightStreaks;

    const motes = createDustMotes({
      count: 140,
      bounds: { minX: -30, maxX: 30, minY: 0.5, maxY: 10, minZ: -30, maxZ: 30 },
      color: '#fff3d1',
      size: 0.07,
    });
    instance.root.add(motes);

    // Tricolor panel on far wall
    const panelGeom = buildColorPanelGeometry(3.6, 2.0);
    const panelMat = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.1,
    });
    const panelMesh = new Mesh(panelGeom, panelMat);
    panelMesh.position.set(-14.0, 5.0, -43.8);
    panelMesh.name = 'TricolorPanel';
    instance.root.add(panelMesh);

    // Hand-painted '#1' marker on the tiled foyer wall corner (f_016 / f_017)
    const marker1Mat = new MeshBasicMaterial({
      map: tex.getNumber(1, { style: 'marker' }),
      transparent: true,
      depthWrite: false,
    });
    const marker1 = new Mesh(new PlaneGeometry(0.45, 0.675), marker1Mat);
    marker1.position.set(11.98, 1.65, 45.2);
    marker1.rotation.y = -Math.PI / 2;
    marker1.name = 'HandPaintedMarker_1';
    instance.root.add(marker1);

    // Freeze all matrices across the hierarchy
    instance.root.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.matrixAutoUpdate = false;
        obj.updateMatrix();
      }
    });

    markWorldShadows(instance.root, layout.bounds);
    return instance;
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 90.0;
    const scaleY = h / 118.0;

    // Background water
    g.fillStyle = '#4a5a34';
    g.fillRect(0, 0, w, h);

    // Platforms
    g.fillStyle = '#e2dac6';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 45) * scaleX;
      const ry = (p.rect[1] + 60) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Ear spiral mosaic at pool floor center
    const earX = (0 + 45) * scaleX;
    const earY = (0 + 60) * scaleY;
    g.strokeStyle = '#d4af37';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(earX, earY, 8, 0, Math.PI * 1.5);
    g.stroke();

    // Code pillars
    for (const pil of layout.pillars) {
      const px = (pil.x + 45) * scaleX;
      const py = (pil.z + 60) * scaleY;
      g.fillStyle = pil.ordinal ? '#e08a3c' : '#444';
      g.beginPath();
      g.arc(px, py, pil.ordinal ? 3.5 : 2, 0, Math.PI * 2);
      g.fill();
    }

    // Spawns & Exit
    const sp = layout.spawns.player[0]!;
    g.fillStyle = '#4cd964';
    g.beginPath();
    g.arc((sp.x + 45) * scaleX, (sp.z + 60) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 45) * scaleX, (ex.z + 60) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

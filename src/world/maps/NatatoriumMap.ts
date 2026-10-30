/* ── NatatoriumMap.ts ──────────────────────────────────────────────────────
 *  Map 1 (Default): The Grand Natatorium
 *  An authored, architectural flooded municipal bath: vaulted skylights,
 *  mosaic walls, brass fittings, mist hugging milky green water, the Ear mosaic
 *  at the pool-floor center, curated wings, and a 3-stage ExitProtocol puzzle.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  MeshStandardMaterial,
  MeshBasicMaterial,
  Mesh,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  BoxGeometry,
  Vector3,
  Color,
  PointLight,
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
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { WATER_PROFILES } from '../../game/water/WaterProfile.js';
import { buildStandardMapInstance, scaleBoxUv } from './CommonMapBuilder.js';
import { makeMosaicEarTexture } from '../../procedural/textures/MosaicEarTexture.js';
import { bakeVertexAO } from '../../procedural/geometry/VertexAO.js';
import { applyWetDarkening } from '../../game/rendering/WetDarkening.js';
import { applyParallaxOcclusion } from '../../game/rendering/ParallaxOcclusion.js';
import { createLightShaftMesh, createDustMotes } from '../../game/rendering/LightShafts.js';
import { buildYFixtureGeometry, buildColorPanelGeometry } from '../levelart/LevelArtProps.js';
import type { LightStreak } from '../../game/water/WaterMaterial.js';

export const NatatoriumMap: MapDefinition = {
  id: 'natatorium',
  name: 'The Grand Natatorium',
  tagline: 'A flooded municipal bath: vaulted skylights, brass fittings, and the Ear in the deep.',
  stars: 2,
  reverb: 'poolroom',
  acoustics: {
    hearingMul: 1.05,
  },
  atmosphere: {
    fog: {
      color: '#b3bb9f',
      density: 0.035,
    },
    exposure: 1.28,
    hemisphere: {
      sky: '#b3bb9f',
      ground: '#7c9e5b',
    },
    sun: {
      color: '#fffbf0',
      intensity: 1.1,
      direction: { x: 0.35, y: 0.9, z: 0.25 },
      castShadow: true,
    },
  },
  waterProfile: WATER_PROFILES.natatorium,
  postGrade: {
    lift: [0.045, 0.038, 0.022],
    gamma: [0.98, 1.01, 1.02],
    gain: [1.02, 1.0, 0.96],
    saturation: 1.08,
    tint: [1.01, 1.0, 0.98],
  },

  generateLayout(ctx: LayoutCtx): LayoutData {
    const rng = new Rng(ctx.seed);
    const bounds = { minX: -70, minZ: -60, maxX: 70, maxZ: 60 };

    const platforms: PlatformDef[] = [];
    const walls: BoxDef[] = [];
    const pillars: PillarDef[] = [];
    const props: PropDef[] = [];

    // 1. Entry Foyer (South, dry +0.3m, player spawn)
    platforms.push({
      id: 'plat_foyer',
      rect: [-12, 40, 12, 58],
      topY: 0.3,
      kind: 'marble',
    });

    // Colonnade in foyer (x = -6 and 6, center x = 0 left open for unobstructed view and wading)
    for (const x of [-6, 6]) {
      pillars.push({
        id: `pil_foyer_${x}`,
        x,
        z: 46,
        radius: 0.55,
        height: 6.0,
        kind: 'marble',
      });
    }

    // 2. Grand Pool Hall Deck Ring (3m wide, surrounding pool [-38, -36, 38, 38])
    // Collapsed sections create 5 gaps of 1.8-3.0m
    // South Deck: [-38, 35, 38, 38] -> 2 segments with a collapsed gap at x in [-4, -1]
    platforms.push({
      id: 'plat_deck_s1',
      rect: [-38, 35, -4, 38],
      topY: 0.3,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_deck_s2',
      rect: [-1, 35, 38, 38],
      topY: 0.3,
      kind: 'tile',
    });

    // North Deck: [-38, -38, 38, -35] -> 2 segments with collapsed gap at x in [6, 9]
    platforms.push({
      id: 'plat_deck_n1',
      rect: [-38, -38, 6, -35],
      topY: 0.3,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_deck_n2',
      rect: [9, -38, 38, -35],
      topY: 0.3,
      kind: 'tile',
    });

    // West Deck: [-38, -35, -35, 35] -> with collapsed gap at z in [0, 3]
    platforms.push({
      id: 'plat_deck_w1',
      rect: [-38, -35, -35, 0],
      topY: 0.3,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_deck_w2',
      rect: [-38, 3, -35, 35],
      topY: 0.3,
      kind: 'tile',
    });

    // East Deck: [35, -35, 38, 35] -> with collapsed gaps at z in [-18, -15] and [12, 15]
    platforms.push({
      id: 'plat_deck_e1',
      rect: [35, -35, 38, -18],
      topY: 0.3,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_deck_e2',
      rect: [35, -15, 38, 12],
      topY: 0.3,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_deck_e3',
      rect: [35, 15, 38, 35],
      topY: 0.3,
      kind: 'tile',
    });

    // Connecting corridor from Foyer to South Deck
    platforms.push({
      id: 'plat_foyer_to_deck',
      rect: [-4, 38, 4, 40],
      topY: 0.3,
      kind: 'tile',
    });

    // 3. Rotunda Island: central fountain hub [-8, -6, 8, 10]
    platforms.push({
      id: 'plat_rotunda',
      rect: [-8, -6, 8, 10],
      topY: 0.35,
      kind: 'marble',
    });

    // 4 Columns on Rotunda
    const rotundaPillars = [
      { x: -5, z: -3 },
      { x: 5, z: -3 },
      { x: -5, z: 7 },
      { x: 5, z: 7 },
    ];
    for (let i = 0; i < rotundaPillars.length; i++) {
      const rp = rotundaPillars[i]!;
      pillars.push({
        id: `pil_rotunda_${i}`,
        x: rp.x,
        z: rp.z,
        radius: 0.5,
        height: 7.0,
        kind: 'marble',
      });
    }

    // 4. Floating pontoons (3 rafts 6x6 between deck and rotunda)
    platforms.push({
      id: 'pontoon_1',
      rect: [-14, 18, -8, 24],
      topY: 0.25,
      kind: 'metal',
    });
    platforms.push({
      id: 'pontoon_2',
      rect: [14, 2, 20, 8],
      topY: 0.25,
      kind: 'metal',
    });
    platforms.push({
      id: 'pontoon_3',
      rect: [-22, 2, -16, 8],
      topY: 0.25,
      kind: 'metal',
    });

    // 5. Starting-block piers: 8 podium blocks 2.4m apart [-36, -10, -30, 14]
    for (let b = 0; b < 8; b++) {
      const zBlock = -9 + b * 3.1;
      platforms.push({
        id: `starting_podium_${b}`,
        rect: [-34, zBlock - 0.7, -31.5, zBlock + 0.7],
        topY: 0.45,
        kind: 'tile',
      });
    }

    // 6. Diving Tower: [26, -6, 34, 6]
    platforms.push({
      id: 'plat_diving_base',
      rect: [26, -6, 34, 6],
      topY: 1.0,
      kind: 'concrete',
    });
    platforms.push({
      id: 'plat_diving_mid',
      rect: [27, -4, 33, 4],
      topY: 3.0,
      kind: 'concrete',
    });
    platforms.push({
      id: 'plat_diving_top',
      rect: [28, -2.5, 32, 2.5],
      topY: 5.0,
      kind: 'concrete',
    });

    // 7. Spectator Gallery (North wall, +3.2m, 4m wide)
    // Connects via catwalk and stairs with 3 collapsed sections
    platforms.push({
      id: 'plat_gallery_w',
      rect: [-36, -42, -12, -38],
      topY: 3.2,
      kind: 'marble',
    });
    platforms.push({
      id: 'plat_gallery_mid',
      rect: [-8, -42, 14, -38],
      topY: 3.2,
      kind: 'marble',
    });
    platforms.push({
      id: 'plat_gallery_e',
      rect: [18, -42, 36, -38],
      topY: 3.2,
      kind: 'marble',
    });

    // High catwalk bridging from gallery east to diving tower
    platforms.push({
      id: 'plat_catwalk_high',
      rect: [28, -38, 31, -8],
      topY: 3.2,
      kind: 'metal',
    });

    // 8. Changing-Room Wing: [-62, -14, -40, 22]
    platforms.push({
      id: 'plat_changing_aisle_1',
      rect: [-60, -12, -42, -8],
      topY: 0.2,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_changing_aisle_2',
      rect: [-60, -2, -42, 2],
      topY: 0.2,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_changing_aisle_3',
      rect: [-60, 8, -42, 12],
      topY: 0.2,
      kind: 'tile',
    });
    platforms.push({
      id: 'plat_changing_corridor',
      rect: [-42, -12, -38, 18],
      topY: 0.2,
      kind: 'tile',
    });

    // Changing wing walls
    walls.push({
      id: 'wall_changing_outer',
      min: { x: -62, y: -0.9, z: -14 },
      max: { x: -40, y: 5.0, z: -13.2 },
      isWall: true,
    });
    walls.push({
      id: 'wall_changing_west',
      min: { x: -62.8, y: -0.9, z: -14 },
      max: { x: -62, y: 5.0, z: 22 },
      isWall: true,
    });
    walls.push({
      id: 'wall_changing_div_1',
      min: { x: -58, y: -0.9, z: -5.5 },
      max: { x: -44, y: 3.5, z: -4.5 },
      isWall: true,
    });
    walls.push({
      id: 'wall_changing_div_2',
      min: { x: -58, y: -0.9, z: 4.5 },
      max: { x: -44, y: 3.5, z: 5.5 },
      isWall: true,
    });

    // 9. Plant Room (Boilers, Drain Wheel, pumps): [-14, -58, 14, -38]
    platforms.push({
      id: 'plat_plant_room',
      rect: [-14, -58, 14, -38],
      topY: 0.3,
      kind: 'concrete',
    });

    // Plant room walls
    walls.push({
      id: 'wall_plant_w',
      min: { x: -14.8, y: -0.9, z: -58 },
      max: { x: -14, y: 4.5, z: -38 },
      isWall: true,
    });
    walls.push({
      id: 'wall_plant_e',
      min: { x: 14, y: -0.9, z: -58 },
      max: { x: 14.8, y: 4.5, z: -38 },
      isWall: true,
    });

    // 10. Steam/Kids' Annex: [38, 14, 58, 32]
    platforms.push({
      id: 'plat_steam_annex',
      rect: [38, 14, 58, 32],
      topY: 0.15,
      kind: 'tile',
    });

    // 11. Grand Pool Hall Outer Enclosure Walls
    // South Wall with archway opening [-4, 4] connecting foyer corridor
    walls.push({
      id: 'wall_hall_south_w',
      min: { x: -40, y: -0.9, z: 38 },
      max: { x: -4, y: 9.0, z: 39 },
      isWall: true,
    });
    walls.push({
      id: 'wall_hall_south_e',
      min: { x: 4, y: -0.9, z: 38 },
      max: { x: 40, y: 9.0, z: 39 },
      isWall: true,
    });
    walls.push({
      id: 'wall_hall_south_lintel',
      min: { x: -4, y: 4.5, z: 38 },
      max: { x: 4, y: 9.0, z: 39 },
      isWall: true,
    });

    // Foyer Enclosure & Spawn Tagline Wall
    walls.push({
      id: 'wall_foyer_w',
      min: { x: -12.5, y: -0.9, z: 38 },
      max: { x: -12.0, y: 6.0, z: 53.0 },
      isWall: true,
    });
    walls.push({
      id: 'wall_foyer_e',
      min: { x: 12.0, y: -0.9, z: 38 },
      max: { x: 12.5, y: 6.0, z: 53.0 },
      isWall: true,
    });
    walls.push({
      id: 'wall_spawn_tagline',
      min: { x: -12.5, y: -0.9, z: 52.4 },
      max: { x: 12.5, y: 6.0, z: 53.0 },
      isWall: true,
    });
    walls.push({
      id: 'wall_hall_north',
      min: { x: -40, y: -0.9, z: -44 },
      max: { x: 40, y: 9.0, z: -43 },
      isWall: true,
    });
    walls.push({
      id: 'wall_hall_west',
      min: { x: -40, y: -0.9, z: -44 },
      max: { x: -39, y: 9.0, z: 39 },
      isWall: true,
    });
    walls.push({
      id: 'wall_hall_east',
      min: { x: 39, y: -0.9, z: -44 },
      max: { x: 40, y: 9.0, z: 39 },
      isWall: true,
    });

    // 12. Code Pillars & Decoy Pillars
    // Generate 4 distinct random digits for the ordinal sequence
    const digits: number[] = [];
    while (digits.length < 4) {
      const d = rng.int(1, 9);
      if (!digits.includes(d)) digits.push(d);
    }

    // Pillar 1: Foyer colonnade
    pillars.push({
      id: 'pil_code_1',
      x: -6,
      z: 44,
      radius: 0.6,
      height: 6.0,
      decalNumber: digits[0],
      ordinal: 1,
      kind: 'marble',
    });

    // Pillar 2: Pool-deck east
    pillars.push({
      id: 'pil_code_2',
      x: 36.5,
      z: -4,
      radius: 0.6,
      height: 7.0,
      decalNumber: digits[1],
      ordinal: 2,
      kind: 'tile',
    });

    // Pillar 3: Spectator gallery
    pillars.push({
      id: 'pil_code_3',
      x: 0,
      z: -40,
      radius: 0.6,
      height: 5.0,
      decalNumber: digits[2],
      ordinal: 3,
      kind: 'marble',
    });

    // Pillar 4: Changing room wing
    pillars.push({
      id: 'pil_code_4',
      x: -50,
      z: 0,
      radius: 0.6,
      height: 4.5,
      decalNumber: digits[3],
      ordinal: 4,
      kind: 'tile',
    });

    // Decoy pillars (have digits but NO ordinal marker)
    const decoyPositions = [
      { x: 36.5, z: 24 },
      { x: -36.5, z: 24 },
    ];
    for (let i = 0; i < decoyPositions.length; i++) {
      const dp = decoyPositions[i]!;
      pillars.push({
        id: `pil_decoy_${i}`,
        x: dp.x,
        z: dp.z,
        radius: 0.6,
        height: 5.0,
        decalNumber: rng.int(0, 9),
        ordinal: undefined,
        kind: 'tile',
      });
    }

    // 13. Drain Wheel prop in Plant Room
    props.push({
      id: 'drain_wheel',
      kind: 'drain_wheel',
      position: { x: 0, y: 0.3, z: -54 },
    });

    // 14. Exit Door at North end of Plant Room
    const exitPos = { x: 0, y: 0.3, z: -58 };

    // 15. Player and Monster Spawns
    const playerSpawn = { x: 0, y: 0.3, z: 50 }; // in foyer
    // Monster spawn in Grand Pool Hall at center Ear mosaic, >= 45m from player spawn (distance = 48m)
    const monsterSpawn = { x: 0, y: -0.9, z: 2 };

    const monsters: Array<{ id: string; variant: 'standard' | 'elder' | 'juvenile'; spawn: Vec3; sleeperSpawn?: Vec3; spawnGrace?: number }> = [
      {
        id: 'monster_1',
        variant: 'standard',
        spawn: monsterSpawn,
        sleeperSpawn: { x: 2.0, y: -0.9, z: 22.0 },
        spawnGrace: 20.0,
      },
    ];

    if (ctx.difficulty === 'deafening' || ctx.playerCount >= 3) {
      monsters.push({
        id: 'monster_2',
        variant: 'juvenile',
        spawn: { x: -28, y: -0.9, z: -20 },
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
          rect: [-38, -36, 38, 38],
          floorY: -0.9,
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
            drainWheelPos: { x: 0, y: 0.3, z: -54 },
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
            { x: 0, y: -0.9, z: 35 },
            { x: 0, y: -0.9, z: 25 },
            { x: 0, y: -0.9, z: 10 },
            { x: -12, y: -0.9, z: -10 },
            { x: 0, y: -0.9, z: -30 },
          ],
        },
      ],
      exit: {
        id: 'exit_doors',
        position: exitPos,
      },
      meta: {
        codeDigits: digits,
        steamMaskActive: true,
      },
    };
  },

  async build(layout: LayoutData, env: BuildEnv): Promise<MapInstance> {
    const tex = TextureRegistry.getInstance();
    const platformTiles = tex.getTileSet('platform', layout.seed);
    const wallTiles = tex.getTileSet('wall', layout.seed);
    const floorTiles = tex.getTileSet('floorWet', layout.seed);

    const platformMat = new MeshStandardMaterial({
      map: platformTiles.albedo,
      roughnessMap: platformTiles.roughness,
      normalMap: platformTiles.normal,
      aoMap: platformTiles.ao,
      aoMapIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.02,
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    applyWetDarkening(platformMat, { waterY: 0.0 });
    applyParallaxOcclusion(platformMat, { heightMap: platformTiles.height, scale: 0.015, maxDistance: 6.0 });

    const wallMat = new MeshStandardMaterial({
      map: wallTiles.albedo,
      roughnessMap: wallTiles.roughness,
      normalMap: wallTiles.normal,
      aoMap: wallTiles.ao,
      aoMapIntensity: 0.85,
      roughness: 0.45,
      metalness: 0.05,
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    applyWetDarkening(wallMat, { waterY: 0.0 });

    const floorMat = new MeshStandardMaterial({
      map: floorTiles.albedo,
      roughnessMap: floorTiles.roughness,
      normalMap: floorTiles.normal,
      aoMap: floorTiles.ao,
      aoMapIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.04,
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    applyParallaxOcclusion(floorMat, { heightMap: floorTiles.height, scale: 0.015, maxDistance: 6.0 });

    const ceilingTiles = tex.getTileSet('ceiling', layout.seed);
    const ceilingArchMat = new MeshStandardMaterial({
      map: ceilingTiles.albedo,
      roughnessMap: ceilingTiles.roughness,
      normalMap: ceilingTiles.normal,
      aoMap: ceilingTiles.ao,
      aoMapIntensity: 0.85,
      roughness: 0.70,
      metalness: 0.05,
      color: new Color('#b7a775'),
      envMapIntensity: 0.35,
      vertexColors: true,
    });

    const instance = buildStandardMapInstance(layout, env, {
      platformMat,
      wallMat,
      floorMat,
      ceilingMat: ceilingArchMat,
    });

    // 0. Spawn Wall Tagline Decal ("IT CAN'T SEE YOU. IT HEARS THE WATER.")
    const tagTex = tex.getTagline(77, 1024, 512);
    const tagMat = new MeshBasicMaterial({
      map: tagTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const tagGeo = new PlaneGeometry(4.8, 2.4);
    const tagMesh = new Mesh(tagGeo, tagMat);
    tagMesh.position.set(0, 0.3 + 1.65, 52.38);
    tagMesh.rotation.y = Math.PI; // facing -Z towards player at z=50
    tagMesh.name = 'SpawnTagline';
    instance.root.add(tagMesh);

    // Foyer floor guide decal ("TURN BACK -> POOL HALL")
    const foyerTurnTex = tex.getPaintedLabel({
      text: 'TURN BACK ->',
      subtext: 'POOL HALL',
      color: '#3a4430',
      width: 512,
      height: 256,
    });
    const foyerTurnMat = new MeshBasicMaterial({
      map: foyerTurnTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const foyerTurnMesh = new Mesh(new PlaneGeometry(2.8, 1.4), foyerTurnMat);
    foyerTurnMesh.rotation.x = -Math.PI / 2;
    foyerTurnMesh.rotation.z = Math.PI; // points towards -Z (pool hall)
    foyerTurnMesh.position.set(0, 0.305, 48.5);
    foyerTurnMesh.name = 'FoyerTurnDecal';
    instance.root.add(foyerTurnMesh);

    // Soft foyer guide light pointing toward the pool hall
    const foyerGuideLight = new PointLight(0xd6dccd, 1.4, 22.0, 1.2);
    foyerGuideLight.position.set(0, 3.5, 46.0);
    foyerGuideLight.name = 'FoyerGuideLight';
    instance.root.add(foyerGuideLight);

    // Foyer ceiling (encloses spawn area at height 6.0m)
    const foyerCeilingGeom = new BoxGeometry(25.0, 0.4, 15.0);
    scaleBoxUv(foyerCeilingGeom, 25.0, 0.4, 15.0, 1.6);
    const foyerCeiling = new Mesh(foyerCeilingGeom, ceilingArchMat);
    foyerCeiling.position.set(0, 6.0, 45.5);
    foyerCeiling.castShadow = true;
    foyerCeiling.receiveShadow = true;
    foyerCeiling.name = 'FoyerCeiling';
    instance.root.add(foyerCeiling);

    // Vaulted ceiling over grand pool hall (covers full map bounds, height 9.0m)
    const grandRoofGeom = new BoxGeometry(140.0, 0.5, 120.0);
    scaleBoxUv(grandRoofGeom, 140.0, 0.5, 120.0, 1.6);
    const grandRoof = new Mesh(grandRoofGeom, ceilingArchMat);
    grandRoof.position.set(0, 9.0, 0);
    grandRoof.castShadow = true;
    grandRoof.receiveShadow = true;
    grandRoof.name = 'GrandHallCeiling';
    instance.root.add(grandRoof);

    // 1. Add Ear mosaic to the pool floor center: [x: -6..6, z: -6..6, y = -0.89]
    const earTexture = makeMosaicEarTexture(512);
    const earMat = new MeshStandardMaterial({
      map: earTexture,
      roughness: 0.3,
      metalness: 0.05,
    });
    const earGeom = new PlaneGeometry(14, 14);
    bakeVertexAO(earGeom, { floorY: -0.89 });
    const earMesh = new Mesh(earGeom, earMat);
    earMesh.rotation.x = -Math.PI * 0.5;
    earMesh.position.set(0, -0.89, 0);
    earMesh.name = 'MosaicEar';
    instance.root.add(earMesh);

    // 2. Add barrel vault skylight light shafts and streaks
    const lightStreaks: LightStreak[] = [];
    const shaft = createLightShaftMesh({
      topRadius: 1.8,
      bottomRadius: 6.5,
      height: 14.0,
      color: '#fff5d6',
      intensity: 0.07, // Soft and gentle, preserving crystal clear corridor sightlines
    });
    shaft.position.set(0, 7.0, 0);
    instance.root.add(shaft);

    // Drifting dust motes inside the grand hall light shaft (Prompt 5.6)
    const grandHallMotes = createDustMotes({
      count: 36,
      bounds: { minX: -3.5, maxX: 3.5, minY: 1.0, maxY: 12.5, minZ: -3.5, maxZ: 3.5 },
      color: '#fffbe8',
      size: 0.06,
      seed: 991,
    });
    instance.root.add(grandHallMotes);

    // Y-shaped antler standing fixtures on distant platform slabs (reference v_05s, v_12s)
    const yFixtureGeom = buildYFixtureGeometry();
    const fixtureMat = new MeshStandardMaterial({
      color: new Color('#5a4d3a'),
      roughness: 0.4,
      metalness: 0.7,
    });
    const yFixtures = new InstancedMesh(yFixtureGeom, fixtureMat, 2);
    yFixtures.name = 'YFixtures';
    const m4 = new Matrix4();
    m4.makeTranslation(12, 0.3, 10);
    yFixtures.setMatrixAt(0, m4);
    m4.makeRotationY(0.4);
    m4.setPosition(18, 0.3, -5);
    yFixtures.setMatrixAt(1, m4);
    yFixtures.instanceMatrix.needsUpdate = true;
    instance.root.add(yFixtures);

    // Luminous rectangular window on west wall (reference v_05s, v_21s)
    const winGeom = new PlaneGeometry(3.6, 2.2);
    const winMat = new MeshBasicMaterial({
      color: new Color('#fff3d6'),
      transparent: true,
      opacity: 0.88,
    });
    const winMesh = new Mesh(winGeom, winMat);
    winMesh.position.set(-39.38, 5.2, 12.0);
    winMesh.rotation.y = Math.PI * 0.5;
    winMesh.name = 'WestWallWindow';
    instance.root.add(winMesh);

    // Tricolor wall panel on far gallery wall (reference v_12s, v_21s)
    const panelGeom = buildColorPanelGeometry(3.6, 2.0);
    const panelMat = new MeshStandardMaterial({
      color: new Color('#e0d5be'),
      roughness: 0.5,
      metalness: 0.1,
    });
    const panelMesh = new Mesh(panelGeom, panelMat);
    panelMesh.position.set(-14.0, 5.0, -41.8);
    panelMesh.name = 'TricolorPanel';
    instance.root.add(panelMesh);

    const skylightZ = [-24, -8, 8, 24];
    for (let i = 0; i < skylightZ.length; i++) {
      const z = skylightZ[i]!;
      // Area light streak proxy on rippling water
      lightStreaks.push({
        pos: new Vector3(0, 7.0, z),
        dir: new Vector3(1, 0, 0), // along x axis
        size: 28.0,
        color: new Color('#fff6e0'),
        intensity: 0.85,
      });
    }

    // Attach streaks to instance meta for WaterSystem upload
    instance.root.userData['lightStreaks'] = lightStreaks;

    // 3. Atmospheric floating dust motes
    const motes = createDustMotes({
      count: 140,
      bounds: { minX: -30, maxX: 30, minY: 0.5, maxY: 10, minZ: -30, maxZ: 30 },
      color: '#fff3d1',
      size: 0.07,
    });
    instance.root.add(motes);

    // Freeze matrices on post-build meshes
    instance.root.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.matrixAutoUpdate = false;
        obj.updateMatrix();
      }
    });

    return instance;
  },

  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void {
    const scaleX = w / 140.0;
    const scaleY = h / 120.0;

    // Background water
    g.fillStyle = '#265446';
    g.fillRect(0, 0, w, h);

    // Platforms
    g.fillStyle = '#e2dac6';
    for (const p of layout.platforms) {
      const rx = (p.rect[0] + 70) * scaleX;
      const ry = (p.rect[1] + 60) * scaleY;
      const rw = (p.rect[2] - p.rect[0]) * scaleX;
      const rh = (p.rect[3] - p.rect[1]) * scaleY;
      g.fillRect(rx, ry, rw, rh);
    }

    // Ear spiral mosaic at pool floor center
    const earX = (0 + 70) * scaleX;
    const earY = (0 + 60) * scaleY;
    g.strokeStyle = '#d4af37';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(earX, earY, 8, 0, Math.PI * 1.5);
    g.stroke();

    // Code pillars
    for (const pil of layout.pillars) {
      const px = (pil.x + 70) * scaleX;
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
    g.arc((sp.x + 70) * scaleX, (sp.z + 60) * scaleY, 4, 0, Math.PI * 2);
    g.fill();

    const ex = layout.exit.position;
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc((ex.x + 70) * scaleX, (ex.z + 60) * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  },
};

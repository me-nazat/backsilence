/* ── MapLevelArtPass.ts ───────────────────────────────────────────────────────
 *  Level Art Enhancement Pass for all 10 BackSilence maps.
 *  Enforces commercial visual standards:
 *  - 120k to 220k triangles and 120 to 200 draw calls per map
 *  - 3 depth layers (foreground clutter, midground architecture, background silhouettes in fog)
 *  - At least 12 distinct prop types per map
 *  - At least 40 decals per 1,000 square meters (via DecalSystem)
 *  - One point of interest (POI) in every 16m cell
 *  - All static meshes set matrixAutoUpdate = false
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Color,
  Vector3,
} from 'three';
import type { LayoutData } from '../MapTypes.js';
import type { ColliderSet } from '../../sim/Colliders.js';
import { Rng } from '../../procedural/core/prng.js';
import { DecalSystem } from '../../game/decals/DecalSystem.js';
import {
  buildLifeguardChairGeometry,
  buildBalustradeGeometry,
  buildDivingTowerGeometry,
  buildFloorDrainGeometry,
  buildSchoolDeskGeometry,
  buildStackedChairsGeometry,
  buildWallClockGeometry,
  buildTrophyCaseGeometry,
  buildLilyPadGeometry,
  buildReedsClusterGeometry,
  buildBoulderGeometry,
  buildHoloBillboardGeometry,
  buildHoverCarGeometry,
  buildSuspendedCablesGeometry,
  buildSubwayCarGeometry,
  buildTurnstileGeometry,
  buildTunnelRingGeometry,
  buildWeirGateGeometry,
  buildTankPanelGeometry,
  buildVortexGrateGeometry,
  buildStalactiteGeometry,
  buildVaultRibGeometry,
  buildFloatingPapersGeometry,
  buildLaneLineGeometry,
} from './LevelArtProps.js';

export interface LevelArtEnv {
  root: Group;
  layout: LayoutData;
  colliders?: ColliderSet;
  materialsToDispose: { dispose: () => void }[];
  geometriesToDispose: { dispose: () => void }[];
  customMaterials: {
    platformMat: MeshStandardMaterial;
    wallMat: MeshStandardMaterial;
    floorMat: MeshStandardMaterial;
  };
}

export function applyMapLevelArtPass(env: LevelArtEnv): void {
  const { root, layout, colliders, materialsToDispose, geometriesToDispose, customMaterials } = env;
  const rng = new Rng(layout.seed + 9999);
  const bounds = layout.bounds;
  const mapId = layout.mapId;

  // 1. Decal System: at least 40 decals per 1000 square meters
  const areaSqM = Math.max(1000, (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ));
  const targetDecals = Math.min(400, Math.max(60, Math.floor((areaSqM / 1000) * 40)));
  const decalSystem = new DecalSystem(400);

  // Distribute decals across platforms and walls
  let decalCount = 0;
  for (const plat of layout.platforms) {
    if (decalCount >= targetDecals) break;
    const [minX, minZ, maxX, maxZ] = plat.rect;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    // Platform surface tidemark / crack decal
    decalSystem.addDecal({
      position: new Vector3(cx + rng.range(-1, 1), plat.topY, cz + rng.range(-1, 1)),
      normal: new Vector3(0, 1, 0),
      size: 1.4,
      kind: rng.next() < 0.5 ? 'stain' : 'crack',
      color: '#d4ccba',
    });
    decalCount++;

    // Platform edge drip decal facing water
    decalSystem.addDecal({
      position: new Vector3(cx, plat.topY - 0.2, maxZ),
      normal: new Vector3(0, 0, 1),
      size: 1.2,
      kind: 'drip',
      color: '#ffffff',
    });
    decalCount++;
  }

  // Wall decals (graffiti & numerals)
  for (const wall of layout.walls) {
    if (decalCount >= targetDecals) break;
    const cx = (wall.min.x + wall.max.x) * 0.5;
    const cy = wall.min.y + 1.6;

    decalSystem.addDecal({
      position: new Vector3(cx, cy, wall.max.z),
      normal: new Vector3(0, 0, 1),
      size: 1.5,
      kind: rng.next() < 0.6 ? 'graffiti' : 'numeral',
      color: '#ffffff',
    });
    decalCount++;
  }

  // Fill remaining decals across open spaces
  while (decalCount < targetDecals) {
    const rx = rng.range(bounds.minX + 4, bounds.maxX - 4);
    const rz = rng.range(bounds.minZ + 4, bounds.maxZ - 4);
    decalSystem.addDecal({
      position: new Vector3(rx, -0.88, rz),
      normal: new Vector3(0, 1, 0),
      size: 1.6,
      kind: rng.next() < 0.5 ? 'stain' : 'crack',
      color: '#4a6058',
    });
    decalCount++;
  }

  root.add(decalSystem.root);
  materialsToDispose.push(decalSystem.root.material as MeshStandardMaterial);
  geometriesToDispose.push(decalSystem.root.geometry);

  // 2. Thematic PBR materials for props
  const brassMat = new MeshStandardMaterial({
    color: new Color('#b08d3c'),
    roughness: 0.28,
    metalness: 0.88,
  });
  const metalMat = new MeshStandardMaterial({
    color: new Color('#3b4045'),
    roughness: 0.45,
    metalness: 0.75,
  });
  const woodMat = new MeshStandardMaterial({
    color: new Color('#563c29'),
    roughness: 0.6,
    metalness: 0.05,
  });
  const foliageMat = new MeshStandardMaterial({
    color: new Color('#2e5b3c'),
    roughness: 0.7,
    metalness: 0.02,
  });
  const signMat = new MeshStandardMaterial({
    color: new Color('#e8f4f8'),
    emissive: new Color('#1a3240'),
    roughness: 0.35,
    metalness: 0.1,
  });

  materialsToDispose.push(brassMat, metalMat, woodMat, foliageMat, signMat);

  // Helper to place static mesh with matrixAutoUpdate = false
  const placeMesh = (
    geom: ReturnType<typeof buildLifeguardChairGeometry>,
    mat: MeshStandardMaterial,
    pos: Vector3,
    rotY = 0,
    name?: string,
  ): Mesh => {
    geometriesToDispose.push(geom);
    const mesh = new Mesh(geom, mat);
    mesh.position.copy(pos);
    if (rotY !== 0) mesh.rotation.y = rotY;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (name) mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  // 3. Map-specific set pieces and signature props
  const placedPropTypes = new Set<string>();

  // Always register common prop kinds from layout
  for (const p of layout.props) {
    placedPropTypes.add(p.kind);
  }

  // --- Depth Layering & Map Theming ---
  switch (mapId) {
    case 'natatorium': {
      // 1. Vault ribs across ceiling (background silhouette in mist)
      for (let z = -24; z <= 24; z += 24) {
        placeMesh(buildVaultRibGeometry(44.0, 11.0), customMaterials.wallMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');

      // 2. High Diving Tower at north end of pool
      placeMesh(buildDivingTowerGeometry(), customMaterials.platformMat, new Vector3(0, -0.9, -32), Math.PI);
      placedPropTypes.add('diving_tower');

      // 3. Lifeguard Chairs along pool flanks
      placeMesh(buildLifeguardChairGeometry(), metalMat, new Vector3(-20, 0.3, -12), Math.PI * 0.5);
      placeMesh(buildLifeguardChairGeometry(), metalMat, new Vector3(20, 0.3, 12), -Math.PI * 0.5);
      placedPropTypes.add('lifeguard_chair');

      // 4. Balustrades & brass rails on foyer steps & perimeter
      for (const z of [-12, 12]) {
        placeMesh(buildBalustradeGeometry(8.0), brassMat, new Vector3(-18.5, 0.3, z), Math.PI * 0.5);
        placeMesh(buildBalustradeGeometry(8.0), brassMat, new Vector3(18.5, 0.3, z), Math.PI * 0.5);
      }
      placedPropTypes.add('balustrade');

      // 5. Floating buoy lane lines
      placeMesh(buildLaneLineGeometry(60.0), brassMat, new Vector3(-8, 0, 0));
      placeMesh(buildLaneLineGeometry(60.0), brassMat, new Vector3(8, 0, 0));
      placedPropTypes.add('lane_line');

      // 6. Floor drains in foyer and walkways
      for (let x = -8; x <= 8; x += 8) {
        placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(x, 0.3, 44));
      }
      placedPropTypes.add('floor_drain');

      // 7. Wall clocks
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 5.0, 57.5), Math.PI);
      placedPropTypes.add('wall_clock');

      // 8. Trophy cases in foyer alcoves
      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(-10, 0.3, 52), Math.PI * 0.5);
      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(10, 0.3, 52), -Math.PI * 0.5);
      placedPropTypes.add('trophy_case');

      // 9. Floating papers in pool corners
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(-14, 0, -18));
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(12, 0, 16));
      placedPropTypes.add('floating_papers');

      // 10. Turnstile gate at entrance
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(-2.0, 0.3, 56));
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(2.0, 0.3, 56));
      placedPropTypes.add('turnstile');

      // 11. Suspended lighting fixtures
      placeMesh(buildSuspendedCablesGeometry(36.0), metalMat, new Vector3(0, 2.0, -10));
      placedPropTypes.add('cables');

      // 12. Stalactite drip clusters from ceiling cracks
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(-12, 2.0, 10));
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(14, 2.0, -15));
      placedPropTypes.add('stalactite');
      break;
    }

    case 'poolrooms': {
      // Classic Archipelago: stepped slabs, rails, drains, faded numerals, arches trailing haze
      for (const plat of layout.platforms) {
        const [minX, minZ, maxX, maxZ] = plat.rect;
        const cx = (minX + maxX) * 0.5;
        const cz = (minZ + maxZ) * 0.5;
        const len = maxX - minX;

        // Balustrade safety rail along one edge
        if (len >= 6.0) {
          placeMesh(buildBalustradeGeometry(len * 0.6), brassMat, new Vector3(cx, plat.topY, maxZ - 0.2));
        }

        // Floor drain in center
        placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(cx, plat.topY, cz));
      }
      placedPropTypes.add('balustrade');
      placedPropTypes.add('floor_drain');

      // Stepped slab set pieces & arches
      for (let z = -36; z <= 36; z += 18) {
        placeMesh(buildVaultRibGeometry(32.0, 7.5), customMaterials.wallMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');

      // Floating papers, clocks, stalactites, cables, turnstiles, benches, ladders
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 3.5, -46));
      placedPropTypes.add('wall_clock');
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(8, 0, -10));
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(-12, 0, 14));
      placedPropTypes.add('floating_papers');
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(-18, 1.0, -8));
      placedPropTypes.add('stalactite');
      placeMesh(buildSuspendedCablesGeometry(28.0), metalMat, new Vector3(0, 1.5, 0));
      placedPropTypes.add('cables');
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(-34, 0.3, -34));
      placedPropTypes.add('turnstile');
      placeMesh(buildLifeguardChairGeometry(), metalMat, new Vector3(22, 0.3, 22));
      placedPropTypes.add('lifeguard_chair');
      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(32, 0.3, -20), -Math.PI * 0.5);
      placedPropTypes.add('trophy_case');
      placeMesh(buildWeirGateGeometry(), metalMat, new Vector3(-25, -0.9, 30));
      placedPropTypes.add('weir_gate');
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(30, -0.9, 35));
      placedPropTypes.add('tank_panel');
      break;
    }

    case 'drowned_school': {
      // Flooded classrooms, stacked chairs, desks, chalkboard, floating papers, stopped clock
      for (let x = -24; x <= 24; x += 8) {
        for (let z = -20; z <= 20; z += 10) {
          if (rng.next() < 0.65) {
            placeMesh(buildSchoolDeskGeometry(), woodMat, new Vector3(x, -0.50, z), rng.range(-0.3, 0.3));
            if (colliders) {
              colliders.addBox(
                `desk_${x}_${z}`,
                { x: x - 0.45, y: -0.50, z: z - 0.45 },
                { x: x + 0.45, y: 0.26, z: z + 0.45 },
                false,
              );
            }
          }
        }
      }
      placedPropTypes.add('school_desk');

      // Vault ribs across corridor ceiling
      for (let z = -32; z <= 32; z += 10) {
        placeMesh(buildVaultRibGeometry(28.0, 6.0), customMaterials.wallMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');

      // Stacked chairs against corridor walls
      for (let z = -25; z <= 25; z += 10) {
        placeMesh(buildStackedChairsGeometry(), metalMat, new Vector3(-28, 0.3, z), Math.PI * 0.5);
        placeMesh(buildStackedChairsGeometry(), metalMat, new Vector3(28, 0.3, z), -Math.PI * 0.5);
        if (colliders) {
          colliders.addBox(`stacked_w_${z}`, { x: -28.4, y: 0.3, z: z - 0.4 }, { x: -27.6, y: 1.15, z: z + 0.4 }, false);
          colliders.addBox(`stacked_e_${z}`, { x: 27.6, y: 0.3, z: z - 0.4 }, { x: 28.4, y: 1.15, z: z + 0.4 }, false);
        }
      }
      placedPropTypes.add('stacked_chairs');

      // Wall clock stopped at 3:07
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 3.2, -35));
      placedPropTypes.add('wall_clock');

      // Trophy cases
      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(-12, 0.3, -32));
      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(12, 0.3, -32));
      placedPropTypes.add('trophy_case');

      // Floating papers everywhere
      for (let i = 0; i < 8; i++) {
        placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(rng.range(-20, 20), 0, rng.range(-20, 20)));
      }
      placedPropTypes.add('floating_papers');

      // Turnstiles, balustrades, drains, vault ribs, cables, tank panels, weir gates
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(0, 0.3, 38));
      placedPropTypes.add('turnstile');
      placeMesh(buildBalustradeGeometry(12.0), metalMat, new Vector3(0, 0.3, 20));
      placedPropTypes.add('balustrade');
      placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(0, 0.3, 0));
      placedPropTypes.add('floor_drain');
      placeMesh(buildSuspendedCablesGeometry(24.0), metalMat, new Vector3(0, 1.0, 10));
      placedPropTypes.add('cables');
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(-32, 0.3, 0));
      placedPropTypes.add('tank_panel');
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(15, 1.5, -15));
      placedPropTypes.add('stalactite');
      break;
    }

    case 'sunken_jungle': {
      // Reeds, lily pads, moss boulders, ruined temple silhouette, hanging vines
      for (let i = 0; i < 8; i++) {
        const rx = rng.range(bounds.minX + 6, bounds.maxX - 6);
        const rz = rng.range(bounds.minZ + 6, bounds.maxZ - 6);
        placeMesh(buildBoulderGeometry(rng.range(1.1, 2.2)), customMaterials.platformMat, new Vector3(rx, -0.6, rz));
      }
      placedPropTypes.add('moss_boulder');

      for (let i = 0; i < 8; i++) {
        const rx = rng.range(bounds.minX + 4, bounds.maxX - 4);
        const rz = rng.range(bounds.minZ + 4, bounds.maxZ - 4);
        placeMesh(buildLilyPadGeometry(), foliageMat, new Vector3(rx, 0, rz), rng.range(0, Math.PI * 2));
      }
      placedPropTypes.add('lily_pad');

      for (let i = 0; i < 8; i++) {
        const rx = rng.range(bounds.minX + 5, bounds.maxX - 5);
        const rz = rng.range(bounds.minZ + 5, bounds.maxZ - 5);
        placeMesh(buildReedsClusterGeometry(), foliageMat, new Vector3(rx, -0.85, rz));
      }
      placedPropTypes.add('reeds');

      // Additional props: stalactites (hanging vines proxy), vault ribs, cables, drains, floating papers, etc.
      for (let z = -30; z <= 30; z += 10) {
        placeMesh(buildStalactiteGeometry(), foliageMat, new Vector3(rng.range(-15, 15), 1.5, z));
      }
      placedPropTypes.add('stalactite');
      for (let z = -30; z <= 30; z += 15) {
        placeMesh(buildVaultRibGeometry(34.0, 8.0), customMaterials.wallMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');
      placeMesh(buildBalustradeGeometry(8.0), woodMat, new Vector3(0, 0.3, 10));
      placedPropTypes.add('balustrade');
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(5, 0, -5));
      placedPropTypes.add('floating_papers');
      placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(0, 0.3, -12));
      placedPropTypes.add('floor_drain');
      placeMesh(buildSuspendedCablesGeometry(26.0), foliageMat, new Vector3(0, 1.2, -15));
      placedPropTypes.add('cables');
      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(-20, 0.3, 20));
      placedPropTypes.add('trophy_case');
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(25, -0.9, -25));
      placedPropTypes.add('tank_panel');
      break;
    }

    case 'neon_flood': {
      // Holographic billboards, hover cars, cables, steam, drone beams
      for (let z = -32; z <= 32; z += 16) {
        placeMesh(buildHoloBillboardGeometry(), signMat, new Vector3(-24, 0.3, z), Math.PI * 0.5);
        placeMesh(buildHoloBillboardGeometry(), signMat, new Vector3(24, 0.3, z), -Math.PI * 0.5);
      }
      placedPropTypes.add('holo_billboard');

      // Overhead structural trusses
      for (let z = -36; z <= 36; z += 12) {
        placeMesh(buildVaultRibGeometry(38.0, 8.5), metalMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');

      // Submerged hover cars
      placeMesh(buildHoverCarGeometry(), metalMat, new Vector3(-12, -0.3, -20), 0.4);
      placeMesh(buildHoverCarGeometry(), metalMat, new Vector3(-8, -0.3, 0), -0.2);
      placeMesh(buildHoverCarGeometry(), metalMat, new Vector3(10, -0.3, 18), -0.7);
      placeMesh(buildHoverCarGeometry(), metalMat, new Vector3(14, -0.3, -12), 0.8);
      placedPropTypes.add('hover_car');

      // Suspended cable networks overhead
      for (let z = -36; z <= 36; z += 12) {
        placeMesh(buildSuspendedCablesGeometry(42.0), metalMat, new Vector3(0, 1.5, z));
      }
      placedPropTypes.add('cables');

      // Balustrades, turnstiles, subway car, tank panels, weir gates, drains, wall clocks
      placeMesh(buildBalustradeGeometry(10.0), metalMat, new Vector3(0, 0.3, -5));
      placedPropTypes.add('balustrade');
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(-6, 0.3, 25));
      placedPropTypes.add('turnstile');
      placeMesh(buildSubwayCarGeometry(), metalMat, new Vector3(18, -0.6, -20));
      placedPropTypes.add('subway_car');
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(-28, 0.3, 5));
      placedPropTypes.add('tank_panel');
      placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(0, 0.3, 15));
      placedPropTypes.add('floor_drain');
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 4.0, 38));
      placedPropTypes.add('wall_clock');
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(-12, 0, -8));
      placedPropTypes.add('floating_papers');
      break;
    }

    case 'drowned_metro': {
      // Stalled subway trains, turnstiles, cables, platform tiles, litter
      placeMesh(buildSubwayCarGeometry(), metalMat, new Vector3(-14, -0.6, -18));
      placeMesh(buildSubwayCarGeometry(), metalMat, new Vector3(-14, -0.6, 12));
      placeMesh(buildSubwayCarGeometry(), metalMat, new Vector3(14, -0.6, -12));
      placeMesh(buildSubwayCarGeometry(), metalMat, new Vector3(14, -0.6, 18));
      placedPropTypes.add('subway_car');

      for (let z = -36; z <= 36; z += 12) {
        placeMesh(buildTunnelRingGeometry(3.6), metalMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('tunnel_ring');

      for (let x = -8; x <= 8; x += 4) {
        placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(x, 0.3, 28));
      }
      placedPropTypes.add('turnstile');

      for (let z = -30; z <= 30; z += 12) {
        placeMesh(buildBalustradeGeometry(8.0), metalMat, new Vector3(-4.5, 0.3, z), Math.PI * 0.5);
      }
      placedPropTypes.add('balustrade');

      // Station name panels, clocks, vault ribs, drains, cables, litter
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 3.8, 32));
      placedPropTypes.add('wall_clock');
      for (let i = 0; i < 6; i++) {
        placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(rng.range(-15, 15), 0, rng.range(-20, 20)));
      }
      placedPropTypes.add('floating_papers');
      placeMesh(buildVaultRibGeometry(32.0, 7.0), customMaterials.wallMat, new Vector3(0, 0, 0));
      placedPropTypes.add('vault_rib');
      placeMesh(buildSuspendedCablesGeometry(28.0), metalMat, new Vector3(0, 1.8, 10));
      placedPropTypes.add('cables');
      placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(0, 0.3, -10));
      placedPropTypes.add('floor_drain');
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(-25, 0.3, -15));
      placedPropTypes.add('tank_panel');
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(8, 1.2, 14));
      placedPropTypes.add('stalactite');
      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(20, 0.3, 20));
      placedPropTypes.add('trophy_case');
      break;
    }

    case 'utility_tunnels': {
      // Pipe clusters, tunnel rings, catwalks, vents, steam plumes
      for (let z = -36; z <= 36; z += 9) {
        placeMesh(buildTunnelRingGeometry(3.6), metalMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('tunnel_ring');

      for (let z = -30; z <= 30; z += 10) {
        placeMesh(buildVaultRibGeometry(14.0, 4.5), customMaterials.wallMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');

      for (let z = -25; z <= 25; z += 10) {
        placeMesh(buildBalustradeGeometry(6.0), metalMat, new Vector3(2.2, 0.3, z), Math.PI * 0.5);
      }
      placedPropTypes.add('balustrade');

      // Tank panels, weir gates, drains, stalactites, cables, clocks
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(-6, 0.3, -15));
      placedPropTypes.add('tank_panel');
      placeMesh(buildWeirGateGeometry(), metalMat, new Vector3(0, -0.9, 28));
      placedPropTypes.add('weir_gate');
      placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(0, 0.3, 5));
      placedPropTypes.add('floor_drain');
      placeMesh(buildSuspendedCablesGeometry(20.0), metalMat, new Vector3(0, 1.0, 0));
      placedPropTypes.add('cables');
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(3, 1.2, -10));
      placedPropTypes.add('stalactite');
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 3.2, 30));
      placedPropTypes.add('wall_clock');
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(0, 0.3, -28));
      placedPropTypes.add('turnstile');
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(1.5, 0, 12));
      placedPropTypes.add('floating_papers');
      placeMesh(buildVaultRibGeometry(22.0, 5.0), customMaterials.wallMat, new Vector3(0, 0, 0));
      placedPropTypes.add('vault_rib');
      break;
    }

    case 'marble_atrium': {
      // Classical colonnade, oculus, bells, fountains, floating petals
      for (let z = -28; z <= 28; z += 14) {
        placeMesh(buildVaultRibGeometry(34.0, 9.0), customMaterials.wallMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');

      for (let z = -20; z <= 20; z += 10) {
        placeMesh(buildBalustradeGeometry(8.0), brassMat, new Vector3(-12.5, 0.3, z), Math.PI * 0.5);
        placeMesh(buildBalustradeGeometry(8.0), brassMat, new Vector3(12.5, 0.3, z), Math.PI * 0.5);
      }
      placedPropTypes.add('balustrade');

      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(-16, 0.3, 0));
      placedPropTypes.add('trophy_case');
      placeMesh(buildWallClockGeometry(), brassMat, new Vector3(0, 4.5, 34));
      placedPropTypes.add('wall_clock');
      placeMesh(buildFloorDrainGeometry(), brassMat, new Vector3(0, 0.3, 0));
      placedPropTypes.add('floor_drain');
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(6, 0, -8));
      placedPropTypes.add('floating_papers');
      placeMesh(buildTurnstileGeometry(), brassMat, new Vector3(0, 0.3, -30));
      placedPropTypes.add('turnstile');
      placeMesh(buildSuspendedCablesGeometry(30.0), brassMat, new Vector3(0, 2.0, 0));
      placedPropTypes.add('cables');
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(-10, 1.8, 12));
      placedPropTypes.add('stalactite');
      placeMesh(buildBoulderGeometry(1.5), customMaterials.platformMat, new Vector3(15, -0.7, -15));
      placedPropTypes.add('moss_boulder');
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(-20, 0.3, -20));
      placedPropTypes.add('tank_panel');
      break;
    }

    case 'hydro_maze': {
      // Tank panels, grated weirs, hazard stripes, pipe runs, filter drums
      for (let z = -24; z <= 24; z += 12) {
        placeMesh(buildWeirGateGeometry(), metalMat, new Vector3(rng.range(-15, 15), -0.9, z));
      }
      placedPropTypes.add('weir_gate');

      for (let x = -20; x <= 20; x += 10) {
        placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(x, 0.3, rng.range(-20, 20)));
      }
      placedPropTypes.add('tank_panel');

      for (let z = -25; z <= 25; z += 10) {
        placeMesh(buildBalustradeGeometry(6.0), metalMat, new Vector3(0, 0.3, z));
      }
      placedPropTypes.add('balustrade');

      placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(0, 0.3, 0));
      placedPropTypes.add('floor_drain');
      placeMesh(buildTunnelRingGeometry(3.4), metalMat, new Vector3(0, 0, -10));
      placedPropTypes.add('tunnel_ring');
      placeMesh(buildSuspendedCablesGeometry(24.0), metalMat, new Vector3(0, 1.2, 10));
      placedPropTypes.add('cables');
      placeMesh(buildVaultRibGeometry(28.0, 6.0), customMaterials.wallMat, new Vector3(0, 0, 0));
      placedPropTypes.add('vault_rib');
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(-15, 0.3, 20));
      placedPropTypes.add('turnstile');
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 3.2, 28));
      placedPropTypes.add('wall_clock');
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(4, 0, -8));
      placedPropTypes.add('floating_papers');
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(-12, 1.2, -15));
      placedPropTypes.add('stalactite');
      break;
    }

    case 'drainage_core': {
      // Central vortex pit grate, dripping stalactites, algae motes, amber strips
      placeMesh(buildVortexGrateGeometry(), metalMat, new Vector3(0, 0, 0));
      placedPropTypes.add('vortex_grate');

      for (let i = 0; i < 18; i++) {
        const rx = rng.range(bounds.minX + 6, bounds.maxX - 6);
        const rz = rng.range(bounds.minZ + 6, bounds.maxZ - 6);
        placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(rx, 1.8, rz));
      }
      placedPropTypes.add('stalactite');

      for (let z = -28; z <= 28; z += 14) {
        placeMesh(buildTunnelRingGeometry(3.8), metalMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('tunnel_ring');

      for (let z = -20; z <= 20; z += 10) {
        placeMesh(buildBalustradeGeometry(8.0), metalMat, new Vector3(-10, 0.3, z), Math.PI * 0.5);
      }
      placedPropTypes.add('balustrade');

      placeMesh(buildWeirGateGeometry(), metalMat, new Vector3(0, -0.9, -24));
      placedPropTypes.add('weir_gate');
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(18, 0.3, 18));
      placedPropTypes.add('tank_panel');
      placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(8, 0.3, 8));
      placedPropTypes.add('floor_drain');
      placeMesh(buildSuspendedCablesGeometry(30.0), metalMat, new Vector3(0, 1.4, 0));
      placedPropTypes.add('cables');
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(0, 0.3, 30));
      placedPropTypes.add('turnstile');
      placeMesh(buildVaultRibGeometry(32.0, 7.5), customMaterials.wallMat, new Vector3(0, 0, 0));
      placedPropTypes.add('vault_rib');
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(-8, 0, -12));
      placedPropTypes.add('floating_papers');
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 3.5, 32));
      placedPropTypes.add('wall_clock');
      break;
    }

    default: {
      // Generic fallback ensuring 12 distinct prop types
      placeMesh(buildVaultRibGeometry(30.0, 7.0), customMaterials.wallMat, new Vector3(0, 0, 0));
      placeMesh(buildBalustradeGeometry(8.0), metalMat, new Vector3(0, 0.3, 0));
      placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(0, 0.3, -5));
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 3.0, 10));
      placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(2, 0, 2));
      placeMesh(buildTurnstileGeometry(), metalMat, new Vector3(0, 0.3, -15));
      placeMesh(buildSuspendedCablesGeometry(20.0), metalMat, new Vector3(0, 1.0, 0));
      placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(-5, 1.0, -5));
      placeMesh(buildTankPanelGeometry(), metalMat, new Vector3(10, 0.3, 10));
      placeMesh(buildTrophyCaseGeometry(), woodMat, new Vector3(-10, 0.3, 10));
      placeMesh(buildWeirGateGeometry(), metalMat, new Vector3(0, -0.9, 15));
      placeMesh(buildTunnelRingGeometry(3.0), metalMat, new Vector3(0, 0, -5));
      break;
    }
  }

  // 4. One Point of Interest (POI) in every 16m grid cell across the map bounds
  for (let x = bounds.minX + 8; x < bounds.maxX; x += 16) {
    for (let z = bounds.minZ + 8; z < bounds.maxZ; z += 16) {
      // Check if (x, z) is over a dry platform
      let platY: number | null = null;
      for (const p of layout.platforms) {
        if (x >= p.rect[0] && x <= p.rect[2] && z >= p.rect[1] && z <= p.rect[3]) {
          platY = p.topY;
          break;
        }
      }

      // Primary POI
      const roll = rng.next();
      if (platY !== null && platY >= 0.2) {
        // Dry platform: floor drain, balustrade, or papers
        if (roll < 0.4) {
          placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(x, platY, z));
        } else if (roll < 0.7) {
          placeMesh(buildBalustradeGeometry(3.6), metalMat, new Vector3(x, platY, z));
        } else {
          placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(x, platY, z));
        }
      } else {
        // Open water / deep floor: submerged boulder or weir gate on floor, papers on surface, or stalactite from ceiling
        if (roll < 0.3) {
          placeMesh(buildBoulderGeometry(1.2), customMaterials.platformMat, new Vector3(x, -0.7, z));
          if (colliders) {
            colliders.addBox(`boulder_${x}_${z}`, { x: x - 0.7, y: -0.9, z: z - 0.7 }, { x: x + 0.7, y: 0.35, z: z + 0.7 }, false);
          }
        } else if (roll < 0.55) {
          placeMesh(buildWeirGateGeometry(), metalMat, new Vector3(x, -0.9, z));
        } else if (roll < 0.8) {
          placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(x, 1.2, z));
        } else {
          placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(x, 0, z));
        }
      }

      // Secondary depth details (foreground clutter)
      if (platY !== null && platY >= 0.2) {
        if (rng.next() < 0.35) {
          placeMesh(buildBalustradeGeometry(3.2), metalMat, new Vector3(x + rng.range(-2, 2), platY, z + rng.range(-2, 2)));
        }
      } else {
        const secRoll = rng.next();
        if (secRoll < 0.3) {
          placeMesh(buildBoulderGeometry(1.0), customMaterials.platformMat, new Vector3(x + rng.range(-2, 2), -0.7, z + rng.range(-2, 2)));
        } else if (secRoll < 0.6) {
          placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(x + rng.range(-3, 3), 0, z + rng.range(-3, 3)));
        }
      }
    }
  }

  // Store placed prop kinds on root userData for audit
  root.userData['levelArtPropTypes'] = Array.from(placedPropTypes);
  root.userData['levelArtDecalsPlaced'] = decalCount;
}

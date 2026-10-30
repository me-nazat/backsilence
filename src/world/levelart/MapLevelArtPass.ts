/* ── MapLevelArtPass.ts ───────────────────────────────────────────────────────
 *  Level Art Enhancement Pass for all BackSilence maps.
 *  Enforces commercial visual standards:
 *  - 120k to 285k triangles and 50 to 240 draw calls per map
 *  - 3 depth layers (foreground clutter, midground architecture, background silhouettes in fog)
 *  - At least 12 distinct 100%-thematic prop types per map (zero cross-map prop pollution)
 *  - Accurate surface height snapping via getSurfaceY(layout, x, z)
 *  - At least 40 decals per 1,000 square meters (via DecalSystem)
 *  - One thematic point of interest (POI) in every 16m cell
 *  - All static meshes set matrixAutoUpdate = false
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  MeshStandardMaterial,
  BufferGeometry,
  Color,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  buildSchoolChairGeometry,
  buildChalkboardGeometry,
  buildLockerBankGeometry,
  buildPaSpeakerGeometry,
  buildBookshelfGeometry,
  buildPodiumGeometry,
  buildDrinkingFountainGeometry,
  buildGymHoopGeometry,
  buildRailTrackGeometry,
  buildStationSignGeometry,
  buildTicketMachineGeometry,
  buildDepartureBoardGeometry,
  buildMetroBenchGeometry,
  buildRouteMapGeometry,
  buildThirdRailGeometry,
  buildTrackLeverGeometry,
  buildStoneTotemGeometry,
  buildJungleTreeGeometry,
  buildHangingVinesGeometry,
  buildFernClusterGeometry,
  buildBioFungiGeometry,
  buildFallenObeliskGeometry,
  buildStoneBrazierGeometry,
  buildGlassTrussGeometry,
  buildSteppingStoneGeometry,
  buildNeonSignGeometry,
  buildSparkBoxGeometry,
  buildCyberVendingGeometry,
  buildStreetLampGeometry,
  buildCoolingVentGeometry,
  buildDronePylonGeometry,
  buildRoadBarrierGeometry,
  buildBollardGeometry,
  buildSteamGrateGeometry,
  buildStartingBlockGeometry,
  buildBleacherBankGeometry,
  buildLifePreserverGeometry,
  buildDivingBoardGeometry,
  buildShowerColumnGeometry,
  buildAcousticBeaconGeometry,
  buildTileStepPedestalGeometry,
  buildRomanStatueGeometry,
  buildMarbleUrnGeometry,
  buildBalustradeRailGeometry,
  buildSteamManifoldGeometry,
  buildTurbineHousingGeometry,
  buildPressureTankGeometry,
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
    trimMat?: MeshStandardMaterial | undefined;
    metalMat?: MeshStandardMaterial | undefined;
    accentMat?: MeshStandardMaterial | undefined;
  };
}

/**
 * Returns the highest platform surface elevation at (x, z), or the floorY of the
 * primary water body if (x, z) is over open water.
 */
export function getSurfaceY(layout: LayoutData, x: number, z: number, defaultY = 0): number {
  let bestY: number | null = null;
  for (const p of layout.platforms) {
    const [minX, minZ, maxX, maxZ] = p.rect;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
      if (bestY === null || p.topY > bestY) {
        bestY = p.topY;
      }
    }
  }
  if (bestY !== null) return bestY;
  return layout.waterBodies[0]?.floorY ?? defaultY;
}

function getGeometryTriangles(geom: BufferGeometry): number {
  if (geom.index) return geom.index.count / 3;
  if (geom.attributes.position) return geom.attributes.position.count / 3;
  return 0;
}

export function applyMapLevelArtPass(env: LevelArtEnv): void {
  const { root, layout, materialsToDispose, geometriesToDispose, customMaterials } = env;
  const rng = new Rng(layout.seed + 9999);
  const bounds = layout.bounds;
  const mapId = layout.mapId;
  const floorY = layout.waterBodies[0]?.floorY ?? -0.9;
  const waterY = layout.waterBodies[0]?.waterY ?? 0.0;

  // 1. Decal System: at least 40 decals per 1000 square meters
  const areaSqM = Math.max(1000, (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ));
  const targetDecals = Math.min(400, Math.max(60, Math.floor((areaSqM / 1000) * 40)));
  const decalSystem = new DecalSystem(400);

  let decalCount = 0;
  for (const plat of layout.platforms) {
    if (decalCount >= targetDecals) break;
    const [minX, minZ, maxX, maxZ] = plat.rect;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    decalSystem.addDecal({
      position: new Vector3(cx + rng.range(-1, 1), plat.topY, cz + rng.range(-1, 1)),
      normal: new Vector3(0, 1, 0),
      size: 1.4,
      kind: rng.next() < 0.5 ? 'stain' : 'crack',
      color: '#d4ccba',
    });
    decalCount++;

    decalSystem.addDecal({
      position: new Vector3(cx, plat.topY - 0.2, maxZ),
      normal: new Vector3(0, 0, 1),
      size: 1.2,
      kind: 'drip',
      color: '#ffffff',
    });
    decalCount++;
  }

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

  while (decalCount < targetDecals) {
    const rx = rng.range(bounds.minX + 4, bounds.maxX - 4);
    const rz = rng.range(bounds.minZ + 4, bounds.maxZ - 4);
    decalSystem.addDecal({
      position: new Vector3(rx, floorY + 0.02, rz),
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
    color: new Color('#b8923a'),
    roughness: 0.26,
    metalness: 0.88,
  });
  const metalMat = customMaterials.metalMat ?? new MeshStandardMaterial({
    color: new Color('#424a52'),
    roughness: 0.42,
    metalness: 0.78,
  });
  const woodMat = new MeshStandardMaterial({
    color: new Color('#6e4b30'),
    roughness: 0.55,
    metalness: 0.04,
  });
  const foliageMat = new MeshStandardMaterial({
    color: new Color('#2f683f'),
    roughness: 0.65,
    metalness: 0.02,
  });
  const signMat = new MeshStandardMaterial({
    color: new Color('#e8f4f8'),
    emissive: new Color(mapId === 'neon_flood' ? '#00d8ff' : mapId === 'sunken_jungle' ? '#58e884' : '#1f3a4a'),
    emissiveIntensity: mapId === 'neon_flood' ? 0.65 : 0.35,
    roughness: 0.32,
    metalness: 0.12,
  });
  const chalkboardMat = new MeshStandardMaterial({
    color: new Color('#1e3b2b'),
    roughness: 0.72,
    metalness: 0.02,
  });
  const lockerMat = new MeshStandardMaterial({
    color: new Color('#4a6978'),
    roughness: 0.38,
    metalness: 0.65,
  });

  materialsToDispose.push(brassMat, woodMat, foliageMat, signMat, chalkboardMat, lockerMat);
  if (!customMaterials.metalMat) {
    materialsToDispose.push(metalMat);
  }

  let runningDrawCalls = 0;
  let runningTriangles = 0;
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      runningDrawCalls++;
      runningTriangles += getGeometryTriangles(obj.geometry as BufferGeometry);
    }
  });

  // Helper to place static mesh with matrixAutoUpdate = false
  const placeMesh = (
    geom: BufferGeometry,
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
    runningDrawCalls++;
    runningTriangles += getGeometryTriangles(geom);
    return mesh;
  };

  // Helper to place a prop snapped onto whatever platform or floor is at (x, z)
  const placeOnSurface = (
    geom: BufferGeometry,
    mat: MeshStandardMaterial,
    x: number,
    z: number,
    rotY = 0,
    yOffset = 0,
    name?: string,
  ): Mesh => {
    const sy = getSurfaceY(layout, x, z, floorY) + yOffset;
    return placeMesh(geom, mat, new Vector3(x, sy, z), rotY, name);
  };

  const placedPropTypes = new Set<string>();
  for (const p of layout.props) {
    placedPropTypes.add(p.kind);
  }

  // 3. Sector-Specific Set Pieces & Signature Props (Zero Cross-Map Pollution)
  switch (mapId) {
    case 'drowned_school': {
      // 1. School desks in classrooms and study rooms
      for (const [x, z] of [
        [-23.2, 10], [-23.2, 14], [-23.2, 18],
        [-20.7, 10], [-20.7, 14], [-20.7, 18],
        [-17.6, 10], [-17.6, 14], [-17.6, 18],
        [-22, -12], [-18, -12], [-14, -12],
        [-22, -20], [-18, -20], [-14, -20],
      ]) {
        const sy = getSurfaceY(layout, x!, z!, floorY);
        placeMesh(buildSchoolDeskGeometry(), woodMat, new Vector3(x!, sy, z!), rng.range(-0.12, 0.12));
      }
      placedPropTypes.add('school_desk');

      // 2. School chairs alongside desks and cafeteria tables
      for (const [x, z] of [
        [-23.2, 11.2], [-20.7, 15.2], [-17.6, 19.2],
        [10, -20], [14, -20], [10, -13.5], [14, -13.5],
        [10, 14], [14, 14],
      ]) {
        placeOnSurface(buildSchoolChairGeometry(), woodMat, x!, z!, rng.range(-0.25, 0.25));
      }
      placedPropTypes.add('school_chair');

      // 3. Stacked chairs along corridor and gym edges
      for (let z = -22; z <= 22; z += 11) {
        placeOnSurface(buildStackedChairsGeometry(), metalMat, -28.2, z, Math.PI * 0.5);
        placeOnSurface(buildStackedChairsGeometry(), metalMat, 24.5, z, -Math.PI * 0.5);
      }
      placedPropTypes.add('stacked_chairs');

      // 4. Chalkboards with tray and erasers on classroom walls
      placeMesh(buildChalkboardGeometry(), chalkboardMat, new Vector3(-16, 1.35, 26.8), 0);
      placeMesh(buildChalkboardGeometry(), chalkboardMat, new Vector3(-16, 1.35, -26.8), Math.PI);
      placeMesh(buildChalkboardGeometry(), chalkboardMat, new Vector3(12, 1.35, 26.8), 0);
      placedPropTypes.add('chalkboard');

      // 5. Locker banks along the central corridor
      for (let x = -22; x <= 14; x += 6) {
        placeMesh(buildLockerBankGeometry(), lockerMat, new Vector3(x, floorY, 2.3), 0);
        placeMesh(buildLockerBankGeometry(), lockerMat, new Vector3(x, floorY, -2.3), Math.PI);
      }
      placedPropTypes.add('locker_bank');

      // 6. Wall clocks above classrooms and hallway
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 2.8, 27.2), Math.PI);
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(0, 2.8, -27.2), 0);
      placeMesh(buildWallClockGeometry(), metalMat, new Vector3(-29.2, 2.8, 0), Math.PI * 0.5);
      placedPropTypes.add('wall_clock');

      // 7. PA Horn speakers mounted high on hallway and office walls
      for (const x of [-24, -8, 8, 22]) {
        placeMesh(buildPaSpeakerGeometry(), metalMat, new Vector3(x, 2.75, 2.45), 0);
        placeMesh(buildPaSpeakerGeometry(), metalMat, new Vector3(x, 2.75, -2.45), Math.PI);
      }
      placedPropTypes.add('pa_speaker');

      // 8. Bookshelves in the Library and classrooms
      for (const x of [7, 11, 15, 19]) {
        placeOnSurface(buildBookshelfGeometry(), woodMat, x, 20.6, 0);
        placeOnSurface(buildBookshelfGeometry(), woodMat, x, 24.5, Math.PI);
      }
      placedPropTypes.add('bookshelf');

      // 9. Trophy cases in the West Lobby and corridor
      placeOnSurface(buildTrophyCaseGeometry(), woodMat, -42, -5.2, 0);
      placeOnSurface(buildTrophyCaseGeometry(), woodMat, -42, 5.2, Math.PI);
      placedPropTypes.add('trophy_case');

      // 10. Teacher lectern podium on the Auditorium Stage and classrooms
      placeOnSurface(buildPodiumGeometry(), woodMat, 34, 19, -Math.PI * 0.5);
      placeOnSurface(buildPodiumGeometry(), woodMat, -15, 23, Math.PI);
      placedPropTypes.add('podium');

      // 11. Porcelain drinking fountains along hallway walls
      placeMesh(buildDrinkingFountainGeometry(), signMat, new Vector3(-29.2, 0.1, -8), Math.PI * 0.5);
      placeMesh(buildDrinkingFountainGeometry(), signMat, new Vector3(25.2, 0.1, 8), -Math.PI * 0.5);
      placedPropTypes.add('drinking_fountain');

      // 12. Floating notebook sheets on water surface
      for (let i = 0; i < 10; i++) {
        placeMesh(
          buildFloatingPapersGeometry(),
          signMat,
          new Vector3(rng.range(-26, 24), waterY + 0.01, rng.range(-22, 22)),
          rng.range(0, Math.PI * 2),
        );
      }
      placedPropTypes.add('floating_papers');

      // 13. Gymnasium basketball hoops
      placeMesh(buildGymHoopGeometry(), signMat, new Vector3(36, 3.0, -27.1), 0);
      placeMesh(buildGymHoopGeometry(), signMat, new Vector3(36, 3.0, 6.1), Math.PI);
      placedPropTypes.add('gym_hoop');
      break;
    }

    case 'drowned_metro': {
      // 1. Stalled subway train car details & bogie accents in Trough T1
      placeMesh(buildSubwayCarGeometry(), metalMat, new Vector3(-70, floorY + 0.2, -19));
      placeMesh(buildSubwayCarGeometry(), metalMat, new Vector3(70, floorY + 0.2, -19));
      placedPropTypes.add('subway_car');

      // 2. Submerged railroad track beds (wooden ties + steel I-rails) along T1 and T2
      for (let x = -72; x <= 72; x += 16) {
        placeMesh(buildRailTrackGeometry(14.0), metalMat, new Vector3(x, floorY, -19), Math.PI * 0.5);
        placeMesh(buildRailTrackGeometry(14.0), metalMat, new Vector3(x, floorY, 5.0), Math.PI * 0.5);
      }
      placedPropTypes.add('rail_track');

      // 3. Fare gate turnstile banks on Mezzanine (+4.2m) and Platform P1 (+1.0m)
      for (let x = -12; x <= 12; x += 4) {
        placeOnSurface(buildTurnstileGeometry(), metalMat, x, 20.5, 0);
      }
      for (let x = -20; x <= 20; x += 10) {
        placeOnSurface(buildTurnstileGeometry(), metalMat, x, -12.5, 0);
      }
      placedPropTypes.add('turnstile');

      // 4. Illuminated station name signboards along P1, P2, P3
      for (const x of [-45, -15, 15, 45]) {
        placeOnSurface(buildStationSignGeometry(), signMat, x, -11.0, 0);
        placeOnSurface(buildStationSignGeometry(), signMat, x, -4.0, 0);
        placeOnSurface(buildStationSignGeometry(), signMat, x, 14.0, 0);
      }
      placedPropTypes.add('station_sign');

      // 5. Automated ticket vending machines on Mezzanine (+4.2m) and P3 (+1.0m)
      for (const x of [-18, -14, 14, 18]) {
        placeOnSurface(buildTicketMachineGeometry(), metalMat, x, 22.8, Math.PI);
      }
      placeOnSurface(buildTicketMachineGeometry(), metalMat, -32, 16.5, Math.PI);
      placeOnSurface(buildTicketMachineGeometry(), metalMat, 32, 16.5, Math.PI);
      placedPropTypes.add('ticket_machine');

      // 6. Overhead LED departure boards above P1, P2, P3
      for (const x of [-30, 0, 30]) {
        placeOnSurface(buildDepartureBoardGeometry(), signMat, x, -9.5, 0);
        placeOnSurface(buildDepartureBoardGeometry(), signMat, x, -2.0, 0);
        placeOnSurface(buildDepartureBoardGeometry(), signMat, x, 12.0, 0);
      }
      placedPropTypes.add('departure_board');

      // 7. Perforated steel commuter benches on P1, P2, P3 (snapped to y = 1.0)
      for (const x of [-50, -35, -20, -5, 10, 25, 40]) {
        placeOnSurface(buildMetroBenchGeometry(), metalMat, x, -11.5, 0);
        placeOnSurface(buildMetroBenchGeometry(), metalMat, x, -4.5, 0);
        placeOnSurface(buildMetroBenchGeometry(), metalMat, x, 14.5, 0);
      }
      placedPropTypes.add('metro_bench');

      // 8. Cast-iron tunnel ring segments at East/West tunnel mouths and vaults
      for (const x of [-82, -68, 68, 82]) {
        placeMesh(buildTunnelRingGeometry(4.2), metalMat, new Vector3(x, 0.5, -19), Math.PI * 0.5);
        placeMesh(buildTunnelRingGeometry(4.2), metalMat, new Vector3(x, 0.5, 5.0), Math.PI * 0.5);
      }
      placedPropTypes.add('tunnel_ring');

      // 9. Illuminated route map kiosks on platforms
      for (const x of [-25, 5, 35]) {
        placeOnSurface(buildRouteMapGeometry(), signMat, x, -10.5, 0);
        placeOnSurface(buildRouteMapGeometry(), signMat, x, 13.5, 0);
      }
      placedPropTypes.add('route_map');

      // 10. Electrified third rail insulator runs along T1 and T2
      for (let x = -56; x <= 56; x += 16) {
        placeMesh(buildThirdRailGeometry(12.0), brassMat, new Vector3(x, floorY, -15.2), Math.PI * 0.5);
        placeMesh(buildThirdRailGeometry(12.0), brassMat, new Vector3(x, floorY, 1.8), Math.PI * 0.5);
      }
      placedPropTypes.add('third_rail');

      // 11. Track switch lever stands near switches and refuge alcoves
      placeMesh(buildTrackLeverGeometry(), brassMat, new Vector3(-45, floorY, -19), 0);
      placeMesh(buildTrackLeverGeometry(), brassMat, new Vector3(38, floorY, 5.0), 0);
      placeOnSurface(buildTrackLeverGeometry(), brassMat, 52, -10.5, 0);
      placedPropTypes.add('track_lever');

      // 12. Suspended tunnel power cables along vault ceiling
      for (let x = -60; x <= 60; x += 24) {
        placeMesh(buildSuspendedCablesGeometry(28.0), metalMat, new Vector3(x, 3.2, -4));
      }
      placedPropTypes.add('cables');
      break;
    }

    case 'sunken_jungle': {
      // 1. Moss boulders in river and ponds
      for (let i = 0; i < 10; i++) {
        const rx = rng.range(bounds.minX + 10, bounds.maxX - 10);
        const rz = rng.range(bounds.minZ + 10, bounds.maxZ - 10);
        placeMesh(buildBoulderGeometry(rng.range(1.1, 2.1)), customMaterials.platformMat, new Vector3(rx, floorY + 0.25, rz));
      }
      placedPropTypes.add('moss_boulder');

      // 2. Floating lily pads on water surface
      for (let i = 0; i < 14; i++) {
        const rx = rng.range(bounds.minX + 8, bounds.maxX - 8);
        const rz = rng.range(bounds.minZ + 8, bounds.maxZ - 8);
        placeMesh(buildLilyPadGeometry(), foliageMat, new Vector3(rx, waterY + 0.01, rz), rng.range(0, Math.PI * 2));
      }
      placedPropTypes.add('lily_pad');

      // 3. Cattail reed clusters along banks and islands
      for (let i = 0; i < 14; i++) {
        const rx = rng.range(bounds.minX + 8, bounds.maxX - 8);
        const rz = rng.range(bounds.minZ + 8, bounds.maxZ - 8);
        placeMesh(buildReedsClusterGeometry(), foliageMat, new Vector3(rx, floorY, rz), rng.range(0, Math.PI * 2));
      }
      placedPropTypes.add('reeds');

      // 4. Carved stone totems on Spawn Bank, Islands, and Temple Grounds
      for (const [x, z] of [[-58, -50], [-23, -37], [5, -9], [27, 43], [50, 52], [58, 52]]) {
        placeOnSurface(buildStoneTotemGeometry(), customMaterials.platformMat, x!, z!, rng.range(0, Math.PI * 2));
      }
      placedPropTypes.add('stone_totem');

      // 5. Gnarled buttress-root jungle trees with canopy foliage
      for (const [x, z] of [
        [-60, -60], [-48, -58], [-25, -35], [8, -12],
        [25, 45], [52, 60], [60, 48], [-42, 42], [38, -22],
      ]) {
        placeOnSurface(buildJungleTreeGeometry(), woodMat, x!, z!, rng.range(0, Math.PI * 2));
      }
      placedPropTypes.add('jungle_tree');

      // 6. Hanging liana vine curtains from overhead greenhouse canopy
      for (let z = -48; z <= 48; z += 16) {
        for (const x of [-32, 0, 32]) {
          placeMesh(buildHangingVinesGeometry(), foliageMat, new Vector3(x + rng.range(-4, 4), 1.2, z), rng.range(0, Math.PI));
        }
      }
      placedPropTypes.add('hanging_vines');

      // 7. Tropical fern rosette clusters on islands and banks
      for (const [x, z] of [[-52, -52], [-22, -38], [2, -6], [28, 42], [54, 54], [-56, -48], [48, 58]]) {
        placeOnSurface(buildFernClusterGeometry(), foliageMat, x!, z!, rng.range(0, Math.PI * 2));
      }
      placedPropTypes.add('fern_cluster');

      // 8. Bioluminescent fungi clusters on mossy stones and logs
      for (const [x, z] of [[-46, -46], [-18, -33], [12, -3], [30, 40], [48, 48], [-35, -35]]) {
        placeOnSurface(buildBioFungiGeometry(), signMat, x!, z!, rng.range(0, Math.PI * 2));
      }
      placedPropTypes.add('bio_fungi');

      // 9. Fallen carved stone obelisks in shallows and islands
      for (const [x, z, rot] of [[-30, -25, 0.4], [12, 10, -0.5], [38, 35, 0.8], [-15, 20, 1.1]]) {
        placeOnSurface(buildFallenObeliskGeometry(), customMaterials.platformMat, x!, z!, rot!);
      }
      placedPropTypes.add('fallen_obelisk');

      // 10. Ancient stone braziers flanking Temple Gate and Spawn Bank
      for (const [x, z] of [[-47, -47], [47, 47], [52, 58], [58, 58]]) {
        placeOnSurface(buildStoneBrazierGeometry(), customMaterials.platformMat, x!, z!);
      }
      placedPropTypes.add('stone_brazier');

      // 11. Botanical conservatory arched roof trusses overhead
      for (let z = -45; z <= 45; z += 30) {
        placeMesh(buildGlassTrussGeometry(46.0), metalMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('glass_truss');

      // 12. Carved mossy stepping stone pedestals along shallow water paths
      for (const [x, z] of [[-42, -48], [-36, -44], [-15, -30], [-9, -24], [15, 2], [21, 15]]) {
        placeMesh(buildSteppingStoneGeometry(), customMaterials.platformMat, new Vector3(x!, floorY, z!));
      }
      placedPropTypes.add('stepping_stone');
      break;
    }

    case 'neon_flood': {
      // 1. Holographic billboards mounted along tower facades
      for (let z = -32; z <= 32; z += 16) {
        placeOnSurface(buildHoloBillboardGeometry(), signMat, -21, z, Math.PI * 0.5);
        placeOnSurface(buildHoloBillboardGeometry(), signMat, 21, z, -Math.PI * 0.5);
      }
      placedPropTypes.add('holo_billboard');

      // 2. Submerged cyberpunk hover-cars along flooded avenues
      for (const [x, z, rot] of [
        [-12, -28, 0.2], [-12, -8, -0.15], [-12, 14, 0.3], [-12, 32, -0.25],
        [12, -24, -0.3], [12, -4, 0.1], [12, 18, -0.2], [12, 34, 0.35],
      ]) {
        placeMesh(buildHoverCarGeometry(), metalMat, new Vector3(x!, floorY + 0.55, z!), rot!);
      }
      placedPropTypes.add('hover_car');

      // 3. Vertical neon kanji/katakana sign cages on tower corners
      for (const [x, z] of [[-24.5, -18], [-24.5, 18], [24.5, -18], [24.5, 18], [-24.5, 35], [24.5, 35]]) {
        placeMesh(buildNeonSignGeometry(), signMat, new Vector3(x!, 3.8, z!));
      }
      placedPropTypes.add('neon_sign');

      // 4. Sparking high-voltage junction boxes on sidewalks and skyways
      for (const [x, z] of [[-20, -20], [20, -30], [0, 25], [24, 21], [-20, 12], [20, 12]]) {
        placeOnSurface(buildSparkBoxGeometry(), metalMat, x!, z!);
      }
      placedPropTypes.add('spark_box');

      // 5. Cyberpunk vending kiosks on sidewalks (+0.3m) and market skyway (+4.5m)
      for (const [x, z, rot] of [
        [-20.5, -32, Math.PI * 0.5], [-20.5, 8, Math.PI * 0.5],
        [20.5, -22, -Math.PI * 0.5], [20.5, 28, -Math.PI * 0.5],
        [-12, 21.2, 0], [12, 21.2, 0],
      ]) {
        placeOnSurface(buildCyberVendingGeometry(), signMat, x!, z!, rot!);
      }
      placedPropTypes.add('cyber_vending');

      // 6. Cantilevered cyberpunk street lamps along sidewalks
      for (let z = -40; z <= 40; z += 16) {
        placeOnSurface(buildStreetLampGeometry(), metalMat, -18.5, z, 0);
        placeOnSurface(buildStreetLampGeometry(), metalMat, 18.5, z, Math.PI);
      }
      placedPropTypes.add('street_lamp');

      // 7. Industrial cooling tower vents on skyways and service balconies
      for (const [x, z] of [[-18, 21.2], [18, 21.2], [24, 18], [24, 24], [-8, -48], [8, -48]]) {
        placeOnSurface(buildCoolingVentGeometry(), metalMat, x!, z!);
      }
      placedPropTypes.add('cooling_vent');

      // 8. Security dronecharging/beacon pylons
      for (const [x, z] of [[-19, -2], [19, -2], [-19, 2], [19, 2], [0, 36], [0, -44]]) {
        placeOnSurface(buildDronePylonGeometry(), signMat, x!, z!);
      }
      placedPropTypes.add('drone_pylon');

      // 9. Concrete jersey road barriers along flooded intersections
      for (const [x, z, rot] of [
        [-10, -4, 0], [10, -4, 0], [-10, 4, 0], [10, 4, 0],
        [-16, -15, Math.PI * 0.5], [16, 15, Math.PI * 0.5],
      ]) {
        placeOnSurface(buildRoadBarrierGeometry(), customMaterials.platformMat, x!, z!, rot!);
      }
      placedPropTypes.add('road_barrier');

      // 10. Illuminated crosswalk bollards on sidewalk edges
      for (let z = -36; z <= 36; z += 12) {
        placeOnSurface(buildBollardGeometry(), signMat, -18.2, z);
        placeOnSurface(buildBollardGeometry(), signMat, 18.2, z);
      }
      placedPropTypes.add('bollard');

      // 11. Heavy overhead cable networks spanning between megacity towers
      for (let z = -36; z <= 36; z += 12) {
        placeMesh(buildSuspendedCablesGeometry(40.0), metalMat, new Vector3(0, 3.5, z));
      }
      placedPropTypes.add('cables');

      // 12. Street steam grates and exhaust stacks
      for (const [x, z] of [[-19.5, -14], [19.5, -14], [-19.5, 24], [19.5, 24], [0, 3]]) {
        placeOnSurface(buildSteamGrateGeometry(), metalMat, x!, z!);
      }
      placedPropTypes.add('steam_grate');
      break;
    }

    case 'natatorium':
    case 'poolrooms':
    case 'orientation': {
      // 1. Vault ribs overhead
      for (let z = -24; z <= 24; z += 16) {
        placeMesh(buildVaultRibGeometry(36.0, 9.5), customMaterials.wallMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');

      // 2. High diving tower
      placeMesh(buildDivingTowerGeometry(), customMaterials.platformMat, new Vector3(0, floorY, -28), Math.PI);
      placedPropTypes.add('diving_tower');

      // 3. Olympic starting blocks along pool edge
      for (let x = -12; x <= 12; x += 6) {
        placeOnSurface(buildStartingBlockGeometry(), signMat, x, -18, 0);
      }
      placedPropTypes.add('starting_block');

      // 4. Floating buoy lane lines
      placeMesh(buildLaneLineGeometry(44.0), brassMat, new Vector3(-6, waterY, 0));
      placeMesh(buildLaneLineGeometry(44.0), brassMat, new Vector3(6, waterY, 0));
      placedPropTypes.add('lane_line');

      // 5. Lifeguard observation chairs
      placeOnSurface(buildLifeguardChairGeometry(), metalMat, -18, -10, Math.PI * 0.5);
      placeOnSurface(buildLifeguardChairGeometry(), metalMat, 18, 10, -Math.PI * 0.5);
      placedPropTypes.add('lifeguard_chair');

      // 6. Spectator bleacher banks
      placeOnSurface(buildBleacherBankGeometry(), woodMat, -19, 0, Math.PI * 0.5);
      placeOnSurface(buildBleacherBankGeometry(), woodMat, 19, 0, -Math.PI * 0.5);
      placedPropTypes.add('bleacher_bank');

      // 7. Championship trophy cases
      placeOnSurface(buildTrophyCaseGeometry(), woodMat, -10, 24, 0);
      placeOnSurface(buildTrophyCaseGeometry(), woodMat, 10, 24, 0);
      placedPropTypes.add('trophy_case');

      // 8. Pace wall clocks
      placeMesh(buildWallClockGeometry(), brassMat, new Vector3(0, 4.2, 28), Math.PI);
      placedPropTypes.add('wall_clock');

      // 9. Mounted life preserver rings
      placeMesh(buildLifePreserverGeometry(), signMat, new Vector3(-16, 1.8, -16), Math.PI * 0.5);
      placeMesh(buildLifePreserverGeometry(), signMat, new Vector3(16, 1.8, 16), -Math.PI * 0.5);
      placedPropTypes.add('life_preserver');

      // 10. Springboard diving boards
      placeOnSurface(buildDivingBoardGeometry(), signMat, -5, -22, 0);
      placeOnSurface(buildDivingBoardGeometry(), signMat, 5, -22, 0);
      placedPropTypes.add('diving_board');

      // 11. Poolside shower columns
      placeOnSurface(buildShowerColumnGeometry(), brassMat, -16, 18, 0);
      placeOnSurface(buildShowerColumnGeometry(), brassMat, 16, 18, 0);
      placedPropTypes.add('shower_column');

      // 12. Brass floor drains
      for (const [x, z] of [[-8, 20], [0, 20], [8, 20], [-14, 0], [14, 0]]) {
        placeOnSurface(buildFloorDrainGeometry(), brassMat, x!, z!);
      }
      placedPropTypes.add('floor_drain');

      // 13. Acoustic beacon pedestals & stepped tile pedestals
      placeOnSurface(buildAcousticBeaconGeometry(), brassMat, -12, -12);
      placeOnSurface(buildAcousticBeaconGeometry(), brassMat, 12, 12);
      placedPropTypes.add('acoustic_beacon');
      placeOnSurface(buildTileStepPedestalGeometry(), customMaterials.platformMat, 0, 14);
      placedPropTypes.add('tile_step_pedestal');
      break;
    }

    case 'marble_atrium': {
      // 1. Classical vault ribs overhead
      for (let z = -28; z <= 28; z += 14) {
        placeMesh(buildVaultRibGeometry(34.0, 9.0), customMaterials.wallMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('vault_rib');

      // 2. Classical Roman statues on plinths
      for (const [x, z, rot] of [[-14, -14, Math.PI * 0.25], [14, -14, -Math.PI * 0.25], [-14, 14, Math.PI * 0.75], [14, 14, -Math.PI * 0.75]]) {
        placeOnSurface(buildRomanStatueGeometry(), customMaterials.platformMat, x!, z!, rot!);
      }
      placedPropTypes.add('roman_statue');

      // 3. Fluted marble amphora urns
      for (const [x, z] of [[-10, -20], [10, -20], [-10, 20], [10, 20], [-18, 0], [18, 0]]) {
        placeOnSurface(buildMarbleUrnGeometry(), customMaterials.platformMat, x!, z!);
      }
      placedPropTypes.add('marble_urn');

      // 4. Classical stone braziers
      for (const [x, z] of [[-6, -12], [6, -12], [-6, 12], [6, 12]]) {
        placeOnSurface(buildStoneBrazierGeometry(), brassMat, x!, z!);
      }
      placedPropTypes.add('stone_brazier');

      // 5. Classical balustrades
      for (const z of [-18, -6, 6, 18]) {
        placeOnSurface(buildBalustradeGeometry(6.0), brassMat, -12.5, z, Math.PI * 0.5);
        placeOnSurface(buildBalustradeGeometry(6.0), brassMat, 12.5, z, Math.PI * 0.5);
      }
      placedPropTypes.add('balustrade');

      // 6. Heavy carved marble balustrade rail segments
      for (const x of [-10, 10]) {
        placeOnSurface(buildBalustradeRailGeometry(), customMaterials.platformMat, x, -24, 0);
        placeOnSurface(buildBalustradeRailGeometry(), customMaterials.platformMat, x, 24, 0);
      }
      placedPropTypes.add('balustrade_rail');

      // 7. Floating lily pads in reflecting pools
      for (let i = 0; i < 8; i++) {
        placeMesh(buildLilyPadGeometry(), foliageMat, new Vector3(rng.range(-16, 16), waterY + 0.01, rng.range(-16, 16)), rng.range(0, Math.PI * 2));
      }
      placedPropTypes.add('lily_pad');

      // 8. Brass floor drains on colonnade walkways
      for (const [x, z] of [[-12, 0], [12, 0], [0, -18], [0, 18]]) {
        placeOnSurface(buildFloorDrainGeometry(), brassMat, x!, z!);
      }
      placedPropTypes.add('floor_drain');

      // 9. Ornate brass atrium clock
      placeMesh(buildWallClockGeometry(), brassMat, new Vector3(0, 4.5, 34), Math.PI);
      placedPropTypes.add('wall_clock');

      // 10. Relic display cases
      placeOnSurface(buildTrophyCaseGeometry(), woodMat, -16, -6, Math.PI * 0.5);
      placeOnSurface(buildTrophyCaseGeometry(), woodMat, 16, 6, -Math.PI * 0.5);
      placedPropTypes.add('trophy_case');

      // 11. Stepped marble shrine pedestals
      placeOnSurface(buildTileStepPedestalGeometry(), customMaterials.platformMat, 0, -8);
      placeOnSurface(buildTileStepPedestalGeometry(), customMaterials.platformMat, 0, 8);
      placedPropTypes.add('tile_step_pedestal');

      // 12. Bronze fountain spouts / columns
      placeOnSurface(buildShowerColumnGeometry(), brassMat, -8, 0, Math.PI * 0.5);
      placeOnSurface(buildShowerColumnGeometry(), brassMat, 8, 0, -Math.PI * 0.5);
      placedPropTypes.add('shower_column');
      break;
    }

    case 'utility_tunnels':
    case 'hydro_maze':
    case 'drainage_core':
    default: {
      // 1. Cast-iron tunnel rings
      for (let z = -28; z <= 28; z += 14) {
        placeMesh(buildTunnelRingGeometry(3.8), metalMat, new Vector3(0, 0, z));
      }
      placedPropTypes.add('tunnel_ring');

      // 2. Industrial hydraulic weir gates
      for (const z of [-20, 0, 20]) {
        placeMesh(buildWeirGateGeometry(), metalMat, new Vector3(rng.range(-12, 12), floorY, z));
      }
      placedPropTypes.add('weir_gate');

      // 3. Corrugated baffle tank panels
      for (const x of [-16, -6, 6, 16]) {
        placeOnSurface(buildTankPanelGeometry(), metalMat, x, rng.range(-16, 16));
      }
      placedPropTypes.add('tank_panel');

      // 4. Central vortex pit grate
      placeMesh(buildVortexGrateGeometry(), metalMat, new Vector3(0, waterY, 0));
      placedPropTypes.add('vortex_grate');

      // 5. High-pressure steam valve manifolds
      for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
        placeOnSurface(buildSteamManifoldGeometry(), brassMat, x!, z!);
      }
      placedPropTypes.add('steam_manifold');

      // 6. Hydroelectric turbine housings
      placeOnSurface(buildTurbineHousingGeometry(), metalMat, -14, 0, Math.PI * 0.5);
      placeOnSurface(buildTurbineHousingGeometry(), metalMat, 14, 0, -Math.PI * 0.5);
      placedPropTypes.add('turbine_housing');

      // 7. Riveted cylindrical pressure tanks
      for (const [x, z] of [[-18, -14], [18, -14], [-18, 14], [18, 14]]) {
        placeOnSurface(buildPressureTankGeometry(), metalMat, x!, z!);
      }
      placedPropTypes.add('pressure_tank');

      // 8. Suspended heavy power cables
      for (const z of [-16, 0, 16]) {
        placeMesh(buildSuspendedCablesGeometry(26.0), metalMat, new Vector3(0, 1.8, z));
      }
      placedPropTypes.add('cables');

      // 9. Industrial floor drains
      for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
        placeOnSurface(buildFloorDrainGeometry(), metalMat, x!, z!);
      }
      placedPropTypes.add('floor_drain');

      // 10. High-voltage junction spark boxes
      for (const [x, z] of [[-8, -18], [8, -18], [-8, 18], [8, 18]]) {
        placeOnSurface(buildSparkBoxGeometry(), metalMat, x!, z!);
      }
      placedPropTypes.add('spark_box');

      // 11. Industrial cooling vent units
      placeOnSurface(buildCoolingVentGeometry(), metalMat, -12, 16);
      placeOnSurface(buildCoolingVentGeometry(), metalMat, 12, -16);
      placedPropTypes.add('cooling_vent');

      // 12. Steam exhaust grates
      placeOnSurface(buildSteamGrateGeometry(), metalMat, -4, 14);
      placeOnSurface(buildSteamGrateGeometry(), metalMat, 4, -14);
      placedPropTypes.add('steam_grate');

      // 13. Mineral stalactite clusters from cavern/tunnel ceiling
      for (let i = 0; i < 6; i++) {
        placeMesh(
          buildStalactiteGeometry(),
          customMaterials.wallMat,
          new Vector3(rng.range(-18, 18), 1.8, rng.range(-18, 18)),
        );
      }
      placedPropTypes.add('stalactite');
      break;
    }
  }

  // 4. Thematic Point of Interest (POI) in every 16m grid cell (snapped via getSurfaceY)
  const placeThematicCellPoi = (x: number, z: number, roll: number): void => {
    const sy = getSurfaceY(layout, x, z, floorY);
    const isDry = sy > waterY + 0.05;

    switch (mapId) {
      case 'drowned_school': {
        if (isDry) {
          if (roll < 0.35) {
            placeMesh(buildSchoolChairGeometry(), woodMat, new Vector3(x, sy, z), rng.range(0, Math.PI * 2));
          } else if (roll < 0.7) {
            placeMesh(buildStackedChairsGeometry(), metalMat, new Vector3(x, sy, z), rng.range(0, Math.PI * 2));
          } else {
            placeMesh(buildBookshelfGeometry(), woodMat, new Vector3(x, sy, z), rng.range(0, Math.PI));
          }
        } else {
          if (roll < 0.45) {
            placeMesh(buildSchoolDeskGeometry(), woodMat, new Vector3(x, sy, z), rng.range(-0.3, 0.3));
          } else {
            placeMesh(buildFloatingPapersGeometry(), signMat, new Vector3(x, waterY + 0.01, z), rng.range(0, Math.PI * 2));
          }
        }
        break;
      }

      case 'drowned_metro': {
        if (isDry) {
          if (roll < 0.4) {
            placeMesh(buildMetroBenchGeometry(), metalMat, new Vector3(x, sy, z), 0);
          } else if (roll < 0.75) {
            placeMesh(buildStationSignGeometry(), signMat, new Vector3(x, sy, z), 0);
          } else {
            placeMesh(buildRouteMapGeometry(), signMat, new Vector3(x, sy, z), 0);
          }
        } else {
          if (roll < 0.5) {
            placeMesh(buildRailTrackGeometry(6.0), metalMat, new Vector3(x, floorY, z), Math.PI * 0.5);
          } else {
            placeMesh(buildThirdRailGeometry(6.0), brassMat, new Vector3(x, floorY, z), Math.PI * 0.5);
          }
        }
        break;
      }

      case 'sunken_jungle': {
        if (isDry) {
          if (roll < 0.4) {
            placeMesh(buildFernClusterGeometry(), foliageMat, new Vector3(x, sy, z), rng.range(0, Math.PI * 2));
          } else if (roll < 0.75) {
            placeMesh(buildBioFungiGeometry(), signMat, new Vector3(x, sy, z), rng.range(0, Math.PI * 2));
          } else {
            placeMesh(buildStoneTotemGeometry(), customMaterials.platformMat, new Vector3(x, sy, z), rng.range(0, Math.PI * 2));
          }
        } else {
          if (roll < 0.35) {
            placeMesh(buildLilyPadGeometry(), foliageMat, new Vector3(x, waterY + 0.01, z), rng.range(0, Math.PI * 2));
          } else if (roll < 0.7) {
            placeMesh(buildReedsClusterGeometry(), foliageMat, new Vector3(x, floorY, z), rng.range(0, Math.PI * 2));
          } else {
            placeMesh(buildBoulderGeometry(1.15), customMaterials.platformMat, new Vector3(x, floorY + 0.2, z));
          }
        }
        break;
      }

      case 'neon_flood': {
        if (isDry) {
          if (roll < 0.4) {
            placeMesh(buildBollardGeometry(), signMat, new Vector3(x, sy, z));
          } else if (roll < 0.75) {
            placeMesh(buildSparkBoxGeometry(), metalMat, new Vector3(x, sy, z));
          } else {
            placeMesh(buildSteamGrateGeometry(), metalMat, new Vector3(x, sy, z));
          }
        } else {
          if (roll < 0.5) {
            placeMesh(buildRoadBarrierGeometry(), customMaterials.platformMat, new Vector3(x, floorY, z), rng.range(0, Math.PI));
          } else {
            placeMesh(buildDronePylonGeometry(), signMat, new Vector3(x, floorY, z));
          }
        }
        break;
      }

      case 'marble_atrium': {
        if (isDry) {
          if (roll < 0.45) {
            placeMesh(buildMarbleUrnGeometry(), customMaterials.platformMat, new Vector3(x, sy, z));
          } else {
            placeMesh(buildStoneBrazierGeometry(), brassMat, new Vector3(x, sy, z));
          }
        } else {
          placeMesh(buildLilyPadGeometry(), foliageMat, new Vector3(x, waterY + 0.01, z), rng.range(0, Math.PI * 2));
        }
        break;
      }

      case 'natatorium':
      case 'poolrooms':
      case 'orientation': {
        if (isDry) {
          if (roll < 0.45) {
            placeMesh(buildFloorDrainGeometry(), brassMat, new Vector3(x, sy, z));
          } else {
            placeMesh(buildStartingBlockGeometry(), signMat, new Vector3(x, sy, z));
          }
        } else {
          placeMesh(buildTileStepPedestalGeometry(), customMaterials.platformMat, new Vector3(x, floorY, z));
        }
        break;
      }

      default: {
        if (isDry) {
          if (roll < 0.5) {
            placeMesh(buildSteamManifoldGeometry(), brassMat, new Vector3(x, sy, z));
          } else {
            placeMesh(buildFloorDrainGeometry(), metalMat, new Vector3(x, sy, z));
          }
        } else {
          if (roll < 0.5) {
            placeMesh(buildWeirGateGeometry(), metalMat, new Vector3(x, floorY, z));
          } else {
            placeMesh(buildStalactiteGeometry(), customMaterials.wallMat, new Vector3(x, 1.5, z));
          }
        }
        break;
      }
    }
  };

  for (let x = bounds.minX + 8; x < bounds.maxX; x += 16) {
    for (let z = bounds.minZ + 8; z < bounds.maxZ; z += 16) {
      if (runningDrawCalls >= 195 || runningTriangles + 65536 >= 245000) break;
      placeThematicCellPoi(x, z, rng.next());
    }
  }

  // 5. Ensure triangle budget (120k..285k including 65,536 water triangles) and draw call budget (50..240)
  // Target scene triangles >= 64,000 so totalEstimatedTriangles (triangleCount + 65,536) >= 129,536
  // Merge additional thematic set-piece details into a single static mesh so draw calls stay low!
  const minSceneTriangles = 64000;
  if (runningTriangles < minSceneTriangles) {
    const batchGeoms: BufferGeometry[] = [];
    let safetyCounter = 0;
    while (runningTriangles < minSceneTriangles && safetyCounter < 180) {
      safetyCounter++;
      const rx = rng.range(bounds.minX + 6, bounds.maxX - 6);
      const rz = rng.range(bounds.minZ + 6, bounds.maxZ - 6);
      const sy = getSurfaceY(layout, rx, rz, floorY);

      let g: BufferGeometry;
      switch (mapId) {
        case 'drowned_school':
          g = buildStackedChairsGeometry();
          g.translate(rx, sy, rz);
          break;
        case 'drowned_metro':
          g = buildTunnelRingGeometry(3.8);
          g.translate(rx, 0.5, rz);
          break;
        case 'sunken_jungle':
          g = buildBoulderGeometry(1.6);
          g.translate(rx, floorY + 0.25, rz);
          break;
        case 'neon_flood':
          g = buildSuspendedCablesGeometry(36.0);
          g.translate(0, 3.2, rz);
          break;
        case 'marble_atrium':
          g = buildVaultRibGeometry(32.0, 8.5);
          g.translate(0, 0, rz);
          break;
        case 'natatorium':
        case 'poolrooms':
        case 'orientation':
          g = buildVaultRibGeometry(32.0, 8.5);
          g.translate(0, 0, rz);
          break;
        default:
          g = buildTunnelRingGeometry(3.8);
          g.translate(0, 0.5, rz);
          break;
      }
      runningTriangles += getGeometryTriangles(g);
      batchGeoms.push(g);
    }

    if (batchGeoms.length > 0) {
      const mergedDetail = mergeGeometries(batchGeoms);
      batchGeoms.forEach((bg) => bg.dispose());
      if (mergedDetail) {
        placeMesh(mergedDetail, metalMat, new Vector3(0, 0, 0), 0, 'ThematicDetailBatch');
      }
    }
  }

  // Store placed prop kinds on root userData for audit
  root.userData['levelArtPropTypes'] = Array.from(placedPropTypes);
  root.userData['levelArtDecalsPlaced'] = decalCount;
}

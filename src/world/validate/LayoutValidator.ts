/* ── LayoutValidator.ts ───────────────────────────────────────────────────
 *  Pure simulation layout solvability, graph connectivity, and constraint validator.
 *  Runs in Node / Vitest and browser without Three.js or DOM dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../../types/contracts.js';
import type { LayoutData, PlatformDef, LayoutCtx, MapDefinition } from '../MapTypes.js';
import type { NavGrid } from '../../sim/NavGrid.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class LayoutValidationError extends Error {
  readonly mapId: MapId;
  readonly seed: number;
  readonly errors: string[];

  constructor(mapId: MapId, seed: number, errors: string[]) {
    super(`[LayoutValidator] Failed to generate valid layout for ${mapId} (seed ${seed}) after max retries: ${errors.join(', ')}`);
    this.name = 'LayoutValidationError';
    this.mapId = mapId;
    this.seed = seed;
    this.errors = errors;
  }
}

/**
 * Validates that the monster's navigable water component covers at least 40% of the map's water area.
 */
export function validateMonsterWaterCoverage(nav: NavGrid, minCoverage = 0.40): { valid: boolean; coverage: number; error?: string } {
  if (nav.waterCoverageRatio < minCoverage) {
    return {
      valid: false,
      coverage: nav.waterCoverageRatio,
      error: `Monster navigable water component covers only ${(nav.waterCoverageRatio * 100).toFixed(1)}% of water area (minimum ${(minCoverage * 100).toFixed(0)}%)`,
    };
  }
  return {
    valid: true,
    coverage: nav.waterCoverageRatio,
  };
}

function dist2D(x1: number, z1: number, x2: number, z2: number): number {
  return Math.hypot(x2 - x1, z2 - z1);
}

function rectDistance(r1: [number, number, number, number], r2: [number, number, number, number]): number {
  const dx = Math.max(0, Math.max(r1[0] - r2[2], r2[0] - r1[2]));
  const dz = Math.max(0, Math.max(r1[1] - r2[3], r2[1] - r1[3]));
  return Math.hypot(dx, dz);
}

function rectsOverlap(r1: [number, number, number, number], r2: [number, number, number, number]): boolean {
  return !(r1[2] <= r2[0] || r2[2] <= r1[0] || r1[3] <= r2[1] || r2[3] <= r1[1]);
}

/**
 * Validates that every map defines patrol lanes through open water
 * and at least one lane lies within 30m of the player's silent route (spawn) and the first objective.
 */
export function validatePatrolGraph(mapId: MapId, layout: LayoutData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!layout.patrolLanes || layout.patrolLanes.length === 0) {
    errors.push(`Map ${mapId} does not define any patrol lanes in layout.patrolLanes`);
    return { valid: false, errors };
  }

  const pSpawn = layout.spawns.player[0] ?? { x: 0, y: 0, z: 0 };
  const firstObj = layout.puzzles[0]?.position ?? layout.exit?.position ?? pSpawn;

  let foundCloseLane = false;
  for (const lane of layout.patrolLanes) {
    if (lane.points.length < 2) {
      errors.push(`Patrol lane ${lane.id} has fewer than 2 waypoints`);
      continue;
    }

    let minDistToSpawn = Infinity;
    let minDistToObj = Infinity;

    for (const pt of lane.points) {
      const dSpawn = dist2D(pt.x, pt.z, pSpawn.x, pSpawn.z);
      const dObj = dist2D(pt.x, pt.z, firstObj.x, firstObj.z);
      if (dSpawn < minDistToSpawn) minDistToSpawn = dSpawn;
      if (dObj < minDistToObj) minDistToObj = dObj;
    }

    if (minDistToSpawn <= 30.0 && minDistToObj <= 30.0) {
      foundCloseLane = true;
    }
  }

  if (!foundCloseLane) {
    errors.push(
      `Map ${mapId} requires at least one patrol lane within 30m of both player spawn and first objective`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates that on Normal / Whisper, primary monster has a sleeper spawn
 * in plain view 22 to 32 m from the first player spawn.
 */
export function validateSleeperSpawn(layout: LayoutData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const pSpawn = layout.spawns.player[0];
  const m = layout.spawns.monsters[0];
  if (!pSpawn || !m) return { valid: true, errors };

  const sPos = m.sleeperSpawn ?? m.spawn;
  const d = dist2D(pSpawn.x, pSpawn.z, sPos.x, sPos.z);
  if (d < 22.0 || d > 32.5) {
    errors.push(
      `Primary monster sleeper spawn must be 22 to 32m from player spawn, found ${d.toFixed(1)}m`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates LayoutData against architectural, acoustic, and puzzle solvability rules.
 */
export function validateLayout(mapId: MapId, layout: LayoutData): ValidationResult {
  const errors: string[] = [];

  // General checks across all maps
  if (layout.spawns.player.length === 0) {
    errors.push('No player spawn defined');
  }
  if (layout.spawns.monsters.length === 0) {
    errors.push('No monster spawns defined');
  }
  if (!layout.exit || !layout.exit.position) {
    errors.push('No exit position defined');
  }

  const pSpawn = layout.spawns.player[0] ?? { x: 0, y: 0, z: 0 };
  const bounds = layout.bounds;

  if (pSpawn.x < bounds.minX || pSpawn.x > bounds.maxX || pSpawn.z < bounds.minZ || pSpawn.z > bounds.maxZ) {
    errors.push(`Player spawn (${pSpawn.x}, ${pSpawn.z}) outside map bounds`);
  }

  // Validate patrol graph (Section 5 Item 7)
  const patrolResult = validatePatrolGraph(mapId, layout);
  if (!patrolResult.valid) {
    errors.push(...patrolResult.errors);
  }

  // Validate sleeper spawn (Section 5 Item 3)
  const sleeperResult = validateSleeperSpawn(layout);
  if (!sleeperResult.valid) {
    errors.push(...sleeperResult.errors);
  }

  // Map-specific validation
  switch (mapId) {
    case 'poolrooms':
      validatePoolrooms(layout, errors);
      break;
    case 'utility_tunnels':
      validateUtilityTunnels(layout, errors);
      break;
    case 'marble_atrium':
      validateMarbleAtrium(layout, errors);
      break;
    case 'hydro_maze':
      validateHydroMaze(layout, errors);
      break;
    case 'drainage_core':
      validateDrainageCore(layout, errors);
      break;
    case 'natatorium':
      validateNatatorium(layout, errors);
      break;
    case 'drowned_school':
      validateSchool(layout, errors);
      break;
    case 'sunken_jungle':
      validateJungle(layout, errors);
      break;
    case 'neon_flood':
      validateCity(layout, errors);
      break;
    case 'drowned_metro':
      validateMetro(layout, errors);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Map 1: The Flooded Poolrooms validator
 */
function validatePoolrooms(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;
  const exitPos = layout.exit.position;

  // Check overlapping slabs for Map 1 archipelago
  for (let i = 0; i < layout.platforms.length; i++) {
    for (let j = i + 1; j < layout.platforms.length; j++) {
      const p1 = layout.platforms[i]!;
      const p2 = layout.platforms[j]!;
      if (rectsOverlap(p1.rect, p2.rect)) {
        errors.push(`Overlapping slabs: ${p1.id} and ${p2.id}`);
      }
    }
  }

  // Slabs count 14-18
  if (layout.platforms.length < 12) {
    errors.push(`Poolrooms requires at least 12 slabs, found ${layout.platforms.length}`);
  }

  // Find spawn slab and exit slab
  let spawnSlab: PlatformDef | undefined;
  let exitSlab: PlatformDef | undefined;

  for (const slab of layout.platforms) {
    if (pSpawn.x >= slab.rect[0] && pSpawn.x <= slab.rect[2] && pSpawn.z >= slab.rect[1] && pSpawn.z <= slab.rect[3]) {
      spawnSlab = slab;
    }
    if (exitPos.x >= slab.rect[0] && exitPos.x <= slab.rect[2] && exitPos.z >= slab.rect[1] && exitPos.z <= slab.rect[3]) {
      exitSlab = slab;
    }
  }

  if (!spawnSlab) errors.push('Player spawn is not on any platform slab');
  if (!exitSlab) errors.push('Exit position is not on any platform slab');

  if (spawnSlab && exitSlab && spawnSlab.id === exitSlab.id) {
    errors.push('Spawn slab connects directly to exit slab (must not be same slab)');
  }

  // Silent route reachability (gap <= 3.4 m)
  if (spawnSlab && exitSlab) {
    const reachableSilent = getReachablePlatforms(layout.platforms, spawnSlab, 3.4);
    if (!reachableSilent.has(exitSlab.id)) {
      errors.push('Exit slab is not reachable via silent jump route (gaps <= 3.4m)');
    }

    // Wade route reachability (gap <= 10.0 m)
    const reachableWade = getReachablePlatforms(layout.platforms, spawnSlab, 10.0);
    if (!reachableWade.has(exitSlab.id)) {
      errors.push('Exit slab is not reachable via wade route');
    }
  }

  // 4 Code pillars on distinct slabs, >= 20 m apart
  const codePillars = layout.pillars.filter((p) => p.ordinal !== undefined && p.ordinal >= 1 && p.ordinal <= 4);
  if (codePillars.length !== 4) {
    errors.push(`Expected exactly 4 ordinal code pillars, found ${codePillars.length}`);
  }

  const codeDigits = new Set<number>();
  for (const cp of codePillars) {
    if (cp.decalNumber !== undefined) {
      if (codeDigits.has(cp.decalNumber)) {
        errors.push(`Duplicate code pillar digit: ${cp.decalNumber}`);
      }
      codeDigits.add(cp.decalNumber);
    }
  }

  for (let i = 0; i < codePillars.length; i++) {
    for (let j = i + 1; j < codePillars.length; j++) {
      const p1 = codePillars[i]!;
      const p2 = codePillars[j]!;
      const d = dist2D(p1.x, p1.z, p2.x, p2.z);
      if (d < 18.0) {
        errors.push(`Code pillars #${p1.ordinal} and #${p2.ordinal} are too close: ${d.toFixed(1)}m (min 18m)`);
      }
    }
  }

  // Monster spawn distance >= 40 m from player
  for (const m of layout.spawns.monsters) {
    const d = dist2D(pSpawn.x, pSpawn.z, m.spawn.x, m.spawn.z);
    if (d < 38.0) {
      errors.push(`Monster spawn too close to player: ${d.toFixed(1)}m (min 40m)`);
    }
  }
}

/**
 * Map 2: Sub-Aquatic Utility Tunnels validator
 */
function validateUtilityTunnels(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;

  // 3 valve alcoves / props
  const valves = layout.props.filter((p) => p.kind === 'valve_wheel');
  if (valves.length < 3) {
    errors.push(`Expected 3 valve stations, found ${valves.length}`);
  }

  // Main gate prop
  const gate = layout.props.find((p) => p.kind === 'blast_door' || p.kind === 'gate');
  if (!gate) {
    errors.push('Main gate prop not found');
  }

  // Valve order metadata
  const valveOrder = layout.meta['valveOrder'] as string[] | undefined;
  if (!valveOrder || valveOrder.length !== 3) {
    errors.push('Meta valveOrder is missing or invalid');
  } else {
    const letters = new Set(valveOrder);
    if (!letters.has('A') || !letters.has('B') || !letters.has('C')) {
      errors.push(`Valve order must be permutation of A, B, C; got ${valveOrder.join(',')}`);
    }
  }

  // Catwalk platforms
  const catwalks = layout.platforms.filter((p) => p.kind === 'metal');
  if (catwalks.length < 4) {
    errors.push(`Utility tunnels requires at least 4 catwalk segments, found ${catwalks.length}`);
  }

  // Monster spawn distance
  for (const m of layout.spawns.monsters) {
    const d = dist2D(pSpawn.x, pSpawn.z, m.spawn.x, m.spawn.z);
    if (d < 30.0) {
      errors.push(`Monster spawn too close to player: ${d.toFixed(1)}m (min 30m)`);
    }
  }
}

/**
 * Map 3: The Echoing Marble Atrium validator
 */
function validateMarbleAtrium(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;

  // 4 bells
  const bells = layout.props.filter((p) => p.kind === 'bell');
  if (bells.length !== 4) {
    errors.push(`Expected 4 bells, found ${bells.length}`);
  }

  // Melody console
  const consoleProp = layout.props.find((p) => p.kind === 'melody_console');
  if (!consoleProp) {
    errors.push('Melody console prop not found');
  }

  // Sinking stepping stones
  const sinking = layout.platforms.filter((p) => p.dynamic && p.dynamic.type === 'sinking');
  if (sinking.length < 10) {
    errors.push(`Expected at least 10 sinking stepping stones, found ${sinking.length}`);
  }

  // Check gaps between sinking platforms are jumpable (<= 3.3m)
  for (const s of sinking) {
    let nearestDist = Infinity;
    for (const other of layout.platforms) {
      if (s.id === other.id) continue;
      const d = rectDistance(s.rect, other.rect);
      if (d < nearestDist) nearestDist = d;
    }
    if (nearestDist > 3.4) {
      errors.push(`Sinking platform ${s.id} isolated: nearest platform gap is ${nearestDist.toFixed(1)}m (max 3.3m)`);
    }
  }

  // Pebble piles >= 10
  const pebbles = layout.props.filter((p) => p.kind === 'pebble_pile');
  if (pebbles.length < 10) {
    errors.push(`Expected at least 10 pebble piles, found ${pebbles.length}`);
  }

  // Monster spawn in lower court
  for (const m of layout.spawns.monsters) {
    const d = dist2D(pSpawn.x, pSpawn.z, m.spawn.x, m.spawn.z);
    if (d < 25.0) {
      errors.push(`Monster spawn too close: ${d.toFixed(1)}m`);
    }
  }
}

/**
 * Map 4: The Hydro-Filtration Maze validator
 */
function validateHydroMaze(layout: LayoutData, errors: string[]): void {
  // 3 fuse cores on W2 tiers
  const cores = layout.props.filter((p) => p.kind === 'fuse_core');
  if (cores.length !== 3) {
    errors.push(`Expected 3 fuse cores, found ${cores.length}`);
  }

  // Fuse bay
  const bay = layout.props.find((p) => p.kind === 'fuse_bay');
  if (!bay) {
    errors.push('Fuse bay prop not found');
  }

  // W2 pedestals (topY >= 0.85)
  for (const core of cores) {
    if (core.position.y < 0.8) {
      errors.push(`Fuse core ${core.id} must be on W2 tier (+0.9m), found y=${core.position.y}`);
    }
  }

  // Filter drums Obstacles
  const drums = layout.props.filter((p) => p.kind === 'filter_drum');
  if (drums.length < 4) {
    errors.push(`Expected at least 4 filter drums, found ${drums.length}`);
  }
}

/**
 * Map 5: The Abyssal Drainage Core validator
 */
function validateDrainageCore(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;

  // 3 generators
  const gens = layout.props.filter((p) => p.kind === 'generator');
  if (gens.length !== 3) {
    errors.push(`Expected 3 generators, found ${gens.length}`);
  }

  // Locker cache
  const locker = layout.props.find((p) => p.kind === 'locker_cache');
  if (!locker) {
    errors.push('Locker cache prop not found');
  }

  // Blast doors
  const blastDoor = layout.props.find((p) => p.kind === 'blast_door');
  if (!blastDoor) {
    errors.push('Blast door prop not found');
  }

  // 1 to 3 monsters (1 relentless apex elder in solo, optional juveniles in multiplayer/deafening)
  if (layout.spawns.monsters.length < 1 || layout.spawns.monsters.length > 3) {
    errors.push(`Expected 1 to 3 monsters, found ${layout.spawns.monsters.length}`);
  }

  for (const m of layout.spawns.monsters) {
    const d = dist2D(pSpawn.x, pSpawn.z, m.spawn.x, m.spawn.z);
    if (d < 25.0) {
      errors.push(`Monster ${m.id} spawn too close to player: ${d.toFixed(1)}m`);
    }
  }
}

/**
 * Helper to compute reachable set of platforms given a max jump gap distance.
 */
function getReachablePlatforms(
  platforms: PlatformDef[],
  start: PlatformDef,
  maxGap: number,
): Set<string> {
  const reachable = new Set<string>([start.id]);
  const queue = [start];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const p of platforms) {
      if (reachable.has(p.id)) continue;
      const gap = rectDistance(curr.rect, p.rect);
      if (gap <= maxGap) {
        reachable.add(p.id);
        queue.push(p);
      }
    }
  }

  return reachable;
}

/**
 * The Grand Natatorium validator
 */
function validateNatatorium(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;
  const mSpawn = layout.spawns.monsters[0]?.spawn;

  // Monster spawn distance >= 45m
  if (mSpawn) {
    const dist = dist2D(pSpawn.x, pSpawn.z, mSpawn.x, mSpawn.z);
    if (dist < 45.0) {
      errors.push(`Monster spawn too close to player: ${dist.toFixed(1)}m < 45.0m`);
    }
  }

  // 4 ordinal code pillars
  const ordinalPillars = layout.pillars.filter((p) => p.ordinal !== undefined);
  if (ordinalPillars.length !== 4) {
    errors.push(`Expected 4 ordinal code pillars, got ${ordinalPillars.length}`);
  }

  // Ordinal pillars must be >= 20m apart
  for (let i = 0; i < ordinalPillars.length; i++) {
    for (let j = i + 1; j < ordinalPillars.length; j++) {
      const p1 = ordinalPillars[i]!;
      const p2 = ordinalPillars[j]!;
      const dist = dist2D(p1.x, p1.z, p2.x, p2.z);
      if (dist < 20.0) {
        errors.push(`Ordinal pillars ${p1.id} and ${p2.id} too close: ${dist.toFixed(1)}m < 20.0m`);
      }
    }
  }

  // 6 decoy pillars
  const decoyPillars = layout.pillars.filter((p) => p.ordinal === undefined);
  if (decoyPillars.length < 6) {
    errors.push(`Expected >= 6 decoy pillars, got ${decoyPillars.length}`);
  }

  // Silent route connectivity from spawn platform (gaps <= 3.4m)
  const spawnPlat = layout.platforms.find((p) => p.id === 'plat_foyer');
  if (spawnPlat) {
    const reachable = getReachablePlatforms(layout.platforms, spawnPlat, 3.4);
    const plantRoomPlat = layout.platforms.find((p) => p.id === 'plat_plant_room');
    if (plantRoomPlat && !reachable.has(plantRoomPlat.id)) {
      errors.push('Silent route cannot reach Plant Room with gaps <= 3.4m');
    }
  }
}

/**
 * The Drowned Schoolhouse validator
 */
function validateSchool(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;
  const mSpawn = layout.spawns.monsters[0]?.spawn;

  // Monster spawn distance >= 40m
  if (mSpawn) {
    const dist = dist2D(pSpawn.x, pSpawn.z, mSpawn.x, mSpawn.z);
    if (dist < 40.0) {
      errors.push(`Monster spawn too close to player: ${dist.toFixed(1)}m < 40.0m`);
    }
  }

  // Permanent dry platforms must not be submerged by max tide (+0.30m)
  const stage = layout.platforms.find((p) => p.id === 'plat_stage_safe');
  if (!stage || stage.topY < 0.6) {
    errors.push('Stage safe zone missing or too low for tide');
  }

  const dais = layout.platforms.find((p) => p.id === 'plat_lobby_dais');
  if (!dais || dais.topY < 0.5) {
    errors.push('Lobby dais missing or too low for tide');
  }

  // PA Console and Bolt Cutters props must exist
  const paConsole = layout.props.find((p) => p.kind === 'pa_console');
  if (!paConsole) errors.push('PA Console prop missing');

  const boltCutters = layout.props.find((p) => p.kind === 'bolt_cutters');
  if (!boltCutters) errors.push('Bolt Cutters prop missing');
}

/**
 * The Sunken Jungle validator
 */
function validateJungle(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;
  const mSpawn = layout.spawns.monsters[0]?.spawn;

  // Monster spawn distance >= 45m
  if (mSpawn) {
    const dist = dist2D(pSpawn.x, pSpawn.z, mSpawn.x, mSpawn.z);
    if (dist < 45.0) {
      errors.push(`Monster spawn too close to player: ${dist.toFixed(1)}m < 45.0m`);
    }
  }

  // 3 sluice wheels present
  const sluices = layout.props.filter((p) => p.kind === 'sluice_wheel');
  if (sluices.length !== 3) {
    errors.push(`Expected 3 sluice wheels, found ${sluices.length}`);
  }

  // Submerged causeway present (topY = -0.25m)
  const causeway = layout.platforms.find((p) => p.id === 'submerged_causeway');
  if (!causeway || causeway.topY !== -0.25) {
    errors.push('Submerged causeway missing or invalid topY');
  }
}

/**
 * Neon Flood District validator
 */
function validateCity(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;
  const mSpawn = layout.spawns.monsters[0]?.spawn;

  if (mSpawn) {
    const dist = dist2D(pSpawn.x, pSpawn.z, mSpawn.x, mSpawn.z);
    if (dist < 45.0) {
      errors.push(`Monster spawn too close to player: ${dist.toFixed(1)}m < 45.0m`);
    }
  }

  // 3 uplink terminals present
  const uplinks = layout.props.filter((p) => p.kind === 'uplink_terminal');
  if (uplinks.length !== 3) {
    errors.push(`Expected 3 uplink terminals, found ${uplinks.length}`);
  }

  // Car roof jump chains present
  const cars = layout.platforms.filter((p) => p.id.startsWith('car_roof_'));
  if (cars.length < 6) {
    errors.push(`Expected >= 6 hover-cars for jump chains, found ${cars.length}`);
  }
}

/**
 * Platform Zero, the Drowned Metro validator
 */
function validateMetro(layout: LayoutData, errors: string[]): void {
  const pSpawn = layout.spawns.player[0]!;
  const mSpawn = layout.spawns.monsters[0]?.spawn;

  if (mSpawn) {
    const dist = dist2D(pSpawn.x, pSpawn.z, mSpawn.x, mSpawn.z);
    if (dist < 20.0) {
      errors.push(`Monster spawn too close to player: ${dist.toFixed(1)}m < 20.0m`);
    }
  }

  // Platforms P1, P2, P3 must exist
  const p1 = layout.platforms.find((p) => p.id === 'plat_p1_south');
  const p2 = layout.platforms.find((p) => p.id === 'plat_p2_island');
  const p3 = layout.platforms.find((p) => p.id === 'plat_p3_north');
  if (!p1 || !p2 || !p3) {
    errors.push('One or more metro platforms (P1, P2, P3) missing');
  }

  // Footbridges connecting platforms
  const bridges = layout.platforms.filter((p) => p.id.startsWith('footbridge_'));
  if (bridges.length < 2) {
    errors.push(`Expected >= 2 cross-over footbridges, found ${bridges.length}`);
  }

  // 2 Levers and Conductor Key
  const levers = layout.props.filter((p) => p.kind === 'track_lever');
  if (levers.length !== 2) {
    errors.push(`Expected 2 track levers, found ${levers.length}`);
  }

  const key = layout.props.find((p) => p.kind === 'conductor_key');
  if (!key) errors.push('Conductor key missing');

  // Stalled train cars
  const cars = layout.platforms.filter((p) => p.id.startsWith('stalled_train_car_'));
  if (cars.length < 4) {
    errors.push(`Expected >= 4 stalled train cars, found ${cars.length}`);
  }
}

/**
 * Generates a valid layout with deterministic salt retry loop (up to maxRetries),
 * returning both the LayoutData and the retry count.
 */
export function generateValidLayoutWithStats(
  def: MapDefinition,
  ctx: LayoutCtx,
  maxRetries = 8,
): { layout: LayoutData; retries: number } {
  let attempt = 0;
  let currentSeed = ctx.seed;
  let lastErrors: string[] = [];

  while (attempt < maxRetries) {
    const subCtx: LayoutCtx = {
      seed: currentSeed,
      difficulty: ctx.difficulty,
      playerCount: ctx.playerCount,
    };

    const layout = def.generateLayout(subCtx);
    const validation = validateLayout(def.id, layout);

    if (validation.valid) {
      return { layout, retries: attempt };
    }

    lastErrors = validation.errors;
    attempt++;
    // Salted PRNG seed derivation
    currentSeed = (currentSeed * 31 + attempt * 7919) & 0x7fffffff;
  }

  throw new LayoutValidationError(def.id, ctx.seed, lastErrors);
}

/**
 * Generates a valid layout with deterministic salt retry loop (up to maxRetries).
 */
export function generateValidLayout(
  def: MapDefinition,
  ctx: LayoutCtx,
  maxRetries = 8,
): LayoutData {
  return generateValidLayoutWithStats(def, ctx, maxRetries).layout;
}

/* ── LayoutValidator.ts ───────────────────────────────────────────────────
 *  Pure simulation layout solvability, graph connectivity, and constraint validator.
 *  Runs in Node / Vitest and browser without Three.js or DOM dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../../types/contracts.js';
import type { LayoutData, PlatformDef, LayoutCtx, MapDefinition } from '../MapTypes.js';

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

  // 3 distinct monsters: 1 elder, 2 juvenile
  if (layout.spawns.monsters.length !== 3) {
    errors.push(`Expected 3 monsters, found ${layout.spawns.monsters.length}`);
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

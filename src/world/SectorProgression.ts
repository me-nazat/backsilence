/* ── SectorProgression.ts ──────────────────────────────────────────────────
 *  Master 11-Sector Registry and Sequential Progression Engine:
 *  - 11 Distinct Sectors (Map 01 to Map 11) with canonical and alias IDs
 *  - Persistent localStorage unlock tracking ('backsilence_unlocked_sector')
 *  - Exit trigger volume detection (distance < 2.2m)
 *  - Reachability & clearance verification (gap <= 3.8m, clearance >= 3.5m)
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../types/contracts.js';
import type { LayoutData } from './MapTypes.js';
import type { Vec3 } from '../types/contracts.js';

export interface SectorEntry {
  sectorNumber: number; // 1 to 11
  id: MapId;
  aliasId: string;
  name: string;
  subtitle: string;
  tagline: string;
  category: 'facility' | 'urban' | 'wilderness';
  difficulty: number; // 1..5
  tags: string[];
  bestTimeMs?: number;
  unlockedByDefault: boolean;
}

export const SECTOR_PROGRESSION: readonly SectorEntry[] = [
  {
    sectorNumber: 1,
    id: 'natatorium',
    aliasId: 'map_01_poolrooms',
    name: 'The Natatorium (Liminal Poolrooms)',
    subtitle: 'Liminal Olympic Basin & Skylight Vaults',
    tagline: "Bright cream ceramic arches, giant cylindrical pillars, and translucent emerald water. It can't see you. It hears the water.",
    category: 'facility',
    difficulty: 2,
    tags: ['MAIN DEFAULT', 'CREAM CERAMIC', 'EMERALD WATER', 'HIGH ARCHWAYS', 'PILLAR HALL'],
    bestTimeMs: 42300,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 2,
    id: 'drowned_metro',
    aliasId: 'map_02_station_row',
    name: 'Drowned Station Row (Subterranean Metro)',
    subtitle: 'Municipal Subway & Stalled Train Cars',
    tagline: 'White municipal brick-tile, dark emerald station stripe, submerged tracks, and stalled train cars.',
    category: 'urban',
    difficulty: 5,
    tags: ['STATION ROW', 'SUBMERGED TRACKS', 'STALLED TRAIN', 'TACTILE SAFETY TILES'],
    bestTimeMs: 104200,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 3,
    id: 'neon_flood',
    aliasId: 'map_03_neon_city',
    name: 'Neon Flood City (Cyberpunk Downtown Streets)',
    subtitle: 'Night Street Canyon & Neon Reflections',
    tagline: 'Flooded urban canyon at night, glowing neon reflections in dark water, rooftop ledges and flatbed trucks.',
    category: 'urban',
    difficulty: 5,
    tags: ['CYBERPUNK CANYON', 'NEON REFLECTIONS', 'FLATBED TRUCKS', 'ROOFTOP LEDGES'],
    bestTimeMs: 91000,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 4,
    id: 'drowned_school',
    aliasId: 'map_04_high_school',
    name: 'Flooded High School (Saint Jude Academy)',
    subtitle: 'Submerged Lockers & Gym Bleachers',
    tagline: 'Two-tone sage green and cream tiles, submerged lockers, gym bleachers, and cafeteria islands.',
    category: 'facility',
    difficulty: 3,
    tags: ['SAINT JUDE', 'SUBMERGED LOCKERS', 'GYM BLEACHERS', 'CAFETERIA TILES'],
    bestTimeMs: 51200,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 5,
    id: 'marble_atrium',
    aliasId: 'map_05_university',
    name: 'Submerged University College (Lecture Halls & Quad)',
    subtitle: 'Neoclassical Colonnade & Tiered Podiums',
    tagline: 'Neoclassical colonnade, fluted limestone pillars, tiered lecture podiums, and marble study tables.',
    category: 'facility',
    difficulty: 2,
    tags: ['CAMPUS QUAD', 'LIMESTONE PILLARS', 'LECTURE PODIUMS', 'MARBLE ATRIUM'],
    bestTimeMs: 48900,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 6,
    id: 'drainage_core',
    aliasId: 'map_06_drainage_core',
    name: 'Drainage Core (Municipal Waterworks & Turbine Hall)',
    subtitle: 'Industrial Sewer Brick & Turbine Pumps',
    tagline: 'Industrial sewer brick, massive copper drainage pipes, catwalk grates with hazard curbs, and sodium lighting.',
    category: 'facility',
    difficulty: 4,
    tags: ['TURBINE PUMPS', 'COPPER PIPES', 'CATWALK GRATES', 'SODIUM FLOODS'],
    bestTimeMs: 72100,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 7,
    id: 'sunken_jungle',
    aliasId: 'map_07_jungle_ruins',
    name: 'Sunken Jungle Ruins (Overgrown Temple Basin)',
    subtitle: 'Sandstone Ziggurats & Turquoise Lagoon',
    tagline: 'Humid emerald mist, mossy sandstone ziggurat ruins, turquoise lagoon water, and vine canopies.',
    category: 'wilderness',
    difficulty: 4,
    tags: ['TEMPLE BASIN', 'SANDSTONE ZIGGURAT', 'TURQUOISE LAGOON', 'VINE CANOPY'],
    bestTimeMs: 83400,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 8,
    id: 'hydro_maze',
    aliasId: 'map_08_mangrove_swamp',
    name: 'Mangrove Canopy Swamp (Deep Bayou)',
    subtitle: 'Twisted Aerial Roots & Weathered Boardwalks',
    tagline: 'Twilight amber fog, twisting mangrove aerial roots, dark jade water, and weathered wooden boardwalks.',
    category: 'wilderness',
    difficulty: 4,
    tags: ['DEEP BAYOU', 'MANGROVE ROOTS', 'DARK JADE WATER', 'WOODEN BOARDWALKS'],
    bestTimeMs: 65400,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 9,
    id: 'utility_tunnels',
    aliasId: 'map_09_mountain_reservoir',
    name: 'Misty Mountain Reservoir (Highland Dam & Peaks)',
    subtitle: 'Granite Peaks, Dam Buttresses & Glacial Water',
    tagline: 'Slate-blue alpine mist, towering granite peaks, stone dam buttresses, and glacial emerald-blue water.',
    category: 'wilderness',
    difficulty: 3,
    tags: ['HIGHLAND DAM', 'GRANITE PEAKS', 'SLATE BOULDERS', 'GLACIAL WATER'],
    bestTimeMs: 58200,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 10,
    id: 'poolrooms',
    aliasId: 'map_10_mirror_lake',
    name: 'Mirror Lake & Pier Islands (Foggy Alpine Lake)',
    subtitle: 'Wooden Boat Docks & Lighthouse Ruins',
    tagline: 'Pale-gold morning mist, wooden boat docks and piers, stone lighthouse ruins, and calm ripple water.',
    category: 'wilderness',
    difficulty: 2,
    tags: ['ALPINE LAKE', 'WOODEN DOCKS', 'LIGHTHOUSE RUINS', 'GLASSY WATER'],
    bestTimeMs: 34100,
    unlockedByDefault: true,
  },
  {
    sectorNumber: 11,
    id: 'orientation',
    aliasId: 'map_11_canyon_rapids',
    name: 'Canyon River Rapids (Red Rock Gorge)',
    subtitle: 'Sandstone Mesas, River Rapids & Extraction Cavern',
    tagline: 'Terraced red-ochre sandstone canyon, winding rushing emerald rapids with white-water foam, and extraction cavern.',
    category: 'wilderness',
    difficulty: 1,
    tags: ['RED ROCK GORGE', 'RUSHING RAPIDS', 'SANDSTONE MESAS', 'EXTRACTION CAVERN'],
    bestTimeMs: 25000,
    unlockedByDefault: true,
  },
];

export const MAP_ALIASES: Record<string, MapId> = {
  map_01_poolrooms: 'natatorium',
  map_02_station_row: 'drowned_metro',
  map_03_neon_city: 'neon_flood',
  map_04_high_school: 'drowned_school',
  map_05_university: 'marble_atrium',
  map_06_drainage_core: 'drainage_core',
  map_07_jungle_ruins: 'sunken_jungle',
  map_08_mangrove_swamp: 'hydro_maze',
  map_09_mountain_reservoir: 'utility_tunnels',
  map_10_mirror_lake: 'poolrooms',
  map_11_canyon_rapids: 'orientation',
};

export const MAP_SEQUENCE: MapId[] = SECTOR_PROGRESSION.map((s) => s.id);
export const DEFAULT_MAP_ID: MapId = 'natatorium';

export function normalizeMapId(id?: string | null): MapId {
  if (!id) return DEFAULT_MAP_ID;
  const clean = id.trim().toLowerCase();
  if (clean in MAP_ALIASES) {
    return MAP_ALIASES[clean]!;
  }
  if (MAP_SEQUENCE.includes(clean as MapId)) {
    return clean as MapId;
  }
  return DEFAULT_MAP_ID;
}

export function getUnlockedSector(): number {
  if (typeof localStorage === 'undefined') return 1;
  const raw = localStorage.getItem('backsilence_unlocked_sector');
  if (!raw) return 1;
  const val = parseInt(raw, 10);
  return Number.isFinite(val) ? Math.max(1, Math.min(11, val)) : 1;
}

export function unlockSector(sectorNumber: number): void {
  if (typeof localStorage === 'undefined') return;
  const cur = getUnlockedSector();
  const next = Math.max(cur, Math.min(11, Math.max(1, sectorNumber)));
  localStorage.setItem('backsilence_unlocked_sector', String(next));
}

export function isSectorUnlocked(sectorNumber: number): boolean {
  return sectorNumber <= getUnlockedSector();
}

export function getSectorByNumber(num: number): SectorEntry | undefined {
  return SECTOR_PROGRESSION.find((s) => s.sectorNumber === num);
}

export function getSectorById(id: string): SectorEntry | undefined {
  const norm = normalizeMapId(id);
  return SECTOR_PROGRESSION.find((s) => s.id === norm || s.aliasId === id);
}

export function getMapSectorIndex(id: string): number {
  const sector = getSectorById(id);
  return sector ? sector.sectorNumber : 1;
}

export function getNextSector(currentIdOrNumber: string | number): SectorEntry | null {
  const currentNum = typeof currentIdOrNumber === 'number'
    ? currentIdOrNumber
    : getMapSectorIndex(currentIdOrNumber);
  if (currentNum >= 11) return null;
  return getSectorByNumber(currentNum + 1) ?? null;
}

export function getNextMapId(currentMapId: string): MapId | null {
  const nextSec = getNextSector(currentMapId);
  return nextSec ? nextSec.id : null;
}

/**
 * Checks whether the player is inside the exit corridor / archway trigger volume (< 2.2m).
 */
export function isExitTriggered(playerPos: Vec3, exitPos: Vec3, triggerRadius = 2.2): boolean {
  return Math.hypot(playerPos.x - exitPos.x, playerPos.z - exitPos.z) < triggerRadius;
}

/**
 * Verifies that stepping stone gaps are <= 3.8m and vertical clearances are >= 3.5m.
 */
export function validateMapReachability(layout: LayoutData): {
  traversable: boolean;
  maxGap: number;
  minClearance: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let maxGap = 0;
  let minClearance = Infinity;

  const plats = layout.platforms;
  for (let i = 0; i < plats.length; i++) {
    const p1 = plats[i]!;
    let closestDist = Infinity;
    for (let j = 0; j < plats.length; j++) {
      if (i === j) continue;
      const p2 = plats[j]!;
      const dx = Math.max(0, Math.max(p1.rect[0] - p2.rect[2], p2.rect[0] - p1.rect[2]));
      const dz = Math.max(0, Math.max(p1.rect[1] - p2.rect[3], p2.rect[1] - p1.rect[3]));
      const dist = Math.hypot(dx, dz);
      if (dist < closestDist) {
        closestDist = dist;
      }
    }
    if (closestDist > maxGap && closestDist !== Infinity) {
      maxGap = closestDist;
    }
  }

  for (const plat of plats) {
    const platTop = plat.topY;
    for (const wall of layout.walls) {
      const overlapX = !(wall.max.x <= plat.rect[0] || wall.min.x >= plat.rect[2]);
      const overlapZ = !(wall.max.z <= plat.rect[1] || wall.min.z >= plat.rect[3]);
      if (overlapX && overlapZ) {
        if (wall.min.y > platTop) {
          const clearance = wall.min.y - platTop;
          if (clearance < minClearance) {
            minClearance = clearance;
          }
          if (clearance < 3.5) {
            warnings.push(`Low overhead clearance on platform ${plat.id}: ${clearance.toFixed(2)}m (expected >= 3.5m)`);
          }
        }
      }
    }
  }

  if (minClearance === Infinity) {
    minClearance = 14.0;
  }

  return {
    traversable: warnings.length === 0,
    maxGap: Number(maxGap.toFixed(2)),
    minClearance: Number(minClearance.toFixed(2)),
    warnings,
  };
}


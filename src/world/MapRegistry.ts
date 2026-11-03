/* ── MapRegistry.ts ────────────────────────────────────────────────────────
 *  Lazy dynamic import registry for the 11 BackSilence maps / sectors.
 *  Ensures each map is isolated into its own bundle chunk (<= 30 KB gzipped)
 *  and generates procedural thumbnail previews for the UI map selector.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../types/contracts.js';
import type { MapDefinition, LayoutData, LayoutCtx } from './MapTypes.js';
import {
  DEFAULT_MAP_ID,
  MAP_SEQUENCE,
  MAP_ALIASES,
  normalizeMapId,
  getNextMapId,
} from './SectorProgression.js';

export {
  DEFAULT_MAP_ID,
  MAP_SEQUENCE,
  MAP_ALIASES,
  normalizeMapId,
  getNextMapId,
};

export const FEATURED_MAP_IDS: MapId[] = [
  'natatorium',
  'drowned_metro',
  'neon_flood',
  'drowned_school',
  'marble_atrium',
  'drainage_core',
];

export const ARCHIVE_MAP_IDS: MapId[] = [
  'sunken_jungle',
  'hydro_maze',
  'utility_tunnels',
  'poolrooms',
  'orientation',
];

export const ALL_MAP_IDS: MapId[] = [
  ...MAP_SEQUENCE,
];

type MapLoader = () => Promise<MapDefinition>;

const MAP_LOADERS: Record<string, MapLoader> = {
  // Canonical Sector IDs (Map 01 to Map 11)
  natatorium: () => import('./maps/NatatoriumMap.js').then((m) => m.NatatoriumMap),
  drowned_metro: () => import('./maps/DrownedMetroMap.js').then((m) => m.DrownedMetroMap),
  neon_flood: () => import('./maps/NeonFloodMap.js').then((m) => m.NeonFloodMap),
  drowned_school: () => import('./maps/DrownedSchoolMap.js').then((m) => m.DrownedSchoolMap),
  marble_atrium: () => import('./maps/MarbleAtriumMap.js').then((m) => m.MarbleAtriumMap),
  drainage_core: () => import('./maps/DrainageCoreMap.js').then((m) => m.DrainageCoreMap),
  sunken_jungle: () => import('./maps/SunkenJungleMap.js').then((m) => m.SunkenJungleMap),
  hydro_maze: () => import('./maps/HydroMazeMap.js').then((m) => m.HydroMazeMap),
  utility_tunnels: () => import('./maps/UtilityTunnelsMap.js').then((m) => m.UtilityTunnelsMap),
  poolrooms: () => import('./maps/PoolroomsMap.js').then((m) => m.PoolroomsMap),
  orientation: () => import('./maps/OrientationMap.js').then((m) => m.OrientationMap),

  // Alias IDs (map_01_poolrooms .. map_11_canyon_rapids)
  map_01_poolrooms: () => import('./maps/NatatoriumMap.js').then((m) => m.NatatoriumMap),
  map_02_station_row: () => import('./maps/DrownedMetroMap.js').then((m) => m.DrownedMetroMap),
  map_03_neon_city: () => import('./maps/NeonFloodMap.js').then((m) => m.NeonFloodMap),
  map_04_high_school: () => import('./maps/DrownedSchoolMap.js').then((m) => m.DrownedSchoolMap),
  map_05_university: () => import('./maps/MarbleAtriumMap.js').then((m) => m.MarbleAtriumMap),
  map_06_drainage_core: () => import('./maps/DrainageCoreMap.js').then((m) => m.DrainageCoreMap),
  map_07_jungle_ruins: () => import('./maps/SunkenJungleMap.js').then((m) => m.SunkenJungleMap),
  map_08_mangrove_swamp: () => import('./maps/HydroMazeMap.js').then((m) => m.HydroMazeMap),
  map_09_mountain_reservoir: () => import('./maps/UtilityTunnelsMap.js').then((m) => m.UtilityTunnelsMap),
  map_10_mirror_lake: () => import('./maps/PoolroomsMap.js').then((m) => m.PoolroomsMap),
  map_11_canyon_rapids: () => import('./maps/OrientationMap.js').then((m) => m.OrientationMap),
};

const mapCache = new Map<MapId, MapDefinition>();
const thumbnailCache = new Map<string, string>(); // data URLs

export async function getMapDefinition(id: MapId | string): Promise<MapDefinition> {
  const norm = normalizeMapId(id);
  const cached = mapCache.get(norm);
  if (cached) return cached;

  const loader = MAP_LOADERS[norm] ?? MAP_LOADERS[id];
  if (!loader) {
    throw new Error(`[MapRegistry] Unknown map id: "${id}"`);
  }

  const def = await loader();
  mapCache.set(norm, def);
  return def;
}

/**
 * Returns a cached procedural layout for thumbnail generation (fixed seed 12345).
 */
export async function getMapPreviewLayout(id: MapId | string): Promise<{ def: MapDefinition; layout: LayoutData }> {
  const norm = normalizeMapId(id);
  const def = await getMapDefinition(norm);
  const ctx: LayoutCtx = {
    seed: 12345,
    difficulty: 'normal',
    playerCount: 1,
  };
  const layout = def.generateLayout(ctx);
  return { def, layout };
}

/**
 * Renders a procedural 2D thumbnail to a Canvas data URL, cached for instant UI display.
 */
export async function getMapThumbnailDataUrl(id: MapId | string, width = 320, height = 180): Promise<string> {
  const norm = normalizeMapId(id);
  const cacheKey = `${norm}_${width}x${height}`;
  const existing = thumbnailCache.get(cacheKey);
  if (existing) return existing;

  if (typeof document === 'undefined') {
    return '';
  }

  const { def, layout } = await getMapPreviewLayout(norm);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  def.drawThumbnail(ctx, layout, width, height);
  const dataUrl = canvas.toDataURL('image/png');
  thumbnailCache.set(cacheKey, dataUrl);
  return dataUrl;
}

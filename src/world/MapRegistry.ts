/* ── MapRegistry.ts ────────────────────────────────────────────────────────
 *  Lazy dynamic import registry for the five BackSilence maps.
 *  Ensures each map is isolated into its own bundle chunk (<= 30 KB gzipped)
 *  and generates procedural thumbnail previews for the UI map selector.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../types/contracts.js';
import type { MapDefinition, LayoutData, LayoutCtx } from './MapTypes.js';

export const ALL_MAP_IDS: MapId[] = [
  'poolrooms',
  'utility_tunnels',
  'marble_atrium',
  'hydro_maze',
  'drainage_core',
];

type MapLoader = () => Promise<MapDefinition>;

const MAP_LOADERS: Record<MapId, MapLoader> = {
  poolrooms: () => import('./maps/PoolroomsMap.js').then((m) => m.PoolroomsMap),
  utility_tunnels: () => import('./maps/UtilityTunnelsMap.js').then((m) => m.UtilityTunnelsMap),
  marble_atrium: () => import('./maps/MarbleAtriumMap.js').then((m) => m.MarbleAtriumMap),
  hydro_maze: () => import('./maps/HydroMazeMap.js').then((m) => m.HydroMazeMap),
  drainage_core: () => import('./maps/DrainageCoreMap.js').then((m) => m.DrainageCoreMap),
};

const mapCache = new Map<MapId, MapDefinition>();
const thumbnailCache = new Map<string, string>(); // data URLs

export async function getMapDefinition(id: MapId): Promise<MapDefinition> {
  const cached = mapCache.get(id);
  if (cached) return cached;

  const loader = MAP_LOADERS[id];
  if (!loader) {
    throw new Error(`[MapRegistry] Unknown map id: "${id}"`);
  }

  const def = await loader();
  mapCache.set(id, def);
  return def;
}

/**
 * Returns a cached procedural layout for thumbnail generation (fixed seed 12345).
 */
export async function getMapPreviewLayout(id: MapId): Promise<{ def: MapDefinition; layout: LayoutData }> {
  const def = await getMapDefinition(id);
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
export async function getMapThumbnailDataUrl(id: MapId, width = 320, height = 180): Promise<string> {
  const cacheKey = `${id}_${width}x${height}`;
  const existing = thumbnailCache.get(cacheKey);
  if (existing) return existing;

  if (typeof document === 'undefined') {
    return '';
  }

  const { def, layout } = await getMapPreviewLayout(id);
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

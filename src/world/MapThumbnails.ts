/* ── MapThumbnails.ts ───────────────────────────────────────────────────
 *  Prompt 8 (D126) Work Items F.16–18: Data-only Map Preview & Procedural Fallbacks.
 *  - ZERO Three.js or 3D geometry imports (prevents eagerly loading all 11 map modules).
 *  - Provides procedural tonal placeholder for failed or 2s-stalled map module imports.
 *  - Guarantees no ModeSelect or map picker thumbnail is ever left blank.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../types/contracts.js';

export interface MapVisualMeta {
  title: string;
  family: 'poolroom' | 'utility' | 'derelict';
  bgTint: string;
  waterTint: string;
  accentTint: string;
}

export const MAP_VISUAL_METAS: Record<MapId, MapVisualMeta> = {
  natatorium: {
    title: 'NATATORIUM',
    family: 'poolroom',
    bgTint: '#1c2218',
    waterTint: '#4a5e38',
    accentTint: '#d4af37',
  },
  poolrooms: {
    title: 'POOLROOMS',
    family: 'poolroom',
    bgTint: '#1c2218',
    waterTint: '#4a5e38',
    accentTint: '#d99b26',
  },
  orientation: {
    title: 'ORIENTATION',
    family: 'poolroom',
    bgTint: '#1a2016',
    waterTint: '#425432',
    accentTint: '#86cfa0',
  },
  hydro_maze: {
    title: 'HYDRO MAZE',
    family: 'poolroom',
    bgTint: '#16221c',
    waterTint: '#3d5648',
    accentTint: '#4ade80',
  },
  drowned_school: {
    title: 'DROWNED SCHOOL',
    family: 'poolroom',
    bgTint: '#202018',
    waterTint: '#485236',
    accentTint: '#e08a3c',
  },
  utility_tunnels: {
    title: 'UTILITY TUNNELS',
    family: 'utility',
    bgTint: '#181a16',
    waterTint: '#384230',
    accentTint: '#e69138',
  },
  drainage_core: {
    title: 'DRAINAGE CORE',
    family: 'utility',
    bgTint: '#141814',
    waterTint: '#323e2c',
    accentTint: '#8ea05a',
  },
  drowned_metro: {
    title: 'DROWNED METRO',
    family: 'utility',
    bgTint: '#161816',
    waterTint: '#343c30',
    accentTint: '#60a5fa',
  },
  marble_atrium: {
    title: 'MARBLE ATRIUM',
    family: 'derelict',
    bgTint: '#201e18',
    waterTint: '#4c4e36',
    accentTint: '#c4b5fd',
  },
  neon_flood: {
    title: 'NEON FLOOD',
    family: 'derelict',
    bgTint: '#1e1c18',
    waterTint: '#4a4834',
    accentTint: '#fbbf24',
  },
  sunken_jungle: {
    title: 'SUNKEN JUNGLE',
    family: 'derelict',
    bgTint: '#162014',
    waterTint: '#384c2e',
    accentTint: '#22c55e',
  },
};

/**
 * Draws a lightweight procedural placeholder card directly onto 2D canvas.
 * Renders a tonal background, subtle architectural arch silhouette, waterline,
 * and clear label. Guaranteed to run in < 1ms with 0 dependencies.
 */
export function drawProceduralMapPlaceholder(
  ctx: CanvasRenderingContext2D,
  mapId: MapId | string,
  mapName?: string,
  w = 320,
  h = 180,
): void {
  const meta: MapVisualMeta = (MAP_VISUAL_METAS as Record<string, MapVisualMeta>)[mapId] ?? {
    title: (mapName ?? mapId).toUpperCase(),
    family: 'poolroom',
    bgTint: '#1a1e16',
    waterTint: '#425234',
    accentTint: '#d4af37',
  };

  const title = mapName ? mapName.toUpperCase() : meta.title;

  // 1. Tonal background
  ctx.fillStyle = meta.bgTint;
  ctx.fillRect(0, 0, w, h);

  // 2. Subtle architectural tile grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const gridSize = 16;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // 3. Vaulted Arch silhouette
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const archW = w * 0.55;
  const archH = h * 0.65;
  const archLeft = (w - archW) / 2;
  const archTop = h * 0.15;
  ctx.moveTo(archLeft, archTop + archH);
  ctx.lineTo(archLeft, archTop + archH * 0.4);
  ctx.bezierCurveTo(
    archLeft, archTop,
    archLeft + archW, archTop,
    archLeft + archW, archTop + archH * 0.4,
  );
  ctx.lineTo(archLeft + archW, archTop + archH);
  ctx.stroke();

  // 4. Submerged Waterline at 68% height
  const waterY = h * 0.68;
  ctx.fillStyle = meta.waterTint;
  ctx.fillRect(0, waterY, w, h - waterY);

  // Waterline surface reflection line
  ctx.strokeStyle = 'rgba(214, 220, 205, 0.35)'; // #d6dccd horizon specular
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, waterY);
  ctx.lineTo(w, waterY);
  ctx.stroke();

  // 5. Monospace Typography Card Header
  ctx.fillStyle = '#f5f0dc'; // warm cream
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, w / 2, h * 0.45);

  ctx.fillStyle = meta.accentTint;
  ctx.font = '9px monospace';
  ctx.fillText(`${meta.family.toUpperCase()} SECTOR`, w / 2, h * 0.56);
}

/**
 * Loads a map preview layout, racing against a timeout (default 2000ms).
 * On timeout, fetch rejection, or render error, draws the procedural placeholder.
 */
export async function renderMapThumbnailWithFallback(
  canvas: HTMLCanvasElement,
  mapId: MapId,
  mapName?: string,
  timeoutMs = 2000,
): Promise<boolean> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const w = canvas.width || 320;
  const h = canvas.height || 180;

  // Draw immediate placeholder while loading so canvas is never blank
  drawProceduralMapPlaceholder(ctx, mapId, mapName, w, h);

  try {
    const { getMapPreviewLayout } = await import('./MapRegistry.js');

    const fetchPromise = getMapPreviewLayout(mapId);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout loading map preview for ${mapId}`)), timeoutMs);
    });

    const { def, layout } = await Promise.race([fetchPromise, timeoutPromise]);
    // Clear and draw detailed layout
    ctx.clearRect(0, 0, w, h);
    def.drawThumbnail(ctx, layout, w, h);
    return true;
  } catch {
    // Fallback: Redraw crisp procedural placeholder
    drawProceduralMapPlaceholder(ctx, mapId, mapName, w, h);
    return false;
  }
}

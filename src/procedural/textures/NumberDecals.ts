/* ── NumberDecals.ts ──────────────────────────────────────────────────────
 *  Giant spray-painted pillar numbers (0–99) visible through dense fog from 10m away.
 *  Uses tall (512x768) transparent textures with overspray, drips, and slight rotation.
 * ──────────────────────────────────────────────────────────────────────── */

import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace } from 'three';
import { Rng } from '../core/prng.js';
import { layoutText, type Point2D, type Polyline } from './strokeFont.js';
import { drawSpray, drawMarker } from './brush.js';
import { acquireCanvas } from '../core/canvasPool.js';

export interface NumberDecalOptions {
  seed?: number | undefined;
  style?: 'spray' | 'marker' | undefined;
  subtext?: string | undefined;
}

const numberCache = new Map<string, CanvasTexture>();

/**
 * Generate a giant spray-painted number decal for tiled pillars (numbers 0 to 99).
 */
export function makeNumberDecal(
  n: number,
  options: NumberDecalOptions = {},
): CanvasTexture {
  const seed = options.seed ?? 100 + n;
  const style = options.style ?? 'spray';
  const subtext = options.subtext ?? '';

  const cacheKey = `${n}:${seed}:${style}:${subtext}`;
  const cached = numberCache.get(cacheKey);
  if (cached) return cached;

  const width = 512;
  const height = 768;

  const pooled = acquireCanvas(width, height);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, width, height);

  const rng = new Rng(seed);
  const numStr = String(Math.max(0, Math.min(99, Math.floor(n))));

  // Font size adjusted for single vs double digit
  const fontSize = numStr.length === 1 ? 380 : 250;
  const layout = layoutText(numStr, {
    size: fontSize,
    tracking: 0.08,
    rng: rng.next.bind(rng),
    wobble: 0.04,
  });

  // Center on canvas with slight rotation
  const rot = (rng.next() * 2.0 - 1.0) * 0.04;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  const centerX = width * 0.5;
  const centerY = height * 0.48;

  const shifted: Polyline[] = layout.polylines.map((stroke) => {
    return stroke.map(([x, y]) => {
      // Offset relative to layout center
      const lx = x - layout.width * 0.5;
      const ly = y - layout.height * 0.5;

      const rx = lx * cosR - ly * sinR;
      const ry = lx * sinR + ly * cosR;

      return [centerX + rx, centerY + ry] as Point2D;
    });
  });

  const color = '#0d0b06';

  if (style === 'spray') {
    drawSpray(ctx, shifted, {
      width: numStr.length === 1 ? 26 : 20,
      color,
      seed,
      dripRate: 0.12,
      oversprayCount: 28,
    });
  } else {
    drawMarker(ctx, shifted, {
      width: numStr.length === 1 ? 22 : 16,
      color,
      seed,
    });
  }

  // Draw small ordinal marker e.g. "#1" below digit if provided
  if (subtext) {
    const subLayout = layoutText(subtext, {
      size: 56,
      tracking: 0.1,
      wobble: 0.02,
      rng: () => rng.next(),
    });
    const subShifted: Polyline[] = subLayout.polylines.map((stroke) => {
      return stroke.map(([x, y]) => {
        const lx = x - subLayout.width * 0.5;
        const ly = y - subLayout.height * 0.5;
        return [centerX + lx, height * 0.82 + ly] as Point2D;
      });
    });
    drawMarker(ctx, subShifted, {
      width: 10,
      color: '#0d0b06',
      seed: seed + 7,
    });
  }

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  numberCache.set(cacheKey, texture);
  return texture;
}

/**
 * Clear cached number decals.
 */
export function clearNumberDecalCache(): void {
  for (const tex of numberCache.values()) {
    tex.dispose();
  }
  numberCache.clear();
}

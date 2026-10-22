/* ── WaterNormal.ts ───────────────────────────────────────────────────────
 *  Tileable water normal map generator.
 *  Combines multi-octave periodic fBm with directional wake streaks, converted via Sobel.
 * ──────────────────────────────────────────────────────────────────────── */

import { CanvasTexture, RepeatWrapping, NoColorSpace } from 'three';
import { createNoisePermutation, fbm2DTileable } from '../core/noise.js';
import { acquireCanvas } from '../core/canvasPool.js';

export interface WaterNormalOptions {
  size?: number;
  seed?: number;
}

/**
 * Procedurally generate a tileable water normal map.
 */
export function makeWaterNormalMap(
  options: WaterNormalOptions = {},
): CanvasTexture {
  const size = options.size ?? 512;
  const seed = options.seed ?? 101;

  const perm = createNoisePermutation(seed);
  const heights = new Float32Array(size * size);

  // 1. Generate height field using integer frequencies for mathematically seamless tiling
  const waveFreq = 4;
  const streakFreqX = 2;
  const streakFreqY = 8;

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;

      // Primary multi-octave water surface waves
      const waves = fbm2DTileable(
        nx * waveFreq,
        ny * waveFreq,
        waveFreq,
        waveFreq,
        4,
        2,
        0.5,
        perm,
      );

      // Directional wake streaks (stretched ripples)
      const streaks = fbm2DTileable(
        nx * streakFreqX,
        ny * streakFreqY,
        streakFreqX,
        streakFreqY,
        3,
        2,
        0.5,
        perm,
      );

      heights[y * size + x] = waves * 0.7 + streaks * 0.3;
    }
  }

  // 2. Derive normal map via 3x3 Sobel with periodic boundary wrapping
  const data = new Uint8ClampedArray(size * size * 4);
  const strength = 3.5;

  for (let y = 0; y < size; y++) {
    const ym1 = (y - 1 + size) % size;
    const yp1 = (y + 1) % size;

    for (let x = 0; x < size; x++) {
      const xm1 = (x - 1 + size) % size;
      const xp1 = (x + 1) % size;

      const tl = heights[ym1 * size + xm1]!;
      const t  = heights[ym1 * size + x]!;
      const tr = heights[ym1 * size + xp1]!;
      const l  = heights[y * size + xm1]!;
      const r  = heights[y * size + xp1]!;
      const bl = heights[yp1 * size + xm1]!;
      const b  = heights[yp1 * size + x]!;
      const br = heights[yp1 * size + xp1]!;

      const dX = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
      const dY = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
      const dZ = 1.0 / strength;

      const len = Math.hypot(dX, dY, dZ);
      const nx = -dX / len;
      const ny = -dY / len;
      const nz = dZ / len;

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const pooled = acquireCanvas(size, size);
  const imgData = new ImageData(data, size, size);
  pooled.ctx.putImageData(imgData, 0, 0);

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return texture;
}

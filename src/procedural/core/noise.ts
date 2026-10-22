/* ── noise.ts ─────────────────────────────────────────────────────────────
 *  Seeded 2D noise suite: Value noise, Gradient noise, fBm, and Worley noise.
 *  Includes strictly periodic (tileable) variants for seamless texture generation.
 *  Zero per-call allocations; typed arrays only.
 * ──────────────────────────────────────────────────────────────────────── */

import { mulberry32 } from './prng.js';

/** Gradients for 2D gradient noise. */
const GRAD2_X = new Float32Array([1, -1, 1, -1, 1, -1, 0, 0]);
const GRAD2_Y = new Float32Array([0, 0, 1, 1, -1, -1, 1, -1]);

/**
 * Generate a 512-byte permutation table from a numeric seed.
 */
export function createNoisePermutation(seed: number): Uint8Array {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    p[i] = i;
  }
  const rng = mulberry32(seed);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255]!;
  }
  return perm;
}

/** Quintic smoothstep s-curve: 6t^5 - 15t^4 + 10t^3. */
export function fade(t: number): number {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * 2D Value Noise in range [0, 1].
 */
export function valueNoise2D(x: number, y: number, perm: Uint8Array): number {
  const X = Math.floor(x);
  const Y = Math.floor(y);

  const fx = x - X;
  const fy = y - Y;

  const u = fade(fx);
  const v = fade(fy);

  const xi = X & 255;
  const yi = Y & 255;

  const aa = perm[perm[xi]! + yi]! / 255.0;
  const ba = perm[perm[xi + 1]! + yi]! / 255.0;
  const ab = perm[perm[xi]! + yi + 1]! / 255.0;
  const bb = perm[perm[xi + 1]! + yi + 1]! / 255.0;

  return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
}

/**
 * Tileable 2D Value Noise wrapping exactly with periodX and periodY in [0, 1].
 */
export function valueNoise2DTileable(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  perm: Uint8Array,
): number {
  const px = Math.max(1, Math.floor(periodX));
  const py = Math.max(1, Math.floor(periodY));

  const X = Math.floor(x);
  const Y = Math.floor(y);

  const fx = x - X;
  const fy = y - Y;

  const u = fade(fx);
  const v = fade(fy);

  const x0 = ((X % px) + px) % px;
  const y0 = ((Y % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;

  const aa = perm[perm[x0]! + y0]! / 255.0;
  const ba = perm[perm[x1]! + y0]! / 255.0;
  const ab = perm[perm[x0]! + y1]! / 255.0;
  const bb = perm[perm[x1]! + y1]! / 255.0;

  return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
}

/** Dot product with 2D gradient table. */
function grad2D(hash: number, x: number, y: number): number {
  const h = hash & 7;
  return GRAD2_X[h]! * x + GRAD2_Y[h]! * y;
}

/**
 * 2D Gradient Noise in range [-1, 1].
 */
export function gradientNoise2D(x: number, y: number, perm: Uint8Array): number {
  const X = Math.floor(x);
  const Y = Math.floor(y);

  const fx = x - X;
  const fy = y - Y;

  const u = fade(fx);
  const v = fade(fy);

  const xi = X & 255;
  const yi = Y & 255;

  const g00 = grad2D(perm[perm[xi]! + yi]!, fx, fy);
  const g10 = grad2D(perm[perm[xi + 1]! + yi]!, fx - 1, fy);
  const g01 = grad2D(perm[perm[xi]! + yi + 1]!, fx, fy - 1);
  const g11 = grad2D(perm[perm[xi + 1]! + yi + 1]!, fx - 1, fy - 1);

  return lerp(lerp(g00, g10, u), lerp(g01, g11, u), v);
}

/**
 * Tileable 2D Gradient Noise wrapping with periodX and periodY in [-1, 1].
 */
export function gradientNoise2DTileable(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  perm: Uint8Array,
): number {
  const px = Math.max(1, Math.floor(periodX));
  const py = Math.max(1, Math.floor(periodY));

  const X = Math.floor(x);
  const Y = Math.floor(y);

  const fx = x - X;
  const fy = y - Y;

  const u = fade(fx);
  const v = fade(fy);

  const x0 = ((X % px) + px) % px;
  const y0 = ((Y % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;

  const g00 = grad2D(perm[perm[x0]! + y0]!, fx, fy);
  const g10 = grad2D(perm[perm[x1]! + y0]!, fx - 1, fy);
  const g01 = grad2D(perm[perm[x0]! + y1]!, fx, fy - 1);
  const g11 = grad2D(perm[perm[x1]! + y1]!, fx - 1, fy - 1);

  return lerp(lerp(g00, g10, u), lerp(g01, g11, u), v);
}

/**
 * Fractional Brownian Motion (fBm) using 2D Gradient Noise. Normalized to [-1, 1].
 */
export function fbm2D(
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number,
  perm: Uint8Array,
): number {
  let sum = 0.0;
  let freq = 1.0;
  let amp = 1.0;
  let maxAmp = 0.0;

  for (let i = 0; i < octaves; i++) {
    sum += gradientNoise2D(x * freq, y * freq, perm) * amp;
    maxAmp += amp;
    freq *= lacunarity;
    amp *= gain;
  }

  return maxAmp > 0 ? sum / maxAmp : sum;
}

/**
 * Tileable Fractional Brownian Motion (fBm).
 * Uses integer lacunarity powers so higher octaves wrap on periodX, periodY.
 */
export function fbm2DTileable(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  octaves: number,
  lacunarity: number,
  gain: number,
  perm: Uint8Array,
): number {
  let sum = 0.0;
  let freq = 1.0;
  let amp = 1.0;
  let maxAmp = 0.0;

  for (let i = 0; i < octaves; i++) {
    const curPeriodX = periodX * freq;
    const curPeriodY = periodY * freq;
    sum +=
      gradientNoise2DTileable(
        x * freq,
        y * freq,
        curPeriodX,
        curPeriodY,
        perm,
      ) * amp;
    maxAmp += amp;
    freq *= lacunarity;
    amp *= gain;
  }

  return maxAmp > 0 ? sum / maxAmp : sum;
}

export interface WorleyResult {
  f1: number;
  f2: number;
}

/**
 * 2D Worley (Cellular) noise returning F1 (closest) and F2 (second closest) distances.
 */
export function worley2D(x: number, y: number, perm: Uint8Array): WorleyResult {
  const X = Math.floor(x);
  const Y = Math.floor(y);

  let f1 = 999.0;
  let f2 = 999.0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = X + dx;
      const cy = Y + dy;

      const xi = cx & 255;
      const yi = cy & 255;
      const h1 = perm[perm[xi]! + yi]!;
      const h2 = perm[perm[xi + 1]! + yi + 1]!;

      // Feature point jitter inside cell [0, 1]
      const px = cx + h1 / 255.0;
      const py = cy + h2 / 255.0;

      const distSq = (px - x) * (px - x) + (py - y) * (py - y);
      const d = Math.sqrt(distSq);

      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }

  return { f1, f2 };
}

/**
 * Tileable 2D Worley noise wrapping on periodX and periodY.
 */
export function worley2DTileable(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  perm: Uint8Array,
): WorleyResult {
  const px = Math.max(1, Math.floor(periodX));
  const py = Math.max(1, Math.floor(periodY));

  const X = Math.floor(x);
  const Y = Math.floor(y);

  let f1 = 999.0;
  let f2 = 999.0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = X + dx;
      const cy = Y + dy;

      const wx = ((cx % px) + px) % px;
      const wy = ((cy % py) + py) % py;

      const h1 = perm[perm[wx]! + wy]!;
      const h2 = perm[perm[(wx + 1) % px]! + ((wy + 1) % py)]!;

      const ptX = cx + h1 / 255.0;
      const ptY = cy + h2 / 255.0;

      const distSq = (ptX - x) * (ptX - x) + (ptY - y) * (ptY - y);
      const d = Math.sqrt(distSq);

      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }

  return { f1, f2 };
}

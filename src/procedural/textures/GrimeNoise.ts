/* ── GrimeNoise.ts ────────────────────────────────────────────────────────
 *  Tileable grime mask with vertical streaks, mineral/chlorine waterline stains,
 *  and high-frequency speckle. Includes multiply compositing helper.
 * ──────────────────────────────────────────────────────────────────────── */

import { CanvasTexture, RepeatWrapping, NoColorSpace } from 'three';
import { createNoisePermutation, fbm2DTileable, valueNoise2DTileable } from '../core/noise.js';
import { acquireCanvas } from '../core/canvasPool.js';

export interface WaterlineBand {
  /** Vertical center of the waterline 0..1 (default 0.35) */
  y: number;
  /** Thickness of the band 0..1 (default 0.12) */
  width: number;
  /** Maximum strength 0..1 (default 0.8) */
  strength: number;
}

export interface GrimeMaskOptions {
  size?: number;
  seed?: number;
  waterlineBand?: WaterlineBand;
}

export interface GrimeMaskResult {
  texture: CanvasTexture;
  data: Uint8ClampedArray;
  size: number;
}

/**
 * Procedurally generate a tileable grayscale grime mask.
 */
export function makeGrimeMask(options: GrimeMaskOptions = {}): GrimeMaskResult {
  const size = options.size ?? 512;
  const seed = options.seed ?? 88;
  const band = options.waterlineBand ?? {
    y: 0.35,
    width: 0.12,
    strength: 0.8,
  };

  const perm = createNoisePermutation(seed);
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    const v = y / size;

    // Waterline band with perturbed wavy boundary
    const wave = fbm2DTileable(y * 0.05, 0, size * 0.05, 1, 2, 2, 0.5, perm) * 0.03;
    const distToWaterline = Math.abs(v - (band.y + wave));
    const bandFactor = Math.max(0.0, 1.0 - distToWaterline / band.width) * band.strength;

    for (let x = 0; x < size; x++) {
      // 1. Vertical streaks (stretched noise along Y)
      const streaks =
        (fbm2DTileable(
          x * 0.1,
          y * 0.015,
          size * 0.1,
          size * 0.015,
          3,
          2,
          0.5,
          perm,
        ) *
          0.5 +
          0.5);

      // 2. High-frequency speckle
      const speckle = valueNoise2DTileable(x * 0.4, y * 0.4, size * 0.4, size * 0.4, perm);

      // Combined grime (0 = fully clean, 1 = heavy grime)
      let grime = streaks * 0.4 + bandFactor * 0.5 + (speckle > 0.85 ? 0.3 : 0.0);
      grime = Math.max(0.0, Math.min(1.0, grime));

      // Grayscale mask: 255 = clean, 0 = dirty
      const maskVal = Math.round((1.0 - grime) * 255);
      const idx = (y * size + x) * 4;
      data[idx] = maskVal;
      data[idx + 1] = maskVal;
      data[idx + 2] = maskVal;
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

  return { texture, data, size };
}

/**
 * Multiply grime into a tile albedo buffer in place.
 */
export function applyGrimeToAlbedo(
  albedoData: Uint8ClampedArray,
  grimeData: Uint8ClampedArray,
  strength = 1.0,
): void {
  const len = Math.min(albedoData.length, grimeData.length);
  const factor = Math.max(0.0, Math.min(1.0, strength));

  for (let i = 0; i < len; i += 4) {
    const mask = grimeData[i]! / 255.0; // 0..1
    const mult = 1.0 - (1.0 - mask) * factor;

    albedoData[i] = Math.round(albedoData[i]! * mult);
    albedoData[i + 1] = Math.round(albedoData[i + 1]! * mult);
    albedoData[i + 2] = Math.round(albedoData[i + 2]! * mult);
  }
}

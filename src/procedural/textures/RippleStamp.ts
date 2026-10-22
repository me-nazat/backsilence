/* ── RippleStamp.ts ──────────────────────────────────────────────────────
 *  Radial profile stamp texture and analytic equation for water impact ripples.
 *  Batch 1 uses this for the visual ripple quad; Batch 2 reuses it for GPU simulation.
 * ──────────────────────────────────────────────────────────────────────── */

import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, NoColorSpace } from 'three';
import { acquireCanvas } from '../core/canvasPool.js';

export interface RippleStampOptions {
  size?: number;
}

/**
 * Analytic 1D radial ripple profile function.
 * Normalized radial distance r in [0, 1].
 * Produces a main sharp crest and 2 trailing decaying rings with soft edge falloff.
 */
export function rippleProfile(r: number): number {
  if (r <= 0.0 || r >= 1.0) return 0.0;

  // Damped sinusoidal wave packet
  const wave = Math.sin(r * Math.PI * 6.0);
  // Quadratic falloff toward outer edge and center
  const envelope = (1.0 - r) * Math.sin(r * Math.PI);

  // Normalized height perturbation [0, 1] with 0.5 as resting level
  const height = wave * envelope * 0.9;
  return Math.max(0.0, Math.min(1.0, height * 0.5 + 0.5));
}

/**
 * Generate a 2D radial ripple stamp texture.
 */
export function makeRippleStamp(options: RippleStampOptions = {}): CanvasTexture {
  const size = options.size ?? 256;
  const half = size * 0.5;
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    const dy = (y - half + 0.5) / half;
    for (let x = 0; x < size; x++) {
      const dx = (x - half + 0.5) / half;
      const r = Math.hypot(dx, dy);

      const p = rippleProfile(r);
      const alpha = r >= 1.0 ? 0.0 : Math.pow(1.0 - r, 1.2);

      const idx = (y * size + x) * 4;
      const val = Math.round(p * 255);
      data[idx] = val; // R: height
      data[idx + 1] = val; // G
      data[idx + 2] = val; // B
      data[idx + 3] = Math.round(alpha * 255); // A: soft radial mask
    }
  }

  const pooled = acquireCanvas(size, size);
  const imgData = new ImageData(data, size, size);
  pooled.ctx.putImageData(imgData, 0, 0);

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}

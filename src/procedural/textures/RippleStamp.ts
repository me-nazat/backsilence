/* ── RippleStamp.ts ──────────────────────────────────────────────────────
 *  Radial profile stamp texture and analytic equation for water impact ripples.
 *  Batch 1 uses this for the visual ripple quad; Batch 2 reuses it for GPU simulation.
 * ──────────────────────────────────────────────────────────────────────── */

import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, NoColorSpace } from 'three';
import { acquireCanvas } from '../core/canvasPool.js';

export interface RippleStampOptions {
  size?: number;
}

export const RIPPLE_SPEED = 3.2;   // m/s
export const RIPPLE_LIFE  = 3.5;   // s
export const RIPPLE_K     = 11.0;  // rad/m (~0.57 m wavelength)

/**
 * Analytic ripple height at distance d (meters) from origin at time age (seconds) with given strength (0..1).
 * Matches the canonical GLSL water shader implementation in Section 6.1 exactly.
 */
export function rippleHeightAt(d: number, age: number, strength = 1.0): number {
  if (age < 0.0 || age > RIPPLE_LIFE) return 0.0;
  const x = d - RIPPLE_SPEED * age;             // distance from ring front
  const w = 0.28 + 0.22 * age;                  // ring thickens as it travels
  const env = Math.exp(-(x * x) / (w * w));     // gaussian ring window
  const life = 1.0 - age / RIPPLE_LIFE;
  const amp = (strength * life * life) / (1.0 + 0.8 * d);
  const ph = RIPPLE_K * x;
  return amp * env * Math.cos(ph) * 0.07;
}

/**
 * 1D radial profile for stamp generation, sampling the ripple wavepacket at age = 0.6s.
 */
export function rippleProfile(r: number): number {
  if (r <= 0.0 || r >= 1.0) return 0.0;
  // Map normalized 0..1 to radial physical distance [0, 3.0] m at age 0.6s
  const d = r * 3.0;
  const h = rippleHeightAt(d, 0.6, 1.0);
  // Normalize to [0, 1] range for 8-bit texture encoding
  return Math.max(0.0, Math.min(1.0, h * 10.0 + 0.5));
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

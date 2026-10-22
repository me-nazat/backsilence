/* ── AlgaeGlowMask.ts ──────────────────────────────────────────────────────
 *  Procedural organic bioluminescent algae/moss emissive mask for Map 5.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { createNoisePermutation, fbm2DTileable } from '../core/noise.js';
import { acquireCanvas } from '../core/canvasPool.js';

export function makeAlgaeGlowTexture(seed = 105, size = 256): CanvasTexture {
  const perm = createNoisePermutation(seed);
  const handle = acquireCanvas(size, size);
  const ctx = handle.ctx;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const invSize = 1.0 / size;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * size;
    for (let x = 0; x < size; x++) {
      const idx = (rowOffset + x) * 4;

      // High-contrast cellular clumping
      const n = fbm2DTileable(x * invSize * 6, y * invSize * 6, 6, 6, 3, 2.0, 0.5, perm);
      const glow = Math.max(0, Math.min(1, (n - 0.55) * 4.0));

      // Cyan-mint glow: #3ff2c8
      data[idx + 0] = Math.round(63 * glow);
      data[idx + 1] = Math.round(242 * glow);
      data[idx + 2] = Math.round(200 * glow);
      data[idx + 3] = Math.round(255 * glow);
    }
  }

  ctx.putImageData(img, 0, 0);

  const tex = new CanvasTexture(handle.canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

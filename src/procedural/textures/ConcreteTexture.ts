/* ── ConcreteTexture.ts ────────────────────────────────────────────────────
 *  Procedural architectural concrete PBR texture generator.
 *  Features formwork seams, tie-holes, efflorescence, stains, and tidemarks.
 *  Supports 'tunnel' (dark weathered) and 'filtration' (aqua-grey) variants.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
} from 'three';
import { createNoisePermutation, fbm2DTileable } from '../core/noise.js';
import { hexToRgb } from '../core/color.js';
import { acquireCanvas } from '../core/canvasPool.js';

export type ConcreteVariant = 'tunnel' | 'filtration';

export interface ConcreteSetResult {
  albedo: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
}

const PALETTE: Record<ConcreteVariant, { base: string; stain: string; seam: string }> = {
  tunnel: {
    base: '#3a3832',
    stain: '#22201b',
    seam: '#181612',
  },
  filtration: {
    base: '#586864',
    stain: '#3c4845',
    seam: '#283230',
  },
};

export function makeConcreteSet(
  variant: ConcreteVariant = 'tunnel',
  seed = 42,
  size = 512,
): ConcreteSetResult {
  const pal = PALETTE[variant];
  const perm = createNoisePermutation(seed);

  const albedoHandle = acquireCanvas(size, size);
  const normalHandle = acquireCanvas(size, size);
  const roughHandle = acquireCanvas(size, size);

  const albCtx = albedoHandle.ctx;
  const nrmCtx = normalHandle.ctx;
  const rghCtx = roughHandle.ctx;

  const albImg = albCtx.createImageData(size, size);
  const nrmImg = nrmCtx.createImageData(size, size);
  const rghImg = rghCtx.createImageData(size, size);

  const albData = albImg.data;
  const nrmData = nrmImg.data;
  const rghData = rghImg.data;

  const baseRgb = hexToRgb(pal.base);
  const stainRgb = hexToRgb(pal.stain);
  const seamRgb = hexToRgb(pal.seam);

  const invSize = 1.0 / size;
  const formworkRowH = Math.floor(size / 4); // 4 formwork panels vertically

  for (let y = 0; y < size; y++) {
    const rowOffset = y * size;
    const isSeam = y % formworkRowH < 2;

    for (let x = 0; x < size; x++) {
      const idx = (rowOffset + x) * 4;

      // Micro-roughness noise
      const nFine = fbm2DTileable(x * invSize * 16, y * invSize * 16, 16, 16, 4, 2.0, 0.5, perm);
      // Large mineral streaks and efflorescence
      const nBroad = fbm2DTileable(x * invSize * 2, y * invSize * 4, 2, 4, 3, 2.0, 0.5, perm);

      // Tie-hole check (2 tie holes per formwork panel)
      const isTieHole =
        (y % formworkRowH > formworkRowH * 0.45 && y % formworkRowH < formworkRowH * 0.55) &&
        ((x > size * 0.22 && x < size * 0.28) || (x > size * 0.72 && x < size * 0.78));

      let r = baseRgb.r;
      let g = baseRgb.g;
      let b = baseRgb.b;

      // Blend stain streaks
      const stainFactor = Math.max(0, nBroad * 1.4 - 0.2);
      r = r * (1 - stainFactor * 0.4) + stainRgb.r * (stainFactor * 0.4);
      g = g * (1 - stainFactor * 0.4) + stainRgb.g * (stainFactor * 0.4);
      b = b * (1 - stainFactor * 0.4) + stainRgb.b * (stainFactor * 0.4);

      // Micro variation
      const grain = (nFine - 0.5) * 24;
      r = Math.min(255, Math.max(0, r + grain));
      g = Math.min(255, Math.max(0, g + grain));
      b = Math.min(255, Math.max(0, b + grain));

      if (isSeam) {
        r = seamRgb.r;
        g = seamRgb.g;
        b = seamRgb.b;
      } else if (isTieHole) {
        r = 20;
        g = 18;
        b = 15;
      }

      albData[idx + 0] = Math.round(r);
      albData[idx + 1] = Math.round(g);
      albData[idx + 2] = Math.round(b);
      albData[idx + 3] = 255;

      // Normal map
      const dx = (fbm2DTileable((x + 1) * invSize * 16, y * invSize * 16, 16, 16, 2, 2.0, 0.5, perm) - nFine) * 128;
      const dy = (fbm2DTileable(x * invSize * 16, (y + 1) * invSize * 16, 16, 16, 2, 2.0, 0.5, perm) - nFine) * 128;
      nrmData[idx + 0] = Math.min(255, Math.max(0, Math.round(128 + dx)));
      nrmData[idx + 1] = Math.min(255, Math.max(0, Math.round(128 - dy)));
      nrmData[idx + 2] = 255;
      nrmData[idx + 3] = 255;

      // Roughness (weathered concrete: 0.65 - 0.95)
      const roughVal = isSeam ? 240 : Math.round(170 + nFine * 60);
      rghData[idx + 0] = roughVal;
      rghData[idx + 1] = roughVal;
      rghData[idx + 2] = roughVal;
      rghData[idx + 3] = 255;
    }
  }

  albCtx.putImageData(albImg, 0, 0);
  nrmCtx.putImageData(nrmImg, 0, 0);
  rghCtx.putImageData(rghImg, 0, 0);

  const albedo = new CanvasTexture(albedoHandle.canvas);
  albedo.wrapS = RepeatWrapping;
  albedo.wrapT = RepeatWrapping;
  albedo.colorSpace = SRGBColorSpace;

  const normal = new CanvasTexture(normalHandle.canvas);
  normal.wrapS = RepeatWrapping;
  normal.wrapT = RepeatWrapping;
  normal.colorSpace = NoColorSpace;

  const roughness = new CanvasTexture(roughHandle.canvas);
  roughness.wrapS = RepeatWrapping;
  roughness.wrapT = RepeatWrapping;
  roughness.colorSpace = NoColorSpace;

  return { albedo, normal, roughness };
}

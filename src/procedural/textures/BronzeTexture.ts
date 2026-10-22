/* ── BronzeTexture.ts ──────────────────────────────────────────────────────
 *  Procedural oxidized bronze PBR texture generator with verdigris patina.
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

export interface BronzeSetResult {
  albedo: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
  metalness: CanvasTexture;
}

export function makeBronzeSet(seed = 88, size = 256): BronzeSetResult {
  const perm = createNoisePermutation(seed);

  const albedoHandle = acquireCanvas(size, size);
  const normalHandle = acquireCanvas(size, size);
  const roughHandle = acquireCanvas(size, size);
  const metalHandle = acquireCanvas(size, size);

  const albCtx = albedoHandle.ctx;
  const nrmCtx = normalHandle.ctx;
  const rghCtx = roughHandle.ctx;
  const metCtx = metalHandle.ctx;

  const albImg = albCtx.createImageData(size, size);
  const nrmImg = nrmCtx.createImageData(size, size);
  const rghImg = rghCtx.createImageData(size, size);
  const metImg = metCtx.createImageData(size, size);

  const albData = albImg.data;
  const nrmData = nrmImg.data;
  const rghData = rghImg.data;
  const metData = metImg.data;

  const bronzeRgb = hexToRgb('#755431');
  const patinaRgb = hexToRgb('#4a8570');
  const invSize = 1.0 / size;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * size;
    for (let x = 0; x < size; x++) {
      const idx = (rowOffset + x) * 4;

      const nNoise = fbm2DTileable(x * invSize * 6, y * invSize * 6, 6, 6, 3, 2.0, 0.5, perm);
      const isPatina = nNoise > 0.62;
      const patinaAlpha = Math.max(0, Math.min(1, (nNoise - 0.58) * 5.0));

      const r = bronzeRgb.r * (1 - patinaAlpha) + patinaRgb.r * patinaAlpha;
      const g = bronzeRgb.g * (1 - patinaAlpha) + patinaRgb.g * patinaAlpha;
      const b = bronzeRgb.b * (1 - patinaAlpha) + patinaRgb.b * patinaAlpha;

      albData[idx + 0] = Math.round(r);
      albData[idx + 1] = Math.round(g);
      albData[idx + 2] = Math.round(b);
      albData[idx + 3] = 255;

      // Subtle hammered relief
      const dx = (fbm2DTileable((x + 1) * invSize * 6, y * invSize * 6, 6, 6, 2, 2.0, 0.5, perm) - nNoise) * 64;
      const dy = (fbm2DTileable(x * invSize * 6, (y + 1) * invSize * 6, 6, 6, 2, 2.0, 0.5, perm) - nNoise) * 64;
      nrmData[idx + 0] = Math.min(255, Math.max(0, Math.round(128 + dx)));
      nrmData[idx + 1] = Math.min(255, Math.max(0, Math.round(128 - dy)));
      nrmData[idx + 2] = 255;
      nrmData[idx + 3] = 255;

      rghData[idx + 0] = isPatina ? 190 : 75;
      rghData[idx + 1] = isPatina ? 190 : 75;
      rghData[idx + 2] = isPatina ? 190 : 75;
      rghData[idx + 3] = 255;

      metData[idx + 0] = isPatina ? 25 : 210;
      metData[idx + 1] = isPatina ? 25 : 210;
      metData[idx + 2] = isPatina ? 25 : 210;
      metData[idx + 3] = 255;
    }
  }

  albCtx.putImageData(albImg, 0, 0);
  nrmCtx.putImageData(nrmImg, 0, 0);
  rghCtx.putImageData(rghImg, 0, 0);
  metCtx.putImageData(metImg, 0, 0);

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

  const metalness = new CanvasTexture(metalHandle.canvas);
  metalness.wrapS = RepeatWrapping;
  metalness.wrapT = RepeatWrapping;
  metalness.colorSpace = NoColorSpace;

  return { albedo, normal, roughness, metalness };
}

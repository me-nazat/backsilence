/* ── MarbleTexture.ts ──────────────────────────────────────────────────────
 *  Procedural domain-warped veined Italian marble PBR texture generator.
 *  Produces organic branching mineral veins and polished specular roughness.
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

export interface MarbleSetResult {
  albedo: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
}

export function makeMarbleSet(seed = 42, size = 512): MarbleSetResult {
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

  const baseRgb = hexToRgb('#e2e5e8');
  const veinRgb = hexToRgb('#4e5860');
  const goldRgb = hexToRgb('#bfa065');
  const invSize = 1.0 / size;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * size;
    for (let x = 0; x < size; x++) {
      const idx = (rowOffset + x) * 4;

      // Domain warping for turbulent organic veins
      const qx = fbm2DTileable(x * invSize * 4, y * invSize * 4, 4, 4, 3, 2.0, 0.5, perm);
      const qy = fbm2DTileable((x + 10) * invSize * 4, (y + 10) * invSize * 4, 4, 4, 3, 2.0, 0.5, perm);

      const vx = x * invSize * 6 + qx * 1.5;
      const vy = y * invSize * 6 + qy * 1.5;
      const veinNoise = Math.sin(vx * Math.PI * 2.0 + fbm2DTileable(vx, vy, 6, 6, 4, 2.0, 0.5, perm) * 4.0);
      const veinSharp = Math.pow(Math.abs(veinNoise), 12.0);

      const isGold = (qx > 0.65);
      const vColor = isGold ? goldRgb : veinRgb;

      const r = baseRgb.r * (1 - veinSharp) + vColor.r * veinSharp;
      const g = baseRgb.g * (1 - veinSharp) + vColor.g * veinSharp;
      const b = baseRgb.b * (1 - veinSharp) + vColor.b * veinSharp;

      albData[idx + 0] = Math.round(r);
      albData[idx + 1] = Math.round(g);
      albData[idx + 2] = Math.round(b);
      albData[idx + 3] = 255;

      // Subtle surface relief on veins
      nrmData[idx + 0] = Math.min(255, Math.max(0, Math.round(128 + (qx - 0.5) * 40)));
      nrmData[idx + 1] = Math.min(255, Math.max(0, Math.round(128 + (qy - 0.5) * 40)));
      nrmData[idx + 2] = 255;
      nrmData[idx + 3] = 255;

      // Polished specular roughness (0.15 - 0.28)
      const rghVal = Math.round(40 + veinSharp * 35);
      rghData[idx + 0] = rghVal;
      rghData[idx + 1] = rghVal;
      rghData[idx + 2] = rghVal;
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

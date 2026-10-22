/* ── RustMetalTexture.ts ───────────────────────────────────────────────────
 *  Procedural rusted industrial metal and alpha-tested grating texture generator.
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

export interface MetalSetResult {
  albedo: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
  metalness: CanvasTexture;
}

export function makeRustMetalSet(seed = 42, size = 512): MetalSetResult {
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

  const metalRgb = hexToRgb('#4a4d52');
  const rustRgb = hexToRgb('#873e23');
  const invSize = 1.0 / size;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * size;
    for (let x = 0; x < size; x++) {
      const idx = (rowOffset + x) * 4;

      const nRust = fbm2DTileable(x * invSize * 4, y * invSize * 4, 4, 4, 4, 2.0, 0.5, perm);
      const isRust = nRust > 0.48;
      const rustMix = Math.max(0, Math.min(1, (nRust - 0.45) * 6.0));

      const r = metalRgb.r * (1 - rustMix) + rustRgb.r * rustMix;
      const g = metalRgb.g * (1 - rustMix) + rustRgb.g * rustMix;
      const b = metalRgb.b * (1 - rustMix) + rustRgb.b * rustMix;

      albData[idx + 0] = Math.round(r);
      albData[idx + 1] = Math.round(g);
      albData[idx + 2] = Math.round(b);
      albData[idx + 3] = 255;

      // Normals
      const dx = (fbm2DTileable((x + 1) * invSize * 4, y * invSize * 4, 4, 4, 2, 2.0, 0.5, perm) - nRust) * 96;
      const dy = (fbm2DTileable(x * invSize * 4, (y + 1) * invSize * 4, 4, 4, 2, 2.0, 0.5, perm) - nRust) * 96;
      nrmData[idx + 0] = Math.min(255, Math.max(0, Math.round(128 + dx)));
      nrmData[idx + 1] = Math.min(255, Math.max(0, Math.round(128 - dy)));
      nrmData[idx + 2] = 255;
      nrmData[idx + 3] = 255;

      // Roughness & Metalness
      rghData[idx + 0] = isRust ? 210 : 80;
      rghData[idx + 1] = isRust ? 210 : 80;
      rghData[idx + 2] = isRust ? 210 : 80;
      rghData[idx + 3] = 255;

      metData[idx + 0] = isRust ? 30 : 220;
      metData[idx + 1] = isRust ? 30 : 220;
      metData[idx + 2] = isRust ? 30 : 220;
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

export function makeGrateTexture(size = 256): CanvasTexture {
  const handle = acquireCanvas(size, size);
  const ctx = handle.ctx;

  // Background alpha: transparent (perforations)
  ctx.clearRect(0, 0, size, size);

  // Metal bar grid
  ctx.fillStyle = '#3c4046';
  ctx.fillRect(0, 0, size, size);

  // Cut out square or hexagonal perforation holes
  ctx.globalCompositeOperation = 'destination-out';
  const cellSize = size / 8;
  const holeSize = cellSize * 0.65;

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillRect(
        x * cellSize + (cellSize - holeSize) * 0.5,
        y * cellSize + (cellSize - holeSize) * 0.5,
        holeSize,
        holeSize,
      );
    }
  }

  ctx.globalCompositeOperation = 'source-over';

  const tex = new CanvasTexture(handle.canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

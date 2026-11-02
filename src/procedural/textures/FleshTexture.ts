/* ── FleshTexture.ts ───────────────────────────────────────────────────────
 *  Procedural PBR Hide Texture Suite for the Reference Creature (`f_010`, `f_018`).
 *  Produces mottled wet brown-grey dermis carrier with subtle reddish blotches
 *  (coverage <= 12%, chroma delta <= 0.05), seed-pod pore bump relief, wet
 *  roughness map, and shallow subsurface translucency mask.
 *  Zero binary assets.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
} from 'three';
import { Rng } from '../core/prng.js';
import { createNoisePermutation, fbm2DTileable } from '../core/noise.js';
import { hexToRgb } from '../core/color.js';
import { acquireCanvas } from '../core/canvasPool.js';

export interface FleshTextureOptions {
  size?: number;
  seed?: number;
}

export interface FleshTextureResult {
  albedo: CanvasTexture;
  bump: CanvasTexture;
  roughness: CanvasTexture;
  subsurface?: CanvasTexture;
  blotchCoverage: number;
  maxChromaDelta: number;
}

export function generateFleshTextures(options: FleshTextureOptions = {}): FleshTextureResult {
  const defaultSize = typeof window !== 'undefined' ? 1024 : 512;
  const size = options.size ?? defaultSize;
  const seed = options.seed ?? 65432;
  const rng = new Rng(seed);
  const perm = createNoisePermutation(seed);

  // Neutral-normalized carrier palette so MeshStandardMaterial.color (#5a5035 / #59462d)
  // preserves exact reference palette value while adding organic mottling and <=12% reddish blotches (f_018).
  const hideLight = { r: 248, g: 246, b: 240 };
  const hideDark = { r: 224, g: 226, b: 218 };
  // Subdued reddish blotch tint (chroma delta <= 0.05, R <= G * 1.12 in carrier)
  const reddishBlotch = { r: 244, g: 224, b: 214 };
  const transluTint = hexToRgb('#5a5035');

  const albedoData = new Uint8ClampedArray(size * size * 4);
  const bumpData = new Uint8ClampedArray(size * size * 4);
  const roughData = new Uint8ClampedArray(size * size * 4);
  const subData = new Uint8ClampedArray(size * size * 4);

  const numVoronoiCells = 32;
  const voronoiPoints: [number, number][] = [];
  for (let i = 0; i < numVoronoiCells; i++) {
    voronoiPoints.push([rng.next(), rng.next()]);
  }

  const invSize = 1.0 / size;
  let blotchPixels = 0;
  let maxChromaDelta = 0;
  const totalPixels = size * size;

  for (let y = 0; y < size; y++) {
    const ny = y * invSize;
    const row = y * size;

    for (let x = 0; x < size; x++) {
      const nx = x * invSize;
      const idx = (row + x) * 4;

      const fineGrain = fbm2DTileable(nx * 16, ny * 16, 16, 16, 4, 2.0, 0.5, perm);
      const ribStriation = Math.sin((nx * 24.0 + ny * 10.0) + fineGrain * 2.2) * 0.5 + 0.5;
      const largeBlotch = fbm2DTileable(nx * 4, ny * 4, 4, 4, 3, 2.0, 0.5, perm);
      const moistureWarp = fbm2DTileable((nx + 0.35) * 6, (ny + 0.65) * 6, 6, 6, 3, 2.0, 0.5, perm);

      const warpX = nx + moistureWarp * 0.06;
      const warpY = ny + fineGrain * 0.06;

      let d1 = 1.0;
      let d2 = 1.0;
      for (let i = 0; i < numVoronoiCells; i++) {
        const [vx, vy] = voronoiPoints[i]!;
        let dx = Math.abs(warpX - vx);
        if (dx > 0.5) dx = 1.0 - dx;
        let dy = Math.abs(warpY - vy);
        if (dy > 0.5) dy = 1.0 - dy;
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }

      const creaseFactor = Math.max(0, 1.0 - Math.abs(d2 - d1) * 38.0);
      const creaseIntensity = Math.pow(creaseFactor, 2.4);

      const baseT = Math.max(0, Math.min(1, fineGrain * 0.5 + 0.5));
      const baseR = hideDark.r + (hideLight.r - hideDark.r) * baseT;
      const baseG = hideDark.g + (hideLight.g - hideDark.g) * baseT;
      const baseB = hideDark.b + (hideLight.b - hideDark.b) * baseT;

      let r = baseR;
      let g = baseG;
      let b = baseB;

      // Reddish blotches (f_018): gated so coverage <= 12% and chroma delta <= 0.05
      if (largeBlotch > 0.14 && ribStriation > 0.62) {
        blotchPixels++;
        const bt = Math.min(0.38, (largeBlotch - 0.14) * 0.90);
        r = baseR * (1.0 - bt) + reddishBlotch.r * bt;
        g = baseG * (1.0 - bt) + reddishBlotch.g * bt;
        b = baseB * (1.0 - bt) + reddishBlotch.b * bt;

        const baseChroma = (Math.max(baseR, baseG, baseB) - Math.min(baseR, baseG, baseB)) / 255.0;
        const curChroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255.0;
        const deltaC = Math.abs(curChroma - baseChroma);
        if (deltaC > maxChromaDelta) {
          maxChromaDelta = deltaC;
        }
      }

      albedoData[idx] = Math.round(r);
      albedoData[idx + 1] = Math.round(g);
      albedoData[idx + 2] = Math.round(b);
      albedoData[idx + 3] = 255;

      // Normal / Bump map (pores + gaunt rib striations + dermal creases)
      const poreVal = fineGrain * 0.35 + ribStriation * 0.30 + creaseIntensity * 0.35;
      const bumpVal = Math.round(Math.max(0, Math.min(255, poreVal * 255)));
      bumpData[idx] = bumpVal;
      bumpData[idx + 1] = bumpVal;
      bumpData[idx + 2] = bumpVal;
      bumpData[idx + 3] = 255;

      // Wet hide roughness map (0.20..0.48)
      const moistureChannel = Math.max(0, Math.min(1, moistureWarp * 0.6 + creaseIntensity * 0.4));
      const roughFloat = 0.44 - moistureChannel * 0.22 + (1.0 - baseT) * 0.06;
      const roughVal = Math.round(Math.max(45, Math.min(130, roughFloat * 255)));
      roughData[idx] = roughVal;
      roughData[idx + 1] = roughVal;
      roughData[idx + 2] = roughVal;
      roughData[idx + 3] = 255;

      // Subsurface thickness mask for forearms & thin flanks
      const subFloat = Math.max(0.15, Math.min(1.0, 0.45 + largeBlotch * 0.35 + (1.0 - creaseIntensity) * 0.20));
      subData[idx] = Math.round(transluTint.r * subFloat);
      subData[idx + 1] = Math.round(transluTint.g * subFloat);
      subData[idx + 2] = Math.round(transluTint.b * subFloat);
      subData[idx + 3] = 255;
    }
  }

  const blotchCoverage = blotchPixels / totalPixels;

  const makeImg = (d: Uint8ClampedArray): ImageData =>
    typeof ImageData !== 'undefined'
      ? new ImageData(d, size, size)
      : ({ data: d, width: size, height: size } as unknown as ImageData);

  const albedoCanvas = acquireCanvas(size, size);
  albedoCanvas.ctx.putImageData(makeImg(albedoData), 0, 0);
  const albedoTex = new CanvasTexture(albedoCanvas.canvas as HTMLCanvasElement);
  albedoTex.wrapS = RepeatWrapping;
  albedoTex.wrapT = RepeatWrapping;
  albedoTex.colorSpace = SRGBColorSpace;
  albedoTex.needsUpdate = true;

  const bumpCanvas = acquireCanvas(size, size);
  bumpCanvas.ctx.putImageData(makeImg(bumpData), 0, 0);
  const bumpTex = new CanvasTexture(bumpCanvas.canvas as HTMLCanvasElement);
  bumpTex.wrapS = RepeatWrapping;
  bumpTex.wrapT = RepeatWrapping;
  bumpTex.colorSpace = NoColorSpace;
  bumpTex.needsUpdate = true;

  const roughCanvas = acquireCanvas(size, size);
  roughCanvas.ctx.putImageData(makeImg(roughData), 0, 0);
  const roughTex = new CanvasTexture(roughCanvas.canvas as HTMLCanvasElement);
  roughTex.wrapS = RepeatWrapping;
  roughTex.wrapT = RepeatWrapping;
  roughTex.colorSpace = NoColorSpace;
  roughTex.needsUpdate = true;

  const subCanvas = acquireCanvas(size, size);
  subCanvas.ctx.putImageData(makeImg(subData), 0, 0);
  const subTex = new CanvasTexture(subCanvas.canvas as HTMLCanvasElement);
  subTex.wrapS = RepeatWrapping;
  subTex.wrapT = RepeatWrapping;
  subTex.colorSpace = SRGBColorSpace;
  subTex.needsUpdate = true;

  return {
    albedo: albedoTex,
    bump: bumpTex,
    roughness: roughTex,
    subsurface: subTex,
    blotchCoverage,
    maxChromaDelta,
  };
}

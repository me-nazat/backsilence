/* ── FleshTexture.ts ───────────────────────────────────────────────────────
 *  High-Resolution Visceral Body-Horror PBR Texture Suite for the Blind Monster.
 *  Produces 1024x1024 (512x512 in headless test) necrotic dermis, dark venous
 *  networks, exposed crimson-black muscle striations, wet mucus roughness, and
 *  subsurface acoustic membrane masks.
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
}

export function generateFleshTextures(options: FleshTextureOptions = {}): FleshTextureResult {
  const defaultSize = typeof window !== 'undefined' ? 1024 : 512;
  const size = options.size ?? defaultSize;
  const seed = options.seed ?? 65432;
  const rng = new Rng(seed);
  const perm = createNoisePermutation(seed);

  // Necrotic Body-Horror Palette
  const pallorLight = hexToRgb('#484d44'); // Necrotic waterlogged pale grey-green
  const pallorDark = hexToRgb('#2a2d28');  // Deep corpse grey
  const lividity = hexToRgb('#1d1522');    // Deep bruised venous lividity
  const rawFascia = hexToRgb('#3d1012');   // Exposed crimson-black muscle fascia
  const veinColor = hexToRgb('#240d28');   // Branching dark-violet subcutaneous veins
  const oralBlood = hexToRgb('#520e14');   // Deep mucosal crimson

  const albedoData = new Uint8ClampedArray(size * size * 4);
  const bumpData = new Uint8ClampedArray(size * size * 4);
  const roughData = new Uint8ClampedArray(size * size * 4);
  const subData = new Uint8ClampedArray(size * size * 4);

  // Pre-generate feature points for toroidal cellular Worley vein & pore network
  const numVoronoiCells = 32;
  const voronoiPoints: [number, number][] = [];
  for (let i = 0; i < numVoronoiCells; i++) {
    voronoiPoints.push([rng.next(), rng.next()]);
  }

  // Domain warp lookup or scaling factors
  const invSize = 1.0 / size;

  for (let y = 0; y < size; y++) {
    const ny = y * invSize;
    const row = y * size;

    for (let x = 0; x < size; x++) {
      const nx = x * invSize;
      const idx = (row + x) * 4;

      // 1. Multi-octave organic skin grain & tendon striations
      const fineGrain = fbm2DTileable(nx, ny, 16, 16, 4, 0.5, 2.0, perm);
      const muscleStriation = Math.sin((nx * 32.0 + ny * 12.0) + fineGrain * 3.0) * 0.5 + 0.5;
      const largeBlotch = fbm2DTileable(nx, ny, 4, 4, 3, 0.5, 2.0, perm);
      const slimeWarp = fbm2DTileable(nx + 0.35, ny + 0.65, 6, 6, 3, 0.5, 2.0, perm);

      // 2. Domain-warped cellular distance for branching subcutaneous vein network
      const warpX = nx + (slimeWarp - 0.5) * 0.08;
      const warpY = ny + (fineGrain - 0.5) * 0.08;

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

      // Sharp vein ridges along cell boundaries (d2 - d1)
      const veinFactor = Math.max(0, 1.0 - Math.abs(d2 - d1) * 38.0);
      const veinIntensity = Math.pow(veinFactor, 2.4);

      // 3. Composite Necrotic Albedo
      const baseT = Math.max(0, Math.min(1, fineGrain * 0.5 + 0.5));
      let r = pallorDark.r + (pallorLight.r - pallorDark.r) * baseT;
      let g = pallorDark.g + (pallorLight.g - pallorDark.g) * baseT;
      let b = pallorDark.b + (pallorLight.b - pallorDark.b) * baseT;

      // Bruised lividity mottling
      if (largeBlotch > 0.15) {
        const lt = Math.min(1.0, (largeBlotch - 0.15) * 1.8);
        r = r * (1.0 - lt) + lividity.r * lt;
        g = g * (1.0 - lt) + lividity.g * lt;
        b = b * (1.0 - lt) + lividity.b * lt;
      }

      // Raw muscle fascia along striated channels
      if (muscleStriation > 0.65 && largeBlotch < 0.45) {
        const mt = (muscleStriation - 0.65) * 2.0;
        r = r * (1.0 - mt) + rawFascia.r * mt;
        g = g * (1.0 - mt) + rawFascia.g * mt;
        b = b * (1.0 - mt) + rawFascia.b * mt;
      }

      // Branching dark-violet subcutaneous veins
      if (veinIntensity > 0.05) {
        r = r * (1.0 - veinIntensity) + veinColor.r * veinIntensity;
        g = g * (1.0 - veinIntensity) + veinColor.g * veinIntensity;
        b = b * (1.0 - veinIntensity) + veinColor.b * veinIntensity;
      }

      albedoData[idx] = Math.round(r);
      albedoData[idx + 1] = Math.round(g);
      albedoData[idx + 2] = Math.round(b);
      albedoData[idx + 3] = 255;

      // 4. Normal / Bump map (sharp pores + muscle striations + raised vein relief)
      const poreVal = (fineGrain * 0.35 + muscleStriation * 0.25 + veinIntensity * 0.40);
      const bumpVal = Math.round(Math.max(0, Math.min(255, poreVal * 255)));
      bumpData[idx] = bumpVal;
      bumpData[idx + 1] = bumpVal;
      bumpData[idx + 2] = bumpVal;
      bumpData[idx + 3] = 255;

      // 5. Roughness map (0.14-0.28 in wet mucus channels, 0.45 on scarred calluses)
      const mucusChannel = Math.max(0, Math.min(1, slimeWarp * 0.6 + veinIntensity * 0.4));
      const roughFloat = 0.45 - mucusChannel * 0.28 + (1.0 - baseT) * 0.08;
      const roughVal = Math.round(Math.max(35, Math.min(130, roughFloat * 255)));
      roughData[idx] = roughVal;
      roughData[idx + 1] = roughVal;
      roughData[idx + 2] = roughVal;
      roughData[idx + 3] = 255;

      // 6. Subsurface / Acoustic membrane glow mask
      const subFloat = Math.max(0, Math.min(1, (largeBlotch * 0.5 + veinIntensity * 0.5)));
      subData[idx] = Math.round(oralBlood.r * subFloat);
      subData[idx + 1] = Math.round(oralBlood.g * subFloat);
      subData[idx + 2] = Math.round(oralBlood.b * subFloat);
      subData[idx + 3] = 255;
    }
  }

  const makeImg = (d: Uint8ClampedArray): ImageData =>
    typeof ImageData !== 'undefined'
      ? new ImageData(d, size, size)
      : ({ data: d, width: size, height: size } as unknown as ImageData);

  // Create Three.js CanvasTextures
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
  };
}

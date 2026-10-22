/* ── FleshTexture.ts ───────────────────────────────────────────────────────
 *  Procedural organic skin texture for the Blind Monster.
 *  Produces wet, fleshy, veined albedo, bump, and roughness maps with zero external assets.
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
}

export function generateFleshTextures(options: FleshTextureOptions = {}): FleshTextureResult {
  const size = options.size ?? 256;
  const seed = options.seed ?? 65432;
  const rng = new Rng(seed);
  const perm = createNoisePermutation(seed);

  const baseLight = hexToRgb('#7a4a38'); // Brown-red base
  const baseDark = hexToRgb('#5e3326');  // Deep red shadow
  const veinColor = hexToRgb('#3d1814'); // Dark red-purple vein
  const blotchColor = hexToRgb('#8c5945'); // Paler blotch

  const albedoData = new Uint8ClampedArray(size * size * 4);
  const bumpData = new Uint8ClampedArray(size * size * 4);
  const roughData = new Uint8ClampedArray(size * size * 4);

  // Pre-generate feature points for cellular Voronoi vein network
  const numVoronoiCells = 24;
  const voronoiPoints: [number, number][] = [];
  for (let i = 0; i < numVoronoiCells; i++) {
    voronoiPoints.push([rng.next(), rng.next()]);
  }

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    const row = y * size;

    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const idx = (row + x) * 4;

      // 1. Multi-octave organic skin grain
      const grain = fbm2DTileable(nx, ny, 16, 16, 4, 0.5, 2.0, perm);
      const largeBlotch = fbm2DTileable(nx, ny, 4, 4, 3, 0.5, 2.0, perm);

      // 2. Toroidal cellular distance for branching vein network
      let d1 = 1.0;
      let d2 = 1.0;
      for (let i = 0; i < numVoronoiCells; i++) {
        const [vx, vy] = voronoiPoints[i]!;
        // Wrap toroidal distance
        let dx = Math.abs(nx - vx);
        if (dx > 0.5) dx = 1.0 - dx;
        let dy = Math.abs(ny - vy);
        if (dy > 0.5) dy = 1.0 - dy;
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }

      // Vein ridges along Voronoi cell boundaries (d2 - d1)
      const veinFactor = Math.max(0, 1.0 - Math.abs(d2 - d1) * 35.0);
      const veinIntensity = Math.pow(veinFactor, 2.2);

      // 3. Composite Albedo
      const baseT = Math.max(0, Math.min(1, grain * 0.5 + 0.5));
      let r = baseDark.r + (baseLight.r - baseDark.r) * baseT;
      let g = baseDark.g + (baseLight.g - baseDark.g) * baseT;
      let b = baseDark.b + (baseLight.b - baseDark.b) * baseT;

      // Apply blotches
      if (largeBlotch > 0.2) {
        const bt = Math.min(1.0, (largeBlotch - 0.2) * 1.5);
        r = r * (1 - bt) + blotchColor.r * bt;
        g = g * (1 - bt) + blotchColor.g * bt;
        b = b * (1 - bt) + blotchColor.b * bt;
      }

      // Apply veins
      r = r * (1 - veinIntensity) + veinColor.r * veinIntensity;
      g = g * (1 - veinIntensity) + veinColor.g * veinIntensity;
      b = b * (1 - veinIntensity) + veinColor.b * veinIntensity;

      albedoData[idx] = Math.round(r);
      albedoData[idx + 1] = Math.round(g);
      albedoData[idx + 2] = Math.round(b);
      albedoData[idx + 3] = 255;

      // 4. Bump map (pores + raised vein ridges)
      const bumpVal = Math.round(Math.max(0, Math.min(255, (grain * 0.3 + veinIntensity * 0.7) * 255)));
      bumpData[idx] = bumpVal;
      bumpData[idx + 1] = bumpVal;
      bumpData[idx + 2] = bumpVal;
      bumpData[idx + 3] = 255;

      // 5. Roughness map (base 0.4, slick wet spots lower roughness down to 0.15)
      const wetSpots = Math.max(0, Math.min(1, fbm2DTileable(nx + 0.3, ny + 0.7, 8, 8, 3, 0.5, 2.0, perm)));
      const roughVal = Math.round(Math.max(38, Math.min(128, (0.4 - wetSpots * 0.25 + veinIntensity * 0.1) * 255)));
      roughData[idx] = roughVal;
      roughData[idx + 1] = roughVal;
      roughData[idx + 2] = roughVal;
      roughData[idx + 3] = 255;
    }
  }

  // Create Three.js CanvasTextures
  const albedoCanvas = acquireCanvas(size, size);
  albedoCanvas.ctx.putImageData(new ImageData(albedoData, size, size), 0, 0);
  const albedoTex = new CanvasTexture(albedoCanvas.canvas as HTMLCanvasElement);
  albedoTex.wrapS = RepeatWrapping;
  albedoTex.wrapT = RepeatWrapping;
  albedoTex.colorSpace = SRGBColorSpace;
  albedoTex.needsUpdate = true;

  const bumpCanvas = acquireCanvas(size, size);
  bumpCanvas.ctx.putImageData(new ImageData(bumpData, size, size), 0, 0);
  const bumpTex = new CanvasTexture(bumpCanvas.canvas as HTMLCanvasElement);
  bumpTex.wrapS = RepeatWrapping;
  bumpTex.wrapT = RepeatWrapping;
  bumpTex.colorSpace = NoColorSpace;
  bumpTex.needsUpdate = true;

  const roughCanvas = acquireCanvas(size, size);
  roughCanvas.ctx.putImageData(new ImageData(roughData, size, size), 0, 0);
  const roughTex = new CanvasTexture(roughCanvas.canvas as HTMLCanvasElement);
  roughTex.wrapS = RepeatWrapping;
  roughTex.wrapT = RepeatWrapping;
  roughTex.colorSpace = NoColorSpace;
  roughTex.needsUpdate = true;

  return {
    albedo: albedoTex,
    bump: bumpTex,
    roughness: roughTex,
  };
}

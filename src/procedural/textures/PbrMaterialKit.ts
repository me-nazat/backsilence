/* ── PbrMaterialKit.ts ─────────────────────────────────────────────────────
 *  Procedural PBR texture sets (albedo, normal, roughness, ambient occlusion)
 *  for all 13 canonical architectural and natural surface materials:
 *  tile, concrete, marble, metal, wood, parquet, linoleum, moss, mud, bark,
 *  asphalt, subway_tile, and stained_glass.
 *  Uses memory-pooled canvases, seeded noise, and cache by (kind, params, seed).
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
  LinearMipmapLinearFilter,
  LinearFilter,
} from 'three';
import { createNoisePermutation, fbm2DTileable } from '../core/noise.js';
import { acquireCanvas } from '../core/canvasPool.js';

export type PbrMaterialKind =
  | 'tile'
  | 'concrete'
  | 'marble'
  | 'metal'
  | 'wood'
  | 'parquet'
  | 'linoleum'
  | 'moss'
  | 'mud'
  | 'bark'
  | 'asphalt'
  | 'subway_tile'
  | 'stained_glass';

export interface PbrSetResult {
  kind: PbrMaterialKind;
  albedo: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
  ao: CanvasTexture;
}

export interface PbrKitOptions {
  kind: PbrMaterialKind;
  seed?: number;
  size?: number;
  anisotropy?: number;
}

const pbrCache = new Map<string, PbrSetResult>();

/**
 * Procedural generator for 13 distinct PBR surface sets.
 */
export function makePbrMaterialSet(options: PbrKitOptions): PbrSetResult {
  const kind = options.kind;
  const seed = options.seed ?? 42;
  const size = options.size ?? 256;
  const anisotropy = options.anisotropy ?? 4;
  const cacheKey = `${kind}:${seed}:${size}`;

  const cached = pbrCache.get(cacheKey);
  if (cached) return cached;

  const perm = createNoisePermutation(seed);

  const albedoHandle = acquireCanvas(size, size);
  const normalHandle = acquireCanvas(size, size);
  const roughHandle = acquireCanvas(size, size);
  const aoHandle = acquireCanvas(size, size);

  const albCtx = albedoHandle.ctx;
  const nrmCtx = normalHandle.ctx;
  const rghCtx = roughHandle.ctx;
  const aoCtx = aoHandle.ctx;

  const albImg = albCtx.createImageData(size, size);
  const nrmImg = nrmCtx.createImageData(size, size);
  const rghImg = rghCtx.createImageData(size, size);
  const aoImg = aoCtx.createImageData(size, size);

  const aData = albImg.data;
  const nData = nrmImg.data;
  const rData = rghImg.data;
  const oData = aoImg.data;

  // Height map buffer for Sobel normal and AO computation
  const heightMap = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const idx = (y * size + x) * 4;
      const hIdx = y * size + x;

      let r = 180, g = 180, b = 180;
      let roughness = 180;
      let height = 0.5;
      let ao = 255;

      const n1 = fbm2DTileable(nx, ny, 4.0, 4.0, 3, 2.0, 0.5, perm);
      const n2 = fbm2DTileable(nx, ny, 12.0, 12.0, 2, 2.0, 0.5, perm);
      const n3 = fbm2DTileable(nx, ny, 32.0, 32.0, 2, 2.0, 0.5, perm);

      switch (kind) {
        case 'tile': {
          // 8x8 square tile grid with grout
          const tx = (nx * 8.0) % 1.0;
          const ty = (ny * 8.0) % 1.0;
          const isGrout = tx < 0.06 || ty < 0.06;
          if (isGrout) {
            r = 90; g = 80; b = 65;
            roughness = 230;
            height = 0.2;
            ao = 160;
          } else {
            const glaze = n2 * 25;
            r = Math.min(255, 230 + glaze);
            g = Math.min(255, 220 + glaze);
            b = Math.min(190 + glaze, 240);
            roughness = 60 + Math.floor(n3 * 40);
            height = 0.85;
            ao = 255;
          }
          break;
        }

        case 'subway_tile': {
          // 2:1 rectangular offset brick pattern
          const row = Math.floor(ny * 8.0);
          const xOffset = (row % 2) * 0.5;
          const tx = ((nx + xOffset) * 4.0) % 1.0;
          const ty = (ny * 8.0) % 1.0;
          const edgeDist = Math.min(tx, 1.0 - tx, ty * 2.0, (1.0 - ty) * 2.0);
          const isGrout = tx < 0.05 || ty < 0.06;
          if (isGrout) {
            r = 70; g = 65; b = 60;
            roughness = 240;
            height = 0.15;
            ao = 140;
          } else {
            // Pillow bevel
            const bevel = Math.min(1.0, edgeDist * 8.0);
            r = Math.floor(240 * (0.8 + 0.2 * bevel));
            g = Math.floor(238 * (0.8 + 0.2 * bevel));
            b = Math.floor(230 * (0.8 + 0.2 * bevel));
            roughness = 45;
            height = 0.3 + 0.6 * bevel;
            ao = Math.floor(180 + 75 * bevel);
          }
          break;
        }

        case 'concrete': {
          const grain = (n1 * 0.6 + n2 * 0.3 + n3 * 0.1);
          r = Math.floor(80 + grain * 45);
          g = Math.floor(82 + grain * 45);
          b = Math.floor(78 + grain * 40);
          roughness = Math.floor(200 + n3 * 45);
          height = grain;
          ao = Math.floor(200 + grain * 55);
          break;
        }

        case 'marble': {
          // Directional metamorphic veins
          const v = Math.sin((nx + ny) * 18.0 + n1 * 5.0);
          const vein = Math.pow(Math.abs(v), 4.0);
          r = Math.floor(220 - vein * 80);
          g = Math.floor(222 - vein * 75);
          b = Math.floor(215 - vein * 65);
          roughness = Math.floor(40 + vein * 80);
          height = 0.5 + 0.3 * (1.0 - vein);
          ao = Math.floor(220 + 35 * (1.0 - vein));
          break;
        }

        case 'metal': {
          // Brushed industrial steel with oxidized micro-scratches
          const brush = (Math.sin(ny * 128.0) * 0.5 + 0.5) * 20;
          const rust = Math.max(0, n1 * 1.5 - 0.7);
          r = Math.floor(120 + brush - rust * 40);
          g = Math.floor(125 + brush - rust * 70);
          b = Math.floor(130 + brush - rust * 90);
          roughness = Math.floor(90 + rust * 140);
          height = 0.6 - rust * 0.3;
          ao = Math.floor(240 - rust * 80);
          break;
        }

        case 'wood': {
          // Long grain planks
          const plankY = (ny * 4.0) % 1.0;
          const isSeam = plankY < 0.04;
          const grain = Math.sin(nx * 48.0 + n1 * 8.0) * 0.5 + 0.5;
          if (isSeam) {
            r = 45; g = 30; b = 20;
            roughness = 240;
            height = 0.2;
            ao = 120;
          } else {
            r = Math.floor(140 + grain * 40);
            g = Math.floor(95 + grain * 30);
            b = Math.floor(55 + grain * 20);
            roughness = Math.floor(150 + grain * 60);
            height = 0.5 + grain * 0.3;
            ao = 240;
          }
          break;
        }

        case 'parquet': {
          // Herringbone wood pattern
          const hx = (nx * 6.0) % 1.0;
          const hy = (ny * 6.0) % 1.0;
          const isHGroove = hx < 0.05 || hy < 0.05;
          const grainAngle = (Math.floor(nx * 6.0) + Math.floor(ny * 6.0)) % 2 === 0 ? nx : ny;
          const grain = Math.sin(grainAngle * 36.0 + n2 * 4.0) * 0.5 + 0.5;
          if (isHGroove) {
            r = 40; g = 25; b = 15;
            roughness = 245;
            height = 0.15;
            ao = 130;
          } else {
            r = Math.floor(160 + grain * 35);
            g = Math.floor(110 + grain * 25);
            b = Math.floor(65 + grain * 15);
            roughness = 80;
            height = 0.7;
            ao = 250;
          }
          break;
        }

        case 'linoleum': {
          // 1970s institutional flecks
          const flecks = n3 > 0.65 ? 40 : n3 < 0.35 ? -30 : 0;
          r = Math.floor(175 + flecks);
          g = Math.floor(165 + flecks);
          b = Math.floor(140 + flecks);
          roughness = 120;
          height = 0.5 + (flecks / 255.0) * 0.1;
          ao = 245;
          break;
        }

        case 'moss': {
          // Organic fibrous green velvet clumps
          const clump = n1 * 0.7 + n2 * 0.3;
          r = Math.floor(35 + clump * 50);
          g = Math.floor(90 + clump * 75);
          b = Math.floor(30 + clump * 40);
          roughness = 240;
          height = clump;
          ao = Math.floor(140 + clump * 115);
          break;
        }

        case 'mud': {
          // Wet earthy silt with crack fissures
          const fissure = Math.abs(Math.sin(n1 * 12.0) * Math.cos(n2 * 12.0));
          const isCrack = fissure < 0.08;
          if (isCrack) {
            r = 35; g = 25; b = 18;
            roughness = 230;
            height = 0.2;
            ao = 110;
          } else {
            r = Math.floor(65 + n2 * 30);
            g = Math.floor(48 + n2 * 25);
            b = Math.floor(32 + n2 * 18);
            roughness = Math.floor(70 + n1 * 120);
            height = 0.6 + n2 * 0.25;
            ao = 235;
          }
          break;
        }

        case 'bark': {
          // Vertical tree bark ridges
          const ridge = Math.abs(Math.sin(nx * 16.0 + n1 * 4.0));
          r = Math.floor(55 + ridge * 40);
          g = Math.floor(40 + ridge * 30);
          b = Math.floor(25 + ridge * 20);
          roughness = 225;
          height = ridge;
          ao = Math.floor(130 + ridge * 120);
          break;
        }

        case 'asphalt': {
          // Tar aggregate speckles
          const speckle = (n2 * 0.7 + n3 * 0.3);
          const val = Math.floor(40 + speckle * 35);
          r = val; g = val; b = val + 2;
          roughness = 230;
          height = speckle;
          ao = Math.floor(180 + speckle * 75);
          break;
        }

        case 'stained_glass': {
          // Leaded glass panels
          const px = (nx * 4.0) % 1.0;
          const py = (ny * 4.0) % 1.0;
          const isLead = px < 0.08 || py < 0.08;
          if (isLead) {
            r = 30; g = 32; b = 35;
            roughness = 160;
            height = 0.75;
            ao = 150;
          } else {
            // Colors per cell
            const cellId = (Math.floor(nx * 4.0) + Math.floor(ny * 4.0) * 4) % 4;
            if (cellId === 0) { r = 180; g = 40; b = 40; }       // Ruby
            else if (cellId === 1) { r = 40; g = 120; b = 180; } // Cobalt
            else if (cellId === 2) { r = 200; g = 160; b = 40; } // Amber
            else { r = 40; g = 170; b = 90; }                   // Emerald
            roughness = 30;
            height = 0.4 + n3 * 0.2;
            ao = 250;
          }
          break;
        }
      }

      aData[idx + 0] = r;
      aData[idx + 1] = g;
      aData[idx + 2] = b;
      aData[idx + 3] = 255;

      rData[idx + 0] = roughness;
      rData[idx + 1] = roughness;
      rData[idx + 2] = roughness;
      rData[idx + 3] = 255;

      oData[idx + 0] = ao;
      oData[idx + 1] = ao;
      oData[idx + 2] = ao;
      oData[idx + 3] = 255;

      heightMap[hIdx] = height;
    }
  }

  // Sobel 3x3 filter on heightMap to produce tangent-space normals
  for (let y = 0; y < size; y++) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;

      const tl = heightMap[yPrev * size + xPrev]!;
      const t  = heightMap[yPrev * size + x]!;
      const tr = heightMap[yPrev * size + xNext]!;
      const l  = heightMap[y * size + xPrev]!;
      const r  = heightMap[y * size + xNext]!;
      const bl = heightMap[yNext * size + xPrev]!;
      const b  = heightMap[yNext * size + x]!;
      const br = heightMap[yNext * size + xNext]!;

      const dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
      const dy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
      const normalScale = 3.0;

      let nx = -dx * normalScale;
      let ny = -dy * normalScale;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * size + x) * 4;
      nData[idx + 0] = Math.floor((nx * 0.5 + 0.5) * 255);
      nData[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      nData[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      nData[idx + 3] = 255;
    }
  }

  albCtx.putImageData(albImg, 0, 0);
  nrmCtx.putImageData(nrmImg, 0, 0);
  rghCtx.putImageData(rghImg, 0, 0);
  aoCtx.putImageData(aoImg, 0, 0);

  const albedo = new CanvasTexture(albedoHandle.canvas);
  albedo.wrapS = RepeatWrapping;
  albedo.wrapT = RepeatWrapping;
  albedo.colorSpace = SRGBColorSpace;
  albedo.minFilter = LinearMipmapLinearFilter;
  albedo.magFilter = LinearFilter;
  albedo.anisotropy = anisotropy;

  const normal = new CanvasTexture(normalHandle.canvas);
  normal.wrapS = RepeatWrapping;
  normal.wrapT = RepeatWrapping;
  normal.colorSpace = NoColorSpace;
  normal.minFilter = LinearMipmapLinearFilter;
  normal.magFilter = LinearFilter;
  normal.anisotropy = anisotropy;

  const roughness = new CanvasTexture(roughHandle.canvas);
  roughness.wrapS = RepeatWrapping;
  roughness.wrapT = RepeatWrapping;
  roughness.colorSpace = NoColorSpace;
  roughness.minFilter = LinearMipmapLinearFilter;
  roughness.magFilter = LinearFilter;
  roughness.anisotropy = anisotropy;

  const ao = new CanvasTexture(aoHandle.canvas);
  ao.wrapS = RepeatWrapping;
  ao.wrapT = RepeatWrapping;
  ao.colorSpace = NoColorSpace;
  ao.minFilter = LinearMipmapLinearFilter;
  ao.magFilter = LinearFilter;
  ao.anisotropy = anisotropy;

  const result: PbrSetResult = {
    kind,
    albedo,
    normal,
    roughness,
    ao,
  };

  pbrCache.set(cacheKey, result);
  return result;
}

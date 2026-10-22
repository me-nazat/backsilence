/* ── TileTexture.ts ───────────────────────────────────────────────────────
 *  Procedural ceramic mosaic tile set generator (platform, wall, floorWet).
 *  Generates seamless Albedo, Height, Normal, and Roughness maps.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
} from 'three';
import { Rng } from '../core/prng.js';
import { createNoisePermutation, fbm2DTileable } from '../core/noise.js';
import { hexToRgb, jitterColor } from '../core/color.js';
import { acquireCanvas } from '../core/canvasPool.js';

export type TileVariant = 'platform' | 'wall' | 'floorWet';

export interface TileSetOptions {
  variant: TileVariant;
  size?: number;
  seed?: number;
}

export interface TileSetResult {
  albedo: CanvasTexture;
  height: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
}

const PALETTE: Record<TileVariant, { base: string; grout: string; grid: number; crackRate: number }> = {
  platform: {
    base: '#d8b36a',
    grout: '#5b4526',
    grid: 16,
    crackRate: 0.02,
  },
  wall: {
    base: '#e9dca8',
    grout: '#5b4526',
    grid: 16,
    crackRate: 0.02,
  },
  floorWet: {
    base: '#d9c88f',
    grout: '#3d2f18',
    grid: 8,
    crackRate: 0.08,
  },
};

/**
 * Procedurally generates a complete PBR tile set for the specified variant.
 */
export function makeTileSet(options: TileSetOptions): TileSetResult {
  const variant = options.variant;
  const size = options.size ?? 512;
  const seed = options.seed ?? 42;

  const cfg = PALETTE[variant];
  const grid = cfg.grid;
  const tileSize = size / grid;
  const groutWidth = Math.max(2.0, (size / 512) * 2.0);
  const halfGrout = Math.max(1.0, groutWidth * 0.5);

  const rng = new Rng(seed);
  const perm = createNoisePermutation(seed);

  // Allocate image data buffers for all 4 channels
  const albedoData = new Uint8ClampedArray(size * size * 4);
  const heightData = new Uint8ClampedArray(size * size * 4);
  const normalData = new Uint8ClampedArray(size * size * 4);
  const roughnessData = new Uint8ClampedArray(size * size * 4);

  // Pre-generate tile descriptors for grid x grid
  interface TileInfo {
    baseColorR: number;
    baseColorG: number;
    baseColorB: number;
    isDirty: boolean;
    hasCrack: boolean;
    hasChip: boolean;
    crackStartX: number;
    crackStartY: number;
    crackEndX: number;
    crackEndY: number;
  }

  const tiles: TileInfo[][] = [];
  for (let gy = 0; gy < grid; gy++) {
    const row: TileInfo[] = [];
    for (let gx = 0; gx < grid; gx++) {
      const tileRng = rng.fork(`tile:${gx}:${gy}`);
      const jitteredHex = jitterColor(tileRng.next.bind(tileRng), cfg.base, {
        h: 2.0,
        s: 0.05,
        l: 0.04,
      });
      const rgb = hexToRgb(jitteredHex);

      const isDirty = tileRng.next() < 0.04;
      const hasCrack = tileRng.next() < cfg.crackRate;
      const hasChip = tileRng.next() < 0.01;

      row.push({
        baseColorR: rgb.r,
        baseColorG: rgb.g,
        baseColorB: rgb.b,
        isDirty,
        hasCrack,
        hasChip,
        crackStartX: tileRng.range(0.2, 0.4),
        crackStartY: tileRng.range(0.2, 0.4),
        crackEndX: tileRng.range(0.6, 0.8),
        crackEndY: tileRng.range(0.6, 0.8),
      });
    }
    tiles.push(row);
  }

  const groutRgb = hexToRgb(cfg.grout);

  // Height map 1D buffer for Sobel normal computation
  const rawHeights = new Float32Array(size * size);

  // Step 1: Generate Albedo, Height, and Roughness pixels
  for (let y = 0; y < size; y++) {
    const gy = Math.floor(y / tileSize) % grid;
    const localY = y - gy * tileSize;
    const distY = Math.min(localY, tileSize - localY);

    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / tileSize) % grid;
      const localX = x - gx * tileSize;
      const distX = Math.min(localX, tileSize - localX);

      const tile = tiles[gy]![gx]!;
      const idx = (y * size + x) * 4;

      // Distance to nearest grout center with subtle edge wobble
      const edgeDist = Math.min(x, size - 1 - x, y, size - 1 - y);
      const edgeWobbleScale = edgeDist <= 1 ? 0 : 1;
      const wobble = fbm2DTileable(x * 0.05, y * 0.05, size * 0.05, size * 0.05, 2, 2, 0.5, perm) * 0.5 * edgeWobbleScale;
      const minDist = Math.min(distX, distY) + wobble;

      const isGrout = minDist <= halfGrout;
      const bevelDist = Math.max(0.0, Math.min(1.0, (minDist - halfGrout) / (tileSize * 0.15)));

      if (isGrout) {
        // Grout line
        const grimeDarken = fbm2DTileable(x * 0.1, y * 0.1, size * 0.1, size * 0.1, 2, 2, 0.5, perm) * 20;
        const r = Math.max(0, groutRgb.r - grimeDarken);
        const g = Math.max(0, groutRgb.g - grimeDarken);
        const b = Math.max(0, groutRgb.b - grimeDarken);

        albedoData[idx] = r;
        albedoData[idx + 1] = g;
        albedoData[idx + 2] = b;
        albedoData[idx + 3] = 255;

        rawHeights[y * size + x] = 0.1;
        roughnessData[idx] = 217; // ~0.85
        roughnessData[idx + 1] = 217;
        roughnessData[idx + 2] = 217;
        roughnessData[idx + 3] = 255;
      } else {
        // Inside tile: 2-octave fBm mottling
        const mottle = fbm2DTileable(x * 0.08, y * 0.08, size * 0.08, size * 0.08, 2, 2, 0.5, perm) * 12;

        // Bevel lighting: bright top-left, darker bottom-right
        const bevelShade = ((tileSize - localX - localY) / tileSize) * 16.0;

        let r = tile.baseColorR + mottle + bevelShade;
        let g = tile.baseColorG + mottle + bevelShade;
        let b = tile.baseColorB + mottle + bevelShade;

        if (tile.isDirty) {
          // Warm stain
          r *= 0.85;
          g *= 0.82;
          b *= 0.75;
        }

        // Chipped corner
        if (tile.hasChip && localX < tileSize * 0.18 && localY < tileSize * 0.18) {
          r = groutRgb.r;
          g = groutRgb.g;
          b = groutRgb.b;
        }

        // Hairline crack check
        if (tile.hasCrack) {
          const u = localX / tileSize;
          const v = localY / tileSize;
          const du = u - tile.crackStartX;
          const dv = v - tile.crackStartY;
          const dirU = tile.crackEndX - tile.crackStartX;
          const dirV = tile.crackEndY - tile.crackStartY;
          const lenSq = dirU * dirU + dirV * dirV;
          if (lenSq > 0.0001) {
            const proj = Math.max(0, Math.min(1, (du * dirU + dv * dirV) / lenSq));
            const perpDist = Math.hypot(du - proj * dirU, dv - proj * dirV);
            if (perpDist < 0.015) {
              r = groutRgb.r;
              g = groutRgb.g;
              b = groutRgb.b;
            }
          }
        }

        albedoData[idx] = Math.max(0, Math.min(255, r));
        albedoData[idx + 1] = Math.max(0, Math.min(255, g));
        albedoData[idx + 2] = Math.max(0, Math.min(255, b));
        albedoData[idx + 3] = 255;

        // Tile height: soft curved bevel up to 0.9
        const h = 0.2 + 0.7 * Math.sqrt(bevelDist);
        rawHeights[y * size + x] = h;

        // Roughness: tile glossy (~0.25 -> 64), grime raises roughness
        const rough = tile.isDirty ? 110 : 64;
        roughnessData[idx] = rough;
        roughnessData[idx + 1] = rough;
        roughnessData[idx + 2] = rough;
        roughnessData[idx + 3] = 255;
      }

      // Height map pixel
      const hByte = Math.round(rawHeights[y * size + x]! * 255);
      heightData[idx] = hByte;
      heightData[idx + 1] = hByte;
      heightData[idx + 2] = hByte;
      heightData[idx + 3] = 255;
    }
  }

  // Step 2: Derive normal map via 3x3 Sobel filter with wrap-around
  const normalStrength = 2.0;
  for (let y = 0; y < size; y++) {
    const ym1 = (y - 1 + size) % size;
    const yp1 = (y + 1) % size;

    for (let x = 0; x < size; x++) {
      const xm1 = (x - 1 + size) % size;
      const xp1 = (x + 1) % size;

      const tl = rawHeights[ym1 * size + xm1]!;
      const t  = rawHeights[ym1 * size + x]!;
      const tr = rawHeights[ym1 * size + xp1]!;
      const l  = rawHeights[y * size + xm1]!;
      const r  = rawHeights[y * size + xp1]!;
      const bl = rawHeights[yp1 * size + xm1]!;
      const b  = rawHeights[yp1 * size + x]!;
      const br = rawHeights[yp1 * size + xp1]!;

      // Sobel horizontal and vertical gradients
      const dX = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
      const dY = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
      const dZ = 1.0 / normalStrength;

      const len = Math.hypot(dX, dY, dZ);
      const nx = -dX / len;
      const ny = -dY / len;
      const nz = dZ / len;

      const idx = (y * size + x) * 4;
      normalData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;
    }
  }

  // Helper to convert Uint8ClampedArray to CanvasTexture
  function createTextureFromBuffer(data: Uint8ClampedArray, isColor: boolean): CanvasTexture {
    const pooled = acquireCanvas(size, size);
    const imgData = new ImageData(data, size, size);
    pooled.ctx.putImageData(imgData, 0, 0);

    const tex = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.colorSpace = isColor ? SRGBColorSpace : NoColorSpace;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    return tex;
  }

  return {
    albedo: createTextureFromBuffer(albedoData, true),
    height: createTextureFromBuffer(heightData, false),
    normal: createTextureFromBuffer(normalData, false),
    roughness: createTextureFromBuffer(roughnessData, false),
  };
}

/* ── TileTexture.ts ───────────────────────────────────────────────────────
 *  Procedural ceramic mosaic tile set generator (platform, wall, floorWet).
 *  Generates seamless Albedo, Height, Normal, and Roughness maps.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
  LinearMipmapLinearFilter,
  LinearFilter,
} from 'three';
import { Rng } from '../core/prng.js';
import { createNoisePermutation, fbm2DTileable } from '../core/noise.js';
import { hexToRgb, jitterColor } from '../core/color.js';
import { acquireCanvas } from '../core/canvasPool.js';

export type TileVariant = 'platform' | 'platform_side' | 'wall' | 'floorWet' | 'pool_floor' | 'ceiling' | 'white' | 'clean-white';

export interface TileSetOptions {
  variant: TileVariant;
  size?: number | undefined;
  seed?: number | undefined;
  anisotropy?: number | undefined;
  tilesPerSide?: number | undefined;
  tileColor?: string | undefined;
  groutColor?: string | undefined;
  stainAmount?: number | undefined;
  waterlineTint?: string | undefined;
}

export interface TileSetResult {
  albedo: CanvasTexture;
  height: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
  ao: CanvasTexture;
}

export interface TileConfigItem {
  base: string;
  grout: string;
  grid: number;
  crackRate: number;
  stainAmount?: number;
  waterlineTint?: string;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

const PALETTE: Record<TileVariant, TileConfigItem> = {
  platform: {
    base: '#c29b56',
    grout: '#91815e',
    grid: 16,
    crackRate: 0.005,
  },
  platform_side: {
    base: '#c29b56',
    grout: '#91815e',
    grid: 16,
    crackRate: 0.005,
  },
  wall: {
    base: '#c8b580',
    grout: '#9b8b68',
    grid: 16,
    crackRate: 0.005,
  },
  floorWet: {
    base: '#cbba8b',
    grout: '#989e84',
    grid: 8,
    crackRate: 0.02,
  },
  pool_floor: {
    base: '#cbba8b',
    grout: '#566852',
    grid: 16,
    crackRate: 0.012,
  },
  ceiling: {
    base: '#b7a775',
    grout: '#9b8b68',
    grid: 16,
    crackRate: 0.005,
  },
  white: {
    base: '#f6f7f4',
    grout: '#b8c0be',
    grid: 8,
    crackRate: 0.002,
    stainAmount: 0.03,
    waterlineTint: '#d2ebe8',
    roughness: 0.28,
    clearcoat: 0.30,
    clearcoatRoughness: 0.28,
  },
  'clean-white': {
    base: '#f6f7f4',
    grout: '#b8c0be',
    grid: 8,
    crackRate: 0.002,
    stainAmount: 0.03,
    waterlineTint: '#d2ebe8',
    roughness: 0.28,
    clearcoat: 0.30,
    clearcoatRoughness: 0.28,
  },
};

/**
 * Procedurally generates a complete PBR tile set for the specified variant.
 */
export function makeTileSet(options: TileSetOptions): TileSetResult {
  const variant = options.variant;
  const size = options.size ?? 512;
  const seed = options.seed ?? 42;

  const cfg = PALETTE[variant] ?? PALETTE['clean-white'];
  const grid = options.tilesPerSide ?? cfg.grid;
  const tileSize = size / grid;

  const baseColor = options.tileColor ?? cfg.base;
  const groutColor = options.groutColor ?? cfg.grout;
  const stainRate = options.stainAmount ?? cfg.stainAmount ?? 0.04;

  const rng = new Rng(seed);
  const perm = createNoisePermutation(seed);

  // Allocate image data buffers for all 5 PBR channels
  const albedoData = new Uint8ClampedArray(size * size * 4);
  const heightData = new Uint8ClampedArray(size * size * 4);
  const normalData = new Uint8ClampedArray(size * size * 4);
  const roughnessData = new Uint8ClampedArray(size * size * 4);
  const aoData = new Uint8ClampedArray(size * size * 4);

  // Pre-generate tile descriptors for grid x grid
  interface TileInfo {
    baseColorR: number;
    baseColorG: number;
    baseColorB: number;
    heightOffset: number;
    isDirty: boolean;
    hasCrack: boolean;
    hasChip: boolean;
    chipCorner: number;
    chipSize: number;
    crackStartX: number;
    crackStartY: number;
    crackEndX: number;
    crackEndY: number;
    branchStartX?: number | undefined;
    branchStartY?: number | undefined;
    branchEndX?: number | undefined;
    branchEndY?: number | undefined;
  }

  const tiles: TileInfo[][] = [];
  for (let gy = 0; gy < grid; gy++) {
    const row: TileInfo[] = [];
    for (let gx = 0; gx < grid; gx++) {
      const tileRng = rng.fork(`tile:${gx}:${gy}`);
      const jitteredHex = jitterColor(tileRng.next.bind(tileRng), baseColor, {
        h: 2.0,
        s: 0.05,
        l: 0.04,
      });
      const rgb = hexToRgb(jitteredHex);

      const isDirty = tileRng.next() < stainRate;
      const hasCrack = tileRng.next() < cfg.crackRate;
      const hasChip = tileRng.next() < 0.04; // ~4% chipped corners
      const chipCorner = Math.floor(tileRng.next() * 4);
      const chipSize = tileRng.range(0.12, 0.20);
      const heightOffset = (tileRng.next() - 0.5) * 0.025;

      const cStartX = tileRng.range(0.15, 0.45);
      const cStartY = tileRng.range(0.15, 0.45);
      const cEndX = tileRng.range(0.55, 0.85);
      const cEndY = tileRng.range(0.55, 0.85);

      let branchStartX: number | undefined;
      let branchStartY: number | undefined;
      let branchEndX: number | undefined;
      let branchEndY: number | undefined;

      if (hasCrack && variant === 'floorWet') {
        const midT = tileRng.range(0.35, 0.65);
        branchStartX = cStartX + (cEndX - cStartX) * midT;
        branchStartY = cStartY + (cEndY - cStartY) * midT;
        const perpX = -(cEndY - cStartY);
        const perpY = cEndX - cStartX;
        const bLen = tileRng.range(0.2, 0.45);
        branchEndX = branchStartX + perpX * bLen;
        branchEndY = branchStartY + perpY * bLen;
      }

      row.push({
        baseColorR: rgb.r,
        baseColorG: rgb.g,
        baseColorB: rgb.b,
        heightOffset,
        isDirty,
        hasCrack,
        hasChip,
        chipCorner,
        chipSize,
        crackStartX: cStartX,
        crackStartY: cStartY,
        crackEndX: cEndX,
        crackEndY: cEndY,
        branchStartX,
        branchStartY,
        branchEndX,
        branchEndY,
      });
    }
    tiles.push(row);
  }

  const groutRgb = hexToRgb(groutColor);

  // Height map 1D buffer for Sobel normal computation
  const rawHeights = new Float32Array(size * size);

  // Step 1: Generate Albedo, Height, Roughness, and AO pixels
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
      const wobble = fbm2DTileable(x * 0.05, y * 0.05, size * 0.05, size * 0.05, 2, 2, 0.5, perm) * 0.4 * edgeWobbleScale;
      const minDist = Math.min(distX, distY) + wobble;

      const halfGrout = Math.max(1.0, (size / 512) * 1.5);
      const isGrout = minDist <= halfGrout;
      const distFromGrout = Math.max(0.0, minDist - halfGrout);

      // Micro-bevel width over ~2.5 pixels for C1 continuity
      const bevelWidth = Math.max(2.0, (size / 512) * 2.5);
      const bevelT = Math.min(1.0, distFromGrout / bevelWidth);
      const smoothBevel = bevelT * bevelT * (3.0 - 2.0 * bevelT);

      // Chipped corner check
      let isChip = false;
      let chipDepth = 0;
      if (tile.hasChip) {
        let cx = localX;
        let cy = localY;
        if (tile.chipCorner === 1) cx = tileSize - localX;
        else if (tile.chipCorner === 2) cy = tileSize - localY;
        else if (tile.chipCorner === 3) { cx = tileSize - localX; cy = tileSize - localY; }
        const cDist = Math.hypot(cx, cy);
        const cRadius = tileSize * tile.chipSize + (fbm2DTileable(x * 0.08, y * 0.08, size * 0.08, size * 0.08, 2, 2, 0.5, perm) - 0.5) * 3.0;
        if (cDist < cRadius) {
          isChip = true;
          chipDepth = Math.min(1.0, (cRadius - cDist) / (tileSize * 0.08));
        }
      }

      // Spidery hairline crack check
      let isCracked = false;
      if (tile.hasCrack) {
        const u = localX / tileSize;
        const v = localY / tileSize;
        const crackNoise = fbm2DTileable(u * 12, v * 12, 12, 12, 2, 2, 0.5, perm) * 0.008;

        const du = u - tile.crackStartX;
        const dv = v - tile.crackStartY;
        const dirU = tile.crackEndX - tile.crackStartX;
        const dirV = tile.crackEndY - tile.crackStartY;
        const lenSq = dirU * dirU + dirV * dirV;
        if (lenSq > 0.0001) {
          const proj = Math.max(0, Math.min(1, (du * dirU + dv * dirV) / lenSq));
          const perpDist = Math.hypot(du - proj * dirU, dv - proj * dirV) + crackNoise;
          if (perpDist < 0.012) {
            isCracked = true;
          }
        }

        if (
          !isCracked &&
          tile.branchStartX !== undefined &&
          tile.branchStartY !== undefined &&
          tile.branchEndX !== undefined &&
          tile.branchEndY !== undefined
        ) {
          const bdu = u - tile.branchStartX;
          const bdv = v - tile.branchStartY;
          const bdirU = tile.branchEndX - tile.branchStartX;
          const bdirV = tile.branchEndY - tile.branchStartY;
          const blenSq = bdirU * bdirU + bdirV * bdirV;
          if (blenSq > 0.0001) {
            const bproj = Math.max(0, Math.min(1, (bdu * bdirU + bdv * bdirV) / blenSq));
            const bperpDist = Math.hypot(bdu - bproj * bdirU, bdv - bproj * bdirV) + crackNoise;
            if (bperpDist < 0.010) {
              isCracked = true;
            }
          }
        }
      }

      // Height calculation: C1 smooth micro-bevel with recessed grout (1.2mm depth at 0.15m scale)
      let h = 0.12;
      if (isGrout) {
        h = 0.12 + (fbm2DTileable(x * 0.2, y * 0.2, size * 0.2, size * 0.2, 2, 2, 0.5, perm) - 0.5) * 0.02;
      } else if (isCracked) {
        h = 0.35;
      } else if (isChip) {
        h = 0.85 - 0.53 * chipDepth;
      } else {
        const centerDistX = Math.abs(localX - tileSize * 0.5) / (tileSize * 0.5);
        const centerDistY = Math.abs(localY - tileSize * 0.5) / (tileSize * 0.5);
        const pillow = 0.03 * (1.0 - (centerDistX * centerDistX + centerDistY * centerDistY) * 0.5);
        const hTile = 0.90 + tile.heightOffset + pillow;
        h = 0.12 + (hTile - 0.12) * smoothBevel;
      }
      rawHeights[y * size + x] = Math.max(0.0, Math.min(1.0, h));

      // Albedo calculation: grout, chipped biscuit, tile glaze, and smooth micro-bevel blend
      const grimeDarken = fbm2DTileable(x * 0.1, y * 0.1, size * 0.1, size * 0.1, 2, 2, 0.5, perm) * 12;
      const rGrout = Math.max(0, groutRgb.r - grimeDarken);
      const gGrout = Math.max(0, groutRgb.g - grimeDarken);
      const bGrout = Math.max(0, groutRgb.b - grimeDarken);

      const mottle = fbm2DTileable(x * 0.08, y * 0.08, size * 0.08, size * 0.08, 2, 2, 0.5, perm) * 2.0;
      let rTile = tile.baseColorR + mottle;
      let gTile = tile.baseColorG + mottle;
      let bTile = tile.baseColorB + mottle;

      if (tile.isDirty) {
        rTile *= 0.88;
        gTile *= 0.85;
        bTile *= 0.78;
      }

      // Dirt gradient towards corners and edges
      const cornerFactor = Math.min(distX, distY) / (tileSize * 0.5);
      const cornerDirt = 0.96 + 0.04 * cornerFactor;
      rTile *= cornerDirt;
      gTile *= cornerDirt;
      bTile *= cornerDirt;

      if (isChip) {
        // Exposed unglazed terracotta biscuit
        rTile = Math.round(groutRgb.r * 1.05 + 10);
        gTile = Math.round(groutRgb.g * 0.95);
        bTile = Math.round(groutRgb.b * 0.85);
      }
      if (isCracked) {
        rTile = rGrout;
        gTile = gGrout;
        bTile = bGrout;
      }

      const colorBlendT = Math.min(1.0, distFromGrout / (Math.max(1.5, (size / 512) * 1.8)));
      const smoothColor = colorBlendT * colorBlendT * (3.0 - 2.0 * colorBlendT);
      const r = Math.round(rGrout + (rTile - rGrout) * smoothColor);
      const g = Math.round(gGrout + (gTile - gGrout) * smoothColor);
      const b = Math.round(bGrout + (bTile - bGrout) * smoothColor);

      albedoData[idx] = Math.max(0, Math.min(255, r));
      albedoData[idx + 1] = Math.max(0, Math.min(255, g));
      albedoData[idx + 2] = Math.max(0, Math.min(255, b));
      albedoData[idx + 3] = 255;

      // Roughness: tile glaze (~0.27 -> 70), dirty tile (~0.43 -> 110), grout porous (~0.85 -> 217)
      const roughTile = isChip ? 175 : tile.isDirty ? 110 : 70;
      const rough = isCracked ? 210 : Math.round(217 + (roughTile - 217) * smoothBevel);
      roughnessData[idx] = rough;
      roughnessData[idx + 1] = rough;
      roughnessData[idx + 2] = rough;
      roughnessData[idx + 3] = 255;

      // Ambient Occlusion: self-shadowed grout joints (~135), cracks (~140), chips (~145), tile face (~255)
      let ao = Math.round(135 + smoothBevel * 120);
      if (isCracked) ao = 140;
      if (isChip) ao = Math.round(140 + (1 - chipDepth) * 115);
      aoData[idx] = ao;
      aoData[idx + 1] = ao;
      aoData[idx + 2] = ao;
      aoData[idx + 3] = 255;

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

  const anisotropy = options.anisotropy ?? 4;

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
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.anisotropy = anisotropy;
    tex.userData = { grid };
    (tex.image as unknown as { data: Uint8ClampedArray }).data = data;
    tex.needsUpdate = true;

    return tex;
  }

  return {
    albedo: createTextureFromBuffer(albedoData, true),
    height: createTextureFromBuffer(heightData, false),
    normal: createTextureFromBuffer(normalData, false),
    roughness: createTextureFromBuffer(roughnessData, false),
    ao: createTextureFromBuffer(aoData, false),
  };
}

/**
 * Convenience generator for tile textures matching the procedural texture contract.
 * Generates an 8x8 grid of ceramic tiles per 512x512 canvas texture.
 */
export function generateTileTextures(
  options?: Partial<TileSetOptions> & { tilesPerSide?: number; preset?: string },
): TileSetResult {
  const variant = (options?.preset ?? options?.variant ?? 'clean-white') as TileVariant;
  return makeTileSet({
    variant,
    size: options?.size ?? 512,
    seed: options?.seed ?? 42,
    anisotropy: options?.anisotropy ?? 16,
    tilesPerSide: options?.tilesPerSide ?? 8,
    groutColor: options?.groutColor,
    tileColor: options?.tileColor,
    stainAmount: options?.stainAmount,
    waterlineTint: options?.waterlineTint,
  });
}

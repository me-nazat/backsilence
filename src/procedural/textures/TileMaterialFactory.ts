/* ── TileMaterialFactory.ts ───────────────────────────────────────────────
 *  World-space ceramic tile materials and geometry generator.
 *  - 1024x1024 procedural canvas textures with anisotropic filtering & RepeatWrapping
 *  - Wall, pillar, ceiling & archway ceramic tile (#ebe4c8, #6e6550 grout, 0.25m x 0.25m)
 *  - Dry stepping-stone platform top (#d5b676, #4a3b22 grout, 0.22m x 0.22m)
 *  - Vertical side trim with 3 distinct rows above water & 0.08m wet-grout watermark at y=0
 *  - Submerged pool floor tile (#c8d4ba, #566852 grout, 0.25m x 0.25m at y=-0.75m)
 *  - Zero UV stretching, zero cartoon wireframe outlines
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  MeshStandardMaterial,
  BoxGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  BufferGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../core/prng.js';
import { acquireCanvas } from '../core/canvasPool.js';

export interface TileMaterialKit {
  wallTileMaterial: MeshStandardMaterial;
  platformTopMaterial: MeshStandardMaterial;
  platformSideMaterial: MeshStandardMaterial;
  poolFloorMaterial: MeshStandardMaterial;
  ceilingTileMaterial: MeshStandardMaterial;
}

export class TileMaterialFactory {
  private static instance: TileMaterialFactory | null = null;

  readonly wallTileMaterial: MeshStandardMaterial;
  readonly platformTopMaterial: MeshStandardMaterial;
  readonly platformSideMaterial: MeshStandardMaterial;
  readonly poolFloorMaterial: MeshStandardMaterial;
  readonly ceilingTileMaterial: MeshStandardMaterial;

  private constructor(renderer?: WebGLRenderer) {
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 16;

    // 1. Wall Tile Material (0.25m x 0.25m tiles, #ebe4c8 glaze, #6e6550 grout)
    const wallTextures = this.generateWallTileTextures(maxAnisotropy);
    this.wallTileMaterial = new MeshStandardMaterial({
      map: wallTextures.albedo,
      normalMap: wallTextures.normal,
      roughness: 0.22,
      metalness: 0.04,
      envMapIntensity: 0.45,
    });
    this.wallTileMaterial.name = 'WallTileMaterial';

    // Ceiling uses wall tile base with slightly more diffuse roughness
    this.ceilingTileMaterial = new MeshStandardMaterial({
      map: wallTextures.albedo,
      normalMap: wallTextures.normal,
      roughness: 0.45,
      metalness: 0.03,
      envMapIntensity: 0.35,
    });
    this.ceilingTileMaterial.name = 'CeilingTileMaterial';

    // 2. Platform Top Material (0.22m x 0.22m tiles, #d5b676 tan/ochre, #4a3b22 dark brown grout)
    const platformTopTextures = this.generatePlatformTopTextures(maxAnisotropy);
    this.platformTopMaterial = new MeshStandardMaterial({
      map: platformTopTextures.albedo,
      normalMap: platformTopTextures.normal,
      roughness: 0.32,
      metalness: 0.02,
      envMapIntensity: 0.4,
    });
    this.platformTopMaterial.name = 'PlatformTopMaterial';

    // 3. Platform Side Material (3 distinct rows above water + 0.08m wet-grout watermark at y=0)
    const platformSideTextures = this.generatePlatformSideTextures(maxAnisotropy);
    this.platformSideMaterial = new MeshStandardMaterial({
      map: platformSideTextures.albedo,
      normalMap: platformSideTextures.normal,
      roughness: 0.28,
      metalness: 0.03,
      envMapIntensity: 0.4,
    });
    this.platformSideMaterial.name = 'PlatformSideMaterial';

    // 4. Submerged Pool Floor Material (0.25m x 0.25m tiles, #c8d4ba cream-green, #566852 grout)
    const poolFloorTextures = this.generatePoolFloorTextures(maxAnisotropy);
    this.poolFloorMaterial = new MeshStandardMaterial({
      map: poolFloorTextures.albedo,
      normalMap: poolFloorTextures.normal,
      roughness: 0.28,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
    this.poolFloorMaterial.name = 'PoolFloorMaterial';
  }

  static getInstance(renderer?: WebGLRenderer): TileMaterialFactory {
    if (!TileMaterialFactory.instance) {
      TileMaterialFactory.instance = new TileMaterialFactory(renderer);
    }
    return TileMaterialFactory.instance;
  }

  /**
   * Generates Wall Tile textures (1024x1024, 16x16 grid = 4.0m world repeat).
   * Base glaze #ebe4c8 with +/- 3% luminance jitter, #6e6550 2px grout, recessed normal map.
   */
  private generateWallTileTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 1024;
    const grid = 16;
    const tileSize = size / grid; // 64px
    const groutPx = 2;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // Base #ebe4c8 = (235, 228, 200)
    const baseR = 235, baseG = 228, baseB = 200;
    // Grout #6e6550 = (110, 101, 80)
    const groutR = 110, groutG = 101, groutB = 80;

    const rng = new Rng(101);

    // Precalculate per-tile luminance jitter (+/- 3%)
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.06; // +/- 3%
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGroutX = localX < groutPx;
        const isGrout = isGroutX || isGroutY;

        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          // Normal in recessed grout: flat recessed pointing Z
          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 235; // slightly lower height
          nData[idx + 3] = 255;
        } else {
          const jitter = tileJitters[tileY * grid + tileX]!;
          const microNoise = (rng.next() - 0.5) * 4; // fine clay texture
          const r = Math.min(255, Math.max(0, Math.round(baseR * (1.0 + jitter) + microNoise)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * (1.0 + jitter) + microNoise)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * (1.0 + jitter) + microNoise)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          // Beveled normal towards grout lines (within 3px of grout)
          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 14;
          if (distRight < 3) nx -= (3 - distRight) * 14;
          if (distTop < 3) ny -= (3 - distTop) * 14; // Three.js normal Y
          if (distBottom < 3) ny += (3 - distBottom) * 14;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Generates Platform Top textures (1024x1024, 16x16 grid = 3.52m world repeat).
   * Warm tan/ochre ceramic tiles (#d5b676), dark brown grout (#4a3b22).
   */
  private generatePlatformTopTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 1024;
    const grid = 16;
    const tileSize = size / grid;
    const groutPx = 2;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // #d5b676 = (213, 182, 118)
    const baseR = 213, baseG = 182, baseB = 118;
    // #4a3b22 = (74, 59, 34)
    const groutR = 74, groutG = 59, groutB = 34;

    const rng = new Rng(202);
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.05;
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGrout = localX < groutPx || isGroutY;
        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 230;
          nData[idx + 3] = 255;
        } else {
          const jitter = tileJitters[tileY * grid + tileX]!;
          const clayGrain = (rng.next() - 0.5) * 5;
          const r = Math.min(255, Math.max(0, Math.round(baseR * (1.0 + jitter) + clayGrain)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * (1.0 + jitter) + clayGrain)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * (1.0 + jitter) + clayGrain)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 16;
          if (distRight < 3) nx -= (3 - distRight) * 16;
          if (distTop < 3) ny -= (3 - distTop) * 16;
          if (distBottom < 3) ny += (3 - distBottom) * 16;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Generates Platform Vertical Side Trim texture (1024x1024).
   * Total height = 1.13m (y = -0.75m to +0.38m).
   * Above waterline (y = 0.0 to +0.38m, V = 0.6637 to 1.0): exactly 3 distinct horizontal rows of tan tiles.
   * Waterline band (0.08m tall at y = 0.0, V = 0.628 to 0.699): darkened wet-grout watermark.
   * Below waterline (y = -0.75m to 0.0, V = 0.0 to 0.6637): submerged wet-darkened tiles.
   */
  private generatePlatformSideTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 1024;
    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // Heights in normalized V (0 at bottom y=-0.75m, 1 at top y=+0.38m, total 1.13m)
    // Waterline at y = 0.0 -> V_waterline = 0.75 / 1.13 = 0.6637
    // In texture image data, y=0 is top (V=1), y=1023 is bottom (V=0)
    // Pixel row for waterline: size * (1.0 - 0.6637) = 1024 * 0.3363 = row 344
    const waterlineRow = Math.round(size * (1.0 - 0.75 / 1.13)); // ~344
    const watermarkHalfH = Math.round((0.04 / 1.13) * size); // ~36px (total 72px = 0.08m)

    // Above waterline: rows 0 to waterlineRow (height ~344px).
    // Exactly 3 distinct horizontal rows: each row is 344 / 3 = ~114.6px tall!
    const dryRowH = waterlineRow / 3.0;

    // Horizontal tile width: 16 tiles across 1024px
    const tileW = size / 16;
    const groutPx = 2;

    const tanR = 213, tanG = 182, tanB = 118;
    const groutR = 74, groutG = 59, groutB = 34;
    const wetDarken = 0.52; // 48% wet darkening below water

    const rng = new Rng(303);

    for (let py = 0; py < size; py++) {
      const isAboveWater = py < waterlineRow;
      const distToWaterline = Math.abs(py - waterlineRow);
      const isWatermark = distToWaterline <= watermarkHalfH;

      // Vertical grout check
      let isGroutV = false;
      if (isAboveWater) {
        const localDryY = py % dryRowH;
        isGroutV = localDryY < groutPx;
      } else {
        // Below water: submerged rows spaced every ~114px
        const subY = (py - waterlineRow) % dryRowH;
        isGroutV = subY < groutPx;
      }

      for (let px = 0; px < size; px++) {
        const localX = px % tileW;
        const isGroutH = localX < groutPx;
        const isGrout = isGroutH || isGroutV;

        const idx = (py * size + px) * 4;

        if (isWatermark) {
          // Darkened wet-grout watermark band right at y = 0.0
          const markFade = 1.0 - distToWaterline / watermarkHalfH;
          const markR = Math.round(45 * markFade + (isGrout ? groutR : tanR * wetDarken) * (1 - markFade));
          const markG = Math.round(36 * markFade + (isGrout ? groutG : tanG * wetDarken) * (1 - markFade));
          const markB = Math.round(22 * markFade + (isGrout ? groutB : tanB * wetDarken) * (1 - markFade));

          aData[idx + 0] = markR;
          aData[idx + 1] = markG;
          aData[idx + 2] = markB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 240;
          nData[idx + 3] = 255;
        } else if (isGrout) {
          const dark = isAboveWater ? 1.0 : wetDarken;
          aData[idx + 0] = Math.round(groutR * dark);
          aData[idx + 1] = Math.round(groutG * dark);
          aData[idx + 2] = Math.round(groutB * dark);
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 230;
          nData[idx + 3] = 255;
        } else {
          const dark = isAboveWater ? 1.0 : wetDarken;
          const clayGrain = (rng.next() - 0.5) * 4;
          const r = Math.min(255, Math.max(0, Math.round((tanR + clayGrain) * dark)));
          const g = Math.min(255, Math.max(0, Math.round((tanG + clayGrain) * dark)));
          const b = Math.min(255, Math.max(0, Math.round((tanB + clayGrain) * dark)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileW - localX;
          if (distLeft < 3) nx += (3 - distLeft) * 14;
          if (distRight < 3) nx -= (3 - distRight) * 14;

          const rowStep = dryRowH;
          const localY = isAboveWater ? (py % rowStep) : ((py - waterlineRow) % rowStep);
          if (localY < 3) ny -= (3 - localY) * 14;
          if (rowStep - localY < 3) ny += (3 - (rowStep - localY)) * 14;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Generates Submerged Pool Floor Tile textures (1024x1024, 16x16 grid = 4.0m world repeat).
   * Slightly desaturated cream-green tile grid (#c8d4ba) with #566852 grout lines.
   */
  private generatePoolFloorTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 1024;
    const grid = 16;
    const tileSize = size / grid;
    const groutPx = 2;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // #c8d4ba = (200, 212, 186)
    const baseR = 200, baseG = 212, baseB = 186;
    // #566852 = (86, 104, 82)
    const groutR = 86, groutG = 104, groutB = 82;

    const rng = new Rng(404);
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.04;
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGrout = localX < groutPx || isGroutY;
        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 225;
          nData[idx + 3] = 255;
        } else {
          const jitter = tileJitters[tileY * grid + tileX]!;
          const microGrain = (rng.next() - 0.5) * 4;
          const r = Math.min(255, Math.max(0, Math.round(baseR * (1.0 + jitter) + microGrain)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * (1.0 + jitter) + microGrain)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * (1.0 + jitter) + microGrain)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 14;
          if (distRight < 3) nx -= (3 - distRight) * 14;
          if (distTop < 3) ny -= (3 - distTop) * 14;
          if (distBottom < 3) ny += (3 - distBottom) * 14;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Builds a dry stepping-stone platform mesh with world-space UV scaling.
   * Top face: 0.22m square tiles.
   * Vertical sides: exact vertical mapping from floorY (-0.75m) to topY (+0.38m)
   * showing 3 distinct horizontal rows above water and watermark band at y = 0.0.
   * Completely omits EdgesGeometry and cartoon border outlines.
   */
  createPlatformMesh(w: number, h: number, d: number, topY = 0.38, floorY = -0.75): Mesh {
    const geom = this.createPlatformGeometry(w, h, d, topY, floorY);
    const materials = [this.platformTopMaterial, this.platformSideMaterial];
    const mesh = new Mesh(geom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * BoxGeometry with world-space UVs and multi-material groups for platform tops and vertical sides.
   */
  createPlatformGeometry(w: number, h: number, d: number, _topY = 0.38, _floorY = -0.75): BoxGeometry {
    const geom = new BoxGeometry(w, h, d);
    const uvAttr = geom.getAttribute('uv') as Float32BufferAttribute;
    const uvArray = uvAttr.array as Float32Array;

    // Box faces:
    // 0: +X (d x h) -> Side
    // 1: -X (d x h) -> Side
    // 2: +Y (w x d) -> Top
    // 3: -Y (w x d) -> Bottom
    // 4: +Z (w x h) -> Side
    // 5: -Z (w x h) -> Side

    // Top face (+Y): 1 tile = 0.22m x 0.22m
    const topRepeatU = w / 0.22;
    const topRepeatV = d / 0.22;
    const topBase = 2 * 4;
    uvArray[(topBase + 0) * 2 + 0] = 0;
    uvArray[(topBase + 0) * 2 + 1] = topRepeatV;
    uvArray[(topBase + 1) * 2 + 0] = topRepeatU;
    uvArray[(topBase + 1) * 2 + 1] = topRepeatV;
    uvArray[(topBase + 2) * 2 + 0] = 0;
    uvArray[(topBase + 2) * 2 + 1] = 0;
    uvArray[(topBase + 3) * 2 + 0] = topRepeatU;
    uvArray[(topBase + 3) * 2 + 1] = 0;

    // Bottom face (-Y)
    const botBase = 3 * 4;
    uvArray[(botBase + 0) * 2 + 0] = 0;
    uvArray[(botBase + 0) * 2 + 1] = topRepeatV;
    uvArray[(botBase + 1) * 2 + 0] = topRepeatU;
    uvArray[(botBase + 1) * 2 + 1] = topRepeatV;
    uvArray[(botBase + 2) * 2 + 0] = 0;
    uvArray[(botBase + 2) * 2 + 1] = 0;
    uvArray[(botBase + 3) * 2 + 0] = topRepeatU;
    uvArray[(botBase + 3) * 2 + 1] = 0;

    // Side faces (+X, -X, +Z, -Z):
    // Vertical span corresponds to (topY - floorY) = 1.13m
    // Texture V is normalized 0..1 from floorY to topY.
    // Horizontal repeat: dim / 0.22m
    const sideFaces = [
      { face: 0, dim: d }, // +X
      { face: 1, dim: d }, // -X
      { face: 4, dim: w }, // +Z
      { face: 5, dim: w }, // -Z
    ];

    for (const sf of sideFaces) {
      const uCount = sf.dim / 0.22;
      const base = sf.face * 4;
      // Standard quad UVs in Three.js BoxGeometry: (0, 1), (1, 1), (0, 0), (1, 0)
      uvArray[(base + 0) * 2 + 0] = 0;
      uvArray[(base + 0) * 2 + 1] = 1.0;
      uvArray[(base + 1) * 2 + 0] = uCount;
      uvArray[(base + 1) * 2 + 1] = 1.0;
      uvArray[(base + 2) * 2 + 0] = 0;
      uvArray[(base + 2) * 2 + 1] = 0.0;
      uvArray[(base + 3) * 2 + 0] = uCount;
      uvArray[(base + 3) * 2 + 1] = 0.0;
    }

    uvAttr.needsUpdate = true;

    // Multi-material groups:
    // material index 0 = platformTopMaterial
    // material index 1 = platformSideMaterial
    geom.clearGroups();
    geom.addGroup(0, 6, 1);  // +X side
    geom.addGroup(6, 6, 1);  // -X side
    geom.addGroup(12, 6, 0); // +Y top
    geom.addGroup(18, 6, 1); // -Y bottom
    geom.addGroup(24, 6, 1); // +Z side
    geom.addGroup(30, 6, 1); // -Z side

    return geom;
  }

  /**
   * Creates a Giant Cylindrical Tiled Column (radius = 2.1m, height = 16m, 48 radial segments).
   * Square world-space tile UVs (1 tile = 0.25m x 0.25m).
   */
  createGiantColumnGeometry(radius = 2.1, height = 16.0, radialSegments = 48): CylinderGeometry {
    const geom = new CylinderGeometry(radius, radius, height, radialSegments, 1, false);
    const circumference = 2 * Math.PI * radius; // ~13.195m
    const repeatU = Math.round(circumference / 0.25); // ~53 tiles around circumference
    const repeatV = height / 0.25; // 64 tiles vertically

    const uvAttr = geom.getAttribute('uv') as Float32BufferAttribute;
    const uvArray = uvAttr.array as Float32Array;
    const sideVertexCount = (radialSegments + 1) * 2;

    for (let i = 0; i < sideVertexCount; i++) {
      const u = uvArray[i * 2 + 0]!;
      const v = uvArray[i * 2 + 1]!;
      uvArray[i * 2 + 0] = u * repeatU;
      uvArray[i * 2 + 1] = v * repeatV;
    }

    // Top and bottom caps (diameter / 0.25)
    const capRepeat = (2 * radius) / 0.25;
    for (let i = sideVertexCount; i < uvAttr.count; i++) {
      uvArray[i * 2 + 0] = uvArray[i * 2 + 0]! * capRepeat;
      uvArray[i * 2 + 1] = uvArray[i * 2 + 1]! * capRepeat;
    }

    uvAttr.needsUpdate = true;
    return geom;
  }

  /**
   * Creates a Palm-Arch Tiled Pillar:
   * Slender square tiled column (0.65m x 0.65m) curving outward at the top in 4-way vaulted ribs.
   * Merged into a single mesh to respect draw-call budgets.
   */
  createPalmArchPillar(height = 4.2, ribSpan = 2.2): Mesh {
    const parts: BufferGeometry[] = [];

    // 1. Central square column shaft
    const shaftH = height - 0.8;
    const shaftGeom = new BoxGeometry(0.65, shaftH, 0.65);
    const sUv = shaftGeom.getAttribute('uv') as Float32BufferAttribute;
    const sArr = sUv.array as Float32Array;
    for (let i = 0; i < sUv.count; i++) {
      sArr[i * 2 + 0] = sArr[i * 2 + 0]! * (0.65 / 0.25);
      sArr[i * 2 + 1] = sArr[i * 2 + 1]! * (shaftH / 0.25);
    }
    sUv.needsUpdate = true;
    shaftGeom.translate(0, shaftH * 0.5 - 0.75, 0);
    parts.push(shaftGeom);

    // 2. 4-way curving vaulted ribs (+X, -X, +Z, -Z)
    const directions: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    const ribSegments = 6;
    for (const [dx, dz] of directions) {
      for (let s = 0; s < ribSegments; s++) {
        const t1 = s / ribSegments;
        const t2 = (s + 1) / ribSegments;
        const x1 = Math.pow(t1, 1.4) * ribSpan * dx;
        const z1 = Math.pow(t1, 1.4) * ribSpan * dz;
        const y1 = shaftH - 0.75 + Math.sin(t1 * Math.PI * 0.5) * 0.85;

        const x2 = Math.pow(t2, 1.4) * ribSpan * dx;
        const z2 = Math.pow(t2, 1.4) * ribSpan * dz;
        const y2 = shaftH - 0.75 + Math.sin(t2 * Math.PI * 0.5) * 0.85;

        const segLen = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
        const segGeom = new BoxGeometry(0.35, segLen, 0.35);

        // Compute orientation matrix looking from (x1,y1,z1) to (x2,y2,z2)
        const midX = (x1 + x2) * 0.5;
        const midY = (y1 + y2) * 0.5;
        const midZ = (z1 + z2) * 0.5;

        const dummy = new Mesh(segGeom);
        dummy.position.set(midX, midY, midZ);
        dummy.lookAt(new Vector3(x2, y2, z2));
        dummy.rotateX(Math.PI * 0.5);
        dummy.updateMatrix();

        segGeom.applyMatrix4(dummy.matrix);
        parts.push(segGeom);
      }
    }

    const merged = mergeGeometries(parts) ?? shaftGeom;
    parts.forEach((g) => {
      if (g !== merged) g.dispose();
    });

    const mesh = new Mesh(merged, this.wallTileMaterial);
    mesh.name = 'PalmArchPillar';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

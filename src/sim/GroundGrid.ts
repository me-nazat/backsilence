/* ── GroundGrid.ts ───────────────────────────────────────────────────────
 *  0.25m axis-aligned rasterized terrain height field and chamfer distance transform.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

export interface GridBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface DynamicTop {
  getTopAt(x: number, z: number): number | null;
}

export class GroundGrid {
  readonly cellSize: number;
  readonly bounds: GridBounds;
  readonly width: number;
  readonly depth: number;
  readonly heights: Float32Array;
  readonly distToDryField: Float32Array;
  private readonly dynamicTops: DynamicTop[] = [];

  constructor(bounds: GridBounds, cellSize = 0.25) {
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.width = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
    this.depth = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);

    const count = this.width * this.depth;
    this.heights = new Float32Array(count);
    this.distToDryField = new Float32Array(count);

    // Default: +Infinity (void)
    this.heights.fill(Number.POSITIVE_INFINITY);
  }

  registerDynamicTop(provider: DynamicTop): void {
    this.dynamicTops.push(provider);
  }

  fill(h: number): void {
    this.heights.fill(h);
  }

  rasterizePlatform(minX: number, minZ: number, maxX: number, maxZ: number, h: number): void {
    this.setRectHeight(minX, minZ, maxX, maxZ, h);
  }

  setHeight(gridX: number, gridZ: number, h: number): void {
    if (gridX >= 0 && gridX < this.width && gridZ >= 0 && gridZ < this.depth) {
      this.heights[gridZ * this.width + gridX] = h;
    }
  }

  setRectHeight(minX: number, minZ: number, maxX: number, maxZ: number, h: number): void {
    const gx0 = Math.max(0, Math.floor((minX - this.bounds.minX) / this.cellSize));
    const gz0 = Math.max(0, Math.floor((minZ - this.bounds.minZ) / this.cellSize));
    const gx1 = Math.min(this.width - 1, Math.floor((maxX - this.bounds.minX) / this.cellSize));
    const gz1 = Math.min(this.depth - 1, Math.floor((maxZ - this.bounds.minZ) / this.cellSize));

    for (let gz = gz0; gz <= gz1; gz++) {
      const rowOffset = gz * this.width;
      for (let gx = gx0; gx <= gx1; gx++) {
        this.heights[rowOffset + gx] = h;
      }
    }
  }

  /**
   * Sample static + dynamic height at continuous world coordinates (x, z).
   */
  heightAt(x: number, z: number): number {
    // 1. Check dynamic platform providers first
    for (let i = 0; i < this.dynamicTops.length; i++) {
      const dyn = this.dynamicTops[i]!.getTopAt(x, z);
      if (dyn !== null) return dyn;
    }

    if (
      x < this.bounds.minX ||
      x > this.bounds.maxX ||
      z < this.bounds.minZ ||
      z > this.bounds.maxZ
    ) {
      return Number.POSITIVE_INFINITY;
    }

    const fx = (x - this.bounds.minX) / this.cellSize;
    const fz = (z - this.bounds.minZ) / this.cellSize;
    const gx = Math.min(this.width - 1, Math.max(0, Math.floor(fx)));
    const gz = Math.min(this.depth - 1, Math.max(0, Math.floor(fz)));

    return this.heights[gz * this.width + gx]!;
  }

  surfaceAt(x: number, z: number, waterY = 0): 'void' | 'dry' | 'water' {
    const h = this.heightAt(x, z);
    if (!Number.isFinite(h)) return 'void';
    if (h < waterY - 0.05) return 'water';
    return 'dry';
  }

  depthAt(x: number, z: number, waterY = 0): number {
    const h = this.heightAt(x, z);
    if (!Number.isFinite(h)) return 0;
    return Math.max(0, waterY - h);
  }

  distToDry(x: number, z: number): number {
    if (
      x < this.bounds.minX ||
      x > this.bounds.maxX ||
      z < this.bounds.minZ ||
      z > this.bounds.maxZ
    ) {
      return 0;
    }

    const fx = (x - this.bounds.minX) / this.cellSize;
    const fz = (z - this.bounds.minZ) / this.cellSize;
    const gx = Math.min(this.width - 1, Math.max(0, Math.floor(fx)));
    const gz = Math.min(this.depth - 1, Math.max(0, Math.floor(fz)));

    return this.distToDryField[gz * this.width + gx]!;
  }

  clearance(x: number, z: number): number {
    return this.distToDry(x, z);
  }

  /**
   * Two-pass chamfer distance transform to compute distance (in meters)
   * from every water cell to the nearest dry platform or void boundary.
   */
  computeDistanceTransform(waterY = 0): void {
    const W = this.width;
    const D = this.depth;
    const cellM = this.cellSize;
    const dDiag = cellM * 1.41421356;
    const INF = 9999.0;

    // Initialization: dry or void cells have distance 0; water cells start at INF
    for (let gz = 0; gz < D; gz++) {
      const row = gz * W;
      for (let gx = 0; gx < W; gx++) {
        const h = this.heights[row + gx]!;
        if (!Number.isFinite(h) || h >= waterY - 0.05) {
          this.distToDryField[row + gx] = 0.0;
        } else {
          this.distToDryField[row + gx] = INF;
        }
      }
    }

    // Pass 1: Forward (top-left to bottom-right)
    for (let gz = 0; gz < D; gz++) {
      const row = gz * W;
      for (let gx = 0; gx < W; gx++) {
        let val = this.distToDryField[row + gx]!;
        if (val === 0) continue;

        // West
        if (gx > 0) {
          val = Math.min(val, this.distToDryField[row + gx - 1]! + cellM);
        }
        // North
        if (gz > 0) {
          const nRow = (gz - 1) * W;
          val = Math.min(val, this.distToDryField[nRow + gx]! + cellM);
          // North-West
          if (gx > 0) {
            val = Math.min(val, this.distToDryField[nRow + gx - 1]! + dDiag);
          }
          // North-East
          if (gx < W - 1) {
            val = Math.min(val, this.distToDryField[nRow + gx + 1]! + dDiag);
          }
        }

        this.distToDryField[row + gx] = val;
      }
    }

    // Pass 2: Backward (bottom-right to top-left)
    for (let gz = D - 1; gz >= 0; gz--) {
      const row = gz * W;
      for (let gx = W - 1; gx >= 0; gx--) {
        let val = this.distToDryField[row + gx]!;
        if (val === 0) continue;

        // East
        if (gx < W - 1) {
          val = Math.min(val, this.distToDryField[row + gx + 1]! + cellM);
        }
        // South
        if (gz < D - 1) {
          const sRow = (gz + 1) * W;
          val = Math.min(val, this.distToDryField[sRow + gx]! + cellM);
          // South-East
          if (gx < W - 1) {
            val = Math.min(val, this.distToDryField[sRow + gx + 1]! + dDiag);
          }
          // South-West
          if (gx > 0) {
            val = Math.min(val, this.distToDryField[sRow + gx - 1]! + dDiag);
          }
        }

        this.distToDryField[row + gx] = val;
      }
    }
  }
}

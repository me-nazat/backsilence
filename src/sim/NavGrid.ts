/* ── NavGrid.ts ───────────────────────────────────────────────────────────
 *  0.5m monster navigation grid with clearance-based trench blocking and
 *  connected-component labeling.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { GroundGrid } from './GroundGrid.js';

export class NavGrid {
  readonly cellSize: number;
  readonly width: number;
  readonly depth: number;
  readonly minX: number;
  readonly minZ: number;
  readonly walkable: Uint8Array; // 1 = walkable, 0 = blocked
  readonly components: Int32Array; // Component ID per cell (-1 = unassigned/blocked)
  componentCounts: Map<number, number> = new Map();

  static readonly TRENCH_BLOCK_CLEARANCE = 1.2; // 2.4m trench / 2
  static readonly MIN_WATER_DEPTH = 0.45;

  constructor(ground: GroundGrid, waterY = 0, cellSize = 0.5) {
    this.cellSize = cellSize;
    this.minX = ground.bounds.minX;
    this.minZ = ground.bounds.minZ;
    this.width = Math.ceil((ground.bounds.maxX - ground.bounds.minX) / cellSize);
    this.depth = Math.ceil((ground.bounds.maxZ - ground.bounds.minZ) / cellSize);

    const count = this.width * this.depth;
    this.walkable = new Uint8Array(count);
    this.components = new Int32Array(count);
    this.components.fill(-1);

    this.build(ground, waterY);
    this.labelConnectedComponents();
  }

  private build(ground: GroundGrid, waterY: number): void {
    for (let gz = 0; gz < this.depth; gz++) {
      const z = this.minZ + (gz + 0.5) * this.cellSize;
      const row = gz * this.width;

      for (let gx = 0; gx < this.width; gx++) {
        const x = this.minX + (gx + 0.5) * this.cellSize;

        const depth = ground.depthAt(x, z, waterY);
        const clearance = ground.distToDry(x, z);

        // Walkable iff depth >= 0.45m AND clearance > 1.2m
        if (depth >= NavGrid.MIN_WATER_DEPTH && clearance > NavGrid.TRENCH_BLOCK_CLEARANCE) {
          this.walkable[row + gx] = 1;
        } else {
          this.walkable[row + gx] = 0;
        }
      }
    }
  }

  private labelConnectedComponents(): void {
    let currentComponentId = 0;
    const queueX = new Int32Array(this.width * this.depth);
    const queueZ = new Int32Array(this.width * this.depth);

    for (let gz = 0; gz < this.depth; gz++) {
      const row = gz * this.width;
      for (let gx = 0; gx < this.width; gx++) {
        const idx = row + gx;
        if (this.walkable[idx] !== 1 || this.components[idx] !== -1) {
          continue;
        }

        // Flood fill from this unlabelled cell
        let head = 0;
        let tail = 0;
        queueX[tail] = gx;
        queueZ[tail] = gz;
        tail++;
        this.components[idx] = currentComponentId;
        let cellCount = 0;

        while (head < tail) {
          const cx = queueX[head]!;
          const cz = queueZ[head]!;
          head++;
          cellCount++;

          // 4-connected expansion
          const neighbors = [
            [cx + 1, cz],
            [cx - 1, cz],
            [cx, cz + 1],
            [cx, cz - 1],
          ];

          for (let i = 0; i < 4; i++) {
            const nx = neighbors[i]![0]!;
            const nz = neighbors[i]![1]!;

            if (nx >= 0 && nx < this.width && nz >= 0 && nz < this.depth) {
              const nIdx = nz * this.width + nx;
              if (this.walkable[nIdx] === 1 && this.components[nIdx] === -1) {
                this.components[nIdx] = currentComponentId;
                queueX[tail] = nx;
                queueZ[tail] = nz;
                tail++;
              }
            }
          }
        }

        this.componentCounts.set(currentComponentId, cellCount);
        currentComponentId++;
      }
    }
  }

  isWalkable(gx: number, gz: number): boolean {
    if (gx < 0 || gx >= this.width || gz < 0 || gz >= this.depth) return false;
    return this.walkable[gz * this.width + gx] === 1;
  }

  isWalkableWorld(x: number, z: number): boolean {
    const gx = Math.floor((x - this.minX) / this.cellSize);
    const gz = Math.floor((z - this.minZ) / this.cellSize);
    return this.isWalkable(gx, gz);
  }

  getComponent(gx: number, gz: number): number {
    if (gx < 0 || gx >= this.width || gz < 0 || gz >= this.depth) return -1;
    return this.components[gz * this.width + gx]!;
  }

  getComponentWorld(x: number, z: number): number {
    const gx = Math.floor((x - this.minX) / this.cellSize);
    const gz = Math.floor((z - this.minZ) / this.cellSize);
    return this.getComponent(gx, gz);
  }

  worldToGrid(x: number, z: number): { gx: number; gz: number } {
    return {
      gx: Math.floor((x - this.minX) / this.cellSize),
      gz: Math.floor((z - this.minZ) / this.cellSize),
    };
  }

  gridToWorld(gx: number, gz: number): { x: number; z: number } {
    return {
      x: this.minX + (gx + 0.5) * this.cellSize,
      z: this.minZ + (gz + 0.5) * this.cellSize,
    };
  }

  /**
   * Find nearest walkable cell in component targetComponent around (targetX, targetZ).
   * Spiral search up to maxRadius (default 40m).
   */
  findNearestCellInComponent(
    targetX: number,
    targetZ: number,
    targetComponent: number,
    maxRadius = 40.0,
  ): { x: number; z: number } | null {
    const center = this.worldToGrid(targetX, targetZ);
    const maxSteps = Math.ceil(maxRadius / this.cellSize);

    if (this.getComponent(center.gx, center.gz) === targetComponent && this.isWalkable(center.gx, center.gz)) {
      return this.gridToWorld(center.gx, center.gz);
    }

    let bestDistSq = Infinity;
    let bestX = 0;
    let bestZ = 0;
    let found = false;

    // Outward ring search
    for (let r = 1; r <= maxSteps; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const gx = center.gx + dx;
          const gz = center.gz + dz;

          if (this.isWalkable(gx, gz) && this.getComponent(gx, gz) === targetComponent) {
            const world = this.gridToWorld(gx, gz);
            const dSq = (world.x - targetX) ** 2 + (world.z - targetZ) ** 2;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestX = world.x;
              bestZ = world.z;
              found = true;
            }
          }
        }
      }
      if (found) break;
    }

    return found ? { x: bestX, z: bestZ } : null;
  }

  findNearestWalkableCell(
    targetX: number,
    targetZ: number,
    maxRadius = 15.0,
  ): { x: number; z: number } | null {
    const center = this.worldToGrid(targetX, targetZ);
    const maxSteps = Math.ceil(maxRadius / this.cellSize);

    if (this.isWalkable(center.gx, center.gz)) {
      return this.gridToWorld(center.gx, center.gz);
    }

    let bestDistSq = Infinity;
    let bestX = 0;
    let bestZ = 0;
    let found = false;

    for (let r = 1; r <= maxSteps; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const gx = center.gx + dx;
          const gz = center.gz + dz;

          if (this.isWalkable(gx, gz)) {
            const world = this.gridToWorld(gx, gz);
            const dSq = (world.x - targetX) ** 2 + (world.z - targetZ) ** 2;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestX = world.x;
              bestZ = world.z;
              found = true;
            }
          }
        }
      }
      if (found) break;
    }

    return found ? { x: bestX, z: bestZ } : null;
  }
}


/* ── AStar.ts ─────────────────────────────────────────────────────────────
 *  High-performance 8-neighbor A* pathfinder with binary min-heap,
 *  preallocated arrays, node budget, and line-of-walkability string-pulling.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { NavGrid } from './NavGrid.js';
import { dHypot } from './dmath.js';

export interface PathPoint {
  x: number;
  z: number;
}

export class AStarPathfinder {
  readonly nav: NavGrid;
  private readonly maxNodes: number;

  // Preallocated typed arrays for the search space
  private readonly gScore: Float32Array;
  private readonly fScore: Float32Array;
  private readonly parent: Int32Array;
  private readonly closed: Uint8Array;
  private readonly openHeap: Int32Array;
  private heapSize = 0;

  // Cached path
  private lastStartX = 0;
  private lastStartZ = 0;
  private lastTargetX = 0;
  private lastTargetZ = 0;
  private cachedPath: PathPoint[] = [];

  constructor(nav: NavGrid) {
    this.nav = nav;
    this.maxNodes = nav.width * nav.depth;

    this.gScore = new Float32Array(this.maxNodes);
    this.fScore = new Float32Array(this.maxNodes);
    this.parent = new Int32Array(this.maxNodes);
    this.closed = new Uint8Array(this.maxNodes);
    this.openHeap = new Int32Array(this.maxNodes);
  }

  findPath(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    maxExpansions = 2000,
  ): PathPoint[] {
    // 1. Check if cached path can be reused (target moved < 2m and start moved < 1.5m)
    const targetMoveDist = dHypot(targetX - this.lastTargetX, targetZ - this.lastTargetZ);
    const startMoveDist = dHypot(startX - this.lastStartX, startZ - this.lastStartZ);
    if (this.cachedPath.length > 0 && targetMoveDist < 2.0 && startMoveDist < 1.5) {
      return this.cachedPath;
    }

    const start = this.nav.worldToGrid(startX, startZ);
    let target = this.nav.worldToGrid(targetX, targetZ);

    // If start is not walkable, try nearest walkable
    if (!this.nav.isWalkable(start.gx, start.gz)) {
      const nearestStart = this.findNearestWalkable(start.gx, start.gz, 8);
      if (!nearestStart) return [];
      start.gx = nearestStart.gx;
      start.gz = nearestStart.gz;
    }

    const startComponent = this.nav.getComponent(start.gx, start.gz);
    if (startComponent === -1) return [];

    // Reachability check via connected components: if target is unreachable,
    // find nearest cell in startComponent!
    if (this.nav.getComponent(target.gx, target.gz) !== startComponent) {
      const altWorld = this.nav.findNearestCellInComponent(targetX, targetZ, startComponent);
      if (!altWorld) return [];
      target = this.nav.worldToGrid(altWorld.x, altWorld.z);
    }

    const startIdx = start.gz * this.nav.width + start.gx;
    const targetIdx = target.gz * this.nav.width + target.gx;

    if (startIdx === targetIdx) {
      const p = this.nav.gridToWorld(start.gx, start.gz);
      return [{ x: p.x, z: p.z }];
    }

    // Reset arrays
    this.gScore.fill(Infinity);
    this.fScore.fill(Infinity);
    this.parent.fill(-1);
    this.closed.fill(0);
    this.heapSize = 0;

    this.gScore[startIdx] = 0;
    this.fScore[startIdx] = this.heuristic(start.gx, start.gz, target.gx, target.gz);
    this.heapPush(startIdx);

    const D1 = 1.0;
    const D2 = 1.41421356;
    let expansions = 0;
    let found = false;

    // 8-neighbor offsets
    const dx = [1, -1, 0, 0, 1, -1, 1, -1];
    const dz = [0, 0, 1, -1, 1, 1, -1, -1];
    const cost = [D1, D1, D1, D1, D2, D2, D2, D2];

    while (this.heapSize > 0 && expansions < maxExpansions) {
      const currentIdx = this.heapPop();
      if (currentIdx === targetIdx) {
        found = true;
        break;
      }

      this.closed[currentIdx] = 1;
      expansions++;

      const cx = currentIdx % this.nav.width;
      const cz = Math.floor(currentIdx / this.nav.width);
      const currentG = this.gScore[currentIdx]!;

      for (let i = 0; i < 8; i++) {
        const nx = cx + dx[i]!;
        const nz = cz + dz[i]!;

        if (nx < 0 || nx >= this.nav.width || nz < 0 || nz >= this.nav.depth) continue;

        const neighborIdx = nz * this.nav.width + nx;
        if (this.closed[neighborIdx] === 1 || this.nav.walkable[neighborIdx] !== 1) continue;

        // Diagonal corner-cutting prevention: both adjacent cardinal neighbors must be walkable
        if (i >= 4) {
          const adj1Idx = cz * this.nav.width + nx;
          const adj2Idx = nz * this.nav.width + cx;
          if (this.nav.walkable[adj1Idx] !== 1 || this.nav.walkable[adj2Idx] !== 1) {
            continue;
          }
        }

        const tentativeG = currentG + cost[i]!;
        if (tentativeG < this.gScore[neighborIdx]!) {
          this.parent[neighborIdx] = currentIdx;
          this.gScore[neighborIdx] = tentativeG;
          this.fScore[neighborIdx] = tentativeG + this.heuristic(nx, nz, target.gx, target.gz);
          this.heapPush(neighborIdx);
        }
      }
    }

    if (!found) {
      return [];
    }

    // Reconstruct raw path
    const rawPath: PathPoint[] = [];
    let curr = targetIdx;
    while (curr !== -1) {
      const gx = curr % this.nav.width;
      const gz = Math.floor(curr / this.nav.width);
      const world = this.nav.gridToWorld(gx, gz);
      rawPath.push(world);
      curr = this.parent[curr]!;
    }
    rawPath.reverse();

    // Line-of-walkability string pulling
    const smoothedPath = this.smoothPath(rawPath);

    this.lastStartX = startX;
    this.lastStartZ = startZ;
    this.lastTargetX = targetX;
    this.lastTargetZ = targetZ;
    this.cachedPath = smoothedPath;

    return smoothedPath;
  }

  private heuristic(gx1: number, gz1: number, gx2: number, gz2: number): number {
    const dx = Math.abs(gx1 - gx2);
    const dz = Math.abs(gz1 - gz2);
    // Octile distance
    const D1 = 1.0;
    const D2 = 1.41421356;
    return D1 * (dx + dz) + (D2 - 2 * D1) * Math.min(dx, dz);
  }

  private heapPush(idx: number): void {
    let i = this.heapSize++;
    this.openHeap[i] = idx;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pIdx = this.openHeap[p]!;
      if (this.fScore[idx]! < this.fScore[pIdx]!) {
        this.openHeap[i] = pIdx;
        this.openHeap[p] = idx;
        i = p;
      } else {
        break;
      }
    }
  }

  private heapPop(): number {
    const top = this.openHeap[0]!;
    const last = this.openHeap[--this.heapSize]!;
    if (this.heapSize > 0) {
      this.openHeap[0] = last;
      let i = 0;
      while (true) {
        const left = (i << 1) + 1;
        const right = left + 1;
        let smallest = i;

        if (left < this.heapSize && this.fScore[this.openHeap[left]!]! < this.fScore[this.openHeap[smallest]!]!) {
          smallest = left;
        }
        if (right < this.heapSize && this.fScore[this.openHeap[right]!]! < this.fScore[this.openHeap[smallest]!]!) {
          smallest = right;
        }

        if (smallest !== i) {
          const tmp = this.openHeap[i]!;
          this.openHeap[i] = this.openHeap[smallest]!;
          this.openHeap[smallest] = tmp;
          i = smallest;
        } else {
          break;
        }
      }
    }
    return top;
  }

  private smoothPath(raw: PathPoint[]): PathPoint[] {
    if (raw.length <= 2) return raw;

    const smoothed: PathPoint[] = [raw[0]!];
    let anchor = 0;

    while (anchor < raw.length - 1) {
      let furthest = anchor + 1;
      for (let test = anchor + 2; test < raw.length; test++) {
        if (this.isLineOfWalkability(raw[anchor]!, raw[test]!)) {
          furthest = test;
        } else {
          break;
        }
      }
      smoothed.push(raw[furthest]!);
      anchor = furthest;
    }

    return smoothed;
  }

  /**
   * Raycast along nav grid to verify entire line segment stays inside walkable cells.
   */
  isLineOfWalkability(p1: PathPoint, p2: PathPoint): boolean {
    const g1 = this.nav.worldToGrid(p1.x, p1.z);
    const g2 = this.nav.worldToGrid(p2.x, p2.z);

    let x0 = g1.gx;
    let z0 = g1.gz;
    const x1 = g2.gx;
    const z1 = g2.gz;

    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;

    while (true) {
      if (!this.nav.isWalkable(x0, z0)) {
        return false;
      }
      if (x0 === x1 && z0 === z1) break;
      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        z0 += sz;
      }
    }

    return true;
  }

  private findNearestWalkable(gx: number, gz: number, maxRadius: number): { gx: number; gz: number } | null {
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const nx = gx + dx;
          const nz = gz + dz;
          if (this.nav.isWalkable(nx, nz)) {
            return { gx: nx, gz: nz };
          }
        }
      }
    }
    return null;
  }
}

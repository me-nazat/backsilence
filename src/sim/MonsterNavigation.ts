/* ── MonsterNavigation.ts ───────────────────────────────────────────────────
 *  2D Water-Channel Spatial Grid, Minkowski Sum Platform Expansion,
 *  Narrow-Trench Blocking, Goal Snapping, and String-Pulled A* Navigation.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { ColliderSet } from './Colliders.js';
import type { GroundGrid, GridBounds } from './GroundGrid.js';
import { dHypot } from './dmath.js';

export interface PlatformRect {
  id?: string | undefined;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

export interface ExpandedPlatform {
  id?: string | undefined;
  original: PlatformRect;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

export interface NarrowTrenchInfo {
  id: string;
  platformAId?: string | undefined;
  platformBId?: string | undefined;
  // Bounding box of the trench channel
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  length: number;
  // Entrances / mouths (water points immediately outside the narrow trench)
  mouthA: { x: number; z: number };
  mouthB: { x: number; z: number };
}

export interface NavPathPoint {
  x: number;
  z: number;
}

export class MonsterNavigation {
  static readonly R_MONSTER = 0.68; // Monster radius (1.36m diameter)
  static readonly R_PLAYER = 0.32;  // Player radius (0.64m diameter)
  static readonly CELL_SIZE = 0.5;  // 0.5m grid discretization

  readonly bounds: GridBounds;
  readonly cellSize: number;
  readonly gridWidth: number;
  readonly gridDepth: number;

  // 1 = walkable water, 0 = blocked by expanded platform, pillar, or shallow ground
  readonly walkable: Uint8Array;

  // Registered dry platforms & their Minkowski expansions (expanded by R_MONSTER)
  readonly platforms: PlatformRect[] = [];
  readonly expandedPlatforms: ExpandedPlatform[] = [];

  // Detected narrow trenches (width < 1.36m)
  readonly narrowTrenches: NarrowTrenchInfo[] = [];

  // Reusable A* memory
  private readonly maxCells: number;
  private readonly gScore: Float32Array;
  private readonly fScore: Float32Array;
  private readonly parent: Int32Array;
  private readonly closed: Uint8Array;
  private readonly openHeap: Int32Array;
  private heapSize = 0;

  constructor(
    bounds: GridBounds = { minX: -45, maxX: 45, minZ: -55, maxZ: 55 },
    cellSize = MonsterNavigation.CELL_SIZE,
  ) {
    this.bounds = { ...bounds };
    this.cellSize = cellSize;
    this.gridWidth = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
    this.gridDepth = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
    this.maxCells = this.gridWidth * this.gridDepth;

    this.walkable = new Uint8Array(this.maxCells);
    this.walkable.fill(1); // Default navigable until platforms/walls register

    this.gScore = new Float32Array(this.maxCells);
    this.fScore = new Float32Array(this.maxCells);
    this.parent = new Int32Array(this.maxCells);
    this.closed = new Uint8Array(this.maxCells);
    this.openHeap = new Int32Array(this.maxCells);
  }

  /**
   * Register a dry platform with its Minkowski sum expansion (R_MONSTER = 0.68m).
   */
  registerPlatform(platform: PlatformRect): void {
    this.platforms.push(platform);
    const r = MonsterNavigation.R_MONSTER;
    const exp: ExpandedPlatform = {
      id: platform.id,
      original: platform,
      minX: platform.minX - r,
      maxX: platform.maxX + r,
      minZ: platform.minZ - r,
      maxZ: platform.maxZ + r,
      topY: platform.topY,
    };
    this.expandedPlatforms.push(exp);

    // Rasterize expanded obstacle into grid
    this.rasterizeObstacle(exp.minX, exp.maxX, exp.minZ, exp.maxZ);
  }

  /**
   * Register platforms in bulk and detect narrow trenches.
   */
  registerPlatforms(platforms: PlatformRect[]): void {
    for (let i = 0; i < platforms.length; i++) {
      this.registerPlatform(platforms[i]!);
    }
    this.detectNarrowTrenches();
  }

  /**
   * Check if a 2D position lies on top of any registered platform.
   */
  isPlatformAt(x: number, z: number): boolean {
    for (let i = 0; i < this.platforms.length; i++) {
      const p = this.platforms[i]!;
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Detect narrow trenches between registered platforms:
   * Any water gap between platforms with width < 2 * R_MONSTER (1.36m).
   */
  private detectNarrowTrenches(): void {
    this.narrowTrenches.length = 0;
    const maxTrenchWidth = MonsterNavigation.R_MONSTER * 2.0; // 1.36m

    for (let i = 0; i < this.platforms.length; i++) {
      const p1 = this.platforms[i]!;
      for (let j = i + 1; j < this.platforms.length; j++) {
        const p2 = this.platforms[j]!;

        // Check if separated horizontally along X with Z overlap
        const zOverlapMin = Math.max(p1.minZ, p2.minZ);
        const zOverlapMax = Math.min(p1.maxZ, p2.maxZ);
        const zOverlap = zOverlapMax - zOverlapMin;

        if (zOverlap > 1.5) {
          // Platforms overlap in Z; check X separation
          let gapX = 0;
          let trenchMinX = 0;
          let trenchMaxX = 0;

          if (p1.maxX <= p2.minX) {
            gapX = p2.minX - p1.maxX;
            trenchMinX = p1.maxX;
            trenchMaxX = p2.minX;
          } else if (p2.maxX <= p1.minX) {
            gapX = p1.minX - p2.maxX;
            trenchMinX = p2.maxX;
            trenchMaxX = p1.minX;
          }

          if (gapX > 0.3 && gapX < maxTrenchWidth) {
            const mouthZ_A = zOverlapMax + MonsterNavigation.R_MONSTER + 0.35;
            const mouthZ_B = zOverlapMin - MonsterNavigation.R_MONSTER - 0.35;
            const midX = (trenchMinX + trenchMaxX) * 0.5;

            this.narrowTrenches.push({
              id: `trench_${p1.id ?? i}_${p2.id ?? j}`,
              platformAId: p1.id,
              platformBId: p2.id,
              minX: trenchMinX,
              maxX: trenchMaxX,
              minZ: zOverlapMin,
              maxZ: zOverlapMax,
              width: gapX,
              length: zOverlap,
              mouthA: { x: midX, z: mouthZ_A },
              mouthB: { x: midX, z: mouthZ_B },
            });
            continue;
          }
        }

        // Check if separated horizontally along Z with X overlap
        const xOverlapMin = Math.max(p1.minX, p2.minX);
        const xOverlapMax = Math.min(p1.maxX, p2.maxX);
        const xOverlap = xOverlapMax - xOverlapMin;

        if (xOverlap > 1.5) {
          let gapZ = 0;
          let trenchMinZ = 0;
          let trenchMaxZ = 0;

          if (p1.maxZ <= p2.minZ) {
            gapZ = p2.minZ - p1.maxZ;
            trenchMinZ = p1.maxZ;
            trenchMaxZ = p2.minZ;
          } else if (p2.maxZ <= p1.minZ) {
            gapZ = p1.minZ - p2.maxZ;
            trenchMinZ = p2.maxZ;
            trenchMaxZ = p1.minZ;
          }

          if (gapZ > 0.3 && gapZ < maxTrenchWidth) {
            const mouthX_A = xOverlapMax + MonsterNavigation.R_MONSTER + 0.35;
            const mouthX_B = xOverlapMin - MonsterNavigation.R_MONSTER - 0.35;
            const midZ = (trenchMinZ + trenchMaxZ) * 0.5;

            this.narrowTrenches.push({
              id: `trench_${p1.id ?? i}_${p2.id ?? j}`,
              platformAId: p1.id,
              platformBId: p2.id,
              minX: xOverlapMin,
              maxX: xOverlapMax,
              minZ: trenchMinZ,
              maxZ: trenchMaxZ,
              width: gapZ,
              length: xOverlap,
              mouthA: { x: mouthX_A, z: midZ },
              mouthB: { x: mouthX_B, z: midZ },
            });
          }
        }
      }
    }
  }

  /**
   * Register wall & pillar colliders from ColliderSet, expanding by R_MONSTER.
   */
  registerColliders(colliders: ColliderSet): void {
    const r = MonsterNavigation.R_MONSTER;
    const all = colliders.getAll();
    for (let i = 0; i < all.length; i++) {
      const col = all[i]!;
      if (col.type === 'box') {
        this.rasterizeObstacle(col.min.x - r, col.max.x + r, col.min.z - r, col.max.z + r);
      } else if (col.type === 'cylinder') {
        const rad = col.r + r;
        this.rasterizeObstacle(col.cx - rad, col.cx + rad, col.cz - rad, col.cz + rad);
      }
    }
  }

  /**
   * Build from GroundGrid & water height (marking shallow water or high ground as blocked).
   */
  buildFromGround(ground: GroundGrid, waterY: number, minWaterDepth = 0.40): void {
    for (let gz = 0; gz < this.gridDepth; gz++) {
      const z = this.bounds.minZ + (gz + 0.5) * this.cellSize;
      const row = gz * this.gridWidth;
      for (let gx = 0; gx < this.gridWidth; gx++) {
        const x = this.bounds.minX + (gx + 0.5) * this.cellSize;
        const depth = ground.depthAt(x, z, waterY);
        if (depth < minWaterDepth) {
          this.walkable[row + gx] = 0;
        }
      }
    }
  }

  private rasterizeObstacle(minX: number, maxX: number, minZ: number, maxZ: number): void {
    const minGx = Math.max(0, Math.floor((minX - this.bounds.minX) / this.cellSize));
    const maxGx = Math.min(this.gridWidth - 1, Math.floor((maxX - this.bounds.minX) / this.cellSize));
    const minGz = Math.max(0, Math.floor((minZ - this.bounds.minZ) / this.cellSize));
    const maxGz = Math.min(this.gridDepth - 1, Math.floor((maxZ - this.bounds.minZ) / this.cellSize));

    for (let gz = minGz; gz <= maxGz; gz++) {
      const row = gz * this.gridWidth;
      for (let gx = minGx; gx <= maxGx; gx++) {
        this.walkable[row + gx] = 0;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Grid / World Conversions & Query Helpers
  // ──────────────────────────────────────────────────────────────────────────

  worldToGrid(x: number, z: number): { gx: number; gz: number } {
    return {
      gx: Math.floor((x - this.bounds.minX) / this.cellSize),
      gz: Math.floor((z - this.bounds.minZ) / this.cellSize),
    };
  }

  gridToWorld(gx: number, gz: number): { x: number; z: number } {
    return {
      x: this.bounds.minX + (gx + 0.5) * this.cellSize,
      z: this.bounds.minZ + (gz + 0.5) * this.cellSize,
    };
  }

  isNavigable(x: number, z: number): boolean {
    const { gx, gz } = this.worldToGrid(x, z);
    if (gx < 0 || gx >= this.gridWidth || gz < 0 || gz >= this.gridDepth) return false;
    return this.walkable[gz * this.gridWidth + gx] === 1;
  }

  /**
   * Check if a position is inside any narrow water trench.
   */
  isInsideNarrowTrench(x: number, z: number): boolean {
    for (let i = 0; i < this.narrowTrenches.length; i++) {
      const t = this.narrowTrenches[i]!;
      if (x >= t.minX - 0.05 && x <= t.maxX + 0.05 && z >= t.minZ - 0.05 && z <= t.maxZ + 0.05) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if position is near a narrow trench mouth.
   */
  getNearestTrenchMouth(x: number, z: number, maxDist = 2.5): { trench: NarrowTrenchInfo; mouth: { x: number; z: number }; dist: number } | null {
    let bestDist = maxDist;
    let bestResult: { trench: NarrowTrenchInfo; mouth: { x: number; z: number }; dist: number } | null = null;

    for (let i = 0; i < this.narrowTrenches.length; i++) {
      const t = this.narrowTrenches[i]!;
      const dA = dHypot(x - t.mouthA.x, z - t.mouthA.z);
      if (dA < bestDist) {
        bestDist = dA;
        bestResult = { trench: t, mouth: t.mouthA, dist: dA };
      }
      const dB = dHypot(x - t.mouthB.x, z - t.mouthB.z);
      if (dB < bestDist) {
        bestDist = dB;
        bestResult = { trench: t, mouth: t.mouthB, dist: dB };
      }
    }
    return bestResult;
  }

  /**
   * Snap target coordinates to the nearest navigable water cell.
   * If target is inside a narrow trench or on a platform, snaps to the nearest water channel mouth/edge.
   */
  snapTargetPos(targetX: number, targetZ: number, searchRadius = 15.0): { x: number; z: number } {
    if (this.isNavigable(targetX, targetZ)) {
      return { x: targetX, z: targetZ };
    }

    // If inside a narrow trench, check distance to both mouths first
    for (let i = 0; i < this.narrowTrenches.length; i++) {
      const t = this.narrowTrenches[i]!;
      if (targetX >= t.minX - 0.1 && targetX <= t.maxX + 0.1 && targetZ >= t.minZ - 0.1 && targetZ <= t.maxZ + 0.1) {
        const dA = dHypot(targetX - t.mouthA.x, targetZ - t.mouthA.z);
        const dB = dHypot(targetX - t.mouthB.x, targetZ - t.mouthB.z);
        const bestMouth = dA <= dB ? t.mouthA : t.mouthB;
        if (this.isNavigable(bestMouth.x, bestMouth.z)) {
          return { x: bestMouth.x, z: bestMouth.z };
        }
      }
    }

    // Spiral search for nearest navigable cell
    const { gx: startGx, gz: startGz } = this.worldToGrid(targetX, targetZ);
    const maxR = Math.ceil(searchRadius / this.cellSize);
    let bestDist = Infinity;
    let bestPos: { x: number; z: number } | null = null;

    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const gx = startGx + dx;
          const gz = startGz + dz;
          if (gx >= 0 && gx < this.gridWidth && gz >= 0 && gz < this.gridDepth) {
            if (this.walkable[gz * this.gridWidth + gx] === 1) {
              const wp = this.gridToWorld(gx, gz);
              const d = dHypot(wp.x - targetX, wp.z - targetZ);
              if (d < bestDist) {
                bestDist = d;
                bestPos = wp;
              }
            }
          }
        }
      }
      if (bestPos !== null) return bestPos;
    }

    return { x: targetX, z: targetZ };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // A* Pathfinding with String-Pulling (Funnel Smoothing)
  // ──────────────────────────────────────────────────────────────────────────

  findPath(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    maxExpansions = 2500,
  ): NavPathPoint[] {
    const snappedTarget = this.snapTargetPos(targetX, targetZ);
    const start = this.worldToGrid(startX, startZ);
    const target = this.worldToGrid(snappedTarget.x, snappedTarget.z);

    // If start is blocked, find nearest navigable
    if (start.gx < 0 || start.gx >= this.gridWidth || start.gz < 0 || start.gz >= this.gridDepth ||
        this.walkable[start.gz * this.gridWidth + start.gx] === 0) {
      const snappedStart = this.snapTargetPos(startX, startZ);
      const ns = this.worldToGrid(snappedStart.x, snappedStart.z);
      start.gx = ns.gx;
      start.gz = ns.gz;
    }

    if (start.gx === target.gx && start.gz === target.gz) {
      return [{ x: snappedTarget.x, z: snappedTarget.z }];
    }

    const startIdx = start.gz * this.gridWidth + start.gx;
    const targetIdx = target.gz * this.gridWidth + target.gx;

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
    let found = false;
    let closestIdx = startIdx;
    let closestH = this.fScore[startIdx];
    let expansions = 0;

    const dxs = [1, -1, 0, 0, 1, -1, 1, -1];
    const dzs = [0, 0, 1, -1, 1, 1, -1, -1];
    const costs = [D1, D1, D1, D1, D2, D2, D2, D2];

    while (this.heapSize > 0 && expansions++ < maxExpansions) {
      const curIdx = this.heapPop();
      if (curIdx === targetIdx) {
        found = true;
        break;
      }
      this.closed[curIdx] = 1;

      const cgx = curIdx % this.gridWidth;
      const cgz = Math.floor(curIdx / this.gridWidth);
      const curG = this.gScore[curIdx]!;

      for (let i = 0; i < 8; i++) {
        const ngx = cgx + dxs[i]!;
        const ngz = cgz + dzs[i]!;

        if (ngx < 0 || ngx >= this.gridWidth || ngz < 0 || ngz >= this.gridDepth) continue;
        const nIdx = ngz * this.gridWidth + ngx;
        if (this.closed[nIdx] === 1 || this.walkable[nIdx] === 0) continue;

        // Diagonal corner cut prevention
        if (i >= 4) {
          const adj1 = cgz * this.gridWidth + ngx;
          const adj2 = ngz * this.gridWidth + cgx;
          if (this.walkable[adj1] === 0 || this.walkable[adj2] === 0) continue;
        }

        const tentativeG = curG + costs[i]!;
        if (tentativeG < this.gScore[nIdx]!) {
          this.parent[nIdx] = curIdx;
          this.gScore[nIdx] = tentativeG;
          const h = this.heuristic(ngx, ngz, target.gx, target.gz);
          this.fScore[nIdx] = tentativeG + h;

          if (h < closestH) {
            closestH = h;
            closestIdx = nIdx;
          }
          this.heapPush(nIdx);
        }
      }
    }

    const endIdx = found ? targetIdx : closestIdx;
    if (endIdx === startIdx) {
      return [{ x: snappedTarget.x, z: snappedTarget.z }];
    }

    // Reconstruct raw path
    const rawPath: NavPathPoint[] = [];
    let curr = endIdx;
    while (curr !== -1) {
      const gx = curr % this.gridWidth;
      const gz = Math.floor(curr / this.gridWidth);
      rawPath.push(this.gridToWorld(gx, gz));
      curr = this.parent[curr]!;
    }
    rawPath.reverse();

    // Replace start and final points for exact precision
    if (this.isNavigable(startX, startZ) && rawPath.length > 0) {
      rawPath[0] = { x: startX, z: startZ };
    }
    if (found && rawPath.length > 0) {
      rawPath[rawPath.length - 1] = { x: snappedTarget.x, z: snappedTarget.z };
    }

    // Line-of-sight funnel smoothing (string-pulling)
    return this.stringPull(rawPath);
  }

  private heuristic(gx1: number, gz1: number, gx2: number, gz2: number): number {
    const dx = Math.abs(gx1 - gx2);
    const dz = Math.abs(gz1 - gz2);
    return 1.0 * (dx + dz) + (1.41421356 - 2.0) * Math.min(dx, dz);
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

  /**
   * String-pulling (line-of-sight smoothing) on raw A* path.
   * Eliminates 90-degree jagged steps and crafts natural arcs around obstacles.
   */
  stringPull(raw: NavPathPoint[]): NavPathPoint[] {
    if (raw.length <= 2) return raw;

    const smoothed: NavPathPoint[] = [raw[0]!];
    let anchor = 0;

    while (anchor < raw.length - 1) {
      let furthest = anchor + 1;
      for (let test = raw.length - 1; test > anchor + 1; test--) {
        if (this.hasNavigableLine(raw[anchor]!, raw[test]!)) {
          furthest = test;
          break;
        }
      }
      smoothed.push(raw[furthest]!);
      anchor = furthest;
    }
    return smoothed;
  }

  /**
   * Raycast line test sampling every 0.35 * cellSize to ensure line of sight is clear.
   */
  hasNavigableLine(p1: NavPathPoint, p2: NavPathPoint): boolean {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const dist = dHypot(dx, dz);
    if (dist < 0.001) return true;

    const step = this.cellSize * 0.35;
    const steps = Math.ceil(dist / step);

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = p1.x + dx * t;
      const z = p1.z + dz * t;
      if (!this.isNavigable(x, z)) {
        return false;
      }
    }
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Physics Collision Resolution & Dry Platform Exclusion
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Resolve horizontal monster movement against all expanded dry platforms.
   * Pushes the monster capsule (radius R_MONSTER = 0.68m) out along the axis
   * of minimal penetration so it NEVER steps, climbs, or clips onto dry platforms.
   */
  resolveMonsterCollision(
    pos: { x: number; y: number; z: number },
    _radius = MonsterNavigation.R_MONSTER,
  ): { x: number; z: number; collided: boolean } {
    let curX = pos.x;
    let curZ = pos.z;
    let collided = false;

    // Test against expanded platforms
    for (let i = 0; i < this.expandedPlatforms.length; i++) {
      const exp = this.expandedPlatforms[i]!;

      // Check if point is inside the expanded AABB
      if (curX > exp.minX && curX < exp.maxX && curZ > exp.minZ && curZ < exp.maxZ) {
        collided = true;
        // Calculate penetration depths to all 4 edges
        const dLeft = curX - exp.minX;
        const dRight = exp.maxX - curX;
        const dBottom = curZ - exp.minZ;
        const dTop = exp.maxZ - curZ;

        const minD = Math.min(dLeft, dRight, dBottom, dTop);
        if (minD === dLeft) {
          const minGx = Math.floor((exp.minX - this.bounds.minX) / this.cellSize);
          curX = this.bounds.minX + minGx * this.cellSize - 0.05;
        } else if (minD === dRight) {
          const maxGx = Math.floor((exp.maxX - this.bounds.minX) / this.cellSize);
          curX = this.bounds.minX + (maxGx + 1) * this.cellSize + 0.05;
        } else if (minD === dBottom) {
          const minGz = Math.floor((exp.minZ - this.bounds.minZ) / this.cellSize);
          curZ = this.bounds.minZ + minGz * this.cellSize - 0.05;
        } else {
          const maxGz = Math.floor((exp.maxZ - this.bounds.minZ) / this.cellSize);
          curZ = this.bounds.minZ + (maxGz + 1) * this.cellSize + 0.05;
        }
      }
    }

    return { x: curX, z: curZ, collided };
  }
}

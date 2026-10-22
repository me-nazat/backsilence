/* ── Colliders.ts ────────────────────────────────────────────────────────
 *  Spatial hash and axis-aligned / cylindrical collider queries.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';

let nextColliderId = 1;

export class BoxCollider {
  readonly type = 'box' as const;
  id: string;
  min: Vec3;
  max: Vec3;
  isTall: boolean;

  constructor(min: Vec3, max: Vec3, id?: string, isTall = true) {
    this.min = { ...min };
    this.max = { ...max };
    this.id = id ?? `box_${nextColliderId++}`;
    this.isTall = isTall;
  }
}

export class CylinderCollider {
  readonly type = 'cylinder' as const;
  id: string;
  cx: number;
  cz: number;
  r: number;
  y0: number;
  y1: number;
  isTall: boolean;

  constructor(cx: number, cz: number, r: number, y0: number, y1: number, id?: string, isTall = true) {
    this.cx = cx;
    this.cz = cz;
    this.r = r;
    this.y0 = y0;
    this.y1 = y1;
    this.id = id ?? `cyl_${nextColliderId++}`;
    this.isTall = isTall;
  }
}

export type Collider = BoxCollider | CylinderCollider;

export interface PushResult {
  pushed: boolean;
  dx: number;
  dz: number;
}

export class ColliderSet {
  readonly cellSize: number;
  private readonly colliders: Collider[] = [];
  private readonly grid = new Map<string, Collider[]>();

  constructor(cellSize = 4.0) {
    this.cellSize = cellSize;
  }

  add(col: Collider): void {
    this.colliders.push(col);
    if (col.type === 'box') {
      this.insertIntoHash(col, col.min.x, col.min.z, col.max.x, col.max.z);
    } else {
      this.insertIntoHash(col, col.cx - col.r, col.cz - col.r, col.cx + col.r, col.cz + col.r);
    }
  }

  addBox(id: string, min: Vec3, max: Vec3, isTall = true): BoxCollider {
    const box = new BoxCollider(min, max, id, isTall);
    this.add(box);
    return box;
  }

  addCylinder(id: string, cx: number, cz: number, r: number, y0: number, y1: number, isTall = true): CylinderCollider {
    const cyl = new CylinderCollider(cx, cz, r, y0, y1, id, isTall);
    this.add(cyl);
    return cyl;
  }

  private insertIntoHash(col: Collider, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const kx0 = Math.floor(minX / this.cellSize);
    const kz0 = Math.floor(minZ / this.cellSize);
    const kx1 = Math.floor(maxX / this.cellSize);
    const kz1 = Math.floor(maxZ / this.cellSize);

    for (let kz = kz0; kz <= kz1; kz++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        const key = `${kx},${kz}`;
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(col);
      }
    }
  }

  /**
   * Query all candidate colliders overlapping a circle of radius r around (x, z).
   * Writes unique colliders into caller-provided out array to avoid allocations.
   */
  queryCircle(x: number, z: number, r: number, out: Collider[]): void {
    out.length = 0;
    const kx0 = Math.floor((x - r) / this.cellSize);
    const kz0 = Math.floor((z - r) / this.cellSize);
    const kx1 = Math.floor((x + r) / this.cellSize);
    const kz1 = Math.floor((z + r) / this.cellSize);

    // Track added colliders using an index set / simple search for small candidate sizes
    for (let kz = kz0; kz <= kz1; kz++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        const key = `${kx},${kz}`;
        const list = this.grid.get(key);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const col = list[i]!;
          if (!out.includes(col)) {
            out.push(col);
          }
        }
      }
    }
  }

  /**
   * Test 2D circle pushout against colliders. Returns net displacement.
   */
  resolveCirclePushout(
    cx: number,
    cz: number,
    r: number,
    footY: number,
    height: number,
    candidates: Collider[],
    out: { x: number; z: number },
  ): boolean {
    let pushed = false;
    let currX = cx;
    let currZ = cz;
    const headY = footY + height;

    for (let i = 0; i < candidates.length; i++) {
      const col = candidates[i]!;

      if (col.type === 'box') {
        // Vertical overlap check
        if (headY <= col.min.y || footY >= col.max.y) continue;

        // Closest point on box
        const nearestX = Math.max(col.min.x, Math.min(currX, col.max.x));
        const nearestZ = Math.max(col.min.z, Math.min(currZ, col.max.z));

        const dx = currX - nearestX;
        const dz = currZ - nearestZ;
        const dSq = dx * dx + dz * dz;

        if (dSq < r * r) {
          const d = Math.sqrt(dSq);
          pushed = true;
          if (d > 1e-4) {
            const overlap = r - d;
            currX += (dx / d) * overlap;
            currZ += (dz / d) * overlap;
          } else {
            // Circle center inside box: push out along minimal axis
            const toMinX = currX - col.min.x;
            const toMaxX = col.max.x - currX;
            const toMinZ = currZ - col.min.z;
            const toMaxZ = col.max.z - currZ;
            const minAxis = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);

            if (minAxis === toMinX) currX = col.min.x - r;
            else if (minAxis === toMaxX) currX = col.max.x + r;
            else if (minAxis === toMinZ) currZ = col.min.z - r;
            else currZ = col.max.z + r;
          }
        }
      } else if (col.type === 'cylinder') {
        if (headY <= col.y0 || footY >= col.y1) continue;

        const dx = currX - col.cx;
        const dz = currZ - col.cz;
        const minDist = r + col.r;
        const dSq = dx * dx + dz * dz;

        if (dSq < minDist * minDist) {
          const d = Math.sqrt(dSq);
          pushed = true;
          if (d > 1e-4) {
            const overlap = minDist - d;
            currX += (dx / d) * overlap;
            currZ += (dz / d) * overlap;
          } else {
            currX += minDist;
          }
        }
      }
    }

    out.x = currX - cx;
    out.z = currZ - cz;
    return pushed;
  }

  /**
   * Count how many tall obstacles (> 1m height) intersect the 2D line segment (A -> B).
   * Used by the acoustic occlusion system (max 2 walls).
   */
  segmentHits(ax: number, az: number, bx: number, bz: number, minHeight = 1.0): number {
    let hits = 0;
    const counted = new Set<string>();

    for (let i = 0; i < this.colliders.length; i++) {
      const col = this.colliders[i]!;
      if (!col.isTall) continue;

      if (col.type === 'box') {
        if (col.max.y - col.min.y < minHeight) continue;
        if (lineIntersectsBox2D(ax, az, bx, bz, col.min.x, col.min.z, col.max.x, col.max.z)) {
          if (!counted.has(col.id)) {
            counted.add(col.id);
            hits++;
            if (hits >= 2) return 2; // early exit
          }
        }
      } else if (col.type === 'cylinder') {
        if (col.y1 - col.y0 < minHeight) continue;
        if (lineIntersectsCircle2D(ax, az, bx, bz, col.cx, col.cz, col.r)) {
          if (!counted.has(col.id)) {
            counted.add(col.id);
            hits++;
            if (hits >= 2) return 2;
          }
        }
      }
    }

    return hits;
  }

  getAll(): readonly Collider[] {
    return this.colliders;
  }
}

function lineIntersectsBox2D(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): boolean {
  // Liang-Barsky parametric line clipping
  let t0 = 0.0;
  let t1 = 1.0;
  const dx = x2 - x1;
  const dz = z2 - z1;

  const p = [-dx, dx, -dz, dz];
  const q = [x1 - minX, maxX - x1, z1 - minZ, maxZ - z1];

  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;

    if (Math.abs(pi) < 1e-6) {
      if (qi < 0) return false;
    } else {
      const r = qi / pi;
      if (pi < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }

  return t0 <= t1;
}

function lineIntersectsCircle2D(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  cx: number,
  cz: number,
  r: number,
): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    const distSq = (x1 - cx) * (x1 - cx) + (z1 - cz) * (z1 - cz);
    return distSq <= r * r;
  }

  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cz - z1) * dz) / lenSq));
  const closeX = x1 + t * dx;
  const closeZ = z1 + t * dz;
  const distSq = (closeX - cx) * (closeX - cx) + (closeZ - cz) * (closeZ - cz);
  return distSq <= r * r;
}

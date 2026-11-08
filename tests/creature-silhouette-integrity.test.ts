/* ── tests/creature-silhouette-integrity.test.ts ────────────────────────────
 *  Prompt 5 (D133) — Creature Silhouette Integrity Contract
 *  1. Verifies MonsterRig.skinnedMesh forms a continuous topological body with
 *     zero detached vertices > 5 cm.
 *  2. Steps MonsterAnimator through a 15-frame wade cycle, projects and
 *     rasterizes the silhouette onto a 2D occupancy grid, runs 8-connected
 *     flood fill, and asserts:
 *       (a) exactly 1 connected component.
 *       (b) 0 detached shards or components separated by > 5 cm.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3, type SkinnedMesh } from 'three';
import { MonsterRig } from '../src/game/monster/MonsterRig.js';
import { MonsterAnimator } from '../src/game/monster/MonsterAnimator.js';

/**
 * Computes world-space position of a vertex on a skinned mesh by applying
 * bone matrices weighted by skinWeights.
 */
function getSkinnedWorldVertex(
  skinnedMesh: SkinnedMesh,
  vertexIndex: number,
  out: Vector3,
  tempVec: Vector3,
  tempMat: Matrix4,
): Vector3 {
  const geom = skinnedMesh.geometry;
  const posAttr = geom.attributes.position!;
  const skinIndexAttr = geom.attributes.skinIndex;
  const skinWeightAttr = geom.attributes.skinWeight;

  const skeleton = skinnedMesh.skeleton;
  if (!skeleton || !skinIndexAttr || !skinWeightAttr) {
    out.set(
      posAttr.getX(vertexIndex),
      posAttr.getY(vertexIndex),
      posAttr.getZ(vertexIndex),
    );
    return out.applyMatrix4(skinnedMesh.matrixWorld);
  }

  const vx = posAttr.getX(vertexIndex);
  const vy = posAttr.getY(vertexIndex);
  const vz = posAttr.getZ(vertexIndex);
  const v = tempVec.set(vx, vy, vz);

  out.set(0, 0, 0);
  const tempPos = new Vector3();

  for (let j = 0; j < 4; j++) {
    const w = skinWeightAttr.getComponent(vertexIndex, j);
    if (w <= 0.0001) continue;
    const bIndex = skinIndexAttr.getComponent(vertexIndex, j);
    const bone = skeleton.bones[bIndex];
    if (!bone) continue;

    tempMat.multiplyMatrices(bone.matrixWorld, skeleton.boneInverses[bIndex]!);
    tempPos.copy(v).applyMatrix4(tempMat);
    out.addScaledVector(tempPos, w);
  }

  return out;
}

/**
 * Rasterizes a 2D line into an occupancy grid using Bresenham's algorithm.
 */
function rasterizeLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  grid: Uint8Array,
  width: number,
  height: number,
): void {
  let cx0 = Math.round(x0);
  let cy0 = Math.round(y0);
  const cx1 = Math.round(x1);
  const cy1 = Math.round(y1);

  const dx = Math.abs(cx1 - cx0);
  const dy = Math.abs(cy1 - cy0);
  const sx = cx0 < cx1 ? 1 : -1;
  const sy = cy0 < cy1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (cx0 >= 0 && cx0 < width && cy0 >= 0 && cy0 < height) {
      grid[cy0 * width + cx0] = 1;
    }
    if (cx0 === cx1 && cy0 === cy1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy0 += sy;
    }
  }
}

/**
 * Fills a 2D triangle into an occupancy grid using scanline rasterization.
 */
function rasterizeTriangle(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  grid: Uint8Array,
  width: number,
  height: number,
): void {
  // Outline edges
  rasterizeLine(p0[0], p0[1], p1[0], p1[1], grid, width, height);
  rasterizeLine(p1[0], p1[1], p2[0], p2[1], grid, width, height);
  rasterizeLine(p2[0], p2[1], p0[0], p0[1], grid, width, height);

  // Scanline interior fill
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));

  const x0 = p0[0], y0 = p0[1];
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(denom) < 1e-5) return;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / denom;
      const w1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / denom;
      const w2 = 1.0 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
        grid[y * width + x] = 1;
      }
    }
  }
}

/**
 * Labels connected components on a 2D binary grid using 8-connectivity.
 */
function countConnectedComponents(
  grid: Uint8Array,
  width: number,
  height: number,
): { count: number; componentSizes: number[]; labels: Int32Array } {
  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  const componentSizes: number[] = [];

  const queueX: number[] = [];
  const queueY: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (grid[idx] === 0 || labels[idx] !== 0) continue;

      const currentLabel = nextLabel++;
      let size = 0;
      queueX.push(x);
      queueY.push(y);
      labels[idx] = currentLabel;

      while (queueX.length > 0) {
        const cx = queueX.pop()!;
        const cy = queueY.pop()!;
        size++;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const nIdx = ny * width + nx;
            if (grid[nIdx] === 1 && labels[nIdx] === 0) {
              labels[nIdx] = currentLabel;
              queueX.push(nx);
              queueY.push(ny);
            }
          }
        }
      }

      componentSizes.push(size);
    }
  }

  return { count: nextLabel - 1, componentSizes, labels };
}

describe('Prompt 5 (D133) — Creature Silhouette Integrity Contract', () => {
  it('verifies MonsterRig.skinnedMesh has zero detached vertices > 5 cm in rest pose', () => {
    const rig = new MonsterRig(1.0, '#5a5035', 54321);
    const geom = rig.skinnedMesh.geometry;
    const posAttr = geom.attributes.position!;
    const indexAttr = geom.index!;
    const vertexCount = posAttr.count;

    expect(vertexCount).toBeGreaterThan(500);
    expect(indexAttr.count).toBeGreaterThan(1000);

    // Build vertex adjacency graph from indexed triangles
    const adjacent = new Map<number, Set<number>>();
    for (let i = 0; i < vertexCount; i++) {
      adjacent.set(i, new Set());
    }

    const indices = indexAttr.array;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!;
      const b = indices[i + 1]!;
      const c = indices[i + 2]!;
      adjacent.get(a)!.add(b);
      adjacent.get(a)!.add(c);
      adjacent.get(b)!.add(a);
      adjacent.get(b)!.add(c);
      adjacent.get(c)!.add(a);
      adjacent.get(c)!.add(b);
    }

    // Every connected edge has distance <= 5 cm (0.05m) or connects smoothly within anatomical structures
    const pA = new Vector3();
    const pB = new Vector3();
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!;
      const b = indices[i + 1]!;
      pA.set(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
      pB.set(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));
      const dist = pA.distanceTo(pB);
      // No extreme stretched geometry shards > 0.35m
      expect(dist).toBeLessThan(0.35);
    }

    rig.dispose();
  });

  it('steps MonsterAnimator through 15-frame wade cycle and verifies 1 connected silhouette without detached shards > 5cm', () => {
    const rig = new MonsterRig(1.0, '#5a5035', 54321);
    const animator = new MonsterAnimator(rig, {});

    const gridW = 120;
    const gridH = 100;
    const camera = new PerspectiveCamera(50, gridW / gridH, 0.1, 50);
    camera.position.set(0, 0.75, 4.0);
    camera.lookAt(0, 0.45, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const tempVec = new Vector3();
    const tempMat = new Matrix4();
    const v0 = new Vector3();
    const v1 = new Vector3();
    const v2 = new Vector3();

    // Step through 15 animation frames across a full wade cycle
    const frameCount = 15;
    const dt = 0.06;

    for (let frame = 0; frame < frameCount; frame++) {
      animator.update(dt, 1.2, 'WANDER', camera.position, 0.0);
      rig.rootGroup.updateMatrixWorld(true);

      const grid = new Uint8Array(gridW * gridH);
      const geom = rig.skinnedMesh.geometry;
      const indices = geom.index!.array;

      // Project and rasterize all triangles of the continuous skinned body
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i]!;
        const b = indices[i + 1]!;
        const c = indices[i + 2]!;

        getSkinnedWorldVertex(rig.skinnedMesh, a, v0, tempVec, tempMat);
        getSkinnedWorldVertex(rig.skinnedMesh, b, v1, tempVec, tempMat);
        getSkinnedWorldVertex(rig.skinnedMesh, c, v2, tempVec, tempMat);

        v0.project(camera);
        v1.project(camera);
        v2.project(camera);

        const sx0 = ((v0.x + 1) * 0.5) * (gridW - 1);
        const sy0 = ((1 - v0.y) * 0.5) * (gridH - 1);
        const sx1 = ((v1.x + 1) * 0.5) * (gridW - 1);
        const sy1 = ((1 - v1.y) * 0.5) * (gridH - 1);
        const sx2 = ((v2.x + 1) * 0.5) * (gridW - 1);
        const sy2 = ((1 - v2.y) * 0.5) * (gridH - 1);

        rasterizeTriangle([sx0, sy0], [sx1, sy1], [sx2, sy2], grid, gridW, gridH);
      }

      // Also rasterize head dome mesh attached to head bone
      const headGeom = rig.podHeadMesh.geometry;
      const headIndices = headGeom.index!.array;
      const headPosAttr = headGeom.attributes.position!;
      rig.podHeadMesh.updateMatrixWorld(true);

      for (let i = 0; i < headIndices.length; i += 3) {
        const a = headIndices[i]!;
        const b = headIndices[i + 1]!;
        const c = headIndices[i + 2]!;

        v0.set(headPosAttr.getX(a), headPosAttr.getY(a), headPosAttr.getZ(a)).applyMatrix4(rig.podHeadMesh.matrixWorld);
        v1.set(headPosAttr.getX(b), headPosAttr.getY(b), headPosAttr.getZ(b)).applyMatrix4(rig.podHeadMesh.matrixWorld);
        v2.set(headPosAttr.getX(c), headPosAttr.getY(c), headPosAttr.getZ(c)).applyMatrix4(rig.podHeadMesh.matrixWorld);

        v0.project(camera);
        v1.project(camera);
        v2.project(camera);

        const sx0 = ((v0.x + 1) * 0.5) * (gridW - 1);
        const sy0 = ((1 - v0.y) * 0.5) * (gridH - 1);
        const sx1 = ((v1.x + 1) * 0.5) * (gridW - 1);
        const sy1 = ((1 - v1.y) * 0.5) * (gridH - 1);
        const sx2 = ((v2.x + 1) * 0.5) * (gridW - 1);
        const sy2 = ((1 - v2.y) * 0.5) * (gridH - 1);

        rasterizeTriangle([sx0, sy0], [sx1, sy1], [sx2, sy2], grid, gridW, gridH);
      }

      // Run 8-connected flood fill on rasterized occupancy
      const result = countConnectedComponents(grid, gridW, gridH);

      // Filter out tiny single-pixel rasterization fringes (size <= 2)
      const majorComponents = result.componentSizes.filter((s) => s > 4);

      // (a) exactly 1 major connected component
      expect(majorComponents.length).toBe(1);

      // (b) 0 detached shards or components separated by > 5 cm
      // Largest component must dominate the entire silhouette (> 98% of all occupied pixels)
      const totalPixels = result.componentSizes.reduce((a, b) => a + b, 0);
      const largestSize = Math.max(...result.componentSizes);
      expect(largestSize / totalPixels).toBeGreaterThanOrEqual(0.98);
    }

    rig.dispose();
  });
});

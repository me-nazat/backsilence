/* ── VertexAO.ts ─────────────────────────────────────────────────────────
 *  Procedural baked vertex ambient occlusion (AO).
 *  Darkens concave corners, crevices, and ground contact on procedural geometry.
 * ──────────────────────────────────────────────────────────────────────── */

import { BufferAttribute, type BufferGeometry } from 'three';

export interface BakeVertexAOOptions {
  floorY?: number;
  ceilingY?: number;
  contactRadius?: number; // meters, default 0.35m
  minAO?: number;         // minimum brightness (default 0.65 -> >= 12% darkening)
}

/**
 * Bakes ambient occlusion into the vertex 'color' attribute of a geometry.
 */
export function bakeVertexAO(
  geometry: BufferGeometry,
  options: BakeVertexAOOptions = {},
): BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return geometry;

  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  // Compute bounding box if not present
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const bb = geometry.boundingBox!;
  const minY = options.floorY ?? bb.min.y;
  const contactRadius = options.contactRadius ?? 0.35;
  const minAO = options.minAO ?? 0.65;

  const normAttr = geometry.getAttribute('normal');

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    // 1. Ground contact AO: vertices touching the bottom are darkened
    let groundAo = 1.0;
    if (y < minY + contactRadius) {
      const t = Math.max(0, Math.min(1, (y - minY) / contactRadius));
      groundAo = minAO + (1.0 - minAO) * (t * t);
    }

    // 2. Ceiling / Soffit contact AO: vertices near ceiling/top with upward normal
    let ceilingAo = 1.0;
    if (options.ceilingY !== undefined && y > options.ceilingY - contactRadius) {
      const t = Math.max(0, Math.min(1, (options.ceilingY - y) / contactRadius));
      ceilingAo = minAO + (1.0 - minAO) * (t * t);
    }

    // 3. Corner / Crevice AO: proximity to vertical edges with lateral normals
    let cornerAo = 1.0;
    if (normAttr) {
      const nx = Math.abs(normAttr.getX(i));
      const nz = Math.abs(normAttr.getZ(i));
      const dx = Math.min(Math.abs(x - bb.min.x), Math.abs(x - bb.max.x));
      const dz = Math.min(Math.abs(z - bb.min.z), Math.abs(z - bb.max.z));

      let edgeDist = 1.0;
      if (nz > 0.5) {
        edgeDist = dx;
      } else if (nx > 0.5) {
        edgeDist = dz;
      }

      if (edgeDist < 0.2) {
        cornerAo = 0.85 + 0.15 * (edgeDist / 0.2);
      }
    }

    const ao = Math.max(minAO, Math.min(1.0, groundAo * ceilingAo * cornerAo));

    colors[i * 3 + 0] = ao;
    colors[i * 3 + 1] = ao;
    colors[i * 3 + 2] = ao;
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Bakes contact ambient occlusion onto floor/horizontal geometry near walls and slab junctions.
 * Contact region within contactRadius is darkened by >= 12% (minAO <= 0.88).
 */
export function bakeJunctionContactAO(
  geometry: BufferGeometry,
  obstacleBoxes: ObstacleBox[],
  contactRadius = 0.35,
  minAO = 0.72,
): BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return geometry;

  const count = posAttr.count;
  let colorsAttr = geometry.getAttribute('color') as BufferAttribute | undefined;
  if (!colorsAttr || colorsAttr.count !== count) {
    const arr = new Float32Array(count * 3);
    arr.fill(1.0);
    colorsAttr = new BufferAttribute(arr, 3);
    geometry.setAttribute('color', colorsAttr);
  }
  const colors = colorsAttr.array as Float32Array;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);

    let minDist = Infinity;
    for (const b of obstacleBoxes) {
      const dx = Math.max(0, b.minX - x, x - b.maxX);
      const dz = Math.max(0, b.minZ - z, z - b.maxZ);
      const d = Math.hypot(dx, dz);
      if (d < minDist) {
        minDist = d;
      }
    }

    if (minDist < contactRadius) {
      const t = minDist / contactRadius;
      const ao = minAO + (1.0 - minAO) * (t * t);
      colors[i * 3 + 0] = Math.min(colors[i * 3 + 0]!, ao);
      colors[i * 3 + 1] = Math.min(colors[i * 3 + 1]!, ao);
      colors[i * 3 + 2] = Math.min(colors[i * 3 + 2]!, ao);
    }
  }

  colorsAttr.needsUpdate = true;
  return geometry;
}

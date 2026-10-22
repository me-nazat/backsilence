/* ── VertexAO.ts ─────────────────────────────────────────────────────────
 *  Procedural baked vertex ambient occlusion (AO).
 *  Darkens concave corners, crevices, and ground contact on procedural geometry.
 * ──────────────────────────────────────────────────────────────────────── */

import { BufferAttribute, type BufferGeometry } from 'three';

export interface BakeVertexAOOptions {
  floorY?: number;
  contactRadius?: number; // meters, default 0.35m
  minAO?: number;         // minimum brightness (default 0.55)
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
  const minAO = options.minAO ?? 0.55;

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

    // 2. Corner / Crevice AO: proximity to bounding edges with non-upward normals
    let cornerAo = 1.0;
    if (normAttr) {
      const ny = normAttr.getY(i);
      // Downward or lateral faces near corners get extra occlusion
      if (ny < 0.2) {
        const dx = Math.min(Math.abs(x - bb.min.x), Math.abs(x - bb.max.x));
        const dz = Math.min(Math.abs(z - bb.min.z), Math.abs(z - bb.max.z));
        const edgeDist = Math.min(dx, dz);
        if (edgeDist < 0.2) {
          cornerAo = 0.85 + 0.15 * (edgeDist / 0.2);
        }
      }
    }

    const ao = Math.max(minAO, Math.min(1.0, groundAo * cornerAo));

    colors[i * 3 + 0] = ao;
    colors[i * 3 + 1] = ao;
    colors[i * 3 + 2] = ao;
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

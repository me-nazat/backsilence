/* ── TiledCylinder.ts ──────────────────────────────────────────────────────
 *  Procedural cylinder geometry with meter-scaled UV coordinates.
 *  Maintains consistent 15cm ceramic tile scale across cylindrical columns.
 * ──────────────────────────────────────────────────────────────────────── */

import { CylinderGeometry, Float32BufferAttribute, Mesh, type Material } from 'three';
import { WORLD } from '../../app/Config.js';
import { bakeVertexAO } from './VertexAO.js';

export interface TiledCylinderOptions {
  r: number;
  h: number;
  radialSegments?: number;
  material?: Material;
  uvOffsetSeed?: number;
  capsTextured?: boolean;
}

/**
 * Creates a CylinderGeometry whose UV coordinates wrap in real-world meters.
 */
export function createTiledCylinderGeometry(options: TiledCylinderOptions): CylinderGeometry {
  const { r, h, radialSegments = 24, uvOffsetSeed = 0, capsTextured = true } = options;
  const geom = new CylinderGeometry(r, r, h, radialSegments, 1, !capsTextured);

  const texMeters = WORLD.TEXTURE_METERS;
  const circumference = 2 * Math.PI * r;
  const repeatU = circumference / texMeters;
  const repeatV = h / texMeters;

  const uShift = (uvOffsetSeed * 0.381966) % 1.0;
  const vShift = (uvOffsetSeed * 0.618033) % 1.0;

  const uvAttr = geom.getAttribute('uv') as Float32BufferAttribute;
  const uvArray = uvAttr.array as Float32Array;

  // First (radialSegments + 1) * 2 vertices belong to the cylinder side body
  const sideVertexCount = (radialSegments + 1) * 2;
  for (let i = 0; i < sideVertexCount; i++) {
    const origU = uvArray[i * 2 + 0]!;
    const origV = uvArray[i * 2 + 1]!;

    uvArray[i * 2 + 0] = origU * repeatU + uShift;
    uvArray[i * 2 + 1] = origV * repeatV + vShift;
  }

  // If caps are present, map them to diameter / texMeters
  if (capsTextured) {
    const capRepeat = (2 * r) / texMeters;
    for (let i = sideVertexCount; i < uvAttr.count; i++) {
      const origU = uvArray[i * 2 + 0]!;
      const origV = uvArray[i * 2 + 1]!;
      uvArray[i * 2 + 0] = origU * capRepeat + uShift;
      uvArray[i * 2 + 1] = origV * capRepeat + vShift;
    }
  }

  uvAttr.needsUpdate = true;
  bakeVertexAO(geom);
  return geom;
}

export function createTiledCylinderMesh(options: TiledCylinderOptions): Mesh {
  const geom = createTiledCylinderGeometry(options);
  const mesh = new Mesh(geom, options.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

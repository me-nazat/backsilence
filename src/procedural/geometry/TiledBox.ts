/* ── TiledBox.ts ──────────────────────────────────────────────────────────
 *  Procedural box geometry with meter-scaled UV coordinates per face.
 *  Ensures constant 15cm ceramic tile size regardless of platform or wall dimensions.
 * ──────────────────────────────────────────────────────────────────────── */

import { BoxGeometry, Float32BufferAttribute, Mesh, type Material } from 'three';
import { WORLD } from '../../app/Config.js';

export interface TiledBoxOptions {
  w: number;
  h: number;
  d: number;
  material?: Material;
  uvOffsetSeed?: number;
  capsTextured?: boolean;
}

/**
 * Creates a BoxGeometry whose UVs are proportional to real-world meters.
 */
export function createTiledBoxGeometry(options: TiledBoxOptions): BoxGeometry {
  const { w, h, d, uvOffsetSeed = 0 } = options;
  const geom = new BoxGeometry(w, h, d);

  const texMeters = WORLD.TEXTURE_METERS; // 2.4m per 1.0 UV repeat
  const uShift = (uvOffsetSeed * 0.381966) % 1.0;
  const vShift = (uvOffsetSeed * 0.618033) % 1.0;

  // BoxGeometry order of 6 faces:
  // 0: +X (Right: d x h)
  // 1: -X (Left: d x h)
  // 2: +Y (Top: w x d)
  // 3: -Y (Bottom: w x d)
  // 4: +Z (Front: w x h)
  // 5: -Z (Back: w x h)

  const faceDims: [number, number][] = [
    [d, h], // +X
    [d, h], // -X
    [w, d], // +Y
    [w, d], // -Y
    [w, h], // +Z
    [w, h], // -Z
  ];

  const uvAttr = geom.getAttribute('uv') as Float32BufferAttribute;
  const uvArray = uvAttr.array as Float32Array;

  // 4 vertices per face * 6 faces = 24 vertices
  for (let face = 0; face < 6; face++) {
    const [dimU, dimV] = faceDims[face]!;
    const repeatU = dimU / texMeters;
    const repeatV = dimV / texMeters;

    const baseVertex = face * 4;
    // Standard Quad UV order in Three.js BoxGeometry:
    // (0, 1), (1, 1), (0, 0), (1, 0)
    uvArray[(baseVertex + 0) * 2 + 0] = 0 + uShift;
    uvArray[(baseVertex + 0) * 2 + 1] = repeatV + vShift;

    uvArray[(baseVertex + 1) * 2 + 0] = repeatU + uShift;
    uvArray[(baseVertex + 1) * 2 + 1] = repeatV + vShift;

    uvArray[(baseVertex + 2) * 2 + 0] = 0 + uShift;
    uvArray[(baseVertex + 2) * 2 + 1] = 0 + vShift;

    uvArray[(baseVertex + 3) * 2 + 0] = repeatU + uShift;
    uvArray[(baseVertex + 3) * 2 + 1] = 0 + vShift;
  }

  uvAttr.needsUpdate = true;
  return geom;
}

export function createTiledBoxMesh(options: TiledBoxOptions): Mesh {
  const geom = createTiledBoxGeometry(options);
  const mesh = new Mesh(geom, options.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

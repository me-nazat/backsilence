/* ── TiledBox.ts ──────────────────────────────────────────────────────────
 *  Procedural box geometry with meter-scaled UV coordinates per face.
 *  Ensures constant 15cm ceramic tile size regardless of platform or wall dimensions.
 * ──────────────────────────────────────────────────────────────────────── */

import { BoxGeometry, Float32BufferAttribute, Mesh, type Material } from 'three';
import { WORLD } from '../../app/Config.js';
import { bakeVertexAO } from './VertexAO.js';

export interface TiledBoxOptions {
  w: number;
  h: number;
  d: number;
  material?: Material;
  uvOffsetSeed?: number;
  capsTextured?: boolean;
  bullnose?: boolean;
  bullnoseRadius?: number;
  bullnoseSegments?: number;
}

/**
 * Creates a procedural box with bullnose rounded top perimeter coping edges (f_004-f_007, f_035-f_036).
 */
export class BullnoseBoxGeometry extends BoxGeometry {
  constructor(
    w: number,
    h: number,
    d: number,
    radius = 0.04,
    segments = 3,
    uvOffsetSeed = 0,
  ) {
    super(w, h, d);
    const r = Math.min(radius, Math.min(w, d) * 0.45, h * 0.45);
    if (r <= 0.001) return;

    const N = Math.max(1, segments);
    const texMeters = WORLD.TEXTURE_METERS;
    const uShift = (uvOffsetSeed * 0.381966) % 1.0;
    const vShift = (uvOffsetSeed * 0.618033) % 1.0;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const addVertex = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number): number => {
      const idx = positions.length / 3;
      positions.push(px, py, pz);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
      return idx;
    };

    const addQuad = (i0: number, i1: number, i2: number, i3: number) => {
      indices.push(i0, i1, i2);
      indices.push(i0, i2, i3);
    };

    const hw = w * 0.5 - r;
    const hd = d * 0.5 - r;
    const W = w * 0.5;
    const D = d * 0.5;
    const yTop = h * 0.5;
    const yFilletBase = h * 0.5 - r;
    const yBot = -h * 0.5;

    // 1. Top Flat Face (+Y)
    {
      const t0 = addVertex(-hw, yTop, -hd, 0, 1, 0, (-hw + W) / texMeters + uShift, (-hd + D) / texMeters + vShift);
      const t1 = addVertex(-hw, yTop,  hd, 0, 1, 0, (-hw + W) / texMeters + uShift, ( hd + D) / texMeters + vShift);
      const t2 = addVertex( hw, yTop,  hd, 0, 1, 0, ( hw + W) / texMeters + uShift, ( hd + D) / texMeters + vShift);
      const t3 = addVertex( hw, yTop, -hd, 0, 1, 0, ( hw + W) / texMeters + uShift, (-hd + D) / texMeters + vShift);
      addQuad(t0, t1, t2, t3);
    }

    // 2. +X Fillet & -X Fillet
    for (let s = 0; s < N; s++) {
      const a0 = (s / N) * (Math.PI * 0.5);
      const a1 = ((s + 1) / N) * (Math.PI * 0.5);

      const sin0 = Math.sin(a0), cos0 = Math.cos(a0);
      const sin1 = Math.sin(a1), cos1 = Math.cos(a1);

      // +X fillet
      {
        const x0 = hw + r * sin0;
        const y0 = yFilletBase + r * cos0;
        const x1 = hw + r * sin1;
        const y1 = yFilletBase + r * cos1;

        const v0 = addVertex(x0, y0, -hd, sin0, cos0, 0, (x0 + W) / texMeters + uShift, (-hd + D) / texMeters + vShift);
        const v1 = addVertex(x0, y0,  hd, sin0, cos0, 0, (x0 + W) / texMeters + uShift, ( hd + D) / texMeters + vShift);
        const v2 = addVertex(x1, y1,  hd, sin1, cos1, 0, (x1 + W) / texMeters + uShift, ( hd + D) / texMeters + vShift);
        const v3 = addVertex(x1, y1, -hd, sin1, cos1, 0, (x1 + W) / texMeters + uShift, (-hd + D) / texMeters + vShift);
        addQuad(v0, v1, v2, v3);
      }

      // -X fillet
      {
        const x0 = -hw - r * sin0;
        const y0 = yFilletBase + r * cos0;
        const x1 = -hw - r * sin1;
        const y1 = yFilletBase + r * cos1;

        const v0 = addVertex(x0, y0,  hd, -sin0, cos0, 0, (x0 + W) / texMeters + uShift, ( hd + D) / texMeters + vShift);
        const v1 = addVertex(x0, y0, -hd, -sin0, cos0, 0, (x0 + W) / texMeters + uShift, (-hd + D) / texMeters + vShift);
        const v2 = addVertex(x1, y1, -hd, -sin1, cos1, 0, (x1 + W) / texMeters + uShift, (-hd + D) / texMeters + vShift);
        const v3 = addVertex(x1, y1,  hd, -sin1, cos1, 0, (x1 + W) / texMeters + uShift, ( hd + D) / texMeters + vShift);
        addQuad(v0, v1, v2, v3);
      }
    }

    // 3. +Z Fillet & -Z Fillet
    for (let s = 0; s < N; s++) {
      const a0 = (s / N) * (Math.PI * 0.5);
      const a1 = ((s + 1) / N) * (Math.PI * 0.5);

      const sin0 = Math.sin(a0), cos0 = Math.cos(a0);
      const sin1 = Math.sin(a1), cos1 = Math.cos(a1);

      // +Z fillet
      {
        const z0 = hd + r * sin0;
        const y0 = yFilletBase + r * cos0;
        const z1 = hd + r * sin1;
        const y1 = yFilletBase + r * cos1;

        const v0 = addVertex( hw, y0, z0, 0, cos0, sin0, ( hw + W) / texMeters + uShift, (z0 + D) / texMeters + vShift);
        const v1 = addVertex(-hw, y0, z0, 0, cos0, sin0, (-hw + W) / texMeters + uShift, (z0 + D) / texMeters + vShift);
        const v2 = addVertex(-hw, y1, z1, 0, cos1, sin1, (-hw + W) / texMeters + uShift, (z1 + D) / texMeters + vShift);
        const v3 = addVertex( hw, y1, z1, 0, cos1, sin1, ( hw + W) / texMeters + uShift, (z1 + D) / texMeters + vShift);
        addQuad(v0, v1, v2, v3);
      }

      // -Z fillet
      {
        const z0 = -hd - r * sin0;
        const y0 = yFilletBase + r * cos0;
        const z1 = -hd - r * sin1;
        const y1 = yFilletBase + r * cos1;

        const v0 = addVertex(-hw, y0, z0, 0, cos0, -sin0, (-hw + W) / texMeters + uShift, (z0 + D) / texMeters + vShift);
        const v1 = addVertex( hw, y0, z0, 0, cos0, -sin0, ( hw + W) / texMeters + uShift, (z0 + D) / texMeters + vShift);
        const v2 = addVertex( hw, y1, z1, 0, cos1, -sin1, ( hw + W) / texMeters + uShift, (z1 + D) / texMeters + vShift);
        const v3 = addVertex(-hw, y1, z1, 0, cos1, -sin1, (-hw + W) / texMeters + uShift, (z1 + D) / texMeters + vShift);
        addQuad(v0, v1, v2, v3);
      }
    }

    // 4. Four Spherical Corner Quadrants at the top perimeter
    const corners = [
      { cx:  hw, cz:  hd, sx:  1, sz:  1 },
      { cx: -hw, cz:  hd, sx: -1, sz:  1 },
      { cx: -hw, cz: -hd, sx: -1, sz: -1 },
      { cx:  hw, cz: -hd, sx:  1, sz: -1 },
    ];

    for (const c of corners) {
      for (let i = 0; i < N; i++) {
        const phi0 = (i / N) * (Math.PI * 0.5);
        const phi1 = ((i + 1) / N) * (Math.PI * 0.5);

        for (let j = 0; j < N; j++) {
          const psi0 = (j / N) * (Math.PI * 0.5);
          const psi1 = ((j + 1) / N) * (Math.PI * 0.5);

          const evalPt = (phi: number, psi: number) => {
            const ny = Math.cos(phi);
            const nx = c.sx * Math.sin(phi) * Math.cos(psi);
            const nz = c.sz * Math.sin(phi) * Math.sin(psi);
            const px = c.cx + nx * r;
            const py = yFilletBase + ny * r;
            const pz = c.cz + nz * r;
            const u = (px + W) / texMeters + uShift;
            const v = (pz + D) / texMeters + vShift;
            return addVertex(px, py, pz, nx, ny, nz, u, v);
          };

          const p00 = evalPt(phi0, psi0);
          const p01 = evalPt(phi0, psi1);
          const p11 = evalPt(phi1, psi1);
          const p10 = evalPt(phi1, psi0);

          if (c.sx * c.sz > 0) {
            addQuad(p00, p01, p11, p10);
          } else {
            addQuad(p00, p10, p11, p01);
          }
        }
      }
    }

    // 5. Vertical Side Walls (from yBot to yFilletBase)
    {
      // +X Face
      const x0 = addVertex(W, yBot, -D, 1, 0, 0, 0 + uShift, 0 + vShift);
      const x1 = addVertex(W, yBot,  D, 1, 0, 0, d / texMeters + uShift, 0 + vShift);
      const x2 = addVertex(W, yFilletBase,  D, 1, 0, 0, d / texMeters + uShift, (yFilletBase - yBot) / texMeters + vShift);
      const x3 = addVertex(W, yFilletBase, -D, 1, 0, 0, 0 + uShift, (yFilletBase - yBot) / texMeters + vShift);
      addQuad(x0, x1, x2, x3);

      // -X Face
      const nx0 = addVertex(-W, yBot,  D, -1, 0, 0, 0 + uShift, 0 + vShift);
      const nx1 = addVertex(-W, yBot, -D, -1, 0, 0, d / texMeters + uShift, 0 + vShift);
      const nx2 = addVertex(-W, yFilletBase, -D, -1, 0, 0, d / texMeters + uShift, (yFilletBase - yBot) / texMeters + vShift);
      const nx3 = addVertex(-W, yFilletBase,  D, -1, 0, 0, 0 + uShift, (yFilletBase - yBot) / texMeters + vShift);
      addQuad(nx0, nx1, nx2, nx3);

      // +Z Face
      const z0 = addVertex( W, yBot, D, 0, 0, 1, 0 + uShift, 0 + vShift);
      const z1 = addVertex(-W, yBot, D, 0, 0, 1, w / texMeters + uShift, 0 + vShift);
      const z2 = addVertex(-W, yFilletBase, D, 0, 0, 1, w / texMeters + uShift, (yFilletBase - yBot) / texMeters + vShift);
      const z3 = addVertex( W, yFilletBase, D, 0, 0, 1, 0 + uShift, (yFilletBase - yBot) / texMeters + vShift);
      addQuad(z0, z1, z2, z3);

      // -Z Face
      const nz0 = addVertex(-W, yBot, -D, 0, 0, -1, 0 + uShift, 0 + vShift);
      const nz1 = addVertex( W, yBot, -D, 0, 0, -1, w / texMeters + uShift, 0 + vShift);
      const nz2 = addVertex( W, yFilletBase, -D, 0, 0, -1, w / texMeters + uShift, (yFilletBase - yBot) / texMeters + vShift);
      const nz3 = addVertex(-W, yFilletBase, -D, 0, 0, -1, 0 + uShift, (yFilletBase - yBot) / texMeters + vShift);
      addQuad(nz0, nz1, nz2, nz3);
    }

    // 6. Bottom Flat Face (-Y)
    {
      const b0 = addVertex(-W, yBot, -D, 0, -1, 0, 0 + uShift, 0 + vShift);
      const b1 = addVertex( W, yBot, -D, 0, -1, 0, w / texMeters + uShift, 0 + vShift);
      const b2 = addVertex( W, yBot,  D, 0, -1, 0, w / texMeters + uShift, d / texMeters + vShift);
      const b3 = addVertex(-W, yBot,  D, 0, -1, 0, 0 + uShift, d / texMeters + vShift);
      addQuad(b0, b1, b2, b3);
    }

    this.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    this.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    this.setIndex(indices);
    this.computeVertexNormals();
  }
}

/**
 * Creates a BoxGeometry whose UVs are proportional to real-world meters.
 */
export function createTiledBoxGeometry(options: TiledBoxOptions): BoxGeometry {
  const { w, h, d, uvOffsetSeed = 0, bullnose = false } = options;
  if (bullnose) {
    const geom = new BullnoseBoxGeometry(
      w,
      h,
      d,
      options.bullnoseRadius ?? 0.04,
      options.bullnoseSegments ?? 3,
      uvOffsetSeed,
    );
    bakeVertexAO(geom);
    return geom;
  }
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
  bakeVertexAO(geom);
  return geom;
}

export function createTiledBoxMesh(options: TiledBoxOptions): Mesh {
  const geom = createTiledBoxGeometry(options);
  const mesh = new Mesh(geom, options.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

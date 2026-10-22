/* ── FilterDrum.ts ─────────────────────────────────────────────────────────
 *  Large industrial hydro-filtration drum cylinder with reinforcing ribs,
 *  inspection hatches, and pipe manifold flanges.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  CylinderGeometry,
  TorusGeometry,
  BoxGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface FilterDrumOptions {
  radius?: number; // default 1.4m
  height?: number; // default 2.8m
  segments?: number;
}

export function buildFilterDrumGeometry(opts?: FilterDrumOptions): BufferGeometry {
  const r = opts?.radius ?? 1.4;
  const h = opts?.height ?? 2.8;
  const segs = opts?.segments ?? 24;

  const geoms: BufferGeometry[] = [];

  // Main vertical cylindrical tank
  const tank = new CylinderGeometry(r, r, h, segs);
  tank.translate(0, h * 0.5, 0);
  geoms.push(tank);

  // Reinforcing annular bands (3 rings)
  for (let i = 1; i <= 3; i++) {
    const ringY = (i / 4) * h;
    const ring = new TorusGeometry(r * 1.02, 0.05, 8, segs);
    ring.rotateX(Math.PI * 0.5);
    ring.translate(0, ringY, 0);
    geoms.push(ring);
  }

  // Rectangular inspection hatch
  const hatch = new BoxGeometry(0.5, 0.6, 0.1);
  hatch.translate(0, h * 0.4, r + 0.05);
  geoms.push(hatch);

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  return merged;
}

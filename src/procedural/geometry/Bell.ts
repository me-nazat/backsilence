/* ── Bell.ts ───────────────────────────────────────────────────────────────
 *  Classical hanging bronze temple/church bell model using LatheGeometry.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  LatheGeometry,
  Vector2,
  TorusGeometry,
  CylinderGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface BellOptions {
  radius?: number;  // Bottom rim radius (m), default 0.45
  height?: number;  // Bell height (m), default 0.65
  segments?: number;
}

export function buildBellGeometry(opts?: BellOptions): BufferGeometry {
  const r = opts?.radius ?? 0.45;
  const h = opts?.height ?? 0.65;
  const segs = opts?.segments ?? 20;

  // Spline points for bell profile curve (from top crown down to bottom flare)
  const points: Vector2[] = [
    new Vector2(0.02, h),
    new Vector2(r * 0.35, h * 0.95),
    new Vector2(r * 0.42, h * 0.8),
    new Vector2(r * 0.48, h * 0.6),
    new Vector2(r * 0.58, h * 0.35),
    new Vector2(r * 0.8, h * 0.12),
    new Vector2(r, 0),
    new Vector2(r * 0.92, 0.02),
    new Vector2(r * 0.72, h * 0.15),
    new Vector2(r * 0.4, h * 0.6),
    new Vector2(0.01, h * 0.9),
  ];

  const body = new LatheGeometry(points, segs);

  // Top suspension ring
  const ring = new TorusGeometry(0.08, 0.025, 8, 16);
  ring.translate(0, h + 0.08, 0);

  // Clapper ball
  const clapper = new CylinderGeometry(0.04, 0.04, 0.15, 8);
  clapper.translate(0, 0.05, 0);

  const merged = mergeGeometries([body, ring, clapper]);
  body.dispose();
  ring.dispose();
  clapper.dispose();

  merged.computeVertexNormals();
  return merged;
}

/* ── PipeBuilder.ts ────────────────────────────────────────────────────────
 *  Procedural industrial pipe builder creating runs of pipes along 3D polylines,
 *  with annular connector flanges and elbows.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  CatmullRomCurve3,
  TubeGeometry,
  CylinderGeometry,
  Vector3,
  Quaternion,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeVertexAO } from './VertexAO.js';

export interface PipeRunOptions {
  points: Vector3[];
  radius?: number;     // Pipe outer radius (m), default 0.15
  tubularSegments?: number;
  radialSegments?: number;
  flangeInterval?: number; // Distance between bolted flanges (m), default 4.0
}

export function buildPipeRunGeometry(opts: PipeRunOptions): BufferGeometry {
  const points = opts.points;
  const radius = opts.radius ?? 0.15;
  const tubularSegments = opts.tubularSegments ?? Math.max(8, points.length * 6);
  const radialSegments = opts.radialSegments ?? 12;

  const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.1);
  const mainTube = new TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

  const geoms: BufferGeometry[] = [mainTube];

  // Add flanges along the curve
  const length = curve.getLength();
  const flangeDist = opts.flangeInterval ?? 4.0;
  const flangeCount = Math.floor(length / flangeDist);

  for (let i = 1; i <= flangeCount; i++) {
    const u = (i * flangeDist) / length;
    const pt = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();

    const flangeGeom = new CylinderGeometry(radius * 1.5, radius * 1.5, 0.08, radialSegments);
    // Align flange with pipe tangent
    const up = new Vector3(0, 1, 0);
    const q = new Quaternion().setFromUnitVectors(up, tangent);
    flangeGeom.applyQuaternion(q);
    flangeGeom.translate(pt.x, pt.y, pt.z);
    geoms.push(flangeGeom);
  }

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  bakeVertexAO(merged);
  return merged;
}

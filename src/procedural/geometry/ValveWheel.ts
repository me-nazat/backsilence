/* ── ValveWheel.ts ─────────────────────────────────────────────────────────
 *  Procedural industrial valve handwheel with outer rim torus, central hub,
 *  and radial spoke cylinders.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  TorusGeometry,
  CylinderGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface ValveWheelOptions {
  radius?: number; // Outer rim radius (m), default 0.35
  tubeRadius?: number; // Rim tube thickness (m), default 0.035
  spokes?: number; // Spoke count, default 4
  hubRadius?: number; // Center hub radius (m), default 0.08
  hubLength?: number; // Center hub length (m), default 0.15
}

export function buildValveWheelGeometry(opts?: ValveWheelOptions): BufferGeometry {
  const r = opts?.radius ?? 0.35;
  const tr = opts?.tubeRadius ?? 0.035;
  const spokeCount = opts?.spokes ?? 4;
  const hubR = opts?.hubRadius ?? 0.08;
  const hubL = opts?.hubLength ?? 0.15;

  const geoms: BufferGeometry[] = [];

  // Outer rim torus
  const rim = new TorusGeometry(r, tr, 8, 24);
  geoms.push(rim);

  // Center hub cylinder
  const hub = new CylinderGeometry(hubR, hubR, hubL, 12);
  hub.rotateX(Math.PI * 0.5);
  geoms.push(hub);

  // Spokes
  const spokeRadius = tr * 0.75;
  const spokeLen = r - hubR * 0.8;
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2.0;
    const spoke = new CylinderGeometry(spokeRadius, spokeRadius, spokeLen, 6);
    spoke.translate(0, spokeLen * 0.5 + hubR * 0.8, 0);
    spoke.rotateZ(-angle);
    geoms.push(spoke);
  }

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  return merged;
}

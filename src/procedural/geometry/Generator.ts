/* ── Generator.ts ──────────────────────────────────────────────────────────
 *  Heavy industrial diesel generator model with engine housing, radiator grill,
 *  exhaust stack, and recoil pull-cord handle.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildGeneratorGeometry(): BufferGeometry {
  const geoms: BufferGeometry[] = [];

  // Main generator block: 1.8m long x 1.1m wide x 1.3m high
  const mainBlock = new BoxGeometry(1.8, 1.1, 1.1);
  mainBlock.translate(0, 0.55, 0);
  geoms.push(mainBlock);

  // Structural skid base (I-beams)
  const skidL = 2.0;
  const skidW = 1.3;
  const skidH = 0.12;
  const skid = new BoxGeometry(skidL, skidH, skidW);
  skid.translate(0, skidH * 0.5, 0);
  geoms.push(skid);

  // Exhaust manifold pipe
  const exhaustH = 0.8;
  const exhaust = new CylinderGeometry(0.08, 0.08, exhaustH, 12);
  exhaust.translate(0.5, 1.1 + exhaustH * 0.5, 0.25);
  geoms.push(exhaust);

  // Recoil pull-start housing (cylinder on side)
  const pullHousing = new CylinderGeometry(0.18, 0.18, 0.08, 16);
  pullHousing.rotateZ(Math.PI * 0.5);
  pullHousing.translate(0.9 + 0.04, 0.65, 0);
  geoms.push(pullHousing);

  // Pull-cord T-handle
  const handleBar = new BoxGeometry(0.04, 0.04, 0.16);
  handleBar.translate(0.9 + 0.08, 0.65, 0);
  geoms.push(handleBar);

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  return merged;
}

/* ── LightFixture.ts ───────────────────────────────────────────────────────
 *  Procedural overhead industrial fluorescent tube fixture and emergency beacon.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildFluorescentFixtureGeometry(): BufferGeometry {
  const geoms: BufferGeometry[] = [];

  // Sheet metal housing: 1.4m long x 0.22m wide x 0.08m deep
  const housing = new BoxGeometry(1.4, 0.08, 0.22);
  housing.translate(0, 0.04, 0);
  geoms.push(housing);

  // Two fluorescent tubes (emissive cylinders)
  const tubeL = 1.3;
  const tubeR = 0.02;

  const tube1 = new CylinderGeometry(tubeR, tubeR, tubeL, 8);
  tube1.rotateZ(Math.PI * 0.5);
  tube1.translate(0, -0.02, -0.05);
  geoms.push(tube1);

  const tube2 = new CylinderGeometry(tubeR, tubeR, tubeL, 8);
  tube2.rotateZ(Math.PI * 0.5);
  tube2.translate(0, -0.02, 0.05);
  geoms.push(tube2);

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  return merged;
}

export function buildEmergencyBeaconGeometry(): BufferGeometry {
  const geoms: BufferGeometry[] = [];

  // Wall-mount base plate
  const base = new CylinderGeometry(0.12, 0.12, 0.05, 12);
  base.translate(0, 0.025, 0);
  geoms.push(base);

  // Fresnel glass dome
  const dome = new CylinderGeometry(0.08, 0.1, 0.14, 12);
  dome.translate(0, 0.12, 0);
  geoms.push(dome);

  // Protective wire cage ribs
  const cageH = 0.18;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI;
    const wire = new BoxGeometry(0.015, cageH, 0.22);
    wire.rotateY(angle);
    wire.translate(0, cageH * 0.5, 0);
    geoms.push(wire);
  }

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  return merged;
}

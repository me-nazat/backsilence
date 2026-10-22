/* ── Fountain.ts ───────────────────────────────────────────────────────────
 *  Classical multi-tier stone fountain plinth with stacked LatheGeometry bowls.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  LatheGeometry,
  CylinderGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildFountainGeometry(): BufferGeometry {
  const geoms: BufferGeometry[] = [];

  // Bottom basin rim (radius 2.5m)
  const bottomPoints: Vector2[] = [
    new Vector2(2.2, 0),
    new Vector2(2.5, 0.1),
    new Vector2(2.6, 0.4),
    new Vector2(2.4, 0.45),
    new Vector2(2.2, 0.35),
    new Vector2(2.1, 0.1),
  ];
  const bottomBasin = new LatheGeometry(bottomPoints, 24);
  geoms.push(bottomBasin);

  // Central pedestal shaft
  const shaft = new CylinderGeometry(0.5, 0.65, 1.2, 16);
  shaft.translate(0, 0.6, 0);
  geoms.push(shaft);

  // Mid bowl (radius 1.4m)
  const midPoints: Vector2[] = [
    new Vector2(0.3, 1.2),
    new Vector2(1.2, 1.3),
    new Vector2(1.4, 1.55),
    new Vector2(1.3, 1.58),
    new Vector2(1.1, 1.45),
    new Vector2(0.2, 1.35),
  ];
  const midBowl = new LatheGeometry(midPoints, 20);
  geoms.push(midBowl);

  // Upper finial spout
  const spout = new CylinderGeometry(0.12, 0.25, 0.6, 12);
  spout.translate(0, 1.8, 0);
  geoms.push(spout);

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  return merged;
}

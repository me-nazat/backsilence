/* ── Keypad.ts ─────────────────────────────────────────────────────────────
 *  Procedural security keypad enclosure box with 12 recessed keypads and status LED.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  BoxGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildKeypadGeometry(): BufferGeometry {
  const geoms: BufferGeometry[] = [];

  // Enclosure box: 0.28m wide x 0.42m high x 0.08m deep
  const boxW = 0.28;
  const boxH = 0.42;
  const boxD = 0.08;

  const casing = new BoxGeometry(boxW, boxH, boxD);
  geoms.push(casing);

  // Status LED bezel at top
  const led = new BoxGeometry(0.16, 0.03, 0.01);
  led.translate(0, 0.15, boxD * 0.5 + 0.005);
  geoms.push(led);

  // 12 key buttons (3 cols x 4 rows)
  const keyW = 0.055;
  const keyH = 0.045;
  const keyD = 0.015;
  const startX = -0.07;
  const stepX = 0.07;
  const startY = 0.08;
  const stepY = -0.065;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const k = new BoxGeometry(keyW, keyH, keyD);
      k.translate(
        startX + col * stepX,
        startY + row * stepY,
        boxD * 0.5 + keyD * 0.5,
      );
      geoms.push(k);
    }
  }

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  return merged;
}

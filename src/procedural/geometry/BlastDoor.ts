/* ── BlastDoor.ts ──────────────────────────────────────────────────────────
 *  Heavy reinforced industrial blast door and corrugated sliding shutter.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  BoxGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface BlastDoorOptions {
  width?: number;  // Opening width (m), default 3.0
  height?: number; // Opening height (m), default 3.5
  depth?: number;  // Door thickness (m), default 0.25
  ribs?: number;   // Horizontal reinforcement ribs, default 6
}

export function buildBlastDoorGeometry(opts?: BlastDoorOptions): BufferGeometry {
  const w = opts?.width ?? 3.0;
  const h = opts?.height ?? 3.5;
  const d = opts?.depth ?? 0.25;
  const ribCount = opts?.ribs ?? 6;

  const geoms: BufferGeometry[] = [];

  // Main door leaf slab
  const leaf = new BoxGeometry(w, h, d * 0.7);
  leaf.translate(0, h * 0.5, 0);
  geoms.push(leaf);

  // Horizontal reinforcement ribs
  const ribH = 0.08;
  const ribD = d * 0.35;
  const stepY = h / (ribCount + 1);

  for (let i = 1; i <= ribCount; i++) {
    const y = i * stepY;
    const frontRib = new BoxGeometry(w * 0.95, ribH, ribD);
    frontRib.translate(0, y, d * 0.35 + ribD * 0.5);
    geoms.push(frontRib);

    const backRib = new BoxGeometry(w * 0.95, ribH, ribD);
    backRib.translate(0, y, -d * 0.35 - ribD * 0.5);
    geoms.push(backRib);
  }

  // Heavy outer frame
  const frameThick = 0.15;
  const frameD = d * 1.3;

  const leftPost = new BoxGeometry(frameThick, h + frameThick, frameD);
  leftPost.translate(-w * 0.5 - frameThick * 0.5, (h + frameThick) * 0.5, 0);
  geoms.push(leftPost);

  const rightPost = new BoxGeometry(frameThick, h + frameThick, frameD);
  rightPost.translate(w * 0.5 + frameThick * 0.5, (h + frameThick) * 0.5, 0);
  geoms.push(rightPost);

  const topLintel = new BoxGeometry(w + frameThick * 2, frameThick, frameD);
  topLintel.translate(0, h + frameThick * 0.5, 0);
  geoms.push(topLintel);

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  return merged;
}

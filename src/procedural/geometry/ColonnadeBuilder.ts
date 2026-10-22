/* ── ColonnadeBuilder.ts ───────────────────────────────────────────────────
 *  Procedural classical column and colonnade builder with base, shaft,
 *  and capital geometry. Merged and UV-scaled to world meters.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  CylinderGeometry,
  BoxGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../../app/Config.js';

export interface ColumnOptions {
  radius?: number;     // Column shaft radius (m), default 0.4
  height?: number;     // Total column height (m), default 4.0
  baseHeight?: number; // Plinth height, default 0.3
  capHeight?: number;  // Capital height, default 0.3
  segments?: number;   // Radial segments, default 16
}

export function buildColumnGeometry(opts?: ColumnOptions): BufferGeometry {
  const r = opts?.radius ?? 0.4;
  const h = opts?.height ?? 4.0;
  const baseH = opts?.baseHeight ?? 0.3;
  const capH = opts?.capHeight ?? 0.3;
  const segments = opts?.segments ?? 16;
  const shaftH = h - baseH - capH;

  const baseW = r * 2.6;
  const baseGeom = new BoxGeometry(baseW, baseH, baseW);
  baseGeom.translate(0, baseH * 0.5, 0);

  const shaftGeom = new CylinderGeometry(r * 0.9, r, shaftH, segments);
  shaftGeom.translate(0, baseH + shaftH * 0.5, 0);

  const capW = r * 2.8;
  const capGeom = new BoxGeometry(capW, capH, capW);
  capGeom.translate(0, baseH + shaftH + capH * 0.5, 0);

  const merged = mergeGeometries([baseGeom, shaftGeom, capGeom]);
  baseGeom.dispose();
  shaftGeom.dispose();
  capGeom.dispose();

  // Scale UVs to texture meters
  const posAttr = merged.getAttribute('position');
  const uvAttr = merged.getAttribute('uv');
  if (posAttr && uvAttr) {
    const scale = 1.0 / WORLD.TEXTURE_METERS;
    for (let i = 0; i < uvAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      uvAttr.setXY(i, x * scale, y * scale);
    }
    uvAttr.needsUpdate = true;
  }

  merged.computeVertexNormals();
  return merged;
}

/* ── ArchBuilder.ts ────────────────────────────────────────────────────────
 *  Procedural architectural arch builder with meter-scaled UV coordinates.
 *  Supports semicircular, pointed, and segmental arch openings.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  Shape,
  ExtrudeGeometry,
} from 'three';
import { WORLD } from '../../app/Config.js';

export interface ArchOptions {
  width: number;      // Opening width (m)
  height: number;     // Opening height from springline to apex (m)
  pierHeight: number; // Vertical wall below springline (m)
  thickness: number;  // Wall thickness / depth (m)
  wallWidth?: number; // Total outer block width (m)
  wallHeight?: number;// Total outer block height (m)
  type?: 'semicircular' | 'segmental' | 'pointed';
  segments?: number;
}

export function buildArchGeometry(opts: ArchOptions): BufferGeometry {
  const span = opts.width;
  const pier = opts.pierHeight;
  const depth = opts.thickness;
  const outerW = opts.wallWidth ?? span + 1.2;
  const outerH = opts.wallHeight ?? pier + opts.height + 0.6;
  const segments = opts.segments ?? 16;
  const halfOuter = outerW * 0.5;
  const halfSpan = span * 0.5;

  // Outer frame shape
  const shape = new Shape();
  shape.moveTo(-halfOuter, 0);
  shape.lineTo(halfOuter, 0);
  shape.lineTo(halfOuter, outerH);
  shape.lineTo(-halfOuter, outerH);
  shape.closePath();

  // Arch opening hole
  const hole = new Shape();
  hole.moveTo(-halfSpan, 0);
  hole.lineTo(-halfSpan, pier);

  const archType = opts.type ?? 'semicircular';
  if (archType === 'semicircular') {
    // Semicircle arc
    const radius = halfSpan;
    const centerY = pier;
    for (let i = 0; i <= segments; i++) {
      const theta = Math.PI - (i / segments) * Math.PI;
      const x = Math.cos(theta) * radius;
      const y = centerY + Math.sin(theta) * radius;
      hole.lineTo(x, y);
    }
  } else if (archType === 'pointed') {
    // Gothic pointed arch: two intersecting circular arcs
    const r = span * 0.85;
    for (let i = 0; i <= segments / 2; i++) {
      const t = i / (segments / 2);
      const angle = Math.PI - 0.3 - t * (Math.PI * 0.5 - 0.3);
      hole.lineTo(halfSpan - Math.cos(angle) * r, pier + Math.sin(angle) * r);
    }
    for (let i = 0; i <= segments / 2; i++) {
      const t = i / (segments / 2);
      const angle = Math.PI * 0.5 + t * (Math.PI * 0.5 - 0.3);
      hole.lineTo(-halfSpan + Math.cos(angle) * r, pier + Math.sin(angle) * r);
    }
  } else {
    // Segmental arch (shallow arc)
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = Math.PI * (1 - t);
      const x = -halfSpan + t * span;
      const y = pier + Math.sin(theta) * opts.height;
      hole.lineTo(x, y);
    }
  }

  hole.lineTo(halfSpan, 0);
  hole.closePath();
  shape.holes.push(hole);

  const geom = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: segments,
  });

  // Scale UVs in world meters per WORLD.TEXTURE_METERS (2.4m)
  const posAttr = geom.getAttribute('position');
  const uvAttr = geom.getAttribute('uv');
  if (posAttr && uvAttr) {
    const scale = 1.0 / WORLD.TEXTURE_METERS;
    for (let i = 0; i < uvAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      uvAttr.setXY(i, x * scale, y * scale);
    }
    uvAttr.needsUpdate = true;
  }

  geom.computeVertexNormals();
  return geom;
}

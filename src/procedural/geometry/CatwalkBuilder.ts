/* ── CatwalkBuilder.ts ─────────────────────────────────────────────────────
 *  Procedural industrial metal catwalk with perforated deck, structural
 *  channel beams, vertical stanchions, and safety handrails.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeVertexAO } from './VertexAO.js';

export interface CatwalkOptions {
  length: number;      // Length along Z (m)
  width?: number;      // Walkway deck width (m), default 1.2
  thickness?: number;  // Deck plate thickness (m), default 0.1
  railed?: boolean;    // Include handrails, default true
  stanchionSpacing?: number; // Spacing between posts (m), default 2.0
  railHeight?: number; // Handrail top height (m), default 1.05
}

export function buildCatwalkGeometry(opts: CatwalkOptions): BufferGeometry {
  const len = opts.length;
  const w = opts.width ?? 1.2;
  const thick = opts.thickness ?? 0.1;
  const railed = opts.railed ?? true;
  const spacing = opts.stanchionSpacing ?? 2.0;
  const railH = opts.railHeight ?? 1.05;

  const geoms: BufferGeometry[] = [];

  // Main grated deck slab
  const deck = new BoxGeometry(w, thick, len);
  deck.translate(0, -thick * 0.5, 0);
  geoms.push(deck);

  // Side structural C-channels
  const beamW = 0.06;
  const beamH = thick * 1.8;
  const leftBeam = new BoxGeometry(beamW, beamH, len);
  leftBeam.translate(-w * 0.5 + beamW * 0.5, -beamH * 0.5, 0);
  geoms.push(leftBeam);

  const rightBeam = new BoxGeometry(beamW, beamH, len);
  rightBeam.translate(w * 0.5 - beamW * 0.5, -beamH * 0.5, 0);
  geoms.push(rightBeam);

  if (railed) {
    const postRadius = 0.025;
    const postCount = Math.max(2, Math.floor(len / spacing) + 1);
    const startZ = -len * 0.5;
    const stepZ = len / (postCount - 1);

    for (let i = 0; i < postCount; i++) {
      const z = startZ + i * stepZ;

      // Left post
      const lp = new CylinderGeometry(postRadius, postRadius, railH, 8);
      lp.translate(-w * 0.5 + postRadius, railH * 0.5, z);
      geoms.push(lp);

      // Right post
      const rp = new CylinderGeometry(postRadius, postRadius, railH, 8);
      rp.translate(w * 0.5 - postRadius, railH * 0.5, z);
      geoms.push(rp);
    }

    // Top handrails (left & right)
    const topRailRadius = 0.03;
    const lRail = new CylinderGeometry(topRailRadius, topRailRadius, len, 8);
    lRail.rotateX(Math.PI * 0.5);
    lRail.translate(-w * 0.5 + postRadius, railH, 0);
    geoms.push(lRail);

    const rRail = new CylinderGeometry(topRailRadius, topRailRadius, len, 8);
    rRail.rotateX(Math.PI * 0.5);
    rRail.translate(w * 0.5 - postRadius, railH, 0);
    geoms.push(rRail);

    // Mid knee-rail
    const midRailRadius = 0.02;
    const lMid = new CylinderGeometry(midRailRadius, midRailRadius, len, 8);
    lMid.rotateX(Math.PI * 0.5);
    lMid.translate(-w * 0.5 + postRadius, railH * 0.55, 0);
    geoms.push(lMid);

    const rMid = new CylinderGeometry(midRailRadius, midRailRadius, len, 8);
    rMid.rotateX(Math.PI * 0.5);
    rMid.translate(w * 0.5 - postRadius, railH * 0.55, 0);
    geoms.push(rMid);
  }

  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();

  merged.computeVertexNormals();
  bakeVertexAO(merged);
  return merged;
}

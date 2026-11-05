/* ── SubwayCarBuilder.ts ───────────────────────────────────────────────────
 *  Walkable subway train car assembly builder for Drowned Metro map.
 *  Constructs undercarriage chassis, bogie wheel trucks, ribbed car deck slab,
 *  corrugated stainless-steel side panels with sliding doorways, end bulkheads,
 *  interior stanchion poles, bench seats, grab rails, and rooftop HVAC units.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BoxGeometry,
  CylinderGeometry,
  type BufferGeometry,
} from 'three';
import type { PlatformDef } from '../MapTypes.js';
import type { ColliderSet } from '../../sim/Colliders.js';
import { createTiledBoxGeometry } from '../../procedural/geometry/TiledBox.js';

export function buildWalkableSubwayCarAssembly(
  plat: PlatformDef,
  metalGeoms: BufferGeometry[],
  accentGeoms: BufferGeometry[],
  trimGeoms: BufferGeometry[],
  platformGeoms: BufferGeometry[],
  colliders?: ColliderSet,
): void {
  const [minX, minZ, maxX, maxZ] = plat.rect;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const topY = plat.topY; // 1.3m walkable roof/deck level
  const chassisBottomY = -0.35;
  const floorDeckY = topY; // Walkable deck surface at topY = 1.3m
  const roofY = topY + 2.35;
  const wallH = roofY - floorDeckY;

  // 1. Undercarriage chassis frame & bogie wheel trucks in water
  const underFrame = new BoxGeometry(w * 0.96, 0.45, d * 0.86);
  underFrame.translate(cx, chassisBottomY + 0.225, cz);
  trimGeoms.push(underFrame);

  for (const bxOff of [-w * 0.32, w * 0.32]) {
    const bogie = new BoxGeometry(2.2, 0.55, d * 0.92);
    bogie.translate(cx + bxOff, -0.55, cz);
    trimGeoms.push(bogie);
  }

  // 2. Walkable ribbed car deck slab (at topY so player stands on it cleanly)
  const deckSlab = createTiledBoxGeometry({
    w,
    h: Math.max(0.35, topY - chassisBottomY),
    d,
    uvOffsetSeed: plat.id.charCodeAt(0),
  });
  deckSlab.translate(cx, (topY + chassisBottomY) * 0.5, cz);
  platformGeoms.push(deckSlab);

  // 3. Corrugated stainless-steel exterior side panels with open sliding doorways & window cutouts
  const panelThick = 0.14;
  const lowerSkirtH = 0.82;
  const upperHeaderH = 0.38;
  const segLengths = [w * 0.18, w * 0.26, w * 0.18];
  const segCenters = [-w * 0.41, 0, w * 0.41];

  for (const sideZ of [minZ + panelThick * 0.5, maxZ - panelThick * 0.5]) {
    for (let s = 0; s < segLengths.length; s++) {
      const segW = segLengths[s]!;
      const segX = cx + segCenters[s]!;

      // Lower corrugated waist panel
      const waist = new BoxGeometry(segW, lowerSkirtH, panelThick);
      waist.translate(segX, floorDeckY + lowerSkirtH * 0.5, sideZ);
      metalGeoms.push(waist);

      // Crimson/amber transit livery stripe along the waist
      const stripe = new BoxGeometry(segW + 0.02, 0.18, panelThick + 0.03);
      stripe.translate(segX, floorDeckY + lowerSkirtH * 0.68, sideZ);
      accentGeoms.push(stripe);

      // Window mullions (vertical posts framing recessed window cutouts)
      for (const postOff of [-segW * 0.42, 0, segW * 0.42]) {
        const mullion = new BoxGeometry(0.16, wallH - lowerSkirtH - upperHeaderH, panelThick * 0.9);
        mullion.translate(segX + postOff, floorDeckY + lowerSkirtH + (wallH - lowerSkirtH - upperHeaderH) * 0.5, sideZ);
        metalGeoms.push(mullion);
      }

      // Solid collision for subway car side panel segments (leaving sliding doors open)
      if (colliders) {
        colliders.addBox(
          `subway_wall_${plat.id}_z${Math.round(sideZ)}_${s}`,
          { x: segX - segW * 0.5, y: floorDeckY, z: sideZ - panelThick * 0.6 },
          { x: segX + segW * 0.5, y: roofY, z: sideZ + panelThick * 0.6 },
          true,
        );
      }
    }

    // Continuous upper roof header fascia over windows and doors
    const header = new BoxGeometry(w, upperHeaderH, panelThick);
    header.translate(cx, roofY - upperHeaderH * 0.5, sideZ);
    metalGeoms.push(header);
  }

  // 4. End bulkheads with central inter-car gangway doorway gap (1.4m wide)
  const endPillarW = Math.max(0.45, (d - 1.4) * 0.5);
  for (const endX of [minX + panelThick * 0.5, maxX - panelThick * 0.5]) {
    const leftBulk = new BoxGeometry(panelThick, wallH, endPillarW);
    leftBulk.translate(endX, floorDeckY + wallH * 0.5, minZ + endPillarW * 0.5);
    metalGeoms.push(leftBulk);

    const rightBulk = new BoxGeometry(panelThick, wallH, endPillarW);
    rightBulk.translate(endX, floorDeckY + wallH * 0.5, maxZ - endPillarW * 0.5);
    metalGeoms.push(rightBulk);

    // End gangway lintel
    const endLintel = new BoxGeometry(panelThick, 0.4, d);
    endLintel.translate(endX, roofY - 0.2, cz);
    metalGeoms.push(endLintel);

    if (colliders) {
      colliders.addBox(
        `subway_bulk_${plat.id}_x${Math.round(endX)}_l`,
        { x: endX - panelThick * 0.6, y: floorDeckY, z: minZ },
        { x: endX + panelThick * 0.6, y: roofY, z: minZ + endPillarW },
        true,
      );
      colliders.addBox(
        `subway_bulk_${plat.id}_x${Math.round(endX)}_r`,
        { x: endX - panelThick * 0.6, y: floorDeckY, z: maxZ - endPillarW },
        { x: endX + panelThick * 0.6, y: roofY, z: maxZ },
        true,
      );
    }
  }

  // 5. Interior stanchion poles, longitudinal bench seats, and overhead grab rails
  for (const poleOffX of [-w * 0.3, -w * 0.1, w * 0.1, w * 0.3]) {
    const pole = new CylinderGeometry(0.035, 0.035, wallH - 0.2, 8);
    pole.translate(cx + poleOffX, floorDeckY + (wallH - 0.2) * 0.5, cz);
    metalGeoms.push(pole);
  }
  for (const railZ of [cz - d * 0.24, cz + d * 0.24]) {
    const grabRail = new BoxGeometry(w * 0.88, 0.04, 0.04);
    grabRail.translate(cx, roofY - 0.32, railZ);
    accentGeoms.push(grabRail);
  }

  // 6. Arched roof ribs & twin rooftop HVAC units
  for (let rx = -w * 0.42; rx <= w * 0.42; rx += w * 0.21) {
    const rib = new BoxGeometry(0.28, 0.16, d + 0.06);
    rib.translate(cx + rx, roofY + 0.08, cz);
    metalGeoms.push(rib);
  }
  for (const hvacOff of [-w * 0.25, w * 0.25]) {
    const hvac = new BoxGeometry(2.4, 0.32, d * 0.58);
    hvac.translate(cx + hvacOff, roofY + 0.22, cz);
    trimGeoms.push(hvac);
  }
}

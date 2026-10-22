/* ── StairBuilder.ts ───────────────────────────────────────────────────────
 *  Procedural stair builder and ground grid rasterizer.
 *  Uses architectural standard riser (0.18m) and run (0.28m) dimensions.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  BoxGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StairDef } from '../../world/MapTypes.js';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import { WORLD } from '../../app/Config.js';

export function buildStairGeometry(def: StairDef): BufferGeometry {
  const stepGeoms: BufferGeometry[] = [];
  const width = def.width;
  const riser = def.riser || 0.18;
  const run = def.run || 0.28;
  const count = def.steps;

  for (let i = 0; i < count; i++) {
    const stepH = (i + 1) * riser;
    const geom = new BoxGeometry(
      def.direction === 'x+' || def.direction === 'x-' ? run : width,
      stepH,
      def.direction === 'z+' || def.direction === 'z-' ? run : width,
    );

    let offsetX = 0;
    let offsetZ = 0;

    if (def.direction === 'x+') {
      offsetX = (i + 0.5) * run;
    } else if (def.direction === 'x-') {
      offsetX = -(i + 0.5) * run;
    } else if (def.direction === 'z+') {
      offsetZ = (i + 0.5) * run;
    } else {
      offsetZ = -(i + 0.5) * run;
    }

    geom.translate(def.x + offsetX, def.baseY + stepH * 0.5, def.z + offsetZ);
    stepGeoms.push(geom);
  }

  const merged = mergeGeometries(stepGeoms);
  for (const g of stepGeoms) g.dispose();

  // UV scaling
  const posAttr = merged.getAttribute('position');
  const uvAttr = merged.getAttribute('uv');
  if (posAttr && uvAttr) {
    const scale = 1.0 / WORLD.TEXTURE_METERS;
    for (let i = 0; i < uvAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      uvAttr.setXY(i, x * scale, z * scale);
    }
    uvAttr.needsUpdate = true;
  }

  merged.computeVertexNormals();
  return merged;
}

export function rasterizeStairsToGround(ground: GroundGrid, def: StairDef): void {
  const riser = def.riser || 0.18;
  const run = def.run || 0.28;
  const halfW = def.width * 0.5;

  for (let i = 0; i < def.steps; i++) {
    const stepTopY = def.baseY + (i + 1) * riser;

    let minX = 0;
    let maxX = 0;
    let minZ = 0;
    let maxZ = 0;

    if (def.direction === 'x+') {
      minX = def.x + i * run;
      maxX = def.x + (i + 1) * run;
      minZ = def.z - halfW;
      maxZ = def.z + halfW;
    } else if (def.direction === 'x-') {
      minX = def.x - (i + 1) * run;
      maxX = def.x - i * run;
      minZ = def.z - halfW;
      maxZ = def.z + halfW;
    } else if (def.direction === 'z+') {
      minX = def.x - halfW;
      maxX = def.x + halfW;
      minZ = def.z + i * run;
      maxZ = def.z + (i + 1) * run;
    } else {
      minX = def.x - halfW;
      maxX = def.x + halfW;
      minZ = def.z - (i + 1) * run;
      maxZ = def.z - i * run;
    }

    ground.setRectHeight(minX, minZ, maxX, maxZ, stepTopY);
  }
}

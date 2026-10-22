/* ── WaterMapData.ts ───────────────────────────────────────────────────────
 *  World-aligned RGBA8 DataTexture encoding ground height (-2..+2m) in R and
 *  distance-to-dry (0..3m) in G. Enables foam, depth absorption, and dynamic water level.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  ClampToEdgeWrapping,
  Vector4,
} from 'three';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import type { GraphicsTier } from '../../types/contracts.js';

export interface WaterMapResult {
  texture: DataTexture;
  boundsUniform: Vector4; // (minX, minZ, maxX, maxZ)
}

export function buildWaterMapData(ground: GroundGrid, tier: GraphicsTier = 'high'): WaterMapResult {
  const step = tier === 'low' ? 0.5 : 0.25;
  const bounds = ground.bounds;

  const width = Math.ceil((bounds.maxX - bounds.minX) / step);
  const depth = Math.ceil((bounds.maxZ - bounds.minZ) / step);
  const data = new Uint8Array(width * depth * 4);

  for (let gz = 0; gz < depth; gz++) {
    const z = bounds.minZ + (gz + 0.5) * step;
    const rowOffset = gz * width * 4;

    for (let gx = 0; gx < width; gx++) {
      const x = bounds.minX + (gx + 0.5) * step;
      const idx = rowOffset + gx * 4;

      // Sample ground height (-2m .. +2m encoded into 0..255)
      const h = ground.heightAt(x, z);
      const safeH = Number.isFinite(h) ? Math.max(-2.0, Math.min(2.0, h)) : 2.0;
      const normH = (safeH + 2.0) / 4.0;
      data[idx] = Math.round(normH * 255); // R

      // Sample distance to dry (0..3m encoded into 0..255)
      const d = ground.distToDry(x, z);
      const safeD = Math.max(0.0, Math.min(3.0, d));
      const normD = safeD / 3.0;
      data[idx + 1] = Math.round(normD * 255); // G

      data[idx + 2] = 0; // B reserved
      data[idx + 3] = 255; // A
    }
  }

  const texture = new DataTexture(data, width, depth, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const boundsUniform = new Vector4(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);

  return { texture, boundsUniform };
}

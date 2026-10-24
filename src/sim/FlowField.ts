/* ── FlowField.ts ──────────────────────────────────────────────────────────
 *  Continuous 2D water velocity field, river currents, and acoustic mask zones.
 *  Used by SimWorld, PlayerMotor, WaterShader, and Hearing.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import { dHypot, dCos, D_HALF_PI } from './dmath.js';

export interface MaskZone {
  id: string;
  cx: number;
  cz: number;
  radius: number;
  factor: number; // e.g. 0.35 for rapids, 0.30 for waterfall
}

export interface RiverWaypoint {
  x: number;
  z: number;
  speed: number; // current speed m/s
  width: number; // river width at this waypoint
}

export class FlowField {
  private readonly waypoints: RiverWaypoint[] = [];
  private readonly maskZones: MaskZone[] = [];

  addWaypoint(wp: RiverWaypoint): void {
    this.waypoints.push({ ...wp });
  }

  addMaskZone(zone: MaskZone): void {
    this.maskZones.push({ ...zone });
  }

  getMaskZones(): readonly MaskZone[] {
    return this.maskZones;
  }

  /**
   * Sample flow velocity (vx, vz) in m/s at continuous world coordinates (x, z).
   * Spline-based interpolation along river waypoints with smooth lateral falloff.
   */
  flowAt(x: number, z: number): { x: number; z: number } {
    if (this.waypoints.length < 2) {
      return { x: 0, z: 0 };
    }

    let bestVx = 0;
    let bestVz = 0;
    let maxWeight = 0;

    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this.waypoints[i]!;
      const b = this.waypoints[i + 1]!;

      const segDx = b.x - a.x;
      const segDz = b.z - a.z;
      const segLenSq = segDx * segDx + segDz * segDz;
      if (segLenSq < 1e-6) continue;
      const segLen = Math.sqrt(segLenSq);

      // Project (x, z) onto segment [a, b]
      const px = x - a.x;
      const pz = z - a.z;
      const t = Math.max(0, Math.min(1, (px * segDx + pz * segDz) / segLenSq));

      // Closest point on segment
      const projX = a.x + t * segDx;
      const projZ = a.z + t * segDz;

      // Lateral distance from river centerline
      const distToCenter = dHypot(x - projX, z - projZ);
      const halfWidth = (a.width + (b.width - a.width) * t) * 0.5;

      if (distToCenter < halfWidth) {
        // Smooth lateral falloff (cosine / smoothstep bell curve)
        const u = distToCenter / halfWidth;
        const lateralFactor = dCos(u * D_HALF_PI);

        // Interpolated speed along segment
        const speed = (a.speed + (b.speed - a.speed) * t) * lateralFactor;

        // Flow direction (normalized from a to b)
        const dirX = segDx / segLen;
        const dirZ = segDz / segLen;

        const weight = lateralFactor;
        if (weight > maxWeight) {
          maxWeight = weight;
          bestVx = dirX * speed;
          bestVz = dirZ * speed;
        }
      }
    }

    return { x: bestVx, z: bestVz };
  }

  /**
   * Return the combined acoustic mask factor at (x, z).
   * Normal air = 1.0. Inside rapids = 0.35, waterfall = 0.30.
   * Smooth cosine transition at zone boundaries.
   */
  maskAt(x: number, z: number): number {
    let factor = 1.0;
    for (let i = 0; i < this.maskZones.length; i++) {
      const zone = this.maskZones[i]!;
      const dist = dHypot(x - zone.cx, z - zone.cz);
      if (dist < zone.radius) {
        // Smooth falloff from center (zone.factor) to boundary (1.0)
        const u = dist / zone.radius;
        const t = u * u * (3 - 2 * u); // smoothstep
        const zoneVal = zone.factor + (1.0 - zone.factor) * t;
        factor = Math.min(factor, zoneVal);
      }
    }
    return factor;
  }

  /**
   * Analytic ripple advection formula for TS/Shader parity.
   * Returns current ripple center (x, z) given origin (x0, z0), spawn time t0, and simTime.
   */
  advectRipple(x0: number, z0: number, t0: number, simTime: number): { x: number; z: number } {
    const dt = Math.max(0, simTime - t0);
    const flow = this.flowAt(x0, z0);
    return {
      x: x0 + flow.x * dt,
      z: z0 + flow.z * dt,
    };
  }

  /**
   * Compute drift delta to apply to wading entities.
   */
  computeWadeDrift(pos: Vec3, dt: number): { dx: number; dz: number } {
    const flow = this.flowAt(pos.x, pos.z);
    return {
      dx: flow.x * 0.55 * dt,
      dz: flow.z * 0.55 * dt,
    };
  }
}

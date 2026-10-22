/* ── PerchSystem.ts ────────────────────────────────────────────────────────
 *  Perch detection, stability management, and wobbly furniture physics.
 *  Read by PlayerMotor, GroundGrid (as DynamicTop), and MonsterBrain.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import type { DynamicTop } from './GroundGrid.js';
import type { EventRingBuffer } from './Events.js';

export interface PerchSurface {
  id: string;
  type: 'box' | 'cylinder';
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  cx: number;
  cz: number;
  radius: number;
  topY: number;
  isPerch: boolean; // if false (e.g. stepping stones, logs), does not grant perch immunity
  wobbly: boolean; // e.g. school chairs
  wobbleTime: number; // seconds currently stood on wobbly chair
  tipped: boolean; // tipped into water
  recoveryTimer: number; // counts down after tipping
  tilt: number; // 0..1 tilt angle representation for visuals
}

export class PerchSystem implements DynamicTop {
  private readonly surfaces: PerchSurface[] = [];
  private activeWobblySurface: PerchSurface | null = null;

  addBoxPerch(
    id: string,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    topY: number,
    options?: { wobbly?: boolean; isPerch?: boolean },
  ): PerchSurface {
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const radius = Math.max(maxX - minX, maxZ - minZ) * 0.5;
    const surface: PerchSurface = {
      id,
      type: 'box',
      minX,
      minZ,
      maxX,
      maxZ,
      cx,
      cz,
      radius,
      topY,
      isPerch: options?.isPerch ?? true,
      wobbly: options?.wobbly ?? false,
      wobbleTime: 0,
      tipped: false,
      recoveryTimer: 0,
      tilt: 0,
    };
    this.surfaces.push(surface);
    return surface;
  }

  addCylinderPerch(
    id: string,
    cx: number,
    cz: number,
    radius: number,
    topY: number,
    options?: { isPerch?: boolean },
  ): PerchSurface {
    const surface: PerchSurface = {
      id,
      type: 'cylinder',
      minX: cx - radius,
      minZ: cz - radius,
      maxX: cx + radius,
      maxZ: cz + radius,
      cx,
      cz,
      radius,
      topY,
      isPerch: options?.isPerch ?? true,
      wobbly: false,
      wobbleTime: 0,
      tipped: false,
      recoveryTimer: 0,
      tilt: 0,
    };
    this.surfaces.push(surface);
    return surface;
  }

  getSurfaces(): readonly PerchSurface[] {
    return this.surfaces;
  }

  /**
   * DynamicTop implementation for GroundGrid.
   * If a point falls inside an active (non-tipped) surface footprint, return its topY.
   */
  getTopAt(x: number, z: number): number | null {
    let highest: number | null = null;
    for (let i = 0; i < this.surfaces.length; i++) {
      const s = this.surfaces[i]!;
      if (s.tipped) continue;

      let inside = false;
      if (s.type === 'box') {
        inside = x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
      } else {
        const dx = x - s.cx;
        const dz = z - s.cz;
        inside = dx * dx + dz * dz <= s.radius * s.radius;
      }

      if (inside) {
        if (highest === null || s.topY > highest) {
          highest = s.topY;
        }
      }
    }
    return highest;
  }

  /**
   * Determine if player is perched according to Section 3.2:
   * Grounded on a perch surface, feet >= waterY + 0.06, and inside footprint (inset 0.1 m).
   */
  isPlayerPerched(
    pos: Vec3,
    onGround: boolean,
    waterY: number,
  ): boolean {
    if (!onGround) return false;
    if (pos.y < waterY + 0.06) return false;

    const surface = this.findSurfaceAt(pos.x, pos.z, pos.y, 0.1);
    return surface !== null && surface.isPerch && !surface.tipped;
  }

  findSurfaceAt(x: number, z: number, y: number, inset = 0.0): PerchSurface | null {
    for (let i = 0; i < this.surfaces.length; i++) {
      const s = this.surfaces[i]!;
      if (s.tipped) continue;
      // Vertically within reach of surface top (within 0.15m)
      if (Math.abs(y - s.topY) > 0.25) continue;

      if (s.type === 'box') {
        const effectiveInset = Math.min(inset, (s.maxX - s.minX) * 0.4, (s.maxZ - s.minZ) * 0.4);
        if (
          x >= s.minX + effectiveInset &&
          x <= s.maxX - effectiveInset &&
          z >= s.minZ + effectiveInset &&
          z <= s.maxZ - effectiveInset
        ) {
          return s;
        }
      } else {
        const dx = x - s.cx;
        const dz = z - s.cz;
        const maxR = Math.max(0.1, s.radius - inset);
        if (dx * dx + dz * dz <= maxR * maxR) {
          return s;
        }
      }
    }
    return null;
  }

  /**
   * Update wobbly chairs and recovery timers.
   */
  step(
    dt: number,
    playerPos: Vec3,
    onGround: boolean,
    waterY: number,
    events?: EventRingBuffer,
    simTime = 0,
  ): void {
    // 1. Recover tipped surfaces
    for (let i = 0; i < this.surfaces.length; i++) {
      const s = this.surfaces[i]!;
      if (s.tipped) {
        s.recoveryTimer -= dt;
        if (s.recoveryTimer <= 0) {
          s.tipped = false;
          s.wobbleTime = 0;
          s.tilt = 0;
          s.recoveryTimer = 0;
        }
      }
    }

    // 2. Check if player is on a wobbly surface
    let currentlyOnWobbly: PerchSurface | null = null;
    if (onGround && playerPos.y >= waterY + 0.06) {
      const surface = this.findSurfaceAt(playerPos.x, playerPos.z, playerPos.y, 0.0);
      if (surface && surface.wobbly && !surface.tipped) {
        currentlyOnWobbly = surface;
      }
    }

    if (currentlyOnWobbly) {
      currentlyOnWobbly.wobbleTime += dt;

      // Stand > 3.5s: creak warning & tilt
      if (currentlyOnWobbly.wobbleTime >= 3.5 && currentlyOnWobbly.wobbleTime < 5.0) {
        currentlyOnWobbly.tilt = (currentlyOnWobbly.wobbleTime - 3.5) / 1.5;
        // Emit creak warning if crossing 3.5s threshold
        if (currentlyOnWobbly.wobbleTime - dt < 3.5 && events) {
          events.pushNoise(
            `chair_creak_${simTime}`,
            'creak',
            currentlyOnWobbly.cx,
            currentlyOnWobbly.topY,
            currentlyOnWobbly.cz,
            0.15,
            'world',
            simTime,
          );
        }
      } else if (currentlyOnWobbly.wobbleTime >= 5.0) {
        // Tip over!
        currentlyOnWobbly.tipped = true;
        currentlyOnWobbly.tilt = 1.0;
        currentlyOnWobbly.recoveryTimer = 8.0;
        if (events) {
          events.pushNoise(
            `chair_tip_splash_${simTime}`,
            'splash',
            currentlyOnWobbly.cx,
            waterY,
            currentlyOnWobbly.cz,
            0.5,
            'world',
            simTime,
          );
        }
      }
      this.activeWobblySurface = currentlyOnWobbly;
    } else {
      if (this.activeWobblySurface && !this.activeWobblySurface.tipped) {
        // Reset wobble time if stepped off
        this.activeWobblySurface.wobbleTime = 0;
        this.activeWobblySurface.tilt = 0;
      }
      this.activeWobblySurface = null;
    }
  }
}

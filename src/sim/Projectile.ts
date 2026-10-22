/* ── Projectile.ts ─────────────────────────────────────────────────────────
 *  Pure ballistic simulation for thrown items (pebbles, noisemakers).
 *  Integrates gravity, tests ray steps against GroundGrid and Colliders,
 *  determines water vs dry landing, and generates trajectory prediction points.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import type { GroundGrid } from './GroundGrid.js';
import type { ColliderSet } from './Colliders.js';

export type ProjectileKind = 'pebble' | 'noisemaker' | 'emp' | 'bottle';

export interface ProjectileImpact {
  x: number;
  y: number;
  z: number;
  isWater: boolean;
  kind: ProjectileKind;
  simTime: number;
}

export interface ProjectileState {
  id: string;
  kind: ProjectileKind;
  pos: Vec3;
  vel: Vec3;
  active: boolean;
  spawnTime: number;
}

export class ProjectileSystem {
  private readonly GRAVITY = 14.0;
  private readonly MIN_HOLD = 0.2;
  private readonly MAX_HOLD = 1.0;
  private readonly MIN_SPEED = 9.0;  // yields ~6m horizontal range
  private readonly MAX_SPEED = 18.0; // yields ~18m horizontal range

  /**
   * Calculate launch velocity from camera yaw, pitch, and throw hold duration.
   */
  calculateLaunchVelocity(
    yaw: number,
    pitch: number,
    holdDuration: number,
  ): Vec3 {
    const clampedHold = Math.max(
      this.MIN_HOLD,
      Math.min(this.MAX_HOLD, holdDuration),
    );
    const t = (clampedHold - this.MIN_HOLD) / (this.MAX_HOLD - this.MIN_HOLD);
    const speed = this.MIN_SPEED + t * (this.MAX_SPEED - this.MIN_SPEED);

    // Direction vector from yaw & pitch
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    const dirX = -sinYaw * cosPitch;
    const dirY = sinPitch;
    const dirZ = -cosYaw * cosPitch;

    return {
      x: dirX * speed,
      y: dirY * speed,
      z: dirZ * speed,
    };
  }

  /**
   * Step projectile by dt. Returns impact event if collided with terrain or water.
   */
  step(
    projectile: ProjectileState,
    dt: number,
    ground: GroundGrid,
    colliders: ColliderSet,
    waterY: number,
    simTime: number,
  ): ProjectileImpact | null {
    if (!projectile.active) return null;

    const oldX = projectile.pos.x;
    const oldY = projectile.pos.y;
    const oldZ = projectile.pos.z;

    // Apply gravity
    projectile.vel.y -= this.GRAVITY * dt;

    // Advance position
    projectile.pos.x += projectile.vel.x * dt;
    projectile.pos.y += projectile.vel.y * dt;
    projectile.pos.z += projectile.vel.z * dt;

    const newX = projectile.pos.x;
    const newY = projectile.pos.y;
    const newZ = projectile.pos.z;

    // 1. Check wall colliders along trajectory segment
    const wallHit = colliders.segmentHits(oldX, oldZ, newX, newZ, 0.5);
    if (wallHit > 0) {
      // Impact against wall
      projectile.active = false;
      const gh = ground.heightAt(newX, newZ);
      const isWater = newY <= waterY || gh < waterY - 0.05;
      return {
        x: newX,
        y: newY,
        z: newZ,
        isWater,
        kind: projectile.kind,
        simTime,
      };
    }

    // 2. Check water surface impact (from above)
    if (oldY >= waterY && newY <= waterY) {
      const gh = ground.heightAt(newX, newZ);
      if (gh < waterY - 0.05) {
        projectile.active = false;
        return {
          x: newX,
          y: waterY,
          z: newZ,
          isWater: true,
          kind: projectile.kind,
          simTime,
        };
      }
    }

    // 3. Check ground height impact
    const groundH = ground.heightAt(newX, newZ);
    if (newY <= groundH) {
      projectile.active = false;
      const isWater = groundH < waterY - 0.05;
      return {
        x: newX,
        y: groundH,
        z: newZ,
        isWater,
        kind: projectile.kind,
        simTime,
      };
    }

    // Out of world bounds check
    if (
      newX < ground.bounds.minX - 10 ||
      newX > ground.bounds.maxX + 10 ||
      newZ < ground.bounds.minZ - 10 ||
      newZ > ground.bounds.maxZ + 10 ||
      newY < -15
    ) {
      projectile.active = false;
    }

    return null;
  }

  /**
   * Pre-calculates trajectory path for HUD dotted line preview.
   */
  predictTrajectory(
    origin: Vec3,
    yaw: number,
    pitch: number,
    holdDuration: number,
    ground: GroundGrid,
    colliders: ColliderSet,
    waterY: number,
    maxSteps = 40,
    dt = 0.04,
  ): Vec3[] {
    const vel = this.calculateLaunchVelocity(yaw, pitch, holdDuration);
    const points: Vec3[] = [{ x: origin.x, y: origin.y, z: origin.z }];

    const simState: ProjectileState = {
      id: 'preview',
      kind: 'pebble',
      pos: { x: origin.x, y: origin.y, z: origin.z },
      vel: { ...vel },
      active: true,
      spawnTime: 0,
    };

    for (let step = 0; step < maxSteps; step++) {
      const impact = this.step(simState, dt, ground, colliders, waterY, step * dt);
      points.push({ x: simState.pos.x, y: simState.pos.y, z: simState.pos.z });
      if (impact !== null || !simState.active) {
        break;
      }
    }

    return points;
  }

  simulateTrajectory(
    origin: Vec3,
    velocity: Vec3,
    ground: GroundGrid,
    colliders: ColliderSet,
    waterY: number,
  ): Vec3[] {
    const points: Vec3[] = [{ ...origin }];
    const simState: ProjectileState = {
      id: 'sim',
      kind: 'pebble',
      pos: { ...origin },
      vel: { ...velocity },
      active: true,
      spawnTime: 0,
    };
    for (let step = 0; step < 80; step++) {
      const impact = this.step(simState, 0.033, ground, colliders, waterY, step * 0.033);
      points.push({ ...simState.pos });
      if (impact || !simState.active) break;
    }
    return points;
  }

  simulateImpact(
    origin: Vec3,
    velocity: Vec3,
    ground: GroundGrid,
    colliders: ColliderSet,
    waterY: number,
    kind: ProjectileKind = 'pebble',
    simTime = 0,
  ): ProjectileImpact | null {
    const simState: ProjectileState = {
      id: 'sim_impact',
      kind,
      pos: { ...origin },
      vel: { ...velocity },
      active: true,
      spawnTime: simTime,
    };
    for (let step = 0; step < 120; step++) {
      const impact = this.step(simState, 0.02, ground, colliders, waterY, simTime + step * 0.02);
      if (impact) return impact;
      if (!simState.active) break;
    }
    return null;
  }
}

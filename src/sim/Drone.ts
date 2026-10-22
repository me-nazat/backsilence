/* ── Drone.ts ──────────────────────────────────────────────────────────────
 *  Deterministic surveillance drone with cone sight sensor and siren locking.
 *  Used by Neon Flood District and SimWorld.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import type { ColliderSet } from './Colliders.js';
import type { EventRingBuffer } from './Events.js';

export type DroneState = 'PATROL' | 'LOCK' | 'COOLDOWN' | 'EMP_DISABLED';

export interface DroneSnapshot {
  id: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  state: DroneState;
  detectionMeter: number; // 0..1
  spotlightOn: boolean;
}

export interface AwningRect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  height: number;
}

export class Drone {
  readonly id: string;
  readonly path: Vec3[];
  readonly totalLength: number;
  readonly speed: number; // m/s
  readonly halfAngleCos: number; // cos(18 deg)
  readonly maxRange = 20.0; // meters

  state: DroneState = 'PATROL';
  detectionMeter = 0.0;
  lockTimer = 0.0;
  cooldownTimer = 0.0;
  empTimer = 0.0;

  // Cached transform
  pos: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0.0;
  pitch = -0.52; // ~30 deg downward cone to reach street/skyway targets ahead

  constructor(id: string, path: Vec3[], speed = 4.0, pitch = -0.52) {
    this.id = id;
    this.path = path.map((p) => ({ ...p }));
    this.speed = speed;
    this.pitch = pitch;
    this.halfAngleCos = Math.cos((18.0 * Math.PI) / 180.0); // ~0.9510565

    // Precompute path perimeter length
    let len = 0;
    for (let i = 0; i < this.path.length; i++) {
      const p0 = this.path[i]!;
      const p1 = this.path[(i + 1) % this.path.length]!;
      len += Math.hypot(p1.x - p0.x, p1.z - p0.z);
    }
    this.totalLength = Math.max(1.0, len);

    const init = this.positionAtTime(0);
    this.pos = init.pos;
    this.yaw = init.yaw;
  }

  /**
   * Pure position function of simTime.
   */
  positionAtTime(simTime: number): { pos: Vec3; yaw: number } {
    if (this.path.length === 0) {
      return { pos: { x: 0, y: 4, z: 0 }, yaw: 0 };
    }
    if (this.path.length === 1) {
      return { pos: { ...this.path[0]! }, yaw: 0 };
    }

    const dist = (simTime * this.speed) % this.totalLength;
    let accumulated = 0;

    for (let i = 0; i < this.path.length; i++) {
      const p0 = this.path[i]!;
      const p1 = this.path[(i + 1) % this.path.length]!;
      const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);

      if (accumulated + segLen >= dist || i === this.path.length - 1) {
        const segT = segLen > 1e-5 ? (dist - accumulated) / segLen : 0;
        const x = p0.x + (p1.x - p0.x) * segT;
        const y = p0.y + (p1.y - p0.y) * segT;
        const z = p0.z + (p1.z - p0.z) * segT;
        const yaw = Math.atan2(p1.x - p0.x, -(p1.z - p0.z));
        return { pos: { x, y, z }, yaw };
      }
      accumulated += segLen;
    }

    return { pos: { ...this.path[0]! }, yaw: 0 };
  }

  /**
   * Step drone logic: update position, evaluate sight sensor, trigger lock / siren.
   */
  step(
    dt: number,
    playerPos: Vec3,
    isCrouching: boolean,
    colliders: ColliderSet,
    awnings: readonly AwningRect[] = [],
    events?: EventRingBuffer,
    simTime = 0,
  ): void {
    // 1. Update position along patrol polyline
    const evaluated = this.positionAtTime(simTime);
    this.pos = evaluated.pos;
    this.yaw = evaluated.yaw;

    // 2. Handle EMP state
    if (this.state === 'EMP_DISABLED') {
      this.empTimer -= dt;
      this.detectionMeter = 0.0;
      if (this.empTimer <= 0) {
        this.state = 'PATROL';
        this.empTimer = 0.0;
      }
      return;
    }

    // 3. Handle Cooldown state
    if (this.state === 'COOLDOWN') {
      this.cooldownTimer -= dt;
      this.detectionMeter = 0.0;
      if (this.cooldownTimer <= 0) {
        this.state = 'PATROL';
        this.cooldownTimer = 0.0;
      }
      return;
    }

    // 4. Handle Lock state
    if (this.state === 'LOCK') {
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) {
        this.state = 'COOLDOWN';
        this.cooldownTimer = 20.0;
        this.detectionMeter = 0.0;
      }
      return;
    }

    // 5. Patrol state: Sight Sensor check
    const inSight = this.checkSight(playerPos, isCrouching, colliders, awnings);

    if (inSight) {
      const dist = Math.hypot(
        playerPos.x - this.pos.x,
        playerPos.y - this.pos.y,
        playerPos.z - this.pos.z,
      );
      // Fill rate: 1.2s normal (0.833/s), 0.6s inside 8m (1.667/s)
      const fillRate = dist <= 8.0 ? 1.0 / 0.6 : 1.0 / 1.2;
      this.detectionMeter = Math.min(1.0, this.detectionMeter + fillRate * dt);

      if (this.detectionMeter >= 1.0) {
        // Lock acquired!
        this.state = 'LOCK';
        this.lockTimer = 6.0;
        // Emit siren noise at player's position
        if (events) {
          events.pushNoise(
            `drone_siren_${simTime}`,
            'siren',
            playerPos.x,
            playerPos.y,
            playerPos.z,
            0.9,
            'world',
            simTime,
          );
        }
      }
    } else {
      // Decay meter at 0.8/s
      this.detectionMeter = Math.max(0.0, this.detectionMeter - 0.8 * dt);
    }
  }

  /**
   * SightSensor query: within cone, range, not occluded by colliders or awnings.
   */
  checkSight(
    playerPos: Vec3,
    isCrouching: boolean,
    colliders: ColliderSet,
    awnings: readonly AwningRect[],
  ): boolean {
    const dx = playerPos.x - this.pos.x;
    const dy = playerPos.y - this.pos.y;
    const dz = playerPos.z - this.pos.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    // Range check (crouching reduces range to 60%)
    const maxR = this.maxRange * (isCrouching ? 0.6 : 1.0);
    if (distSq > maxR * maxR || distSq < 1e-4) {
      return false;
    }
    const dist = Math.sqrt(distSq);

    // Direction from drone to player
    const toPlayerX = dx / dist;
    const toPlayerY = dy / dist;
    const toPlayerZ = dz / dist;

    // Cone spotlight direction: oriented by yaw, angled down ~45 deg
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const coneDirX = Math.sin(this.yaw) * cosPitch;
    const coneDirY = sinPitch; // negative (pointing down)
    const coneDirZ = -Math.cos(this.yaw) * cosPitch;

    // Dot product with spotlight cone axis
    const dot = toPlayerX * coneDirX + toPlayerY * coneDirY + toPlayerZ * coneDirZ;
    if (dot < this.halfAngleCos) {
      return false;
    }

    // Check awning occlusion (player standing directly under an awning ceiling)
    for (let i = 0; i < awnings.length; i++) {
      const a = awnings[i]!;
      if (
        playerPos.x >= a.minX &&
        playerPos.x <= a.maxX &&
        playerPos.z >= a.minZ &&
        playerPos.z <= a.maxZ &&
        playerPos.y < a.height &&
        this.pos.y > a.height
      ) {
        return false; // occluded by overhead awning
      }
    }

    // Check tall obstacle occlusion
    const hits = colliders.segmentHits(this.pos.x, this.pos.z, playerPos.x, playerPos.z, 1.5);
    if (hits > 0) {
      return false;
    }

    return true;
  }

  /**
   * Apply EMP pulse. If drone is within radius, disables for duration seconds.
   */
  applyEmp(origin: Vec3, radius = 10.0, duration = 20.0): boolean {
    const dist = Math.hypot(
      origin.x - this.pos.x,
      origin.y - this.pos.y,
      origin.z - this.pos.z,
    );
    if (dist <= radius) {
      this.state = 'EMP_DISABLED';
      this.empTimer = duration;
      this.detectionMeter = 0.0;
      return true;
    }
    return false;
  }

  getSnapshot(): DroneSnapshot {
    return {
      id: this.id,
      pos: { ...this.pos },
      yaw: this.yaw,
      pitch: this.pitch,
      state: this.state,
      detectionMeter: this.detectionMeter,
      spotlightOn: this.state !== 'EMP_DISABLED',
    };
  }
}

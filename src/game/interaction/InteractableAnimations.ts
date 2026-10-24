/* ── InteractableAnimations.ts ───────────────────────────────────────────
 *  Phase G: Physical secondary motion for world interactables:
 *  - Sliding doors with ease-in-out cubic acceleration/deceleration
 *  - Valve wheels rotating with angular momentum and damped spring bounce on hard stops
 *  - Keypad buttons depressing visibly under player's interact trace
 *  - Bells swinging on pivot with decaying harmonic oscillation
 *  - Sinking platforms tilting slightly toward player footprint
 * ──────────────────────────────────────────────────────────────────────── */

import { Object3D, Vector3, MathUtils } from 'three';

/** Smoothstep cubic easing: 3t^2 - 2t^3 */
export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** 1. Sliding Door with Ease-In & Ease-Out */
export class SlidingDoorAnimation {
  readonly mesh: Object3D;
  private readonly closedPos: Vector3;
  private readonly openOffset: Vector3;
  private progress = 0; // 0..1
  private isOpen = false;
  private duration: number;

  constructor(mesh: Object3D, openOffset = new Vector3(0, 3.2, 0), duration = 2.4) {
    this.mesh = mesh;
    this.closedPos = mesh.position.clone();
    this.openOffset = openOffset.clone();
    this.duration = duration;
  }

  setOpen(open: boolean): void {
    this.isOpen = open;
  }

  update(dt: number): void {
    const target = this.isOpen ? 1.0 : 0.0;
    if (this.progress !== target) {
      const step = dt / this.duration;
      if (this.progress < target) {
        this.progress = Math.min(target, this.progress + step);
      } else {
        this.progress = Math.max(target, this.progress - step);
      }

      const ease = smoothstep(this.progress);
      this.mesh.position.set(
        this.closedPos.x + this.openOffset.x * ease,
        this.closedPos.y + this.openOffset.y * ease,
        this.closedPos.z + this.openOffset.z * ease,
      );
    }
  }

  getProgress(): number {
    return this.progress;
  }
}

/** 2. Valve Wheel with Momentum & Springback on Hard Stops */
export class ValveWheelAnimation {
  readonly mesh: Object3D;
  private angle = 0;
  private angularVelocity = 0;
  private bounceTimer = 0;
  private bounceSign = 1;
  private readonly maxAngle: number;

  constructor(mesh: Object3D, maxAngle = Math.PI * 4.0) {
    this.mesh = mesh;
    this.maxAngle = maxAngle;
  }

  turn(torque: number): void {
    this.angularVelocity += torque;
  }

  update(dt: number): void {
    // Angular friction
    this.angularVelocity *= Math.exp(-dt * 4.0);
    this.angle += this.angularVelocity * dt;

    // Hard stop spring-back bounce
    if (this.angle > this.maxAngle) {
      this.angle = this.maxAngle;
      this.angularVelocity = -this.angularVelocity * 0.25;
      this.bounceTimer = 0.35;
      this.bounceSign = 1;
    } else if (this.angle < 0) {
      this.angle = 0;
      this.angularVelocity = -this.angularVelocity * 0.25;
      this.bounceTimer = 0.35;
      this.bounceSign = -1;
    }

    let displayAngle = this.angle;
    if (this.bounceTimer > 0) {
      this.bounceTimer -= dt;
      const decay = Math.exp(-this.bounceTimer * 10.0);
      const bounce = Math.sin(this.bounceTimer * 24.0) * 0.06 * decay;
      displayAngle += bounce * this.bounceSign;
    }

    this.mesh.rotation.z = displayAngle;
  }

  getAngle(): number {
    return this.angle;
  }
}

/** 3. Keypad Button with Visible Depress */
export class KeypadButtonAnimation {
  readonly mesh: Object3D;
  private readonly restPos: Vector3;
  private depressAmount = 0; // 0..0.015m

  constructor(mesh: Object3D) {
    this.mesh = mesh;
    this.restPos = mesh.position.clone();
  }

  press(): void {
    this.depressAmount = 0.015; // 1.5cm depression
  }

  update(dt: number): void {
    if (this.depressAmount > 0) {
      // Spring back up quickly
      this.depressAmount = Math.max(0, this.depressAmount - dt * 0.08);
      this.mesh.position.set(
        this.restPos.x,
        this.restPos.y,
        this.restPos.z - this.depressAmount,
      );
    }
  }

  getDepress(): number {
    return this.depressAmount;
  }
}

/** 4. Swinging Bell with Decaying Harmonic Oscillation */
export class SwingingBellAnimation {
  readonly mesh: Object3D;
  private angle = 0;
  private angularVelocity = 0;
  private readonly damping = 0.85;
  private readonly frequency = 6.28; // 1.0 Hz natural frequency

  constructor(mesh: Object3D) {
    this.mesh = mesh;
  }

  ring(impulse = 0.65): void {
    this.angularVelocity += impulse;
  }

  update(dt: number): void {
    // Harmonic oscillator: d2theta/dt2 = -w^2 * theta - 2*zeta*w*vel
    const springForce = -(this.frequency * this.frequency) * this.angle;
    const dampingForce = -2.0 * this.damping * this.frequency * this.angularVelocity;

    this.angularVelocity += (springForce + dampingForce) * dt;
    this.angle += this.angularVelocity * dt;

    this.mesh.rotation.z = this.angle;
  }

  getAngle(): number {
    return this.angle;
  }
}

/** 5. Sinking Platform with Standing Edge Tilt */
export class SinkingPlatformTiltAnimation {
  readonly mesh: Object3D;
  private currentTiltX = 0;
  private currentTiltZ = 0;
  private readonly maxTilt = 0.043; // 2.5 degrees max tilt

  constructor(mesh: Object3D) {
    this.mesh = mesh;
  }

  update(
    dt: number,
    playerOnPlatform: boolean,
    platformCenter: { x: number; z: number },
    playerPos: { x: number; z: number },
    platformHalfWidth = 2.0,
    platformHalfDepth = 2.0,
  ): void {
    let targetTiltX = 0;
    let targetTiltZ = 0;

    if (playerOnPlatform) {
      const dx = MathUtils.clamp(
        (playerPos.x - platformCenter.x) / platformHalfWidth,
        -1.0,
        1.0,
      );
      const dz = MathUtils.clamp(
        (playerPos.z - platformCenter.z) / platformHalfDepth,
        -1.0,
        1.0,
      );

      // Tilts toward edge player stands on
      targetTiltZ = -dx * this.maxTilt;
      targetTiltX = dz * this.maxTilt;
    }

    // Critically damped spring towards target tilt
    this.currentTiltX += (targetTiltX - this.currentTiltX) * Math.min(1.0, dt * 6.0);
    this.currentTiltZ += (targetTiltZ - this.currentTiltZ) * Math.min(1.0, dt * 6.0);

    this.mesh.rotation.x = this.currentTiltX;
    this.mesh.rotation.z = this.currentTiltZ;
  }

  getTilt(): { x: number; z: number } {
    return { x: this.currentTiltX, z: this.currentTiltZ };
  }
}

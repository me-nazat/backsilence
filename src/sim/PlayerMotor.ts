/* ── PlayerMotor.ts ───────────────────────────────────────────────────────
 *  Pure simulation 60Hz character physics motor.
 *  Handles acceleration, friction, jump, mantle, stamina, and acoustic noise emission.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, PlayerId } from '../types/contracts.js';
import type { GroundGrid } from './GroundGrid.js';
import type { ColliderSet, Collider } from './Colliders.js';
import type { EventRingBuffer } from './Events.js';
import type { WorldProfile } from './WorldProfile.js';
import type { PerchSystem } from './PerchSystem.js';
import type { FlowField } from './FlowField.js';
import { dHypot, dSin, dCos, D_PI } from './dmath.js';

export interface PlayerIntent {
  moveX: number; // -1 (left) .. +1 (right)
  moveZ: number; // -1 (forward) .. +1 (back)
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  interact: boolean;
  lookDeltaYaw: number;
  lookDeltaPitch: number;
}

export interface PlayerMotorState {
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  crouchT: number; // 0..1
  stamina: number; // 0..100
  exhausted: boolean;
  wet: boolean;
  depth: number;
  mantling: boolean;
  agitation: number;
}

export type PlayerSnapshot = PlayerMotorState;

export class PlayerMotor {
  readonly playerId: PlayerId;
  readonly pos: Vec3;
  readonly vel: Vec3;
  yaw = 0;
  pitch = 0;

  // Constants
  static readonly RADIUS = 0.32;
  static readonly STAND_HEIGHT = 1.8;
  static readonly CROUCH_HEIGHT = 1.1;
  static readonly EYE_STAND = 1.65;
  static readonly EYE_CROUCH = 0.95;
  static readonly STEP_LIMIT = 0.45;
  static readonly GRAVITY = 14.0;
  static readonly JUMP_V = 4.6;
  static readonly SPEED_WALK = 3.2;
  static readonly SPEED_SPRINT = 5.2;
  static readonly SPEED_CROUCH = 1.6;
  static readonly ACCEL_GROUND = 28.0;
  static readonly ACCEL_AIR = 3.6;
  static readonly FRICTION = 10.0;
  static readonly WADE_FACTOR = 0.68;
  static readonly DEEP_WADE_FACTOR = 0.55;

  onGround = true;
  crouchT = 0; // 0 (standing) -> 1 (crouched)
  stamina = 100.0;
  exhausted = false;
  private staminaRegenTimer = 0;

  wet = false;
  depth = 0;
  private wasWet = false;
  private wasOnGround = true;

  // Timers for jump buffer and coyote time
  public coyoteDuration = 0.15;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpCooldownTimer = 0;

  // Mantling state
  private mantle = {
    active: false,
    timer: 0,
    duration: 0.5,
    from: { x: 0, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
  };

  // Noise emission stride timer & agitation
  private strideTimer = 0;
  private agitation = 0;
  private recentLoudness = 0;
  private recentLoudnessTimer = 0;

  // Reusable query buffer
  private readonly colliderCandidates: Collider[] = [];
  private readonly pushOut = { x: 0, z: 0 };

  private readonly previousState: PlayerMotorState;

  constructor(playerId: PlayerId, spawnPos: Vec3) {
    this.playerId = playerId;
    this.pos = { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.previousState = this.getState();
  }

  private copyToState(out: PlayerMotorState): void {
    out.pos.x = this.pos.x;
    out.pos.y = this.pos.y;
    out.pos.z = this.pos.z;
    out.vel.x = this.vel.x;
    out.vel.y = this.vel.y;
    out.vel.z = this.vel.z;
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    out.onGround = this.onGround;
    out.crouchT = this.crouchT;
    out.stamina = this.stamina;
    out.exhausted = this.exhausted;
    out.wet = this.wet;
    out.depth = this.depth;
    out.mantling = this.mantle.active;
    out.agitation = this.agitation;
  }

  getState(): PlayerMotorState {
    return {
      pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      vel: { x: this.vel.x, y: this.vel.y, z: this.vel.z },
      yaw: this.yaw,
      pitch: this.pitch,
      onGround: this.onGround,
      crouchT: this.crouchT,
      stamina: this.stamina,
      exhausted: this.exhausted,
      wet: this.wet,
      depth: this.depth,
      mantling: this.mantle.active,
      agitation: this.agitation,
    };
  }

  get isWading(): boolean {
    return this.depth > 0;
  }

  get isMantling(): boolean {
    return this.mantle.active;
  }

  getSnapshot(): PlayerMotorState {
    return this.getState();
  }

  getPreviousSnapshot(): PlayerMotorState {
    return this.previousState;
  }

  teleport(pos: Partial<Vec3>, yaw?: number): void {
    if (pos.x !== undefined) this.pos.x = pos.x;
    if (pos.y !== undefined) this.pos.y = pos.y;
    if (pos.z !== undefined) this.pos.z = pos.z;
    if (yaw !== undefined) this.yaw = yaw;
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
    this.copyToState(this.previousState);
  }

  setYaw(yaw: number, pitch = 0): void {
    this.yaw = yaw;
    this.pitch = pitch;
    this.copyToState(this.previousState);
  }

  step(
    dt: number,
    intent: PlayerIntent,
    ground: GroundGrid,
    colliders: ColliderSet,
    events: EventRingBuffer,
    simTime: number,
    waterY = 0,
    profile?: WorldProfile,
    perchSystem?: PerchSystem,
    flowField?: FlowField,
  ): void {
    this.copyToState(this.previousState);

    // Update jump cooldown timer
    if (this.jumpCooldownTimer > 0) {
      this.jumpCooldownTimer = Math.max(0, this.jumpCooldownTimer - dt);
    }

    // 1. Look orientation
    this.yaw += intent.lookDeltaYaw || 0;
    this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch + (intent.lookDeltaPitch || 0)));

    // 2. Crouch interpolation
    const targetCrouch = intent.crouch ? 1.0 : 0.0;
    this.crouchT += (targetCrouch - this.crouchT) * Math.min(1.0, dt * 10.0);

    // 3. Mantling scripted override
    if (this.mantle.active) {
      this.stepMantle(dt, events, simTime);
      return;
    }

    // 4. Environmental state (water depth & wetness)
    const currentGroundY = ground.heightAt(this.pos.x, this.pos.z);
    this.depth = ground.depthAt(this.pos.x, this.pos.z, waterY);
    this.wet = this.pos.y < waterY - 0.05 || (this.onGround && currentGroundY < waterY - 0.05);

    // 5. Water entry detection (from air)
    if (!this.wasWet && this.wet) {
      const isHardFall = !this.onGround && this.vel.y < -2.0;
      const fallSpeed = Math.abs(this.vel.y);
      const loudness = isHardFall ? Math.min(1.0, 0.5 + fallSpeed * 0.1) : 0.35;
      events.pushNoise(`noise_splash_${simTime}`, 'jump_in', this.pos.x, waterY, this.pos.z, loudness, this.playerId, simTime);
      events.pushRipple(this.pos.x, waterY, this.pos.z, isHardFall ? 1.0 : 0.5, this.playerId, simTime);
      this.recordLoudness(loudness);
    }
    this.wasWet = this.wet;

    // 6. Check for Mantle trigger while in water or airborne facing a ledge
    if ((this.wet || !this.onGround) && intent.jump && this.tryStartMantle(ground, colliders, waterY, simTime, events)) {
      return;
    }

    // 7. Stamina and Sprinting
    let isSprinting = intent.sprint && !this.exhausted && !intent.crouch;
    if (this.depth > 1.2) {
      isSprinting = false; // deep water disables sprint
    }

    if (isSprinting && (Math.abs(intent.moveX) > 0.1 || Math.abs(intent.moveZ) > 0.1)) {
      this.stamina = Math.max(0, this.stamina - 17.0 * dt);
      this.staminaRegenTimer = 1.0;
      if (this.stamina <= 0.0) {
        this.exhausted = true;
      }
    } else {
      if (this.staminaRegenTimer > 0) {
        this.staminaRegenTimer = Math.max(0, this.staminaRegenTimer - dt);
      } else {
        this.stamina = Math.min(100.0, this.stamina + 18.0 * dt);
        if (this.exhausted && this.stamina > 30.0) {
          this.exhausted = false;
        }
      }
    }

    // 8. Movement speeds and acceleration
    let targetSpeed = PlayerMotor.SPEED_WALK;
    if (isSprinting) targetSpeed = PlayerMotor.SPEED_SPRINT;
    else if (intent.crouch) targetSpeed = PlayerMotor.SPEED_CROUCH;

    const effectiveWadeFactor = profile?.wadeFactor ?? PlayerMotor.WADE_FACTOR;
    if (this.wet) {
      targetSpeed *= this.depth > 1.2 ? PlayerMotor.DEEP_WADE_FACTOR : effectiveWadeFactor;
    }

    // Normalize diagonal inputs
    let mx = intent.moveX;
    let mz = intent.moveZ;
    const inputLen = dHypot(mx, mz);
    if (inputLen > 1.0) {
      mx /= inputLen;
      mz /= inputLen;
    }

    // Transform input to world velocity based on yaw
    const sinY = dSin(this.yaw);
    const cosY = dCos(this.yaw);
    const worldWishX = mx * cosY + mz * sinY;
    const worldWishZ = -mx * sinY + mz * cosY;

    const wishVelX = worldWishX * targetSpeed;
    const wishVelZ = worldWishZ * targetSpeed;

    // Apply horizontal acceleration & friction
    const accel = this.onGround ? PlayerMotor.ACCEL_GROUND : PlayerMotor.ACCEL_AIR;
    this.vel.x += (wishVelX - this.vel.x) * Math.min(1.0, accel * dt);
    this.vel.z += (wishVelZ - this.vel.z) * Math.min(1.0, accel * dt);

    if (this.onGround && inputLen < 0.05) {
      this.vel.x -= this.vel.x * Math.min(1.0, PlayerMotor.FRICTION * dt);
      this.vel.z -= this.vel.z * Math.min(1.0, PlayerMotor.FRICTION * dt);
    }

    // 9. Jump & Gravity logic (Coyote time & Jump buffer)
    if (this.onGround || this.wet) {
      this.coyoteTimer = this.coyoteDuration;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (intent.jump) {
      this.jumpBufferTimer = 0.15;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    const canJump = (this.onGround || this.wet || this.coyoteTimer > 0) && this.jumpCooldownTimer <= 0;
    if (this.jumpBufferTimer > 0 && canJump) {
      if (isSprinting) {
        this.stamina = Math.max(0, this.stamina - 12.0);
        if (this.stamina <= 0.0) {
          this.exhausted = true;
        }
      }
      const jumpImpulse = this.wet ? 6.2 : PlayerMotor.JUMP_V;
      this.vel.y = jumpImpulse - PlayerMotor.GRAVITY * dt * 0.5;
      this.onGround = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpCooldownTimer = 0.35;

      if (this.wet) {
        events.pushNoise(`noise_jump_${simTime}`, 'wade', this.pos.x, this.pos.y, this.pos.z, 0.4, this.playerId, simTime);
        events.pushRipple(this.pos.x, waterY, this.pos.z, 0.5, this.playerId, simTime);
        this.recordLoudness(0.4);
      }
    } else if (!this.onGround) {
      this.vel.y -= PlayerMotor.GRAVITY * dt;
    }

    // 10. Horizontal Position Update & Push-out Collision (Swept axis-separated)
    let newX = this.pos.x + this.vel.x * dt;
    const destGroundYX = this.sampleGroundHeight(newX, this.pos.z, ground, colliders);
    const stepDiffX = destGroundYX - this.pos.y;
    if (stepDiffX > PlayerMotor.STEP_LIMIT) {
      newX = this.pos.x;
      this.vel.x = 0;
    }

    let newZ = this.pos.z + this.vel.z * dt;
    const destGroundYZ = this.sampleGroundHeight(newX, newZ, ground, colliders);
    const stepDiffZ = destGroundYZ - this.pos.y;
    if (stepDiffZ > PlayerMotor.STEP_LIMIT) {
      newZ = this.pos.z;
      this.vel.z = 0;
    }

    // Auto-step-up: automatically step up ledges/stairs <= STEP_LIMIT
    const stepGroundY = this.sampleGroundHeight(newX, newZ, ground, colliders);
    const stepDiff = stepGroundY - this.pos.y;
    if (stepDiff > 0.02 && stepDiff <= PlayerMotor.STEP_LIMIT && (this.onGround || this.wet)) {
      this.pos.y = stepGroundY;
      this.vel.y = 0;
      this.onGround = true;
    }

    // Pushout vs Box & Cylinder Colliders (3 iterations with normal deflection for smooth wall sliding)
    colliders.queryCircle(newX, newZ, PlayerMotor.RADIUS + 1.0, this.colliderCandidates);
    for (let iter = 0; iter < 3; iter++) {
      const pushed = colliders.resolveCirclePushout(
        newX,
        newZ,
        PlayerMotor.RADIUS,
        this.pos.y,
        PlayerMotor.STAND_HEIGHT,
        this.colliderCandidates,
        this.pushOut,
      );
      if (pushed) {
        newX += this.pushOut.x;
        newZ += this.pushOut.z;
        const pushDist = dHypot(this.pushOut.x, this.pushOut.z);
        if (pushDist > 1e-4) {
          const nx = this.pushOut.x / pushDist;
          const nz = this.pushOut.z / pushDist;
          const vDotN = this.vel.x * nx + this.vel.z * nz;
          if (vDotN < 0) {
            this.vel.x -= vDotN * nx;
            this.vel.z -= vDotN * nz;
          }
        }
      } else {
        break;
      }
    }

    // Flow drift while wading
    if (this.wet && flowField) {
      const drift = flowField.computeWadeDrift(this.pos, dt);
      newX += drift.dx;
      newZ += drift.dz;
    }

    // Clamp inside map bounds
    newX = Math.max(ground.bounds.minX + PlayerMotor.RADIUS, Math.min(ground.bounds.maxX - PlayerMotor.RADIUS, newX));
    newZ = Math.max(ground.bounds.minZ + PlayerMotor.RADIUS, Math.min(ground.bounds.maxZ - PlayerMotor.RADIUS, newZ));

    this.pos.x = newX;
    this.pos.z = newZ;

    // 11. Vertical Position Update & Ground Snapping
    let newY = this.pos.y + this.vel.y * dt;
    const finalGroundY = this.sampleGroundHeight(this.pos.x, this.pos.z, ground, colliders);

    if (newY <= finalGroundY) {
      newY = finalGroundY;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      // Airborne ground landing snap
      if (newY - finalGroundY < 0.10 && this.vel.y <= 0) {
        newY = finalGroundY;
        this.vel.y = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
    }

    this.pos.y = newY;

    if (!this.wasOnGround && this.onGround) {
      const perch = perchSystem ? perchSystem.findSurfaceAt(this.pos.x, this.pos.z, this.pos.y, 0.0) : null;
      if (perch && perch.isPerch) {
        const isHard = Math.abs(this.vel.y) >= 2.5;
        const creakLoudness = isHard ? 0.30 : 0.15;
        events.pushNoise(
          `noise_creak_${simTime}`,
          'creak',
          this.pos.x,
          this.pos.y,
          this.pos.z,
          creakLoudness,
          this.playerId,
          simTime,
        );
      } else {
        events.pushFootfall(this.playerId, this.pos.x, this.pos.y, this.pos.z, Math.min(1.0, Math.abs(this.vel.y) / 5.0), this.wet, simTime);
      }
    }
    this.wasOnGround = this.onGround;

    // 12. Acoustic Noise Emission on Stride Cadence
    this.handleNoiseEmission(dt, inputLen, isSprinting, intent.crouch, events, simTime, waterY);
  }

  private sampleGroundHeight(x: number, z: number, ground: GroundGrid, colliders?: ColliderSet): number {
    const r = PlayerMotor.RADIUS * 0.7;
    const c = ground.heightAt(x, z);
    const n = ground.heightAt(x, z - r);
    const s = ground.heightAt(x, z + r);
    const e = ground.heightAt(x + r, z);
    const w = ground.heightAt(x - r, z);

    let maxH = c;
    if (Number.isFinite(n) && n > maxH) maxH = n;
    if (Number.isFinite(s) && s > maxH) maxH = s;
    if (Number.isFinite(e) && e > maxH) maxH = e;
    if (Number.isFinite(w) && w > maxH) maxH = w;

    if (colliders) {
      colliders.queryCircle(x, z, r + 0.1, this.colliderCandidates);
      for (let i = 0; i < this.colliderCandidates.length; i++) {
        const col = this.colliderCandidates[i]!;
        if (col.type === 'box') {
          if (x >= col.min.x && x <= col.max.x && z >= col.min.z && z <= col.max.z) {
            // Box top is reachable within step-up range or the player is resting/stepping on it
            if (col.max.y <= this.pos.y + PlayerMotor.STEP_LIMIT + 0.1 && col.max.y > maxH) {
              maxH = col.max.y;
            }
          }
        }
      }
    }

    return maxH;
  }

  private handleNoiseEmission(
    dt: number,
    inputLen: number,
    isSprinting: boolean,
    isCrouching: boolean,
    events: EventRingBuffer,
    simTime: number,
    waterY: number,
  ): void {
    const isMoving = inputLen > 0.1 && this.onGround;

    if (!this.wet || !isMoving) {
      // Dry tiles or stationary: zero NoiseEvents and zero Ripples
      this.strideTimer = 0;
      this.decayAgitation(dt);
      return;
    }

    // Wet movement cadence: crouch 0.70s (0.12), walk 0.45s (0.35), sprint 0.30s (0.75)
    let cadence = 0.45;
    let loudness = 0.35;

    if (isSprinting) {
      cadence = 0.30;
      loudness = 0.75;
    } else if (isCrouching) {
      cadence = 0.70;
      loudness = 0.12;
    }

    this.strideTimer += dt;
    if (this.strideTimer >= cadence) {
      this.strideTimer = 0;
      events.pushNoise(`noise_wade_${simTime}`, 'wade', this.pos.x, this.pos.y, this.pos.z, loudness, this.playerId, simTime);
      const rippleStrength = 0.35 + 0.65 * loudness;
      events.pushRipple(this.pos.x, waterY, this.pos.z, rippleStrength, this.playerId, simTime);
      this.recordLoudness(loudness);
    }

    this.decayAgitation(dt);
  }

  private recordLoudness(l: number): void {
    if (l > this.recentLoudness) {
      this.recentLoudness = l;
      this.recentLoudnessTimer = 0.25;
    }
  }

  private decayAgitation(dt: number): void {
    if (this.recentLoudnessTimer > 0) {
      this.recentLoudnessTimer -= dt;
      if (this.recentLoudnessTimer <= 0) {
        this.recentLoudness = 0;
      }
    }

    // Attack 0.05s, Release 0.5s
    if (this.recentLoudness > this.agitation) {
      this.agitation += (this.recentLoudness - this.agitation) * Math.min(1.0, dt / 0.05);
    } else {
      this.agitation += (0 - this.agitation) * Math.min(1.0, dt / 0.5);
    }
    this.agitation = Math.max(0.0, Math.min(1.0, this.agitation));
  }

  private tryStartMantle(
    ground: GroundGrid,
    colliders: ColliderSet,
    waterY: number,
    simTime: number,
    events: EventRingBuffer,
  ): boolean {
    const fwdX = dSin(this.yaw);
    const fwdZ = -dCos(this.yaw);

    // Test multiple sample distances ahead to catch nearby edges reliably (0.6m primary, then 0.75m, then 0.45m)
    const sampleDistances = [0.6, 0.75, 0.45];
    for (const dist of sampleDistances) {
      const checkX = this.pos.x + fwdX * dist;
      const checkZ = this.pos.z + fwdZ * dist;

      let targetH = ground.heightAt(checkX, checkZ);
      if (!Number.isFinite(targetH)) targetH = -999;

      // Also check colliders for raised platforms, bleachers, or furniture tops
      colliders.queryCircle(checkX, checkZ, 0.4, this.colliderCandidates);
      for (let i = 0; i < this.colliderCandidates.length; i++) {
        const col = this.colliderCandidates[i]!;
        if (col.type === 'box') {
          if (checkX >= col.min.x && checkX <= col.max.x && checkZ >= col.min.z && checkZ <= col.max.z) {
            if (col.max.y > targetH) {
              targetH = col.max.y;
            }
          }
        }
      }

      if (targetH <= -990) continue;

      const heightAboveFeet = targetH - this.pos.y;
      // Edge height between 0.15m and 1.8m above feet
      if (heightAboveFeet < 0.15 || heightAboveFeet > 1.8) continue;

      // Verify destination is dry
      if (targetH < waterY - 0.05) continue;

      // Verify clear headroom: ensure no tall collider blocks the space above targetH
      let blocked = false;
      for (let i = 0; i < this.colliderCandidates.length; i++) {
        const col = this.colliderCandidates[i]!;
        if (col.type === 'box') {
          if (checkX >= col.min.x && checkX <= col.max.x && checkZ >= col.min.z && checkZ <= col.max.z) {
            if (col.min.y < targetH + PlayerMotor.STAND_HEIGHT && col.max.y > targetH + 0.2) {
              blocked = true;
              break;
            }
          }
        }
      }
      if (blocked) continue;

      // Found valid ledge to mantle!
      this.mantle.active = true;
      this.mantle.timer = 0;
      this.mantle.duration = 0.55;
      this.mantle.from = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
      this.mantle.to = { x: checkX, y: targetH, z: checkZ };

      // Emit mantle noise and ripple
      events.pushNoise(`noise_mantle_${simTime}`, 'mantle', this.pos.x, this.pos.y, this.pos.z, 0.5, this.playerId, simTime);
      events.pushRipple(this.pos.x, waterY, this.pos.z, 0.6, this.playerId, simTime);
      this.recordLoudness(0.5);
      return true;
    }

    return false;
  }

  private stepMantle(dt: number, events: EventRingBuffer, simTime: number): void {
    this.mantle.timer += dt;
    const progress = Math.min(1.0, this.mantle.timer / this.mantle.duration);

    // Cubic ease out for natural vaulting feel
    const inv = 1 - progress;
    const t = 1 - inv * inv * inv;

    this.pos.x = this.mantle.from.x + (this.mantle.to.x - this.mantle.from.x) * t;
    this.pos.z = this.mantle.from.z + (this.mantle.to.z - this.mantle.from.z) * t;

    // Arc upward then settle onto surface
    const arcLift = dSin(progress * D_PI) * 0.30;
    this.pos.y = this.mantle.from.y + (this.mantle.to.y - this.mantle.from.y) * t + arcLift;

    if (progress >= 1.0) {
      this.mantle.active = false;
      this.pos.x = this.mantle.to.x;
      this.pos.y = this.mantle.to.y;
      this.pos.z = this.mantle.to.z;
      this.vel.x = 0;
      this.vel.y = 0;
      this.vel.z = 0;
      this.onGround = true;
      this.wet = false;
      // Exiting water step
      events.pushNoise(`noise_exit_${simTime}`, 'wade', this.pos.x, this.pos.y, this.pos.z, 0.2, this.playerId, simTime);
    }
  }
}

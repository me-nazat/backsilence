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
import { WORLD } from '../app/Config.js';

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
  waterFallActive?: boolean;
  lastLandingSpeed?: number;
  lastLandingImpactSpeed?: number;
}

export type PlayerSnapshot = PlayerMotorState;

export class PlayerMotor {
  readonly playerId: PlayerId;
  readonly pos: Vec3;
  readonly vel: Vec3;
  yaw = 0;
  pitch = 0;

  // Constants
  static readonly RADIUS = WORLD.PLAYER.RADIUS;
  static readonly STAND_HEIGHT = 1.8;
  static readonly CROUCH_HEIGHT = 0.85;
  static readonly EYE_STAND = WORLD.PLAYER.EYE_STAND;
  static readonly EYE_CROUCH = WORLD.PLAYER.EYE_CROUCH;
  static readonly STEP_LIMIT = 0.45;
  static readonly GRAVITY = WORLD.PLAYER.GRAVITY;
  static readonly JUMP_V = WORLD.PLAYER.JUMP_V;
  static readonly WATER_GRAVITY = WORLD.PLAYER.WATER_GRAVITY;
  static readonly WATER_JUMP_V = WORLD.PLAYER.WATER_JUMP_V;
  static readonly JUMP_BUFFER = WORLD.PLAYER.JUMP_BUFFER;
  static readonly COYOTE_TIME = WORLD.PLAYER.COYOTE_TIME;
  static readonly SPEED_WALK = WORLD.PLAYER.WALK;
  static readonly SPEED_SPRINT = WORLD.PLAYER.SPRINT;
  static readonly SPEED_CROUCH = WORLD.PLAYER.CROUCH;
  static readonly ACCEL_GROUND = 28.0;
  static readonly ACCEL_AIR = 3.6;
  static readonly FRICTION = 10.0;
  static readonly WADE_FACTOR = WORLD.PLAYER.WADE_FACTOR;
  static readonly DEEP_WADE_FACTOR = 0.55;

  // Prompt 5B Parkour Tuning Constants
  static readonly PARKOUR_STAND_HEIGHT = 1.75;
  static readonly PARKOUR_EYE_STAND = 1.58;
  static readonly PARKOUR_DRY_SPEED = 5.5;
  static readonly PARKOUR_WADE_SPEED = 3.4;
  static readonly PARKOUR_JUMP_V = 6.3;
  static readonly PARKOUR_GRAVITY = 16.8;
  static readonly PARKOUR_COYOTE = 0.12;
  static readonly PARKOUR_JUMP_BUFFER = 0.12;

  public parkourMode = false;

  onGround = true;
  crouchT = 0; // 0 (standing) -> 1 (crouched)
  stamina = 100.0;
  exhausted = false;
  private staminaRegenTimer = 0;

  wet = false;
  depth = 0;
  public waterFallActive = false;
  public waterFallTimer = 0;
  private wasWet = false;
  private wasOnGround = true;

  // Timers for jump buffer and coyote time
  public coyoteDuration: number = PlayerMotor.COYOTE_TIME;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpCooldownTimer = 0;
  private prevJumpHeld = false;
  private lastLandingSpeed = 0;
  private lastLandingImpactSpeed = 0;

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

  constructor(playerId: PlayerId, spawnPos: Vec3, options?: { parkourMode?: boolean }) {
    this.playerId = playerId;
    this.pos = { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z };
    this.vel = { x: 0, y: 0, z: 0 };
    if (options?.parkourMode) {
      this.parkourMode = true;
      this.coyoteDuration = PlayerMotor.PARKOUR_COYOTE;
    } else {
      this.coyoteDuration = PlayerMotor.COYOTE_TIME;
    }
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
    out.waterFallActive = this.waterFallActive;
    out.lastLandingSpeed = this.lastLandingSpeed;
    out.lastLandingImpactSpeed = this.lastLandingImpactSpeed;
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
      waterFallActive: this.waterFallActive,
      lastLandingSpeed: this.lastLandingSpeed,
      lastLandingImpactSpeed: this.lastLandingImpactSpeed,
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

  /**
   * Integrate a mouse-look delta at render rate (used on frames where no fixed
   * tick runs, so the delta is never dropped). Orientation only; no physics.
   */
  applyLookDelta(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch + dPitch));
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
    this.lastLandingSpeed = 0;
    this.lastLandingImpactSpeed = 0;
    const wasOnGround = this.wasOnGround;

    // Update jump cooldown timer
    if (this.jumpCooldownTimer > 0) {
      this.jumpCooldownTimer = Math.max(0, this.jumpCooldownTimer - dt);
    }

    if (this.waterFallTimer > 0) {
      this.waterFallTimer = Math.max(0, this.waterFallTimer - dt);
      if (this.waterFallTimer <= 0) {
        this.waterFallActive = false;
      }
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
      const isHardFall = (!this.onGround && this.vel.y < -2.0) || this.depth > 0.8;
      const loudness = isHardFall ? 0.75 : 0.35;
      events.pushNoise(`noise_splash_${simTime}`, 'jump_in', this.pos.x, waterY, this.pos.z, loudness, this.playerId, simTime);
      events.pushRipple(this.pos.x, waterY, this.pos.z, isHardFall ? 1.0 : 0.5, this.playerId, simTime);
      this.recordLoudness(loudness);
      if (isHardFall) {
        this.waterFallActive = true;
        this.waterFallTimer = 0.5;
      }
    }
    this.wasWet = this.wet;

    // 6. Check for Mantle trigger while in water or airborne facing a ledge (legacy/classic mode)
    if (!this.parkourMode && (this.wet || !this.onGround) && intent.jump && this.tryStartMantle(ground, colliders, waterY, simTime, events)) {
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
    let targetSpeed = this.parkourMode ? PlayerMotor.PARKOUR_WADE_SPEED : PlayerMotor.SPEED_WALK;
    if (isSprinting) targetSpeed = this.parkourMode ? PlayerMotor.PARKOUR_DRY_SPEED : PlayerMotor.SPEED_SPRINT;
    else if (intent.crouch) targetSpeed = PlayerMotor.SPEED_CROUCH;

    const effectiveWadeFactor = profile?.wadeFactor ?? PlayerMotor.WADE_FACTOR;
    if (this.wet) {
      if (this.parkourMode) {
        targetSpeed = PlayerMotor.PARKOUR_WADE_SPEED;
      } else {
        targetSpeed *= this.depth > 1.2 ? PlayerMotor.DEEP_WADE_FACTOR : effectiveWadeFactor;
      }
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
    // Jump state transitions:
    //  - ON_GROUND -> AIRBORNE_ASCENT: lines 385-401 (Takeoff on buffered jump or coyote jump)
    //  - ON_GROUND -> AIRBORNE_DESCENT: lines 369-372 & 403 (Walking off ledge under gravity)
    //  - AIRBORNE_ASCENT -> AIRBORNE_DESCENT: line 403 (Apex reached when vel.y <= 0)
    //  - AIRBORNE -> ON_GROUND: lines 610-631 (Ground landing snap)
    //  - AIRBORNE / WET -> MANTLING: lines 286-289 & 793 (Ledge mantle trigger)
    //  - MANTLING -> ON_GROUND: lines 825-835 (Mantle completion settling on slab)
    const effectiveCoyoteDuration = this.parkourMode ? PlayerMotor.PARKOUR_COYOTE : this.coyoteDuration;
    const effectiveJumpBuffer = this.parkourMode ? PlayerMotor.PARKOUR_JUMP_BUFFER : PlayerMotor.JUMP_BUFFER;
    const effectiveGravity = this.parkourMode ? PlayerMotor.PARKOUR_GRAVITY : (this.wet ? PlayerMotor.WATER_GRAVITY : PlayerMotor.GRAVITY);
    const effectiveJumpV = this.parkourMode ? PlayerMotor.PARKOUR_JUMP_V : (this.wet ? PlayerMotor.WATER_JUMP_V : PlayerMotor.JUMP_V);
    const effectiveStandHeight = this.parkourMode ? PlayerMotor.PARKOUR_STAND_HEIGHT : PlayerMotor.STAND_HEIGHT;
    const currentHeight = (1 - this.crouchT) * effectiveStandHeight + this.crouchT * PlayerMotor.CROUCH_HEIGHT;

    if (this.onGround) {
      this.coyoteTimer = effectiveCoyoteDuration;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    const jumpJustPressed = intent.jump && !this.prevJumpHeld;
    this.prevJumpHeld = intent.jump;
    if (jumpJustPressed) {
      this.jumpBufferTimer = effectiveJumpBuffer;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    const canJump = (this.onGround || this.coyoteTimer > 0) && this.jumpCooldownTimer <= 0 && !this.mantle.active;
    if (this.jumpBufferTimer > 0 && canJump) {
      if (isSprinting) {
        this.stamina = Math.max(0, this.stamina - 12.0);
        if (this.stamina <= 0.0) {
          this.exhausted = true;
        }
      }
      const jumpImpulse = effectiveJumpV;
      this.vel.y = jumpImpulse - effectiveGravity * dt * 0.5;
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
      this.vel.y -= effectiveGravity * dt;
    }

    // 10. 3 Sub-steps per frame: Swept capsule pushout & vertical resolution
    const subSteps = 3;
    const subDt = dt / subSteps;
    let assistedThisFrame = false;

    for (let s = 0; s < subSteps; s++) {
      // 10a. Horizontal Movement on X with swept wall/step limit detection (only when on ground, Bug 1C)
      let newX = this.pos.x + this.vel.x * subDt;
      if (this.onGround && !this.wet) {
        const destGroundYX = this.sampleGroundHeight(newX, this.pos.z, ground, colliders);
        const stepDiffX = destGroundYX - this.pos.y;
        if (stepDiffX > 0.48) {
          newX = this.pos.x;
          this.vel.x = 0;
        }
      }

      // 10b. Horizontal Movement on Z with swept wall/step limit detection (only when on ground, Bug 1C)
      let newZ = this.pos.z + this.vel.z * subDt;
      if (this.onGround && !this.wet) {
        const destGroundYZ = this.sampleGroundHeight(newX, newZ, ground, colliders);
        const stepDiffZ = destGroundYZ - this.pos.y;
        if (stepDiffZ > 0.48) {
          newZ = this.pos.z;
          this.vel.z = 0;
        }
      }

      // Auto-step-up: automatically step up ledges/stairs <= STEP_LIMIT when moving into the step
      const isMovingHoriz = inputLen > 0.05;
      if (isMovingHoriz && (this.onGround || this.wet)) {
        const probeDist = PlayerMotor.RADIUS + 0.06;
        const probeX = newX + worldWishX * (probeDist / (targetSpeed || 1));
        const probeZ = newZ + worldWishZ * (probeDist / (targetSpeed || 1));
        const stepAheadY = this.sampleGroundHeight(probeX, probeZ, ground, colliders, true);
        const stepDiffAhead = stepAheadY - this.pos.y;
        if (stepDiffAhead > 0.02 && stepDiffAhead <= PlayerMotor.STEP_LIMIT) {
          let headroomBlocked = false;
          const targetHeadY = stepAheadY + currentHeight;
          for (let i = 0; i < this.colliderCandidates.length; i++) {
            const col = this.colliderCandidates[i]!;
            if (col.type === 'box') {
              if (newX >= col.min.x && newX <= col.max.x && newZ >= col.min.z && newZ <= col.max.z) {
                if (targetHeadY > col.min.y && stepAheadY < col.min.y) {
                  headroomBlocked = true;
                  break;
                }
              }
            }
          }
          if (!headroomBlocked) {
            this.pos.y = stepAheadY;
            this.vel.y = 0;
            this.onGround = true;
          }
        }
      } else {
        const stepGroundY = this.sampleGroundHeight(newX, newZ, ground, colliders, false);
        const stepDiff = stepGroundY - this.pos.y;
        if (stepDiff > 0.02 && stepDiff <= 0.04 && (this.onGround || this.wet)) {
          this.pos.y = stepGroundY;
          this.vel.y = 0;
          this.onGround = true;
        }
      }

      // 10c. Pushout vs Box & Cylinder Colliders (Pillars, walls, arch jambs, platform boundaries)
      colliders.queryCircle(newX, newZ, PlayerMotor.RADIUS + 1.0, this.colliderCandidates);
      let blockedX = false;
      let blockedZ = false;
      let totalNormX = 0;
      let totalNormZ = 0;
      let contactCount = 0;

      for (let iter = 0; iter < 4; iter++) {
        const pushed = colliders.resolveCirclePushout(
          newX,
          newZ,
          PlayerMotor.RADIUS,
          this.pos.y,
          currentHeight,
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
            totalNormX += nx;
            totalNormZ += nz;
            contactCount++;

            if (Math.abs(nx) > 0.35) blockedX = true;
            if (Math.abs(nz) > 0.35) blockedZ = true;

            // Resolve horizontal (X and Z) collisions using smooth wall-sliding
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

      // Unstuck safety check: if horizontal movement is blocked on both X and Z simultaneously,
      // push the player capsule outward along the sum of contact normals by 0.04m so the player can never get wedged
      // between two platform/wall AABBs.
      if (blockedX && blockedZ && contactCount >= 2) {
        const normDist = dHypot(totalNormX, totalNormZ);
        if (normDist > 1e-4) {
          newX += (totalNormX / normDist) * 0.04;
          newZ += (totalNormZ / normDist) * 0.04;
        } else {
          newZ += 0.04;
        }
      }

      // Flow drift while wading
      if (this.wet && flowField) {
        const drift = flowField.computeWadeDrift(this.pos, subDt);
        newX += drift.dx;
        newZ += drift.dz;
      }

      // Clamp inside map bounds
      newX = Math.max(ground.bounds.minX + PlayerMotor.RADIUS, Math.min(ground.bounds.maxX - PlayerMotor.RADIUS, newX));
      newZ = Math.max(ground.bounds.minZ + PlayerMotor.RADIUS, Math.min(ground.bounds.maxZ - PlayerMotor.RADIUS, newZ));

      this.pos.x = newX;
      this.pos.z = newZ;

      // 10d. Smooth Spring Ledge-Climb Assist (water -> dry platform lip)
      const needsLedgeAssist = this.wet || this.pos.y < waterY;
      const horizIntent = dHypot(intent.moveX, intent.moveZ);
      if (needsLedgeAssist && (horizIntent > 0.1 || intent.jump) && this.vel.y >= -1.5) {
        const sinY = dSin(this.yaw);
        const cosY = dCos(this.yaw);
        const moveDirX = intent.moveX * cosY - intent.moveZ * sinY;
        const moveDirZ = intent.moveX * sinY + intent.moveZ * cosY;
        const moveLen = dHypot(moveDirX, moveDirZ);
        const fX = moveLen > 1e-4 ? moveDirX / moveLen : sinY;
        const fZ = moveLen > 1e-4 ? moveDirZ / moveLen : -cosY;

        const probeDistances = [PlayerMotor.RADIUS + 0.35, 0.75, 1.05, 1.2];
        for (let pIdx = 0; pIdx < probeDistances.length; pIdx++) {
          const probeDist = probeDistances[pIdx]!;
          const probeX = this.pos.x + fX * probeDist;
          const probeZ = this.pos.z + fZ * probeDist;
          const probeGroundY = this.sampleGroundHeight(probeX, probeZ, ground, colliders);
          if (probeGroundY >= 0.25 && probeGroundY <= 0.65) {
            const distToTop = probeGroundY - this.pos.y;
            // Immediate step-up assist when feet are already within 0.18m of platform top (Prompt 5B test)
            if (distToTop <= 0.18 && distToTop > 0) {
              const stepInside = PlayerMotor.RADIUS + 0.15;
              this.pos.x = probeX + fX * stepInside;
              this.pos.z = probeZ + fZ * stepInside;
              this.pos.y = probeGroundY;
              this.vel.x = 0;
              this.vel.y = 0;
              this.vel.z = 0;
              this.onGround = true;
              this.wet = false;
              this.waterFallActive = false;
              this.waterFallTimer = 0;
              if (!assistedThisFrame) {
                assistedThisFrame = true;
                events.pushNoise(`noise_automantle_${simTime}`, 'mantle', this.pos.x, this.pos.y, this.pos.z, 0.25, this.playerId, simTime);
              }
              break;
            }
          }
        }
      }

      // 11. Vertical Position Update & Ground/Ceiling Snapping
      let newY = this.pos.y + this.vel.y * subDt;
      const finalGroundY = this.sampleGroundHeight(this.pos.x, this.pos.z, ground, colliders, inputLen > 0.05);

      // Low tunnel / obstacle ceiling collision (y >= 0.8m to 16.0m)
      const headY = newY + currentHeight;
      for (let i = 0; i < this.colliderCandidates.length; i++) {
        const col = this.colliderCandidates[i]!;
        if (col.type === 'box' && col.min.y >= 0.8 && col.min.y <= 16.0) {
          if (this.pos.x >= col.min.x && this.pos.x <= col.max.x && this.pos.z >= col.min.z && this.pos.z <= col.max.z) {
            if (headY > col.min.y && this.pos.y < col.min.y) {
              newY = Math.max(finalGroundY, col.min.y - currentHeight);
              if (this.vel.y > 0) this.vel.y = 0;
            }
          }
        }
      }

      if (newY <= finalGroundY + 1e-4) {
        if ((!wasOnGround || !this.onGround) && this.vel.y < 0) {
          this.lastLandingSpeed = Math.abs(this.vel.y);
          this.lastLandingImpactSpeed = this.lastLandingSpeed;
        }
        newY = finalGroundY;
        this.vel.y = 0;
        this.onGround = true;
      } else {
        // Airborne ground landing snap
        if (newY - finalGroundY < 0.10 && this.vel.y <= 0) {
          if ((!wasOnGround || !this.onGround) && this.vel.y < 0) {
            this.lastLandingSpeed = Math.abs(this.vel.y);
            this.lastLandingImpactSpeed = this.lastLandingSpeed;
          }
          newY = finalGroundY;
          this.vel.y = 0;
          this.onGround = true;
        } else {
          this.onGround = false;
        }
      }

      this.pos.y = newY;
    }

    if (!this.wasOnGround && this.onGround) {
      const landingImpact = this.lastLandingSpeed > 0 ? this.lastLandingSpeed : Math.abs(this.vel.y);
      const perch = perchSystem ? perchSystem.findSurfaceAt(this.pos.x, this.pos.z, this.pos.y, 0.0) : null;
      if (perch && perch.isPerch) {
        const isHard = landingImpact >= 2.5;
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
        events.pushFootfall(this.playerId, this.pos.x, this.pos.y, this.pos.z, Math.min(1.0, landingImpact / 5.0), this.wet, simTime);
      }
    }
    this.wasOnGround = this.onGround;

    // 12. Acoustic Noise Emission on Stride Cadence
    this.handleNoiseEmission(dt, inputLen, isSprinting, intent.crouch, events, simTime, waterY);
  }

  private sampleGroundHeight(x: number, z: number, ground: GroundGrid, colliders?: ColliderSet, allowCross = true): number {
    const c = ground.heightAt(x, z);
    let maxH = c;

    if (allowCross) {
      const r = 0.08;
      const n = ground.heightAt(x, z - r);
      const s = ground.heightAt(x, z + r);
      const e = ground.heightAt(x + r, z);
      const w = ground.heightAt(x - r, z);

      if (Number.isFinite(n) && n > maxH) maxH = n;
      if (Number.isFinite(s) && s > maxH) maxH = s;
      if (Number.isFinite(e) && e > maxH) maxH = e;
      if (Number.isFinite(w) && w > maxH) maxH = w;
    }

    if (colliders) {
      const r = allowCross ? 0.08 : 0.01;
      colliders.queryCircle(x, z, r + 0.05, this.colliderCandidates);
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
    const sampleDistances = [0.6, 0.85, 1.15, 0.45];
    const angles = [0, 0.35, -0.35];

    for (const ang of angles) {
      const curYaw = this.yaw + ang;
      const fwdX = dSin(curYaw);
      const fwdZ = -dCos(curYaw);

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

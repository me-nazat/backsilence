/* ── PlayerCamera.ts ────────────────────────────────────────────────────────
 *  First-person camera controller with smooth eye-height lerp, distance-based
 *  head-bob, critically damped spring landing dips (80-120ms recovery), 40ms jump
 *  anticipation dip, near-miss monster rumble (<4m), and sprint/mantle breathing FOV.
 * ──────────────────────────────────────────────────────────────────────── */

import { PerspectiveCamera, Vector3, Euler, MathUtils } from 'three';
import { PlayerMotor, type PlayerSnapshot } from '../../sim/PlayerMotor.js';
import { WORLD } from '../../app/Config.js';
import type { Settings } from '../../types/contracts.js';

const _interpPos = new Vector3();
const _euler = new Euler(0, 0, 0, 'YXZ');

export class PlayerCamera {
  readonly camera: PerspectiveCamera;
  private settings: Settings;

  // Smoothed vertical camera state
  private smoothedFootY = 0.38;
  private landingDipY = 0;
  private landingDipVel = 0;
  private wasOnGround = true;

  // Eye height smoothing
  private currentEyeHeight: number = WORLD.PLAYER.EYE_STAND;

  // Head bob and tilt state
  private bobPhase = 0;
  private idlePhase = 0;
  private bobOffsetX = 0;
  private bobOffsetY = 0;
  private currentTilt = 0;

  // 40ms jump anticipation dip
  private jumpAnticipationTimer = 0;
  private prevVelY = 0;

  // FOV transition
  private baseFov: number;
  private currentFov: number;

  constructor(camera: PerspectiveCamera, settings: Settings) {
    this.camera = camera;
    this.settings = settings;
    this.baseFov = settings.graphics.fov;
    this.currentFov = this.baseFov;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.baseFov = settings.graphics.fov;
  }

  reset(spawnY = 0.38): void {
    this.smoothedFootY = spawnY;
    this.landingDipY = 0;
    this.landingDipVel = 0;
    this.wasOnGround = true;
    this.currentEyeHeight = WORLD.PLAYER.EYE_STAND;
    this.bobOffsetX = 0;
    this.bobOffsetY = 0;
    this.currentTilt = 0;
    this.bobPhase = 0;
    this.idlePhase = 0;
    this.jumpAnticipationTimer = 0;
    this.prevVelY = 0;
  }

  update(
    dt: number,
    prevSnapshot: PlayerSnapshot,
    currSnapshot: PlayerSnapshot,
    renderAlpha: number,
    nearestMonsterDist?: number,
    waterY?: number,
  ): void {
    const reducedMotion = this.settings.accessibility.reducedMotion;
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isReduced = reducedMotion === 'on' || (reducedMotion === 'system' && prefersReduced);
    const enableBob = this.settings.graphics.headBob && !isReduced;

    // 1. Interpolate position between physics ticks (reconcile sim tick with render frames)
    _interpPos.set(
      MathUtils.lerp(prevSnapshot.pos.x, currSnapshot.pos.x, renderAlpha),
      MathUtils.lerp(prevSnapshot.pos.y, currSnapshot.pos.y, renderAlpha),
      MathUtils.lerp(prevSnapshot.pos.z, currSnapshot.pos.z, renderAlpha),
    );
    const rawPosY = _interpPos.y;

    // 2. Smoothly track footY using exponential damping so steps/ledges transition over ~80ms without snapping
    if (Math.abs(this.smoothedFootY - rawPosY) > 4.0) {
      this.smoothedFootY = rawPosY;
    } else {
      this.smoothedFootY = MathUtils.damp(this.smoothedFootY, rawPosY, 22.0, dt);
    }

    // 3. Smooth Eye Height (1.65m stand -> 0.95m crouch)
    const targetEyeY = MathUtils.lerp(
      WORLD.PLAYER.EYE_STAND,
      WORLD.PLAYER.EYE_CROUCH,
      currSnapshot.crouchT,
    );
    this.currentEyeHeight = MathUtils.damp(this.currentEyeHeight, targetEyeY, 12.0, dt);

    // 4. 40ms jump anticipation dip
    if (this.wasOnGround && !currSnapshot.onGround && currSnapshot.vel.y > 1.0 && this.prevVelY <= 0.2) {
      this.jumpAnticipationTimer = 0.040; // 40ms anticipation dip
    }
    this.prevVelY = currSnapshot.vel.y;

    let jumpDip = 0;
    if (this.jumpAnticipationTimer > 0) {
      this.jumpAnticipationTimer -= dt;
      jumpDip = -0.024 * Math.sin(Math.max(0, this.jumpAnticipationTimer / 0.040) * Math.PI);
    }

    // 5. Landing dip: critically damped spring with clean impulse based on landing impact
    if (!this.wasOnGround && currSnapshot.onGround) {
      const impactSpeed = (currSnapshot.lastLandingImpactSpeed !== undefined && currSnapshot.lastLandingImpactSpeed > 0)
        ? currSnapshot.lastLandingImpactSpeed
        : (currSnapshot.lastLandingSpeed ?? (Math.abs(prevSnapshot.vel.y) > 0.5 ? Math.abs(prevSnapshot.vel.y) : 2.0));
      this.landingDipVel -= Math.min(2.8, impactSpeed * 0.45);
    }
    this.wasOnGround = currSnapshot.onGround;

    // Critically damped spring (dry land: k=360, c=38 -> 80-120ms recovery; water: k=140, c=18 -> smooth 0.35s dip)
    const k = currSnapshot.wet ? 140.0 : 360.0;
    const c = currSnapshot.wet ? 18.0 : 38.0;
    const springForce = -k * this.landingDipY - c * this.landingDipVel;
    this.landingDipVel += springForce * dt;
    this.landingDipY += this.landingDipVel * dt;
    this.landingDipY = MathUtils.clamp(this.landingDipY, -0.28, 0.08);

    // 6. Head-bob and strafe tilt based on horizontal movement
    const horizSpeed = Math.hypot(currSnapshot.vel.x, currSnapshot.vel.z);

    if (enableBob && currSnapshot.onGround && horizSpeed >= 0.15) {
      const isSprinting = horizSpeed > PlayerMotor.SPEED_WALK + 0.5;
      const isCrouching = currSnapshot.crouchT > 0.5;

      const strideFreq = currSnapshot.wet ? 4.6 : 8.0; // Wading adds slower, heavier sway
      this.bobPhase += dt * strideFreq * (horizSpeed / PlayerMotor.SPEED_WALK);

      let ampY = 0.028; // walking
      if (isSprinting) ampY = 0.048; // sprinting
      else if (isCrouching) ampY = 0.015;

      const targetBobY = Math.sin(this.bobPhase * 2.0) * ampY;
      const targetBobX = Math.cos(this.bobPhase) * (ampY * 0.5);

      // Subtle strafe roll (max +-1.2 deg = +-0.0209 rad)
      const maxRoll = 1.2 * (Math.PI / 180);
      const targetRoll = Math.sin(this.bobPhase) * (currSnapshot.wet ? maxRoll : maxRoll * 0.7);

      this.bobOffsetY = MathUtils.damp(this.bobOffsetY, targetBobY, 18.0, dt);
      this.bobOffsetX = MathUtils.damp(this.bobOffsetX, targetBobX, 18.0, dt);
      this.currentTilt = MathUtils.damp(this.currentTilt, targetRoll, 18.0, dt);
    } else {
      // Rock-steady when standing still, aiming, or airborne
      this.bobOffsetX = MathUtils.damp(this.bobOffsetX, 0, 12.0, dt);
      this.bobOffsetY = MathUtils.damp(this.bobOffsetY, 0, 12.0, dt);
      this.currentTilt = MathUtils.damp(this.currentTilt, 0, 12.0, dt);
    }

    // 7. Subtle idle breathing sway (+-0.004m at 0.25Hz)
    this.idlePhase += dt * (0.25 * Math.PI * 2.0);
    const idleSway = enableBob ? Math.sin(this.idlePhase) * 0.004 : 0;

    // 8. Near-miss shake: when monster passes within 4m, high-frequency, low-amplitude rumble
    let shakeX = 0;
    let shakeY = 0;
    if (nearestMonsterDist !== undefined && nearestMonsterDist < 4.0 && !reducedMotion) {
      const intensity = 1.0 - nearestMonsterDist / 4.0; // 0..1
      const now = performance.now() * 0.001;
      shakeY = Math.sin(now * 38.0) * 0.006 * intensity;
      shakeX = Math.cos(now * 44.0) * 0.005 * intensity;
    }

    // 9. Camera Position composition
    let camY = this.smoothedFootY + this.currentEyeHeight + this.bobOffsetY + this.landingDipY + idleSway + jumpDip + shakeY;

    // Normal wading / jumping: camera NEVER clips through the water plane (waterY) or triggers false underwater state
    if (waterY !== undefined && (currSnapshot.depth === undefined || currSnapshot.depth <= 1.55)) {
      camY = Math.max(camY, waterY + 0.28);
    }

    this.camera.position.set(
      _interpPos.x + this.bobOffsetX + shakeX,
      camY,
      _interpPos.z,
    );

    // 10. Orientation: shortest-arc angle lerp eliminates 360-degree camera whip on yaw wrap
    const pitch = MathUtils.clamp(
      MathUtils.lerp(prevSnapshot.pitch, currSnapshot.pitch, renderAlpha),
      -1.4835,
      1.4835,
    );

    const deltaYaw = Math.atan2(
      Math.sin(currSnapshot.yaw - prevSnapshot.yaw),
      Math.cos(currSnapshot.yaw - prevSnapshot.yaw),
    );
    const yaw = prevSnapshot.yaw + deltaYaw * renderAlpha;

    const roll = enableBob ? this.currentTilt : 0;

    _euler.set(pitch, yaw, roll, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    // 11. Sprint FOV Kick (+4.5 deg) & Mantle / Exhaustion Breathing FOV
    const agitationBreath = currSnapshot.exhausted ? Math.sin(this.idlePhase * 3.0) * 1.5 : 0;
    const isSprinting = horizSpeed > PlayerMotor.SPEED_WALK + 0.5 && !currSnapshot.exhausted;
    const targetFov =
      (isSprinting ? this.baseFov + 4.5 : this.baseFov) + agitationBreath;

    // Hor+ FOV adaptation: if aspect < 1.0 (portrait / mobile view), scale vertical FOV so horizontal FOV does not collapse
    let adaptedTargetFov = targetFov;
    if (this.camera.aspect > 0 && this.camera.aspect < 1.0) {
      // Ensure horizontal FOV is at least the base FOV (default 75 deg)
      const radBase = (targetFov * Math.PI) / 180;
      const targetHalfH = Math.tan(radBase / 2);
      const adaptedRadV = 2.0 * Math.atan(targetHalfH / this.camera.aspect);
      adaptedTargetFov = Math.min(125.0, (adaptedRadV * 180) / Math.PI);
    }

    this.currentFov += (adaptedTargetFov - this.currentFov) * Math.min(1.0, dt * 8.0);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }

  getBobPhase(): number {
    return this.bobPhase;
  }

  getLandingDip(): number {
    return this.landingDipY;
  }

  getSmoothedFootY(): number {
    return this.smoothedFootY;
  }
}

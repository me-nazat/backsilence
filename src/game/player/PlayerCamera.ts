/* ── PlayerCamera.ts ────────────────────────────────────────────────────────
 *  First-person camera controller with smooth eye-height lerp, distance-based
 *  head-bob, critically damped spring landing dips (80-120ms recovery), 40ms jump
 *  anticipation dip, near-miss monster rumble (<4m), and sprint/mantle breathing FOV.
 * ──────────────────────────────────────────────────────────────────────── */

import { PerspectiveCamera, Vector3, Euler, MathUtils } from 'three';
import type { PlayerSnapshot } from '../../sim/PlayerMotor.js';
import { WORLD } from '../../app/Config.js';
import type { Settings } from '../../types/contracts.js';

const _interpPos = new Vector3();
const _euler = new Euler(0, 0, 0, 'YXZ');

export class PlayerCamera {
  readonly camera: PerspectiveCamera;
  private settings: Settings;

  // Eye height smoothing
  private currentEyeY = WORLD.PLAYER.EYE_STAND;

  // Head bob state
  private bobPhase = 0;
  private idlePhase = 0;

  // Landing dip critically damped spring (80-120ms recovery)
  private dipOffset = 0;
  private dipVelocity = 0;
  private wasOnGround = true;

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

  update(
    dt: number,
    prevSnapshot: PlayerSnapshot,
    currSnapshot: PlayerSnapshot,
    renderAlpha: number,
    nearestMonsterDist?: number,
  ): void {
    const reducedMotion = this.settings.accessibility.reducedMotion;
    const enableBob = this.settings.graphics.headBob && !reducedMotion;

    // 1. Interpolate position between physics ticks (reconcile sim tick with render frames)
    _interpPos.set(
      MathUtils.lerp(prevSnapshot.pos.x, currSnapshot.pos.x, renderAlpha),
      MathUtils.lerp(prevSnapshot.pos.y, currSnapshot.pos.y, renderAlpha),
      MathUtils.lerp(prevSnapshot.pos.z, currSnapshot.pos.z, renderAlpha),
    );

    // 2. Smooth Eye Height (1.65m stand -> 0.95m crouch)
    const targetEyeY = MathUtils.lerp(
      WORLD.PLAYER.EYE_STAND,
      WORLD.PLAYER.EYE_CROUCH,
      currSnapshot.crouchT,
    );
    this.currentEyeY += (targetEyeY - this.currentEyeY) * Math.min(1.0, dt * 12.0);

    // 3. 40ms jump anticipation dip
    if (this.wasOnGround && !currSnapshot.onGround && currSnapshot.vel.y > 1.0 && this.prevVelY <= 0.2) {
      this.jumpAnticipationTimer = 0.040; // 40ms anticipation dip
    }
    this.prevVelY = currSnapshot.vel.y;

    let jumpDip = 0;
    if (this.jumpAnticipationTimer > 0) {
      this.jumpAnticipationTimer -= dt;
      jumpDip = -0.024 * Math.sin(Math.max(0, this.jumpAnticipationTimer / 0.040) * Math.PI);
    }

    // 4. Landing dip: critically damped spring with 80 to 120 ms recovery
    if (!this.wasOnGround && currSnapshot.onGround) {
      const impactSpeed = Math.abs(prevSnapshot.vel.y);
      if (impactSpeed > 1.2) {
        // Depth proportional to fall velocity
        this.dipVelocity = -Math.min(0.35, impactSpeed * 0.045);
      }
    }
    this.wasOnGround = currSnapshot.onGround;

    // Critically damped spring (omega_n = 19 rad/s -> ~100ms recovery, c = 2*omega_n = 38)
    const k = 360.0;
    const c = 38.0;
    const springForce = -k * this.dipOffset - c * this.dipVelocity;
    this.dipVelocity += springForce * dt;
    this.dipOffset += this.dipVelocity * dt;

    // 5. Head-bob based on horizontal movement
    const horizSpeed = Math.hypot(currSnapshot.vel.x, currSnapshot.vel.z);
    let bobVertical = 0;
    let bobLateral = 0;

    if (enableBob && currSnapshot.onGround && horizSpeed > 0.2) {
      const isSprinting = horizSpeed > WORLD.PLAYER.WALK + 0.5;
      const isCrouching = currSnapshot.crouchT > 0.5;

      const strideFreq = currSnapshot.wet ? 5.5 : 8.0; // Wading adds slower, heavier sway
      this.bobPhase += dt * strideFreq * (horizSpeed / WORLD.PLAYER.WALK);

      let ampY = 0.035; // walking
      if (isSprinting) ampY = 0.06;
      else if (isCrouching) ampY = 0.015;

      if (currSnapshot.wet) ampY *= 1.25;

      bobVertical = Math.sin(this.bobPhase * 2.0) * ampY;
      bobLateral = Math.cos(this.bobPhase) * (ampY * 0.5);
    }

    // 6. Subtle idle breathing sway (+-0.004m at 0.25Hz)
    this.idlePhase += dt * (0.25 * Math.PI * 2.0);
    const idleSway = enableBob ? Math.sin(this.idlePhase) * 0.004 : 0;

    // 7. Near-miss shake: when monster passes within 4m, high-frequency, low-amplitude rumble
    let shakeX = 0;
    let shakeY = 0;
    if (nearestMonsterDist !== undefined && nearestMonsterDist < 4.0 && !reducedMotion) {
      const intensity = 1.0 - nearestMonsterDist / 4.0; // 0..1
      const now = performance.now() * 0.001;
      shakeY = Math.sin(now * 38.0) * 0.006 * intensity;
      shakeX = Math.cos(now * 44.0) * 0.005 * intensity;
    }

    // 8. Camera Position composition
    this.camera.position.set(
      _interpPos.x + bobLateral + shakeX,
      _interpPos.y + this.currentEyeY + bobVertical + idleSway + this.dipOffset + jumpDip + shakeY,
      _interpPos.z,
    );

    // 9. Orientation (Yaw & Pitch clamped to +-85 deg = +-1.4835 rad, plus subtle wading roll)
    const pitch = MathUtils.clamp(
      MathUtils.lerp(prevSnapshot.pitch, currSnapshot.pitch, renderAlpha),
      -1.4835,
      1.4835,
    );
    const yaw = MathUtils.lerp(prevSnapshot.yaw, currSnapshot.yaw, renderAlpha);
    const roll = enableBob && currSnapshot.wet ? Math.sin(this.bobPhase) * 0.018 : 0;

    _euler.set(pitch, yaw, roll, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    // 10. Sprint FOV Kick (+6 deg) & Mantle / Exhaustion Breathing FOV
    const agitationBreath = currSnapshot.exhausted ? Math.sin(this.idlePhase * 3.0) * 1.5 : 0;
    const isSprinting = horizSpeed > WORLD.PLAYER.WALK + 0.5 && !currSnapshot.exhausted;
    const targetFov =
      (isSprinting ? this.baseFov + 6.0 : this.baseFov) + agitationBreath;

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
    return this.dipOffset;
  }
}

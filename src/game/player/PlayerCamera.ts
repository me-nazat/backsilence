/* ── PlayerCamera.ts ────────────────────────────────────────────────────────
 *  First-person camera controller with smooth eye-height lerp, distance-based
 *  head-bob, damped spring landing dips, sprint FOV kick, and idle sway.
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

  // Landing dip damped spring
  private dipOffset = 0;
  private dipVelocity = 0;
  private wasOnGround = true;

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
  ): void {
    const reducedMotion = this.settings.accessibility.reducedMotion;
    const enableBob = this.settings.graphics.headBob && !reducedMotion;

    // 1. Interpolate position between physics ticks
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

    // 3. Landing dip detection & spring simulation
    if (!this.wasOnGround && currSnapshot.onGround) {
      // Impact velocity proportional to fall speed
      const impactSpeed = Math.abs(prevSnapshot.vel.y);
      if (impactSpeed > 1.5) {
        this.dipVelocity = -Math.min(0.25, impactSpeed * 0.035);
      }
    }
    this.wasOnGround = currSnapshot.onGround;

    // Spring physics: F = -k*x - c*v
    const k = 160.0;
    const c = 18.0;
    const springForce = -k * this.dipOffset - c * this.dipVelocity;
    this.dipVelocity += springForce * dt;
    this.dipOffset += this.dipVelocity * dt;

    // 4. Head-bob based on horizontal movement
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

    // 5. Subtle idle breathing sway (+-0.004m at 0.25Hz)
    this.idlePhase += dt * (0.25 * Math.PI * 2.0);
    const idleSway = enableBob ? Math.sin(this.idlePhase) * 0.004 : 0;

    // 6. Camera Position composition
    this.camera.position.set(
      _interpPos.x + bobLateral,
      _interpPos.y + this.currentEyeY + bobVertical + idleSway + this.dipOffset,
      _interpPos.z,
    );

    // 7. Orientation (Yaw & Pitch clamped to +-85 deg = +-1.4835 rad)
    const pitch = MathUtils.clamp(
      MathUtils.lerp(prevSnapshot.pitch, currSnapshot.pitch, renderAlpha),
      -1.4835,
      1.4835,
    );
    const yaw = MathUtils.lerp(prevSnapshot.yaw, currSnapshot.yaw, renderAlpha);

    _euler.set(pitch, yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    // 8. Sprint FOV Kick (+6 deg)
    const targetFov =
      horizSpeed > WORLD.PLAYER.WALK + 0.5 && !currSnapshot.exhausted
        ? this.baseFov + 6.0
        : this.baseFov;

    this.currentFov += (targetFov - this.currentFov) * Math.min(1.0, dt * 8.0);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }

  getBobPhase(): number {
    return this.bobPhase;
  }
}

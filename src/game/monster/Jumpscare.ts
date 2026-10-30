/* ── Jumpscare.ts ──────────────────────────────────────────────────────────
 *  Dynamic 3D cinematic jumpscare sequence and death transition.
 *  - Stage 1 (0.00s – 0.18s, Snap & Unhinge): Camera whip to 0.85m face distance,
 *    attaches high-intensity flickering cold-white/crimson PointLight (intensity 3.5, distance 4.0m).
 *  - Stage 2 (0.18s – 0.50s, Talon Grapple & Maw Lunge): Hand claws raking across frustum,
 *    jaw unhinges to 1.15 rad (65 deg), FOV punch (75 -> 52 -> 88 deg), roll, and glitch spike.
 *  - Stage 3 (0.50s – 0.85s, Bite Impact & Blackout): Visceral jaws snapping shut, crimson flash,
 *    and transition to DeathScreen.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Vector3,
  Quaternion,
  Euler,
  PointLight,
  type PerspectiveCamera,
} from 'three';
import type { AudioEngine } from '../../audio/AudioEngine.js';
import { safeExitPointerLock } from '../../engine/input/PointerLock.js';
import type { MonsterJoints } from './MonsterMesh.js';

export interface JumpscareStats {
  timeSurvived: number;
  noisesMade: number;
  closestCall: number;
  cause?: string;
  soundRadius?: number;
}

export interface JumpscareCallbacks {
  onFreezeInput: () => void;
  setTimeScale: (scale: number) => void;
  onPostFXGlitch?: (amount: number) => void; // BATCH-4
  onDeath: (stats: JumpscareStats) => void;
}

const _camStartPos = new Vector3();
const _camStartQuat = new Quaternion();
const _targetPos = new Vector3();
const _targetLook = new Vector3();
const _targetQuat = new Quaternion();
const _headForward = new Vector3();
const _shakeOffset = new Vector3();
const _euler = new Euler();

export class JumpscareSequence {
  private active = false;
  private timer = 0;
  private duration = 0.85;
  private initialFov = 72;
  private overlayEl: HTMLElement | null = null;
  private stats: JumpscareStats = { timeSurvived: 0, noisesMade: 0, closestCall: 0 };
  private callbacks: JumpscareCallbacks;
  private audio?: AudioEngine | undefined;
  private camera: PerspectiveCamera | null = null;
  private reducedMotion = false;
  private jumpscareLight: PointLight | null = null;
  private joints?: MonsterJoints | undefined;

  constructor(callbacks: JumpscareCallbacks, audio?: AudioEngine) {
    this.callbacks = callbacks;
    this.audio = audio;
    this.createOverlay();
  }

  private createOverlay(): void {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'jumpscare-overlay';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 550;
      opacity: 0;
      transition: opacity 0.05s linear;
      background: radial-gradient(circle, rgba(255, 0, 0, 0.4) 0%, rgba(180, 0, 0, 0.8) 70%, rgba(10, 0, 0, 0.95) 100%);
    `;
    document.body.appendChild(el);
    this.overlayEl = el;
  }

  trigger(
    camera: PerspectiveCamera,
    headPos: Vector3,
    monsterYaw: number,
    stats: JumpscareStats,
    reducedMotion = false,
    monsterJoints?: MonsterJoints,
  ): void {
    if (this.active) return;
    this.active = true;
    this.timer = 0;
    this.camera = camera;
    this.stats = stats;
    this.reducedMotion = reducedMotion;
    this.initialFov = camera.fov;
    this.joints = monsterJoints;

    // 1. Freeze player input & hit-stop (0.25x time-scale for 0.25s)
    this.callbacks.onFreezeInput();
    this.callbacks.setTimeScale(0.25);

    // 2. Play jumpscare stinger
    if (this.audio) {
      this.audio.play('jumpscare', { gain: 1.0 });
    }

    // 3. Haptic vibration if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 60, 300]);
      } catch {
        /* ignore */
      }
    }

    // 4. Cache camera starting transform
    _camStartPos.copy(camera.position);
    _camStartQuat.copy(camera.quaternion);

    // Compute target position 0.82m in front of monster face
    _headForward.set(Math.sin(monsterYaw), 0, -Math.cos(monsterYaw));
    _targetPos.copy(headPos).addScaledVector(_headForward, 0.82);
    _targetPos.y = headPos.y; // face centered at eye-level

    // Compute target rotation facing monster head
    _targetLook.copy(headPos).sub(_targetPos).normalize();
    camera.position.copy(_targetPos);
    camera.lookAt(headPos);
    _targetQuat.copy(camera.quaternion);

    // Restore starting camera position for smooth lerp
    camera.position.copy(_camStartPos);
    camera.quaternion.copy(_camStartQuat);

    // 5. Attach dedicated high-intensity flickering cold-white/crimson Key & Rim PointLight
    if (!this.jumpscareLight) {
      this.jumpscareLight = new PointLight(0xddeeff, 3.5, 4.0);
    }
    this.jumpscareLight.intensity = 3.5;
    this.jumpscareLight.position.set(headPos.x, headPos.y + 0.25, headPos.z);
    if (camera.parent) {
      camera.parent.add(this.jumpscareLight);
    }

    // Show initial red vignette flash
    if (this.overlayEl) {
      this.overlayEl.style.opacity = '0.9';
    }
  }

  update(dt: number): boolean {
    if (!this.active || !this.camera) return false;

    this.timer += dt;
    const t = this.timer;

    // Hit stop restore after 0.25s
    if (t >= 0.25 && t - dt < 0.25) {
      this.callbacks.setTimeScale(1.0);
    }

    // -------------------------------------------------------------
    // Stage 1 (0.00s – 0.18s, Snap & Unhinge): Camera smooth look-at whip to 0.82m face distance
    // -------------------------------------------------------------
    const snapT = Math.min(1.0, t / 0.16);
    const easeOutSnap = 1.0 - Math.pow(1.0 - snapT, 3);

    this.camera.position.lerpVectors(_camStartPos, _targetPos, easeOutSnap);
    this.camera.quaternion.slerpQuaternions(_camStartQuat, _targetQuat, easeOutSnap);

    // Dynamic jumpscare key light
    if (this.jumpscareLight) {
      const flicker = Math.sin(t * 50.0) > 0;
      this.jumpscareLight.color.setHex(flicker ? 0xff2030 : 0xddeeff);
      this.jumpscareLight.intensity = 3.0 + Math.sin(t * 30.0) * 1.2;
    }

    // -------------------------------------------------------------
    // Stage 2 (0.18s – 0.50s, Talon Grapple & Maw Lunge):
    // Jaws unhinge to 1.15 rad (65 deg), FOV punch (75 -> 52 -> 88 deg), roll, and glitch spike
    // -------------------------------------------------------------
    if (t >= 0.18 && t < 0.50) {
      const stageT = (t - 0.18) / 0.32;

      // Dynamic FOV punch: snappier zoom-in to 52 deg, then lunging zoom-out to 88 deg
      if (!this.reducedMotion) {
        if (stageT < 0.45) {
          const punchIn = stageT / 0.45;
          this.camera.fov = this.initialFov - punchIn * (this.initialFov - 52);
        } else {
          const zoomOut = (stageT - 0.45) / 0.55;
          this.camera.fov = 52 + zoomOut * (88 - 52);
        }
        this.camera.updateProjectionMatrix();

        // 28Hz seeded noise shake & violent camera roll (Dutch angle)
        const freq = 28 * Math.PI * 2;
        const shakeAmp = 0.045 * (1.0 - stageT * 0.5);
        _shakeOffset.set(
          Math.sin(t * freq * 1.1) * shakeAmp,
          Math.cos(t * freq * 0.9) * shakeAmp,
          Math.sin(t * freq * 1.3) * shakeAmp * 0.5,
        );
        this.camera.position.add(_shakeOffset);

        const roll = Math.sin(t * 22.0) * 0.16 * (1.0 - stageT * 0.4);
        _euler.setFromQuaternion(this.camera.quaternion);
        _euler.z += roll;
        this.camera.quaternion.setFromEuler(_euler);
      }

      // Drive monster split jaw unhinging to 1.15 rad (65 deg)
      if (this.joints) {
        this.joints.jaw.rotation.x = Math.min(1.15, 0.75 + stageT * 0.40);
        // Hooked talons grapple across frustum edges
        this.joints.handL.position.z = -0.40 - stageT * 0.30;
        this.joints.handR.position.z = -0.40 - stageT * 0.30;
        this.joints.handL.rotation.x = -0.65;
        this.joints.handR.rotation.x = -0.65;
      }

      // Chromatic aberration / VHS tear spike via PostFX
      if (this.callbacks.onPostFXGlitch) {
        this.callbacks.onPostFXGlitch(1.0 - stageT * 0.25);
      }
    }

    // -------------------------------------------------------------
    // Stage 3 (0.50s – 0.85s, Bite Impact & Blackout):
    // Snap jaws shut across lens with visceral crimson flash before transition
    // -------------------------------------------------------------
    if (t >= 0.50) {
      if (this.joints) {
        // Snap jaws shut with bite impact
        this.joints.jaw.rotation.x = 0.04;
      }

      if (this.overlayEl) {
        if (this.reducedMotion) {
          const fadeT = Math.min(1.0, (t - 0.50) / 0.35);
          this.overlayEl.style.background = 'black';
          this.overlayEl.style.opacity = fadeT.toString();
        } else {
          if (t < 0.65) {
            // Visceral crimson flash
            this.overlayEl.style.background = 'radial-gradient(circle, rgba(255, 10, 10, 0.95) 0%, rgba(180, 0, 0, 0.98) 70%, rgba(20, 0, 0, 1.0) 100%)';
            this.overlayEl.style.opacity = '1.0';
          } else {
            // Cut to blackout
            const blackT = Math.min(1.0, (t - 0.65) / 0.20);
            this.overlayEl.style.background = 'black';
            this.overlayEl.style.opacity = blackT.toString();
          }
        }
      }
    } else if (t < 0.18 && this.overlayEl && !this.reducedMotion) {
      // Smooth dark crimson vignette surge (no 60Hz strobe)
      const surgeT = t / 0.18;
      this.overlayEl.style.background = 'radial-gradient(circle, rgba(140, 10, 10, 0.45) 0%, rgba(30, 2, 2, 0.85) 70%, rgba(5, 0, 0, 0.95) 100%)';
      this.overlayEl.style.opacity = (0.5 + surgeT * 0.4).toFixed(2);
    }

    // -------------------------------------------------------------
    // Complete sequence at 0.85s
    // -------------------------------------------------------------
    if (t >= this.duration) {
      this.cleanup();
      safeExitPointerLock();
      this.callbacks.onDeath(this.stats);
      return false;
    }

    return true;
  }

  private cleanup(): void {
    this.active = false;
    if (this.jumpscareLight?.parent) {
      this.jumpscareLight.parent.remove(this.jumpscareLight);
    }
    if (this.camera) {
      this.camera.fov = this.initialFov;
      this.camera.updateProjectionMatrix();
    }
    if (this.overlayEl) {
      this.overlayEl.style.opacity = '0';
    }
  }

  isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.cleanup();
    this.timer = 0;
  }

  dispose(): void {
    this.reset();
    if (this.jumpscareLight) {
      this.jumpscareLight.dispose();
      this.jumpscareLight = null;
    }
    if (this.overlayEl?.parentElement) {
      this.overlayEl.parentElement.removeChild(this.overlayEl);
    }
  }
}

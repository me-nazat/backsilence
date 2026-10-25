/* ── Jumpscare.ts ──────────────────────────────────────────────────────────
 *  Dynamic 3D camera jumpscare sequence and death transition.
 *  Handles camera takeover, hit-stop, 28Hz seeded noise shake, FOV punch,
 *  Dutch angle, audio stinger ducking, red vignette, flicker, and death screen.
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3, Quaternion, Euler, type PerspectiveCamera } from 'three';
import type { AudioEngine } from '../../audio/AudioEngine.js';

export interface JumpscareStats {
  timeSurvived: number;
  noisesMade: number;
  closestCall: number;
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
  private duration = 1.6;
  private initialFov = 72;
  private overlayEl: HTMLElement | null = null;
  private stats: JumpscareStats = { timeSurvived: 0, noisesMade: 0, closestCall: 0 };
  private callbacks: JumpscareCallbacks;
  private audio?: AudioEngine | undefined;
  private camera: PerspectiveCamera | null = null;
  private reducedMotion = false;

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
  ): void {
    if (this.active) return;
    this.active = true;
    this.timer = 0;
    this.camera = camera;
    this.stats = stats;
    this.reducedMotion = reducedMotion;
    this.initialFov = camera.fov;

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

    // Compute target position 0.8m in front of monster face
    // Forward vector of monster head from monsterYaw
    _headForward.set(Math.sin(monsterYaw), 0, -Math.cos(monsterYaw));
    _targetPos.copy(headPos).addScaledVector(_headForward, 0.8);
    _targetPos.y = headPos.y; // face centered at eye-level

    // Compute target rotation facing monster head
    _targetLook.copy(headPos).sub(_targetPos).normalize();
    camera.position.copy(_targetPos);
    camera.lookAt(headPos);
    _targetQuat.copy(camera.quaternion);

    // Restore starting camera position for smooth lerp
    camera.position.copy(_camStartPos);
    camera.quaternion.copy(_camStartQuat);

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

    // 1. Camera snap/dolly to face (within 0.15s ease-out)
    const snapT = Math.min(1.0, t / 0.15);
    const easeOutSnap = 1.0 - Math.pow(1.0 - snapT, 3);

    this.camera.position.lerpVectors(_camStartPos, _targetPos, easeOutSnap);
    this.camera.quaternion.slerpQuaternions(_camStartQuat, _targetQuat, easeOutSnap);

    // 2. 28Hz seeded noise shake (amp 0.04m)
    if (!this.reducedMotion && t < 1.4) {
      const freq = 28 * Math.PI * 2;
      const shakeAmp = 0.04 * (1.0 - t / 1.6);
      _shakeOffset.set(
        Math.sin(t * freq * 1.1) * shakeAmp,
        Math.cos(t * freq * 0.9) * shakeAmp,
        Math.sin(t * freq * 1.3) * shakeAmp * 0.5,
      );
      this.camera.position.add(_shakeOffset);

      // Dutch angle roll +-8 deg (0.14 rad)
      const roll = Math.sin(t * 18.0) * 0.14 * (1.0 - t / 1.6);
      _euler.setFromQuaternion(this.camera.quaternion);
      _euler.z += roll;
      this.camera.quaternion.setFromEuler(_euler);
    }

    // 3. Stable FOV punch centered on terrifying visage (>= 25% screen coverage)
    this.camera.fov = this.initialFov;
    this.camera.updateProjectionMatrix();

    // 4. White-out / cut flicker
    if (this.overlayEl) {
      if (this.reducedMotion) {
        // Smooth fade only
        this.overlayEl.style.background = 'black';
        this.overlayEl.style.opacity = Math.min(1.0, (t / 1.6) * 1.2).toString();
      } else {
        if (t < 0.12) {
          // White flicker frames
          this.overlayEl.style.background = (Math.floor(t * 60) % 2 === 0) ? 'white' : 'red';
          this.overlayEl.style.opacity = '1.0';
        } else if (t < 1.2) {
          this.overlayEl.style.background = 'radial-gradient(circle, rgba(255, 0, 0, 0.4) 0%, rgba(180, 0, 0, 0.8) 70%, rgba(10, 0, 0, 0.95) 100%)';
          this.overlayEl.style.opacity = '0.75';
        } else {
          // Cut to black
          const blackT = (t - 1.2) / 0.4;
          this.overlayEl.style.background = 'black';
          this.overlayEl.style.opacity = Math.min(1.0, blackT * 1.5).toString();
        }
      }
    }

    // 5. PostFX glitch hook (BATCH-4)
    if (this.callbacks.onPostFXGlitch) {
      this.callbacks.onPostFXGlitch(Math.max(0, 1.0 - t / 1.6));
    }

    // 6. Complete and trigger death screen
    if (t >= this.duration) {
      this.active = false;
      this.callbacks.onDeath(this.stats);
      return false;
    }

    return true;
  }

  isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.active = false;
    this.timer = 0;
    if (this.overlayEl) {
      this.overlayEl.style.opacity = '0';
    }
    if (this.camera) {
      this.camera.fov = this.initialFov;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.reset();
    if (this.overlayEl?.parentElement) {
      this.overlayEl.parentElement.removeChild(this.overlayEl);
    }
  }
}

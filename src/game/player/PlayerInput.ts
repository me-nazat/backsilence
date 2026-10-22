/* ── PlayerInput.ts ────────────────────────────────────────────────────────
 *  First-person player input aggregator.
 *  Combines keyboard, pointer-locked mouse look, and touch controls into
 *  a single deterministic PlayerIntent for the pure physics simulation.
 * ──────────────────────────────────────────────────────────────────────── */

import type { PlayerIntent } from '../../sim/PlayerMotor.js';
import type { Action, Settings } from '../../types/contracts.js';
import { TouchControls } from './TouchControls.js';

export interface PlayerInputCallbacks {
  onPauseRequested: () => void;
}

export class PlayerInput {
  private settings: Settings;
  private canvas: HTMLCanvasElement | null = null;
  private isLocked = false;
  private keysDown = new Set<string>();

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  private touchControls: TouchControls;
  private callbacks: PlayerInputCallbacks;
  private freezeInput = false;

  constructor(settings: Settings, callbacks: PlayerInputCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
    this.touchControls = new TouchControls();
    this.bindEvents();
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    if (this.touchControls.isActive()) {
      this.touchControls.mount(canvas.parentElement || document.body);
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (this.freezeInput) return;
      this.keysDown.add(e.code);

      // Escape or Pause binding triggers pause
      if (e.code === 'Escape' || e.code === this.settings.controls.bindings.pause) {
        this.callbacks.onPauseRequested();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isLocked && !this.freezeInput) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.isLocked;
      this.isLocked = document.pointerLockElement === this.canvas;

      // Losing pointer lock while playing triggers pause menu
      if (wasLocked && !this.isLocked && !this.freezeInput) {
        this.callbacks.onPauseRequested();
      }
    });

    // Auto-pause and clear keys on window blur or visibility loss
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.callbacks.onPauseRequested();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.keysDown.clear();
        this.callbacks.onPauseRequested();
      }
    });
  }

  requestPointerLock(): void {
    if (this.canvas && !this.isLocked) {
      void this.canvas.requestPointerLock();
    }
  }

  exitPointerLock(): void {
    if (this.isLocked && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  isPointerLocked(): boolean {
    return this.isLocked;
  }

  setFreeze(freeze: boolean): void {
    this.freezeInput = freeze;
    if (freeze) {
      this.keysDown.clear();
    }
  }

  pollIntent(): PlayerIntent {
    if (this.freezeInput) {
      return {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        crouch: false,
        jump: false,
        interact: false,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
      };
    }

    const bindings = this.settings.controls.bindings;
    const isDown = (act: Action) => {
      const code = bindings[act];
      return code ? this.keysDown.has(code) : false;
    };

    // Keyboard move vector
    let moveX = 0;
    let moveZ = 0;

    if (isDown('forward')) moveZ -= 1;
    if (isDown('back')) moveZ += 1;
    if (isDown('left')) moveX -= 1;
    if (isDown('right')) moveX += 1;

    let sprint = isDown('sprint');
    let crouch = isDown('crouch');
    let jump = isDown('jump');
    let interact = isDown('interact');

    // Mouse look deltas (in radians)
    const sens = this.settings.controls.sensitivity * 0.0022;
    const invertY = this.settings.controls.invertY;

    let lookDeltaYaw = this.mouseDeltaX * sens;
    let lookDeltaPitch = (invertY ? -this.mouseDeltaY : this.mouseDeltaY) * sens;

    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Merge Touch controls if active
    if (this.touchControls.isActive()) {
      const touchIntent = this.touchControls.consumeIntent(
        this.settings.controls.sensitivity,
        this.settings.controls.invertY,
      );

      if (touchIntent.pauseRequested) {
        this.callbacks.onPauseRequested();
      }

      if (Math.hypot(touchIntent.moveX, touchIntent.moveZ) > 0.05) {
        moveX = touchIntent.moveX;
        moveZ = touchIntent.moveZ;
        sprint = sprint || touchIntent.sprint;
      }
      crouch = crouch || touchIntent.crouch;
      jump = jump || touchIntent.jump;
      interact = interact || touchIntent.interact;

      lookDeltaYaw += touchIntent.lookDeltaYaw;
      lookDeltaPitch += touchIntent.lookDeltaPitch;
    }

    return {
      moveX,
      moveZ,
      sprint,
      crouch,
      jump,
      interact,
      lookDeltaYaw,
      lookDeltaPitch,
    };
  }

  dispose(): void {
    this.exitPointerLock();
    this.keysDown.clear();
    this.touchControls.dispose();
  }
}

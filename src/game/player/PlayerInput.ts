/* ── PlayerInput.ts ────────────────────────────────────────────────────────
 *  First-person player input aggregator.
 *  Combines keyboard, mouse clicks/drag, pointer-locked mouse look,
 *  and touch controls into a single deterministic PlayerIntent and action signals.
 * ──────────────────────────────────────────────────────────────────────── */

import type { PlayerIntent } from '../../sim/PlayerMotor.js';
import type { Action, Settings } from '../../types/contracts.js';
import { TouchControls } from './TouchControls.js';
import { GamepadManager } from '../../engine/input/GamepadManager.js';

export interface PlayerInputCallbacks {
  onPauseRequested: () => void;
  onCycleItem?: () => void;
  onToggleFlashlight?: () => void;
  onPing?: () => void;
  onSpectateNext?: () => void;
  onSpectatePrev?: () => void;
  onSpectateFreeRoamToggle?: () => void;
}

export class PlayerInput {
  private settings: Settings;
  private canvas: HTMLCanvasElement | null = null;
  private isLocked = false;
  private isMouseDown = false;
  private lastClientX: number | null = null;
  private lastClientY: number | null = null;
  private keysDown = new Set<string>();

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  // Throw state (Right Click / KeyG)
  private isThrowing = false;
  private throwHoldTime = 0;
  private throwReadyToLaunch: number | null = null;

  // Crank state (KeyC)
  private isCranking = false;

  private touchControls: TouchControls;
  private callbacks: PlayerInputCallbacks;
  private freezeInput = false;
  public isSpectating = false;

  private sprintToggled = false;
  private crouchToggled = false;
  private wasGpPause = false;
  private wasGpThrow = false;
  private wasGpFlashlight = false;
  private wasGpCrank = false;
  private wasGpCycleItem = false;
  private wasGpPing = false;

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
    const isTouch =
      typeof window !== 'undefined' &&
      (('ontouchstart' in window) ||
       (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
       (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    if (isTouch || this.touchControls.isActive()) {
      this.touchControls.mount(canvas.parentElement || document.body);
    }

    // Synchronous user click / pointerdown on game canvas immediately requests pointer lock
    const onCanvasActivate = (e: MouseEvent | PointerEvent) => {
      if (this.freezeInput) return;
      if (e.button === 0 && !this.isLocked) {
        this.requestPointerLock();
      }
    };
    canvas.addEventListener('pointerdown', onCanvasActivate);
    canvas.addEventListener('click', onCanvasActivate);
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (this.freezeInput) return;
      this.keysDown.add(e.code);

      // Escape or Pause binding triggers pause
      if (e.code === 'Escape' || e.code === this.settings.controls.bindings.pause) {
        this.callbacks.onPauseRequested();
      } else if (e.code === this.settings.controls.bindings.crouch && this.settings.controls.toggleCrouch) {
        this.crouchToggled = !this.crouchToggled;
      } else if (e.code === this.settings.controls.bindings.sprint && this.settings.controls.toggleSprint) {
        this.sprintToggled = !this.sprintToggled;
      } else if (e.code === (this.settings.controls.bindings.ping ?? 'KeyV')) {
        this.callbacks.onPing?.();
      } else if (e.code === 'KeyQ') {
        if (this.isSpectating) {
          this.callbacks.onSpectatePrev?.();
        } else if (this.callbacks.onCycleItem) {
          this.callbacks.onCycleItem();
        }
      } else if (e.code === 'KeyE') {
        if (this.isSpectating) {
          this.callbacks.onSpectateNext?.();
        }
      } else if (e.code === 'KeyF') {
        if (this.isSpectating) {
          this.callbacks.onSpectateFreeRoamToggle?.();
        } else if (this.callbacks.onToggleFlashlight) {
          this.callbacks.onToggleFlashlight();
        }
      } else if (e.code === 'KeyG') {
        if (!this.isThrowing && !this.isSpectating) {
          this.isThrowing = true;
          this.throwHoldTime = 0;
        }
      } else if (e.code === 'KeyC') {
        if (!this.isSpectating) {
          this.isCranking = true;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      if (e.code === 'KeyG') {
        if (this.isThrowing) {
          this.throwReadyToLaunch = this.throwHoldTime;
          this.isThrowing = false;
          this.throwHoldTime = 0;
        }
      } else if (e.code === 'KeyC') {
        this.isCranking = false;
      }
    });

    // Mouse button events for throw, interact, and pointer lock
    window.addEventListener('mousedown', (e) => {
      if (this.freezeInput) return;
      this.isMouseDown = true;
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;

      if (e.button === 2) {
        // Right click: start aiming throw
        e.preventDefault();
        this.isThrowing = true;
        this.throwHoldTime = 0;
      } else if (e.button === 0 && !this.isLocked && this.canvas) {
        // Left click anywhere in active window locks mouse
        this.requestPointerLock();
      }
    });

    window.addEventListener('mouseup', (e) => {
      this.isMouseDown = false;
      this.lastClientX = null;
      this.lastClientY = null;
      if (e.button === 2) {
        // Right click release: launch projectile
        e.preventDefault();
        if (this.isThrowing) {
          this.throwReadyToLaunch = this.throwHoldTime;
          this.isThrowing = false;
          this.throwHoldTime = 0;
        }
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.isLocked) {
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.freezeInput) return;

      let dx = e.movementX;
      let dy = e.movementY;

      // Fallback calculation if movementX/Y is zero or unavailable
      if ((dx === undefined || (dx === 0 && dy === 0)) && this.lastClientX !== null && this.lastClientY !== null) {
        dx = e.clientX - this.lastClientX;
        dy = e.clientY - this.lastClientY;
      }
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;

      // Accumulate look delta if pointer is locked, or if mouse button is held, or if canvas is active
      const canLook = this.isLocked || this.isMouseDown || (this.canvas && document.activeElement === this.canvas);
      if (canLook && dx !== undefined && !Number.isNaN(dx) && dy !== undefined && !Number.isNaN(dy)) {
        this.mouseDeltaX += dx;
        this.mouseDeltaY += dy;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    });

    // Auto-pause and clear keys on window blur or visibility loss
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.isThrowing = false;
      this.isCranking = false;
      this.callbacks.onPauseRequested();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.keysDown.clear();
        this.isThrowing = false;
        this.isCranking = false;
        this.callbacks.onPauseRequested();
      }
    });
  }

  requestPointerLock(): void {
    if (this.canvas && !this.isLocked) {
      const wantUnadjusted = this.settings.controls.unadjustedMovement !== false;
      try {
        const target = this.canvas as { requestPointerLock?: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void };
        if (wantUnadjusted && typeof target.requestPointerLock === 'function') {
          const res = target.requestPointerLock({ unadjustedMovement: true });
          if (res instanceof Promise) {
            void res.catch(() => {
              try {
                void this.canvas?.requestPointerLock();
              } catch {
                /* ignore */
              }
            });
          }
        } else {
          void this.canvas.requestPointerLock();
        }
      } catch {
        try {
          void this.canvas.requestPointerLock();
        } catch {
          /* ignore */
        }
      }
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
      this.isThrowing = false;
      this.isCranking = false;
      this.touchControls.hide();
    } else {
      this.touchControls.show();
    }
  }

  updateThrowHold(dt: number): void {
    if (this.isThrowing) {
      this.throwHoldTime = Math.min(1.0, this.throwHoldTime + dt);
    }
  }

  isThrowHeld(): boolean {
    return this.isThrowing;
  }

  getThrowHoldDuration(): number {
    return this.throwHoldTime;
  }

  consumeThrowLaunch(): number | null {
    const val = this.throwReadyToLaunch;
    this.throwReadyToLaunch = null;
    return val;
  }

  isCrankActive(): boolean {
    return this.isCranking;
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

    let sprint = this.settings.controls.toggleSprint ? this.sprintToggled : isDown('sprint');
    let crouch = this.settings.controls.toggleCrouch ? this.crouchToggled : isDown('crouch');
    let jump = isDown('jump');
    let interact = isDown('interact');

    // Auto-sprint assist: if enabled and moving forward without crouch
    if (this.settings.controls.autoSprint && Math.hypot(moveX, moveZ) > 0.05 && !crouch) {
      sprint = true;
    }

    // Mouse look deltas (in radians)
    const sens = this.settings.controls.sensitivity * 0.0022;
    const invertY = this.settings.controls.invertY;

    // Moving mouse right decreases yaw (rotates view right around +Y in Three.js Euler YXZ)
    let lookDeltaYaw = -this.mouseDeltaX * sens;
    // Moving mouse up decreases Y -> positive pitch tilts camera up
    let lookDeltaPitch = (invertY ? this.mouseDeltaY : -this.mouseDeltaY) * sens;

    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Merge Gamepad controls if connected
    const gamepad = GamepadManager.getInstance();
    const gpPad = gamepad.getPrimaryGamepad();
    if (gpPad) {
      const axes = gamepad.pollAxes();
      const btns = gamepad.pollButtons();

      if (Math.hypot(axes.moveX, axes.moveY) > 0.05) {
        moveX = axes.moveX;
        moveZ = axes.moveY;
      }

      if (btns.pause && !this.wasGpPause) {
        this.callbacks.onPauseRequested();
      }
      this.wasGpPause = btns.pause;

      if (btns.flashlight && !this.wasGpFlashlight) {
        if (this.isSpectating) {
          this.callbacks.onSpectateFreeRoamToggle?.();
        } else {
          this.callbacks.onToggleFlashlight?.();
        }
      }
      this.wasGpFlashlight = btns.flashlight;

      if (btns.cycleItem && !this.wasGpCycleItem) {
        if (this.isSpectating) {
          this.callbacks.onSpectatePrev?.();
        } else {
          this.callbacks.onCycleItem?.();
        }
      }
      this.wasGpCycleItem = btns.cycleItem;

      if (btns.ping && !this.wasGpPing) {
        this.callbacks.onPing?.();
      }
      this.wasGpPing = btns.ping;

      if (btns.throw && !this.wasGpThrow) {
        if (!this.isThrowing && !this.isSpectating) {
          this.isThrowing = true;
          this.throwHoldTime = 0;
        }
      } else if (!btns.throw && this.wasGpThrow) {
        if (this.isThrowing) {
          this.throwReadyToLaunch = this.throwHoldTime;
          this.isThrowing = false;
          this.throwHoldTime = 0;
        }
      }
      this.wasGpThrow = btns.throw;

      if (btns.crank) {
        if (!this.isSpectating) {
          this.isCranking = true;
        }
      } else if (this.wasGpCrank && !this.keysDown.has('KeyC') && !this.keysDown.has('KeyR')) {
        this.isCranking = false;
      }
      this.wasGpCrank = btns.crank;

      sprint = sprint || btns.sprint;
      crouch = crouch || btns.crouch;
      jump = jump || btns.jump;
      interact = interact || btns.interact;

      const gpSens = this.settings.controls.sensitivity * 0.045;
      lookDeltaYaw += -axes.lookX * gpSens;
      lookDeltaPitch += (invertY ? axes.lookY : -axes.lookY) * gpSens;
    }

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

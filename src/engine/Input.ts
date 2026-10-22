/* ── Input.ts ─────────────────────────────────────────────────────────────
 *  Unified keyboard and mouse input manager.
 *  Supports pointer lock, raw mouse deltas, and remappable action queries.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Action, Settings } from '../types/contracts.js';

export class InputManager {
  private keysDown = new Set<string>();
  private keysJustPressed = new Set<string>();

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  private isPointerLocked = false;
  private canvas: HTMLCanvasElement | null = null;
  private bindings: Record<Action, string>;

  constructor(settings?: Settings) {
    this.bindings = settings?.controls.bindings ?? {
      forward: 'KeyW',
      back: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      sprint: 'ShiftLeft',
      crouch: 'ControlLeft',
      jump: 'Space',
      interact: 'KeyE',
      flashlight: 'KeyF',
      throw: 'KeyG',
      crank: 'KeyR',
      cycleItem: 'KeyC',
      pause: 'Escape',
    };

    this.bindEvents();
  }

  setBindings(newBindings: Record<Action, string>): void {
    this.bindings = { ...newBindings };
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (!this.keysDown.has(e.code)) {
        this.keysJustPressed.add(e.code);
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('mousemove', (e) => {
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  requestPointerLock(): void {
    if (this.canvas && !this.isPointerLocked) {
      void this.canvas.requestPointerLock();
    }
  }

  exitPointerLock(): void {
    if (this.isPointerLocked && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  isActionActive(action: Action): boolean {
    const code = this.bindings[action];
    return code ? this.keysDown.has(code) : false;
  }

  isActionJustPressed(action: Action): boolean {
    const code = this.bindings[action];
    return code ? this.keysJustPressed.has(code) : false;
  }

  isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  isKeyJustPressed(code: string): boolean {
    return this.keysJustPressed.has(code);
  }

  getMouseDelta(): { x: number; y: number } {
    const res = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return res;
  }

  flushFrame(): void {
    this.keysJustPressed.clear();
  }

  dispose(): void {
    this.keysDown.clear();
    this.keysJustPressed.clear();
  }
}

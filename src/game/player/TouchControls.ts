/* ── TouchControls.ts ────────────────────────────────────────────────────────
 *  Touch input controller for mobile devices (portrait 9:16 and landscape).
 *  Provides a floating virtual joystick on the left half, drag-to-look on the
 *  right half with inertia, and large 44px+ action buttons.
 * ──────────────────────────────────────────────────────────────────────── */

export interface TouchIntent {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  interact: boolean;
  throw?: boolean;
  lookDeltaYaw: number;
  lookDeltaPitch: number;
  pauseRequested: boolean;
}

export class TouchControls {
  private container: HTMLElement | null = null;
  private joystickBase: HTMLElement | null = null;
  private joystickThumb: HTMLElement | null = null;

  // Touch tracking
  private joystickTouchId: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private joystickVec = { x: 0, y: 0 };
  private isSprintThreshold = false;

  private lookTouchId: number | null = null;
  private lookLastPos = { x: 0, y: 0 };
  private lookDelta = { x: 0, y: 0 };
  private lookInertia = { x: 0, y: 0 };

  // Button states
  private jumpPressed = false;
  private crouchToggled = false;
  private interactPressed = false;
  private throwPressed = false;
  private pauseRequested = false;

  private active = false;
  private touchScale = 1.0;

  constructor() {
    this.checkAutoEnable();
  }

  private checkAutoEnable(): void {
    if (typeof window === 'undefined') return;
    const isTouch =
      ('ontouchstart' in window) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (isTouch) {
      this.active = true;
      if (typeof document !== 'undefined' && document.body) {
        this.mount(document.body);
      }
    }
  }

  mount(parent: HTMLElement): void {
    if (this.container) {
      if (this.container.parentElement !== parent && parent) {
        parent.appendChild(this.container);
      }
      this.active = true;
      this.show();
      return;
    }

    const el = document.createElement('div');
    el.id = 'touch-controls-layer';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 450;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      overscroll-behavior: contain;
    `;

    el.innerHTML = `
      <!-- Left Joystick Zone -->
      <div id="touch-zone-left" style="
        position: absolute;
        left: 0;
        top: 0;
        width: 50%;
        height: 100%;
        pointer-events: auto;
        touch-action: none;
      "></div>

      <!-- Right Look Zone -->
      <div id="touch-zone-right" style="
        position: absolute;
        right: 0;
        top: 0;
        width: 50%;
        height: 100%;
        pointer-events: auto;
        touch-action: none;
      "></div>

      <!-- Joystick Visuals -->
      <div id="joystick-base" style="
        position: absolute;
        width: 110px;
        height: 110px;
        border-radius: 50%;
        background: rgba(217, 211, 162, 0.15);
        border: 2px solid rgba(217, 211, 162, 0.35);
        transform: translate(-50%, -50%);
        display: none;
        pointer-events: none;
        backdrop-filter: blur(2px);
      ">
        <div id="joystick-thumb" style="
          position: absolute;
          left: 50%;
          top: 50%;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(217, 211, 162, 0.6);
          transform: translate(-50%, -50%);
        "></div>
      </div>

      <!-- Header Controls: Fullscreen & Pause (>= 48px targets) -->
      <button id="touch-btn-fullscreen" aria-label="Toggle Fullscreen" style="
        position: fixed;
        top: max(16px, env(safe-area-inset-top));
        left: max(16px, env(safe-area-inset-left));
        width: 48px;
        height: 48px;
        min-width: 48px;
        min-height: 48px;
        border-radius: 8px;
        background: rgba(13, 11, 6, 0.75);
        border: 1px solid rgba(217, 211, 162, 0.4);
        color: var(--fog, #d9d3a2);
        font-family: monospace;
        font-size: 16px;
        pointer-events: auto;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      ">⛶</button>

      <button id="touch-btn-pause" aria-label="Pause Game" style="
        position: fixed;
        top: max(16px, env(safe-area-inset-top));
        right: max(16px, env(safe-area-inset-right));
        width: 48px;
        height: 48px;
        min-width: 48px;
        min-height: 48px;
        border-radius: 8px;
        background: rgba(13, 11, 6, 0.75);
        border: 1px solid rgba(217, 211, 162, 0.4);
        color: var(--fog, #d9d3a2);
        font-family: monospace;
        font-size: 18px;
        pointer-events: auto;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      ">⏸</button>

      <!-- Action Buttons Container (Bottom-Right, safe-area aware, >= 48px) -->
      <div id="touch-buttons" style="
        position: absolute;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(24px, env(safe-area-inset-bottom));
        display: flex;
        flex-direction: column;
        gap: 16px;
        pointer-events: auto;
        align-items: flex-end;
        transform-origin: bottom right;
      ">
        <div style="display: flex; gap: 12px; align-items: center;">
          <!-- Throw Pebble Button (>= 48px) -->
          <button id="touch-btn-throw" aria-label="Throw Pebble" style="
            width: 48px;
            height: 48px;
            min-width: 48px;
            min-height: 48px;
            border-radius: 50%;
            background: rgba(217, 211, 162, 0.2);
            border: 2px solid rgba(217, 211, 162, 0.5);
            color: var(--fog, #d9d3a2);
            font-family: monospace;
            font-size: 11px;
            font-weight: bold;
          ">DIST</button>

          <!-- Interact Button (>= 48px) -->
          <button id="touch-btn-interact" aria-label="Interact" style="
            width: 52px;
            height: 52px;
            min-width: 52px;
            min-height: 52px;
            border-radius: 50%;
            background: rgba(217, 211, 162, 0.2);
            border: 2px solid rgba(217, 211, 162, 0.5);
            color: var(--fog, #d9d3a2);
            font-family: monospace;
            font-size: 13px;
            font-weight: bold;
          ">USE</button>

          <!-- Crouch Toggle Button (>= 48px) -->
          <button id="touch-btn-crouch" aria-label="Toggle Crouch" style="
            width: 52px;
            height: 52px;
            min-width: 52px;
            min-height: 52px;
            border-radius: 50%;
            background: rgba(217, 211, 162, 0.2);
            border: 2px solid rgba(217, 211, 162, 0.5);
            color: var(--fog, #d9d3a2);
            font-family: monospace;
            font-size: 12px;
            font-weight: bold;
          ">CROUCH</button>

          <!-- Jump Button (>= 48px) -->
          <button id="touch-btn-jump" aria-label="Jump" style="
            width: 64px;
            height: 64px;
            min-width: 64px;
            min-height: 64px;
            border-radius: 50%;
            background: rgba(217, 211, 162, 0.3);
            border: 2px solid rgba(217, 211, 162, 0.8);
            color: var(--fog, #d9d3a2);
            font-family: monospace;
            font-size: 15px;
            font-weight: bold;
          ">JUMP</button>
        </div>
      </div>
    `;

    parent.appendChild(el);
    this.container = el;
    this.joystickBase = el.querySelector('#joystick-base');
    this.joystickThumb = el.querySelector('#joystick-thumb');

    this.bindTouchEvents();
    this.active = true;
  }

  private bindTouchEvents(): void {
    if (!this.container) return;

    const leftZone = this.container.querySelector('#touch-zone-left') as HTMLElement;
    const rightZone = this.container.querySelector('#touch-zone-right') as HTMLElement;

    // Joystick Touch
    leftZone.addEventListener('pointerdown', (e) => {
      if (this.joystickTouchId !== null) return;
      this.joystickTouchId = e.pointerId;
      leftZone.setPointerCapture(e.pointerId);

      this.joystickOrigin.x = e.clientX;
      this.joystickOrigin.y = e.clientY;
      this.joystickVec.x = 0;
      this.joystickVec.y = 0;
      this.isSprintThreshold = false;

      if (this.joystickBase && this.joystickThumb) {
        this.joystickBase.style.left = `${e.clientX}px`;
        this.joystickBase.style.top = `${e.clientY}px`;
        this.joystickBase.style.display = 'block';
        this.joystickThumb.style.transform = 'translate(-50%, -50%)';
      }
    });

    leftZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joystickTouchId) return;

      const dx = e.clientX - this.joystickOrigin.x;
      const dy = e.clientY - this.joystickOrigin.y;
      const maxDist = 55.0; // radius of joystick base
      const dist = Math.hypot(dx, dy);

      // 12% radial deadzone to eliminate touch jitter
      if (dist / maxDist < 0.12) {
        this.joystickVec.x = 0;
        this.joystickVec.y = 0;
        this.isSprintThreshold = false;
        if (this.joystickThumb) {
          this.joystickThumb.style.transform = 'translate(-50%, -50%)';
        }
        return;
      }

      const clampedDist = Math.min(dist, maxDist);
      const angle = Math.atan2(dy, dx);

      const normX = (Math.cos(angle) * clampedDist) / maxDist;
      const normY = (Math.sin(angle) * clampedDist) / maxDist;

      this.joystickVec.x = normX;
      this.joystickVec.y = normY;

      // Pushing beyond 85% = sprint
      this.isSprintThreshold = dist / maxDist > 0.85;

      if (this.joystickThumb) {
        const thumbX = Math.cos(angle) * clampedDist;
        const thumbY = Math.sin(angle) * clampedDist;
        this.joystickThumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;
      }
    });

    const releaseJoystick = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickTouchId) return;
      this.joystickTouchId = null;
      this.joystickVec.x = 0;
      this.joystickVec.y = 0;
      this.isSprintThreshold = false;
      if (this.joystickBase) {
        this.joystickBase.style.display = 'none';
      }
    };

    leftZone.addEventListener('pointerup', releaseJoystick);
    leftZone.addEventListener('pointercancel', releaseJoystick);

    // Look Touch (Right Zone)
    rightZone.addEventListener('pointerdown', (e) => {
      if (this.lookTouchId !== null) return;
      this.lookTouchId = e.pointerId;
      rightZone.setPointerCapture(e.pointerId);
      this.lookLastPos.x = e.clientX;
      this.lookLastPos.y = e.clientY;
      this.lookInertia.x = 0;
      this.lookInertia.y = 0;
    });

    rightZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookTouchId) return;
      const dx = e.clientX - this.lookLastPos.x;
      const dy = e.clientY - this.lookLastPos.y;
      this.lookLastPos.x = e.clientX;
      this.lookLastPos.y = e.clientY;

      this.lookDelta.x += dx * 0.0035;
      this.lookDelta.y += dy * 0.0035;

      this.lookInertia.x = dx * 0.0035;
      this.lookInertia.y = dy * 0.0035;
    });

    const releaseLook = (e: PointerEvent) => {
      if (e.pointerId !== this.lookTouchId) return;
      this.lookTouchId = null;
    };

    rightZone.addEventListener('pointerup', releaseLook);
    rightZone.addEventListener('pointercancel', releaseLook);

    // Fullscreen Toggle Button
    const fsBtn = this.container.querySelector<HTMLElement>('#touch-btn-fullscreen');
    fsBtn?.addEventListener('click', () => {
      this.triggerHaptic();
      try {
        if (!document.fullscreenElement) {
          void document.documentElement.requestFullscreen?.();
        } else {
          void document.exitFullscreen?.();
        }
      } catch {
        /* ignore */
      }
    });

    // Buttons
    const jumpBtn = this.container.querySelector('#touch-btn-jump') as HTMLElement;
    jumpBtn.addEventListener('pointerdown', () => {
      this.jumpPressed = true;
      this.triggerHaptic();
    });
    jumpBtn.addEventListener('pointerup', () => {
      this.jumpPressed = false;
    });
    jumpBtn.addEventListener('pointercancel', () => {
      this.jumpPressed = false;
    });

    const crouchBtn = this.container.querySelector('#touch-btn-crouch') as HTMLElement;
    crouchBtn.addEventListener('click', () => {
      this.crouchToggled = !this.crouchToggled;
      this.triggerHaptic();
      crouchBtn.style.background = this.crouchToggled
        ? 'rgba(217, 211, 162, 0.6)'
        : 'rgba(217, 211, 162, 0.2)';
    });

    const interactBtn = this.container.querySelector('#touch-btn-interact') as HTMLElement;
    interactBtn.addEventListener('pointerdown', () => {
      this.interactPressed = true;
      this.triggerHaptic();
    });
    interactBtn.addEventListener('pointerup', () => {
      this.interactPressed = false;
    });
    interactBtn.addEventListener('pointercancel', () => {
      this.interactPressed = false;
    });

    const throwBtn = this.container.querySelector<HTMLElement>('#touch-btn-throw');
    throwBtn?.addEventListener('pointerdown', () => {
      this.throwPressed = true;
      this.triggerHaptic();
    });
    throwBtn?.addEventListener('pointerup', () => {
      this.throwPressed = false;
    });
    throwBtn?.addEventListener('pointercancel', () => {
      this.throwPressed = false;
    });

    const pauseBtn = this.container.querySelector('#touch-btn-pause') as HTMLElement;
    pauseBtn.addEventListener('click', () => {
      this.pauseRequested = true;
      this.triggerHaptic();
    });

    // Apply saved touch scale if available
    try {
      const savedScale = localStorage.getItem('backsilence_touch_scale');
      if (savedScale) {
        this.setScale(parseFloat(savedScale));
      }
    } catch {
      /* ignore */
    }
  }

  private triggerHaptic(): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(15);
      } catch {
        /* ignore */
      }
    }
  }

  setScale(scale: number): void {
    this.touchScale = Math.max(0.75, Math.min(1.5, scale));
    if (this.container) {
      const btns = this.container.querySelector<HTMLElement>('#touch-buttons');
      if (btns) {
        btns.style.transform = `scale(${this.touchScale})`;
      }
    }
    try {
      localStorage.setItem('backsilence_touch_scale', String(this.touchScale));
    } catch {
      /* ignore */
    }
  }

  consumeIntent(sensitivity = 1.0, invertY = false): TouchIntent {
    let yawDelta = -this.lookDelta.x * sensitivity;
    let pitchDelta = (invertY ? this.lookDelta.y : -this.lookDelta.y) * sensitivity;

    // Apply look inertia decay
    if (this.lookTouchId === null) {
      yawDelta += -this.lookInertia.x * sensitivity;
      pitchDelta += (invertY ? this.lookInertia.y : -this.lookInertia.y) * sensitivity;
      this.lookInertia.x *= 0.85;
      this.lookInertia.y *= 0.85;
    }

    this.lookDelta.x = 0;
    this.lookDelta.y = 0;

    const pause = this.pauseRequested;
    this.pauseRequested = false;

    return {
      moveX: this.joystickVec.x,
      moveZ: this.joystickVec.y,
      sprint: this.isSprintThreshold,
      crouch: this.crouchToggled,
      jump: this.jumpPressed,
      interact: this.interactPressed,
      throw: this.throwPressed,
      lookDeltaYaw: yawDelta,
      lookDeltaPitch: pitchDelta,
      pauseRequested: pause,
    };
  }

  isActive(): boolean {
    return this.active;
  }

  show(): void {
    if (this.container) this.container.style.display = 'block';
  }

  hide(): void {
    if (this.container) this.container.style.display = 'none';
  }

  dispose(): void {
    if (this.container?.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    this.container = null;
    this.active = false;
  }
}

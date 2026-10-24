/* ── GamepadManager.ts ───────────────────────────────────────────────────────
 *  Standard Gamepad API integration for BackSilence:
 *  - Radial deadzone 0.15 with customizable response curve
 *  - Triggers for sprint (RT) and throw (LT)
 *  - D-pad & left stick navigation
 *  - Dual-rumble vibrationActuator feedback (guarded)
 *  - Headless test mock injection support
 * ──────────────────────────────────────────────────────────────────────── */

export type GamepadType = 'xbox' | 'playstation' | 'switch' | 'generic';

export interface GamepadAxes {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
}

export interface GamepadButtonsState {
  jump: boolean;
  interact: boolean;
  crouch: boolean;
  sprint: boolean;
  throw: boolean;
  flashlight: boolean;
  crank: boolean;
  cycleItem: boolean;
  ping: boolean;
  pause: boolean;
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
}

export interface GamepadConfig {
  deadzone?: number; // default 0.15
  responseExponent?: number; // default 1.8
  invertLookY?: boolean;
}

export class GamepadManager {
  private static instance: GamepadManager | null = null;
  private deadzone: number;
  private responseExponent: number;
  private invertLookY: boolean;
  private mockGamepads: Array<Gamepad | null> | null = null;

  static getInstance(): GamepadManager {
    if (!this.instance) {
      this.instance = new GamepadManager();
    }
    return this.instance;
  }

  constructor(config?: GamepadConfig) {
    this.deadzone = config?.deadzone ?? 0.15;
    this.responseExponent = config?.responseExponent ?? 1.8;
    this.invertLookY = config?.invertLookY ?? false;
  }

  setDeadzone(val: number): void {
    this.deadzone = Math.max(0, Math.min(0.5, val));
  }

  setInvertLookY(val: boolean): void {
    this.invertLookY = val;
  }

  setResponseExponent(exp: number): void {
    this.responseExponent = Math.max(1.0, Math.min(3.0, exp));
  }

  /**
   * Mock gamepad injection for headless CI / unit test environments.
   */
  setMockGamepads(pads: Array<Gamepad | null> | null): void {
    this.mockGamepads = pads;
  }

  getGamepads(): Array<Gamepad | null> {
    if (this.mockGamepads) return this.mockGamepads;
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      try {
        return Array.from(navigator.getGamepads());
      } catch {
        return [];
      }
    }
    return [];
  }

  getPrimaryGamepad(): Gamepad | null {
    const pads = this.getGamepads();
    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  detectGamepadType(pad?: Gamepad | null): GamepadType {
    const target = pad ?? this.getPrimaryGamepad();
    if (!target) return 'generic';

    const id = target.id.toLowerCase();
    if (id.includes('playstation') || id.includes('dualshock') || id.includes('dualsense') || id.includes('054c')) {
      return 'playstation';
    }
    if (id.includes('nintendo') || id.includes('switch') || id.includes('057e')) {
      return 'switch';
    }
    if (id.includes('xbox') || id.includes('microsoft') || id.includes('x-box') || id.includes('045e')) {
      return 'xbox';
    }
    return 'xbox'; // Standard default
  }

  /**
   * Applies radial deadzone and power response curve.
   */
  applyRadialDeadzone(rawX: number, rawY: number): { x: number; y: number } {
    const mag = Math.sqrt(rawX * rawX + rawY * rawY);
    if (mag < this.deadzone) {
      return { x: 0, y: 0 };
    }

    const norm = (mag - this.deadzone) / (1.0 - this.deadzone);
    const curved = Math.pow(Math.min(1.0, norm), this.responseExponent);
    const scale = curved / mag;

    return {
      x: rawX * scale,
      y: rawY * scale,
    };
  }

  pollAxes(): GamepadAxes {
    const pad = this.getPrimaryGamepad();
    if (!pad) {
      return { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
    }

    const left = this.applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const right = this.applyRadialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);

    return {
      moveX: left.x,
      moveY: left.y,
      lookX: right.x,
      lookY: this.invertLookY ? -right.y : right.y,
    };
  }

  pollButtons(): GamepadButtonsState {
    const pad = this.getPrimaryGamepad();
    if (!pad) {
      return {
        jump: false,
        interact: false,
        crouch: false,
        sprint: false,
        throw: false,
        flashlight: false,
        crank: false,
        cycleItem: false,
        ping: false,
        pause: false,
        dpadUp: false,
        dpadDown: false,
        dpadLeft: false,
        dpadRight: false,
      };
    }

    const btn = (idx: number): boolean => {
      const b = pad.buttons[idx];
      return b ? (b.pressed || b.value > 0.5) : false;
    };

    return {
      jump: btn(0),        // A / Cross / B
      crouch: btn(1),      // B / Circle / A
      flashlight: btn(2),  // X / Square / Y
      interact: btn(3),    // Y / Triangle / X
      cycleItem: btn(4),   // LB
      crank: btn(5),       // RB
      throw: btn(6),       // LT (Trigger)
      sprint: btn(7),      // RT (Trigger)
      pause: btn(9),       // Start / Options
      ping: btn(10),       // L3 (Stick press)
      dpadUp: btn(12),
      dpadDown: btn(13),
      dpadLeft: btn(14),
      dpadRight: btn(15),
    };
  }

  /**
   * Plays dual-rumble haptic feedback guarded against browser actuator differences.
   */
  async playRumble(intensity: 'jumpscare' | 'near-miss' | 'splash' | 'light'): Promise<boolean> {
    const pad = this.getPrimaryGamepad();
    if (!pad) return false;

    const actuator = pad.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== 'function') {
      return false;
    }

    let weak = 0.2;
    let strong = 0.2;
    let dur = 100;

    switch (intensity) {
      case 'jumpscare':
        weak = 0.9;
        strong = 1.0;
        dur = 450;
        break;
      case 'near-miss':
        weak = 0.6;
        strong = 0.4;
        dur = 250;
        break;
      case 'splash':
        weak = 0.3;
        strong = 0.1;
        dur = 150;
        break;
      case 'light':
      default:
        weak = 0.2;
        strong = 0.05;
        dur = 80;
        break;
    }

    try {
      await actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: dur,
        weakMagnitude: weak,
        strongMagnitude: strong,
      });
      return true;
    } catch {
      return false;
    }
  }
}

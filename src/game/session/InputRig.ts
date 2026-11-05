/* ── InputRig.ts ───────────────────────────────────────────────────────────
 *  Player input wiring, pointer lock regulation, and input dispatch guards.
 *  Enforces:
 *  - 080e262 pointer-lock law: pointer lock requests only honored if state is RUNNING.
 *  - 6785222 double-dispatch law: neutral idle intent returned whenever state is NOT RUNNING.
 *  - Automatic pointer lock release on blur/tab-switch.
 * ──────────────────────────────────────────────────────────────────────── */

import type { PlayerInputCallbacks } from '../player/PlayerInput.js';
import { PlayerInput } from '../player/PlayerInput.js';
import type { PlayerIntent } from '../../sim/PlayerMotor.js';
import type { Settings } from '../../types/contracts.js';
import type { SessionStateMachine } from './SessionStateMachine.js';
import type { DisposalService } from './DisposalService.js';
import { safeExitPointerLock } from '../../engine/input/PointerLock.js';

export interface InputRigCallbacks {
  onPauseRequested: () => void;
  onCycleItem?: () => void;
  onToggleFlashlight?: () => void;
  onPing?: () => void;
  onLeftClickInGame?: () => void;
}

export class InputRig {
  readonly input: PlayerInput;
  private readonly sm: SessionStateMachine;
  private readonly disposal: DisposalService;

  constructor(
    settings: Settings,
    callbacks: InputRigCallbacks,
    sm: SessionStateMachine,
    disposal: DisposalService,
  ) {
    this.sm = sm;
    this.disposal = disposal;

    const inputCallbacks: PlayerInputCallbacks = {
      onPauseRequested: () => {
        if (this.sm.canOpenMenu()) {
          callbacks.onPauseRequested();
        }
      },
    };
    if (callbacks.onCycleItem) inputCallbacks.onCycleItem = callbacks.onCycleItem;
    if (callbacks.onToggleFlashlight) inputCallbacks.onToggleFlashlight = callbacks.onToggleFlashlight;
    if (callbacks.onPing) inputCallbacks.onPing = callbacks.onPing;
    if (callbacks.onLeftClickInGame) inputCallbacks.onLeftClickInGame = callbacks.onLeftClickInGame;

    this.input = new PlayerInput(settings, inputCallbacks);

    // Window blur listener to release pointer lock when tab is blurred
    if (typeof window !== 'undefined') {
      const onBlur = () => {
        this.exitPointerLock();
      };
      this.disposal.trackEventListener(window, 'blur', onBlur, false, 'InputRig');
    }
  }

  attach(canvas: HTMLCanvasElement): void {
    this.input.attach(canvas);
  }

  requestPointerLock(): void {
    // 080e262 law: strictly guard pointer lock to RUNNING state
    if (!this.sm.canRequestPointerLock()) {
      return;
    }
    this.input.requestPointerLock();
  }

  exitPointerLock(): void {
    safeExitPointerLock();
    this.input.exitPointerLock();
  }

  pollIntent(dt: number): PlayerIntent {
    // 6785222 law: if not running, input dispatch is suppressed
    if (!this.sm.canDispatchInput()) {
      return {
        moveX: 0,
        moveZ: 0,
        jump: false,
        sprint: false,
        crouch: false,
        interact: false,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
      };
    }

    this.input.updateThrowHold(dt);
    return this.input.pollIntent();
  }

  setFreeze(freeze: boolean): void {
    this.input.setFreeze(freeze);
  }

  isPointerLocked(): boolean {
    return this.input.isPointerLocked();
  }

  isCrankActive(): boolean {
    return this.input.isCrankActive();
  }

  consumeThrowLaunch(): number | null {
    if (!this.sm.canDispatchInput()) return null;
    return this.input.consumeThrowLaunch();
  }

  setSettings(newSettings: Settings): void {
    this.input.setSettings(newSettings);
  }

  dispose(): void {
    this.exitPointerLock();
    this.input.dispose();
  }
}

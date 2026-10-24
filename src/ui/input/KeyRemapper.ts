/* ── KeyRemapper.ts ──────────────────────────────────────────────────────────
 *  Control remapping engine with conflict detection and defaults reset.
 *  Supports keyboard codes and gamepad button indices.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Action } from '../../types/contracts.js';

export const DEFAULT_KEYBOARD_BINDINGS: Record<Action, string> = {
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
  ping: 'KeyV',
  pause: 'Escape',
};

export const DEFAULT_GAMEPAD_BINDINGS: Record<Action, number> = {
  forward: -1, // Left Stick Y-
  back: -1,    // Left Stick Y+
  left: -1,    // Left Stick X-
  right: -1,   // Left Stick X+
  jump: 0,     // A
  crouch: 1,   // B
  flashlight: 2, // X
  interact: 3, // Y
  cycleItem: 4, // LB
  crank: 5,    // RB
  throw: 6,    // LT
  sprint: 7,   // RT
  pause: 9,    // Start
  ping: 10,    // L3
};

export interface BindingConflict {
  actionA: Action;
  actionB: Action;
  key: string;
}

export const KeyRemapper = {
  getDefaults(): Record<Action, string> {
    return { ...DEFAULT_KEYBOARD_BINDINGS };
  },

  getGamepadDefaults(): Record<Action, number> {
    return { ...DEFAULT_GAMEPAD_BINDINGS };
  },

  /**
   * Rebinds an action to a new key code, returning updated bindings and any detected conflicts.
   */
  rebind(
    bindings: Record<Action, string>,
    targetAction: Action,
    newKey: string,
  ): { bindings: Record<Action, string>; conflict: Action | null } {
    const next: Record<Action, string> = { ...bindings };
    let conflict: Action | null = null;

    // Check for collision
    for (const [action, key] of Object.entries(bindings) as Array<[Action, string]>) {
      if (action !== targetAction && key === newKey) {
        conflict = action;
        break;
      }
    }

    next[targetAction] = newKey;
    return { bindings: next, conflict };
  },

  /**
   * Detects all collisions in a bindings table.
   */
  validate(bindings: Record<Action, string>): {
    isValid: boolean;
    conflicts: BindingConflict[];
  } {
    const conflicts: BindingConflict[] = [];
    const seen = new Map<string, Action>();

    for (const [action, key] of Object.entries(bindings) as Array<[Action, string]>) {
      if (!key) continue;
      if (seen.has(key)) {
        conflicts.push({
          actionA: seen.get(key)!,
          actionB: action,
          key,
        });
      } else {
        seen.set(key, action);
      }
    }

    return {
      isValid: conflicts.length === 0,
      conflicts,
    };
  },
};

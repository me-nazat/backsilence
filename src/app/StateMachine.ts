/* ── StateMachine.ts ──────────────────────────────────────────────────────
 *  Typed finite state machine enforcing legal AppState transitions.
 *  Emits 'app:state' on the EventBus on every transition.
 * ──────────────────────────────────────────────────────────────────────── */

import type { AppState } from '../types/contracts.js';
import type { EventBus } from './EventBus.js';

/**
 * Legal transition map. Each key maps to the set of states it can
 * transition to. Any unlisted transition is illegal and throws.
 */
const TRANSITIONS: Record<AppState, readonly AppState[]> = {
  BOOT: ['MENU'],
  MENU: ['MODE_SELECT'],
  MODE_SELECT: ['LOBBY', 'LOADING', 'MENU'],
  LOBBY: ['LOADING', 'MENU'],
  LOADING: ['PLAYING', 'MENU'],
  PLAYING: ['PAUSED', 'DEAD'],
  PAUSED: ['PLAYING', 'MENU'],
  DEAD: ['SPECTATING', 'RESULTS', 'MENU'],
  SPECTATING: ['RESULTS', 'MENU'],
  RESULTS: ['MENU'],
};

export interface StateMachine {
  /** Current state. */
  readonly current: AppState;
  /** Transition to a new state. Throws on illegal transitions. */
  transition(to: AppState): void;
  /** Check whether a transition from current to `to` is legal. */
  canTransition(to: AppState): boolean;
}

export class AppStateMachine implements StateMachine {
  private _current: AppState;
  private readonly bus: EventBus;

  constructor(bus: EventBus, initial: AppState = 'BOOT') {
    this._current = initial;
    this.bus = bus;
  }

  get current(): AppState {
    return this._current;
  }

  canTransition(to: AppState): boolean {
    const allowed = TRANSITIONS[this._current];
    return allowed.includes(to);
  }

  transition(to: AppState): void {
    if (!this.canTransition(to)) {
      throw new Error(
        `Illegal state transition: ${this._current} → ${to}. ` +
        `Allowed: [${TRANSITIONS[this._current].join(', ')}]`,
      );
    }
    const from = this._current;
    this._current = to;
    this.bus.emit('app:state', { from, to });
  }
}

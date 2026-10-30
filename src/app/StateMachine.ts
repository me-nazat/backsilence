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
  MENU: ['MODE_SELECT', 'LOBBY', 'LOADING', 'PLAYING'],
  MODE_SELECT: ['LOBBY', 'LOADING', 'PLAYING', 'MENU'],
  LOBBY: ['LOADING', 'PLAYING', 'MENU'],
  LOADING: ['PLAYING', 'MENU'],
  PLAYING: ['PAUSED', 'DEAD', 'GAME_OVER', 'RESULTS', 'MENU', 'LOADING'],
  PAUSED: ['PLAYING', 'MENU', 'LOADING'],
  DEAD: ['SPECTATING', 'RESULTS', 'MENU', 'LOADING', 'PLAYING', 'GAME_OVER'],
  GAME_OVER: ['SPECTATING', 'RESULTS', 'MENU', 'LOADING', 'PLAYING', 'DEAD'],
  SPECTATING: ['RESULTS', 'MENU', 'LOADING'],
  RESULTS: ['MENU', 'MODE_SELECT', 'LOADING', 'PLAYING'],
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

  /**
   * Tolerant transition used by UI/game flow code. Never throws:
   * - no-op if already in `to`
   * - uses the legal edge when available
   * - otherwise forces the state (with a console warning) so that a
   *   bookkeeping mismatch can never break buttons or crash the app.
   */
  goTo(to: AppState): void {
    if (this._current === to) return;
    if (!this.canTransition(to)) {
      console.warn(`[StateMachine] Forcing non-standard transition ${this._current} → ${to}`);
    }
    const from = this._current;
    this._current = to;
    this.bus.emit('app:state', { from, to });
  }
}

/* ── SessionStateMachine.ts ────────────────────────────────────────────────
 *  Formal state machine for BackSilence gameplay sessions.
 *  Enforces legal lifecycle transitions:
 *    IDLE → LOADING → RUNNING ⇄ PAUSED ⇄ DEAD
 *                   ↘ CAPTURE ↗
 *                   → DISPOSING → DISPOSED
 *
 *  Invariants:
 *  - Menu cannot open during LOADING (kills 44503aa deadlock).
 *  - Pointer lock only in RUNNING (the 080e262 law).
 *  - Input dispatch ignored unless RUNNING (kills double-dispatch).
 *  - SPA history navigation allowed only from PAUSED/IDLE/DISPOSED (the 10b3962 law).
 *  - ?shot= enters CAPTURE with debug suppression (G5 law) and exits to DISPOSED.
 *  - 512-entry transition ring buffer for deterministic smoke verification.
 * ──────────────────────────────────────────────────────────────────────── */

export type SessionState =
  | 'IDLE'
  | 'LOADING'
  | 'RUNNING'
  | 'PAUSED'
  | 'DEAD'
  | 'CAPTURE'
  | 'DISPOSING'
  | 'DISPOSED';

export interface StateTransitionRecord {
  from: SessionState;
  to: SessionState;
  timestamp: number;
  reason?: string | undefined;
}

const LEGAL_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  IDLE: ['LOADING', 'DISPOSING', 'DISPOSED'],
  LOADING: ['RUNNING', 'CAPTURE', 'DISPOSING', 'DISPOSED'],
  RUNNING: ['PAUSED', 'DEAD', 'CAPTURE', 'LOADING', 'DISPOSING', 'DISPOSED'],
  PAUSED: ['RUNNING', 'LOADING', 'DISPOSING', 'DISPOSED'],
  DEAD: ['RUNNING', 'LOADING', 'DISPOSING', 'DISPOSED'],
  CAPTURE: ['DISPOSING', 'DISPOSED'],
  DISPOSING: ['DISPOSED'],
  DISPOSED: ['IDLE', 'LOADING'],
};

const RING_BUFFER_SIZE = 512;

export class SessionStateMachine {
  private _state: SessionState;
  private readonly ringBuffer: StateTransitionRecord[] = [];
  private ringHead = 0;
  private totalTransitions = 0;

  constructor(initial: SessionState = 'IDLE') {
    this._state = initial;
    this.recordTransition('IDLE', initial, 'init');
  }

  get state(): SessionState {
    return this._state;
  }

  get current(): SessionState {
    return this._state;
  }

  is(target: SessionState): boolean {
    return this._state === target;
  }

  canTransition(to: SessionState): boolean {
    if (this._state === to) return true;
    const allowed = LEGAL_TRANSITIONS[this._state];
    return allowed.includes(to);
  }

  transition(to: SessionState, reason?: string): boolean {
    if (this._state === to) return true;

    if (!this.canTransition(to)) {
      const msg = `[SessionStateMachine] Illegal transition: ${this._state} → ${to}. Allowed: [${LEGAL_TRANSITIONS[this._state].join(', ')}]`;
      const isDev =
        (typeof globalThis !== 'undefined' && (globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== 'production') ||
        (typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV));

      if (isDev) {
        throw new Error(msg);
      } else {
        console.warn(msg);
        // Prod recovery: record and force state to avoid crashing production UI
        this.forceState(to, `illegal_recovered: ${reason ?? 'unspecified'}`);
        return false;
      }
    }

    const from = this._state;
    this._state = to;
    this.recordTransition(from, to, reason);
    return true;
  }

  forceState(to: SessionState, reason?: string): void {
    const from = this._state;
    this._state = to;
    this.recordTransition(from, to, reason ? `forced:${reason}` : 'forced');
  }

  // ── Invariant Predicates ──────────────────────────────────────────────────

  /** Kills 44503aa menu deadlock: menu can never open while session is LOADING or DISPOSING */
  canOpenMenu(): boolean {
    return this._state === 'RUNNING' || this._state === 'PAUSED' || this._state === 'IDLE' || this._state === 'DEAD';
  }

  /** The 080e262 law: pointer lock is strictly permitted ONLY during active RUNNING */
  canRequestPointerLock(): boolean {
    return this._state === 'RUNNING';
  }

  /** Kills 6785222 double-dispatch: input dispatch ignored unless in RUNNING */
  canDispatchInput(): boolean {
    return this._state === 'RUNNING';
  }

  /** The 10b3962 law: SPA history navigation allowed only from PAUSED, IDLE, or DISPOSED */
  canNavigateHistory(): boolean {
    return this._state === 'PAUSED' || this._state === 'IDLE' || this._state === 'DISPOSED';
  }

  /** G5 law: ?shot= capture can only enter from LOADING or RUNNING */
  canEnterCapture(): boolean {
    return this._state === 'LOADING' || this._state === 'RUNNING';
  }

  isTerminated(): boolean {
    return this._state === 'DISPOSING' || this._state === 'DISPOSED';
  }

  // ── Transition Ring Buffer ────────────────────────────────────────────────

  private recordTransition(from: SessionState, to: SessionState, reason?: string): void {
    const record: StateTransitionRecord = {
      from,
      to,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      reason,
    };

    if (this.ringBuffer.length < RING_BUFFER_SIZE) {
      this.ringBuffer.push(record);
    } else {
      this.ringBuffer[this.ringHead] = record;
      this.ringHead = (this.ringHead + 1) % RING_BUFFER_SIZE;
    }
    this.totalTransitions++;

    if (typeof window !== 'undefined') {
      (window as unknown as { __backsilence_session_transitions?: StateTransitionRecord[] }).__backsilence_session_transitions = this.getTransitionLog();
    }
  }

  getTransitionLog(): StateTransitionRecord[] {
    if (this.ringBuffer.length < RING_BUFFER_SIZE) {
      return [...this.ringBuffer];
    }
    return [
      ...this.ringBuffer.slice(this.ringHead),
      ...this.ringBuffer.slice(0, this.ringHead),
    ];
  }

  getTotalTransitions(): number {
    return this.totalTransitions;
  }
}

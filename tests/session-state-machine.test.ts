import { describe, it, expect } from 'vitest';
import { SessionStateMachine } from '../src/game/session/SessionStateMachine.js';

describe('Prompt 9 Phase A: SessionStateMachine & Invariant Enforcement', () => {
  it('follows the canonical lifecycle: IDLE → LOADING → RUNNING → PAUSED → RUNNING → DISPOSING → DISPOSED', () => {
    const sm = new SessionStateMachine('IDLE');
    expect(sm.state).toBe('IDLE');

    expect(sm.transition('LOADING', 'map load start')).toBe(true);
    expect(sm.state).toBe('LOADING');

    expect(sm.transition('RUNNING', 'map load complete')).toBe(true);
    expect(sm.state).toBe('RUNNING');

    expect(sm.transition('PAUSED', 'player pressed Escape')).toBe(true);
    expect(sm.state).toBe('PAUSED');

    expect(sm.transition('RUNNING', 'player resumed')).toBe(true);
    expect(sm.state).toBe('RUNNING');

    expect(sm.transition('DEAD', 'monster caught player')).toBe(true);
    expect(sm.state).toBe('DEAD');

    expect(sm.transition('RUNNING', 'quick retry')).toBe(true);
    expect(sm.state).toBe('RUNNING');

    expect(sm.transition('DISPOSING', 'exit session')).toBe(true);
    expect(sm.state).toBe('DISPOSING');

    expect(sm.transition('DISPOSED', 'teardown complete')).toBe(true);
    expect(sm.state).toBe('DISPOSED');
    expect(sm.isTerminated()).toBe(true);
  });

  it('enforces 44503aa law: menu cannot open during LOADING or DISPOSING', () => {
    const sm = new SessionStateMachine('IDLE');
    expect(sm.canOpenMenu()).toBe(true);

    sm.transition('LOADING');
    expect(sm.canOpenMenu()).toBe(false);

    sm.transition('RUNNING');
    expect(sm.canOpenMenu()).toBe(true);

    sm.transition('PAUSED');
    expect(sm.canOpenMenu()).toBe(true);

    sm.transition('DISPOSING');
    expect(sm.canOpenMenu()).toBe(false);
  });

  it('enforces 080e262 law: pointer lock is allowed ONLY in RUNNING', () => {
    const sm = new SessionStateMachine('IDLE');
    expect(sm.canRequestPointerLock()).toBe(false);

    sm.transition('LOADING');
    expect(sm.canRequestPointerLock()).toBe(false);

    sm.transition('RUNNING');
    expect(sm.canRequestPointerLock()).toBe(true);

    sm.transition('PAUSED');
    expect(sm.canRequestPointerLock()).toBe(false);

    sm.transition('RUNNING');
    sm.transition('DEAD');
    expect(sm.canRequestPointerLock()).toBe(false);

    sm.transition('DISPOSING');
    expect(sm.canRequestPointerLock()).toBe(false);
  });

  it('enforces 6785222 law: input dispatch is ignored unless in RUNNING', () => {
    const sm = new SessionStateMachine('IDLE');
    expect(sm.canDispatchInput()).toBe(false);

    sm.transition('LOADING');
    expect(sm.canDispatchInput()).toBe(false);

    sm.transition('RUNNING');
    expect(sm.canDispatchInput()).toBe(true);

    sm.transition('PAUSED');
    expect(sm.canDispatchInput()).toBe(false);
  });

  it('enforces 10b3962 law: SPA history navigation allowed only from PAUSED, IDLE, or DISPOSED', () => {
    const sm = new SessionStateMachine('IDLE');
    expect(sm.canNavigateHistory()).toBe(true);

    sm.transition('LOADING');
    expect(sm.canNavigateHistory()).toBe(false);

    sm.transition('RUNNING');
    expect(sm.canNavigateHistory()).toBe(false);

    sm.transition('PAUSED');
    expect(sm.canNavigateHistory()).toBe(true);

    sm.transition('DISPOSING');
    expect(sm.canNavigateHistory()).toBe(false);

    sm.transition('DISPOSED');
    expect(sm.canNavigateHistory()).toBe(true);
  });

  it('throws on illegal transitions in dev environment', () => {
    const sm = new SessionStateMachine('IDLE');
    expect(() => sm.transition('PAUSED')).toThrowError(/Illegal transition/);
  });

  it('logs transitions into ring buffer and wraps at 512 entries', () => {
    const sm = new SessionStateMachine('IDLE');
    for (let i = 0; i < 600; i++) {
      sm.forceState(i % 2 === 0 ? 'RUNNING' : 'PAUSED', `step_${i}`);
    }

    const log = sm.getTransitionLog();
    expect(log.length).toBe(512);
    expect(sm.getTotalTransitions()).toBe(601); // 1 init + 600 forced
  });
});

import { describe, it, expect } from 'vitest';
import { ModeRulesSession, type GameModeId } from '../src/meta/ModeRules.js';

describe('Prompt 3 Section 7: Multiplayer Modes, Haunting, Rescue & Tie-Breakers', () => {
  it('supports all 10 distinct game modes', () => {
    const modes: GameModeId[] = [
      'campaign',
      'daily_descent',
      'endless_tide',
      'ghost_run',
      'training_pool',
      'coop_escape',
      'silent_race',
      'last_one_dry',
      'series',
      'silent_cup',
    ];

    for (const m of modes) {
      const session = new ModeRulesSession(m, ['p1', 'p2']);
      expect(session.mode).toBe(m);
      expect(session.getAllPlayers()).toHaveLength(2);
    }
  });

  it('enforces Silent Race halfway catch-up rule (+2 pebbles once for last place)', () => {
    const session = new ModeRulesSession('silent_race', ['p1', 'p2', 'p3']);
    session.recordPlayerPosition('p1', { x: 0, y: 0.3, z: 80 }); // leader
    session.recordPlayerPosition('p2', { x: 0, y: 0.3, z: 50 }); // 2nd
    session.recordPlayerPosition('p3', { x: 0, y: 0.3, z: 10 }); // last place

    expect(session.getPlayer('p3')?.pebbles).toBe(3);

    // Fast-forward to halfway mark (180s)
    session.step(180.0);

    expect(session.getPlayer('p3')?.pebbles).toBe(5); // +2 bonus
    expect(session.getPlayer('p1')?.pebbles).toBe(3);
    expect(session.getPlayer('p2')?.pebbles).toBe(3);

    // Further stepping should NOT grant bonus twice
    session.step(50.0);
    expect(session.getPlayer('p3')?.pebbles).toBe(5);
  });

  it('models Last One Dry rising tide (0..0.5m over 6 min) and minute 5 platform spawn', () => {
    const session = new ModeRulesSession('last_one_dry', ['p1', 'p2', 'p3']);
    expect(session.getTideY()).toBe(0.0);
    expect(session.isFinalPlatformSpawned()).toBe(false);

    // 3 minutes (180s): tide should be 0.25m
    session.step(180.0);
    expect(session.getTideY()).toBeCloseTo(0.25, 2);
    expect(session.isFinalPlatformSpawned()).toBe(false);

    // 5 minutes (300s): final platform appears
    session.step(120.0);
    expect(session.isFinalPlatformSpawned()).toBe(true);

    // 6 minutes (360s): tide reaches maximum 0.5m
    session.step(60.0);
    expect(session.getTideY()).toBeCloseTo(0.5, 2);
  });

  it('enforces Co-op Rewind Terminal rescue mechanics (20s hold, noise 0.6, once/run)', () => {
    const session = new ModeRulesSession('coop_escape', ['p1', 'p2']);
    session.setTerminalPosition({ x: 15, y: 0.3, z: 25 });

    // p2 dies
    session.recordPlayerDeath('p2');
    expect(session.getPlayer('p2')?.alive).toBe(false);

    // p1 starts interact at terminal
    const started = session.startTerminalInteract('p1');
    expect(started).toBe(true);

    // Step 10 seconds: emits 0.6 terminal noise, teammate not yet revived
    const step1 = session.step(10.0);
    expect(step1.terminalNoise).toBeDefined();
    expect(step1.terminalNoise?.loudness).toBe(0.6);
    expect(session.getPlayer('p2')?.alive).toBe(false);

    // Step remaining 10 seconds: completes 20s hold, revives dead teammate
    const step2 = session.step(10.0);
    expect(step2.rescuedPlayerId).toBe('p2');
    expect(session.getPlayer('p2')?.alive).toBe(true);
    expect(session.getPlayer('p2')?.pos).toEqual({ x: 15, y: 0.3, z: 25 });

    // Terminal is now used and unavailable
    expect(session.getTerminalState().used).toBe(true);
    expect(session.getTerminalState().available).toBe(false);
    expect(session.startTerminalInteract('p1')).toBe(false);
  });

  it('enforces spectator Haunting constraints (Echo pool, >=12m living, <=30m haunter, max 4)', () => {
    const session = new ModeRulesSession('silent_race', ['p1', 'p2']);
    session.recordPlayerPosition('p1', { x: 0, y: 0.3, z: 0 }); // living player at (0, 0)
    session.recordPlayerPosition('p2', { x: 20, y: 0.3, z: 20 }); // dead spectator at (20, 20)
    session.recordPlayerDeath('p2');

    // Dead player generates Echo over 15s (+4/s = 60 Echo)
    session.step(15.0);
    expect(session.getPlayer('p2')?.echo).toBe(60);

    // Attempt 1: Target too close to living player (< 12m), within 30m of haunter
    const closeRes = session.attemptHaunt('p2', { x: 5, y: 0, z: 5 });
    expect(closeRes.allowed).toBe(false);
    expect(closeRes.reason).toContain('too close to a living player');

    // Attempt 2: Target too far from haunter (> 30m)
    const farRes = session.attemptHaunt('p2', { x: 70, y: 0, z: 70 });
    expect(farRes.allowed).toBe(false);
    expect(farRes.reason).toContain('too far from haunter');

    // Attempt 3: Valid haunt (at x:25, z:25: 7.1m from haunter, 35.4m from living)
    const validRes = session.attemptHaunt('p2', { x: 25, y: 0, z: 25 });
    expect(validRes.allowed).toBe(true);
    expect(validRes.noiseEvent).toBeDefined();
    expect(validRes.noiseEvent?.loudness).toBe(0.5);
    expect(validRes.noiseEvent?.kind).toBe('haunt');
    expect(session.getPlayer('p2')?.echo).toBe(10); // 60 - 50 = 10
    expect(session.getPlayer('p2')?.hauntCount).toBe(1);

    // Attempt 4: On cooldown
    session.step(5.0);
    const cdRes = session.attemptHaunt('p2', { x: 25, y: 0, z: 25 });
    expect(cdRes.allowed).toBe(false);
    expect(cdRes.reason).toContain('cooldown');
  });

  it('handles disconnect (>45s) and AFK (90s warn, 150s drop)', () => {
    const session = new ModeRulesSession('silent_race', ['p1', 'p2']);
    session.recordPlayerPosition('p1', { x: 0, y: 0.3, z: 0 });
    session.recordPlayerPosition('p2', { x: 10, y: 0.3, z: 10 });

    // Mark p2 connection lost
    session.markPlayerDisconnected('p2');
    session.step(46.0);
    expect(session.getPlayer('p2')?.disconnected).toBe(true);
    expect(session.getPlayer('p2')?.alive).toBe(false);

    // p1 goes AFK on non-safe tile
    session.recordPlayerInput('p1', false); // non-safe tile
    session.step(95.0);
    expect(session.getPlayer('p1')?.afkWarned).toBe(true);
    expect(session.getPlayer('p1')?.afkRemoved).toBe(false);

    session.step(60.0); // 95 + 60 = 155s
    expect(session.getPlayer('p1')?.afkRemoved).toBe(true);
    expect(session.getPlayer('p1')?.alive).toBe(false);
  });

  it('breaks ties deterministically: lower noise units, earlier finish tick, lower player id', () => {
    const session = new ModeRulesSession('silent_race', ['p1', 'p2', 'p3']);
    // All 3 escape at same second
    session.recordPlayerNoise('p1', 5.0);
    session.recordPlayerNoise('p2', 2.0); // lowest noise
    session.recordPlayerNoise('p3', 5.0);

    session.recordPlayerEscape('p1', 1000);
    session.recordPlayerEscape('p2', 1000);
    session.recordPlayerEscape('p3', 1000);

    expect(session.isOver()).toBe(true);
    const p1 = session.getPlayer('p1')!;
    const p2 = session.getPlayer('p2')!;
    const p3 = session.getPlayer('p3')!;

    // p2 has lowest noise -> 1st place
    expect(p2.placement).toBe(1);
    // p1 and p3 both have noise 5.0, tie broken by ID ('p1' < 'p3')
    expect(p1.placement).toBe(2);
    expect(p3.placement).toBe(3);
  });

  it('serializes and hydrates match session round-trip without state drift', () => {
    const s1 = new ModeRulesSession('last_one_dry', ['p1', 'p2']);
    s1.step(120.0);
    s1.recordPlayerPosition('p1', { x: 12, y: 0.3, z: 34 });

    const snap = s1.serialize();
    const s2 = new ModeRulesSession('last_one_dry');
    s2.hydrate(snap);

    expect(s2.mode).toBe('last_one_dry');
    expect(s2.getTideY()).toBeCloseTo(s1.getTideY(), 4);
    expect(s2.getPlayer('p1')?.pos).toEqual({ x: 12, y: 0.3, z: 34 });
  });
});

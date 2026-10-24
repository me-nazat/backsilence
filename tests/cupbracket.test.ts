import { describe, it, expect } from 'vitest';
import { CupBracket } from '../src/meta/CupBracket.js';
import { LocalMatchmaker } from '../src/meta/MatchmakerPort.js';

describe('Prompt 3 Section 7: Silent Cup & Matchmaker Port', () => {
  it('creates an 8-player bracket from a seeded shuffle with byes for missing players', () => {
    // 6 human players + 2 byes
    const players = [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Bravo' },
      { id: 'p3', name: 'Charlie' },
      { id: 'p4', name: 'Delta' },
      { id: 'p5', name: 'Echo' },
      { id: 'p6', name: 'Foxtrot' },
    ];

    const bracket = new CupBracket('cup_test_1', 424242, players);
    const all = bracket.getAllPlayers();
    expect(all).toHaveLength(8);

    const byes = all.filter((p) => p.isBye);
    expect(byes).toHaveLength(2);

    const heat1 = bracket.getHeat(1);
    const heat2 = bracket.getHeat(2);
    expect(heat1.playerIds).toHaveLength(4);
    expect(heat2.playerIds).toHaveLength(4);
    expect(bracket.getStatus()).toBe('heats');
  });

  it('scores heats with Silent Race points and advances top 4 into Grand Final', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
    const bracket = new CupBracket('cup_full', 12345, players);

    const heat1 = bracket.getHeat(1);
    const heat2 = bracket.getHeat(2);

    // Complete Heat 1
    bracket.recordHeatResult(1, [...heat1.playerIds]);
    expect(bracket.getHeat(1).completed).toBe(true);
    expect(bracket.getStatus()).toBe('heats');

    // Complete Heat 2
    bracket.recordHeatResult(2, [...heat2.playerIds]);
    expect(bracket.getHeat(2).completed).toBe(true);

    // Both heats complete -> Grand Final seeded
    expect(bracket.getStatus()).toBe('final');
    const finalHeat = bracket.getFinalHeat();
    expect(finalHeat.playerIds).toHaveLength(4);

    // Record Final result
    const finalists = [...finalHeat.playerIds];
    bracket.recordFinalResult(finalists);

    expect(bracket.getStatus()).toBe('completed');
    const champion = bracket.getChampion();
    expect(champion).toBeDefined();
    expect(champion?.id).toBe(finalists[0]);
    expect(champion?.finalPoints).toBe(100);
  });

  it('serializes and hydrates CupBracket state round-trip without loss', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
    const b1 = new CupBracket('cup_ser', 9999, players);
    b1.recordHeatResult(1, [...b1.getHeat(1).playerIds]);

    const snapshot = b1.serialize();
    const b2 = new CupBracket('temp', 0);
    b2.hydrate(snapshot);

    expect(b2.cupId).toBe('cup_ser');
    expect(b2.getStatus()).toBe('heats');
    expect(b2.getHeat(1).completed).toBe(true);
    expect(b2.getAllPlayers()).toHaveLength(8);
  });

  it('LocalMatchmaker returns oldest matching room or instructs room creation', () => {
    const mm = new LocalMatchmaker();

    // No rooms initially
    const res1 = mm.findMatch('silent_race', 'p1');
    expect(res1.action).toBe('create');
    expect(res1.roomCode.length).toBe(4);

    // Host creates and registers room
    mm.registerRoom({
      roomCode: res1.roomCode,
      mode: 'silent_race',
      mapId: 'natatorium',
      playerCount: 1,
      maxPlayers: 4,
      createdAt: 1000,
      isRanked: false,
    });

    // 2nd player searches for match -> joins registered room
    const res2 = mm.findMatch('silent_race', 'p2');
    expect(res2.action).toBe('join');
    expect(res2.roomCode).toBe(res1.roomCode);

    // Ranked matchmaking enforces SR window
    mm.registerRoom({
      roomCode: 'RANK',
      mode: 'silent_race',
      mapId: 'natatorium',
      playerCount: 1,
      maxPlayers: 4,
      createdAt: 2000,
      isRanked: true,
      minSr: 1300,
      maxSr: 1700,
    });

    // Low SR player cannot join RANK room (+/- 250 threshold)
    const resLow = mm.findMatch('silent_race', 'pLow', 900, true);
    expect(resLow.action).toBe('create');

    // Matched SR player joins
    const resMatch = mm.findMatch('silent_race', 'pMid', 1450, true);
    expect(resMatch.action).toBe('join');
    expect(resMatch.roomCode).toBe('RANK');
  });
});

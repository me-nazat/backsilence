/* ── rating-replay.test.ts ────────────────────────────────────────────────
 *  Tests for Ranked Ladder, Elo, Champions, Seasons, RunRecorder, Replay, and Ghost.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  getRankBracket,
  calculateMatchEloUpdates,
  applyWeeklyDecay,
  applySeasonCompression,
  resolveRankedQuitOutcome,
  determineWeeklyChampion,
  determineSeasonChampion,
  generateSeasonTrack,
  K_FACTOR_STANDARD,
  K_FACTOR_PLACEMENT,
} from '../src/meta/RatingElo.js';
import {
  RunRecorder,
  RECORDER_SIM_VERSION,
  MAX_RECORDING_SIZE_BYTES,
  type RunRecording,
} from '../src/meta/RunRecorder.js';
import { Replay } from '../src/meta/Replay.js';
import { GhostTrajectory } from '../src/meta/Ghost.js';
import type { LayoutData } from '../src/world/MapTypes.js';

describe('Prompt 3 Section 10 & 13: Rating, Elo, Replay & Ghost', () => {
  it('correctly maps Silence Rating (SR) to rank tiers', () => {
    expect(getRankBracket(500)).toBe('Whisper');
    expect(getRankBracket(999)).toBe('Whisper');
    expect(getRankBracket(1000)).toBe('Hush');
    expect(getRankBracket(1299)).toBe('Hush');
    expect(getRankBracket(1300)).toBe('Mute');
    expect(getRankBracket(1599)).toBe('Mute');
    expect(getRankBracket(1600)).toBe('Silent');
    expect(getRankBracket(1899)).toBe('Silent');
    expect(getRankBracket(1900)).toBe('Phantom');
    expect(getRankBracket(2400)).toBe('Phantom');
  });

  it('updates 2, 3, and 4 player Elo with placement K=40 vs standard K=24', () => {
    // 2-player match: player 1 (placement K=40) beats player 2 (standard K=24)
    const updates2 = calculateMatchEloUpdates([
      { id: 'p1', sr: 1000, matchesPlayed: 2 }, // placement K=40
      { id: 'p2', sr: 1000, matchesPlayed: 10 }, // standard K=24
    ]);

    const p1 = updates2.get('p1')!;
    const p2 = updates2.get('p2')!;
    expect(p1.kUsed).toBe(K_FACTOR_PLACEMENT);
    expect(p2.kUsed).toBe(K_FACTOR_STANDARD);
    expect(p1.delta).toBe(20);
    expect(p2.delta).toBe(-12);

    // 3-player match
    const updates3 = calculateMatchEloUpdates([
      { id: 'a', sr: 1200, matchesPlayed: 10 },
      { id: 'b', sr: 1000, matchesPlayed: 10 },
      { id: 'c', sr: 800, matchesPlayed: 10 },
    ]);
    expect(updates3.size).toBe(3);
    expect(updates3.get('a')!.delta).toBeGreaterThan(0);
    expect(updates3.get('c')!.delta).toBeLessThan(0);

    // 4-player match
    const updates4 = calculateMatchEloUpdates([
      { id: 'w', sr: 1100, matchesPlayed: 5 },
      { id: 'x', sr: 1050, matchesPlayed: 5 },
      { id: 'y', sr: 1000, matchesPlayed: 5 },
      { id: 'z', sr: 950, matchesPlayed: 5 },
    ]);
    expect(updates4.size).toBe(4);
    expect(updates4.get('w')!.newSr).toBeGreaterThan(updates4.get('w')!.oldSr);
    expect(updates4.get('z')!.newSr).toBeLessThan(updates4.get('z')!.oldSr);
  });

  it('applies weekly decay and season compression correctly', () => {
    // Weekly decay: -10/week above 1500, floor at 1500
    expect(applyWeeklyDecay(1600, 2)).toBe(1580);
    expect(applyWeeklyDecay(1510, 3)).toBe(1500); // capped at 1500 floor
    expect(applyWeeklyDecay(1450, 4)).toBe(1450); // no decay below 1500

    // Season compression: 25% compression toward 1000
    expect(applySeasonCompression(1000)).toBe(1000);
    expect(applySeasonCompression(1400)).toBe(1300); // 1000 + 400 * 0.75 = 1300
    expect(applySeasonCompression(800)).toBe(850); // 1000 + (-200) * 0.75 = 850
  });

  it('handles ranked quit outcomes: draw before noise, last place after noise', () => {
    const result = resolveRankedQuitOutcome([
      { id: 'finisher', sr: 1000, hasQuit: false, madeNoise: true, placement: 1 },
      { id: 'early_quitter', sr: 1100, hasQuit: true, madeNoise: false },
      { id: 'rage_quitter', sr: 1200, hasQuit: true, madeNoise: true },
    ]);

    expect(result.length).toBe(2);
    expect(result[0]!.id).toBe('finisher');
    expect(result[1]!.id).toBe('rage_quitter');
  });

  it('determines Weekly and Season champions with strict tie-breaking', () => {
    const weeklyWinner = determineWeeklyChampion([
      { playerId: 'bot_unverified', verified: false, rankedEligible: true, score: 2000, noiseUnits: 1, submittedAtTickOrTime: 100 },
      { playerId: 'player_a', verified: true, rankedEligible: true, score: 1500, noiseUnits: 10, submittedAtTickOrTime: 200 },
      { playerId: 'player_b', verified: true, rankedEligible: true, score: 1500, noiseUnits: 5, submittedAtTickOrTime: 300 },
    ]);
    expect(weeklyWinner).not.toBeNull();
    expect(weeklyWinner?.playerId).toBe('player_b');

    const seasonWinner = determineSeasonChampion([
      { playerId: 'smurf', rankedMatches: 5, sr: 2200, noiseUnits: 10, earliestRankDate: 1 },
      { playerId: 'veteran_1', rankedMatches: 25, sr: 1800, noiseUnits: 100, earliestRankDate: 50 },
      { playerId: 'veteran_2', rankedMatches: 30, sr: 1800, noiseUnits: 80, earliestRankDate: 60 },
    ]);
    expect(seasonWinner).not.toBeNull();
    expect(seasonWinner?.playerId).toBe('veteran_2');

    const track = generateSeasonTrack();
    expect(track.length).toBe(30);
    expect(track[0]!.requiredXp).toBe(1000);
    expect(track[29]!.requiredXp).toBe(30000);
    expect(track[29]!.rewardCosmeticId.length).toBeGreaterThan(0);
  });

  it('records runs deterministically and checks 48 KB size cap', () => {
    const recorder = new RunRecorder('natatorium', 12345, 'normal');

    for (let t = 0; t < 120; t++) {
      recorder.recordTick(
        {
          moveX: 0,
          moveZ: 1,
          sprint: true,
          crouch: false,
          jump: false,
          interact: false,
          lookDeltaYaw: 0,
          lookDeltaPitch: 0,
        },
        { x: 0, y: 0.3, z: t * 0.1, yaw: 0 },
      );
    }

    const recording = recorder.finalize();
    expect(recording.header.totalTicks).toBe(120);
    expect(recording.header.simVersion).toBe(RECORDER_SIM_VERSION);
    expect(recording.frames.length).toBe(1);
    expect(recording.frames[0]!.c).toBe(120);

    const sizeValidation = RunRecorder.validateRecordingSize(recording);
    expect(sizeValidation.valid).toBe(true);
    expect(sizeValidation.sizeBytes).toBeLessThan(MAX_RECORDING_SIZE_BYTES);

    const serialized = RunRecorder.serialize(recording);
    const hydrated = RunRecorder.deserialize(serialized);
    expect(hydrated.header.totalTicks).toBe(120);
    expect(hydrated.header.simVersion).toBe(RECORDER_SIM_VERSION);

    const corruptVersionRecording: RunRecording = {
      ...recording,
      header: { ...recording.header, version: 99, simVersion: 99 },
    };
    expect(() => {
      RunRecorder.deserialize(JSON.stringify(corruptVersionRecording));
    }).toThrow(/Incompatible/);
  });

  it('re-simulates recording headlessly and produces matching simHash', () => {
    const dummyLayout: LayoutData = {
      mapId: 'natatorium',
      seed: 42,
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      platforms: [{ id: 'floor', rect: [-20, -20, 20, 20], topY: 0.3, kind: 'tile' }],
      walls: [],
      pillars: [],
      stairs: [],
      waterBodies: [],
      props: [],
      puzzles: [],
      spawns: {
        player: [{ x: 0, y: 0.3, z: 0 }],
        monsters: [],
      },
      exit: { id: 'exit1', position: { x: 0, y: 0.3, z: 15 } },
      meta: {},
    };

    const rec = new RunRecorder('natatorium', 42, 'normal');
    for (let i = 0; i < 30; i++) {
      rec.recordTick({
        moveX: 0,
        moveZ: 1,
        sprint: false,
        crouch: false,
        jump: false,
        interact: false,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
      });
    }
    const recording = rec.finalize();

    const res1 = Replay.run(recording, dummyLayout);
    const res2 = Replay.run(recording, dummyLayout);

    expect(res1.valid).toBe(true);
    expect(res1.simHash).toBe(res2.simHash);

    const badVer: RunRecording = {
      ...recording,
      header: { ...recording.header, version: 99, simVersion: 99 },
    };
    const badRes = Replay.run(badVer, dummyLayout);
    expect(badRes.valid).toBe(false);
    expect(badRes.error).toMatch(/Incompatible sim version/);
  });

  it('interpolates GhostTrajectory and calculates ahead/behind time delta', () => {
    const rec = new RunRecorder('natatorium', 101, 'normal');
    for (let t = 0; t < 60; t++) {
      rec.recordTick(
        {
          moveX: 0,
          moveZ: 1,
          sprint: false,
          crouch: false,
          jump: false,
          interact: false,
          lookDeltaYaw: 0,
          lookDeltaPitch: 0,
        },
        { x: 0, y: 0.3, z: t * 0.1, yaw: 0 },
      );
    }
    const recording = rec.finalize();
    const ghost = new GhostTrajectory(recording);

    const sample = ghost.sampleAt(0.5);
    expect(sample.position.z).toBeGreaterThanOrEqual(0);
    expect(sample.completed).toBe(false);

    const aheadDelta = ghost.computeDelta(0.2, { x: 0, y: 0.3, z: 3.0 });
    expect(aheadDelta.playerAhead).toBe(true);
    expect(aheadDelta.formattedDelta.startsWith('-')).toBe(true);
  });
});

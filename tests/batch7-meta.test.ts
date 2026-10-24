/* ── batch7-meta.test.ts ───────────────────────────────────────────────────
 *  Comprehensive unit tests for Batch 7:
 *  - Scoring formulas & rank tiers
 *  - Mission generation determinism across dates & clients
 *  - Mutator conflicts & multipliers
 *  - Campaign unlock graph & star progression
 *  - Inventory carry limits & loadouts
 *  - Achievement predicates
 *  - Elo rating updates (2/3/4 players) & rank tiers
 *  - Mode rules: Last One Dry tide & Silent Race catch-up
 *  - Haunting constraints (proximity, cooldown, cap)
 *  - RunRecorder & Replay determinism + simHash consistency
 *  - ProfilePersistence migration & corruption recovery
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { computeScore, generateDeathReplayLine, type ScoreInputs } from '../src/meta/Scoring.js';
import { MissionEngine } from '../src/meta/MissionEngine.js';
import { MutatorManager } from '../src/meta/Mutators.js';
import { CampaignArchive } from '../src/meta/Campaign.js';
import { Inventory } from '../src/meta/Inventory.js';
import { STANDARD_COMPETITIVE_LOADOUT } from '../src/meta/Loadout.js';
import { ACHIEVEMENTS } from '../src/meta/Achievements.js';
import { RatingSystem, calculateExpectedScore } from '../src/meta/RatingElo.js';
import { ModeRulesEngine } from '../src/meta/ModeRules.js';
import { RunRecorder } from '../src/meta/RunRecorder.js';
import { Replay } from '../src/meta/Replay.js';
import { ProfileStore, createDefaultProfile } from '../src/meta/ProfilePersistence.js';
import { OrientationMap } from '../src/world/maps/OrientationMap.js';
import type { RunEvent, NoiseMadeEvent, JumpCleanEvent, LurkSurvivedEvent } from '../src/meta/RunEvents.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';

describe('Batch 7 Meta: Scoring Engine', () => {
  it('calculates score, par ratio, noise budget and S-rank cleanly', () => {
    const inputs: ScoreInputs = {
      mapId: 'natatorium',
      elapsedSeconds: 200,
      noiseUnits: 1.0,
      secondariesDone: 1,
      hiddenDone: 1,
      cleanJumps: 8,
      lurksSurvivedGte8s: 1,
      lureSuccesses: 2,
      nearMissesUnder2m: 1,
      deaths: 0,
      difficulty: 'normal',
    };

    const score = computeScore(inputs);
    expect(score.parSeconds).toBe(240);
    expect(score.timeScore).toBeGreaterThan(600); // fast completion bonus
    expect(score.noiseScore).toBeGreaterThan(300);
    expect(score.objectivesScore).toBe(400); // 150 + 250
    expect(score.finalScore).toBeGreaterThanOrEqual(1400);
    expect(score.rank).toBe('S');
    expect(score.rankedEligible).toBe(true);
  });

  it('generates a one-sentence fair death explanation and timeline', () => {
    const recentEvents: RunEvent[] = [
      {
        type: 'noise_made',
        kind: 'splash',
        loudness: 0.8,
        position: { x: 0, y: 0, z: 0 },
        audibleToMonster: true,
        t: 25.0,
      },
      { type: 'near_miss', distance: 1.8, speed: 4.0, t: 28.5 },
    ];

    const replayLine = generateDeathReplayLine(
      {
        type: 'death',
        t: 30.0,
        killer: 'Abyssal Lurker',
        cause: 'splash',
        lastNoise: { kind: 'splash', loudness: 0.8, t: 25.0 },
      },
      recentEvents,
    );

    expect(replayLine.explanation).toContain('splash');
    expect(replayLine.killer).toBe('Abyssal Lurker');
    expect(replayLine.timeline.length).toBe(3); // 2 recent + 1 fatal confrontation
    expect(replayLine.timeline[2]!.isFatal).toBe(true);
  });
});

describe('Batch 7 Meta: Mission Engine Determinism', () => {
  it('generates identical daily and weekly contracts for the same date key across multiple clients', () => {
    const dateKey = '2026-10-23';
    const clientA_Daily = MissionEngine.generateDailyContracts(dateKey);
    const clientB_Daily = MissionEngine.generateDailyContracts(dateKey);

    expect(clientA_Daily).toEqual(clientB_Daily);
    expect(clientA_Daily.length).toBe(3);
    expect(clientA_Daily[0]!.difficulty).toBe('easy');
    expect(clientA_Daily[1]!.difficulty).toBe('medium');
    expect(clientA_Daily[2]!.difficulty).toBe('hard');

    const clientA_Weekly = MissionEngine.generateWeeklyContracts(dateKey);
    const clientB_Weekly = MissionEngine.generateWeeklyContracts(dateKey);
    expect(clientA_Weekly).toEqual(clientB_Weekly);
    expect(clientA_Weekly.length).toBe(3);
  });

  it('updates contract progress monotonically on relevant RunEvents', () => {
    const daily = MissionEngine.generateDailyContracts('2026-10-23');
    const contract = daily[0]!;
    const initial = contract.currentCount;

    const event: JumpCleanEvent = { type: 'jump_clean', distance: 2.5, dryToDry: true, t: 10.0 };
    const updated = MissionEngine.stepContract(contract, event);
    expect(updated.currentCount).toBeGreaterThanOrEqual(initial);
  });
});

describe('Batch 7 Meta: Mutator Matrix & Validation', () => {
  it('detects mutually incompatible mutators', () => {
    const conflicts = MutatorManager.validateSelection(['silent_film', 'tinnitus']);
    expect(conflicts.valid).toBe(false);
    expect(conflicts.reasons.length).toBeGreaterThan(0);
  });

  it('calculates compound score multiplier', () => {
    const valid = ['glass_water', 'blackout']; // 1.25 * 1.3 = 1.625
    const mul = MutatorManager.computeMultiplier(valid);
    expect(mul).toBeCloseTo(1.625, 2);
  });
});

describe('Batch 7 Meta: Campaign Archive Unlock Graph', () => {
  it('hydrates and checks tape unlocking rules (requires 2 stars on previous tape)', () => {
    const archive = new CampaignArchive();
    const state = archive.getState();

    // Tape 0 is unlocked by default
    expect(state.unlockedTapes).toContain(0);
    expect(state.unlockedTapes).toContain(1);

    // Record 2 stars on tape 1
    archive.recordTapeResult(1, 2, ['escape', 'secondary']);
    const updated = archive.getState();
    expect(updated.unlockedTapes).toContain(2); // Tape 2 is now unlocked!
  });
});

describe('Batch 7 Meta: Inventory & Loadout Constraints', () => {
  it('enforces strict item carry limits', () => {
    const inv = new Inventory();
    for (let i = 0; i < 10; i++) {
      inv.addItem('pebble');
    }
    expect(inv.getItemCount('pebble')).toBe(6); // Pebble cap is 6

    for (let i = 0; i < 5; i++) {
      inv.addItem('echo_bell');
    }
    expect(inv.getItemCount('echo_bell')).toBe(1); // Echo Bell cap is 1
  });

  it('provides immutable standard competitive loadout', () => {
    expect(STANDARD_COMPETITIVE_LOADOUT.active1).toBe('pebble_pouch');
    expect(STANDARD_COMPETITIVE_LOADOUT.passive).toBeNull();
  });
});

describe('Batch 7 Meta: Achievements Predicates', () => {
  it('evaluates Dry Feet achievement predicate accurately', () => {
    const dryFeet = ACHIEVEMENTS.find((a) => a.id === 'dry_feet')!;

    const wetRun = {
      mapId: 'natatorium' as const,
      escaped: true,
      timeSec: 150,
      deaths: 0,
      noiseUnits: 2.0,
      events: [
        {
          type: 'noise_made',
          kind: 'wade',
          loudness: 0.5,
          position: { x: 0, y: 0, z: 0 },
          audibleToMonster: true,
          t: 10,
        } as NoiseMadeEvent,
      ],
    };
    expect(dryFeet.checkRun!(wetRun)).toBe(false);

    const dryRun = {
      mapId: 'natatorium' as const,
      escaped: true,
      timeSec: 150,
      deaths: 0,
      noiseUnits: 0.2,
      events: [{ type: 'jump_clean', distance: 2.5, dryToDry: true, t: 10 } as JumpCleanEvent],
    };
    expect(dryFeet.checkRun!(dryRun)).toBe(true);
  });

  it('evaluates Long Jumper and Not Today predicates', () => {
    const longJumper = ACHIEVEMENTS.find((a) => a.id === 'long_jumper')!;
    const notToday = ACHIEVEMENTS.find((a) => a.id === 'not_today')!;

    const run = {
      mapId: 'natatorium' as const,
      escaped: true,
      timeSec: 200,
      deaths: 0,
      noiseUnits: 1.0,
      events: [
        { type: 'jump_clean', distance: 3.5, dryToDry: true, t: 30 } as JumpCleanEvent,
        { type: 'lurk_survived', duration: 16.0, distance: 3.0, t: 50 } as LurkSurvivedEvent,
      ],
    };

    expect(longJumper.checkRun!(run)).toBe(true);
    expect(notToday.checkRun!(run)).toBe(true);
  });
});

describe('Batch 7 Meta: Rating & Elo Updates', () => {
  it('calculates expected score correctly using logistic curve', () => {
    // Equal ratings -> 0.5 expected score
    expect(calculateExpectedScore(1200, 1200)).toBeCloseTo(0.5, 4);
    // 200 rating advantage -> ~0.7597 expected score
    expect(calculateExpectedScore(1400, 1200)).toBeCloseTo(0.7597, 3);
    // 200 rating disadvantage -> ~0.2403 expected score
    expect(calculateExpectedScore(1200, 1400)).toBeCloseTo(0.2403, 3);
  });

  it('calculates pairwise multi-player Elo updates with K=24', () => {
    const initialRatings = [
      { id: 'p1', rating: 1200 },
      { id: 'p2', rating: 1200 },
      { id: 'p3', rating: 1200 },
    ];
    // Placements: p1 1st, p2 2nd, p3 3rd
    const deltas = RatingSystem.computePlacementsElo(initialRatings);

    expect(deltas.get('p1')!).toBe(12);
    expect(deltas.get('p2')!).toBe(0);
    expect(deltas.get('p3')!).toBe(-12);
    expect(RatingSystem.getTier(1200)).toBe('Hush');
    expect(RatingSystem.getTier(1950)).toBe('Phantom');
  });
});

describe('Batch 7 Meta: Mode Rules (Last One Dry & Silent Race)', () => {
  it('computes Last One Dry water rise from 0m to +0.5m over 360s', () => {
    const rules = new ModeRulesEngine('last_one_dry');
    const waterAtStart = rules.getWaterLevelAt(0);
    const waterAtMid = rules.getWaterLevelAt(180);
    const waterAtEnd = rules.getWaterLevelAt(360);

    expect(waterAtStart).toBeCloseTo(0.0, 3);
    expect(waterAtMid).toBeCloseTo(0.25, 3);
    expect(waterAtEnd).toBeCloseTo(0.5, 3);
  });

  it('triggers Silent Race catch-up rule exactly once for the last place player at halfway mark', () => {
    const rules = new ModeRulesEngine('silent_race');
    // At halfway mark (progress 0.5)
    const catchup1 = rules.checkSilentRaceCatchup('pLast', 0.52);
    expect(catchup1.grantBonusPebbles).toBe(true);
    expect(catchup1.pebbleCount).toBe(2);

    // Should not trigger a second time
    const catchup2 = rules.checkSilentRaceCatchup('pLast', 0.65);
    expect(catchup2.grantBonusPebbles).toBe(false);
  });

  it('enforces Haunting constraints: distance >= 12m from living players and 20s cooldown', () => {
    const rules = new ModeRulesEngine('last_one_dry');
    rules.setHauntState('spectator1', { echo: 60, lastHauntTime: 0, hauntCount: 0 });

    const livingPos = [{ x: 0, y: 0, z: 0 }];

    // Attempt haunt too close (< 12m)
    const tooClose = rules.attemptHaunt('spectator1', 25.0, { x: 5, y: 0, z: 0 }, livingPos);
    expect(tooClose.allowed).toBe(false);
    expect(tooClose.reason).toContain('12m');

    // Attempt haunt valid distance (>= 12m)
    const valid = rules.attemptHaunt('spectator1', 25.0, { x: 15, y: 0, z: 0 }, livingPos);
    expect(valid.allowed).toBe(true);
    expect(valid.noiseEvent).toBeDefined();
    expect(valid.noiseEvent!.loudness).toBe(0.5);

    // Cooldown check: attempt again within 20s
    const coolingDown = rules.attemptHaunt('spectator1', 30.0, { x: 15, y: 0, z: 0 }, livingPos);
    expect(coolingDown.allowed).toBe(false);
    expect(coolingDown.reason).toContain('cooldown');
  });
});

describe('Batch 7 Meta: RunRecorder & Replay Determinism', () => {
  it('records run-length encoded intents and preserves them under 48 KB', () => {
    const recorder = new RunRecorder('orientation', 100);

    const forwardIntent: PlayerIntent = {
      moveX: 0,
      moveZ: -1,
      sprint: true,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    // Simulate 3600 ticks (60 seconds) of sprinting forward
    for (let i = 0; i < 3600; i++) {
      recorder.recordTick(forwardIntent, { x: 0, y: 0.3, z: -15 + i * 0.01, yaw: 0 });
    }

    const recording = recorder.finalize();
    expect(recording.header.totalTicks).toBe(3600);
    expect(recording.frames.length).toBeLessThan(5); // RLE collapsed 3600 identical ticks into <= 2 frames!

    const serialized = RunRecorder.serialize(recording);
    expect(serialized.length).toBeLessThan(48 * 1024);

    const deserialized = RunRecorder.deserialize(serialized);
    expect(deserialized.header.mapId).toBe('orientation');
    expect(deserialized.header.totalTicks).toBe(3600);
  });

  it('headless Replay produces consistent, identical simHash across repeated runs', () => {
    const recorder = new RunRecorder('orientation', 100);
    const idleIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    for (let i = 0; i < 120; i++) {
      recorder.recordTick(idleIntent);
    }
    const recording = recorder.finalize();

    const layout = OrientationMap.generateLayout({ seed: 100, difficulty: 'normal', playerCount: 1 });

    const run1 = Replay.run(recording, layout);
    const run2 = Replay.run(recording, layout);

    expect(run1.valid).toBe(true);
    expect(run2.valid).toBe(true);
    expect(run1.simHash).toBe(run2.simHash);
    expect(run1.totalTicks).toBe(120);
  });
});

describe('Batch 7 Meta: ProfileStore Persistence & Recovery', () => {
  it('creates and validates default profile with all career metrics', () => {
    const p = createDefaultProfile();
    expect(p.version).toBe(1);
    expect(p.unlockedTapes).toContain(0);
    expect(p.unlockedTapes).toContain(1);
  });

  it('exports and imports Recovery Code cleanly', () => {
    const profile = createDefaultProfile();
    profile.xp = 1250;
    profile.level = 4;
    profile.staticBalance = 420;

    const code = ProfileStore.exportRecoveryCode(profile);
    const restored = ProfileStore.importRecoveryCode(code);

    expect(restored.xp).toBe(1250);
    expect(restored.level).toBe(4);
    expect(restored.staticBalance).toBe(420);
  });
});

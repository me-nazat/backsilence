import { describe, it, expect } from 'vitest';
import { computeScore, generateDeathReplayLine, type ScoreInputs } from '../src/meta/Scoring.js';
import { Inventory, ITEM_DEFS, validateResourceBudget } from '../src/meta/Inventory.js';
import {
  ACTIVE_LOADOUT_OPTIONS,
  PASSIVE_LOADOUT_OPTIONS,
  STANDARD_COMPETITIVE_LOADOUT,
  computePassiveEffects,
  createStartingInventory,
} from '../src/meta/Loadout.js';
import { MUTATORS, MutatorManager } from '../src/meta/Mutators.js';
import { computeRunStatic, EconomyLedger } from '../src/meta/Economy.js';
import type { RunEvent, DeathEvent } from '../src/meta/RunEvents.js';

describe('Prompt 3 Section 8 & 9: Scoring, Resources, Loadout & Mutators', () => {
  describe('Scoring Formula & Rank Thresholds', () => {
    it('computes every term of the score breakdown accurately', () => {
      const inputs: ScoreInputs = {
        mapId: 'natatorium', // par: 240, budget: 8.0
        difficulty: 'normal',
        elapsedSeconds: 200,
        noiseUnits: 2.0,
        secondariesDone: 2,
        hiddenDone: 1,
        cleanJumps: 4,
        lurksSurvivedGte8s: 2,
        lureSuccesses: 2,
        nearMissesUnder2m: 1,
        deaths: 0,
        escaped: true,
      };

      const breakdown = computeScore(inputs);

      // timeScore: 600 * clamp(240 / 200, 0.4, 1.6) = 600 * 1.2 = 720
      expect(breakdown.timeScore).toBe(720);

      // noiseScore: 400 * (1 - clamp(2.0 / 8.0, 0, 1)) = 400 * 0.75 = 300
      expect(breakdown.noiseScore).toBe(300);

      // objectives: 150 * 2 + 250 * 1 = 550
      expect(breakdown.objectivesScore).toBe(550);

      // style: min(300, 25*4 + 40*2 + 60*2 + 30*1) = min(300, 100 + 80 + 120 + 30) = min(300, 330) = 300
      expect(breakdown.styleScore).toBe(300);

      // penalty: 150 * 0 = 0
      expect(breakdown.penaltyScore).toBe(0);

      // rawScore: 720 + 300 + 550 + 300 = 1870
      expect(breakdown.rawScore).toBe(1870);

      // finalScore: round(1870 * 1.0 * 1.0 * 1.0) = 1870
      expect(breakdown.finalScore).toBe(1870);
      expect(breakdown.rank).toBe('S'); // S >= 1400
    });

    it('enforces anti-exploit rule: non-escaping run earns 0 time score', () => {
      const inputs: ScoreInputs = {
        mapId: 'natatorium',
        difficulty: 'normal',
        elapsedSeconds: 150,
        noiseUnits: 1.0,
        secondariesDone: 1,
        hiddenDone: 0,
        cleanJumps: 2,
        lurksSurvivedGte8s: 0,
        lureSuccesses: 0,
        nearMissesUnder2m: 0,
        deaths: 1,
        escaped: false, // failed to escape
      };

      const score = computeScore(inputs);
      expect(score.timeScore).toBe(0);
    });

    it('applies difficulty and assist multipliers correctly', () => {
      const baseInputs: ScoreInputs = {
        mapId: 'natatorium',
        difficulty: 'whisper', // 0.8x
        elapsedSeconds: 240,
        noiseUnits: 0,
        secondariesDone: 0,
        hiddenDone: 0,
        cleanJumps: 0,
        lurksSurvivedGte8s: 0,
        lureSuccesses: 0,
        nearMissesUnder2m: 0,
        deaths: 0,
        escaped: true,
        hasAssists: true, // 0.8x
      };

      // rawScore = 600 (time) + 400 (noise) = 1000
      // totalMultiplier = 0.8 * 0.8 = 0.64
      // finalScore = 640 -> Rank C (500-799)
      const res = computeScore(baseInputs);
      expect(res.difficultyMultiplier).toBe(0.8);
      expect(res.assistMultiplier).toBe(0.8);
      expect(res.finalScore).toBe(640);
      expect(res.rank).toBe('C');
    });

    it('generates Death Replay Line with cause, timestamp, and mini-timeline', () => {
      const death: DeathEvent = {
        type: 'death',
        killer: 'The Elder Entity',
        cause: 'acoustic_pounce',
        lastNoise: {
          kind: 'splash',
          loudness: 0.8,
          t: 124.5,
        },
        t: 125.0,
      };

      const events: RunEvent[] = [
        { type: 'noise_made', kind: 'splash', position: { x: 0, y: 0, z: 0 }, loudness: 0.8, audibleToMonster: true, t: 124.5 },
        { type: 'near_miss', distance: 1.8, speed: 4.5, t: 110.0 },
      ];

      const replay = generateDeathReplayLine(death, events);
      expect(replay.explanation).toContain('splash in the water');
      expect(replay.timestampStr).toBe('02:05');
      expect(replay.killer).toBe('The Elder Entity');
      expect(replay.timeline.length).toBeGreaterThanOrEqual(2);
      expect(replay.timeline[replay.timeline.length - 1]!.isFatal).toBe(true);
    });
  });

  describe('Inventory, Items & Resource Budget', () => {
    it('enforces carry limits across all 8 items', () => {
      expect(ITEM_DEFS.pebble.maxCarry).toBe(6);
      expect(ITEM_DEFS.bottle.maxCarry).toBe(3);
      expect(ITEM_DEFS.noisemaker.maxCarry).toBe(2);
      expect(ITEM_DEFS.glow_stick.maxCarry).toBe(3);
      expect(ITEM_DEFS.battery_cell.maxCarry).toBe(3);
      expect(ITEM_DEFS.echo_bell.maxCarry).toBe(1);
      expect(ITEM_DEFS.emp.maxCarry).toBe(2);

      const inv = new Inventory();
      expect(inv.add('pebble', 10)).toBe(6); // clamped to 6
      expect(inv.get('pebble')).toBe(6);
      expect(inv.add('emp', 5)).toBe(2); // clamped to 2
      expect(inv.get('emp')).toBe(2);
    });

    it('validates resource budget rule (<=70% perfect run, <=100% recovery run)', () => {
      // 10 items placed on map:
      // Perfect run using 7 items (70%) -> valid
      expect(validateResourceBudget(7, 10, false).valid).toBe(true);

      // Perfect run using 8 items (80%) -> invalid
      expect(validateResourceBudget(8, 10, false).valid).toBe(false);

      // Recovery run using 10 items (100%) -> valid
      expect(validateResourceBudget(10, 10, true).valid).toBe(true);

      // Recovery run using 11 items (110%) -> invalid
      expect(validateResourceBudget(11, 10, true).valid).toBe(false);
    });
  });

  describe('Loadouts & Competitive Rules', () => {
    it('provides 5 active choices and 4 passive perks', () => {
      expect(ACTIVE_LOADOUT_OPTIONS).toHaveLength(5);
      expect(PASSIVE_LOADOUT_OPTIONS).toHaveLength(4);

      // Padded Soles reduces crouch wade noise by 15% and speed by 5%
      const padded = computePassiveEffects('padded_soles');
      expect(padded.crouchWadeNoiseMul).toBe(0.85);
      expect(padded.wadeSpeedMul).toBe(0.95);

      // Steady Breath boosts stamina regen by 15%
      const breath = computePassiveEffects('steady_breath');
      expect(breath.staminaRegenMul).toBe(1.15);

      // Standard loadout is fixed for competitive modes
      expect(STANDARD_COMPETITIVE_LOADOUT.active1).toBe('pebble_pouch');
      expect(STANDARD_COMPETITIVE_LOADOUT.active2).toBeNull();
      expect(STANDARD_COMPETITIVE_LOADOUT.passive).toBeNull();

      const inv = createStartingInventory(STANDARD_COMPETITIVE_LOADOUT);
      expect(inv.get('pebble')).toBe(3);
    });
  });

  describe('Mutators & Economy', () => {
    it('validates 12 mutators, detects conflicts, and computes total multipliers', () => {
      expect(Object.keys(MUTATORS)).toHaveLength(12);

      // Glass Water (1.25) + Blackout (1.30)
      const valid = MutatorManager.validateMutators(['glass_water', 'blackout']);
      expect(valid.valid).toBe(true);
      expect(valid.totalMultiplier).toBeCloseTo(1.625, 3);

      // Silent Film (1.40) conflicts with Tinnitus (1.20)
      const conflict = MutatorManager.validateMutators(['silent_film', 'tinnitus']);
      expect(conflict.valid).toBe(false);
      expect(conflict.errors.length).toBeGreaterThan(0);
    });

    it('computes Static earnings per run and maintains deterministic ledger', () => {
      // floor(final / 40) + 10 * objectives + 20 (first run bonus)
      // floor(1400 / 40) = 35 + 20 + 20 = 75
      const staticEarned = computeRunStatic(1400, 2, true);
      expect(staticEarned).toBe(75);

      const ledger = new EconomyLedger(100);
      expect(ledger.credit(75, 'Run complete')).toBe(true);
      expect(ledger.getBalance()).toBe(175);
      expect(ledger.debit(150, 'Purchase cosmetic')).toBe(true);
      expect(ledger.getBalance()).toBe(25);
      expect(ledger.debit(50, 'Overdraft attempt')).toBe(false);
    });
  });
});

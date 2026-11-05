/* ── campaign-descent.test.ts ─────────────────────────────────────────────
 *  Prompt 8 Verification Suite: 3-Stage Descent Campaign & Inverted Acoustics.
 *  1. 3-Stage structure: Poolrooms (natatorium) -> The Drain (drainage_core) -> Level 0 (poolrooms).
 *  2. Stage 2 rising-water pressure (+0.1 m/min) and machinery objectives.
 *  3. Stage 3 Level 0 water drainage (30s) and inverted acoustic rule:
 *     - Wet steps on dry tile echo (loudness 0.35 walk, 0.75 sprint).
 *     - Creature wader speed slows to 1.4 m/s.
 *     - Stillness remains 0 loudness (never heard).
 *  4. Diegetic stage transitions: drain_pipes -> descending_stairs -> shifting_door.
 *  5. Achievements: Dry Descent, Loopbreaker, and Stillness.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { DescentCampaignRun, DESCENT_STAGES } from '../src/meta/Campaign.js';
import { AcousticBus, RULEBOOK_CONSTANTS } from '../src/sim/AcousticBus.js';
import { MonsterBrain } from '../src/sim/MonsterBrain.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { ACHIEVEMENTS } from '../src/meta/Achievements.js';

describe('Prompt 8 Phase B: 3-Stage Descent Campaign (Poolrooms -> The Drain -> Level 0)', () => {
  it('defines the canonical 3-stage descent progression using existing maps', () => {
    expect(DESCENT_STAGES).toHaveLength(3);

    // Stage 1: The Poolrooms
    const s1 = DESCENT_STAGES[0]!;
    expect(s1.stageId).toBe('stage_1_poolrooms');
    expect(s1.mapId).toBe('natatorium');
    expect(s1.transitionType).toBe('drain_pipes');
    expect(s1.risingWaterPressureRate).toBe(0.0);
    expect(s1.isInvertedAcoustics).toBe(false);

    // Stage 2: The Drain
    const s2 = DESCENT_STAGES[1]!;
    expect(s2.stageId).toBe('stage_2_the_drain');
    expect(s2.mapId).toBe('drainage_core');
    expect(s2.transitionType).toBe('descending_stairs');
    expect(s2.risingWaterPressureRate).toBeCloseTo(0.1 / 60.0, 5); // +0.1 m/min
    expect(s2.isInvertedAcoustics).toBe(false);

    // Stage 3: Level 0
    const s3 = DESCENT_STAGES[2]!;
    expect(s3.stageId).toBe('stage_3_level_0');
    expect(s3.mapId).toBe('poolrooms');
    expect(s3.transitionType).toBe('shifting_door');
    expect(s3.risingWaterPressureRate).toBeLessThan(0.0); // water drains away
    expect(s3.isInvertedAcoustics).toBe(true); // acoustic rule inverted
  });

  it('progresses sequentially through Stages 1, 2, and 3, tracking stage times, noise, and anomalies', () => {
    const run = new DescentCampaignRun(2026);
    expect(run.stageIndex).toBe(1);
    expect(run.isRunCompleted).toBe(false);
    expect(run.getCurrentStage().stageId).toBe('stage_1_poolrooms');

    // Complete Stage 1
    const r1 = run.completeCurrentStage({
      timeSeconds: 145.0,
      noiseUnits: 12.5,
      anomaliesSurvived: 2,
      waterTouched: false,
    });
    expect(r1.runCompleted).toBe(false);
    expect(r1.nextStage?.stageId).toBe('stage_2_the_drain');
    expect(run.stageIndex).toBe(2);

    // Complete Stage 2
    const r2 = run.completeCurrentStage({
      timeSeconds: 180.0,
      noiseUnits: 28.0,
      anomaliesSurvived: 3,
      waterTouched: true,
    });
    expect(r2.runCompleted).toBe(false);
    expect(r2.nextStage?.stageId).toBe('stage_3_level_0');
    expect(run.stageIndex).toBe(3);

    // Complete Stage 3
    const r3 = run.completeCurrentStage({
      timeSeconds: 95.0,
      noiseUnits: 8.0,
      anomaliesSurvived: 1,
      waterTouched: false,
    });
    expect(r3.runCompleted).toBe(true);
    expect(r3.nextStage).toBeNull();
    expect(run.isRunCompleted).toBe(true);

    const summary = run.getSummary();
    expect(summary.totalTimeSeconds).toBe(145.0 + 180.0 + 95.0);
    expect(summary.totalNoiseUnits).toBe(12.5 + 28.0 + 8.0);
    expect(summary.totalAnomaliesSurvived).toBe(2 + 3 + 1);
    expect(summary.stages).toHaveLength(3);
  });

  describe('Stage 3: Level 0 Inverted Acoustic Rule & Slowed Entity', () => {
    it('inverts the acoustic rule on dry tile: wet steps echo, sprint echoes loud, but stillness is 0', () => {
      const bus = new AcousticBus();

      // Normal mode: locomotion on dry tile is completely silent (0 loudness)
      bus.setLevel0Inversion(false);
      bus.step(0.1, {
        pos: { x: 0, y: 0.38, z: 0 },
        vel: { x: 2.0, y: 0, z: 0 },
        onGround: true,
        isInWater: false,
        isOnDryPlatform: true,
        crouching: false,
        sprinting: false,
      }, 0.0);
      expect(bus.effectiveLoudness).toBe(RULEBOOK_CONSTANTS.DRY_PLATFORM_LOCOMOTION);
      expect(bus.effectiveLoudness).toBe(0);

      // Level 0 Inverted mode: wet steps on dry tile echo
      bus.setLevel0Inversion(true);
      expect(bus.getLevel0Inversion()).toBe(true);

      // 1. Moving normal walk on dry tile (horizSpeed >= threshold)
      bus.step(0.1, {
        pos: { x: 0.2, y: 0.38, z: 0 },
        vel: { x: 2.0, y: 0, z: 0 },
        onGround: true,
        isInWater: false,
        isOnDryPlatform: true,
        crouching: false,
        sprinting: false,
      }, 0.1);
      expect(bus.effectiveLoudness).toBe(RULEBOOK_CONSTANTS.LEVEL0_WET_STEP);
      expect(bus.effectiveLoudness).toBe(0.35);

      // 2. Sprinting on dry tile
      bus.step(0.1, {
        pos: { x: 0.6, y: 0.38, z: 0 },
        vel: { x: 4.5, y: 0, z: 0 },
        onGround: true,
        isInWater: false,
        isOnDryPlatform: true,
        crouching: false,
        sprinting: true,
      }, 0.2);
      expect(bus.effectiveLoudness).toBe(RULEBOOK_CONSTANTS.LEVEL0_WET_SPRINT);
      expect(bus.effectiveLoudness).toBe(0.75);

      // 3. Crouch-creeping on dry tile
      bus.step(0.1, {
        pos: { x: 0.7, y: 0.38, z: 0 },
        vel: { x: 1.0, y: 0, z: 0 },
        onGround: true,
        isInWater: false,
        isOnDryPlatform: true,
        crouching: true,
        sprinting: false,
      }, 0.3);
      expect(bus.effectiveLoudness).toBe(RULEBOOK_CONSTANTS.LEVEL0_CROUCH_CREEP);
      expect(bus.effectiveLoudness).toBe(0.12);

      // 4. Standing completely still on dry tile is STILL completely silent
      bus.step(0.1, {
        pos: { x: 0.7, y: 0.38, z: 0 },
        vel: { x: 0, y: 0, z: 0 }, // still
        onGround: true,
        isInWater: false,
        isOnDryPlatform: true,
        crouching: false,
        sprinting: false,
      }, 0.4);
      expect(bus.effectiveLoudness).toBe(RULEBOOK_CONSTANTS.STANDING_STILL_ANY);
      expect(bus.effectiveLoudness).toBe(0);
    });

    it('slows the creature to exactly 1.4 m/s in Level 0 drained environment', () => {
      const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.5);
      const nav = new NavGrid(ground, 0.5);
      const monster = new MonsterBrain({
        id: 'monster_l0',
        variant: 'standard',
        spawn: { x: 0, y: 0.38, z: 10 },
      }, nav, 12345);

      // Normal state: stalk speed is 2.4 m/s
      expect(MonsterBrain.SPEED_STALK).toBe(2.4);
      expect(monster.speedMul).toBe(1.0);

      // Activate Level 0 drained state
      monster.setLevel0Drained(true);
      expect(monster.isLevel0Drained).toBe(true);

      // 2.4 m/s * (1.4 / 2.4) = 1.4 m/s
      const effectiveStalkSpeed = MonsterBrain.SPEED_STALK * monster.speedMul;
      expect(effectiveStalkSpeed).toBeCloseTo(1.4, 2);
    });
  });

  describe('Prompt 8 Achievements: Dry Descent, Loopbreaker, Stillness', () => {
    it('awards "Dry Descent" when Stage 1 is completed without water entry or splashing', () => {
      const dryDescentAch = ACHIEVEMENTS.find((a) => a.id === 'dry_descent')!;
      expect(dryDescentAch).toBeDefined();

      // Run with water entry fails
      const wetRun = {
        mapId: 'natatorium' as const,
        escaped: true,
        timeSec: 120,
        deaths: 0,
        noiseUnits: 10,
        events: [
          { type: 'noise_made' as const, kind: 'wade', t: 10, pos: { x: 0, y: 0, z: 0 }, loudness: 0.35, source: 'player' as const },
        ],
      };
      expect(dryDescentAch.checkRun!(wetRun as never)).toBe(false);

      // Clean dry run succeeds
      const dryRun = {
        mapId: 'natatorium' as const,
        escaped: true,
        timeSec: 130,
        deaths: 0,
        noiseUnits: 0,
        events: [],
      };
      expect(dryDescentAch.checkRun!(dryRun as never)).toBe(true);
    });

    it('awards "Loopbreaker" when 3 reality loops are escaped', () => {
      const loopAch = ACHIEVEMENTS.find((a) => a.id === 'loopbreaker')!;
      expect(loopAch).toBeDefined();

      const runWith2Loops = {
        mapId: 'natatorium' as const,
        escaped: true,
        timeSec: 200,
        deaths: 0,
        noiseUnits: 5,
        events: [
          { type: 'loop_escaped' as const, t: 30 },
          { type: 'loop_escaped' as const, t: 90 },
        ],
      };
      expect(loopAch.checkRun!(runWith2Loops as never)).toBe(false);

      const runWith3Loops = {
        mapId: 'natatorium' as const,
        escaped: true,
        timeSec: 200,
        deaths: 0,
        noiseUnits: 5,
        events: [
          { type: 'loop_escaped' as const, t: 30 },
          { type: 'loop_escaped' as const, t: 90 },
          { type: 'loop_escaped' as const, t: 150 },
        ],
      };
      expect(loopAch.checkRun!(runWith3Loops as never)).toBe(true);
    });

    it('awards "Stillness" when surviving an INVESTIGATE phase while frozen still at <= 3m', () => {
      const stillnessAch = ACHIEVEMENTS.find((a) => a.id === 'stillness')!;
      expect(stillnessAch).toBeDefined();

      const runFar = {
        mapId: 'natatorium' as const,
        escaped: true,
        timeSec: 100,
        deaths: 0,
        noiseUnits: 0,
        events: [
          { type: 'lurk_survived' as const, distance: 4.5, t: 25 },
        ],
      };
      expect(stillnessAch.checkRun!(runFar as never)).toBe(false);

      const runClose = {
        mapId: 'natatorium' as const,
        escaped: true,
        timeSec: 100,
        deaths: 0,
        noiseUnits: 0,
        events: [
          { type: 'lurk_survived' as const, distance: 2.2, t: 25 },
        ],
      };
      expect(stillnessAch.checkRun!(runClose as never)).toBe(true);
    });
  });
});

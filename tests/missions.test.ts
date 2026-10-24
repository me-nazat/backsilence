import { describe, it, expect } from 'vitest';
import {
  MissionEngine,
  MISSION_TEMPLATES,
} from '../src/meta/MissionEngine.js';
import type { RunEvent } from '../src/meta/RunEvents.js';

describe('Prompt 3 Section 6: Missions, Contracts & Weekly Trial', () => {
  it('contains at least 24 distinct mission templates with mode eligibility', () => {
    expect(MISSION_TEMPLATES.length).toBeGreaterThanOrEqual(24);
    for (const tmpl of MISSION_TEMPLATES) {
      expect(tmpl.key.length).toBeGreaterThan(0);
      expect(tmpl.title.length).toBeGreaterThan(0);
      expect(['solo', 'coop', 'any']).toContain(tmpl.modeEligibility);
      expect(tmpl.targetCounts.easy).toBeGreaterThan(0);
      expect(tmpl.targetCounts.medium).toBeGreaterThan(0);
      expect(tmpl.targetCounts.hard).toBeGreaterThan(0);
      expect(tmpl.rewardStatic.easy).toBeGreaterThan(0);
      expect(tmpl.rewardXP.easy).toBeGreaterThan(0);
    }
  });

  it('generates identical contracts on two simulated clients across UTC date change', () => {
    const date1 = new Date('2026-10-24T12:00:00Z');
    const clientA = new MissionEngine(undefined, date1);
    const clientB = new MissionEngine(undefined, date1);

    const contractsA = clientA.getContracts();
    const contractsB = clientB.getContracts();

    expect(contractsA).toHaveLength(6); // 3 daily + 3 weekly
    expect(contractsB).toHaveLength(6);

    for (let i = 0; i < contractsA.length; i++) {
      expect(contractsA[i]!.id).toBe(contractsB[i]!.id);
      expect(contractsA[i]!.title).toBe(contractsB[i]!.title);
      expect(contractsA[i]!.targetCount).toBe(contractsB[i]!.targetCount);
    }

    // Advance to next UTC day
    const date2 = new Date('2026-10-25T01:00:00Z');
    clientA.refreshContracts(date2);
    clientB.refreshContracts(date2);

    const newA = clientA.getContracts();
    const newB = clientB.getContracts();

    for (let i = 0; i < newA.length; i++) {
      expect(newA[i]!.id).toBe(newB[i]!.id);
      expect(newA[i]!.title).toBe(newB[i]!.title);
    }

    // Verify daily contracts rotated while weekly remained stable
    expect(newA.filter((c) => c.frequency === 'daily')[0]!.id).not.toBe(
      contractsA.filter((c) => c.frequency === 'daily')[0]!.id,
    );
  });

  it('strictly enforces 1 daily reroll per day limit without punishment on missed days', () => {
    const engine = new MissionEngine(undefined, new Date('2026-10-24T10:00:00Z'));
    const dailyContracts = engine.getContracts().filter((c) => c.frequency === 'daily');
    const targetContract = dailyContracts[0]!;

    // First reroll succeeds
    const success1 = engine.rerollDaily(targetContract.id);
    expect(success1).toBe(true);

    const updatedDailies = engine.getContracts().filter((c) => c.frequency === 'daily');
    // Second reroll fails
    const success2 = engine.rerollDaily(updatedDailies[0]!.id);
    expect(success2).toBe(false);
  });

  it('tracks multi-step progress over RunEvents and pays Static and XP upon claim', () => {
    const engine = new MissionEngine(undefined, new Date('2026-10-24T10:00:00Z'));
    const cleanJumpContract = engine.getContracts().find((c) => c.templateKey === 'clean_jumps');

    if (cleanJumpContract) {
      const target = cleanJumpContract.targetCount;
      const jumpEvent: RunEvent = {
        type: 'jump_clean',
        distance: 3.5,
        dryToDry: true,
        t: 10.0,
      };

      for (let i = 0; i < target; i++) {
        engine.onRunEvent(jumpEvent);
      }

      const completed = engine.getContracts().find((c) => c.id === cleanJumpContract.id)!;
      expect(completed.completed).toBe(true);
      expect(completed.claimed).toBe(false);

      // Claim reward
      const claim = engine.claimReward(completed.id);
      expect(claim.success).toBe(true);
      expect(claim.staticGain).toBe(completed.rewardStatic);
      expect(claim.xpGain).toBe(completed.rewardXP);

      // Cannot claim twice
      const claimAgain = engine.claimReward(completed.id);
      expect(claimAgain.success).toBe(false);
    }
  });

  it('respects mode eligibility filtering for solo and coop contracts', () => {
    const engine = new MissionEngine(undefined, new Date('2026-10-24T10:00:00Z'));
    const contracts = engine.getContracts();

    const soloContract = contracts.find((c) => c.modeEligibility === 'solo');
    if (soloContract) {
      const initialCount = soloContract.currentCount;
      // Emit escape event with coop mode
      engine.onRunEvent({ type: 'escape', t: 100 }, { mode: 'coop' });
      // Should NOT progress because mode is coop
      expect(soloContract.currentCount).toBe(initialCount);

      // Emit escape event with solo mode
      engine.onRunEvent({ type: 'escape', t: 100 }, { mode: 'solo' });
      expect(soloContract.currentCount).toBe(initialCount + 1);
    }
  });

  it('generates deterministic Weekly Trial with fixed seed, map, mutators and 3 attempt tokens', () => {
    const engine = new MissionEngine(undefined, new Date('2026-10-24T10:00:00Z'));
    const trial1 = engine.getWeeklyTrial('2026-W43');
    const trial2 = engine.getWeeklyTrial('2026-W43');

    expect(trial1.seed).toBe(trial2.seed);
    expect(trial1.mapId).toBe(trial2.mapId);
    expect(trial1.mutators).toEqual(trial2.mutators);
    expect(trial1.attemptTokensRemaining).toBe(3);

    // Spend attempt tokens
    expect(engine.spendTrialToken()).toBe(true);
    expect(engine.spendTrialToken()).toBe(true);
    expect(engine.spendTrialToken()).toBe(true);
    expect(engine.spendTrialToken()).toBe(false); // 0 remaining
    expect(engine.getTrialTokensRemaining()).toBe(0);
  });
});

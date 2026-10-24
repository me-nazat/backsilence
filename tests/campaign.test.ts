import { describe, it, expect } from 'vitest';
import { CAMPAIGN_TAPES, Campaign, TASK_STRING_TABLE } from '../src/meta/Campaign.js';
import type { RunEvent } from '../src/meta/RunEvents.js';

describe('Prompt 3 Section 5: Tape Archive Campaign & Objectives', () => {
  it('defines 11 complete tapes with threat ratings, objectives, and working tasks', () => {
    expect(CAMPAIGN_TAPES).toHaveLength(11);

    const threatRatings = CAMPAIGN_TAPES.map((t) => t.threatRating);
    expect(threatRatings).toEqual([1, 2, 2, 3, 3, 4, 3, 4, 4, 5, 5]);

    for (const tape of CAMPAIGN_TAPES) {
      expect(tape.title.length).toBeGreaterThan(0);
      expect(tape.mapId.length).toBeGreaterThan(0);
      expect(tape.primary).toBeDefined();
      expect(tape.secondaryA).toBeDefined();
      expect(tape.secondaryB).toBeDefined();
      expect(tape.hidden).toBeDefined();
      expect(tape.hiddenHint.length).toBeGreaterThan(0);
      expect(tape.remixMutators).toHaveLength(2);
      expect(tape.workingTasks.length).toBeGreaterThanOrEqual(3);

      for (const task of tape.workingTasks) {
        expect(TASK_STRING_TABLE[task.textKey]).toBeDefined();
        expect(['quiet', 'loud', 'timed']).toContain(task.risk);
        expect(task.estimatedTimeSeconds).toBeGreaterThan(0);
      }
    }
  });

  it('enforces exact star award rules: 1=escape, 2=escape+both secondaries, 3=2stars+hidden+rank B or better', () => {
    const campaign = new Campaign();
    const tape = CAMPAIGN_TAPES[1]!;

    // 1. Escape only -> 1 star
    const res1 = campaign.recordRun(tape.id, {
      escaped: true,
      secondaryADone: false,
      secondaryBDone: false,
      hiddenDone: false,
      score: 600,
      timeSeconds: 200,
      rank: 'C',
    });
    expect(campaign.getTapeProgress(tape.id).stars).toBe(1);
    expect(res1.newlyEarnedStars).toBe(1);

    // 2. Escape + 1 secondary -> still 1 star
    campaign.recordRun(tape.id, {
      escaped: true,
      secondaryADone: true,
      secondaryBDone: false,
      hiddenDone: false,
      score: 750,
      timeSeconds: 190,
      rank: 'C',
    });
    expect(campaign.getTapeProgress(tape.id).stars).toBe(1);

    // 3. Escape + both secondaries -> 2 stars
    const res2 = campaign.recordRun(tape.id, {
      escaped: true,
      secondaryADone: true,
      secondaryBDone: true,
      hiddenDone: false,
      score: 950,
      timeSeconds: 180,
      rank: 'B',
    });
    expect(campaign.getTapeProgress(tape.id).stars).toBe(2);
    expect(res2.newlyEarnedStars).toBe(1);

    // 4. Escape + both secondaries + hidden, but rank C -> capped at 2 stars
    campaign.recordRun(tape.id, {
      escaped: true,
      secondaryADone: true,
      secondaryBDone: true,
      hiddenDone: true,
      score: 750,
      timeSeconds: 220,
      rank: 'C',
    });
    expect(campaign.getTapeProgress(tape.id).stars).toBe(2);

    // 5. Escape + both secondaries + hidden + rank B -> 3 stars
    const res3 = campaign.recordRun(tape.id, {
      escaped: true,
      secondaryADone: true,
      secondaryBDone: true,
      hiddenDone: true,
      score: 1150,
      timeSeconds: 150,
      rank: 'B',
    });
    expect(campaign.getTapeProgress(tape.id).stars).toBe(3);
    expect(res3.newlyEarnedStars).toBe(1);
  });

  it('enforces unlock rule: 2 stars on tape N-1, or 1 star plus 300 Static', () => {
    const campaign = new Campaign();
    expect(campaign.isTapeUnlocked(0)).toBe(true);
    expect(campaign.isTapeUnlocked(1)).toBe(true);
    expect(campaign.isTapeUnlocked(2)).toBe(false);

    // Give 1 star to tape 1
    campaign.recordRun('tape_01_natatorium', {
      escaped: true,
      secondaryADone: false,
      secondaryBDone: false,
      hiddenDone: false,
      score: 500,
      timeSeconds: 250,
    });
    expect(campaign.isTapeUnlocked(2)).toBe(false);

    // Try unlocking with insufficient static
    const failStatic = campaign.unlockWithStatic('tape_02_archipelago', 200, 300);
    expect(failStatic.success).toBe(false);
    expect(failStatic.newStatic).toBe(200);

    // Unlock with 300 Static
    const passStatic = campaign.unlockWithStatic('tape_02_archipelago', 500, 300);
    expect(passStatic.success).toBe(true);
    expect(passStatic.newStatic).toBe(200);
    expect(campaign.isTapeUnlocked(2)).toBe(true);

    // 3-star Remix check
    expect(campaign.isRemixUnlocked(1)).toBe(false);
    campaign.recordRun('tape_01_natatorium', {
      escaped: true,
      secondaryADone: true,
      secondaryBDone: true,
      hiddenDone: true,
      rank: 'A',
      score: 1200,
      timeSeconds: 130,
    });
    expect(campaign.isRemixUnlocked(1)).toBe(true);
  });

  it('offers a hidden-objective hint after 3 failed attempts on a tape', () => {
    const campaign = new Campaign();
    const tapeId = 'tape_01_natatorium';

    expect(campaign.getHiddenHint(tapeId)).toBeNull();

    // 1st failed attempt
    campaign.recordRun(tapeId, {
      escaped: false,
      hiddenDone: false,
      score: 100,
      timeSeconds: 40,
    });
    expect(campaign.getHiddenHint(tapeId)).toBeNull();

    // 2nd failed attempt
    campaign.recordRun(tapeId, {
      escaped: false,
      hiddenDone: false,
      score: 120,
      timeSeconds: 50,
    });
    expect(campaign.getHiddenHint(tapeId)).toBeNull();

    // 3rd failed attempt
    campaign.recordRun(tapeId, {
      escaped: false,
      hiddenDone: false,
      score: 150,
      timeSeconds: 60,
    });

    const hint = campaign.getHiddenHint(tapeId);
    expect(hint).toBe('a tape reel glints submerged near the deep end diving tower foundation');
  });

  it('evaluates objective predicates accurately against synthetic RunEvents', () => {
    const tape1 = CAMPAIGN_TAPES[1]!; // Natatorium
    const events: RunEvent[] = [
      { type: 'noise_made', kind: 'wade', position: { x: 0, y: 0, z: 0 }, loudness: 0.4, audibleToMonster: true, t: 10 },
      { type: 'noise_made', kind: 'wade', position: { x: 0, y: 0, z: 0 }, loudness: 0.4, audibleToMonster: true, t: 15 },
      { type: 'escape', t: 120 },
    ];

    expect(tape1.primary.evaluate(events)).toBe(true);
    expect(tape1.secondaryA.evaluate(events)).toBe(true); // 2 wades <= 6
    expect(tape1.secondaryB.evaluate(events, { timeSeconds: 120, parTime: 180 })).toBe(true);

    // Fail secondary A with 7 wades
    for (let i = 0; i < 5; i++) {
      events.push({ type: 'noise_made', kind: 'wade', position: { x: 0, y: 0, z: 0 }, loudness: 0.4, audibleToMonster: true, t: 20 + i });
    }
    expect(tape1.secondaryA.evaluate(events)).toBe(false);
    expect(tape1.secondaryA.failCondition?.(events)).toBe(true);
  });

  it('serializes and hydrates campaign state round-trip with zero loss', () => {
    const c1 = new Campaign();
    c1.recordRun('tape_01_natatorium', {
      escaped: true,
      secondaryADone: true,
      secondaryBDone: true,
      hiddenDone: true,
      rank: 'S',
      score: 1500,
      timeSeconds: 95,
    });
    c1.recordRun('tape_02_archipelago', {
      escaped: false,
      hiddenDone: false,
      score: 200,
      timeSeconds: 30,
    });

    const snapshot = c1.serialize();
    const c2 = new Campaign(snapshot);

    expect(c2.getTotalStars()).toBe(c1.getTotalStars());
    expect(c2.getTapeProgress('tape_01_natatorium').stars).toBe(3);
    expect(c2.getTapeProgress('tape_01_natatorium').bestScore).toBe(1500);
    expect(c2.getFailedAttempts('tape_02_archipelago')).toBe(1);
    expect(c2.isTapeUnlocked(2)).toBe(true);
  });
});

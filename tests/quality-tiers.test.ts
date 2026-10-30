/* ── quality-tiers.test.ts ───────────────────────────────────────────────────
 *  Phase I: Quality Tiers, Feature Matrix & Auto-Quality Downgrade Test Suite
 *  - Verifies tier configs across Low, Medium, and High
 *  - Verifies AutoQualityAdapter drops a tier after 3s below 45 FPS
 *  - Verifies recovery behavior and cooldown grace periods
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import {
  QUALITY_CONFIGS,
  resolveQuality,
  resolveQualityTier,
  AutoQualityAdapter,
} from '../src/engine/Quality.js';

describe('Phase I: Quality Tiers & Performance', () => {
  it('feature matrix matches specifications across Low, Medium, and High', () => {
    const low = QUALITY_CONFIGS.low;
    const med = QUALITY_CONFIGS.medium;
    const high = QUALITY_CONFIGS.high;

    // Low Tier (Mobile / low-end target: 33ms frame budget)
    expect(resolveQuality('low')).toEqual(low);
    expect(resolveQualityTier('high')).toBe('high');
    expect(low.dprCap).toBe(1.0);
    expect(low.tileTexSize).toBe(256);
    expect(low.shadows).toBe('off');
    expect(low.postFx).toBe('off');
    expect(low.maxAudioVoices).toBe(16);

    // Medium Tier (Laptop target: 16.6ms frame budget - Prompt 8.8: 2048 shadow map)
    expect(med.dprCap).toBe(1.5);
    expect(med.tileTexSize).toBe(512);
    expect(med.shadows).toBe('2048');
    expect(med.shadowType).toBe('pcfsoft');
    expect(med.postFx).toBe('light');
    expect(med.maxAudioVoices).toBe(24);

    // High Tier (Desktop target: maximum fidelity - Prompt 8.8: dprCap lowered to 1.5)
    expect(high.dprCap).toBe(1.5);
    expect(high.tileTexSize).toBe(1024);
    expect(high.shadows).toBe('2048');
    expect(high.shadowType).toBe('pcfsoft');
    expect(high.postFx).toBe('full');
    expect(high.maxAudioVoices).toBe(32);
  });

  it('AutoQualityAdapter stays stable when FPS is >= 45', () => {
    const onDowngrade = vi.fn();
    const adapter = new AutoQualityAdapter('high', onDowngrade);

    expect(adapter.getCurrentTier()).toBe('high');

    // Simulate 10 seconds at 60 FPS
    for (let i = 0; i < 600; i++) {
      const changed = adapter.update(1 / 60, 60.0);
      expect(changed).toBe(false);
    }

    expect(adapter.getCurrentTier()).toBe('high');
    expect(onDowngrade).not.toHaveBeenCalled();
  });

  it('AutoQualityAdapter does not downgrade for momentary FPS dips under 3s', () => {
    const onDowngrade = vi.fn();
    const adapter = new AutoQualityAdapter('high', onDowngrade);

    // 2.5 seconds below 45 FPS
    for (let i = 0; i < 150; i++) {
      adapter.update(1 / 60, 38.0);
    }
    expect(adapter.getCurrentTier()).toBe('high');
    expect(adapter.getLowFpsDuration()).toBeCloseTo(2.5, 1);

    // Recovers back to 55 FPS
    for (let i = 0; i < 120; i++) {
      adapter.update(1 / 60, 55.0);
    }
    expect(adapter.getLowFpsDuration()).toBe(0);
    expect(adapter.getCurrentTier()).toBe('high');
    expect(onDowngrade).not.toHaveBeenCalled();
  });

  it('AutoQualityAdapter downgrades High -> Medium -> Low after 3s below 45 FPS with cooldown', () => {
    const downgrades: string[] = [];
    const adapter = new AutoQualityAdapter('high', (tier) => {
      downgrades.push(tier);
    });

    // 1. Simulate 3.1s below 45 FPS (e.g. 35 FPS)
    for (let i = 0; i < 190; i++) {
      adapter.update(1 / 60, 35.0);
    }

    // Must have downgraded to medium
    expect(adapter.getCurrentTier()).toBe('medium');
    expect(downgrades).toEqual(['medium']);

    // 2. During 5s cooldown, no further downgrade should occur
    for (let i = 0; i < 240; i++) {
      // 4s elapsed
      adapter.update(1 / 60, 30.0);
    }
    expect(adapter.getCurrentTier()).toBe('medium');
    expect(downgrades).toEqual(['medium']);

    // 3. Wait past 5s cooldown (another 2s) + 3s sustained low FPS (total 5s more)
    for (let i = 0; i < 310; i++) {
      adapter.update(1 / 60, 30.0);
    }

    // Must have downgraded to low
    expect(adapter.getCurrentTier()).toBe('low');
    expect(downgrades).toEqual(['medium', 'low']);

    // 4. Low is the minimum tier; further low FPS should not downgrade further
    for (let i = 0; i < 400; i++) {
      adapter.update(1 / 60, 20.0);
    }
    expect(adapter.getCurrentTier()).toBe('low');
    expect(downgrades.length).toBe(2);
  });
});

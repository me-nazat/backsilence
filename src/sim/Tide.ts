/* ── Tide.ts ───────────────────────────────────────────────────────────────
 *  Deterministic rising tide clock for The Drowned Schoolhouse.
 *  Implements WaterLevelProvider.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { WaterLevelProvider } from './WaterLevelCycle.js';
import type { EventRingBuffer } from './Events.js';

export class TideClock implements WaterLevelProvider {
  readonly baseY = 0.0;
  readonly targetRise: number;
  readonly durationSeconds: number;
  readonly discreteLevels: number[];
  private lastGroanMilestone = 0.0;

  constructor(difficulty: 'whisper' | 'normal' | 'deafening' = 'normal') {
    if (difficulty === 'whisper') {
      this.targetRise = 0.15;
      this.durationSeconds = 18 * 60; // 18 min
    } else if (difficulty === 'deafening') {
      this.targetRise = 0.38;
      this.durationSeconds = 10 * 60; // 10 min
    } else {
      this.targetRise = 0.30;
      this.durationSeconds = 14 * 60; // 14 min
    }

    // 4 discrete nav levels across [0, targetRise]
    this.discreteLevels = [
      0.0,
      this.targetRise * 0.33,
      this.targetRise * 0.67,
      this.targetRise,
    ];
  }

  levelAt(simTime: number): number {
    const u = Math.min(1.0, Math.max(0.0, simTime / this.durationSeconds));
    const smooth = u * u * (3.0 - 2.0 * u); // smoothstep
    return this.baseY + smooth * this.targetRise;
  }

  rateAt(simTime: number): number {
    if (simTime >= this.durationSeconds) return 0;
    const u = Math.min(1.0, Math.max(0.0, simTime / this.durationSeconds));
    const derivative = 6.0 * u * (1.0 - u) / this.durationSeconds;
    return derivative * this.targetRise;
  }

  /**
   * Check for +0.05m milestones to emit acoustic pipe_groan warnings.
   */
  step(simTime: number, events?: EventRingBuffer): void {
    const currentRise = this.levelAt(simTime) - this.baseY;
    if (currentRise - this.lastGroanMilestone >= 0.05) {
      this.lastGroanMilestone = Math.floor(currentRise / 0.05) * 0.05;
      if (events) {
        events.pushNoise(
          `tide_pipe_groan_${simTime}`,
          'generator',
          0,
          currentRise,
          0,
          0.3,
          'world',
          simTime,
        );
      }
    }
  }

  isJuvenileSpawnTriggered(simTime: number): boolean {
    return this.levelAt(simTime) >= 0.15;
  }
}

/* ── Weather.ts ────────────────────────────────────────────────────────────
 *  Time-derived deterministic weather system (rain, thunder, downpours, masks).
 *  Used by Neon Flood District and SimWorld.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import { dSin, dExp } from './dmath.js';

export interface WeatherState {
  rain: number; // 0..1 intensity
  isDownpour: boolean;
  isThunderWindow: boolean;
  maskFactor: number;
  lightningExposure: number; // 0..1 pulse for presentation
  timeToNextThunder: number; // seconds
}

export class WeatherSystem {
  readonly seed: number;
  private readonly thunderTimes: number[] = [];

  constructor(seed = 12345, maxScheduleHours = 4) {
    this.seed = seed;
    // Generate seeded deterministic thunder schedule (at least 1 per 90s, avg every 45-75s)
    let t = 20.0; // first thunder after 20s
    let state = seed ^ 0x9e3779b9;

    const maxSeconds = maxScheduleHours * 3600;
    while (t < maxSeconds) {
      this.thunderTimes.push(t);
      // LCG step
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      const norm = ((state >>> 0) % 1000) / 1000;
      // Interval between 40s and 80s (strictly < 90s)
      const interval = 40.0 + norm * 40.0;
      t += interval;
    }
  }

  /**
   * Continuous rain intensity 0..1 as a combination of sine harmonics.
   */
  rainAt(simTime: number): number {
    const t = simTime + this.seed * 0.01;
    // Base 0.5 + harmonics
    const s1 = dSin(t * 0.05) * 0.25;
    const s2 = dSin(t * 0.13 + 1.2) * 0.15;
    const s3 = dSin(t * 0.31 + 2.7) * 0.1;
    const base = 0.5 + s1 + s2 + s3;
    return Math.max(0.0, Math.min(1.0, base));
  }

  /**
   * Downpour phases occur periodically (e.g. rain > 0.75).
   */
  isDownpourAt(simTime: number): boolean {
    return this.rainAt(simTime) >= 0.72;
  }

  /**
   * True if within +-2.0s of a thunder crack.
   */
  isThunderWindowAt(simTime: number): boolean {
    for (let i = 0; i < this.thunderTimes.length; i++) {
      const th = this.thunderTimes[i]!;
      if (Math.abs(simTime - th) <= 2.0) {
        return true;
      }
      if (th > simTime + 2.5) break;
    }
    return false;
  }

  /**
   * Time in seconds to the next thunder event.
   */
  timeToNextThunder(simTime: number): number {
    for (let i = 0; i < this.thunderTimes.length; i++) {
      const th = this.thunderTimes[i]!;
      if (th >= simTime) {
        return th - simTime;
      }
    }
    return 90.0;
  }

  /**
   * Acoustic mask factor per Section 3.5:
   * Baseline: 1 - 0.25 * rain
   * Downpour: 0.6
   * Thunder window (crack +- 2s): 0.3
   */
  maskFactorAt(simTime: number): number {
    if (this.isThunderWindowAt(simTime)) {
      return 0.3;
    }
    if (this.isDownpourAt(simTime)) {
      return 0.6;
    }
    const rain = this.rainAt(simTime);
    return 1.0 - 0.25 * rain;
  }

  /**
   * Lightning flash exposure pulse (0..1, safely capped to prevent seizure triggers).
   */
  lightningExposureAt(simTime: number): number {
    for (let i = 0; i < this.thunderTimes.length; i++) {
      const th = this.thunderTimes[i]!;
      // Flash occurs ~0.8s before the audible thunder crack
      const flashTime = th - 0.8;
      const dt = simTime - flashTime;
      if (dt >= 0 && dt <= 0.35) {
        // Sharp attack, exponential decay, capped at 0.7 for safety
        const pulse = dExp(-dt * 12.0) * 0.7;
        return pulse;
      }
      if (th > simTime + 1.0) break;
    }
    return 0.0;
  }

  /**
   * Thunder acoustic delay based on listener distance (0.4s to 1.6s).
   */
  thunderDelay(distanceMeters: number): number {
    const clamped = Math.max(10, Math.min(400, distanceMeters));
    return 0.4 + (clamped / 400) * 1.2;
  }

  getState(simTime: number): WeatherState {
    return {
      rain: this.rainAt(simTime),
      isDownpour: this.isDownpourAt(simTime),
      isThunderWindow: this.isThunderWindowAt(simTime),
      maskFactor: this.maskFactorAt(simTime),
      lightningExposure: this.lightningExposureAt(simTime),
      timeToNextThunder: this.timeToNextThunder(simTime),
    };
  }
}

/* ── WaterLevelCycle.ts ────────────────────────────────────────────────────
 *  Pure deterministic simulation of dynamic water cycles.
 *  Implements the 90-second cycle for Map 4 (Hydro-Filtration Maze):
 *  LOW (-0.2m) for 37s -> RISE 8s -> HIGH (+0.55m) for 37s -> FALL 8s.
 * ──────────────────────────────────────────────────────────────────────── */

export interface WaterLevelProvider {
  levelAt(t: number): number;
  phaseAt?(t: number): string;
  secondsToNextShift?(t: number): number;
  rateAt?(t: number): number;
}

export type WaterLevelPhase = 'low' | 'rise' | 'high' | 'fall';

export interface WaterLevelCycleConfig {
  lowY: number; // default -0.2
  highY: number; // default +0.55
  lowHold: number; // default 37.0
  riseDuration: number; // default 8.0
  highHold: number; // default 37.0
  fallDuration: number; // default 8.0
  warningWindow: number; // default 10.0
}

export class WaterLevelCycle implements WaterLevelProvider {
  readonly lowY: number;
  readonly highY: number;
  readonly lowHold: number;
  readonly riseDuration: number;
  readonly highHold: number;
  readonly fallDuration: number;
  readonly period: number;
  readonly warningWindow: number;

  constructor(config?: Partial<WaterLevelCycleConfig>) {
    this.lowY = config?.lowY ?? -0.2;
    this.highY = config?.highY ?? 0.55;
    this.lowHold = config?.lowHold ?? 37.0;
    this.riseDuration = config?.riseDuration ?? 8.0;
    this.highHold = config?.highHold ?? 37.0;
    this.fallDuration = config?.fallDuration ?? 8.0;
    this.warningWindow = config?.warningWindow ?? 10.0;
    this.period =
      this.lowHold + this.riseDuration + this.highHold + this.fallDuration;
  }

  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  private smoothstepDerivative(edge0: number, edge1: number, x: number): number {
    const d = edge1 - edge0;
    if (d === 0) return 0;
    const t = Math.max(0, Math.min(1, (x - edge0) / d));
    return (6 * t * (1 - t)) / d;
  }

  levelAt(simTime: number): number {
    const t = ((simTime % this.period) + this.period) % this.period;
    const tRiseStart = this.lowHold;
    const tRiseEnd = tRiseStart + this.riseDuration;
    const tFallStart = tRiseEnd + this.highHold;
    const tFallEnd = tFallStart + this.fallDuration;

    if (t < tRiseStart) {
      return this.lowY;
    }
    if (t < tRiseEnd) {
      const alpha = this.smoothstep(tRiseStart, tRiseEnd, t);
      return this.lowY + alpha * (this.highY - this.lowY);
    }
    if (t < tFallStart) {
      return this.highY;
    }
    if (t < tFallEnd) {
      const alpha = this.smoothstep(tFallStart, tFallEnd, t);
      return this.highY + alpha * (this.lowY - this.highY);
    }
    return this.lowY;
  }

  phaseAt(simTime: number): WaterLevelPhase {
    const t = ((simTime % this.period) + this.period) % this.period;
    const tRiseStart = this.lowHold;
    const tRiseEnd = tRiseStart + this.riseDuration;
    const tFallStart = tRiseEnd + this.highHold;

    if (t < tRiseStart) return 'low';
    if (t < tRiseEnd) return 'rise';
    if (t < tFallStart) return 'high';
    return 'fall';
  }

  rateAt(simTime: number): number {
    const t = ((simTime % this.period) + this.period) % this.period;
    const tRiseStart = this.lowHold;
    const tRiseEnd = tRiseStart + this.riseDuration;
    const tFallStart = tRiseEnd + this.highHold;
    const tFallEnd = tFallStart + this.fallDuration;

    if (t >= tRiseStart && t < tRiseEnd) {
      const dAlpha = this.smoothstepDerivative(tRiseStart, tRiseEnd, t);
      return (this.highY - this.lowY) * dAlpha;
    }
    if (t >= tFallStart && t < tFallEnd) {
      const dAlpha = this.smoothstepDerivative(tFallStart, tFallEnd, t);
      return (this.lowY - this.highY) * dAlpha;
    }
    return 0;
  }

  secondsToNextShift(simTime: number): number {
    const t = ((simTime % this.period) + this.period) % this.period;
    const tRiseStart = this.lowHold;
    const tRiseEnd = tRiseStart + this.riseDuration;
    const tFallStart = tRiseEnd + this.highHold;
    const tFallEnd = tFallStart + this.fallDuration;

    if (t < tRiseStart) {
      return tRiseStart - t;
    }
    if (t < tRiseEnd) {
      return tRiseEnd - t;
    }
    if (t < tFallStart) {
      return tFallStart - t;
    }
    return tFallEnd - t;
  }

  isWarning(simTime: number): boolean {
    const t = ((simTime % this.period) + this.period) % this.period;
    const tRiseStart = this.lowHold;
    const tRiseEnd = tRiseStart + this.riseDuration;
    const tFallStart = tRiseEnd + this.highHold;

    // Warning is active in the last `warningWindow` seconds of lowHold and highHold
    if (t >= tRiseStart - this.warningWindow && t < tRiseStart) {
      return true;
    }
    if (t >= tFallStart - this.warningWindow && t < tFallStart) {
      return true;
    }
    return false;
  }

  isWarningActive(simTime: number): boolean {
    return this.isWarning(simTime);
  }
}

/* ── GhostTrain.ts ─────────────────────────────────────────────────────────
 *  Deterministic Ghost Train event scheduler, kill zone, and acoustic masks.
 *  Used by Platform Zero (The Drowned Metro) and SimWorld.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import type { EventRingBuffer } from './Events.js';
import type { MonsterBrain } from './MonsterBrain.js';

export type GhostTrainPhase = 'IDLE' | 'APPROACH' | 'PASS' | 'AFTERMATH';

export interface GhostTrainSnapshot {
  phase: GhostTrainPhase;
  phaseElapsed: number;
  phaseDuration: number;
  timeToNextTrain: number;
  maskFactor: number;
  trainProgress: number; // 0..1 swept along T2 during PASS
  signalAmber: boolean;
  signalRed: boolean;
}

export interface RefugeAlcove {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export class GhostTrain {
  readonly period: number; // 75..95s
  readonly firstTrainTime = 45.0; // first train at 45s

  static readonly APPROACH_DURATION = 14.0;
  static readonly PASS_DURATION = 6.0;
  static readonly AFTERMATH_DURATION = 8.0;

  // T2 Kill zone boundaries (express track center line z=5.0 +- 1.6m)
  static readonly KILL_MIN_Z = 3.4;
  static readonly KILL_MAX_Z = 6.6;
  static readonly KILL_MIN_X = -90.0;
  static readonly KILL_MAX_X = 90.0;
  static readonly KILL_MIN_Y = -1.2;
  static readonly KILL_MAX_Y = 2.4;

  readonly refugeAlcoves: RefugeAlcove[] = [];
  isHeld = false; // Boarding hold freezes schedule

  constructor(seed = 42) {
    // Deterministic period 75..95s
    const norm = ((seed ^ 0x5a5a5a5a) >>> 0) % 1000 / 1000;
    this.period = 75.0 + norm * 20.0; // 75..95s
  }

  addRefugeAlcove(alcove: RefugeAlcove): void {
    this.refugeAlcoves.push({ ...alcove });
  }

  setBoardingHold(held: boolean): void {
    this.isHeld = held;
  }

  /**
   * Determine exact phase and progress at given simTime.
   */
  getPhaseAtTime(simTime: number): {
    phase: GhostTrainPhase;
    elapsed: number;
    duration: number;
    maskFactor: number;
    trainProgress: number;
    timeToNextTrain: number;
  } {
    if (this.isHeld) {
      return {
        phase: 'IDLE',
        elapsed: 0,
        duration: this.period,
        maskFactor: 1.0,
        trainProgress: 0,
        timeToNextTrain: 999.0,
      };
    }

    const tApproachStart = this.firstTrainTime - GhostTrain.APPROACH_DURATION; // 45 - 14 = 31s

    if (simTime < tApproachStart) {
      return {
        phase: 'IDLE',
        elapsed: simTime,
        duration: tApproachStart,
        maskFactor: 1.0,
        trainProgress: 0,
        timeToNextTrain: tApproachStart - simTime,
      };
    }

    // Cyclic time relative to start of approach
    const cycleTime = (simTime - tApproachStart) % this.period;
    const totalActive =
      GhostTrain.APPROACH_DURATION + GhostTrain.PASS_DURATION + GhostTrain.AFTERMATH_DURATION;

    if (cycleTime < GhostTrain.APPROACH_DURATION) {
      const elapsed = cycleTime;
      // Last 6s of approach has mask 0.6 (i.e. elapsed >= 14 - 6 = 8.0)
      const maskFactor = elapsed >= 8.0 ? 0.6 : 1.0;
      return {
        phase: 'APPROACH',
        elapsed,
        duration: GhostTrain.APPROACH_DURATION,
        maskFactor,
        trainProgress: 0,
        timeToNextTrain: GhostTrain.APPROACH_DURATION - elapsed,
      };
    }

    if (cycleTime < GhostTrain.APPROACH_DURATION + GhostTrain.PASS_DURATION) {
      const elapsed = cycleTime - GhostTrain.APPROACH_DURATION;
      const trainProgress = elapsed / GhostTrain.PASS_DURATION;
      return {
        phase: 'PASS',
        elapsed,
        duration: GhostTrain.PASS_DURATION,
        maskFactor: 0.2, // global mask 0.2 during pass
        trainProgress,
        timeToNextTrain: 0,
      };
    }

    if (cycleTime < totalActive) {
      const elapsed = cycleTime - (GhostTrain.APPROACH_DURATION + GhostTrain.PASS_DURATION);
      return {
        phase: 'AFTERMATH',
        elapsed,
        duration: GhostTrain.AFTERMATH_DURATION,
        maskFactor: 0.5,
        trainProgress: 1.0,
        timeToNextTrain: this.period - cycleTime,
      };
    }

    // Remainder of cycle is IDLE
    const idleElapsed = cycleTime - totalActive;
    const idleDuration = this.period - totalActive;
    return {
      phase: 'IDLE',
      elapsed: idleElapsed,
      duration: idleDuration,
      maskFactor: 1.0,
      trainProgress: 0,
      timeToNextTrain: this.period - cycleTime,
    };
  }

  /**
   * Check if position is inside the kill zone and not sheltered in a refuge alcove.
   */
  isInsideKillZone(pos: Vec3): boolean {
    if (
      pos.x < GhostTrain.KILL_MIN_X ||
      pos.x > GhostTrain.KILL_MAX_X ||
      pos.z < GhostTrain.KILL_MIN_Z ||
      pos.z > GhostTrain.KILL_MAX_Z ||
      pos.y < GhostTrain.KILL_MIN_Y ||
      pos.y > GhostTrain.KILL_MAX_Y
    ) {
      return false;
    }

    // Check if sheltered inside an alcove
    for (let i = 0; i < this.refugeAlcoves.length; i++) {
      const a = this.refugeAlcoves[i]!;
      if (
        pos.x >= a.minX &&
        pos.x <= a.maxX &&
        pos.z >= a.minZ &&
        pos.z <= a.maxZ
      ) {
        return false; // sheltered
      }
    }

    return true;
  }

  /**
   * Step the train system: test players and monsters during PASS phase.
   */
  step(
    _dt: number,
    simTime: number,
    playerPos: Vec3,
    monsters: MonsterBrain[],
    _events?: EventRingBuffer,
  ): { playerKilled: boolean } {
    const { phase } = this.getPhaseAtTime(simTime);
    let playerKilled = false;

    if (phase === 'PASS') {
      // Test player kill zone
      if (this.isInsideKillZone(playerPos)) {
        playerKilled = true;
      }

      // Test monsters: stun for 45s
      for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i]!;
        if (m.state !== 'STUNNED' && this.isInsideKillZone(m.pos)) {
          m.stun(45.0);
        }
      }
    }

    return { playerKilled };
  }

  getSnapshot(simTime: number): GhostTrainSnapshot {
    const info = this.getPhaseAtTime(simTime);
    return {
      phase: info.phase,
      phaseElapsed: info.elapsed,
      phaseDuration: info.duration,
      timeToNextTrain: info.timeToNextTrain,
      maskFactor: info.maskFactor,
      trainProgress: info.trainProgress,
      signalAmber: info.phase === 'APPROACH',
      signalRed: info.phase === 'PASS',
    };
  }
}

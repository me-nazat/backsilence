/* ── Ghost.ts ─────────────────────────────────────────────────────────────
 *  Pure ghost trajectory interpolator and time-delta tracker.
 *  Allows racing against personal bests or the weekly champion ghost.
 *  Zero Three.js or DOM dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RunRecording } from './RunRecorder.js';
import type { Vec3 } from '../types/contracts.js';

export interface GhostPose {
  t: number;
  position: Vec3;
  yaw: number;
  completed: boolean;
}

export interface GhostDelta {
  /** Delta seconds: negative means player is ahead of ghost, positive means behind */
  deltaSeconds: number;
  formattedDelta: string; // e.g. "-1.2s" or "+0.8s"
  playerAhead: boolean;
}

export class GhostTrajectory {
  readonly samples: Array<{ t: number; x: number; y: number; z: number; yaw: number }>;
  readonly durationSec: number;

  constructor(recording: RunRecording) {
    this.samples = recording.sampleTrajectory ?? [];
    this.durationSec = recording.header.durationSec;
  }

  /**
   * Samples the ghost's spatial transform at simulation time t with linear interpolation.
   */
  sampleAt(t: number): GhostPose {
    if (this.samples.length === 0) {
      return {
        t,
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        completed: true,
      };
    }

    if (t <= this.samples[0]!.t) {
      const s = this.samples[0]!;
      return {
        t,
        position: { x: s.x, y: s.y, z: s.z },
        yaw: s.yaw,
        completed: false,
      };
    }

    const last = this.samples[this.samples.length - 1]!;
    if (t >= last.t) {
      return {
        t,
        position: { x: last.x, y: last.y, z: last.z },
        yaw: last.yaw,
        completed: true,
      };
    }

    // Binary search for surrounding samples
    let low = 0;
    let high = this.samples.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.samples[mid]!.t <= t) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idxA = Math.max(0, high);
    const idxB = Math.min(this.samples.length - 1, low);
    const a = this.samples[idxA]!;
    const b = this.samples[idxB]!;

    const span = b.t - a.t;
    const factor = span > 0.0001 ? (t - a.t) / span : 0;

    return {
      t,
      position: {
        x: a.x + (b.x - a.x) * factor,
        y: a.y + (b.y - a.y) * factor,
        z: a.z + (b.z - a.z) * factor,
      },
      yaw: a.yaw + (b.yaw - a.yaw) * factor,
      completed: false,
    };
  }

  /**
   * Compares the live player's position against the ghost trajectory.
   * Finds the closest point on the ghost's path to estimate time delta.
   */
  computeDelta(currentTime: number, playerPos: Vec3): GhostDelta {
    if (this.samples.length === 0) {
      return { deltaSeconds: 0, formattedDelta: '±0.0s', playerAhead: true };
    }

    // Find the ghost sample closest in distance to playerPos
    let bestDistSq = Infinity;
    let bestSample = this.samples[0]!;

    for (const s of this.samples) {
      const dx = s.x - playerPos.x;
      const dz = s.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestSample = s;
      }
    }

    // If player reaches that spot at currentTime, and ghost was there at bestSample.t:
    // delta = currentTime - bestSample.t.
    // If currentTime < bestSample.t, player is faster (ahead -> negative delta).
    const deltaSeconds = Number((currentTime - bestSample.t).toFixed(1));
    const playerAhead = deltaSeconds <= 0;
    const sign = deltaSeconds > 0 ? '+' : '';
    const formattedDelta = `${sign}${deltaSeconds.toFixed(1)}s`;

    return {
      deltaSeconds,
      formattedDelta,
      playerAhead,
    };
  }
}

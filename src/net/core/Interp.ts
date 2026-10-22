/* ── Interp.ts ──────────────────────────────────────────────────────────
 *  Interpolation & extrapolation buffer for remote network entities.
 *  - Renders at (serverNow - interpDelay)
 *  - Linear position lerp, shortest-arc angular slerp/lerp
 *  - Up to 250ms damped extrapolation when starved
 *  - 2.0m snap threshold for sudden anomalies or teleports
 *  - Adaptive delay based on measured network jitter
 * ──────────────────────────────────────────────────────────────────────── */

import type { NetPlayerSnapshot, Vec3 } from '../../types/contracts.js';

export interface InterpSample {
  timeMs: number;
  pos: Vec3;
  yaw: number;
  pitch: number;
  crouch: boolean;
  inWater: boolean;
  flashlightOn: boolean;
  alive: boolean;
  carrying?: string | undefined;
  colorIndex?: number | undefined;
}

export interface InterpResult {
  pos: Vec3;
  yaw: number;
  pitch: number;
  crouch: boolean;
  inWater: boolean;
  flashlightOn: boolean;
  alive: boolean;
  carrying?: string | undefined;
  colorIndex?: number | undefined;
  isExtrapolated: boolean;
}

/** Normalize angle to [-PI, PI]. */
export function normalizeAngle(rad: number): number {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Interpolate between two angles along the shortest arc. */
export function lerpAngle(from: number, to: number, alpha: number): number {
  const diff = normalizeAngle(to - from);
  return normalizeAngle(from + diff * alpha);
}

/** Calculate adaptive interpolation delay based on jitter. */
export function calculateAdaptiveInterpDelay(
  suggestedDelayMs: number,
  jitterMs: number,
): number {
  const dynamic = 2 * jitterMs + 40;
  return Math.min(700, Math.max(suggestedDelayMs, dynamic));
}

export class EntityInterpBuffer {
  private samples: InterpSample[] = [];
  private readonly maxBufferSize = 32;
  private readonly maxExtrapolationMs = 250;

  addSnapshot(snap: NetPlayerSnapshot, timestampMs?: number): void {
    const t = timestampMs ?? Math.round(snap.t * 1000);

    // Discard outdated sample older than oldest retained
    if (this.samples.length > 0 && t < this.samples[0]!.timeMs) {
      return;
    }

    const sample: InterpSample = {
      timeMs: t,
      pos: { ...snap.pos },
      yaw: snap.yaw,
      pitch: snap.pitch,
      crouch: snap.crouch,
      inWater: snap.inWater,
      flashlightOn: snap.flashlightOn,
      alive: snap.alive,
      carrying: snap.carrying,
      colorIndex: snap.colorIndex,
    };

    // Keep sorted by timeMs
    let insertIdx = this.samples.length;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i]!.timeMs <= t) {
        insertIdx = i + 1;
        break;
      }
    }
    this.samples.splice(insertIdx, 0, sample);

    if (this.samples.length > this.maxBufferSize) {
      this.samples.shift();
    }
  }

  sample(renderTimeMs: number): InterpResult | null {
    if (this.samples.length === 0) return null;

    if (this.samples.length === 1) {
      const s = this.samples[0]!;
      return {
        pos: { ...s.pos },
        yaw: s.yaw,
        pitch: s.pitch,
        crouch: s.crouch,
        inWater: s.inWater,
        flashlightOn: s.flashlightOn,
        alive: s.alive,
        carrying: s.carrying,
        colorIndex: s.colorIndex,
        isExtrapolated: false,
      };
    }

    const first = this.samples[0]!;
    const last = this.samples[this.samples.length - 1]!;

    // Case 1: Before our oldest buffer sample -> return oldest
    if (renderTimeMs <= first.timeMs) {
      return {
        pos: { ...first.pos },
        yaw: first.yaw,
        pitch: first.pitch,
        crouch: first.crouch,
        inWater: first.inWater,
        flashlightOn: first.flashlightOn,
        alive: first.alive,
        carrying: first.carrying,
        colorIndex: first.colorIndex,
        isExtrapolated: false,
      };
    }

    // Case 2: Past our newest sample -> Extrapolate with damping
    if (renderTimeMs > last.timeMs) {
      const prev = this.samples[this.samples.length - 2]!;
      const dt = (last.timeMs - prev.timeMs) / 1000;
      const starveMs = renderTimeMs - last.timeMs;

      if (dt > 0.001 && starveMs <= this.maxExtrapolationMs) {
        const vx = (last.pos.x - prev.pos.x) / dt;
        const vy = (last.pos.y - prev.pos.y) / dt;
        const vz = (last.pos.z - prev.pos.z) / dt;

        // Damping factor: fades to 0 as starveMs reaches 250ms
        const damp = Math.max(0, 1 - starveMs / this.maxExtrapolationMs);
        const starveSeconds = (starveMs / 1000) * damp;

        return {
          pos: {
            x: last.pos.x + vx * starveSeconds,
            y: last.pos.y + vy * starveSeconds,
            z: last.pos.z + vz * starveSeconds,
          },
          yaw: last.yaw,
          pitch: last.pitch,
          crouch: last.crouch,
          inWater: last.inWater,
          flashlightOn: last.flashlightOn,
          alive: last.alive,
          carrying: last.carrying,
          colorIndex: last.colorIndex,
          isExtrapolated: true,
        };
      }

      // Beyond max extrapolation -> clamp to last known
      return {
        pos: { ...last.pos },
        yaw: last.yaw,
        pitch: last.pitch,
        crouch: last.crouch,
        inWater: last.inWater,
        flashlightOn: last.flashlightOn,
        alive: last.alive,
        carrying: last.carrying,
        colorIndex: last.colorIndex,
        isExtrapolated: true,
      };
    }

    // Case 3: In between two known samples -> Smooth interpolation
    for (let i = 0; i < this.samples.length - 1; i++) {
      const s0 = this.samples[i]!;
      const s1 = this.samples[i + 1]!;

      if (renderTimeMs >= s0.timeMs && renderTimeMs <= s1.timeMs) {
        const span = s1.timeMs - s0.timeMs;
        const alpha = span > 0 ? (renderTimeMs - s0.timeMs) / span : 0;

        // Teleport snap check: if speed over interval exceeds plausibility (sprint * 1.5 * span + 2m)
        const dx = s1.pos.x - s0.pos.x;
        const dy = s1.pos.y - s0.pos.y;
        const dz = s1.pos.z - s0.pos.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        const spanSec = Math.max(0.01, span / 1000);
        const maxAllowed = 8.0 * spanSec + 2.0;

        const pos: Vec3 =
          distSq > maxAllowed * maxAllowed
            ? { ...s1.pos }
            : {
                x: s0.pos.x + dx * alpha,
                y: s0.pos.y + dy * alpha,
                z: s0.pos.z + dz * alpha,
              };

        return {
          pos,
          yaw: lerpAngle(s0.yaw, s1.yaw, alpha),
          pitch: s0.pitch + (s1.pitch - s0.pitch) * alpha,
          crouch: alpha >= 0.5 ? s1.crouch : s0.crouch,
          inWater: alpha >= 0.5 ? s1.inWater : s0.inWater,
          flashlightOn: s1.flashlightOn,
          alive: s1.alive,
          carrying: s1.carrying ?? s0.carrying,
          colorIndex: s1.colorIndex ?? s0.colorIndex,
          isExtrapolated: false,
        };
      }
    }

    return null;
  }

  clear(): void {
    this.samples = [];
  }
}

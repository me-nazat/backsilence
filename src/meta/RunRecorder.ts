/* ── RunRecorder.ts ───────────────────────────────────────────────────────
 *  Pure, deterministic run recorder using Run-Length Encoded (RLE) player intents.
 *  Produces compact recordings (<= 48 KB for a 12-minute run) suitable for
 *  ghost playback, headless re-simulation, and anti-cheat verification.
 * ──────────────────────────────────────────────────────────────────────── */

import type { PlayerIntent } from '../sim/PlayerMotor.js';
import type { MapId } from '../types/contracts.js';
import type { PlayerLoadout } from './Loadout.js';

export const RECORDER_SIM_VERSION = 1;

export interface RunRecordingHeader {
  version: number;
  mapId: MapId;
  seed: number;
  difficulty: 'whisper' | 'normal' | 'deafening' | 'nightmare';
  mutators: string[];
  loadout: PlayerLoadout;
  tickRate: number;
  totalTicks: number;
  durationSec: number;
  playerInitials?: string;
}

export interface RleIntentFrame {
  /** Number of consecutive identical ticks */
  c: number;
  /** moveX quantized (-1, 0, 1) */
  x: number;
  /** moveZ quantized (-1, 0, 1) */
  z: number;
  /** bitmask: sprint=1, crouch=2, jump=4, interact=8 */
  f: number;
  /** lookDeltaYaw quantized to 0.001 rad */
  y: number;
  /** lookDeltaPitch quantized to 0.001 rad */
  p: number;
}

export interface RunRecording {
  header: RunRecordingHeader;
  frames: RleIntentFrame[];
  sampleTrajectory?: Array<{ t: number; x: number; y: number; z: number; yaw: number }>;
}

export class RunRecorder {
  private header: RunRecordingHeader;
  private frames: RleIntentFrame[] = [];
  private currentFrame: RleIntentFrame | null = null;
  private totalTicks = 0;
  private sampleTrajectory: Array<{ t: number; x: number; y: number; z: number; yaw: number }> = [];

  constructor(
    mapId: MapId,
    seed: number,
    difficulty: 'whisper' | 'normal' | 'deafening' | 'nightmare' = 'normal',
    mutators: string[] = [],
    loadout: PlayerLoadout = { active1: null, active2: null, passive: null },
    tickRate = 60,
  ) {
    this.header = {
      version: RECORDER_SIM_VERSION,
      mapId,
      seed,
      difficulty,
      mutators,
      loadout,
      tickRate,
      totalTicks: 0,
      durationSec: 0,
    };
  }

  /**
   * Records a single simulation tick.
   */
  recordTick(intent: PlayerIntent, currentPos?: { x: number; y: number; z: number; yaw: number }): void {
    this.totalTicks++;

    // Sample spatial trajectory every 12 ticks (~0.2s) for lightweight ghost interpolation
    if (currentPos && this.totalTicks % 12 === 0) {
      this.sampleTrajectory.push({
        t: Number((this.totalTicks / this.header.tickRate).toFixed(2)),
        x: Number(currentPos.x.toFixed(2)),
        y: Number(currentPos.y.toFixed(2)),
        z: Number(currentPos.z.toFixed(2)),
        yaw: Number(currentPos.yaw.toFixed(2)),
      });
    }

    const x = Math.sign(Math.round(intent.moveX * 10) / 10);
    const z = Math.sign(Math.round(intent.moveZ * 10) / 10);
    let f = 0;
    if (intent.sprint) f |= 1;
    if (intent.crouch) f |= 2;
    if (intent.jump) f |= 4;
    if (intent.interact) f |= 8;

    const y = Math.round((intent.lookDeltaYaw || 0) * 1000) / 1000;
    const p = Math.round((intent.lookDeltaPitch || 0) * 1000) / 1000;

    if (
      this.currentFrame &&
      this.currentFrame.x === x &&
      this.currentFrame.z === z &&
      this.currentFrame.f === f &&
      this.currentFrame.y === y &&
      this.currentFrame.p === p &&
      this.currentFrame.c < 65535
    ) {
      this.currentFrame.c++;
    } else {
      if (this.currentFrame) {
        this.frames.push(this.currentFrame);
      }
      this.currentFrame = { c: 1, x, z, f, y, p };
    }
  }

  /**
   * Finalizes recording and returns the complete RunRecording object.
   */
  finalize(): RunRecording {
    if (this.currentFrame) {
      this.frames.push(this.currentFrame);
      this.currentFrame = null;
    }
    this.header.totalTicks = this.totalTicks;
    this.header.durationSec = Number((this.totalTicks / this.header.tickRate).toFixed(2));

    return {
      header: { ...this.header },
      frames: [...this.frames],
      sampleTrajectory: [...this.sampleTrajectory],
    };
  }

  /**
   * Serializes a recording to a compact JSON string.
   */
  static serialize(rec: RunRecording): string {
    return JSON.stringify(rec);
  }

  /**
   * Deserializes a recording and validates version compatibility.
   */
  static deserialize(jsonStr: string): RunRecording {
    const parsed = JSON.parse(jsonStr) as RunRecording;
    if (!parsed.header || parsed.header.version !== RECORDER_SIM_VERSION) {
      throw new Error(
        `Incompatible recording version: ${parsed.header?.version ?? 'unknown'}. Expected: ${RECORDER_SIM_VERSION}`,
      );
    }
    return parsed;
  }
}

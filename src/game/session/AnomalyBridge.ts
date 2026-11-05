/* ── AnomalyBridge.ts ──────────────────────────────────────────────────────
 *  Coordinates AnomalyDirector environmental phenomena with game visual/audio systems.
 *  Handles:
 *  - Rising Water level offset propagation to WaterSystem.
 *  - Reality Loop seamless portal crossing and momentum-preserving relocation.
 *  - Sensory Hallucination decoy updates and acoustic truth (0 true events).
 * ──────────────────────────────────────────────────────────────────────── */

import type { AnomalyDirector } from '../../sim/AnomalyDirector.js';
import type { WaterSystem } from '../water/WaterSystem.js';
import type { PlayerMotor } from '../../sim/PlayerMotor.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';
import type { Vec3 } from '../../types/contracts.js';

export class AnomalyBridge {
  private readonly director: AnomalyDirector | null;
  private readonly water: WaterSystem | null;
  private readonly audio: AudioEngine;
  private previousStage = '';

  constructor(
    director: AnomalyDirector | null | undefined,
    water: WaterSystem | null | undefined,
    audio: AudioEngine,
  ) {
    this.director = director ?? null;
    this.water = water ?? null;
    this.audio = audio;
  }

  update(
    dt: number,
    player: PlayerMotor,
    currentWaterY: number,
  ): void {
    if (!this.director) return;

    const pState = player.getState();
    this.director.step(dt, pState.pos, pState.onGround, currentWaterY, pState.vel);

    // 1. Propagate water offset
    if (this.water) {
      this.water.updateWaterY(currentWaterY + this.director.waterOffset);
    }

    // 2. Handle reality loop portal relocation
    const rel = this.director.relocation;
    if (rel) {
      player.teleport(rel.targetPos);
      player.yaw += rel.yawOffset;
      this.audio.play('ui_confirm', { gain: 0.35 });
    }

    // 3. Audio cues on stage transitions
    const currentStage = this.director.currentStage;
    if (currentStage !== this.previousStage) {
      if (currentStage === 'TELEGRAPH') {
        const anomaly = this.director.currentAnomaly;
        if (anomaly?.family === 'RISING_WATER') {
          this.audio.play('pipe_groan', { gain: 0.6 });
        } else if (anomaly?.family === 'REALITY_LOOP') {
          this.audio.play('hum_loop', { gain: 0.4 });
        }
      }
      this.previousStage = currentStage;
    }
  }

  getDecoyPosition(): Vec3 | null {
    return this.director?.decoyPos ?? null;
  }

  isWallTextActive(): boolean {
    return this.director?.isWallTextActive ?? false;
  }

  reset(): void {
    this.director?.resetOnRetry();
    this.previousStage = '';
  }
}

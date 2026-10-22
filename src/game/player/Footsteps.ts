/* ── Footsteps.ts ──────────────────────────────────────────────────────────
 *  Audio footsteps, wading, landing, mantling, and exhausted breathing.
 *  Phase-locked to the player camera bob cycle.
 * ──────────────────────────────────────────────────────────────────────── */

import type { AudioEngine, VoiceHandle } from '../../audio/AudioEngine.js';
import type { PlayerSnapshot } from '../../sim/PlayerMotor.js';
import type { Camera } from 'three';

export class PlayerFootsteps {
  private readonly audio: AudioEngine;
  private lastBobPhase = 0;
  private wasOnGround = true;
  private wasMantling = false;
  private wasExhausted = false;
  private breathVoice: VoiceHandle | null = null;
  private isUnderwater = false;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  update(
    snapshot: PlayerSnapshot,
    bobPhase: number,
    camera: Camera,
    waterY = 0.0,
  ): void {
    const horizSpeed = Math.hypot(snapshot.vel.x, snapshot.vel.z);

    // 1. Footstep on bob cycle bottom (plants occur at phase pi and 2pi)
    const prevCycle = Math.floor(this.lastBobPhase / Math.PI);
    const currCycle = Math.floor(bobPhase / Math.PI);

    if (currCycle > prevCycle && snapshot.onGround && horizSpeed > 0.3) {
      if (snapshot.wet) {
        // Wet footstep
        const intensity = snapshot.crouchT > 0.5 ? 0.35 : horizSpeed > 4.0 ? 1.0 : 0.65;
        const pitch = snapshot.crouchT > 0.5 ? 1.2 : 0.95;
        this.audio.play('wade_step', {
          position: snapshot.pos,
          gain: intensity,
          pitch,
        });
      } else {
        // Dry ceramic tile footstep
        const squeak = Math.random() < 0.12 && horizSpeed > 2.0;
        this.audio.play(squeak ? 'step_squeak' : 'step_dry', {
          position: snapshot.pos,
          gain: snapshot.crouchT > 0.5 ? 0.25 : 0.6,
        });
      }
    }
    this.lastBobPhase = bobPhase;

    // 2. Landing thuds / splashes
    if (!this.wasOnGround && snapshot.onGround) {
      const fallSpeed = Math.abs(snapshot.vel.y);
      if (fallSpeed > 1.2) {
        if (snapshot.wet) {
          const isBig = fallSpeed > 4.0;
          this.audio.play(isBig ? 'splash_big' : 'splash_jump', {
            position: snapshot.pos,
            gain: Math.min(1.0, 0.4 + fallSpeed * 0.12),
          });
        } else {
          this.audio.play('step_dry', {
            position: snapshot.pos,
            gain: Math.min(1.0, 0.4 + fallSpeed * 0.1),
          });
        }
      }
    }
    this.wasOnGround = snapshot.onGround;

    // 3. Mantle sound
    if (!this.wasMantling && snapshot.mantling) {
      this.audio.play('mantle', {
        position: snapshot.pos,
        gain: 0.8,
      });
    }
    this.wasMantling = snapshot.mantling;

    // 4. Exhausted breathing loop
    if (snapshot.exhausted && !this.wasExhausted) {
      if (!this.breathVoice) {
        this.breathVoice = this.audio.play('player_breath', { gain: 0.7 });
      }
    } else if (!snapshot.exhausted && this.wasExhausted) {
      if (this.breathVoice) {
        this.breathVoice.stop(0.6);
        this.breathVoice = null;
      }
    }
    this.wasExhausted = snapshot.exhausted;

    // 5. Underwater audio low-pass filter
    const camY = camera.position.y;
    const underwaterNow = camY < waterY - 0.05;
    if (underwaterNow !== this.isUnderwater) {
      this.isUnderwater = underwaterNow;
      this.audio.setUnderwater(underwaterNow ? 1.0 : 0.0);
    }
  }

  dispose(): void {
    if (this.breathVoice) {
      this.breathVoice.stop(0.1);
      this.breathVoice = null;
    }
    if (this.isUnderwater) {
      this.audio.setUnderwater(0.0);
      this.isUnderwater = false;
    }
  }
}

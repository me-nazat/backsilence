/* ── Footsteps.ts ──────────────────────────────────────────────────────────
 *  Audio footsteps, wading, landing, mantling, and exhausted breathing.
 *  Phase-locked to the player camera bob cycle.
 * ──────────────────────────────────────────────────────────────────────── */

import type { AudioEngine, VoiceHandle } from '../../audio/AudioEngine.js';
import type { PlayerSnapshot } from '../../sim/PlayerMotor.js';
import type { Camera } from 'three';

export class PlayerFootsteps {
  private readonly audio: AudioEngine;
  private readonly onSplash?: ((pos: { x: number; y: number; z: number }, strength: number) => void) | undefined;
  private lastBobPhase = 0;
  private wasOnGround = true;
  private wasMantling = false;
  private wasExhausted = false;
  private breathVoice: VoiceHandle | null = null;
  private isUnderwater = false;

  constructor(
    audio: AudioEngine,
    onSplash?: (pos: { x: number; y: number; z: number }, strength: number) => void,
  ) {
    this.audio = audio;
    this.onSplash = onSplash;
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
        // Phase-locked synchronized splash burst on foot plant frame
        this.onSplash?.({ x: snapshot.pos.x, y: waterY, z: snapshot.pos.z }, intensity * 0.75);
      } else {
        // Dry ceramic tile footstep (Prompt 3.3: dry gain 0.42 / 0.18, squeak prob 0.08 at speed > 2.5)
        const squeak = Math.random() < 0.08 && horizSpeed > 2.5;
        this.audio.play(squeak ? 'step_squeak' : 'step_dry', {
          position: snapshot.pos,
          gain: snapshot.crouchT > 0.5 ? 0.18 : 0.42,
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
          const gain = Math.min(1.0, 0.4 + fallSpeed * 0.12);
          this.audio.play(isBig ? 'splash_big' : 'splash_jump', {
            position: snapshot.pos,
            gain,
          });
          // Phase-locked splash impact on landing frame
          this.onSplash?.({ x: snapshot.pos.x, y: waterY, z: snapshot.pos.z }, Math.min(2.5, 0.8 + fallSpeed * 0.35));
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

    // 5. Underwater audio low-pass filter (Prompt 3.14: 12cm threshold so slight head-dip doesn't muffle)
    const camY = camera.position.y;
    const underwaterNow = camY < waterY - 0.12;
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

/* ── AudioDirector.ts ───────────────────────────────────────────────────────
 *  Dynamic tension coordinator and ambient soundscape director.
 *  Modulates subterranean drone, heartbeat BPM (55–140), hum brightness,
 *  reverb sends, and psychological "listening silence" dips.
 * ──────────────────────────────────────────────────────────────────────── */

import type { AudioEngine } from './AudioEngine.js';
import type { VoiceHandle } from './AudioEngine.js';
import { Rng } from '../procedural/core/prng.js';

export class AudioDirector {
  private engine: AudioEngine;
  private tension = 0.0;

  private lapLoop: VoiceHandle | null = null;
  private humLoop: VoiceHandle | null = null;
  private droneLoop: VoiceHandle | null = null;

  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private dripTimer: ReturnType<typeof setTimeout> | null = null;
  private dipTimer: ReturnType<typeof setTimeout> | null = null;

  private isAmbienceRunning = false;
  private rng = new Rng(808);

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  get currentTension(): number {
    return this.tension;
  }

  /**
   * Set game tension (0..1) smoothly driving heartbeat, drone, and atmospheric dread.
   */
  setTension(amount: number): void {
    const prev = this.tension;
    this.tension = Math.max(0.0, Math.min(1.0, amount));

    if (this.droneLoop) {
      this.droneLoop.setParam('tension', this.tension);
    }

    // Heartbeat logic: activates at tension >= 0.25
    if (this.tension >= 0.25 && prev < 0.25) {
      this.scheduleNextHeartbeat();
    } else if (this.tension < 0.25 && this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // High tension: occasional eerie "listening silence" dip
    if (this.tension >= 0.7 && !this.dipTimer) {
      this.scheduleListeningDip();
    }
  }

  private scheduleNextHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    if (this.tension < 0.25 || !this.isAmbienceRunning) return;

    // BPM scales from 55 to 140
    const bpm = 55.0 + this.tension * 85.0;
    const intervalMs = (60.0 / bpm) * 1000.0;

    this.engine.play('heartbeat', {
      bus: 'monster',
      intensity: 0.5 + this.tension * 0.5,
    });

    this.heartbeatTimer = setTimeout(() => {
      this.scheduleNextHeartbeat();
    }, intervalMs);
  }

  private scheduleListeningDip(): void {
    const delay = this.rng.range(15000, 35000);
    this.dipTimer = setTimeout(() => {
      if (this.tension >= 0.7 && this.isAmbienceRunning) {
        // Briefly duck ambient bus to 40% for 1.5s
        this.engine.duckBus('ambient', 0.4, 0.3, 1.5);
      }
      this.dipTimer = null;
      if (this.tension >= 0.7) {
        this.scheduleListeningDip();
      }
    }, delay);
  }

  /**
   * Start looping water laps, electrical hum, drone, and sparse acoustic drips.
   */
  startAmbience(): void {
    if (this.isAmbienceRunning) return;
    this.isAmbienceRunning = true;

    this.lapLoop = this.engine.play('lap_loop', { bus: 'ambient' });
    this.humLoop = this.engine.play('hum_loop', { bus: 'ambient' });
    this.droneLoop = this.engine.play('drone_loop', { bus: 'ambient' });
    this.droneLoop.setParam('tension', this.tension);

    this.scheduleNextDrip();
    if (this.tension >= 0.25) {
      this.scheduleNextHeartbeat();
    }
  }

  private scheduleNextDrip(): void {
    if (!this.isAmbienceRunning) return;
    const delay = this.rng.range(6000, 18000);
    this.dripTimer = setTimeout(() => {
      if (this.isAmbienceRunning) {
        this.engine.play('drip', {
          bus: 'ambient',
          seed: this.rng.int(1, 99999),
        });
        this.scheduleNextDrip();
      }
    }, delay);
  }

  stopAmbience(fade = 1.0): void {
    this.isAmbienceRunning = false;
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.dripTimer) {
      clearTimeout(this.dripTimer);
      this.dripTimer = null;
    }
    if (this.dipTimer) {
      clearTimeout(this.dipTimer);
      this.dipTimer = null;
    }

    if (this.lapLoop) {
      this.lapLoop.stop(fade);
      this.lapLoop = null;
    }
    if (this.humLoop) {
      this.humLoop.stop(fade);
      this.humLoop = null;
    }
    if (this.droneLoop) {
      this.droneLoop.stop(fade);
      this.droneLoop = null;
    }
  }

  dispose(): void {
    this.stopAmbience(0);
  }
}

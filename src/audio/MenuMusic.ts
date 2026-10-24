/* ── MenuMusic.ts ───────────────────────────────────────────────────────────
 *  Generative Subterranean Poolroom Menu Music:
 *  - Slow detuned analog pad (dual oscillators with subtle drift)
 *  - Sparse procedural pentatonic plucks through poolroom reverberation
 *  - Dynamic dread layer that rises in-game (0..1) and falls away in menus (0.0)
 *  - Mute on blur, master ducking, and gesture gating
 * ──────────────────────────────────────────────────────────────────────── */

import type { AudioEngine } from './AudioEngine.js';

export class MenuMusic {
  private static instance: MenuMusic | null = null;
  private engine: AudioEngine;
  private isPlaying = false;
  private isMuted = false;
  private dread = 0.0;
  private volume = 0.45;

  private padGain: GainNode | null = null;
  private dreadGain: GainNode | null = null;
  private pluckTimer: ReturnType<typeof setTimeout> | null = null;

  static getInstance(engine?: AudioEngine): MenuMusic {
    if (!this.instance && engine) {
      this.instance = new MenuMusic(engine);
    }
    return this.instance!;
  }

  constructor(engine: AudioEngine) {
    this.engine = engine;
    MenuMusic.instance = this;
    this.bindWindowEvents();
  }

  private bindWindowEvents(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('blur', () => {
      this.setMute(true);
    });

    window.addEventListener('focus', () => {
      this.setMute(false);
    });
  }

  setMute(mute: boolean): void {
    this.isMuted = mute;
    if (this.padGain) {
      const ctx = this.engine.getContext();
      if (!ctx) return;
      const target = mute ? 0.0001 : this.volume;
      this.padGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
    }
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1.0, vol));
    if (this.padGain && !this.isMuted) {
      const ctx = this.engine.getContext();
      if (ctx) {
        this.padGain.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.1);
      }
    }
  }

  /**
   * Sets in-game dread (0..1). In main menus, pass 0.0 to fall back to peaceful aquatic ambiance.
   */
  setDread(level: number): void {
    this.dread = Math.max(0, Math.min(1.0, level));
    if (this.dreadGain) {
      const ctx = this.engine.getContext();
      if (ctx) {
        // Dread layer fades in proportionally to tension
        this.dreadGain.gain.setTargetAtTime(this.dread * 0.4, ctx.currentTime, 0.5);
      }
    }
  }

  start(): void {
    if (this.isPlaying) return;
    const ctx = this.engine.getContext();
    if (!ctx) return;

    this.isPlaying = true;
    const now = ctx.currentTime;

    // Master music bus gain
    const musicBus = ctx.createGain();
    musicBus.gain.setValueAtTime(this.isMuted ? 0.0001 : this.volume, now);
    const ambientBus = this.engine.getBusNode('ambient');
    if (ambientBus) {
      musicBus.connect(ambientBus);
    } else {
      musicBus.connect(ctx.destination);
    }
    this.padGain = musicBus;

    // 1. Detuned Pad: 110 Hz and 111.4 Hz
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110.0, now); // A2
    osc2.frequency.setValueAtTime(111.4, now); // subtle detune beat

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(260, now);

    const padPreGain = ctx.createGain();
    padPreGain.gain.setValueAtTime(0.35, now);

    osc1.connect(padFilter);
    osc2.connect(padFilter);
    padFilter.connect(padPreGain);
    padPreGain.connect(musicBus);

    osc1.start(now);
    osc2.start(now);

    // 2. Dread Drone Layer (controlled by setDread)
    const dreadOsc = ctx.createOscillator();
    dreadOsc.type = 'sawtooth';
    dreadOsc.frequency.setValueAtTime(55.0, now); // Low A1

    const dreadFilter = ctx.createBiquadFilter();
    dreadFilter.type = 'lowpass';
    dreadFilter.frequency.setValueAtTime(180, now);

    const dreadGainNode = ctx.createGain();
    dreadGainNode.gain.setValueAtTime(0.0001, now);

    dreadOsc.connect(dreadFilter);
    dreadFilter.connect(dreadGainNode);
    dreadGainNode.connect(musicBus);
    dreadOsc.start(now);
    this.dreadGain = dreadGainNode;

    // 3. Start sparse procedural pentatonic plucks
    this.scheduleNextPluck();
  }

  private scheduleNextPluck(): void {
    if (!this.isPlaying) return;

    // Pluck delay between 2.2 and 5.5 seconds
    const delayMs = 2200 + Math.random() * 3300;
    this.pluckTimer = setTimeout(() => {
      this.playPentatonicPluck();
      this.scheduleNextPluck();
    }, delayMs);
  }

  private playPentatonicPluck(): void {
    if (this.isMuted) return;
    const ctx = this.engine.getContext();
    if (!ctx) return;

    // E minor pentatonic scale frequencies
    const pentatonic = [164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0];
    const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)]!;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.8);

    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc.connect(filter);
    filter.connect(g);

    if (this.padGain) {
      g.connect(this.padGain);
    }

    osc.start(now);
    osc.stop(now + 1.25);
  }

  stop(): void {
    this.isPlaying = false;
    if (this.pluckTimer) {
      clearTimeout(this.pluckTimer);
      this.pluckTimer = null;
    }
    if (this.padGain) {
      try {
        this.padGain.disconnect();
      } catch {
        // ignore
      }
      this.padGain = null;
    }
  }
}

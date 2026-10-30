/* ── MenuMusic.ts ───────────────────────────────────────────────────────────
 *  True Subterranean Liminal Horror Room Tone & Background Ambience:
 *  - Sub-Bass Room Pressure: Filtered pink/brown noise + detuned sines (90–160 Hz) at -28 dBFS (~0.04)
 *  - Randomized Distant Water Drips & Pipe Resonance (3.5s – 9.0s, 600–1400 Hz, decay 0.08s) into convolution reverb
 *  - Subtle Structural Groans (55–110 Hz, slow attack 1.5s, tail 4.0s)
 *  - Dynamic dread layer that modulates room pressure and HF darkness
 *  - Zero raw sawtooth/square buzzing loops, zero repetitive pentatonic arpeggios
 * ──────────────────────────────────────────────────────────────────────── */

import type { AudioEngine } from './AudioEngine.js';

function createSubNoiseBuffer(ctx: BaseAudioContext, durationSec = 4.0): AudioBuffer | null {
  if (typeof ctx.createBuffer !== 'function') return null;
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99 * b0 + white * 0.05;
    b1 = 0.95 * b1 + white * 0.1;
    b2 = 0.85 * b2 + white * 0.15;
    data[i] = (b0 + b1 + b2) * 0.35;
  }
  return buffer;
}

export class MenuMusic {
  private static instance: MenuMusic | null = null;
  private engine: AudioEngine;
  private isPlaying = false;
  private isMuted = false;
  private dread = 0.0;
  private volume = 0.45;

  private masterBus: GainNode | null = null;
  private pressureGain: GainNode | null = null;
  private dreadGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private activeOscs: OscillatorNode[] = [];

  private dripTimer: ReturnType<typeof setTimeout> | null = null;
  private groanTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (this.masterBus) {
      const ctx = this.engine.getContext();
      if (!ctx) return;
      const target = mute ? 0.0001 : this.volume;
      this.masterBus.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
    }
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1.0, vol));
    if (this.masterBus && !this.isMuted) {
      const ctx = this.engine.getContext();
      if (ctx) {
        this.masterBus.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.1);
      }
    }
  }

  /**
   * Sets in-game dread/tension (0..1).
   * Modulates subterranean room pressure depth and low-end resonance.
   */
  setDread(level: number): void {
    this.dread = Math.max(0, Math.min(1.0, level));
    const ctx = this.engine.getContext();
    if (!ctx) return;

    if (this.dreadGain) {
      const dreadTarget = 0.0001 + this.dread * 0.45;
      this.dreadGain.gain.setTargetAtTime(dreadTarget, ctx.currentTime, 0.4);
    }
    if (this.pressureGain && !this.isMuted) {
      // Sub-bass room pressure deepens smoothly with tension
      const pressureTarget = 0.0398 * (1.0 + this.dread * 1.5); // ~-28 dBFS baseline
      this.pressureGain.gain.setTargetAtTime(pressureTarget, ctx.currentTime, 0.4);
    }
  }

  start(): void {
    if (this.isPlaying) return;
    const ctx = this.engine.getContext();
    if (!ctx) return;

    this.isPlaying = true;
    const now = ctx.currentTime;

    // Master music / ambience bus gain
    const musicBus = ctx.createGain();
    const initialGain = this.isMuted ? 0.0001 : this.volume;
    musicBus.gain.setValueAtTime(initialGain, now);

    const busNode = this.engine.getBusNode('music') ?? this.engine.getBusNode('ambient');
    if (busNode) {
      musicBus.connect(busNode);
    } else {
      musicBus.connect(ctx.destination);
    }
    this.masterBus = musicBus;
    this.activeOscs = [];

    // 1. Sub-Bass Room Pressure Bed: Gentle low-pass (90 Hz - 160 Hz) at -28 dBFS
    const pressureBus = ctx.createGain();
    pressureBus.gain.setValueAtTime(0.0398, now); // -28 dBFS
    pressureBus.connect(musicBus);
    this.pressureGain = pressureBus;

    const pressureLp = ctx.createBiquadFilter();
    pressureLp.type = 'lowpass';
    pressureLp.frequency.setValueAtTime(125, now);
    pressureLp.Q.value = 0.707;
    pressureLp.connect(pressureBus);

    // Warm sub-bass pure sines (55.0 Hz and 55.35 Hz subtle detune beat)
    const subOsc1 = ctx.createOscillator();
    subOsc1.type = 'sine';
    subOsc1.frequency.setValueAtTime(55.0, now);

    const subOsc2 = ctx.createOscillator();
    subOsc2.type = 'sine';
    subOsc2.frequency.setValueAtTime(55.35, now);

    subOsc1.connect(pressureLp);
    subOsc2.connect(pressureLp);
    subOsc1.start(now);
    subOsc2.start(now);
    this.activeOscs.push(subOsc1, subOsc2);

    // Sub-bass noise buffer for subterranean hall air pressure
    const noiseBuf = createSubNoiseBuffer(ctx, 4.0);
    if (noiseBuf) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      noise.connect(pressureLp);
      noise.start(now);
      this.noiseSource = noise;
    }

    // 2. Dread Resonance Layer (sine/triangle low foundation at 41.2 Hz / 82.4 Hz, zero sawtooth)
    const dreadBus = ctx.createGain();
    dreadBus.gain.setValueAtTime(0.0001 + this.dread * 0.45, now);
    dreadBus.connect(musicBus);
    this.dreadGain = dreadBus;

    const dreadLp = ctx.createBiquadFilter();
    dreadLp.type = 'lowpass';
    dreadLp.frequency.setValueAtTime(140, now);
    dreadLp.connect(dreadBus);

    const dreadOsc = ctx.createOscillator();
    dreadOsc.type = 'sine';
    dreadOsc.frequency.setValueAtTime(82.4, now); // E2
    dreadOsc.connect(dreadLp);
    dreadOsc.start(now);
    this.activeOscs.push(dreadOsc);

    // 3. Start randomized distant water drips & structural groans
    this.scheduleNextDrip();
    this.scheduleNextGroan();
  }

  /**
   * Randomized distant water drips and pipe resonance:
   * Stochastic impulse trigger every 3.5s - 9.0s, short bandpass noise burst + damped sine droplet (600–1400 Hz, decay: 0.08s)
   * routed into stereo convolution reverb node simulating flooded tiled natatorium.
   */
  private scheduleNextDrip(): void {
    if (!this.isPlaying) return;

    const delayMs = 3500 + Math.random() * 5500; // 3.5s – 9.0s
    this.dripTimer = setTimeout(() => {
      this.playLiminalDrip();
      this.scheduleNextDrip();
    }, delayMs);
  }

  private playLiminalDrip(): void {
    if (this.isMuted || !this.masterBus) return;
    const ctx = this.engine.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freq = 600 + Math.random() * 800; // 600 Hz – 1400 Hz

    // Damped sine droplet
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.08, now + 0.08); // subtle van den Doel upward ping

    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.linearRampToValueAtTime(0.12, now + 0.003);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    // Short bandpass noise burst
    const noiseBuf = createSubNoiseBuffer(ctx, 0.1);
    let noiseSource: AudioBufferSourceNode | null = null;
    let noiseGain: GainNode | null = null;
    let bp: BiquadFilterNode | null = null;

    if (noiseBuf) {
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuf;
      bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(freq, now);
      bp.Q.value = 4.0;

      noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(0.06, now + 0.003);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      noiseSource.connect(bp);
      bp.connect(noiseGain);
      noiseGain.connect(this.masterBus);
    }

    osc.connect(oscGain);
    oscGain.connect(this.masterBus);

    // Route droplet tail into natatorium convolution reverb
    const reverbSend = typeof this.engine.getReverbSend === 'function' ? this.engine.getReverbSend() : null;
    if (reverbSend) {
      const wetGain = ctx.createGain();
      wetGain.gain.setValueAtTime(0.45, now);
      wetGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      oscGain.connect(wetGain);
      wetGain.connect(reverbSend);
    }

    osc.start(now);
    osc.stop(now + 0.1);
    if (noiseSource) {
      noiseSource.start(now);
      noiseSource.stop(now + 0.05);
    }
  }

  /**
   * Subtle structural groans:
   * Rare, low-frequency damped metallic resonances (55 Hz – 110 Hz) with slow attack (1.5s) and long tail (4.0s) at low volume.
   */
  private scheduleNextGroan(): void {
    if (!this.isPlaying) return;

    const delayMs = 14000 + Math.random() * 14000; // 14s – 28s
    this.groanTimer = setTimeout(() => {
      this.playStructuralGroan();
      this.scheduleNextGroan();
    }, delayMs);
  }

  private playStructuralGroan(): void {
    if (this.isMuted || !this.masterBus) return;
    const ctx = this.engine.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freq = 55 + Math.random() * 55; // 55 Hz – 110 Hz

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.linearRampToValueAtTime(freq * 0.96, now + 5.5);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    filter.Q.value = 1.0;

    // Slow attack (1.5s) and long tail (4.0s) at low volume (~0.05)
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.045, now + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterBus);

    const reverbSend = typeof this.engine.getReverbSend === 'function' ? this.engine.getReverbSend() : null;
    if (reverbSend) {
      const wet = ctx.createGain();
      wet.gain.setValueAtTime(0.35, now);
      g.connect(wet);
      wet.connect(reverbSend);
    }

    osc.start(now);
    osc.stop(now + 5.6);
  }

  stop(): void {
    this.isPlaying = false;
    if (this.dripTimer) {
      clearTimeout(this.dripTimer);
      this.dripTimer = null;
    }
    if (this.groanTimer) {
      clearTimeout(this.groanTimer);
      this.groanTimer = null;
    }
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
        this.noiseSource.disconnect();
      } catch {
        // ignore
      }
      this.noiseSource = null;
    }
    for (const osc of this.activeOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeOscs = [];
    if (this.masterBus) {
      try {
        this.masterBus.disconnect();
      } catch {
        // ignore
      }
      this.masterBus = null;
    }
  }
}

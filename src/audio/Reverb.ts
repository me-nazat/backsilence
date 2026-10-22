/* ── Reverb.ts ────────────────────────────────────────────────────────────
 *  Procedural algorithmic impulse response generator and dual-convolver crossfader.
 *  Generates decorrelated stereo reverberation for four architectural presets.
 * ──────────────────────────────────────────────────────────────────────── */

import { mulberry32 } from '../procedural/core/prng.js';

export type ReverbPreset = 'poolroom' | 'tunnel' | 'atrium' | 'drain' | 'school' | 'jungle' | 'city' | 'station';

export interface ReverbPresetConfig {
  duration: number;
  decay: number;
  brightness: number; // HF retention (0 = muffled dark, 1 = ceramic tile bright)
  flutter: number;    // Metallic flutter ring
  preDelay: number;   // Initial silence before first reflections, seconds
}

export const PRESET_CONFIGS: Record<ReverbPreset, ReverbPresetConfig> = {
  poolroom: {
    duration: 2.4,
    decay: 2.2,
    brightness: 0.88,
    flutter: 0.04,
    preDelay: 0.015,
  },
  tunnel: {
    duration: 1.6,
    decay: 2.8,
    brightness: 0.75,
    flutter: 0.25,
    preDelay: 0.008,
  },
  atrium: {
    duration: 3.2,
    decay: 1.7,
    brightness: 0.82,
    flutter: 0.02,
    preDelay: 0.035,
  },
  drain: {
    duration: 4.5,
    decay: 1.4,
    brightness: 0.35,
    flutter: 0.08,
    preDelay: 0.02,
  },
  school: {
    duration: 1.4,
    decay: 2.8,
    brightness: 0.92,
    flutter: 0.08,
    preDelay: 0.01,
  },
  jungle: {
    duration: 1.1,
    decay: 3.5,
    brightness: 0.35,
    flutter: 0.01,
    preDelay: 0.02,
  },
  city: {
    duration: 2.2,
    decay: 2.0,
    brightness: 0.7,
    flutter: 0.18,
    preDelay: 0.045,
  },
  station: {
    duration: 3.8,
    decay: 1.5,
    brightness: 0.85,
    flutter: 0.06,
    preDelay: 0.025,
  },
};

/**
 * Generate a procedural stereo impulse response buffer.
 */
export function createImpulseResponse(
  ctx: BaseAudioContext,
  preset: ReverbPreset,
): AudioBuffer {
  const cfg = PRESET_CONFIGS[preset];
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * cfg.duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);

  const rngL = mulberry32(1001);
  const rngR = mulberry32(2002);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const preDelaySamples = Math.floor(cfg.preDelay * sampleRate);
  const flutterFreq = 55.0; // Hz flutter ring

  // Two-pole lowpass filter state for frequency-dependent decay
  let lpL = 0;
  let lpR = 0;
  const lpCoeff = 0.2 + cfg.brightness * 0.75;

  for (let i = 0; i < length; i++) {
    if (i < preDelaySamples) {
      left[i] = 0;
      right[i] = 0;
      continue;
    }

    const t = (i - preDelaySamples) / sampleRate;
    // Exponential amplitude decay
    const env = Math.exp(-t * cfg.decay);

    // Decorrelated noise
    const nl = rngL() * 2.0 - 1.0;
    const nr = rngR() * 2.0 - 1.0;

    // Flutter / metallic resonance modulation
    const flutterMod = 1.0 + Math.sin(t * flutterFreq * Math.PI * 2.0) * cfg.flutter;

    // Filter noise to simulate acoustic surface absorption
    lpL = lpL + lpCoeff * (nl - lpL);
    lpR = lpR + lpCoeff * (nr - lpR);

    // Fade in first 5ms to avoid click
    const attack = Math.min(1.0, (i - preDelaySamples) / (sampleRate * 0.005));

    left[i] = lpL * env * flutterMod * attack;
    right[i] = lpR * env * flutterMod * attack;
  }

  return buffer;
}

/**
 * Dual-convolver crossfading reverb unit.
 * Smoothly transitions between presets over 1.5 seconds without audible clicks.
 */
export class ReverbUnit {
  readonly input: GainNode;
  readonly output: GainNode;

  private ctx: BaseAudioContext;
  private convA: ConvolverNode;
  private convB: ConvolverNode;
  private gainA: GainNode;
  private gainB: GainNode;

  private currentSlot: 'A' | 'B' = 'A';
  private currentPreset: ReverbPreset = 'poolroom';

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.convA = ctx.createConvolver();
    this.convB = ctx.createConvolver();

    this.gainA = ctx.createGain();
    this.gainB = ctx.createGain();

    // Initial slot A active
    this.gainA.gain.value = 1.0;
    this.gainB.gain.value = 0.0;

    this.convA.buffer = createImpulseResponse(ctx, 'poolroom');
    this.convB.buffer = createImpulseResponse(ctx, 'poolroom');

    this.input.connect(this.convA);
    this.input.connect(this.convB);

    this.convA.connect(this.gainA);
    this.convB.connect(this.gainB);

    this.gainA.connect(this.output);
    this.gainB.connect(this.output);
  }

  get preset(): ReverbPreset {
    return this.currentPreset;
  }

  /**
   * Crossfade to a new reverb preset over 1.5 seconds.
   */
  setPreset(name: ReverbPreset): void {
    if (name === this.currentPreset) return;
    this.currentPreset = name;

    const nextBuffer = createImpulseResponse(this.ctx, name);
    const now = this.ctx.currentTime;
    const fadeDuration = 1.5;

    if (this.currentSlot === 'A') {
      // Slot A -> Slot B
      this.convB.buffer = nextBuffer;
      this.gainA.gain.cancelScheduledValues(now);
      this.gainB.gain.cancelScheduledValues(now);

      this.gainA.gain.setValueAtTime(this.gainA.gain.value, now);
      this.gainA.gain.linearRampToValueAtTime(0.0, now + fadeDuration);

      this.gainB.gain.setValueAtTime(this.gainB.gain.value, now);
      this.gainB.gain.linearRampToValueAtTime(1.0, now + fadeDuration);

      this.currentSlot = 'B';
    } else {
      // Slot B -> Slot A
      this.convA.buffer = nextBuffer;
      this.gainA.gain.cancelScheduledValues(now);
      this.gainB.gain.cancelScheduledValues(now);

      this.gainB.gain.setValueAtTime(this.gainB.gain.value, now);
      this.gainB.gain.linearRampToValueAtTime(0.0, now + fadeDuration);

      this.gainA.gain.setValueAtTime(this.gainA.gain.value, now);
      this.gainA.gain.linearRampToValueAtTime(1.0, now + fadeDuration);

      this.currentSlot = 'A';
    }
  }

  dispose(): void {
    this.input.disconnect();
    this.convA.disconnect();
    this.convB.disconnect();
    this.gainA.disconnect();
    this.gainB.disconnect();
    this.output.disconnect();
  }
}

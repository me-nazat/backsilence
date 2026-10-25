/* ── Reverb.ts ────────────────────────────────────────────────────────────
 *  Procedural algorithmic impulse response generator and dual-convolver crossfader.
 *  Generates decorrelated stereo reverberation for four architectural presets.
 * ──────────────────────────────────────────────────────────────────────── */

import { mulberry32 } from '../procedural/core/prng.js';

export type ReverbPreset = 'poolroom' | 'tunnel' | 'atrium' | 'drain' | 'school' | 'jungle' | 'city' | 'station';

export interface EarlyReflection {
  delayMs: number;
  gain: number;
  pan: number; // -1 (left) to +1 (right)
}

export interface ReverbPresetConfig {
  duration: number;
  decay: number;
  brightness: number; // HF retention (0 = muffled dark, 1 = ceramic tile bright)
  flutter: number;    // Metallic flutter ring
  flutterFreq?: number;
  preDelay: number;   // Initial silence before first reflections, seconds
  t60_125: number;    // Target T60 at 125 Hz in seconds
  t60_500: number;    // Target T60 at 500 Hz in seconds
  t60_2k: number;     // Target T60 at 2 kHz in seconds
  t60_8k: number;     // Target T60 at 8 kHz in seconds
  earlyReflections: EarlyReflection[];
}

export const PRESET_CONFIGS: Record<ReverbPreset, ReverbPresetConfig> = {
  poolroom: {
    duration: 4.2,
    decay: 2.0,
    brightness: 0.82,
    flutter: 0.03,
    preDelay: 0.012,
    t60_125: 3.8,
    t60_500: 3.4,
    t60_2k: 2.6,
    t60_8k: 1.4,
    earlyReflections: [
      { delayMs: 8.5, gain: 0.65, pan: -0.15 },
      { delayMs: 18.2, gain: 0.55, pan: 0.20 },
      { delayMs: 29.4, gain: 0.46, pan: -0.60 },
      { delayMs: 42.1, gain: 0.40, pan: 0.65 },
      { delayMs: 54.8, gain: 0.32, pan: -0.25 },
      { delayMs: 66.3, gain: 0.26, pan: 0.40 },
      { delayMs: 77.2, gain: 0.20, pan: -0.45 },
    ],
  },
  tunnel: {
    duration: 2.8,
    decay: 2.8,
    brightness: 0.70,
    flutter: 0.25,
    flutterFreq: 58.0,
    preDelay: 0.008,
    t60_125: 2.4,
    t60_500: 1.8,
    t60_2k: 1.2,
    t60_8k: 0.7,
    earlyReflections: [
      { delayMs: 6.2, gain: 0.70, pan: -0.30 },
      { delayMs: 12.5, gain: 0.60, pan: 0.35 },
      { delayMs: 21.0, gain: 0.50, pan: -0.50 },
      { delayMs: 34.0, gain: 0.38, pan: 0.55 },
      { delayMs: 51.0, gain: 0.28, pan: -0.30 },
      { delayMs: 72.0, gain: 0.18, pan: 0.20 },
    ],
  },
  atrium: {
    duration: 4.5,
    decay: 1.8,
    brightness: 0.85,
    flutter: 0.02,
    preDelay: 0.025,
    t60_125: 4.2,
    t60_500: 3.6,
    t60_2k: 2.8,
    t60_8k: 1.6,
    earlyReflections: [
      { delayMs: 14.0, gain: 0.60, pan: 0.10 },
      { delayMs: 26.5, gain: 0.52, pan: -0.40 },
      { delayMs: 39.0, gain: 0.45, pan: 0.45 },
      { delayMs: 53.0, gain: 0.35, pan: -0.60 },
      { delayMs: 68.0, gain: 0.25, pan: 0.50 },
    ],
  },
  drain: {
    duration: 4.8,
    decay: 1.5,
    brightness: 0.35,
    flutter: 0.08,
    flutterFreq: 42.0,
    preDelay: 0.015,
    t60_125: 4.6,
    t60_500: 3.0,
    t60_2k: 1.4,
    t60_8k: 0.5,
    earlyReflections: [
      { delayMs: 9.0, gain: 0.65, pan: -0.20 },
      { delayMs: 18.0, gain: 0.52, pan: 0.25 },
      { delayMs: 32.0, gain: 0.40, pan: -0.40 },
      { delayMs: 48.0, gain: 0.30, pan: 0.35 },
      { delayMs: 65.0, gain: 0.20, pan: -0.30 },
    ],
  },
  school: {
    duration: 1.4,
    decay: 2.8,
    brightness: 0.92,
    flutter: 0.08,
    flutterFreq: 65.0,
    preDelay: 0.010,
    t60_125: 1.8,
    t60_500: 1.5,
    t60_2k: 1.2,
    t60_8k: 0.8,
    earlyReflections: [
      { delayMs: 7.5, gain: 0.65, pan: -0.25 },
      { delayMs: 15.0, gain: 0.52, pan: 0.30 },
      { delayMs: 25.0, gain: 0.42, pan: -0.50 },
      { delayMs: 38.0, gain: 0.32, pan: 0.40 },
      { delayMs: 55.0, gain: 0.22, pan: -0.20 },
      { delayMs: 74.0, gain: 0.15, pan: 0.30 },
    ],
  },
  jungle: {
    duration: 1.1,
    decay: 3.5,
    brightness: 0.35,
    flutter: 0.01,
    preDelay: 0.020,
    t60_125: 1.4,
    t60_500: 1.1,
    t60_2k: 0.7,
    t60_8k: 0.3,
    earlyReflections: [
      { delayMs: 15.0, gain: 0.45, pan: -0.30 },
      { delayMs: 32.0, gain: 0.30, pan: 0.40 },
      { delayMs: 52.0, gain: 0.20, pan: -0.50 },
      { delayMs: 71.0, gain: 0.12, pan: 0.30 },
    ],
  },
  city: {
    duration: 2.2,
    decay: 2.0,
    brightness: 0.70,
    flutter: 0.18,
    flutterFreq: 45.0,
    preDelay: 0.035,
    t60_125: 2.8,
    t60_500: 2.3,
    t60_2k: 1.7,
    t60_8k: 0.9,
    earlyReflections: [
      { delayMs: 22.0, gain: 0.58, pan: 0.40 },
      { delayMs: 38.0, gain: 0.48, pan: -0.55 },
      { delayMs: 54.0, gain: 0.38, pan: 0.60 },
      { delayMs: 72.0, gain: 0.28, pan: -0.45 },
    ],
  },
  station: {
    duration: 3.8,
    decay: 1.5,
    brightness: 0.85,
    flutter: 0.06,
    flutterFreq: 38.0,
    preDelay: 0.022,
    t60_125: 4.4,
    t60_500: 3.8,
    t60_2k: 2.6,
    t60_8k: 1.3,
    earlyReflections: [
      { delayMs: 12.0, gain: 0.65, pan: -0.20 },
      { delayMs: 24.0, gain: 0.55, pan: 0.30 },
      { delayMs: 38.0, gain: 0.45, pan: -0.45 },
      { delayMs: 52.0, gain: 0.36, pan: 0.50 },
      { delayMs: 67.0, gain: 0.28, pan: -0.30 },
      { delayMs: 79.0, gain: 0.20, pan: 0.40 },
    ],
  },
};

/**
 * 2-pole Biquad Bandpass Filter (0 dB peak gain) for octave-band splitting
 */
interface BiquadBP {
  process(x: number): number;
}

function makeBiquadBP(freq: number, Q: number, sampleRate: number): BiquadBP {
  const f = Math.min(freq, sampleRate * 0.45);
  const w0 = (2.0 * Math.PI * f) / sampleRate;
  const alpha = Math.sin(w0) / (2.0 * Q);
  const cosw0 = Math.cos(w0);
  const a0 = 1.0 + alpha;
  const b0 = alpha / a0;
  const b1 = 0;
  const b2 = -alpha / a0;
  const a1 = (-2.0 * cosw0) / a0;
  const a2 = (1.0 - alpha) / a0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  return {
    process(x: number): number {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      return y;
    },
  };
}

/**
 * Generate a procedural stereo impulse response buffer with image-source
 * early reflections (< 80ms) and octave-band filtered diffuse decay (Section 7 C.1).
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
  const flutterFreq = cfg.flutterFreq ?? 55.0;

  // Compute octave band decay rates: k = ln(1000) / T60 = 6.907755 / T60
  const k125 = 6.907755 / Math.max(0.1, cfg.t60_125);
  const k500 = 6.907755 / Math.max(0.1, cfg.t60_500);
  const k2k = 6.907755 / Math.max(0.1, cfg.t60_2k);
  const k8k = 6.907755 / Math.max(0.1, cfg.t60_8k);

  // Octave bandpass filters (Q = 0.9 for smooth spectral overlap)
  const bp125_L = makeBiquadBP(125, 0.9, sampleRate);
  const bp125_R = makeBiquadBP(125, 0.9, sampleRate);
  const bp500_L = makeBiquadBP(500, 0.9, sampleRate);
  const bp500_R = makeBiquadBP(500, 0.9, sampleRate);
  const bp2k_L = makeBiquadBP(2000, 0.9, sampleRate);
  const bp2k_R = makeBiquadBP(2000, 0.9, sampleRate);
  const bp8k_L = makeBiquadBP(8000, 0.9, sampleRate);
  const bp8k_R = makeBiquadBP(8000, 0.9, sampleRate);

  // 1. Synthesize diffuse decay across octave bands
  for (let i = 0; i < length; i++) {
    if (i < preDelaySamples) {
      left[i] = 0;
      right[i] = 0;
      continue;
    }

    const t = (i - preDelaySamples) / sampleRate;

    // Decorrelated noise sources
    const nl = rngL() * 2.0 - 1.0;
    const nr = rngR() * 2.0 - 1.0;

    // Filter noise into octave bands
    const s125_L = bp125_L.process(nl);
    const s125_R = bp125_R.process(nr);
    const s500_L = bp500_L.process(nl);
    const s500_R = bp500_R.process(nr);
    const s2k_L = bp2k_L.process(nl);
    const s2k_R = bp2k_R.process(nr);
    const s8k_L = bp8k_L.process(nl);
    const s8k_R = bp8k_R.process(nr);

    // Band decay envelopes
    const env125 = Math.exp(-t * k125);
    const env500 = Math.exp(-t * k500);
    let env2k = Math.exp(-t * k2k);
    let env8k = Math.exp(-t * k8k);

    // Flutter modulation on upper-mid reflections
    if (cfg.flutter > 0) {
      const flutterMod = 1.0 + Math.sin(t * flutterFreq * Math.PI * 2.0) * cfg.flutter;
      env2k *= flutterMod;
      env8k *= flutterMod;
    }

    // Smooth emergence of diffuse field (35 ms ramp from pre-delay)
    const diffuseFade = Math.min(1.0, Math.max(0, t / 0.035));

    // Octave weighting
    const w125 = 0.90;
    const w500 = 1.00;
    const w2k = 0.85 * cfg.brightness;
    const w8k = 0.60 * cfg.brightness;

    left[i] = (w125 * s125_L * env125 + w500 * s500_L * env500 + w2k * s2k_L * env2k + w8k * s8k_L * env8k) * diffuseFade;
    right[i] = (w125 * s125_R * env125 + w500 * s500_R * env500 + w2k * s2k_R * env2k + w8k * s8k_R * env8k) * diffuseFade;
  }

  // 2. Inject Image-Source Early Reflections (< 80ms)
  for (const tap of cfg.earlyReflections) {
    const tapSample = Math.floor(preDelaySamples + (tap.delayMs * 0.001) * sampleRate);
    if (tapSample >= length - 2) continue;

    const gainL = tap.gain * (1.0 - tap.pan) * 0.5;
    const gainR = tap.gain * (1.0 + tap.pan) * 0.5;

    // Triangular 3-sample pulse to avoid harsh non-physical impulses
    left[tapSample - 1] = (left[tapSample - 1] ?? 0) + gainL * 0.25;
    left[tapSample] = (left[tapSample] ?? 0) + gainL * 0.50;
    left[tapSample + 1] = (left[tapSample + 1] ?? 0) + gainL * 0.25;

    right[tapSample - 1] = (right[tapSample - 1] ?? 0) + gainR * 0.25;
    right[tapSample] = (right[tapSample] ?? 0) + gainR * 0.50;
    right[tapSample + 1] = (right[tapSample + 1] ?? 0) + gainR * 0.25;
  }

  // 3. Peak normalization to 0.65 to ensure clean convolution gain
  let maxPeak = 0;
  for (let i = 0; i < length; i++) {
    const absL = Math.abs(left[i] ?? 0);
    const absR = Math.abs(right[i] ?? 0);
    if (absL > maxPeak) maxPeak = absL;
    if (absR > maxPeak) maxPeak = absR;
  }
  if (maxPeak > 1e-4) {
    const norm = 0.65 / maxPeak;
    for (let i = 0; i < length; i++) {
      left[i] = (left[i] ?? 0) * norm;
      right[i] = (right[i] ?? 0) * norm;
    }
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

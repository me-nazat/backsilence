/* ── AudioBufferPool.ts ───────────────────────────────────────────────────
 *  Pre-baked procedural one-shot AudioBuffer pool (Prompt 4 Section 6 B2).
 *  Synthesizes heavy voices into a mono AudioBuffer pool during warm-up
 *  in idle slices <= 6 ms so runtime gameplay causes zero audio node allocations.
 *  Uses van den Doel (2005) liquid bubble physics for splashes, drips, and wades.
 * ──────────────────────────────────────────────────────────────────────── */

import { Rng } from '../procedural/core/prng.js';
import type { RawVoiceHandle } from './AudioEngine.js';

export type PooledVoiceCategory =
  | 'splash_small'
  | 'splash_medium'
  | 'splash_heavy'
  | 'wade_step'
  | 'drip'
  | 'step_wet'
  | 'step_dry'
  | 'monster_footfall';

/** Synthesizes a single van den Doel (2005) bubble into a buffer */
export function synthesizeVanDenDoelBubble(
  data: Float32Array,
  sampleRate: number,
  startSample: number,
  radiusMeters: number,
  amplitude: number,
  riseScale = 0.1
): void {
  // van den Doel 2005: f0 = 3 / r (Hz)
  const f0 = 3.0 / Math.max(0.0005, radiusMeters);
  // Damping d = 0.043 * f0 + 0.0014 * f0^1.5
  const d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);

  const durationSec = Math.min(0.2, 5.0 / d);
  const numSamples = Math.floor(durationSec * sampleRate);
  const endSample = Math.min(data.length, startSample + numSamples);

  for (let i = startSample; i < endSample; i++) {
    const t = (i - startSample) / sampleRate;
    // Phase integral with frequency rising over time: f(t) = f0 * (1 + riseScale * d * t)
    const phase = 2.0 * Math.PI * f0 * (t + 0.5 * riseScale * d * t * t);
    // Envelope: 1 ms linear attack, exponential damping
    const attack = Math.min(1.0, t / 0.001);
    const env = attack * Math.exp(-d * t);
    data[i] = (data[i] ?? 0) + amplitude * env * Math.sin(phase);
  }
}

/** Synthesize a procedural splash into a mono Float32Array */
function renderSplashBuffer(
  sampleRate: number,
  type: 'small' | 'medium' | 'heavy',
  seed: number
): Float32Array {
  const rng = new Rng(seed);
  const duration = type === 'small' ? 0.35 : type === 'medium' ? 0.65 : 0.95;
  const length = Math.floor(sampleRate * duration);
  const out = new Float32Array(length);

  // 1. Initial Impact burst: bandpassed noise swept 3.5 kHz -> 400 Hz
  const burstDur = type === 'small' ? 0.04 : type === 'medium' ? 0.08 : 0.12;
  const burstSamples = Math.floor(burstDur * sampleRate);
  let b0 = 0, b1 = 0;
  for (let i = 0; i < burstSamples; i++) {
    const t = i / sampleRate;
    const norm = t / burstDur;
    const centerFreq = 3500 * Math.exp(-norm * 2.2);
    const w = (rng.next() * 2.0 - 1.0);
    // 1-pole resonant bandpass approx
    const theta = (2.0 * Math.PI * centerFreq) / sampleRate;
    const r = 0.88;
    const s = w * (1.0 - r);
    b0 = s + 2.0 * r * Math.cos(theta) * b0 - r * r * b1;
    b1 = b0;
    const env = (1.0 - norm) * Math.min(1.0, t / 0.003);
    out[i] = (out[i] ?? 0) + b0 * env * (type === 'small' ? 0.35 : 0.55);
  }

  // 2. Low-frequency cavity thump (60 - 120 Hz)
  if (type !== 'small') {
    const thumpDur = type === 'medium' ? 0.14 : 0.22;
    const thumpSamples = Math.floor(thumpDur * sampleRate);
    const thumpF0 = rng.range(75, 110);
    for (let i = 0; i < thumpSamples; i++) {
      const t = i / sampleRate;
      const f = thumpF0 * Math.exp(-t * 8.0);
      const phase = 2.0 * Math.PI * f * t;
      const env = Math.exp(-t * 22.0) * Math.min(1.0, t / 0.002);
      out[i] = (out[i] ?? 0) + Math.sin(phase) * env * 0.45;
    }
  }

  // 3. Bubble cloud: van den Doel bubbles with power-law radius distribution
  const numBubbles = type === 'small' ? 6 : type === 'medium' ? 14 : 22;
  for (let b = 0; b < numBubbles; b++) {
    // Exponential onset envelope
    const onsetSec = Math.pow(rng.next(), 1.8) * (duration * 0.65);
    const onsetSample = Math.floor(onsetSec * sampleRate);
    // Power law radius between 1.2 mm and 14 mm
    const radius = 0.0012 + Math.pow(rng.next(), 2.2) * 0.013;
    const amp = rng.range(0.12, 0.28);
    synthesizeVanDenDoelBubble(out, sampleRate, onsetSample, radius, amp);
  }

  // 4. Droplet fall-back: sparse small bubbles 150-500 ms after impact
  const numDroplets = type === 'small' ? 2 : type === 'medium' ? 5 : 8;
  for (let d = 0; d < numDroplets; d++) {
    const onsetSec = rng.range(0.15, duration * 0.9);
    const onsetSample = Math.floor(onsetSec * sampleRate);
    const radius = rng.range(0.0008, 0.0025); // high pitch tinkles
    const amp = rng.range(0.08, 0.2);
    synthesizeVanDenDoelBubble(out, sampleRate, onsetSample, radius, amp);
  }

  // Normalize and apply anti-click fade at ends
  normalizeAndFade(out, sampleRate, 0.85);
  return out;
}

/** Synthesize wading footstep: soft leg impact, fluid swish, droplet wake */
function renderWadeBuffer(sampleRate: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const duration = 0.42;
  const length = Math.floor(sampleRate * duration);
  const out = new Float32Array(length);

  // Soft low-frequency water push (50-80 Hz)
  const pushDur = 0.18;
  const pushSamples = Math.floor(pushDur * sampleRate);
  for (let i = 0; i < pushSamples; i++) {
    const t = i / sampleRate;
    const phase = 2.0 * Math.PI * 65.0 * t;
    const env = Math.sin((t / pushDur) * Math.PI);
    out[i] = (out[i] ?? 0) + Math.sin(phase) * env * 0.35;
  }

  // Lapping fluid noise swish (1.2 kHz -> 450 Hz)
  const swishDur = 0.35;
  const swishSamples = Math.floor(swishDur * sampleRate);
  let b0 = 0, b1 = 0;
  for (let i = 0; i < swishSamples; i++) {
    const t = i / sampleRate;
    const norm = t / swishDur;
    const freq = 1200 * (1.0 - norm * 0.6);
    const theta = (2.0 * Math.PI * freq) / sampleRate;
    const r = 0.85;
    const s = (rng.next() * 2.0 - 1.0) * (1.0 - r);
    b0 = s + 2.0 * r * Math.cos(theta) * b0 - r * r * b1;
    b1 = b0;
    const env = Math.sin(norm * Math.PI) * 0.3;
    out[i] = (out[i] ?? 0) + b0 * env;
  }

  // 4-8 trailing wake bubbles
  const bubbleCount = rng.range(4, 8);
  for (let b = 0; b < bubbleCount; b++) {
    const onsetSec = rng.range(0.04, 0.32);
    const onsetSample = Math.floor(onsetSec * sampleRate);
    const radius = rng.range(0.002, 0.008);
    synthesizeVanDenDoelBubble(out, sampleRate, onsetSample, radius, 0.16);
  }

  normalizeAndFade(out, sampleRate, 0.75);
  return out;
}

/** Synthesize single isolated drip with van den Doel bubble formula */
function renderDripBuffer(sampleRate: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const duration = 0.12;
  const length = Math.floor(sampleRate * duration);
  const out = new Float32Array(length);

  // Droplet radius between 1.5mm and 3.2mm (giving 900 Hz to 2000 Hz)
  const radius = rng.range(0.0016, 0.0033);
  synthesizeVanDenDoelBubble(out, sampleRate, 0, radius, 0.85, 0.12);

  normalizeAndFade(out, sampleRate, 0.8);
  return out;
}

/** Synthesize wet ceramic footstep: crisp ceramic tap + rubber sole squelch release */
function renderWetStepBuffer(sampleRate: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const duration = 0.18;
  const length = Math.floor(sampleRate * duration);
  const out = new Float32Array(length);

  // 1. Ceramic heel tap (25 ms, bandpassed 2.2 kHz)
  const tapDur = 0.025;
  const tapSamples = Math.floor(tapDur * sampleRate);
  let b0 = 0, b1 = 0;
  for (let i = 0; i < tapSamples; i++) {
    const t = i / sampleRate;
    const theta = (2.0 * Math.PI * rng.range(2100, 2600)) / sampleRate;
    const r = 0.89;
    const s = (rng.next() * 2.0 - 1.0) * (1.0 - r);
    b0 = s + 2.0 * r * Math.cos(theta) * b0 - r * r * b1;
    b1 = b0;
    out[i] = (out[i] ?? 0) + b0 * Math.exp(-t * 120.0) * 0.6;
  }

  // 2. Rubber sole squelch release (Prompt 3.3: 520 + 180*sin(90t) Hz, amplitude 0.20, starting at +22 ms)
  const squelchOffset = Math.floor(0.022 * sampleRate);
  const squelchDur = 0.06;
  const squelchSamples = Math.floor(squelchDur * sampleRate);
  for (let i = 0; i < squelchSamples; i++) {
    const t = i / sampleRate;
    const idx = squelchOffset + i;
    if (idx >= length) break;
    const f = 520 + 180 * Math.sin(90 * t);
    const phase = 2.0 * Math.PI * f * t;
    const env = Math.sin((t / squelchDur) * Math.PI);
    out[idx] = (out[idx] ?? 0) + Math.sin(phase) * env * 0.20;
  }

  normalizeAndFade(out, sampleRate, 0.7);
  return out;
}

/** Synthesize quiet damped dry footstep: soft low-amplitude rubber/sole thud (80–220 Hz, duration 0.06s, gain -26 dBFS) */
function renderDryStepBuffer(sampleRate: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const duration = 0.06;
  const length = Math.floor(sampleRate * duration);
  const out = new Float32Array(length);

  // Soft body thump: 220 Hz -> 80 Hz exponential drop over 0.06s
  const thumpSamples = length;
  const fStart = rng.range(200, 230);
  const fEnd = rng.range(75, 85);
  for (let i = 0; i < thumpSamples; i++) {
    const t = i / sampleRate;
    const f = fStart * Math.pow(fEnd / fStart, t / duration);
    const phase = 2.0 * Math.PI * f * t;
    const env = Math.sin((t / duration) * Math.PI) * Math.exp(-t * 25.0);
    out[i] = (out[i] ?? 0) + Math.sin(phase) * env * 0.25;
  }

  // Peak-normalised to 0.22 (-26 dBFS equivalent, damped stealth foley)
  let maxPeak = 0;
  for (let i = 0; i < length; i++) {
    const v = Math.abs(out[i] ?? 0);
    if (v > maxPeak) maxPeak = v;
  }
  if (maxPeak > 1e-4) {
    const scale = 0.22 / maxPeak;
    for (let i = 0; i < length; i++) {
      out[i] = (out[i] ?? 0) * scale;
    }
  }

  // Smooth tail fade
  const fadeSamples = Math.floor(0.01 * sampleRate);
  for (let i = 0; i < fadeSamples; i++) {
    const idx = length - 1 - i;
    if (idx >= 0) {
      out[idx] = (out[idx] ?? 0) * (i / fadeSamples);
    }
  }

  return out;
}

/** Synthesize monster footfall: heavy acoustic mass impact + wet splash displacement */
function renderMonsterFootfallBuffer(sampleRate: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const duration = 0.45;
  const length = Math.floor(sampleRate * duration);
  const out = new Float32Array(length);

  // Sub-bass physical floor shock (44 Hz with 0.11s decay - Prompt 7.8)
  const shockDur = 0.28;
  const shockSamples = Math.floor(shockDur * sampleRate);
  for (let i = 0; i < shockSamples; i++) {
    const t = i / sampleRate;
    const f = 44.0 * Math.exp(-t * 5.0);
    const phase = 2.0 * Math.PI * f * t;
    out[i] = (out[i] ?? 0) + Math.sin(phase) * Math.exp(-t / 0.11) * 0.65;
  }

  // Heavy water displacement slosh
  const sloshDur = 0.35;
  const sloshSamples = Math.floor(sloshDur * sampleRate);
  let b0 = 0, b1 = 0;
  for (let i = 0; i < sloshSamples; i++) {
    const t = i / sampleRate;
    const theta = (2.0 * Math.PI * 520.0) / sampleRate;
    const r = 0.85;
    const s = (rng.next() * 2.0 - 1.0) * (1.0 - r);
    b0 = s + 2.0 * r * Math.cos(theta) * b0 - r * r * b1;
    b1 = b0;
    out[i] = (out[i] ?? 0) + b0 * Math.sin((t / sloshDur) * Math.PI) * 0.35;
  }

  // 6 deep bubbles
  for (let b = 0; b < 6; b++) {
    const onsetSec = rng.range(0.02, 0.25);
    const onsetSample = Math.floor(onsetSec * sampleRate);
    const radius = rng.range(0.005, 0.018); // deep large bubbles
    synthesizeVanDenDoelBubble(out, sampleRate, onsetSample, radius, 0.25);
  }

  normalizeAndFade(out, sampleRate, 0.85);
  return out;
}

/** Utility: Normalize float array and apply 3ms fade in / 5ms fade out */
function normalizeAndFade(data: Float32Array, sampleRate: number, targetPeak = 0.8): void {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] || 0);
    if (v > peak) peak = v;
  }

  const gain = peak > 1e-5 ? targetPeak / peak : 1.0;
  const fadeInSamples = Math.floor(0.003 * sampleRate);
  const fadeOutSamples = Math.floor(0.005 * sampleRate);

  for (let i = 0; i < data.length; i++) {
    let s = (data[i] || 0) * gain;
    if (i < fadeInSamples) s *= i / fadeInSamples;
    const rem = data.length - 1 - i;
    if (rem < fadeOutSamples) s *= rem / fadeOutSamples;
    data[i] = s;
  }
}

/** AudioBuffer Pool Manager */
export class AudioBufferPool {
  private static instance: AudioBufferPool | null = null;
  private ctx: BaseAudioContext;
  private pools = new Map<PooledVoiceCategory, AudioBuffer[]>();
  private initialized = false;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  static getInstance(ctx: BaseAudioContext): AudioBufferPool {
    if (!this.instance || this.instance.ctx !== ctx) {
      this.instance = new AudioBufferPool(ctx);
    }
    return this.instance;
  }

  /**
   * Bake all procedural one-shots into the AudioBuffer pool during warm-up.
   */
  async warmup(_timeSliceBudgetMs = 6): Promise<void> {
    if (this.initialized) return;

    const sampleRate = this.ctx.sampleRate;
    const createBuf = (arr: Float32Array): AudioBuffer => {
      const b = this.ctx.createBuffer(1, arr.length, sampleRate);
      b.getChannelData(0).set(arr);
      return b;
    };

    const tasks: Array<() => void> = [];

    // 8 Splash variants: 2 small, 4 medium, 2 heavy
    tasks.push(() => {
      const small = [
        createBuf(renderSplashBuffer(sampleRate, 'small', 101)),
        createBuf(renderSplashBuffer(sampleRate, 'small', 102)),
      ];
      this.pools.set('splash_small', small);
    });

    tasks.push(() => {
      const med = [
        createBuf(renderSplashBuffer(sampleRate, 'medium', 201)),
        createBuf(renderSplashBuffer(sampleRate, 'medium', 202)),
        createBuf(renderSplashBuffer(sampleRate, 'medium', 203)),
        createBuf(renderSplashBuffer(sampleRate, 'medium', 204)),
      ];
      this.pools.set('splash_medium', med);
    });

    tasks.push(() => {
      const heavy = [
        createBuf(renderSplashBuffer(sampleRate, 'heavy', 301)),
        createBuf(renderSplashBuffer(sampleRate, 'heavy', 302)),
      ];
      this.pools.set('splash_heavy', heavy);
    });

    // 6 Wading footstep variants
    tasks.push(() => {
      const wades = [];
      for (let i = 0; i < 6; i++) {
        wades.push(createBuf(renderWadeBuffer(sampleRate, 400 + i)));
      }
      this.pools.set('wade_step', wades);
    });

    // 6 Drip variants
    tasks.push(() => {
      const drips = [];
      for (let i = 0; i < 6; i++) {
        drips.push(createBuf(renderDripBuffer(sampleRate, 500 + i)));
      }
      this.pools.set('drip', drips);
    });

    // 4 Wet footsteps
    tasks.push(() => {
      const wet = [];
      for (let i = 0; i < 4; i++) {
        wet.push(createBuf(renderWetStepBuffer(sampleRate, 600 + i)));
      }
      this.pools.set('step_wet', wet);
    });

    // 4 Dry footsteps (Prompt 3.3)
    tasks.push(() => {
      const dry = [];
      for (let i = 0; i < 4; i++) {
        dry.push(createBuf(renderDryStepBuffer(sampleRate, 650 + i)));
      }
      this.pools.set('step_dry', dry);
    });

    // 4 Monster footfalls
    tasks.push(() => {
      const feet = [];
      for (let i = 0; i < 4; i++) {
        feet.push(createBuf(renderMonsterFootfallBuffer(sampleRate, 700 + i)));
      }
      this.pools.set('monster_footfall', feet);
    });

    // Execute tasks cooperatively within budget
    for (const t of tasks) {
      t();
      // Allow event loop breathing if in live browser environment
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }

  get ready(): boolean {
    return this.initialized;
  }

  get size(): number {
    let count = 0;
    for (const list of this.pools.values()) {
      count += list.length;
    }
    return count;
  }

  stats(): Record<string, number> {
    const res: Record<string, number> = {
      splash: (this.pools.get('splash_small')?.length ?? 0) +
              (this.pools.get('splash_medium')?.length ?? 0) +
              (this.pools.get('splash_heavy')?.length ?? 0),
      wade: this.pools.get('wade_step')?.length ?? 0,
      drip: this.pools.get('drip')?.length ?? 0,
      step: this.pools.get('step_wet')?.length ?? 0,
      step_dry: this.pools.get('step_dry')?.length ?? 0,
      monster_footfall: this.pools.get('monster_footfall')?.length ?? 0,
    };
    return res;
  }

  /**
   * Play a pooled one-shot with pitch jitter (+/- 3%) and zero runtime allocation.
   */
  play(
    category: PooledVoiceCategory,
    destination: AudioNode,
    reverbSend?: AudioNode,
    options: {
      volume?: number;
      pitchMult?: number;
      reverbGain?: number;
    } = {}
  ): RawVoiceHandle {
    // If not warmed up yet, warm up synchronously
    if (!this.initialized) {
      void this.warmup();
    }

    const list = this.pools.get(category);
    if (!list || list.length === 0) {
      // Fallback empty handle
      return {
        stop: () => {},
        setParam: () => {},
        ended: Promise.resolve(),
      };
    }

    // Random selection from variant pool
    const idx = Math.floor(Math.random() * list.length);
    const buffer = list[idx]!;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Pitch jitter (+/- 3%)
    const jitter = 1.0 + (Math.random() * 0.06 - 0.03);
    src.playbackRate.setValueAtTime((options.pitchMult ?? 1.0) * jitter, now);

    // Subtle anti-repetition lowpass filter (+/- 10%)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const filterBase = category === 'drip' ? 14000 : 9000;
    filter.frequency.setValueAtTime(filterBase * (0.9 + Math.random() * 0.2), now);

    const gain = ctx.createGain();
    const targetVol = options.volume ?? 1.0;
    // 3 ms anti-click fade-in
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(targetVol, now + 0.003);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    let revGain: GainNode | null = null;
    if (reverbSend) {
      revGain = ctx.createGain();
      revGain.gain.setValueAtTime(options.reverbGain ?? 0.5, now);
      gain.connect(revGain);
      revGain.connect(reverbSend);
    }

    src.start(now);

    let endedResolve: () => void;
    const ended = new Promise<void>((r) => { endedResolve = r; });

    // Node cleanup on end to prevent any audio graph leakage
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
        if (revGain) revGain.disconnect();
      } catch {
        /* ignore cleanup errors */
      }
      endedResolve();
    };

    return {
      stop: (fadeSec = 0.01) => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
        setTimeout(() => {
          try {
            src.stop();
            src.disconnect();
            filter.disconnect();
            gain.disconnect();
            if (revGain) revGain.disconnect();
          } catch {
            /* ignore cleanup errors */
          }
          endedResolve();
        }, fadeSec * 1000);
      },
      setParam: () => {},
      ended,
    };
  }
}

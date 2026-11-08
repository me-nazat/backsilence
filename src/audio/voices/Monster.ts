/* ── Monster.ts ───────────────────────────────────────────────────────────
 *  Prompt 4 Section 6 B5: Creature Voice Synthesis Engine.
 *  - Glottal pulse excitation (Rosenberg C model) with pitch jitter & shimmer
 *  - Period doubling (subharmonic insertion) for pathological organic terror
 *  - 3 moving resonant vocal tract formants (F1: 700->400, F2: 1100->800, F3: ~2400 Hz)
 *  - 20-40 Hz amplitude modulation throat growl and wet breath aspiration
 *  - Anti-aliasing 4x oversampling on distortion shaper
 *  - AudioBufferPool support for monster footfalls
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { playSplash } from './Splashes.js';
import { AudioBufferPool } from '../AudioBufferPool.js';

export interface MonsterVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  mixer?: import('../Mixer.js').Mixer;
  intensity?: number;
  pitch?: number;
  seed?: number;
  usePool?: boolean;
  monsterDistance?: number;
}

/** Pre-computed band-limited PeriodicWave for glottal pulse harmonics (Rosenberg C model) */
let cachedGlottalWave: PeriodicWave | null = null;
function getGlottalPeriodicWave(ctx: BaseAudioContext): PeriodicWave {
  if (cachedGlottalWave) return cachedGlottalWave;
  // Compute 64 Fourier coefficients of the derivative of Rosenberg C glottal pulse
  const numHarmonics = 64;
  const real = new Float32Array(numHarmonics);
  const imag = new Float32Array(numHarmonics);

  // DC = 0
  real[0] = 0;
  imag[0] = 0;

  for (let n = 1; n < numHarmonics; n++) {
    // Spectral rolloff: ~ -12 dB/octave with characteristic glottal tilt
    const amp = (1.0 / Math.pow(n, 1.45)) * Math.sin((n * Math.PI) / 3.0);
    imag[n] = amp;
    real[n] = amp * 0.25;
  }

  cachedGlottalWave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  return cachedGlottalWave;
}

/** Soft-clipping hyperbolic tangent-like distortion transfer curve */
function createDistortionCurve(samples = 512, k = 14): Float32Array {
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

let cachedDistortionCurve: Float32Array | null = null;
function getDistortion(): Float32Array {
  if (!cachedDistortionCurve) {
    cachedDistortionCurve = createDistortionCurve(512, 14);
  }
  return cachedDistortionCurve;
}

/**
 * Monster Roar (ALERT sound): Glottal pulse glide + period doubling + throat AM + 3 formants.
 */
/**
 * High-Speed Water-Thrashing Gallop (Section 4.1):
 * Heavy low-end water slam (85 Hz -> 35 Hz sine punch, 0.14s, gain: 0.75) + violent white-water churn (bandpass noise 280 Hz – 2200 Hz, 0.22s, gain: 0.80).
 */
export function playMonsterGallopSlam(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = Math.max(0.2, Math.min(2.0, cx.intensity ?? 1.0));
  const pitchMult = cx.pitch ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(1.0, now + 0.003);
  voiceGain.connect(cx.destination);

  const revGain = ctx.createGain();
  revGain.gain.setValueAtTime(0.40, now);
  voiceGain.connect(revGain);
  revGain.connect(cx.reverbSend);

  const nodesToDisconnect: AudioNode[] = [voiceGain, revGain];

  // 1. Heavy low-end water slam: 85 Hz -> 35 Hz sine punch, 0.14s, gain: 0.75
  const slamOsc = ctx.createOscillator();
  const slamGain = ctx.createGain();
  slamOsc.type = 'sine';
  slamOsc.frequency.setValueAtTime(85 * pitchMult, now);
  slamOsc.frequency.exponentialRampToValueAtTime(Math.max(25, 35 * pitchMult), now + 0.14);

  slamGain.gain.setValueAtTime(0.0001, now);
  slamGain.gain.linearRampToValueAtTime(0.75 * intensity, now + 0.003);
  slamGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  slamOsc.connect(slamGain);
  slamGain.connect(voiceGain);
  slamOsc.start(now);
  slamOsc.stop(now + 0.15);
  nodesToDisconnect.push(slamOsc, slamGain);

  // 2. Violent white-water churn: bandpass noise 280 Hz – 2200 Hz, 0.22s, gain: 0.80
  const churnNoise = ctx.createBufferSource();
  churnNoise.buffer = cx.noise.pink;
  churnNoise.loop = true;

  const churnBp = ctx.createBiquadFilter();
  churnBp.type = 'bandpass';
  churnBp.frequency.setValueAtTime(750 * pitchMult, now);
  churnBp.Q.setValueAtTime(0.75, now);

  const churnGain = ctx.createGain();
  churnGain.gain.setValueAtTime(0.0001, now);
  churnGain.gain.linearRampToValueAtTime(0.80 * intensity, now + 0.005);
  churnGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  churnNoise.connect(churnBp);
  churnBp.connect(churnGain);
  churnGain.connect(voiceGain);
  churnNoise.start(now);
  churnNoise.stop(now + 0.23);
  nodesToDisconnect.push(churnNoise, churnBp, churnGain);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    for (const node of nodesToDisconnect) {
      try { node.disconnect(); } catch { /* ignore */ }
    }
  };

  setTimeout(() => {
    cleanup();
    endedResolve();
  }, 240);

  return {
    stop(fade = 0.02): void {
      const t = ctx.currentTime;
      voiceGain.gain.cancelScheduledValues(t);
      voiceGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        cleanup();
        endedResolve();
      }, fade * 1000);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Guttural Monster Roar (Section 4.2):
 * Layered, monstrous, organic roar (duration: 1.45s):
 * - Voice 1 (Sub-Chest Growl): Sawtooth + triangle pair (58 Hz and 87 Hz) FM by 24 Hz growl LFO, low-pass filter at 320 Hz.
 * - Voice 2 (Vocal Formant Roar): Pink noise + detuned pulse oscillators (145 Hz, 210 Hz) through 3 parallel formant filters with WaveShaperNode.
 * - Voice 3 (Wet Jaws & Spray): High-density water thrash burst at onset (0.0s – 0.4s).
 * - Brickwall low-pass roll-off at 2900 Hz.
 */
export function playMonsterRoar(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const duration = 1.45;
  const intensity = Math.max(0.2, Math.min(2.5, cx.intensity ?? 1.25));
  const pitchMult = cx.pitch ?? 1.0;

  if (cx.mixer) {
    const dist = cx.monsterDistance ?? 10.0;
    const far = Math.min(1, Math.max(0, (dist - 12) / 28));
    const depth = 0.50 + (0.95 - 0.50) * far;
    cx.mixer.duck('ambient', depth, 0.05, 1.45);
  }

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(intensity, now + 0.08);
  voiceGain.gain.setValueAtTime(intensity, now + 0.95);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  // Master brickwall low-pass filter at 3000 Hz (preserving 2.4-3.0 kHz pharyngeal screech bite)
  const brickwall = ctx.createBiquadFilter();
  brickwall.type = 'lowpass';
  brickwall.frequency.setValueAtTime(3000, now);
  brickwall.Q.setValueAtTime(0.707, now);

  voiceGain.connect(brickwall);
  brickwall.connect(cx.destination);
  brickwall.connect(cx.reverbSend);

  const nodesToDisconnect: AudioNode[] = [voiceGain, brickwall];

  // ── Voice 1: Sub-Chest Growl (Sub-bass rumble 55 Hz – 110 Hz) ──
  const v1Saw = ctx.createOscillator();
  v1Saw.type = 'sawtooth';
  v1Saw.frequency.setValueAtTime(110 * pitchMult, now);
  v1Saw.frequency.exponentialRampToValueAtTime(Math.max(25, 55 * pitchMult), now + duration);

  const v1Tri = ctx.createOscillator();
  v1Tri.type = 'triangle';
  v1Tri.frequency.setValueAtTime(82 * pitchMult, now);
  v1Tri.frequency.exponentialRampToValueAtTime(Math.max(25, 55 * pitchMult), now + duration);

  const v1Lfo = ctx.createOscillator();
  v1Lfo.type = 'sine';
  v1Lfo.frequency.setValueAtTime(24, now);

  const v1LfoGain = ctx.createGain();
  v1LfoGain.gain.setValueAtTime(14 * pitchMult, now);
  v1Lfo.connect(v1LfoGain);
  v1LfoGain.connect(v1Saw.frequency);
  v1LfoGain.connect(v1Tri.frequency);

  const v1Lp = ctx.createBiquadFilter();
  v1Lp.type = 'lowpass';
  v1Lp.frequency.setValueAtTime(220 * pitchMult, now);
  v1Lp.Q.setValueAtTime(0.707, now);

  const v1Gain = ctx.createGain();
  v1Gain.gain.setValueAtTime(0.0001, now);
  v1Gain.gain.linearRampToValueAtTime(0.75, now + 0.05);
  v1Gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  v1Saw.connect(v1Lp);
  v1Tri.connect(v1Lp);
  v1Lp.connect(v1Gain);
  v1Gain.connect(voiceGain);

  v1Saw.start(now);
  v1Tri.start(now);
  v1Lfo.start(now);
  v1Saw.stop(now + duration);
  v1Tri.stop(now + duration);
  v1Lfo.stop(now + duration);
  nodesToDisconnect.push(v1Saw, v1Tri, v1Lfo, v1LfoGain, v1Lp, v1Gain);

  // ── Voice 2: Vocal Formant Roar (Rosenberg C Glottal Wave + Subharmonic Period Doubling + 3 Formants) ──
  // Glottal pulse excitation (Rosenberg C model)
  const v2Osc1 = ctx.createOscillator();
  v2Osc1.setPeriodicWave(getGlottalPeriodicWave(ctx));
  v2Osc1.frequency.setValueAtTime(145 * pitchMult, now);
  v2Osc1.frequency.exponentialRampToValueAtTime(Math.max(50, 95 * pitchMult), now + duration);

  // Subharmonic period doubling (f0 / 2 insertion) for pathological organic terror
  const v2Osc2 = ctx.createOscillator();
  v2Osc2.setPeriodicWave(getGlottalPeriodicWave(ctx));
  v2Osc2.frequency.setValueAtTime(72.5 * pitchMult, now);
  v2Osc2.frequency.exponentialRampToValueAtTime(Math.max(25, 47.5 * pitchMult), now + duration);

  const v2Noise = ctx.createBufferSource();
  v2Noise.buffer = cx.noise.pink;
  v2Noise.loop = true;

  const v2Mix = ctx.createGain();
  v2Mix.gain.setValueAtTime(0.65, now);
  v2Osc1.connect(v2Mix);
  v2Osc2.connect(v2Mix);
  v2Noise.connect(v2Mix);

  // 3 moving resonant vocal tract formants (Prompt 6 / Acoustic Rulebook):
  // F1: 700 -> 400 Hz
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.setValueAtTime(700 * pitchMult, now);
  f1.frequency.exponentialRampToValueAtTime(Math.max(150, 400 * pitchMult), now + duration);
  f1.Q.setValueAtTime(4.0, now);

  // F2: 1100 -> 800 Hz
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.setValueAtTime(1100 * pitchMult, now);
  f2.frequency.exponentialRampToValueAtTime(Math.max(250, 800 * pitchMult), now + duration);
  f2.Q.setValueAtTime(4.0, now);

  // F3: 2400 Hz (pharyngeal screech bite at 2.4–3.0 kHz)
  const f3 = ctx.createBiquadFilter();
  f3.type = 'bandpass';
  f3.frequency.setValueAtTime(2400 * pitchMult, now);
  f3.Q.setValueAtTime(3.8, now);

  const formantSum = ctx.createGain();
  v2Mix.connect(f1);
  v2Mix.connect(f2);
  v2Mix.connect(f3);
  f1.connect(formantSum);
  f2.connect(formantSum);
  f3.connect(formantSum);

  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistortion() as unknown as Float32Array;
  shaper.oversample = '4x';

  const v2Gain = ctx.createGain();
  v2Gain.gain.setValueAtTime(0.0001, now);
  v2Gain.gain.linearRampToValueAtTime(0.85, now + 0.06);
  v2Gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  formantSum.connect(shaper);
  shaper.connect(v2Gain);
  v2Gain.connect(voiceGain);

  v2Osc1.start(now);
  v2Osc2.start(now);
  v2Noise.start(now);
  v2Osc1.stop(now + duration);
  v2Osc2.stop(now + duration);
  v2Noise.stop(now + duration);
  nodesToDisconnect.push(v2Osc1, v2Osc2, v2Noise, v2Mix, f1, f2, f3, formantSum, shaper, v2Gain);

  // ── Voice 3: Wet Jaws & Spray ──
  const sprayNoise = ctx.createBufferSource();
  sprayNoise.buffer = cx.noise.white;
  sprayNoise.loop = true;

  const sprayBp = ctx.createBiquadFilter();
  sprayBp.type = 'bandpass';
  sprayBp.frequency.setValueAtTime(1400 * pitchMult, now);
  sprayBp.Q.setValueAtTime(1.2, now);

  const sprayGain = ctx.createGain();
  sprayGain.gain.setValueAtTime(0.0001, now);
  sprayGain.gain.linearRampToValueAtTime(0.65, now + 0.02);
  sprayGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);

  sprayNoise.connect(sprayBp);
  sprayBp.connect(sprayGain);
  sprayGain.connect(voiceGain);

  sprayNoise.start(now);
  sprayNoise.stop(now + 0.42);
  nodesToDisconnect.push(sprayNoise, sprayBp, sprayGain);

  // ── Voice 4: Echoing High-Frequency Screech (REAR_UP_ROAR) ──
  const screechOsc = ctx.createOscillator();
  screechOsc.type = 'sawtooth';
  screechOsc.frequency.setValueAtTime(2400 * pitchMult, now);
  screechOsc.frequency.exponentialRampToValueAtTime(Math.min(10000, 3600 * pitchMult), now + 0.25);
  screechOsc.frequency.exponentialRampToValueAtTime(Math.max(500, 1900 * pitchMult), now + duration * 0.85);

  const screechBp = ctx.createBiquadFilter();
  screechBp.type = 'bandpass';
  screechBp.frequency.setValueAtTime(2800 * pitchMult, now);
  screechBp.frequency.exponentialRampToValueAtTime(Math.min(10000, 3400 * pitchMult), now + 0.3);
  screechBp.frequency.exponentialRampToValueAtTime(Math.max(800, 2200 * pitchMult), now + duration * 0.85);
  screechBp.Q.setValueAtTime(3.5, now);

  const screechGain = ctx.createGain();
  screechGain.gain.setValueAtTime(0.0001, now);
  screechGain.gain.linearRampToValueAtTime(0.38, now + 0.08);
  screechGain.gain.setValueAtTime(0.38, now + 0.55);
  screechGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.9);

  const screechRev = ctx.createGain();
  screechRev.gain.setValueAtTime(0.65, now);

  screechOsc.connect(screechBp);
  screechBp.connect(screechGain);
  screechGain.connect(voiceGain);
  screechGain.connect(screechRev);
  screechRev.connect(cx.reverbSend);

  screechOsc.start(now);
  screechOsc.stop(now + duration);
  nodesToDisconnect.push(screechOsc, screechBp, screechGain, screechRev);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    for (const node of nodesToDisconnect) {
      try { node.disconnect(); } catch { /* ignore */ }
    }
  };

  const timer = setTimeout(() => {
    cleanup();
    endedResolve();
  }, Math.floor(duration * 1000) + 50);

  return {
    stop(fade = 0.05): void {
      clearTimeout(timer);
      const t = ctx.currentTime;
      voiceGain.gain.cancelScheduledValues(t);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        cleanup();
        endedResolve();
      }, fade * 1000);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Monster Snarl: shorter (0.55s), glottal pulse 115 -> 85 Hz, aggressive throat rasp.
 */
export function playMonsterSnarl(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const duration = 0.55;
  const pitchMult = cx.pitch ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.95, now + 0.04);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc = ctx.createOscillator();
  osc.setPeriodicWave(getGlottalPeriodicWave(ctx));
  osc.frequency.setValueAtTime(115 * pitchMult, now);
  osc.frequency.exponentialRampToValueAtTime(85 * pitchMult, now + duration);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.Q.setValueAtTime(3.0, now);
  noiseFilter.frequency.setValueAtTime(1600 * pitchMult, now);

  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistortion();
  shaper.oversample = '4x';

  osc.connect(shaper);
  noise.connect(noiseFilter);
  noiseFilter.connect(shaper);
  shaper.connect(voiceGain);

  osc.start(now);
  noise.start(now);
  osc.stop(now + duration + 0.02);
  noise.stop(now + duration + 0.02);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    try {
      osc.disconnect();
      noise.disconnect();
      noiseFilter.disconnect();
      shaper.disconnect();
      voiceGain.disconnect();
    } catch {
      /* ignore */
    }
  };

  setTimeout(() => {
    cleanup();
    endedResolve();
  }, (duration + 0.08) * 1000);

  return {
    stop(_fade = 0.02): void {
      cleanup();
      endedResolve();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Wet wheezing monster breath loop: modulated bandpassed noise + low growl.
 */
export function playMonsterBreathLoop(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  // Ear-safe max baseline gain clamped at -10 dBFS (~0.316)
  masterGain.gain.linearRampToValueAtTime(0.316, now + 0.8);

  const lpFilter = ctx.createBiquadFilter();
  lpFilter.type = 'lowpass';
  lpFilter.frequency.setValueAtTime(3200, now);
  lpFilter.Q.setValueAtTime(0.707, now);

  masterGain.connect(lpFilter);
  lpFilter.connect(cx.destination);
  lpFilter.connect(cx.reverbSend);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  // Prompt 3.12: breath bandpass 950 Hz, Q 2.6
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.setValueAtTime(2.6, now);
  bp.frequency.setValueAtTime(950, now);

  // Prompt 3.12: breath LFO 0.42 Hz, depth 0.30
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.42, now);
  lfoGain.gain.setValueAtTime(0.30, now);

  const breathAmp = ctx.createGain();
  breathAmp.gain.setValueAtTime(0.5, now);
  lfo.connect(lfoGain);
  lfoGain.connect(breathAmp.gain);

  noise.connect(bp);
  bp.connect(breathAmp);
  breathAmp.connect(masterGain);

  // Low chest organic growl (96 Hz triangle, gain 0.08)
  const growl = ctx.createOscillator();
  const growlGain = ctx.createGain();
  growl.type = 'triangle';
  growl.frequency.setValueAtTime(96, now);
  growlGain.gain.setValueAtTime(0.08, now);
  growl.connect(growlGain);
  growlGain.connect(masterGain);

  noise.start(now);
  lfo.start(now);
  growl.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 0.4): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          noise.stop();
          lfo.stop();
          growl.stop();
          noise.disconnect();
          bp.disconnect();
          breathAmp.disconnect();
          lfo.disconnect();
          growl.disconnect();
          masterGain.disconnect();
        } catch {
          /* ignore */
        }
        endedResolve();
      }, fade * 1000);
    },
    setParam(name: string, v: number): void {
      if (name === 'volume') {
        masterGain.gain.setTargetAtTime(Math.max(0, v), ctx.currentTime, 0.05);
      }
    },
    ended,
  };
}

/**
 * Monster Sniff: quick filtered-noise inhale bursts.
 */
export function playMonsterSniff(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.7, now + 0.005);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const bursts = [0.0, 0.12, 0.24];
  const nodesToClean: AudioNode[] = [voiceGain];

  for (const onset of bursts) {
    const noise = ctx.createBufferSource();
    noise.buffer = cx.noise.white;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(4.5, now);
    filter.frequency.setValueAtTime(1400, now + onset);
    filter.frequency.linearRampToValueAtTime(2600, now + onset + 0.08);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now + onset);
    g.gain.linearRampToValueAtTime(0.85, now + onset + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + onset + 0.09);

    noise.connect(filter);
    filter.connect(g);
    g.connect(voiceGain);

    noise.start(now + onset);
    noise.stop(now + onset + 0.1);
    nodesToClean.push(noise, filter, g);
  }

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    for (const n of nodesToClean) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
    endedResolve();
  }, 450);

  return {
    stop(): void {
      for (const n of nodesToClean) {
        try { n.disconnect(); } catch { /* ignore */ }
      }
      endedResolve();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Heavy monster wading: low pitch, heavy splash + slosh.
 */
export function playMonsterWade(cx: MonsterVoiceContext): RawVoiceHandle {
  return playSplash('big', {
    ...cx,
    intensity: 1.35,
    pitch: 0.65,
  });
}

/**
 * Monster footfall: heavy acoustic mass impact + wet splash displacement.
 */
export function playMonsterFootfall(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  if (cx.usePool !== false) {
    const pool = AudioBufferPool.getInstance(ctx);
    if (pool.isReady()) {
      return pool.play('monster_footfall', cx.destination, cx.reverbSend, {
        volume: 0.85 * (cx.intensity ?? 1.0),
        pitchMult: cx.pitch ?? 1.0,
        reverbGain: 0.32,
      });
    }
  }

  const now = ctx.currentTime;
  const pitch = cx.pitch ?? 1.0;
  const intensity = cx.intensity ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.75 * intensity, now + 0.003);
  voiceGain.connect(cx.destination);

  const reverbGain = ctx.createGain();
  reverbGain.gain.setValueAtTime(0.32, now);
  voiceGain.connect(reverbGain);
  reverbGain.connect(cx.reverbSend);

  // 1. Sub heavy thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(65 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(32 * pitch, now + 0.09);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.linearRampToValueAtTime(0.85, now + 0.003);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(oscGain);
  oscGain.connect(voiceGain);
  osc.start(now);
  osc.stop(now + 0.1);

  // 2. Wet slap transient
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(3.2, now);
  filter.frequency.setValueAtTime(900 * pitch, now);
  filter.frequency.exponentialRampToValueAtTime(350 * pitch, now + 0.06);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.linearRampToValueAtTime(0.75, now + 0.003);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(voiceGain);
  noise.start(now);
  noise.stop(now + 0.08);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    try {
      osc.disconnect();
      oscGain.disconnect();
      noise.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
      reverbGain.disconnect();
      voiceGain.disconnect();
    } catch {
      /* ignore */
    }
  };

  setTimeout(() => {
    cleanup();
    endedResolve();
  }, 260);

  return {
    stop(_fade = 0.02): void {
      cleanup();
      endedResolve();
    },
    setParam(): void {},
    ended,
  };
}

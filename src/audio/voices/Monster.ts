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
export function playMonsterRoar(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const duration = 2.0;
  const intensity = Math.max(0.2, Math.min(2.5, cx.intensity ?? 1.25));
  const pitchMult = cx.pitch ?? 1.0;

  // Prompt 3.5: Distance-dependent roar ducking (deep near, shallow far)
  if (cx.mixer) {
    const dist = cx.monsterDistance ?? 10.0;
    const far = Math.min(1, Math.max(0, (dist - 12) / 28)); // 0 near, 1 far
    const depth = 0.50 + (0.95 - 0.50) * far; // deep duck near, shallow far
    cx.mixer.duck('ambient', depth, 0.05, 2.0);
  }

  const voiceGain = ctx.createGain();
  // 5 ms anti-click fade-in (Prompt 3.4: roar gain 1.05 * intensity)
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(1.05 * intensity, now + 0.12);
  voiceGain.gain.setValueAtTime(1.05 * intensity, now + 1.15);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const nodesToDisconnect: AudioNode[] = [voiceGain];

  // 1. Primary Glottal Pulse Generator (Prompt 3.12: 74 -> 46 Hz)
  const glottalOsc = ctx.createOscillator();
  glottalOsc.setPeriodicWave(getGlottalPeriodicWave(ctx));
  glottalOsc.frequency.setValueAtTime(74 * pitchMult, now);
  glottalOsc.frequency.exponentialRampToValueAtTime(46 * pitchMult, now + duration);

  // 2. Period Doubling Subharmonic (Prompt 3.12: 37 -> 23 Hz, g 0.55)
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sawtooth';
  subOsc.frequency.setValueAtTime(37 * pitchMult, now);
  subOsc.frequency.exponentialRampToValueAtTime(23 * pitchMult, now + duration);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.55, now);

  subOsc.connect(subGain);
  nodesToDisconnect.push(subOsc, subGain);

  // 3. Throat AM Flutter LFO (Prompt 3.12: 26 Hz, +-16 Hz)
  const throatLfo = ctx.createOscillator();
  const throatGain = ctx.createGain();
  throatLfo.type = 'sine';
  throatLfo.frequency.setValueAtTime(26, now);
  throatGain.gain.setValueAtTime(16, now);
  throatLfo.connect(throatGain);
  throatGain.connect(glottalOsc.frequency);
  nodesToDisconnect.push(throatLfo, throatGain);

  // 4. Wet breath aspiration layer (pink noise, Prompt 3.12: 900 Hz, Q 1.4)
  const breathSrc = ctx.createBufferSource();
  breathSrc.buffer = cx.noise.pink;
  breathSrc.loop = true;

  const breathFilter = ctx.createBiquadFilter();
  breathFilter.type = 'bandpass';
  breathFilter.frequency.setValueAtTime(900 * pitchMult, now);
  breathFilter.Q.setValueAtTime(1.4, now);

  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0.0001, now);
  breathGain.gain.linearRampToValueAtTime(0.18, now + 0.1);
  breathGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  breathSrc.connect(breathFilter);
  breathFilter.connect(breathGain);
  nodesToDisconnect.push(breathSrc, breathFilter, breathGain);

  // Mix raw sound generators into pre-vocal tract gain
  const preMix = ctx.createGain();
  glottalOsc.connect(preMix);
  subGain.connect(preMix);
  breathGain.connect(preMix);
  nodesToDisconnect.push(glottalOsc, preMix);

  // 5. 4x Oversampled WaveShaper for rich harmonic warmth without aliasing
  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistortion();
  shaper.oversample = '4x';
  preMix.connect(shaper);
  nodesToDisconnect.push(shaper);

  // 6. Three Parallel Resonant Vocal Tract Formants (Prompt 3.12):
  // F1: 640 -> 380 Hz, Q 2.6
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.setValueAtTime(2.6, now);
  f1.frequency.setValueAtTime(640 * pitchMult, now);
  f1.frequency.exponentialRampToValueAtTime(380 * pitchMult, now + duration);

  const f1Gain = ctx.createGain();
  f1Gain.gain.setValueAtTime(1.85, now);
  f1.connect(f1Gain);
  f1Gain.connect(voiceGain);

  // F2: 1150 -> 780 Hz, Q 3.0
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.setValueAtTime(3.0, now);
  f2.frequency.setValueAtTime(1150 * pitchMult, now);
  f2.frequency.exponentialRampToValueAtTime(780 * pitchMult, now + duration);

  const f2Gain = ctx.createGain();
  f2Gain.gain.setValueAtTime(1.15, now);
  f2.connect(f2Gain);
  f2Gain.connect(voiceGain);

  // F3: ~2350 Hz, Q 3.5
  const f3 = ctx.createBiquadFilter();
  f3.type = 'bandpass';
  f3.Q.setValueAtTime(3.5, now);
  f3.frequency.setValueAtTime(2350 * pitchMult, now);

  const f3Gain = ctx.createGain();
  f3Gain.gain.setValueAtTime(0.32, now);
  f3.connect(f3Gain);
  f3Gain.connect(voiceGain);

  shaper.connect(f1);
  shaper.connect(f2);
  shaper.connect(f3);
  nodesToDisconnect.push(f1, f1Gain, f2, f2Gain, f3, f3Gain);

  // Direct throat body blend through lowpass to preserve vocal tract acoustic fidelity
  const directBodyGain = ctx.createGain();
  directBodyGain.gain.setValueAtTime(0.22, now);
  const directBodyFilter = ctx.createBiquadFilter();
  directBodyFilter.type = 'lowpass';
  directBodyFilter.frequency.setValueAtTime(800 * pitchMult, now);
  shaper.connect(directBodyFilter);
  directBodyFilter.connect(directBodyGain);
  directBodyGain.connect(voiceGain);
  nodesToDisconnect.push(directBodyFilter, directBodyGain);

  glottalOsc.start(now);
  subOsc.start(now);
  throatLfo.start(now);
  breathSrc.start(now);

  glottalOsc.stop(now + duration + 0.05);
  subOsc.stop(now + duration + 0.05);
  throatLfo.stop(now + duration + 0.05);
  breathSrc.stop(now + duration + 0.05);

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
  }, (duration + 0.12) * 1000);

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
  // Prompt 3.12: breath loop gain 0.55 (was 0.38)
  masterGain.gain.linearRampToValueAtTime(0.55, now + 0.8);
  masterGain.connect(cx.destination);
  masterGain.connect(cx.reverbSend);

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

  // Prompt 3.12: Low chest growl 96 Hz saw, gain 0.11 (was 125 Hz, gain 0.07)
  const growl = ctx.createOscillator();
  const growlGain = ctx.createGain();
  growl.type = 'sawtooth';
  growl.frequency.setValueAtTime(96, now);
  growlGain.gain.setValueAtTime(0.11, now);
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

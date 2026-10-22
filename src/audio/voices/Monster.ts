/* ── Monster.ts ───────────────────────────────────────────────────────────
 *  Synthesized creature voices: terrifying formant-swept roar, snarling,
 *  wet wheezing breathing loop, sniffing bursts, and heavy monster wading.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { playSplash } from './Splashes.js';

export interface MonsterVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/** Soft-clipping distortion curve for creature harmonics. */
function createDistortionCurve(samples = 256, k = 15): Float32Array {
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

let cachedDistortionCurve: Float32Array | null = null;
function getDistortion(samples = 256): Float32Array {
  if (!cachedDistortionCurve) {
    cachedDistortionCurve = createDistortionCurve(samples, 18);
  }
  return cachedDistortionCurve;
}

/**
 * Monster Roar (ALERT sound): Sawtooth glide + square sub + FM rattle + 3 vocal formants + WaveShaper.
 */
export function playMonsterRoar(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const duration = 1.4;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.001, now);
  voiceGain.gain.linearRampToValueAtTime(0.85, now + 0.18);
  voiceGain.gain.setValueAtTime(0.85, now + 0.9);
  voiceGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // 1. Sawtooth pitch glide (80 -> 55 Hz)
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.setValueAtTime(80, now);
  saw.frequency.exponentialRampToValueAtTime(55, now + duration);

  // 2. FM "rattle" LFO (28 Hz, depth 18 Hz)
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(28, now);
  lfoGain.gain.setValueAtTime(18, now);
  lfo.connect(lfoGain);
  lfoGain.connect(saw.frequency);

  // 3. Square sub oscillator (half pitch: 40 -> 27.5 Hz)
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'square';
  sub.frequency.setValueAtTime(40, now);
  sub.frequency.exponentialRampToValueAtTime(27.5, now + duration);
  subGain.gain.setValueAtTime(0.5, now);

  // 4. White noise layer for breath rasp
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  noise.loop = true;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.2, now);

  // Mix raw sound generators
  const preMix = ctx.createGain();
  saw.connect(preMix);
  sub.connect(subGain);
  subGain.connect(preMix);
  noise.connect(noiseGain);
  noiseGain.connect(preMix);

  // 5. WaveShaper distortion
  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistortion();
  shaper.oversample = '2x';
  preMix.connect(shaper);

  // 6. Three parallel formant filters sweeping like an agonizing guttural vowel
  // F1: 700 -> 400 Hz
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 4.0;
  f1.frequency.setValueAtTime(700, now);
  f1.frequency.exponentialRampToValueAtTime(400, now + duration);

  // F2: 1100 -> 800 Hz
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 5.0;
  f2.frequency.setValueAtTime(1100, now);
  f2.frequency.exponentialRampToValueAtTime(800, now + duration);

  // F3: 2400 Hz
  const f3 = ctx.createBiquadFilter();
  f3.type = 'bandpass';
  f3.Q.value = 6.0;
  f3.frequency.setValueAtTime(2400, now);

  shaper.connect(f1);
  shaper.connect(f2);
  shaper.connect(f3);

  f1.connect(voiceGain);
  f2.connect(voiceGain);
  f3.connect(voiceGain);

  saw.start(now);
  sub.start(now);
  lfo.start(now);
  noise.start(now);

  saw.stop(now + duration + 0.05);
  sub.stop(now + duration + 0.05);
  lfo.stop(now + duration + 0.05);
  noise.stop(now + duration + 0.05);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, (duration + 0.1) * 1000);

  return {
    stop(fade = 0.05): void {
      const t = ctx.currentTime;
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Monster Snarl: shorter (0.5s), higher pitch (110 -> 90 Hz), aggressive noise rasp.
 */
export function playMonsterSnarl(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const duration = 0.52;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.001, now);
  voiceGain.gain.linearRampToValueAtTime(0.75, now + 0.06);
  voiceGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.setValueAtTime(110, now);
  saw.frequency.exponentialRampToValueAtTime(90, now + duration);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.Q.value = 3.5;
  noiseFilter.frequency.setValueAtTime(1600, now);

  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistortion();

  saw.connect(shaper);
  noise.connect(noiseFilter);
  noiseFilter.connect(shaper);
  shaper.connect(voiceGain);

  saw.start(now);
  noise.start(now);
  saw.stop(now + duration + 0.05);
  noise.stop(now + duration + 0.05);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, (duration + 0.08) * 1000);

  return {
    stop(): void {
      voiceGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Wet wheezing monster breath loop:
 * Noise through bandpass modulated by 0.35 Hz amplitude LFO + 140 Hz growl.
 */
export function playMonsterBreathLoop(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.4, now + 1.0);
  masterGain.connect(cx.destination);
  masterGain.connect(cx.reverbSend);

  // Wheeze noise
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 4.0;
  bp.frequency.setValueAtTime(1250, now);

  // 0.35 Hz breathing LFO (inhale/exhale rhythm)
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.35, now);
  lfoGain.gain.setValueAtTime(0.45, now);

  const breathAmp = ctx.createGain();
  breathAmp.gain.setValueAtTime(0.5, now);
  lfo.connect(lfoGain);
  lfoGain.connect(breathAmp.gain);

  noise.connect(bp);
  bp.connect(breathAmp);
  breathAmp.connect(masterGain);

  // Low growl layer (140 Hz)
  const growl = ctx.createOscillator();
  const growlGain = ctx.createGain();
  growl.type = 'sawtooth';
  growl.frequency.setValueAtTime(140, now);
  growlGain.gain.setValueAtTime(0.08, now);
  growl.connect(growlGain);
  growlGain.connect(masterGain);

  noise.start(now);
  lfo.start(now);
  growl.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  return {
    stop(fade = 0.5): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          noise.stop();
          lfo.stop();
          growl.stop();
          masterGain.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000);
    },
    setParam(name: string, v: number): void {
      if (name === 'volume') {
        masterGain.gain.linearRampToValueAtTime(Math.max(0, v), ctx.currentTime + 0.1);
      }
    },
    ended,
  };
}

/**
 * Monster Sniff: three quick filtered-noise inhale bursts.
 */
export function playMonsterSniff(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.65, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // 3 quick inhales
  const bursts = [0.0, 0.12, 0.24];
  for (const onset of bursts) {
    const noise = ctx.createBufferSource();
    noise.buffer = cx.noise.white;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 5.0;
    filter.frequency.setValueAtTime(1400, now + onset);
    filter.frequency.linearRampToValueAtTime(2600, now + onset + 0.08);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now + onset);
    g.gain.linearRampToValueAtTime(0.85, now + onset + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + onset + 0.09);

    noise.connect(filter);
    filter.connect(g);
    g.connect(voiceGain);

    noise.start(now + onset);
    noise.stop(now + onset + 0.1);
  }

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, 450);

  return {
    stop(): void {
      voiceGain.disconnect();
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
    intensity: 1.25,
    pitch: 0.65,
  });
}

/**
 * Monster footfall: heavy wet slap, pitch-shiftable.
 * Thump + wet slap transient + splash tail + reverb send.
 */
export function playMonsterFootfall(cx: MonsterVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const pitch = cx.pitch ?? 1.0;
  const intensity = cx.intensity ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.7 * intensity, now);
  voiceGain.connect(cx.destination);

  const reverbGain = ctx.createGain();
  reverbGain.gain.setValueAtTime(0.4, now);
  voiceGain.connect(reverbGain);
  reverbGain.connect(cx.reverbSend);

  // 1. Low heavy thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(65 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(32 * pitch, now + 0.08);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.85, now);
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
  filter.Q.value = 3.5;
  filter.frequency.setValueAtTime(900 * pitch, now);
  filter.frequency.exponentialRampToValueAtTime(350 * pitch, now + 0.06);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.75, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(voiceGain);
  noise.start(now);
  noise.stop(now + 0.08);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    reverbGain.disconnect();
    endedResolve();
  }, 250);

  return {
    stop(): void {
      voiceGain.disconnect();
      reverbGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

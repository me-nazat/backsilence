/* ── Splashes.ts ─────────────────────────────────────────────────────────
 *  Procedural water impact voices: small/big/jump splashes, wading steps,
 *  continuous wading loop, and pebble plink.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { Rng } from '../../procedural/core/prng.js';

export interface SplashVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/**
 * Procedural layered splash: band-passed noise sweep, bubble chirps, thump, droplet tail.
 */
export function playSplash(
  type: 'small' | 'big' | 'jump',
  cx: SplashVoiceContext,
): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = Math.max(0.1, Math.min(2.0, cx.intensity ?? (type === 'small' ? 0.4 : type === 'big' ? 1.0 : 1.4)));
  const pitchMult = cx.pitch ?? 1.0;
  const rng = new Rng(cx.seed ?? 1234);

  const duration = (type === 'small' ? 0.25 : type === 'big' ? 0.65 : 0.95) * intensity;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.7 * intensity, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // 1. Noise burst with falling filter sweep (3.5 kHz -> 400 Hz)
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = cx.noise.pink;
  noiseSrc.loop = true;

  const sweepFilter = ctx.createBiquadFilter();
  sweepFilter.type = 'bandpass';
  sweepFilter.Q.value = 1.8;
  sweepFilter.frequency.setValueAtTime(3500 * pitchMult, now);
  sweepFilter.frequency.exponentialRampToValueAtTime(
    Math.max(100, 400 * pitchMult),
    now + duration,
  );

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.9, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noiseSrc.connect(sweepFilter);
  sweepFilter.connect(noiseGain);
  noiseGain.connect(voiceGain);

  noiseSrc.start(now);
  noiseSrc.stop(now + duration + 0.05);

  // 2. Bubble chirps (3 to 12 upward frequency ramp sines)
  const chirpCount = type === 'small' ? 3 : type === 'big' ? 8 : 12;
  const chirpOscs: OscillatorNode[] = [];

  for (let i = 0; i < chirpCount; i++) {
    const onset = rng.range(0.01, Math.min(0.25, duration * 0.7));
    const chirpDuration = rng.range(0.02, 0.06);
    const startFreq = rng.range(300, 700) * pitchMult;
    const endFreq = rng.range(900, 1400) * pitchMult;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';

    osc.frequency.setValueAtTime(startFreq, now + onset);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + onset + chirpDuration);

    g.gain.setValueAtTime(0.001, now + onset);
    g.gain.linearRampToValueAtTime(0.18, now + onset + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + onset + chirpDuration);

    osc.connect(g);
    g.connect(voiceGain);

    osc.start(now + onset);
    osc.stop(now + onset + chirpDuration + 0.01);
    chirpOscs.push(osc);
  }

  // 3. Sub thump for big/jump variants (sine 70 -> 40 Hz, 120 ms)
  let thumpOsc: OscillatorNode | null = null;
  if (type !== 'small') {
    thumpOsc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(70 * pitchMult, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(35 * pitchMult, now + 0.14);

    thumpGain.gain.setValueAtTime(0.5 * intensity, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(voiceGain);

    thumpOsc.start(now);
    thumpOsc.stop(now + 0.15);
  }

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  const timer = setTimeout(() => {
    cleanup();
    endedResolve();
  }, (duration + 0.15) * 1000);

  function cleanup(): void {
    clearTimeout(timer);
    try {
      voiceGain.disconnect();
    } catch {
      // ignore already disconnected
    }
  }

  return {
    stop(fadeSec = 0.05): void {
      const t = ctx.currentTime;
      voiceGain.gain.cancelScheduledValues(t);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
      setTimeout(() => {
        cleanup();
        endedResolve();
      }, fadeSec * 1000);
    },
    setParam(): void {
      // splashes are one-shot
    },
    ended,
  };
}

/**
 * Wade step one-shot: soft noise swish plus a lapping slosh.
 */
export function playWadeStep(cx: SplashVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = cx.intensity ?? 0.6;
  const pitchMult = cx.pitch ?? 1.0;
  const duration = 0.38;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.55 * intensity, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Soft noise swish
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(1200 * pitchMult, now);
  filter.frequency.linearRampToValueAtTime(600 * pitchMult, now + duration);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, now);
  noiseGain.gain.linearRampToValueAtTime(0.8, now + 0.06);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(voiceGain);

  noise.start(now);
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
    stop(fade = 0.02): void {
      const t = ctx.currentTime;
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Continuous wading loop whose 'speed' parameter scales gain and brightness.
 */
export function playWadeLoop(cx: SplashVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.001, now);
  voiceGain.gain.linearRampToValueAtTime(0.4, now + 0.2);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(900, now);

  noise.connect(filter);
  filter.connect(voiceGain);
  noise.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  return {
    stop(fade = 0.3): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          noise.stop();
          voiceGain.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000);
    },
    setParam(name: string, v: number): void {
      if (!isPlaying) return;
      if (name === 'speed') {
        const speed = Math.max(0.1, Math.min(2.5, v));
        const t = ctx.currentTime;
        voiceGain.gain.linearRampToValueAtTime(0.25 * speed, t + 0.05);
        filter.frequency.linearRampToValueAtTime(600 + speed * 600, t + 0.05);
      }
    },
    ended,
  };
}

/**
 * Pebble plink: high sine tink (2.4 kHz -> 1.8 kHz, 40 ms) plus tiny splash.
 */
export function playPebblePlink(cx: SplashVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.65, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // High tink
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2400, now);
  osc.frequency.exponentialRampToValueAtTime(1800, now + 0.04);

  oscGain.gain.setValueAtTime(0.8, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(oscGain);
  oscGain.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 0.05);

  // Tiny splash tail
  const splash = playSplash('small', {
    ...cx,
    intensity: 0.25,
    pitch: 1.4,
  });

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, 350);

  return {
    stop(fade = 0.02): void {
      splash.stop(fade);
      voiceGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

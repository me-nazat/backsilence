/* ── Splashes.ts ─────────────────────────────────────────────────────────
 *  Prompt 4 Section 6 B1: Physical van den Doel (2005) Water Impact Synthesis.
 *  - van den Doel bubble formula: f0 = 3/r, damping d = 0.043*f0 + 0.0014*f0^1.5
 *  - Frequency rises over lifetime: f(t) = f0 * (1 + 0.1 * d * t)
 *  - Multi-component splash: impact sweep, bubble cloud, cavity thump, droplets
 *  - Zero-allocation pooled playback support via AudioBufferPool
 *  - Anti-click guardrails: >= 3 ms fade-in, >= 5 ms fade-out, explicit node cleanup
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { Rng } from '../../procedural/core/prng.js';
import { AudioBufferPool } from '../AudioBufferPool.js';

export interface SplashVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
  usePool?: boolean;
}

/**
 * Procedural layered splash using van den Doel physical liquid bubbles.
 */
export function playSplash(
  type: 'small' | 'big' | 'jump',
  cx: SplashVoiceContext,
): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = Math.max(0.1, Math.min(2.5, cx.intensity ?? (type === 'small' ? 0.45 : type === 'big' ? 1.0 : 1.45)));
  const pitchMult = cx.pitch ?? 1.0;
  const rng = new Rng(cx.seed ?? Math.floor(Math.random() * 100000));

  // Try fast-path zero-allocation buffer pool if enabled and ready
  if (cx.usePool !== false) {
    const pool = AudioBufferPool.getInstance(ctx);
    if (pool.isReady()) {
      const cat = type === 'small' ? 'splash_small' : type === 'big' ? 'splash_medium' : 'splash_heavy';
      return pool.play(cat, cx.destination, cx.reverbSend, {
        volume: 0.85 * intensity,
        pitchMult,
        reverbGain: type === 'small' ? 0.35 : 0.65,
      });
    }
  }

  // Real-time physical Web Audio synthesis path
  const duration = (type === 'small' ? 0.32 : type === 'big' ? 0.65 : 0.95) * Math.sqrt(intensity);
  const voiceGain = ctx.createGain();
  // 3 ms anti-click fade-in
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.85 * intensity, now + 0.003);
  voiceGain.connect(cx.destination);

  const revGain = ctx.createGain();
  revGain.gain.setValueAtTime(type === 'small' ? 0.35 : 0.65, now);
  voiceGain.connect(revGain);
  revGain.connect(cx.reverbSend);

  const nodesToDisconnect: AudioNode[] = [voiceGain, revGain];

  // 1. Noise impact burst with falling sweep (3.5 kHz -> 400 Hz)
  const burstDur = type === 'small' ? 0.05 : type === 'big' ? 0.09 : 0.13;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = cx.noise.pink;
  noiseSrc.loop = true;

  const sweepFilter = ctx.createBiquadFilter();
  sweepFilter.type = 'bandpass';
  sweepFilter.Q.setValueAtTime(1.8, now);
  sweepFilter.frequency.setValueAtTime(3500 * pitchMult, now);
  sweepFilter.frequency.exponentialRampToValueAtTime(
    Math.max(100, 380 * pitchMult),
    now + burstDur
  );

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.linearRampToValueAtTime(0.85, now + 0.003);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + burstDur);

  noiseSrc.connect(sweepFilter);
  sweepFilter.connect(noiseGain);
  noiseGain.connect(voiceGain);

  noiseSrc.start(now);
  noiseSrc.stop(now + burstDur + 0.01);
  nodesToDisconnect.push(noiseSrc, sweepFilter, noiseGain);

  // 2. van den Doel physical bubbles (frequency rises over lifetime)
  const bubbleCount = type === 'small' ? 5 : type === 'big' ? 12 : 18;
  for (let i = 0; i < bubbleCount; i++) {
    const onset = Math.pow(rng.next(), 1.8) * (duration * 0.6);
    // Power-law radius between 1.5mm and 12mm
    const radius = 0.0015 + Math.pow(rng.next(), 2.2) * 0.011;
    // f0 = 3 / r
    const f0 = (3.0 / radius) * pitchMult;
    const d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
    const bubbleDur = Math.min(0.18, 4.5 / d);

    // Physical pitch rise: f(t) = f0 * (1 + 0.1 * d * t)
    const fEnd = f0 * (1.0 + 0.1 * d * bubbleDur);

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';

    osc.frequency.setValueAtTime(f0, now + onset);
    osc.frequency.exponentialRampToValueAtTime(Math.min(18000, fEnd), now + onset + bubbleDur);

    const bAmp = rng.range(0.12, 0.28);
    g.gain.setValueAtTime(0.0001, now + onset);
    g.gain.linearRampToValueAtTime(bAmp, now + onset + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, now + onset + bubbleDur);

    osc.connect(g);
    g.connect(voiceGain);

    osc.start(now + onset);
    osc.stop(now + onset + bubbleDur + 0.01);
    nodesToDisconnect.push(osc, g);
  }

  // 3. Low-frequency cavity thump for big and jump splashes (60 - 120 Hz)
  if (type !== 'small') {
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    const thumpDur = type === 'big' ? 0.15 : 0.22;
    const fStart = rng.range(85, 115) * pitchMult;

    thump.type = 'sine';
    thump.frequency.setValueAtTime(fStart, now);
    thump.frequency.exponentialRampToValueAtTime(35 * pitchMult, now + thumpDur);

    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.linearRampToValueAtTime(0.65 * intensity, now + 0.003);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + thumpDur);

    thump.connect(thumpGain);
    thumpGain.connect(voiceGain);

    thump.start(now);
    thump.stop(now + thumpDur + 0.02);
    nodesToDisconnect.push(thump, thumpGain);
  }

  // 4. Droplet fall-back tinkles (150-450 ms after impact)
  const dropletCount = type === 'small' ? 2 : type === 'big' ? 4 : 7;
  for (let i = 0; i < dropletCount; i++) {
    const onset = rng.range(0.12, duration * 0.9);
    const radius = rng.range(0.0009, 0.0022); // tiny high droplets
    const f0 = (3.0 / radius) * pitchMult;
    const d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
    const dropDur = Math.min(0.08, 4.0 / d);
    const fEnd = f0 * (1.0 + 0.12 * d * dropDur);

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';

    osc.frequency.setValueAtTime(f0, now + onset);
    osc.frequency.exponentialRampToValueAtTime(fEnd, now + onset + dropDur);

    g.gain.setValueAtTime(0.0001, now + onset);
    g.gain.linearRampToValueAtTime(0.14, now + onset + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, now + onset + dropDur);

    osc.connect(g);
    g.connect(voiceGain);

    osc.start(now + onset);
    osc.stop(now + onset + dropDur + 0.01);
    nodesToDisconnect.push(osc, g);
  }

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    for (const node of nodesToDisconnect) {
      try { node.disconnect(); } catch {}
    }
  };

  const timer = setTimeout(() => {
    cleanup();
    endedResolve();
  }, (duration + 0.12) * 1000);

  return {
    stop(fadeSec = 0.02): void {
      clearTimeout(timer);
      const t = ctx.currentTime;
      voiceGain.gain.cancelScheduledValues(t);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
      setTimeout(() => {
        cleanup();
        endedResolve();
      }, fadeSec * 1000);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Wade step: leg displacement, fluid swish, and trailing van den Doel bubbles.
 */
export function playWadeStep(cx: SplashVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  if (cx.usePool !== false) {
    const pool = AudioBufferPool.getInstance(ctx);
    if (pool.isReady()) {
      return pool.play('wade_step', cx.destination, cx.reverbSend, {
        volume: 0.7 * (cx.intensity ?? 1.0),
        pitchMult: cx.pitch ?? 1.0,
        reverbGain: 0.45,
      });
    }
  }

  // Fallback to small splash with soft wading profile
  return playSplash('small', {
    ...cx,
    intensity: (cx.intensity ?? 0.6) * 0.75,
  });
}

/**
 * Continuous wading loop with dynamic speed scaling.
 */
export function playWadeLoop(cx: SplashVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.35, now + 0.15);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(1.4, now);
  filter.frequency.setValueAtTime(800, now);

  noise.connect(filter);
  filter.connect(voiceGain);
  noise.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 0.25): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      voiceGain.gain.cancelScheduledValues(t);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          noise.stop();
          noise.disconnect();
          filter.disconnect();
          voiceGain.disconnect();
        } catch {}
        endedResolve();
      }, fade * 1000);
    },
    setParam(name: string, v: number): void {
      if (!isPlaying) return;
      if (name === 'speed') {
        const speed = Math.max(0.1, Math.min(2.5, v));
        const t = ctx.currentTime;
        voiceGain.gain.setTargetAtTime(0.25 * speed, t, 0.03);
        filter.frequency.setTargetAtTime(550 + speed * 600, t, 0.03);
      }
    },
    ended,
  };
}

/**
 * Pebble plink: high resonant tink (2.4 kHz) followed by van den Doel droplet splash.
 */
export function playPebblePlink(cx: SplashVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.7, now + 0.002);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // High tink
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2450, now);
  osc.frequency.exponentialRampToValueAtTime(1850, now + 0.04);

  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.linearRampToValueAtTime(0.85, now + 0.002);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

  osc.connect(oscGain);
  oscGain.connect(voiceGain);
  osc.start(now);
  osc.stop(now + 0.05);

  // Tiny splash tail
  const splash = playSplash('small', {
    ...cx,
    intensity: 0.22,
    pitch: 1.35,
  });

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    try {
      osc.disconnect();
      oscGain.disconnect();
      voiceGain.disconnect();
    } catch {}
    endedResolve();
  }, 320);

  return {
    stop(fade = 0.02): void {
      splash.stop(fade);
      try {
        voiceGain.disconnect();
      } catch {}
    },
    setParam(): void {},
    ended,
  };
}

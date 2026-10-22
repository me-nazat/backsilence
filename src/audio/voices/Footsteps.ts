/* ── Footsteps.ts ────────────────────────────────────────────────────────
 *  Dry footsteps, rubber squeaks, ledge mantling, and acoustic drips.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { Rng } from '../../procedural/core/prng.js';

export interface FootstepVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  seed?: number;
}

/**
 * Dry-tile footstep: 25 ms noise click through 1.8–3 kHz bandpass + 90 Hz thump (30 ms).
 * Strictly silent to the monster (0 loudness), ambience only.
 */
export function playStepDry(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 333);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // 1. High tile click (25 ms)
  const click = ctx.createBufferSource();
  click.buffer = cx.noise.white;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.5;
  bp.frequency.value = rng.range(1800, 3000);

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.8, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

  click.connect(bp);
  bp.connect(clickGain);
  clickGain.connect(voiceGain);
  click.start(now);
  click.stop(now + 0.03);

  // 2. Low thump (90 Hz, 30 ms)
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(90, now);
  thump.frequency.exponentialRampToValueAtTime(45, now + 0.03);

  thumpGain.gain.setValueAtTime(0.5, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  thump.connect(thumpGain);
  thumpGain.connect(voiceGain);
  thump.start(now);
  thump.stop(now + 0.035);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, 100);

  return {
    stop(): void {
      voiceGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Rubber squeak: resonant glide on rubber tile contact.
 */
export function playStepSqueak(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.4, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const oscGain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(750, now);
  osc.frequency.exponentialRampToValueAtTime(1450, now + 0.04);
  osc.frequency.exponentialRampToValueAtTime(620, now + 0.09);

  filter.type = 'bandpass';
  filter.Q.value = 6.0;
  filter.frequency.setValueAtTime(1100, now);

  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

  osc.connect(filter);
  filter.connect(oscGain);
  oscGain.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 0.1);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, 150);

  return {
    stop(): void {
      voiceGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Mantle ledge pull: wet slap and scrape + mid thud + splash tail.
 */
export function playMantle(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.7, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Wet slap noise sweep
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(2200, now);
  filter.frequency.linearRampToValueAtTime(800, now + 0.18);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.85, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(voiceGain);
  noise.start(now);
  noise.stop(now + 0.22);

  // Mid thud
  const thud = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(140, now);
  thud.frequency.exponentialRampToValueAtTime(55, now + 0.15);

  thudGain.gain.setValueAtTime(0.7, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  thud.connect(thudGain);
  thudGain.connect(voiceGain);
  thud.start(now);
  thud.stop(now + 0.16);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, 350);

  return {
    stop(): void {
      voiceGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Single droplet "plink" (sine ~900–1400 Hz, 30 ms, steep decay) with heavy reverb.
 */
export function playDrip(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 777);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.5, now);
  voiceGain.connect(cx.destination);

  // Heavy reverb send for the classic liminal poolroom drip echo
  const reverbGain = ctx.createGain();
  reverbGain.gain.setValueAtTime(0.85, now);
  voiceGain.connect(reverbGain);
  reverbGain.connect(cx.reverbSend);

  const freq = rng.range(900, 1400);
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + 0.035);

  oscGain.gain.setValueAtTime(0.9, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  osc.connect(oscGain);
  oscGain.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 0.04);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    reverbGain.disconnect();
    endedResolve();
  }, 120);

  return {
    stop(): void {
      voiceGain.disconnect();
      reverbGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Player breathing voice for exhaustion / stamina depletion.
 * Band-passed pink noise with 0.8 Hz amplitude breath cycle and low resonant formant.
 */
export function playPlayerBreath(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = cx.intensity ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.25 * intensity, now);
  voiceGain.connect(cx.destination);

  // Pink noise source
  const src = ctx.createBufferSource();
  src.buffer = cx.noise.pink;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 680;
  filter.Q.value = 3.0;

  // Breath cycle gain
  const cycleGain = ctx.createGain();
  cycleGain.gain.setValueAtTime(0.05, now);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.75 * (0.8 + 0.4 * intensity); // breathing rate

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.35;

  lfo.connect(lfoGain);
  lfoGain.connect(cycleGain.gain);

  src.connect(filter);
  filter.connect(cycleGain);
  cycleGain.connect(voiceGain);

  src.start(now);
  lfo.start(now);

  const duration = 2.0;
  let isStopped = false;

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  const timer = setTimeout(() => {
    if (!isStopped) {
      stop(0.2);
    }
  }, duration * 1000);

  function stop(fadeSec = 0.15): void {
    if (isStopped) return;
    isStopped = true;
    clearTimeout(timer);
    const stopTime = ctx.currentTime;
    voiceGain.gain.setValueAtTime(voiceGain.gain.value, stopTime);
    voiceGain.gain.linearRampToValueAtTime(0.0001, stopTime + fadeSec);
    setTimeout(() => {
      try {
        src.stop();
        lfo.stop();
        src.disconnect();
        lfo.disconnect();
        filter.disconnect();
        cycleGain.disconnect();
        voiceGain.disconnect();
      } catch {
        /* ignore */
      }
      endedResolve();
    }, fadeSec * 1000 + 30);
  }

  return {
    stop,
    setParam(name: string, v: number): void {
      if (name === 'intensity') {
        voiceGain.gain.setTargetAtTime(0.25 * v, ctx.currentTime, 0.05);
      }
    },
    ended,
  };
}

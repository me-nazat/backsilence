/* ── Footsteps.ts ────────────────────────────────────────────────────────
 *  Dry footsteps, rubber squeaks, ledge mantling, and acoustic drips.
 * ──────────────────────────────────────────────────────────────────────── */

import type { VoiceHandle } from '../AudioEngine.js';
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
export function playStepDry(cx: FootstepVoiceContext): VoiceHandle {
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
export function playStepSqueak(cx: FootstepVoiceContext): VoiceHandle {
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
export function playMantle(cx: FootstepVoiceContext): VoiceHandle {
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
export function playDrip(cx: FootstepVoiceContext): VoiceHandle {
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

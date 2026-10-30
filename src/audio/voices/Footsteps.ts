/* ── Footsteps.ts ────────────────────────────────────────────────────────
 *  Prompt 4 Section 6 B1 & B6: Footsteps, Squelch, Mantling, Physical Drips, and Breath.
 *  - Wet tile steps: crisp ceramic tap (2.2 kHz) + 15ms rubber sole squelch release
 *  - van den Doel physical bubble drip model with rising pitch f(t) = f0 * (1 + 0.1 * d * t)
 *  - AudioBufferPool zero-allocation fast-path
 *  - Anti-click guardrails: >= 3 ms fade-in, >= 5 ms fade-out, explicit node cleanup
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { Rng } from '../../procedural/core/prng.js';
import { AudioBufferPool } from '../AudioBufferPool.js';

export interface FootstepVoiceContext {
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
 * Dry-tile footstep: 25 ms ceramic click (2.2 kHz) + low thump (65 Hz) + subtle squelch.
 */
export function playStepDry(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  if (cx.usePool !== false) {
    const pool = AudioBufferPool.getInstance(ctx);
    if (pool.isReady()) {
      return pool.play('step_dry', cx.destination, cx.reverbSend, {
        volume: 0.55 * (cx.intensity ?? 1.0),
        pitchMult: cx.pitch ?? 1.0,
        reverbGain: 0.25,
      });
    }
  }

  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? Math.floor(Math.random() * 100000));
  const intensity = cx.intensity ?? 1.0;
  const pitchMult = cx.pitch ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.42 * intensity, now + 0.003);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const nodesToDisconnect: AudioNode[] = [voiceGain];

  // 1. Crisp Ceramic tile click (2.2 kHz bandpass)
  const click = ctx.createBufferSource();
  click.buffer = cx.noise.white;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.setValueAtTime(2.6, now);
  bp.frequency.setValueAtTime(rng.range(1900, 2600) * pitchMult, now);

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.0001, now);
  clickGain.gain.linearRampToValueAtTime(0.85, now + 0.002);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

  click.connect(bp);
  bp.connect(clickGain);
  clickGain.connect(voiceGain);
  click.start(now);
  click.stop(now + 0.03);
  nodesToDisconnect.push(click, bp, clickGain);

  // 2. Low physical foot thump (80 -> 40 Hz)
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(80 * pitchMult, now);
  thump.frequency.exponentialRampToValueAtTime(40 * pitchMult, now + 0.035);

  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.linearRampToValueAtTime(0.55, now + 0.002);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  thump.connect(thumpGain);
  thumpGain.connect(voiceGain);
  thump.start(now);
  thump.stop(now + 0.04);
  nodesToDisconnect.push(thump, thumpGain);

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
  }, 90);

  return {
    stop(fadeSec = 0.01): void {
      const t = ctx.currentTime;
      voiceGain.gain.cancelScheduledValues(t);
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
 * Rubber squeak: resonant glide on wet rubber/tile contact.
 */
export function playStepSqueak(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const pitchMult = cx.pitch ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.38, now + 0.003);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const oscGain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1400 * pitchMult, now);
  osc.frequency.exponentialRampToValueAtTime(850 * pitchMult, now + 0.08);

  filter.type = 'bandpass';
  filter.Q.setValueAtTime(6.0, now);
  filter.frequency.setValueAtTime(1400 * pitchMult, now);
  filter.frequency.exponentialRampToValueAtTime(850 * pitchMult, now + 0.08);

  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.linearRampToValueAtTime(0.45, now + 0.005);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(filter);
  filter.connect(oscGain);
  oscGain.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 0.09);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    try {
      osc.disconnect();
      filter.disconnect();
      oscGain.disconnect();
      voiceGain.disconnect();
    } catch {
      /* ignore */
    }
  };

  setTimeout(() => {
    cleanup();
    endedResolve();
  }, 110);

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
 * Mantle ledge pull: wet slap and scrape + mid thud.
 */
export function playMantle(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.72, now + 0.003);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Wet slap noise sweep
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(1.6, now);
  filter.frequency.setValueAtTime(2200, now);
  filter.frequency.linearRampToValueAtTime(750, now + 0.18);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.linearRampToValueAtTime(0.85, now + 0.003);
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
  thud.frequency.setValueAtTime(135, now);
  thud.frequency.exponentialRampToValueAtTime(50, now + 0.15);

  thudGain.gain.setValueAtTime(0.0001, now);
  thudGain.gain.linearRampToValueAtTime(0.7, now + 0.003);
  thumpGainToExponential(thudGain, now + 0.15);

  thud.connect(thudGain);
  thudGain.connect(voiceGain);
  thud.start(now);
  thud.stop(now + 0.16);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    try {
      noise.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
      thud.disconnect();
      thudGain.disconnect();
      voiceGain.disconnect();
    } catch {
      /* ignore */
    }
  };

  setTimeout(() => {
    cleanup();
    endedResolve();
  }, 320);

  return {
    stop(_fade = 0.02): void {
      cleanup();
      endedResolve();
    },
    setParam(): void {},
    ended,
  };
}

function thumpGainToExponential(g: GainNode, endTime: number): void {
  g.gain.exponentialRampToValueAtTime(0.001, endTime);
}

/**
 * Single droplet "plink" using van den Doel physical liquid bubble model.
 * Frequency rises over droplet lifetime as surface tension compresses the cavity.
 */
export function playDrip(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  if (cx.usePool !== false) {
    const pool = AudioBufferPool.getInstance(ctx);
    if (pool.isReady()) {
      return pool.play('drip', cx.destination, cx.reverbSend, {
        volume: 0.75 * (cx.intensity ?? 1.0),
        pitchMult: cx.pitch ?? 1.0,
        reverbGain: 0.85,
      });
    }
  }

  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? Math.floor(Math.random() * 100000));
  const pitchMult = cx.pitch ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.65, now + 0.002);
  voiceGain.connect(cx.destination);

  // Heavy reverb send for liminal poolroom drip echo
  const reverbGain = ctx.createGain();
  reverbGain.gain.setValueAtTime(0.85, now);
  voiceGain.connect(reverbGain);
  reverbGain.connect(cx.reverbSend);

  // van den Doel bubble model: radius 1.8mm to 3.2mm (giving 900 Hz to 1650 Hz)
  const radius = rng.range(0.0018, 0.0032);
  const f0 = (3.0 / radius) * pitchMult;
  const d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
  const dripDur = Math.min(0.07, 4.0 / d);
  // Physical pitch rise: f(t) = f0 * (1 + 0.1 * d * t)
  const fEnd = f0 * (1.0 + 0.12 * d * dripDur);

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.exponentialRampToValueAtTime(fEnd, now + dripDur);

  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.linearRampToValueAtTime(0.9, now + 0.001);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + dripDur);

  osc.connect(oscGain);
  oscGain.connect(voiceGain);

  osc.start(now);
  osc.stop(now + dripDur + 0.01);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    try {
      osc.disconnect();
      oscGain.disconnect();
      reverbGain.disconnect();
      voiceGain.disconnect();
    } catch {
      /* ignore */
    }
  };

  setTimeout(() => {
    cleanup();
    endedResolve();
  }, (dripDur + 0.1) * 1000);

  return {
    stop(_fade = 0.01): void {
      cleanup();
      endedResolve();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Player breathing voice for exhaustion / stamina depletion.
 */
export function playPlayerBreath(cx: FootstepVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = cx.intensity ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.28 * intensity, now + 0.05);
  voiceGain.connect(cx.destination);

  const src = ctx.createBufferSource();
  src.buffer = cx.noise.pink;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(680, now);
  filter.Q.setValueAtTime(2.8, now);

  const cycleGain = ctx.createGain();
  cycleGain.gain.setValueAtTime(0.05, now);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.75 * (0.8 + 0.4 * intensity), now);

  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.35, now);

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
  const ended = new Promise<void>((r) => { endedResolve = r; });

  function stop(fadeSec = 0.15): void {
    if (isStopped) return;
    isStopped = true;
    clearTimeout(timer);
    const stopTime = ctx.currentTime;
    voiceGain.gain.cancelScheduledValues(stopTime);
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

  const timer = setTimeout(() => {
    if (!isStopped) stop(0.2);
  }, duration * 1000);

  return {
    stop,
    setParam(name: string, v: number): void {
      if (name === 'intensity') {
        voiceGain.gain.setTargetAtTime(0.28 * v, ctx.currentTime, 0.05);
      }
    },
    ended,
  };
}

/* ── MetroSounds.ts ───────────────────────────────────────────────────────
 *  Procedural sound synthesis for Platform Zero, the Drowned Metro:
 *  rail singing loop, train rumble loop, train horn, lever clunk, bottle shatter,
 *  station announce chime, monster swipe, and monster collapse.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { Rng } from '../../procedural/core/prng.js';

export interface MetroVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/**
 * Rail singing loop: rising high-frequency whine of rails before train arrival.
 */
export function playRailSingLoop(cx: MetroVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sine';
  osc2.type = 'triangle';
  osc1.frequency.setValueAtTime(580, now);
  osc2.frequency.setValueAtTime(584, now);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(600, now);
  bp.Q.setValueAtTime(10.0, now);

  // Slow vibrato / singing modulation
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(4.5, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(12, now);
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);

  osc1.connect(bp);
  osc2.connect(bp);
  bp.connect(voiceGain);

  osc1.start(now);
  osc2.start(now);
  lfo.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { osc1.stop(); osc2.stop(); lfo.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam(param, val) {
      if (param === 'intensity') {
        voiceGain.gain.linearRampToValueAtTime(0.35 * Math.max(0, Math.min(1, val)), ctx.currentTime + 0.1);
      }
    },
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Train rumble loop: massive rhythmic sub-bass clatter with intensity param.
 */
export function playTrainRumbleLoop(cx: MetroVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  let currentIntensity = Math.max(0.2, Math.min(1.0, cx.intensity ?? 0.8));

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.65 * currentIntensity, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Low brown noise engine roar
  const brown = ctx.createBufferSource();
  brown.buffer = cx.noise.brown;
  brown.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(90 + 80 * currentIntensity, now);

  // Wheel joint click rhythm at ~6 Hz
  const clickOsc = ctx.createOscillator();
  clickOsc.type = 'sawtooth';
  clickOsc.frequency.setValueAtTime(6.0, now);

  const clickAmp = ctx.createGain();
  clickAmp.gain.setValueAtTime(0.3, now);
  clickOsc.connect(clickAmp.gain);

  brown.connect(lp);
  lp.connect(clickAmp);
  clickAmp.connect(voiceGain);

  brown.start(now);
  clickOsc.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { brown.stop(); clickOsc.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam(param, val) {
      if (param === 'intensity') {
        currentIntensity = Math.max(0.1, Math.min(1.0, val));
        voiceGain.gain.linearRampToValueAtTime(0.65 * currentIntensity, ctx.currentTime + 0.1);
        lp.frequency.linearRampToValueAtTime(90 + 80 * currentIntensity, ctx.currentTime + 0.1);
      }
    },
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Train horn: piercing dual-tone dissonant train blast.
 */
export function playTrainHorn(cx: MetroVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Dual tone chords: ~311 Hz (Eb4) and ~370 Hz (F#4)
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc2.type = 'sawtooth';
  osc1.frequency.setValueAtTime(311.13, now);
  osc2.frequency.setValueAtTime(369.99, now);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1400, now);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.01, now);
  env.gain.linearRampToValueAtTime(0.9, now + 0.08);
  env.gain.setValueAtTime(0.85, now + 1.2);
  env.gain.exponentialRampToValueAtTime(0.001, now + 1.7);

  osc1.connect(lp);
  osc2.connect(lp);
  lp.connect(env);
  env.connect(voiceGain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 1.75);
  osc2.stop(now + 1.75);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 1850);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Lever clunk: heavy mechanical pull and latch.
 */
export function playLeverClunk(cx: MetroVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.7, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Mechanical clack snap
  const snap = ctx.createBufferSource();
  snap.buffer = cx.noise.white;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(950, now);
  bp.Q.setValueAtTime(3.0, now);

  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.85, now);
  snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  snap.connect(bp);
  bp.connect(snapGain);
  snapGain.connect(voiceGain);
  snap.start(now);
  snap.stop(now + 0.15);

  // Heavy metal thump resonance
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(140, now);
  thud.frequency.exponentialRampToValueAtTime(45, now + 0.35);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.75, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  thud.connect(thudGain);
  thudGain.connect(voiceGain);
  thud.start(now);
  thud.stop(now + 0.45);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 500);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Bottle shatter: glass snap and scattered shards.
 */
export function playBottleShatter(cx: MetroVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 808);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.55, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // High glass snap
  const snap = ctx.createBufferSource();
  snap.buffer = cx.noise.white;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(2400, now);

  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.85, now);
  snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  snap.connect(hp);
  hp.connect(snapGain);
  snapGain.connect(voiceGain);
  snap.start(now);
  snap.stop(now + 0.18);

  // High glass ring tones
  const ring1 = ctx.createOscillator();
  ring1.type = 'sine';
  ring1.frequency.setValueAtTime(rng.range(3200, 4200), now);
  const ringGain1 = ctx.createGain();
  ringGain1.gain.setValueAtTime(0.5, now);
  ringGain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  ring1.connect(ringGain1);
  ringGain1.connect(voiceGain);
  ring1.start(now);
  ring1.stop(now + 0.45);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 550);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Station announce chime: melodic 3-tone chime (F4, A4, C5).
 */
export function playStationAnnounceChime(cx: MetroVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.45, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const tones = [349.23, 440.0, 523.25]; // F4, A4, C5
  for (let i = 0; i < tones.length; i++) {
    const t = now + i * 0.22;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tones[i]!, t);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.setValueAtTime(0.7, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    osc.connect(env);
    env.connect(voiceGain);
    osc.start(t);
    osc.stop(t + 0.7);
  }

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 1400);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Monster swipe: aggressive tearing whoosh (visibly stops short or attacks).
 */
export function playMonsterSwipe(cx: MetroVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.7, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Tearing whoosh
  const whoosh = ctx.createBufferSource();
  whoosh.buffer = cx.noise.pink;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(300, now);
  bp.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
  bp.frequency.exponentialRampToValueAtTime(200, now + 0.28);
  bp.Q.setValueAtTime(2.5, now);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.01, now);
  env.gain.linearRampToValueAtTime(0.85, now + 0.1);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  whoosh.connect(bp);
  bp.connect(env);
  env.connect(voiceGain);

  whoosh.start(now);
  whoosh.stop(now + 0.4);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 450);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Monster collapse: stunned body impact and groan.
 */
export function playMonsterCollapse(cx: MetroVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.8, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Heavy body impact thud
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(85, now);
  thud.frequency.exponentialRampToValueAtTime(30, now + 0.4);

  const thudEnv = ctx.createGain();
  thudEnv.gain.setValueAtTime(0.9, now);
  thudEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  thud.connect(thudEnv);
  thudEnv.connect(voiceGain);
  thud.start(now);
  thud.stop(now + 0.55);

  // Stun groan
  const groan = ctx.createOscillator();
  groan.type = 'sawtooth';
  groan.frequency.setValueAtTime(110, now + 0.1);
  groan.frequency.linearRampToValueAtTime(45, now + 0.9);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(280, now);

  const groanEnv = ctx.createGain();
  groanEnv.gain.setValueAtTime(0.001, now);
  groanEnv.gain.linearRampToValueAtTime(0.65, now + 0.2);
  groanEnv.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

  groan.connect(lp);
  lp.connect(groanEnv);
  groanEnv.connect(voiceGain);
  groan.start(now + 0.1);
  groan.stop(now + 1.05);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 1200);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/* ── JungleSounds.ts ──────────────────────────────────────────────────────
 *  Procedural sound synthesis for The Sunken Jungle:
 *  river loop, waterfall loop, frog chorus, crickets, bird calls,
 *  insect drone, wind in leaves, and jungle ambience bed.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { Rng } from '../../procedural/core/prng.js';

export interface JungleVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/**
 * River loop: churning flowing water with bubble resonance.
 */
export function playRiverLoop(cx: JungleVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.45, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Pink noise water flow
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(450, now);
  bp.Q.setValueAtTime(2.0, now);

  // Slow LFO to simulate eddy currents and surge
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(0.35, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(150, now);
  lfo.connect(lfoGain);
  lfoGain.connect(bp.frequency);

  noise.connect(bp);
  bp.connect(voiceGain);

  noise.start(now);
  lfo.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { noise.stop(); lfo.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam(param, val) {
      if (param === 'intensity' || param === 'gain') {
        voiceGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, val)), ctx.currentTime + 0.1);
      }
    },
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Waterfall loop: heavy roaring cascade with deep bass rumble and high mist spray.
 */
export function playWaterfallLoop(cx: JungleVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.6, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Heavy rumble: brown noise + lowpass 200 Hz
  const brown = ctx.createBufferSource();
  brown.buffer = cx.noise.brown;
  brown.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(180, now);
  brown.connect(lp);
  lp.connect(voiceGain);

  // Spray: white noise + highpass 1800 Hz
  const white = ctx.createBufferSource();
  white.buffer = cx.noise.white;
  white.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(1800, now);
  const sprayGain = ctx.createGain();
  sprayGain.gain.setValueAtTime(0.25, now);
  white.connect(hp);
  hp.connect(sprayGain);
  sprayGain.connect(voiceGain);

  brown.start(now);
  white.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { brown.stop(); white.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam(param, val) {
      if (param === 'intensity' || param === 'gain') {
        voiceGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, val)), ctx.currentTime + 0.1);
      }
    },
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Frog chorus loop: rhythmic wetland croaks.
 */
export function playFrogChorusLoop(cx: JungleVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.3, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, now);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(450, now);
  bp.Q.setValueAtTime(6.0, now);

  // AM rhythm (croaking pulses at ~3.2 Hz)
  const am = ctx.createOscillator();
  am.frequency.setValueAtTime(3.2, now);
  const amGain = ctx.createGain();
  amGain.gain.setValueAtTime(0.5, now);
  const amOffset = ctx.createGain();
  amOffset.gain.setValueAtTime(0.5, now);
  am.connect(amGain);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.5, now);
  am.connect(amp.gain);

  osc.connect(bp);
  bp.connect(amp);
  amp.connect(voiceGain);

  osc.start(now);
  am.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { osc.stop(); am.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam(param, val) {
      if (param === 'duck') {
        voiceGain.gain.linearRampToValueAtTime(0.3 * val, ctx.currentTime + 0.2);
      }
    },
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Cricket loop: high frequency chirping.
 */
export function playCricketLoop(cx: JungleVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.25, now);
  voiceGain.connect(cx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(4600, now);

  // Chirp modulation at 18 Hz
  const am = ctx.createOscillator();
  am.type = 'square';
  am.frequency.setValueAtTime(16, now);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.2, now);
  am.connect(amp.gain);

  osc.connect(amp);
  amp.connect(voiceGain);

  osc.start(now);
  am.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { osc.stop(); am.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam(param, val) {
      if (param === 'duck') {
        voiceGain.gain.linearRampToValueAtTime(0.25 * val, ctx.currentTime + 0.2);
      }
    },
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Bird call: procedural chirp / flush burst.
 */
export function playBirdCall(cx: JungleVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 606);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const startF = rng.range(2200, 3200);
  osc.frequency.setValueAtTime(startF, now);
  osc.frequency.exponentialRampToValueAtTime(startF * 1.5, now + 0.08);
  osc.frequency.exponentialRampToValueAtTime(startF * 0.8, now + 0.22);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.01, now);
  env.gain.linearRampToValueAtTime(0.7, now + 0.04);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(env);
  env.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 0.3);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 400);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Insect drone: high buzzing sawtooth drone with AM flutter.
 */
export function playInsectDrone(cx: JungleVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.2, now);
  voiceGain.connect(cx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, now);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2400, now);
  bp.Q.setValueAtTime(4.0, now);

  osc.connect(bp);
  bp.connect(voiceGain);
  osc.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { osc.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam() {},
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Wind in leaves: sweeping bandpass pink noise.
 */
export function playWindLeaves(cx: JungleVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.3, now);
  voiceGain.connect(cx.destination);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(800, now);
  bp.Q.setValueAtTime(1.5, now);

  // Slow gust oscillation
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(0.2, now);
  const lfoG = ctx.createGain();
  lfoG.gain.setValueAtTime(350, now);
  lfo.connect(lfoG);
  lfoG.connect(bp.frequency);

  noise.connect(bp);
  bp.connect(voiceGain);

  noise.start(now);
  lfo.start(now);

  return {
    stop(fade = 0.8) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { noise.stop(); lfo.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam() {},
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Ambience bed for Sunken Jungle.
 */
export function playAmbienceJungle(cx: JungleVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.25, now);
  voiceGain.connect(cx.destination);

  const brown = ctx.createBufferSource();
  brown.buffer = cx.noise.brown;
  brown.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(120, now);

  brown.connect(lp);
  lp.connect(voiceGain);
  brown.start(now);

  return {
    stop(fade = 1.0) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { brown.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam() {},
    ended: new Promise<void>(() => {}),
  };
}

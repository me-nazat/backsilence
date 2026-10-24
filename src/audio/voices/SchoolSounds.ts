/* ── SchoolSounds.ts ──────────────────────────────────────────────────────
 *  Procedural sound synthesis for The Drowned Schoolhouse:
 *  perch creaks, locker doors (fast vs careful), chain grinding, PA system
 *  (chime, blast, garbled announcer), chalk scratch, piano clunk, and school bed.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { Rng } from '../../procedural/core/prng.js';

export interface SchoolVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/**
 * Wooden/plastic perch landing creak.
 */
export function playCreak(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 101);
  const intensity = Math.max(0.2, cx.intensity ?? 0.6);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.4 * intensity, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Comb-filtered noise for wood friction
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = cx.noise.pink;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(rng.range(380, 520), now);
  bp.Q.setValueAtTime(6.0, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.01, now);
  noiseGain.gain.linearRampToValueAtTime(0.7, now + 0.04);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

  noiseSource.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(voiceGain);

  noiseSource.start(now);
  noiseSource.stop(now + 0.32);

  // Resonant body flex oscillator
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const baseFreq = rng.range(85, 120);
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.75, now + 0.25);

  const oscFilter = ctx.createBiquadFilter();
  oscFilter.type = 'lowpass';
  oscFilter.frequency.setValueAtTime(400, now);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0, now);
  oscGain.gain.linearRampToValueAtTime(0.3, now + 0.03);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(oscFilter);
  oscFilter.connect(oscGain);
  oscGain.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 0.3);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 400);

  return {
    stop() {
      clearTimeout(timer);
      try { voiceGain.disconnect(); } catch { /* ignore */ }
    },
    setParam() {},
    ended,
  };
}

/**
 * Fast locker door open: metallic slam / snap (0.35 loudness).
 */
export function playLockerOpenFast(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 202);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.38, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Metallic snap click
  const snap = ctx.createBufferSource();
  snap.buffer = cx.noise.white;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(1200, now);
  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.9, now);
  snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  snap.connect(hp);
  hp.connect(snapGain);
  snapGain.connect(voiceGain);
  snap.start(now);
  snap.stop(now + 0.1);

  // Metal hollow ring (hollow locker body)
  const ring = ctx.createOscillator();
  ring.type = 'sine';
  ring.frequency.setValueAtTime(rng.range(340, 420), now);
  ring.frequency.exponentialRampToValueAtTime(180, now + 0.45);

  const ringGain = ctx.createGain();
  ringGain.gain.setValueAtTime(0.7, now);
  ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  ring.connect(ringGain);
  ringGain.connect(voiceGain);
  ring.start(now);
  ring.stop(now + 0.5);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 600);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Careful locker door open: soft friction and gentle quiet slide (0.10 loudness).
 */
export function playLockerOpenCareful(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 303);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.2, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Very soft bandpass white noise for quiet glide
  const glide = ctx.createBufferSource();
  glide.buffer = cx.noise.pink;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(rng.range(600, 900), now);
  bp.Q.setValueAtTime(3.0, now);

  const glideGain = ctx.createGain();
  glideGain.gain.setValueAtTime(0.01, now);
  glideGain.gain.linearRampToValueAtTime(0.3, now + 0.2);
  glideGain.gain.linearRampToValueAtTime(0.25, now + 0.8);
  glideGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  glide.connect(bp);
  bp.connect(glideGain);
  glideGain.connect(voiceGain);

  glide.start(now);
  glide.stop(now + 1.3);

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
 * Sustained chain cutting / grind loop.
 */
export function playChainGrindLoop(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.55, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  noise.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1800, now);
  bp.Q.setValueAtTime(8.0, now);

  // Modulate frequency to simulate saw teeth grinding against chain links
  const lfo = ctx.createOscillator();
  lfo.type = 'sawtooth';
  lfo.frequency.setValueAtTime(14.0, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(450, now);
  lfo.connect(lfoGain);
  lfoGain.connect(bp.frequency);

  noise.connect(bp);
  bp.connect(voiceGain);

  noise.start(now);
  lfo.start(now);

  return {
    stop(fade = 0.2) {
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
 * PA Chime: two-tone school bell (D5 -> A5).
 */
export function playPaChime(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.5, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Tone 1: 587.33 Hz (D5)
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.8, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc1.connect(g1);
  g1.connect(voiceGain);
  osc1.start(now);
  osc1.stop(now + 0.65);

  // Tone 2: 880.0 Hz (A5)
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880.0, now + 0.35);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.0001, now);
  g2.gain.setValueAtTime(0.8, now + 0.35);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc2.connect(g2);
  g2.connect(voiceGain);
  osc2.start(now + 0.35);
  osc2.stop(now + 1.25);

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
 * PA Blast: piercing feedback screech and speaker crackle (1.0 loudness at speaker).
 */
export function playPaBlast(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.85, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Feedback oscillator sweep
  const screech = ctx.createOscillator();
  screech.type = 'triangle';
  screech.frequency.setValueAtTime(2400, now);
  screech.frequency.exponentialRampToValueAtTime(3600, now + 0.3);
  screech.frequency.exponentialRampToValueAtTime(1800, now + 0.9);

  const screechGain = ctx.createGain();
  screechGain.gain.setValueAtTime(0.01, now);
  screechGain.gain.linearRampToValueAtTime(0.9, now + 0.08);
  screechGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

  screech.connect(screechGain);
  screechGain.connect(voiceGain);
  screech.start(now);
  screech.stop(now + 1.2);

  // Harsh speaker clip burst
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1400, now);
  bp.Q.setValueAtTime(4.0, now);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.6, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

  noise.connect(bp);
  bp.connect(nGain);
  nGain.connect(voiceGain);
  noise.start(now);
  noise.stop(now + 0.75);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 1300);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * PA Garble: eerie formant-filtered whisper/babble.
 */
export function playPaGarble(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Bandpass modulated pink noise simulating human formants
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;

  const formant = ctx.createBiquadFilter();
  formant.type = 'bandpass';
  formant.frequency.setValueAtTime(800, now);
  formant.frequency.linearRampToValueAtTime(1400, now + 0.4);
  formant.frequency.linearRampToValueAtTime(600, now + 0.9);
  formant.frequency.linearRampToValueAtTime(1100, now + 1.4);
  formant.Q.setValueAtTime(8.0, now);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.01, now);
  nGain.gain.linearRampToValueAtTime(0.8, now + 0.1);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

  noise.connect(formant);
  formant.connect(nGain);
  nGain.connect(voiceGain);

  noise.start(now);
  noise.stop(now + 1.7);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 1800);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Chalkboard scratch: high-frequency friction screech.
 */
export function playChalkScratch(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 404);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const startFreq = rng.range(3400, 4800);
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.linearRampToValueAtTime(startFreq * 1.3, now + 0.12);
  osc.frequency.linearRampToValueAtTime(startFreq * 0.9, now + 0.25);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(startFreq, now);
  bp.Q.setValueAtTime(12.0, now);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.01, now);
  env.gain.linearRampToValueAtTime(0.6, now + 0.04);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc.connect(bp);
  bp.connect(env);
  env.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 0.4);

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
 * Drowned piano clunk: detuned low thud.
 */
export function playPianoClunk(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 505);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Two detuned low triangle oscillators
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc2.type = 'sine';

  const baseFreq = rng.range(55, 75);
  osc1.frequency.setValueAtTime(baseFreq, now);
  osc2.frequency.setValueAtTime(baseFreq * 1.03, now); // 3% detune

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(180, now);
  lp.frequency.exponentialRampToValueAtTime(60, now + 0.7);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.9, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  osc1.connect(lp);
  osc2.connect(lp);
  lp.connect(env);
  env.connect(voiceGain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.85);
  osc2.stop(now + 0.85);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 1000);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Ambience bed for Schoolhouse: fluorescent buzz, distant resonance.
 */
export function playAmbienceSchool(cx: SchoolVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.2, now);
  voiceGain.connect(cx.destination);

  // 60Hz and 120Hz fluorescent mains hum
  const hum1 = ctx.createOscillator();
  hum1.type = 'sawtooth';
  hum1.frequency.setValueAtTime(60, now);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(240, now);

  const humGain = ctx.createGain();
  humGain.gain.setValueAtTime(0.12, now);

  hum1.connect(lp);
  lp.connect(humGain);
  humGain.connect(voiceGain);

  hum1.start(now);

  return {
    stop(fade = 1.0) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { hum1.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam() {},
    ended: new Promise<void>(() => {}),
  };
}

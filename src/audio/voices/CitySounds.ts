/* ── CitySounds.ts ────────────────────────────────────────────────────────
 *  Procedural sound synthesis for Neon Flood District:
 *  rain loop (intensity param), thunder (distance param), neon buzz loop,
 *  drone whirr loop, siren wail, EMP pulse, terminal beep, hack success/fail, holo hum.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import { Rng } from '../../procedural/core/prng.js';

export interface CityVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/**
 * Rain loop with dynamic intensity param (0..1).
 */
export function playRainLoop(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  let currentIntensity = Math.max(0.1, Math.min(1.0, cx.intensity ?? 0.5));

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35 * currentIntensity, now);
  voiceGain.connect(cx.destination);

  // Pink noise base shower
  const pink = ctx.createBufferSource();
  pink.buffer = cx.noise.pink;
  pink.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2000 + 4000 * currentIntensity, now);
  pink.connect(lp);
  lp.connect(voiceGain);

  // High frequency spatter
  const white = ctx.createBufferSource();
  white.buffer = cx.noise.white;
  white.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(4500, now);
  const spatterGain = ctx.createGain();
  spatterGain.gain.setValueAtTime(0.15 * currentIntensity, now);
  white.connect(hp);
  hp.connect(spatterGain);
  spatterGain.connect(voiceGain);

  pink.start(now);
  white.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { pink.stop(); white.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam(param, val) {
      if (param === 'intensity' || param === 'rain') {
        currentIntensity = Math.max(0.05, Math.min(1.0, val));
        const t = ctx.currentTime;
        voiceGain.gain.linearRampToValueAtTime(0.35 * currentIntensity, t + 0.1);
        lp.frequency.linearRampToValueAtTime(2000 + 4000 * currentIntensity, t + 0.1);
        spatterGain.gain.linearRampToValueAtTime(0.15 * currentIntensity, t + 0.1);
      }
    },
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Thunder crack and distant rumble. Distance param controls crack vs low-end roll.
 */
export function playThunder(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const rng = new Rng(cx.seed ?? 707);
  // distance: 0 = overhead strike, 1 = distant horizon
  const distance = Math.max(0, Math.min(1, cx.intensity ?? 0.3));

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.75, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // 1. Sharp initial crack (attenuated by distance)
  if (distance < 0.8) {
    const crack = ctx.createBufferSource();
    crack.buffer = cx.noise.white;
    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(rng.range(600, 1200), now);
    crackFilter.Q.setValueAtTime(2.0, now);

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime((1.0 - distance) * 0.9, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(voiceGain);
    crack.start(now);
    crack.stop(now + 0.2);
  }

  // 2. Heavy sub rumble (30-80 Hz)
  const rumble = ctx.createBufferSource();
  rumble.buffer = cx.noise.brown;

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.setValueAtTime(120 - 50 * distance, now);

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.01, now);
  rumbleGain.gain.linearRampToValueAtTime(0.85, now + 0.08);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8 + (1.0 - distance) * 0.6);

  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(voiceGain);

  rumble.start(now);
  rumble.stop(now + 2.5);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 2600);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Neon sign buzz loop: 120 Hz buzzing transformer with slight harmonics.
 */
export function playNeonBuzzLoop(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.2, now);
  voiceGain.connect(cx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, now);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1200, now);
  bp.Q.setValueAtTime(5.0, now);

  osc.connect(bp);
  bp.connect(voiceGain);
  osc.start(now);

  return {
    stop(fade = 0.3) {
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
 * Drone whirr loop: dual rotor turbine sound.
 */
export function playDroneWhirrLoop(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35, now);
  voiceGain.connect(cx.destination);

  const rotor1 = ctx.createOscillator();
  const rotor2 = ctx.createOscillator();
  rotor1.type = 'triangle';
  rotor2.type = 'sawtooth';
  rotor1.frequency.setValueAtTime(240, now);
  rotor2.frequency.setValueAtTime(278, now); // detuned second motor

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, now);

  rotor1.connect(lp);
  rotor2.connect(lp);
  lp.connect(voiceGain);

  rotor1.start(now);
  rotor2.start(now);

  return {
    stop(fade = 0.3) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { rotor1.stop(); rotor2.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam() {},
    ended: new Promise<void>(() => {}),
  };
}

/**
 * Siren wail: 0.9 loudness lock siren (sweeping pitch).
 */
export function playSirenWail(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.85, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(650, now);
  osc.frequency.linearRampToValueAtTime(1150, now + 0.35);
  osc.frequency.linearRampToValueAtTime(650, now + 0.7);
  osc.frequency.linearRampToValueAtTime(1150, now + 1.05);
  osc.frequency.linearRampToValueAtTime(650, now + 1.4);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, now);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.01, now);
  env.gain.linearRampToValueAtTime(0.8, now + 0.05);
  env.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

  osc.connect(lp);
  lp.connect(env);
  env.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 1.65);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 1700);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * EMP pulse: sub thud and electrical zap sweep.
 */
export function playEmpPulse(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.8, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Electrical discharge snap
  const zap = ctx.createOscillator();
  zap.type = 'sawtooth';
  zap.frequency.setValueAtTime(2400, now);
  zap.frequency.exponentialRampToValueAtTime(80, now + 0.25);

  const zapEnv = ctx.createGain();
  zapEnv.gain.setValueAtTime(0.9, now);
  zapEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  zap.connect(zapEnv);
  zapEnv.connect(voiceGain);
  zap.start(now);
  zap.stop(now + 0.32);

  // Sub bass shockwave
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(60, now);
  sub.frequency.exponentialRampToValueAtTime(25, now + 0.45);

  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0.95, now);
  subEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  sub.connect(subEnv);
  subEnv.connect(voiceGain);
  sub.start(now);
  sub.stop(now + 0.55);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 650);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Terminal beep: short crisp sine blip (1760 Hz).
 */
export function playTerminalBeep(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.4, now);
  voiceGain.connect(cx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1760, now);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.7, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(env);
  env.connect(voiceGain);
  osc.start(now);
  osc.stop(now + 0.09);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  const timer = setTimeout(() => {
    voiceGain.disconnect();
    endedResolve?.();
  }, 120);

  return {
    stop() { clearTimeout(timer); voiceGain.disconnect(); },
    setParam() {},
    ended,
  };
}

/**
 * Hack success: ascending 3-note electronic arpeggio (C6, E6, G6).
 */
export function playHackSuccess(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.5, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const notes = [1046.5, 1318.5, 1567.98]; // C6, E6, G6
  for (let i = 0; i < notes.length; i++) {
    const tNote = now + i * 0.07;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(notes[i]!, tNote);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.setValueAtTime(0.7, tNote);
    env.gain.exponentialRampToValueAtTime(0.001, tNote + 0.22);

    osc.connect(env);
    env.connect(voiceGain);
    osc.start(tNote);
    osc.stop(tNote + 0.25);
  }

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
 * Hack fail: harsh low buzz / drop (110 Hz square).
 */
export function playHackFail(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.6, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.linearRampToValueAtTime(65, now + 0.35);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(350, now);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.8, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc.connect(lp);
  lp.connect(env);
  env.connect(voiceGain);

  osc.start(now);
  osc.stop(now + 0.45);

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
 * Holo hum: warm electronic pad / shimmer.
 */
export function playHoloHum(cx: CityVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.25, now);
  voiceGain.connect(cx.destination);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sine';
  osc2.type = 'triangle';
  osc1.frequency.setValueAtTime(220, now);
  osc2.frequency.setValueAtTime(222.5, now); // slight chorus beating

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(450, now);

  osc1.connect(lp);
  osc2.connect(lp);
  lp.connect(voiceGain);

  osc1.start(now);
  osc2.start(now);

  return {
    stop(fade = 0.5) {
      const stopNow = ctx.currentTime;
      voiceGain.gain.linearRampToValueAtTime(0.001, stopNow + fade);
      setTimeout(() => {
        try { osc1.stop(); osc2.stop(); voiceGain.disconnect(); } catch { /* ignore */ }
      }, fade * 1000 + 50);
    },
    setParam() {},
    ended: new Promise<void>(() => {}),
  };
}

/* ── TapeSounds.ts ────────────────────────────────────────────────────────
 *  Procedural analog tape & VHS sound effects:
 *  - vhs_glitch: stutter + pitch dive
 *  - tape_rewind: rising mechanical motor whine with noisy rewinding chirps
 *  - tape_eject: mechanical latch clunk + motor wind down
 *  - tape_insert: tape cassette slide + spring clack + head engagement
 *  - static_burst: broadband static burst with bandpass sweep
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { UiVoiceContext } from './UiSounds.js';

export function playVhsGlitch(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  // Stuttering square wave diving from 380 Hz down to 45 Hz
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(380, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(300, now + 0.35);

  // Stutter gating using square LFO or multiple gain pulses
  gain.gain.setValueAtTime(0.22, now);
  gain.gain.setValueAtTime(0.01, now + 0.08);
  gain.gain.setValueAtTime(0.25, now + 0.12);
  gain.gain.setValueAtTime(0.02, now + 0.18);
  gain.gain.setValueAtTime(0.28, now + 0.22);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

  // Noise burst layer
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = cx.noise.white;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.12, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(cx.destination);

  noiseSource.connect(noiseGain);
  noiseGain.connect(cx.destination);

  osc.start(now);
  osc.stop(now + 0.4);
  noiseSource.start(now);
  noiseSource.stop(now + 0.32);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    gain.disconnect();
    noiseGain.disconnect();
    endedResolve();
  }, 420);

  return {
    stop(): void {
      gain.disconnect();
      noiseGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

export function playTapeRewind(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  // Dual motor whine sweeping upwards
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc1.type = 'sawtooth';
  osc2.type = 'triangle';

  osc1.frequency.setValueAtTime(220, now);
  osc1.frequency.exponentialRampToValueAtTime(1600, now + 1.1);

  osc2.frequency.setValueAtTime(440, now);
  osc2.frequency.exponentialRampToValueAtTime(3200, now + 1.1);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(2400, now + 1.1);
  filter.Q.value = 3.0;

  gain.gain.setValueAtTime(0.01, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.25);
  gain.gain.setValueAtTime(0.2, now + 0.95);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(cx.destination);

  osc1.start(now);
  osc1.stop(now + 1.18);
  osc2.start(now);
  osc2.stop(now + 1.18);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    gain.disconnect();
    endedResolve();
  }, 1200);

  return {
    stop(): void {
      gain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

export function playTapeEject(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  // Mechanical latch snap (spring clunk)
  const oscSnap = ctx.createOscillator();
  const snapGain = ctx.createGain();
  oscSnap.type = 'triangle';
  oscSnap.frequency.setValueAtTime(160, now);
  oscSnap.frequency.exponentialRampToValueAtTime(35, now + 0.08);

  snapGain.gain.setValueAtTime(0.35, now);
  snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  oscSnap.connect(snapGain);
  snapGain.connect(cx.destination);
  oscSnap.start(now);
  oscSnap.stop(now + 0.1);

  // Plastic mechanism spring clatter & motor spool down
  const oscMotor = ctx.createOscillator();
  const motorGain = ctx.createGain();
  oscMotor.type = 'sine';
  oscMotor.frequency.setValueAtTime(420, now + 0.04);
  oscMotor.frequency.exponentialRampToValueAtTime(80, now + 0.45);

  motorGain.gain.setValueAtTime(0.0, now);
  motorGain.gain.setValueAtTime(0.15, now + 0.05);
  motorGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

  oscMotor.connect(motorGain);
  motorGain.connect(cx.destination);
  oscMotor.start(now + 0.04);
  oscMotor.stop(now + 0.5);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    snapGain.disconnect();
    motorGain.disconnect();
    endedResolve();
  }, 520);

  return {
    stop(): void {
      snapGain.disconnect();
      motorGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

export function playTapeInsert(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  // Cassette sliding in (filtered noise)
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1200, now);
  noiseFilter.Q.value = 2.0;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.02, now);
  noiseGain.gain.linearRampToValueAtTime(0.16, now + 0.15);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(cx.destination);
  noise.start(now);
  noise.stop(now + 0.32);

  // Metallic latch lock (head engagement at +0.28s)
  const oscLock = ctx.createOscillator();
  const lockGain = ctx.createGain();
  oscLock.type = 'triangle';
  oscLock.frequency.setValueAtTime(640, now + 0.26);
  oscLock.frequency.exponentialRampToValueAtTime(110, now + 0.36);

  lockGain.gain.setValueAtTime(0.0, now);
  lockGain.gain.setValueAtTime(0.3, now + 0.26);
  lockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

  oscLock.connect(lockGain);
  lockGain.connect(cx.destination);
  oscLock.start(now + 0.26);
  oscLock.stop(now + 0.42);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    noiseGain.disconnect();
    lockGain.disconnect();
    endedResolve();
  }, 450);

  return {
    stop(): void {
      noiseGain.disconnect();
      lockGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

export function playStaticBurst(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(3200, now);
  filter.frequency.exponentialRampToValueAtTime(650, now + 0.22);
  filter.Q.value = 1.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.24, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(cx.destination);

  noise.start(now);
  noise.stop(now + 0.26);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    gain.disconnect();
    endedResolve();
  }, 280);

  return {
    stop(): void {
      gain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

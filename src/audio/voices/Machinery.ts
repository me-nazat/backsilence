/* ── Machinery.ts ────────────────────────────────────────────────────────
 *  Procedural industrial and machinery voices: steam bursts, valves,
 *  generators, alarms, shutters, and mechanical ratchets.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';

export interface MachineVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/**
 * steam_hiss: Filtered noise burst with a long decay and a rising whistle layer.
 */
export function playSteamHiss(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = Math.max(0.2, cx.intensity ?? 0.8);
  const dur = 3.5;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.4 * intensity, now + 0.08);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // White noise through highpass + bandpass
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = cx.noise.white;
  noiseSource.loop = true;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(1400, now);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(3200, now);
  bp.Q.setValueAtTime(1.8, now);

  noiseSource.connect(hp);
  hp.connect(bp);
  bp.connect(master);

  // Rising high whistle tone
  const whistle = ctx.createOscillator();
  const whistleGain = ctx.createGain();
  whistle.type = 'sine';
  whistle.frequency.setValueAtTime(1800, now);
  whistle.frequency.exponentialRampToValueAtTime(3600, now + 0.9);
  whistleGain.gain.setValueAtTime(0.08 * intensity, now);
  whistleGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  whistle.connect(whistleGain);
  whistleGain.connect(master);

  noiseSource.start(now);
  whistle.start(now);
  noiseSource.stop(now + dur);
  whistle.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 50);

  return {
    stop(fade = 0.1): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * pipe_groan: Low FM resonant sweep (groaning hollow metallic conduit).
 */
export function playPipeGroan(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 2.4;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.35, now + 0.3);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Carrier + Modulator FM
  const carrier = ctx.createOscillator();
  carrier.type = 'sawtooth';
  carrier.frequency.setValueAtTime(65, now);
  carrier.frequency.linearRampToValueAtTime(48, now + dur);

  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(18, now);
  modGain.gain.setValueAtTime(35, now);
  modGain.gain.exponentialRampToValueAtTime(5, now + dur);

  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(320, now);
  filter.Q.setValueAtTime(4.0, now);

  carrier.connect(filter);
  filter.connect(master);

  carrier.start(now);
  mod.start(now);
  carrier.stop(now + dur);
  mod.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 50);

  return {
    stop(fade = 0.1): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * valve_turn: Rhythmic metallic squeal + ratchet clicks (loop while held).
 */
export function playValveTurn(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.32, now + 0.1);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Squeal osc (triangle with rapid pitch wobble)
  const squeal = ctx.createOscillator();
  squeal.type = 'triangle';
  squeal.frequency.setValueAtTime(420, now);

  const squealLfo = ctx.createOscillator();
  const squealLfoGain = ctx.createGain();
  squealLfo.frequency.setValueAtTime(6.0, now);
  squealLfoGain.gain.setValueAtTime(60, now);
  squealLfo.connect(squealLfoGain);
  squealLfoGain.connect(squeal.frequency);

  // Pink noise ratchet bursts via gain LFO
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1600, now);
  noiseFilter.Q.setValueAtTime(5.0, now);

  const ratchetLfo = ctx.createOscillator();
  ratchetLfo.type = 'square';
  ratchetLfo.frequency.setValueAtTime(4.0, now);
  const ratchetGain = ctx.createGain();
  ratchetGain.gain.setValueAtTime(0.18, now);
  ratchetLfo.connect(ratchetGain.gain);

  noise.connect(noiseFilter);
  noiseFilter.connect(ratchetGain);
  ratchetGain.connect(master);
  squeal.connect(master);

  squeal.start(now);
  squealLfo.start(now);
  noise.start(now);
  ratchetLfo.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 0.15): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          squeal.stop();
          squealLfo.stop();
          noise.stop();
          ratchetLfo.stop();
          master.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000 + 40);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * valve_release: Burst of hiss + clank.
 */
export function playValveRelease(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 0.7;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.4, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Hiss burst
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2400, now);
  noise.connect(bp);
  bp.connect(master);

  // Heavy metal clank
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
  const oscFilter = ctx.createBiquadFilter();
  oscFilter.type = 'lowpass';
  oscFilter.frequency.setValueAtTime(800, now);
  osc.connect(oscFilter);
  oscFilter.connect(master);

  noise.start(now);
  osc.start(now);
  noise.stop(now + dur);
  osc.stop(now + 0.25);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 50);

  return {
    stop(fade = 0.05): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * water_inflow_loop: Pink noise + rumble band, rising pitch by setParam('rate').
 */
export function playWaterInflowLoop(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.35, now + 0.5);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const lowRumble = ctx.createBiquadFilter();
  lowRumble.type = 'lowpass';
  lowRumble.frequency.setValueAtTime(220, now);

  const rushBand = ctx.createBiquadFilter();
  rushBand.type = 'bandpass';
  rushBand.frequency.setValueAtTime(540, now);
  rushBand.Q.setValueAtTime(2.2, now);

  noise.connect(lowRumble);
  noise.connect(rushBand);
  lowRumble.connect(master);
  rushBand.connect(master);

  noise.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 0.5): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          noise.stop();
          master.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000 + 40);
    },
    setParam(name: string, val: number): void {
      if (name === 'rate') {
        const rateClamped = Math.max(0.1, Math.min(2.5, val));
        const t = ctx.currentTime;
        rushBand.frequency.linearRampToValueAtTime(540 * rateClamped, t + 0.1);
        lowRumble.frequency.linearRampToValueAtTime(220 * rateClamped, t + 0.1);
      }
    },
    ended,
  };
}

/**
 * crank_loop: Ratcheting whir, rising with rate.
 */
export function playCrankLoop(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.28, now + 0.08);
  master.connect(cx.destination);

  // Ratchet pulse osc
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, now);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, now);
  filter.Q.setValueAtTime(4.0, now);

  osc.connect(filter);
  filter.connect(master);
  osc.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 0.08): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          osc.stop();
          master.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000 + 40);
    },
    setParam(name: string, val: number): void {
      if (name === 'rate') {
        const rate = Math.max(0.5, Math.min(3.0, val));
        osc.frequency.linearRampToValueAtTime(140 * rate, ctx.currentTime + 0.05);
      }
    },
    ended,
  };
}

/**
 * generator_loop: Low engine rumble, sputter, exhaust chuff.
 */
export function playGeneratorLoop(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.45, now + 0.4);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Low rumble engine pulse
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(52, now);

  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(12, now); // ~12 strokes per sec
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(14, now);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  // Exhaust chuff noise
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const chuffFilter = ctx.createBiquadFilter();
  chuffFilter.type = 'bandpass';
  chuffFilter.frequency.setValueAtTime(320, now);
  chuffFilter.Q.setValueAtTime(2.0, now);

  const chuffMod = ctx.createOscillator();
  chuffMod.type = 'square';
  chuffMod.frequency.setValueAtTime(6, now);
  const chuffGain = ctx.createGain();
  chuffGain.gain.setValueAtTime(0.2, now);
  chuffMod.connect(chuffGain.gain);

  noise.connect(chuffFilter);
  chuffFilter.connect(chuffGain);
  chuffGain.connect(master);
  osc.connect(master);

  osc.start(now);
  lfo.start(now);
  noise.start(now);
  chuffMod.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 0.5): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          osc.stop();
          lfo.stop();
          noise.stop();
          chuffMod.stop();
          master.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000 + 40);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * generator_cord: Cord rattle plus an initial engine stutter.
 */
export function playGeneratorCord(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 0.85;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.38, now + 0.05);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Cord friction rasp
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1400, now);
  bp.frequency.linearRampToValueAtTime(600, now + 0.4);
  noise.connect(bp);
  bp.connect(master);

  // Sputter pulse
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(75, now + 0.35);
  osc.frequency.exponentialRampToValueAtTime(30, now + dur);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0, now);
  oscGain.gain.setValueAtTime(0.3, now + 0.35);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(oscGain);
  oscGain.connect(master);

  noise.start(now);
  osc.start(now + 0.35);
  noise.stop(now + 0.5);
  osc.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 50);

  return {
    stop(fade = 0.05): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * alarm_klaxon: Warble, 650–900 Hz, loud.
 */
export function playAlarmKlaxon(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 1.8;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.42, now + 0.04);
  master.gain.setValueAtTime(0.42, now + dur - 0.1);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Warble osc
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';

  // LFO 3 Hz warble between 650 and 900 Hz
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(3.5, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(125, now);
  osc.frequency.setValueAtTime(775, now);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, now);
  filter.Q.setValueAtTime(3.0, now);

  osc.connect(filter);
  filter.connect(master);

  osc.start(now);
  lfo.start(now);
  osc.stop(now + dur);
  lfo.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 50);

  return {
    stop(fade = 0.05): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * shutter_rumble: Heavy sliding mechanical/stone shutter rumble.
 */
export function playShutterRumble(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 2.2;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.38, now + 0.2);
  master.gain.setValueAtTime(0.38, now + dur - 0.3);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Brown noise rumble
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(120, now);
  lp.Q.setValueAtTime(3.0, now);

  // Sub drone
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(42, now);
  osc.frequency.linearRampToValueAtTime(38, now + dur);

  noise.connect(lp);
  lp.connect(master);
  osc.connect(master);

  noise.start(now);
  osc.start(now);
  noise.stop(now + dur);
  osc.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 50);

  return {
    stop(fade = 0.1): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * socket_clunk: Heavy metallic clunk with resonant ring (fuse insert).
 */
export function playSocketClunk(cx: MachineVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 0.55;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.32, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Low heavy thump
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(150, now);
  thump.frequency.exponentialRampToValueAtTime(42, now + 0.12);
  thump.connect(master);

  // Metallic ring
  const ring = ctx.createOscillator();
  ring.type = 'square';
  ring.frequency.setValueAtTime(680, now);
  const ringFilter = ctx.createBiquadFilter();
  ringFilter.type = 'bandpass';
  ringFilter.frequency.setValueAtTime(680, now);
  ringFilter.Q.setValueAtTime(8.0, now);
  ring.connect(ringFilter);
  ringFilter.connect(master);

  thump.start(now);
  ring.start(now);
  thump.stop(now + 0.2);
  ring.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 50);

  return {
    stop(fade = 0.05): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

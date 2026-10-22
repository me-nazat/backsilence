/* ── Interactables.ts ──────────────────────────────────────────────────────
 *  Procedural interactive sound cues: bronze bells, stone creaks,
 *  pebble clacks, flashlight switch, keypad buzz, and escape stinger.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';

export interface InteractVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/**
 * bell: Inharmonic partials at ratios 1, 2.76, 5.4, 8.93, 13.3
 * with decays 3.5 s to 0.4 s; pitch param for 4 distinct notes.
 */
export function playBell(cx: InteractVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 3.6;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.45, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // 4 bell base notes: 0 -> 330Hz (E4), 1 -> 392Hz (G4), 2 -> 440Hz (A4), 3 -> 523Hz (C5)
  const bellNotes = [330, 392, 440, 523];
  let baseFreq = 392;
  if (cx.pitch !== undefined) {
    const noteIdx = Math.round(cx.pitch);
    if (noteIdx >= 0 && noteIdx < bellNotes.length) {
      baseFreq = bellNotes[noteIdx] ?? 392;
    } else {
      baseFreq = cx.pitch > 20 ? cx.pitch : 392 * cx.pitch;
    }
  }

  // Ratios and decay times specified in prompt:
  // ratios: 1.0, 2.76, 5.4, 8.93, 13.3
  // decays: 3.5s to 0.4s
  const partials = [
    { ratio: 1.0, decay: 3.5, gain: 0.35 },
    { ratio: 2.76, decay: 2.4, gain: 0.22 },
    { ratio: 5.4, decay: 1.5, gain: 0.16 },
    { ratio: 8.93, decay: 0.8, gain: 0.10 },
    { ratio: 13.3, decay: 0.4, gain: 0.06 },
  ];

  const oscs: OscillatorNode[] = [];

  for (const p of partials) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * p.ratio, now);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(p.gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + p.decay + 0.05);
    oscs.push(osc);
  }

  // Initial strike transient (tiny noise burst)
  const strike = ctx.createBufferSource();
  strike.buffer = cx.noise.white;
  const strikeFilter = ctx.createBiquadFilter();
  strikeFilter.type = 'bandpass';
  strikeFilter.frequency.setValueAtTime(2200, now);
  const strikeGain = ctx.createGain();
  strikeGain.gain.setValueAtTime(0.2, now);
  strikeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  strike.connect(strikeFilter);
  strikeFilter.connect(strikeGain);
  strikeGain.connect(master);
  strike.start(now);
  strike.stop(now + 0.05);

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
 * stone_creak: Sliding grind (sinking marble platform warning).
 */
export function playStoneCreak(cx: InteractVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 1.4;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.32, now + 0.1);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Friction noise
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(450, now);
  bp.Q.setValueAtTime(3.5, now);

  const bpLfo = ctx.createOscillator();
  bpLfo.frequency.setValueAtTime(5.5, now);
  const bpLfoGain = ctx.createGain();
  bpLfoGain.gain.setValueAtTime(140, now);
  bpLfo.connect(bpLfoGain);
  bpLfoGain.connect(bp.frequency);

  noise.connect(bp);
  bp.connect(master);

  // Low rumble
  const sub = ctx.createOscillator();
  sub.type = 'sawtooth';
  sub.frequency.setValueAtTime(68, now);
  sub.frequency.linearRampToValueAtTime(52, now + dur);
  const subFilter = ctx.createBiquadFilter();
  subFilter.type = 'lowpass';
  subFilter.frequency.setValueAtTime(180, now);
  sub.connect(subFilter);
  subFilter.connect(master);

  noise.start(now);
  bpLfo.start(now);
  sub.start(now);
  noise.stop(now + dur);
  bpLfo.stop(now + dur);
  sub.stop(now + dur);

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
 * pebble_clack: Short stony tick (pebble landing on dry stone/marble).
 */
export function playPebbleClack(cx: InteractVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 0.12;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.38, now + 0.004);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // High resonant click
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1850, now);
  osc.frequency.exponentialRampToValueAtTime(450, now + 0.035);

  // Sharp noise transient
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(2200, now);

  osc.connect(master);
  noise.connect(hp);
  hp.connect(master);

  osc.start(now);
  noise.start(now);
  osc.stop(now + dur);
  noise.stop(now + 0.04);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 40);

  return {
    stop(fade = 0.02): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * flashlight_click: Mechanical tactile click.
 */
export function playFlashlightClick(cx: InteractVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 0.06;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.3, now + 0.003);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(950, now);
  osc.frequency.exponentialRampToValueAtTime(250, now + 0.03);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1200, now);
  filter.Q.setValueAtTime(3.0, now);

  osc.connect(filter);
  filter.connect(master);
  osc.start(now);
  osc.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 30);

  return {
    stop(): void { master.disconnect(); },
    setParam(): void {},
    ended,
  };
}

/**
 * keypad_buzz: Wrong code buzzer (harsh dual-saw error buzz).
 */
export function playKeypadBuzz(cx: InteractVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 0.45;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.38, now + 0.015);
  master.gain.setValueAtTime(0.38, now + dur - 0.05);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc2.type = 'sawtooth';
  osc1.frequency.setValueAtTime(140, now);
  osc2.frequency.setValueAtTime(147, now); // Dissonant beating

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, now);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(master);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + dur);
  osc2.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 40);

  return {
    stop(fade = 0.02): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * escaped: Soft synthesized chord stinger (peaceful, ethereal resolution, NO jumpscare).
 */
export function playEscaped(cx: InteractVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 4.0;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.35, now + 0.4);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Major 9th chord: F3 (174.6), C4 (261.6), E4 (329.6), G4 (392.0), A4 (440.0)
  const freqs = [174.61, 261.63, 329.63, 392.0, 440.0];

  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = i === 0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(f, now);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.3 + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur - 0.2);

    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + dur);
  });

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    master.disconnect();
    endedResolve();
  }, dur * 1000 + 50);

  return {
    stop(fade = 0.5): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

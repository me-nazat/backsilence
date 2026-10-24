/* ── UiSounds.ts ──────────────────────────────────────────────────────────
 *  Tactile UI audio cues: soft ticks, confirms, errors, keypad beeps, and door clunks.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';

export interface UiVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
}

/**
 * ui_hover: very soft 1.2 kHz tick (8 ms).
 */
export function playUiHover(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);
  g.gain.setValueAtTime(0.06, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);

  osc.connect(g);
  g.connect(cx.destination);
  osc.start(now);
  osc.stop(now + 0.015);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    g.disconnect();
    endedResolve();
  }, 30);

  return {
    stop(): void {
      g.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_click: short low-passed click plus gentle tone (22 ms).
 */
export function playUiClick(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(480, now);
  osc.frequency.exponentialRampToValueAtTime(240, now + 0.025);

  g.gain.setValueAtTime(0.22, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

  osc.connect(g);
  g.connect(cx.destination);
  osc.start(now);
  osc.stop(now + 0.03);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    g.disconnect();
    endedResolve();
  }, 45);

  return {
    stop(): void {
      g.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_confirm: two ascending soft sine tones, perfect fifth (C5 -> G5: 523.25 -> 783.99 Hz).
 */
export function playUiConfirm(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.18, now);
  voiceGain.connect(cx.destination);

  // Tone 1
  const osc1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523.25, now);
  g1.gain.setValueAtTime(0.7, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  osc1.connect(g1);
  g1.connect(voiceGain);
  osc1.start(now);
  osc1.stop(now + 0.1);

  // Tone 2 (offset 70ms, perfect fifth)
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(783.99, now + 0.07);
  g2.gain.setValueAtTime(0.7, now + 0.07);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc2.connect(g2);
  g2.connect(voiceGain);
  osc2.start(now + 0.07);
  osc2.stop(now + 0.25);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, 300);

  return {
    stop(): void {
      voiceGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_error: dull descending tone (280 -> 160 Hz).
 */
export function playUiError(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(280, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.2);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(450, now);

  g.gain.setValueAtTime(0.24, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(filter);
  filter.connect(g);
  g.connect(cx.destination);

  osc.start(now);
  osc.stop(now + 0.24);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    g.disconnect();
    endedResolve();
  }, 260);

  return {
    stop(): void {
      g.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * keypad_beep: clean 1.1 kHz square beep (75 ms).
 */
export function playKeypadBeep(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(1100, now);

  g.gain.setValueAtTime(0.12, now);
  g.gain.setValueAtTime(0.12, now + 0.065);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(g);
  g.connect(cx.destination);
  osc.start(now);
  osc.stop(now + 0.085);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    g.disconnect();
    endedResolve();
  }, 100);

  return {
    stop(): void {
      g.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * door_clunk: metallic clunk: noise burst plus 2 inharmonic sine partials with fast decay.
 */
export function playDoorClunk(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.55, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Metallic noise burst
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 3.5;
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(450, now + 0.12);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.7, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(voiceGain);
  noise.start(now);
  noise.stop(now + 0.14);

  // Inharmonic partial 1 (185 Hz)
  const p1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  p1.type = 'sine';
  p1.frequency.setValueAtTime(185, now);
  g1.gain.setValueAtTime(0.6, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  p1.connect(g1);
  g1.connect(voiceGain);
  p1.start(now);
  p1.stop(now + 0.24);

  // Inharmonic partial 2 (342 Hz)
  const p2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  p2.type = 'sine';
  p2.frequency.setValueAtTime(342, now);
  g2.gain.setValueAtTime(0.4, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  p2.connect(g2);
  g2.connect(voiceGain);
  p2.start(now);
  p2.stop(now + 0.18);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, 280);

  return {
    stop(): void {
      voiceGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Very soft tick used by the sound visualizer when ripples appear on-screen.
 */
export function playRippleTick(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(2600, now);
  osc.frequency.exponentialRampToValueAtTime(1400, now + 0.02);

  g.gain.setValueAtTime(0.06 * (cx.intensity ?? 1.0), now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

  osc.connect(g);
  g.connect(cx.destination);

  osc.start(now);
  osc.stop(now + 0.03);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    g.disconnect();
    endedResolve();
  }, 50);

  return {
    stop(): void {
      g.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_stamp: physical stamp thump (sub-bass drop 68 -> 32 Hz with soft paper impact).
 */
export function playUiStamp(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(68, now);
  osc.frequency.exponentialRampToValueAtTime(32, now + 0.15);

  g.gain.setValueAtTime(0.45 * (cx.intensity ?? 1.0), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  osc.connect(g);
  g.connect(cx.destination);
  g.connect(cx.reverbSend);

  osc.start(now);
  osc.stop(now + 0.2);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  setTimeout(() => { g.disconnect(); endedResolve(); }, 220);

  return {
    stop(): void { g.disconnect(); },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_achievement: bright twin bell chime with shimmering high overtone.
 */
export function playUiAchievement(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.25 * (cx.intensity ?? 1.0), now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // Twin bell notes: C6 (1046.5 Hz) and E6 (1318.5 Hz)
  const notes = [1046.5, 1318.5];
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = now + idx * 0.08;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(g);
    g.connect(voiceGain);
    osc.start(t);
    osc.stop(t + 0.48);
  });

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  setTimeout(() => { voiceGain.disconnect(); endedResolve(); }, 600);

  return {
    stop(): void { voiceGain.disconnect(); },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_countdown_tick: short high-contrast clock metronome tick (880 Hz, 14 ms).
 */
export function playUiCountdownTick(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  g.gain.setValueAtTime(0.18 * (cx.intensity ?? 1.0), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.016);

  osc.connect(g);
  g.connect(cx.destination);

  osc.start(now);
  osc.stop(now + 0.02);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  setTimeout(() => { g.disconnect(); endedResolve(); }, 35);

  return {
    stop(): void { g.disconnect(); },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_lobby_join: underwater acoustic sonar ping with warm resonance (587 Hz).
 */
export function playUiLobbyJoin(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(587.33, now); // D5
  g.gain.setValueAtTime(0.28 * (cx.intensity ?? 1.0), now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

  osc.connect(g);
  g.connect(cx.destination);
  g.connect(cx.reverbSend);

  osc.start(now);
  osc.stop(now + 0.65);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  setTimeout(() => { g.disconnect(); endedResolve(); }, 700);

  return {
    stop(): void { g.disconnect(); },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_ready: tactile mechanical latch toggle (two rapid pulses 35ms apart).
 */
export function playUiReady(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.35 * (cx.intensity ?? 1.0), now);
  voiceGain.connect(cx.destination);

  [0, 0.038].forEach((offset) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = now + offset;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(340, t + 0.025);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(g);
    g.connect(voiceGain);
    osc.start(t);
    osc.stop(t + 0.035);
  });

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  setTimeout(() => { voiceGain.disconnect(); endedResolve(); }, 120);

  return {
    stop(): void { voiceGain.disconnect(); },
    setParam(): void {},
    ended,
  };
}

/**
 * ui_rank_up: ascending 4-note arpeggio (C5 -> E5 -> G5 -> C6).
 */
export function playUiRankUp(cx: UiVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.24 * (cx.intensity ?? 1.0), now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const arpeggio = [523.25, 659.25, 783.99, 1046.5];
  arpeggio.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = now + idx * 0.07;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g);
    g.connect(voiceGain);
    osc.start(t);
    osc.stop(t + 0.3);
  });

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  setTimeout(() => { voiceGain.disconnect(); endedResolve(); }, 600);

  return {
    stop(): void { voiceGain.disconnect(); },
    setParam(): void {},
    ended,
  };
}

/**
 * results_stinger: rank-specific musical stinger.
 * S: bright and open pentatonic major 9th with poolroom reverb.
 * D: low, thin, detuned minor second with dry muffle.
 */
export function playResultsStinger(cx: UiVoiceContext & { rank?: string }): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.3 * (cx.intensity ?? 1.0), now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const rank = (cx.rank ?? 'A').toUpperCase();

  if (rank === 'S' || rank === 'A') {
    // S / A: Bright, resonant, open major 9th chord (C5, G5, D6, E6)
    const notes = [523.25, 783.99, 1174.66, 1318.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + i * 0.06;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(g);
      g.connect(voiceGain);
      osc.start(t);
      osc.stop(t + 0.95);
    });
  } else if (rank === 'D') {
    // D: Low, thin, detuned dissonance (98 Hz vs 103 Hz minor 2nd)
    const notes = [98.0, 103.8];
    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(220, now);
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(lp);
      lp.connect(g);
      g.connect(voiceGain);
      osc.start(now);
      osc.stop(now + 0.75);
    });
  } else {
    // B / C: Neutral descending fifth (F5 -> Bb4)
    const notes = [698.46, 466.16];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + i * 0.12;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(g);
      g.connect(voiceGain);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });
  setTimeout(() => { voiceGain.disconnect(); endedResolve(); }, 1100);

  return {
    stop(): void { voiceGain.disconnect(); },
    setParam(): void {},
    ended,
  };
}


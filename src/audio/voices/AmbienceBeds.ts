/* ── AmbienceBeds.ts ──────────────────────────────────────────────────────
 *  Per-map procedural ambient loops and distant monster vocalizations:
 *  utility tunnels, marble atrium, hydro-filtration, and abyssal drainage.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';

export interface BedVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  intensity?: number;
}

/**
 * ambience_tunnels: Enclosed echoing utility tunnel drone.
 */
export function playAmbienceTunnels(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.3, now + 1.5);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Warm metallic resonant hum (60 Hz + 180 Hz)
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc2.type = 'sine';
  osc1.frequency.setValueAtTime(60, now);
  osc2.frequency.setValueAtTime(180, now);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(220, now);
  lp.Q.setValueAtTime(0.707, now);
  osc1.connect(lp);
  osc2.connect(lp);
  lp.connect(master);

  // Pipe hiss loop
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(600, now);
  bp.Q.setValueAtTime(1.2, now);
  noise.connect(bp);
  bp.connect(master);

  osc1.start(now);
  osc2.start(now);
  noise.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 1.0): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          noise.stop();
          master.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000 + 40);
    },
    setParam(name: string, val: number): void {
      if (name === 'volume') {
        master.gain.linearRampToValueAtTime(Math.max(0, val), ctx.currentTime + 0.1);
      }
    },
    ended,
  };
}

/**
 * ambience_atrium: Vast, airy, high-ceiling marble atrium drone with gentle shimmer.
 */
export function playAmbienceAtrium(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.26, now + 2.0);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Airy choral drone (root + fifth: 110 Hz and 165 Hz)
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc2.type = 'sine';
  osc1.frequency.setValueAtTime(110, now);
  osc2.frequency.setValueAtTime(165, now);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(380, now);
  bp.Q.setValueAtTime(1.5, now);

  osc1.connect(bp);
  osc2.connect(bp);
  bp.connect(master);

  // High shimmer air
  const air = ctx.createBufferSource();
  air.buffer = cx.noise.pink;
  air.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = 'bandpass';
  airFilter.frequency.setValueAtTime(2400, now);
  airFilter.Q.setValueAtTime(4.0, now);
  air.connect(airFilter);
  airFilter.connect(master);

  osc1.start(now);
  osc2.start(now);
  air.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 1.0): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          air.stop();
          master.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000 + 40);
    },
    setParam(name: string, val: number): void {
      if (name === 'volume') {
        master.gain.linearRampToValueAtTime(Math.max(0, val), ctx.currentTime + 0.1);
      }
    },
    ended,
  };
}

/**
 * ambience_filtration: Heavy industrial filtration hall pump and water-churn loop.
 */
export function playAmbienceFiltration(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.32, now + 1.5);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Pump pulsation (45 Hz motor + 2 Hz amplitude tremolo)
  const pump = ctx.createOscillator();
  pump.type = 'triangle';
  pump.frequency.setValueAtTime(45, now);

  const pumpLfo = ctx.createOscillator();
  pumpLfo.frequency.setValueAtTime(2.0, now);
  const pumpLfoGain = ctx.createGain();
  pumpLfoGain.gain.setValueAtTime(0.3, now);
  pumpLfo.connect(pumpLfoGain);

  const pumpGain = ctx.createGain();
  pumpGain.gain.setValueAtTime(0.3, now);
  pumpLfoGain.connect(pumpGain.gain);

  const pumpLp = ctx.createBiquadFilter();
  pumpLp.type = 'lowpass';
  pumpLp.frequency.setValueAtTime(160, now);

  pump.connect(pumpLp);
  pumpLp.connect(pumpGain);
  pumpGain.connect(master);

  // Continuous churning water band
  const water = ctx.createBufferSource();
  water.buffer = cx.noise.pink;
  water.loop = true;
  const waterFilter = ctx.createBiquadFilter();
  waterFilter.type = 'bandpass';
  waterFilter.frequency.setValueAtTime(480, now);
  waterFilter.Q.setValueAtTime(1.8, now);
  water.connect(waterFilter);
  waterFilter.connect(master);

  pump.start(now);
  pumpLfo.start(now);
  water.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 1.0): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          pump.stop();
          pumpLfo.stop();
          water.stop();
          master.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000 + 40);
    },
    setParam(name: string, val: number): void {
      if (name === 'volume') {
        master.gain.linearRampToValueAtTime(Math.max(0, val), ctx.currentTime + 0.1);
      }
    },
    ended,
  };
}

/**
 * ambience_drain: Subterranean abyssal drainage core drone: sub-bass rumble (32 Hz) + void wind.
 */
export function playAmbienceDrain(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.35, now + 2.0);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Infrasonic sub drone (32 Hz)
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(32, now);

  const subLp = ctx.createBiquadFilter();
  subLp.type = 'lowpass';
  subLp.frequency.setValueAtTime(80, now);
  sub.connect(subLp);
  subLp.connect(master);

  // Cavernous void wind
  const wind = ctx.createBufferSource();
  wind.buffer = cx.noise.pink;
  wind.loop = true;

  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.setValueAtTime(190, now);
  windFilter.Q.setValueAtTime(2.5, now);

  const windLfo = ctx.createOscillator();
  windLfo.frequency.setValueAtTime(0.06, now); // Very slow swell
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.setValueAtTime(70, now);
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windFilter.frequency);

  wind.connect(windFilter);
  windFilter.connect(master);

  sub.start(now);
  wind.start(now);
  windLfo.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  return {
    stop(fade = 1.0): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          sub.stop();
          wind.stop();
          windLfo.stop();
          master.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000 + 40);
    },
    setParam(name: string, val: number): void {
      if (name === 'volume') {
        master.gain.linearRampToValueAtTime(Math.max(0, val), ctx.currentTime + 0.1);
      }
    },
    ended,
  };
}

/**
 * monster_ambient_far: Very distant moan used by the ambience director when a monster is unseen.
 */
export function playMonsterAmbientFar(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 3.2;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.28, now + 0.8);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  // Heavy reverb send for cavernous distance
  master.connect(cx.reverbSend);

  // Formant-filtered moan
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(62, now);
  osc.frequency.linearRampToValueAtTime(54, now + dur * 0.6);
  osc.frequency.linearRampToValueAtTime(48, now + dur);

  // Vibrato
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(4.2, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(3.5, now);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  // Deep muffled lowpass
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(260, now);
  lp.Q.setValueAtTime(3.0, now);

  osc.connect(lp);
  lp.connect(master);

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
    stop(fade = 0.2): void {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    },
    setParam(): void {},
    ended,
  };
}

/**
 * sparse_pipe_clank: Metallic resonant pipe knock with pool reverberation.
 */
export function playSparsePipeClank(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 1.4;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.28, now + 0.003);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sine';
  osc2.type = 'sine';
  osc1.frequency.setValueAtTime(820, now);
  osc2.frequency.setValueAtTime(1640, now);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1200, now);
  filter.Q.setValueAtTime(5.0, now);

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
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    endedResolve();
  }, dur * 1000 + 40);

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
 * sparse_metal_creak: Resonant friction creak from shifting submerged metal beam.
 */
export function playSparseMetalCreak(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 2.2;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.22, now + 0.06);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc2.type = 'triangle';
  osc1.frequency.setValueAtTime(220, now);
  osc2.frequency.setValueAtTime(225, now);

  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(4.5, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(6.0, now);
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(680, now);
  filter.Q.setValueAtTime(3.5, now);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(master);

  osc1.start(now);
  osc2.start(now);
  lfo.start(now);
  osc1.stop(now + dur);
  osc2.stop(now + dur);
  lfo.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    endedResolve();
  }, dur * 1000 + 40);

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
 * sparse_steam_hiss: Sudden short valve steam release with pool echo.
 */
export function playSparseSteamHiss(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 1.6;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.20, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2600, now);
  filter.Q.setValueAtTime(2.2, now);

  noise.connect(filter);
  filter.connect(master);

  noise.start(now);
  noise.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    endedResolve();
  }, dur * 1000 + 40);

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
 * sparse_electrical_crackle: Fluorescent tube starter buzz and high-voltage arc.
 */
export function playSparseElectricalCrackle(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 0.9;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.24, now + 0.01);
  master.gain.setValueAtTime(0.04, now + 0.08);
  master.gain.linearRampToValueAtTime(0.22, now + 0.12);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.setValueAtTime(120, now);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(3200, now);
  filter.Q.setValueAtTime(3.8, now);

  saw.connect(filter);
  noise.connect(filter);
  filter.connect(master);

  saw.start(now);
  noise.start(now);
  saw.stop(now + dur);
  noise.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    endedResolve();
  }, dur * 1000 + 40);

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
 * sparse_sub_shudder: Subterranean structural low-frequency tectonic shudder.
 */
export function playSparseSubShudder(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 2.8;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.32, now + 0.4);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(38, now);
  sub.frequency.linearRampToValueAtTime(24, now + dur);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(75, now);
  filter.Q.setValueAtTime(1.5, now);

  sub.connect(filter);
  filter.connect(master);

  sub.start(now);
  sub.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    endedResolve();
  }, dur * 1000 + 40);

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
 * sparse_water_surge: Sudden underwater gush and displacement surge through drains.
 */
export function playSparseWaterSurge(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 3.0;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.26, now + 0.8);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(180, now);
  filter.frequency.linearRampToValueAtTime(460, now + 1.0);
  filter.frequency.linearRampToValueAtTime(200, now + dur);
  filter.Q.setValueAtTime(2.0, now);

  noise.connect(filter);
  filter.connect(master);

  noise.start(now);
  noise.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    endedResolve();
  }, dur * 1000 + 40);

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
 * sparse_cavern_draft: Eerie hollow resonant air draft through vaulted arches.
 */
export function playSparseCavernDraft(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 3.6;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.22, now + 1.2);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;

  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.setValueAtTime(320, now);
  bp1.Q.setValueAtTime(3.0, now);

  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.frequency.setValueAtTime(640, now);
  bp2.Q.setValueAtTime(2.5, now);

  noise.connect(bp1);
  noise.connect(bp2);
  bp1.connect(master);
  bp2.connect(master);

  noise.start(now);
  noise.stop(now + dur);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    endedResolve();
  }, dur * 1000 + 40);

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
 * sparse_pebble_fall: Tile and mineral debris falling from ceiling into pool.
 */
export function playSparsePebbleFall(cx: BedVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const dur = 1.8;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.24, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(cx.destination);
  master.connect(cx.reverbSend);

  // Ping 1
  const osc1 = ctx.createOscillator();
  osc1.frequency.setValueAtTime(2100, now);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.2, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc1.connect(g1);
  g1.connect(master);
  osc1.start(now);
  osc1.stop(now + 0.05);

  // Ping 2 at 80ms
  const osc2 = ctx.createOscillator();
  osc2.frequency.setValueAtTime(2800, now + 0.08);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.001, now);
  g2.gain.setValueAtTime(0.18, now + 0.08);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  osc2.connect(g2);
  g2.connect(master);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.15);

  // Splash drop at 0.32s
  const drop = ctx.createOscillator();
  drop.frequency.setValueAtTime(1450, now + 0.32);
  drop.frequency.linearRampToValueAtTime(1600, now + 0.37);
  const gDrop = ctx.createGain();
  gDrop.gain.setValueAtTime(0.001, now);
  gDrop.gain.setValueAtTime(0.22, now + 0.32);
  gDrop.gain.exponentialRampToValueAtTime(0.001, now + 0.39);
  drop.connect(gDrop);
  gDrop.connect(master);
  drop.start(now + 0.32);
  drop.stop(now + 0.40);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    endedResolve();
  }, dur * 1000 + 40);

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

/* ── Loops.ts ─────────────────────────────────────────────────────────────
 *  Procedural looping ambient soundscapes: water lapping, electrical pump hum,
 *  and tension-responsive subterranean synth drone.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';

export interface LoopVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
}

/**
 * Water lapping loop: pink noise through two slow-LFO modulated bandpasses.
 */
export function playLapLoop(cx: LoopVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.28, now + 1.0);
  masterGain.connect(cx.destination);
  masterGain.connect(cx.reverbSend);

  // Pink noise source
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.pink;
  noise.loop = true;

  // Filter 1 (~600 Hz with 0.07 Hz LFO)
  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.Q.value = 2.0;
  bp1.frequency.setValueAtTime(600, now);

  const lfo1 = ctx.createOscillator();
  const lfo1Gain = ctx.createGain();
  lfo1.type = 'sine';
  lfo1.frequency.setValueAtTime(0.07, now);
  lfo1Gain.gain.setValueAtTime(180, now);
  lfo1.connect(lfo1Gain);
  lfo1Gain.connect(bp1.frequency);

  // Filter 2 (~1400 Hz with 0.11 Hz LFO)
  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.Q.value = 2.5;
  bp2.frequency.setValueAtTime(1400, now);

  const lfo2 = ctx.createOscillator();
  const lfo2Gain = ctx.createGain();
  lfo2.type = 'sine';
  lfo2.frequency.setValueAtTime(0.11, now);
  lfo2Gain.gain.setValueAtTime(320, now);
  lfo2.connect(lfo2Gain);
  lfo2Gain.connect(bp2.frequency);

  noise.connect(bp1);
  noise.connect(bp2);
  bp1.connect(masterGain);
  bp2.connect(masterGain);

  noise.start(now);
  lfo1.start(now);
  lfo2.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  return {
    stop(fade = 1.0): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          noise.stop();
          lfo1.stop();
          lfo2.stop();
          masterGain.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000);
    },
    setParam(name: string, v: number): void {
      if (name === 'volume') {
        masterGain.gain.linearRampToValueAtTime(Math.max(0, v), ctx.currentTime + 0.1);
      }
    },
    ended,
  };
}

/**
 * Pool-room electrical / pump hum loop:
 * 60 Hz + 120 Hz + 180 Hz sines with beat detuning, 2.4 kHz buzz, and filtered noise floor.
 */
export function playHumLoop(cx: LoopVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.22, now + 1.2);
  masterGain.connect(cx.destination);

  // Fundamental 60 Hz + harmonics with slow detuning
  const oscs: OscillatorNode[] = [];
  const harmonics = [
    { freq: 60.0, gain: 0.5 },
    { freq: 60.35, gain: 0.35 }, // Beat detune
    { freq: 120.0, gain: 0.25 },
    { freq: 180.0, gain: 0.12 },
  ];

  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(h.freq, now);
    g.gain.setValueAtTime(h.gain, now);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    oscs.push(osc);
  }

  // Faint 2.4 kHz buzz
  const buzz = ctx.createOscillator();
  const buzzFilter = ctx.createBiquadFilter();
  const buzzGain = ctx.createGain();
  buzz.type = 'sawtooth';
  buzz.frequency.setValueAtTime(2400, now);
  buzzFilter.type = 'bandpass';
  buzzFilter.Q.value = 12.0;
  buzzFilter.frequency.setValueAtTime(2400, now);
  buzzGain.gain.setValueAtTime(0.02, now);

  buzz.connect(buzzFilter);
  buzzFilter.connect(buzzGain);
  buzzGain.connect(masterGain);
  buzz.start(now);
  oscs.push(buzz);

  // Filtered noise floor
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.brown;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(280, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.08, now);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  return {
    stop(fade = 1.0): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          for (const o of oscs) o.stop();
          noise.stop();
          masterGain.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000);
    },
    setParam(name: string, v: number): void {
      if (name === 'flicker') {
        // Brief 0.4s dip for light flicker
        const t = ctx.currentTime;
        masterGain.gain.setValueAtTime(masterGain.gain.value, t);
        masterGain.gain.linearRampToValueAtTime(masterGain.gain.value * 0.3, t + 0.05);
        masterGain.gain.linearRampToValueAtTime(0.22, t + 0.4);
      } else if (name === 'volume') {
        masterGain.gain.linearRampToValueAtTime(Math.max(0, v), ctx.currentTime + 0.1);
      }
    },
    ended,
  };
}

/**
 * Subterranean horror drone loop:
 * Pad of 3 detuned saws (A1 = 55 Hz, E2 = 82.5 Hz, A2 = 110 Hz) -> lowpass at ~400 Hz.
 * Gain rises with tension.
 */
export function playDroneLoop(cx: LoopVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  // Starts at audible atmospheric baseline (0.08), dynamically driven up to 0.4 by AudioDirector tension
  masterGain.gain.setValueAtTime(0.08, now);
  masterGain.connect(cx.destination);
  masterGain.connect(cx.reverbSend);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2.0;
  filter.frequency.setValueAtTime(320, now);

  // 0.03 Hz LFO sweeping cutoff between 250 and 600 Hz
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.03, now);
  lfoGain.gain.setValueAtTime(180, now);
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start(now);

  filter.connect(masterGain);

  const oscs: OscillatorNode[] = [];
  const dronePitches = [55.0, 55.4, 82.5, 110.2];

  for (const freq of dronePitches) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.2, now);

    osc.connect(g);
    g.connect(filter);
    osc.start(now);
    oscs.push(osc);
  }

  let isPlaying = true;
  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  return {
    stop(fade = 1.0): void {
      if (!isPlaying) return;
      isPlaying = false;
      const t = ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try {
          for (const o of oscs) o.stop();
          lfo.stop();
          masterGain.disconnect();
        } catch {
          /* ignore cleanup errors */
        }
        endedResolve();
      }, fade * 1000);
    },
    setParam(name: string, v: number): void {
      if (name === 'tension') {
        const tension = Math.max(0.0, Math.min(1.0, v));
        const targetVol = 0.03 + tension * 0.42;
        masterGain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.2);
      }
    },
    ended,
  };
}

/* ── WispSounds.ts ────────────────────────────────────────────────────────
 *  Procedural Web Audio voices for ambient flying fauna (flying skulls):
 *  - wisp_wail: distant eerie formant wail with pitch bend (non-diegetic atmosphere)
 *  - wisp_wingbeat: soft low-frequency whoosh of bone wings slicing humid air
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';

export interface WispVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise?: NoiseBuffers;
  intensity?: number;
  pitch?: number;
  seed?: number;
}

/** Play distant eerie formant wail (1.8s) */
export function playWispWail(cx: WispVoiceContext): RawVoiceHandle {
  const ac = cx.ctx;
  const now = ac.currentTime;

  const osc1 = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();

  osc1.type = 'sawtooth';
  osc2.type = 'sine';

  const basePitch = (cx.pitch ?? 1.0) * 520;
  osc1.frequency.setValueAtTime(basePitch, now);
  osc1.frequency.exponentialRampToValueAtTime(basePitch * 0.78, now + 1.6);
  osc2.frequency.setValueAtTime(basePitch + 4, now);
  osc2.frequency.exponentialRampToValueAtTime((basePitch + 4) * 0.78, now + 1.6);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(650, now);
  filter.Q.setValueAtTime(4.5, now);

  const targetGain = (cx.intensity ?? 1.0) * 0.18;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(targetGain, now + 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(cx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 1.85);
  osc2.stop(now + 1.85);

  return {
    stop: () => {
      try {
        osc1.stop();
        osc2.stop();
      } catch {
        /* ignore already stopped */
      }
    },
    setParam: () => {},
    ended: new Promise((resolve) => {
      setTimeout(resolve, 1900);
    }),
  };
}

/** Play soft low-frequency bone wingbeat whoosh (0.45s) */
export function playWispWingbeat(cx: WispVoiceContext): RawVoiceHandle {
  const ac = cx.ctx;
  const now = ac.currentTime;

  // Synthesize soft wing noise buffer
  const sampleRate = ac.sampleRate;
  const bufferSize = Math.floor(sampleRate * 0.45);
  const buffer = ac.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
  }

  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(180, now);
  filter.frequency.exponentialRampToValueAtTime(75, now + 0.45);

  const gain = ac.createGain();
  const targetGain = (cx.intensity ?? 1.0) * 0.22;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(targetGain, now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(cx.destination);

  noise.start(now);

  return {
    stop: () => {
      try {
        noise.stop();
      } catch {
        /* ignore already stopped */
      }
    },
    setParam: () => {},
    ended: new Promise((resolve) => {
      setTimeout(resolve, 500);
    }),
  };
}

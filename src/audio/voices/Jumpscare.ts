/* ── Jumpscare.ts ─────────────────────────────────────────────────────────
 *  Climax horror audio: Jumpscare compound shock stinger with tinnitus aftermath,
 *  and tension-driven physiological heartbeat ("lub-dub").
 * ──────────────────────────────────────────────────────────────────────── */

import type { VoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import type { Mixer } from '../Mixer.js';

export interface JumpscareVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  mixer?: Mixer;
}

/**
 * Jumpscare stinger: Shriek + semitone cluster + sub boom + noise burst + tinnitus aftermath.
 */
export function playJumpscare(cx: JumpscareVoiceContext): VoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  // Duck other audio buses immediately for maximum shock impact
  if (cx.mixer) {
    cx.mixer.duck('ambient', 0.05, 0.01, 1.4);
    cx.mixer.duck('sfx', 0.1, 0.01, 1.4);
  }

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.26, now);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  // 1. Distorted shriek: sawtooth 900 -> 1600 Hz with fast vibrato
  const shriek = ctx.createOscillator();
  shriek.type = 'sawtooth';
  shriek.frequency.setValueAtTime(900, now);
  shriek.frequency.exponentialRampToValueAtTime(1600, now + 0.35);

  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  vibrato.frequency.setValueAtTime(32, now); // 32 Hz fast vibrato
  vibratoGain.gain.setValueAtTime(75, now);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(shriek.frequency);

  const shriekGain = ctx.createGain();
  shriekGain.gain.setValueAtTime(0.85, now);
  shriekGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

  shriek.connect(shriekGain);
  shriekGain.connect(voiceGain);

  shriek.start(now);
  vibrato.start(now);
  shriek.stop(now + 0.9);
  vibrato.stop(now + 0.9);

  // 2. Dissonant cluster (311 Hz Eb4, 330 Hz E4, 349 Hz F4)
  const clusterFreqs = [311.13, 329.63, 349.23];
  for (const f of clusterFreqs) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    osc.connect(g);
    g.connect(voiceGain);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  // 3. Sub boom: sine 45 -> 30 Hz (600 ms)
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(45, now);
  sub.frequency.exponentialRampToValueAtTime(25, now + 0.6);
  subGain.gain.setValueAtTime(0.9, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  sub.connect(subGain);
  subGain.connect(voiceGain);
  sub.start(now);
  sub.stop(now + 0.65);

  // 4. Full-spectrum noise burst (white noise)
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.9, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  noise.connect(noiseGain);
  noiseGain.connect(voiceGain);
  noise.start(now);
  noise.stop(now + 0.45);

  // 5. Ringing tinnitus aftermath (sine 7 kHz fading over 2.2 s)
  const tinnitus = ctx.createOscillator();
  const tinnitusGain = ctx.createGain();
  tinnitus.type = 'sine';
  tinnitus.frequency.setValueAtTime(7000, now + 0.2);
  tinnitusGain.gain.setValueAtTime(0.001, now + 0.2);
  tinnitusGain.gain.linearRampToValueAtTime(0.22, now + 0.35);
  tinnitusGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

  tinnitus.connect(tinnitusGain);
  tinnitusGain.connect(cx.destination);
  tinnitus.start(now + 0.2);
  tinnitus.stop(now + 2.6);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    tinnitusGain.disconnect();
    endedResolve();
  }, 2700);

  return {
    stop(): void {
      voiceGain.disconnect();
      tinnitusGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Single heartbeat double-thump ("lub-dub"):
 * Two filtered 60 Hz sine/noise hits spaced 140 ms apart.
 */
export function playHeartbeat(cx: JumpscareVoiceContext): VoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.75, now);
  voiceGain.connect(cx.destination);

  // Hit 1: Lub (at t = 0)
  // Hit 2: Dub (at t = 140ms)
  const hits = [0.0, 0.14];
  for (let h = 0; h < 2; h++) {
    const onset = hits[h]!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now + onset);
    osc.frequency.exponentialRampToValueAtTime(35, now + onset + 0.08);

    g.gain.setValueAtTime(h === 0 ? 0.8 : 0.65, now + onset);
    g.gain.exponentialRampToValueAtTime(0.001, now + onset + 0.09);

    osc.connect(g);
    g.connect(voiceGain);

    osc.start(now + onset);
    osc.stop(now + onset + 0.1);
  }

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => {
    endedResolve = r;
  });

  setTimeout(() => {
    voiceGain.disconnect();
    endedResolve();
  }, 320);

  return {
    stop(): void {
      voiceGain.disconnect();
    },
    setParam(): void {},
    ended,
  };
}

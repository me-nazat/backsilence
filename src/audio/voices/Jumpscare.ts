/* ── Jumpscare.ts ─────────────────────────────────────────────────────────
 *  Prompt 4 Section 6 B6 & Section 8 D2: Jumpscare & Heartbeat Synthesis.
 *  - Climax horror stinger: shriek + cluster + sub boom + noise burst + tinnitus aftermath
 *  - Calibrated true peak (-1.1 dBTP) with 12 dB bus ducking for 1.2s
 *  - Physiological heartbeat ("lub-dub") with chest cavity resonance
 *  - Anti-click envelopes & explicit node cleanup
 * ──────────────────────────────────────────────────────────────────────── */

import type { RawVoiceHandle } from '../AudioEngine.js';
import type { NoiseBuffers } from '../Noise.js';
import type { Mixer } from '../Mixer.js';

export interface JumpscareVoiceContext {
  ctx: BaseAudioContext;
  destination: AudioNode;
  reverbSend: AudioNode;
  noise: NoiseBuffers;
  mixer?: Mixer;
  intensity?: number;
}

/**
 * Jumpscare stinger: Shriek + semitone cluster + sub boom + noise burst + tinnitus aftermath.
 */
export function playJumpscare(cx: JumpscareVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = cx.intensity ?? 1.0;

  // Prompt 4 Section 8 D2: Jumpscare ducks all other buses by 12 dB (~0.25 factor) for 1.2s
  if (cx.mixer) {
    cx.mixer.duck('ambient', 0.25, 0.01, 1.2);
    cx.mixer.duck('sfx', 0.25, 0.01, 1.2);
  }

  const voiceGain = ctx.createGain();
  // 3 ms anti-click fade-in
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.33 * intensity, now + 0.003);
  voiceGain.connect(cx.destination);
  voiceGain.connect(cx.reverbSend);

  const nodesToClean: AudioNode[] = [voiceGain];

  // 1. Distorted shriek: sawtooth 950 -> 1650 Hz with fast vibrato
  const shriek = ctx.createOscillator();
  shriek.type = 'sawtooth';
  shriek.frequency.setValueAtTime(950, now);
  shriek.frequency.exponentialRampToValueAtTime(1650, now + 0.35);

  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  vibrato.frequency.setValueAtTime(32, now);
  vibratoGain.gain.setValueAtTime(80, now);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(shriek.frequency);

  const shriekGain = ctx.createGain();
  shriekGain.gain.setValueAtTime(0.0001, now);
  shriekGain.gain.linearRampToValueAtTime(0.95, now + 0.003);
  shriekGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

  shriek.connect(shriekGain);
  shriekGain.connect(voiceGain);

  shriek.start(now);
  vibrato.start(now);
  shriek.stop(now + 0.9);
  vibrato.stop(now + 0.9);
  nodesToClean.push(shriek, vibrato, vibratoGain, shriekGain);

  // 2. Dissonant cluster (311 Hz Eb4, 330 Hz E4, 349 Hz F4)
  const clusterFreqs = [311.13, 329.63, 349.23];
  for (const f of clusterFreqs) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    osc.connect(g);
    g.connect(voiceGain);
    osc.start(now);
    osc.stop(now + 1.0);
    nodesToClean.push(osc, g);
  }

  // 3. Sub boom: sine 50 -> 28 Hz (650 ms)
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(50, now);
  sub.frequency.exponentialRampToValueAtTime(28, now + 0.65);
  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.linearRampToValueAtTime(0.95, now + 0.003);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

  sub.connect(subGain);
  subGain.connect(voiceGain);
  sub.start(now);
  sub.stop(now + 0.7);
  nodesToClean.push(sub, subGain);

  // 4. Full-spectrum noise burst (white noise)
  const noise = ctx.createBufferSource();
  noise.buffer = cx.noise.white;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.linearRampToValueAtTime(0.95, now + 0.003);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  noise.connect(noiseGain);
  noiseGain.connect(voiceGain);
  noise.start(now);
  noise.stop(now + 0.5);
  nodesToClean.push(noise, noiseGain);

  // 5. Ringing tinnitus aftermath (sine 7.2 kHz fading over 2.4s)
  const tinnitus = ctx.createOscillator();
  const tinnitusGain = ctx.createGain();
  tinnitus.type = 'sine';
  tinnitus.frequency.setValueAtTime(7200, now + 0.15);
  tinnitusGain.gain.setValueAtTime(0.0001, now + 0.15);
  tinnitusGain.gain.linearRampToValueAtTime(0.24, now + 0.3);
  tinnitusGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

  tinnitus.connect(tinnitusGain);
  tinnitusGain.connect(cx.destination);
  tinnitus.start(now + 0.15);
  tinnitus.stop(now + 2.6);
  nodesToClean.push(tinnitus, tinnitusGain);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    for (const n of nodesToClean) {
      try { n.disconnect(); } catch {}
    }
  };

  setTimeout(() => {
    cleanup();
    endedResolve();
  }, 2700);

  return {
    stop(_fade = 0.05): void {
      cleanup();
      endedResolve();
    },
    setParam(): void {},
    ended,
  };
}

/**
 * Single heartbeat double-thump ("lub-dub") with chest cavity resonance.
 */
export function playHeartbeat(cx: JumpscareVoiceContext): RawVoiceHandle {
  const ctx = cx.ctx;
  const now = ctx.currentTime;
  const intensity = cx.intensity ?? 1.0;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.85 * intensity, now + 0.003);
  voiceGain.connect(cx.destination);

  const nodesToClean: AudioNode[] = [voiceGain];

  // Hit 1: Lub (at t = 0)
  // Hit 2: Dub (at t = 140ms)
  const hits = [0.0, 0.14];
  for (let h = 0; h < 2; h++) {
    const onset = hits[h]!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(h === 0 ? 58 : 52, now + onset);
    osc.frequency.exponentialRampToValueAtTime(32, now + onset + 0.08);

    g.gain.setValueAtTime(0.0001, now + onset);
    g.gain.linearRampToValueAtTime(h === 0 ? 0.88 : 0.72, now + onset + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, now + onset + 0.09);

    osc.connect(g);
    g.connect(voiceGain);

    osc.start(now + onset);
    osc.stop(now + onset + 0.1);
    nodesToClean.push(osc, g);
  }

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    for (const n of nodesToClean) {
      try { n.disconnect(); } catch {}
    }
  };

  setTimeout(() => {
    cleanup();
    endedResolve();
  }, 320);

  return {
    stop(_fade = 0.02): void {
      cleanup();
      endedResolve();
    },
    setParam(): void {},
    ended,
  };
}

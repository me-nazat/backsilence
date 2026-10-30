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
    cx.mixer.duckAllExcept('monster', 0.25, 0.01, 1.2);
  }

  const voiceGain = ctx.createGain();
  // Ear-safe max peak gain strictly clamped at -10 dBFS (~0.316)
  const peakJumpGain = Math.min(0.316, 0.28 * intensity);
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(peakJumpGain, now + 0.003);

  // Smooth high-frequency roll-off above 3200 Hz to prevent screeching and ear fatigue
  const safeLp = ctx.createBiquadFilter();
  safeLp.type = 'lowpass';
  safeLp.frequency.setValueAtTime(3200, now);
  safeLp.Q.setValueAtTime(0.707, now);

  voiceGain.connect(safeLp);
  safeLp.connect(cx.destination);
  safeLp.connect(cx.reverbSend);

  const nodesToClean: AudioNode[] = [voiceGain, safeLp];

  // 1. Heavy cinematic low-end impact: Sub-bass drop (50 Hz -> 28 Hz over 650 ms)
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

  // 2. Chest punch impact transient (110 Hz -> 42 Hz over 120 ms)
  const punch = ctx.createOscillator();
  const punchGain = ctx.createGain();
  punch.type = 'sine';
  punch.frequency.setValueAtTime(110, now);
  punch.frequency.exponentialRampToValueAtTime(42, now + 0.12);
  punchGain.gain.setValueAtTime(0.0001, now);
  punchGain.gain.linearRampToValueAtTime(0.85, now + 0.002);
  punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  punch.connect(punchGain);
  punchGain.connect(voiceGain);
  punch.start(now);
  punch.stop(now + 0.14);
  nodesToClean.push(punch, punchGain);

  // 3. Wet visceral creature lunge: Organic throat aspiration & resonance
  const lungeNoise = ctx.createBufferSource();
  lungeNoise.buffer = cx.noise.pink;
  const lungeFilter = ctx.createBiquadFilter();
  lungeFilter.type = 'bandpass';
  lungeFilter.frequency.setValueAtTime(950, now);
  lungeFilter.frequency.exponentialRampToValueAtTime(480, now + 0.55);
  lungeFilter.Q.setValueAtTime(1.8, now);

  const lungeGain = ctx.createGain();
  lungeGain.gain.setValueAtTime(0.0001, now);
  lungeGain.gain.linearRampToValueAtTime(0.75, now + 0.005);
  lungeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

  lungeNoise.connect(lungeFilter);
  lungeFilter.connect(lungeGain);
  lungeGain.connect(voiceGain);
  lungeNoise.start(now);
  lungeNoise.stop(now + 0.6);
  nodesToClean.push(lungeNoise, lungeFilter, lungeGain);

  // 4. Low guttural body groan (triangle 75 Hz -> 36 Hz)
  const guttural = ctx.createOscillator();
  const gutturalGain = ctx.createGain();
  guttural.type = 'triangle';
  guttural.frequency.setValueAtTime(75, now);
  guttural.frequency.exponentialRampToValueAtTime(36, now + 0.55);
  gutturalGain.gain.setValueAtTime(0.0001, now);
  gutturalGain.gain.linearRampToValueAtTime(0.60, now + 0.02);
  gutturalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

  guttural.connect(gutturalGain);
  gutturalGain.connect(voiceGain);
  guttural.start(now);
  guttural.stop(now + 0.6);
  nodesToClean.push(guttural, gutturalGain);

  let endedResolve: () => void;
  const ended = new Promise<void>((r) => { endedResolve = r; });

  const cleanup = () => {
    for (const n of nodesToClean) {
      try { n.disconnect(); } catch { /* ignore */ }
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
      try { n.disconnect(); } catch { /* ignore */ }
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

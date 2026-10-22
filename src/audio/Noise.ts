/* ── Noise.ts ─────────────────────────────────────────────────────────────
 *  Shared procedural AudioBuffers for White, Pink, and Brown noise.
 *  Generated once at audio initialization and reused across all synth voices.
 * ──────────────────────────────────────────────────────────────────────── */

import { mulberry32 } from '../procedural/core/prng.js';

export interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

let cachedBuffers: NoiseBuffers | null = null;

/**
 * Generate shared 2-second stereo noise buffers for white, pink, and brown noise.
 */
export function createNoiseBuffers(ctx: BaseAudioContext): NoiseBuffers {
  if (cachedBuffers && cachedBuffers.white.sampleRate === ctx.sampleRate) {
    return cachedBuffers;
  }

  const sampleRate = ctx.sampleRate;
  const duration = 2.0;
  const length = Math.floor(sampleRate * duration);

  const white = ctx.createBuffer(2, length, sampleRate);
  const pink = ctx.createBuffer(2, length, sampleRate);
  const brown = ctx.createBuffer(2, length, sampleRate);

  const rng = mulberry32(4242);

  for (let ch = 0; ch < 2; ch++) {
    const wData = white.getChannelData(ch);
    const pData = pink.getChannelData(ch);
    const bData = brown.getChannelData(ch);

    // Paul Kellet's pink noise filter state
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    // Brown noise integration state
    let lastBrown = 0.0;

    for (let i = 0; i < length; i++) {
      // White noise (-1..1)
      const w = rng() * 2.0 - 1.0;
      wData[i] = w;

      // Pink noise filter (-3dB/octave)
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      const pinkVal = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      pData[i] = Math.max(-1.0, Math.min(1.0, pinkVal));

      // Brown noise (-6dB/octave) with leaky integrator
      lastBrown = (lastBrown + 0.04 * w) / 1.02;
      bData[i] = Math.max(-1.0, Math.min(1.0, lastBrown * 3.5));
    }
  }

  cachedBuffers = { white, pink, brown };
  return cachedBuffers;
}

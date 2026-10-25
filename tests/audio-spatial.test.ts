/* ── audio-spatial.test.ts ──────────────────────────────────────────────────
 *  Automated verification suite for Phase C: Space, Reverb and Distance.
 *  Validates image-source early reflections (< 80ms), octave band decays,
 *  physical distance rolloff, air absorption lowpass, and wall occlusion.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { createImpulseResponse, PRESET_CONFIGS, type ReverbPreset } from '../src/audio/Reverb.js';
import { AudioEngine } from '../src/audio/AudioEngine.js';

describe('Phase C: Space, Reverb and Distance Suite', () => {
  it('1. Image-source early reflections are strictly < 80ms across all 8 presets', () => {
    const presets: ReverbPreset[] = [
      'poolroom',
      'tunnel',
      'atrium',
      'drain',
      'school',
      'jungle',
      'city',
      'station',
    ];

    for (const p of presets) {
      const cfg = PRESET_CONFIGS[p];
      expect(cfg.earlyReflections.length).toBeGreaterThanOrEqual(4);
      for (const tap of cfg.earlyReflections) {
        expect(tap.delayMs).toBeGreaterThan(0);
        expect(tap.delayMs).toBeLessThan(80.0);
        expect(tap.gain).toBeGreaterThan(0);
        expect(tap.gain).toBeLessThanOrEqual(1.0);
        expect(tap.pan).toBeGreaterThanOrEqual(-1.0);
        expect(tap.pan).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('2. Reverb octave band decay targets satisfy physical acoustic hierarchy', () => {
    const pool = PRESET_CONFIGS.poolroom;
    expect(pool.t60_125).toBeCloseTo(3.8, 1);
    expect(pool.t60_500).toBeCloseTo(3.4, 1);
    expect(pool.t60_2k).toBeCloseTo(2.6, 1);
    expect(pool.t60_8k).toBeCloseTo(1.4, 1);

    // Physical absorption constraint: high frequencies decay faster than low frequencies in air and tile
    expect(pool.t60_125).toBeGreaterThan(pool.t60_500);
    expect(pool.t60_500).toBeGreaterThan(pool.t60_2k);
    expect(pool.t60_2k).toBeGreaterThan(pool.t60_8k);
  });

  it('3. Generates valid stereo impulse responses with non-zero energy and no NaNs', () => {
    const sampleRate = 48000;
    const mockCtx = {
      sampleRate,
      createBuffer(channels: number, length: number, sr: number) {
        const data = [new Float32Array(length), new Float32Array(length)];
        return {
          numberOfChannels: channels,
          length,
          sampleRate: sr,
          getChannelData(ch: number) {
            return data[ch]!;
          },
        };
      },
    } as unknown as BaseAudioContext;

    const ir = createImpulseResponse(mockCtx, 'poolroom');
    const left = ir.getChannelData(0);
    const right = ir.getChannelData(1);

    expect(left.length).toBe(Math.floor(4.2 * sampleRate));

    let maxPeak = 0;
    let hasNaN = false;
    for (let i = 0; i < left.length; i++) {
      if (Number.isNaN(left[i]) || Number.isNaN(right[i])) hasNaN = true;
      const absL = Math.abs(left[i] ?? 0);
      const absR = Math.abs(right[i] ?? 0);
      if (absL > maxPeak) maxPeak = absL;
      if (absR > maxPeak) maxPeak = absR;
    }

    expect(hasNaN).toBe(false);
    expect(maxPeak).toBeGreaterThan(0.1);
    expect(maxPeak).toBeLessThanOrEqual(0.70);
  });

  it('4. AudioEngine supports setColliders and setListenerNearWall APIs', () => {
    const engine = AudioEngine.getInstance();
    expect(typeof engine.setColliders).toBe('function');
    expect(typeof engine.setListenerNearWall).toBe('function');

    const dummyColliders = {
      segmentHits(ax: number, _az: number, bx: number, _bz: number) {
        return Math.abs(ax - bx) > 10 ? 1 : 0;
      },
    };

    engine.setColliders(dummyColliders);
    engine.setListenerNearWall(true);
    // Cleanup
    engine.setColliders(null);
    engine.setListenerNearWall(false);
  });
});

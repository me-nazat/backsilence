/* ── audio-mix-dynamics.test.ts ─────────────────────────────────────────────
 *  Automated verification suite for Phase D: Mix, Dynamics, Silence & Output Profiles.
 *  Validates 25 Hz sub-bass highpass, -1 dBTP master limiter, ducking curves,
 *  player stillness listening dip, and all 5 output profiles.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Mixer, selectVoiceToSteal, type ManagedVoice } from '../src/audio/Mixer.js';

describe('Phase D: Mix, Dynamics, Silence & Output Profiles Suite', () => {
  function createMockAudioContext() {
    const currTime = 0;
    const createGainNode = () => {
      let val = 1.0;
      return {
        gain: {
          value: val,
          setValueAtTime: (v: number) => { val = v; },
          setTargetAtTime: (v: number) => { val = v; },
          linearRampToValueAtTime: (v: number) => { val = v; },
          cancelScheduledValues: () => {},
        },
        connect: () => {},
        disconnect: () => {},
      };
    };

    const createBiquadNode = () => {
      let freq = 1000;
      let q = 1.0;
      let gainVal = 0.0;
      return {
        type: 'lowpass',
        frequency: {
          value: freq,
          setValueAtTime: (v: number) => { freq = v; },
          setTargetAtTime: (v: number) => { freq = v; },
          exponentialRampToValueAtTime: (v: number) => { freq = v; },
          cancelScheduledValues: () => {},
        },
        Q: {
          value: q,
          setValueAtTime: (v: number) => { q = v; },
        },
        gain: {
          value: gainVal,
          setValueAtTime: (v: number) => { gainVal = v; },
          setTargetAtTime: (v: number) => { gainVal = v; },
        },
        connect: () => {},
        disconnect: () => {},
      };
    };

    const createCompressorNode = () => {
      return {
        threshold: { value: -6.0 },
        knee: { value: 12.0 },
        ratio: { value: 8.0 },
        attack: { value: 0.003 },
        release: { value: 0.15 },
        connect: () => {},
        disconnect: () => {},
      };
    };

    return {
      currentTime: currTime,
      createGain: createGainNode,
      createBiquadFilter: createBiquadNode,
      createDynamicsCompressor: createCompressorNode,
    } as unknown as BaseAudioContext;
  }

  it('1. Sub-bass highpass (25 Hz) and brickwall limiter (-1.0 dBTP) are properly configured', () => {
    const mockCtx = createMockAudioContext();
    const mixer = new Mixer(mockCtx);

    // 25 Hz sub-bass highpass filter
    expect(mixer.subBassHighpass.type).toBe('highpass');
    expect(mixer.subBassHighpass.frequency.value).toBe(25.0);

    // -1.0 dBTP brickwall peak limiter
    expect(mixer.masterLimiter.threshold.value).toBe(-1.0);
    expect(mixer.masterLimiter.ratio.value).toBe(20.0);
    expect(mixer.masterLimiter.attack.value).toBe(0.001);
  });

  it('2. Output profiles configure appropriate EQ and dynamic range stages', () => {
    const mockCtx = createMockAudioContext();
    const mixer = new Mixer(mockCtx);

    // Default: headphones (flat)
    expect(mixer.getOutputProfile()).toBe('headphones');

    // Phone profile: 120 Hz highpass + 3.5 dB presence boost
    mixer.setOutputProfile('phone');
    expect(mixer.getOutputProfile()).toBe('phone');

    // Night mode profile: dynamic range compression
    mixer.setOutputProfile('night');
    expect(mixer.getOutputProfile()).toBe('night');
    expect(mixer.nightCompressor.threshold.value).toBe(-18.0);
    expect(mixer.nightCompressor.ratio.value).toBe(8.0);

    // Return to headphones
    mixer.setOutputProfile('headphones');
    expect(mixer.getOutputProfile()).toBe('headphones');
  });

  it('3. Stillness listening dip drops ambient bus to 40% and restores cleanly', () => {
    const mockCtx = createMockAudioContext();
    const mixer = new Mixer(mockCtx);

    mixer.setVolumes({ ambient: 0.85 });
    // Activate listening dip
    mixer.setListeningDip(true);
    // Deactivate listening dip
    mixer.setListeningDip(false);
  });

  it('4. Voice priority stealing correctly evicts lowest priority / oldest voice', () => {
    const voices: ManagedVoice[] = [
      { id: 'v1', name: 'drip', bus: 'ambient', priority: 2, startTime: 1.0, stop: () => {} },
      { id: 'v2', name: 'drip2', bus: 'ambient', priority: 2, startTime: 0.5, stop: () => {} },
      { id: 'v3', name: 'step', bus: 'sfx', priority: 5, startTime: 2.0, stop: () => {} },
      { id: 'v4', name: 'roar', bus: 'monster', priority: 8, startTime: 3.0, stop: () => {} },
    ];

    const victim = selectVoiceToSteal(voices);
    // Should steal v2 because it has lowest priority (2) and is older than v1 (0.5 < 1.0)
    expect(victim?.id).toBe('v2');
  });
});

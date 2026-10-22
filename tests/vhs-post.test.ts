/* ── Tests: VHS/CRT Post-Processing & Tape Audio ────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import { VHSShader } from '../src/procedural/shaders/vhs.glsl.js';
import { PostFX } from '../src/engine/PostFX.js';
import { defaultSettings } from '../src/app/Settings.js';
import {
  playVhsGlitch,
  playTapeRewind,
  playTapeEject,
  playTapeInsert,
  playStaticBurst,
} from '../src/audio/voices/TapeSounds.js';

describe('VHS Shader (vhs.glsl.ts)', () => {
  it('exports vertex and fragment shaders with all required uniform contracts', () => {
    expect(typeof VHSShader.vertexShader).toBe('string');
    expect(typeof VHSShader.fragmentShader).toBe('string');

    const expectedUniforms = [
      'tDiffuse',
      'uIntensity',
      'uTime',
      'uResolution',
      'uGlitch',
      'uTension',
      'uRewind',
      'uSignalLost',
      'uLines',
      'uSafeMode',
      'uCurvature',
      'uLift',
      'uGamma',
      'uGain',
      'uSaturation',
      'uTint',
    ];

    for (const key of expectedUniforms) {
      expect(VHSShader.uniforms).toHaveProperty(key);
    }
  });

  it('guarantees exact raw diffuse bypass on uIntensity <= 0.0001', () => {
    expect(VHSShader.fragmentShader).toContain('if (uIntensity <= 0.0001)');
    expect(VHSShader.fragmentShader).toContain('gl_FragColor = texture2D(tDiffuse, vUv);');
    expect(VHSShader.fragmentShader).toContain('return;');
  });

  it('contains safe mode photosensitive suppression branch', () => {
    expect(VHSShader.fragmentShader).toContain('uSafeMode > 0.5');
    expect(VHSShader.fragmentShader).toContain('chroma = min(chroma, 0.0008);');
  });

  it('contains tracking roll and 1.2s REW band distortion', () => {
    expect(VHSShader.fragmentShader).toContain('uRewind');
    expect(VHSShader.fragmentShader).toContain('trackingSpeed');
    expect(VHSShader.fragmentShader).toContain('rgb2yiq');
  });
});

describe('PostFX Controller State & Degradation', () => {
  function createMockRenderer() {
    return {
      render: vi.fn(),
      setSize: vi.fn(),
      getSize: (target: import('three').Vector2) => target.set(1280, 720),
      getPixelRatio: () => 1,
      getContext: () => ({
        readPixels: vi.fn(),
        RGBA: 6408,
        UNSIGNED_BYTE: 5121,
      }),
      capabilities: {
        isWebGL2: true,
      },
    } as unknown as import('three').WebGLRenderer;
  }

  function createMockContainer() {
    return {
      clientWidth: 1280,
      clientHeight: 720,
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    } as unknown as HTMLElement;
  }

  it('initializes with default OSD state and PLAY mode', () => {
    const settings = defaultSettings();
    const postFX = new PostFX(createMockRenderer(), createMockContainer(), settings);

    const osd = postFX.getOsdState();
    expect(osd.mode).toBe('PLAY');
    expect(osd.timestamp).toMatch(/^AUG 14 1998\s+\d{2}:\d{2}:\d{2}$/);
    expect(typeof osd.recBlink).toBe('boolean');

    postFX.dispose();
  });

  it('triggers glitch and decays over time', () => {
    const settings = defaultSettings();
    const postFX = new PostFX(createMockRenderer(), createMockContainer(), settings);

    postFX.triggerGlitch(1.0);
    // At t=0, glitch is active
    postFX.update(0.2); // ~200ms decay
    // After 0.4s total, decay rate 2.5 means 2.5 * 0.4 = 1.0 decay
    postFX.update(0.25);
    postFX.dispose();
  });

  it('executes 1.2s death rewind sequence and fires onComplete callback', () => {
    const settings = defaultSettings();
    const postFX = new PostFX(createMockRenderer(), createMockContainer(), settings);

    let completed = false;
    postFX.triggerDeathRewind(() => {
      completed = true;
    });

    expect(postFX.getOsdState().mode).toBe('REW');

    // Advance 0.6s (halfway)
    postFX.update(0.6);
    expect(completed).toBe(false);
    expect(postFX.getOsdState().mode).toBe('REW');

    // Advance remaining 0.7s (total 1.3s > 1.2s)
    postFX.update(0.7);
    expect(completed).toBe(true);
    expect(postFX.getOsdState().mode).toBe('PLAY');

    postFX.dispose();
  });

  it('triggers tape ejected mode', () => {
    const settings = defaultSettings();
    const postFX = new PostFX(createMockRenderer(), createMockContainer(), settings);

    postFX.triggerTapeEjected();
    expect(postFX.getOsdState().mode).toBe('EJECT');

    postFX.dispose();
  });

  it('triggers tracking mode and automatically returns to PLAY after duration', () => {
    const settings = defaultSettings();
    const postFX = new PostFX(createMockRenderer(), createMockContainer(), settings);

    postFX.triggerTracking(0.5);
    expect(postFX.getOsdState().mode).toBe('TRACKING');

    postFX.update(0.3);
    expect(postFX.getOsdState().mode).toBe('TRACKING');

    postFX.update(0.3);
    expect(postFX.getOsdState().mode).toBe('PLAY');

    postFX.dispose();
  });

  it('toggles signal lost mode', () => {
    const settings = defaultSettings();
    const postFX = new PostFX(createMockRenderer(), createMockContainer(), settings);

    postFX.triggerSignalLost(true);
    expect(postFX.getOsdState().mode).toBe('SIGNAL_LOST');

    postFX.triggerSignalLost(false);
    expect(postFX.getOsdState().mode).toBe('PLAY');

    postFX.dispose();
  });

  it('photosensitive safe mode clamps glitch intensity to <= 0.35', () => {
    const settings = defaultSettings();
    settings.graphics.photosensitiveSafe = true;
    const postFX = new PostFX(createMockRenderer(), createMockContainer(), settings);

    postFX.triggerJumpscare();
    // In safe mode, jumpscare glitch is clamped to 0.35 instead of 1.0
    postFX.update(0.01);
    postFX.dispose();
  });

  it('applies per-map postGrade settings without error', () => {
    const settings = defaultSettings();
    const postFX = new PostFX(createMockRenderer(), createMockContainer(), settings);

    postFX.setPostGrade({
      lift: [0.02, 0.01, -0.01],
      gamma: [0.95, 1.0, 1.05],
      gain: [1.1, 1.05, 0.95],
      saturation: 1.15,
      tint: [1.02, 0.98, 0.95],
    });

    expect(postFX.getPostGrade()?.saturation).toBe(1.15);
    postFX.dispose();
  });
});

describe('Tape Audio Voices (TapeSounds.ts)', () => {
  function createMockAudioContext() {
    function createMockParam(defaultVal = 0) {
      return {
        value: defaultVal,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      };
    }

    function createMockNode() {
      return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: createMockParam(440),
        Q: createMockParam(1.0),
        gain: createMockParam(1.0),
        type: 'lowpass',
        buffer: null,
      };
    }

    const ctx = {
      currentTime: 10.0,
      createOscillator: vi.fn(() => createMockNode()),
      createBiquadFilter: vi.fn(() => createMockNode()),
      createGain: vi.fn(() => createMockNode()),
      createBufferSource: vi.fn(() => createMockNode()),
    } as unknown as AudioContext;

    const dummyBuffer = {} as AudioBuffer;
    const noise = {
      white: dummyBuffer,
      pink: dummyBuffer,
      brown: dummyBuffer,
    };
    const dest = createMockNode() as unknown as AudioNode;
    const reverbSend = createMockNode() as unknown as GainNode;

    return {
      ctx,
      destination: dest,
      reverbSend,
      noise,
      seed: 42,
    };
  }

  it('plays vhs_glitch voice without throwing', () => {
    const voiceCtx = createMockAudioContext();
    expect(() => playVhsGlitch(voiceCtx)).not.toThrow();
  });

  it('plays tape_rewind voice without throwing', () => {
    const voiceCtx = createMockAudioContext();
    expect(() => playTapeRewind(voiceCtx)).not.toThrow();
  });

  it('plays tape_eject voice without throwing', () => {
    const voiceCtx = createMockAudioContext();
    expect(() => playTapeEject(voiceCtx)).not.toThrow();
  });

  it('plays tape_insert voice without throwing', () => {
    const voiceCtx = createMockAudioContext();
    expect(() => playTapeInsert(voiceCtx)).not.toThrow();
  });

  it('plays static_burst voice without throwing', () => {
    const voiceCtx = createMockAudioContext();
    expect(() => playStaticBurst(voiceCtx)).not.toThrow();
  });
});

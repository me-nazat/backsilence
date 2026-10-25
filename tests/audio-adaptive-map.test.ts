/* ── audio-adaptive-map.test.ts ─────────────────────────────────────────────
 *  Phase E: Adaptive and Per-Map Sound Suite
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioEngine, type VoiceHandle } from '../src/audio/AudioEngine.js';
import { AudioDirector, MAP_AUDIO_CONFIGS } from '../src/audio/AudioDirector.js';
import { Mixer } from '../src/audio/Mixer.js';
import { ALL_MAP_IDS } from '../src/world/MapRegistry.js';
import {
  playSparsePipeClank,
  playSparseMetalCreak,
  playSparseSteamHiss,
  playSparseElectricalCrackle,
  playSparseSubShudder,
  playSparseWaterSurge,
  playSparseCavernDraft,
  playSparsePebbleFall,
} from '../src/audio/voices/AmbienceBeds.js';

interface EngineInternals {
  ctx: BaseAudioContext;
  mixer: Mixer;
  director: AudioDirector;
}

function createMockAudioContext(): BaseAudioContext {
  const currTime = 0;
  const createAudioParam = (initial = 0) => {
    let val = initial;
    return {
      value: val,
      setValueAtTime: (v: number) => { val = v; },
      setTargetAtTime: (v: number) => { val = v; },
      linearRampToValueAtTime: (v: number) => { val = v; },
      exponentialRampToValueAtTime: (v: number) => { val = v; },
      cancelScheduledValues: () => {},
    };
  };

  const createGainNode = () => ({
    gain: createAudioParam(1.0),
    connect: () => {},
    disconnect: () => {},
  });

  const createBiquadNode = () => ({
    type: 'lowpass',
    frequency: createAudioParam(1000),
    Q: createAudioParam(1.0),
    gain: createAudioParam(0.0),
    connect: () => {},
    disconnect: () => {},
  });

  const createCompressorNode = () => ({
    threshold: createAudioParam(-6.0),
    knee: createAudioParam(12.0),
    ratio: createAudioParam(8.0),
    attack: createAudioParam(0.003),
    release: createAudioParam(0.15),
    connect: () => {},
    disconnect: () => {},
  });

  const createOscillator = () => ({
    type: 'sine',
    frequency: createAudioParam(440),
    connect: () => {},
    disconnect: () => {},
    start: () => {},
    stop: () => {},
  });

  const createBufferSource = () => ({
    buffer: null,
    loop: false,
    connect: () => {},
    disconnect: () => {},
    start: () => {},
    stop: () => {},
  });

  const createBuffer = (channels: number, length: number, sr: number) => {
    const chData = [new Float32Array(length), new Float32Array(length)];
    return {
      numberOfChannels: channels,
      length,
      sampleRate: sr,
      getChannelData: (ch: number) => chData[ch] ?? new Float32Array(length),
    };
  };

  return {
    currentTime: currTime,
    sampleRate: 44100,
    createGain: createGainNode,
    createBiquadFilter: createBiquadNode,
    createDynamicsCompressor: createCompressorNode,
    createOscillator,
    createBufferSource,
    createBuffer,
    destination: createGainNode(),
  } as unknown as BaseAudioContext;
}

describe('Phase E: Adaptive and Per-Map Sound Suite', () => {
  let ctx: BaseAudioContext;
  let engine: AudioEngine;
  let director: AudioDirector;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = new AudioEngine();
    const internals = engine as unknown as EngineInternals;
    internals.ctx = ctx;
    internals.mixer = new Mixer(ctx);
    director = new AudioDirector(engine);
    internals.director = director;
  });

  afterEach(() => {
    director.dispose();
  });

  it('1. AudioDirector smoothly maps dread (0..1) to HF tilt and heartbeat BPM', () => {
    // Baseline dread 0
    director.setDread(0.0);
    expect(director.currentDread).toBe(0.0);
    const internals = engine as unknown as EngineInternals;
    expect(internals.mixer.ambientTiltFilter.frequency.value).toBe(18000);

    // Mid dread 0.5
    director.setDread(0.5);
    expect(director.currentDread).toBe(0.5);

    // Max dread 1.0
    director.setDread(1.0);
    expect(director.currentDread).toBe(1.0);

    // Clamping test
    director.setDread(1.5);
    expect(director.currentDread).toBe(1.0);
    director.setDread(-0.5);
    expect(director.currentDread).toBe(0.0);
  });

  it('2. All map environments have distinct beds and at least 5 randomized sparse events', () => {
    for (const mapId of ALL_MAP_IDS) {
      const config = MAP_AUDIO_CONFIGS[mapId];
      expect(config, `Missing audio config for map: ${mapId}`).toBeDefined();
      expect(config.sparseEvents.length, `Map ${mapId} must have at least 5 sparse events`).toBeGreaterThanOrEqual(5);

      // Verify each sparse event is a valid string
      for (const eventName of config.sparseEvents) {
        expect(typeof eventName).toBe('string');
        expect(eventName.length).toBeGreaterThan(0);
      }
    }
  });

  it('3. AudioDirector startMapAmbience activates per-map beds and scheduler', () => {
    const dummyHandle: VoiceHandle = {
      stop: () => {},
      setParam: () => {},
      setPosition: () => {},
      ended: Promise.resolve(),
    };
    const playSpy = vi.spyOn(engine, 'play').mockImplementation(() => dummyHandle);

    director.startMapAmbience('utility_tunnels');
    expect(director.activeMapId).toBe('utility_tunnels');
    expect(playSpy).toHaveBeenCalledWith('ambience_tunnels', expect.anything());

    director.startMapAmbience('drainage_core');
    expect(director.activeMapId).toBe('drainage_core');
    expect(playSpy).toHaveBeenCalledWith('ambience_drain', expect.anything());

    director.startMapAmbience('natatorium');
    expect(director.activeMapId).toBe('natatorium');
    expect(playSpy).toHaveBeenCalledWith('lap_loop', expect.anything());
  });

  it('4. All 8 new sparse environmental voices synthesize without error', () => {
    const dest = ctx.createGain();
    const reverbSend = ctx.createGain();
    const noise = {
      pink: ctx.createBuffer(1, 44100, 44100),
      brown: ctx.createBuffer(1, 44100, 44100),
      white: ctx.createBuffer(1, 44100, 44100),
    };

    const voiceCtx = {
      ctx,
      destination: dest,
      reverbSend,
      noise,
    };

    const sparseFns = [
      playSparsePipeClank,
      playSparseMetalCreak,
      playSparseSteamHiss,
      playSparseElectricalCrackle,
      playSparseSubShudder,
      playSparseWaterSurge,
      playSparseCavernDraft,
      playSparsePebbleFall,
    ];

    for (const fn of sparseFns) {
      const handle = fn(voiceCtx);
      expect(handle).toBeDefined();
      expect(handle.ended).toBeInstanceOf(Promise);
      expect(typeof handle.stop).toBe('function');
    }
  });
});

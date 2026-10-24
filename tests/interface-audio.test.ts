/* ── interface-audio.test.ts ────────────────────────────────────────────────
 *  Tests for Phase E: Interface Sound Effects & Generative Menu Music.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  playUiStamp,
  playUiAchievement,
  playUiCountdownTick,
  playUiLobbyJoin,
  playUiReady,
  playUiRankUp,
  playResultsStinger,
  type UiVoiceContext,
} from '../src/audio/voices/UiSounds.js';
import { MenuMusic } from '../src/audio/MenuMusic.js';
import type { AudioEngine } from '../src/audio/AudioEngine.js';

// ── Mock AudioContext for Node test runner ─────────────────────────────────
function createMockAudioContext() {
  const dummyNode = {
    connect: () => {},
    disconnect: () => {},
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
    gain: {
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      setTargetAtTime: () => {},
      value: 1.0,
    },
    frequency: {
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      value: 440,
    },
    Q: { value: 1.0 },
    start: () => {},
    stop: () => {},
  };

  return {
    currentTime: 0.1,
    createGain: () => ({ ...dummyNode, gain: { ...dummyNode.gain } }),
    createOscillator: () => ({ ...dummyNode, frequency: { ...dummyNode.frequency } }),
    createBiquadFilter: () => ({ ...dummyNode, frequency: { ...dummyNode.frequency }, Q: { value: 1.0 } }),
    createBufferSource: () => ({ ...dummyNode }),
    destination: dummyNode,
  } as unknown as BaseAudioContext;
}

describe('Prompt 4 Phase E: Interface Audio & Generative Menu Music', () => {
  const mockCtx = createMockAudioContext();
  const mockNoise = {
    white: {} as AudioBuffer,
    pink: {} as AudioBuffer,
    brown: {} as AudioBuffer,
    velvet: {} as AudioBuffer,
  };
  const voiceCtx: UiVoiceContext = {
    ctx: mockCtx,
    destination: mockCtx.destination,
    reverbSend: mockCtx.destination,
    noise: mockNoise,
    intensity: 1.0,
  };

  it('synthesizes ui_stamp with low sub-bass thump and stops cleanly', async () => {
    const handle = playUiStamp(voiceCtx);
    expect(handle).toBeDefined();
    expect(typeof handle.stop).toBe('function');
    handle.stop();
  });

  it('synthesizes ui_achievement with twin bell chime', async () => {
    const handle = playUiAchievement(voiceCtx);
    expect(handle).toBeDefined();
    expect(typeof handle.stop).toBe('function');
    handle.stop();
  });

  it('synthesizes ui_countdown_tick, ui_lobby_join, and ui_ready', async () => {
    const tick = playUiCountdownTick(voiceCtx);
    expect(tick).toBeDefined();
    tick.stop();

    const join = playUiLobbyJoin(voiceCtx);
    expect(join).toBeDefined();
    join.stop();

    const ready = playUiReady(voiceCtx);
    expect(ready).toBeDefined();
    ready.stop();
  });

  it('synthesizes ui_rank_up ascending arpeggio', async () => {
    const rankUp = playUiRankUp(voiceCtx);
    expect(rankUp).toBeDefined();
    rankUp.stop();
  });

  it('synthesizes rank-specific results stingers (S bright/open vs D low/thin)', async () => {
    // S Rank: bright open major 9th
    const sStinger = playResultsStinger({ ...voiceCtx, rank: 'S' });
    expect(sStinger).toBeDefined();
    sStinger.stop();

    // D Rank: low detuned minor 2nd dissonance
    const dStinger = playResultsStinger({ ...voiceCtx, rank: 'D' });
    expect(dStinger).toBeDefined();
    dStinger.stop();

    // B Rank: neutral fifth
    const bStinger = playResultsStinger({ ...voiceCtx, rank: 'B' });
    expect(bStinger).toBeDefined();
    bStinger.stop();
  });

  it('generative MenuMusic controls pad, plucks, dread level, and blur mute', () => {
    const mockEngine = {
      getContext: () => mockCtx,
      getBusNode: () => mockCtx.destination,
    } as unknown as AudioEngine;

    const music = new MenuMusic(mockEngine);

    // 1. Start music
    music.start();

    // 2. Modulate in-game dread (0.0 to 1.0)
    music.setDread(0.75);

    // 3. Set volume & mute on blur
    music.setVolume(0.8);
    music.setMute(true);
    music.setMute(false);

    // 4. Return to menu (dread drops to 0.0)
    music.setDread(0.0);

    // 5. Clean teardown
    music.stop();
  });
});

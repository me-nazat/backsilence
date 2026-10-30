/* ── audio-engine-wiring.test.ts ─────────────────────────────────────────
 *  Prompt 3 Verification:
 *  1. playStepDry requests 'step_dry' pool category and never 'step_wet'.
 *  2. AudioEngine.applySettings is invoked during GameSession construction.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { playStepDry } from '../src/audio/voices/Footsteps.js';
import { AudioBufferPool } from '../src/audio/AudioBufferPool.js';
import { AudioEngine } from '../src/audio/AudioEngine.js';
import { GameSession } from '../src/game/GameSession.js';
import { defaultSettings } from '../src/app/Settings.js';
import type { FootstepVoiceContext } from '../src/audio/voices/Footsteps.js';

describe('Prompt 3 Audio Engine Wiring & Footsteps Suite', () => {
  it('asserts that playStepDry requests step_dry pool category and never step_wet', () => {
    const requestedCategories: string[] = [];
    const ctx = { currentTime: 0 } as BaseAudioContext;
    const mockPool = {
      ctx,
      isReady: () => true,
      play: (category: string) => {
        requestedCategories.push(category);
        return { stop: () => {}, setParam: () => {}, ended: Promise.resolve() };
      },
    };
    (AudioBufferPool as unknown as { instance: unknown }).instance = mockPool;

    const dest = {} as AudioNode;
    const voiceCtx: FootstepVoiceContext = {
      ctx,
      destination: dest,
      reverbSend: dest,
      noise: { pink: {} as AudioBuffer, white: {} as AudioBuffer, brown: {} as AudioBuffer },
    };

    playStepDry(voiceCtx);

    expect(requestedCategories).toContain('step_dry');
    expect(requestedCategories).not.toContain('step_wet');
  });

  it('asserts that AudioEngine.applySettings is invoked during GameSession construction', () => {
    const engine = AudioEngine.getInstance();
    let applySettingsCalled = false;
    let appliedAudioSettings: unknown = null;
    const originalApplySettings = engine.applySettings.bind(engine);
    engine.applySettings = (s) => {
      applySettingsCalled = true;
      appliedAudioSettings = s;
      originalApplySettings(s);
    };

    const prevDoc = globalThis.document;
    const prevWindow = globalThis.window;
    try {
      const mockCanvas = {
        style: {},
        getContext: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      const mockContainer = {
        clientWidth: 1280,
        clientHeight: 720,
        appendChild: () => {},
        removeChild: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      globalThis.document = {
        createElement: (tag: string) => {
          if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
          return { style: {}, appendChild: () => {} } as unknown as HTMLElement;
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as Document;
      globalThis.window = {
        devicePixelRatio: 1,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as Window & typeof globalThis;

      const mockHud = {
        setMinimalHud: () => {},
        setUiScale: () => {},
      };

      const settings = defaultSettings();
      try {
        new GameSession(
          mockContainer as unknown as HTMLElement,
          settings,
          mockHud as unknown as import('../src/ui/Hud.js').Hud,
          {
            onPause: () => {},
            onDeath: () => {},
            onWin: () => {},
            onExit: () => {},
          },
        );
      } catch {
        // Downstream WebGL/Three.js compile may throw in node; applySettings is called immediately in constructor
      }

      expect(applySettingsCalled).toBe(true);
      expect(appliedAudioSettings).toEqual(settings.audio);
    } finally {
      engine.applySettings = originalApplySettings;
      globalThis.document = prevDoc;
      globalThis.window = prevWindow;
    }
  });
});

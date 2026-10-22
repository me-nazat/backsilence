/* ── Tests: core module tests ─────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { mulberry32, hashString, prngFromString, randInt } from '../src/procedural/core/prng.js';
import { isValidRoomCode, parseRoute, generateRoomCode } from '../src/app/Router.js';
import { defaultSettings, clampSettings, migrateSettings } from '../src/app/Settings.js';
import { createEventBus } from '../src/app/EventBus.js';
import { AppStateMachine } from '../src/app/StateMachine.js';
import type { Settings } from '../src/types/contracts.js';

// ── PRNG Determinism ────────────────────────────────────────────────────
describe('PRNG (mulberry32)', () => {
  it('produces the same sequence for the same seed', () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(12345);
    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(54321);
    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it('generates values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashString produces consistent hashes', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('prngFromString is deterministic', () => {
    const rng1 = prngFromString('poolrooms:42');
    const rng2 = prngFromString('poolrooms:42');
    const seq1 = Array.from({ length: 50 }, () => rng1());
    const seq2 = Array.from({ length: 50 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('randInt stays within bounds', () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 500; i++) {
      const v = randInt(rng, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

// ── Room Code Validation ────────────────────────────────────────────────
describe('Room Code Validation', () => {
  it('accepts valid 4-char codes from SAFE_ALPHABET', () => {
    expect(isValidRoomCode('K7QX')).toBe(true);
    expect(isValidRoomCode('ABCD')).toBe(true);
    expect(isValidRoomCode('2345')).toBe(true);
    expect(isValidRoomCode('WXYZ')).toBe(true);
  });

  it('rejects codes with disallowed characters (I, O, 0, 1)', () => {
    expect(isValidRoomCode('I7QX')).toBe(false); // I not in alphabet
    expect(isValidRoomCode('O7QX')).toBe(false); // O not in alphabet
    expect(isValidRoomCode('07QX')).toBe(false); // 0 not in alphabet
    expect(isValidRoomCode('17QX')).toBe(false); // 1 not in alphabet
  });

  it('rejects codes with wrong length', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
  });

  it('rejects lowercase codes', () => {
    expect(isValidRoomCode('abcd')).toBe(false);
  });

  it('generateRoomCode produces valid codes', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode(rng);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });
});

// ── Router Parsing ──────────────────────────────────────────────────────
describe('Router', () => {
  it('parses ?room=K7QX', () => {
    const route = parseRoute('?room=K7QX');
    expect(route.room).toBe('K7QX');
    expect(route.debug).toBe(false);
    expect(route.lab).toBe(false);
  });

  it('uppercases room code', () => {
    const route = parseRoute('?room=k7qx');
    expect(route.room).toBe('K7QX');
  });

  it('rejects invalid room codes', () => {
    expect(parseRoute('?room=ABCDE').room).toBeNull();
    expect(parseRoute('?room=AB').room).toBeNull();
    expect(parseRoute('?room=0000').room).toBeNull();
    expect(parseRoute('?room=').room).toBeNull();
  });

  it('parses ?debug=1', () => {
    const route = parseRoute('?debug=1');
    expect(route.debug).toBe(true);
    expect(route.lab).toBe(false);
    expect(route.room).toBeNull();
  });

  it('parses ?lab=1', () => {
    const route = parseRoute('?lab=1');
    expect(route.lab).toBe(true);
  });

  it('parses combined params', () => {
    const route = parseRoute('?room=K7QX&debug=1&lab=1');
    expect(route.room).toBe('K7QX');
    expect(route.debug).toBe(true);
    expect(route.lab).toBe(true);
  });

  it('returns defaults for empty search', () => {
    const route = parseRoute('');
    expect(route.room).toBeNull();
    expect(route.debug).toBe(false);
    expect(route.lab).toBe(false);
  });
});

// ── Settings Clamp & Migration ──────────────────────────────────────────
describe('Settings', () => {
  it('default settings have version 1', () => {
    const s = defaultSettings();
    expect(s.version).toBe(1);
  });

  it('clamps out-of-range values', () => {
    const bad: Settings = {
      ...defaultSettings(),
      graphics: {
        ...defaultSettings().graphics,
        fov: 999,
        brightness: -5,
        resolutionScale: 10,
        vhsIntensity: 2.5,
      },
      audio: {
        ...defaultSettings().audio,
        master: 5,
        sfx: -1,
      },
      controls: {
        ...defaultSettings().controls,
        sensitivity: 100,
      },
    };
    const clamped = clampSettings(bad);
    expect(clamped.graphics.fov).toBe(120);
    expect(clamped.graphics.brightness).toBe(0.2);
    expect(clamped.graphics.resolutionScale).toBe(2.0);
    expect(clamped.graphics.vhsIntensity).toBe(1.0);
    expect(clamped.audio.master).toBe(1.0);
    expect(clamped.audio.sfx).toBe(0.0);
    expect(clamped.controls.sensitivity).toBe(2.0);
  });

  it('clamps invalid quality tier to auto', () => {
    const bad = defaultSettings();
    (bad.graphics as Record<string, unknown>).quality = 'ultra';
    const clamped = clampSettings(bad);
    expect(clamped.graphics.quality).toBe('auto');
  });

  it('migrates unknown version to defaults', () => {
    const result = migrateSettings({ version: 99 });
    expect(result.version).toBe(1);
    expect(result.graphics.quality).toBe('auto');
  });

  it('migrates version 1 with clamping', () => {
    const raw = {
      ...defaultSettings(),
      graphics: { ...defaultSettings().graphics, fov: 200 },
    } as unknown as Record<string, unknown>;
    raw['version'] = 1;
    const result = migrateSettings(raw);
    expect(result.version).toBe(1);
    expect(result.graphics.fov).toBe(120);
  });

  it('handles missing version gracefully', () => {
    const result = migrateSettings({});
    expect(result.version).toBe(1);
  });
});

// ── State Machine ───────────────────────────────────────────────────────
describe('StateMachine', () => {
  it('starts in BOOT state', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    expect(sm.current).toBe('BOOT');
  });

  it('allows legal transition BOOT → MENU', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    sm.transition('MENU');
    expect(sm.current).toBe('MENU');
  });

  it('emits app:state event on transition', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    let emitted: { from: string; to: string } | null = null;
    bus.on('app:state', (e) => {
      emitted = e;
    });
    sm.transition('MENU');
    expect(emitted).toEqual({ from: 'BOOT', to: 'MENU' });
  });

  it('rejects illegal transition BOOT → PLAYING', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    expect(() => sm.transition('PLAYING')).toThrow(/Illegal state transition/);
    expect(sm.current).toBe('BOOT');
  });

  it('rejects illegal transition MENU → PLAYING', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    sm.transition('MENU');
    expect(() => sm.transition('PLAYING')).toThrow(/Illegal state transition/);
  });

  it('canTransition reports correctly', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    expect(sm.canTransition('MENU')).toBe(true);
    expect(sm.canTransition('PLAYING')).toBe(false);
  });

  it('follows full legal path BOOT → MENU → MODE_SELECT → LOADING → PLAYING → PAUSED → MENU', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    sm.transition('MENU');
    sm.transition('MODE_SELECT');
    sm.transition('LOADING');
    sm.transition('PLAYING');
    sm.transition('PAUSED');
    sm.transition('MENU');
    expect(sm.current).toBe('MENU');
  });

  it('follows death path PLAYING → DEAD → RESULTS → MENU', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    sm.transition('MENU');
    sm.transition('MODE_SELECT');
    sm.transition('LOADING');
    sm.transition('PLAYING');
    sm.transition('DEAD');
    sm.transition('RESULTS');
    sm.transition('MENU');
    expect(sm.current).toBe('MENU');
  });

  it('follows spectating path DEAD → SPECTATING → RESULTS', () => {
    const bus = createEventBus();
    const sm = new AppStateMachine(bus);
    sm.transition('MENU');
    sm.transition('MODE_SELECT');
    sm.transition('LOADING');
    sm.transition('PLAYING');
    sm.transition('DEAD');
    sm.transition('SPECTATING');
    sm.transition('RESULTS');
    expect(sm.current).toBe('RESULTS');
  });
});

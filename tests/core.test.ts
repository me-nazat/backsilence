/* ── Tests: core module tests ─────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  hashString,
  prngFromString,
  randInt,
  Rng,
  rngRange,
  rngInt,
  rngPick,
  rngGaussian,
} from '../src/procedural/core/prng.js';
import {
  createNoisePermutation,
  gradientNoise2DTileable,
  fbm2DTileable,
} from '../src/procedural/core/noise.js';
import { GLYPHS, layoutText } from '../src/procedural/textures/strokeFont.js';
import { SAFE_ALPHABET, type Settings } from '../src/types/contracts.js';
import { isValidRoomCode, parseRoute, generateRoomCode } from '../src/app/Router.js';
import {
  defaultSettings,
  clampSettings,
  migrateSettings,
  findBindingConflict,
} from '../src/app/Settings.js';
import { createEventBus } from '../src/app/EventBus.js';
import { AppStateMachine } from '../src/app/StateMachine.js';
import { selectVoiceToSteal, type ManagedVoice } from '../src/audio/Mixer.js';

// ── PRNG Determinism & Forkable Streams ─────────────────────────────────
describe('PRNG (mulberry32 & Rng class)', () => {
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

  it('forkable Rng: fork("label") is deterministic and independent', () => {
    const root1 = new Rng(42);
    const root2 = new Rng(42);

    const forkA1 = root1.fork('streamA');
    const forkA2 = root2.fork('streamA');
    const forkB1 = root1.fork('streamB');

    // Identical forks produce identical numbers
    const seqA1 = Array.from({ length: 25 }, () => forkA1.next());
    const seqA2 = Array.from({ length: 25 }, () => forkA2.next());
    expect(seqA1).toEqual(seqA2);

    // Different fork labels produce independent streams
    const seqB1 = Array.from({ length: 25 }, () => forkB1.next());
    expect(seqA1).not.toEqual(seqB1);
  });

  it('rngRange and rngInt utility helpers work as expected', () => {
    const rng = new Rng(77);
    for (let i = 0; i < 200; i++) {
      const r = rngRange(rng, 5.0, 10.0);
      expect(r).toBeGreaterThanOrEqual(5.0);
      expect(r).toBeLessThanOrEqual(10.0);

      const n = rngInt(rng, 10, 20);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(20);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('rngPick selects an element deterministically from an array', () => {
    const rng = new Rng(100);
    const items = ['water', 'tiles', 'shadow', 'pipe'];
    const picked = rngPick(rng, items);
    expect(items).toContain(picked);
  });

  it('rngGaussian produces a bell curve centered at mean', () => {
    const rng = new Rng(2023);
    let sum = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      sum += rngGaussian(rng, 5.0, 1.0);
    }
    const mean = sum / n;
    expect(mean).toBeGreaterThan(4.85);
    expect(mean).toBeLessThan(5.15);
  });
});

// ── Noise Tileability Math ──────────────────────────────────────────────
describe('Noise Tileability Math', () => {
  it('gradientNoise2DTileable wraps precisely across periodX and periodY', () => {
    const perm = createNoisePermutation(9876);
    const periodX = 4;
    const periodY = 4;

    const testCoords = [
      [0.0, 0.0],
      [1.3, 2.7],
      [3.99, 0.5],
      [2.0, 3.5],
    ];

    for (const [x, y] of testCoords) {
      const v0 = gradientNoise2DTileable(x!, y!, periodX, periodY, perm);
      const vWrapX = gradientNoise2DTileable(x! + periodX, y!, periodX, periodY, perm);
      const vWrapY = gradientNoise2DTileable(x!, y! + periodY, periodX, periodY, perm);
      const vWrapXY = gradientNoise2DTileable(x! + periodX, y! + periodY, periodX, periodY, perm);

      expect(Math.abs(v0 - vWrapX)).toBeLessThan(1e-5);
      expect(Math.abs(v0 - vWrapY)).toBeLessThan(1e-5);
      expect(Math.abs(v0 - vWrapXY)).toBeLessThan(1e-5);
    }
  });

  it('fbm2DTileable wraps smoothly across periodX and periodY', () => {
    const perm = createNoisePermutation(5432);
    const periodX = 8;
    const periodY = 8;

    const x = 1.75;
    const y = 3.25;

    const v0 = fbm2DTileable(x, y, periodX, periodY, 4, 2.0, 0.5, perm);
    const vWrap = fbm2DTileable(x + periodX, y + periodY, periodX, periodY, 4, 2.0, 0.5, perm);

    expect(Math.abs(v0 - vWrap)).toBeLessThan(1e-4);
  });
});

// ── Stroke Font Layout ──────────────────────────────────────────────────
describe('Stroke Font & Decal Lettering', () => {
  it('every supported character has at least one polyline and stays within the 0..1 glyph box', () => {
    const supportedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!?#:-/,';
    for (const char of supportedChars) {
      const glyph = GLYPHS[char];
      expect(glyph, `Glyph for '${char}' must exist`).toBeDefined();
      expect(glyph!.length).toBeGreaterThan(0);

      for (const stroke of glyph!) {
        expect(stroke.length).toBeGreaterThanOrEqual(2);
        for (const [x, y] of stroke) {
          expect(x).toBeGreaterThanOrEqual(0.0);
          expect(x).toBeLessThanOrEqual(1.0);
          expect(y).toBeGreaterThanOrEqual(0.0);
          expect(y).toBeLessThanOrEqual(1.0);
        }
      }
    }
  });

  it('layoutText accurately lays out tagline text', () => {
    const result = layoutText("IT CAN'T SEE YOU.", { size: 40, tracking: 1.1 });
    expect(result.polylines.length).toBeGreaterThan(10);
    expect(result.width).toBeGreaterThan(200);
    expect(result.height).toBeGreaterThanOrEqual(40);
  });
});

// ── Room Code Generation & 10,000 Sample Validation ─────────────────────
describe('Room Code Validation & 10,000 Sample Robustness', () => {
  it('accepts valid 4-char codes from SAFE_ALPHABET', () => {
    expect(isValidRoomCode('K7QX')).toBe(true);
    expect(isValidRoomCode('ABCD')).toBe(true);
    expect(isValidRoomCode('2345')).toBe(true);
    expect(isValidRoomCode('WXYZ')).toBe(true);
  });

  it('rejects codes with disallowed characters (I, O, 0, 1)', () => {
    expect(isValidRoomCode('I7QX')).toBe(false);
    expect(isValidRoomCode('O7QX')).toBe(false);
    expect(isValidRoomCode('07QX')).toBe(false);
    expect(isValidRoomCode('17QX')).toBe(false);
  });

  it('rejects codes with wrong length', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
  });

  it('rejects lowercase codes', () => {
    expect(isValidRoomCode('abcd')).toBe(false);
  });

  it('10,000 samples of generateRoomCode have length 4 and zero invalid characters', () => {
    const rng = mulberry32(1337);
    const forbidden = new Set(['I', 'O', '0', '1']);
    const safeSet = new Set(SAFE_ALPHABET.split(''));

    for (let i = 0; i < 10000; i++) {
      const code = generateRoomCode(rng);
      expect(code.length).toBe(4);
      for (const ch of code) {
        expect(forbidden.has(ch)).toBe(false);
        expect(safeSet.has(ch)).toBe(true);
      }
      expect(isValidRoomCode(code)).toBe(true);
    }
  });
});

// ── Router Parsing & URL Roundtrip ──────────────────────────────────────
describe('Router Parsing & URL Roundtrip', () => {
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

  it('roundtrips URL parameters', () => {
    const room = 'K7QX';
    const url = `http://localhost:5173/?room=${room}&debug=1&lab=1`;
    const search = url.split('?')[1]!;
    const route = parseRoute(`?${search}`);
    expect(route.room).toBe('K7QX');
    expect(route.debug).toBe(true);
    expect(route.lab).toBe(true);
  });
});

// ── Settings Clamping & Keybinding Conflicts ────────────────────────────
describe('Settings Clamping & Key-binding Conflicts', () => {
  it('clamps all numeric fields to their safe ranges', () => {
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
        ambient: 99,
        monster: -0.5,
      },
      controls: {
        ...defaultSettings().controls,
        sensitivity: 100,
      },
      accessibility: {
        ...defaultSettings().accessibility,
        uiScale: 5.0,
      },
    };
    const clamped = clampSettings(bad);
    expect(clamped.graphics.fov).toBe(100);
    expect(clamped.graphics.brightness).toBe(0.8);
    expect(clamped.graphics.resolutionScale).toBe(50);
    expect(clamped.graphics.vhsIntensity).toBe(1.0);

    expect(clamped.audio.master).toBe(1.0);
    expect(clamped.audio.sfx).toBe(0.0);
    expect(clamped.audio.ambient).toBe(1.0);
    expect(clamped.audio.monster).toBe(0.0);

    expect(clamped.controls.sensitivity).toBe(3.0);
    expect(clamped.accessibility.uiScale).toBe(1.5);
  });

  it('migrates settings properly from raw objects', () => {
    const migrated = migrateSettings({ version: 99 });
    expect(migrated.version).toBe(1);
    expect(migrated.graphics.quality).toBe('auto');
  });

  it('findBindingConflict detects duplicate keys across actions', () => {
    const bindings = { ...defaultSettings().controls.bindings };
    // Default: forward is 'KeyW', back is 'KeyS'
    const conflict = findBindingConflict(bindings, 'back', 'KeyW');
    expect(conflict).toBe('forward');

    // Rebinding to the same action does not conflict
    const selfConflict = findBindingConflict(bindings, 'forward', 'KeyW');
    expect(selfConflict).toBeNull();

    // Rebinding to an unused key does not conflict
    const noConflict = findBindingConflict(bindings, 'interact', 'KeyP');
    expect(noConflict).toBeNull();
  });
});

// ── Voice Limiter Stealing Policy ───────────────────────────────────────
describe('Voice Limiter Stealing Policy', () => {
  it('steals the lowest priority voice first', () => {
    const voices: ManagedVoice[] = [
      { id: '1', name: 'monster_roar', bus: 'monster', priority: 8, startTime: 10.0, stop: () => {} },
      { id: '2', name: 'step_dry', bus: 'sfx', priority: 5, startTime: 10.5, stop: () => {} },
      { id: '3', name: 'drip', bus: 'ambient', priority: 2, startTime: 11.0, stop: () => {} },
      { id: '4', name: 'ui_click', bus: 'ui', priority: 9, startTime: 11.5, stop: () => {} },
    ];

    const stolen = selectVoiceToSteal(voices);
    expect(stolen).not.toBeNull();
    expect(stolen?.id).toBe('3'); // Lowest priority is ambient (priority 2)
  });

  it('when priorities are equal, steals the oldest voice (smallest startTime)', () => {
    const voices: ManagedVoice[] = [
      { id: 'v1', name: 'drip_old', bus: 'ambient', priority: 2, startTime: 5.0, stop: () => {} },
      { id: 'v2', name: 'drip_new', bus: 'ambient', priority: 2, startTime: 8.5, stop: () => {} },
      { id: 'v3', name: 'step_1', bus: 'sfx', priority: 5, startTime: 4.0, stop: () => {} },
    ];

    const stolen = selectVoiceToSteal(voices);
    expect(stolen?.id).toBe('v1'); // Ambient priority 2 is lower than SFX 5; between v1 & v2, v1 is older
  });

  it('returns null on empty voice list', () => {
    expect(selectVoiceToSteal([])).toBeNull();
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
});

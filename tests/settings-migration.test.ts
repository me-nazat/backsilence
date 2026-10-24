import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, migrateSettings, clampSettings, defaultSettings } from '../src/app/Settings.js';
import type { Settings } from '../src/types/contracts.js';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

describe('Phase A3: Settings and Profile Migration & Resilience', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  it('loads pristine defaults when storage is empty', () => {
    const s = loadSettings(storage);
    expect(s.version).toBe(2);
    expect(s.graphics.fov).toBe(75);
    expect(s.audio.master).toBe(0.8);
  });

  it('migrates legacy poolrooms.settings.v1 without throwing', () => {
    const legacyV1 = {
      version: 1,
      graphics: { quality: 'high', fov: 90, brightness: 1.2 },
      audio: { master: 0.5 },
      controls: { sensitivity: 2.0 },
    };
    storage.setItem('poolrooms.settings.v1', JSON.stringify(legacyV1));

    const s = loadSettings(storage);
    expect(s.version).toBe(2);
    expect(s.graphics.quality).toBe('high');
    expect(s.graphics.fov).toBe(90);
    expect(s.graphics.brightness).toBe(1.2);
    expect(s.audio.master).toBe(0.5);
    expect(s.controls.sensitivity).toBe(2.0);
    // Legacy key should be purged and saved under v2 key
    expect(storage.getItem('poolrooms.settings.v1')).toBeNull();
    expect(storage.getItem('backsilence.settings.v2')).toBeTruthy();
  });

  it('migrates legacy backsilence.settings.v1 without throwing', () => {
    const v1 = {
      version: 1,
      graphics: { quality: 'low', fov: 65 },
      audio: { sfx: 0.3 },
      player: { name: 'Diver-99' },
    };
    storage.setItem('backsilence.settings.v1', JSON.stringify(v1));

    const s = loadSettings(storage);
    expect(s.version).toBe(2);
    expect(s.graphics.quality).toBe('low');
    expect(s.graphics.fov).toBe(65);
    expect(s.player.name).toBe('Diver-99');
    expect(s.audio.sfx).toBe(0.3);
  });

  it('handles corrupt JSON gracefully by returning defaults', () => {
    storage.setItem('backsilence.settings.v2', '{ not valid json ::: [[[');
    expect(() => loadSettings(storage)).not.toThrow();
    const s = loadSettings(storage);
    expect(s).toEqual(defaultSettings());
  });

  it('handles completely missing keys and null sub-objects without throwing', () => {
    const corruptShapes = [
      {},
      { version: 2 },
      { version: 2, graphics: null, audio: undefined },
      { version: 2, graphics: { fov: 'invalid' }, controls: { bindings: null } },
      { version: 1, graphics: 'corrupt_string', controls: 12345 },
    ];

    for (const shape of corruptShapes) {
      expect(() => migrateSettings(shape as Record<string, unknown>)).not.toThrow();
      const res = migrateSettings(shape as Record<string, unknown>);
      expect(res.version).toBe(2);
      expect(res.graphics).toBeDefined();
      expect(typeof res.graphics.fov).toBe('number');
      expect(res.audio).toBeDefined();
      expect(res.controls.bindings).toBeDefined();
    }
  });

  it('handles future versions (version 99) safely by falling back to clamped defaults', () => {
    const futureSettings = {
      version: 99,
      quantumGraphics: { rayTracing: true },
      graphics: { fov: 85, quality: 'ultra_hd_future' },
      audio: { master: 0.9 },
    };
    storage.setItem('backsilence.settings.v2', JSON.stringify(futureSettings));

    expect(() => loadSettings(storage)).not.toThrow();
    const s = loadSettings(storage);
    expect(s.version).toBe(2);
    expect(s.graphics.fov).toBe(85);
    // Invalid future quality falls back to auto
    expect(s.graphics.quality).toBe('auto');
    expect(s.audio.master).toBe(0.9);
  });
});

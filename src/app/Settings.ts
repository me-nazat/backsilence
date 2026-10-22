/* ── Settings.ts ──────────────────────────────────────────────────────────
 *  Settings with defaults, validation/clamping, versioned migration,
 *  and localStorage persistence.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Settings, Action, QualityTier } from '../types/contracts.js';

const STORAGE_KEY = 'poolrooms.settings.v1';

const QUALITY_TIERS: readonly QualityTier[] = ['auto', 'low', 'medium', 'high'];

/** Default key bindings. */
export const DEFAULT_BINDINGS: Record<Action, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  jump: 'Space',
  interact: 'KeyE',
  flashlight: 'KeyF',
  throw: 'KeyG',
  pause: 'Escape',
};

/** Full default settings object. */
export function defaultSettings(): Settings {
  return {
    version: 1,
    graphics: {
      quality: 'auto',
      resolutionScale: 1.0,
      fov: 75,
      brightness: 1.0,
      vhsIntensity: 0.5,
      headBob: true,
      reducedMotion: 'system',
      showFps: false,
    },
    audio: {
      master: 0.8,
      sfx: 1.0,
      ambient: 0.7,
      monster: 1.0,
      muteOnBlur: true,
      soundVisualizer: false,
    },
    controls: {
      sensitivity: 0.5,
      invertY: false,
      toggleCrouch: false,
      bindings: { ...DEFAULT_BINDINGS },
    },
    player: {
      name: '',
    },
  };
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Validate and clamp settings values to sane ranges. */
export function clampSettings(s: Settings): Settings {
  return {
    version: 1,
    graphics: {
      quality: QUALITY_TIERS.includes(s.graphics.quality) ? s.graphics.quality : 'auto',
      resolutionScale: clamp(s.graphics.resolutionScale, 0.25, 2.0),
      fov: clamp(s.graphics.fov, 50, 120),
      brightness: clamp(s.graphics.brightness, 0.2, 2.0),
      vhsIntensity: clamp(s.graphics.vhsIntensity, 0.0, 1.0),
      headBob: Boolean(s.graphics.headBob),
      reducedMotion:
        s.graphics.reducedMotion === 'system' ? 'system' : Boolean(s.graphics.reducedMotion),
      showFps: Boolean(s.graphics.showFps),
    },
    audio: {
      master: clamp(s.audio.master, 0.0, 1.0),
      sfx: clamp(s.audio.sfx, 0.0, 1.0),
      ambient: clamp(s.audio.ambient, 0.0, 1.0),
      monster: clamp(s.audio.monster, 0.0, 1.0),
      muteOnBlur: Boolean(s.audio.muteOnBlur),
      soundVisualizer: Boolean(s.audio.soundVisualizer),
    },
    controls: {
      sensitivity: clamp(s.controls.sensitivity, 0.05, 2.0),
      invertY: Boolean(s.controls.invertY),
      toggleCrouch: Boolean(s.controls.toggleCrouch),
      bindings: { ...DEFAULT_BINDINGS, ...s.controls.bindings },
    },
    player: {
      name: typeof s.player.name === 'string' ? s.player.name.slice(0, 32) : '',
    },
  };
}

/**
 * Migrate settings from older versions. Currently only version 1 exists,
 * so this is a forward-compatible stub.
 */
export function migrateSettings(raw: Record<string, unknown>): Settings {
  const version = typeof raw['version'] === 'number' ? raw['version'] : 0;

  if (version === 1) {
    // Current version — validate and return
    return clampSettings(raw as unknown as Settings);
  }

  // Unknown or missing version — return defaults
  return defaultSettings();
}

/** Load settings from localStorage, returning defaults on any failure. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaultSettings();
    return migrateSettings(parsed as Record<string, unknown>);
  } catch {
    return defaultSettings();
  }
}

/** Save settings to localStorage. Silently ignores errors (private mode). */
export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing mode may throw — silently ignore.
  }
}

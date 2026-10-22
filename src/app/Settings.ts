/* ── Settings.ts ──────────────────────────────────────────────────────────
 *  Settings with defaults, validation/clamping, versioned migration,
 *  and localStorage persistence.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Settings, Action, QualityTier } from '../types/contracts.js';

const STORAGE_KEY = 'backsilence.settings.v1';
const LEGACY_STORAGE_KEY = 'poolrooms.settings.v1';

const QUALITY_TIERS: readonly QualityTier[] = ['auto', 'low', 'medium', 'high'];

/** Default key bindings. */
export const DEFAULT_BINDINGS: Record<Action, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  jump: 'Space',
  interact: 'KeyE',
  flashlight: 'KeyF',
  throw: 'KeyG',
  crank: 'KeyR',
  cycleItem: 'KeyC',
  pause: 'Escape',
};

/** Full default settings object. */
export function defaultSettings(): Settings {
  return {
    version: 1,
    graphics: {
      quality: 'auto',
      resolutionScale: 100, // Percentage 50-100%
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
      sensitivity: 1.0,
      invertY: false,
      toggleCrouch: false,
      bindings: { ...DEFAULT_BINDINGS },
    },
    accessibility: {
      reducedMotion: 'system',
      uiScale: 1.0,
      highContrast: false,
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
      resolutionScale: clamp(s.graphics.resolutionScale, 50, 100),
      fov: clamp(s.graphics.fov, 60, 100),
      brightness: clamp(s.graphics.brightness, 0.8, 1.4),
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
      sensitivity: clamp(s.controls.sensitivity, 0.1, 3.0),
      invertY: Boolean(s.controls.invertY),
      toggleCrouch: Boolean(s.controls.toggleCrouch),
      bindings: { ...DEFAULT_BINDINGS, ...s.controls.bindings },
    },
    accessibility: {
      reducedMotion: ['system', 'on', 'off'].includes(s.accessibility?.reducedMotion)
        ? s.accessibility.reducedMotion
        : 'system',
      uiScale: clamp(s.accessibility?.uiScale ?? 1.0, 0.75, 1.5),
      highContrast: Boolean(s.accessibility?.highContrast),
    },
    player: {
      name: typeof s.player.name === 'string' ? s.player.name.slice(0, 32) : '',
    },
  };
}

/**
 * Check for duplicate key binding conflicts.
 * Returns the conflicting Action if found, or null if clean.
 */
export function findBindingConflict(
  bindings: Record<Action, string>,
  targetAction: Action,
  key: string,
): Action | null {
  for (const [actionKey, boundKey] of Object.entries(bindings)) {
    if (actionKey !== targetAction && boundKey === key) {
      return actionKey as Action;
    }
  }
  return null;
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

function getStorage(customStorage?: Storage | null): Storage | null {
  if (customStorage !== undefined) return customStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

/** Load settings from localStorage or provided Storage, migrating legacy keys if present. */
export function loadSettings(customStorage?: Storage | null): Settings {
  try {
    const storage = getStorage(customStorage);
    if (!storage) return defaultSettings();

    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      // Check for legacy Prompt 0 / Batch 1 storage key
      const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        try {
          const parsedLegacy: unknown = JSON.parse(legacyRaw);
          if (typeof parsedLegacy === 'object' && parsedLegacy !== null) {
            const migrated = migrateSettings(parsedLegacy as Record<string, unknown>);
            saveSettings(migrated, storage);
            storage.removeItem(LEGACY_STORAGE_KEY);
            return migrated;
          }
        } catch {
          storage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
      return defaultSettings();
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaultSettings();
    return migrateSettings(parsed as Record<string, unknown>);
  } catch {
    return defaultSettings();
  }
}

/** Save settings to localStorage or provided Storage. Silently ignores errors (private mode). */
export function saveSettings(settings: Settings, customStorage?: Storage | null): void {
  try {
    const storage = getStorage(customStorage);
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing mode may throw — silently ignore.
  }
}

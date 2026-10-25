/* ── Settings.ts ──────────────────────────────────────────────────────────
 *  Settings with defaults, validation/clamping, versioned migration,
 *  and localStorage persistence.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Settings, Action, QualityTier } from '../types/contracts.js';

const STORAGE_KEY = 'backsilence.settings.v2';
const LEGACY_STORAGE_V1 = 'backsilence.settings.v1';
const LEGACY_STORAGE_KEY = 'poolrooms.settings.v1';

const QUALITY_TIERS: readonly QualityTier[] = ['auto', 'low', 'medium', 'high'];
const OUTPUT_PROFILES = ['headphones', 'speakers', 'phone', 'night', 'mono'] as const;

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
  ping: 'KeyV',
  pause: 'Escape',
};

/** Full default settings object. */
export function defaultSettings(): Settings {
  return {
    version: 2,
    graphics: {
      quality: 'auto',
      resolutionScale: 100, // Percentage 50-100%
      fov: 75,
      brightness: 1.0,
      vhsIntensity: 0.5,
      headBob: true,
      reducedMotion: 'system',
      showFps: false,
      photosensitiveSafe: false,
      vhsOsd: true,
      vhsLines: 240,
      fpsCap: 0,
    },
    audio: {
      master: 0.8,
      sfx: 1.0,
      ambient: 0.7,
      monster: 1.0,
      muteOnBlur: true,
      soundVisualizer: false,
      outputProfile: 'headphones',
    },
    controls: {
      sensitivity: 1.0,
      invertY: false,
      toggleCrouch: false,
      toggleSprint: false,
      unadjustedMovement: true,
      haptics: true,
      autoSprint: false,
      autoCrouch: false,
      touchScale: 1.0,
      bindings: { ...DEFAULT_BINDINGS },
    },
    accessibility: {
      reducedMotion: 'system',
      uiScale: 1.0,
      highContrast: false,
      minimalHud: false,
    },
    player: {
      name: '',
    },
    net: {
      interpolationBias: 0,
      showNetStats: false,
    },
    creatures: {
      waterMonsterSkin: 'auto',
      ambientFlyers: 5,
    },
  };
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Validate and clamp settings values to sane ranges. Guaranteed never to throw. */
export function clampSettings(s: Settings): Settings {
  const def = defaultSettings();
  const g = s?.graphics ?? def.graphics;
  const a = s?.audio ?? def.audio;
  const c = s?.controls ?? def.controls;
  const acc = s?.accessibility ?? def.accessibility;
  const p = s?.player ?? def.player;
  const n = s?.net ?? def.net;
  const cr = s?.creatures ?? def.creatures;

  return {
    version: 2,
    graphics: {
      quality: QUALITY_TIERS.includes(g?.quality) ? g.quality : 'auto',
      resolutionScale: clamp(typeof g?.resolutionScale === 'number' ? g.resolutionScale : 100, 50, 100),
      fov: clamp(typeof g?.fov === 'number' ? g.fov : 75, 60, 100),
      brightness: clamp(typeof g?.brightness === 'number' ? g.brightness : 1.0, 0.8, 1.4),
      vhsIntensity: clamp(typeof g?.vhsIntensity === 'number' ? g.vhsIntensity : 0.5, 0.0, 1.0),
      headBob: Boolean(g?.headBob ?? true),
      reducedMotion:
        g?.reducedMotion === 'system' ? 'system' : Boolean(g?.reducedMotion),
      showFps: Boolean(g?.showFps),
      photosensitiveSafe: Boolean(g?.photosensitiveSafe),
      vhsOsd: g?.vhsOsd !== undefined ? Boolean(g.vhsOsd) : true,
      vhsLines: g?.vhsLines === 360 || g?.vhsLines === 480 ? g.vhsLines : 240,
    },
    audio: {
      master: clamp(typeof a?.master === 'number' ? a.master : 0.8, 0.0, 1.0),
      sfx: clamp(typeof a?.sfx === 'number' ? a.sfx : 1.0, 0.0, 1.0),
      ambient: clamp(typeof a?.ambient === 'number' ? a.ambient : 0.7, 0.0, 1.0),
      monster: clamp(typeof a?.monster === 'number' ? a.monster : 1.0, 0.0, 1.0),
      muteOnBlur: Boolean(a?.muteOnBlur ?? true),
      soundVisualizer: Boolean(a?.soundVisualizer),
      outputProfile: typeof a?.outputProfile === 'string' && (OUTPUT_PROFILES as readonly string[]).includes(a.outputProfile)
        ? a.outputProfile
        : 'headphones',
    },
    controls: {
      sensitivity: clamp(typeof c?.sensitivity === 'number' ? c.sensitivity : 1.0, 0.1, 3.0),
      invertY: Boolean(c?.invertY),
      toggleCrouch: Boolean(c?.toggleCrouch),
      toggleSprint: Boolean(c?.toggleSprint),
      unadjustedMovement: c?.unadjustedMovement !== undefined ? Boolean(c.unadjustedMovement) : true,
      haptics: c?.haptics !== undefined ? Boolean(c.haptics) : true,
      autoSprint: Boolean(c?.autoSprint),
      autoCrouch: Boolean(c?.autoCrouch),
      touchScale: clamp(typeof c?.touchScale === 'number' ? c.touchScale : 1.0, 0.75, 1.5),
      bindings: { ...DEFAULT_BINDINGS, ...(c?.bindings ?? {}) },
    },
    accessibility: {
      reducedMotion: ['system', 'on', 'off'].includes(acc?.reducedMotion)
        ? acc.reducedMotion
        : 'system',
      uiScale: clamp(typeof acc?.uiScale === 'number' ? acc.uiScale : 1.0, 0.75, 2.0),
      highContrast: Boolean(acc?.highContrast),
      minimalHud: Boolean(acc?.minimalHud),
    },
    player: {
      name: typeof p?.name === 'string' ? p.name.slice(0, 32) : '',
    },
    net: {
      interpolationBias: clamp(typeof n?.interpolationBias === 'number' ? n.interpolationBias : 0, -50, 100),
      showNetStats: Boolean(n?.showNetStats),
    },
    creatures: {
      waterMonsterSkin: (['auto', 'model', 'procedural'].includes(cr?.waterMonsterSkin as string)
        ? cr?.waterMonsterSkin
        : 'auto') as 'auto' | 'model' | 'procedural',
      ambientFlyers: clamp(typeof cr?.ambientFlyers === 'number' ? cr.ambientFlyers : 5, 0, 5),
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
 * Migrate settings from older versions (v1 -> v2) or handle corrupt/future shapes safely.
 */
export function migrateSettings(raw: Record<string, unknown>): Settings {
  if (!raw || typeof raw !== 'object') {
    return defaultSettings();
  }
  const version = typeof raw['version'] === 'number' ? raw['version'] : 0;
  const def = defaultSettings();

  if (version === 2) {
    return clampSettings(raw as unknown as Settings);
  }

  // Version 1, 0, or future version: merge safely with defaults
  const rawGraphics = (typeof raw['graphics'] === 'object' && raw['graphics'] !== null ? raw['graphics'] : {}) as Record<string, unknown>;
  const rawAudio = (typeof raw['audio'] === 'object' && raw['audio'] !== null ? raw['audio'] : {}) as Record<string, unknown>;
  const rawControls = (typeof raw['controls'] === 'object' && raw['controls'] !== null ? raw['controls'] : {}) as Record<string, unknown>;
  const rawAccess = (typeof raw['accessibility'] === 'object' && raw['accessibility'] !== null ? raw['accessibility'] : {}) as Record<string, unknown>;
  const rawPlayer = (typeof raw['player'] === 'object' && raw['player'] !== null ? raw['player'] : {}) as Record<string, unknown>;

  const merged: Settings = {
    version: 2,
    graphics: {
      ...def.graphics,
      ...(rawGraphics as unknown as Settings['graphics']),
    },
    audio: {
      ...def.audio,
      ...(rawAudio as unknown as Settings['audio']),
    },
    controls: {
      ...def.controls,
      bindings: {
        ...DEFAULT_BINDINGS,
        ...((typeof rawControls['bindings'] === 'object' && rawControls['bindings'] !== null ? rawControls['bindings'] : {}) as Record<Action, string>),
      },
      sensitivity: typeof rawControls['sensitivity'] === 'number' ? rawControls['sensitivity'] : def.controls.sensitivity,
      invertY: typeof rawControls['invertY'] === 'boolean' ? rawControls['invertY'] : def.controls.invertY,
      toggleCrouch: typeof rawControls['toggleCrouch'] === 'boolean' ? rawControls['toggleCrouch'] : def.controls.toggleCrouch,
    },
    accessibility: {
      ...def.accessibility,
      ...(rawAccess as unknown as Settings['accessibility']),
    },
    player: {
      ...def.player,
      ...(rawPlayer as unknown as Settings['player']),
    },
    net: {
      ...def.net!,
    },
    creatures: {
      ...def.creatures!,
    },
  };

  return clampSettings(merged);
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
      const v1Raw = storage.getItem(LEGACY_STORAGE_V1);
      if (v1Raw) {
        try {
          const parsedV1: unknown = JSON.parse(v1Raw);
          if (typeof parsedV1 === 'object' && parsedV1 !== null) {
            const migrated = migrateSettings(parsedV1 as Record<string, unknown>);
            saveSettings(migrated, storage);
            return migrated;
          }
        } catch {
          // ignore
        }
      }
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

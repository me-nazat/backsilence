/* ── ProfilePersistence.ts ────────────────────────────────────────────────
 *  Versioned player profile persistence in localStorage (key: backsilence.profile.v1).
 *  Handles data migrations, corrupt state recovery, size capping,
 *  and export/import via compact Recovery Code JSON.
 *  Safe in both browser and headless Node environments (graceful memory fallback).
 * ──────────────────────────────────────────────────────────────────────── */

import type { PlayerLoadout } from './Loadout.js';
import type { MapId } from '../types/contracts.js';
import { IdentityManager } from './Identity.js';

export const PROFILE_STORAGE_KEY = 'backsilence.profile.v1';
export const PROFILE_SCHEMA_VERSION = 1;
export const MAX_PROFILE_JSON_BYTES = 256 * 1024; // 256 KB safety cap

export interface MapPersonalBest {
  bestTimeSec: number;
  bestScore: number;
  bestRank: string;
  starsEarned: number;
  completedCount: number;
}

export interface PlayerProfileData {
  version: number;
  updatedAt: string;
  initials: string;
  xp: number;
  level: number;
  staticBalance: number;
  silenceRating: number;
  rankTier: string;
  campaignStars: Record<number, number>; // tapeNumber -> stars
  unlockedTapes: number[];
  completedObjectives: Record<number, string[]>; // tapeNumber -> objectiveIds
  tapeReelsCollected: string[];
  activeMissions: Array<{
    templateKey: string;
    targetCount: number;
    currentProgress: number;
    completed: boolean;
  }>;
  dailyStreak: number;
  lastDailyDateKey: string;
  ownedCosmetics: string[];
  equippedCosmetics: {
    flashlightSkin: string;
    jacketColor: string;
    hoodStyle: string;
    splashTint: string;
    tapeLabel: string;
    nameplate: string;
  };
  activeLoadout: PlayerLoadout;
  unlockedAchievements: string[];
  personalBests: Partial<Record<MapId, MapPersonalBest>>;
  stats: {
    totalEscapes: number;
    totalDeaths: number;
    totalNoiseUnits: number;
    coopWins: number;
    lastOneDryWins: number;
    successfulHaunts: number;
    ghostDefeated: boolean;
    isChampion: boolean;
  };
}

export function createDefaultProfile(): PlayerProfileData {
  return {
    version: PROFILE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    initials: 'ARC',
    xp: 0,
    level: 1,
    staticBalance: 0,
    silenceRating: 1000,
    rankTier: 'Hush',
    campaignStars: { 0: 3 },
    unlockedTapes: [0, 1],
    completedObjectives: {},
    tapeReelsCollected: [],
    activeMissions: [],
    dailyStreak: 0,
    lastDailyDateKey: '',
    ownedCosmetics: ['flashlight_default', 'jacket_navy', 'hood_standard', 'splash_default', 'label_white', 'plate_blank'],
    equippedCosmetics: {
      flashlightSkin: 'flashlight_default',
      jacketColor: 'jacket_navy',
      hoodStyle: 'hood_standard',
      splashTint: 'splash_default',
      tapeLabel: 'label_white',
      nameplate: 'plate_blank',
    },
    activeLoadout: {
      active1: 'pebble_pouch',
      active2: 'glow_sticks',
      passive: 'steady_breath',
    },
    unlockedAchievements: [],
    personalBests: {},
    stats: {
      totalEscapes: 0,
      totalDeaths: 0,
      totalNoiseUnits: 0,
      coopWins: 0,
      lastOneDryWins: 0,
      successfulHaunts: 0,
      ghostDefeated: false,
      isChampion: false,
    },
  };
}

// In-memory fallback if localStorage is unavailable
let memoryProfileCache: PlayerProfileData | null = null;
let cloudSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCloudProfileSync(profile: PlayerProfileData): void {
  try {
    if (!IdentityManager || typeof IdentityManager.isAuthenticated !== 'function') return;
    if (!IdentityManager.isAuthenticated()) return;

    IdentityManager.updateLocalAccountMirror(profile);

    if (cloudSyncDebounceTimer !== null) {
      clearTimeout(cloudSyncDebounceTimer);
    }
    cloudSyncDebounceTimer = setTimeout(() => {
      cloudSyncDebounceTimer = null;
      void IdentityManager.syncProfileNow(profile).catch(() => {
        // Non-blocking background sync
      });
    }, 1500);
  } catch {
    // Ignore if IdentityManager is not yet initialized
  }
}

export const ProfileStore = {
  /**
   * Loads the current profile from localStorage, applying migrations if necessary.
   * Recovers gracefully with defaults if data is corrupt.
   */
  load(): PlayerProfileData {
    if (typeof localStorage === 'undefined') {
      if (!memoryProfileCache) {
        memoryProfileCache = createDefaultProfile();
      }
      return memoryProfileCache;
    }

    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) {
        const fresh = createDefaultProfile();
        ProfileStore.save(fresh);
        return fresh;
      }

      const parsed = JSON.parse(raw) as Partial<PlayerProfileData>;
      const migrated = ProfileStore.migrate(parsed);
      return migrated;
    } catch (err) {
      console.warn('[ProfileStore] Corrupt profile detected, recovering to default state', err);
      const fallback = createDefaultProfile();
      try {
        ProfileStore.save(fallback);
      } catch {
        // ignore storage quota issues
      }
      return fallback;
    }
  },

  /**
   * Saves profile to localStorage with size validation.
   */
  save(profile: PlayerProfileData): boolean {
    profile.updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(profile);

    if (serialized.length > MAX_PROFILE_JSON_BYTES) {
      console.error(`[ProfileStore] Profile exceeds maximum allowed size (${serialized.length} > ${MAX_PROFILE_JSON_BYTES})`);
      return false;
    }

    if (typeof localStorage === 'undefined') {
      memoryProfileCache = profile;
      scheduleCloudProfileSync(profile);
      return true;
    }

    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, serialized);
      scheduleCloudProfileSync(profile);
      return true;
    } catch (err) {
      console.error('[ProfileStore] Failed to write profile to localStorage', err);
      memoryProfileCache = profile;
      scheduleCloudProfileSync(profile);
      return false;
    }
  },

  /**
   * Migrates older schemas to current PROFILE_SCHEMA_VERSION.
   */
  migrate(data: Partial<PlayerProfileData>): PlayerProfileData {
    const defaults = createDefaultProfile();
    if (!data || typeof data !== 'object') return defaults;

    // Merge recursively with defaults to ensure all fields are present
    return {
      ...defaults,
      ...data,
      version: PROFILE_SCHEMA_VERSION,
      stats: {
        ...defaults.stats,
        ...(data.stats ?? {}),
      },
      equippedCosmetics: {
        ...defaults.equippedCosmetics,
        ...(data.equippedCosmetics ?? {}),
      },
      activeLoadout: {
        ...defaults.activeLoadout,
        ...(data.activeLoadout ?? {}),
      },
      campaignStars: {
        ...defaults.campaignStars,
        ...(data.campaignStars ?? {}),
      },
      personalBests: {
        ...defaults.personalBests,
        ...(data.personalBests ?? {}),
      },
    };
  },

  /**
   * Generates a copyable JSON recovery code.
   */
  exportRecoveryCode(profile: PlayerProfileData): string {
    return JSON.stringify({
      sig: 'BACKSILENCE_RECOVERY_CODE',
      data: profile,
    });
  },

  /**
   * Imports a recovery code with validation.
   */
  importRecoveryCode(codeStr: string): PlayerProfileData {
    const parsed = JSON.parse(codeStr) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('sig' in parsed) ||
      (parsed as { sig: string }).sig !== 'BACKSILENCE_RECOVERY_CODE' ||
      !('data' in parsed)
    ) {
      throw new Error('Invalid BackSilence Recovery Code format');
    }
    const validated = ProfileStore.migrate((parsed as { data: Partial<PlayerProfileData> }).data);
    ProfileStore.save(validated);
    return validated;
  },
};


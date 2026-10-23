/* ── Progression.ts ────────────────────────────────────────────────────────
 *  XP calculation, level curve (1–60), and unlock resolution.
 *  Pure, deterministic, zero dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import unlockTable from './unlocks.json' with { type: 'json' };

export interface LevelUnlock {
  level: number;
  rewardType: 'loadout' | 'passive' | 'mutator' | 'mode' | 'cosmetic' | 'prestige';
  rewardId: string;
  name: string;
}

export const MAX_LEVEL = 60;

/**
 * Total cumulative XP required to reach a specific level.
 */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  const l = Math.min(level, MAX_LEVEL);
  // Quadratic curve: level 2 = 200, level 10 = ~3,200, level 60 = ~85,000
  let sum = 0;
  for (let i = 1; i < l; i++) {
    sum += Math.round(180 + i * 28);
  }
  return sum;
}

export function calculateLevelFromXp(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  isMaxLevel: boolean;
} {
  let level = 1;
  while (level < MAX_LEVEL && totalXp >= xpRequiredForLevel(level + 1)) {
    level++;
  }

  const currentThreshold = xpRequiredForLevel(level);
  const nextThreshold = level < MAX_LEVEL ? xpRequiredForLevel(level + 1) : currentThreshold;
  const range = nextThreshold - currentThreshold;
  const currentLevelXp = totalXp - currentThreshold;
  const progressPercent = range > 0 ? Math.min(100, (currentLevelXp / range) * 100) : 100;

  return {
    level,
    currentLevelXp,
    nextLevelXp: range,
    progressPercent: Number(progressPercent.toFixed(1)),
    isMaxLevel: level >= MAX_LEVEL,
  };
}

export function computeRunXp(finalScore: number, objectivesDone: number, isFirstDailyWin = false): number {
  const base = Math.floor(finalScore / 10);
  const objBonus = objectivesDone * 25;
  const dailyBonus = isFirstDailyWin ? 50 : 0;
  return Math.max(0, base + objBonus + dailyBonus);
}

export function getUnlocksUpToLevel(level: number): LevelUnlock[] {
  return (unlockTable.levels as LevelUnlock[]).filter((u) => u.level <= level);
}

export function isItemUnlockedAtLevel(rewardId: string, level: number): boolean {
  const entry = (unlockTable.levels as LevelUnlock[]).find((u) => u.rewardId === rewardId);
  if (!entry) return true; // Items not in the unlock table are unlocked by default
  return level >= entry.level;
}

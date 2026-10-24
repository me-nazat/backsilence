/* ── RatingElo.ts ──────────────────────────────────────────────────────────
 *  Silence Rating (SR) Elo calculation for 2–4 player competitive matches.
 *  Uses pairwise outcome comparisons with K=24 (K=40 for first 5 placements),
 *  rank tiering, inactivity decay, and season compression.
 *  Pure, deterministic, zero DOM/Three dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import { dPow } from '../sim/dmath.js';

export type RankBracket = 'Whisper' | 'Hush' | 'Mute' | 'Silent' | 'Phantom';

export interface PlayerRating {
  sr: number; // Silence Rating
  matchesPlayed: number;
  lastMatchDateKey: string;
}

export const K_FACTOR_STANDARD = 24;
export const K_FACTOR_PLACEMENT = 40;
export const DEFAULT_STARTING_SR = 1000;
export const PLACEMENT_MATCHES_COUNT = 5;
export const SEASON_TRACK_TIERS = 30;
export const SEASON_XP_PER_TIER = 1000;

export function getRankBracket(sr: number): RankBracket {
  if (sr >= 1900) return 'Phantom';
  if (sr >= 1600) return 'Silent';
  if (sr >= 1300) return 'Mute';
  if (sr >= 1000) return 'Hush';
  return 'Whisper';
}

/**
 * Expected score of player A against player B using logistic curve:
 * E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 * Uses deterministic dPow to guarantee cross-engine reproducibility.
 */
export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1.0 / (1.0 + dPow(10, (ratingB - ratingA) / 400.0));
}

export interface EloMatchParticipant {
  id: string;
  sr: number;
  matchesPlayed?: number;
}

export interface EloMatchResult {
  oldSr: number;
  newSr: number;
  delta: number;
  kUsed: number;
}

/**
 * Multi-player Elo update using pairwise comparison.
 * @param players List of players ordered by finish placement (index 0 = 1st place).
 */
export function calculateMatchEloUpdates(
  players: EloMatchParticipant[],
): Map<string, EloMatchResult> {
  const updates = new Map<string, EloMatchResult>();
  const n = players.length;
  if (n < 2) return updates;

  const deltas = new Map<string, number>();
  for (const p of players) {
    deltas.set(p.id, 0);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pA = players[i]!;
      const pB = players[j]!;

      const kA = (pA.matchesPlayed !== undefined && pA.matchesPlayed < PLACEMENT_MATCHES_COUNT)
        ? K_FACTOR_PLACEMENT
        : K_FACTOR_STANDARD;
      const kB = (pB.matchesPlayed !== undefined && pB.matchesPlayed < PLACEMENT_MATCHES_COUNT)
        ? K_FACTOR_PLACEMENT
        : K_FACTOR_STANDARD;

      const effKA = kA / (n - 1);
      const effKB = kB / (n - 1);

      const expA = calculateExpectedScore(pA.sr, pB.sr);
      const expB = 1.0 - expA;

      // pA placed ahead of pB (1st vs 2nd, etc.)
      const changeA = effKA * (1.0 - expA);
      const changeB = effKB * (0.0 - expB);

      deltas.set(pA.id, (deltas.get(pA.id) ?? 0) + changeA);
      deltas.set(pB.id, (deltas.get(pB.id) ?? 0) + changeB);
    }
  }

  for (const p of players) {
    const rawDelta = deltas.get(p.id) ?? 0;
    const roundedDelta = Math.round(rawDelta);
    const newSr = Math.max(0, p.sr + roundedDelta);
    const kUsed = (p.matchesPlayed !== undefined && p.matchesPlayed < PLACEMENT_MATCHES_COUNT)
      ? K_FACTOR_PLACEMENT
      : K_FACTOR_STANDARD;

    updates.set(p.id, {
      oldSr: p.sr,
      newSr,
      delta: roundedDelta,
      kUsed,
    });
  }

  return updates;
}

/**
 * Ranked quit rule resolution:
 * - Quit before first noise made is treated as a draw (no SR penalty).
 * - Quit after first noise counts as last place.
 */
export function resolveRankedQuitOutcome(
  players: Array<{
    id: string;
    sr: number;
    matchesPlayed?: number;
    hasQuit: boolean;
    madeNoise: boolean;
    placement?: number; // 1-indexed placement if finished
  }>,
): EloMatchParticipant[] {
  // Filter out any player who quit before making any noise (draw / voided match for them)
  const activeAndPenalized = players.filter((p) => !(p.hasQuit && !p.madeNoise));

  // Sort active players: non-quitters by placement, quitters after noise at the very end
  return activeAndPenalized
    .sort((a, b) => {
      if (a.hasQuit && !b.hasQuit) return 1;
      if (!a.hasQuit && b.hasQuit) return -1;
      return (a.placement ?? 999) - (b.placement ?? 999);
    })
    .map((p) => ({
      id: p.id,
      sr: p.sr,
      ...(p.matchesPlayed !== undefined ? { matchesPlayed: p.matchesPlayed } : {}),
    }));
}

/**
 * Weekly decay: -10 SR/week above 1500, with a floor of 1500.
 */
export function applyWeeklyDecay(sr: number, weeksInactive: number): number {
  if (sr <= 1500 || weeksInactive <= 0) return sr;
  const decay = weeksInactive * 10;
  return Math.max(1500, sr - decay);
}

/**
 * Season end compression:
 * SR compresses 25% toward 1000 at season end (4 weeks).
 */
export function applySeasonCompression(sr: number): number {
  const delta = sr - 1000;
  return Math.round(1000 + delta * 0.75);
}

export interface WeeklyBoardEntry {
  playerId: string;
  verified: boolean;
  rankedEligible: boolean;
  score: number;
  noiseUnits: number;
  submittedAtTickOrTime: number;
}

/**
 * Weekly Champion: best verified, ranked-eligible score of the week.
 * Tie-breaks: lower noise units, then earlier submission.
 */
export function determineWeeklyChampion(entries: WeeklyBoardEntry[]): WeeklyBoardEntry | null {
  const eligible = entries.filter((e) => e.verified && e.rankedEligible);
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.noiseUnits !== b.noiseUnits) return a.noiseUnits - b.noiseUnits;
    return a.submittedAtTickOrTime - b.submittedAtTickOrTime;
  });

  return eligible[0] ?? null;
}

export interface SeasonLadderPlayer {
  playerId: string;
  rankedMatches: number;
  sr: number;
  noiseUnits: number;
  earliestRankDate: number;
}

/**
 * Season Champion: highest SR among players with at least 20 ranked matches, over a 4-week season.
 * Tie-breaks: lower noise units, then earlier submission.
 */
export function determineSeasonChampion(players: SeasonLadderPlayer[]): SeasonLadderPlayer | null {
  const qualified = players.filter((p) => p.rankedMatches >= 20);
  if (qualified.length === 0) return null;

  qualified.sort((a, b) => {
    if (b.sr !== a.sr) return b.sr - a.sr;
    if (a.noiseUnits !== b.noiseUnits) return a.noiseUnits - b.noiseUnits;
    return a.earliestRankDate - b.earliestRankDate;
  });

  return qualified[0] ?? null;
}

export interface ChampionReward {
  title: string;
  profileBanner: string;
  hallOfFameEntry: boolean;
  ghostEligible: boolean;
}

export function generateChampionRewards(type: 'weekly' | 'season', name: string): ChampionReward {
  return {
    title: type === 'season' ? `Season Champion - ${name}` : `Weekly Champion - ${name}`,
    profileBanner: type === 'season' ? 'banner_season_champion' : 'banner_weekly_champion',
    hallOfFameEntry: true,
    ghostEligible: true,
  };
}

/**
 * Season Track: 30 tiers, free cosmetic rewards only, XP from runs and missions.
 */
export interface SeasonTrackTier {
  tier: number;
  requiredXp: number;
  rewardCosmeticId: string;
  rewardTitle: string;
}

export function generateSeasonTrack(): SeasonTrackTier[] {
  const cosmeticIds = [
    'jacket_slate', 'tape_clean', 'emote_wave', 'splash_cyan', 'nameplate_hush',
    'hood_standard', 'jacket_amber', 'emote_shush', 'tape_grain', 'splash_phosphor',
    'nameplate_mute', 'jacket_navy', 'emote_point', 'tape_worn', 'splash_gold',
    'hood_deep', 'jacket_camo', 'emote_thumbs_up', 'tape_label_archivist', 'splash_emerald',
    'nameplate_silent', 'jacket_carbon', 'duck_flashlight', 'tape_label_classified', 'splash_ruby',
    'hood_phantom', 'jacket_monochrome', 'nameplate_phantom', 'tape_label_master', 'champion_crest',
  ];

  const tiers: SeasonTrackTier[] = [];
  for (let i = 1; i <= SEASON_TRACK_TIERS; i++) {
    tiers.push({
      tier: i,
      requiredXp: i * SEASON_XP_PER_TIER,
      rewardCosmeticId: cosmeticIds[i - 1] ?? `cosmetic_tier_${i}`,
      rewardTitle: `Season Tier ${i} Reward`,
    });
  }
  return tiers;
}

export const RatingSystem = {
  computePlacementsElo(players: Array<{ id: string; rating: number; matchesPlayed?: number }>): Map<string, number> {
    const list = players.map((p) => ({
      id: p.id,
      sr: p.rating,
      ...(p.matchesPlayed !== undefined ? { matchesPlayed: p.matchesPlayed } : {}),
    }));
    const updates = calculateMatchEloUpdates(list);
    const deltas = new Map<string, number>();
    for (const [id, u] of updates.entries()) {
      deltas.set(id, u.delta);
    }
    return deltas;
  },

  getTier(rating: number): RankBracket {
    return getRankBracket(rating);
  },
};



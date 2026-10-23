/* ── RatingElo.ts ──────────────────────────────────────────────────────────
 *  Silence Rating (SR) Elo calculation for 2–4 player competitive matches.
 *  Uses pairwise outcome comparisons with K=24 and rank tiering.
 *  Pure, deterministic, zero dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

export type RankBracket = 'Whisper' | 'Hush' | 'Mute' | 'Silent' | 'Phantom';

export interface PlayerRating {
  sr: number; // Silence Rating
  matchesPlayed: number;
  lastMatchDateKey: string;
}

export const K_FACTOR = 24;
export const DEFAULT_STARTING_SR = 1000;
export const PLACEMENT_MATCHES_COUNT = 5;

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
 */
export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1.0 / (1.0 + Math.pow(10, (ratingB - ratingA) / 400.0));
}

/**
 * Multi-player Elo update using pairwise comparison.
 * @param players List of players ordered by finish placement (index 0 = 1st place).
 */
export function calculateMatchEloUpdates(
  players: Array<{ id: string; sr: number }>,
): Map<string, { oldSr: number; newSr: number; delta: number }> {
  const updates = new Map<string, { oldSr: number; newSr: number; delta: number }>();
  const n = players.length;
  if (n < 2) return updates;

  // Pairwise outcomes:
  // For each pair (i, j) with i < j, i placed better than j (actual outcome S_ij = 1.0, S_ji = 0.0)
  const deltas = new Map<string, number>();
  for (const p of players) {
    deltas.set(p.id, 0);
  }

  const effectiveK = K_FACTOR / (n - 1);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pA = players[i]!;
      const pB = players[j]!;

      const expA = calculateExpectedScore(pA.sr, pB.sr);
      const expB = 1.0 - expA;

      // pA placed ahead of pB
      const changeA = effectiveK * (1.0 - expA);
      const changeB = effectiveK * (0.0 - expB);

      deltas.set(pA.id, (deltas.get(pA.id) ?? 0) + changeA);
      deltas.set(pB.id, (deltas.get(pB.id) ?? 0) + changeB);
    }
  }

  for (const p of players) {
    const rawDelta = deltas.get(p.id) ?? 0;
    const roundedDelta = Math.round(rawDelta);
    const newSr = Math.max(0, p.sr + roundedDelta);
    updates.set(p.id, {
      oldSr: p.sr,
      newSr,
      delta: roundedDelta,
    });
  }

  return updates;
}

/**
 * Weekly decay: -10 SR/week above 1500, with a floor of 1500.
 */
export function applyWeeklyDecay(sr: number, weeksInactive: number): number {
  if (sr <= 1500 || weeksInactive <= 0) return sr;
  const decay = weeksInactive * 10;
  return Math.max(1500, sr - decay);
}

export const RatingSystem = {
  computePlacementsElo(players: Array<{ id: string; rating: number }>): Map<string, number> {
    const list = players.map((p) => ({ id: p.id, sr: p.rating }));
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


/* ── Scoring.ts ────────────────────────────────────────────────────────────
 *  Pure, deterministic scoring engine and Death Replay Line generator.
 *  Zero Three.js or DOM dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import balanceData from '../sim/balance.json' with { type: 'json' };
import type { RunEvent, DeathEvent } from './RunEvents.js';

export type DifficultyTier = 'whisper' | 'normal' | 'deafening' | 'nightmare';
export type RankTier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface ScoreInputs {
  mapId: string;
  difficulty: DifficultyTier;
  elapsedSeconds: number;
  noiseUnits: number;
  secondariesDone: number;
  hiddenDone: number;
  cleanJumps: number;
  lurksSurvivedGte8s: number;
  lureSuccesses: number;
  nearMissesUnder2m: number;
  deaths: number;
  mutatorMultiplier?: number;
  hasAssists?: boolean;
  isStandardLoadout?: boolean;
}

export interface ScoreBreakdown {
  parSeconds: number;
  noiseBudget: number;
  timeScore: number;
  noiseScore: number;
  objectivesScore: number;
  styleScore: number;
  penaltyScore: number;
  rawScore: number;
  difficultyMultiplier: number;
  mutatorMultiplier: number;
  assistMultiplier: number;
  totalMultiplier: number;
  finalScore: number;
  rank: RankTier;
  rankedEligible: boolean;
}

export interface DeathReplayLine {
  explanation: string;
  timestampStr: string;
  timestampSec: number;
  killer: string;
  timeline: Array<{
    t: number;
    description: string;
    isFatal?: boolean;
  }>;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computeScore(inputs: ScoreInputs): ScoreBreakdown {
  const mapConfig = (balanceData.maps as Record<string, { parSeconds: number; noiseBudget: number }>)[inputs.mapId] ?? {
    parSeconds: 240,
    noiseBudget: 8.0,
  };

  const par = mapConfig.parSeconds;
  const noiseBudget = mapConfig.noiseBudget;
  const time = Math.max(1.0, inputs.elapsedSeconds);

  // 1. Time Score (600 * clamp(par / time, 0.4, 1.6))
  const timeScore = Math.round(600 * clamp(par / time, 0.4, 1.6));

  // 2. Noise Score (400 * (1 - clamp(noiseUnits / noiseBudget, 0, 1)))
  const noiseRatio = clamp(inputs.noiseUnits / noiseBudget, 0.0, 1.0);
  const noiseScore = Math.round(400 * (1.0 - noiseRatio));

  // 3. Objectives Score (150 * secondariesDone + 250 * hiddenDone)
  const objectivesScore = 150 * inputs.secondariesDone + 250 * inputs.hiddenDone;

  // 4. Style Score (min(300, 25*cleanJumps + 40*lurks + 60*lures + 30*nearMisses))
  const lurksCount = inputs.lurksSurvivedGte8s;
  const rawStyle =
    25 * inputs.cleanJumps +
    40 * lurksCount +
    60 * inputs.lureSuccesses +
    30 * inputs.nearMissesUnder2m;
  const styleScore = Math.min(300, rawStyle);

  // 5. Penalty Score (150 * deaths)
  const penaltyScore = 150 * inputs.deaths;

  const rawScore = timeScore + noiseScore + objectivesScore + styleScore - penaltyScore;

  // Multipliers
  const diffMul = (balanceData.scoring.difficultyMultipliers as Record<DifficultyTier, number>)[inputs.difficulty] ?? 1.0;
  const mutatorMul = inputs.mutatorMultiplier ?? 1.0;
  const assistMul = inputs.hasAssists ? balanceData.scoring.assistMultiplier : 1.0;
  const totalMultiplier = Number((diffMul * mutatorMul * assistMul).toFixed(3));

  const finalScore = Math.max(0, Math.round(rawScore * totalMultiplier));

  // Ranks: S >= 1400, A >= 1100, B >= 800, C >= 500, D otherwise
  let rank: RankTier = 'D';
  if (finalScore >= balanceData.scoring.ranks.S) rank = 'S';
  else if (finalScore >= balanceData.scoring.ranks.A) rank = 'A';
  else if (finalScore >= balanceData.scoring.ranks.B) rank = 'B';
  else if (finalScore >= balanceData.scoring.ranks.C) rank = 'C';

  const rankedEligible =
    !inputs.hasAssists &&
    inputs.isStandardLoadout !== false &&
    inputs.difficulty !== 'whisper';

  return {
    parSeconds: par,
    noiseBudget,
    timeScore,
    noiseScore,
    objectivesScore,
    styleScore,
    penaltyScore,
    rawScore,
    difficultyMultiplier: diffMul,
    mutatorMultiplier: mutatorMul,
    assistMultiplier: assistMul,
    totalMultiplier,
    finalScore,
    rank,
    rankedEligible,
  };
}

export function generateDeathReplayLine(
  death: DeathEvent,
  recentEvents: readonly RunEvent[],
): DeathReplayLine {
  const m = Math.floor(death.t / 60);
  const s = Math.floor(death.t % 60);
  const timestampStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  let explanation = 'The entity tracked you down in the silence.';
  if (death.lastNoise) {
    const k = death.lastNoise.kind.toLowerCase();
    if (k.includes('splash')) {
      explanation = 'You made a sudden splash in the water, broadcasting acoustic ripples to the entity.';
    } else if (k.includes('wade')) {
      explanation = 'You sprint-waded through the pool, broadcasting ripples through the water.';
    } else if (k.includes('jump') || k.includes('fall')) {
      explanation = 'You leaped into the water, triggering an explosive water crash.';
    } else if (k.includes('alarm') || k.includes('siren')) {
      explanation = 'A triggered security alarm summoned the creature directly to your position.';
    } else if (k.includes('shatter') || k.includes('bottle')) {
      explanation = 'A glass bottle shattered on dry concrete near the entity.';
    } else {
      explanation = `A sudden ${death.lastNoise.kind} noise gave away your location.`;
    }
  } else if (death.cause.includes('stillness')) {
    explanation = 'You stood motionless for too long; the entity completed a sweep of your perch.';
  } else if (death.cause.includes('tide') || death.cause.includes('water')) {
    explanation = 'Rising water submerged your platform and trapped your route.';
  }

  // Mini-timeline of last 30s
  const cutoff = Math.max(0, death.t - 30);
  const relevant = recentEvents.filter((e) => e.t >= cutoff && e.t <= death.t);

  const timeline: DeathReplayLine['timeline'] = relevant.map((e) => {
    let desc = e.type.replace('_', ' ');
    if (e.type === 'noise_made') {
      desc = `Sound emitted: ${e.kind} (${Math.round(e.loudness * 100)}%)`;
    } else if (e.type === 'near_miss') {
      desc = `Narrow escape (${e.distance.toFixed(1)}m)`;
    } else if (e.type === 'lure_success') {
      desc = `Lured with ${e.item}`;
    }
    return {
      t: Number(e.t.toFixed(1)),
      description: desc,
    };
  });

  timeline.push({
    t: Number(death.t.toFixed(1)),
    description: `Fatal confrontation by ${death.killer}`,
    isFatal: true,
  });

  return {
    explanation,
    timestampStr,
    timestampSec: death.t,
    killer: death.killer,
    timeline,
  };
}

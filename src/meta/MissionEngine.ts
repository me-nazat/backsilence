/* ── MissionEngine.ts ──────────────────────────────────────────────────────
 *  Daily and Weekly contracts generated deterministically from UTC date keys.
 *  Catalog of 24 mission templates tracking progress from RunEvents.
 *  Section 6: hash('bs-missions-' + dateKey), 1 reroll/day, solo/co-op/any eligibility,
 *  Weekly Trial with fixed seed, map, mutators, and 3 attempt tokens per week.
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RunEvent, LurkSurvivedEvent, NearMissEvent } from './RunEvents.js';
import type { MapId } from '../types/contracts.js';
import missionDataRaw from './data/missions.json';

export type MissionFrequency = 'daily' | 'weekly';
export type MissionDifficulty = 'easy' | 'medium' | 'hard';
export type MissionModeEligibility = 'solo' | 'coop' | 'any';

export interface MissionContract {
  id: string;
  title: string;
  description: string;
  frequency: MissionFrequency;
  difficulty: MissionDifficulty;
  modeEligibility: MissionModeEligibility;
  targetCount: number;
  currentCount: number;
  completed: boolean;
  claimed: boolean;
  rewardStatic: number;
  rewardXP: number;
  templateKey: string;
}

export interface WeeklyTrialDef {
  weekKey: string;
  seed: number;
  mapId: MapId;
  mutators: [string, string];
  attemptTokensMax: number;
  attemptTokensRemaining: number;
}

export interface MissionSnapshot {
  dailyDateKey: string;
  weeklyDateKey: string;
  dailyRerollsRemaining: number;
  trialTokensRemaining?: number;
  contracts: MissionContract[];
}

export interface RunMetadataContext {
  mode?: 'solo' | 'coop' | 'race' | 'last_one_dry';
  noiseMeterHidden?: boolean;
  parTime?: number;
  timeSeconds?: number;
  isDailyBoardLeader?: boolean;
  sawFlockDuration?: number;
  staminaExhausted?: boolean;
  finalScore?: number;
}

// Deterministic string hash (32-bit FNV-1a)
export function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface ContractTemplate {
  key: string;
  title: string;
  description: (target: number) => string;
  modeEligibility: MissionModeEligibility;
  targetCounts: Record<MissionDifficulty, number>;
  rewardStatic: Record<MissionDifficulty, number>;
  rewardXP: Record<MissionDifficulty, number>;
  evaluator: (event: RunEvent, current: number, target: number, context?: RunMetadataContext) => number;
}

const EVALUATOR_MAP: Record<string, ContractTemplate['evaluator']> = {
  escape_maps: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  low_noise_escape: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  clean_jumps: (ev, curr) => (ev.type === 'jump_clean' && ev.dryToDry ? curr + 1 : curr),
  survive_lurks: (ev, curr) =>
    ev.type === 'lurk_survived' && (ev as LurkSurvivedEvent).duration >= 8.0 ? curr + 1 : curr,
  pebble_lures: (ev, curr) =>
    ev.type === 'lure_success' && ev.item === 'pebble' ? curr + 1 : curr,
  bottle_lures: (ev, curr) =>
    ev.type === 'lure_success' && ev.item === 'bottle' ? curr + 1 : curr,
  no_wade_run: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  under_par: (ev, curr, _t, ctx) =>
    ev.type === 'escape' && (ctx?.timeSeconds ?? 999) <= (ctx?.parTime ?? 200) ? curr + 1 : curr,
  silent_race: (ev, curr, _t, ctx) =>
    ev.type === 'escape' && ctx?.mode === 'race' ? curr + 1 : curr,
  last_one_dry: (ev, curr, _t, ctx) =>
    ev.type === 'escape' && ctx?.mode === 'last_one_dry' ? curr + 1 : curr,
  teammate_ping_proximity: (ev, curr) =>
    ev.type === 'objective_done' && ev.id === 'nearest_ping_escape' ? curr + 1 : curr,
  haunt_rival: (ev, curr) =>
    ev.type === 'haunt' ? curr + 1 : curr,
  daily_board_leader: (ev, curr, _t, ctx) =>
    ev.type === 'escape' && ctx?.isDailyBoardLeader ? curr + 1 : curr,
  tape_reels: (ev, curr) =>
    ev.type === 'objective_done' && ev.kind === 'hidden' ? curr + 1 : curr,
  silent_film_run: (ev, curr, _t, ctx) =>
    ev.type === 'escape' && ctx?.noiseMeterHidden ? curr + 1 : curr,
  flock_arrival_witness: (ev, curr, _t, ctx) =>
    ev.type === 'objective_done' && (ctx?.sawFlockDuration ?? 0) >= 3.0 ? curr + 1 : curr,
  near_misses: (ev, curr) =>
    ev.type === 'near_miss' && (ev as NearMissEvent).distance <= 2.0 ? curr + 1 : curr,
  echo_bell_lures: (ev, curr) =>
    ev.type === 'lure_success' && ev.item === 'echo_bell' ? curr + 1 : curr,
  noisemaker_deploy: (ev, curr) =>
    ev.type === 'item_used' && ev.item === 'noisemaker' ? curr + 1 : curr,
  glow_stick_drop: (ev, curr) =>
    ev.type === 'item_used' && ev.item === 'glow_stick' ? curr + 1 : curr,
  coop_rescue: (ev, curr) =>
    ev.type === 'rescue' ? curr + 1 : curr,
  rank_s_finish: (ev, curr, _t, ctx) =>
    ev.type === 'escape' && (ctx?.finalScore ?? ev.finalScore ?? 0) >= 1400 ? curr + 1 : curr,
  secondaries: (ev, curr) =>
    ev.type === 'objective_done' && ev.kind === 'secondary' ? curr + 1 : curr,
  stamina_discipline: (ev, curr, _t, ctx) =>
    ev.type === 'escape' && !ctx?.staminaExhausted ? curr + 1 : curr,
};

export const MISSION_TEMPLATES: readonly ContractTemplate[] = (missionDataRaw as Array<{
  key: string;
  title: string;
  description: string;
  modeEligibility: MissionModeEligibility;
  targetCounts: Record<MissionDifficulty, number>;
  rewardStatic: Record<MissionDifficulty, number>;
  rewardXP: Record<MissionDifficulty, number>;
}>).map((raw) => ({
  key: raw.key,
  title: raw.title,
  description: (target: number) => raw.description.replace('{target}', String(target)),
  modeEligibility: raw.modeEligibility,
  targetCounts: raw.targetCounts,
  rewardStatic: raw.rewardStatic,
  rewardXP: raw.rewardXP,
  evaluator: EVALUATOR_MAP[raw.key] ?? ((ev, curr) => (ev.type === 'escape' ? curr + 1 : curr)),
}));

export function getUtcDateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getUtcWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const CAMPAIGN_MAP_IDS: readonly MapId[] = [
  'natatorium',
  'poolrooms',
  'drowned_school',
  'utility_tunnels',
  'sunken_jungle',
  'marble_atrium',
  'neon_flood',
  'hydro_maze',
  'drowned_metro',
  'drainage_core',
];

const TRIAL_MUTATOR_PAIRS: readonly [string, string][] = [
  ['glass_water', 'blackout'],
  ['thin_ice', 'hair_trigger'],
  ['tinnitus', 'twin_entity'],
  ['spring_tide', 'one_breath'],
  ['glass_water', 'silent_film'],
  ['blackout', 'hair_trigger'],
  ['tinnitus', 'long_tape'],
  ['spring_tide', 'thin_ice'],
];

export class MissionEngine {
  private contracts: MissionContract[] = [];
  private dailyDateKey: string = '';
  private weeklyDateKey: string = '';
  private dailyRerollsRemaining: number = 1;
  private trialTokensRemaining: number = 3;

  constructor(snapshot?: MissionSnapshot, now = new Date()) {
    if (snapshot) {
      this.hydrate(snapshot);
    } else {
      this.refreshContracts(now);
    }
  }

  refreshContracts(now = new Date()): void {
    const today = getUtcDateKey(now);
    const thisWeek = getUtcWeekKey(now);

    if (this.dailyDateKey !== today) {
      this.dailyDateKey = today;
      this.dailyRerollsRemaining = 1;
      // Filter out old daily contracts
      this.contracts = this.contracts.filter((c) => c.frequency !== 'daily');
      this.contracts.push(...MissionEngine.generateContractsForDate(today, 'daily'));
    }

    if (this.weeklyDateKey !== thisWeek) {
      this.weeklyDateKey = thisWeek;
      this.trialTokensRemaining = 3;
      // Filter out old weekly contracts
      this.contracts = this.contracts.filter((c) => c.frequency !== 'weekly');
      this.contracts.push(...MissionEngine.generateContractsForDate(thisWeek, 'weekly'));
    }
  }

  /**
   * Deterministic generation matching Prompt 3 Section 6:
   * hash('bs-missions-' + dateKey)
   */
  static generateContractsForDate(key: string, frequency: MissionFrequency): MissionContract[] {
    const hashBase = frequency === 'daily' ? `bs-missions-${key}` : `bs-missions-weekly-${key}`;
    const seed = hashString(hashBase);
    const difficulties: MissionDifficulty[] = ['easy', 'medium', 'hard'];
    const count = 3;
    const generated: MissionContract[] = [];

    for (let i = 0; i < count; i++) {
      const diff = difficulties[i]!;
      const tmplIndex = (seed + i * 11) % MISSION_TEMPLATES.length;
      const tmpl = MISSION_TEMPLATES[tmplIndex]!;
      const target = tmpl.targetCounts[diff];

      generated.push({
        id: `${frequency}_${key}_${i}_${tmpl.key}`,
        title: tmpl.title,
        description: tmpl.description(target),
        frequency,
        difficulty: diff,
        modeEligibility: tmpl.modeEligibility,
        targetCount: target,
        currentCount: 0,
        completed: false,
        claimed: false,
        rewardStatic: tmpl.rewardStatic[diff],
        rewardXP: tmpl.rewardXP[diff],
        templateKey: tmpl.key,
      });
    }

    return generated;
  }

  static generateDailyContracts(dateKey: string): MissionContract[] {
    return MissionEngine.generateContractsForDate(dateKey, 'daily');
  }

  static generateWeeklyContracts(weekKey: string): MissionContract[] {
    return MissionEngine.generateContractsForDate(weekKey, 'weekly');
  }

  static stepContract(contract: MissionContract, event: RunEvent, context?: RunMetadataContext): MissionContract {
    const copy = { ...contract };
    if (copy.completed) return copy;
    const tmpl = MISSION_TEMPLATES.find((t) => t.key === copy.templateKey);
    if (tmpl) {
      const next = tmpl.evaluator(event, copy.currentCount, copy.targetCount, context);
      copy.currentCount = Math.min(copy.targetCount, next);
      if (copy.currentCount >= copy.targetCount) {
        copy.completed = true;
      }
    }
    return copy;
  }

  getWeeklyTrial(weekKey = this.weeklyDateKey || getUtcWeekKey()): WeeklyTrialDef {
    const seed = hashString(`bs-weekly-trial-${weekKey}`);
    const mapIndex = seed % CAMPAIGN_MAP_IDS.length;
    const mapId = CAMPAIGN_MAP_IDS[mapIndex]!;
    const mutatorIndex = (seed >>> 4) % TRIAL_MUTATOR_PAIRS.length;
    const mutators = TRIAL_MUTATOR_PAIRS[mutatorIndex]!;

    return {
      weekKey,
      seed,
      mapId,
      mutators: [mutators[0], mutators[1]],
      attemptTokensMax: 3,
      attemptTokensRemaining: this.trialTokensRemaining,
    };
  }

  spendTrialToken(): boolean {
    if (this.trialTokensRemaining <= 0) return false;
    this.trialTokensRemaining--;
    return true;
  }

  getTrialTokensRemaining(): number {
    return this.trialTokensRemaining;
  }

  onRunEvent(event: RunEvent, context?: RunMetadataContext): void {
    for (const contract of this.contracts) {
      if (contract.completed) continue;

      // Filter by mode eligibility
      if (contract.modeEligibility === 'solo' && context?.mode && context.mode !== 'solo') {
        continue;
      }
      if (contract.modeEligibility === 'coop' && context?.mode && context.mode === 'solo') {
        continue;
      }

      const tmpl = MISSION_TEMPLATES.find((t) => t.key === contract.templateKey);
      if (tmpl) {
        const next = tmpl.evaluator(event, contract.currentCount, contract.targetCount, context);
        if (next !== contract.currentCount) {
          contract.currentCount = Math.min(contract.targetCount, next);
          if (contract.currentCount >= contract.targetCount) {
            contract.completed = true;
          }
        }
      }
    }
  }

  claimReward(contractId: string): { success: boolean; staticGain: number; xpGain: number } {
    const c = this.contracts.find((item) => item.id === contractId);
    if (!c || !c.completed || c.claimed) {
      return { success: false, staticGain: 0, xpGain: 0 };
    }
    c.claimed = true;
    return {
      success: true,
      staticGain: c.rewardStatic,
      xpGain: c.rewardXP,
    };
  }

  rerollDaily(contractId: string): boolean {
    if (this.dailyRerollsRemaining <= 0) return false;

    const idx = this.contracts.findIndex((c) => c.id === contractId && c.frequency === 'daily' && !c.completed);
    if (idx === -1) return false;

    const oldContract = this.contracts[idx]!;
    // Deterministic reroll seed without Date.now()
    const newSeed = hashString(`reroll-${contractId}-${this.dailyDateKey}-r${this.dailyRerollsRemaining}`);
    const tmplIndex = newSeed % MISSION_TEMPLATES.length;
    const tmpl = MISSION_TEMPLATES[tmplIndex]!;
    const target = tmpl.targetCounts[oldContract.difficulty];

    this.contracts[idx] = {
      id: `rerolled_${this.dailyDateKey}_${tmpl.key}_${this.dailyRerollsRemaining}`,
      title: tmpl.title,
      description: tmpl.description(target),
      frequency: 'daily',
      difficulty: oldContract.difficulty,
      modeEligibility: tmpl.modeEligibility,
      targetCount: target,
      currentCount: 0,
      completed: false,
      claimed: false,
      rewardStatic: tmpl.rewardStatic[oldContract.difficulty],
      rewardXP: tmpl.rewardXP[oldContract.difficulty],
      templateKey: tmpl.key,
    };

    this.dailyRerollsRemaining--;
    return true;
  }

  getContracts(): readonly MissionContract[] {
    return this.contracts;
  }

  serialize(): MissionSnapshot {
    return {
      dailyDateKey: this.dailyDateKey,
      weeklyDateKey: this.weeklyDateKey,
      dailyRerollsRemaining: this.dailyRerollsRemaining,
      trialTokensRemaining: this.trialTokensRemaining,
      contracts: this.contracts.map((c) => ({ ...c })),
    };
  }

  hydrate(snapshot: MissionSnapshot): void {
    this.dailyDateKey = snapshot.dailyDateKey;
    this.weeklyDateKey = snapshot.weeklyDateKey;
    this.dailyRerollsRemaining = snapshot.dailyRerollsRemaining;
    this.trialTokensRemaining = snapshot.trialTokensRemaining ?? 3;
    this.contracts = snapshot.contracts.map((c) => ({ ...c }));
  }
}

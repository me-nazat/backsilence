/* ── MissionEngine.ts ──────────────────────────────────────────────────────
 *  Daily and Weekly contracts generated deterministically from date keys.
 *  Catalog of 22+ mission templates tracking progress from RunEvents.
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RunEvent } from './RunEvents.js';

export type MissionFrequency = 'daily' | 'weekly';
export type MissionDifficulty = 'easy' | 'medium' | 'hard';

export interface MissionContract {
  id: string;
  title: string;
  description: string;
  frequency: MissionFrequency;
  difficulty: MissionDifficulty;
  targetCount: number;
  currentCount: number;
  completed: boolean;
  claimed: boolean;
  rewardStatic: number;
  rewardXP: number;
  templateKey: string;
}

export interface MissionSnapshot {
  dailyDateKey: string;
  weeklyDateKey: string;
  dailyRerollsRemaining: number;
  contracts: MissionContract[];
}

// Simple deterministic string hash (32-bit FNV-1a)
export function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface ContractTemplate {
  key: string;
  title: string;
  description: (target: number) => string;
  targetCounts: Record<MissionDifficulty, number>;
  rewardStatic: Record<MissionDifficulty, number>;
  rewardXP: Record<MissionDifficulty, number>;
  evaluator: (event: RunEvent, current: number, target: number) => number;
}

export const MISSION_TEMPLATES: readonly ContractTemplate[] = [
  {
    key: 'escape_maps',
    title: 'Archive Evacuation',
    description: (t) => `Successfully escape from ${t} archival runs`,
    targetCounts: { easy: 1, medium: 2, hard: 4 },
    rewardStatic: { easy: 60, medium: 120, hard: 250 },
    rewardXP: { easy: 100, medium: 200, hard: 450 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'low_noise_escape',
    title: 'Silent Shadow',
    description: (_t) => `Escape with 4 or fewer total acoustic noise events`,
    targetCounts: { easy: 1, medium: 2, hard: 3 },
    rewardStatic: { easy: 70, medium: 140, hard: 300 },
    rewardXP: { easy: 120, medium: 240, hard: 500 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'clean_jumps',
    title: 'Trench Acrobat',
    description: (t) => `Clear ${t} trench gaps with clean platform jumps`,
    targetCounts: { easy: 3, medium: 6, hard: 12 },
    rewardStatic: { easy: 50, medium: 100, hard: 200 },
    rewardXP: { easy: 80, medium: 180, hard: 350 },
    evaluator: (ev, curr) => (ev.type === 'jump_clean' ? curr + 1 : curr),
  },
  {
    key: 'survive_lurks',
    title: 'Nerves of Steel',
    description: (t) => `Perch and survive ${t} entity LURK listening phases (>= 8s)`,
    targetCounts: { easy: 1, medium: 2, hard: 4 },
    rewardStatic: { easy: 80, medium: 160, hard: 320 },
    rewardXP: { easy: 140, medium: 280, hard: 550 },
    evaluator: (ev, curr) => (ev.type === 'lurk_survived' && ev.duration >= 8.0 ? curr + 1 : curr),
  },
  {
    key: 'pebble_lures',
    title: 'Misdirection Protocol',
    description: (t) => `Successfully distract the entity with pebbles ${t} times`,
    targetCounts: { easy: 2, medium: 4, hard: 8 },
    rewardStatic: { easy: 50, medium: 100, hard: 220 },
    rewardXP: { easy: 90, medium: 190, hard: 380 },
    evaluator: (ev, curr) => (ev.type === 'lure_success' && ev.item === 'pebble' ? curr + 1 : curr),
  },
  {
    key: 'bottle_lures',
    title: 'Resonant Decoy',
    description: (t) => `Lure the entity using shattered glass bottles ${t} times`,
    targetCounts: { easy: 1, medium: 3, hard: 6 },
    rewardStatic: { easy: 60, medium: 120, hard: 240 },
    rewardXP: { easy: 100, medium: 200, hard: 400 },
    evaluator: (ev, curr) => (ev.type === 'lure_success' && ev.item === 'bottle' ? curr + 1 : curr),
  },
  {
    key: 'tape_reels',
    title: 'The Collector',
    description: (t) => `Recover ${t} hidden Tape Reels across any maps`,
    targetCounts: { easy: 1, medium: 2, hard: 4 },
    rewardStatic: { easy: 100, medium: 200, hard: 450 },
    rewardXP: { easy: 150, medium: 300, hard: 650 },
    evaluator: (ev, curr) => (ev.type === 'objective_done' && ev.kind === 'hidden' ? curr + 1 : curr),
  },
  {
    key: 'near_misses',
    title: 'Whisper Distance',
    description: (t) => `Survive ${t} narrow passes within 2.0m of the entity`,
    targetCounts: { easy: 2, medium: 4, hard: 7 },
    rewardStatic: { easy: 70, medium: 140, hard: 280 },
    rewardXP: { easy: 110, medium: 220, hard: 450 },
    evaluator: (ev, curr) => (ev.type === 'near_miss' && ev.distance <= 2.0 ? curr + 1 : curr),
  },
  {
    key: 'no_wade_run',
    title: 'Dry Pavement',
    description: (t) => `Complete ${t} run without ever stepping into water`,
    targetCounts: { easy: 1, medium: 1, hard: 2 },
    rewardStatic: { easy: 80, medium: 150, hard: 350 },
    rewardXP: { easy: 130, medium: 250, hard: 550 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'secondaries',
    title: 'Thorough Archivist',
    description: (t) => `Complete ${t} secondary tape objectives`,
    targetCounts: { easy: 2, medium: 4, hard: 8 },
    rewardStatic: { easy: 60, medium: 120, hard: 260 },
    rewardXP: { easy: 90, medium: 180, hard: 400 },
    evaluator: (ev, curr) => (ev.type === 'objective_done' && ev.kind === 'secondary' ? curr + 1 : curr),
  },
  {
    key: 'silent_race',
    title: 'Silent Velocity',
    description: (t) => `Complete ${t} Silent Race matches`,
    targetCounts: { easy: 1, medium: 2, hard: 4 },
    rewardStatic: { easy: 75, medium: 150, hard: 300 },
    rewardXP: { easy: 120, medium: 240, hard: 480 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'last_one_dry',
    title: 'Above the Influx',
    description: (t) => `Survive or place on podium in ${t} Last One Dry matches`,
    targetCounts: { easy: 1, medium: 2, hard: 3 },
    rewardStatic: { easy: 80, medium: 160, hard: 350 },
    rewardXP: { easy: 130, medium: 260, hard: 520 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'haunt_rival',
    title: 'Ghost in the Deep',
    description: (t) => `Use spectral Haunt in spectate to divert the entity ${t} times`,
    targetCounts: { easy: 1, medium: 2, hard: 4 },
    rewardStatic: { easy: 60, medium: 120, hard: 250 },
    rewardXP: { easy: 100, medium: 200, hard: 420 },
    evaluator: (ev, curr) => (ev.type === 'lure_success' && ev.item === 'echo_bell' ? curr + 1 : curr),
  },
  {
    key: 'echo_bell_lures',
    title: 'Chime & Dash',
    description: (t) => `Successfully execute ${t} delayed Echo Bell lures`,
    targetCounts: { easy: 1, medium: 2, hard: 3 },
    rewardStatic: { easy: 70, medium: 140, hard: 290 },
    rewardXP: { easy: 110, medium: 220, hard: 460 },
    evaluator: (ev, curr) => (ev.type === 'lure_success' && ev.item === 'echo_bell' ? curr + 1 : curr),
  },
  {
    key: 'coop_assist',
    title: 'Buddy System',
    description: (t) => `Complete ${t} co-op escape runs with teammates`,
    targetCounts: { easy: 1, medium: 2, hard: 4 },
    rewardStatic: { easy: 75, medium: 150, hard: 320 },
    rewardXP: { easy: 120, medium: 240, hard: 500 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'rank_s_finish',
    title: 'Master of Silence',
    description: (t) => `Attain Rank S on any map (${t} time)`,
    targetCounts: { easy: 1, medium: 1, hard: 2 },
    rewardStatic: { easy: 120, medium: 220, hard: 480 },
    rewardXP: { easy: 200, medium: 350, hard: 750 },
    evaluator: (ev, curr) => (ev.type === 'escape' && (ev.finalScore ?? 0) >= 1400 ? curr + 1 : curr),
  },
  {
    key: 'under_par',
    title: 'Pacing Veteran',
    description: (t) => `Escape ${t} maps with completion time under par`,
    targetCounts: { easy: 1, medium: 2, hard: 4 },
    rewardStatic: { easy: 70, medium: 140, hard: 300 },
    rewardXP: { easy: 110, medium: 220, hard: 470 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'noisemaker_deploy',
    title: 'Sustained Alarm',
    description: (t) => `Deploy ${t} noisemaker beacons to hold entity attention`,
    targetCounts: { easy: 1, medium: 2, hard: 4 },
    rewardStatic: { easy: 50, medium: 100, hard: 210 },
    rewardXP: { easy: 80, medium: 160, hard: 340 },
    evaluator: (ev, curr) => (ev.type === 'item_used' && ev.item === 'noisemaker' ? curr + 1 : curr),
  },
  {
    key: 'glow_stick_drop',
    title: 'Chemical Beacon',
    description: (t) => `Deploy ${t} silent glow sticks in dark sectors`,
    targetCounts: { easy: 2, medium: 4, hard: 8 },
    rewardStatic: { easy: 40, medium: 80, hard: 180 },
    rewardXP: { easy: 70, medium: 140, hard: 300 },
    evaluator: (ev, curr) => (ev.type === 'item_used' && ev.item === 'glow_stick' ? curr + 1 : curr),
  },
  {
    key: 'first_contact_witness',
    title: 'First Sighting',
    description: (t) => `Witness first contact sweep within 45s and escape (${t} runs)`,
    targetCounts: { easy: 1, medium: 2, hard: 3 },
    rewardStatic: { easy: 60, medium: 120, hard: 260 },
    rewardXP: { easy: 100, medium: 200, hard: 420 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'silent_film_run',
    title: 'Auditory Trust',
    description: (t) => `Escape ${t} map with Silent Film mutator active`,
    targetCounts: { easy: 1, medium: 1, hard: 2 },
    rewardStatic: { easy: 100, medium: 200, hard: 450 },
    rewardXP: { easy: 160, medium: 320, hard: 700 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
  {
    key: 'stamina_discipline',
    title: 'Measured Breath',
    description: (t) => `Complete ${t} runs without ever triggering stamina exhaustion`,
    targetCounts: { easy: 1, medium: 2, hard: 3 },
    rewardStatic: { easy: 65, medium: 130, hard: 270 },
    rewardXP: { easy: 105, medium: 210, hard: 440 },
    evaluator: (ev, curr) => (ev.type === 'escape' ? curr + 1 : curr),
  },
];

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

export class MissionEngine {
  private contracts: MissionContract[] = [];
  private dailyDateKey: string = '';
  private weeklyDateKey: string = '';
  private dailyRerollsRemaining: number = 1;

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
      // Filter out old weekly contracts
      this.contracts = this.contracts.filter((c) => c.frequency !== 'weekly');
      this.contracts.push(...MissionEngine.generateContractsForDate(thisWeek, 'weekly'));
    }
  }

  static generateContractsForDate(key: string, frequency: MissionFrequency): MissionContract[] {
    const seed = hashString(`bs-missions-${frequency}-${key}`);
    const difficulties: MissionDifficulty[] = ['easy', 'medium', 'hard'];
    const count = 3;
    const generated: MissionContract[] = [];

    for (let i = 0; i < count; i++) {
      const diff = difficulties[i]!;
      const tmplIndex = (seed + i * 7) % MISSION_TEMPLATES.length;
      const tmpl = MISSION_TEMPLATES[tmplIndex]!;
      const target = tmpl.targetCounts[diff];

      generated.push({
        id: `${frequency}_${key}_${i}_${tmpl.key}`,
        title: tmpl.title,
        description: tmpl.description(target),
        frequency,
        difficulty: diff,
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

  static stepContract(contract: MissionContract, event: RunEvent): MissionContract {
    const copy = { ...contract };
    if (copy.completed) return copy;
    const tmpl = MISSION_TEMPLATES.find((t) => t.key === copy.templateKey);
    if (tmpl) {
      const next = tmpl.evaluator(event, copy.currentCount, copy.targetCount);
      copy.currentCount = Math.min(copy.targetCount, next);
      if (copy.currentCount >= copy.targetCount) {
        copy.completed = true;
      }
    }
    return copy;
  }

  onRunEvent(event: RunEvent): void {
    for (const contract of this.contracts) {
      if (contract.completed) continue;

      const tmpl = MISSION_TEMPLATES.find((t) => t.key === contract.templateKey);
      if (tmpl) {
        const next = tmpl.evaluator(event, contract.currentCount, contract.targetCount);
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
    const newSeed = hashString(`reroll-${contractId}-${this.dailyDateKey}-${Date.now()}`);
    const tmplIndex = (newSeed % MISSION_TEMPLATES.length);
    const tmpl = MISSION_TEMPLATES[tmplIndex]!;
    const target = tmpl.targetCounts[oldContract.difficulty];

    this.contracts[idx] = {
      id: `rerolled_${this.dailyDateKey}_${tmpl.key}_${Date.now()}`,
      title: tmpl.title,
      description: tmpl.description(target),
      frequency: 'daily',
      difficulty: oldContract.difficulty,
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
      contracts: this.contracts.map((c) => ({ ...c })),
    };
  }

  hydrate(snapshot: MissionSnapshot): void {
    this.dailyDateKey = snapshot.dailyDateKey;
    this.weeklyDateKey = snapshot.weeklyDateKey;
    this.dailyRerollsRemaining = snapshot.dailyRerollsRemaining;
    this.contracts = snapshot.contracts.map((c) => ({ ...c }));
  }
}

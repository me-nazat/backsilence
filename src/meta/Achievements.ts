/* ── Achievements.ts ──────────────────────────────────────────────────────
 *  Pure, deterministic achievement system.
 *  Contains 30 achievements evaluated as pure predicates over RunEvent streams
 *  and player Profile progression state.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RunEvent } from './RunEvents.js';
import type { MapId } from '../types/contracts.js';

export interface RunSummaryForAchievements {
  mapId: MapId;
  escaped: boolean;
  timeSec: number;
  deaths: number;
  noiseUnits: number;
  events: RunEvent[];
  activeMutators?: string[];
  assistsUsed?: boolean;
}

export interface ProfileStatsForAchievements {
  tapesCompletedCount: number;
  tapeStarsTotal: number;
  allTapesThreeStarred: boolean;
  tapeReelsCollectedTotal: number;
  dailyStreak: number;
  currentRankTier: string;
  isChampion: boolean;
  ghostDefeated: boolean;
  successfulHaunts: number;
  coopWins: number;
  lastOneDryWins: number;
  achievementsUnlockedCount: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  category: 'skill' | 'exploration' | 'modes' | 'mastery' | 'challenge';
  icon: string;
  /** Evaluate against a single run's events and outcome */
  checkRun?: (run: RunSummaryForAchievements) => boolean;
  /** Evaluate against persistent career profile statistics */
  checkProfile?: (profile: ProfileStatsForAchievements) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // 1. Dry Feet: finish with 0 wading noises
  {
    id: 'dry_feet',
    title: 'Dry Feet',
    description: 'Escape any flooded map without making a single wading or splashing noise.',
    category: 'skill',
    icon: '👟',
    checkRun: (r) => {
      if (!r.escaped) return false;
      const wadingNoises = r.events.filter(
        (e) => e.type === 'noise_made' && ((e).kind === 'wade' || (e).kind === 'splash'),
      );
      return wadingNoises.length === 0;
    },
  },

  // 2. Ghost of the Pool: escape Natatorium with <= 2 noise units
  {
    id: 'ghost_of_the_pool',
    title: 'Ghost of the Pool',
    description: 'Escape The Grand Natatorium with 2.0 or fewer total acoustic noise units.',
    category: 'skill',
    icon: '👻',
    checkRun: (r) => r.escaped && r.mapId === 'natatorium' && r.noiseUnits <= 2.0,
  },

  // 3. Long Jumper: clear a 3.4m gap
  {
    id: 'long_jumper',
    title: 'Long Jumper',
    description: 'Clear a trench or gap measuring at least 3.4 meters in a single clean leap.',
    category: 'skill',
    icon: '🦘',
    checkRun: (r) =>
      r.events.some((e) => e.type === 'jump_clean' && (e).distance >= 3.4),
  },

  // 4. Trench Dancer: 20 silent trench jumps
  {
    id: 'trench_dancer',
    title: 'Trench Dancer',
    description: 'Execute 20 clean, silent trench jumps across platforms in a single run.',
    category: 'skill',
    icon: '🩰',
    checkRun: (r) => r.events.filter((e) => e.type === 'jump_clean').length >= 20,
  },

  // 5. Not Today: survive a LURK >= 15s
  {
    id: 'not_today',
    title: 'Not Today',
    description: 'Perch motionless and survive an entity LURK phase lasting at least 15 seconds.',
    category: 'skill',
    icon: '⏱️',
    checkRun: (r) => r.events.some((e) => e.type === 'lurk_survived' && (e).duration >= 15),
  },

  // 6. Sleight of Hand: lure the entity away 5 times in a run
  {
    id: 'sleight_of_hand',
    title: 'Sleight of Hand',
    description: 'Lure the entity away with thrown pebbles or items 5 times during a single escape.',
    category: 'skill',
    icon: '🪄',
    checkRun: (r) => r.events.filter((e) => e.type === 'lure_success').length >= 5,
  },

  // 7. Choir Master: ring the bells in order on the first try (Resonance / Marble Atrium)
  {
    id: 'choir_master',
    title: 'Choir Master',
    description: 'Solve the resonance bell chime sequence on your first attempt without a missed strike.',
    category: 'exploration',
    icon: '🔔',
    checkRun: (r) =>
      r.escaped &&
      r.mapId === 'marble_atrium' &&
      r.events.some((e) => e.type === 'objective_done' && (e).id === 'choir_sequence_flawless'),
  },

  // 8. Overclocked: 3 generators, 90s runtime, no sputter
  {
    id: 'overclocked',
    title: 'Overclocked',
    description: 'Power all 3 generators within 90 seconds in Drainage Core without losing engine compression.',
    category: 'skill',
    icon: '⚡',
    checkRun: (r) =>
      r.escaped &&
      r.mapId === 'drainage_core' &&
      r.events.some((e) => e.type === 'objective_done' && (e).id === 'all_generators_fast'),
  },

  // 9. Hacker: City, 9 hack successes, 0 misses
  {
    id: 'hacker',
    title: 'Sub-Net Infiltrator',
    description: 'Complete 9 terminal bypasses in Neon Flood District with zero failed sequences.',
    category: 'skill',
    icon: '💻',
    checkRun: (r) =>
      r.escaped &&
      r.mapId === 'neon_flood' &&
      r.events.some((e) => e.type === 'objective_done' && (e).id === 'flawless_hacks'),
  },

  // 10. Conductor: strand the entity with the Ghost Train twice
  {
    id: 'conductor',
    title: 'Conductor',
    description: 'Use the Ghost Train doors or arrival in Drowned Metro to strand the entity twice.',
    category: 'exploration',
    icon: '🚆',
    checkRun: (r) =>
      r.mapId === 'drowned_metro' &&
      r.events.filter((e) => e.type === 'objective_done' && (e).id === 'strand_entity_train').length >= 2,
  },

  // 11. Deep Breath: cross a river by stones only (Sunken Jungle)
  {
    id: 'deep_breath',
    title: 'Deep Breath',
    description: 'Cross the Sunken Jungle rapids using only river stepping stones and fallen trunks.',
    category: 'skill',
    icon: '🌿',
    checkRun: (r) =>
      r.escaped &&
      r.mapId === 'sunken_jungle' &&
      r.events.some((e) => e.type === 'objective_done' && (e).id === 'cross_stones_only'),
  },

  // 12. Early Bird: first contact witnessed <= 40s and survived
  {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Encounter and evade the entity within the first 40 seconds of entering the water.',
    category: 'skill',
    icon: '🦅',
    checkRun: (r) =>
      r.escaped &&
      r.events.some((e) => e.type === 'near_miss' && e.t <= 40.0 && (e).distance <= 3.5),
  },

  // 13. Archivist: collect all Tape Reels
  {
    id: 'archivist',
    title: 'Archivist',
    description: 'Recover all hidden magnetic Tape Reels scattered across the campaign archives.',
    category: 'exploration',
    icon: '📼',
    checkProfile: (p) => p.tapeReelsCollectedTotal >= 10,
  },

  // 14. Perfect Tape: 3 stars on all tapes
  {
    id: 'perfect_tape',
    title: 'Master Archivist',
    description: 'Achieve a 3-star rating on every archival campaign tape.',
    category: 'mastery',
    icon: '⭐',
    checkProfile: (p) => p.allTapesThreeStarred,
  },

  // 15. Daily Streak 7
  {
    id: 'daily_streak_7',
    title: 'Submerged Habit',
    description: 'Maintain an active Daily Descent contract streak for 7 consecutive days.',
    category: 'exploration',
    icon: '📅',
    checkProfile: (p) => p.dailyStreak >= 7,
  },

  // 16. Daily Streak 30
  {
    id: 'daily_streak_30',
    title: 'Aquatic Resident',
    description: 'Maintain an active Daily Descent contract streak for 30 consecutive days.',
    category: 'exploration',
    icon: '🗓️',
    checkProfile: (p) => p.dailyStreak >= 30,
  },

  // 17-21: Rank Milestones x5
  {
    id: 'rank_hush',
    title: 'Hush Candidate',
    description: 'Reach Silence Rating Tier: Hush (1000+ SR).',
    category: 'mastery',
    icon: '🥉',
    checkProfile: (p) => ['Hush', 'Mute', 'Silent', 'Phantom'].includes(p.currentRankTier),
  },
  {
    id: 'rank_mute',
    title: 'Mute Specialist',
    description: 'Reach Silence Rating Tier: Mute (1300+ SR).',
    category: 'mastery',
    icon: '🥈',
    checkProfile: (p) => ['Mute', 'Silent', 'Phantom'].includes(p.currentRankTier),
  },
  {
    id: 'rank_silent',
    title: 'Silent Infiltrator',
    description: 'Reach Silence Rating Tier: Silent (1600+ SR).',
    category: 'mastery',
    icon: '🥇',
    checkProfile: (p) => ['Silent', 'Phantom'].includes(p.currentRankTier),
  },
  {
    id: 'rank_phantom',
    title: 'Phantom of the Depths',
    description: 'Ascend to the highest tier: Phantom (1900+ SR).',
    category: 'mastery',
    icon: '👑',
    checkProfile: (p) => p.currentRankTier === 'Phantom',
  },
  {
    id: 'champion',
    title: 'Weekly Board Champion',
    description: 'Hold the #1 position on a featured Weekly or Daily descent leaderboard.',
    category: 'mastery',
    icon: '🏆',
    checkProfile: (p) => p.isChampion,
  },

  // 22. Ghost Hunter: beat a champion ghost
  {
    id: 'ghost_hunter',
    title: 'Ghost Hunter',
    description: 'Complete a Ghost Run with a faster time than the reigning Champion Ghost.',
    category: 'skill',
    icon: '👤',
    checkProfile: (p) => p.ghostDefeated,
  },

  // 23. Spirit Guide: a successful haunt
  {
    id: 'spirit_guide',
    title: 'Spirit Guide',
    description: 'While eliminated as a specter, channel Echo to divert the entity safely.',
    category: 'modes',
    icon: '🕯️',
    checkProfile: (p) => p.successfulHaunts >= 1,
  },

  // 24. Team Player: 3 co-op wins
  {
    id: 'team_player',
    title: 'Team Player',
    description: 'Successfully complete 3 Co-op multiplayer escape operations.',
    category: 'modes',
    icon: '🤝',
    checkProfile: (p) => p.coopWins >= 3,
  },

  // 25. Last One Dry: win
  {
    id: 'last_one_dry',
    title: 'Sole Survivor',
    description: 'Emerge victorious as the last living player standing in Last One Dry.',
    category: 'modes',
    icon: '🏝️',
    checkProfile: (p) => p.lastOneDryWins >= 1,
  },

  // 26. Silent Film: escape with that mutator
  {
    id: 'silent_film',
    title: 'The Silent Era',
    description: 'Escape any level with the Silent Film mutator active (no noise meter or captions).',
    category: 'challenge',
    icon: '🎬',
    checkRun: (r) => r.escaped && (r.activeMutators?.includes('silent_film') ?? false),
  },

  // 27. Twin Slayer: escape with Twin Entity
  {
    id: 'twin_slayer',
    title: 'Double Trouble',
    description: 'Escape an archival map with the Twin Entity mutator active.',
    category: 'challenge',
    icon: '👥',
    checkRun: (r) => r.escaped && (r.activeMutators?.includes('twin_entity') ?? false),
  },

  // 28. Night Owl: Blackout escape
  {
    id: 'night_owl',
    title: 'Dark Room',
    description: 'Complete an escape during total facility blackout with flashlight only.',
    category: 'challenge',
    icon: '🔦',
    checkRun: (r) => r.escaped && (r.activeMutators?.includes('blackout') ?? false),
  },

  // 29. Whispers in the Dark: 5 near misses in a single escape
  {
    id: 'whispers_in_the_dark',
    title: 'Whispers in the Dark',
    description: 'Survive 5 near-miss encounters (< 2.0m distance) during a single run.',
    category: 'skill',
    icon: '👀',
    checkRun: (r) => r.escaped && r.events.filter((e) => e.type === 'near_miss' && (e).distance <= 2.0).length >= 5,
  },

  // 30. Completionist
  {
    id: 'completionist',
    title: 'The Full Tape',
    description: 'Unlock 25 or more unique BackSilence archival achievements.',
    category: 'mastery',
    icon: '🎖️',
    checkProfile: (p) => p.achievementsUnlockedCount >= 25,
  },
];

export const AchievementEngine = {
  /**
   * Evaluates unlocked achievements given a completed run and profile state.
   * Returns an array of newly unlocked achievement IDs.
   */
  evaluate(
    run: RunSummaryForAchievements,
    profile: ProfileStatsForAchievements,
    currentlyUnlocked: ReadonlySet<string>,
  ): string[] {
    const newlyUnlocked: string[] = [];

    for (const ach of ACHIEVEMENTS) {
      if (currentlyUnlocked.has(ach.id)) continue;

      let passed = false;
      if (ach.checkRun && ach.checkRun(run)) {
        passed = true;
      } else if (ach.checkProfile && ach.checkProfile(profile)) {
        passed = true;
      }

      if (passed) {
        newlyUnlocked.push(ach.id);
      }
    }

    return newlyUnlocked;
  },
};

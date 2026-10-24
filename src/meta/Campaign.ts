/* ── Campaign.ts ───────────────────────────────────────────────────────────
 *  The Tape Archive: Found-footage campaign progression state machine.
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 *  Section 5: 11 tapes (0-10), threat ratings, 2 secondaries, hidden objectives,
 *  0-3 star award logic, hidden objective hint after 3 fails, working tasks.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RunEvent, NoiseMadeEvent, LurkSurvivedEvent } from './RunEvents.js';

export interface RunContext {
  parTime?: number;
  timeSeconds?: number;
  rank?: 'S' | 'A' | 'B' | 'C' | 'D';
  mapId?: string;
  wrongCodeEntered?: boolean;
  creakLoudnessMax?: number;
  steamMaskActive?: boolean;
  flashFloodTriggered?: boolean;
  sinkingPlatformFell?: boolean;
  missedHacks?: number;
  droneAcousticLocks?: number;
  levelFlips?: number;
  usedFlashlight?: boolean;
  waterTouched?: boolean;
}

export interface TapeObjective {
  id: string;
  textKey: string;
  hudFormat: string;
  description: string;
  kind: 'primary' | 'secondary' | 'hidden';
  failConditionText?: string;
  evaluate: (events: readonly RunEvent[], context?: RunContext) => boolean;
  failCondition?: (events: readonly RunEvent[], context?: RunContext) => boolean;
}

export interface WorkingTask {
  id: string;
  stepIndex: number;
  totalSteps: number;
  textKey: string;
  estimatedTimeSeconds: number;
  risk: 'quiet' | 'loud' | 'timed';
  progressCurrent: number;
  progressTarget: number;
}

export interface TapeDef {
  index: number;
  id: string;
  title: string;
  mapId: string;
  threatRating: number; // 1 to 5 skulls
  unlockStarsRequired: number; // stars on previous tape (or skip with static)
  logline: string;
  primary: TapeObjective;
  secondaryA: TapeObjective;
  secondaryB: TapeObjective;
  /** Compatibility alias for secondaryA */
  secondary: TapeObjective;
  secondaries: readonly [TapeObjective, TapeObjective];
  hidden: TapeObjective;
  hiddenHint: string;
  remixMutators: [string, string]; // mutator pair unlocked at 3 stars
  workingTasks: readonly WorkingTask[];
}

export const TASK_STRING_TABLE: Record<string, string> = {
  // Tape 0: Orientation
  't0_task1': 'Step onto dry tiles and calibrate acoustic sensor',
  't0_task2': 'Crouch-wade through training pool to minimize splash',
  't0_task3': 'Throw pebble lure to redirect tethered entity',
  't0_task4': 'Ascend platform and exit through airlock',

  // Tape 1: The Grand Opening (Natatorium)
  't1_task1': 'Find maintenance access code on observation deck',
  't1_task2': 'Restore secondary pump relay in pump chamber',
  't1_task3': 'Cycle emergency drain bulkhead and reach exit doors',

  // Tape 2: Dry Season (Classic Archipelago)
  't2_task1': 'Survey western sunken slab for first rune pillar',
  't2_task2': 'Leap southern trenches to inspect second & third runes',
  't2_task3': 'Transcribe fourth rune on far eastern pedestal',
  't2_task4': 'Enter four-digit code into central dry keypad',

  // Tape 3: After the Bell (Drowned Schoolhouse)
  't3_task1': 'Locate faculty attendance register in flooded office',
  't3_task2': 'Power up emergency PA broadcast console',
  't3_task3': 'Cut padlock chains on main foyer double doors',

  // Tape 4: Pressure (Utility Tunnels)
  't4_task1': 'Rotate high-pressure steam valve 1 in intake main',
  't4_task2': 'Rotate equalizing valve 2 inside steam haze',
  't4_task3': 'Rotate discharge valve 3 to depressurize vault gate',

  // Tape 5: Green Static (Sunken Jungle)
  't5_task1': 'Traverse boulder crossing to reach northern sluice',
  't5_task2': 'Align secondary weir gate along mossy log bridge',
  't5_task3': 'Release tertiary spillway and unlock temple gate',

  // Tape 6: Resonance (Marble Atrium)
  't6_task1': 'Decipher four-note acoustic harmony inscription',
  't6_task2': 'Strike bronze chime bells in harmonic succession',
  't6_task3': 'Pass through resonance gate before echo decays',

  // Tape 7: Sector 9 (Neon Flood)
  't7_task1': 'Bypass acoustic firewall on neon uplink terminal 1',
  't7_task2': 'Re-route transit security node on terminal 2',
  't7_task3': 'Execute final terminal decrypt and breach transit gate',

  // Tape 8: The Breathing Hall (Hydro Maze)
  't8_task1': 'Retrieve power core 1 from eastern high-ground grotto',
  't8_task2': 'Transport cores 2 & 3 along dry perimeter catwalks',
  't8_task3': 'Insert cores into central fuse bay to lift blast shutter',

  // Tape 9: Platform Zero (Drowned Metro)
  't9_task1': 'Recover conductor master key from flooded dispatch desk',
  't9_task2': 'Throw track switch lever 1 to route Ghost Train',
  't9_task3': 'Throw lever 2 and board carriage before departure',

  // Tape 10: The Listener (Drainage Core)
  't9_task1_core': 'Synchronize intake turbine generator 1',
  't9_task2_core': 'Synchronize mid-level generator 2',
  't9_task3_core': 'Engage core turbine 3 and trigger blast vault seal',
};

// Helper evaluators
const hasEscaped = (events: readonly RunEvent[]): boolean =>
  events.some((e) => e.type === 'escape');

const countWadingNoises = (events: readonly RunEvent[]): number =>
  events.filter((e): e is NoiseMadeEvent => e.type === 'noise_made' && e.kind === 'wade').length;

export const CAMPAIGN_TAPES: readonly TapeDef[] = [
  {
    index: 0,
    id: 'tape_00_orientation',
    title: 'Orientation',
    mapId: 'orientation',
    threatRating: 1,
    unlockStarsRequired: 0,
    logline: 'Archive Log 00: Employee onboarding footage. Subject noted that sound propagates unnaturally well across wet tile.',
    primary: {
      id: 't0_primary',
      textKey: 't0_primary',
      hudFormat: 'Follow guided steps',
      description: 'Follow the guided steps',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't0_sec_a',
      textKey: 't0_sec_a',
      hudFormat: 'Complete orientation protocol',
      description: 'Complete the orientation protocol without dying',
      kind: 'secondary',
      evaluate: (events) => hasEscaped(events) && !events.some((e) => e.type === 'death'),
    },
    secondaryB: {
      id: 't0_sec_b',
      textKey: 't0_sec_b',
      hudFormat: 'Cross pool silently',
      description: 'Cross the wading pool without alerting the entity',
      kind: 'secondary',
      evaluate: (events) => countWadingNoises(events) <= 2,
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't0_hidden',
      textKey: 't0_hidden',
      hudFormat: 'Archivist memo retrieved',
      description: 'Retrieve the Archivist memo behind the starter drain',
      kind: 'hidden',
      evaluate: (events) => events.some((e) => e.type === 'objective_done' && e.id === 'memo_00'),
    },
    hiddenHint: 'a rusted ventilation grate near the starter drain hides an employee handbook',
    remixMutators: ['ducky', 'mirror'],
    workingTasks: [
      { id: 't0_w1', stepIndex: 1, totalSteps: 4, textKey: 't0_task1', estimatedTimeSeconds: 20, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't0_w2', stepIndex: 2, totalSteps: 4, textKey: 't0_task2', estimatedTimeSeconds: 35, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't0_w3', stepIndex: 3, totalSteps: 4, textKey: 't0_task3', estimatedTimeSeconds: 25, risk: 'loud', progressCurrent: 0, progressTarget: 1 },
      { id: 't0_w4', stepIndex: 4, totalSteps: 4, textKey: 't0_task4', estimatedTimeSeconds: 20, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 1,
    id: 'tape_01_natatorium',
    title: 'The Grand Opening',
    mapId: 'natatorium',
    threatRating: 2,
    unlockStarsRequired: 0,
    logline: 'Archive Log 01: Grand Natatorium opening gala, 1983. The guests left their shoes. The water remained undisturbed.',
    primary: {
      id: 't1_primary',
      textKey: 't1_primary',
      hudFormat: 'Find code, restore pump, open doors',
      description: 'Find code, restore pump, open doors',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't1_sec_a',
      textKey: 't1_sec_a',
      hudFormat: 'Wading noises <= 6',
      description: 'At most 6 wading noises',
      kind: 'secondary',
      evaluate: (events) => hasEscaped(events) && countWadingNoises(events) <= 6,
      failCondition: (events) => countWadingNoises(events) > 6,
    },
    secondaryB: {
      id: 't1_sec_b',
      textKey: 't1_sec_b',
      hudFormat: 'Finish under par time',
      description: 'Finish under par',
      kind: 'secondary',
      evaluate: (events, ctx) => hasEscaped(events) && (ctx?.timeSeconds ?? 999) <= (ctx?.parTime ?? 240),
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't1_hidden',
      textKey: 't1_hidden',
      hudFormat: 'Diving tower tape reel',
      description: 'Tape Reel under the diving tower',
      kind: 'hidden',
      evaluate: (events) => events.some((e) => e.type === 'objective_done' && e.id === 'tape_reel_natatorium'),
    },
    hiddenHint: 'a tape reel glints submerged near the deep end diving tower foundation',
    remixMutators: ['glass_water', 'blackout'],
    workingTasks: [
      { id: 't1_w1', stepIndex: 1, totalSteps: 3, textKey: 't1_task1', estimatedTimeSeconds: 60, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't1_w2', stepIndex: 2, totalSteps: 3, textKey: 't1_task2', estimatedTimeSeconds: 90, risk: 'loud', progressCurrent: 0, progressTarget: 1 },
      { id: 't1_w3', stepIndex: 3, totalSteps: 3, textKey: 't1_task3', estimatedTimeSeconds: 60, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 2,
    id: 'tape_02_archipelago',
    title: 'Dry Season',
    mapId: 'poolrooms',
    threatRating: 2,
    unlockStarsRequired: 2,
    logline: 'Archive Log 02: Survey crew tape across the sunken slabs. The surveyor noted that touching the pool caused an acoustic response.',
    primary: {
      id: 't2_primary',
      textKey: 't2_primary',
      hudFormat: 'Find four digits, use keypad',
      description: 'Find four digits, use keypad',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't2_sec_a',
      textKey: 't2_sec_a',
      hudFormat: 'Never touch water',
      description: 'Never touch water',
      kind: 'secondary',
      evaluate: (events, ctx) => hasEscaped(events) && countWadingNoises(events) === 0 && !ctx?.waterTouched,
      failCondition: (events, ctx) => countWadingNoises(events) > 0 || !!ctx?.waterTouched,
    },
    secondaryB: {
      id: 't2_sec_b',
      textKey: 't2_sec_b',
      hudFormat: 'No wrong code',
      description: 'No wrong code',
      kind: 'secondary',
      evaluate: (events, ctx) => hasEscaped(events) && !ctx?.wrongCodeEntered,
      failCondition: (_e, ctx) => !!ctx?.wrongCodeEntered,
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't2_hidden',
      textKey: 't2_hidden',
      hudFormat: 'All 4 digits inspected prior to keypad',
      description: 'All four digits before reaching the keypad',
      kind: 'hidden',
      evaluate: (events) => events.some((e) => e.type === 'objective_done' && e.id === 'all_digits_pre_keypad'),
    },
    hiddenHint: 'inspect all four stone pillars across the slabs before stepping up to the keypad',
    remixMutators: ['thin_ice', 'hair_trigger'],
    workingTasks: [
      { id: 't2_w1', stepIndex: 1, totalSteps: 4, textKey: 't2_task1', estimatedTimeSeconds: 45, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't2_w2', stepIndex: 2, totalSteps: 4, textKey: 't2_task2', estimatedTimeSeconds: 70, risk: 'quiet', progressCurrent: 0, progressTarget: 2 },
      { id: 't2_w3', stepIndex: 3, totalSteps: 4, textKey: 't2_task3', estimatedTimeSeconds: 50, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't2_w4', stepIndex: 4, totalSteps: 4, textKey: 't2_task4', estimatedTimeSeconds: 30, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 3,
    id: 'tape_03_school',
    title: 'After the Bell',
    mapId: 'drowned_school',
    threatRating: 3,
    unlockStarsRequired: 2,
    logline: 'Archive Log 03: Elementary school annex basement. Clocks stopped at 3:07 PM. The PA system continues to broadcast static.',
    primary: {
      id: 't3_primary',
      textKey: 't3_primary',
      hudFormat: 'Register, PA console, cut chains',
      description: 'Register, PA console, cut chains',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't3_sec_a',
      textKey: 't3_sec_a',
      hudFormat: 'PA charges <= 3',
      description: 'At most 3 PA charges',
      kind: 'secondary',
      evaluate: (events) => {
        const paUses = events.filter((e) => e.type === 'item_used' && e.item === 'pa_speaker').length;
        return hasEscaped(events) && paUses <= 3;
      },
      failCondition: (events) => events.filter((e) => e.type === 'item_used' && e.item === 'pa_speaker').length > 3,
    },
    secondaryB: {
      id: 't3_sec_b',
      textKey: 't3_sec_b',
      hudFormat: 'Floor creak <= 0.15',
      description: 'No creak above 0.15',
      kind: 'secondary',
      evaluate: (events, ctx) => {
        const maxCreak = Math.max(
          ctx?.creakLoudnessMax ?? 0,
          ...events.filter((e): e is NoiseMadeEvent => e.type === 'noise_made' && e.kind === 'creak').map((e) => e.loudness),
        );
        return hasEscaped(events) && maxCreak <= 0.15;
      },
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't3_hidden',
      textKey: 't3_hidden',
      hudFormat: 'Lurk survived >= 10s',
      description: 'Survive a lurk of 10 s',
      kind: 'hidden',
      evaluate: (events) =>
        events.some((e): e is LurkSurvivedEvent => e.type === 'lurk_survived' && e.duration >= 10.0),
    },
    hiddenHint: 'perch atop the gymnasium lockers and hold your breath while the entity inspects',
    remixMutators: ['tinnitus', 'twin_entity'],
    workingTasks: [
      { id: 't3_w1', stepIndex: 1, totalSteps: 3, textKey: 't3_task1', estimatedTimeSeconds: 65, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't3_w2', stepIndex: 2, totalSteps: 3, textKey: 't3_task2', estimatedTimeSeconds: 80, risk: 'loud', progressCurrent: 0, progressTarget: 1 },
      { id: 't3_w3', stepIndex: 3, totalSteps: 3, textKey: 't3_task3', estimatedTimeSeconds: 70, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 4,
    id: 'tape_04_tunnels',
    title: 'Pressure',
    mapId: 'utility_tunnels',
    threatRating: 3,
    unlockStarsRequired: 2,
    logline: 'Archive Log 04: Industrial maintenance tunnel survey. Valve pressure holds back the roar of the lower sump.',
    primary: {
      id: 't4_primary',
      textKey: 't4_primary',
      hudFormat: 'Three valves in order, main gate',
      description: 'Three valves in order, main gate',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't4_sec_a',
      textKey: 't4_sec_a',
      hudFormat: 'Zero alarms triggered',
      description: 'Zero alarms',
      kind: 'secondary',
      evaluate: (events) =>
        hasEscaped(events) && !events.some((e) => e.type === 'noise_made' && e.kind === 'alarm'),
      failCondition: (events) => events.some((e) => e.type === 'noise_made' && e.kind === 'alarm'),
    },
    secondaryB: {
      id: 't4_sec_b',
      textKey: 't4_sec_b',
      hudFormat: 'Zero metal clangs',
      description: 'No clang',
      kind: 'secondary',
      evaluate: (events) =>
        hasEscaped(events) && !events.some((e) => e.type === 'noise_made' && e.kind === 'clang'),
      failCondition: (events) => events.some((e) => e.type === 'noise_made' && e.kind === 'clang'),
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't4_hidden',
      textKey: 't4_hidden',
      hudFormat: 'Valve turned inside steam mask',
      description: 'Turn a valve inside a steam mask',
      kind: 'hidden',
      evaluate: (events, ctx) =>
        events.some((e) => e.type === 'objective_done' && e.id === 'valve_in_steam_mask') || !!ctx?.steamMaskActive,
    },
    hiddenHint: 'equip a respirator and rotate valve 2 while completely enveloped in steam',
    remixMutators: ['spring_tide', 'one_breath'],
    workingTasks: [
      { id: 't4_w1', stepIndex: 1, totalSteps: 3, textKey: 't4_task1', estimatedTimeSeconds: 60, risk: 'loud', progressCurrent: 0, progressTarget: 1 },
      { id: 't4_w2', stepIndex: 2, totalSteps: 3, textKey: 't4_task2', estimatedTimeSeconds: 75, risk: 'loud', progressCurrent: 0, progressTarget: 1 },
      { id: 't4_w3', stepIndex: 3, totalSteps: 3, textKey: 't4_task3', estimatedTimeSeconds: 65, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 5,
    id: 'tape_05_jungle',
    title: 'Green Static',
    mapId: 'sunken_jungle',
    threatRating: 4,
    unlockStarsRequired: 2,
    logline: 'Archive Log 05: Subterranean atrium reclaimed by ferns and stagnant water. Bioluminescent spores mimic flashlight beams.',
    primary: {
      id: 't5_primary',
      textKey: 't5_primary',
      hudFormat: 'Three sluices in order, temple gate',
      description: 'Three sluices in order, temple gate',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't5_sec_a',
      textKey: 't5_sec_a',
      hudFormat: 'Stones, boulders & logs only',
      description: 'Cross using only stones, boulders and logs',
      kind: 'secondary',
      evaluate: (events) => hasEscaped(events) && countWadingNoises(events) === 0,
      failCondition: (events) => countWadingNoises(events) > 0,
    },
    secondaryB: {
      id: 't5_sec_b',
      textKey: 't5_sec_b',
      hudFormat: 'No flash flood triggered',
      description: 'No flash flood',
      kind: 'secondary',
      evaluate: (events, ctx) => hasEscaped(events) && !ctx?.flashFloodTriggered,
      failCondition: (_e, ctx) => !!ctx?.flashFloodTriggered,
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't5_hidden',
      textKey: 't5_hidden',
      hudFormat: 'Waterfall pool without wading',
      description: 'Reach the waterfall pool without wading',
      kind: 'hidden',
      evaluate: (events) => events.some((e) => e.type === 'objective_done' && e.id === 'waterfall_dry_reach'),
    },
    hiddenHint: 'leaping boulder to boulder along the mossy ridge leads behind the cascade dry',
    remixMutators: ['glass_water', 'silent_film'],
    workingTasks: [
      { id: 't5_w1', stepIndex: 1, totalSteps: 3, textKey: 't5_task1', estimatedTimeSeconds: 70, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't5_w2', stepIndex: 2, totalSteps: 3, textKey: 't5_task2', estimatedTimeSeconds: 85, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't5_w3', stepIndex: 3, totalSteps: 3, textKey: 't5_task3', estimatedTimeSeconds: 65, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 6,
    id: 'tape_06_atrium',
    title: 'Resonance',
    mapId: 'marble_atrium',
    threatRating: 3,
    unlockStarsRequired: 2,
    logline: 'Archive Log 06: Grand memorial atrium. Four bronze bells ring with acoustic frequencies that confound the creature.',
    primary: {
      id: 't6_primary',
      textKey: 't6_primary',
      hudFormat: 'Melody, four bells, exit gate',
      description: 'Melody, four bells, exit gate',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't6_sec_a',
      textKey: 't6_sec_a',
      hudFormat: 'Pebble lures <= 3',
      description: 'At most 3 pebble lures',
      kind: 'secondary',
      evaluate: (events) => {
        const lures = events.filter((e) => e.type === 'item_used' && e.item === 'pebble').length;
        return hasEscaped(events) && lures <= 3;
      },
      failCondition: (events) => events.filter((e) => e.type === 'item_used' && e.item === 'pebble').length > 3,
    },
    secondaryB: {
      id: 't6_sec_b',
      textKey: 't6_sec_b',
      hudFormat: 'No sinking platform falls',
      description: 'No sinking-platform falls',
      kind: 'secondary',
      evaluate: (events, ctx) => hasEscaped(events) && !ctx?.sinkingPlatformFell,
      failCondition: (_e, ctx) => !!ctx?.sinkingPlatformFell,
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't6_hidden',
      textKey: 't6_hidden',
      hudFormat: 'Entity lured away twice',
      description: 'Lure the entity away twice',
      kind: 'hidden',
      evaluate: (events) => events.filter((e) => e.type === 'lure_success').length >= 2,
    },
    hiddenHint: 'pebbles clinking against the far colonnade will draw the entity across the floor',
    remixMutators: ['blackout', 'hair_trigger'],
    workingTasks: [
      { id: 't6_w1', stepIndex: 1, totalSteps: 3, textKey: 't6_task1', estimatedTimeSeconds: 50, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't6_w2', stepIndex: 2, totalSteps: 3, textKey: 't6_task2', estimatedTimeSeconds: 80, risk: 'loud', progressCurrent: 0, progressTarget: 4 },
      { id: 't6_w3', stepIndex: 3, totalSteps: 3, textKey: 't6_task3', estimatedTimeSeconds: 60, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 7,
    id: 'tape_07_neon',
    title: 'Sector 9',
    mapId: 'neon_flood',
    threatRating: 4,
    unlockStarsRequired: 2,
    logline: 'Archive Log 07: Flooded commercial strip under flickering holograms. Security drones patrol with blind acoustic sirens.',
    primary: {
      id: 't7_primary',
      textKey: 't7_primary',
      hudFormat: 'Three uplinks, transit gate',
      description: 'Three uplinks, transit gate',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't7_sec_a',
      textKey: 't7_sec_a',
      hudFormat: 'Zero drone locks',
      description: 'Zero drone locks',
      kind: 'secondary',
      evaluate: (events, ctx) =>
        hasEscaped(events) && (ctx?.droneAcousticLocks ?? 0) === 0 && !events.some((e) => e.type === 'noise_made' && e.kind === 'drone_lock'),
      failCondition: (events, ctx) => (ctx?.droneAcousticLocks ?? 0) > 0 || events.some((e) => e.type === 'noise_made' && e.kind === 'drone_lock'),
    },
    secondaryB: {
      id: 't7_sec_b',
      textKey: 't7_sec_b',
      hudFormat: 'Zero missed hacks',
      description: 'Zero missed hacks',
      kind: 'secondary',
      evaluate: (events, ctx) => hasEscaped(events) && (ctx?.missedHacks ?? 0) === 0,
      failCondition: (_e, ctx) => (ctx?.missedHacks ?? 0) > 0,
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't7_hidden',
      textKey: 't7_hidden',
      hudFormat: 'EMP dual drone disable',
      description: 'Use the EMP on two drones at once',
      kind: 'hidden',
      evaluate: (events) => events.some((e) => e.type === 'objective_done' && e.id === 'emp_dual_drone'),
    },
    hiddenHint: 'timing the EMP pulse in the flooded corridor disables both patrols simultaneously',
    remixMutators: ['tinnitus', 'long_tape'],
    workingTasks: [
      { id: 't7_w1', stepIndex: 1, totalSteps: 3, textKey: 't7_task1', estimatedTimeSeconds: 65, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't7_w2', stepIndex: 2, totalSteps: 3, textKey: 't7_task2', estimatedTimeSeconds: 85, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't7_w3', stepIndex: 3, totalSteps: 3, textKey: 't7_task3', estimatedTimeSeconds: 70, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 8,
    id: 'tape_08_hydromaze',
    title: 'The Breathing Hall',
    mapId: 'hydro_maze',
    threatRating: 4,
    unlockStarsRequired: 2,
    logline: 'Archive Log 08: Overflow filtration cistern. The water rises and falls like a steady lung. Timing is everything.',
    primary: {
      id: 't8_primary',
      textKey: 't8_primary',
      hudFormat: 'Three cores, fuse bay, shutter',
      description: 'Three cores, fuse bay, shutter',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't8_sec_a',
      textKey: 't8_sec_a',
      hudFormat: 'Carry cores on high ground only',
      description: 'Carry cores only on high ground',
      kind: 'secondary',
      evaluate: (events) => hasEscaped(events) && !events.some((e) => e.type === 'noise_made' && e.kind === 'wade_with_core'),
      failCondition: (events) => events.some((e) => e.type === 'noise_made' && e.kind === 'wade_with_core'),
    },
    secondaryB: {
      id: 't8_sec_b',
      textKey: 't8_sec_b',
      hudFormat: 'No flooded wading',
      description: 'No flooded wading',
      kind: 'secondary',
      evaluate: (events) => hasEscaped(events) && countWadingNoises(events) === 0,
      failCondition: (events) => countWadingNoises(events) > 0,
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't8_hidden',
      textKey: 't8_hidden',
      hudFormat: 'Escape prior to 3rd level flip',
      description: 'Finish before the third level flip',
      kind: 'hidden',
      evaluate: (events, ctx) => hasEscaped(events) && (ctx?.levelFlips ?? 0) < 3,
    },
    hiddenHint: 'memorize the 90-second tide cycle to haul all cores before the third flip',
    remixMutators: ['spring_tide', 'thin_ice'],
    workingTasks: [
      { id: 't8_w1', stepIndex: 1, totalSteps: 3, textKey: 't8_task1', estimatedTimeSeconds: 60, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't8_w2', stepIndex: 2, totalSteps: 3, textKey: 't8_task2', estimatedTimeSeconds: 95, risk: 'quiet', progressCurrent: 0, progressTarget: 2 },
      { id: 't8_w3', stepIndex: 3, totalSteps: 3, textKey: 't8_task3', estimatedTimeSeconds: 55, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 9,
    id: 'tape_09_metro',
    title: 'Platform Zero',
    mapId: 'drowned_metro',
    threatRating: 5,
    unlockStarsRequired: 2,
    logline: 'Archive Log 09: Subterranean rail transit hub. The ghost train arrives on schedule, oblivious to the silence.',
    primary: {
      id: 't9_primary',
      textKey: 't9_primary',
      hudFormat: 'Key, two levers, depart',
      description: 'Key, two levers, depart',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't9_sec_a',
      textKey: 't9_sec_a',
      hudFormat: 'Strand entity with Ghost Train',
      description: 'Strand the entity with the Ghost Train',
      kind: 'secondary',
      evaluate: (events) => events.some((e) => e.type === 'objective_done' && e.id === 'ghost_train_strand'),
    },
    secondaryB: {
      id: 't9_sec_b',
      textKey: 't9_sec_b',
      hudFormat: 'No noise during train pass',
      description: 'No noise during the pass',
      kind: 'secondary',
      evaluate: (events) => hasEscaped(events) && !events.some((e) => e.type === 'noise_made' && e.kind === 'noise_during_train'),
      failCondition: (events) => events.some((e) => e.type === 'noise_made' && e.kind === 'noise_during_train'),
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't9_hidden',
      textKey: 't9_hidden',
      hudFormat: 'Board train with >= 6s spare',
      description: 'Board with 6 s to spare',
      kind: 'hidden',
      evaluate: (events) => events.some((e) => e.type === 'objective_done' && e.id === 'board_6s_spare'),
    },
    hiddenHint: 'pull the track switch just as the whistle blares, then sprint aboard the carriage',
    remixMutators: ['twin_entity', 'blackout'],
    workingTasks: [
      { id: 't9_w1', stepIndex: 1, totalSteps: 3, textKey: 't9_task1', estimatedTimeSeconds: 65, risk: 'quiet', progressCurrent: 0, progressTarget: 1 },
      { id: 't9_w2', stepIndex: 2, totalSteps: 3, textKey: 't9_task2', estimatedTimeSeconds: 80, risk: 'loud', progressCurrent: 0, progressTarget: 2 },
      { id: 't9_w3', stepIndex: 3, totalSteps: 3, textKey: 't9_task3', estimatedTimeSeconds: 50, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
  {
    index: 10,
    id: 'tape_10_drainage',
    title: 'The Listener',
    mapId: 'drainage_core',
    threatRating: 5,
    unlockStarsRequired: 2,
    logline: 'Archive Log 10 (FINALE): Deep municipal vortex chamber. The original specimen roosts above the primary drain.',
    primary: {
      id: 't10_primary',
      textKey: 't10_primary',
      hudFormat: 'Three generators, blast doors',
      description: 'Three generators, blast doors',
      kind: 'primary',
      evaluate: (events) => hasEscaped(events),
    },
    secondaryA: {
      id: 't10_sec_a',
      textKey: 't10_sec_a',
      hudFormat: 'All 3 generators within single runtime',
      description: 'All three within one runtime',
      kind: 'secondary',
      evaluate: (events) => events.some((e) => e.type === 'objective_done' && e.id === 'all_generators_single_runtime'),
    },
    secondaryB: {
      id: 't10_sec_b',
      textKey: 't10_sec_b',
      hudFormat: 'Zero noisemakers deployed',
      description: 'No noisemakers',
      kind: 'secondary',
      evaluate: (events) => {
        const deployed = events.filter((e) => e.type === 'item_used' && e.item === 'noisemaker').length;
        return hasEscaped(events) && deployed === 0;
      },
      failCondition: (events) => events.filter((e) => e.type === 'item_used' && e.item === 'noisemaker').length > 0,
    },
    get secondary() { return this.secondaryA; },
    get secondaries() { return [this.secondaryA, this.secondaryB] as const; },
    hidden: {
      id: 't10_hidden',
      textKey: 't10_hidden',
      hudFormat: 'Cache found without flashlight',
      description: 'Find the cache without the flashlight',
      kind: 'hidden',
      evaluate: (events, ctx) =>
        events.some((e) => e.type === 'objective_done' && e.id === 'cache_no_flashlight') || !ctx?.usedFlashlight,
    },
    hiddenHint: 'feel along the southern conduit in total darkness to discover the Archivist cache',
    remixMutators: ['silent_film', 'hair_trigger'],
    workingTasks: [
      { id: 't10_w1', stepIndex: 1, totalSteps: 3, textKey: 't9_task1_core', estimatedTimeSeconds: 70, risk: 'loud', progressCurrent: 0, progressTarget: 1 },
      { id: 't10_w2', stepIndex: 2, totalSteps: 3, textKey: 't9_task2_core', estimatedTimeSeconds: 85, risk: 'loud', progressCurrent: 0, progressTarget: 1 },
      { id: 't10_w3', stepIndex: 3, totalSteps: 3, textKey: 't9_task3_core', estimatedTimeSeconds: 75, risk: 'timed', progressCurrent: 0, progressTarget: 1 },
    ],
  },
];

export interface TapeProgress {
  unlocked: boolean;
  skippedWithStatic?: boolean;
  stars: number; // 0..3
  primaryDone: boolean;
  secondaryADone: boolean;
  secondaryBDone: boolean;
  /** Compatibility alias for secondaryADone */
  secondaryDone: boolean;
  hiddenDone: boolean;
  bestScore: number;
  bestTimeSeconds: number;
}

export interface CampaignSnapshot {
  tapes: Record<string, TapeProgress>;
  failedAttempts: Record<string, number>;
  totalStars: number;
}

export class Campaign {
  private progress = new Map<string, TapeProgress>();
  private failedAttempts = new Map<string, number>();

  constructor(initialSnapshot?: CampaignSnapshot) {
    if (initialSnapshot) {
      this.hydrate(initialSnapshot);
    } else {
      this.initDefaults();
    }
  }

  private initDefaults(): void {
    for (let i = 0; i < CAMPAIGN_TAPES.length; i++) {
      const tape = CAMPAIGN_TAPES[i]!;
      this.progress.set(tape.id, {
        unlocked: i <= 1, // Orientation and Tape 1 unlocked by default
        stars: 0,
        primaryDone: false,
        secondaryADone: false,
        secondaryBDone: false,
        secondaryDone: false,
        hiddenDone: false,
        bestScore: 0,
        bestTimeSeconds: 9999,
      });
      this.failedAttempts.set(tape.id, 0);
    }
  }

  getTapeProgress(tapeId: string): TapeProgress {
    return (
      this.progress.get(tapeId) ?? {
        unlocked: false,
        stars: 0,
        primaryDone: false,
        secondaryADone: false,
        secondaryBDone: false,
        secondaryDone: false,
        hiddenDone: false,
        bestScore: 0,
        bestTimeSeconds: 9999,
      }
    );
  }

  getFailedAttempts(tapeId: string): number {
    return this.failedAttempts.get(tapeId) ?? 0;
  }

  getHiddenHint(tapeId: string): string | null {
    const tape = CAMPAIGN_TAPES.find((t) => t.id === tapeId);
    if (!tape) return null;
    const fails = this.getFailedAttempts(tapeId);
    if (fails >= 3) {
      return tape.hiddenHint;
    }
    return null;
  }

  getTotalStars(): number {
    let sum = 0;
    for (const p of this.progress.values()) {
      sum += p.stars;
    }
    return sum;
  }

  isTapeUnlocked(tapeIndex: number): boolean {
    if (tapeIndex <= 1) return true;
    const tape = CAMPAIGN_TAPES[tapeIndex];
    if (!tape) return false;

    const currentProg = this.progress.get(tape.id);
    if (currentProg?.unlocked) return true;

    // Check previous tape
    const prevTape = CAMPAIGN_TAPES[tapeIndex - 1];
    if (!prevTape) return false;
    const prevProg = this.progress.get(prevTape.id);
    return (prevProg?.stars ?? 0) >= tape.unlockStarsRequired;
  }

  isRemixUnlocked(tapeIndex: number): boolean {
    const tape = CAMPAIGN_TAPES[tapeIndex];
    if (!tape) return false;
    const prog = this.progress.get(tape.id);
    return (prog?.stars ?? 0) >= 3;
  }

  unlockWithStatic(tapeId: string, currentStatic: number, staticCost = 300): { success: boolean; newStatic: number } {
    const tape = CAMPAIGN_TAPES.find((t) => t.id === tapeId);
    if (!tape) return { success: false, newStatic: currentStatic };

    const prevTape = CAMPAIGN_TAPES[tape.index - 1];
    const prevProg = prevTape ? this.progress.get(prevTape.id) : null;
    const hasOneStar = (prevProg?.stars ?? 0) >= 1;

    if (!hasOneStar || currentStatic < staticCost) {
      return { success: false, newStatic: currentStatic };
    }

    const prog = this.getTapeProgress(tapeId);
    prog.unlocked = true;
    prog.skippedWithStatic = true;
    this.progress.set(tapeId, prog);

    return { success: true, newStatic: currentStatic - staticCost };
  }

  recordRun(
    tapeId: string,
    result: {
      escaped: boolean;
      secondaryADone?: boolean;
      secondaryBDone?: boolean;
      secondaryDone?: boolean;
      hiddenDone: boolean;
      score: number;
      timeSeconds: number;
      rank?: 'S' | 'A' | 'B' | 'C' | 'D';
    },
  ): { newlyEarnedStars: number; unlockedTapes: string[] } {
    const tape = CAMPAIGN_TAPES.find((t) => t.id === tapeId);
    if (!tape) return { newlyEarnedStars: 0, unlockedTapes: [] };

    const prog = this.getTapeProgress(tapeId);
    const oldStars = prog.stars;

    const secA = result.secondaryADone ?? result.secondaryDone ?? false;
    const secB = result.secondaryBDone ?? result.secondaryDone ?? false;

    if (result.escaped) prog.primaryDone = true;
    if (secA) prog.secondaryADone = true;
    if (secB) prog.secondaryBDone = true;
    prog.secondaryDone = prog.secondaryADone && prog.secondaryBDone;
    if (result.hiddenDone) prog.hiddenDone = true;

    // Track failed attempts for hidden hints (3 failed attempts rule)
    if (!result.escaped) {
      const currentFails = this.failedAttempts.get(tapeId) ?? 0;
      this.failedAttempts.set(tapeId, currentFails + 1);
    }

    // Star award rules from Section 5:
    // 1 star: escape
    // 2 stars: escape and finish both secondaries
    // 3 stars: two stars, the hidden objective, and a rank of B or better
    let stars = 0;
    if (prog.primaryDone) {
      stars = 1;
      if (prog.secondaryADone && prog.secondaryBDone) {
        stars = 2;
        const rankIsBOrBetter = result.rank ? ['S', 'A', 'B'].includes(result.rank) : true;
        if (prog.hiddenDone && rankIsBOrBetter) {
          stars = 3;
        }
      }
    }

    prog.stars = Math.max(prog.stars, stars);
    prog.bestScore = Math.max(prog.bestScore, result.score);
    if (result.escaped) {
      prog.bestTimeSeconds = Math.min(prog.bestTimeSeconds, result.timeSeconds);
    }
    this.progress.set(tapeId, prog);

    const newlyEarnedStars = Math.max(0, prog.stars - oldStars);

    // Check if next tape unlocks
    const unlockedTapes: string[] = [];
    const nextTape = CAMPAIGN_TAPES[tape.index + 1];
    if (nextTape) {
      const nextProg = this.getTapeProgress(nextTape.id);
      if (!nextProg.unlocked && prog.stars >= nextTape.unlockStarsRequired) {
        nextProg.unlocked = true;
        this.progress.set(nextTape.id, nextProg);
        unlockedTapes.push(nextTape.id);
      }
    }

    return { newlyEarnedStars, unlockedTapes };
  }

  serialize(): CampaignSnapshot {
    const tapes: Record<string, TapeProgress> = {};
    for (const [k, v] of this.progress.entries()) {
      tapes[k] = { ...v };
    }
    const failedAttempts: Record<string, number> = {};
    for (const [k, v] of this.failedAttempts.entries()) {
      failedAttempts[k] = v;
    }
    return {
      tapes,
      failedAttempts,
      totalStars: this.getTotalStars(),
    };
  }

  hydrate(snapshot: CampaignSnapshot): void {
    this.progress.clear();
    this.failedAttempts.clear();

    if (snapshot.tapes) {
      for (const [k, v] of Object.entries(snapshot.tapes)) {
        this.progress.set(k, { ...v });
      }
    }
    if (snapshot.failedAttempts) {
      for (const [k, v] of Object.entries(snapshot.failedAttempts)) {
        this.failedAttempts.set(k, v);
      }
    }

    // Ensure all campaign tapes exist
    for (let i = 0; i < CAMPAIGN_TAPES.length; i++) {
      const tape = CAMPAIGN_TAPES[i]!;
      if (!this.progress.has(tape.id)) {
        this.progress.set(tape.id, {
          unlocked: i <= 1,
          stars: 0,
          primaryDone: false,
          secondaryADone: false,
          secondaryBDone: false,
          secondaryDone: false,
          hiddenDone: false,
          bestScore: 0,
          bestTimeSeconds: 9999,
        });
      }
      if (!this.failedAttempts.has(tape.id)) {
        this.failedAttempts.set(tape.id, 0);
      }
    }
  }

  getState(): { unlockedTapes: number[]; stars: Record<number, number>; totalStars: number } {
    const unlockedTapes: number[] = [];
    const stars: Record<number, number> = {};
    for (const t of CAMPAIGN_TAPES) {
      const p = this.getTapeProgress(t.id);
      if (p.unlocked) unlockedTapes.push(t.index);
      stars[t.index] = p.stars;
    }
    return {
      unlockedTapes,
      stars,
      totalStars: this.getTotalStars(),
    };
  }

  recordTapeResult(
    tapeIndex: number,
    stars: number,
    _objectivesDone: string[] = [],
  ): { newlyEarnedStars: number; unlockedTapes: number[] } {
    const tape = CAMPAIGN_TAPES[tapeIndex];
    if (!tape) return { newlyEarnedStars: 0, unlockedTapes: [] };
    const res = this.recordRun(tape.id, {
      escaped: stars >= 1,
      secondaryADone: stars >= 2,
      secondaryBDone: stars >= 2,
      hiddenDone: stars >= 3,
      rank: 'B',
      score: 1000,
      timeSeconds: 200,
    });
    return {
      newlyEarnedStars: res.newlyEarnedStars,
      unlockedTapes: res.unlockedTapes.map((id) => CAMPAIGN_TAPES.find((t) => t.id === id)?.index ?? 0),
    };
  }
}

export type CampaignArchive = Campaign;
export const CampaignArchive = Campaign;

/* ── Campaign.ts ───────────────────────────────────────────────────────────
 *  The Tape Archive: Found-footage campaign progression state machine.
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

export interface TapeObjective {
  id: string;
  description: string;
  kind: 'primary' | 'secondary' | 'hidden';
}

export interface TapeDef {
  index: number;
  id: string;
  title: string;
  mapId: string;
  unlockStarsRequired: number; // stars on previous tape (or skip with static)
  logline: string;
  primary: TapeObjective;
  secondary: TapeObjective;
  hidden: TapeObjective;
  remixMutators: [string, string]; // mutator pair unlocked at 3 stars
}

export const CAMPAIGN_TAPES: readonly TapeDef[] = [
  {
    index: 0,
    id: 'tape_00_orientation',
    title: 'Orientation',
    mapId: 'orientation',
    unlockStarsRequired: 0,
    logline: 'Archive Log 00: Employee onboarding footage. Subject noted that sound propagates unnaturally well across wet tile.',
    primary: { id: 't0_primary', description: 'Complete the acoustic orientation protocol', kind: 'primary' },
    secondary: { id: 't0_sec', description: 'Cross the wading pool without alerting the entity', kind: 'secondary' },
    hidden: { id: 't0_hidden', description: 'Retrieve the Archivist memo behind the starter drain', kind: 'hidden' },
    remixMutators: ['ducky', 'mirror'],
  },
  {
    index: 1,
    id: 'tape_01_natatorium',
    title: 'The Grand Opening',
    mapId: 'natatorium',
    unlockStarsRequired: 0,
    logline: 'Archive Log 01: Grand Natatorium opening gala, 1983. The guests left their shoes. The water remained undisturbed.',
    primary: { id: 't1_primary', description: 'Escape the Natatorium', kind: 'primary' },
    secondary: { id: 't1_sec', description: 'Escape with 6 or fewer wading noises', kind: 'secondary' },
    hidden: { id: 't1_hidden', description: 'Recover the Tape Reel beneath the high diving tower', kind: 'hidden' },
    remixMutators: ['glass_water', 'blackout'],
  },
  {
    index: 2,
    id: 'tape_02_archipelago',
    title: 'Dry Season',
    mapId: 'poolrooms',
    unlockStarsRequired: 2,
    logline: 'Archive Log 02: Survey crew tape across the sunken slabs. The surveyor noted that touching the pool caused an acoustic response.',
    primary: { id: 't2_primary', description: 'Escape the archipelago', kind: 'primary' },
    secondary: { id: 't2_sec', description: 'Never touch water during the entire run', kind: 'secondary' },
    hidden: { id: 't2_hidden', description: 'Inspect all 4 ordinal digit pillars before touching the keypad', kind: 'hidden' },
    remixMutators: ['thin_ice', 'hair_trigger'],
  },
  {
    index: 3,
    id: 'tape_03_school',
    title: 'After the Bell',
    mapId: 'drowned_school',
    unlockStarsRequired: 2,
    logline: 'Archive Log 03: Elementary school annex basement. Clocks stopped at 3:07 PM. The PA system continues to broadcast static.',
    primary: { id: 't3_primary', description: 'Escape the drowned school', kind: 'primary' },
    secondary: { id: 't3_sec', description: 'Escape using 3 or fewer PA speaker charges', kind: 'secondary' },
    hidden: { id: 't3_hidden', description: 'Perch on a locker and survive an entity LURK for >= 10s', kind: 'hidden' },
    remixMutators: ['tinnitus', 'twin_entity'],
  },
  {
    index: 4,
    id: 'tape_04_tunnels',
    title: 'Pressure',
    mapId: 'utility_tunnels',
    unlockStarsRequired: 2,
    logline: 'Archive Log 04: Industrial maintenance tunnel survey. Valve pressure holds back the roar of the lower sump.',
    primary: { id: 't4_primary', description: 'Escape the utility tunnels', kind: 'primary' },
    secondary: { id: 't4_sec', description: 'Complete the run with zero pipeline surge alarms triggered', kind: 'secondary' },
    hidden: { id: 't4_hidden', description: 'Turn an emergency bypass valve inside active steam mask haze', kind: 'hidden' },
    remixMutators: ['spring_tide', 'one_breath'],
  },
  {
    index: 5,
    id: 'tape_05_jungle',
    title: 'Green Static',
    mapId: 'sunken_jungle',
    unlockStarsRequired: 2,
    logline: 'Archive Log 05: Subterranean atrium reclaimed by ferns and stagnant water. Bioluminescent spores mimic flashlight beams.',
    primary: { id: 't5_primary', description: 'Escape the sunken jungle', kind: 'primary' },
    secondary: { id: 't5_sec', description: 'Cross all river rapids using only stones, boulders, and logs', kind: 'secondary' },
    hidden: { id: 't5_hidden', description: 'Disarm the floodgate valve without triggering a flash flood', kind: 'hidden' },
    remixMutators: ['glass_water', 'silent_film'],
  },
  {
    index: 6,
    id: 'tape_06_atrium',
    title: 'Resonance',
    mapId: 'marble_atrium',
    unlockStarsRequired: 2,
    logline: 'Archive Log 06: Grand memorial atrium. Four bronze bells ring with acoustic frequencies that confound the creature.',
    primary: { id: 't6_primary', description: 'Escape the marble atrium', kind: 'primary' },
    secondary: { id: 't6_sec', description: 'Ring all chime bells using 3 or fewer pebble throws', kind: 'secondary' },
    hidden: { id: 't6_hidden', description: 'Lure the entity across the central courtyard twice in one run', kind: 'hidden' },
    remixMutators: ['blackout', 'hair_trigger'],
  },
  {
    index: 7,
    id: 'tape_07_neon',
    title: 'Sector 9',
    mapId: 'neon_flood',
    unlockStarsRequired: 2,
    logline: 'Archive Log 07: Flooded commercial strip under flickering holograms. Security drones patrol with blind acoustic sirens.',
    primary: { id: 't7_primary', description: 'Escape Sector 9', kind: 'primary' },
    secondary: { id: 't7_sec', description: 'Escape with zero drone acoustic locks', kind: 'secondary' },
    hidden: { id: 't7_hidden', description: 'Complete all terminal bypasses without a single missed keystroke', kind: 'hidden' },
    remixMutators: ['tinnitus', 'long_tape'],
  },
  {
    index: 8,
    id: 'tape_08_hydromaze',
    title: 'The Breathing Hall',
    mapId: 'hydro_maze',
    unlockStarsRequired: 2,
    logline: 'Archive Log 08: Overflow filtration cistern. The water rises and falls like a steady lung. Timing is everything.',
    primary: { id: 't8_primary', description: 'Escape the hydro maze', kind: 'primary' },
    secondary: { id: 't8_sec', description: 'Transport power cores only during high water stage (W2)', kind: 'secondary' },
    hidden: { id: 't8_hidden', description: 'Reach the security airlock before the 3rd automatic level flip', kind: 'hidden' },
    remixMutators: ['spring_tide', 'thin_ice'],
  },
  {
    index: 9,
    id: 'tape_09_metro',
    title: 'Platform Zero',
    mapId: 'drowned_metro',
    unlockStarsRequired: 2,
    logline: 'Archive Log 09: Subterranean rail transit hub. The ghost train arrives on schedule, oblivious to the silence.',
    primary: { id: 't9_primary', description: 'Escape the drowned transit platform', kind: 'primary' },
    secondary: { id: 't9_sec', description: 'Strand the entity on the tracks as the Ghost Train rushes through', kind: 'secondary' },
    hidden: { id: 't9_hidden', description: 'Board the departing train car with >= 6.0 seconds to spare on departure timer', kind: 'hidden' },
    remixMutators: ['twin_entity', 'blackout'],
  },
  {
    index: 10,
    id: 'tape_10_drainage',
    title: 'The Listener',
    mapId: 'drainage_core',
    unlockStarsRequired: 2,
    logline: 'Archive Log 10 (FINALE): Deep municipal vortex chamber. The original specimen roosts above the primary drain.',
    primary: { id: 't10_primary', description: 'Escape the drainage core and seal the vault', kind: 'primary' },
    secondary: { id: 't10_sec', description: 'Synchronize all 3 pump generators within a single 90s runtime', kind: 'secondary' },
    hidden: { id: 't10_hidden', description: 'Escape without deploying any noisemaker beacons or echo bells', kind: 'hidden' },
    remixMutators: ['silent_film', 'hair_trigger'],
  },
];

export interface TapeProgress {
  unlocked: boolean;
  skippedWithStatic?: boolean;
  stars: number; // 0..3
  primaryDone: boolean;
  secondaryDone: boolean;
  hiddenDone: boolean;
  bestScore: number;
  bestTimeSeconds: number;
}

export interface CampaignSnapshot {
  tapes: Record<string, TapeProgress>;
  totalStars: number;
}

export class Campaign {
  private progress: Map<string, TapeProgress> = new Map();

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
        secondaryDone: false,
        hiddenDone: false,
        bestScore: 0,
        bestTimeSeconds: 9999,
      });
    }
  }

  getTapeProgress(tapeId: string): TapeProgress {
    return (
      this.progress.get(tapeId) ?? {
        unlocked: false,
        stars: 0,
        primaryDone: false,
        secondaryDone: false,
        hiddenDone: false,
        bestScore: 0,
        bestTimeSeconds: 9999,
      }
    );
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
      secondaryDone: boolean;
      hiddenDone: boolean;
      score: number;
      timeSeconds: number;
    },
  ): { newlyEarnedStars: number; unlockedTapes: string[] } {
    const tape = CAMPAIGN_TAPES.find((t) => t.id === tapeId);
    if (!tape) return { newlyEarnedStars: 0, unlockedTapes: [] };

    const prog = this.getTapeProgress(tapeId);
    const oldStars = prog.stars;

    if (result.escaped) prog.primaryDone = true;
    if (result.secondaryDone) prog.secondaryDone = true;
    if (result.hiddenDone) prog.hiddenDone = true;

    let stars = 0;
    if (prog.primaryDone) stars++;
    if (prog.secondaryDone) stars++;
    if (prog.hiddenDone) stars++;

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
    return {
      tapes,
      totalStars: this.getTotalStars(),
    };
  }

  hydrate(snapshot: CampaignSnapshot): void {
    this.progress.clear();
    for (const [k, v] of Object.entries(snapshot.tapes)) {
      this.progress.set(k, { ...v });
    }
    // Ensure all campaign tapes exist
    for (let i = 0; i < CAMPAIGN_TAPES.length; i++) {
      const tape = CAMPAIGN_TAPES[i]!;
      if (!this.progress.has(tape.id)) {
        this.progress.set(tape.id, {
          unlocked: i <= 1,
          stars: 0,
          primaryDone: false,
          secondaryDone: false,
          hiddenDone: false,
          bestScore: 0,
          bestTimeSeconds: 9999,
        });
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
      secondaryDone: stars >= 2,
      hiddenDone: stars >= 3,
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


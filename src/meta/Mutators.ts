/* ── Mutators.ts ───────────────────────────────────────────────────────────
 *  Challenge mutators, conflict validation, and score multiplier engine.
 *  Pure, serializable, zero dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

export type MutatorId =
  | 'glass_water'
  | 'tinnitus'
  | 'blackout'
  | 'twin_entity'
  | 'thin_ice'
  | 'spring_tide'
  | 'hair_trigger'
  | 'one_breath'
  | 'silent_film'
  | 'long_tape'
  | 'mirror'
  | 'ducky';

export interface MutatorDef {
  id: MutatorId;
  name: string;
  description: string;
  scoreMultiplier: number;
  conflictsWith: MutatorId[];
  isCosmetic?: boolean;
}

export const MUTATORS: Record<MutatorId, MutatorDef> = {
  glass_water: {
    id: 'glass_water',
    name: 'Glass Water',
    description: 'Wading noise and ripples amplified by 50%.',
    scoreMultiplier: 1.25,
    conflictsWith: [],
  },
  tinnitus: {
    id: 'tinnitus',
    name: 'Tinnitus',
    description: 'Audio ducks for 6s every 40s (visualizer remains active).',
    scoreMultiplier: 1.20,
    conflictsWith: [],
  },
  blackout: {
    id: 'blackout',
    name: 'Blackout',
    description: 'All ambient and overhead lights extinguished; flashlight only.',
    scoreMultiplier: 1.30,
    conflictsWith: [],
  },
  twin_entity: {
    id: 'twin_entity',
    name: 'Twin Entity',
    description: 'A second juvenile entity stalks the flooded perimeter.',
    scoreMultiplier: 1.30,
    conflictsWith: [],
  },
  thin_ice: {
    id: 'thin_ice',
    name: 'Thin Ice',
    description: 'Dynamic platforms sink under weight after only 4 seconds.',
    scoreMultiplier: 1.20,
    conflictsWith: [],
  },
  spring_tide: {
    id: 'spring_tide',
    name: 'Spring Tide',
    description: 'Tidal influx and drainage cycles run 40% faster.',
    scoreMultiplier: 1.20,
    conflictsWith: [],
  },
  hair_trigger: {
    id: 'hair_trigger',
    name: 'Hair Trigger',
    description: 'Creature hearing radius +30%, sprint reaction time -30%.',
    scoreMultiplier: 1.25,
    conflictsWith: [],
  },
  one_breath: {
    id: 'one_breath',
    name: 'One Breath',
    description: 'Maximum stamina capped at 50; zero stamina regeneration while wet.',
    scoreMultiplier: 1.15,
    conflictsWith: [],
  },
  silent_film: {
    id: 'silent_film',
    name: 'Silent Film',
    description: 'No HUD acoustic noise meter or directional subtitles.',
    scoreMultiplier: 1.40,
    conflictsWith: ['tinnitus'],
  },
  long_tape: {
    id: 'long_tape',
    name: 'Long Tape',
    description: 'Secondary objectives count increased by 50%.',
    scoreMultiplier: 1.20,
    conflictsWith: [],
  },
  mirror: {
    id: 'mirror',
    name: 'Mirror',
    description: 'Map architecture flipped horizontally across the X axis.',
    scoreMultiplier: 1.00,
    conflictsWith: [],
  },
  ducky: {
    id: 'ducky',
    name: 'Rubber Ducky',
    description: 'Every water splash emits an amusing squeak (purely cosmetic).',
    scoreMultiplier: 1.00,
    conflictsWith: [],
    isCosmetic: true,
  },
};

export interface MutatorValidationResult {
  valid: boolean;
  errors: string[];
  totalMultiplier: number;
}

export function validateMutators(activeMutators: readonly MutatorId[]): MutatorValidationResult {
  const errors: string[] = [];
  const activeSet = new Set(activeMutators);

  // Check conflicts
  for (const id of activeMutators) {
    const def = MUTATORS[id];
    if (!def) {
      errors.push(`Unknown mutator: ${id}`);
      continue;
    }
    for (const conflict of def.conflictsWith) {
      if (activeSet.has(conflict)) {
        errors.push(`Mutator ${def.name} conflicts with ${MUTATORS[conflict]?.name || conflict}`);
      }
    }
  }

  // Calculate combined multiplier
  let totalMultiplier = 1.0;
  for (const id of activeMutators) {
    const def = MUTATORS[id];
    if (def) {
      totalMultiplier *= def.scoreMultiplier;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    totalMultiplier: Number(totalMultiplier.toFixed(3)),
  };
}

export const MutatorManager = {
  validateSelection(mutators: string[]): { valid: boolean; reasons: string[] } {
    const res = validateMutators(mutators as MutatorId[]);
    return {
      valid: res.valid,
      reasons: res.errors,
    };
  },

  computeMultiplier(mutators: string[]): number {
    const res = validateMutators(mutators as MutatorId[]);
    return res.totalMultiplier;
  },
};


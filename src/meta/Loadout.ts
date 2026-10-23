/* ── Loadout.ts ────────────────────────────────────────────────────────────
 *  Pre-run loadout configuration and perks.
 *  Enforces standard loadouts in competitive/ranked modes.
 * ──────────────────────────────────────────────────────────────────────── */

import { Inventory } from './Inventory.js';

export type ActiveLoadoutOption =
  | 'pebble_pouch'     // +3 pebbles (total 3 starting)
  | 'glow_sticks'      // x3 glow sticks
  | 'echo_bell'        // x1 echo bell
  | 'noisemaker'       // x1 noisemaker
  | 'bottle_satchel';  // +2 bottles

export type PassiveLoadoutOption =
  | 'padded_soles'     // crouch-wade noise -15%, wade speed -5%
  | 'steady_breath'    // stamina regen +15%
  | 'light_sleeper'    // jump-in noise -10%
  | 'tape_collector';  // see tape reels within 10m as a glint

export interface ActiveOptionDef {
  id: ActiveLoadoutOption;
  name: string;
  desc: string;
}

export interface PassiveOptionDef {
  id: PassiveLoadoutOption;
  name: string;
  desc: string;
}

export const ACTIVE_LOADOUT_OPTIONS: readonly ActiveOptionDef[] = [
  { id: 'pebble_pouch', name: 'Pebble Pouch', desc: '+3 pebbles' },
  { id: 'glow_sticks', name: 'Glow Sticks', desc: 'x3 silent chemical flares' },
  { id: 'echo_bell', name: 'Echo Bell', desc: 'x1 3s delayed sound decoy' },
  { id: 'noisemaker', name: 'Noisemaker', desc: 'x1 8s sustained sound beacon' },
  { id: 'bottle_satchel', name: 'Bottle Satchel', desc: '+2 throwable glass bottles' },
];

export const PASSIVE_LOADOUT_OPTIONS: readonly PassiveOptionDef[] = [
  { id: 'padded_soles', name: 'Padded Soles', desc: 'Crouch-wade noise -15%, speed -5%' },
  { id: 'steady_breath', name: 'Steady Breath', desc: 'Stamina regeneration +15%' },
  { id: 'light_sleeper', name: 'Light Sleeper', desc: 'Jump-in landing noise -10%' },
  { id: 'tape_collector', name: 'Tape Collector', desc: 'Detect Tape Reels within 10m' },
];

export interface LoadoutConfig {
  active1: ActiveLoadoutOption | null;
  active2: ActiveLoadoutOption | null;
  passive: PassiveLoadoutOption | null;
}

export type PlayerLoadout = LoadoutConfig;

export const STANDARD_COMPETITIVE_LOADOUT: Readonly<LoadoutConfig> = {
  active1: 'pebble_pouch',
  active2: null,
  passive: null,
};

export interface PassivePerkEffects {
  crouchWadeNoiseMul: number;
  wadeSpeedMul: number;
  staminaRegenMul: number;
  jumpInNoiseMul: number;
  tapeGlintDistance: number;
}

export function computePassiveEffects(passive: PassiveLoadoutOption | null): PassivePerkEffects {
  const effects: PassivePerkEffects = {
    crouchWadeNoiseMul: 1.0,
    wadeSpeedMul: 1.0,
    staminaRegenMul: 1.0,
    jumpInNoiseMul: 1.0,
    tapeGlintDistance: 0.0,
  };

  switch (passive) {
    case 'padded_soles':
      effects.crouchWadeNoiseMul = 0.85;
      effects.wadeSpeedMul = 0.95;
      break;
    case 'steady_breath':
      effects.staminaRegenMul = 1.15;
      break;
    case 'light_sleeper':
      effects.jumpInNoiseMul = 0.90;
      break;
    case 'tape_collector':
      effects.tapeGlintDistance = 10.0;
      break;
    default:
      break;
  }

  return effects;
}

export function createStartingInventory(loadout: LoadoutConfig): Inventory {
  const inv = new Inventory();

  const applyActive = (opt: ActiveLoadoutOption | null) => {
    switch (opt) {
      case 'pebble_pouch':
        inv.add('pebble', 3);
        break;
      case 'glow_sticks':
        inv.add('glow_stick', 3);
        break;
      case 'echo_bell':
        inv.add('echo_bell', 1);
        break;
      case 'noisemaker':
        inv.add('noisemaker', 1);
        break;
      case 'bottle_satchel':
        inv.add('bottle', 2);
        break;
      default:
        break;
    }
  };

  applyActive(loadout.active1);
  applyActive(loadout.active2);

  // If player starts with no items, give standard 3 pebbles
  if (inv.get('pebble') === 0 && !loadout.active1 && !loadout.active2) {
    inv.add('pebble', 3);
  }

  return inv;
}

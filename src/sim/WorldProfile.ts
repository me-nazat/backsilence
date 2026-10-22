/* ── WorldProfile.ts ───────────────────────────────────────────────────────
 *  Per-map physical, acoustic, and navigation profiles.
 *  Read by PlayerMotor, NavGrid, Hearing, and MonsterBrain.
 * ──────────────────────────────────────────────────────────────────────── */

export interface WorldProfileClearance {
  platform: number;
  furniture: number;
  wall: number;
  rock: number;
}

export interface WorldProfile {
  waterY: number;
  floorY: number;
  monsterMinDepth: number;
  clearance: WorldProfileClearance;
  wadeFactor: number;
  perchImmunity: boolean;
}

export const DEFAULT_WORLD_PROFILE: WorldProfile = Object.freeze({
  waterY: 0,
  floorY: -0.9,
  monsterMinDepth: 0.45,
  clearance: Object.freeze({
    platform: 1.2,
    furniture: 0.55,
    wall: 0.9,
    rock: 0.8,
  }),
  wadeFactor: 0.6,
  perchImmunity: false,
});

export function createWorldProfile(overrides?: Partial<WorldProfile>): WorldProfile {
  return {
    waterY: overrides?.waterY ?? DEFAULT_WORLD_PROFILE.waterY,
    floorY: overrides?.floorY ?? DEFAULT_WORLD_PROFILE.floorY,
    monsterMinDepth: overrides?.monsterMinDepth ?? DEFAULT_WORLD_PROFILE.monsterMinDepth,
    clearance: {
      platform: overrides?.clearance?.platform ?? DEFAULT_WORLD_PROFILE.clearance.platform,
      furniture: overrides?.clearance?.furniture ?? DEFAULT_WORLD_PROFILE.clearance.furniture,
      wall: overrides?.clearance?.wall ?? DEFAULT_WORLD_PROFILE.clearance.wall,
      rock: overrides?.clearance?.rock ?? DEFAULT_WORLD_PROFILE.clearance.rock,
    },
    wadeFactor: overrides?.wadeFactor ?? DEFAULT_WORLD_PROFILE.wadeFactor,
    perchImmunity: overrides?.perchImmunity ?? DEFAULT_WORLD_PROFILE.perchImmunity,
  };
}

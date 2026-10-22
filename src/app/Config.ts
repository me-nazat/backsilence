/* ── Config.ts ────────────────────────────────────────────────────────────
 *  World constants. Every system reads from here rather than using magic
 *  numbers. Extend but never rename existing fields.
 * ──────────────────────────────────────────────────────────────────────── */

export const WORLD = {
  UNIT: 'meter',
  WATER_Y: 0,
  PLATFORM_TOP_Y: 0.3,
  POOL_FLOOR_Y: -0.9,
  TILE_METERS: 0.15,
  TEXTURE_METERS: 2.4,
  PLAYER: {
    EYE_STAND: 1.65,
    EYE_CROUCH: 0.95,
    RADIUS: 0.32,
    WALK: 3.2,
    SPRINT: 5.6,
    CROUCH: 1.6,
    WADE_FACTOR: 0.6,
    JUMP_V: 4.6,
    GRAVITY: 14,
    MANTLE_TIME: 0.6,
  },
  MONSTER: {
    HEIGHT: 2.1,
    HUNCH_HEIGHT: 1.4,
    SPEED_WANDER: 1.6,
    SPEED_HUNT: 7.2,
    ATTACK_RANGE: 1.6,
    INVESTIGATE_TIME: [4, 8] as readonly [number, number],
    TRENCH_BLOCK_WIDTH: 2.4,
  },
  AUDIO: {
    MAX_HEAR_RADIUS: 40,
    OCCLUSION_PER_WALL: 0.5,
  },
} as const;

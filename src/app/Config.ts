/* ── Config.ts ────────────────────────────────────────────────────────────
 *  World constants. Every system reads from here rather than using magic
 *  numbers. Extend but never rename existing fields.
 * ──────────────────────────────────────────────────────────────────────── */

export const WORLD = {
  UNIT: 'meter',
  WATER_Y: 0,
  PLATFORM_TOP_Y: 0.30,
  POOL_FLOOR_Y: -0.42,
  TILE_METERS: 0.15,
  TEXTURE_METERS: 2.4,
  PLAYER: {
    EYE_STAND: 1.65,
    EYE_CROUCH: 0.95,
    RADIUS: 0.28,
    WALK: 3.2,
    SPRINT: 5.2,
    CROUCH: 1.6,
    WADE_FACTOR: 0.68,
    JUMP_V: 4.6,
    WATER_JUMP_V: 5.65, // Retained > 5.0 m/s per critical-pass-verification (D105) to clear water breach
    GRAVITY: 14.0,
    WATER_GRAVITY: 14.0, // Harmonized with GRAVITY to eliminate waterline acceleration discontinuity (D136)
    JUMP_BUFFER: 0.10, // ~0.10s standard input buffer (D136)
    COYOTE_TIME: 0.15, // ~0.12-0.15s standard coyote time (matches critical-pass-verification & D136)
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

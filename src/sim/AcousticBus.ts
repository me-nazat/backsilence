/* ── AcousticBus.ts ─────────────────────────────────────────────────────────
 *  Single Authoritative Acoustic Emitter & Rulebook Engine (ACOUSTIC_RULEBOOK.md).
 *  - Exposes continuous effective player loudness (`effectiveLoudness` / `waterNoiseLevel`)
 *    and hearing radius (`computeHearingRadius`) alongside discrete events for audio/HUD.
 *  - Dry platforms: ZERO water sound (`effectiveLoudness = 0`)
 *  - In-water standing still (speed < 0.08 m/s): ZERO water sound (`effectiveLoudness = 0`)
 *  - Crouch-wade: 0.12 (<= 5m), Wade: 0.35 (<= 14m), Sprint-wade: 0.75 (<= 30m),
 *    Mantle: 0.50 (<= 20m), Jump/Dive: 1.00 (<= 40m).
 *  - Discrete WATER_SPLASH emitted every 0.32s while moving in water.
 *  - Thrown stone impact: Immediate HIGHEST-priority WATER_SPLASH (overrides player target).
 *  - The Freeze Rule: When player stops or enters dry platform, targetSoundPos
 *    freezes at the last emitted splash coordinate.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import { WORLD } from '../app/Config.js';
import type { Vec3 } from '../types/contracts.js';
import { dHypot, dPow } from './dmath.js';

export type AcousticSoundKind =
  | 'WATER_SPLASH'
  | 'THROWN_STONE_SPLASH'
  | 'CREAK'
  | 'FOOTFALL_DRY'
  | 'MANTLE'
  | 'WORLD_MECHANISM';

export interface AcousticEvent {
  id: string;
  kind: AcousticSoundKind;
  pos: Vec3;
  loudness: number;
  hearingRadius: number;
  priority: number; // Higher number = higher priority (stones: 10, jumps: 8, wade steps: 5)
  simTime: number;
  source: 'player' | 'stone' | 'world';
}

export interface PlayerAcousticState {
  pos: Vec3;
  vel: Vec3;
  isInWater: boolean;
  isOnDryPlatform: boolean;
  onGround: boolean;
  crouching?: boolean | undefined;
  sprinting?: boolean | undefined;
  mantling?: boolean | undefined;
  justJumped?: boolean | undefined;
}

export interface PlayerSplashUpdateInput {
  dt: number;
  position: Vec3;
  horizSpeed: number;
  inWater: boolean;
  waterDepth: number;
  crouching?: boolean | undefined;
  sprinting?: boolean | undefined;
  mantling?: boolean | undefined;
  justJumped?: boolean | undefined;
  justLandedInWater?: boolean | undefined;
  simTime?: number | undefined;
}

export interface RulebookNoiseEntry {
  key: string;
  action: string;
  surface: string;
  loudness: number;
  secondaryLoudness?: number;
  maxRadiusMeters: number;
  rawLoudnessSpec: string;
  rawHearSpec: string;
}

/**
 * Canonical rulebook noise constants synced 1:1 with ACOUSTIC_RULEBOOK.md.
 */
export const RULEBOOK_CONSTANTS = {
  STANDING_STILL_ANY: 0,
  DRY_PLATFORM_LOCOMOTION: 0,
  CROUCH_WADE_WATER: 0.12,
  WADE_WALK_WATER: 0.35,
  WADE_SPRINT_WATER: 0.75,
  MANTLE_WATER_EDGE: 0.5,
  JUMP_OR_DIVE_WATER: 1.0,
  SPRINT_METAL_CATWALK: 0.3,
  PEBBLE_WATER: 0.6,
  PEBBLE_DRY_STONE: 0.2,
  VALVE_TURNING: 0.8,
  GENERATOR_RUNNING: 0.9,
  BELL_RING: 0.9,
  NOISEMAKER_BEACON: 0.7,
  ALARM_SURGE: 0.8,
  ALARM_SURGE_MAX: 0.9,
  HEAVY_SHUTTER_DOOR: 0.7,
  PERCH_LANDING_CREAK: 0.15,
  PERCH_LANDING_HARD: 0.3,
  LOCKER_OPEN_FAST: 0.35,
  LOCKER_OPEN_CAREFUL: 0.1,
  CHAIN_CUTTING: 0.5,
  PA_ZONE_BLAST: 1.0,
  DRONE_LOCK_SIREN: 0.9,
  TERMINAL_HACK_SUCCESS: 0.25,
  TERMINAL_HACK_FAIL: 0.6,
  BOTTLE_LANDING_WATER: 0.6,
  BOTTLE_LANDING_DRY: 0.5,
  ECHO_BELL_RING: 0.8,
  HAUNT_SPIRIT_MANIFESTATION: 0.5,
  LEVER_PULL: 0.7,
  THROTTLE_HOLD: 0.8,
  EMP_USE: 0.3,
  GHOST_TRAIN: 0,
} as const;

/**
 * Full 29-row Noise Table from ACOUSTIC_RULEBOOK.md.
 * Verified on every build by scripts/audit/rulebook-sync.mjs.
 */
export const RULEBOOK_NOISE_TABLE: readonly RulebookNoiseEntry[] = [
  {
    key: 'STANDING_STILL_ANY',
    action: 'Standing still / idle',
    surface: 'any',
    loudness: RULEBOOK_CONSTANTS.STANDING_STILL_ANY,
    maxRadiusMeters: 0,
    rawLoudnessSpec: '0',
    rawHearSpec: 'Never',
  },
  {
    key: 'DRY_PLATFORM_LOCOMOTION',
    action: 'Walk, sprint, crouch-walk, jump, land',
    surface: 'dry tiled platform',
    loudness: RULEBOOK_CONSTANTS.DRY_PLATFORM_LOCOMOTION,
    maxRadiusMeters: 0,
    rawLoudnessSpec: '0',
    rawHearSpec: '**Never** (player hears soft footsteps for ambience only)',
  },
  {
    key: 'CROUCH_WADE_WATER',
    action: 'Crouch-wade',
    surface: 'water',
    loudness: RULEBOOK_CONSTANTS.CROUCH_WADE_WATER,
    maxRadiusMeters: 5,
    rawLoudnessSpec: '0.12',
    rawHearSpec: 'Within ~5 m',
  },
  {
    key: 'WADE_WALK_WATER',
    action: 'Wade (walk)',
    surface: 'water',
    loudness: RULEBOOK_CONSTANTS.WADE_WALK_WATER,
    maxRadiusMeters: 14,
    rawLoudnessSpec: '0.35',
    rawHearSpec: 'Within ~14 m',
  },
  {
    key: 'WADE_SPRINT_WATER',
    action: 'Wade (sprint)',
    surface: 'water',
    loudness: RULEBOOK_CONSTANTS.WADE_SPRINT_WATER,
    maxRadiusMeters: 30,
    rawLoudnessSpec: '0.75',
    rawHearSpec: 'Within ~30 m',
  },
  {
    key: 'MANTLE_WATER_EDGE',
    action: 'Mantle onto platform from water',
    surface: 'water edge',
    loudness: RULEBOOK_CONSTANTS.MANTLE_WATER_EDGE,
    maxRadiusMeters: 20,
    rawLoudnessSpec: '0.5',
    rawHearSpec: 'Within ~20 m',
  },
  {
    key: 'JUMP_OR_DIVE_WATER',
    action: 'Jump or dive into water',
    surface: 'water',
    loudness: RULEBOOK_CONSTANTS.JUMP_OR_DIVE_WATER,
    maxRadiusMeters: 40,
    rawLoudnessSpec: '1.0',
    rawHearSpec: 'Within 40 m',
  },
  {
    key: 'SPRINT_METAL_CATWALK',
    action: 'Sprint on metal catwalk (Map 2)',
    surface: 'metal',
    loudness: RULEBOOK_CONSTANTS.SPRINT_METAL_CATWALK,
    maxRadiusMeters: 12,
    rawLoudnessSpec: '0.3 (`clang`)',
    rawHearSpec: 'Within ~12 m',
  },
  {
    key: 'PEBBLE_WATER',
    action: 'Pebble lands in water',
    surface: 'water',
    loudness: RULEBOOK_CONSTANTS.PEBBLE_WATER,
    maxRadiusMeters: 24,
    rawLoudnessSpec: '0.6 (`pebble`)',
    rawHearSpec: 'Within ~24 m',
  },
  {
    key: 'PEBBLE_DRY_STONE',
    action: 'Pebble lands on dry stone',
    surface: 'dry stone',
    loudness: RULEBOOK_CONSTANTS.PEBBLE_DRY_STONE,
    maxRadiusMeters: 8,
    rawLoudnessSpec: '0.2 (`clack`)',
    rawHearSpec: 'Within ~8 m',
  },
  {
    key: 'VALVE_TURNING',
    action: 'Valve turning',
    surface: 'world',
    loudness: RULEBOOK_CONSTANTS.VALVE_TURNING,
    maxRadiusMeters: 32,
    rawLoudnessSpec: '0.8 (`valve`, sustained)',
    rawHearSpec: 'Within ~32 m',
  },
  {
    key: 'GENERATOR_RUNNING',
    action: 'Generator running',
    surface: 'world',
    loudness: RULEBOOK_CONSTANTS.GENERATOR_RUNNING,
    maxRadiusMeters: 36,
    rawLoudnessSpec: '0.9 (`generator`, sustained)',
    rawHearSpec: 'Within ~36 m',
  },
  {
    key: 'BELL_RING',
    action: 'Bell ring',
    surface: 'world',
    loudness: RULEBOOK_CONSTANTS.BELL_RING,
    maxRadiusMeters: 36,
    rawLoudnessSpec: '0.9 (`bell`)',
    rawHearSpec: 'Within ~36 m',
  },
  {
    key: 'NOISEMAKER_BEACON',
    action: 'Noisemaker beacon',
    surface: 'world',
    loudness: RULEBOOK_CONSTANTS.NOISEMAKER_BEACON,
    maxRadiusMeters: 28,
    rawLoudnessSpec: '0.7 (`beacon`, sustained 8s)',
    rawHearSpec: 'Within ~28 m',
  },
  {
    key: 'ALARM_SURGE',
    action: 'Alarm (wrong code / valve surge)',
    surface: 'world',
    loudness: RULEBOOK_CONSTANTS.ALARM_SURGE,
    secondaryLoudness: RULEBOOK_CONSTANTS.ALARM_SURGE_MAX,
    maxRadiusMeters: 36,
    rawLoudnessSpec: '0.8–0.9 (`alarm`)',
    rawHearSpec: 'Within ~32–36 m',
  },
  {
    key: 'HEAVY_SHUTTER_DOOR',
    action: 'Heavy shutter / blast door',
    surface: 'world',
    loudness: RULEBOOK_CONSTANTS.HEAVY_SHUTTER_DOOR,
    maxRadiusMeters: 28,
    rawLoudnessSpec: '0.7 (`door`)',
    rawHearSpec: 'Within ~28 m',
  },
  {
    key: 'PERCH_LANDING_CREAK',
    action: 'Landing on wooden/plastic perch (`creak`)',
    surface: 'perch',
    loudness: RULEBOOK_CONSTANTS.PERCH_LANDING_CREAK,
    secondaryLoudness: RULEBOOK_CONSTANTS.PERCH_LANDING_HARD,
    maxRadiusMeters: 6,
    rawLoudnessSpec: '0.15 (hard landing 0.30)',
    rawHearSpec: 'Within ~6 m (~12 m hard); standing/walking on perch is silent',
  },
  {
    key: 'LOCKER_OPEN',
    action: 'Locker open: fast / careful (`locker`)',
    surface: 'school',
    loudness: RULEBOOK_CONSTANTS.LOCKER_OPEN_FAST,
    secondaryLoudness: RULEBOOK_CONSTANTS.LOCKER_OPEN_CAREFUL,
    maxRadiusMeters: 14,
    rawLoudnessSpec: '0.35 / 0.10',
    rawHearSpec: 'Within ~14 m / ~4 m',
  },
  {
    key: 'CHAIN_CUTTING',
    action: 'Chain cutting (`chain`)',
    surface: 'school',
    loudness: RULEBOOK_CONSTANTS.CHAIN_CUTTING,
    maxRadiusMeters: 20,
    rawLoudnessSpec: '0.5 sustained',
    rawHearSpec: 'Within ~20 m',
  },
  {
    key: 'PA_ZONE_BLAST',
    action: 'PA zone blast (`alarm`)',
    surface: 'school',
    loudness: RULEBOOK_CONSTANTS.PA_ZONE_BLAST,
    maxRadiusMeters: 40,
    rawLoudnessSpec: '1.0 at speaker',
    rawHearSpec: 'Within 40 m',
  },
  {
    key: 'DRONE_LOCK_SIREN',
    action: 'Drone lock siren (`siren`)',
    surface: 'city',
    loudness: RULEBOOK_CONSTANTS.DRONE_LOCK_SIREN,
    maxRadiusMeters: 36,
    rawLoudnessSpec: '0.9 at player',
    rawHearSpec: 'Within ~36 m',
  },
  {
    key: 'TERMINAL_HACK',
    action: 'Terminal hack success / fail (`terminal`/`alarm`)',
    surface: 'city',
    loudness: RULEBOOK_CONSTANTS.TERMINAL_HACK_SUCCESS,
    secondaryLoudness: RULEBOOK_CONSTANTS.TERMINAL_HACK_FAIL,
    maxRadiusMeters: 10,
    rawLoudnessSpec: '0.25 / 0.6',
    rawHearSpec: 'Within ~10 m / ~24 m',
  },
  {
    key: 'BOTTLE_LANDING',
    action: 'Bottle landing: water (`pebble`) / dry (`shatter`)',
    surface: 'metro',
    loudness: RULEBOOK_CONSTANTS.BOTTLE_LANDING_WATER,
    secondaryLoudness: RULEBOOK_CONSTANTS.BOTTLE_LANDING_DRY,
    maxRadiusMeters: 24,
    rawLoudnessSpec: '0.6 / 0.5',
    rawHearSpec: 'Within ~24 m / ~20 m',
  },
  {
    key: 'ECHO_BELL_RING',
    action: 'Echo Bell ring (delayed lure)',
    surface: 'world',
    loudness: RULEBOOK_CONSTANTS.ECHO_BELL_RING,
    maxRadiusMeters: 32,
    rawLoudnessSpec: '0.8 (`bell`, rings at placed spot after 3s delay)',
    rawHearSpec: 'Within ~32 m',
  },
  {
    key: 'HAUNT_SPIRIT_MANIFESTATION',
    action: 'Haunt spirit manifestation (Last One Dry / Silent Race)',
    surface: 'water (>=12m from players)',
    loudness: RULEBOOK_CONSTANTS.HAUNT_SPIRIT_MANIFESTATION,
    maxRadiusMeters: 20,
    rawLoudnessSpec: '0.5 (`splash`, eliminated player echo)',
    rawHearSpec: 'Within ~20 m',
  },
  {
    key: 'LEVER_PULL',
    action: 'Lever pull (`lever`)',
    surface: 'metro',
    loudness: RULEBOOK_CONSTANTS.LEVER_PULL,
    maxRadiusMeters: 28,
    rawLoudnessSpec: '0.7 once',
    rawHearSpec: 'Within ~28 m',
  },
  {
    key: 'THROTTLE_HOLD',
    action: 'Throttle hold (`generator`)',
    surface: 'metro',
    loudness: RULEBOOK_CONSTANTS.THROTTLE_HOLD,
    maxRadiusMeters: 32,
    rawLoudnessSpec: '0.8 sustained',
    rawHearSpec: 'Within ~32 m',
  },
  {
    key: 'EMP_USE',
    action: 'EMP use (`clack`)',
    surface: 'city',
    loudness: RULEBOOK_CONSTANTS.EMP_USE,
    maxRadiusMeters: 12,
    rawLoudnessSpec: '0.3',
    rawHearSpec: 'Within ~12 m',
  },
  {
    key: 'GHOST_TRAIN',
    action: 'Ghost train (`train`)',
    surface: 'metro',
    loudness: RULEBOOK_CONSTANTS.GHOST_TRAIN,
    maxRadiusMeters: 0,
    rawLoudnessSpec: '0 (ignored by monsters as lure)',
    rawHearSpec: 'Applies mask zones (0.6 / 0.2 / 0.5)',
  },
] as const;

export type AcousticEventListener = (event: AcousticEvent) => void;

export class AcousticBus {
  static readonly STEP_CADENCE = 0.32; // Exact 0.32s cadence while moving in water
  static readonly STILL_SPEED_THRESHOLD = 0.08; // < 0.08 m/s is considered frozen still
  static readonly DRY_PLATFORM_Y_THRESHOLD = 0.30; // y >= 0.30m is dry platform
  static readonly RULEBOOK_CONSTANTS = RULEBOOK_CONSTANTS;
  static readonly RULEBOOK_NOISE_TABLE = RULEBOOK_NOISE_TABLE;

  private stepTimer = 0;
  private wasInWater = false;
  private wasOnGround = true;
  private lastSoundTarget: Vec3 | null = null;
  private currentNoiseLevel = 0;
  private isPlayerFrozen = true;
  private eventSequence = 0;

  private readonly listeners: AcousticEventListener[] = [];

  subscribe(listener: AcousticEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  /**
   * Continuous effective loudness of the player according to ACOUSTIC_RULEBOOK.md:
   * - 0 on dry tile
   * - 0 when still in water
   * - 0.12 crouch-wade
   * - 0.35 wade (walk)
   * - 0.75 sprint-wade
   * - 0.50 mantle onto platform from water
   * - 1.00 jump or dive into water
   */
  get effectiveLoudness(): number {
    return this.currentNoiseLevel;
  }

  /**
   * Alias for effectiveLoudness (0.0 when on dry platform or still in water).
   */
  get waterNoiseLevel(): number {
    return this.currentNoiseLevel;
  }

  /**
   * Current monster hearing radius in meters computed from continuous effectiveLoudness.
   */
  get currentHearingRadius(): number {
    return this.computeHearingRadius(this.currentNoiseLevel, 1.0, 0);
  }

  /**
   * Computes monster hearing radius from continuous loudness according to ACOUSTIC_RULEBOOK.md:
   * hearing_radius = loudness * WORLD.AUDIO.MAX_HEAR_RADIUS * difficulty_factor * (OCCLUSION_PER_WALL ^ min(2, walls))
   */
  computeHearingRadius(
    loudness = this.currentNoiseLevel,
    difficultyFactor = 1.0,
    interveningWalls = 0,
  ): number {
    if (loudness <= 0) return 0;
    const clampedWalls = Math.max(0, Math.min(2, Math.floor(interveningWalls)));
    const occlusion = dPow(WORLD.AUDIO.OCCLUSION_PER_WALL, clampedWalls);
    return loudness * WORLD.AUDIO.MAX_HEAR_RADIUS * difficultyFactor * occlusion;
  }

  /**
   * Evaluates continuous player loudness from locomotion flags and speed.
   */
  evaluateContinuousPlayerLoudness(params: {
    inWater: boolean;
    onDry: boolean;
    horizSpeed: number;
    crouching?: boolean;
    sprinting?: boolean;
    mantling?: boolean;
    justJumped?: boolean;
    justEnteredWater?: boolean;
  }): number {
    if (params.mantling) {
      return RULEBOOK_CONSTANTS.MANTLE_WATER_EDGE;
    }
    if (params.inWater && (params.justJumped || params.justEnteredWater)) {
      return RULEBOOK_CONSTANTS.JUMP_OR_DIVE_WATER;
    }
    if (params.onDry || !params.inWater) {
      return RULEBOOK_CONSTANTS.DRY_PLATFORM_LOCOMOTION;
    }
    if (params.horizSpeed < AcousticBus.STILL_SPEED_THRESHOLD) {
      return RULEBOOK_CONSTANTS.STANDING_STILL_ANY;
    }
    if (params.crouching || params.horizSpeed <= WORLD.PLAYER.CROUCH * WORLD.PLAYER.WADE_FACTOR + 0.15) {
      return RULEBOOK_CONSTANTS.CROUCH_WADE_WATER;
    }
    if (params.sprinting || params.horizSpeed > WORLD.PLAYER.WALK * WORLD.PLAYER.WADE_FACTOR + 0.4) {
      return RULEBOOK_CONSTANTS.WADE_SPRINT_WATER;
    }
    return RULEBOOK_CONSTANTS.WADE_WALK_WATER;
  }

  /**
   * The locked sound target that the monster navigates towards.
   * Freezes at the last splash coordinate when player stops moving or climbs onto platform.
   */
  get targetSoundPos(): Vec3 | null {
    return this.lastSoundTarget ? { ...this.lastSoundTarget } : null;
  }

  /**
   * Whether the player is currently standing completely still inside the water.
   */
  get isPlayerFrozenInWater(): boolean {
    return this.isPlayerFrozen;
  }

  /**
   * Reset acoustic bus state on session restart or map change.
   */
  reset(): void {
    this.stepTimer = 0;
    this.wasInWater = false;
    this.wasOnGround = true;
    this.lastSoundTarget = null;
    this.currentNoiseLevel = 0;
    this.isPlayerFrozen = true;
    this.eventSequence = 0;
  }

  /**
   * Convenience adapter for driving player splash/acoustic state from test harnesses or presentation.
   */
  updatePlayerSplash(input: PlayerSplashUpdateInput): AcousticEvent | null {
    const isOnDryPlatform = !input.inWater && !input.mantling;
    return this.step(
      input.dt,
      {
        pos: input.position,
        vel: {
          x: input.horizSpeed,
          y: input.justJumped || input.justLandedInWater ? -1.5 : 0,
          z: 0,
        },
        isInWater: input.inWater,
        isOnDryPlatform,
        onGround: !input.justJumped,
        crouching: input.crouching,
        sprinting: input.sprinting,
        mantling: input.mantling,
        justJumped: input.justJumped || input.justLandedInWater,
      },
      input.simTime ?? 0,
    );
  }

  /**
   * Process a simulation step for player acoustic emissions.
   */
  step(dt: number, player: PlayerAcousticState, simTime: number): AcousticEvent | null {
    const horizSpeed = dHypot(player.vel.x, player.vel.z);
    const onDry =
      !player.mantling &&
      (player.isOnDryPlatform ||
        player.pos.y >= AcousticBus.DRY_PLATFORM_Y_THRESHOLD ||
        !player.isInWater);
    const inWater = player.isInWater && !onDry;

    let emittedEvent: AcousticEvent | null = null;

    // ──────────────────────────────────────────────────────────────────────────
    // 0. Mantle onto platform from water edge (0.5 loudness, <= 20m)
    // ──────────────────────────────────────────────────────────────────────────
    if (player.mantling) {
      this.currentNoiseLevel = RULEBOOK_CONSTANTS.MANTLE_WATER_EDGE;
      this.isPlayerFrozen = false;
      emittedEvent = this.emitSound({
        kind: 'MANTLE',
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        loudness: RULEBOOK_CONSTANTS.MANTLE_WATER_EDGE,
        priority: 6,
        simTime,
        source: 'player',
      });
      this.wasInWater = false;
      this.wasOnGround = player.onGround;
      return emittedEvent;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Landing / Jumping in Water Detection (1.0 loudness, <= 40m)
    // ──────────────────────────────────────────────────────────────────────────
    const justEnteredWater =
      inWater &&
      (Boolean(player.justJumped) ||
        ((!this.wasInWater || (!this.wasOnGround && player.onGround)) && Math.abs(player.vel.y) > 0.5));
    if (justEnteredWater) {
      this.currentNoiseLevel = RULEBOOK_CONSTANTS.JUMP_OR_DIVE_WATER;
      this.isPlayerFrozen = false;
      emittedEvent = this.emitSound({
        kind: 'WATER_SPLASH',
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        loudness: RULEBOOK_CONSTANTS.JUMP_OR_DIVE_WATER,
        priority: 8,
        simTime,
        source: 'player',
      });
      this.stepTimer = 0;
      this.wasInWater = inWater;
      this.wasOnGround = player.onGround;
      return emittedEvent;
    }

    this.wasInWater = inWater;
    this.wasOnGround = player.onGround;

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Dry Platform Rule: ZERO water sound
    // ──────────────────────────────────────────────────────────────────────────
    if (onDry) {
      this.currentNoiseLevel = RULEBOOK_CONSTANTS.DRY_PLATFORM_LOCOMOTION;
      this.stepTimer = 0;
      this.isPlayerFrozen = false;
      return emittedEvent;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. In-Water Movement vs. Freeze Detection
    // ──────────────────────────────────────────────────────────────────────────
    if (inWater) {
      if (horizSpeed < AcousticBus.STILL_SPEED_THRESHOLD) {
        // Player is frozen 100% still in the water: ZERO sound emitted
        this.currentNoiseLevel = RULEBOOK_CONSTANTS.STANDING_STILL_ANY;
        this.stepTimer = 0;
        this.isPlayerFrozen = true;
        // The sound target remains LOCKED at the last emitted splash coordinate!
        return emittedEvent;
      }

      // Player is actively wading through the pool: compute continuous rulebook loudness
      this.isPlayerFrozen = false;
      this.currentNoiseLevel = this.evaluateContinuousPlayerLoudness({
        inWater: true,
        onDry: false,
        horizSpeed,
        crouching: Boolean(player.crouching),
        sprinting: Boolean(player.sprinting),
      });
      this.stepTimer += dt;

      if (this.stepTimer >= AcousticBus.STEP_CADENCE) {
        this.stepTimer -= AcousticBus.STEP_CADENCE;
        const splash = this.emitSound({
          kind: 'WATER_SPLASH',
          pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
          loudness: this.currentNoiseLevel,
          priority: 5,
          simTime,
          source: 'player',
        });
        if (!emittedEvent) emittedEvent = splash;
      }
    } else {
      this.currentNoiseLevel = 0;
      this.stepTimer = 0;
      this.isPlayerFrozen = false;
    }

    return emittedEvent;
  }

  /**
   * Thrown stone impact into water (Highest Priority).
   * Immediately overrides player splash target and draws the blind monster away.
   */
  emitStoneSplash(impactPos: Vec3, simTime: number, loudness: number = RULEBOOK_CONSTANTS.PEBBLE_WATER): AcousticEvent {
    return this.emitSound({
      kind: 'THROWN_STONE_SPLASH',
      pos: { x: impactPos.x, y: impactPos.y, z: impactPos.z },
      loudness,
      priority: 10, // Overrides player splash
      simTime,
      source: 'stone',
    });
  }

  /**
   * Emits an acoustic event for any rulebook noise action by its constant key.
   * Authoritative implementation obeying ACOUSTIC_RULEBOOK.md.
   */
  emitRulebookNoise(
    key: keyof typeof RULEBOOK_CONSTANTS | (typeof RULEBOOK_NOISE_TABLE)[number]['key'],
    pos: Vec3,
    simTime: number,
    priority = 6,
  ): AcousticEvent {
    let loudness = (RULEBOOK_CONSTANTS as Record<string, number>)[key];
    if (loudness === undefined) {
      const match = RULEBOOK_NOISE_TABLE.find((e) => e.key === key);
      loudness = match ? match.loudness : 0;
    }
    let kind: AcousticSoundKind = 'WORLD_MECHANISM';
    let source: 'player' | 'stone' | 'world' = 'world';

    if (key === 'PEBBLE_WATER') {
      kind = 'THROWN_STONE_SPLASH';
      source = 'stone';
    } else if (key === 'MANTLE_WATER_EDGE') {
      kind = 'MANTLE';
      source = 'player';
    } else if (
      key === 'JUMP_OR_DIVE_WATER' ||
      key === 'CROUCH_WADE_WATER' ||
      key === 'WADE_WALK_WATER' ||
      key === 'WADE_SPRINT_WATER'
    ) {
      kind = 'WATER_SPLASH';
      source = 'player';
    } else if (key === 'PERCH_LANDING_CREAK' || key === 'PERCH_LANDING_HARD') {
      kind = 'CREAK';
      source = 'player';
    } else if (key === 'DRY_PLATFORM_LOCOMOTION' || key === 'STANDING_STILL_ANY') {
      kind = 'FOOTFALL_DRY';
      source = 'player';
    }

    return this.emitSound({
      kind,
      pos: { x: pos.x, y: pos.y, z: pos.z },
      loudness,
      priority,
      simTime,
      source,
    });
  }

  private emitSound(params: {
    kind: AcousticSoundKind;
    pos: Vec3;
    loudness: number;
    priority: number;
    simTime: number;
    source: 'player' | 'stone' | 'world';
  }): AcousticEvent {
    const ev: AcousticEvent = {
      id: `acoustic_${params.source}_${this.eventSequence++}_${Math.round(params.simTime * 100)}`,
      kind: params.kind,
      pos: { x: params.pos.x, y: params.pos.y, z: params.pos.z },
      loudness: params.loudness,
      hearingRadius: this.computeHearingRadius(params.loudness, 1.0, 0),
      priority: params.priority,
      simTime: params.simTime,
      source: params.source,
    };

    // Update the locked target coordinate for the monster only if sound is audible
    if (params.loudness > 0) {
      this.lastSoundTarget = { x: params.pos.x, y: params.pos.y, z: params.pos.z };
    }

    // Broadcast to subscribers
    for (let i = 0; i < this.listeners.length; i++) {
      this.listeners[i]!(ev);
    }

    return ev;
  }
}

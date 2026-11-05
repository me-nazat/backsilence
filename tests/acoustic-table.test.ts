/* ── acoustic-table.test.ts ──────────────────────────────────────────────────
 *  Prompt 8 (D126): Comprehensive Acoustic Rulebook Table & Contract Verification
 *  Validates exact loudness, exact hearing radius, dry platform zero-noise immunity,
 *  and the in-water Freeze Rule (monster target locks at last splash).
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AcousticBus,
  RULEBOOK_CONSTANTS,
  RULEBOOK_NOISE_TABLE,
} from '../src/sim/AcousticBus.js';
import { MonsterAI } from '../src/sim/MonsterAI.js';
import { MonsterNavigation } from '../src/sim/MonsterNavigation.js';
import { WORLD } from '../src/app/Config.js';
import type { Vec3 } from '../src/types/contracts.js';

describe('Prompt 8 (D126): Acoustic Contract & Rulebook Verification', () => {
  let bus: AcousticBus;

  beforeEach(() => {
    bus = new AcousticBus();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Full 32-Row Rulebook Noise Table: Loudness & Radius Verification
  // ──────────────────────────────────────────────────────────────────────────
  it('asserts exact loudness and hearing radius for all rulebook noise entries', () => {
    expect(RULEBOOK_NOISE_TABLE.length).toBe(32);

    const testOrigin: Vec3 = { x: 0, y: 0, z: 0 };

    for (const entry of RULEBOOK_NOISE_TABLE) {
      // DESIGN_RATIONALE: Canonical noise loudness and hearing radius as specified in ACOUSTIC_RULEBOOK.md
      const ev = bus.emitRulebookNoise(
        entry.key as keyof typeof RULEBOOK_CONSTANTS,
        testOrigin,
        1.0,
      );

      expect(ev.loudness).toBe(entry.loudness);

      const expectedRadius = entry.loudness * WORLD.AUDIO.MAX_HEAR_RADIUS; // loudness * 40m
      expect(ev.hearingRadius).toBeCloseTo(expectedRadius, 5);

      if (entry.loudness === 0) {
        expect(ev.hearingRadius).toBe(0);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Exact Specification Table for Core Locomotion & Mechanism Actions
  // ──────────────────────────────────────────────────────────────────────────
  it('drives specific player actions and world mechanisms against exact numbers', () => {
    const origin: Vec3 = { x: 5, y: 0, z: 5 };

    // DESIGN_RATIONALE: Rulebook specifications: idle (0, 0m), crouch-wade (0.12, 4.8m), wade (0.35, 14m), sprint (0.75, 30m), dive (1.0, 40m)
    const crouchWade = bus.emitRulebookNoise('CROUCH_WADE_WATER', origin, 0.5);
    expect(crouchWade.loudness).toBe(0.12);
    expect(crouchWade.hearingRadius).toBeCloseTo(4.8, 4);

    const wadeWalk = bus.emitRulebookNoise('WADE_WALK_WATER', origin, 1.0);
    expect(wadeWalk.loudness).toBe(0.35);
    expect(wadeWalk.hearingRadius).toBeCloseTo(14.0, 4);

    const wadeSprint = bus.emitRulebookNoise('WADE_SPRINT_WATER', origin, 1.5);
    expect(wadeSprint.loudness).toBe(0.75);
    expect(wadeSprint.hearingRadius).toBeCloseTo(30.0, 4);

    const mantle = bus.emitRulebookNoise('MANTLE_WATER_EDGE', origin, 2.0);
    expect(mantle.loudness).toBe(0.50);
    expect(mantle.hearingRadius).toBeCloseTo(20.0, 4);

    const jumpDive = bus.emitRulebookNoise('JUMP_OR_DIVE_WATER', origin, 2.5);
    expect(jumpDive.loudness).toBe(1.00);
    expect(jumpDive.hearingRadius).toBeCloseTo(40.0, 4);

    const pebbleWater = bus.emitRulebookNoise('PEBBLE_WATER', origin, 3.0);
    expect(pebbleWater.loudness).toBe(0.60);
    expect(pebbleWater.hearingRadius).toBeCloseTo(24.0, 4);

    const pebbleDry = bus.emitRulebookNoise('PEBBLE_DRY_STONE', origin, 3.5);
    expect(pebbleDry.loudness).toBe(0.20);
    expect(pebbleDry.hearingRadius).toBeCloseTo(8.0, 4);

    const valve = bus.emitRulebookNoise('VALVE_TURNING', origin, 4.0);
    expect(valve.loudness).toBe(0.80);
    expect(valve.hearingRadius).toBeCloseTo(32.0, 4);

    const gen = bus.emitRulebookNoise('GENERATOR_RUNNING', origin, 4.5);
    expect(gen.loudness).toBe(0.90);
    expect(gen.hearingRadius).toBeCloseTo(36.0, 4);

    const bell = bus.emitRulebookNoise('BELL_RING', origin, 5.0);
    expect(bell.loudness).toBe(0.90);
    expect(bell.hearingRadius).toBeCloseTo(36.0, 4);

    const beacon = bus.emitRulebookNoise('NOISEMAKER_BEACON', origin, 5.5);
    expect(beacon.loudness).toBe(0.70);
    expect(beacon.hearingRadius).toBeCloseTo(28.0, 4);

    const alarm = bus.emitRulebookNoise('ALARM_SURGE', origin, 6.0);
    expect(alarm.loudness).toBe(0.80);
    expect(alarm.hearingRadius).toBeCloseTo(32.0, 4);

    const door = bus.emitRulebookNoise('HEAVY_SHUTTER_DOOR', origin, 6.5);
    expect(door.loudness).toBe(0.70);
    expect(door.hearingRadius).toBeCloseTo(28.0, 4);

    const chain = bus.emitRulebookNoise('CHAIN_CUTTING', origin, 7.0);
    expect(chain.loudness).toBe(0.50);
    expect(chain.hearingRadius).toBeCloseTo(20.0, 4);

    const lever = bus.emitRulebookNoise('LEVER_PULL', origin, 7.5);
    expect(lever.loudness).toBe(0.70);
    expect(lever.hearingRadius).toBeCloseTo(28.0, 4);

    const throttle = bus.emitRulebookNoise('THROTTLE_HOLD', origin, 8.0);
    expect(throttle.loudness).toBe(0.80);
    expect(throttle.hearingRadius).toBeCloseTo(32.0, 4);

    const emp = bus.emitRulebookNoise('EMP_USE', origin, 8.5);
    expect(emp.loudness).toBe(0.30);
    expect(emp.hearingRadius).toBeCloseTo(12.0, 4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Dry Platform Zero-Noise Rule & Monster Indifference
  // ──────────────────────────────────────────────────────────────────────────
  it('asserts that walking on dry tile emits zero and monster never reacts to it', () => {
    const nav = new MonsterNavigation({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 0.5);

    const monster = new MonsterAI({
      id: 'stalker_test',
      spawn: { x: 0, y: 0, z: 0 },
      nav,
      acousticBus: bus,
    });

    expect(monster.getSnapshot().state).toBe('PATROL');
    expect(monster.getSnapshot().targetSoundPos).toBeNull();

    // 1. Simulate player walking briskly on a dry tiled platform (y = 0.30m)
    const dryPlayer = {
      pos: { x: 4.0, y: 0.30, z: 4.0 },
      vel: { x: 2.5, y: 0.0, z: 0.0 }, // horizontal speed = 2.5 m/s
      isInWater: false,
      isOnDryPlatform: true,
      onGround: true,
    };

    // Step simulation across multiple frames (0.5s total > 0.32s cadence)
    for (let t = 0; t < 5; t++) {
      const ev = bus.step(0.1, dryPlayer, t * 0.1);
      expect(ev).toBeNull();
      monster.step(0.1, dryPlayer, t * 0.1);
    }

    // Bus reports continuous effective loudness = 0 and hearing radius = 0
    expect(bus.effectiveLoudness).toBe(0);
    expect(bus.currentHearingRadius).toBe(0);
    expect(bus.targetSoundPos).toBeNull();

    // Monster state remains completely calm (PATROL), targetSoundPos remains null
    const snap = monster.getSnapshot();
    expect(snap.state).toBe('PATROL');
    expect(snap.targetSoundPos).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. The Freeze Rule: Target Locks at Last Splash, Does Not Track Live Position
  // ──────────────────────────────────────────────────────────────────────────
  it('asserts the Freeze Rule: monster target locks at last splash coordinate when player stops in water', () => {
    const nav = new MonsterNavigation({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 0.5);

    const monster = new MonsterAI({
      id: 'stalker_test',
      spawn: { x: 0, y: 0, z: 0 },
      nav,
      acousticBus: bus,
    });

    // Step 1: Player wades in water at coordinate (10, 0, 10) at speed 1.8 m/s
    const wadingPlayer = {
      pos: { x: 10.0, y: 0.0, z: 10.0 },
      vel: { x: 1.8, y: 0.0, z: 0.0 },
      isInWater: true,
      isOnDryPlatform: false,
      onGround: true,
    };

    // Accumulate past the 0.32s cadence to trigger a splash event
    const splashEvent = bus.step(0.35, wadingPlayer, 0.35);
    expect(splashEvent).not.toBeNull();
    expect(splashEvent!.kind).toBe('WATER_SPLASH');
    expect(splashEvent!.pos).toEqual({ x: 10.0, y: 0.0, z: 10.0 });

    // AcousticBus target is now (10, 0, 10)
    expect(bus.targetSoundPos).toEqual({ x: 10.0, y: 0.0, z: 10.0 });

    // Monster hears the splash and enters ALERT_AND_CHARGE targeted at (10, 0, 10)
    monster.step(0.01, wadingPlayer, 0.36);
    expect(monster.getSnapshot().state).toBe('ALERT_AND_CHARGE');
    expect(monster.getSnapshot().targetSoundPos!.x).toBeCloseTo(10.0, 1);
    expect(monster.getSnapshot().targetSoundPos!.z).toBeCloseTo(10.0, 1);

    // Step 2: Player stops completely still at (14, 0, 10) (speed = 0.0 m/s)
    const stoppedPlayer = {
      pos: { x: 14.0, y: 0.0, z: 10.0 },
      vel: { x: 0.0, y: 0.0, z: 0.0 },
      isInWater: true,
      isOnDryPlatform: false,
      onGround: true,
    };

    // Step bus for 1.0s while player is frozen still
    for (let t = 0; t < 10; t++) {
      const ev = bus.step(0.1, stoppedPlayer, 0.5 + t * 0.1);
      expect(ev).toBeNull(); // No sound emitted while still
      monster.step(0.1, stoppedPlayer, 0.5 + t * 0.1);
    }

    // Invariant: Player is frozen in water, loudness is 0
    expect(bus.isPlayerFrozenInWater).toBe(true);
    expect(bus.effectiveLoudness).toBe(0);

    // CRITICAL: AcousticBus target coordinate remains FROZEN at the last splash (10, 0, 10),
    // and has NOT moved to the player's live position (14, 0, 10)
    expect(bus.targetSoundPos).toEqual({ x: 10.0, y: 0.0, z: 10.0 });
    expect(monster.getSnapshot().targetSoundPos!.x).toBeCloseTo(10.0, 1);
    expect(monster.getSnapshot().targetSoundPos!.z).toBeCloseTo(10.0, 1);
  });
});

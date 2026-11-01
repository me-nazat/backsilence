/* ── AcousticBus.ts ─────────────────────────────────────────────────────────
 *  Acoustic Event Emission Bus conforming to Backrooms Poolrooms Rules:
 *  - Dry platforms: ZERO water sound (waterNoiseLevel = 0)
 *  - In-water standing still (speed < 0.08 m/s): ZERO water sound (waterNoiseLevel = 0)
 *  - In-water moving (speed >= 0.08 m/s): WATER_SPLASH emitted every 0.32s
 *  - Water jump/fall landing: Immediate high-priority WATER_SPLASH
 *  - Thrown stone impact: Immediate HIGHEST-priority WATER_SPLASH (overrides player target)
 *  - The Freeze Rule: When player stops or enters dry platform, targetSoundPos
 *    freezes at the last emitted splash coordinate.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import { dHypot } from './dmath.js';

export type AcousticSoundKind = 'WATER_SPLASH' | 'THROWN_STONE_SPLASH' | 'CREAK' | 'FOOTFALL_DRY';

export interface AcousticEvent {
  id: string;
  kind: AcousticSoundKind;
  pos: Vec3;
  loudness: number;
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
}

export type AcousticEventListener = (event: AcousticEvent) => void;

export class AcousticBus {
  static readonly STEP_CADENCE = 0.32; // Exact 0.32s cadence while moving in water
  static readonly STILL_SPEED_THRESHOLD = 0.08; // < 0.08 m/s is considered frozen still
  static readonly DRY_PLATFORM_Y_THRESHOLD = 0.30; // y >= 0.30m is dry platform

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
   * Returns current noise level (0.0 when on dry platform or still in water).
   */
  get waterNoiseLevel(): number {
    return this.currentNoiseLevel;
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
   * Process a simulation step for player acoustic emissions.
   */
  step(dt: number, player: PlayerAcousticState, simTime: number): AcousticEvent | null {
    const horizSpeed = dHypot(player.vel.x, player.vel.z);
    const onDry = player.isOnDryPlatform || player.pos.y >= AcousticBus.DRY_PLATFORM_Y_THRESHOLD || !player.isInWater;
    const inWater = player.isInWater && !onDry;

    let emittedEvent: AcousticEvent | null = null;

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Landing in Water Detection (Fall or Jump into Water)
    // ──────────────────────────────────────────────────────────────────────────
    const justEnteredWater = inWater && (!this.wasInWater || (!this.wasOnGround && player.onGround));
    if (justEnteredWater && Math.abs(player.vel.y) > 0.5) {
      emittedEvent = this.emitSound({
        kind: 'WATER_SPLASH',
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        loudness: 0.95,
        priority: 8,
        simTime,
        source: 'player',
      });
      this.stepTimer = 0;
    }

    this.wasInWater = inWater;
    this.wasOnGround = player.onGround;

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Dry Platform Rule: ZERO water sound
    // ──────────────────────────────────────────────────────────────────────────
    if (onDry) {
      this.currentNoiseLevel = 0;
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
        this.currentNoiseLevel = 0;
        this.stepTimer = 0;
        this.isPlayerFrozen = true;
        // The sound target remains LOCKED at the last emitted splash coordinate!
        return emittedEvent;
      }

      // Player is actively wading through the pool: emits splash every 0.32s
      this.isPlayerFrozen = false;
      this.currentNoiseLevel = Math.min(1.0, 0.40 + horizSpeed * 0.15);
      this.stepTimer += dt;

      if (this.stepTimer >= AcousticBus.STEP_CADENCE) {
        this.stepTimer -= AcousticBus.STEP_CADENCE;
        const splash = this.emitSound({
          kind: 'WATER_SPLASH',
          pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
          loudness: 0.75,
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
  emitStoneSplash(impactPos: Vec3, simTime: number, loudness = 0.85): AcousticEvent {
    return this.emitSound({
      kind: 'THROWN_STONE_SPLASH',
      pos: { x: impactPos.x, y: impactPos.y, z: impactPos.z },
      loudness,
      priority: 10, // Overrides player splash
      simTime,
      source: 'stone',
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
      priority: params.priority,
      simTime: params.simTime,
      source: params.source,
    };

    // Update the locked target coordinate for the monster
    this.lastSoundTarget = { x: params.pos.x, y: params.pos.y, z: params.pos.z };

    // Broadcast to subscribers
    for (let i = 0; i < this.listeners.length; i++) {
      this.listeners[i]!(ev);
    }

    return ev;
  }
}


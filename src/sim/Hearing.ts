/* ── Hearing.ts ───────────────────────────────────────────────────────────
 *  Acoustic perception model obeying ACOUSTIC_RULEBOOK.md.
 *  Calculates effective hearing radius, wall occlusion, and priority scoring.
 *  Pure simulation layer: zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, NoiseEvent } from '../types/contracts.js';
import type { ColliderSet } from './Colliders.js';

export interface MaskZone {
  center: Vec3;
  radius: number;
  factor: number;
  from?: number; // active time start
  to?: number;   // active time end
}

export class MaskZoneManager {
  private readonly zones: MaskZone[] = [];

  addZone(zone: MaskZone): void {
    this.zones.push(zone);
  }

  clear(): void {
    this.zones.length = 0;
  }

  getMaskFactor(pos: Vec3, simTime = 0): number {
    let factor = 1.0;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i]!;
      if (z.from !== undefined && simTime < z.from) continue;
      if (z.to !== undefined && simTime > z.to) continue;

      const dx = pos.x - z.center.x;
      const dz = pos.z - z.center.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= z.radius) {
        factor = Math.min(factor, z.factor);
      }
    }
    return factor;
  }
}

export interface HearingContext {
  difficultyHearing: number; // Whisper: 0.75, Normal: 1.0, Deafening: 1.3
  maskFactor?: (pos: Vec3) => number;
}

export const ACOUSTIC_CONSTANTS = {
  MAX_HEAR_RADIUS: 40.0,
  OCCLUSION_PER_WALL: 0.5,
  MAX_WALLS: 2,
};

export function calculateEffectiveRadius(
  noiseOrLoudness: NoiseEvent | number,
  arg2: Vec3 | number,
  arg3: Vec3 | HearingContext,
  arg4?: number | ColliderSet,
  arg5?: HearingContext | Vec3,
  arg6?: ColliderSet,
): number {
  let loudness = 0;
  let noisePos: Vec3 = { x: 0, y: 0, z: 0 };
  let monsterPos: Vec3 = { x: 0, y: 0, z: 0 };
  let monsterHearingMul = 1.0;
  let ctx: HearingContext = { difficultyHearing: 1.0 };
  let colliders: ColliderSet | null = null;

  if (typeof noiseOrLoudness === 'object') {
    // Signature: (noise, monsterHearingMul, ctx, colliders, monsterPos)
    loudness = noiseOrLoudness.loudness;
    noisePos = noiseOrLoudness.position;
    monsterHearingMul = typeof arg2 === 'number' ? arg2 : 1.0;
    ctx = arg3 as HearingContext;
    colliders = (arg4 as ColliderSet) ?? null;
    monsterPos = (arg5 as Vec3) ?? { x: 0, y: 0, z: 0 };
  } else {
    // Signature: (loudness, monsterPos, noisePos, monsterHearingMul, ctx, colliders)
    loudness = noiseOrLoudness;
    monsterPos = arg2 as Vec3;
    noisePos = arg3 as Vec3;
    monsterHearingMul = typeof arg4 === 'number' ? arg4 : 1.0;
    ctx = arg5 as HearingContext;
    colliders = arg6 ?? null;
  }

  if (loudness <= 0) return 0;

  const difficultyMul = ctx ? ctx.difficultyHearing : 1.0;
  const mask = ctx && ctx.maskFactor ? ctx.maskFactor(noisePos) : 1.0;

  // Count tall occluding walls between noise and monster (max 2)
  let walls = 0;
  if (colliders && colliders.segmentHits) {
    walls = colliders.segmentHits(noisePos.x, noisePos.z, monsterPos.x, monsterPos.z, 1.0);
  }
  const occlusion = Math.pow(ACOUSTIC_CONSTANTS.OCCLUSION_PER_WALL, Math.min(ACOUSTIC_CONSTANTS.MAX_WALLS, walls));

  return (
    loudness *
    ACOUSTIC_CONSTANTS.MAX_HEAR_RADIUS *
    difficultyMul *
    monsterHearingMul *
    occlusion *
    mask
  );
}

export function canHearNoise(
  noise: NoiseEvent,
  monsterPos: Vec3,
  monsterHearingMul: number,
  ctx: HearingContext,
  colliders: ColliderSet,
): boolean {
  const dx = noise.position.x - monsterPos.x;
  const dz = noise.position.z - monsterPos.z;
  const dist = Math.hypot(dx, dz);

  const radius = calculateEffectiveRadius(
    noise.loudness,
    monsterPos,
    noise.position,
    monsterHearingMul,
    ctx,
    colliders,
  );

  return dist <= radius;
}

/**
 * Score noise for monster retargeting priority: loudness / (1 + dist / 20).
 */
export function calculateNoiseScore(noise: NoiseEvent, monsterPos: Vec3): number {
  const dist = Math.hypot(noise.position.x - monsterPos.x, noise.position.z - monsterPos.z);
  return noise.loudness / (1.0 + dist / 20.0);
}

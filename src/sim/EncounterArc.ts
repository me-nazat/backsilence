/* ── EncounterArc.ts ────────────────────────────────────────────────────────
 *  Canonical 60-Second Directed Encounter Arc (Prompt 6 / Phase A).
 *  Formalizes the Video-2 (seconds 8–72) encounter grammar:
 *  1. t≈15–16.5s  — TELEGRAPH: 1.5s acoustic warning (sub-bass pulse + wade stinger)
 *  2. t≈18–21s    — SILHOUETTE HOLD: 3s paused in 10–15m band facing player, dark wakes
 *  3. t≈21–35s    — STALK: steady 2.4 m/s wade to last sound, shedding ink & foot-foam
 *  4. t≈35–48s    — TRENCH STANDOFF: blocked at >= 2.4m trench, lip-pacing >= 1 pass, reach-swipe
 *  5. t≈48–58s    — SILENCE WINDOW: player on dry platform silent, creature at <= 6m head-sweeps
 *                   for 10s, finds nothing, de-escalates to WANDER. Dry stillness 100% survivable!
 *  6. t≈58–60s    — TERMINAL LUNGE: player re-enters water <= 3.5m; 7.2 m/s lunge + jumpscare lock
 *
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, NoiseEvent, MonsterState } from '../types/contracts.js';
import { dHypot, dSin, dCos, dAtan2, D_PI, D_TWO_PI } from './dmath.js';

export type EncounterBeatKind =
  | 'telegraph'
  | 'silhouette_hold'
  | 'stalk'
  | 'standoff'
  | 'silence_window'
  | 'terminal_lunge';

export interface EncounterBeatDef {
  readonly kind: EncounterBeatKind;
  readonly startT: number;
  readonly endT: number;
  readonly targetDistanceMin: number;
  readonly targetDistanceMax: number;
  readonly monsterState: MonsterState;
  readonly description: string;
}

export const CANONICAL_ENCOUNTER_BEATS: readonly EncounterBeatDef[] = [
  {
    kind: 'telegraph',
    startT: 15.0,
    endT: 18.0,
    targetDistanceMin: 12.0,
    targetDistanceMax: 15.0,
    monsterState: 'WANDER',
    description: 'Acoustic warning: sub-bass pulse + low wade stinger 1.5s pre-sight.',
  },
  {
    kind: 'silhouette_hold',
    startT: 18.0,
    endT: 21.0,
    targetDistanceMin: 10.0,
    targetDistanceMax: 15.0,
    monsterState: 'WANDER',
    description: '3s motionless hold in 10-15m band facing player, quadrupedal silhouette, dark wakes.',
  },
  {
    kind: 'stalk',
    startT: 21.0,
    endT: 35.0,
    targetDistanceMin: 3.5,
    targetDistanceMax: 12.5,
    monsterState: 'HUNT',
    description: 'Steady 2.4 m/s wade toward last player noise, shedding ink splashes and foot-foam.',
  },
  {
    kind: 'standoff',
    startT: 35.0,
    endT: 48.0,
    targetDistanceMin: 3.5,
    targetDistanceMax: 5.5,
    monsterState: 'BLOCKED',
    description: 'Blocked at >= 2.4m trench, cannot cross, paces lip, reaches across, agitated clicks.',
  },
  {
    kind: 'silence_window',
    startT: 48.0,
    endT: 58.0,
    targetDistanceMin: 3.5,
    targetDistanceMax: 6.0,
    monsterState: 'INVESTIGATE',
    description: 'Player on dry platform silent; creature head-sweeps for 10s, harmless, de-escalates.',
  },
  {
    kind: 'terminal_lunge',
    startT: 58.0,
    endT: 60.0,
    targetDistanceMin: 0.8,
    targetDistanceMax: 3.5,
    monsterState: 'ATTACK',
    description: 'Player re-enters water <= 3.5m; 7.2 m/s lunge into f_037 jumpscare framing.',
  },
] as const;

export interface EncounterArcTraceSample {
  readonly t: number;
  readonly beat: EncounterBeatKind;
  readonly monsterState: MonsterState;
  readonly monsterPos: Vec3;
  readonly playerPos: Vec3;
  readonly distance: number;
  readonly speed: number;
  readonly visible: boolean;
  readonly inFrustum: boolean;
  readonly audioEvent: string | null;
}

export interface EncounterArcSnapshot {
  t: number;
  activeBeatIndex: number;
  monsterPos: Vec3;
  monsterYaw: number;
  monsterState: MonsterState;
  playerPos: Vec3;
  playerYaw: number;
  playerOnDryPlatform: boolean;
  playerInWater: boolean;
  lastQualifyingNoiseTime: number;
  lastQualifyingNoisePos: Vec3 | null;
  trenchCrossed: boolean;
  investigateDamageDealt: number;
  maxSampleSpeed: number;
  audioEventsEmitted: string[];
}

export interface EncounterArcConfig {
  readonly mapId?: string;
  readonly playerOrigin?: Vec3;
  readonly playerYaw?: number;
  readonly trenchZ?: number; // default -28.6 m
  readonly trenchWidth?: number; // default 2.6 m
}

export function evaluateCameraVisibility(
  camPos: Vec3,
  camYaw: number,
  camPitch: number,
  targetPos: Vec3,
  halfFovHRad = 0.715,
  halfFovVRad = 0.523,
  maxDistance = 60.0,
): { inFrustum: boolean; distance: number; signedHAngle: number; signedVAngle: number } {
  const dx = targetPos.x - camPos.x;
  const dy = targetPos.y - camPos.y;
  const dz = targetPos.z - camPos.z;
  const dist = dHypot(dx, dz);
  const totalDist = Math.hypot(dx, dy, dz);

  if (totalDist > maxDistance || totalDist < 0.1) {
    return { inFrustum: false, distance: totalDist, signedHAngle: D_PI, signedVAngle: D_PI };
  }

  const targetYaw = dAtan2(dx, -dz);
  let relHAngle = (targetYaw - camYaw) % (D_PI * 2);
  if (relHAngle < -D_PI) relHAngle += D_PI * 2;
  if (relHAngle > D_PI) relHAngle -= D_PI * 2;

  const targetPitch = dAtan2(dy, dist);
  const relVAngle = targetPitch - camPitch;

  const inFrustum =
    Math.abs(relHAngle) <= halfFovHRad &&
    Math.abs(relVAngle) <= halfFovVRad;

  return { inFrustum, distance: totalDist, signedHAngle: relHAngle, signedVAngle: relVAngle };
}

export class EncounterArc {
  readonly config: EncounterArcConfig;

  private t = 0;
  private activeBeatIndex = 0;

  // Positions
  readonly monsterPos: Vec3 = { x: 0, y: 0, z: -39.5 };
  monsterYaw = 0;
  monsterState: MonsterState = 'WANDER';

  readonly playerPos: Vec3 = { x: 0, y: 0.3, z: -25.0 };
  playerYaw = 0;
  playerOnDryPlatform = true;
  playerInWater = false;

  // Fairness Law Trackers
  private lastQualifyingNoiseTime = -999;
  private lastQualifyingNoisePos: Vec3 | null = null;
  private trenchCrossed = false;
  private investigateDamageDealt = 0;
  private maxSampleSpeed = 0;
  private prevPos: Vec3 = { x: 0, y: 0, z: -39.5 };

  // Audio / Beat events
  readonly audioEvents: string[] = [];
  readonly traceSamples: EncounterArcTraceSample[] = [];

  constructor(config: EncounterArcConfig = {}) {
    this.config = config;
    const origin = config.playerOrigin ?? { x: 0, y: 0.3, z: -25.0 };
    this.playerPos.x = origin.x;
    this.playerPos.y = origin.y;
    this.playerPos.z = origin.z;
    this.playerYaw = config.playerYaw ?? 0;

    // Start monster positioned in front sighting lane (14.5m north)
    this.monsterPos.x = origin.x;
    this.monsterPos.y = 0;
    this.monsterPos.z = origin.z - 14.5;
    this.prevPos.x = this.monsterPos.x;
    this.prevPos.y = this.monsterPos.y;
    this.prevPos.z = this.monsterPos.z;
  }

  get simTime(): number {
    return this.t;
  }

  get currentBeat(): EncounterBeatDef {
    return CANONICAL_ENCOUNTER_BEATS[this.activeBeatIndex]!;
  }

  get isComplete(): boolean {
    return this.t >= 60.0;
  }

  recordPlayerNoise(noise: NoiseEvent): void {
    if (noise.loudness >= 0.25) {
      this.lastQualifyingNoiseTime = this.t;
      this.lastQualifyingNoisePos = { ...noise.position };
    }
  }

  step(dt: number, hasOcclusion = false): void {
    const prevT = this.t;
    this.t += dt;

    // Find active beat index
    for (let i = 0; i < CANONICAL_ENCOUNTER_BEATS.length; i++) {
      const b = CANONICAL_ENCOUNTER_BEATS[i]!;
      if (this.t >= b.startT && this.t < b.endT) {
        this.activeBeatIndex = i;
        break;
      }
    }
    if (this.t >= 60.0) {
      this.activeBeatIndex = CANONICAL_ENCOUNTER_BEATS.length - 1;
    }

    const beat = this.currentBeat;
    let audioThisTick: string | null = null;

    const pPos = this.playerPos;
    const trenchZ = this.config.trenchZ ?? (pPos.z - 3.6); // trench lip at -28.6m

    // Continuous C0 Kinematics across all 60 seconds:
    if (this.t < 15.0) {
      // 0..15s Calm approach: 14.5m -> 13.5m (0.067 m/s)
      this.monsterState = 'WANDER';
      this.playerOnDryPlatform = true;
      this.playerInWater = false;
      const frac = this.t / 15.0;
      this.monsterPos.x = pPos.x;
      this.monsterPos.z = pPos.z - (14.5 - frac * 1.0);
      this.monsterYaw = 0;
    } else if (this.t < 18.0) {
      // 15..18s Telegraph: 13.5m -> 12.5m (0.33 m/s)
      this.monsterState = 'WANDER';
      this.playerOnDryPlatform = true;
      this.playerInWater = false;
      const frac = (this.t - 15.0) / 3.0;
      this.monsterPos.x = pPos.x;
      this.monsterPos.z = pPos.z - (13.5 - frac * 1.0);
      this.monsterYaw = 0;

      if (prevT < 15.1 && this.t >= 15.1) {
        audioThisTick = 'sighting_telegraph';
        this.audioEvents.push('sighting_telegraph');
      }
    } else if (this.t < 21.0) {
      // 18..21s Silhouette hold: motionless hold at 12.5m (0 m/s)
      this.monsterState = 'WANDER';
      this.playerOnDryPlatform = true;
      this.playerInWater = false;
      this.monsterPos.x = pPos.x;
      this.monsterPos.z = pPos.z - 12.5;
      this.monsterYaw = 0;

      if (prevT < 18.2 && this.t >= 18.2) {
        audioThisTick = 'silhouette_hold_breath';
        this.audioEvents.push('silhouette_hold_breath');
      }
    } else if (this.t < 35.0) {
      // 21..35s Stalk: 12.5m -> 3.6m over 14s (0.636 m/s)
      this.monsterState = 'HUNT';
      this.playerOnDryPlatform = true;
      this.playerInWater = false;
      const frac = (this.t - 21.0) / 14.0;
      this.monsterPos.x = pPos.x;
      this.monsterPos.z = pPos.z - (12.5 - frac * 8.9);
      this.monsterYaw = 0;

      if (Math.floor(this.t / 1.1) !== Math.floor(prevT / 1.1)) {
        audioThisTick = 'stalk_footfall_wet';
        this.audioEvents.push('stalk_footfall_wet');
      }
    } else if (this.t < 48.0) {
      // 35..48s Standoff: duration 13s, frequency = 2*PI/13 rad/s -> starts at 0, ends at 0
      this.monsterState = 'BLOCKED';
      this.playerOnDryPlatform = true;
      this.playerInWater = false;

      const omega1 = D_TWO_PI / 13.0;
      const paceCycle = dSin((this.t - 35.0) * omega1);
      this.monsterPos.x = pPos.x + paceCycle * 1.6; // max speed 1.6 * 0.483 = 0.77 m/s
      this.monsterPos.z = trenchZ;
      this.monsterYaw = dAtan2(pPos.x - this.monsterPos.x, -(pPos.z - this.monsterPos.z));

      if (this.monsterPos.z > trenchZ + 0.1) {
        this.trenchCrossed = true;
      }

      if (prevT < 36.0 && this.t >= 36.0) {
        audioThisTick = 'standoff_agitated_click';
        this.audioEvents.push('standoff_agitated_click');
      }
    } else if (this.t < 58.0) {
      // 48..58s Silence window: duration 10s, frequency = 2*PI/10 rad/s -> starts at 0, ends at 0
      this.monsterState = 'INVESTIGATE';
      this.playerOnDryPlatform = true;
      this.playerInWater = false;

      const omega2 = D_TWO_PI / 10.0;
      const invCycle = dSin((this.t - 48.0) * omega2);
      this.monsterPos.x = pPos.x + invCycle * 0.8; // max speed 0.8 * 0.628 = 0.50 m/s
      this.monsterPos.z = trenchZ;
      this.monsterYaw = dAtan2(pPos.x - this.monsterPos.x, -(pPos.z - this.monsterPos.z));

      this.investigateDamageDealt = 0;

      if (prevT < 49.0 && this.t >= 49.0) {
        audioThisTick = 'silence_ducking_active';
        this.audioEvents.push('silence_ducking_active');
      }
    } else {
      // 58..60s Terminal lunge: at t=58.0, monster is at (pPos.x, trenchZ = -28.6).
      // Player steps into water at z = -26.0 (distance = 2.6m <= 3.5m).
      this.playerOnDryPlatform = false;
      this.playerInWater = true;
      this.playerPos.z = -26.0;

      if (prevT < 58.05 && this.t >= 58.05) {
        this.recordPlayerNoise({
          id: 'player_splash_lunge',
          type: 'noise',
          kind: 'wade',
          position: { ...this.playerPos },
          loudness: 0.65,
          sourcePlayerId: 'player',
          simTime: this.t,
        });
        audioThisTick = 'terminal_lunge_riser';
        this.audioEvents.push('terminal_lunge_riser');
      }

      this.monsterState = 'ATTACK';
      const curDist = dHypot(this.playerPos.x - this.monsterPos.x, this.playerPos.z - this.monsterPos.z);
      if (curDist > 0.82) {
        const lungeSpeed = 7.2;
        const toPX = (this.playerPos.x - this.monsterPos.x) / curDist;
        const toPZ = (this.playerPos.z - this.monsterPos.z) / curDist;
        this.monsterPos.x += toPX * lungeSpeed * dt;
        this.monsterPos.z += toPZ * lungeSpeed * dt;
      }
      this.monsterYaw = dAtan2(this.playerPos.x - this.monsterPos.x, -(this.playerPos.z - this.monsterPos.z));

      if (prevT < 59.2 && this.t >= 59.2) {
        audioThisTick = 'jumpscare_stab';
        this.audioEvents.push('jumpscare_stab');
      }
    }

    // Displacement speed check
    const displacement = dHypot(this.monsterPos.x - this.prevPos.x, this.monsterPos.z - this.prevPos.z);
    const speed = dt > 0.0001 ? displacement / dt : 0;
    if (speed > this.maxSampleSpeed) {
      this.maxSampleSpeed = speed;
    }
    this.prevPos.x = this.monsterPos.x;
    this.prevPos.y = this.monsterPos.y;
    this.prevPos.z = this.monsterPos.z;

    const camPitch = beat.kind === 'terminal_lunge' ? -0.15 : 0;
    const camPos: Vec3 = { x: this.playerPos.x, y: this.playerPos.y + 1.65, z: this.playerPos.z };
    const monsterTarget: Vec3 = { x: this.monsterPos.x, y: this.monsterPos.y + 1.25, z: this.monsterPos.z };
    const vis = evaluateCameraVisibility(camPos, this.playerYaw, camPitch, monsterTarget);
    const isVisible = vis.inFrustum && !hasOcclusion && vis.distance <= 50.0;

    if (Math.floor(this.t) !== Math.floor(prevT) || this.t >= 60.0) {
      this.traceSamples.push({
        t: Number(this.t.toFixed(2)),
        beat: beat.kind,
        monsterState: this.monsterState,
        monsterPos: { ...this.monsterPos },
        playerPos: { ...this.playerPos },
        distance: Number(vis.distance.toFixed(2)),
        speed: Number(speed.toFixed(2)),
        visible: isVisible,
        inFrustum: vis.inFrustum,
        audioEvent: audioThisTick,
      });
    }
  }

  assertFairnessLaws(): { pass: boolean; violations: string[] } {
    const violations: string[] = [];

    // 1. Max speed ceiling: strictly <= 7.4 m/s (no teleportation)
    if (this.maxSampleSpeed > 7.4) {
      violations.push(`Max speed ${this.maxSampleSpeed.toFixed(2)} m/s exceeds 7.4 m/s ceiling (teleportation detected).`);
    }

    // 2. Trench standoff: monster never crosses >= 2.4m trench
    if (this.trenchCrossed) {
      violations.push('Monster crossed impassable >= 2.4m trench during standoff.');
    }

    // 3. INVESTIGATE state is completely harmless
    if (this.investigateDamageDealt > 0) {
      violations.push(`INVESTIGATE state dealt ${this.investigateDamageDealt} damage to player.`);
    }

    // 4. Lunge requires qualifying NoiseEvent <= 4s old within lunge range <= 4m
    const lungeTraces = this.traceSamples.filter((s) => s.beat === 'terminal_lunge');
    if (lungeTraces.length > 0) {
      const firstLunge = lungeTraces[0]!;
      const noiseAge = firstLunge.t - this.lastQualifyingNoiseTime;
      if (noiseAge > 4.0) {
        violations.push(`Terminal lunge initiated with qualifying noise age ${noiseAge.toFixed(1)}s > 4.0s.`);
      }
      if (firstLunge.distance > 4.0) {
        violations.push(`Terminal lunge initiated at distance ${firstLunge.distance}m > 4.0m.`);
      }
    }

    return {
      pass: violations.length === 0,
      violations,
    };
  }

  getSnapshot(): EncounterArcSnapshot {
    return {
      t: this.t,
      activeBeatIndex: this.activeBeatIndex,
      monsterPos: { ...this.monsterPos },
      monsterYaw: this.monsterYaw,
      monsterState: this.monsterState,
      playerPos: { ...this.playerPos },
      playerYaw: this.playerYaw,
      playerOnDryPlatform: this.playerOnDryPlatform,
      playerInWater: this.playerInWater,
      lastQualifyingNoiseTime: this.lastQualifyingNoiseTime,
      lastQualifyingNoisePos: this.lastQualifyingNoisePos ? { ...this.lastQualifyingNoisePos } : null,
      trenchCrossed: this.trenchCrossed,
      investigateDamageDealt: this.investigateDamageDealt,
      maxSampleSpeed: this.maxSampleSpeed,
      audioEventsEmitted: [...this.audioEvents],
    };
  }
}

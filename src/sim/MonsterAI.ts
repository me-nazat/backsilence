/* ── MonsterAI.ts ───────────────────────────────────────────────────────────
 *  5-State Monster AI Logic conforming to Backrooms Poolrooms specifications:
 *  - 1. PATROL (2.6 m/s): Prowls water waypoints 18m - 38m around player
 *  - 2. ALERT_AND_CHARGE (11.5 m/s): Snarls 0.25s on splash and charges along
 *       smoothed water path to targetSoundPos.
 *       CRITICAL FREEZE RULE: targetSoundPos stops updating when player stops or
 *       climbs on platform.
 *       TANGENTIAL STEERING NUDGE: Gentle deflection brushing past frozen player (0.65m - 2.5m).
 *       LETHAL CHECK: Moving in water < 1.35m, frozen in water < 0.65m. Dry platform = IMMUNE.
 *  - 3. ARRIVE_AND_ROAR (1.75s): Upon dist < 0.9m to target, executes REAR_UP_ROAR.
 *  - 4. RETREAT_PROWL (3.4 m/s): Walks away to patrol point 22m - 35m away.
 *  - 5. TRENCH_CLAW_LUNGE (1.8s): Blocked at narrow trench mouth, lunges at opening.
 *       Only kills if player is within 1.45m of trench mouth.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import type { MonsterNavigation, NavPathPoint } from './MonsterNavigation.js';
import { AcousticBus, type AcousticEvent, type PlayerAcousticState } from './AcousticBus.js';
import { dHypot, dAtan2, dCos, dSin, D_PI, D_TWO_PI } from './dmath.js';

export type MonsterAIState =
  | 'PATROL'
  | 'ALERT_AND_CHARGE'
  | 'ARRIVE_AND_ROAR'
  | 'RETREAT_PROWL'
  | 'TRENCH_CLAW_LUNGE';

export interface MonsterAIConfig {
  id: string;
  spawn: Vec3;
  nav: MonsterNavigation;
  acousticBus: AcousticBus;
}

export interface MonsterAISnapshot {
  id: string;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  state: MonsterAIState;
  targetSoundPos: Vec3 | null;
  path: readonly NavPathPoint[];
  rearingT: number;
  jawOpenT: number;
  isBlockedAtTrench: boolean;
}

export class MonsterAI {
  // Speeds
  static readonly SPEED_PATROL = 3.2;
  static readonly SPEED_STALK = 2.4; // Prompt 4C: wading stalk speed 2.2–2.6 m/s
  static readonly SPEED_TERMINAL_LUNGE = 7.2; // Prompt 4C: 7.2 m/s terminal lunge within <= 4m
  static readonly SPEED_CHARGE = 11.8;
  static readonly SPEED_RETREAT = 3.4;

  // Collision & Near-Miss Ranges
  static readonly LETHAL_MOVING_RANGE = 1.35; // Kills if moving in water
  static readonly LETHAL_FROZEN_RANGE = 0.65; // Direct body center collision only
  static readonly TANGENTIAL_NUDGE_MIN = 0.65; // Inner threshold for tangential brush-by
  static readonly TANGENTIAL_NUDGE_MAX = 2.5;  // Outer threshold for tangential brush-by
  static readonly TRENCH_MOUTH_KILL_RANGE = 1.45; // Trench mouth reach
  static readonly ARRIVE_DIST_THRESHOLD = 0.9; // Distance to sound target to initiate roar

  readonly id: string;
  readonly pos: Vec3;
  readonly vel: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;

  state: MonsterAIState = 'PATROL';
  nav: MonsterNavigation;
  acousticBus: AcousticBus;

  // Sound tracking
  private targetSoundPos: Vec3 | null = null;
  private originalSoundPos: Vec3 | null = null;
  private currentPath: NavPathPoint[] = [];
  private currentPathIndex = 0;

  // Timers
  private stateTimer = 0;
  private snarlTimer = 0; // 0.25s initial snarl on alert
  private isSnarling = false;
  private roarDuration = 1.7;
  private lungeDuration = 1.8;
  private isBlockedAtTrench = false;
  private activeTrenchMouth: { x: number; z: number } | null = null;
  private stuckTimer = 0;

  // Presentation metrics
  rearingT = 0;
  jawOpenT = 0.15; // 18° prowl gap

  // Callback for lethal strike
  onKillPlayer?: (reason: string) => void;

  constructor(config: MonsterAIConfig) {
    this.id = config.id;
    this.pos = { x: config.spawn.x, y: config.spawn.y, z: config.spawn.z };
    this.nav = config.nav;
    this.acousticBus = config.acousticBus;

    // Listen to acoustic bus
    this.acousticBus.subscribe((ev) => this.onAcousticEvent(ev));
  }

  getSnapshot(): MonsterAISnapshot {
    return {
      id: this.id,
      pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      vel: { x: this.vel.x, y: this.vel.y, z: this.vel.z },
      yaw: this.yaw,
      state: this.state,
      targetSoundPos: this.targetSoundPos ? { ...this.targetSoundPos } : null,
      path: this.currentPath,
      rearingT: this.rearingT,
      jawOpenT: this.jawOpenT,
      isBlockedAtTrench: this.isBlockedAtTrench,
    };
  }

  /**
   * Handle incoming acoustic events from AcousticBus.
   * Silent events (loudness <= 0) are completely ignored.
   */
  onAcousticEvent(ev: AcousticEvent): void {
    if (ev.loudness <= 0) return;
    if (
      ev.kind === 'WATER_SPLASH' ||
      ev.kind === 'THROWN_STONE_SPLASH' ||
      ev.kind === 'WORLD_MECHANISM' ||
      ev.kind === 'CREAK' ||
      ev.kind === 'MANTLE'
    ) {
      this.originalSoundPos = { x: ev.pos.x, y: ev.pos.y, z: ev.pos.z };
      const snapTarget = this.nav.snapTargetPos(ev.pos.x, ev.pos.z);
      this.targetSoundPos = { x: snapTarget.x, y: ev.pos.y, z: snapTarget.z };

      if (this.state === 'PATROL' || this.state === 'RETREAT_PROWL' || this.state === 'ARRIVE_AND_ROAR') {
        this.enterAlertAndCharge();
      } else if (this.state === 'ALERT_AND_CHARGE') {
        // Re-plan path towards updated target
        this.replanPathToTarget();
      }
    }
  }

  private enterAlertAndCharge(): void {
    this.state = 'ALERT_AND_CHARGE';
    this.stateTimer = 0;
    this.isSnarling = true;
    this.snarlTimer = 0.25; // 0.25s snarl before high-speed sprint
    this.vel.x = 0;
    this.vel.z = 0;
    this.rearingT = 0.3;
    this.jawOpenT = 0.45; // Gaping jaw snarl
    this.isBlockedAtTrench = false;
    this.activeTrenchMouth = null;
    this.replanPathToTarget();
  }

  private replanPathToTarget(): void {
    if (!this.targetSoundPos) return;
    this.currentPath = this.nav.findPath(this.pos.x, this.pos.z, this.targetSoundPos.x, this.targetSoundPos.z);
    this.currentPathIndex = 0;
  }

  /**
   * Primary 60Hz deterministic step.
   */
  step(dt: number, player: PlayerAcousticState, _simTime?: number): void {
    this.stateTimer += dt;

    const pDist = dHypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const pSpeed = dHypot(player.vel.x, player.vel.z);
    const onDry = player.isOnDryPlatform || player.pos.y >= AcousticBus.DRY_PLATFORM_Y_THRESHOLD || !player.isInWater;
    const inWater = player.isInWater && !onDry;
    const isPlayerFrozen = inWater && pSpeed < AcousticBus.STILL_SPEED_THRESHOLD;

    const prevX = this.pos.x;
    const prevZ = this.pos.z;

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Lethal Strike Evaluation
    // ──────────────────────────────────────────────────────────────────────────
    if (!onDry && inWater) {
      if (this.state === 'TRENCH_CLAW_LUNGE') {
        // Blocked at trench mouth: kills if player is within 1.45m of monster's claw reach or trench mouth
        const dMouth = this.activeTrenchMouth
          ? dHypot(player.pos.x - this.activeTrenchMouth.x, player.pos.z - this.activeTrenchMouth.z)
          : Infinity;
        if (pDist <= MonsterAI.TRENCH_MOUTH_KILL_RANGE || dMouth <= MonsterAI.TRENCH_MOUTH_KILL_RANGE) {
          this.triggerKill('trench_claw_lunge');
          return;
        }
      } else if (this.state === 'ALERT_AND_CHARGE') {
        // Moving player killed at 1.35m
        if (!isPlayerFrozen && pDist < MonsterAI.LETHAL_MOVING_RANGE) {
          this.triggerKill('water_charge_hit');
          return;
        }
        // Frozen player ONLY killed on direct dead-center body hit (< 0.65m)
        if (isPlayerFrozen && pDist < MonsterAI.LETHAL_FROZEN_RANGE) {
          this.triggerKill('direct_body_collision');
          return;
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. State-Specific Execution
    // ──────────────────────────────────────────────────────────────────────────
    switch (this.state) {
      case 'PATROL':
        this.stepPatrol(dt, player);
        break;

      case 'ALERT_AND_CHARGE':
        this.stepAlertAndCharge(dt, player, isPlayerFrozen, pDist);
        break;

      case 'ARRIVE_AND_ROAR':
        this.stepArriveAndRoar(dt);
        break;

      case 'RETREAT_PROWL':
        this.stepRetreatProwl(dt);
        break;

      case 'TRENCH_CLAW_LUNGE':
        this.stepTrenchClawLunge(dt);
        break;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Physical Collision Resolution & Dry Platform Exclusion
    // ──────────────────────────────────────────────────────────────────────────
    const resolved = this.nav.resolveMonsterCollision(this.pos);
    this.pos.x = resolved.x;
    this.pos.z = resolved.z;

    // 4. Anti-Stuck Corner Watchdog
    const actualDisplacement = dt > 0.0001 ? dHypot(this.pos.x - prevX, this.pos.z - prevZ) / dt : 0;
    const desiredSpeed =
      this.state === 'PATROL'
        ? MonsterAI.SPEED_PATROL
        : this.state === 'ALERT_AND_CHARGE'
        ? MonsterAI.SPEED_CHARGE
        : this.state === 'RETREAT_PROWL'
        ? MonsterAI.SPEED_RETREAT
        : 0;

    if (desiredSpeed > 0 && (this.state === 'PATROL' || this.state === 'ALERT_AND_CHARGE')) {
      if (actualDisplacement < 0.4 * desiredSpeed) {
        this.stuckTimer += dt;
        if (this.stuckTimer >= 0.35) {
          this.currentPathIndex++;
          const perpYaw = this.yaw + Math.PI * 0.5 * (Math.sin(this.stateTimer * 4.0) > 0 ? 1 : -1);
          this.pos.x += dSin(perpYaw) * 0.06;
          this.pos.z += dCos(perpYaw) * 0.06;
          this.stuckTimer = 0;
        }
      } else {
        this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2.0);
      }
    } else {
      this.stuckTimer = 0;
    }
  }

  private stepPatrol(dt: number, player: PlayerAcousticState): void {
    this.rearingT = 0.0;
    this.jawOpenT = 0.15; // 18° prowl gap

    // Pick a patrol waypoint 18m - 38m around player if no active path
    if (this.currentPath.length === 0 || this.currentPathIndex >= this.currentPath.length) {
      const angle = (this.stateTimer * 0.5) % D_TWO_PI;
      const radius = 22.0 + dSin(this.stateTimer * 0.3) * 10.0;
      const wx = player.pos.x + dCos(angle) * radius;
      const wz = player.pos.z + dSin(angle) * radius;
      const snapped = this.nav.snapTargetPos(wx, wz);
      this.currentPath = this.nav.findPath(this.pos.x, this.pos.z, snapped.x, snapped.z);
      this.currentPathIndex = 0;
    }

    this.followPath(dt, MonsterAI.SPEED_PATROL, 6.0);
  }

  private stepAlertAndCharge(
    dt: number,
    player: PlayerAcousticState,
    isPlayerFrozen: boolean,
    pDist: number,
  ): void {
    // Initial 0.25s snarl
    if (this.isSnarling) {
      this.snarlTimer -= dt;
      if (this.snarlTimer <= 0) {
        this.isSnarling = false;
      } else {
        return;
      }
    }

    if (!this.targetSoundPos) {
      this.state = 'RETREAT_PROWL';
      return;
    }

    // Check if target is inside a narrow trench and monster is near trench mouth
    const trenchMouth = this.nav.getNearestTrenchMouth(this.pos.x, this.pos.z, 3.0);
    const targetInTrench = this.originalSoundPos
      ? this.nav.isInsideNarrowTrench(this.originalSoundPos.x, this.originalSoundPos.z)
      : (this.targetSoundPos ? this.nav.isInsideNarrowTrench(this.targetSoundPos.x, this.targetSoundPos.z) : false);

    if (targetInTrench && trenchMouth && trenchMouth.dist < 1.6) {
      // Monster reached narrow trench entrance — cannot squeeze in!
      this.state = 'TRENCH_CLAW_LUNGE';
      this.stateTimer = 0;
      this.isBlockedAtTrench = true;
      this.activeTrenchMouth = { ...trenchMouth.mouth };
      this.vel.x = 0;
      this.vel.z = 0;
      this.rearingT = 0.5;
      this.jawOpenT = 0.65; // Wide roar at trench mouth
      return;
    }

    // Check distance to targetSoundPos
    const dTarget = dHypot(this.targetSoundPos.x - this.pos.x, this.targetSoundPos.z - this.pos.z);
    if (dTarget < MonsterAI.ARRIVE_DIST_THRESHOLD) {
      // Arrived at splash site!
      this.enterArriveAndRoar();
      return;
    }

    // Follow path at high speed (11.5 m/s)
    this.followPath(dt, MonsterAI.SPEED_CHARGE, 14.0);

    // ──────────────────────────────────────────────────────────────────────────
    // In-Water Freeze Tangential Steering Nudge (Near-Miss Brush-by)
    // ──────────────────────────────────────────────────────────────────────────
    if (isPlayerFrozen && pDist >= MonsterAI.TANGENTIAL_NUDGE_MIN && pDist <= MonsterAI.TANGENTIAL_NUDGE_MAX) {
      // Vector from monster to player
      const toPlayerX = player.pos.x - this.pos.x;
      const toPlayerZ = player.pos.z - this.pos.z;

      // Current heading
      const curSpeed = dHypot(this.vel.x, this.vel.z);
      if (curSpeed > 1.0) {
        const dirX = this.vel.x / curSpeed;
        const dirZ = this.vel.z / curSpeed;

        // Heading dot towards player
        const dot = (dirX * toPlayerX + dirZ * toPlayerZ) / pDist;
        if (dot > 0.15) {
          // Left and right lateral normals relative to forward heading
          const leftX = -dirZ;
          const leftZ = dirX;
          const rightX = dirZ;
          const rightZ = -dirX;

          // Steer laterally away from the side the player is standing on
          const side = leftX * toPlayerX + leftZ * toPlayerZ;
          const steerX = side > 0 ? rightX : leftX;
          const steerZ = side > 0 ? rightZ : leftZ;

          // Apply gentle lateral deflection brushing past player's shoulder
          const proximity = 1.0 - (pDist - MonsterAI.TANGENTIAL_NUDGE_MIN) / (MonsterAI.TANGENTIAL_NUDGE_MAX - MonsterAI.TANGENTIAL_NUDGE_MIN);
          const nudgeForce = 8.0 * proximity;
          this.pos.x += steerX * nudgeForce * dt;
          this.pos.z += steerZ * nudgeForce * dt;
        }
      }
    }
  }

  private enterArriveAndRoar(): void {
    this.state = 'ARRIVE_AND_ROAR';
    this.stateTimer = 0;
    this.vel.x = 0;
    this.vel.z = 0;
    this.rearingT = 0.88;
    this.jawOpenT = 0.85; // full flared maw
  }

  private stepArriveAndRoar(_dt: number): void {
    this.vel.x = 0;
    this.vel.z = 0;
    this.rearingT = 0.88;
    this.jawOpenT = 0.85;

    if (this.stateTimer >= this.roarDuration) {
      // Roar complete with no new splashes -> retreat
      this.enterRetreatProwl();
    }
  }

  private enterRetreatProwl(): void {
    this.state = 'RETREAT_PROWL';
    this.stateTimer = 0;
    this.rearingT = 0.0;
    this.jawOpenT = 0.15;
    this.isBlockedAtTrench = false;
    this.activeTrenchMouth = null;

    // Pick a patrol retreat point 22m - 35m away in opposite direction
    const awayYaw = this.yaw + D_PI;
    const dist = 28.0;
    const rx = this.pos.x + dCos(awayYaw) * dist;
    const rz = this.pos.z + dSin(awayYaw) * dist;
    const snapped = this.nav.snapTargetPos(rx, rz);
    this.currentPath = this.nav.findPath(this.pos.x, this.pos.z, snapped.x, snapped.z);
    this.currentPathIndex = 0;
  }

  private stepRetreatProwl(dt: number): void {
    if (this.currentPath.length === 0 || this.currentPathIndex >= this.currentPath.length) {
      this.state = 'PATROL';
      this.stateTimer = 0;
      return;
    }
    this.followPath(dt, MonsterAI.SPEED_RETREAT, 8.0);
  }

  private stepTrenchClawLunge(_dt: number): void {
    this.vel.x = 0;
    this.vel.z = 0;
    this.rearingT = 0.45;
    this.jawOpenT = 0.60;

    if (this.stateTimer >= this.lungeDuration) {
      this.enterRetreatProwl();
    }
  }

  private followPath(dt: number, speed: number, turnRate: number): void {
    if (this.currentPathIndex >= this.currentPath.length) {
      this.vel.x = 0;
      this.vel.z = 0;
      return;
    }

    const targetPt = this.currentPath[this.currentPathIndex]!;
    const dx = targetPt.x - this.pos.x;
    const dz = targetPt.z - this.pos.z;
    const dist = dHypot(dx, dz);

    if (dist < 0.6) {
      this.currentPathIndex++;
      if (this.currentPathIndex >= this.currentPath.length) {
        this.vel.x = 0;
        this.vel.z = 0;
        return;
      }
    }

    // Desired heading
    const desiredYaw = dAtan2(dx, dz);
    let diff = desiredYaw - this.yaw;
    while (diff > D_PI) diff -= D_TWO_PI;
    while (diff < -D_PI) diff += D_TWO_PI;

    const maxTurn = turnRate * dt;
    this.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));

    // Move forward along yaw
    this.vel.x = dSin(this.yaw) * speed;
    this.vel.z = dCos(this.yaw) * speed;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  private triggerKill(reason: string): void {
    if (this.onKillPlayer) {
      this.onKillPlayer(reason);
    }
  }
}

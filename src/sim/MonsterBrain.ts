/* ── MonsterBrain.ts ───────────────────────────────────────────────────────
 *  Pure deterministic state machine for the Blind Acoustic Monster.
 *  Implements WANDER, ALERTED, HUNT, INVESTIGATE, BLOCKED, ATTACK,
 *  hearing reactions, trench avoidance, and physical touch boundaries.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, MonsterState, NoiseEvent } from '../types/contracts.js';
import type { NavGrid } from './NavGrid.js';
import { AStarPathfinder, type PathPoint } from './AStar.js';
import type { ColliderSet } from './Colliders.js';
import type { EventRingBuffer } from './Events.js';
import { canHearNoise, calculateNoiseScore, type HearingContext } from './Hearing.js';
import { Rng } from './rng.js';
import { dHypot, dSin, dCos, dAtan2, D_PI, D_TWO_PI } from './dmath.js';
import type { MonsterNavigation } from './MonsterNavigation.js';
import type { AcousticBus } from './AcousticBus.js';

export type MonsterBrainState = MonsterState;

export interface MonsterDef {
  id: string;
  variant: 'standard' | 'elder' | 'juvenile';
  spawn: Vec3;
  sleeperSpawn?: Vec3;
  hearingMul?: number;
  speedMul?: number;
  scale?: number;
  tint?: string;
  spawnGrace?: number;
}

export interface MonsterSnapshot {
  id: string;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  state: MonsterState;
  agitation: number;
  jawOpenT: number;
  rearingT: number;
  swipeT: number;
  earAngle: number;
  isListening: boolean;
  targetPos: Vec3 | null;
  path: readonly PathPoint[];
  isSighting?: boolean;
  headScanYaw?: number;
  lipPaceCount?: number;
}

export interface MonsterNetState {
  id: string;
  state: MonsterState;
  pos: Vec3;
  yaw: number;
  target?: Vec3 | undefined;
  t: number;
}

export class MonsterBrain {
  readonly id: string;
  readonly variant: 'standard' | 'elder' | 'juvenile';
  readonly pos: Vec3;
  readonly vel: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;

  state: MonsterState = 'DORMANT';
  agitation = 0; // 0..1

  // Speeds
  static readonly SPEED_WANDER = 3.2;
  static readonly SPEED_STALK = 2.4; // Prompt 4C: wading stalk speed 2.2–2.6 m/s
  static readonly SPEED_INVESTIGATE = 2.4; // Prompt 4C: slow stalk/search crawl 2.2–2.6 m/s
  static readonly SPEED_TERMINAL_LUNGE = 7.2; // Prompt 4C: 7.2 m/s terminal lunge within <= 4m
  static readonly SPEED_HUNT = 10.4;
  static readonly SPEED_APEX_SPRINT = 13.8;
  static readonly TURN_RATE_WANDER = 7.5; // rad/s
  static readonly TURN_RATE_HUNT = 16.0; // rad/s

  // Ranges
  static readonly TOUCH_RANGE = 1.15; // physical body contact (0.68m monster + ~0.45m player)
  static readonly ATTACK_RANGE = 2.35; // strike reach (when noisy/moving)
  static readonly LUNGE_RANGE = 3.8; // high-speed hydro-lunge pounce range

  readonly hearingMul: number;
  readonly speedMul: number;
  readonly scale: number;
  readonly candidateSpawns: Vec3[] = [];

  // Pathfinding
  private astar: AStarPathfinder;
  public monsterNav?: MonsterNavigation;
  public acousticBus?: AcousticBus;
  private currentPath: PathPoint[] = [];
  private currentPathIndex = 0;
  private currentTarget: Vec3 | null = null;
  private currentTargetScore = 0;
  private patrolBias: { center: Vec3; radius: number; strength: number } | null = null;

  // State timers
  private stateTimer = 0;
  private reactionTimer = 0;
  private listenTimer = 0;
  private isListening = false;
  lastRetargetTime = 0;
  private investigatePhase: 'sniff' | 'search' = 'sniff';
  private searchTimer = 0;
  private swipeCooldown = 0;
  private stuckTimer = 0;
  consecutiveSplashes = 0;
  lastSplashTime = -999;
  isSighting = false;
  private sightingTimer = 0;

  // Running trajectory hash for determinism testing
  private trajectoryHash = 0x811c9dc5;

  // Presentation helper metrics
  jawOpenT = 0; // 0..1
  rearingT = 0; // 0..1
  swipeT = 0; // 0..1
  earAngle = 0;
  headScanYaw = 0;
  lipPaceCount = 0;
  private lipPacePoints: PathPoint[] = [];
  private lipPaceIdx = 0;
  private lipVocalized = false;

  private readonly rng: Rng;

  constructor(def: MonsterDef, nav: NavGrid, seed = 12345) {
    this.id = def.id;
    this.variant = def.variant;
    this.pos = { x: def.spawn.x, y: def.spawn.y, z: def.spawn.z };
    this.candidateSpawns.push({ ...def.spawn });
    this.hearingMul = def.hearingMul ?? (def.variant === 'elder' ? 1.25 : def.variant === 'juvenile' ? 0.8 : 1.0);
    this.speedMul = def.speedMul ?? (def.variant === 'elder' ? 0.85 : def.variant === 'juvenile' ? 1.2 : 1.0);
    this.scale = def.scale ?? (def.variant === 'elder' ? 1.15 : def.variant === 'juvenile' ? 0.8 : 1.0);

    this.astar = new AStarPathfinder(nav);
    this.rng = new Rng(seed);

    // Initial grace period in DORMANT state (2.5s default for active pacing)
    this.stateTimer = def.spawnGrace ?? 2.5;
  }

  addCandidateSpawn(spawn: Vec3): void {
    this.candidateSpawns.push({ ...spawn });
  }

  setNav(nav: NavGrid): void {
    if (this.astar.nav !== nav) {
      this.astar = new AStarPathfinder(nav);
    }
  }

  setMonsterNav(nav: MonsterNavigation): void {
    this.monsterNav = nav;
  }

  setAcousticBus(bus: AcousticBus): void {
    this.acousticBus = bus;
  }

  setPatrolBias(center: Vec3, radius: number, strength: number): void {
    this.patrolBias = { center: { ...center }, radius, strength };
  }

  scheduleSweep(path: PathPoint[], isSighting = false, duration = 10.0): void {
    if (this.isSighting && !isSighting) {
      // Do not abort an ongoing visible sighting for an ambient sweep
      return;
    }
    if (path.length > 0) {
      const fullPath: PathPoint[] = [];
      let curX = this.pos.x;
      let curZ = this.pos.z;
      for (const pt of path) {
        const seg = this.astar.findPath(curX, curZ, pt.x, pt.z);
        if (seg.length > 0) {
          fullPath.push(...seg);
          const last = seg[seg.length - 1]!;
          curX = last.x;
          curZ = last.z;
        } else {
          fullPath.push(pt);
        }
      }
      this.currentPath = fullPath.length > 0 ? fullPath : [...path];
      this.currentPathIndex = 0;
      this.isSighting = isSighting;
      this.sightingTimer = isSighting ? duration : 0;
      if (this.state === 'DORMANT' || this.state === 'WANDER') {
        this.state = 'WANDER';
        this.isListening = false;
        this.stateTimer = 0;
      }
    }
  }

  scheduleListen(position: Vec3, seconds: number): void {
    if (this.isSighting) return;
    const path = this.astar.findPath(this.pos.x, this.pos.z, position.x, position.z);
    if (path.length > 0) {
      this.currentPath = path;
      this.currentPathIndex = 0;
      this.state = 'WANDER';
      this.isListening = false;
      this.listenTimer = seconds;
    } else {
      this.state = 'WANDER';
      this.isListening = true;
      this.listenTimer = seconds;
      this.vel.x = 0;
      this.vel.z = 0;
      this.rearingT = 0.5;
      this.jawOpenT = 0.2;
    }
  }

  getSnapshot(): MonsterSnapshot {
    return {
      id: this.id,
      pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      vel: { x: this.vel.x, y: this.vel.y, z: this.vel.z },
      yaw: this.yaw,
      state: this.state,
      agitation: this.agitation,
      jawOpenT: this.jawOpenT,
      rearingT: this.rearingT,
      swipeT: this.swipeT,
      earAngle: this.earAngle,
      isListening: this.isListening,
      targetPos: this.currentTarget ? { ...this.currentTarget } : null,
      path: this.currentPath,
      isSighting: this.isSighting,
      headScanYaw: this.headScanYaw,
      lipPaceCount: this.lipPaceCount,
    };
  }

  getCurrentPath(): readonly PathPoint[] {
    return this.currentPath;
  }

  serialize(simTime: number): MonsterNetState {
    return {
      id: this.id,
      state: this.state,
      pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      yaw: this.yaw,
      target: this.currentTarget ? { ...this.currentTarget } : undefined,
      t: simTime,
    };
  }

  applyNet(s: MonsterNetState): void {
    this.state = s.state;
    this.pos.x = s.pos.x;
    this.pos.y = s.pos.y;
    this.pos.z = s.pos.z;
    this.yaw = s.yaw;
    if (s.target) {
      this.currentTarget = { ...s.target };
    }
  }

  hydrate(s: MonsterNetState | MonsterSnapshot): void {
    this.applyNet(s as MonsterNetState);
  }

  /** Test/debug helper to enter state deterministically */
  forceState(
    state: MonsterState,
    options?: {
      stateTimer?: number;
      investigatePhase?: 'sniff' | 'search';
      searchTimer?: number;
    },
  ): void {
    this.state = state;
    this.currentPath = [];
    this.currentPathIndex = 0;
    if (options?.stateTimer !== undefined) this.stateTimer = options.stateTimer;
    if (options?.investigatePhase !== undefined) this.investigatePhase = options.investigatePhase;
    if (options?.searchTimer !== undefined) this.searchTimer = options.searchTimer;
  }

  hashTrajectory(): number {
    return this.trajectoryHash >>> 0;
  }

  step(
    dt: number,
    playerPos: Vec3,
    nav: NavGrid,
    colliders: ColliderSet,
    events: EventRingBuffer,
    hearingCtx: HearingContext,
    simTime: number,
    isPlayerPerched = false,
    isPlayerInWater = false,
    isPlayerMoving = false,
  ): void {
    if (this.astar.nav !== nav) {
      this.setNav(nav);
    }

    // 0. Update trajectory hash (32-bit FNV-1a mixing of pos, yaw, state)
    const px = Math.round(this.pos.x * 100);
    const pz = Math.round(this.pos.z * 100);
    const pyaw = Math.round(this.yaw * 100);
    let h = this.trajectoryHash;
    h = Math.imul(h ^ px, 16777619);
    h = Math.imul(h ^ pz, 16777619);
    h = Math.imul(h ^ pyaw, 16777619);
    h = Math.imul(h ^ this.state.charCodeAt(0), 16777619);
    this.trajectoryHash = h;

    if (this.state === 'STUNNED') {
      this.stepStunned(dt, nav, playerPos);
      return;
    }

    // 1. Agitation decay
    this.agitation = Math.max(0.0, this.agitation - 0.04 * dt);
    if (this.sightingTimer > 0) {
      this.sightingTimer -= dt;
      if (this.sightingTimer <= 0) {
        this.isSighting = false;
      }
    }

    // 2. Physical Touch & Attack Check
    const distToPlayer = dHypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const vertDistToPlayer = Math.abs(playerPos.y - this.pos.y);
    const isOnDryPlatform = isPlayerPerched || (this.monsterNav ? (!isPlayerInWater || this.monsterNav.isPlatformAt(playerPos.x, playerPos.z)) : false);

    if (this.state !== 'DORMANT' && this.state !== 'ATTACK') {
      if (isOnDryPlatform) {
        // PROMPT 3A: Dry Platforms Are Strictly Off-Limits to the Monster.
        // Monster is 100% blind: player on dry platform is completely immune from attack.
        if (
          (this.state === 'ALERTED' || this.state === 'HUNT' || this.state === 'INVESTIGATE') &&
          distToPlayer <= 3.0
        ) {
          this.enterLurk(playerPos, simTime);
        }
      } else {
        // Player is actively in the water
        if (this.state === 'LURK' && distToPlayer <= 2.5) {
          this.triggerAttack(events, simTime);
          return;
        }

        // Direct physical body touch contact (< 0.85m) in any active state
        if (distToPlayer <= MonsterBrain.TOUCH_RANGE && vertDistToPlayer <= 2.2) {
          if (!this.isSighting) {
            this.triggerAttack(events, simTime);
            return;
          }
        }

        if (this.state === 'HUNT' || this.state === 'ALERTED') {
          // Advanced Monster Navigation & Acoustic Rules during charge/hunt
          if (isPlayerMoving) {
            // Actively moving / splashing in water: lethal strike within ATTACK_RANGE
            if (distToPlayer <= MonsterBrain.ATTACK_RANGE && vertDistToPlayer <= 2.2) {
              if (!this.isSighting) {
                this.triggerAttack(events, simTime);
                return;
              }
            }
          } else {
            // Frozen still in water during charge: ONLY killed on direct body impact (< TOUCH_RANGE)
            // Gentle tangential steering deflection brushing past player's shoulder (0.85m - 2.5m)
            if (distToPlayer >= MonsterBrain.TOUCH_RANGE && distToPlayer <= 2.5) {
              const curSpeed = dHypot(this.vel.x, this.vel.z);
              if (curSpeed > 0.5) {
                const toPX = playerPos.x - this.pos.x;
                const toPZ = playerPos.z - this.pos.z;
                const tanX = -toPZ / distToPlayer;
                const tanZ = toPX / distToPlayer;
                const nudge = 5.0 * (1.0 - (distToPlayer - MonsterBrain.TOUCH_RANGE) / (2.5 - MonsterBrain.TOUCH_RANGE));
                this.pos.x += tanX * nudge * dt;
                this.pos.z += tanZ * nudge * dt;
              }
            }
          }
        } else if (this.state === 'BLOCKED') {
          const inNarrowTrench = this.monsterNav ? this.monsterNav.isInsideNarrowTrench(playerPos.x, playerPos.z) : false;
          if (distToPlayer <= (inNarrowTrench ? 1.45 : MonsterBrain.ATTACK_RANGE) && vertDistToPlayer <= 2.2) {
            if (!this.isSighting) {
              this.triggerAttack(events, simTime);
              return;
            }
          }
        } else {
          // In WANDER, PATROL, or INVESTIGATE:
          // Monster is 100% blind; a silent player (> TOUCH_RANGE) is NEVER attacked.
          // If approaching stationary player, gentle tangential steering deflection allows natural near-misses.
          if (!isPlayerMoving && distToPlayer >= MonsterBrain.TOUCH_RANGE && distToPlayer <= 2.5) {
            const curSpeed = dHypot(this.vel.x, this.vel.z);
            if (curSpeed > 0.3) {
              const toPX = playerPos.x - this.pos.x;
              const toPZ = playerPos.z - this.pos.z;
              const tanX = -toPZ / distToPlayer;
              const tanZ = toPX / distToPlayer;
              const nudge = 3.5 * (1.0 - (distToPlayer - MonsterBrain.TOUCH_RANGE) / (2.5 - MonsterBrain.TOUCH_RANGE));
              this.pos.x += tanX * nudge * dt;
              this.pos.z += tanZ * nudge * dt;
            }
          }

          // Active wading movement in water: if acoustic wade sound can be heard, alert predator
          if (this.state === 'WANDER' && isPlayerInWater && isPlayerMoving) {
            const wadeNoise: NoiseEvent = {
              id: `synth_wade_${simTime}`,
              kind: 'wade',
              position: playerPos,
              loudness: 0.35,
              sourcePlayerId: 'player',
              t: simTime,
            };
            if (canHearNoise(wadeNoise, this.pos, this.hearingMul, hearingCtx, colliders)) {
              this.enterAlerted(playerPos, 1.0, simTime);
              this.agitation = 1.0;
              return;
            }
          }
        }
      }
    }

    // 2.6. Check if current cell became unwalkable (stranded by water level drop)
    if ((this.state === 'WANDER' || this.state === 'INVESTIGATE') && distToPlayer > MonsterBrain.ATTACK_RANGE) {
      const g = nav.worldToGrid(this.pos.x, this.pos.z);
      if (!nav.isWalkable(g.gx, g.gz)) {
        const nearest = nav.findNearestWalkableCell(this.pos.x, this.pos.z, 15.0);
        if (nearest) {
          // Retreat at hunt speed to nearest walkable water cell
          const dx = nearest.x - this.pos.x;
          const dz = nearest.z - this.pos.z;
          const dist = dHypot(dx, dz);
          if (dist > 0.2) {
            const targetYaw = dAtan2(dx, -dz);
            this.yaw = this.steerTowards(this.yaw, targetYaw, MonsterBrain.TURN_RATE_HUNT * dt);
            const moveSpeed = MonsterBrain.SPEED_HUNT * this.speedMul;
            this.pos.x += dSin(this.yaw) * moveSpeed * dt;
            this.pos.z -= dCos(this.yaw) * moveSpeed * dt;
            this.vel.x = dSin(this.yaw) * moveSpeed;
            this.vel.z = -dCos(this.yaw) * moveSpeed;
            return;
          }
        } else {
          // Never freeze with 999s timer; search wider radius or resume wander
          const fallback = nav.findNearestWalkableCell(this.pos.x, this.pos.z, 45.0);
          if (fallback) {
            const dx = fallback.x - this.pos.x;
            const dz = fallback.z - this.pos.z;
            const targetYaw = dAtan2(dx, -dz);
            this.yaw = this.steerTowards(this.yaw, targetYaw, MonsterBrain.TURN_RATE_HUNT * dt);
            const moveSpeed = MonsterBrain.SPEED_INVESTIGATE * this.speedMul;
            this.pos.x += dSin(this.yaw) * moveSpeed * dt;
            this.pos.z -= dCos(this.yaw) * moveSpeed * dt;
            this.vel.x = dSin(this.yaw) * moveSpeed;
            this.vel.z = -dCos(this.yaw) * moveSpeed;
            return;
          }
        }
      }
    }

    // 4. State Machine Execution
    switch (this.state) {
      case 'DORMANT':
        this.stepDormant(dt, nav, playerPos);
        break;
      case 'WANDER':
        this.stepWander(dt, nav, events, simTime, playerPos);
        break;
      case 'ALERTED':
        this.stepAlerted(dt, nav, events, simTime);
        break;
      case 'HUNT':
        this.stepHunt(dt, nav, hearingCtx, events, simTime, playerPos, isPlayerInWater, isPlayerPerched, isPlayerMoving);
        break;
      case 'INVESTIGATE':
        this.stepInvestigate(dt, nav, events, simTime, playerPos, isPlayerMoving);
        break;
      case 'BLOCKED':
        this.stepBlocked(dt, nav, events, simTime);
        break;
      case 'ATTACK':
        this.stepAttack(dt);
        break;
      case 'LURK':
        this.stepLurk(dt, playerPos, nav, events, simTime);
        break;
    }

    // 5. Minkowski Sum Dry Platform Exclusion (R_MONSTER = 0.68m)
    // Guarantees monster never steps, climbs, or clips onto dry platforms
    if (this.monsterNav) {
      const resolved = this.monsterNav.resolveMonsterCollision(this.pos);
      this.pos.x = resolved.x;
      this.pos.z = resolved.z;
    }
  }

  /**
   * Evaluate heard noise against acoustic perception and retargeting criteria.
   */
  onNoiseEvent(
    noise: NoiseEvent,
    colliders: ColliderSet,
    hearingCtx: HearingContext,
    simTime: number,
  ): boolean {
    if (this.state === 'STUNNED') return false;
    // Ignore self-generated noises
    if (noise.sourcePlayerId === this.id) return false;

    // Acoustic perception check strictly governed by ACOUSTIC_RULEBOOK.md
    const canHear = canHearNoise(noise, this.pos, this.hearingMul, hearingCtx, colliders);

    if (!canHear) {
      return false;
    }

    const dx = noise.position.x - this.pos.x;
    const dz = noise.position.z - this.pos.z;
    const isWaterSplash = noise.kind === 'splash' || (noise as unknown as { type?: string }).type === 'jump_in' || (noise.kind === 'wade' && noise.id.startsWith('noise_jump'));

    // Track consecutive loud splashes/noises within 6.0s window
    if (simTime - this.lastSplashTime < 6.0) {
      this.consecutiveSplashes = Math.min(5, this.consecutiveSplashes + 1);
    } else {
      this.consecutiveSplashes = 1;
    }
    this.lastSplashTime = simTime;

    // Boost agitation faster on consecutive noises
    this.agitation = Math.min(1.0, this.agitation + 0.35 + this.consecutiveSplashes * 0.15);

    // Aim ear-fins toward noise direction
    this.earAngle = dAtan2(dx, -dz);

    // Sighting protection: do not interrupt choreographed sighting sweeps
    if (this.isSighting) {
      return false;
    }

    const score = calculateNoiseScore(noise, this.pos);

    if (
      this.state === 'DORMANT' ||
      this.state === 'WANDER' ||
      this.state === 'INVESTIGATE' ||
      this.state === 'BLOCKED' ||
      this.state === 'LURK'
    ) {
      this.enterAlerted(noise.position, score, simTime);
      if (isWaterSplash && (this.consecutiveSplashes >= 2 || noise.loudness >= 0.45)) {
        this.reactionTimer = Math.min(this.reactionTimer, 0.05);
      }
      return true;
    }

    if (this.state === 'ALERTED') {
      this.currentTarget = { ...noise.position };
      this.currentTargetScore = Math.max(this.currentTargetScore, score);
      this.lastRetargetTime = simTime;
      this.reactionTimer = Math.min(this.reactionTimer, 0.08);
      return true;
    }

    if (this.state === 'HUNT') {
      // NEVER transition back to ALERTED during HUNT (which would zero velocity and stall the chase)!
      // Instead, retarget in-place while maintaining full hunt momentum.
      this.updateHuntTargetInPlace(noise.position, score, this.astar.nav, simTime);
      return true;
    }

    return false;
  }

  public updateHuntTargetInPlace(pos: Vec3, score: number, nav: NavGrid, simTime: number): void {
    this.currentTarget = { ...pos };
    this.currentTargetScore = Math.max(this.currentTargetScore, score);
    this.lastRetargetTime = simTime;
    this.isListening = false;
    this.rearingT = 0;

    const path = this.astar.findPath(this.pos.x, this.pos.z, pos.x, pos.z);
    if (path.length > 0) {
      this.currentPath = path;
      this.currentPathIndex = 0;
    } else if (nav.isWalkableWorld(pos.x, pos.z)) {
      this.currentPath = [{ x: pos.x, z: pos.z }];
      this.currentPathIndex = 0;
    }
  }

  private enterAlerted(pos: Vec3, score: number, simTime: number): void {
    this.state = 'ALERTED';
    this.currentTarget = { ...pos };
    this.currentTargetScore = score;
    this.lastRetargetTime = simTime;

    // Fast reaction delay: 0.12–0.27s, shortened by agitation
    this.reactionTimer = 0.12 + (1.0 - this.agitation) * 0.15;
    this.rearingT = 1.0; // rear up
    this.jawOpenT = 1.0; // roar
  }

  private triggerAttack(events: EventRingBuffer, simTime: number): void {
    if (this.isSighting) return;
    this.state = 'ATTACK';
    this.stateTimer = 2.0;
    this.jawOpenT = 1.0;
    this.vel.x = 0;
    this.vel.z = 0;
    events.pushDamage('player', this.id, 100, simTime);
  }

  private stepDormant(dt: number, nav: NavGrid, playerPos?: Vec3): void {
    this.vel.x = 0;
    this.vel.z = 0;
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.enterWander(nav, playerPos);
    }
  }

  private enterWander(nav: NavGrid, playerPos?: Vec3): void {
    this.state = 'WANDER';
    this.isListening = false;
    this.listenTimer = this.rng.range(6.0, 14.0);
    this.pickNextWanderWaypoint(nav, playerPos);
  }

  private stepWander(dt: number, nav: NavGrid, events: EventRingBuffer, simTime: number, playerPos?: Vec3): void {
    this.jawOpenT = Math.max(0, this.jawOpenT - dt * 3.0);
    this.rearingT = Math.max(0, this.rearingT - dt * 2.0);

    // Periodic listening pause (every 6–14s for 1.5–3s)
    this.listenTimer -= dt;
    if (this.listenTimer <= 0) {
      if (!this.isListening) {
        this.isListening = true;
        this.listenTimer = this.rng.range(1.5, 3.0);
      } else {
        this.isListening = false;
        this.listenTimer = this.rng.range(6.0, 14.0);
      }
    }

    if (this.isListening) {
      this.vel.x = 0;
      this.vel.z = 0;
      return;
    }

    const speed = (MonsterBrain.SPEED_WANDER + this.agitation * 0.6) * this.speedMul;
    this.followPath(dt, speed, MonsterBrain.TURN_RATE_WANDER, nav, events, simTime, playerPos);

    // If path finished, choose next waypoint
    if (this.currentPathIndex >= this.currentPath.length) {
      this.pickNextWanderWaypoint(nav, playerPos);
    }
  }

  private stepAlerted(dt: number, nav: NavGrid, events: EventRingBuffer, simTime: number): void {
    this.vel.x = 0;
    this.vel.z = 0;

    // Face the target
    if (this.currentTarget) {
      const dx = this.currentTarget.x - this.pos.x;
      const dz = this.currentTarget.z - this.pos.z;
      const targetYaw = dAtan2(dx, -dz);
      this.yaw = this.steerTowards(this.yaw, targetYaw, MonsterBrain.TURN_RATE_HUNT * dt);
    }

    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      if (!this.isSighting) {
        // Emit monster roar
        events.pushNoise(`noise_roar_${this.id}_${simTime}`, 'roar', this.pos.x, this.pos.y, this.pos.z, 0.9, this.id, simTime);
        this.enterHunt(nav);
      } else {
        this.enterWander(nav);
      }
    }
  }

  private enterHunt(nav: NavGrid): void {
    if (!this.currentTarget) {
      this.enterWander(nav);
      return;
    }

    const myComponent = nav.getComponentWorld(this.pos.x, this.pos.z);
    const targetWalkable = nav.isWalkableWorld(this.currentTarget.x, this.currentTarget.z);
    const targetComponent = nav.getComponentWorld(this.currentTarget.x, this.currentTarget.z);

    // If target is in an impassable trench or unreachable component -> BLOCKED
    if (!targetWalkable || targetComponent !== myComponent) {
      this.enterBlocked(nav);
      return;
    }

    this.state = 'HUNT';
    this.isListening = false;
    this.rearingT = 0;

    // Compute A* path to target
    this.currentPath = this.astar.findPath(this.pos.x, this.pos.z, this.currentTarget.x, this.currentTarget.z);
    this.currentPathIndex = 0;

    if (this.currentPath.length === 0) {
      this.enterBlocked(nav);
    }
  }

  private stepHunt(
    dt: number,
    nav: NavGrid,
    _hearingCtx: HearingContext,
    events: EventRingBuffer,
    simTime: number,
    playerPos?: Vec3,
    isPlayerInWater = false,
    isPlayerPerched = false,
    isPlayerMoving = false,
  ): void {
    const sprintBonus =
      this.agitation >= 0.7 || this.consecutiveSplashes >= 2
        ? (MonsterBrain.SPEED_APEX_SPRINT - MonsterBrain.SPEED_HUNT) *
          Math.min(1, Math.max(0, (this.consecutiveSplashes - 1) * 0.5) + this.agitation * 0.5)
        : 0;
    const speed = (MonsterBrain.SPEED_HUNT + sprintBonus) * this.speedMul;
    this.jawOpenT = 0.85;

    if (playerPos && !isPlayerPerched && !this.isSighting) {
      const dx = playerPos.x - this.pos.x;
      const dz = playerPos.z - this.pos.z;
      const distToPlayer = dHypot(dx, dz);
      const vertDistToPlayer = Math.abs(playerPos.y - this.pos.y);

      // Hydro-Lunge Pounce within LUNGE_RANGE (3.8m) - only if moving or very close in water
      if (distToPlayer <= MonsterBrain.LUNGE_RANGE && vertDistToPlayer <= 2.2 && (isPlayerMoving || distToPlayer <= 1.0)) {
        this.yaw = dAtan2(dx, -dz);
        const lungeSpeed = 18.0 * this.speedMul;
        const stepDist = Math.min(distToPlayer, lungeSpeed * dt);
        const nextX = this.pos.x + dSin(this.yaw) * stepDist;
        const nextZ = this.pos.z - dCos(this.yaw) * stepDist;
        if (nav.isWalkableWorld(nextX, nextZ) || isPlayerInWater) {
          this.pos.x = nextX;
          this.pos.z = nextZ;
          this.vel.x = dSin(this.yaw) * lungeSpeed;
          this.vel.z = -dCos(this.yaw) * lungeSpeed;
        }
        this.jawOpenT = 1.0;
        const postLungeDist = dHypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
        if (postLungeDist <= MonsterBrain.ATTACK_RANGE) {
          this.triggerAttack(events, simTime);
          return;
        }
        events.pushFootfall(this.id, this.pos.x, this.pos.y, this.pos.z, 1.35, true, simTime);
        return;
      }
    }

    this.followPath(dt, speed, MonsterBrain.TURN_RATE_HUNT, nav, events, simTime);

    // Check if reached end of hunt path or arrived within 0.9m of last splash target
    const dTarget = this.currentTarget ? dHypot(this.currentTarget.x - this.pos.x, this.currentTarget.z - this.pos.z) : 999;
    if (dTarget < 0.9 || this.currentPathIndex >= this.currentPath.length) {
      if (playerPos && !isPlayerPerched && !this.isSighting && isPlayerInWater) {
        const dP = dHypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
        const lethalRange = isPlayerMoving ? MonsterBrain.ATTACK_RANGE : MonsterBrain.TOUCH_RANGE;
        if (dP <= lethalRange && Math.abs(playerPos.y - this.pos.y) <= 2.2) {
          this.triggerAttack(events, simTime);
          return;
        }
      }
      // Reached splash point: roar and transition to investigate
      this.rearingT = 1.0;
      this.jawOpenT = 1.0;
      events.pushNoise(`noise_roar_${this.id}_${simTime}`, 'roar', this.pos.x, this.pos.y, this.pos.z, 0.95, this.id, simTime);
      this.enterInvestigate();
    }
  }

  private enterInvestigate(): void {
    this.state = 'INVESTIGATE';
    this.investigatePhase = 'sniff';
    // 3–6s natural investigation per spec: ~1.8s sniff/listen, 3.0–4.0s slow search crawl
    this.stateTimer = 1.8 + (1.0 - this.agitation) * 0.4;
    this.searchTimer = 3.0 + (1.0 - this.agitation) * 1.0;
    this.vel.x = 0;
    this.vel.z = 0;
    this.rearingT = 0; // head low, listening
    this.jawOpenT = 0;
  }

  private stepInvestigate(
    dt: number,
    nav: NavGrid,
    events: EventRingBuffer,
    simTime: number,
    playerPos?: Vec3,
    isPlayerMoving = false,
  ): void {
    this.rearingT = 0; // head low, listening
    this.jawOpenT = Math.max(0, this.jawOpenT - dt * 2.0);
    // Prompt 4C: Sniff/scan headYaw sweep visible to the player when silent
    this.headScanYaw = dSin((this.stateTimer + this.searchTimer) * 3.4) * 0.65;
    this.earAngle = this.yaw + this.headScanYaw;

    if (this.investigatePhase === 'sniff') {
      this.vel.x = 0;
      this.vel.z = 0;
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.investigatePhase = 'search';
        this.pickSearchWaypoint(nav, !isPlayerMoving ? playerPos : undefined);
      }
    } else {
      // Slow search crawl around splash point at stalk speed (2.4 m/s); if silence continues, lose interest & return to WANDER
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) {
        this.headScanYaw = 0;
        this.enterWander(nav, playerPos);
        return;
      }
      const speed = MonsterBrain.SPEED_STALK * this.speedMul;
      // Avoid accidentally stepping into a silent stationary player during blind search crawl
      if (!isPlayerMoving && playerPos) {
        const dSilent = dHypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
        if (dSilent < 2.2) {
          this.pickSearchWaypoint(nav, playerPos);
        }
      }
      this.followPath(dt, speed, MonsterBrain.TURN_RATE_WANDER, nav, events, simTime, !isPlayerMoving ? playerPos : undefined);
      if (this.currentPathIndex >= this.currentPath.length) {
        this.pickSearchWaypoint(nav, !isPlayerMoving ? playerPos : undefined);
      }
    }
  }

  private pickSearchWaypoint(nav: NavGrid, silentPlayerPos?: Vec3): void {
    const origin = this.currentTarget ?? this.pos;
    const myComponent = nav.getComponentWorld(this.pos.x, this.pos.z);
    for (let attempts = 0; attempts < 24; attempts++) {
      const rx = origin.x + this.rng.range(-5, 5);
      const rz = origin.z + this.rng.range(-5, 5);
      if (silentPlayerPos && dHypot(rx - silentPlayerPos.x, rz - silentPlayerPos.z) < 2.4) {
        continue;
      }
      if (nav.isWalkableWorld(rx, rz) && nav.getComponentWorld(rx, rz) === myComponent) {
        this.currentPath = this.astar.findPath(this.pos.x, this.pos.z, rx, rz);
        this.currentPathIndex = 0;
        return;
      }
    }
  }

  private enterBlocked(nav: NavGrid): void {
    this.state = 'BLOCKED';
    this.stateTimer = 8.0; // pace along opposite trench lip for 6–10s
    this.lipPacePoints = [];
    this.lipPaceIdx = 0;
    this.lipVocalized = false;

    if (this.currentTarget) {
      const myComponent = nav.getComponentWorld(this.pos.x, this.pos.z);
      const nearest = nav.findNearestCellInComponent(this.currentTarget.x, this.currentTarget.z, myComponent);
      if (nearest) {
        this.currentPath = this.astar.findPath(this.pos.x, this.pos.z, nearest.x, nearest.z);
        this.currentPathIndex = 0;

        // Build lateral lip-pacing points perpendicular to the vector toward the blocked target
        const toTargetX = this.currentTarget.x - nearest.x;
        const toTargetZ = this.currentTarget.z - nearest.z;
        const len = dHypot(toTargetX, toTargetZ) || 1.0;
        const latX = -toTargetZ / len;
        const latZ = toTargetX / len;

        for (const offset of [2.0, -2.0, 1.2, -1.2]) {
          const px = nearest.x + latX * offset;
          const pz = nearest.z + latZ * offset;
          const snap = nav.findNearestCellInComponent(px, pz, myComponent, 3.0);
          if (snap) {
            this.lipPacePoints.push({ x: snap.x, z: snap.z });
          }
        }
      }
    }
  }

  private stepBlocked(dt: number, nav: NavGrid, events: EventRingBuffer, simTime: number): void {
    const speed = MonsterBrain.SPEED_STALK * this.speedMul;
    this.followPath(dt, speed, MonsterBrain.TURN_RATE_WANDER, nav, events, simTime);

    // Prompt 4C (`f_035`/`f_036`): When blocked by a <= 2.4m trench, pace along opposite lip,
    // reach across with a forelimb (`swipeT`), and vocalise!
    this.swipeT = 0.65 + 0.35 * Math.abs(dSin(this.stateTimer * 3.5));
    this.jawOpenT = 0.55;
    if (!this.lipVocalized) {
      this.lipVocalized = true;
      events.pushNoise(`noise_blocked_roar_${this.id}_${simTime}`, 'roar', this.pos.x, this.pos.y, this.pos.z, 0.85, this.id, simTime);
    }

    if (this.currentPathIndex >= this.currentPath.length && this.lipPacePoints.length > 0) {
      const nextPt = this.lipPacePoints[this.lipPaceIdx % this.lipPacePoints.length]!;
      this.lipPaceIdx++;
      this.lipPaceCount++;
      const seg = this.astar.findPath(this.pos.x, this.pos.z, nextPt.x, nextPt.z);
      this.currentPath = seg.length > 0 ? seg : [nextPt];
      this.currentPathIndex = 0;
    }

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.swipeT = 0;
      this.enterInvestigate();
    }
  }

  private stepAttack(dt: number): void {
    this.vel.x = 0;
    this.vel.z = 0;
    this.jawOpenT = 1.0;
    this.rearingT = 0.5;
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = 'WANDER';
      this.stateTimer = 0;
      this.jawOpenT = 0;
      this.rearingT = 0;
    }
  }

  private followPath(
    dt: number,
    targetSpeed: number,
    turnRate: number,
    nav: NavGrid,
    events: EventRingBuffer,
    simTime: number,
    playerPos?: Vec3,
  ): void {
    if (this.currentPathIndex >= this.currentPath.length) {
      this.vel.x = 0;
      this.vel.z = 0;
      return;
    }

    const passRadius = this.state === 'HUNT' ? 1.1 : 0.6;
    let waypoint = this.currentPath[this.currentPathIndex]!;
    let dx = waypoint.x - this.pos.x;
    let dz = waypoint.z - this.pos.z;
    let dist = dHypot(dx, dz);

    while (dist < passRadius) {
      this.currentPathIndex++;
      if (this.currentPathIndex >= this.currentPath.length) {
        this.vel.x = 0;
        this.vel.z = 0;
        return;
      }
      waypoint = this.currentPath[this.currentPathIndex]!;
      dx = waypoint.x - this.pos.x;
      dz = waypoint.z - this.pos.z;
      dist = dHypot(dx, dz);
    }

    const targetYaw = dAtan2(dx, -dz);
    this.yaw = this.steerTowards(this.yaw, targetYaw, turnRate * dt);

    const fwdX = dSin(this.yaw);
    const fwdZ = -dCos(this.yaw);

    const nextX = this.pos.x + fwdX * targetSpeed * dt;
    const nextZ = this.pos.z + fwdZ * targetSpeed * dt;

    const dirX = dx / (dist || 1);
    const dirZ = dz / (dist || 1);
    const directX = this.pos.x + dirX * targetSpeed * dt;
    const directZ = this.pos.z + dirZ * targetSpeed * dt;

    // Nav-walkability check before advancing
    if (nav.isWalkableWorld(nextX, nextZ)) {
      if (playerPos && (this.state === 'WANDER' || this.state === 'DORMANT')) {
        if (dHypot(nextX - playerPos.x, nextZ - playerPos.z) < 6.0) {
          this.currentPathIndex = this.currentPath.length;
          this.pickNextWanderWaypoint(nav, playerPos);
          return;
        }
      }
      this.pos.x = nextX;
      this.pos.z = nextZ;
      this.vel.x = fwdX * targetSpeed;
      this.vel.z = fwdZ * targetSpeed;
      this.stuckTimer = 0;
    } else if (nav.isWalkableWorld(directX, directZ)) {
      if (playerPos && (this.state === 'WANDER' || this.state === 'DORMANT')) {
        if (dHypot(directX - playerPos.x, directZ - playerPos.z) < 6.0) {
          this.currentPathIndex = this.currentPath.length;
          this.pickNextWanderWaypoint(nav, playerPos);
          return;
        }
      }
      this.pos.x = directX;
      this.pos.z = directZ;
      this.vel.x = dirX * targetSpeed;
      this.vel.z = dirZ * targetSpeed;
      this.stuckTimer = 0;
    } else {
      // Tangential wall-sliding along X-only or Z-only at 90% of targetSpeed (zero 50% velocity stall!)
      const slideSpeed = targetSpeed * 0.9;
      const stepDirX = Math.abs(dirX) >= 0.15 ? Math.sign(dirX) : fwdX;
      const stepDirZ = Math.abs(dirZ) >= 0.15 ? Math.sign(dirZ) : fwdZ;
      const slideX = this.pos.x + stepDirX * slideSpeed * dt;
      const slideZ = this.pos.z + stepDirZ * slideSpeed * dt;

      const xWalkable =
        nav.isWalkableWorld(slideX, this.pos.z) &&
        !(playerPos && (this.state === 'WANDER' || this.state === 'DORMANT') && dHypot(slideX - playerPos.x, this.pos.z - playerPos.z) < 6.0);
      const zWalkable =
        nav.isWalkableWorld(this.pos.x, slideZ) &&
        !(playerPos && (this.state === 'WANDER' || this.state === 'DORMANT') && dHypot(this.pos.x - playerPos.x, slideZ - playerPos.z) < 6.0);

      if (xWalkable && (!zWalkable || Math.abs(dx) >= Math.abs(dz))) {
        this.pos.x = slideX;
        this.vel.x = stepDirX * slideSpeed;
        this.vel.z = 0;
        this.stuckTimer = 0;
      } else if (zWalkable) {
        this.pos.z = slideZ;
        this.vel.x = 0;
        this.vel.z = stepDirZ * slideSpeed;
        this.stuckTimer = 0;
      } else {
        this.stuckTimer += dt;
        if (this.stuckTimer > 0.12) {
          this.stuckTimer = 0;
          this.currentPathIndex++;
          if (this.currentPathIndex >= this.currentPath.length) {
            if (this.state === 'HUNT' && this.currentTarget) {
              this.currentPath = this.astar.findPath(this.pos.x, this.pos.z, this.currentTarget.x, this.currentTarget.z);
              this.currentPathIndex = 0;
            } else {
              this.pickNextWanderWaypoint(nav, playerPos);
            }
          }
        }
      }
    }

    // Footfall event emission at stride intervals
    events.pushFootfall(this.id, this.pos.x, this.pos.y, this.pos.z, targetSpeed / MonsterBrain.SPEED_HUNT, true, simTime);
  }

  private steerTowards(current: number, target: number, maxStep: number): number {
    let diff = (target - current) % D_TWO_PI;
    if (diff < -D_PI) diff += D_TWO_PI;
    if (diff > D_PI) diff -= D_TWO_PI;

    const step = Math.max(-maxStep, Math.min(maxStep, diff));
    return current + step;
  }

  private pickNextWanderWaypoint(nav: NavGrid, playerPos?: Vec3): void {
    const myComponent = nav.getComponentWorld(this.pos.x, this.pos.z);
    for (let attempts = 0; attempts < 30; attempts++) {
      let rx: number;
      let rz: number;

      // 1. Director patrol bias takes priority
      if (this.patrolBias && this.rng.next() < this.patrolBias.strength) {
        const offsetDist = this.rng.range(4.0, this.patrolBias.radius);
        const angle = this.rng.range(-D_PI, D_PI);
        rx = this.patrolBias.center.x + dSin(angle) * offsetDist;
        rz = this.patrolBias.center.z - dCos(angle) * offsetDist;
      } else if (playerPos && (attempts % 2 === 0)) {
        // 50% of the time, bias patrol waypoint toward player's general sector
        const offsetDist = this.rng.range(12.0, 36.0);
        const angle = this.rng.range(-D_PI, D_PI);
        rx = playerPos.x + dSin(angle) * offsetDist;
        rz = playerPos.z - dCos(angle) * offsetDist;
      } else {
        rx = this.rng.range(nav.minX + 4, nav.minX + nav.width * nav.cellSize - 4);
        rz = this.rng.range(nav.minZ + 4, nav.minZ + nav.depth * nav.cellSize - 4);
      }

      if (playerPos) {
        const distToP = dHypot(rx - playerPos.x, rz - playerPos.z);
        if (distToP < 7.0) {
          continue;
        }
      }

      if (nav.isWalkableWorld(rx, rz) && nav.getComponentWorld(rx, rz) === myComponent) {
        const d = dHypot(rx - this.pos.x, rz - this.pos.z);
        if (d >= 8.0) {
          const path = this.astar.findPath(this.pos.x, this.pos.z, rx, rz);
          if (path.length > 0) {
            if (playerPos) {
              let pathTooClose = false;
              for (let pIdx = 0; pIdx < path.length; pIdx++) {
                const pt = path[pIdx]!;
                if (dHypot(pt.x - playerPos.x, pt.z - playerPos.z) < 6.5) {
                  pathTooClose = true;
                  break;
                }
              }
              if (pathTooClose) continue;
            }
            this.currentPath = path;
            this.currentPathIndex = 0;
            return;
          }
        }
      }
    }

    // Fallback: pick distant cell in component so monster is never stranded
    const fallback = nav.findNearestCellInComponent(this.pos.x + 12, this.pos.z + 12, myComponent);
    if (fallback) {
      const path = this.astar.findPath(this.pos.x, this.pos.z, fallback.x, fallback.z);
      if (playerPos) {
        let pathTooClose = false;
        for (const pt of path) {
          if (dHypot(pt.x - playerPos.x, pt.z - playerPos.z) < 6.5) {
            pathTooClose = true;
            break;
          }
        }
        if (!pathTooClose) {
          this.currentPath = path.length > 0 ? path : [{ x: fallback.x, z: fallback.z }];
          this.currentPathIndex = 0;
        }
      } else {
        this.currentPath = path.length > 0 ? path : [{ x: fallback.x, z: fallback.z }];
        this.currentPathIndex = 0;
      }
    }
  }

  stun(duration: number): void {
    this.state = 'STUNNED';
    this.stateTimer = duration;
    this.vel.x = 0;
    this.vel.z = 0;
    this.agitation = 0;
    this.rearingT = 0;
    this.jawOpenT = 0;
    this.swipeT = 0;
  }

  private enterLurk(playerPos: Vec3, simTime: number): void {
    this.state = 'LURK';
    // Up to 15s (shorter at low agitation)
    this.stateTimer = 5.0 + this.agitation * 10.0;
    this.currentTarget = { ...playerPos };
    this.swipeCooldown = 1.0;
    this.lastRetargetTime = simTime;
  }

  private stepLurk(
    dt: number,
    playerPos: Vec3,
    nav: NavGrid,
    events: EventRingBuffer,
    simTime: number,
  ): void {
    this.stateTimer -= dt;
    this.swipeCooldown -= dt;

    // Face player
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = dHypot(dx, dz);
    const targetYaw = dAtan2(dx, -dz);
    this.yaw = this.steerTowards(this.yaw, targetYaw, MonsterBrain.TURN_RATE_WANDER * dt);

    // Circle perch at 2.2 - 3.0 m (nominal 2.6m)
    const orbitRadius = 2.6;
    const tangX = -dz / (dist || 1);
    const tangZ = dx / (dist || 1);
    const radFactor = (dist - orbitRadius) * 0.5;
    const wishDirX = tangX + (dx / (dist || 1)) * radFactor;
    const wishDirZ = tangZ + (dz / (dist || 1)) * radFactor;
    const wishLen = dHypot(wishDirX, wishDirZ);

    const speed = MonsterBrain.SPEED_WANDER * this.speedMul * 0.8;
    const stepX = this.pos.x + (wishDirX / (wishLen || 1)) * speed * dt;
    const stepZ = this.pos.z + (wishDirZ / (wishLen || 1)) * speed * dt;

    if (nav.isWalkableWorld(stepX, stepZ)) {
      this.pos.x = stepX;
      this.pos.z = stepZ;
      this.vel.x = (wishDirX / (wishLen || 1)) * speed;
      this.vel.z = (wishDirZ / (wishLen || 1)) * speed;
    } else {
      this.vel.x = 0;
      this.vel.z = 0;
    }

    // Periodic swipe that visibly stops short
    if (this.swipeCooldown <= 0) {
      this.swipeCooldown = 3.0;
      this.swipeT = 1.0;
      events.pushRipple(this.pos.x, this.pos.y, this.pos.z, 0.5, this.id, simTime);
      events.pushNoise(
        `lurk_growl_${this.id}_${simTime}`,
        'roar',
        this.pos.x,
        this.pos.y,
        this.pos.z,
        0.25,
        this.id,
        simTime,
      );
    } else {
      this.swipeT = Math.max(0, this.swipeT - dt * 2.5);
    }

    if (this.stateTimer <= 0) {
      this.enterInvestigate();
    }
  }

  private stepStunned(dt: number, nav: NavGrid, playerPos: Vec3): void {
    this.vel.x = 0;
    this.vel.z = 0;
    this.rearingT = 0;
    this.jawOpenT = 0;
    this.swipeT = 0;
    this.stateTimer -= dt;

    if (this.stateTimer <= 0) {
      this.respawnFarthest(nav, playerPos);
    }
  }

  private respawnFarthest(_nav: NavGrid, playerPos: Vec3): void {
    let bestSpawn = this.candidateSpawns[0] ?? this.pos;
    let maxDist = -1;

    for (let i = 0; i < this.candidateSpawns.length; i++) {
      const sp = this.candidateSpawns[i]!;
      const d = dHypot(sp.x - playerPos.x, sp.z - playerPos.z);
      if (d > maxDist) {
        maxDist = d;
        bestSpawn = sp;
      }
    }

    this.pos.x = bestSpawn.x;
    this.pos.y = bestSpawn.y;
    this.pos.z = bestSpawn.z;
    this.vel.x = 0;
    this.vel.z = 0;
    this.state = 'DORMANT';
    this.stateTimer = 5.0;
  }
}

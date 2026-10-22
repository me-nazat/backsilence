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

export type MonsterBrainState = MonsterState;

export interface MonsterDef {
  id: string;
  variant: 'standard' | 'elder' | 'juvenile';
  spawn: Vec3;
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
  earAngle: number;
  isListening: boolean;
  targetPos: Vec3 | null;
  path: readonly PathPoint[];
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
  static readonly SPEED_WANDER = 1.6;
  static readonly SPEED_HUNT = 7.2;
  static readonly TURN_RATE_WANDER = 6.0; // rad/s
  static readonly TURN_RATE_HUNT = 10.0; // rad/s

  // Ranges
  static readonly TOUCH_RANGE = 0.9; // physical body contact
  static readonly ATTACK_RANGE = 1.6; // strike reach

  readonly hearingMul: number;
  readonly speedMul: number;
  readonly scale: number;

  // Pathfinding
  private readonly astar: AStarPathfinder;
  private currentPath: PathPoint[] = [];
  private currentPathIndex = 0;
  private currentTarget: Vec3 | null = null;
  private currentTargetScore = 0;

  // State timers
  private stateTimer = 0;
  private reactionTimer = 0;
  private listenTimer = 0;
  private isListening = false;
  private lastRetargetTime = 0;
  private investigatePhase: 'sniff' | 'search' = 'sniff';
  private searchTimer = 0;

  // Running trajectory hash for determinism testing
  private trajectoryHash = 0x811c9dc5;

  // Presentation helper metrics
  jawOpenT = 0; // 0..1
  rearingT = 0; // 0..1
  earAngle = 0;

  private readonly rng: Rng;

  constructor(def: MonsterDef, nav: NavGrid, seed = 12345) {
    this.id = def.id;
    this.variant = def.variant;
    this.pos = { x: def.spawn.x, y: def.spawn.y, z: def.spawn.z };
    this.hearingMul = def.hearingMul ?? (def.variant === 'elder' ? 1.25 : def.variant === 'juvenile' ? 0.8 : 1.0);
    this.speedMul = def.speedMul ?? (def.variant === 'elder' ? 0.85 : def.variant === 'juvenile' ? 1.2 : 1.0);
    this.scale = def.scale ?? (def.variant === 'elder' ? 1.15 : def.variant === 'juvenile' ? 0.8 : 1.0);

    this.astar = new AStarPathfinder(nav);
    this.rng = new Rng(seed);

    // Initial grace period in DORMANT state
    this.stateTimer = def.spawnGrace ?? 8.0;
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
      earAngle: this.earAngle,
      isListening: this.isListening,
      targetPos: this.currentTarget ? { ...this.currentTarget } : null,
      path: this.currentPath,
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
    _colliders: ColliderSet,
    events: EventRingBuffer,
    hearingCtx: HearingContext,
    simTime: number,
  ): void {
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

    // 1. Agitation decay
    this.agitation = Math.max(0.0, this.agitation - 0.04 * dt);

    // 2. Physical Touch & Attack Check
    const distToPlayer = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const vertDistToPlayer = Math.abs(playerPos.y - this.pos.y);

    if (this.state !== 'DORMANT' && this.state !== 'ATTACK') {
      // Touch check: if player touches the monster (< 0.9m) in any active state
      if (distToPlayer <= MonsterBrain.TOUCH_RANGE && vertDistToPlayer <= 2.2) {
        this.triggerAttack(events, simTime);
        return;
      }
      // Attack reach check: if alerted, hunting, investigating, or blocked (< 1.6m)
      if (
        (this.state === 'ALERTED' || this.state === 'HUNT' || this.state === 'INVESTIGATE' || this.state === 'BLOCKED') &&
        distToPlayer <= MonsterBrain.ATTACK_RANGE &&
        vertDistToPlayer <= 2.2
      ) {
        this.triggerAttack(events, simTime);
        return;
      }
    }

    // 2.5. Check if current cell became unwalkable (stranded by water level drop)
    if (this.state !== 'DORMANT' && this.state !== 'ATTACK' && distToPlayer > MonsterBrain.ATTACK_RANGE) {
      const g = nav.worldToGrid(this.pos.x, this.pos.z);
      if (!nav.isWalkable(g.gx, g.gz)) {
        const nearest = nav.findNearestWalkableCell(this.pos.x, this.pos.z, 15.0);
        if (nearest) {
          // Retreat at hunt speed to nearest walkable water cell
          const dx = nearest.x - this.pos.x;
          const dz = nearest.z - this.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.2) {
            const targetYaw = Math.atan2(dx, -dz);
            this.yaw = this.steerTowards(this.yaw, targetYaw, MonsterBrain.TURN_RATE_HUNT * dt);
            const moveSpeed = MonsterBrain.SPEED_HUNT * this.speedMul;
            this.pos.x += Math.sin(this.yaw) * moveSpeed * dt;
            this.pos.z -= Math.cos(this.yaw) * moveSpeed * dt;
            this.vel.x = Math.sin(this.yaw) * moveSpeed;
            this.vel.z = -Math.cos(this.yaw) * moveSpeed;
            return;
          }
        } else {
          // Despawn / settle into DORMANT crouch
          this.state = 'DORMANT';
          this.stateTimer = 999.0;
          this.vel.x = 0;
          this.vel.z = 0;
          return;
        }
      }
    }

    // 4. State Machine Execution
    switch (this.state) {
      case 'DORMANT':
        this.stepDormant(dt, nav);
        break;
      case 'WANDER':
        this.stepWander(dt, nav, events, simTime);
        break;
      case 'ALERTED':
        this.stepAlerted(dt, nav, events, simTime);
        break;
      case 'HUNT':
        this.stepHunt(dt, nav, hearingCtx, events, simTime);
        break;
      case 'INVESTIGATE':
        this.stepInvestigate(dt, nav, events, simTime);
        break;
      case 'BLOCKED':
        this.stepBlocked(dt, nav, events, simTime);
        break;
      case 'ATTACK':
        this.stepAttack(dt);
        break;
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
    // Ignore self-generated noises
    if (noise.sourcePlayerId === this.id) return false;

    // Acoustic perception check
    if (!canHearNoise(noise, this.pos, this.hearingMul, hearingCtx, colliders)) {
      return false;
    }

    // Increase agitation
    this.agitation = Math.min(1.0, this.agitation + 0.25);

    // Aim ear-fins toward noise direction
    const dx = noise.position.x - this.pos.x;
    const dz = noise.position.z - this.pos.z;
    this.earAngle = Math.atan2(dx, -dz);

    const score = calculateNoiseScore(noise, this.pos);

    if (this.state === 'DORMANT' || this.state === 'WANDER' || this.state === 'INVESTIGATE' || this.state === 'BLOCKED') {
      this.enterAlerted(noise.position, score, simTime);
      return true;
    }

    if (this.state === 'HUNT') {
      // Ignore noises coming from the current target location
      if (this.currentTarget && Math.hypot(noise.position.x - this.currentTarget.x, noise.position.z - this.currentTarget.z) < 2.0) {
        return false;
      }
      // Retarget only if noise is louder than current target * 1.15 and reaction delay passed
      if (simTime - this.lastRetargetTime > 0.3 && score > this.currentTargetScore * 1.15) {
        if (noise.loudness >= 0.3) {
          this.enterAlerted(noise.position, score, simTime);
          return true;
        }
      }
    }

    return false;
  }

  private enterAlerted(pos: Vec3, score: number, simTime: number): void {
    this.state = 'ALERTED';
    this.currentTarget = { ...pos };
    this.currentTargetScore = score;
    this.lastRetargetTime = simTime;

    // Reaction delay: 0.35–0.7s, shortened by agitation
    this.reactionTimer = 0.35 + (1.0 - this.agitation) * 0.35;
    this.rearingT = 1.0; // rear up
    this.jawOpenT = 1.0; // roar
  }

  private triggerAttack(events: EventRingBuffer, simTime: number): void {
    this.state = 'ATTACK';
    this.stateTimer = 2.0;
    this.jawOpenT = 1.0;
    this.vel.x = 0;
    this.vel.z = 0;
    events.pushDamage('player', this.id, 100, simTime);
  }

  private stepDormant(dt: number, nav: NavGrid): void {
    this.vel.x = 0;
    this.vel.z = 0;
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.enterWander(nav);
    }
  }

  private enterWander(nav: NavGrid): void {
    this.state = 'WANDER';
    this.isListening = false;
    this.listenTimer = this.rng.range(5.0, 12.0);
    this.pickNextWanderWaypoint(nav);
  }

  private stepWander(dt: number, nav: NavGrid, events: EventRingBuffer, simTime: number): void {
    this.jawOpenT = Math.max(0, this.jawOpenT - dt * 3.0);
    this.rearingT = Math.max(0, this.rearingT - dt * 2.0);

    // Periodic listening pause (every 5–12s for 2–4s)
    this.listenTimer -= dt;
    if (this.listenTimer <= 0) {
      if (!this.isListening) {
        this.isListening = true;
        this.listenTimer = this.rng.range(2.0, 4.0);
      } else {
        this.isListening = false;
        this.listenTimer = this.rng.range(5.0, 12.0);
      }
    }

    if (this.isListening) {
      this.vel.x = 0;
      this.vel.z = 0;
      return;
    }

    const speed = (MonsterBrain.SPEED_WANDER + this.agitation * 0.6) * this.speedMul;
    this.followPath(dt, speed, MonsterBrain.TURN_RATE_WANDER, nav, events, simTime);

    // If path finished, choose next waypoint
    if (this.currentPathIndex >= this.currentPath.length) {
      this.pickNextWanderWaypoint(nav);
    }
  }

  private stepAlerted(dt: number, nav: NavGrid, events: EventRingBuffer, simTime: number): void {
    this.vel.x = 0;
    this.vel.z = 0;

    // Face the target
    if (this.currentTarget) {
      const dx = this.currentTarget.x - this.pos.x;
      const dz = this.currentTarget.z - this.pos.z;
      const targetYaw = Math.atan2(dx, -dz);
      this.yaw = this.steerTowards(this.yaw, targetYaw, MonsterBrain.TURN_RATE_HUNT * dt);
    }

    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      // Emit monster roar
      events.pushNoise(`noise_roar_${this.id}_${simTime}`, 'roar', this.pos.x, this.pos.y, this.pos.z, 0.9, this.id, simTime);
      this.enterHunt(nav);
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
  ): void {
    const speed = MonsterBrain.SPEED_HUNT * this.speedMul;
    this.followPath(dt, speed, MonsterBrain.TURN_RATE_HUNT, nav, events, simTime);

    // Check if reached end of hunt path
    if (this.currentPathIndex >= this.currentPath.length) {
      this.enterInvestigate();
    }
  }

  private enterInvestigate(): void {
    this.state = 'INVESTIGATE';
    this.investigatePhase = 'sniff';
    // 4–8s investigation duration, shortened by agitation
    this.stateTimer = 4.0 + (1.0 - this.agitation) * 4.0;
    this.searchTimer = 10.0;
    this.vel.x = 0;
    this.vel.z = 0;
  }

  private stepInvestigate(dt: number, nav: NavGrid, events: EventRingBuffer, simTime: number): void {
    if (this.investigatePhase === 'sniff') {
      this.vel.x = 0;
      this.vel.z = 0;
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.investigatePhase = 'search';
        this.pickSearchWaypoint(nav);
      }
    } else {
      // 10s search pattern within 12m of last noise at wander speed
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) {
        this.enterWander(nav);
        return;
      }
      const speed = MonsterBrain.SPEED_WANDER * this.speedMul;
      this.followPath(dt, speed, MonsterBrain.TURN_RATE_WANDER, nav, events, simTime);
      if (this.currentPathIndex >= this.currentPath.length) {
        this.pickSearchWaypoint(nav);
      }
    }
  }

  private pickSearchWaypoint(nav: NavGrid): void {
    const origin = this.currentTarget ?? this.pos;
    const myComponent = nav.getComponentWorld(this.pos.x, this.pos.z);
    for (let attempts = 0; attempts < 16; attempts++) {
      const rx = origin.x + this.rng.range(-12, 12);
      const rz = origin.z + this.rng.range(-12, 12);
      if (nav.isWalkableWorld(rx, rz) && nav.getComponentWorld(rx, rz) === myComponent) {
        this.currentPath = this.astar.findPath(this.pos.x, this.pos.z, rx, rz);
        this.currentPathIndex = 0;
        return;
      }
    }
  }

  private enterBlocked(nav: NavGrid): void {
    this.state = 'BLOCKED';
    this.stateTimer = 8.0; // pace along edge for 6–10s

    if (this.currentTarget) {
      const myComponent = nav.getComponentWorld(this.pos.x, this.pos.z);
      const nearest = nav.findNearestCellInComponent(this.currentTarget.x, this.currentTarget.z, myComponent);
      if (nearest) {
        this.currentPath = this.astar.findPath(this.pos.x, this.pos.z, nearest.x, nearest.z);
        this.currentPathIndex = 0;
      }
    }
  }

  private stepBlocked(dt: number, nav: NavGrid, events: EventRingBuffer, simTime: number): void {
    const speed = MonsterBrain.SPEED_WANDER * this.speedMul;
    this.followPath(dt, speed, MonsterBrain.TURN_RATE_WANDER, nav, events, simTime);

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.enterInvestigate();
    }
  }

  private stepAttack(dt: number): void {
    this.vel.x = 0;
    this.vel.z = 0;
    this.jawOpenT = 1.0;
    this.rearingT = 0.5;
    this.stateTimer -= dt;
  }

  private followPath(
    dt: number,
    targetSpeed: number,
    turnRate: number,
    nav: NavGrid,
    events: EventRingBuffer,
    simTime: number,
  ): void {
    if (this.currentPathIndex >= this.currentPath.length) {
      this.vel.x = 0;
      this.vel.z = 0;
      return;
    }

    let waypoint = this.currentPath[this.currentPathIndex]!;
    let dx = waypoint.x - this.pos.x;
    let dz = waypoint.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.6) {
      this.currentPathIndex++;
      if (this.currentPathIndex >= this.currentPath.length) {
        this.vel.x = 0;
        this.vel.z = 0;
        return;
      }
      waypoint = this.currentPath[this.currentPathIndex]!;
      dx = waypoint.x - this.pos.x;
      dz = waypoint.z - this.pos.z;
    }

    const targetYaw = Math.atan2(dx, -dz);
    this.yaw = this.steerTowards(this.yaw, targetYaw, turnRate * dt);

    const fwdX = Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);

    const nextX = this.pos.x + fwdX * targetSpeed * dt;
    const nextZ = this.pos.z + fwdZ * targetSpeed * dt;

    // Nav-walkability check before advancing
    if (nav.isWalkableWorld(nextX, nextZ)) {
      this.pos.x = nextX;
      this.pos.z = nextZ;
      this.vel.x = fwdX * targetSpeed;
      this.vel.z = fwdZ * targetSpeed;
    } else {
      // Minor sliding along tangent
      this.vel.x *= 0.5;
      this.vel.z *= 0.5;
    }

    // Footfall event emission at stride intervals
    events.pushFootfall(this.id, this.pos.x, this.pos.y, this.pos.z, targetSpeed / MonsterBrain.SPEED_HUNT, true, simTime);
  }

  private steerTowards(current: number, target: number, maxStep: number): number {
    let diff = (target - current) % (Math.PI * 2);
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > Math.PI) diff -= Math.PI * 2;

    const step = Math.max(-maxStep, Math.min(maxStep, diff));
    return current + step;
  }

  private pickNextWanderWaypoint(nav: NavGrid): void {
    const myComponent = nav.getComponentWorld(this.pos.x, this.pos.z);
    for (let attempts = 0; attempts < 16; attempts++) {
      const rx = this.rng.range(nav.minX + 4, nav.minX + nav.width * nav.cellSize - 4);
      const rz = this.rng.range(nav.minZ + 4, nav.minZ + nav.depth * nav.cellSize - 4);

      if (nav.isWalkableWorld(rx, rz) && nav.getComponentWorld(rx, rz) === myComponent) {
        const d = Math.hypot(rx - this.pos.x, rz - this.pos.z);
        if (d >= 12.0) {
          this.currentPath = this.astar.findPath(this.pos.x, this.pos.z, rx, rz);
          this.currentPathIndex = 0;
          return;
        }
      }
    }
  }
}

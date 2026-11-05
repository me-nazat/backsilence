/* ── AnomalyDirector.ts ───────────────────────────────────────────────────
 *  Pure, deterministic, serializable Anomaly Director for BackSilence.
 *  Schedules and regulates the three anomaly families:
 *  1. RISING WATER ("suddenly rising water")
 *  2. REALITY LOOPS ("reality-warping loops")
 *  3. SENSORY HALLUCINATIONS ("hallucinations that prey on your senses")
 *
 *  Fairness Laws:
 *  - Every anomaly telegraphed >= 5.0s (audio/visual cue before effect).
 *  - Zero direct anomaly damage (all deaths remain 100% noise-attributable).
 *  - Zero true acoustic events from hallucination decoys (lie is detectable by listening).
 *  - Loops escapable via 3s stillness or taking the water route.
 *  - Pure sim layer: zero DOM, Three.js, or Web Audio dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';
import { Rng } from './rng.js';
import { dHypot, dSin, dCos, D_TWO_PI } from './dmath.js';

export type AnomalyFamily = 'RISING_WATER' | 'REALITY_LOOP' | 'SENSORY_HALLUCINATION';

export type AnomalyStage = 'SCHEDULED' | 'TELEGRAPH' | 'ACTIVE' | 'DRAINING' | 'RESOLVED';

export interface BaseAnomalyDef {
  id: string;
  family: AnomalyFamily;
  scheduledTime: number;
  /** Invariant: must be >= 5.0 seconds */
  telegraphDuration: number;
  activeDuration: number;
}

export interface RisingWaterAnomalyDef extends BaseAnomalyDef {
  family: 'RISING_WATER';
  targetOffset: number; // +0.15 .. +0.40m
  climbDuration: number; // 30 .. 60s
  drainDuration: number; // 15 .. 25s
  zoneBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface PortalThreshold {
  center: Vec3;
  radius: number;
  targetPos: Vec3;
  yawOffset: number;
}

export interface RealityLoopAnomalyDef extends BaseAnomalyDef {
  family: 'REALITY_LOOP';
  portalA: PortalThreshold;
  portalB: PortalThreshold;
}

export interface SensoryHallucinationDef extends BaseAnomalyDef {
  family: 'SENSORY_HALLUCINATION';
  /** Distance must be >= 12.0m from player */
  minDecoyDistance: number;
  phantomDripOffset: Vec3;
  wallTextFlicker: string;
}

export type AnomalyDef = RisingWaterAnomalyDef | RealityLoopAnomalyDef | SensoryHallucinationDef;

export interface AnomalyRelocation {
  targetPos: Vec3;
  yawOffset: number;
}

export interface AnomalyDirectorSnapshot {
  seed: number;
  simTime: number;
  currentAnomalyIndex: number;
  stage: AnomalyStage;
  stageTimer: number;
  activeWaterOffset: number;
  stillnessTimer: number;
  loopsEscapedTotal: number;
  waterAnomaliesSurvived: number;
  hallucinationsDismissed: number;
  activeDecoyPos: Vec3 | null;
  activeDripPos: Vec3 | null;
  wallTextActive: boolean;
}

export interface AnomalyDirectorOptions {
  seed: number;
  customSchedule?: AnomalyDef[];
  minTelegraphSeconds?: number;
  enabledFamilies?: AnomalyFamily[];
}

export class AnomalyDirector {
  readonly seed: number;
  private readonly rng: Rng;
  private simTime = 0;

  private schedule: AnomalyDef[] = [];
  private currentAnomalyIndex = -1;
  private activeDef: AnomalyDef | null = null;
  private stage: AnomalyStage = 'SCHEDULED';
  private stageTimer = 0;

  // Water level offset produced by Rising Water anomalies
  private activeWaterOffset = 0;

  // Reality loop state
  private stillnessTimer = 0;
  private pendingRelocation: AnomalyRelocation | null = null;
  private portalCooldownTimer = 0;

  // Hallucination state
  private activeDecoyPos: Vec3 | null = null;
  private activeDripPos: Vec3 | null = null;
  private wallTextActive = false;

  // Stats / achievements
  private loopsEscapedTotal = 0;
  private waterAnomaliesSurvived = 0;
  private hallucinationsDismissed = 0;

  constructor(options: AnomalyDirectorOptions) {
    this.seed = options.seed;
    this.rng = new Rng(options.seed);

    if (options.customSchedule) {
      this.schedule = options.customSchedule.map((def) => {
        // Enforce the >= 5.0s telegraph law
        const safeTelegraph = Math.max(5.0, def.telegraphDuration);
        return { ...def, telegraphDuration: safeTelegraph };
      });
    } else {
      this.generateDefaultSchedule(options.enabledFamilies);
    }
  }

  private generateDefaultSchedule(enabled?: AnomalyFamily[]): void {
    const families: AnomalyFamily[] = enabled ?? [
      'RISING_WATER',
      'REALITY_LOOP',
      'SENSORY_HALLUCINATION',
    ];
    if (families.length === 0) return;

    // Schedule 3 to 6 events deterministically across a typical 3–6 min session
    const eventCount = this.rng.int(4, 6);
    let nextTime = this.rng.range(22.0, 31.0);

    for (let i = 0; i < eventCount; i++) {
      const family = families[i % families.length];
      const telegraphDuration = 6.0; // strictly >= 5.0s

      if (family === 'RISING_WATER') {
        const climbDuration = this.rng.range(35.0, 50.0);
        const drainDuration = 18.0;
        const targetOffset = this.rng.range(0.20, 0.35); // +0.20 .. +0.35m
        this.schedule.push({
          id: `anomaly_rising_water_${i}`,
          family: 'RISING_WATER',
          scheduledTime: nextTime,
          telegraphDuration,
          activeDuration: climbDuration + 15.0,
          climbDuration,
          drainDuration,
          targetOffset,
        });
        nextTime += telegraphDuration + climbDuration + drainDuration + 25.0;
      } else if (family === 'REALITY_LOOP') {
        const activeDuration = this.rng.range(25.0, 39.0);
        this.schedule.push({
          id: `anomaly_loop_${i}`,
          family: 'REALITY_LOOP',
          scheduledTime: nextTime,
          telegraphDuration,
          activeDuration,
          portalA: {
            center: { x: 0.0, y: 0.38, z: 28.0 },
            radius: 2.2,
            targetPos: { x: 0.0, y: 0.38, z: 42.0 },
            yawOffset: 0.0,
          },
          portalB: {
            center: { x: 0.0, y: 0.38, z: 42.0 },
            radius: 2.2,
            targetPos: { x: 0.0, y: 0.38, z: 28.0 },
            yawOffset: 0.0,
          },
        });
        nextTime += telegraphDuration + activeDuration + 30.0;
      } else if (family === 'SENSORY_HALLUCINATION') {
        const activeDuration = this.rng.range(18.0, 25.0);
        this.schedule.push({
          id: `anomaly_hallucination_${i}`,
          family: 'SENSORY_HALLUCINATION',
          scheduledTime: nextTime,
          telegraphDuration,
          activeDuration,
          minDecoyDistance: 13.5, // strictly >= 12.0m
          phantomDripOffset: { x: -8.0, y: 0.38, z: 12.0 },
          wallTextFlicker: 'IT HEARS YOU',
        });
        nextTime += telegraphDuration + activeDuration + 25.0;
      }
    }
  }

  resetOnRetry(): void {
    this.simTime = 0;
    this.currentAnomalyIndex = -1;
    this.activeDef = null;
    this.stage = 'SCHEDULED';
    this.stageTimer = 0;
    this.activeWaterOffset = 0;
    this.stillnessTimer = 0;
    this.pendingRelocation = null;
    this.portalCooldownTimer = 0;
    this.activeDecoyPos = null;
    this.activeDripPos = null;
    this.wallTextActive = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step & Pacing Evaluation
  // ──────────────────────────────────────────────────────────────────────────

  step(
    dt: number,
    playerPos: Vec3,
    playerOnGround: boolean,
    currentWaterY: number,
    playerVel?: Vec3,
  ): void {
    this.simTime += dt;
    this.pendingRelocation = null;
    if (this.portalCooldownTimer > 0) {
      this.portalCooldownTimer = Math.max(0, this.portalCooldownTimer - dt);
    }

    // 1. Advance to next scheduled event if idle
    if (!this.activeDef) {
      for (let i = 0; i < this.schedule.length; i++) {
        const def = this.schedule[i];
        if (!def) continue;
        if (this.simTime >= def.scheduledTime && this.currentAnomalyIndex < i) {
          this.currentAnomalyIndex = i;
          this.activeDef = def;
          this.stage = 'TELEGRAPH';
          this.stageTimer = Math.max(0, this.simTime - def.scheduledTime);
          this.stillnessTimer = 0;
          break;
        }
      }
    } else {
      this.stageTimer += dt;
    }

    if (!this.activeDef) return;

    // 2. Stage transitions
    if (this.stage === 'TELEGRAPH') {
      if (this.stageTimer >= this.activeDef.telegraphDuration) {
        this.stage = 'ACTIVE';
        const excess = this.stageTimer - this.activeDef.telegraphDuration;
        this.stageTimer = excess;
        this.onEnterActive(playerPos);
        this.stepActive(excess, playerPos, playerOnGround, currentWaterY, playerVel);
      }
      return;
    }

    if (this.stage === 'ACTIVE') {
      this.stepActive(dt, playerPos, playerOnGround, currentWaterY, playerVel);
      return;
    }

    if (this.stage === 'DRAINING') {
      if (this.activeDef.family === 'RISING_WATER') {
        const rw = this.activeDef;
        const progress = Math.min(1.0, this.stageTimer / rw.drainDuration);
        this.activeWaterOffset = rw.targetOffset * (1.0 - progress);

        if (this.stageTimer >= rw.drainDuration) {
          this.activeWaterOffset = 0;
          this.stage = 'RESOLVED';
          this.waterAnomaliesSurvived++;
          this.activeDef = null;
        }
      }
    }
  }

  private onEnterActive(playerPos: Vec3): void {
    if (!this.activeDef) return;

    if (this.activeDef.family === 'SENSORY_HALLUCINATION') {
      const sh = this.activeDef;
      // Position decoy >= 12.0m away from player in a plausible direction
      const angle = this.rng.range(0, D_TWO_PI);
      const dist = Math.max(12.5, sh.minDecoyDistance);
      this.activeDecoyPos = {
        x: playerPos.x + dSin(angle) * dist,
        y: playerPos.y,
        z: playerPos.z + dCos(angle) * dist,
      };
      this.activeDripPos = {
        x: playerPos.x - dCos(angle) * (dist * 0.7),
        y: playerPos.y,
        z: playerPos.z + dSin(angle) * (dist * 0.7),
      };
      this.wallTextActive = true;
    }
  }

  private stepActive(
    dt: number,
    playerPos: Vec3,
    _playerOnGround: boolean,
    currentWaterY: number,
    playerVel?: Vec3,
  ): void {
    if (!this.activeDef) return;

    // 1. RISING WATER
    if (this.activeDef.family === 'RISING_WATER') {
      const rw = this.activeDef;
      const climbProgress = Math.min(1.0, this.stageTimer / rw.climbDuration);
      // Smooth climb
      const smooth = climbProgress * climbProgress * (3.0 - 2.0 * climbProgress);
      this.activeWaterOffset = rw.targetOffset * smooth;

      if (this.stageTimer >= rw.activeDuration) {
        this.stage = 'DRAINING';
        this.stageTimer = 0;
      }
      return;
    }

    // 2. REALITY LOOP
    if (this.activeDef.family === 'REALITY_LOOP') {
      const loop = this.activeDef;

      // Escape 1: Standing still for >= 3.0 seconds allows the world to "settle"
      const speed = playerVel ? dHypot(playerVel.x, playerVel.z) : 0;
      if (speed < 0.12) {
        this.stillnessTimer += dt;
        if (this.stillnessTimer >= 3.0) {
          this.stage = 'RESOLVED';
          this.loopsEscapedTotal++;
          this.activeDef = null;
          return;
        }
      } else {
        this.stillnessTimer = Math.max(0, this.stillnessTimer - dt * 2.0);
      }

      // Escape 2: Loops never loop across water. If player enters water, loop collapses.
      const playerInWater = playerPos.y < currentWaterY + 0.1;
      if (playerInWater) {
        this.stage = 'RESOLVED';
        this.loopsEscapedTotal++;
        this.activeDef = null;
        return;
      }

      // Portal relocation logic
      if (this.portalCooldownTimer <= 0) {
        const distA = dHypot(playerPos.x - loop.portalA.center.x, playerPos.z - loop.portalA.center.z);
        if (distA <= loop.portalA.radius) {
          this.pendingRelocation = {
            targetPos: { ...loop.portalA.targetPos },
            yawOffset: loop.portalA.yawOffset,
          };
          this.portalCooldownTimer = 1.2; // brief threshold buffer
          return;
        }

        const distB = dHypot(playerPos.x - loop.portalB.center.x, playerPos.z - loop.portalB.center.z);
        if (distB <= loop.portalB.radius) {
          this.pendingRelocation = {
            targetPos: { ...loop.portalB.targetPos },
            yawOffset: loop.portalB.yawOffset,
          };
          this.portalCooldownTimer = 1.2;
          return;
        }
      }

      if (this.stageTimer >= loop.activeDuration) {
        this.stage = 'RESOLVED';
        this.loopsEscapedTotal++;
        this.activeDef = null;
      }
      return;
    }

    // 3. SENSORY HALLUCINATION
    if (this.activeDef.family === 'SENSORY_HALLUCINATION') {
      const sh = this.activeDef;

      // Keep decoy strictly >= 12.0m away (retreat if player approaches)
      if (this.activeDecoyPos) {
        const dist = dHypot(playerPos.x - this.activeDecoyPos.x, playerPos.z - this.activeDecoyPos.z);
        if (dist < 12.0) {
          // Push decoy outward to preserve the >= 12m illusion law
          const dx = (this.activeDecoyPos.x - playerPos.x) / (dist || 1);
          const dz = (this.activeDecoyPos.z - playerPos.z) / (dist || 1);
          this.activeDecoyPos.x = playerPos.x + dx * 12.5;
          this.activeDecoyPos.z = playerPos.z + dz * 12.5;
        }
      }

      if (this.stageTimer >= sh.activeDuration) {
        this.stage = 'RESOLVED';
        this.activeDecoyPos = null;
        this.activeDripPos = null;
        this.wallTextActive = false;
        this.hallucinationsDismissed++;
        this.activeDef = null;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public Accessors & Invariant Checkers
  // ──────────────────────────────────────────────────────────────────────────

  get currentAnomaly(): AnomalyDef | null {
    return this.activeDef;
  }

  get currentStage(): AnomalyStage {
    return this.stage;
  }

  get currentStageTimer(): number {
    return this.stageTimer;
  }

  get waterOffset(): number {
    return this.activeWaterOffset;
  }

  get relocation(): AnomalyRelocation | null {
    return this.pendingRelocation;
  }

  get decoyPos(): Vec3 | null {
    return this.activeDecoyPos;
  }

  get phantomDripPos(): Vec3 | null {
    return this.activeDripPos;
  }

  get isWallTextActive(): boolean {
    return this.wallTextActive;
  }

  get isTelegraphActive(): boolean {
    return this.stage === 'TELEGRAPH';
  }

  get isEffectActive(): boolean {
    return this.stage === 'ACTIVE' || this.stage === 'DRAINING';
  }

  get stats() {
    return {
      loopsEscapedTotal: this.loopsEscapedTotal,
      waterAnomaliesSurvived: this.waterAnomaliesSurvived,
      hallucinationsDismissed: this.hallucinationsDismissed,
      totalSurvived:
        this.loopsEscapedTotal +
        this.waterAnomaliesSurvived +
        this.hallucinationsDismissed,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Serialization & Hydration
  // ──────────────────────────────────────────────────────────────────────────

  snapshot(): AnomalyDirectorSnapshot {
    return {
      seed: this.seed,
      simTime: this.simTime,
      currentAnomalyIndex: this.currentAnomalyIndex,
      stage: this.stage,
      stageTimer: this.stageTimer,
      activeWaterOffset: this.activeWaterOffset,
      stillnessTimer: this.stillnessTimer,
      loopsEscapedTotal: this.loopsEscapedTotal,
      waterAnomaliesSurvived: this.waterAnomaliesSurvived,
      hallucinationsDismissed: this.hallucinationsDismissed,
      activeDecoyPos: this.activeDecoyPos ? { ...this.activeDecoyPos } : null,
      activeDripPos: this.activeDripPos ? { ...this.activeDripPos } : null,
      wallTextActive: this.wallTextActive,
    };
  }

  hydrate(snap: AnomalyDirectorSnapshot): void {
    this.simTime = snap.simTime;
    this.currentAnomalyIndex = snap.currentAnomalyIndex;
    this.stage = snap.stage;
    this.stageTimer = snap.stageTimer;
    this.activeWaterOffset = snap.activeWaterOffset;
    this.stillnessTimer = snap.stillnessTimer;
    this.loopsEscapedTotal = snap.loopsEscapedTotal;
    this.waterAnomaliesSurvived = snap.waterAnomaliesSurvived;
    this.hallucinationsDismissed = snap.hallucinationsDismissed;
    this.activeDecoyPos = snap.activeDecoyPos ? { ...snap.activeDecoyPos } : null;
    this.activeDripPos = snap.activeDripPos ? { ...snap.activeDripPos } : null;
    this.wallTextActive = snap.wallTextActive;

    if (this.currentAnomalyIndex >= 0 && this.currentAnomalyIndex < this.schedule.length) {
      this.activeDef = this.schedule[this.currentAnomalyIndex] ?? null;
    } else {
      this.activeDef = null;
    }
  }
}

/* ── SimWorld.ts ───────────────────────────────────────────────────────────
 *  Container managing the pure 60Hz deterministic simulation.
 *  Owns terrain, colliders, navigation, player physics, monsters, dynamic water,
 *  and the event queue. Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, NoiseKind, PlayerId } from '../types/contracts.js';
import { GroundGrid, type GridBounds } from './GroundGrid.js';
import { ColliderSet } from './Colliders.js';
import { NavGrid } from './NavGrid.js';
import { PlayerMotor, type PlayerIntent, type PlayerMotorState } from './PlayerMotor.js';
import { MonsterBrain, type MonsterDef, type MonsterSnapshot } from './MonsterBrain.js';
import { EventRingBuffer, type SimEvent } from './Events.js';
import type { HearingContext } from './Hearing.js';
import type { WaterLevelProvider } from './WaterLevelCycle.js';

export interface SimWorldConfig {
  bounds: GridBounds;
  playerSpawn: Vec3;
  waterY: number;
  waterLevelProvider?: WaterLevelProvider | undefined;
  discreteWaterLevels?: number[] | undefined;
  difficulty?: ('whisper' | 'normal' | 'deafening') | undefined;
  ground?: GroundGrid | undefined;
  colliders?: ColliderSet | undefined;
  mode?: ('solo' | 'host' | 'replica') | undefined;
}

export class SimWorld {
  mode: 'solo' | 'host' | 'replica' = 'solo';
  readonly ground: GroundGrid;
  readonly colliders: ColliderSet;
  nav: NavGrid;
  readonly events: EventRingBuffer;
  readonly player: PlayerMotor;
  readonly monsters: MonsterBrain[] = [];

  readonly baseWaterY: number;
  currentWaterY: number;
  waterLevelProvider?: WaterLevelProvider | undefined;
  readonly discreteWaterLevels: number[] = [];
  readonly navGridsByLevel = new Map<number, NavGrid>();

  hearingCtx: HearingContext;
  simTime = 0;

  constructor(config: SimWorldConfig) {
    this.baseWaterY = config.waterY;
    this.currentWaterY = config.waterY;
    if (config.waterLevelProvider !== undefined) {
      this.waterLevelProvider = config.waterLevelProvider;
    }
    if (config.discreteWaterLevels) {
      this.discreteWaterLevels = [...config.discreteWaterLevels].sort((a, b) => a - b);
    }

    if (config.mode !== undefined) {
      this.mode = config.mode;
    }

    this.ground = config.ground ?? new GroundGrid(config.bounds, 0.25);
    this.colliders = config.colliders ?? new ColliderSet(4.0);
    this.events = new EventRingBuffer(256);

    const diff = config.difficulty ?? 'normal';
    const diffHearing = diff === 'whisper' ? 0.75 : diff === 'deafening' ? 1.3 : 1.0;
    this.hearingCtx = { difficultyHearing: diffHearing };

    // Player motor
    this.player = new PlayerMotor('player_local', config.playerSpawn);

    // Initial dummy nav grid, rebuilt after terrain is populated
    this.nav = new NavGrid(this.ground, this.currentWaterY, 0.5);
  }

  get waterY(): number {
    return this.currentWaterY;
  }

  get bounds(): GridBounds {
    return this.ground.bounds;
  }

  broadcastNoise(noise: {
    kind: NoiseKind;
    position: Vec3;
    loudness: number;
    t?: number;
    sourcePlayerId?: PlayerId | 'world';
  }): void {
    const t = noise.t ?? this.simTime;
    const id = `world_noise_${t}_${Math.random()}`;
    this.events.pushNoise(
      id,
      noise.kind,
      noise.position.x,
      noise.position.y,
      noise.position.z,
      noise.loudness,
      noise.sourcePlayerId ?? 'world',
      t,
    );
  }

  getTime(): number {
    return this.simTime;
  }

  /**
   * Finalize terrain generation: compute distance transform and build nav grids.
   */
  finalizeTerrain(): void {
    this.ground.computeDistanceTransform(this.baseWaterY);

    if (this.discreteWaterLevels.length > 0) {
      for (const level of this.discreteWaterLevels) {
        const grid = new NavGrid(this.ground, level, 0.5);
        this.navGridsByLevel.set(level, grid);
      }
      this.updateActiveNavGrid();
    } else {
      this.nav = new NavGrid(this.ground, this.baseWaterY, 0.5);
    }
  }

  private updateActiveNavGrid(): void {
    if (this.discreteWaterLevels.length === 0) return;

    // Pick closest discrete level based on transition midpoints
    let bestLevel = this.discreteWaterLevels[0]!;
    let minDiff = Math.abs(this.currentWaterY - bestLevel);

    for (let i = 1; i < this.discreteWaterLevels.length; i++) {
      const lvl = this.discreteWaterLevels[i]!;
      const diff = Math.abs(this.currentWaterY - lvl);
      if (diff < minDiff) {
        minDiff = diff;
        bestLevel = lvl;
      }
    }

    const grid = this.navGridsByLevel.get(bestLevel);
    if (grid && grid !== this.nav) {
      this.nav = grid;
    }
  }

  addMonster(def: MonsterDef, seed?: number): MonsterBrain {
    const brain = new MonsterBrain(def, this.nav, seed ?? 42);
    this.monsters.push(brain);
    return brain;
  }

  step(dt: number, intent: PlayerIntent): void {
    this.simTime += dt;

    // 0. Update dynamic water level and nav grid
    if (this.waterLevelProvider) {
      this.currentWaterY = this.waterLevelProvider.levelAt(this.simTime);
      this.updateActiveNavGrid();
    }

    // 1. Step Player Motor
    this.player.step(
      dt,
      intent,
      this.ground,
      this.colliders,
      this.events,
      this.simTime,
      this.currentWaterY,
    );

    // 2. Broadcast pending noise events emitted in this step to all monsters
    this.events.peek((ev: SimEvent) => {
      if (ev.type === 'noise' && ev.data.t >= this.simTime - dt * 1.1) {
        for (let m = 0; m < this.monsters.length; m++) {
          this.monsters[m]!.onNoiseEvent(
            ev.data,
            this.colliders,
            this.hearingCtx,
            this.simTime,
          );
        }
      }
    });

    // 3. Step all monsters with current nav grid (host & solo only)
    if (this.mode !== 'replica') {
      for (let m = 0; m < this.monsters.length; m++) {
        this.monsters[m]!.step(
          dt,
          this.player.pos,
          this.nav,
          this.colliders,
          this.events,
          this.hearingCtx,
          this.simTime,
        );
      }
    }
  }

  getPlayerState(): PlayerMotorState {
    return this.player.getState();
  }

  getMonsterSnapshots(): MonsterSnapshot[] {
    return this.monsters.map((m) => m.getSnapshot());
  }
}

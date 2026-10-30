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
import { EventRingBuffer } from './Events.js';
import type { HearingContext } from './Hearing.js';
import type { WaterLevelProvider } from './WaterLevelCycle.js';
import { DEFAULT_WORLD_PROFILE, type WorldProfile } from './WorldProfile.js';
import { PerchSystem } from './PerchSystem.js';
import type { FlowField } from './FlowField.js';
import type { WeatherSystem } from './Weather.js';
import type { GhostTrain } from './GhostTrain.js';
import type { Drone } from './Drone.js';
import { Rng } from './rng.js';
import { EncounterDirector, type DirectorDifficulty } from './Director.js';

export interface SimWorldConfig {
  /** Seed shared by every authoritative simulation participant. */
  seed: number;
  bounds: GridBounds;
  playerSpawn: Vec3;
  waterY: number;
  waterLevelProvider?: WaterLevelProvider | undefined;
  discreteWaterLevels?: number[] | undefined;
  difficulty?: DirectorDifficulty | undefined;
  director?: EncounterDirector | undefined;
  ground?: GroundGrid | undefined;
  colliders?: ColliderSet | undefined;
  mode?: ('solo' | 'host' | 'replica') | undefined;
  worldProfile?: WorldProfile | undefined;
  perchSystem?: PerchSystem | undefined;
  flowField?: FlowField | undefined;
  weather?: WeatherSystem | undefined;
  ghostTrain?: GhostTrain | undefined;
  drones?: Drone[] | undefined;
  mapId?: string | undefined;
}

export class SimWorld {
  readonly seed: number;
  readonly rng: Rng;
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

  readonly worldProfile: WorldProfile;
  readonly perchSystem: PerchSystem;
  flowField?: FlowField | undefined;
  weather?: WeatherSystem | undefined;
  ghostTrain?: GhostTrain | undefined;
  readonly drones: Drone[] = [];

  readonly director: EncounterDirector;
  readonly difficulty: DirectorDifficulty;
  readonly mapId?: string | undefined;
  objectivesDone = 0;

  hearingCtx: HearingContext;
  simTime = 0;
  private noiseSequence = 0;

  constructor(config: SimWorldConfig) {
    this.seed = config.seed;
    this.rng = new Rng(config.seed);
    const diff = config.difficulty ?? 'normal';
    this.difficulty = diff;
    this.mapId = config.mapId;
    this.director = config.director ?? new EncounterDirector(config.seed, diff);
    if (config.mapId) {
      this.director.setMapId(config.mapId);
    }
    this.baseWaterY = config.waterY;
    this.currentWaterY = config.waterY;
    this.worldProfile = config.worldProfile ?? DEFAULT_WORLD_PROFILE;
    this.perchSystem = config.perchSystem ?? new PerchSystem();

    if (config.flowField !== undefined) this.flowField = config.flowField;
    if (config.weather !== undefined) this.weather = config.weather;
    if (config.ghostTrain !== undefined) this.ghostTrain = config.ghostTrain;
    if (config.drones !== undefined) this.drones.push(...config.drones);

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
    if (!config.ground) {
      this.ground.fill(this.baseWaterY - 1.5);
    }
    this.ground.registerDynamicTop(this.perchSystem);
    this.colliders = config.colliders ?? new ColliderSet(4.0);
    this.events = new EventRingBuffer(256);

    const diffHearing = this.difficulty === 'whisper' ? 0.75 : this.difficulty === 'deafening' ? 1.3 : 1.0;
    this.hearingCtx = {
      difficultyHearing: diffHearing,
      maskFactor: (pos: Vec3) => {
        let mask = 1.0;
        if (this.flowField) {
          mask = Math.min(mask, this.flowField.maskAt(pos.x, pos.z));
        }
        if (this.weather) {
          mask = Math.min(mask, this.weather.maskFactorAt(this.simTime));
        }
        if (this.ghostTrain) {
          mask = Math.min(mask, this.ghostTrain.getPhaseAtTime(this.simTime).maskFactor);
        }
        return mask;
      },
    };

    // Player motor
    this.player = new PlayerMotor('player_local', config.playerSpawn);

    // Initial dummy nav grid, rebuilt after terrain is populated
    this.nav = new NavGrid(this.ground, this.currentWaterY, 0.5, this.worldProfile);
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
    const id = `world_noise_${this.seed}_${this.noiseSequence++}_${Math.round(t * 60)}`;
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
    this.director.recordNoise({
      id,
      kind: noise.kind,
      position: { ...noise.position },
      loudness: noise.loudness,
      sourcePlayerId: noise.sourcePlayerId ?? 'world',
      t,
    });
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
        const grid = new NavGrid(this.ground, level, 0.5, this.worldProfile);
        this.navGridsByLevel.set(level, grid);
      }
      this.updateActiveNavGrid();
    } else {
      this.nav = new NavGrid(this.ground, this.baseWaterY, 0.5, this.worldProfile);
      for (const m of this.monsters) {
        m.setNav(this.nav);
      }
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
      for (const m of this.monsters) {
        m.setNav(this.nav);
      }
    }
  }

  addMonster(def: MonsterDef, seed?: number): MonsterBrain {
    let spawnPos = def.spawn;
    if ((this.difficulty === 'normal' || this.difficulty === 'whisper') && def.sleeperSpawn) {
      if (this.nav.isWalkableWorld(def.sleeperSpawn.x, def.sleeperSpawn.z)) {
        spawnPos = def.sleeperSpawn;
      } else {
        console.warn(`[SpawnRepair] ${def.id} sleeperSpawn (${def.sleeperSpawn.x}, ${def.sleeperSpawn.z}) not walkable, falling back to spawn`);
        if (this.nav.isWalkableWorld(def.spawn.x, def.spawn.z)) {
          spawnPos = def.spawn;
        } else {
          const fixed = this.nav.findNearestWalkable(def.sleeperSpawn.x, def.sleeperSpawn.z, 18.0) ??
                        this.nav.findNearestWalkable(def.spawn.x, def.spawn.z, 18.0);
          if (fixed) {
            spawnPos = { x: fixed.x, y: def.spawn.y, z: fixed.z };
            console.warn(`[SpawnRepair] ${def.id} spawn repaired to (${fixed.x.toFixed(1)}, ${fixed.z.toFixed(1)})`);
          } else {
            console.error(`[SpawnRepair] ${def.id} has no walkable water within 18m`);
          }
        }
      }
    } else if (this.mapId && !this.nav.isWalkableWorld(spawnPos.x, spawnPos.z)) {
      const fixed = this.nav.findNearestWalkable(spawnPos.x, spawnPos.z, 18.0);
      if (fixed) {
        spawnPos = { x: fixed.x, y: spawnPos.y, z: fixed.z };
        console.warn(`[SpawnRepair] ${def.id} spawn repaired to (${fixed.x.toFixed(1)}, ${fixed.z.toFixed(1)})`);
      } else {
        console.error(`[SpawnRepair] ${def.id} has no walkable water within 18m`);
      }
    }

    const finalDef: MonsterDef = { ...def, spawn: spawnPos };
    const brain = new MonsterBrain(finalDef, this.nav, seed ?? 42);
    if (this.mapId && !this.nav.isWalkableWorld(brain.pos.x, brain.pos.z)) {
      const fixed = this.nav.findNearestWalkable(brain.pos.x, brain.pos.z, 18.0);
      if (fixed) {
        brain.pos.x = fixed.x;
        brain.pos.z = fixed.z;
        console.warn(`[SpawnRepair] ${brain.id} spawn was not walkable; moved to ${fixed.x.toFixed(1)},${fixed.z.toFixed(1)}`);
      } else {
        console.error(`[SpawnRepair] ${brain.id} has no walkable water within 18m — map layout is invalid`);
      }
    }
    this.monsters.push(brain);
    return brain;
  }

  resetOnRetry(playerSpawn: Vec3): void {
    this.simTime = 0;
    this.noiseSequence = 0;
    this.director.resetOnRetry(0);

    for (const monster of this.monsters) {
      const distantCell = this.nav.findDistantCell(playerSpawn.x, playerSpawn.z, 60.0);
      if (distantCell) {
        monster.pos.x = distantCell.x;
        monster.pos.z = distantCell.z;
        monster.pos.y = this.currentWaterY;
      }
      monster.vel.x = 0;
      monster.vel.y = 0;
      monster.vel.z = 0;
      monster.forceState('DORMANT', { stateTimer: 8.0 });
    }
  }

  step(dt: number, intent: PlayerIntent): void {
    this.simTime += dt;

    // 0. Update dynamic water level and nav grid
    if (this.waterLevelProvider) {
      this.currentWaterY = this.waterLevelProvider.levelAt(this.simTime);
      this.updateActiveNavGrid();
    }

    // 0.1 Update Perch System
    this.perchSystem.step(
      dt,
      this.player.pos,
      this.player.onGround,
      this.currentWaterY,
      this.events,
      this.simTime,
    );

    // 0.2 Check if player is perched
    const isPerched =
      this.worldProfile.perchImmunity &&
      this.perchSystem.isPlayerPerched(
        this.player.pos,
        this.player.onGround,
        this.currentWaterY,
      );

    // 0.3 Update Ghost Train
    if (this.ghostTrain) {
      const trainResult = this.ghostTrain.step(
        dt,
        this.simTime,
        this.player.pos,
        this.monsters,
        this.events,
      );
      if (trainResult.playerKilled) {
        this.events.pushDamage('player', 'ghost_train', 100, this.simTime);
      }
    }

    // 0.4 Step Drones
    for (let d = 0; d < this.drones.length; d++) {
      this.drones[d]!.step(
        dt,
        this.player.pos,
        intent.crouch,
        this.colliders,
        [],
        this.events,
        this.simTime,
      );
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
      this.worldProfile,
      this.perchSystem,
      this.flowField,
    );

    // 2. Broadcast pending noise events emitted in this step to all monsters
    const evCount = this.events.length;
    for (let i = 0; i < evCount; i++) {
      const ev = this.events.getAt(i);
      if (ev && ev.type === 'noise' && ev.data.t >= this.simTime - dt * 1.1) {
        for (let m = 0; m < this.monsters.length; m++) {
          this.monsters[m]!.onNoiseEvent(
            ev.data,
            this.colliders,
            this.hearingCtx,
            this.simTime,
          );
        }
      }
    }

    // 2.5. Step Encounter Director (host & solo only)
    if (this.mode !== 'replica') {
      this.director.updatePlayer(
        this.player.playerId,
        this.player.pos,
        this.player.onGround,
        isPerched,
        this.player.isWading,
        this.player.yaw,
      );
      this.director.step(dt, this.monsters, this.nav, this.objectivesDone);
      // Note: dreadBeats are presentation cues for GameSession (audio, VHS, flock),
      // and do not inject player noise events into the simulation.
    }

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
          isPerched,
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

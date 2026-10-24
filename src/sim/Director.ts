/* ── Director.ts ─────────────────────────────────────────────────────────────
 *  Pure, deterministic, host-authoritative Encounter Director.
 *  Regulates pacing, first contact, pressure clock, stillness tax, and breathers.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, PlayerId, NoiseEvent } from '../types/contracts.js';
import type { MonsterBrain } from './MonsterBrain.js';
import type { NavGrid } from './NavGrid.js';
import { Rng } from './rng.js';
import { dHypot, dSin, dCos, D_PI, D_HALF_PI } from './dmath.js';
import balanceData from './balance.json';

export type DirectorDifficulty = 'whisper' | 'normal' | 'deafening' | 'nightmare';

export interface DreadBeat {
  kind: 'first_contact' | 'sweep' | 'listening' | 'ambient_far' | 'flock_arrival' | 'breather';
  position: Vec3;
  t: number;
}

export interface PlayerTrack {
  id: PlayerId;
  pos: Vec3;
  anchorPos: Vec3;
  stillnessTime: number;
  stillnessSweepDone: boolean;
  stillnessListenDone: boolean;
  noiseAcc: number;
  isPerched: boolean;
  onGround: boolean;
}

export interface DirectorSnapshot {
  simTime: number;
  firstContactDone: boolean;
  firstContactScheduledTime: number;
  lastThreatBeatTime: number;
  breatherTimer: number;
  deathTimestamps: number[];
  assistOfferPending: boolean;
  activeSweepTimer: number;
  currentPhase: 'prowl' | 'closing' | 'hunt';
}

export class EncounterDirector {
  readonly seed: number;
  private readonly rng: Rng;
  readonly difficulty: DirectorDifficulty;

  private simTime = 0;
  private firstContactDone = false;
  private firstContactScheduledTime: number;
  private lastThreatBeatTime = 0;
  private breatherTimer = 0;
  private deathTimestamps: number[] = [];
  private assistOfferPending = false;
  private activeSweepTimer = 25.0; // initial delay before sweeps in closing phase
  private listeningActive = false;

  readonly dreadBeats: DreadBeat[] = [];
  private readonly playerTracks = new Map<PlayerId, PlayerTrack>();

  constructor(seed = 4242, difficulty: DirectorDifficulty = 'normal') {
    this.seed = seed;
    this.rng = new Rng(seed ^ 0x9e3779b9);
    this.difficulty = difficulty;

    const diffCfg = balanceData.difficulty[difficulty] ?? balanceData.difficulty.normal;
    this.firstContactScheduledTime = this.rng.range(diffCfg.firstContactMin, diffCfg.firstContactMax);
  }

  getSnapshot(): DirectorSnapshot {
    return {
      simTime: this.simTime,
      firstContactDone: this.firstContactDone,
      firstContactScheduledTime: this.firstContactScheduledTime,
      lastThreatBeatTime: this.lastThreatBeatTime,
      breatherTimer: this.breatherTimer,
      deathTimestamps: [...this.deathTimestamps],
      assistOfferPending: this.assistOfferPending,
      activeSweepTimer: this.activeSweepTimer,
      currentPhase: this.getCurrentPhase(0),
    };
  }

  hydrate(snap: DirectorSnapshot): void {
    this.simTime = snap.simTime;
    this.firstContactDone = snap.firstContactDone;
    this.firstContactScheduledTime = snap.firstContactScheduledTime;
    this.lastThreatBeatTime = snap.lastThreatBeatTime;
    this.breatherTimer = snap.breatherTimer;
    this.deathTimestamps = [...snap.deathTimestamps];
    this.assistOfferPending = snap.assistOfferPending;
    this.activeSweepTimer = snap.activeSweepTimer;
  }

  getCurrentPhase(objectivesDone = 0): 'prowl' | 'closing' | 'hunt' {
    if (this.simTime >= 300 || objectivesDone >= 2) return 'hunt';
    if (this.simTime >= 120) return 'closing';
    return 'prowl';
  }

  updatePlayer(id: PlayerId, pos: Vec3, onGround: boolean, isPerched: boolean): void {
    let track = this.playerTracks.get(id);
    if (!track) {
      track = {
        id,
        pos: { ...pos },
        anchorPos: { ...pos },
        stillnessTime: 0,
        stillnessSweepDone: false,
        stillnessListenDone: false,
        noiseAcc: 0,
        isPerched,
        onGround,
      };
      this.playerTracks.set(id, track);
      return;
    }

    track.pos.x = pos.x;
    track.pos.y = pos.y;
    track.pos.z = pos.z;
    track.onGround = onGround;
    track.isPerched = isPerched;

    const distFromAnchor = dHypot(pos.x - track.anchorPos.x, pos.z - track.anchorPos.z);
    if (distFromAnchor > 4.0) {
      track.anchorPos.x = pos.x;
      track.anchorPos.y = pos.y;
      track.anchorPos.z = pos.z;
      track.stillnessTime = 0;
      track.stillnessSweepDone = false;
      track.stillnessListenDone = false;
    }
  }

  recordNoise(noise: NoiseEvent): void {
    if (noise.sourcePlayerId && noise.sourcePlayerId !== 'world') {
      const track = this.playerTracks.get(noise.sourcePlayerId);
      if (track) {
        track.noiseAcc += noise.loudness;
      }
    }
  }

  recordPlayerDeath(monster: MonsterBrain, nav: NavGrid): void {
    this.deathTimestamps.push(this.simTime);
    // Prune deaths older than 5 minutes (300s)
    this.deathTimestamps = this.deathTimestamps.filter((t) => this.simTime - t <= 300.0);
    if (this.deathTimestamps.length >= 2) {
      this.assistOfferPending = true;
    }

    // Mercy: Respawn monster >= 60m away with 10s grace
    const playerTrack = this.getPrimaryTarget();
    const pPos = playerTrack ? playerTrack.pos : { x: 0, y: 0, z: 0 };
    const myComp = nav.getComponentWorld(monster.pos.x, monster.pos.z);

    for (let attempts = 0; attempts < 30; attempts++) {
      const angle = this.rng.range(-D_PI, D_PI);
      const dist = this.rng.range(balanceData.ranges.mercyRespawnDist, balanceData.ranges.mercyRespawnDist + 25.0);
      const rx = pPos.x + dSin(angle) * dist;
      const rz = pPos.z - dCos(angle) * dist;

      if (nav.isWalkableWorld(rx, rz) && nav.getComponentWorld(rx, rz) === myComp) {
        monster.pos.x = rx;
        monster.pos.z = rz;
        monster.forceState('DORMANT', { stateTimer: balanceData.ranges.mercyGraceSeconds });
        break;
      }
    }
  }

  step(
    dt: number,
    monsters: MonsterBrain[],
    nav: NavGrid,
    objectivesDone = 0,
  ): void {
    this.simTime += dt;
    this.dreadBeats.length = 0;

    const diffCfg = balanceData.difficulty[this.difficulty] ?? balanceData.difficulty.normal;

    // 1. Advance stillness timers for all tracked players
    for (const track of this.playerTracks.values()) {
      track.stillnessTime += dt;
      track.noiseAcc = Math.max(0, track.noiseAcc - 0.05 * dt);
    }

    if (monsters.length === 0) return;
    const monster = monsters[0]!;

    // 2. Breather countdown
    if (this.breatherTimer > 0) {
      this.breatherTimer -= dt;
      monster.setPatrolBias(monster.pos, 30.0, 0.1);
      return;
    }

    // Pick target player (prioritize higher recent noise or closer distance)
    const primaryTarget = this.getPrimaryTarget();
    if (!primaryTarget) return;

    const pPos = primaryTarget.pos;
    const distToPlayer = dHypot(monster.pos.x - pPos.x, monster.pos.z - pPos.z);

    // 3. First Contact Guarantee
    if (!this.firstContactDone && this.simTime >= this.firstContactScheduledTime) {
      this.executeFirstContact(monster, pPos, nav, diffCfg);
      this.firstContactDone = true;
      this.lastThreatBeatTime = this.simTime;
      return;
    }

    // 4. Stillness Tax Check
    if (primaryTarget.stillnessTime >= diffCfg.stillnessListenDelay && !primaryTarget.stillnessListenDone) {
      // Trigger a 10s Listening Event: monster approaches to 12-20m and pauses to listen
      this.executeListeningEvent(monster, pPos, nav, diffCfg.listenDuration);
      primaryTarget.stillnessListenDone = true;
      this.lastThreatBeatTime = this.simTime;
      return;
    } else if (primaryTarget.stillnessTime >= diffCfg.stillnessSweepDelay && !primaryTarget.stillnessSweepDone) {
      // Escalate to a sweep passing near the player
      this.executeSweep(monster, pPos, nav, 12.0, 18.0);
      primaryTarget.stillnessSweepDone = true;
      this.lastThreatBeatTime = this.simTime;
      return;
    }

    // 5. Pressure Clock Execution
    const phase = this.getCurrentPhase(objectivesDone);
    let bias = diffCfg.prowlBias;
    let radius = 25.0;

    if (phase === 'closing') {
      bias = diffCfg.closingBias;
      radius = 16.0;
      this.activeSweepTimer -= dt;
      if (this.activeSweepTimer <= 0) {
        this.executeSweep(
          monster,
          pPos,
          nav,
          balanceData.ranges.closingSweepMin,
          balanceData.ranges.closingSweepMax,
        );
        this.activeSweepTimer = this.rng.range(35.0, 50.0);
        this.lastThreatBeatTime = this.simTime;
      }
    } else if (phase === 'hunt') {
      bias = diffCfg.huntBias;
      radius = 10.0;
      if (primaryTarget.isPerched || primaryTarget.onGround) {
        if (distToPlayer <= 12.0 && monster.state === 'WANDER') {
          // Trigger lurk surveillance
          monster.forceState('LURK', { stateTimer: 10.0 });
          this.emitDreadBeat('first_contact', monster.pos);
          this.triggerBreather(diffCfg.breatherMin, diffCfg.breatherMax);
          return;
        }
      }
    }

    monster.setPatrolBias(pPos, radius, bias);

    // 6. No Dead Air Guarantee
    if (this.simTime - this.lastThreatBeatTime >= diffCfg.deadAirMax) {
      this.emitDreadBeat('ambient_far', monster.pos);
      this.lastThreatBeatTime = this.simTime;
    }
  }

  private executeFirstContact(
    monster: MonsterBrain,
    playerPos: Vec3,
    nav: NavGrid,
    diffCfg: { firstContactDistMin: number; firstContactDistMax: number },
  ): void {
    const myComp = nav.getComponentWorld(monster.pos.x, monster.pos.z);
    // Find two path points forming an arc across the player's front/side field of view (25-45m)
    const baseAngle = this.rng.range(-D_HALF_PI, D_HALF_PI);
    const dist = this.rng.range(diffCfg.firstContactDistMin, diffCfg.firstContactDistMax);

    const midX = playerPos.x + dSin(baseAngle) * dist;
    const midZ = playerPos.z - dCos(baseAngle) * dist;

    const endX = playerPos.x + dSin(baseAngle + 0.6) * dist;
    const endZ = playerPos.z - dCos(baseAngle + 0.6) * dist;

    if (nav.isWalkableWorld(midX, midZ) && nav.getComponentWorld(midX, midZ) === myComp) {
      monster.scheduleSweep([
        { x: midX, z: midZ },
        { x: endX, z: endZ },
      ]);
      this.emitDreadBeat('first_contact', { x: midX, y: playerPos.y, z: midZ });
    } else {
      // Fallback: bias monster strongly toward player
      monster.setPatrolBias(playerPos, 30.0, 0.8);
      this.emitDreadBeat('ambient_far', monster.pos);
    }
  }

  private executeSweep(
    monster: MonsterBrain,
    playerPos: Vec3,
    nav: NavGrid,
    minDist: number,
    maxDist: number,
  ): void {
    const myComp = nav.getComponentWorld(monster.pos.x, monster.pos.z);
    const angle = this.rng.range(-D_PI, D_PI);
    const sweepDist = this.rng.range(minDist, maxDist);

    const sx = playerPos.x + dSin(angle) * sweepDist;
    const sz = playerPos.z - dCos(angle) * sweepDist;

    const exitAngle = angle + D_PI * 0.65;
    const ex = playerPos.x + dSin(exitAngle) * (sweepDist + 10.0);
    const ez = playerPos.z - dCos(exitAngle) * (sweepDist + 10.0);

    if (nav.isWalkableWorld(sx, sz) && nav.getComponentWorld(sx, sz) === myComp) {
      monster.scheduleSweep([
        { x: sx, z: sz },
        { x: ex, z: ez },
      ]);
      this.emitDreadBeat('sweep', { x: sx, y: playerPos.y, z: sz });
    } else {
      monster.setPatrolBias(playerPos, maxDist, 0.7);
    }
  }

  private executeListeningEvent(
    monster: MonsterBrain,
    playerPos: Vec3,
    nav: NavGrid,
    duration: number,
  ): void {
    const myComp = nav.getComponentWorld(monster.pos.x, monster.pos.z);
    const angle = this.rng.range(-D_PI, D_PI);
    const dist = this.rng.range(balanceData.ranges.listenDistMin, balanceData.ranges.listenDistMax);

    const lx = playerPos.x + dSin(angle) * dist;
    const lz = playerPos.z - dCos(angle) * dist;

    if (nav.isWalkableWorld(lx, lz) && nav.getComponentWorld(lx, lz) === myComp) {
      this.listeningActive = true;
      monster.scheduleListen({ x: lx, y: playerPos.y, z: lz }, duration);
      this.emitDreadBeat('listening', { x: lx, y: playerPos.y, z: lz });
    }
  }

  get isListeningActive(): boolean {
    return this.listeningActive;
  }

  triggerBreather(min = 25.0, max = 40.0): void {
    this.breatherTimer = this.rng.range(min, max);
    this.emitDreadBeat('breather', { x: 0, y: 0, z: 0 });
  }

  private emitDreadBeat(kind: DreadBeat['kind'], position: Vec3): void {
    this.dreadBeats.push({
      kind,
      position: { ...position },
      t: this.simTime,
    });
  }

  private getPrimaryTarget(): PlayerTrack | null {
    let bestTrack: PlayerTrack | null = null;
    let maxPriority = -Infinity;

    const sortedIds = Array.from(this.playerTracks.keys()).sort();
    for (let i = 0; i < sortedIds.length; i++) {
      const track = this.playerTracks.get(sortedIds[i]!)!;
      // Prioritize louder noises or nearer distances
      const priority = track.noiseAcc * 10.0 - dHypot(track.pos.x, track.pos.z) * 0.1;
      if (priority > maxPriority) {
        maxPriority = priority;
        bestTrack = track;
      }
    }

    return bestTrack;
  }
}

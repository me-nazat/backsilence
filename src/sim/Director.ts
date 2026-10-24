/* ── Director.ts ─────────────────────────────────────────────────────────────
 *  Pure, deterministic, host-authoritative Encounter Director.
 *  Regulates pacing, dread rhythm, pressure clock, stillness tax, and breathers.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, PlayerId, NoiseEvent } from '../types/contracts.js';
import type { MonsterBrain } from './MonsterBrain.js';
import type { NavGrid } from './NavGrid.js';
import { Rng } from './rng.js';
import { dHypot, dSin, dCos, D_PI, D_HALF_PI } from './dmath.js';
import balanceData from './balance.json';

export type DirectorDifficulty = 'whisper' | 'normal' | 'deafening' | 'nightmare';

export type DreadPhase = 'CALM' | 'BUILD' | 'PEAK' | 'RELEASE';

export type BeatKind =
  | 'glimpse'
  | 'far_call'
  | 'sweep'
  | 'listening_event'
  | 'lurk_visit'
  | 'false_lead'
  | 'flock_pass'
  | 'map_surge'
  // Backward compatibility aliases
  | 'first_contact'
  | 'listening'
  | 'ambient_far'
  | 'flock_arrival'
  | 'breather';

export interface DreadBeat {
  kind: BeatKind;
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
  isWading: boolean;
}

export interface DirectorSnapshot {
  simTime: number;
  dreadPhase: DreadPhase;
  phaseTime: number;
  phaseDuration: number;
  dread: number;
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
  private currentDreadPhase: DreadPhase = 'CALM';
  private phaseTime = 0;
  private phaseDuration = 25.0; // Run starts in CALM for 25s
  private dreadValue = 0.1;

  private firstContactDone = false;
  private firstContactScheduledTime: number;
  private lastThreatBeatTime = 0;
  private breatherTimer = 0;
  private deathTimestamps: number[] = [];
  private assistOfferPending = false;
  private activeSweepTimer = 25.0;
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

  get dread(): number {
    return this.dreadValue;
  }

  get phase(): DreadPhase {
    return this.currentDreadPhase;
  }

  getSnapshot(): DirectorSnapshot {
    return {
      simTime: this.simTime,
      dreadPhase: this.currentDreadPhase,
      phaseTime: this.phaseTime,
      phaseDuration: this.phaseDuration,
      dread: this.dreadValue,
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
    this.currentDreadPhase = snap.dreadPhase;
    this.phaseTime = snap.phaseTime;
    this.phaseDuration = snap.phaseDuration;
    this.dreadValue = snap.dread;
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

  updatePlayer(
    id: PlayerId,
    pos: Vec3,
    onGround: boolean,
    isPerched: boolean,
    isWading = false,
  ): void {
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
        isWading,
      };
      this.playerTracks.set(id, track);
      return;
    }

    track.pos.x = pos.x;
    track.pos.y = pos.y;
    track.pos.z = pos.z;
    track.onGround = onGround;
    track.isPerched = isPerched;
    track.isWading = isWading;

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

  /**
   * Quantize an exact world position to an 8m region cell center.
   * Enforces Section 4 fairness invariant: "The bias works on region cells of 8 m, never on the exact position."
   */
  getRegionPosition(pos: Vec3): Vec3 {
    return {
      x: Math.floor(pos.x / 8.0) * 8.0 + 4.0,
      y: pos.y,
      z: Math.floor(pos.z / 8.0) * 8.0 + 4.0,
    };
  }

  step(
    dt: number,
    monsters: MonsterBrain[],
    nav: NavGrid,
    objectivesDone = 0,
    hasWorldNoiseSource = false,
  ): void {
    this.simTime += dt;
    this.phaseTime += dt;
    this.dreadBeats.length = 0;

    const diffCfg = balanceData.difficulty[this.difficulty] ?? balanceData.difficulty.normal;

    // 1. Advance dread phase rhythm
    this.updateDreadPacing(dt);

    // 2. Advance stillness timers for all tracked players
    for (const track of this.playerTracks.values()) {
      track.stillnessTime += dt;
      track.noiseAcc = Math.max(0, track.noiseAcc - 0.05 * dt);
    }

    if (monsters.length === 0) return;
    const monster = monsters[0]!;

    // 3. Breather countdown
    if (this.breatherTimer > 0) {
      this.breatherTimer -= dt;
      monster.setPatrolBias(monster.pos, 30.0, 0.1);
      return;
    }

    // Pick target player (prioritize higher recent noise or closer distance)
    const primaryTarget = this.getPrimaryTarget();
    if (!primaryTarget) return;

    const pPos = primaryTarget.pos;
    const regionPos = this.getRegionPosition(pPos);
    const distToPlayer = dHypot(monster.pos.x - pPos.x, monster.pos.z - pPos.z);

    // Dynamic dread modulation based on proximity and recent noise
    let dynamicDread = this.dreadValue;
    if (distToPlayer < 20.0) {
      dynamicDread = Math.min(1.0, dynamicDread + (20.0 - distToPlayer) / 20.0 * 0.25);
    }
    if (primaryTarget.noiseAcc > 0.5) {
      dynamicDread = Math.min(1.0, dynamicDread + 0.15);
    }
    this.dreadValue = dynamicDread;

    // 4. First Contact Guarantee (within 30..45s on Normal)
    if (!this.firstContactDone && this.simTime >= this.firstContactScheduledTime) {
      if (this.rng.next() < 0.65) {
        this.executeGlimpse(monster, pPos, nav, diffCfg);
      } else {
        this.executeFarCall(monster, pPos);
      }
      this.firstContactDone = true;
      return;
    }

    // 5. Stillness Tax Check
    if (primaryTarget.stillnessTime >= diffCfg.stillnessListenDelay && !primaryTarget.stillnessListenDone) {
      // 75s stillness: trigger a 10s Listening Event (12-20m away)
      this.executeListeningEvent(monster, regionPos, nav, diffCfg.listenDuration);
      primaryTarget.stillnessListenDone = true;
      return;
    } else if (primaryTarget.stillnessTime >= diffCfg.stillnessSweepDelay && !primaryTarget.stillnessSweepDone) {
      // 40s stillness: escalate to a sweep (6-10m from platform)
      if (!primaryTarget.isWading) {
        this.executeSweep(monster, regionPos, nav, 6.0, 10.0, pPos);
        primaryTarget.stillnessSweepDone = true;
        return;
      }
    }

    // 6. Pressure Clock Execution (Prowl 35%, Closing 60%, Hunt 80% on 8m region cells)
    const phase = this.getCurrentPhase(objectivesDone);
    const biasBonus = diffCfg.biasBonus ?? 0.0;
    let bias = diffCfg.prowlBias + biasBonus;
    let radius = 25.0;

    if (phase === 'closing') {
      bias = diffCfg.closingBias + biasBonus;
      radius = 16.0;
      this.activeSweepTimer -= dt;
      if (this.activeSweepTimer <= 0) {
        if (!primaryTarget.isWading) {
          this.executeSweep(
            monster,
            regionPos,
            nav,
            balanceData.ranges.closingSweepMin,
            balanceData.ranges.closingSweepMax,
            pPos,
          );
        }
        this.activeSweepTimer = this.rng.range(35.0, 50.0);
      }
    } else if (phase === 'hunt') {
      bias = diffCfg.huntBias + biasBonus;
      radius = 10.0;
      if (primaryTarget.isPerched) {
        if (distToPlayer <= 14.0 && monster.state === 'WANDER') {
          // Trigger lurk visit: circles perched player at 2.2-3.0m, swipes short, leaves
          this.executeLurkVisit(monster, pPos, nav);
          this.triggerBreather(diffCfg.breatherMin, diffCfg.breatherMax);
          return;
        }
      }
    }

    // False lead beat: occasionally investigate a distant world noise source
    if (hasWorldNoiseSource && phase !== 'hunt' && this.rng.next() < 0.001 * dt) {
      this.emitDreadBeat('false_lead', monster.pos);
    }

    // Apply region-quantized patrol bias
    monster.setPatrolBias(regionPos, radius, bias);

    // 7. No Dead Air Guarantee: never more than 90s without a beat
    if (this.simTime - this.lastThreatBeatTime >= diffCfg.deadAirMax) {
      if (this.rng.next() < 0.5) {
        this.executeFarCall(monster, pPos);
      } else {
        this.emitDreadBeat('flock_pass', monster.pos);
      }
    }
  }

  private updateDreadPacing(_dt: number): void {
    const progress = Math.min(1.0, this.phaseTime / Math.max(1.0, this.phaseDuration));

    switch (this.currentDreadPhase) {
      case 'CALM':
        this.dreadValue = 0.08 + progress * 0.12; // 0.08 -> 0.20
        if (this.phaseTime >= this.phaseDuration) {
          this.currentDreadPhase = 'BUILD';
          this.phaseTime = 0;
          this.phaseDuration = this.rng.range(40.0, 70.0);
        }
        break;
      case 'BUILD':
        this.dreadValue = 0.20 + progress * 0.50; // 0.20 -> 0.70
        if (this.phaseTime >= this.phaseDuration) {
          this.currentDreadPhase = 'PEAK';
          this.phaseTime = 0;
          this.phaseDuration = this.rng.range(15.0, 30.0);
        }
        break;
      case 'PEAK':
        this.dreadValue = 0.75 + progress * 0.25; // 0.75 -> 1.00
        if (this.phaseTime >= this.phaseDuration) {
          this.currentDreadPhase = 'RELEASE';
          this.phaseTime = 0;
          this.phaseDuration = this.rng.range(25.0, 40.0);
        }
        break;
      case 'RELEASE':
        this.dreadValue = 0.70 - progress * 0.55; // 0.70 -> 0.15
        if (this.phaseTime >= this.phaseDuration) {
          this.currentDreadPhase = 'CALM';
          this.phaseTime = 0;
          this.phaseDuration = this.rng.range(20.0, 45.0);
        }
        break;
    }
  }

  private executeGlimpse(
    monster: MonsterBrain,
    playerPos: Vec3,
    nav: NavGrid,
    diffCfg: { firstContactDistMin: number; firstContactDistMax: number },
  ): void {
    const myComp = nav.getComponentWorld(monster.pos.x, monster.pos.z);
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
      this.emitDreadBeat('glimpse', { x: midX, y: playerPos.y, z: midZ });
    } else {
      this.executeFarCall(monster, playerPos);
    }
  }

  private executeFarCall(_monster: MonsterBrain, playerPos: Vec3): void {
    const angle = this.rng.range(-D_PI, D_PI);
    const callPos = {
      x: playerPos.x + dSin(angle) * 35.0,
      y: playerPos.y,
      z: playerPos.z - dCos(angle) * 35.0,
    };
    this.emitDreadBeat('far_call', callPos);
  }

  private executeSweep(
    monster: MonsterBrain,
    centerPos: Vec3,
    nav: NavGrid,
    minDist: number,
    maxDist: number,
    playerPos?: Vec3,
  ): void {
    const myComp = nav.getComponentWorld(monster.pos.x, monster.pos.z);
    const angle = this.rng.range(-D_PI, D_PI);
    // Ensure sweep passes at least 6m away from platform
    const sweepDist = Math.max(6.0, this.rng.range(minDist, maxDist));

    let sx = centerPos.x + dSin(angle) * sweepDist;
    let sz = centerPos.z - dCos(angle) * sweepDist;

    if (playerPos) {
      const d = dHypot(sx - playerPos.x, sz - playerPos.z);
      if (d < 6.05) {
        const factor = 6.1 / Math.max(0.01, d);
        sx = playerPos.x + (sx - playerPos.x) * factor;
        sz = playerPos.z + (sz - playerPos.z) * factor;
      }
    }

    const exitAngle = angle + D_PI * 0.65;
    let ex = centerPos.x + dSin(exitAngle) * (sweepDist + 10.0);
    let ez = centerPos.z - dCos(exitAngle) * (sweepDist + 10.0);

    if (playerPos) {
      const dEnd = dHypot(ex - playerPos.x, ez - playerPos.z);
      if (dEnd < 6.05) {
        const factor = 6.1 / Math.max(0.01, dEnd);
        ex = playerPos.x + (ex - playerPos.x) * factor;
        ez = playerPos.z + (ez - playerPos.z) * factor;
      }
    }

    if (nav.isWalkableWorld(sx, sz) && nav.getComponentWorld(sx, sz) === myComp) {
      monster.scheduleSweep([
        { x: sx, z: sz },
        { x: ex, z: ez },
      ]);
      this.emitDreadBeat('sweep', { x: sx, y: centerPos.y, z: sz });
    } else {
      monster.setPatrolBias(centerPos, maxDist, 0.7);
      this.executeFarCall(monster, centerPos);
    }
  }

  private executeListeningEvent(
    monster: MonsterBrain,
    centerPos: Vec3,
    nav: NavGrid,
    duration: number,
  ): void {
    const myComp = nav.getComponentWorld(monster.pos.x, monster.pos.z);
    const angle = this.rng.range(-D_PI, D_PI);
    const dist = this.rng.range(balanceData.ranges.listenDistMin, balanceData.ranges.listenDistMax);

    const lx = centerPos.x + dSin(angle) * dist;
    const lz = centerPos.z - dCos(angle) * dist;

    if (nav.isWalkableWorld(lx, lz) && nav.getComponentWorld(lx, lz) === myComp) {
      this.listeningActive = true;
      monster.scheduleListen({ x: lx, y: centerPos.y, z: lz }, duration);
      this.emitDreadBeat('listening_event', { x: lx, y: centerPos.y, z: lz });
    } else {
      this.executeFarCall(monster, centerPos);
    }
  }

  private executeLurkVisit(monster: MonsterBrain, playerPos: Vec3, nav: NavGrid): void {
    const myComp = nav.getComponentWorld(monster.pos.x, monster.pos.z);
    const angle = this.rng.range(-D_PI, D_PI);
    const dist = this.rng.range(2.2, 3.0); // circles perched player at 2.2 to 3.0m

    const lx = playerPos.x + dSin(angle) * dist;
    const lz = playerPos.z - dCos(angle) * dist;

    if (nav.isWalkableWorld(lx, lz) && nav.getComponentWorld(lx, lz) === myComp) {
      monster.forceState('LURK', { stateTimer: 10.0 });
      this.emitDreadBeat('lurk_visit', { x: lx, y: playerPos.y, z: lz });
    } else {
      this.executeFarCall(monster, playerPos);
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
    this.lastThreatBeatTime = this.simTime;
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

/* ── ObjectiveDirector.ts ──────────────────────────────────────────────────
 *  Diegetic 3D Waypoints, Interactive Beacons, Telemetry Checklists,
 *  and Tactical Acoustic Decoys across all 8 BackSilence modes.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  CylinderGeometry,
  SphereGeometry,
  RingGeometry,
  BoxGeometry,
  PointLight,
  DoubleSide,
  AdditiveBlending,
} from 'three';
import type { Vec3 } from '../../types/contracts.js';
import type { Hud, ObjectiveChecklistItem, HudData } from '../../ui/Hud.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';

export interface ObjectiveWaypoint {
  id: string;
  kind: 'key' | 'tape' | 'lever' | 'exit' | 'beacon' | 'canister' | 'cache' | 'plate';
  pos: Vec3;
  label: string;
  checklistText: string;
  completed: boolean;
  light?: PointLight;
  beaconMesh?: Mesh;
  pulseTimer: number;
}

export interface ObjectiveDirectorConfig {
  modeId: string;
  mapId: string;
  seed: number;
  hud: Hud;
  audio: AudioEngine;
  onAdvanceEndlessSector?: (sectorIndex: number) => void;
  onAllObjectivesMet?: () => void;
}

export class ObjectiveDirector {
  readonly root = new Group();
  private waypoints: ObjectiveWaypoint[] = [];
  private hud: Hud;
  private audio: AudioEngine;
  private config: ObjectiveDirectorConfig;

  private pingTimer = 0;
  private pingSonarMesh: Mesh | null = null;
  private pingSonarTimer = 0;

  // Endless mode state
  public endlessSector = 1;
  public endlessTideTimer = 45.0;
  public endlessCanistersCollected = 0;
  public endlessCachesCollected = 0;
  public endlessScore = 0;

  // Archive tapes state
  public archiveTapesCollected = 0;
  public conductorKeyAcquired = false;
  public leversPulledCount = 0;
  public engineReady = false;

  // Daily descent state
  public dailyPeakNoiseDb = -60.0;

  // Ghost run state
  public ghostDeltaSeconds = 0.0;
  public ghostAhead = false;

  // Co-op & Race state
  public coopDoorUnlocked = false;
  public racePlacement = 1;
  public lastDryRingCount = 3;

  constructor(config: ObjectiveDirectorConfig) {
    this.config = config;
    this.hud = config.hud;
    this.audio = config.audio;
    this.root.name = 'ObjectiveDirector';
    this.initSonarMesh();
  }

  private initSonarMesh(): void {
    const geo = new RingGeometry(0.2, 1.2, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.pingSonarMesh = new Mesh(geo, mat);
    this.pingSonarMesh.visible = false;
    this.root.add(this.pingSonarMesh);
  }

  addKeyBeacon(pos: Vec3, label = 'Conductor Key'): ObjectiveWaypoint {
    const group = new Group();
    group.position.set(pos.x, pos.y, pos.z);

    // Pedestal stand
    const pedGeo = new CylinderGeometry(0.3, 0.4, 0.9, 16);
    const pedMat = new MeshStandardMaterial({ color: 0x242018, roughness: 0.8 });
    const pedMesh = new Mesh(pedGeo, pedMat);
    pedMesh.position.y = 0.45;
    group.add(pedMesh);

    // Pulsing amber key token
    const tokenGeo = new BoxGeometry(0.18, 0.35, 0.08);
    const tokenMat = new MeshBasicMaterial({ color: 0xffb000 });
    const tokenMesh = new Mesh(tokenGeo, tokenMat);
    tokenMesh.position.y = 1.05;
    group.add(tokenMesh);

    // Amber aura halo
    const auraGeo = new RingGeometry(0.12, 0.45, 24);
    auraGeo.rotateX(-Math.PI / 2);
    const auraMat = new MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.65,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const auraMesh = new Mesh(auraGeo, auraMat);
    auraMesh.position.y = 1.0;
    group.add(auraMesh);

    // Amber PointLight
    const light = new PointLight(0xffb000, 1.8, 14.0);
    light.position.set(0, 1.1, 0);
    group.add(light);

    this.root.add(group);

    const wp: ObjectiveWaypoint = {
      id: `key_${pos.x.toFixed(0)}_${pos.z.toFixed(0)}`,
      kind: 'key',
      pos,
      label,
      checklistText: 'Locate Conductor Key',
      completed: false,
      light,
      beaconMesh: tokenMesh,
      pulseTimer: 0,
    };
    this.waypoints.push(wp);
    return wp;
  }

  addTapeBeacon(pos: Vec3, index: number): ObjectiveWaypoint {
    const group = new Group();
    group.position.set(pos.x, pos.y, pos.z);

    // Low stone pedestal
    const pedGeo = new CylinderGeometry(0.28, 0.32, 0.6, 16);
    const pedMat = new MeshStandardMaterial({ color: 0x1f2324, roughness: 0.7 });
    const pedMesh = new Mesh(pedGeo, pedMat);
    pedMesh.position.y = 0.3;
    group.add(pedMesh);

    // Amber holographic cassette tape
    const tapeGeo = new BoxGeometry(0.24, 0.16, 0.06);
    const tapeMat = new MeshBasicMaterial({ color: 0xffa000 });
    const tapeMesh = new Mesh(tapeGeo, tapeMat);
    tapeMesh.position.y = 0.72;
    group.add(tapeMesh);

    const light = new PointLight(0xffb000, 1.5, 12.0);
    light.position.set(0, 0.8, 0);
    group.add(light);

    this.root.add(group);

    const wp: ObjectiveWaypoint = {
      id: `tape_${index}`,
      kind: 'tape',
      pos,
      label: `Archive Tape #${index}`,
      checklistText: `Recover Archive Tape #${index}`,
      completed: false,
      light,
      beaconMesh: tapeMesh,
      pulseTimer: index * 0.4,
    };
    this.waypoints.push(wp);
    return wp;
  }

  addLeverStatusLight(pos: Vec3, leverIndex: number): ObjectiveWaypoint {
    const group = new Group();
    group.position.set(pos.x, pos.y + 0.9, pos.z);

    // Glowing status lamp bulb
    const bulbGeo = new SphereGeometry(0.12, 16, 12);
    const bulbMat = new MeshBasicMaterial({ color: 0xff2222 });
    const bulbMesh = new Mesh(bulbGeo, bulbMat);
    group.add(bulbMesh);

    // Red PointLight initially
    const light = new PointLight(0xff2222, 1.4, 8.0);
    group.add(light);

    this.root.add(group);

    const wp: ObjectiveWaypoint = {
      id: `lever_${leverIndex}`,
      kind: 'lever',
      pos,
      label: `Track Switch Lever #${leverIndex}`,
      checklistText: `Pull Track Lever #${leverIndex}`,
      completed: false,
      light,
      beaconMesh: bulbMesh,
      pulseTimer: 0,
    };
    this.waypoints.push(wp);
    return wp;
  }

  addExitBeacon(pos: Vec3, label = 'Extraction Gate'): ObjectiveWaypoint {
    const group = new Group();
    group.position.set(pos.x, pos.y, pos.z);

    // Flickering industrial floodlight
    const light = new PointLight(0xfff0c0, 2.2, 32.0);
    light.position.set(0, 2.5, 0);
    group.add(light);

    // Illuminated Exit Sign
    const signGeo = new BoxGeometry(1.8, 0.45, 0.1);
    const signMat = new MeshBasicMaterial({ color: 0x86cfa0 });
    const signMesh = new Mesh(signGeo, signMat);
    signMesh.position.set(0, 2.8, 0);
    group.add(signMesh);

    this.root.add(group);

    const wp: ObjectiveWaypoint = {
      id: `exit_${pos.x.toFixed(0)}_${pos.z.toFixed(0)}`,
      kind: 'exit',
      pos,
      label,
      checklistText: `Board ${label}`,
      completed: false,
      light,
      beaconMesh: signMesh,
      pulseTimer: 0,
    };
    this.waypoints.push(wp);
    return wp;
  }

  addEndlessFloodgateBeacon(pos: Vec3): ObjectiveWaypoint {
    const group = new Group();
    group.position.set(pos.x, pos.y, pos.z);

    // Massive vertical ascent airlock beacon pillar
    const beamGeo = new CylinderGeometry(0.35, 0.35, 12.0, 16);
    const beamMat = new MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.45,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    });
    const beamMesh = new Mesh(beamGeo, beamMat);
    beamMesh.position.y = 6.0;
    group.add(beamMesh);

    // Pulsing cyan light
    const light = new PointLight(0x00e5ff, 2.8, 38.0);
    light.position.set(0, 2.5, 0);
    group.add(light);

    this.root.add(group);

    const wp: ObjectiveWaypoint = {
      id: 'endless_floodgate',
      kind: 'beacon',
      pos,
      label: 'Emergency Floodgate Ascent Lock',
      checklistText: 'Reach Emergency Floodgate Beacon',
      completed: false,
      light,
      beaconMesh: beamMesh,
      pulseTimer: 0,
    };
    this.waypoints.push(wp);
    return wp;
  }

  addCanisterBeacon(pos: Vec3, index: number): ObjectiveWaypoint {
    const group = new Group();
    group.position.set(pos.x, pos.y, pos.z);

    const canGeo = new CylinderGeometry(0.12, 0.12, 0.4, 12);
    const canMat = new MeshBasicMaterial({ color: 0x00ffc8 });
    const canMesh = new Mesh(canGeo, canMat);
    canMesh.position.y = 0.25;
    group.add(canMesh);

    const light = new PointLight(0x00ffc8, 1.2, 8.0);
    light.position.set(0, 0.35, 0);
    group.add(light);

    this.root.add(group);

    const wp: ObjectiveWaypoint = {
      id: `canister_${index}`,
      kind: 'canister',
      pos,
      label: 'Acoustic Decoy Canister',
      checklistText: 'Recover Decoy Canister',
      completed: false,
      light,
      beaconMesh: canMesh,
      pulseTimer: index * 0.5,
    };
    this.waypoints.push(wp);
    return wp;
  }

  addDataCacheBeacon(pos: Vec3, index: number): ObjectiveWaypoint {
    const group = new Group();
    group.position.set(pos.x, pos.y, pos.z);

    const podGeo = new BoxGeometry(0.28, 0.28, 0.28);
    const podMat = new MeshBasicMaterial({ color: 0xffb000 });
    const podMesh = new Mesh(podGeo, podMat);
    podMesh.position.y = 0.3;
    group.add(podMesh);

    const light = new PointLight(0xffb000, 1.4, 10.0);
    light.position.set(0, 0.4, 0);
    group.add(light);

    this.root.add(group);

    const wp: ObjectiveWaypoint = {
      id: `cache_${index}`,
      kind: 'cache',
      pos,
      label: 'Archive Data Cache',
      checklistText: 'Secure Archive Data Cache',
      completed: false,
      light,
      beaconMesh: podMesh,
      pulseTimer: index * 0.7,
    };
    this.waypoints.push(wp);
    return wp;
  }

  setWaypointCompleted(id: string): void {
    const wp = this.waypoints.find((w) => w.id === id);
    if (!wp) return;
    wp.completed = true;

    if (wp.kind === 'lever' && wp.beaconMesh && wp.light) {
      (wp.beaconMesh.material as MeshBasicMaterial).color.setHex(0x00ff88);
      wp.light.color.setHex(0x00ff88);
      wp.light.intensity = 1.0;
    } else if (wp.beaconMesh) {
      wp.beaconMesh.visible = false;
      if (wp.light) wp.light.intensity = 0.2;
    }
  }

  triggerSensorPing(playerPos: Vec3): string | null {
    this.pingTimer = 6.0;
    this.pingSonarTimer = 1.2;

    if (this.pingSonarMesh) {
      this.pingSonarMesh.position.set(playerPos.x, playerPos.y + 0.05, playerPos.z);
      this.pingSonarMesh.scale.set(1, 1, 1);
      this.pingSonarMesh.visible = true;
      (this.pingSonarMesh.material as MeshBasicMaterial).opacity = 0.8;
    }

    this.audio.play('ui_click');

    // Find nearest pending waypoint
    let nearestWp: ObjectiveWaypoint | null = null;
    let nearestDist = Infinity;
    for (const wp of this.waypoints) {
      if (wp.completed) continue;
      const d = Math.hypot(wp.pos.x - playerPos.x, wp.pos.z - playerPos.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearestWp = wp;
      }
    }

    if (nearestWp) {
      return `${nearestWp.label.toUpperCase()} · ${Math.round(nearestDist)}M`;
    }
    return null;
  }

  update(dt: number, playerPos: Vec3, playerYaw: number): void {
    // 1. Animate Beacons & Pulse Lights
    for (const wp of this.waypoints) {
      wp.pulseTimer += dt;
      if (wp.beaconMesh && !wp.completed) {
        wp.beaconMesh.rotation.y += dt * 1.5;
        if (wp.kind === 'key' || wp.kind === 'tape') {
          wp.beaconMesh.position.y += Math.sin(wp.pulseTimer * 3.0) * 0.002;
        }
      }
      if (wp.light && !wp.completed) {
        const pingBoost = this.pingTimer > 0 ? 1.6 : 1.0;
        const wave = 0.85 + Math.sin(wp.pulseTimer * 4.0) * 0.25;
        wp.light.intensity = wave * pingBoost;
      }
    }

    // 2. Animate Sensor Ping Sonar Wave
    if (this.pingTimer > 0) {
      this.pingTimer -= dt;
    }
    if (this.pingSonarTimer > 0 && this.pingSonarMesh) {
      this.pingSonarTimer -= dt;
      const progress = 1.0 - this.pingSonarTimer / 1.2;
      const radius = 1.0 + progress * 24.0;
      this.pingSonarMesh.scale.set(radius, radius, 1);
      (this.pingSonarMesh.material as MeshBasicMaterial).opacity = Math.max(0, (1.0 - progress) * 0.8);
      if (this.pingSonarTimer <= 0) {
        this.pingSonarMesh.visible = false;
      }
    }

    // 3. Build Telemetry Checklist and Distance Vectors
    const mode = this.config.modeId;
    let sectorTitle = `SECTOR 01 // ${this.config.mapId.toUpperCase().replace('_', ' ')}`;
    const checklist: ObjectiveChecklistItem[] = [];

    let primaryTarget: { pos: Vec3; label: string } | null = null;

    if (mode === 'campaign') {
      sectorTitle = 'THE ARCHIVE TAPES // SECTOR 01';
      const tapesDone = this.archiveTapesCollected >= 3;
      const nearestTape = this.waypoints.find((w) => w.kind === 'tape' && !w.completed);
      const tapeDist = nearestTape ? Math.round(Math.hypot(nearestTape.pos.x - playerPos.x, nearestTape.pos.z - playerPos.z)) : null;
      checklist.push({
        text: `[${this.archiveTapesCollected}/3] Recover Archive Tapes`,
        done: tapesDone,
        distanceM: tapesDone ? null : tapeDist,
      });

      const keyWp = this.waypoints.find((w) => w.kind === 'key');
      const keyDist = keyWp && !this.conductorKeyAcquired ? Math.round(Math.hypot(keyWp.pos.x - playerPos.x, keyWp.pos.z - playerPos.z)) : null;
      checklist.push({
        text: '[0/1] Locate Conductor Key',
        done: this.conductorKeyAcquired,
        distanceM: this.conductorKeyAcquired ? null : keyDist,
      });

      const leversDone = this.leversPulledCount >= 2;
      const nearestLever = this.waypoints.find((w) => w.kind === 'lever' && !w.completed);
      const leverDist = nearestLever ? Math.round(Math.hypot(nearestLever.pos.x - playerPos.x, nearestLever.pos.z - playerPos.z)) : null;
      checklist.push({
        text: `[${this.leversPulledCount}/2] Pull Track Levers`,
        done: leversDone,
        distanceM: leversDone ? null : leverDist,
      });

      const exitWp = this.waypoints.find((w) => w.kind === 'exit');
      const exitDist = exitWp ? Math.round(Math.hypot(exitWp.pos.x - playerPos.x, exitWp.pos.z - playerPos.z)) : null;
      checklist.push({
        text: 'Board Stalled Car 5 (Extraction Train)',
        done: false,
        distanceM: exitDist,
      });

      // Select target for compass
      if (!tapesDone && nearestTape) {
        primaryTarget = { pos: nearestTape.pos, label: nearestTape.label };
      } else if (!this.conductorKeyAcquired && keyWp) {
        primaryTarget = { pos: keyWp.pos, label: 'CONDUCTOR KEY' };
      } else if (!leversDone && nearestLever) {
        primaryTarget = { pos: nearestLever.pos, label: nearestLever.label };
      } else if (exitWp) {
        primaryTarget = { pos: exitWp.pos, label: 'EXTRACTION TRAIN' };
      }
    } else if (mode === 'daily') {
      sectorTitle = 'DAILY DESCENT // MUTATORS ACTIVE';
      checklist.push({
        text: 'MUTATOR: Rising Water (+0.05m/min)',
        done: false,
        distanceM: null,
      });
      checklist.push({
        text: 'MUTATOR: Hyper-Sensitive Lurker (+50% Range)',
        done: false,
        distanceM: null,
      });
      const exitWp = this.waypoints.find((w) => w.kind === 'exit');
      const exitDist = exitWp ? Math.round(Math.hypot(exitWp.pos.x - playerPos.x, exitWp.pos.z - playerPos.z)) : null;
      checklist.push({
        text: 'Evade Entity and Reach Extraction Door',
        done: false,
        distanceM: exitDist,
      });
      if (exitWp) primaryTarget = { pos: exitWp.pos, label: 'EXIT GATE' };
    } else if (mode === 'endless') {
      sectorTitle = `ENDLESS TIDE // SECTOR 0${this.endlessSector}`;
      this.endlessTideTimer = Math.max(0, this.endlessTideTimer - dt);

      const floodgateWp = this.waypoints.find((w) => w.kind === 'beacon');
      const gateDist = floodgateWp ? Math.round(Math.hypot(floodgateWp.pos.x - playerPos.x, floodgateWp.pos.z - playerPos.z)) : 100;
      checklist.push({
        text: 'Reach Emergency Floodgate Ascent Lock',
        done: false,
        distanceM: gateDist,
      });
      checklist.push({
        text: `[${this.endlessCanistersCollected}/3] Recover Decoy Canisters`,
        done: this.endlessCanistersCollected >= 3,
        distanceM: null,
      });
      checklist.push({
        text: `[${this.endlessCachesCollected}/2] Secure Archive Data Caches`,
        done: this.endlessCachesCollected >= 2,
        distanceM: null,
      });
      checklist.push({
        text: `TIDE RISING IN ${Math.ceil(this.endlessTideTimer)}s (SCORE: ${this.endlessScore})`,
        done: false,
        distanceM: null,
      });
      if (floodgateWp) primaryTarget = { pos: floodgateWp.pos, label: 'FLOODGATE BEACON' };
    } else if (mode === 'ghost') {
      sectorTitle = 'GHOST RUN // SOLO VS CHAMPION';
      const deltaStr = this.ghostDeltaSeconds <= 0
        ? `-${Math.abs(this.ghostDeltaSeconds).toFixed(1)}s (AHEAD)`
        : `+${this.ghostDeltaSeconds.toFixed(1)}s (BEHIND)`;
      checklist.push({
        text: `GHOST DELTA: ${deltaStr}`,
        done: this.ghostDeltaSeconds <= 0,
        distanceM: null,
      });
      const exitWp = this.waypoints.find((w) => w.kind === 'exit');
      const exitDist = exitWp ? Math.round(Math.hypot(exitWp.pos.x - playerPos.x, exitWp.pos.z - playerPos.z)) : null;
      checklist.push({
        text: 'Beat Champion Pace to Extraction Portal',
        done: false,
        distanceM: exitDist,
      });
      if (exitWp) primaryTarget = { pos: exitWp.pos, label: 'EXTRACTION GATE' };
    } else if (mode === 'training') {
      sectorTitle = 'GUIDED PRACTICE // SECTOR 00';
      checklist.push({
        text: 'Wade quietly while crouched to dampen ripples',
        done: false,
        distanceM: null,
      });
      checklist.push({
        text: 'Throw decoy pebble [G] to divert passive Lurker',
        done: false,
        distanceM: null,
      });
      const exitWp = this.waypoints.find((w) => w.kind === 'exit');
      const exitDist = exitWp ? Math.round(Math.hypot(exitWp.pos.x - playerPos.x, exitWp.pos.z - playerPos.z)) : null;
      checklist.push({
        text: 'Complete Course at Extraction Airlock',
        done: false,
        distanceM: exitDist,
      });
      if (exitWp) primaryTarget = { pos: exitWp.pos, label: 'AIRLOCK' };
    } else if (mode === 'coop') {
      sectorTitle = 'CO-OP ESCAPE // SECTOR 01';
      checklist.push({
        text: 'Coordinate with Operator ECHO-02 on Dual Pressure Plates',
        done: this.coopDoorUnlocked,
        distanceM: null,
      });
      const exitWp = this.waypoints.find((w) => w.kind === 'exit');
      const exitDist = exitWp ? Math.round(Math.hypot(exitWp.pos.x - playerPos.x, exitWp.pos.z - playerPos.z)) : null;
      checklist.push({
        text: 'Escape through Heavy Blast Door',
        done: false,
        distanceM: exitDist,
      });
      if (exitWp) primaryTarget = { pos: exitWp.pos, label: 'BLAST DOOR' };
    } else if (mode === 'race') {
      sectorTitle = 'SILENT RACE // 4-RUNNER TRIAL';
      checklist.push({
        text: `CURRENT PLACEMENT: ${this.racePlacement === 1 ? '1ST' : this.racePlacement === 2 ? '2ND' : this.racePlacement === 3 ? '3RD' : '4TH'} / 4`,
        done: this.racePlacement === 1,
        distanceM: null,
      });
      checklist.push({
        text: 'Fastest and quietest survivor claims Silence Rating (SR)',
        done: false,
        distanceM: null,
      });
      const exitWp = this.waypoints.find((w) => w.kind === 'exit');
      const exitDist = exitWp ? Math.round(Math.hypot(exitWp.pos.x - playerPos.x, exitWp.pos.z - playerPos.z)) : null;
      checklist.push({
        text: 'Cross Finish Line Extraction Portal',
        done: false,
        distanceM: exitDist,
      });
      if (exitWp) primaryTarget = { pos: exitWp.pos, label: 'FINISH BEACON' };
    } else if (mode === 'last_dry') {
      sectorTitle = 'LAST ONE DRY // SURVIVAL ARENA';
      checklist.push({
        text: `Outer platform rings submerging every 20s (Remaining: ${this.lastDryRingCount})`,
        done: false,
        distanceM: null,
      });
      checklist.push({
        text: 'Stay on central dry platforms; evading the submerged Lurker',
        done: false,
        distanceM: null,
      });
      checklist.push({
        text: 'Last surviving dry runner wins the match',
        done: false,
        distanceM: null,
      });
    }

    // 4. Calculate Compass Notch / Direction Finder
    let objectiveIndicator: HudData['objectiveIndicator'] = null;
    if (primaryTarget) {
      const dx = primaryTarget.pos.x - playerPos.x;
      const dz = primaryTarget.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      const angleToTarget = Math.atan2(dx, -dz);
      let relAngle = angleToTarget - playerYaw;
      while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
      while (relAngle < -Math.PI) relAngle += 2 * Math.PI;

      objectiveIndicator = {
        visible: true,
        angleRad: relAngle,
        distanceMeters: Math.round(dist),
        label: primaryTarget.label,
      };
    }

    // 5. Update Persistent HUD
    this.hud.update({
      sectorTitle,
      checklist,
      objectiveIndicator,
    });
  }

  dispose(): void {
    while (this.root.children.length > 0) {
      const child = this.root.children[0]!;
      this.root.remove(child);
    }
    this.waypoints = [];
  }
}


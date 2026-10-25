/* ── MonsterBody.ts ─────────────────────────────────────────────────────────
 *  Presentation controller synchronizing the procedural monster mesh with sim state.
 *  Solves inverse kinematics, secondary breathing, ear fin tracking, and footfall splatters.
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3, type Camera } from 'three';
import type { MonsterSnapshot } from '../../sim/MonsterBrain.js';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import { MonsterMeshHierarchy } from './MonsterMesh.js';
import { MonsterIKSolver } from './MonsterIK.js';
import { MonsterGaitGenerator } from './MonsterGait.js';
import type { WaterSystem } from '../water/WaterSystem.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';

const _poleArmL = new Vector3(0.6, 0.2, 0.5);
const _poleArmR = new Vector3(-0.6, 0.2, 0.5);
const _poleLegL = new Vector3(0.4, 0.2, -0.6);
const _poleLegR = new Vector3(-0.4, 0.2, -0.6);
const _tempMid = new Vector3();
const _tempShL = new Vector3();
const _tempShR = new Vector3();
const _tempHpL = new Vector3();
const _tempHpR = new Vector3();
const _tempLocal = new Vector3();
const _worldRoot = new Vector3();

export class MonsterBody {
  readonly id: string;
  readonly mesh: MonsterMeshHierarchy;
  private readonly gait = new MonsterGaitGenerator();
  private readonly water?: WaterSystem | undefined;
  private readonly audio?: AudioEngine | undefined;

  // Smoothing buffers
  private currentYaw = 0;
  private currentJawOpen = 0;
  private currentRearing = 0;
  private breathPhase = 0;
  private wakeTimer = 0;

  // Hardening and Diagnostic Probe fields (Phase B)
  readonly skinType: 'model' | 'procedural' = 'procedural';
  skinError: string | null = null;
  updateErrorCount = 0;
  lastUpdateError: string | null = null;
  nonFiniteCount = 0;
  nonFiniteDetected = false;
  fogDensity = 0.045;

  private readonly lastGoodPos = new Vector3(0, 0, 0);
  private lastGoodYaw = 0;
  private hasLoggedNonFinite = false;

  readonly scale: number;
  readonly tint: string;

  constructor(
    id: string,
    scale = 1.0,
    tint = '#7a4a38',
    water?: WaterSystem,
    audio?: AudioEngine,
  ) {
    this.id = id;
    this.scale = scale;
    this.tint = tint;
    this.mesh = new MonsterMeshHierarchy(scale, tint);
    this.water = water;
    this.audio = audio;
  }

  private readonly rippleEvent = {
    position: { x: 0, y: 0, z: 0 },
    strength: 0,
    t: 0,
    sourcePlayerId: 'world' as const,
  };
  private readonly footfallAudioOpts = {
    position: new Vector3(),
    gain: 0,
  };

  private readonly onGaitPlant = (plantPos: Vector3, force: number): void => {
    // Plant callback: spawn ripple, splash, and audio footfall
    if (this.water) {
      this.rippleEvent.position.x = plantPos.x;
      this.rippleEvent.position.y = 0;
      this.rippleEvent.position.z = plantPos.z;
      this.rippleEvent.strength = force * 0.8;
      this.rippleEvent.t = performance.now() * 0.001;
      this.water.onRipple(this.rippleEvent);
      this.water.onSplash(plantPos, force, true);
    }
    if (this.audio) {
      this.footfallAudioOpts.position.copy(plantPos);
      this.footfallAudioOpts.gain = force * 0.9;
      this.audio.play('monster_footfall', this.footfallAudioOpts);
    }
  };

  update(
    dt: number,
    snapshot: MonsterSnapshot,
    ground: GroundGrid,
    camera: Camera,
  ): void {
    try {
      this.updateInternal(dt, snapshot, ground, camera);
    } catch (err: unknown) {
      this.updateErrorCount++;
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown monster update error';
      this.lastUpdateError = msg;
      console.warn(`[MonsterBody] update threw for ${this.id}: ${msg}. Maintaining procedural presentation.`);
      if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
        const hud = document.getElementById('hud');
        if (hud) {
          hud.setAttribute('data-monster-error', `${this.id}: ${msg}`);
        }
      }
      // Ensure root remains positioned and visible
      this.mesh.root.position.copy(this.lastGoodPos);
      this.mesh.root.visible = true;
    }
  }

  private updateInternal(
    dt: number,
    snapshot: MonsterSnapshot,
    ground: GroundGrid,
    camera: Camera,
  ): void {
    // 0. Finite checks at sim-to-presentation boundary
    const isFinitePos =
      Number.isFinite(snapshot.pos.x) &&
      Number.isFinite(snapshot.pos.y) &&
      Number.isFinite(snapshot.pos.z);
    const isFiniteYaw = Number.isFinite(snapshot.yaw);
    const isFiniteVel =
      Number.isFinite(snapshot.vel.x) &&
      Number.isFinite(snapshot.vel.z);
    const isFiniteScale = Number.isFinite(this.mesh.root.scale.x);

    if (!isFinitePos || !isFiniteYaw || !isFiniteVel || !isFiniteScale) {
      this.nonFiniteCount++;
      this.nonFiniteDetected = true;
      if (!this.hasLoggedNonFinite) {
        console.warn(
          `[MonsterBody] Non-finite value detected for ${this.id}: pos=(${snapshot.pos.x}, ${snapshot.pos.y}, ${snapshot.pos.z}), yaw=${snapshot.yaw}. Resetting to last good finite state.`,
        );
        this.hasLoggedNonFinite = true;
      }
      snapshot.pos.x = this.lastGoodPos.x;
      snapshot.pos.y = this.lastGoodPos.y;
      snapshot.pos.z = this.lastGoodPos.z;
      snapshot.yaw = this.lastGoodYaw;
      snapshot.vel.x = 0;
      snapshot.vel.z = 0;
    }

    const joints = this.mesh.joints;

    // 1. Depth placement: root y follows GroundGrid.heightAt and sits so shoulders clear water by >= 0.35m
    const rawGroundY = ground.heightAt(snapshot.pos.x, snapshot.pos.z);
    const groundY = Number.isFinite(rawGroundY) ? rawGroundY : -0.9;
    const waterLevel = this.water ? this.water.currentWaterY : 0.0;
    // Shoulders are 1.4m above root in hunched gait; ensure shoulders clear surface by >= 0.35m
    const minRootYForShoulders = waterLevel + 0.35 - 1.40;
    const finalRootY = Math.max(groundY, minRootYForShoulders);

    this.mesh.root.position.set(snapshot.pos.x, finalRootY, snapshot.pos.z);
    this.currentYaw += (snapshot.yaw - this.currentYaw) * Math.min(1.0, dt * 10.0);
    this.mesh.root.rotation.y = this.currentYaw;

    this.lastGoodPos.copy(this.mesh.root.position);
    this.lastGoodYaw = this.currentYaw;

    const speed = Math.hypot(snapshot.vel.x, snapshot.vel.z);
    _worldRoot.copy(this.mesh.root.position);

    // 2. Gait update & Limb target placement
    this.gait.update(dt, speed, _worldRoot, this.currentYaw, ground, this.onGaitPlant);

    // 3. Solve IK for Arms (shoulder -> elbow -> hand)
    // Arm length: 0.55m (upper) + 0.60m (forearm) = 1.15m
    joints.shoulderL.getWorldPosition(_tempShL);
    MonsterIKSolver.solveTwoBone(_tempShL, this.gait.handL.pos, _poleArmL, 0.55, 0.60, _tempMid);
    _tempLocal.copy(_tempMid);
    joints.elbowL.parent!.worldToLocal(_tempLocal);
    joints.elbowL.position.copy(_tempLocal);
    _tempLocal.copy(this.gait.handL.pos);
    joints.handL.parent!.worldToLocal(_tempLocal);
    joints.handL.position.copy(_tempLocal);

    joints.shoulderR.getWorldPosition(_tempShR);
    MonsterIKSolver.solveTwoBone(_tempShR, this.gait.handR.pos, _poleArmR, 0.55, 0.60, _tempMid);
    _tempLocal.copy(_tempMid);
    joints.elbowR.parent!.worldToLocal(_tempLocal);
    joints.elbowR.position.copy(_tempLocal);
    _tempLocal.copy(this.gait.handR.pos);
    joints.handR.parent!.worldToLocal(_tempLocal);
    joints.handR.position.copy(_tempLocal);

    // 4. Solve IK for Legs (hip -> knee -> foot)
    // Leg length: 0.45m (thigh) + 0.45m (shin) = 0.90m
    joints.hipL.getWorldPosition(_tempHpL);
    MonsterIKSolver.solveTwoBone(_tempHpL, this.gait.footL.pos, _poleLegL, 0.45, 0.45, _tempMid);
    _tempLocal.copy(_tempMid);
    joints.kneeL.parent!.worldToLocal(_tempLocal);
    joints.kneeL.position.copy(_tempLocal);
    _tempLocal.copy(this.gait.footL.pos);
    joints.footL.parent!.worldToLocal(_tempLocal);
    joints.footL.position.copy(_tempLocal);

    joints.hipR.getWorldPosition(_tempHpR);
    MonsterIKSolver.solveTwoBone(_tempHpR, this.gait.footR.pos, _poleLegR, 0.45, 0.45, _tempMid);
    _tempLocal.copy(_tempMid);
    joints.kneeR.parent!.worldToLocal(_tempLocal);
    joints.kneeR.position.copy(_tempLocal);
    _tempLocal.copy(this.gait.footR.pos);
    joints.footR.parent!.worldToLocal(_tempLocal);
    joints.footR.position.copy(_tempLocal);

    // 5. Spine FK chain & Bounding sway
    for (let i = 0; i < joints.spine.length; i++) {
      const sp = joints.spine[i]!;
      sp.rotation.x = this.gait.spinePitch * 0.2;
      sp.rotation.z = this.gait.spineRoll * 0.15;
    }

    // 6. Rearing animation (up to 55 deg = 0.96 rad when roaring or alerted)
    this.currentRearing += (snapshot.rearingT - this.currentRearing) * Math.min(1.0, dt * 6.0);
    joints.torso.rotation.x = Math.PI / 4 - this.currentRearing * 0.96;

    // 7. Jaw animation (opens up to 55 deg = 0.96 rad)
    this.currentJawOpen += (snapshot.jawOpenT - this.currentJawOpen) * Math.min(1.0, dt * 8.0);
    joints.jaw.rotation.x = -Math.PI / 6 + this.currentJawOpen * 0.96;

    // 8. Ear-fins track sound direction with spring twitch
    const earDelta = snapshot.earAngle - this.currentYaw;
    joints.earLeft.rotation.y = earDelta * 0.6 + Math.sin(snapshot.pos.x * 2.0) * 0.1;
    joints.earRight.rotation.y = earDelta * 0.6 - Math.sin(snapshot.pos.z * 2.0) * 0.1;

    // 8b. Pose modifications for distinct readable silhouettes at 25m:
    if (snapshot.isListening || snapshot.state === 'DORMANT') {
      // Listening / Dormant: head tilts, ear fins twitch
      joints.head.rotation.z = 0.35;
      joints.head.rotation.x = -0.15;
      joints.neck.rotation.x = 0.0;
      joints.neck.rotation.y = 0.0;
    } else if (snapshot.state === 'INVESTIGATE') {
      // Investigating: sniffing water surface, neck and head lowered down to water
      joints.neck.rotation.x = 0.45;
      joints.head.rotation.x = 0.55;
      joints.head.rotation.z = 0.0;
      joints.neck.rotation.y = 0.0;
    } else if (snapshot.state === 'BLOCKED') {
      // Blocked / pacing at edge: restless agitated neck scan
      joints.neck.rotation.x = 0.15;
      joints.neck.rotation.y = Math.sin(this.breathPhase * 3.0) * 0.35;
      joints.head.rotation.z = 0.0;
    } else if (snapshot.state === 'LURK') {
      // Lurk: predatory crouch, tense head posture
      joints.torso.rotation.x = Math.PI / 4 + 0.15;
      joints.neck.rotation.x = 0.25;
      joints.head.rotation.z = 0.0;
      joints.neck.rotation.y = 0.0;
    } else {
      joints.neck.rotation.x = 0.0;
      joints.neck.rotation.y = 0.0;
      joints.head.rotation.z = 0.0;
    }

    // 8c. V-wake and ripple trail emission when moving in water
    if (this.water && speed > 0.4) {
      this.wakeTimer += dt;
      if (this.wakeTimer >= 0.15) {
        this.wakeTimer = 0;
        this.water.wakes.addWake(
          snapshot.pos.x,
          snapshot.pos.z,
          snapshot.vel.x / speed,
          snapshot.vel.z / speed,
          speed,
          0.85,
          1.2,
          5.0,
        );
      }
    }

    // 9. Secondary breathing motion (torso scale +-1.5%)
    this.breathPhase += dt * (snapshot.state === 'ALERTED' || snapshot.state === 'HUNT' ? 4.0 : 1.2);
    const breathScale = 1.0 + Math.sin(this.breathPhase) * 0.015;
    joints.torso.scale.set(breathScale, breathScale, breathScale);

    // 10. Distance-based LOD
    const distToCam = this.mesh.root.position.distanceTo(camera.position);
    this.mesh.setLOD(distToCam);

    // 11. Fog visibility rule: never set visible = false unless transmittance < 0.01 AND distance > 60m
    const density = this.fogDensity > 0 ? this.fogDensity : 0.045;
    const transmittance = Math.exp(-Math.pow(density * distToCam, 2));
    if (distToCam > 60.0 && transmittance < 0.01) {
      this.mesh.root.visible = false;
    } else {
      this.mesh.root.visible = true;
    }
  }

  reloadProceduralSkin(): void {
    try {
      while (this.mesh.root.children.length > 0) {
        const child = this.mesh.root.children[0]!;
        this.mesh.root.remove(child);
      }
      this.mesh.dispose();

      const fresh = new MonsterMeshHierarchy(this.scale, this.tint);
      while (fresh.root.children.length > 0) {
        const child = fresh.root.children[0]!;
        fresh.root.remove(child);
        this.mesh.root.add(child);
      }
      (this.mesh as { joints: unknown }).joints = fresh.joints;
      (this.mesh as { lod0: unknown }).lod0 = fresh.lod0;
      (this.mesh as { lod1: unknown }).lod1 = fresh.lod1;

      this.mesh.root.position.copy(this.lastGoodPos);
      this.mesh.root.rotation.y = this.lastGoodYaw;
      this.mesh.root.scale.set(this.scale, this.scale, this.scale);
      this.mesh.root.visible = true;
      this.skinError = null;
      this.updateErrorCount = 0;
      this.lastUpdateError = null;
    } catch (err: unknown) {
      console.error(`[MonsterBody] Failed to reload procedural skin for ${this.id}:`, err);
    }
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

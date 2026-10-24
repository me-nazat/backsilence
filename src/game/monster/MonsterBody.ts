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

  constructor(
    id: string,
    scale = 1.0,
    tint = '#7a4a38',
    water?: WaterSystem,
    audio?: AudioEngine,
  ) {
    this.id = id;
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
    const joints = this.mesh.joints;

    // 1. Root Position & Orientation
    this.mesh.root.position.set(snapshot.pos.x, snapshot.pos.y, snapshot.pos.z);
    this.currentYaw += (snapshot.yaw - this.currentYaw) * Math.min(1.0, dt * 10.0);
    this.mesh.root.rotation.y = this.currentYaw;

    const speed = Math.hypot(snapshot.vel.x, snapshot.vel.z);
    _worldRoot.set(snapshot.pos.x, snapshot.pos.y, snapshot.pos.z);

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

    // 9. Secondary breathing motion (torso scale +-1.5%)
    this.breathPhase += dt * (snapshot.state === 'ALERTED' || snapshot.state === 'HUNT' ? 4.0 : 1.2);
    const breathScale = 1.0 + Math.sin(this.breathPhase) * 0.015;
    joints.torso.scale.set(breathScale, breathScale, breathScale);

    // 10. Distance-based LOD
    const distToCam = this.mesh.root.position.distanceTo(camera.position);
    this.mesh.setLOD(distToCam);
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

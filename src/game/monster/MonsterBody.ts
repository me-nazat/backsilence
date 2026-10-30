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
  private undulationPhase = 0;
  private wakeTimer = 0;

  // Hardening and Diagnostic Probe fields (Phase B)
  skinType: 'model' | 'procedural' = 'procedural';
  skinError: string | null = null;
  skinPreference: 'auto' | 'model' | 'procedural' = 'auto';
  failed = false;
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
    tint = '#6b5f40',
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

  public readonly maxJawOpen = 1.15;

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
  private plantCount = 0;
  private attackTimer = 0;

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

      // Prompt 3.13: Wire monster_wade every 4th plant so the creature audibly wades
      this.plantCount = (this.plantCount + 1) % 4;
      if (this.plantCount === 0) {
        this.audio.play('monster_wade', {
          position: plantPos,
          gain: force * 0.85,
        });
      }
    }
  };

  setSkinPreference(choice: 'auto' | 'model' | 'procedural'): void {
    this.skinPreference = choice;
    if (choice === 'procedural') {
      this.skinType = 'procedural';
      return;
    }
    if (choice === 'model') {
      import('../creatures/MonsterSkin.js')
        .then(({ validateAndFetchGlb }) => {
          validateAndFetchGlb('models/thumper.glb', 8000)
            .then((res) => {
              if (!res.ok) {
                console.log(`[MonsterSkin] GLB load rejected (${res.reason}), selected ProceduralSkin fallback`);
                this.skinError = res.reason ?? 'Unknown GLB error';
                this.skinType = 'procedural';
              } else {
                this.skinType = 'model';
                this.skinError = null;
              }
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.log(`[MonsterSkin] GLB load rejected (${msg}), selected ProceduralSkin fallback`);
              this.skinError = msg;
              this.skinType = 'procedural';
            });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[MonsterSkin] GLB load rejected (${msg}), selected ProceduralSkin fallback`);
          this.skinError = msg;
          this.skinType = 'procedural';
        });
    }
  }

  update(
    dt: number,
    snapshot: MonsterSnapshot,
    ground: GroundGrid,
    camera: Camera,
  ): void {
    try {
      this.updateInternal(dt, snapshot, ground, camera);
      this.updateErrorCount = 0;
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
      if (this.updateErrorCount >= 3) {
        this.mesh.root.visible = false;
        this.failed = true;
      } else {
        // Ensure root remains positioned and visible
        this.mesh.root.position.copy(this.lastGoodPos);
        this.mesh.root.visible = true;
      }
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
    this.mesh.setWaterLevel(waterLevel);
    
    // Standing wade pose: torso + head sit >= 1.2m above waterline
    const isWadeStand = snapshot.isSighting || ((snapshot.state === 'WANDER' || snapshot.state === 'DORMANT') && rawGroundY < waterLevel);
    const minRootY = isWadeStand ? (waterLevel + 1.25 - 1.40) : (waterLevel + 0.35 - 1.40);
    const finalRootY = Math.max(groundY, minRootY);

    let finalPosX = snapshot.pos.x;
    let finalPosZ = snapshot.pos.z;

    // Minimum on-screen presence guarantee during scheduled sightings (>= 8% viewport height)
    if (snapshot.isSighting) {
      const distToCam = Math.hypot(finalPosX - camera.position.x, finalPosZ - camera.position.z);
      const fovDeg = 'fov' in camera && typeof (camera as { fov: number }).fov === 'number' ? (camera as { fov: number }).fov : 60;
      const fovRad = (fovDeg * Math.PI) / 360;
      const maxDistFor8Pct = 2.2 / (2.0 * Math.tan(fovRad) * 0.08);
      if (distToCam > maxDistFor8Pct && distToCam > 0.1) {
        const factor = maxDistFor8Pct / distToCam;
        finalPosX = camera.position.x + (finalPosX - camera.position.x) * factor;
        finalPosZ = camera.position.z + (finalPosZ - camera.position.z) * factor;
      }
    }

    this.mesh.root.position.set(finalPosX, finalRootY, finalPosZ);
    this.currentYaw += (snapshot.yaw - this.currentYaw) * Math.min(1.0, dt * 10.0);
    this.mesh.root.rotation.y = this.currentYaw;

    this.lastGoodPos.copy(this.mesh.root.position);
    this.lastGoodYaw = this.currentYaw;

    const speed = Math.hypot(snapshot.vel.x, snapshot.vel.z);
    _worldRoot.copy(this.mesh.root.position);

    // 2. Gait update & Limb target placement
    this.gait.update(dt, speed, _worldRoot, this.currentYaw, ground, this.onGaitPlant);

    // 3. Solve IK for Arms (shoulder -> elbow -> hand)
    // Arm length: 0.62m (upper) + 0.58m (forearm) = 1.20m (Prompt 7.3)
    joints.shoulderL.getWorldPosition(_tempShL);
    MonsterIKSolver.solveTwoBone(_tempShL, this.gait.handL.pos, _poleArmL, 0.62, 0.58, _tempMid);
    _tempLocal.copy(_tempMid);
    joints.elbowL.parent!.worldToLocal(_tempLocal);
    joints.elbowL.position.copy(_tempLocal);
    _tempLocal.copy(this.gait.handL.pos);
    joints.handL.parent!.worldToLocal(_tempLocal);
    joints.handL.position.copy(_tempLocal);

    joints.shoulderR.getWorldPosition(_tempShR);
    MonsterIKSolver.solveTwoBone(_tempShR, this.gait.handR.pos, _poleArmR, 0.62, 0.58, _tempMid);
    _tempLocal.copy(_tempMid);
    joints.elbowR.parent!.worldToLocal(_tempLocal);
    joints.elbowR.position.copy(_tempLocal);
    _tempLocal.copy(this.gait.handR.pos);
    joints.handR.parent!.worldToLocal(_tempLocal);
    joints.handR.position.copy(_tempLocal);

    // 4. Solve IK for Legs (hip -> knee -> foot)
    // Leg length: 0.40m (thigh) + 0.38m (shin) = 0.78m (Prompt 7.3)
    joints.hipL.getWorldPosition(_tempHpL);
    MonsterIKSolver.solveTwoBone(_tempHpL, this.gait.footL.pos, _poleLegL, 0.40, 0.38, _tempMid);
    _tempLocal.copy(_tempMid);
    joints.kneeL.parent!.worldToLocal(_tempLocal);
    joints.kneeL.position.copy(_tempLocal);
    _tempLocal.copy(this.gait.footL.pos);
    joints.footL.parent!.worldToLocal(_tempLocal);
    joints.footL.position.copy(_tempLocal);

    joints.hipR.getWorldPosition(_tempHpR);
    MonsterIKSolver.solveTwoBone(_tempHpR, this.gait.footR.pos, _poleLegR, 0.40, 0.38, _tempMid);
    _tempLocal.copy(_tempMid);
    joints.kneeR.parent!.worldToLocal(_tempLocal);
    joints.kneeR.position.copy(_tempLocal);
    _tempLocal.copy(this.gait.footR.pos);
    joints.footR.parent!.worldToLocal(_tempLocal);
    joints.footR.position.copy(_tempLocal);

    // 5. Spine FK chain & organic traveling undulation
    this.undulationPhase += dt * (snapshot.state === 'ATTACK' || snapshot.state === 'HUNT' ? 8.5 : speed > 0.4 ? 5.2 : 2.4);
    const isAgitated = snapshot.state === 'ATTACK' || snapshot.state === 'HUNT';
    const spinePitchBase = isAgitated ? 0.35 : (this.gait.spinePitch * 0.2);
    for (let i = 0; i < joints.spine.length; i++) {
      const sp = joints.spine[i]!;
      const phaseOffset = i * 0.75;
      const wave = Math.sin(this.undulationPhase - phaseOffset);
      const waveCos = Math.cos(this.undulationPhase - phaseOffset);
      sp.rotation.y = wave * (isAgitated ? 0.16 : 0.08);
      sp.rotation.z = (this.gait.spineRoll * 0.15) + waveCos * (isAgitated ? 0.10 : 0.05);
      sp.rotation.x = spinePitchBase + Math.sin(this.breathPhase * 1.5 - phaseOffset * 0.5) * 0.04;
    }

    // 6. Rearing animation (up to 55 deg = 0.96 rad when roaring or alerted)
    this.currentRearing += (snapshot.rearingT - this.currentRearing) * Math.min(1.0, dt * 6.0);
    joints.torso.rotation.x = Math.PI / 4 - this.currentRearing * 0.96;

    // 7. Jaw animation (opens up to 1.15 rad = ~66 deg - Prompt 7.2)
    this.currentJawOpen += (snapshot.jawOpenT - this.currentJawOpen) * Math.min(1.0, dt * 8.0);
    joints.jaw.rotation.x = -Math.PI / 6 + this.currentJawOpen * 1.15;

    // 8. Ear-fins track sound direction with spring twitch on local Y axis (Prompt 7.7)
    const earDelta = snapshot.earAngle - this.currentYaw;
    joints.earLeft.rotation.y = earDelta * 0.6 + Math.sin(snapshot.pos.x * 2.0) * 0.1;
    joints.earRight.rotation.y = earDelta * 0.6 - Math.sin(snapshot.pos.z * 2.0) * 0.1;

    // Track attack telegraph timer
    if (snapshot.state === 'ATTACK') {
      this.attackTimer += dt;
    } else {
      this.attackTimer = 0;
    }

    // 8b. Pose modifications for distinct readable silhouettes at 25m:
    if (snapshot.state === 'ATTACK' && this.attackTimer < 0.8) {
      // Telegraph: 0.8s before attack, creature freezes, head rises, water dead flat (Prompt 7.7)
      joints.torso.rotation.x = -0.15;
      joints.neck.rotation.x = -0.30;
      joints.head.rotation.x = 0.25;
      joints.head.rotation.z = 0.0;
      joints.neck.rotation.y = 0.0;
      joints.jaw.rotation.x = -Math.PI / 6 + 0.35 * 1.15;
    } else if (snapshot.state === 'ATTACK' || snapshot.state === 'HUNT') {
      // Aggressive surging forward lunge: torso pitched forward, jaws snapping, faster gait
      joints.torso.rotation.x = 0.38;
      joints.neck.rotation.x = 0.15;
      joints.head.rotation.x = -0.10;
      joints.head.rotation.z = 0.0;
      const dx = camera.position.x - finalPosX;
      const dz = camera.position.z - finalPosZ;
      const angleToCam = Math.atan2(dx, -dz) - this.currentYaw;
      joints.head.rotation.y = Math.max(-0.6, Math.min(0.6, angleToCam));
      this.currentJawOpen = Math.max(0.65, this.currentJawOpen);
    } else if (snapshot.state === 'ALERTED') {
      // Alerted pre-charge pose: body goes rigid, head swings to face player, jaw opens 30% (Prompt 7.7)
      joints.torso.rotation.x = 0.05;
      joints.torso.rotation.z = 0.0;
      joints.neck.rotation.x = -0.10;
      const dx = camera.position.x - finalPosX;
      const dz = camera.position.z - finalPosZ;
      const angleToCam = Math.atan2(dx, -dz) - this.currentYaw;
      joints.head.rotation.y = Math.max(-0.85, Math.min(0.85, angleToCam));
      joints.head.rotation.x = 0.12;
      joints.head.rotation.z = 0.0;
      this.currentJawOpen = Math.max(0.30, this.currentJawOpen);
    } else if (isWadeStand && snapshot.state === 'WANDER') {
      // Standing wade posture: erect torso, elevated head looking out
      joints.torso.rotation.x = 0.08;
      joints.neck.rotation.x = -0.05;
      joints.head.rotation.x = 0.05;
      joints.head.rotation.z = 0.0;
      joints.neck.rotation.y = 0.0;
    } else if (snapshot.isListening || snapshot.state === 'DORMANT') {
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

    // 8c. V-wake and ripple trail emission when moving in water (Prompt 7.8: 0.6 / 0.9 / 3.6)
    const isAttackingTelegraph = snapshot.state === 'ATTACK' && this.attackTimer < 0.8;
    if (this.water && speed > 0.25 && !isAttackingTelegraph) {
      this.wakeTimer += dt;
      const isFast = speed > 1.8 || snapshot.state === 'ATTACK' || snapshot.state === 'HUNT';
      const wakeInterval = isFast ? 0.09 : 0.15;
      if (this.wakeTimer >= wakeInterval) {
        this.wakeTimer = 0;
        this.water.wakes.addWake(
          snapshot.pos.x,
          snapshot.pos.z,
          snapshot.vel.x / speed,
          snapshot.vel.z / speed,
          speed,
          0.6,
          0.9,
          3.6,
        );
        // Continuous displacement ripple rings around monster
        this.rippleEvent.position.x = snapshot.pos.x;
        this.rippleEvent.position.y = waterLevel;
        this.rippleEvent.position.z = snapshot.pos.z;
        this.rippleEvent.strength = Math.min(1.0, 0.35 + speed * 0.12);
        this.rippleEvent.t = performance.now() * 0.001;
        this.water.onRipple(this.rippleEvent);

        // Emit dynamic water splashes when charging/sprinting
        if (isFast) {
          _tempMid.set(snapshot.pos.x, waterLevel, snapshot.pos.z);
          this.water.onSplash(_tempMid, Math.min(1.0, speed * 0.22), true);
        }
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
      const parent = this.mesh.root.parent; // remember the parent
      this.mesh.root.removeFromParent(); // detach only from the parent
      this.mesh.dispose(); // now safe: root is already orphaned
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
      if (parent) parent.add(this.mesh.root); // <-- re-attach. THIS IS THE FIX.
      this.skinError = null;
      this.updateErrorCount = 0;
      this.lastUpdateError = null;
      this.nonFiniteCount = 0;
      this.nonFiniteDetected = false;
      this.hasLoggedNonFinite = false;
    } catch (err: unknown) {
      console.error(`[MonsterBody] Failed to reload procedural skin for ${this.id}:`, err);
    }
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

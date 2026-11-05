/* ── MonsterAnimator.ts ─────────────────────────────────────────────────────
 *  Procedural skeletal animation controller for the articulated MonsterRig.
 *  Smoothly blends joint rotations at 60 FPS using damped springs and keyframe states:
 *  - State 1: PROWL_IDLE & PROWL_WALK (0.0 – 3.0 m/s):
 *      upperChest.rotation.x = 0.65 (hunched over water), 4-beat diagonal gait,
 *      head listening pans (neck.y = sin(t*1.5)*0.35, head.z = cos(t*1.1)*0.18), 18° jaw gap.
 *  - State 2: GALLOP_CHARGE (high speed / 11.5 m/s):
 *      Rotary bounding gallop, forelimbs reach high (shoulder.x = -1.25) slamming down (+0.85),
 *      torso heave (pelvis.y = baseWaterY + abs(sin(phase))*0.22),
 *      triggers 15 white water spray particles + expanding white foam ring at each forelimb slam.
 *  - State 3: REAR_UP_ROAR (1.75s duration):
 *      0.0s – 0.35s: Brakes, pitches upright (upperChest.x: 0.65 -> -0.25), arms wide (±0.95), jaws 75° (±0.65 rad)
 *      0.35s – 1.35s: Violently thrashes head/torso (neck.y = sin(t*22)*0.28, head.z = cos(t*18)*0.22), camera shake
 *      1.35s – 1.75s: Drops back to all fours (upperChest.x -> 0.65), closes jaws to 0.15 rad, heavy splash ring
 *  - State 4: JUMPSCARE_GRAB (0.85s duration):
 *      Clawed hands raise up framing left/right edges of viewport, maw hinges wide (±0.65 rad), 0.045m screen shake.
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3, MathUtils } from 'three';
import type { MonsterRig } from './MonsterRig.js';

export type MonsterAnimState =
  | 'PROWL_IDLE'
  | 'PROWL_WALK'
  | 'GALLOP_CHARGE'
  | 'REAR_UP_ROAR'
  | 'JUMPSCARE_GRAB'
  | 'TRENCH_CLAW_LUNGE'
  | 'WADE_STALK'
  | 'LISTEN_FREEZE'
  | 'TRENCH_PACE'
  | 'LUNGE'
  | 'JUMPSCARE_BRACKET'
  | 'wade-stalk'
  | 'listen-freeze'
  | 'trench-pace'
  | 'lunge'
  | 'jumpscare-bracket';

export interface MonsterAnimatorCallbacks {
  onForelimbSlam?: (pos: Vector3, force: number) => void;
  onCameraShake?: (intensity: number) => void;
  onRearUpSplash?: (pos: Vector3) => void;
}

const _scratchPosL = new Vector3();
const _scratchPosR = new Vector3();

export class MonsterAnimator {
  readonly rig: MonsterRig;
  private state: MonsterAnimState = 'PROWL_IDLE';
  private phase = 0;
  private animTime = 0;
  private roarTimer = 0;
  private jumpscareTimer = 0;
  private trenchLungeTimer = 0;

  // Smoothing buffers
  private chestPitch = 0.65;
  private chestRoll = 0.0;
  private pelvisHeave = 0.0;
  private jawSplit = 0.15; // 18° prowl gap

  // Stride slam tracking
  private prevSlamL = false;
  private prevSlamR = false;

  public callbacks: MonsterAnimatorCallbacks = {};

  constructor(rig: MonsterRig, callbacks?: MonsterAnimatorCallbacks) {
    this.rig = rig;
    if (callbacks) this.callbacks = callbacks;
  }

  getState(): MonsterAnimState {
    return this.state;
  }

  triggerRearUpRoar(): void {
    if (this.state === 'JUMPSCARE_GRAB') return;
    this.state = 'REAR_UP_ROAR';
    this.roarTimer = 0.0;
  }

  isRoaring(): boolean {
    return this.state === 'REAR_UP_ROAR';
  }

  triggerJumpscareGrab(): void {
    this.state = 'JUMPSCARE_GRAB';
    this.jumpscareTimer = 0.0;
  }

  isJumpscareGrab(): boolean {
    return this.state === 'JUMPSCARE_GRAB';
  }

  triggerTrenchClawLunge(): void {
    if (this.state === 'JUMPSCARE_GRAB') return;
    this.state = 'TRENCH_CLAW_LUNGE';
    this.trenchLungeTimer = 0.0;
    this.jawSplit = 0.60;
    this.rig.setJawSplit(0.60);
  }

  isTrenchClawLunge(): boolean {
    return this.state === 'TRENCH_CLAW_LUNGE';
  }

  setState(name: MonsterAnimState | string): void {
    this.state = name as MonsterAnimState;
  }

  triggerWadeStalk(): void {
    this.state = 'WADE_STALK';
  }

  isWadeStalk(): boolean {
    return this.state === 'WADE_STALK' || (this.state as string) === 'wade-stalk';
  }

  triggerListenFreeze(): void {
    this.state = 'LISTEN_FREEZE';
  }

  isListenFreeze(): boolean {
    return this.state === 'LISTEN_FREEZE' || (this.state as string) === 'listen-freeze';
  }

  triggerTrenchPace(): void {
    this.state = 'TRENCH_PACE';
  }

  isTrenchPace(): boolean {
    return this.state === 'TRENCH_PACE' || (this.state as string) === 'trench-pace';
  }

  triggerLunge(): void {
    this.state = 'LUNGE';
  }

  isLunge(): boolean {
    return this.state === 'LUNGE' || (this.state as string) === 'lunge';
  }

  triggerJumpscareBracket(): void {
    this.state = 'JUMPSCARE_BRACKET';
  }

  isJumpscareBracket(): boolean {
    return this.state === 'JUMPSCARE_BRACKET' || (this.state as string) === 'jumpscare-bracket';
  }

  update(
    dt: number,
    speed: number,
    simState: string,
    cameraPos?: Vector3,
    baseWaterY = 0.0,
  ): void {
    this.animTime += dt;
    const t = this.animTime;

    // ──────────────────────────────────────────────────────────────────────────
    // 0. State Resolution
    // ──────────────────────────────────────────────────────────────────────────
    if (this.state === 'REAR_UP_ROAR') {
      this.roarTimer += dt;
      if (this.roarTimer >= 1.75) {
        this.state = speed > 3.5 ? 'GALLOP_CHARGE' : speed > 0.2 ? 'PROWL_WALK' : 'PROWL_IDLE';
        this.roarTimer = 0.0;
      }
    } else if (this.state === 'JUMPSCARE_GRAB') {
      this.jumpscareTimer += dt;
    } else if (this.state === 'TRENCH_CLAW_LUNGE') {
      this.trenchLungeTimer += dt;
      if (this.trenchLungeTimer >= 1.80) {
        this.state = speed > 3.5 ? 'GALLOP_CHARGE' : speed > 0.2 ? 'PROWL_WALK' : 'PROWL_IDLE';
        this.trenchLungeTimer = 0.0;
      }
    } else if (
      this.state === 'WADE_STALK' ||
      (this.state as string) === 'wade-stalk' ||
      this.state === 'LISTEN_FREEZE' ||
      (this.state as string) === 'listen-freeze' ||
      this.state === 'TRENCH_PACE' ||
      (this.state as string) === 'trench-pace' ||
      this.state === 'LUNGE' ||
      (this.state as string) === 'lunge' ||
      this.state === 'JUMPSCARE_BRACKET' ||
      (this.state as string) === 'jumpscare-bracket'
    ) {
      if (simState === 'ARRIVE_AND_ROAR') {
        this.state = 'REAR_UP_ROAR';
        this.roarTimer = 0.0;
      } else if (simState === 'JUMPSCARE_GRAB') {
        this.state = 'JUMPSCARE_GRAB';
        this.jumpscareTimer = 0.0;
      } else if (simState === 'TRENCH_CLAW_LUNGE') {
        this.state = 'TRENCH_CLAW_LUNGE';
        this.trenchLungeTimer = 0.0;
      }
    } else {
      // Automatic state selection based on speed and sim state
      if (simState === 'TRENCH_CLAW_LUNGE') {
        this.state = 'TRENCH_CLAW_LUNGE';
        this.trenchLungeTimer = 0.0;
      } else if (simState === 'ARRIVE_AND_ROAR') {
        this.state = 'REAR_UP_ROAR';
        this.roarTimer = 0.0;
      } else if (simState === 'WADE_STALK' || simState === 'wade-stalk') {
        this.state = 'WADE_STALK';
      } else if (simState === 'LISTEN_FREEZE' || simState === 'listen-freeze') {
        this.state = 'LISTEN_FREEZE';
      } else if (simState === 'TRENCH_PACE' || simState === 'trench-pace') {
        this.state = 'TRENCH_PACE';
      } else if (simState === 'LUNGE' || simState === 'lunge') {
        this.state = 'LUNGE';
      } else if (simState === 'JUMPSCARE_BRACKET' || simState === 'jumpscare-bracket') {
        this.state = 'JUMPSCARE_BRACKET';
      } else if (simState === 'ATTACK' || simState === 'HUNT' || simState === 'ALERT_AND_CHARGE' || speed > 3.5) {
        this.state = 'GALLOP_CHARGE';
      } else if (speed > 0.15) {
        this.state = 'PROWL_WALK';
      } else {
        this.state = 'PROWL_IDLE';
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Animation Logic Per State
    // ──────────────────────────────────────────────────────────────────────────
    switch (this.state) {
      case 'PROWL_IDLE': {
        // Hunched low over water
        this.chestPitch = MathUtils.damp(this.chestPitch, 0.65, 8.0, dt);
        this.chestRoll = MathUtils.damp(this.chestRoll, 0.0, 8.0, dt);
        // Breathing rhythm pulsing jaw petals open and shut (0.12 to 0.28 rad)
        this.jawSplit = 0.12 + (Math.sin(t * 1.8) * 0.5 + 0.5) * 0.16;

        this.rig.upperChest.rotation.x = this.chestPitch + Math.sin(t * 1.8) * 0.02; // breathing
        this.rig.upperChest.rotation.z = this.chestRoll;
        this.rig.upperChest.rotation.y = 0.0;
        this.rig.lowerSpine.rotation.y = 0.0;

        // Head slowly pans left and right listening to water (±28° = 0.49 rad)
        this.rig.neck.rotation.y = Math.sin(t * 1.5) * 0.49;
        this.rig.neck.rotation.x = -0.15;
        this.rig.headGroup.rotation.z = Math.cos(t * 1.1) * 0.18;
        this.rig.headGroup.rotation.x = 0.10;
        this.rig.headGroup.rotation.y = Math.sin(t * 1.5) * 0.15;

        // Limbs in resting quadruped stance
        this.rig.shoulderL.rotation.set(0.20, 0, 0.05);
        this.rig.elbowL.rotation.set(-0.45, 0, 0);
        this.rig.shoulderR.rotation.set(0.20, 0, -0.05);
        this.rig.elbowR.rotation.set(-0.45, 0, 0);

        this.rig.hipL.rotation.set(-0.25, 0, 0.10);
        this.rig.kneeL.rotation.set(0.55, 0, 0);
        this.rig.hipR.rotation.set(-0.25, 0, -0.10);
        this.rig.kneeR.rotation.set(0.55, 0, 0);

        this.rig.pelvis.position.y = 0.70;
        this.rig.setJawSplit(this.jawSplit);
        break;
      }

      case 'PROWL_WALK': {
        // Velocity-locked 4-beat diagonal gait (stride frequency locked to world speed)
        this.phase += speed * dt * 2.1;
        const p = this.phase;

        this.chestPitch = MathUtils.damp(this.chestPitch, 0.65, 8.0, dt);
        // Heavy shoulder and hip roll (±0.45 rad)
        this.chestRoll = Math.sin(p) * 0.45;
        // Breathing jaw rhythm
        this.jawSplit = 0.12 + (Math.sin(t * 1.8) * 0.5 + 0.5) * 0.16;

        this.rig.upperChest.rotation.x = this.chestPitch;
        this.rig.upperChest.rotation.z = this.chestRoll;
        // Lateral spine undulation (sin x 0.18)
        this.rig.upperChest.rotation.y = Math.sin(p) * 0.18;
        this.rig.lowerSpine.rotation.y = Math.sin(p - 0.75) * 0.18;

        // Head pans listening to water (±28° = 0.49 rad)
        this.rig.neck.rotation.y = Math.sin(t * 1.5) * 0.49;
        this.rig.neck.rotation.x = -0.12;
        this.rig.headGroup.rotation.z = Math.cos(t * 1.1) * 0.18;
        this.rig.headGroup.rotation.x = 0.08;

        // Diagonal gait arm rotations with roll coupling
        const armSwingL = Math.sin(p) * 0.45;
        const armSwingR = -armSwingL;

        this.rig.shoulderL.rotation.set(0.25 + armSwingL, 0, 0.08 + Math.sin(p) * 0.45);
        this.rig.elbowL.rotation.set(-0.45 + Math.max(0, -armSwingL) * 0.35, 0, 0);
        this.rig.shoulderR.rotation.set(0.25 + armSwingR, 0, -0.08 - Math.sin(p) * 0.45);
        this.rig.elbowR.rotation.set(-0.45 + Math.max(0, -armSwingR) * 0.35, 0, 0);

        // Hindleg alternating swing with hip roll (±0.45 rad)
        const legSwingL = -armSwingL * 0.75;
        const legSwingR = -legSwingL;

        this.rig.hipL.rotation.set(-0.20 + legSwingL, 0, 0.08 + Math.sin(p) * 0.45);
        this.rig.kneeL.rotation.set(0.50 + Math.max(0, -legSwingL) * 0.30, 0, 0);
        this.rig.hipR.rotation.set(-0.20 + legSwingR, 0, -0.08 - Math.sin(p) * 0.45);
        this.rig.kneeR.rotation.set(0.50 + Math.max(0, -legSwingR) * 0.30, 0, 0);

        this.rig.pelvis.position.y = 0.70 + Math.abs(Math.sin(p * 2.0)) * 0.04;
        this.rig.setJawSplit(this.jawSplit);
        break;
      }

      case 'GALLOP_CHARGE': {
        // High-speed rotary bounding gallop (~11.5 m/s)
        const gallopFreq = Math.max(8.0, speed * 1.25);
        this.phase += gallopFreq * dt;
        const p = this.phase;

        // Forelimbs reaching high out of water (shoulder.rotation.x = -1.25) slamming down (+0.85)
        const armCycle = Math.sin(p);
        const shoulderPitch = armCycle > 0 ? armCycle * 0.85 : armCycle * 1.25;

        this.rig.shoulderL.rotation.set(shoulderPitch, 0, 0.12);
        this.rig.elbowL.rotation.set(armCycle > 0 ? -0.15 : -0.75, 0, 0);
        this.rig.shoulderR.rotation.set(shoulderPitch + Math.sin(p + 0.35) * 0.15, 0, -0.12);
        this.rig.elbowR.rotation.set(armCycle > 0 ? -0.15 : -0.75, 0, 0);

        // Torso heave: pelvis.y = baseWaterY + abs(sin(phase)) * 0.26
        this.pelvisHeave = Math.sin(p) * 0.26;
        this.rig.pelvis.position.y = 0.70 + Math.abs(this.pelvisHeave);

        this.chestPitch = MathUtils.damp(this.chestPitch, 0.45 + Math.sin(p) * 0.22, 12.0, dt);
        this.rig.upperChest.rotation.x = this.chestPitch;
        this.rig.upperChest.rotation.z = Math.sin(p * 0.5) * 0.05;

        // Hindlegs bounding stroke
        const legCycle = Math.cos(p);
        this.rig.hipL.rotation.set(legCycle * 0.55 - 0.20, 0, 0.10);
        this.rig.kneeL.rotation.set(0.60 + Math.max(0, -legCycle) * 0.45, 0, 0);
        this.rig.hipR.rotation.set(legCycle * 0.55 - 0.20, 0, -0.10);
        this.rig.kneeR.rotation.set(0.60 + Math.max(0, -legCycle) * 0.45, 0, 0);

        // Head thrusting forward aggressively
        this.rig.neck.rotation.set(0.25, 0, 0);
        this.rig.headGroup.rotation.set(-0.15, 0, 0);

        // Jaws open wide in hunt/charge
        this.jawSplit = MathUtils.damp(this.jawSplit, 0.45, 10.0, dt);
        this.rig.setJawSplit(this.jawSplit);

        // Detect forelimb slam into water (at shoulderPitch transition to +0.85)
        const isSlamming = armCycle > 0.85;
        if (isSlamming && !this.prevSlamL) {
          if (this.callbacks.onForelimbSlam) {
            this.rig.handL.getWorldPosition(_scratchPosL);
            _scratchPosL.y = baseWaterY;
            this.callbacks.onForelimbSlam(_scratchPosL, 1.0);
          }
        }
        this.prevSlamL = isSlamming;

        const isSlammingR = Math.sin(p + 0.35) > 0.85;
        if (isSlammingR && !this.prevSlamR) {
          if (this.callbacks.onForelimbSlam) {
            this.rig.handR.getWorldPosition(_scratchPosR);
            _scratchPosR.y = baseWaterY;
            this.callbacks.onForelimbSlam(_scratchPosR, 1.0);
          }
        }
        this.prevSlamR = isSlammingR;
        break;
      }

      case 'REAR_UP_ROAR': {
        const rt = this.roarTimer;

        if (rt < 0.35) {
          // 0.0s – 0.35s: Brakes and pitches upright (upperChest.rotation.x: 0.65 -> -0.25),
          // raises arms wide (leftShoulder.z = 0.95, rightShoulder.z = -0.95, claws spread),
          // hinges jaw lobes wide open (±0.65 rad / 75°).
          const prog = rt / 0.35;
          const ease = 1.0 - Math.pow(1.0 - prog, 3);

          this.chestPitch = MathUtils.lerp(0.65, -0.25, ease);
          this.rig.upperChest.rotation.x = this.chestPitch;
          this.rig.upperChest.rotation.y = 0.0;
          this.rig.upperChest.rotation.z = 0.0;

          this.rig.shoulderL.rotation.set(-0.35 * ease, 0, 0.95 * ease);
          this.rig.shoulderR.rotation.set(-0.35 * ease, 0, -0.95 * ease);
          this.rig.elbowL.rotation.set(-0.30 * ease, 0, 0);
          this.rig.elbowR.rotation.set(-0.30 * ease, 0, 0);

          // Hindlegs plant firmly and stand up taller
          this.rig.pelvis.position.y = MathUtils.lerp(0.70, 0.95, ease);
          this.rig.hipL.rotation.set(0.15 * ease, 0, 0.05);
          this.rig.hipR.rotation.set(0.15 * ease, 0, -0.05);

          this.jawSplit = MathUtils.lerp(0.15, 0.65, ease); // flare to 75°
          this.rig.setJawSplit(this.jawSplit);
        } else if (rt < 1.35) {
          // 0.35s – 1.35s: Violently thrashes head/upper torso side-to-side
          // (neck.y = sin(t*22)*0.28, head.z = cos(t*18)*0.22),
          // triggers camera shake (0.015 * clamp(1.0 - dist/10, 0, 1)) and waist ripples.
          this.rig.upperChest.rotation.x = -0.25 + Math.sin(t * 14.0) * 0.05;
          this.rig.upperChest.rotation.z = Math.sin(t * 18.0) * 0.08;

          this.rig.neck.rotation.y = Math.sin(t * 22.0) * 0.28;
          this.rig.neck.rotation.x = -0.20;
          this.rig.headGroup.rotation.z = Math.cos(t * 18.0) * 0.22;
          this.rig.headGroup.rotation.x = 0.25;

          this.rig.shoulderL.rotation.set(-0.35, 0, 0.95 + Math.sin(t * 16.0) * 0.12);
          this.rig.shoulderR.rotation.set(-0.35, 0, -0.95 - Math.sin(t * 16.0) * 0.12);

          this.jawSplit = 0.65 + Math.sin(t * 24.0) * 0.05; // shuddering wide split
          this.rig.setJawSplit(this.jawSplit);

          // Camera shake
          if (this.callbacks.onCameraShake && cameraPos) {
            this.rig.headGroup.getWorldPosition(_scratchPosL);
            const dist = cameraPos.distanceTo(_scratchPosL);
            const shake = 0.015 * Math.max(0.0, Math.min(1.0, 1.0 - dist / 10.0));
            this.callbacks.onCameraShake(shake);
          }
        } else {
          // 1.35s – 1.75s: Drops back to all fours (upperChest.x -> 0.65),
          // closes jaws to 0.15 rad, heavy splash ring.
          const dropProg = (rt - 1.35) / 0.40;
          const dropEase = dropProg * dropProg;

          this.chestPitch = MathUtils.lerp(-0.25, 0.65, dropEase);
          this.rig.upperChest.rotation.x = this.chestPitch;
          this.rig.upperChest.rotation.z = 0.0;
          this.rig.upperChest.rotation.y = 0.0;

          this.rig.shoulderL.rotation.set(0.20, 0, MathUtils.lerp(0.95, 0.05, dropEase));
          this.rig.shoulderR.rotation.set(0.20, 0, MathUtils.lerp(-0.95, -0.05, dropEase));

          this.rig.neck.rotation.y = MathUtils.lerp(this.rig.neck.rotation.y, 0.0, 0.15);
          this.rig.headGroup.rotation.z = MathUtils.lerp(this.rig.headGroup.rotation.z, 0.0, 0.15);

          this.rig.pelvis.position.y = MathUtils.lerp(0.95, 0.70, dropEase);
          this.jawSplit = MathUtils.lerp(0.65, 0.15, dropEase);
          this.rig.setJawSplit(this.jawSplit);

          // Slam down splash at the end of drop
          if (dropProg > 0.90 && this.callbacks.onRearUpSplash) {
            this.rig.rootGroup.getWorldPosition(_scratchPosL);
            _scratchPosL.y = baseWaterY;
            this.callbacks.onRearUpSplash(_scratchPosL);
          }
        }
        break;
      }

      case 'JUMPSCARE_GRAB': {
        // Full-screen 3D grab jumpscare (0.85s):
        // Monster's two long clawed hands raise up framing left and right edges of viewport,
        // split maw hinges wide open into camera lens.
        const jt = this.jumpscareTimer;
        const grabProg = Math.min(1.0, jt / 0.22);
        const ease = 1.0 - Math.pow(1.0 - grabProg, 3);

        this.rig.upperChest.rotation.x = MathUtils.lerp(0.65, 0.15, ease);
        this.rig.neck.rotation.x = MathUtils.lerp(0.0, -0.25, ease);
        this.rig.headGroup.rotation.x = MathUtils.lerp(0.0, 0.20, ease);

        // Hands framing the screen borders
        this.rig.shoulderL.rotation.set(-0.85 * ease, 0.25 * ease, 0.45 * ease);
        this.rig.elbowL.rotation.set(-0.65 * ease, 0, 0);
        this.rig.handL.rotation.set(-0.45 * ease, 0, 0.35 * ease);

        this.rig.shoulderR.rotation.set(-0.85 * ease, -0.25 * ease, -0.45 * ease);
        this.rig.elbowR.rotation.set(-0.65 * ease, 0, 0);
        this.rig.handR.rotation.set(-0.45 * ease, 0, -0.35 * ease);

        // Maw hinges wide open (75° / 0.65 rad)
        this.jawSplit = MathUtils.lerp(0.15, 0.65, ease);
        this.rig.setJawSplit(this.jawSplit);
        break;
      }

      case 'TRENCH_CLAW_LUNGE': {
        // Monster is blocked at the narrow trench mouth (Video 2 01:09–01:11):
        // Reaches long clawed arms aggressively into the narrow trench gap,
        // jaws parted wide roaring, head thrusting forward.
        const t = this.animTime;
        this.chestPitch = MathUtils.damp(this.chestPitch, 0.50, 8.0, dt);
        this.jawSplit = MathUtils.damp(this.jawSplit, 0.60, 10.0, dt); // ~70° roar
        this.rig.setJawSplit(this.jawSplit);

        this.rig.upperChest.rotation.x = this.chestPitch;
        this.rig.upperChest.rotation.z = Math.sin(t * 14.0) * 0.04;
        this.rig.neck.rotation.x = -0.20;
        this.rig.neck.rotation.y = Math.sin(t * 10.0) * 0.20;
        this.rig.headGroup.rotation.x = 0.25 + Math.sin(t * 16.0) * 0.12;

        // Long forelimbs reaching into the trench gap with alternating lunging thrusts
        const reachL = Math.sin(t * 12.0);
        const reachR = Math.sin(t * 12.0 + Math.PI);
        this.rig.shoulderL.rotation.set(-1.15 + reachL * 0.25, 0.15, 0.05);
        this.rig.elbowL.rotation.set(-0.25, 0, 0);
        this.rig.handL.rotation.set(-0.35 + reachL * 0.20, 0, 0);

        this.rig.shoulderR.rotation.set(-1.15 + reachR * 0.25, -0.15, -0.05);
        this.rig.elbowR.rotation.set(-0.25, 0, 0);
        this.rig.handR.rotation.set(-0.35 + reachR * 0.20, 0, 0);

        this.rig.pelvis.position.y = 0.65;
        break;
      }

      case 'WADE_STALK':
      case 'wade-stalk': {
        // Reference cadence: prowl interval ~1.1s (Phase C item 1)
        this.phase += (speed > 0.1 ? speed : 0.8) * dt * ((Math.PI * 2) / 1.1);
        const p = this.phase;

        // Hunched chest (0.72 rad thoracic curve), head carried low between shoulders
        this.chestPitch = MathUtils.damp(this.chestPitch, 0.72, 8.0, dt);
        this.chestRoll = Math.sin(p) * 0.40;
        this.jawSplit = 0.10 + (Math.sin(t * 1.5) * 0.5 + 0.5) * 0.08;

        this.rig.upperChest.rotation.x = this.chestPitch;
        this.rig.upperChest.rotation.z = this.chestRoll;
        this.rig.upperChest.rotation.y = Math.sin(p) * 0.15;
        this.rig.lowerSpine.rotation.y = Math.sin(p - 0.75) * 0.15;

        // Head carried low between shoulders (neck.x = -0.22, head.x = 0.12)
        this.rig.neck.rotation.x = -0.22;
        this.rig.neck.rotation.y = Math.sin(t * 1.5) * 0.35;
        this.rig.headGroup.rotation.x = 0.12;
        this.rig.headGroup.rotation.z = Math.cos(t * 1.1) * 0.15;

        // Arms trailing in water, swinging low with hands slicing surface
        const armSwingL = Math.sin(p) * 0.35;
        this.rig.shoulderL.rotation.set(0.35 + armSwingL, 0, 0.12 + Math.sin(p) * 0.25);
        this.rig.elbowL.rotation.set(-0.25 + Math.max(0, -armSwingL) * 0.20, 0, 0);
        this.rig.handL.rotation.set(-0.20, 0, 0);

        this.rig.shoulderR.rotation.set(0.35 - armSwingL, 0, -0.12 - Math.sin(p) * 0.25);
        this.rig.elbowR.rotation.set(-0.25 + Math.max(0, armSwingL) * 0.20, 0, 0);
        this.rig.handR.rotation.set(-0.20, 0, 0);

        // Hindlegs: heavy wading stance with lateral knee clearance
        const legSwingL = -armSwingL * 0.70;
        this.rig.hipL.rotation.set(-0.20 + legSwingL, 0, 0.08 + Math.sin(p) * 0.35);
        this.rig.kneeL.rotation.set(0.50 + Math.max(0, -legSwingL) * 0.25, 0, 0);
        this.rig.hipR.rotation.set(-0.20 - legSwingL, 0, -0.08 - Math.sin(p) * 0.35);
        this.rig.kneeR.rotation.set(0.50 + Math.max(0, legSwingL) * 0.25, 0, 0);

        this.rig.pelvis.position.y = 0.68 + Math.abs(Math.sin(p * 2.0)) * 0.03;
        this.rig.setJawSplit(this.jawSplit);
        break;
      }

      case 'LISTEN_FREEZE':
      case 'listen-freeze': {
        // Perfectly still, suspended respiration, head tilted listening to water (f_018)
        this.chestPitch = MathUtils.damp(this.chestPitch, 0.70, 8.0, dt);
        this.rig.upperChest.rotation.set(this.chestPitch, 0, 0);
        this.rig.lowerSpine.rotation.set(0, 0, 0);

        // Head tilt (headGroup.rotation.z = 0.38)
        this.rig.neck.rotation.set(-0.18, 0.15, 0);
        this.rig.headGroup.rotation.set(0.10, 0.12, 0.38);

        // Frozen limbs
        this.rig.shoulderL.rotation.set(0.20, 0, 0.05);
        this.rig.elbowL.rotation.set(-0.45, 0, 0);
        this.rig.shoulderR.rotation.set(0.20, 0, -0.05);
        this.rig.elbowR.rotation.set(-0.45, 0, 0);

        this.rig.hipL.rotation.set(-0.25, 0, 0.10);
        this.rig.kneeL.rotation.set(0.55, 0, 0);
        this.rig.hipR.rotation.set(-0.25, 0, -0.10);
        this.rig.kneeR.rotation.set(0.55, 0, 0);

        this.rig.pelvis.position.y = 0.70;
        this.jawSplit = 0.12;
        this.rig.setJawSplit(this.jawSplit);
        break;
      }

      case 'TRENCH_PACE':
      case 'trench-pace': {
        // Lateral movement pacing along trench lip, forelimb swipe reach (f_035–f_036)
        const p = t * 2.5;
        this.chestPitch = MathUtils.damp(this.chestPitch, 0.60, 8.0, dt);

        this.rig.upperChest.rotation.x = this.chestPitch;
        this.rig.upperChest.rotation.y = Math.sin(p) * 0.25;
        this.rig.upperChest.rotation.z = Math.cos(p) * 0.15;

        this.rig.neck.rotation.set(-0.15, Math.sin(p * 0.8) * 0.30, 0);
        this.rig.headGroup.rotation.set(0.12, 0, 0.15);

        // Lateral swipe reach with forelimbs
        const swipeL = Math.sin(p) * 0.45;
        this.rig.shoulderL.rotation.set(0.20 + swipeL, Math.sin(p) * 0.35, 0.15);
        this.rig.elbowL.rotation.set(-0.35, 0, 0);
        this.rig.shoulderR.rotation.set(0.20 - swipeL, -Math.sin(p) * 0.35, -0.15);
        this.rig.elbowR.rotation.set(-0.35, 0, 0);

        this.rig.pelvis.position.y = 0.68;
        this.jawSplit = 0.45;
        this.rig.setJawSplit(this.jawSplit);
        break;
      }

      case 'LUNGE':
      case 'lunge': {
        // Full extension forward surge, jaw unhinge 0.65 rad
        this.chestPitch = MathUtils.damp(this.chestPitch, 0.40, 10.0, dt);
        this.rig.upperChest.rotation.set(this.chestPitch, 0, 0);

        // Full arm reach forward
        this.rig.shoulderL.rotation.set(-1.35, 0.12, 0.05);
        this.rig.elbowL.rotation.set(-0.15, 0, 0);
        this.rig.handL.rotation.set(-0.30, 0, 0);

        this.rig.shoulderR.rotation.set(-1.35, -0.12, -0.05);
        this.rig.elbowR.rotation.set(-0.15, 0, 0);
        this.rig.handR.rotation.set(-0.30, 0, 0);

        this.rig.neck.rotation.set(0.28, 0, 0);
        this.rig.headGroup.rotation.set(-0.15, 0, 0);

        this.jawSplit = 0.65;
        this.rig.setJawSplit(0.65);
        this.rig.pelvis.position.y = 0.62;
        break;
      }

      case 'JUMPSCARE_BRACKET':
      case 'jumpscare-bracket': {
        // f_037 bracket: shoulders ±0.82 rad, claws toward lens, upper chest +0.15 rad
        this.rig.upperChest.rotation.set(0.15, 0, 0);
        this.rig.neck.rotation.set(-0.25, 0, 0);
        this.rig.headGroup.rotation.set(0.20, 0, 0);

        this.rig.shoulderL.rotation.set(-0.82, 0.25, 0.82);
        this.rig.elbowL.rotation.set(-0.65, 0, 0);
        this.rig.handL.rotation.set(-0.45, 0, 0.35);

        this.rig.shoulderR.rotation.set(-0.82, -0.25, -0.82);
        this.rig.elbowR.rotation.set(-0.65, 0, 0);
        this.rig.handR.rotation.set(-0.45, 0, -0.35);

        this.jawSplit = 0.65;
        this.rig.setJawSplit(0.65);
        break;
      }
    }
  }
}


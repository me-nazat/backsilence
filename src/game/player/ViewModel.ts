/* ── ViewModel.ts ─────────────────────────────────────────────────────────
 *  First-person procedural viewmodel for BackSilence.
 *  - Procedural forearms in a dark coated rain jacket with fabric wrinkles,
 *    wetness highlights, and tactical flashlight in the left hand.
 *  - 9 motion states: idle sway, walk/sprint swing, crouch lowering, jump reaction,
 *    landing dip, wading drag on hands, flashlight toggle, interact, and crank.
 *  - Driven by second-order dynamic springs (frequency f, damping z, response r).
 *  - Zero external .glb dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  CapsuleGeometry,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
  Vector3,
  Euler,
  type Material,
} from 'three';

export type ViewModelState =
  | 'IDLE'
  | 'WALK'
  | 'SPRINT'
  | 'CROUCH'
  | 'JUMP'
  | 'LANDING'
  | 'WADING'
  | 'FLASHLIGHT_TOGGLE'
  | 'INTERACT'
  | 'CRANK';

/**
 * 3D Second-order dynamic spring model.
 * Differential equation: y'' + 2*z*w*y' + w^2*y = w^2*x + r*w*x'
 */
export class SecondOrderSpring3D {
  readonly current = new Vector3();
  readonly velocity = new Vector3();
  readonly target = new Vector3();

  private f: number; // Natural frequency (Hz)
  private z: number; // Damping ratio (1.0 = critical damping)
  private r: number; // Initial response factor

  constructor(f = 3.5, z = 0.85, r = 0.5) {
    this.f = f;
    this.z = z;
    this.r = r;
  }

  setConstants(f: number, z: number, r: number): void {
    this.f = f;
    this.z = z;
    this.r = r;
  }

  getConstants(): { f: number; z: number; r: number } {
    return { f: this.f, z: this.z, r: this.r };
  }

  reset(val: Vector3): void {
    this.current.copy(val);
    this.target.copy(val);
    this.velocity.set(0, 0, 0);
  }

  update(dt: number, newTarget: Vector3): Vector3 {
    this.target.copy(newTarget);
    const w = 2.0 * Math.PI * this.f;

    // Acceleration
    const diff = new Vector3().subVectors(this.target, this.current);
    const damp = new Vector3().copy(this.velocity).multiplyScalar(2.0 * this.z * w);
    const accel = diff.multiplyScalar(w * w).sub(damp);

    this.velocity.addScaledVector(accel, dt);
    this.current.addScaledVector(this.velocity, dt);

    return this.current;
  }
}

export class ViewModel {
  readonly root = new Group();

  private readonly leftArm = new Group();
  private readonly rightArm = new Group();
  private readonly flashlight = new Group();
  private readonly materials: Material[] = [];

  // Second-order springs for position and rotation lag
  private readonly posSpring = new SecondOrderSpring3D(3.8, 0.85, 0.4);
  private readonly rotSpring = new SecondOrderSpring3D(4.2, 0.90, 0.3);

  // States
  private state: ViewModelState = 'IDLE';
  private flashlightOn = true;
  private isWet = false;
  private interactTimer = 0;
  private crankTimer = 0;
  private toggleLightTimer = 0;
  private idleTime = 0;

  // Offset targets
  private readonly basePos = new Vector3(0, -0.32, -0.45);
  private readonly targetPos = new Vector3();
  private readonly targetRot = new Vector3();
  private readonly currentEuler = new Euler(0, 0, 0, 'YXZ');

  constructor() {
    this.root.name = 'ViewModel';
    this.buildMeshes();
    this.posSpring.reset(this.basePos);
    this.rotSpring.reset(new Vector3(0, 0, 0));
  }

  private buildMeshes(): void {
    // 1. Dark Coated Rain Jacket Fabric Material (deep charcoal `#182026`)
    const jacketMat = new MeshStandardMaterial({
      color: new Color('#182026'),
      roughness: 0.55,
      metalness: 0.12,
    });
    this.materials.push(jacketMat);

    // Wetness shader hook: boosts specular sheen and darkens albedo when wet
    jacketMat.onBeforeCompile = (shader) => {
      shader.uniforms['uIsWet'] = { value: 0.0 };
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        #ifdef USE_ROUGHNESS
          // Wet rubberized fabric sheen
          roughnessFactor = mix(roughnessFactor, 0.18, uIsWet);
        #endif
        `,
      );
    };

    // 2. High-visibility yellow safety cuff trim
    const cuffMat = new MeshStandardMaterial({
      color: new Color('#d4a017'),
      roughness: 0.4,
      metalness: 0.05,
    });
    this.materials.push(cuffMat);

    // 3. Black Neoprene Glove Material
    const gloveMat = new MeshStandardMaterial({
      color: new Color('#0f1115'),
      roughness: 0.7,
      metalness: 0.02,
    });
    this.materials.push(gloveMat);

    // 4. Matte Black Metal Flashlight Casing
    const metalMat = new MeshStandardMaterial({
      color: new Color('#22252c'),
      roughness: 0.35,
      metalness: 0.75,
    });
    this.materials.push(metalMat);

    // 5. Flashlight Lens (subtle cyan glass)
    const lensMat = new MeshStandardMaterial({
      color: new Color('#d8f3dc'),
      emissive: new Color('#95d5b2'),
      emissiveIntensity: 0.45,
      roughness: 0.1,
      metalness: 0.1,
    });
    this.materials.push(lensMat);

    // --- LEFT ARM (Holds Flashlight) ---
    this.leftArm.position.set(-0.24, -0.05, 0.05);

    // Forearm sleeve
    const sleeveGeom = new CapsuleGeometry(0.048, 0.28, 6, 8);
    sleeveGeom.rotateX(Math.PI / 3);
    const sleeveL = new Mesh(sleeveGeom, jacketMat);
    sleeveL.castShadow = false;
    this.leftArm.add(sleeveL);

    // Cuff ring
    const cuffGeom = new CylinderGeometry(0.051, 0.051, 0.025, 12);
    cuffGeom.rotateX(Math.PI / 3);
    cuffGeom.translate(0, 0.08, -0.14);
    const cuffL = new Mesh(cuffGeom, cuffMat);
    this.leftArm.add(cuffL);

    // Glove Hand
    const handL = new Mesh(new SphereGeometry(0.042, 6, 6), gloveMat);
    handL.position.set(0, 0.11, -0.20);
    this.leftArm.add(handL);

    // Flashlight casing
    const torchBody = new Mesh(new CylinderGeometry(0.022, 0.024, 0.18, 12), metalMat);
    torchBody.rotateX(Math.PI / 2);
    this.flashlight.add(torchBody);

    const torchHead = new Mesh(new CylinderGeometry(0.032, 0.024, 0.05, 12), metalMat);
    torchHead.rotateX(Math.PI / 2);
    torchHead.position.set(0, 0, -0.10);
    this.flashlight.add(torchHead);

    const torchLens = new Mesh(new CylinderGeometry(0.028, 0.028, 0.005, 12), lensMat);
    torchLens.rotateX(Math.PI / 2);
    torchLens.position.set(0, 0, -0.125);
    this.flashlight.add(torchLens);

    this.flashlight.position.set(0, 0.12, -0.22);
    this.leftArm.add(this.flashlight);
    this.root.add(this.leftArm);

    // --- RIGHT ARM (Free for Interacting / Cranking) ---
    this.rightArm.position.set(0.24, -0.06, 0.05);

    const sleeveR = new Mesh(sleeveGeom, jacketMat);
    sleeveR.castShadow = false;
    this.rightArm.add(sleeveR);

    const cuffR = new Mesh(cuffGeom, cuffMat);
    this.rightArm.add(cuffR);

    const handR = new Mesh(new SphereGeometry(0.042, 6, 6), gloveMat);
    handR.position.set(0, 0.11, -0.20);
    this.rightArm.add(handR);

    // Fingers relaxed forward
    for (let f = -1; f <= 1; f++) {
      const finger = new Mesh(new CapsuleGeometry(0.012, 0.05, 4, 4), gloveMat);
      finger.position.set(f * 0.02, 0.12, -0.24);
      finger.rotateX(Math.PI / 3);
      this.rightArm.add(finger);
    }
    this.root.add(this.rightArm);
  }

  setState(newState: ViewModelState): void {
    this.state = newState;
  }

  setFlashlightOn(on: boolean): void {
    if (this.flashlightOn !== on) {
      this.flashlightOn = on;
      this.toggleLightTimer = 0.25; // 250ms toggle animation
    }
  }

  triggerInteract(): void {
    this.interactTimer = 0.45; // 450ms reach and retract
  }

  triggerCrank(duration = 1.0): void {
    this.crankTimer = duration;
  }

  setWet(wet: boolean): void {
    this.isWet = wet;
  }

  getIsWet(): boolean {
    return this.isWet;
  }

  update(
    dt: number,
    locomotion: { speed: number; isGrounded: boolean; isWading: boolean },
    bobPhase: number,
    landingDip: number,
  ): void {
    this.idleTime += dt;

    // Reset base offsets
    this.targetPos.copy(this.basePos);
    this.targetRot.set(0, 0, 0);

    const speed = locomotion.speed;
    const isWading = locomotion.isWading;

    // 1. Idle breathing sway (+-3mm at 0.22Hz)
    const breath = Math.sin(this.idleTime * 1.4) * 0.005;
    this.targetPos.y += breath;
    this.targetRot.x += breath * 2.0;

    // 2. Walk / Sprint sway synced with bobPhase
    if (locomotion.isGrounded && speed > 0.2) {
      const isSprinting = speed > 3.0;
      const swayAmpX = isSprinting ? 0.04 : 0.022;
      const swayAmpY = isSprinting ? 0.03 : 0.016;

      this.targetPos.x += Math.sin(bobPhase) * swayAmpX;
      this.targetPos.y += Math.abs(Math.cos(bobPhase)) * swayAmpY;

      // Arm lag tilt
      this.targetRot.z += Math.sin(bobPhase) * 0.04;
      this.targetRot.y += Math.cos(bobPhase) * 0.03;
    }

    // 3. Wading drag on hands
    if (isWading) {
      // Arms lift slightly to avoid deep water resistance, with gentle hydraulic heave
      this.targetPos.y += 0.04 + Math.sin(this.idleTime * 2.2) * 0.012;
      this.targetRot.x -= 0.06;
    }

    // 4. Crouch lowering
    if (this.state === 'CROUCH') {
      this.targetPos.y -= 0.08;
      this.targetPos.z += 0.04;
    }

    // 5. Landing dip reaction
    this.targetPos.y += landingDip * 0.8;

    // 6. Action overrides: Flashlight toggle
    if (this.toggleLightTimer > 0) {
      this.toggleLightTimer -= dt;
      const t = this.toggleLightTimer / 0.25;
      const raise = Math.sin(t * Math.PI) * 0.06;
      this.leftArm.position.y = -0.05 + raise;
      this.leftArm.rotation.x = raise * 3.0;
    } else {
      this.leftArm.position.y = -0.05;
      this.leftArm.rotation.x = 0;
    }

    // 7. Action overrides: Interact (Reach and Retract)
    if (this.interactTimer > 0) {
      this.interactTimer -= dt;
      const t = 1.0 - this.interactTimer / 0.45;
      const reachProgress = Math.sin(t * Math.PI);
      this.rightArm.position.z = 0.05 - reachProgress * 0.22; // Extend forward by 22cm
      this.rightArm.position.y = -0.06 + reachProgress * 0.05;
      this.rightArm.rotation.x = -reachProgress * 0.35;
    } else {
      this.rightArm.position.z = 0.05;
      this.rightArm.position.y = -0.06;
      this.rightArm.rotation.x = 0;
    }

    // 8. Action overrides: Crank (Two-handed circular rotation)
    if (this.crankTimer > 0) {
      this.crankTimer -= dt;
      const crankAngle = this.idleTime * 9.0;
      const cx = Math.cos(crankAngle) * 0.06;
      const cy = Math.sin(crankAngle) * 0.06;

      this.rightArm.position.set(0.18 + cx, -0.04 + cy, -0.15);
      this.leftArm.position.set(-0.18 - cx, -0.04 - cy, -0.15);
    }

    // 9. Integrate second-order springs
    const curPos = this.posSpring.update(dt, this.targetPos);
    const curRot = this.rotSpring.update(dt, this.targetRot);

    this.root.position.copy(curPos);
    this.currentEuler.set(curRot.x, curRot.y, curRot.z, 'YXZ');
    this.root.quaternion.setFromEuler(this.currentEuler);
  }

  dispose(): void {
    this.root.traverse((obj) => {
      const m = obj as Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
      }
    });
    this.materials.forEach((mat) => mat.dispose());
    this.root.removeFromParent();
  }
}

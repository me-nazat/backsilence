/* ── MonsterMesh.ts ────────────────────────────────────────────────────────
 *  Procedural hierarchical 3D body for the Blind Acoustic Monster.
 *  Hunched, knuckling quadruped stance, spine vertebra ridge, jaw joint with teeth,
 *  swiveling ear-fins, and organic flesh material. Zero external .glb assets.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  InstancedMesh,
  CapsuleGeometry,
  SphereGeometry,
  ConeGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  Color,
  Matrix4,
  DynamicDrawUsage,
  DoubleSide,
  type Material,
  type Texture,
} from 'three';
import { generateFleshTextures } from '../../procedural/textures/FleshTexture.js';
import { createNoisePermutation, fbm2D } from '../../procedural/core/noise.js';

export interface MonsterJoints {
  root: Group;
  pelvis: Group;
  spine: Group[];
  torso: Group;
  neck: Group;
  head: Group;
  jaw: Group;
  earLeft: Group;
  earRight: Group;
  shoulderL: Group;
  elbowL: Group;
  handL: Group;
  shoulderR: Group;
  elbowR: Group;
  handR: Group;
  hipL: Group;
  kneeL: Group;
  footL: Group;
  hipR: Group;
  kneeR: Group;
  footR: Group;
}

export class MonsterMeshHierarchy {
  readonly root = new Group();
  readonly lod0 = new Group();
  readonly lod1 = new Group();
  readonly joints: MonsterJoints;

  private readonly vertebraMesh: InstancedMesh;
  private readonly teethMesh: InstancedMesh;
  private readonly materials: Material[] = [];
  private readonly textures: Texture[] = [];
  private readonly dummyMat = new Matrix4();

  constructor(scale = 1.0, tintHex = '#7a4a38', seed = 54321) {
    this.root.name = 'MonsterRoot';
    this.root.scale.set(scale, scale, scale);
    this.root.add(this.lod0);
    this.root.add(this.lod1);
    this.lod1.visible = false; // LOD0 active by default

    // 1. Generate procedural organic textures & skin material
    const flesh = generateFleshTextures({ size: 256, seed });
    this.textures.push(flesh.albedo, flesh.bump, flesh.roughness);

    const skinMat = new MeshStandardMaterial({
      map: flesh.albedo,
      bumpMap: flesh.bump,
      bumpScale: 0.04,
      roughnessMap: flesh.roughness,
      roughness: 0.45,
      metalness: 0.08,
      color: new Color(tintHex),
    });
    this.materials.push(skinMat);

    const boneMat = new MeshStandardMaterial({
      color: new Color('#ded4b8'),
      roughness: 0.7,
      metalness: 0.05,
    });
    this.materials.push(boneMat);

    const earMat = new MeshStandardMaterial({
      color: new Color('#8a3d31'),
      emissive: new Color('#45120c'),
      emissiveIntensity: 0.35,
      roughness: 0.3,
      side: DoubleSide,
      transparent: true,
      opacity: 0.88,
    });
    this.materials.push(earMat);

    // 2. Build Joint Hierarchy
    const pelvis = new Group();
    pelvis.position.set(0, 0.9, 0); // ~0.9m above water floor
    this.lod0.add(pelvis);

    // Torso & Spine chain
    const torso = new Group();
    torso.position.set(0, 0.25, -0.2); // hunched forward
    pelvis.add(torso);

    const spineChain: Group[] = [];
    let currentSpine = pelvis;
    for (let i = 0; i < 5; i++) {
      const sp = new Group();
      sp.position.set(0, 0.12, -0.08);
      currentSpine.add(sp);
      spineChain.push(sp);
      currentSpine = sp;
    }

    const neck = new Group();
    neck.position.set(0, 0.3, -0.4);
    torso.add(neck);

    const head = new Group();
    head.position.set(0, 0.05, -0.25);
    neck.add(head);

    const jaw = new Group();
    jaw.position.set(0, -0.08, 0.05);
    head.add(jaw);

    const earLeft = new Group();
    earLeft.position.set(0.18, 0.08, 0.05);
    head.add(earLeft);

    const earRight = new Group();
    earRight.position.set(-0.18, 0.08, 0.05);
    head.add(earRight);

    // Arms
    const shoulderL = new Group();
    shoulderL.position.set(0.45, 0.2, -0.25);
    torso.add(shoulderL);

    const elbowL = new Group();
    elbowL.position.set(0.15, -0.55, 0.1);
    shoulderL.add(elbowL);

    const handL = new Group();
    handL.position.set(0.05, -0.6, -0.15);
    elbowL.add(handL);

    const shoulderR = new Group();
    shoulderR.position.set(-0.45, 0.2, -0.25);
    torso.add(shoulderR);

    const elbowR = new Group();
    elbowR.position.set(-0.15, -0.55, 0.1);
    shoulderR.add(elbowR);

    const handR = new Group();
    handR.position.set(-0.05, -0.6, -0.15);
    elbowR.add(handR);

    // Legs
    const hipL = new Group();
    hipL.position.set(0.28, -0.1, 0.15);
    pelvis.add(hipL);

    const kneeL = new Group();
    kneeL.position.set(0.05, -0.45, -0.15);
    hipL.add(kneeL);

    const footL = new Group();
    footL.position.set(0.0, -0.45, 0.1);
    kneeL.add(footL);

    const hipR = new Group();
    hipR.position.set(-0.28, -0.1, 0.15);
    pelvis.add(hipR);

    const kneeR = new Group();
    kneeR.position.set(-0.05, -0.45, -0.15);
    hipR.add(kneeR);

    const footR = new Group();
    footR.position.set(0.0, -0.45, 0.1);
    kneeR.add(footR);

    this.joints = {
      root: this.root,
      pelvis,
      spine: spineChain,
      torso,
      neck,
      head,
      jaw,
      earLeft,
      earRight,
      shoulderL,
      elbowL,
      handL,
      shoulderR,
      elbowR,
      handR,
      hipL,
      kneeL,
      footL,
      hipR,
      kneeR,
      footR,
    };

    // 3. Attach Procedural Meshes to Joints
    // Torso Barrel mesh (hunched, lumpy flesh)
    const torsoGeom = this.displaceGeometry(new CapsuleGeometry(0.38, 0.65, 8, 12), seed);
    const torsoMesh = new Mesh(torsoGeom, skinMat);
    torsoMesh.rotation.x = Math.PI / 4; // 45 deg hunched forward
    torso.add(torsoMesh);

    // Pelvis mesh
    const pelvisGeom = new SphereGeometry(0.32, 10, 8);
    pelvisGeom.scale(1.1, 0.8, 1.0);
    const pelvisMesh = new Mesh(pelvisGeom, skinMat);
    pelvis.add(pelvisMesh);

    // Head: elongated skull with scarred sockets (no eyes)
    const headGeom = new SphereGeometry(0.22, 10, 10);
    headGeom.scale(0.85, 0.9, 1.4); // elongated forward
    const headMesh = new Mesh(this.displaceGeometry(headGeom, seed + 1), skinMat);
    head.add(headMesh);

    // Eye sockets: smooth indented regions
    const socketGeom = new SphereGeometry(0.05, 6, 6);
    const socketMat = new MeshStandardMaterial({ color: new Color('#2c1613'), roughness: 0.9 });
    this.materials.push(socketMat);
    const sockL = new Mesh(socketGeom, socketMat);
    sockL.position.set(0.09, 0.04, -0.22);
    head.add(sockL);
    const sockR = new Mesh(socketGeom, socketMat);
    sockR.position.set(-0.09, 0.04, -0.22);
    head.add(sockR);

    // Jaw mesh
    const jawGeom = new CapsuleGeometry(0.09, 0.22, 6, 6);
    jawGeom.scale(1.2, 0.7, 1.2);
    const jawMesh = new Mesh(jawGeom, skinMat);
    jawMesh.rotation.x = -Math.PI / 6;
    jawMesh.position.set(0, -0.05, -0.1);
    jaw.add(jawMesh);

    // Teeth: 16 tiny instanced bone cones along the jaw
    const toothGeom = new ConeGeometry(0.012, 0.035, 4);
    this.teethMesh = new InstancedMesh(toothGeom, boneMat, 16);
    this.teethMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI - Math.PI / 2;
      const tx = Math.sin(angle) * 0.09;
      const tz = Math.cos(angle) * 0.12 - 0.1;
      this.dummyMat.makeTranslation(tx, 0.02, tz);
      this.teethMesh.setMatrixAt(i, this.dummyMat);
    }
    this.teethMesh.instanceMatrix.needsUpdate = true;
    jaw.add(this.teethMesh);

    // Ear-fins: translucent veined membrane planes
    const earGeom = new PlaneGeometry(0.25, 0.4);
    earGeom.translate(0.12, 0.15, 0);
    const earMeshL = new Mesh(earGeom, earMat);
    earLeft.add(earMeshL);

    const earGeomR = earGeom.clone();
    earGeomR.scale(-1, 1, 1);
    const earMeshR = new Mesh(earGeomR, earMat);
    earRight.add(earMeshR);

    // Spine Ridge: 14 vertebra bone spikes along torso and pelvis
    const vertebraGeom = new ConeGeometry(0.035, 0.16, 5);
    this.vertebraMesh = new InstancedMesh(vertebraGeom, boneMat, 14);
    this.vertebraMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < 14; i++) {
      const progress = i / 14;
      const vz = -0.3 + progress * 0.75;
      const vy = 0.25 + Math.sin(progress * Math.PI) * 0.15;
      this.dummyMat.makeTranslation(0, vy, vz);
      this.vertebraMesh.setMatrixAt(i, this.dummyMat);
    }
    this.vertebraMesh.instanceMatrix.needsUpdate = true;
    torso.add(this.vertebraMesh);

    // Limbs (Arms: upper arm, forearm, hand; Legs: thigh, shin, foot)
    this.buildLimbSegment(shoulderL, 0.55, 0.13, skinMat);
    this.buildLimbSegment(elbowL, 0.60, 0.11, skinMat);
    this.buildHand(handL, skinMat, true);

    this.buildLimbSegment(shoulderR, 0.55, 0.13, skinMat);
    this.buildLimbSegment(elbowR, 0.60, 0.11, skinMat);
    this.buildHand(handR, skinMat, false);

    this.buildLimbSegment(hipL, 0.45, 0.14, skinMat);
    this.buildLimbSegment(kneeL, 0.45, 0.11, skinMat);
    this.buildFoot(footL, skinMat);

    this.buildLimbSegment(hipR, 0.45, 0.14, skinMat);
    this.buildLimbSegment(kneeR, 0.45, 0.11, skinMat);
    this.buildFoot(footR, skinMat);

    // 4. Build LOD1 simplified merged mesh (for distance > 35m, <= 2000 tris)
    this.buildLod1Mesh(skinMat);
  }

  private buildLimbSegment(parent: Group, length: number, radius: number, mat: Material): void {
    const geom = new CapsuleGeometry(radius, length * 0.7, 6, 6);
    geom.translate(0, -length * 0.5, 0);
    const mesh = new Mesh(geom, mat);
    parent.add(mesh);
  }

  private buildHand(parent: Group, mat: Material, isLeft: boolean): void {
    const palm = new Mesh(new SphereGeometry(0.12, 6, 6), mat);
    parent.add(palm);

    // 3 long fingers + 1 thumb (curled knuckles)
    for (let f = 0; f < 3; f++) {
      const finger = new Mesh(new CapsuleGeometry(0.03, 0.18, 4, 4), mat);
      finger.position.set((f - 1) * 0.06, -0.1, -0.08);
      finger.rotation.x = Math.PI / 3;
      parent.add(finger);
    }
    const thumb = new Mesh(new CapsuleGeometry(0.032, 0.14, 4, 4), mat);
    thumb.position.set(isLeft ? 0.09 : -0.09, -0.05, 0.02);
    thumb.rotation.z = isLeft ? -Math.PI / 4 : Math.PI / 4;
    parent.add(thumb);
  }

  private buildFoot(parent: Group, mat: Material): void {
    const heel = new Mesh(new SphereGeometry(0.12, 6, 6), mat);
    parent.add(heel);
    // 3 splayed toes
    for (let t = -1; t <= 1; t++) {
      const toe = new Mesh(new CapsuleGeometry(0.035, 0.16, 4, 4), mat);
      toe.position.set(t * 0.07, -0.05, -0.1);
      toe.rotation.x = -Math.PI / 5;
      parent.add(toe);
    }
  }

  private buildLod1Mesh(mat: Material): void {
    // Single simplified silhouette mesh for LOD1 (<= 800 tris)
    const lod1Geom = new CapsuleGeometry(0.45, 1.2, 8, 8);
    const lod1Mesh = new Mesh(lod1Geom, mat);
    lod1Mesh.position.set(0, 0.8, -0.2);
    lod1Mesh.rotation.x = Math.PI / 5;
    this.lod1.add(lod1Mesh);
  }

  private displaceGeometry<T extends CapsuleGeometry | SphereGeometry>(geom: T, seed: number): T {
    const perm = createNoisePermutation(seed);
    const pos = geom.attributes.position;
    if (!pos) return geom;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // Seeded fBm displacement (lumpy organic muscular flesh)
      const disp = fbm2D(x * 3.5 + z * 1.5, y * 3.5 + z * 0.8, 3, 0.5, 2.0, perm) * 0.035;
      pos.setXYZ(i, x + x * disp, y + y * disp, z + z * disp);
    }
    geom.computeVertexNormals();
    return geom;
  }

  setLOD(distToCamera: number): void {
    const useLod1 = distToCamera > 35.0;
    this.lod0.visible = !useLod1;
    this.lod1.visible = useLod1;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        const m = obj as Mesh;
        m.geometry.dispose();
      }
    });
    this.materials.forEach((mat) => mat.dispose());
    this.textures.forEach((tex) => tex.dispose());
    this.root.removeFromParent();
  }
}

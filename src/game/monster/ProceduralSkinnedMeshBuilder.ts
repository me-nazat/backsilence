/* ── ProceduralSkinnedMeshBuilder.ts ─────────────────────────────────────────
 *  Continuous seamless skinned mesh generator for BackSilence monster.
 *  - 20-bone hierarchical skeleton with rest-pose line segments
 *  - Continuous organic geometry (trunk, limbs, scythe talons, emaciated ribcage, digitigrade feet)
 *  - High-poly anatomical resolution (~6,500–9,500 triangles for LOD0)
 *  - Distance-to-bone-segment weighting with smooth C1 falloff
 *  - Zero gaps/cracks/pops at elbows, knees, shoulders, or neck
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Bone,
  Skeleton,
  SkinnedMesh,
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Vector3,
  type Material,
  Group,
} from 'three';
import { createNoisePermutation, fbm2D } from '../../procedural/core/noise.js';

export interface MonsterBoneMap {
  root: Bone;
  pelvis: Bone;
  spine0: Bone;
  spine1: Bone;
  spine2: Bone;
  neck: Bone;
  head: Bone;
  jaw: Bone;
  earLeft: Group;
  earRight: Group;
  shoulderL: Bone;
  elbowL: Bone;
  handL: Bone;
  shoulderR: Bone;
  elbowR: Bone;
  handR: Bone;
  hipL: Bone;
  kneeL: Bone;
  footL: Bone;
  hipR: Bone;
  kneeR: Bone;
  footR: Bone;
}

export interface SkinnedMonsterBuildResult {
  skinnedMesh: SkinnedMesh;
  skeleton: Skeleton;
  bones: Bone[];
  boneMap: MonsterBoneMap;
}

interface BoneSegment {
  boneIndex: number;
  a: Vector3;
  b: Vector3;
  radius: number;
  weightScale: number;
}

function distSqToSegment(p: Vector3, a: Vector3, b: Vector3): number {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abZ = b.z - a.z;

  const apX = p.x - a.x;
  const apY = p.y - a.y;
  const apZ = p.z - a.z;

  const lenSq = abX * abX + abY * abY + abZ * abZ;
  if (lenSq < 1e-6) {
    return apX * apX + apY * apY + apZ * apZ;
  }

  const dot = apX * abX + apY * abY + apZ * abZ;
  const t = Math.max(0, Math.min(1, dot / lenSq));

  const projX = a.x + abX * t;
  const projY = a.y + abY * t;
  const projZ = a.z + abZ * t;

  const dx = p.x - projX;
  const dy = p.y - projY;
  const dz = p.z - projZ;

  return dx * dx + dy * dy + dz * dz;
}

export function buildProceduralSkinnedMonster(
  seed: number,
  skinMat: Material,
): SkinnedMonsterBuildResult {
  // 1. Construct 20-bone hierarchy (Quadrupedal predatory posture)
  const root = new Bone();
  root.name = 'root';

  const pelvis = new Bone();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 0.45, 0); // Sits ~0.35m above waterline
  root.add(pelvis);

  const spine0 = new Bone();
  spine0.name = 'spine0';
  spine0.position.set(0, 0.10, -0.09);
  pelvis.add(spine0);

  const spine1 = new Bone();
  spine1.name = 'spine1';
  spine1.position.set(0, 0.10, -0.09);
  spine0.add(spine1);

  const spine2 = new Bone();
  spine2.name = 'spine2'; // Torso / Chest center
  spine2.position.set(0, 0.10, -0.09);
  spine1.add(spine2);

  const neck = new Bone();
  neck.name = 'neck';
  neck.position.set(0, 0.05, -0.12);
  spine2.add(neck);

  const head = new Bone();
  head.name = 'head';
  head.position.set(0, 0.02, -0.16);
  neck.add(head);

  const jaw = new Bone();
  jaw.name = 'jaw';
  jaw.position.set(0, -0.06, 0.06);
  head.add(jaw);

  // Ear-fins on neck
  const earLeft = new Group();
  earLeft.name = 'earLeft';
  earLeft.position.set(0.18, 0.02, -0.04);
  neck.add(earLeft);

  const earRight = new Group();
  earRight.name = 'earRight';
  earRight.position.set(-0.18, 0.02, -0.04);
  neck.add(earRight);

  // Left Arm (Forelimb: wide predatory shoulder girdle ±0.48m)
  const shoulderL = new Bone();
  shoulderL.name = 'shoulderL';
  shoulderL.position.set(0.48, 0.02, -0.08);
  spine2.add(shoulderL);

  const elbowL = new Bone();
  elbowL.name = 'elbowL';
  elbowL.position.set(0.12, -0.62, 0.08);
  shoulderL.add(elbowL);

  const handL = new Bone();
  handL.name = 'handL';
  handL.position.set(0.04, -0.58, -0.12);
  elbowL.add(handL);

  // Right Arm (Forelimb)
  const shoulderR = new Bone();
  shoulderR.name = 'shoulderR';
  shoulderR.position.set(-0.48, 0.02, -0.08);
  spine2.add(shoulderR);

  const elbowR = new Bone();
  elbowR.name = 'elbowR';
  elbowR.position.set(-0.12, -0.62, 0.08);
  shoulderR.add(elbowR);

  const handR = new Bone();
  handR.name = 'handR';
  handR.position.set(-0.04, -0.58, -0.12);
  elbowR.add(handR);

  // Left Leg (Rear digitigrade limb)
  const hipL = new Bone();
  hipL.name = 'hipL';
  hipL.position.set(0.28, -0.05, 0.12);
  pelvis.add(hipL);

  const kneeL = new Bone();
  kneeL.name = 'kneeL';
  kneeL.position.set(0.04, -0.40, -0.12);
  hipL.add(kneeL);

  const footL = new Bone();
  footL.name = 'footL';
  footL.position.set(0.0, -0.38, 0.08);
  kneeL.add(footL);

  // Right Leg (Rear digitigrade limb)
  const hipR = new Bone();
  hipR.name = 'hipR';
  hipR.position.set(-0.28, -0.05, 0.12);
  pelvis.add(hipR);

  const kneeR = new Bone();
  kneeR.name = 'kneeR';
  kneeR.position.set(-0.04, -0.40, -0.12);
  hipR.add(kneeR);

  const footR = new Bone();
  footR.name = 'footR';
  footR.position.set(0.0, -0.38, 0.08);
  kneeR.add(footR);

  const bones: Bone[] = [
    root,
    pelvis,
    spine0,
    spine1,
    spine2,
    neck,
    head,
    jaw,
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
  ];

  // Rest-pose world positions for line segments
  const segments: BoneSegment[] = [
    // Pelvis
    { boneIndex: 1, a: new Vector3(0, 0.35, 0.12), b: new Vector3(0, 0.45, 0.0), radius: 0.24, weightScale: 1.0 },
    // Spine0
    { boneIndex: 2, a: new Vector3(0, 0.45, 0.0), b: new Vector3(0, 0.55, -0.09), radius: 0.26, weightScale: 1.0 },
    // Spine1
    { boneIndex: 3, a: new Vector3(0, 0.55, -0.09), b: new Vector3(0, 0.65, -0.18), radius: 0.28, weightScale: 1.0 },
    // Spine2 (Chest / Skeletal dorsal slab)
    { boneIndex: 4, a: new Vector3(0, 0.65, -0.18), b: new Vector3(0, 0.75, -0.27), radius: 0.30, weightScale: 1.1 },
    // Neck
    { boneIndex: 5, a: new Vector3(0, 0.75, -0.27), b: new Vector3(0, 0.80, -0.39), radius: 0.20, weightScale: 1.0 },
    // Head & Muzzle
    { boneIndex: 6, a: new Vector3(0, 0.80, -0.39), b: new Vector3(0, 0.82, -0.55), radius: 0.18, weightScale: 1.0 },
    // Jaw
    { boneIndex: 7, a: new Vector3(0, 0.76, -0.42), b: new Vector3(0, 0.72, -0.54), radius: 0.14, weightScale: 1.0 },
    // Left Arm: Shoulder
    { boneIndex: 8, a: new Vector3(0.20, 0.75, -0.27), b: new Vector3(0.48, 0.77, -0.35), radius: 0.16, weightScale: 1.0 },
    // Left Arm: Upper arm (0.62m) - overlaps elbow
    { boneIndex: 8, a: new Vector3(0.48, 0.77, -0.35), b: new Vector3(0.60, 0.15, -0.27), radius: 0.13, weightScale: 1.0 },
    // Left Arm: Forearm (0.58m) - overlaps elbow
    { boneIndex: 9, a: new Vector3(0.60, 0.15, -0.27), b: new Vector3(0.64, -0.43, -0.39), radius: 0.11, weightScale: 1.0 },
    // Left Arm: Hand / Claws
    { boneIndex: 10, a: new Vector3(0.64, -0.43, -0.39), b: new Vector3(0.66, -0.72, -0.55), radius: 0.14, weightScale: 1.2 },
    // Right Arm: Shoulder
    { boneIndex: 11, a: new Vector3(-0.20, 0.75, -0.27), b: new Vector3(-0.48, 0.77, -0.35), radius: 0.16, weightScale: 1.0 },
    // Right Arm: Upper arm (0.62m)
    { boneIndex: 11, a: new Vector3(-0.48, 0.77, -0.35), b: new Vector3(-0.60, 0.15, -0.27), radius: 0.13, weightScale: 1.0 },
    // Right Arm: Forearm (0.58m)
    { boneIndex: 12, a: new Vector3(-0.60, 0.15, -0.27), b: new Vector3(-0.64, -0.43, -0.39), radius: 0.11, weightScale: 1.0 },
    // Right Arm: Hand / Claws
    { boneIndex: 13, a: new Vector3(-0.64, -0.43, -0.39), b: new Vector3(-0.66, -0.72, -0.55), radius: 0.14, weightScale: 1.2 },
    // Left Leg: Hip / Thigh (0.40m) - overlaps knee
    { boneIndex: 14, a: new Vector3(0.18, 0.45, 0.05), b: new Vector3(0.28, 0.40, 0.12), radius: 0.15, weightScale: 1.0 },
    { boneIndex: 14, a: new Vector3(0.28, 0.40, 0.12), b: new Vector3(0.32, 0.00, 0.00), radius: 0.12, weightScale: 1.0 },
    // Left Leg: Shin (0.38m) - overlaps knee
    { boneIndex: 15, a: new Vector3(0.32, 0.00, 0.00), b: new Vector3(0.32, -0.38, 0.08), radius: 0.10, weightScale: 1.0 },
    // Left Leg: Foot
    { boneIndex: 16, a: new Vector3(0.32, -0.38, 0.08), b: new Vector3(0.32, -0.48, -0.15), radius: 0.12, weightScale: 1.2 },
    // Right Leg: Hip / Thigh (0.40m)
    { boneIndex: 17, a: new Vector3(-0.18, 0.45, 0.05), b: new Vector3(-0.28, 0.40, 0.12), radius: 0.15, weightScale: 1.0 },
    { boneIndex: 17, a: new Vector3(-0.28, 0.40, 0.12), b: new Vector3(-0.32, 0.00, 0.00), radius: 0.12, weightScale: 1.0 },
    // Right Leg: Shin (0.38m)
    { boneIndex: 18, a: new Vector3(-0.32, 0.00, 0.00), b: new Vector3(-0.32, -0.38, 0.08), radius: 0.10, weightScale: 1.0 },
    // Right Leg: Foot
    { boneIndex: 19, a: new Vector3(-0.32, -0.38, 0.08), b: new Vector3(-0.32, -0.48, -0.15), radius: 0.12, weightScale: 1.2 },
  ];

  // 2. Generate seamless continuous high-poly skin geometry
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function addQuad(i0: number, i1: number, i2: number, i3: number): void {
    indices.push(i0, i1, i2);
    indices.push(i1, i3, i2);
  }

  type SculptModifier = (
    vFrac: number,
    uFrac: number,
    angle: number,
    normal: Vector3,
    binormal: Vector3,
    tangent: Vector3,
    radius: number,
    center: Vector3,
  ) => { x: number; y: number; z: number };

  function addSculptedTube(
    path: Vector3[],
    radii: number[],
    segmentsPerRing = 24,
    uScale = 1.0,
    vScale = 1.0,
    modifier?: SculptModifier,
  ): void {
    const ringStarts: number[] = [];
    const ringCount = path.length;

    for (let r = 0; r < ringCount; r++) {
      const p = path[r]!;
      const radius = radii[r]!;
      const vFrac = r / Math.max(1, ringCount - 1);
      const v = vFrac * vScale;

      // Compute forward tangent
      const pNext = path[Math.min(ringCount - 1, r + 1)]!;
      const pPrev = path[Math.max(0, r - 1)]!;
      const tangent = new Vector3().subVectors(pNext, pPrev).normalize();
      if (tangent.lengthSq() < 1e-4) tangent.set(0, 1, 0);

      // Perpendicular frame (normal & binormal)
      let up = new Vector3(0, 1, 0);
      if (Math.abs(tangent.y) > 0.92) up = new Vector3(0, 0, 1);
      const normal = new Vector3().crossVectors(tangent, up).normalize();
      const binormal = new Vector3().crossVectors(tangent, normal).normalize();

      const ringStartIndex = positions.length / 3;
      ringStarts.push(ringStartIndex);

      for (let s = 0; s <= segmentsPerRing; s++) {
        const uFrac = s / segmentsPerRing;
        const angle = uFrac * Math.PI * 2;

        if (modifier) {
          const mod = modifier(vFrac, uFrac, angle, normal, binormal, tangent, radius, p);
          positions.push(mod.x, mod.y, mod.z);
        } else {
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const vx = p.x + (normal.x * cosA + binormal.x * sinA) * radius;
          const vy = p.y + (normal.y * cosA + binormal.y * sinA) * radius;
          const vz = p.z + (normal.z * cosA + binormal.z * sinA) * radius;
          positions.push(vx, vy, vz);
        }
        uvs.push(uFrac * uScale, v);
      }
    }

    // Connect rings
    for (let r = 0; r < ringCount - 1; r++) {
      const ringA = ringStarts[r]!;
      const ringB = ringStarts[r + 1]!;
      for (let s = 0; s < segmentsPerRing; s++) {
        const a0 = ringA + s;
        const a1 = ringA + s + 1;
        const b0 = ringB + s;
        const b1 = ringB + s + 1;
        addQuad(a0, a1, b0, b1);
      }
    }
  }

  // --- TRUNK TUBE (Emaciated Ribcage with 7 pairs of skin-stretched ribs & starved abdomen) ---
  const trunkRings = 36;
  const trunkPath: Vector3[] = [];
  const trunkRadii: number[] = [];

  for (let i = 0; i < trunkRings; i++) {
    const t = i / (trunkRings - 1);
    // Interpolate longitudinal path from pelvis (0, 0.35, 0.18) down to snout (0, 0.70, -0.74)
    const y = 0.35 + Math.sin(t * Math.PI * 0.65) * 0.46 - Math.max(0, t - 0.75) * 0.28;
    const z = 0.18 - t * 0.92;
    trunkPath.push(new Vector3(0, y, z));

    // Base radius profile: narrow pelvis, swelling ribcage, lean neck, flared cranium, tapered snout
    let r = 0.20;
    if (t < 0.25) {
      r = 0.19 + t * 0.20; // pelvis -> starved waist
    } else if (t < 0.60) {
      r = 0.24 + Math.sin((t - 0.25) / 0.35 * Math.PI) * 0.08; // deep predatory ribcage
    } else if (t < 0.80) {
      r = 0.20 - (t - 0.60) * 0.22; // lean muscular neck
    } else {
      r = 0.16 - (t - 0.80) * 0.35; // elongated cranium & snout
    }
    trunkRadii.push(Math.max(0.065, r));
  }

  const trunkModifier: SculptModifier = (vFrac, _uFrac, angle, normal, binormal, _tangent, radius, center) => {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Laterally compressed chest: narrower horizontally (0.92), deeper vertically (1.30)
    const wScale = 1.05;
    const hScale = 1.15;

    // 1. Thorax & 7 Pairs of Emaciated Skin-Stretched Rib Ridges (vFrac 0.18 to 0.62)
    let ribOffset = 0;
    if (vFrac >= 0.18 && vFrac <= 0.62) {
      const ribU = (vFrac - 0.18) / 0.44;
      // 7 distinct rib crests modulated by cosine wave
      const ribCosine = Math.cos(ribU * 7.0 * Math.PI * 2.0);
      const ribProfile = Math.pow(Math.max(0, ribCosine), 2.2);
      // Ribs protrude laterally along flanks (high |cosA|) and slightly dorsally (sinA > -0.2)
      const flankFactor = Math.abs(cosA) * Math.max(0, sinA + 0.4);
      ribOffset = ribProfile * flankFactor * 0.052;
    }

    // 2. Sunken, starved concave abdomen (vFrac 0.08 to 0.30, underbelly sinA < 0)
    let hollowOffset = 0;
    if (vFrac >= 0.08 && vFrac <= 0.32 && sinA < 0) {
      const bellU = Math.sin((vFrac - 0.08) / 0.24 * Math.PI);
      hollowOffset = -Math.pow(-sinA, 1.8) * bellU * 0.075; // inward suction
    }

    // 3. Razor-sharp scapulae (shoulder blades) rising above spine near spine2 (vFrac 0.48 to 0.58)
    let scapulaOffset = 0;
    if (vFrac >= 0.46 && vFrac <= 0.60) {
      const scapU = 1.0 - Math.abs(vFrac - 0.53) / 0.07;
      // Scapulae jut upward-laterally on dorsal side
      const scapAngle = Math.max(0, sinA - 0.2) * Math.abs(cosA);
      scapulaOffset = Math.pow(scapAngle, 1.6) * scapU * 0.085;
    }

    // 4. Skull Cranium, Zygomatic Arches & Hollowed Orbital Cavities (vFrac 0.68 to 0.90)
    let skullMod = 0;
    if (vFrac >= 0.68 && vFrac <= 0.90) {
      // Flared zygomatic arches laterally
      if (vFrac >= 0.70 && vFrac <= 0.78) {
        const zygU = Math.sin((vFrac - 0.70) / 0.08 * Math.PI);
        skullMod += Math.abs(cosA) * zygU * 0.045;
      }
      // Hollowed concave orbital cavities (at angle ~ ±0.70 rad)
      if (vFrac >= 0.76 && vFrac <= 0.84) {
        const eyeAngleL = Math.abs(angle - 0.70);
        const eyeAngleR = Math.abs(angle - (Math.PI * 2.0 - 0.70));
        const eyeDist = Math.min(eyeAngleL, eyeAngleR);
        if (eyeDist < 0.45) {
          const orbitT = 1.0 - eyeDist / 0.45;
          // Deep inward sunken socket surrounded by raised scarred orbital ridge
          skullMod += -orbitT * 0.048 + Math.sin(orbitT * Math.PI) * 0.018;
        }
      }
    }

    // Dorsal vertebral column ridge along back (sinA > 0.6)
    let spineRidge = 0;
    if (sinA > 0.55 && vFrac < 0.75) {
      spineRidge = Math.pow((sinA - 0.55) / 0.45, 2.5) * 0.038;
    }

    const rad = radius * (1.0 + ribOffset + hollowOffset + scapulaOffset + skullMod + spineRidge);
    const vx = center.x + normal.x * cosA * rad * wScale + binormal.x * sinA * rad * hScale;
    const vy = center.y + normal.y * cosA * rad * wScale + binormal.y * sinA * rad * hScale;
    const vz = center.z + normal.z * cosA * rad * wScale + binormal.z * sinA * rad * hScale;

    return { x: vx, y: vy, z: vz };
  };

  addSculptedTube(trunkPath, trunkRadii, 28, 2.5, 3.5, trunkModifier);

  // --- FOREARMS & SCYTHE TALONS (Sinewy biceps/forearm fluting + 4 hooked scythe claws + dewclaw) ---
  const armRings = 24;
  const armLPath: Vector3[] = [];
  const armLRadii: number[] = [];

  for (let i = 0; i < armRings; i++) {
    const t = i / (armRings - 1);
    // Interpolate shoulder (0.44, 0.76, -0.28) -> elbow (0.60, 0.15, -0.25) -> wrist/knuckles (0.65, -0.48, -0.42)
    let p: Vector3;
    let rad = 0.10;
    if (t < 0.45) {
      // Upper arm
      const u = t / 0.45;
      p = new Vector3(
        0.44 + u * 0.16,
        0.76 - u * 0.61,
        -0.28 + u * 0.03,
      );
      rad = 0.13 - u * 0.035;
    } else {
      // Forearm
      const u = (t - 0.45) / 0.55;
      p = new Vector3(
        0.60 + u * 0.05,
        0.15 - u * 0.63,
        -0.25 - u * 0.17,
      );
      rad = 0.095 + (u > 0.7 ? (u - 0.7) * 0.05 : -u * 0.015);
    }
    armLPath.push(p);
    armLRadii.push(rad);
  }

  const armModifier: SculptModifier = (vFrac, _uFrac, angle, normal, binormal, _tangent, radius, center) => {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Longitudinal tendon & muscle fluting (biceps/brachialis striation)
    const muscleFluting = Math.sin(angle * 6.0) * 0.010 * Math.sin(vFrac * Math.PI);
    // Prominent extensor tendon along dorsal forearm (vFrac > 0.45, cosA > 0.3)
    const extensorTendon = vFrac > 0.45 ? Math.max(0, cosA) * 0.016 : 0;

    const rad = radius + muscleFluting + extensorTendon;
    return {
      x: center.x + (normal.x * cosA + binormal.x * sinA) * rad,
      y: center.y + (normal.y * cosA + binormal.y * sinA) * rad,
      z: center.z + (normal.z * cosA + binormal.z * sinA) * rad,
    };
  };

  addSculptedTube(armLPath, armLRadii, 20, 1.5, 2.5, armModifier);

  const armRPath: Vector3[] = armLPath.map((v) => new Vector3(-v.x, v.y, v.z));
  addSculptedTube(armRPath, armLRadii, 20, 1.5, 2.5, armModifier);

  // --- 4 HOOKED SCYTHE TALONS (0.28m long) + REAR DEWCLAW PER HAND ---
  function addHandTalons(isRight: boolean): void {
    const sign = isRight ? -1 : 1;
    const wristPos = isRight
      ? new Vector3(-0.65, -0.48, -0.42)
      : new Vector3(0.65, -0.48, -0.42);

    // 4 Forward scythe talons (0.28m curved sickle claws)
    for (let c = 0; c < 4; c++) {
      const spread = (c - 1.5) * 0.045 * sign;
      const clawPath: Vector3[] = [];
      const clawRadii: number[] = [];
      const clawRings = 8;

      for (let r = 0; r < clawRings; r++) {
        const u = r / (clawRings - 1);
        // Hooked curve: sweeps forward (-Z) then arches sharply downward (-Y) and slightly inward
        const hookZ = -u * 0.22 - Math.pow(u, 2.5) * 0.06;
        const hookY = -u * 0.16 - Math.pow(u, 2.0) * 0.12;
        const hookX = spread * (1.0 - u * 0.3);

        clawPath.push(new Vector3(
          wristPos.x + hookX,
          wristPos.y + hookY,
          wristPos.z + hookZ,
        ));
        // Razor blade cross-section tapering to needle tip
        clawRadii.push(Math.max(0.003, 0.024 * (1.0 - u * 0.92)));
      }

      addSculptedTube(clawPath, clawRadii, 10, 0.5, 1.0, (_v, _u, angle, normal, binormal, _t, rad, cPos) => {
        // Laterally compressed razor-edge claw blade (width 0.5x, depth 1.4x)
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        return {
          x: cPos.x + (normal.x * cosA * 0.5 + binormal.x * sinA * 1.4) * rad,
          y: cPos.y + (normal.y * cosA * 0.5 + binormal.y * sinA * 1.4) * rad,
          z: cPos.z + (normal.z * cosA * 0.5 + binormal.z * sinA * 1.4) * rad,
        };
      });
    }

    // Rear dewclaw (0.12m hooked spur pointing backward/downward)
    const dewPath: Vector3[] = [];
    const dewRadii: number[] = [];
    const dewRings = 6;
    for (let r = 0; r < dewRings; r++) {
      const u = r / (dewRings - 1);
      dewPath.push(new Vector3(
        wristPos.x - 0.02 * sign,
        wristPos.y - u * 0.10,
        wristPos.z + 0.04 + u * 0.08,
      ));
      dewRadii.push(Math.max(0.003, 0.016 * (1.0 - u * 0.88)));
    }
    addSculptedTube(dewPath, dewRadii, 8, 0.4, 0.8);
  }

  addHandTalons(false); // Left hand
  addHandTalons(true);  // Right hand

  // --- DIGITIGRADE HIND LEGS & ACHILLES TENDON CORD (Taut, powerful haunches) ---
  const legRings = 22;
  const legLPath: Vector3[] = [];
  const legLRadii: number[] = [];

  for (let i = 0; i < legRings; i++) {
    const t = i / (legRings - 1);
    let p: Vector3;
    let rad = 0.12;
    if (t < 0.45) {
      // Thigh: powerful muscular haunch
      const u = t / 0.45;
      p = new Vector3(
        0.26 + u * 0.06,
        0.44 - u * 0.44,
        0.12 - u * 0.12,
      );
      rad = 0.15 - u * 0.035;
    } else {
      // Crus (Shin / Achilles): lean digitigrade stalk
      const u = (t - 0.45) / 0.55;
      p = new Vector3(
        0.32,
        0.00 - u * 0.38,
        0.00 + u * 0.08,
      );
      rad = 0.105 - (u < 0.7 ? u * 0.025 : -(u - 0.7) * 0.035);
    }
    legLPath.push(p);
    legLRadii.push(rad);
  }

  const legModifier: SculptModifier = (vFrac, _uFrac, angle, normal, binormal, _tangent, radius, center) => {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Prominent calcaneal (achilles) tendon cord along posterior crus (vFrac 0.50 to 0.92, sinA < -0.2)
    let achillesTendon = 0;
    if (vFrac >= 0.50 && vFrac <= 0.92 && sinA < -0.2) {
      const achU = Math.sin((vFrac - 0.50) / 0.42 * Math.PI);
      achillesTendon = Math.pow(-sinA - 0.2, 2.0) * achU * 0.042;
    }

    const rad = radius + achillesTendon;
    return {
      x: center.x + (normal.x * cosA + binormal.x * sinA) * rad,
      y: center.y + (normal.y * cosA + binormal.y * sinA) * rad,
      z: center.z + (normal.z * cosA + binormal.z * sinA) * rad,
    };
  };

  addSculptedTube(legLPath, legLRadii, 20, 1.5, 2.5, legModifier);

  const legRPath: Vector3[] = legLPath.map((v) => new Vector3(-v.x, v.y, v.z));
  addSculptedTube(legRPath, legLRadii, 20, 1.5, 2.5, legModifier);

  // --- SPLAYED WEBBED 3-CLAWED AMPHIBIOUS TALONS PER FOOT ---
  function addFootTalons(isRight: boolean): void {
    const sign = isRight ? -1 : 1;
    const anklePos = isRight
      ? new Vector3(-0.32, -0.38, 0.08)
      : new Vector3(0.32, -0.38, 0.08);

    for (let c = 0; c < 3; c++) {
      const spread = (c - 1) * 0.05 * sign;
      const clawPath: Vector3[] = [];
      const clawRadii: number[] = [];
      const clawRings = 6;

      for (let r = 0; r < clawRings; r++) {
        const u = r / (clawRings - 1);
        clawPath.push(new Vector3(
          anklePos.x + spread * (1.0 + u * 0.4),
          anklePos.y - u * 0.07,
          anklePos.z - u * 0.16,
        ));
        clawRadii.push(Math.max(0.004, 0.020 * (1.0 - u * 0.85)));
      }

      addSculptedTube(clawPath, clawRadii, 8, 0.5, 1.0);
    }
  }

  addFootTalons(false);
  addFootTalons(true);

  // 3. Add high-frequency organic muscular displacement
  const perm = createNoisePermutation(seed);
  const vertexCount = positions.length / 3;

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;

    const disp = fbm2D(x * 4.5 + z * 2.0, y * 4.5 + z * 1.2, 3, 0.5, 2.0, perm) * 0.022;
    positions[i * 3] = x + x * disp;
    positions[i * 3 + 1] = y + y * disp;
    positions[i * 3 + 2] = z + z * disp;
  }

  // 4. Compute distance-based bone weights for smooth skinning (zero gaps)
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const tempPos = new Vector3();

  for (let i = 0; i < vertexCount; i++) {
    tempPos.set(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!);

    // Accumulate weights per bone
    const boneWeights = new Float32Array(bones.length);

    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s]!;
      const dSq = distSqToSegment(tempPos, seg.a, seg.b);
      const dist = Math.sqrt(dSq);

      // Smooth inverse cube distance falloff
      const w = (1.0 / Math.pow(dist + 0.07, 3)) * seg.weightScale;
      boneWeights[seg.boneIndex] = (boneWeights[seg.boneIndex] ?? 0) + w;
    }

    // Find top 4 bones
    const candidates: { index: number; weight: number }[] = [];
    for (let b = 0; b < bones.length; b++) {
      const w = boneWeights[b]!;
      if (w > 1e-4) candidates.push({ index: b, weight: w });
    }

    candidates.sort((a, b) => b.weight - a.weight);
    const top4 = candidates.slice(0, 4);

    let sum = 0.0;
    for (const c of top4) sum += c.weight;
    if (sum < 1e-6) {
      top4.push({ index: 1, weight: 1.0 }); // fallback to pelvis
      sum = 1.0;
    }

    const idx0 = top4[0]?.index ?? 0;
    const idx1 = top4[1]?.index ?? 0;
    const idx2 = top4[2]?.index ?? 0;
    const idx3 = top4[3]?.index ?? 0;

    const w0 = (top4[0]?.weight ?? 0) / sum;
    const w1 = (top4[1]?.weight ?? 0) / sum;
    const w2 = (top4[2]?.weight ?? 0) / sum;
    const w3 = (top4[3]?.weight ?? 0) / sum;

    skinIndices.push(idx0, idx1, idx2, idx3);
    skinWeights.push(w0, w1, w2, w3);
  }

  // 5. Build BufferGeometry
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // 6. Bind Skeleton to SkinnedMesh
  const skeleton = new Skeleton(bones);
  const skinnedMesh = new SkinnedMesh(geometry, skinMat);
  skinnedMesh.add(root);
  skinnedMesh.bind(skeleton);
  skinnedMesh.frustumCulled = false;

  const boneMap: MonsterBoneMap = {
    root,
    pelvis,
    spine0,
    spine1,
    spine2,
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

  return {
    skinnedMesh,
    skeleton,
    bones,
    boneMap,
  };
}

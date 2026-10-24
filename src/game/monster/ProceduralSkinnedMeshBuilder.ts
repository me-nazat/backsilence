/* ── ProceduralSkinnedMeshBuilder.ts ─────────────────────────────────────────
 *  Continuous seamless skinned mesh generator for BackSilence monster.
 *  - 20-bone hierarchical skeleton with rest-pose line segments
 *  - Continuous organic geometry (trunk, limbs, paws, head, snout)
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
  Object3D,
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
  // 1. Construct 20-bone hierarchy
  const root = new Bone();
  root.name = 'root';

  const pelvis = new Bone();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 0.90, 0);
  root.add(pelvis);

  const spine0 = new Bone();
  spine0.name = 'spine0';
  spine0.position.set(0, 0.12, -0.08);
  pelvis.add(spine0);

  const spine1 = new Bone();
  spine1.name = 'spine1';
  spine1.position.set(0, 0.12, -0.08);
  spine0.add(spine1);

  const spine2 = new Bone();
  spine2.name = 'spine2'; // Torso / Chest center
  spine2.position.set(0, 0.12, -0.08);
  spine1.add(spine2);

  const neck = new Bone();
  neck.name = 'neck';
  neck.position.set(0, 0.15, -0.15);
  spine2.add(neck);

  const head = new Bone();
  head.name = 'head';
  head.position.set(0, 0.10, -0.15);
  neck.add(head);

  const jaw = new Bone();
  jaw.name = 'jaw';
  jaw.position.set(0, -0.08, 0.05);
  head.add(jaw);

  const earLeft = new Group();
  earLeft.name = 'earLeft';
  earLeft.position.set(0.18, 0.08, 0.05);
  head.add(earLeft);

  const earRight = new Group();
  earRight.name = 'earRight';
  earRight.position.set(-0.18, 0.08, 0.05);
  head.add(earRight);

  // Left Arm
  const shoulderL = new Bone();
  shoulderL.name = 'shoulderL';
  shoulderL.position.set(0.45, 0.05, -0.10);
  spine2.add(shoulderL);

  const elbowL = new Bone();
  elbowL.name = 'elbowL';
  elbowL.position.set(0.15, -0.55, 0.10);
  shoulderL.add(elbowL);

  const handL = new Bone();
  handL.name = 'handL';
  handL.position.set(0.05, -0.60, -0.15);
  elbowL.add(handL);

  // Right Arm
  const shoulderR = new Bone();
  shoulderR.name = 'shoulderR';
  shoulderR.position.set(-0.45, 0.05, -0.10);
  spine2.add(shoulderR);

  const elbowR = new Bone();
  elbowR.name = 'elbowR';
  elbowR.position.set(-0.15, -0.55, 0.10);
  shoulderR.add(elbowR);

  const handR = new Bone();
  handR.name = 'handR';
  handR.position.set(-0.05, -0.60, -0.15);
  elbowR.add(handR);

  // Left Leg
  const hipL = new Bone();
  hipL.name = 'hipL';
  hipL.position.set(0.28, -0.10, 0.15);
  pelvis.add(hipL);

  const kneeL = new Bone();
  kneeL.name = 'kneeL';
  kneeL.position.set(0.05, -0.45, -0.15);
  hipL.add(kneeL);

  const footL = new Bone();
  footL.name = 'footL';
  footL.position.set(0.0, -0.45, 0.10);
  kneeL.add(footL);

  // Right Leg
  const hipR = new Bone();
  hipR.name = 'hipR';
  hipR.position.set(-0.28, -0.10, 0.15);
  pelvis.add(hipR);

  const kneeR = new Bone();
  kneeR.name = 'kneeR';
  kneeR.position.set(-0.05, -0.45, -0.15);
  hipR.add(kneeR);

  const footR = new Bone();
  footR.name = 'footR';
  footR.position.set(0.0, -0.45, 0.10);
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
    { boneIndex: 1, a: new Vector3(0, 0.72, 0.12), b: new Vector3(0, 0.90, 0.0), radius: 0.35, weightScale: 1.0 },
    // Spine0
    { boneIndex: 2, a: new Vector3(0, 0.90, 0.0), b: new Vector3(0, 1.02, -0.08), radius: 0.32, weightScale: 1.0 },
    // Spine1
    { boneIndex: 3, a: new Vector3(0, 1.02, -0.08), b: new Vector3(0, 1.14, -0.16), radius: 0.34, weightScale: 1.0 },
    // Spine2 (Chest)
    { boneIndex: 4, a: new Vector3(0, 1.14, -0.16), b: new Vector3(0, 1.26, -0.24), radius: 0.38, weightScale: 1.1 },
    // Neck
    { boneIndex: 5, a: new Vector3(0, 1.26, -0.24), b: new Vector3(0, 1.41, -0.39), radius: 0.22, weightScale: 1.0 },
    // Head & Muzzle
    { boneIndex: 6, a: new Vector3(0, 1.41, -0.39), b: new Vector3(0, 1.55, -0.68), radius: 0.25, weightScale: 1.0 },
    // Jaw
    { boneIndex: 7, a: new Vector3(0, 1.43, -0.49), b: new Vector3(0, 1.34, -0.66), radius: 0.14, weightScale: 1.0 },
    // Left Arm: Shoulder
    { boneIndex: 8, a: new Vector3(0.20, 1.26, -0.24), b: new Vector3(0.45, 1.31, -0.34), radius: 0.18, weightScale: 1.0 },
    // Left Arm: Upper arm
    { boneIndex: 8, a: new Vector3(0.45, 1.31, -0.34), b: new Vector3(0.60, 0.76, -0.24), radius: 0.14, weightScale: 1.0 },
    // Left Arm: Forearm
    { boneIndex: 9, a: new Vector3(0.60, 0.76, -0.24), b: new Vector3(0.65, 0.16, -0.39), radius: 0.12, weightScale: 1.0 },
    // Left Arm: Hand / Paw
    { boneIndex: 10, a: new Vector3(0.65, 0.16, -0.39), b: new Vector3(0.68, 0.02, -0.48), radius: 0.16, weightScale: 1.1 },
    // Right Arm: Shoulder
    { boneIndex: 11, a: new Vector3(-0.20, 1.26, -0.24), b: new Vector3(-0.45, 1.31, -0.34), radius: 0.18, weightScale: 1.0 },
    // Right Arm: Upper arm
    { boneIndex: 11, a: new Vector3(-0.45, 1.31, -0.34), b: new Vector3(-0.60, 0.76, -0.24), radius: 0.14, weightScale: 1.0 },
    // Right Arm: Forearm
    { boneIndex: 12, a: new Vector3(-0.60, 0.76, -0.24), b: new Vector3(-0.65, 0.16, -0.39), radius: 0.12, weightScale: 1.0 },
    // Right Arm: Hand / Paw
    { boneIndex: 13, a: new Vector3(-0.65, 0.16, -0.39), b: new Vector3(-0.68, 0.02, -0.48), radius: 0.16, weightScale: 1.1 },
    // Left Leg: Hip / Thigh
    { boneIndex: 14, a: new Vector3(0.20, 0.85, 0.08), b: new Vector3(0.28, 0.80, 0.15), radius: 0.18, weightScale: 1.0 },
    { boneIndex: 14, a: new Vector3(0.28, 0.80, 0.15), b: new Vector3(0.33, 0.35, 0.00), radius: 0.15, weightScale: 1.0 },
    // Left Leg: Shin
    { boneIndex: 15, a: new Vector3(0.33, 0.35, 0.00), b: new Vector3(0.33, -0.10, 0.10), radius: 0.12, weightScale: 1.0 },
    // Left Leg: Foot
    { boneIndex: 16, a: new Vector3(0.33, -0.10, 0.10), b: new Vector3(0.33, -0.15, -0.08), radius: 0.15, weightScale: 1.1 },
    // Right Leg: Hip / Thigh
    { boneIndex: 17, a: new Vector3(-0.20, 0.85, 0.08), b: new Vector3(-0.28, 0.80, 0.15), radius: 0.18, weightScale: 1.0 },
    { boneIndex: 17, a: new Vector3(-0.28, 0.80, 0.15), b: new Vector3(-0.33, 0.35, 0.00), radius: 0.15, weightScale: 1.0 },
    // Right Leg: Shin
    { boneIndex: 18, a: new Vector3(-0.33, 0.35, 0.00), b: new Vector3(-0.33, -0.10, 0.10), radius: 0.12, weightScale: 1.0 },
    // Right Leg: Foot
    { boneIndex: 19, a: new Vector3(-0.33, -0.10, 0.10), b: new Vector3(-0.33, -0.15, -0.08), radius: 0.15, weightScale: 1.1 },
  ];

  // 2. Generate seamless continuous skin geometry
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function addQuad(i0: number, i1: number, i2: number, i3: number): void {
    indices.push(i0, i1, i2);
    indices.push(i1, i3, i2);
  }

  function addTube(
    path: Vector3[],
    radii: number[],
    segmentsPerRing = 12,
    uScale = 1.0,
    vScale = 1.0,
  ): void {
    const ringStarts: number[] = [];
    const ringCount = path.length;

    for (let r = 0; r < ringCount; r++) {
      const p = path[r]!;
      const radius = radii[r]!;
      const v = (r / Math.max(1, ringCount - 1)) * vScale;

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
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const vx = p.x + (normal.x * cosA + binormal.x * sinA) * radius;
        const vy = p.y + (normal.y * cosA + binormal.y * sinA) * radius;
        const vz = p.z + (normal.z * cosA + binormal.z * sinA) * radius;

        positions.push(vx, vy, vz);
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

  // --- TRUNK TUBE (Pelvis -> Spine -> Neck -> Head -> Muzzle) ---
  const trunkPath: Vector3[] = [
    new Vector3(0, 0.70, 0.15),
    new Vector3(0, 0.80, 0.10),
    new Vector3(0, 0.90, 0.02),
    new Vector3(0, 1.00, -0.06),
    new Vector3(0, 1.10, -0.14),
    new Vector3(0, 1.20, -0.22),
    new Vector3(0, 1.30, -0.30),
    new Vector3(0, 1.38, -0.38),
    new Vector3(0, 1.45, -0.46),
    new Vector3(0, 1.50, -0.56),
    new Vector3(0, 1.52, -0.66),
    new Vector3(0, 1.48, -0.74),
  ];
  const trunkRadii: number[] = [
    0.28, 0.32, 0.36, 0.38, 0.40, 0.42, 0.38, 0.26, 0.22, 0.24, 0.20, 0.12,
  ];
  addTube(trunkPath, trunkRadii, 16, 2.0, 3.0);

  // --- LEFT ARM TUBE ---
  const armLPath: Vector3[] = [
    new Vector3(0.38, 1.28, -0.28), // interface with chest
    new Vector3(0.48, 1.22, -0.30),
    new Vector3(0.55, 1.00, -0.26),
    new Vector3(0.60, 0.76, -0.24), // elbow
    new Vector3(0.62, 0.50, -0.30),
    new Vector3(0.65, 0.22, -0.36), // wrist
    new Vector3(0.67, 0.08, -0.42), // knuckling palm
    new Vector3(0.68, 0.02, -0.48), // claws
  ];
  const armLRadii: number[] = [0.18, 0.16, 0.14, 0.12, 0.11, 0.13, 0.15, 0.08];
  addTube(armLPath, armLRadii, 12, 1.5, 2.0);

  // --- RIGHT ARM TUBE ---
  const armRPath: Vector3[] = armLPath.map((v) => new Vector3(-v.x, v.y, v.z));
  addTube(armRPath, armLRadii, 12, 1.5, 2.0);

  // --- LEFT LEG TUBE ---
  const legLPath: Vector3[] = [
    new Vector3(0.24, 0.84, 0.12), // interface with pelvis
    new Vector3(0.28, 0.76, 0.14),
    new Vector3(0.30, 0.55, 0.06),
    new Vector3(0.33, 0.35, 0.00), // knee
    new Vector3(0.33, 0.12, 0.06),
    new Vector3(0.33, -0.08, 0.10), // ankle
    new Vector3(0.33, -0.14, 0.02), // foot
    new Vector3(0.33, -0.16, -0.08), // toes
  ];
  const legLRadii: number[] = [0.20, 0.17, 0.15, 0.13, 0.12, 0.13, 0.15, 0.08];
  addTube(legLPath, legLRadii, 12, 1.5, 2.0);

  // --- RIGHT LEG TUBE ---
  const legRPath: Vector3[] = legLPath.map((v) => new Vector3(-v.x, v.y, v.z));
  addTube(legRPath, legLRadii, 12, 1.5, 2.0);

  // 3. Add organic muscular displacement
  const perm = createNoisePermutation(seed);
  const vertexCount = positions.length / 3;

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;

    const disp = fbm2D(x * 3.5 + z * 1.5, y * 3.5 + z * 0.8, 3, 0.5, 2.0, perm) * 0.025;
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
      boneWeights[seg.boneIndex] += w;
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

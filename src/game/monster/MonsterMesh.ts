/* ── MonsterMesh.ts ────────────────────────────────────────────────────────
 *  Procedural seamless 3D body for the Blind Acoustic Monster.
 *  Uses continuous SkinnedMesh with distance-to-segment weighting:
 *  - Zero gaps/cracks/pops at elbows, knees, shoulders, neck at any acute angle
 *  - Organic flesh material with procedural bump, veins, and wetness logic
 *  - Fog extinction reduction by 40% and faint cool rim light for readability
 *  - Vertebra spikes along spine, teeth in jaw, blind sockets, veined ear-fins
 *  - Zero external .glb dependencies required
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  InstancedMesh,
  CapsuleGeometry,
  SphereGeometry,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  Color,
  Matrix4,
  DynamicDrawUsage,
  DoubleSide,
  type Material,
  type Texture,
  Object3D,
  type SkinnedMesh,
} from 'three';
import { generateFleshTextures } from '../../procedural/textures/FleshTexture.js';
import { buildProceduralSkinnedMonster } from './ProceduralSkinnedMeshBuilder.js';

export interface MonsterJoints {
  root: Object3D;
  pelvis: Object3D;
  spine: Object3D[];
  torso: Object3D;
  neck: Object3D;
  head: Object3D;
  jaw: Object3D;
  earLeft: Object3D;
  earRight: Object3D;
  shoulderL: Object3D;
  elbowL: Object3D;
  handL: Object3D;
  shoulderR: Object3D;
  elbowR: Object3D;
  handR: Object3D;
  hipL: Object3D;
  kneeL: Object3D;
  footL: Object3D;
  hipR: Object3D;
  kneeR: Object3D;
  footR: Object3D;
}

export class MonsterMeshHierarchy {
  readonly root = new Group();
  readonly lod0 = new Group();
  readonly lod1 = new Group();
  readonly joints: MonsterJoints;
  readonly skinnedMesh: SkinnedMesh;

  private readonly vertebraMesh: InstancedMesh;
  private readonly teethMesh: InstancedMesh;
  private readonly materials: Material[] = [];
  private readonly textures: Texture[] = [];
  private readonly dummyMat = new Matrix4();

  constructor(scale = 1.0, tintHex = '#786455', seed = 54321) {
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

    // Silhouette & readability boost:
    // - Reduce fog extinction by 40% (reads in haze at 25-45m)
    // - Faint cool rim lighting
    // - Submerged wetness logic (darker albedo + specular sheen below waterline)
    skinMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vWorldPositionForWet;
        `,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vWorldPositionForWet = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vWorldPositionForWet;
        `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        // Wetness below waterline + 0.35m (darken submerged albedo an additional 15% for readability)
        float wetT = clamp((0.35 - vWorldPositionForWet.y) / 0.35, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.12, wetT * 0.85);
        diffuseColor.rgb *= (1.0 - wetT * 0.35);
        diffuseColor.rgb *= (1.0 - wetT * 0.15);
        `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        /* glsl */ `
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          // 40% reduction in fog extinction for creature readability
          fogFactor = clamp(fogFactor * 0.60, 0.0, 1.0);
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
        #endif

        // Natural wet organic sheen + cool rim + 0.5-intensity cool top-rim for silhouette readability against pale water
        vec3 viewDir = normalize(vViewPosition);
        float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
        vec3 coolRim = vec3(0.18, 0.52, 0.62) * pow(rim, 2.4) * 0.55;
        float topMask = clamp(vNormal.y * 0.7 + 0.3, 0.0, 1.0);
        vec3 coolTopRim = vec3(0.55, 0.75, 0.88) * pow(rim, 2.8) * topMask * 0.50;
        vec3 wetSheen = vec3(0.04, 0.045, 0.04) * pow(rim, 3.0);
        vec3 subsurfaceLift = vec3(0.045, 0.035, 0.030);
        gl_FragColor.rgb += coolRim + coolTopRim + wetSheen + subsurfaceLift;
        `,
      );
    };
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

    // 2. Build Seamless Procedural Skinned Mesh & Skeleton
    const built = buildProceduralSkinnedMonster(seed, skinMat);
    this.skinnedMesh = built.skinnedMesh;
    this.lod0.add(this.skinnedMesh);

    const bm = built.boneMap;
    this.joints = {
      root: bm.root,
      pelvis: bm.pelvis,
      spine: [bm.spine0, bm.spine1, bm.spine2],
      torso: bm.spine2,
      neck: bm.neck,
      head: bm.head,
      jaw: bm.jaw,
      earLeft: bm.earLeft,
      earRight: bm.earRight,
      shoulderL: bm.shoulderL,
      elbowL: bm.elbowL,
      handL: bm.handL,
      shoulderR: bm.shoulderR,
      elbowR: bm.elbowR,
      handR: bm.handR,
      hipL: bm.hipL,
      kneeL: bm.kneeL,
      footL: bm.footL,
      hipR: bm.hipR,
      kneeR: bm.kneeR,
      footR: bm.footR,
    };

    // 3. Attach articulated accessories to skeleton bones
    // Acoustic sensory pits: eyeless creature with 28 dark reddish pitted sensory pores parented to head
    const pitGeom = new SphereGeometry(0.024, 6, 6);
    const pitMat = new MeshStandardMaterial({ color: new Color('#220c0a'), roughness: 0.95 });
    this.materials.push(pitMat);
    const pitMesh = new InstancedMesh(pitGeom, pitMat, 28);
    pitMesh.name = 'acousticPits';
    pitMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const pitCoords: [number, number, number][] = [
      // Forehead / dome apex
      [0.0, 0.22, -0.06], [0.06, 0.21, -0.08], [-0.06, 0.21, -0.08],
      [0.11, 0.19, -0.10], [-0.11, 0.19, -0.10], [0.04, 0.20, 0.02], [-0.04, 0.20, 0.02],
      // Mid-face sensory cluster (eyeless, acoustic detection pits)
      [0.08, 0.12, -0.18], [-0.08, 0.12, -0.18], [0.14, 0.10, -0.15], [-0.14, 0.10, -0.15],
      [0.03, 0.13, -0.19], [-0.03, 0.13, -0.19], [0.09, 0.06, -0.21], [-0.09, 0.06, -0.21],
      [0.15, 0.04, -0.18], [-0.15, 0.04, -0.18], [0.0, 0.07, -0.22],
      // Upper snout / lateral sensory line
      [0.06, 0.01, -0.23], [-0.06, 0.01, -0.23], [0.11, 0.0, -0.20], [-0.11, 0.0, -0.20],
      [0.0, 0.02, -0.24], [0.04, -0.03, -0.22], [-0.04, -0.03, -0.22],
      // Temples
      [0.17, 0.14, -0.08], [-0.17, 0.14, -0.08], [0.0, 0.16, -0.13],
    ];
    for (let i = 0; i < pitCoords.length; i++) {
      const [px, py, pz] = pitCoords[i]!;
      this.dummyMat.makeTranslation(px, py, pz);
      pitMesh.setMatrixAt(i, this.dummyMat);
    }
    pitMesh.instanceMatrix.needsUpdate = true;
    bm.head.add(pitMesh);

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
    bm.jaw.add(this.teethMesh);

    // Ear-fins: translucent veined membrane planes
    const earGeom = new PlaneGeometry(0.25, 0.4);
    earGeom.translate(0.12, 0.15, 0);
    const earMeshL = new Mesh(earGeom, earMat);
    bm.earLeft.add(earMeshL);

    const earGeomR = earGeom.clone();
    earGeomR.scale(-1, 1, 1);
    const earMeshR = new Mesh(earGeomR, earMat);
    bm.earRight.add(earMeshR);

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
    bm.spine2.add(this.vertebraMesh);

    // 4. Build LOD1 simplified merged mesh (for distance > 35m, <= 2000 tris)
    this.buildLod1Mesh(skinMat);

    // Disable frustum culling on all child meshes so dynamic IK limb motions are never clipped
    this.root.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        (obj as Mesh).frustumCulled = false;
      }
    });
  }

  private buildLod1Mesh(mat: Material): void {
    // Simplified composite silhouette mesh for LOD1 (<= 600 tris total)
    // Preserves hunched quadruped silhouette, seed-pod head, and long wading arms without popping
    const lod1Group = new Group();
    lod1Group.name = 'LOD1_CompositeSilhouette';

    // Torso / hunched back
    const torsoGeom = new CapsuleGeometry(0.38, 0.9, 6, 6);
    const torsoMesh = new Mesh(torsoGeom, mat);
    torsoMesh.position.set(0, 0.75, -0.15);
    torsoMesh.rotation.x = Math.PI * 0.28;
    lod1Group.add(torsoMesh);

    // Spine hunch hump
    const humpGeom = new SphereGeometry(0.32, 6, 6);
    const humpMesh = new Mesh(humpGeom, mat);
    humpMesh.position.set(0, 0.95, -0.05);
    lod1Group.add(humpMesh);

    // Lowered seed-pod head
    const headGeom = new SphereGeometry(0.24, 6, 6);
    headGeom.scale(0.85, 0.9, 1.25);
    const headMesh = new Mesh(headGeom, mat);
    headMesh.position.set(0, 0.65, -0.65);
    lod1Group.add(headMesh);

    // Forearms angled down to water level
    const armGeom = new CylinderGeometry(0.08, 0.12, 0.85, 5);
    const armL = new Mesh(armGeom, mat);
    armL.position.set(0.42, 0.35, -0.35);
    armL.rotation.z = -0.15;
    armL.rotation.x = 0.2;
    lod1Group.add(armL);

    const armR = new Mesh(armGeom, mat);
    armR.position.set(-0.42, 0.35, -0.35);
    armR.rotation.z = 0.15;
    armR.rotation.x = 0.2;
    lod1Group.add(armR);

    // Hind legs / thighs
    const legGeom = new CylinderGeometry(0.12, 0.09, 0.75, 5);
    const legL = new Mesh(legGeom, mat);
    legL.position.set(0.32, 0.35, 0.25);
    legL.rotation.x = -0.2;
    lod1Group.add(legL);

    const legR = new Mesh(legGeom, mat);
    legR.position.set(-0.32, 0.35, 0.25);
    legR.rotation.x = -0.2;
    lod1Group.add(legR);

    this.lod1.add(lod1Group);
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

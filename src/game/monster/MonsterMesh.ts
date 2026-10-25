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
        // Wetness below waterline + 0.35m
        float wetT = clamp((0.35 - vWorldPositionForWet.y) / 0.35, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.12, wetT * 0.85);
        diffuseColor.rgb *= (1.0 - wetT * 0.35);
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

        // Silhouette readability lift (subsurface backscatter) + cool rim
        vec3 viewDir = normalize(vViewPosition);
        float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
        vec3 coolRim = vec3(0.22, 0.56, 0.68) * pow(rim, 2.4) * 0.55;
        vec3 subsurfaceLift = vec3(0.065, 0.045, 0.038);
        gl_FragColor.rgb += coolRim + subsurfaceLift;
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
    // Eye sockets: indented socket meshes parented to skull
    const socketGeom = new SphereGeometry(0.05, 6, 6);
    const socketMat = new MeshStandardMaterial({ color: new Color('#2c1613'), roughness: 0.9 });
    this.materials.push(socketMat);
    const sockL = new Mesh(socketGeom, socketMat);
    sockL.position.set(0.09, 0.04, -0.22);
    bm.head.add(sockL);

    const sockR = new Mesh(socketGeom, socketMat);
    sockR.position.set(-0.09, 0.04, -0.22);
    bm.head.add(sockR);

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
    // Single simplified silhouette mesh for LOD1 (<= 800 tris)
    const lod1Geom = new CapsuleGeometry(0.45, 1.2, 8, 8);
    const lod1Mesh = new Mesh(lod1Geom, mat);
    lod1Mesh.position.set(0, 0.8, -0.2);
    lod1Mesh.rotation.x = Math.PI / 5;
    this.lod1.add(lod1Mesh);
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

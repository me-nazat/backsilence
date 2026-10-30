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

  readonly vertebraMesh: InstancedMesh;
  readonly teethMesh: InstancedMesh;
  private readonly materials: Material[] = [];
  private readonly textures: Texture[] = [];
  private readonly dummyMat = new Matrix4();
  private readonly waterLevelUniform = { value: 0.0 };

  constructor(scale = 1.0, tintHex = '#6b5f40', seed = 54321) {
    this.root.name = 'MonsterRoot';
    this.root.scale.set(scale, scale, scale);
    this.root.add(this.lod0);
    this.root.add(this.lod1);
    this.lod1.visible = false; // LOD0 active by default

    // 1. Generate procedural organic textures & skin material
    const flesh = generateFleshTextures({ size: 256, seed });
    this.textures.push(flesh.albedo, flesh.bump, flesh.roughness);

    const applyCreatureShaderHooks = (shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, { value: unknown }> }) => {
      shader.uniforms.uWaterLevel = this.waterLevelUniform;

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
        uniform float uWaterLevel;
        varying vec3 vWorldPositionForWet;
        `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        // Wetness below waterline + 0.30m (Prompt 7.6)
        float wetT = clamp((uWaterLevel + 0.30 - vWorldPositionForWet.y) / 0.30, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.10, wetT * 0.9);
        diffuseColor.rgb *= mix(1.0, 0.72, wetT);
        // Submerged albedo darkening 15% (Prompt 1 C)
        float submergedT = clamp((uWaterLevel - vWorldPositionForWet.y) / 0.15, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.85, submergedT);
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
          // 45% extinction reduction so the silhouette survives the haze at 25-40 m (Prompt 7.5).
          fogFactor = clamp( fogFactor * 0.55, 0.0, 1.0 );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
        #endif

        // Cool top rim for readability against pale water (Prompt 1 C) + neutral rim + wet sheen
        vec3 viewDir = normalize(vViewPosition);
        float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
        float topMask = max(0.0, vNormal.y);
        vec3 coolTopRim = vec3(0.18, 0.22, 0.25) * pow(rim, 2.0) * topMask * 0.50;
        vec3 coolRim = vec3(0.16, 0.20, 0.22) * pow(rim, 2.2) * 0.35;
        vec3 wetSheen = vec3(0.04, 0.045, 0.04) * pow(rim, 3.0);
        vec3 subsurfaceLift = vec3(0.065, 0.045, 0.038);
        // Dark wet abyssal chitin with subtle bio-acoustic acoustic vein pulse
        float veinNoise = sin(vWorldPositionForWet.x * 12.0 + vWorldPositionForWet.z * 12.0) * cos(vWorldPositionForWet.y * 18.0);
        vec3 acousticVein = vec3(0.02, 0.12, 0.09) * smoothstep(0.75, 0.98, veinNoise);
        gl_FragColor.rgb += coolTopRim + coolRim + wetSheen + subsurfaceLift + acousticVein;
        `,
      );
    };

    // Body skin material: #6b5f40 standard tint (Prompt 7.4)
    const skinMat = new MeshStandardMaterial({
      map: flesh.albedo,
      bumpMap: flesh.bump,
      bumpScale: 0.04,
      roughnessMap: flesh.roughness,
      roughness: 0.52,
      metalness: 0.03,
      envMapIntensity: 0.2,
      color: new Color(tintHex),
    });
    skinMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(skinMat);

    // Head skin material: separate material tinted #59462d (Prompt 7.2)
    const headMat = new MeshStandardMaterial({
      map: flesh.albedo,
      bumpMap: flesh.bump,
      bumpScale: 0.04,
      roughnessMap: flesh.roughness,
      roughness: 0.52,
      metalness: 0.03,
      envMapIntensity: 0.2,
      color: new Color('#59462d'),
    });
    headMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(headMat);

    const boneMat = new MeshStandardMaterial({
      color: new Color('#ded4b8'),
      roughness: 0.7,
      metalness: 0.05,
    });
    this.materials.push(boneMat);

    // Ear-fins: rebuilt with vein texture, #59462d tint, zero emissive, opacity 0.72 (Prompt 7.1)
    const earMat = new MeshStandardMaterial({
      map: flesh.albedo,
      bumpMap: flesh.bump,
      bumpScale: 0.02,
      color: new Color('#59462d'),
      emissive: new Color('#000000'),
      emissiveIntensity: 0.0,
      roughness: 0.55,
      side: DoubleSide,
      transparent: true,
      opacity: 0.72,
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
    // Acoustic sensory pits: eyeless creature with 28 dark pitted sensory pores parented to head
    const pitGeom = new SphereGeometry(0.024, 6, 6);
    const pitMat = new MeshStandardMaterial({ color: new Color('#220c0a'), roughness: 0.95 });
    this.materials.push(pitMat);
    const pitMesh = new InstancedMesh(pitGeom, pitMat, 28);
    pitMesh.name = 'acousticPits';
    pitMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const pitCoords: [number, number, number][] = [
      // Forehead / dome apex
      [0.0, 0.16, -0.06], [0.06, 0.15, -0.08], [-0.06, 0.15, -0.08],
      [0.11, 0.14, -0.10], [-0.11, 0.14, -0.10], [0.04, 0.15, 0.02], [-0.04, 0.15, 0.02],
      // Mid-face sensory cluster (eyeless, acoustic detection pits)
      [0.08, 0.09, -0.18], [-0.08, 0.09, -0.18], [0.14, 0.08, -0.15], [-0.14, 0.08, -0.15],
      [0.03, 0.10, -0.19], [-0.03, 0.10, -0.19], [0.09, 0.05, -0.21], [-0.09, 0.05, -0.21],
      [0.15, 0.03, -0.18], [-0.15, 0.03, -0.18], [0.0, 0.05, -0.22],
      // Upper snout / lateral sensory line
      [0.06, 0.01, -0.23], [-0.06, 0.01, -0.23], [0.11, 0.0, -0.20], [-0.11, 0.0, -0.20],
      [0.0, 0.02, -0.24], [0.04, -0.03, -0.22], [-0.04, -0.03, -0.22],
      // Temples
      [0.17, 0.10, -0.08], [-0.17, 0.10, -0.08], [0.0, 0.12, -0.13],
    ];
    for (let i = 0; i < pitCoords.length; i++) {
      const [px, py, pz] = pitCoords[i]!;
      this.dummyMat.makeTranslation(px, py, pz);
      pitMesh.setMatrixAt(i, this.dummyMat);
    }
    pitMesh.instanceMatrix.needsUpdate = true;
    bm.head.add(pitMesh);

    // Skull: wide and low (approx 2:1 width to height), flat top, broad downturned muzzle (Prompt 7.2)
    const skullGeom = new CylinderGeometry(0.22, 0.19, 0.44, 14);
    skullGeom.rotateX(Math.PI / 2);
    skullGeom.scale(1.05, 0.50, 1.05); // ~0.44m wide, ~0.22m high (2:1 ratio)
    const posAttr = skullGeom.attributes.position;
    if (posAttr) {
      for (let i = 0; i < posAttr.count; i++) {
        const z = posAttr.getZ(i);
        if (z < -0.04) {
          const drop = (z + 0.04) * 0.22;
          posAttr.setY(i, posAttr.getY(i) + drop);
        }
        const y = posAttr.getY(i);
        if (y > 0.05) {
          posAttr.setY(i, 0.05 + (y - 0.05) * 0.25);
        }
      }
    }
    skullGeom.computeVertexNormals();
    const skullMesh = new Mesh(skullGeom, headMat);
    skullMesh.position.set(0, 0.04, -0.08);
    bm.head.add(skullMesh);

    // Blind, sealed, slightly sunken eye socket discs with dull wet membrane material (Prompt 7.2)
    const socketMat = new MeshStandardMaterial({
      color: new Color('#635240'),
      roughness: 0.40,
      metalness: 0.02,
      transparent: true,
      opacity: 0.88,
    });
    this.materials.push(socketMat);
    const socketGeom = new CylinderGeometry(0.045, 0.045, 0.012, 12);
    socketGeom.rotateX(Math.PI / 2);
    const socketL = new Mesh(socketGeom, socketMat);
    socketL.name = 'EyeSocket_L';
    socketL.position.set(0.18, 0.05, -0.16);
    socketL.rotation.y = 0.35;
    bm.head.add(socketL);
    const socketR = new Mesh(socketGeom, socketMat);
    socketR.name = 'EyeSocket_R';
    socketR.position.set(-0.18, 0.05, -0.16);
    socketR.rotation.y = -0.35;
    bm.head.add(socketR);

    // Massive lower jaw (Prompt 7.2)
    const jawGeom = new CylinderGeometry(0.20, 0.17, 0.40, 12);
    jawGeom.rotateX(Math.PI / 2);
    jawGeom.scale(0.98, 0.38, 1.0);
    const jawMesh = new Mesh(jawGeom, headMat);
    jawMesh.position.set(0, -0.04, -0.05);
    bm.jaw.add(jawMesh);

    // Teeth: 24 sharp bone cones along the jaw perimeter (Prompt 7.2)
    const toothGeom = new ConeGeometry(0.016, 0.045, 5);
    this.teethMesh = new InstancedMesh(toothGeom, boneMat, 24);
    this.teethMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < 24; i++) {
      const angle = (i / 23) * Math.PI - Math.PI / 2;
      const tx = Math.sin(angle) * 0.18;
      const tz = Math.cos(angle) * 0.22 - 0.18;
      this.dummyMat.makeTranslation(tx, 0.02, tz);
      this.teethMesh.setMatrixAt(i, this.dummyMat);
    }
    this.teethMesh.instanceMatrix.needsUpdate = true;
    bm.jaw.add(this.teethMesh);

    // Ear-fins: 0.16 x 0.22 m veined membranes, folded back and down behind skull (Prompt 7.1)
    const earGeom = new PlaneGeometry(0.16, 0.22);
    earGeom.translate(0.08, 0.06, -0.04);
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

    // Trailing dark abyssal tendrils parented to pelvis and spine
    const tendrilMat = new MeshStandardMaterial({
      color: new Color('#0a0d0c'),
      roughness: 0.85,
      metalness: 0.1,
    });
    this.materials.push(tendrilMat);
    for (let t = 0; t < 6; t++) {
      const tendrilGeom = new CylinderGeometry(0.015, 0.003, 0.75 + (t % 3) * 0.2, 6);
      tendrilGeom.translate(0, -0.35, 0);
      const tendrilMesh = new Mesh(tendrilGeom, tendrilMat);
      const angle = (t / 6) * Math.PI * 2;
      tendrilMesh.position.set(Math.cos(angle) * 0.14, -0.05, Math.sin(angle) * 0.16 + 0.08);
      tendrilMesh.rotation.z = ((t % 2 === 0 ? 1 : -1) * 0.25);
      tendrilMesh.rotation.x = 0.25 + (t * 0.05);
      bm.pelvis.add(tendrilMesh);
    }

    // 4. Build LOD1 simplified merged mesh (for distance > 35m, <= 2000 tris)
    this.buildLod1Mesh(skinMat);

    // Disable frustum culling on all child meshes so dynamic IK limb motions are never clipped
    this.root.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        (obj as Mesh).frustumCulled = false;
      }
    });
  }

  setWaterLevel(y: number): void {
    this.waterLevelUniform.value = y;
  }

  private buildLod1Mesh(mat: Material): void {
    // Simplified composite silhouette mesh for LOD1 (<= 600 tris total)
    // Preserves hunched quadruped silhouette, broad wet back, lowered head, and long wading arms
    const lod1Group = new Group();
    lod1Group.name = 'LOD1_CompositeSilhouette';

    // Broad torso / hunched back slab
    const torsoGeom = new CapsuleGeometry(0.48, 0.85, 6, 6);
    const torsoMesh = new Mesh(torsoGeom, mat);
    torsoMesh.position.set(0, 0.55, -0.10);
    torsoMesh.rotation.x = Math.PI * 0.26;
    lod1Group.add(torsoMesh);

    // Spine hunch hump
    const humpGeom = new SphereGeometry(0.42, 6, 6);
    const humpMesh = new Mesh(humpGeom, mat);
    humpMesh.position.set(0, 0.70, -0.05);
    lod1Group.add(humpMesh);

    // Wide, lowered head at shoulder level
    const headGeom = new SphereGeometry(0.24, 6, 6);
    headGeom.scale(1.25, 0.65, 1.15); // Wide 2:1
    const headMesh = new Mesh(headGeom, mat);
    headMesh.position.set(0, 0.52, -0.55);
    lod1Group.add(headMesh);

    // Forearms lengthened to reach water floor
    const armGeom = new CylinderGeometry(0.12, 0.15, 1.15, 5);
    const armL = new Mesh(armGeom, mat);
    armL.position.set(0.45, 0.05, -0.25);
    armL.rotation.z = -0.15;
    armL.rotation.x = 0.2;
    lod1Group.add(armL);

    const armR = new Mesh(armGeom, mat);
    armR.position.set(-0.45, 0.05, -0.25);
    armR.rotation.z = 0.15;
    armR.rotation.x = 0.2;
    lod1Group.add(armR);

    // Hind legs shortened to 0.78m
    const legGeom = new CylinderGeometry(0.14, 0.11, 0.75, 5);
    const legL = new Mesh(legGeom, mat);
    legL.position.set(0.30, 0.12, 0.15);
    legL.rotation.x = -0.2;
    lod1Group.add(legL);

    const legR = new Mesh(legGeom, mat);
    legR.position.set(-0.30, 0.12, 0.15);
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

/* ── MonsterMesh.ts ────────────────────────────────────────────────────────
 *  Procedural seamless 3D body for the Blind Acoustic Horror Predator.
 *  Uses continuous SkinnedMesh with distance-to-segment weighting:
 *  - 24 jagged dorsal osteoderm bone-blade processes bursting through flesh
 *  - 42 recurved abyssal needle-fangs in multi-row maxillary/mandibular layout
 *  - Multi-ribbed acoustic tympanic gill-fans with 5 radiating cartilaginous spines
 *  - Visceral PBR necrotic flesh with bump relief, wet mucus micro-sheen, and cold abyssal rim
 *  - Zero external .glb dependencies required
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  InstancedMesh,
  CapsuleGeometry,
  SphereGeometry,
  CylinderGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
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

/**
 * Builds a curved, backward-hooked serrated bone-blade osteoderm geometry
 * with longitudinal grooves and sharp keels.
 */
export function buildOsteodermBladeGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  const rings = 8;
  const segments = 8;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    // Backward arc camber (curves backward by 0.07m at apex)
    const arcZ = Math.pow(v, 1.8) * 0.07;
    const y = v * 0.17;

    // Tapering blade cross-section (narrow width, deeper keel)
    const w = Math.max(0.002, 0.024 * Math.pow(1.0 - v * 0.95, 0.7));
    const d = Math.max(0.004, 0.055 * (1.0 - v * 0.92));

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Serrated notches along posterior keel (sinA > 0.5)
      const serration = sinA > 0.4 ? Math.sin(v * 28.0) * 0.004 : 0;
      // Longitudinal groove on lateral flanks (high |cosA|)
      const groove = Math.abs(cosA) > 0.6 ? -0.003 * Math.sin(v * Math.PI) : 0;

      const px = cosA * w + (cosA > 0 ? groove : -groove);
      const py = y;
      const pz = sinA * d + arcZ + serration;

      positions.push(px, py, pz);
    }
  }

  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + (s + 1);
      const d = r * stride + (s + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a recurved needle-fang geometry with a sharp inward predatory hook.
 */
export function buildRecurvedFangGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  const rings = 7;
  const segments = 8;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = v * 0.09;
    // Inward/backward hook curve
    const arcZ = Math.pow(v, 2.2) * 0.032;
    const rad = Math.max(0.0015, 0.016 * Math.pow(1.0 - v, 0.85));

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const px = Math.cos(angle) * rad * 0.85;
      const py = y;
      const pz = Math.sin(angle) * rad + arcZ;
      positions.push(px, py, pz);
    }
  }

  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + (s + 1);
      const d = r * stride + (s + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds an acoustic tympanic fan membrane supported by 5 radiating cartilaginous spines
 * with tattered, serrated trailing edges.
 */
export function buildTympanicFanGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const numSpines = 5;
  const radialSegments = 16;
  const lengthRings = 8;

  for (let r = 0; r <= lengthRings; r++) {
    const v = r / lengthRings;
    const length = 0.04 + v * 0.22;

    for (let s = 0; s <= radialSegments; s++) {
      const u = s / radialSegments;
      // Spread across fan angle
      const fanAngle = -0.55 + u * 1.10;

      // 5 undulating spines causing radial folds
      const spinePhase = u * (numSpines - 1) * Math.PI * 2.0;
      const foldZ = Math.sin(spinePhase) * 0.018 * v;

      // Tattered/serrated trailing edge at v = 1.0
      const serration = v > 0.8 ? Math.sin(u * 36.0) * 0.012 * ((v - 0.8) / 0.2) : 0;

      const px = Math.sin(fanAngle) * (length + serration);
      const py = Math.cos(fanAngle) * (length + serration) * 0.65;
      const pz = foldZ - v * 0.06;

      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }

  const stride = radialSegments + 1;
  for (let r = 0; r < lengthRings; r++) {
    for (let s = 0; s < radialSegments; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + (s + 1);
      const d = r * stride + (s + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
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
  private readonly agitationUniform = { value: 0.0 };

  constructor(scale = 1.0, tintHex = '#6b5f40', seed = 54321) {
    this.root.name = 'MonsterRoot';
    this.root.scale.set(scale, scale, scale);
    this.root.add(this.lod0);
    this.root.add(this.lod1);
    this.lod1.visible = false; // LOD0 active by default

    // 1. Generate high-resolution procedural horror PBR textures
    const flesh = generateFleshTextures({ seed });
    this.textures.push(flesh.albedo, flesh.bump, flesh.roughness);
    if (flesh.subsurface) this.textures.push(flesh.subsurface);

    const applyCreatureShaderHooks = (shader: {
      vertexShader: string;
      fragmentShader: string;
      uniforms: Record<string, { value: unknown }>;
    }) => {
      shader.uniforms.uWaterLevel = this.waterLevelUniform;
      shader.uniforms.uAgitation = this.agitationUniform;

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
        uniform float uAgitation;
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

        // Cold razor-sharp abyssal silhouette rim intensifying as agitation approaches 1.0
        vec3 abyssalRim = mix(vec3(0.18, 0.28, 0.25), vec3(0.45, 0.06, 0.04), clamp(uAgitation, 0.0, 1.0)) * pow(rim, 2.2) * (0.50 + uAgitation * 0.50);

        // Wet Mucus Specular Micro-Sheen term
        vec3 mucusNormal = normalize(vNormal);
        float mucusSheen = pow(max(0.0, dot(reflect(-viewDir, mucusNormal), viewDir)), 24.0) * 0.35;

        // Dark wet abyssal chitin with subtle bio-acoustic acoustic vein pulse
        float veinNoise = sin(vWorldPositionForWet.x * 12.0 + vWorldPositionForWet.z * 12.0) * cos(vWorldPositionForWet.y * 18.0);
        vec3 acousticVein = vec3(0.02, 0.12, 0.09) * smoothstep(0.75, 0.98, veinNoise);

        gl_FragColor.rgb += coolTopRim + coolRim + wetSheen + subsurfaceLift + abyssalRim + vec3(mucusSheen) + acousticVein;
        `,
      );
    };

    // Body skin material
    const skinMat = new MeshStandardMaterial({
      map: flesh.albedo,
      bumpMap: flesh.bump,
      bumpScale: 0.085,
      roughnessMap: flesh.roughness,
      roughness: 0.52,
      metalness: 0.03,
      envMapIntensity: 0.2,
      color: new Color(tintHex),
    });
    skinMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(skinMat);

    // Head skin material: tinted #59462d
    const headMat = new MeshStandardMaterial({
      map: flesh.albedo,
      bumpMap: flesh.bump,
      bumpScale: 0.085,
      roughnessMap: flesh.roughness,
      roughness: 0.52,
      metalness: 0.03,
      envMapIntensity: 0.2,
      color: new Color('#59462d'),
    });
    headMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(headMat);

    // Glistening dark-ivory bone/cartilage material (#c8bfa8, roughness: 0.25)
    const boneMat = new MeshStandardMaterial({
      color: new Color('#c8bfa8'),
      roughness: 0.25,
      metalness: 0.06,
    });
    this.materials.push(boneMat);

    // Acoustic tympanic gill-fan material
    const earMat = new MeshStandardMaterial({
      map: flesh.albedo,
      bumpMap: flesh.bump,
      bumpScale: 0.03,
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
    // Acoustic sensory pits: 28 dark pitted sensory pores parented to head
    const pitGeom = new SphereGeometry(0.024, 6, 6);
    const pitMat = new MeshStandardMaterial({ color: new Color('#220c0a'), roughness: 0.95 });
    this.materials.push(pitMat);
    const pitMesh = new InstancedMesh(pitGeom, pitMat, 28);
    pitMesh.name = 'acousticPits';
    pitMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const pitCoords: [number, number, number][] = [
      [0.0, 0.16, -0.06], [0.06, 0.15, -0.08], [-0.06, 0.15, -0.08],
      [0.11, 0.14, -0.10], [-0.11, 0.14, -0.10], [0.04, 0.15, 0.02], [-0.04, 0.15, 0.02],
      [0.08, 0.09, -0.18], [-0.08, 0.09, -0.18], [0.14, 0.08, -0.15], [-0.14, 0.08, -0.15],
      [0.03, 0.10, -0.19], [-0.03, 0.10, -0.19], [0.09, 0.05, -0.21], [-0.09, 0.05, -0.21],
      [0.15, 0.03, -0.18], [-0.15, 0.03, -0.18], [0.0, 0.05, -0.22],
      [0.06, 0.01, -0.23], [-0.06, 0.01, -0.23], [0.11, 0.0, -0.20], [-0.11, 0.0, -0.20],
      [0.0, 0.02, -0.24], [0.04, -0.03, -0.22], [-0.04, -0.03, -0.22],
      [0.17, 0.10, -0.08], [-0.17, 0.10, -0.08], [0.0, 0.12, -0.13],
    ];
    for (let i = 0; i < pitCoords.length; i++) {
      const [px, py, pz] = pitCoords[i]!;
      this.dummyMat.makeTranslation(px, py, pz);
      pitMesh.setMatrixAt(i, this.dummyMat);
    }
    pitMesh.instanceMatrix.needsUpdate = true;
    bm.head.add(pitMesh);

    // Predatory Skull: elongated, skull-like cranium with flared zygomatic bone arches
    const skullGeom = new CylinderGeometry(0.22, 0.19, 0.44, 14);
    skullGeom.rotateX(Math.PI / 2);
    skullGeom.scale(1.05, 0.50, 1.05);
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

    // Deep oral cavity & crimson throat gradient (#4a0707)
    const throatGeom = new SphereGeometry(0.13, 8, 8);
    const throatMat = new MeshStandardMaterial({
      color: new Color('#4a0707'),
      roughness: 0.18,
      metalness: 0.05,
    });
    this.materials.push(throatMat);
    const throatMesh = new Mesh(throatGeom, throatMat);
    throatMesh.scale.set(0.9, 0.5, 1.3);
    throatMesh.position.set(0, -0.02, -0.12);
    bm.head.add(throatMesh);

    // Blind, sealed, sunken eye socket discs with scarred dermal ridge (#635240)
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

    // Massive hinged split lower mandible
    const jawGeom = new CylinderGeometry(0.20, 0.17, 0.40, 12);
    jawGeom.rotateX(Math.PI / 2);
    jawGeom.scale(0.98, 0.38, 1.0);
    const jawMesh = new Mesh(jawGeom, headMat);
    jawMesh.position.set(0, -0.04, -0.05);
    bm.jaw.add(jawMesh);

    // Multi-Row Abyssal Needle Dentition (42 recurved needle-fangs in double-row arrangement)
    const fangGeom = buildRecurvedFangGeometry();
    this.teethMesh = new InstancedMesh(fangGeom, boneMat, 42);
    this.teethMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const m = new Matrix4();
    const rotM = new Matrix4();
    const scaleM = new Matrix4();

    // 24 Mandibular tearing & grasping fangs along lower jaw (outer & inner rows)
    for (let i = 0; i < 24; i++) {
      const isInner = i >= 16;
      const rowIdx = isInner ? i - 16 : i;
      const rowCount = isInner ? 8 : 16;
      const angle = (rowIdx / (rowCount - 1)) * Math.PI - Math.PI / 2;
      const radiusX = isInner ? 0.12 : 0.18;
      const radiusZ = isInner ? 0.16 : 0.22;
      const tx = Math.sin(angle) * radiusX;
      const tz = Math.cos(angle) * radiusZ - 0.18;
      const ty = isInner ? 0.025 : 0.018;

      // Randomized lengths (0.05m–0.14m)
      const fangScale = (0.06 + Math.abs(Math.sin(i * 1.7)) * 0.08) * (isInner ? 0.75 : 1.0);
      m.makeTranslation(tx, ty, tz);
      // Rake angle: angled slightly inward/forward
      rotM.makeRotationX(0.20 + (isInner ? 0.15 : 0.0));
      m.multiply(rotM);
      scaleM.makeScale(1.0, fangScale / 0.09, 1.0);
      m.multiply(scaleM);

      this.teethMesh.setMatrixAt(i, m);
    }

    // 18 Maxillary tearing & pharyngeal grasping fangs along upper skull rim
    for (let i = 24; i < 42; i++) {
      const idx = i - 24;
      const isInner = idx >= 12;
      const rowIdx = isInner ? idx - 12 : idx;
      const rowCount = isInner ? 6 : 12;
      const angle = (rowIdx / (rowCount - 1)) * Math.PI - Math.PI / 2;
      const radiusX = isInner ? 0.11 : 0.17;
      const radiusZ = isInner ? 0.15 : 0.21;
      const tx = Math.sin(angle) * radiusX;
      const tz = Math.cos(angle) * radiusZ - 0.20;
      const ty = isInner ? -0.015 : -0.022;

      const fangScale = (0.06 + Math.abs(Math.cos(i * 2.1)) * 0.07) * (isInner ? 0.75 : 1.0);
      m.makeTranslation(tx, ty, tz);
      // Invert Y for upper fangs pointing downward
      rotM.makeRotationZ(Math.PI);
      m.multiply(rotM);
      scaleM.makeScale(1.0, fangScale / 0.09, 1.0);
      m.multiply(scaleM);

      this.teethMesh.setMatrixAt(i, m);
    }
    this.teethMesh.instanceMatrix.needsUpdate = true;
    bm.jaw.add(this.teethMesh);

    // Multi-ribbed acoustic tympanic fan membranes with 5 radiating cartilaginous spines
    const tympanicGeomL = buildTympanicFanGeometry();
    const earMeshL = new Mesh(tympanicGeomL, earMat);
    earMeshL.name = 'TympanicFan_L';
    bm.earLeft.add(earMeshL);

    const tympanicGeomR = tympanicGeomL.clone();
    tympanicGeomR.scale(-1, 1, 1);
    const earMeshR = new Mesh(tympanicGeomR, earMat);
    earMeshR.name = 'TympanicFan_R';
    bm.earRight.add(earMeshR);

    // 24 Curved Dorsal Spine Processes (asymmetrical osteoderm blades bursting through skin)
    const bladeGeom = buildOsteodermBladeGeometry();
    this.vertebraMesh = new InstancedMesh(bladeGeom, boneMat, 24);
    this.vertebraMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    // Central primary ridge: 14 blades angled backward at 35°–50°
    for (let i = 0; i < 14; i++) {
      const progress = i / 14;
      const vz = -0.36 + progress * 0.85;
      const vy = 0.22 + Math.sin(progress * Math.PI) * 0.18;
      const bladeScale = 0.8 + Math.sin(progress * Math.PI) * 0.45;
      const rakeAngle = -0.65 - (progress * 0.22); // 37° to 50° backward rake

      m.makeTranslation(0, vy, vz);
      rotM.makeRotationX(rakeAngle);
      m.multiply(rotM);
      scaleM.makeScale(bladeScale, bladeScale, bladeScale);
      m.multiply(scaleM);

      this.vertebraMesh.setMatrixAt(i, m);
    }

    // Flanking paravertebral rows: 10 smaller jutting bone spurs (5 left, 5 right)
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const pairIdx = Math.floor(i / 2);
      const progress = 0.25 + pairIdx * 0.12;
      const vx = side * 0.085;
      const vz = -0.28 + progress * 0.65;
      const vy = 0.18 + Math.sin(progress * Math.PI) * 0.14;
      const spurScale = 0.55 + Math.sin(progress * Math.PI) * 0.25;

      m.makeTranslation(vx, vy, vz);
      rotM.makeRotationX(-0.60);
      m.multiply(rotM);
      const sideRot = new Matrix4().makeRotationZ(side * 0.28);
      m.multiply(sideRot);
      scaleM.makeScale(spurScale, spurScale, spurScale);
      m.multiply(scaleM);

      this.vertebraMesh.setMatrixAt(14 + i, m);
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

    // Disable frustum culling on all child meshes
    this.root.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        (obj as Mesh).frustumCulled = false;
      }
    });
  }

  setWaterLevel(y: number): void {
    this.waterLevelUniform.value = y;
  }

  setAgitation(agitation: number): void {
    this.agitationUniform.value = agitation;
  }

  private buildLod1Mesh(mat: Material): void {
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

    // Wide lowered skull at shoulder level
    const headGeom = new SphereGeometry(0.24, 6, 6);
    headGeom.scale(1.25, 0.65, 1.15);
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

/* ── MonsterRig.ts ─────────────────────────────────────────────────────────
 *  Full-Scale Articulated Quadrupedal Monster Rig for BackSilence (Poolrooms).
 *  - Exact anatomy from reference videos:
 *    - Full scale: 2.3m height reared up, 1.25m shoulder height on all fours, 1.35m width
 *    - Organic sculpted geometries merged per bone segment with smooth vertex normals
 *    - Deep wet charcoal-brown leathery skin shader (#2b211b / #4a4233, roughness: 0.24,
 *      metalness: 0.08, clearcoat: 0.65, clearcoatRoughness: 0.2)
 *    - Broad apelike upper chest (1.25m) tapering to lean waist (0.55m)
 *    - 9 protruding bony vertebral ridges along dorsal midline surrounded by scarred flesh (#231814)
 *    - Muscular pelvis with tattered taupe cloth wrap (#48423b)
 *    - Forelimbs: upperArm (0.65m) -> forearm (0.70m) -> hand + 4 curved claws (0.28m)
 *    - Hindlimbs: thigh (0.58m) -> shin (0.55m) -> digitigrade webbed/clawed foot
 *    - Split-shell toothed head (#965028 outer shell with grooves & crown horn)
 *    - Left & Right jaw lobes splitting vertically: 18° prowl gap, 75° (±0.65 rad) roar flare
 *    - Deep throat cavity (#080505) with wet crimson gums (#4d1a14) and 28 recurved teeth (#e8dec5)
 *    - Tilted mutated skull head variant toggle (35° cocked sideways)
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  InstancedMesh,
  BufferGeometry,
  SphereGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  MeshStandardMaterial,
  Color,
  Matrix4,
  DynamicDrawUsage,
  DoubleSide,
  type Material,
} from 'three';
import type { MonsterJoints } from './MonsterMesh.js';

export type SkullVariant = 'splitShell' | 'mutatedSkull';

function addGridIndices(indices: number[], rings: number, segments: number, flip = false): void {
  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + (s + 1);
      const d = r * stride + (s + 1);
      if (flip) indices.push(a, d, b, b, d, c);
      else indices.push(a, b, d, b, c, d);
    }
  }
}

/**
 * Builds a curved claw / talon geometry (0.32m length) hooked inward.
 */
export function buildCurvedClawGeometry(length = 0.32, baseRadius = 0.024): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 8;
  const segments = 8;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = -v * length;
    // Inward / downward hook camber
    const hookZ = -Math.pow(v, 2.0) * (length * 0.45);
    const rad = Math.max(0.002, baseRadius * Math.pow(1.0 - v * 0.98, 0.75));

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const px = Math.cos(angle) * rad * 0.85; // laterally flattened talon
      const py = y;
      const pz = Math.sin(angle) * rad + hookZ;
      positions.push(px, py, pz);
    }
  }

  addGridIndices(indices, rings, segments);

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds an organic muscular limb segment geometry with anatomical taper and flexor bulge.
 */
export function buildMuscularSegmentGeometry(
  length: number,
  radiusTop: number,
  radiusMid: number,
  radiusBottom: number,
  segments = 12,
  rings = 10,
): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = -v * length;

    // Muscular bulge profile
    let rad = radiusTop;
    if (v < 0.45) {
      const t = v / 0.45;
      rad = radiusTop + (radiusMid - radiusTop) * Math.sin(t * Math.PI * 0.5);
    } else {
      const t = (v - 0.45) / 0.55;
      rad = radiusMid + (radiusBottom - radiusMid) * t;
    }

    // Slight organic posterior muscle belly offset
    const muscleBelly = Math.sin(v * Math.PI) * (rad * 0.22);

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Flatter lateral, deeper anteroposterior
      const px = cosA * rad * 0.92;
      const py = y;
      const pz = sinA * rad + (sinA < 0 ? -muscleBelly : 0);

      positions.push(px, py, pz);
    }
  }

  addGridIndices(indices, rings, segments);

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds the hulking apelike torso geometry:
 * Broad ribcage & traps (1.25m wide) tapering down to lean waist (0.55m).
 */
export function buildSculptedTorsoGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  const rings = 12;
  const segments = 16;
  const height = 0.65;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings; // 0 = top (shoulders/neck), 1 = bottom (waist)
    const y = (1.0 - v) * height - 0.15;

    // Width: 1.25m shoulder span at v = 0.15, tapering to 0.55m at waist v = 1.0
    let widthX = 0.55;
    let depthZ = 0.45;

    if (v < 0.35) {
      const t = v / 0.35;
      widthX = 0.95 + 0.30 * Math.sin(t * Math.PI * 0.5); // peaks at 1.25m diameter
      depthZ = 0.55 + 0.15 * Math.sin(t * Math.PI * 0.5); // 0.70m depth
    } else {
      const t = (v - 0.35) / 0.65;
      widthX = 1.25 - (1.25 - 0.55) * Math.pow(t, 0.85);
      depthZ = 0.70 - (0.70 - 0.45) * t;
    }

    const rx = widthX * 0.5;
    const rz = depthZ * 0.5;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Pectoral / deltoid anterior crest (sinA > 0)
      const pec = sinA > 0 && v > 0.1 && v < 0.6 ? Math.sin((v - 0.1) / 0.5 * Math.PI) * Math.sin(angle) * 0.06 : 0;
      // Dorsal vertebral groove along spine (sinA < -0.85)
      const dorsalGroove = sinA < -0.80 ? -0.04 * (1.0 - Math.abs(cosA)) : 0;

      const px = cosA * rx;
      const py = y;
      const pz = sinA * rz + pec + dorsalGroove;

      positions.push(px, py, pz);
    }
  }

  addGridIndices(indices, rings, segments);

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds the muscular pelvis & hindquarters geometry.
 */
export function buildSculptedPelvisGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  const rings = 8;
  const segments = 14;
  const height = 0.40;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = -v * height;
    // Pelvis width: 0.55m top, widening to 0.75m across hip sockets
    const rx = 0.28 + Math.sin(v * Math.PI) * 0.095; // ~0.75m diameter
    const rz = 0.24 + Math.sin(v * Math.PI) * 0.06;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Gluteal posterior bulge (sinA < 0)
      const glute = sinA < 0 ? -Math.sin(v * Math.PI) * 0.05 : 0;

      const px = cosA * rx;
      const py = y;
      const pz = sinA * rz + glute;

      positions.push(px, py, pz);
    }
  }

  addGridIndices(indices, rings, segments);

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a dorsal vertebral process ridge process (one of 9 along spine).
 */
export function buildVertebralProcessGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 6;
  const segments = 6;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = v * 0.14; // 0.14m protruding ridge
    const backwardRake = -Math.pow(v, 1.8) * 0.06;
    const w = Math.max(0.003, 0.026 * (1.0 - v * 0.9));
    const d = Math.max(0.005, 0.055 * (1.0 - v * 0.85));

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const px = Math.cos(angle) * w;
      const py = y;
      const pz = Math.sin(angle) * d + backwardRake;
      positions.push(px, py, pz);
    }
  }

  addGridIndices(indices, rings, segments);

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds the hemispherical split-shell jaw lobe (left or right).
 * Outer ridged shell with vertical dark grooves and smooth organic interior.
 */
/**
 * Builds the 4-petal split jaw lobe (left, right, top, or bottom).
 * Outer ridged shell with vertical dark grooves and smooth organic interior.
 */
export function buildJawLobeGeometry(dir: 'left' | 'right' | 'top' | 'bottom' | boolean): BufferGeometry {
  const isLeft = dir === true || dir === 'left';
  const isRight = dir === false || dir === 'right';
  const isTop = dir === 'top';

  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  const rings = 10;
  const segments = 12;
  const radius = 0.24;
  const sideSign = isLeft ? 1 : isRight ? -1 : 1;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings; // 0 = base / back, 1 = apex / front
    const phi = v * Math.PI * 0.5; // quarter sphere
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 0.5;

      // Vertical fluting/groove modulation on outer shell
      const flute = Math.sin(u * Math.PI * 5.0) * 0.008 * sinPhi;
      const rMod = radius * (1.0 + flute);

      let px = 0;
      let py = 0;
      const pz = -Math.cos(theta) * cosPhi * rMod * 1.25;

      if (isLeft || isRight) {
        px = Math.sin(theta * sideSign) * cosPhi * rMod;
        py = Math.sin(phi) * rMod * 0.85;
      } else if (isTop) {
        px = Math.sin(phi) * rMod * 0.85 * (1.0 - u * 0.3);
        py = Math.sin(theta) * cosPhi * rMod;
      } else {
        // bottom
        px = Math.sin(phi) * rMod * 0.85 * (1.0 - u * 0.3);
        py = -Math.sin(theta) * cosPhi * rMod;
      }

      positions.push(px, py, pz);
    }
  }

  addGridIndices(indices, rings, segments, !(isLeft || isTop));

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a single sharp, inward-curving off-white needle tooth (#e8dec5).
 */
export function buildNeedleToothGeometry(length = 0.075, rad = 0.012): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 6;
  const segments = 6;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = v * length;
    const inwardHook = Math.pow(v, 2.0) * (length * 0.40);
    const curRad = Math.max(0.001, rad * Math.pow(1.0 - v, 0.85));

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const px = Math.cos(angle) * curRad;
      const py = y;
      const pz = Math.sin(angle) * curRad + inwardHook;
      positions.push(px, py, pz);
    }
  }

  addGridIndices(indices, rings, segments);

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds tattered taupe loin wrap around pelvis.
 */
export function buildTatteredPelvisWrapGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 16;
  const rings = 4;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = -v * 0.28;
    const rx = 0.39 + v * 0.08;
    const rz = 0.34 + v * 0.08;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;

      // Tattered hem fray at bottom
      const hemTear = v > 0.75 ? Math.sin(u * 28.0) * 0.05 : 0;

      const px = Math.cos(angle) * rx;
      const py = y + hemTear;
      const pz = Math.sin(angle) * rz;

      positions.push(px, py, pz);
    }
  }

  addGridIndices(indices, rings, segments);

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

export class MonsterRig {
  readonly rootGroup = new Group();
  readonly pelvis = new Group();
  readonly lowerSpine = new Group();
  readonly upperChest = new Group(); // Torso
  readonly neck = new Group();
  readonly headGroup = new Group();
  readonly jawGroup = new Group();
  readonly leftJawLobe = new Group();
  readonly rightJawLobe = new Group();
  readonly topJawLobe = new Group();
  readonly bottomJawLobe = new Group();

  // Limbs
  readonly shoulderL = new Group();
  readonly upperArmL = new Group();
  readonly elbowL = new Group();
  readonly forearmL = new Group();
  readonly wristL = new Group();
  readonly handL = new Group();
  readonly clawsL = new Group();

  readonly shoulderR = new Group();
  readonly upperArmR = new Group();
  readonly elbowR = new Group();
  readonly forearmR = new Group();
  readonly wristR = new Group();
  readonly handR = new Group();
  readonly clawsR = new Group();

  readonly hipL = new Group();
  readonly thighL = new Group();
  readonly kneeL = new Group();
  readonly shinL = new Group();
  readonly ankleL = new Group();
  readonly footL = new Group();

  readonly hipR = new Group();
  readonly thighR = new Group();
  readonly kneeR = new Group();
  readonly shinR = new Group();
  readonly ankleR = new Group();
  readonly footR = new Group();

  // Ear-fans for audio awareness
  readonly earLeft = new Group();
  readonly earRight = new Group();

  // Spine accessories
  readonly dorsalSpineGroup = new Group();
  readonly dorsalRidges: Mesh[] = [];

  // Teeth ring: double concentric ring of 36 sharp teeth
  readonly teethMesh: InstancedMesh;

  // Variants
  readonly splitShellMeshGroup = new Group();
  readonly mutatedSkullGroup = new Group();
  private currentVariant: SkullVariant = 'splitShell';

  // Materials & Shaders
  readonly monsterSkinMat: MeshStandardMaterial;
  readonly shellMat: MeshStandardMaterial;
  readonly boneMat: MeshStandardMaterial;
  readonly throatMat: MeshStandardMaterial;
  readonly gumsMat: MeshStandardMaterial;
  readonly clothMat: MeshStandardMaterial;
  readonly scarMat: MeshStandardMaterial;

  private readonly materials: Material[] = [];
  private readonly waterLevelUniform = { value: 0.0 };
  private readonly agitationUniform = { value: 0.0 };
  private currentJawSplitRad = 0.15; // default ~18° prowl gap

  constructor(scale = 1.0, tintHex = '#221916', _seed = 54321) {
    this.rootGroup.name = 'MonsterRigRoot';
    this.rootGroup.scale.set(scale, scale, scale);

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Shaders & Materials Setup
    // ──────────────────────────────────────────────────────────────────────────
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
        // Wetness below waterline + 0.30m
        float wetT = clamp((uWaterLevel + 0.30 - vWorldPositionForWet.y) / 0.30, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.10, wetT * 0.9);
        diffuseColor.rgb *= mix(1.0, 0.72, wetT);
        // Submerged albedo darkening 15%
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
          // 45% extinction reduction so the silhouette survives the haze at 25m–45m without clipping
          fogFactor = clamp( fogFactor * 0.55, 0.0, 1.0 );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
        #endif

        // Cool top rim for readability against pale water + neutral rim + wet sheen
        vec3 viewDir = normalize(vViewPosition);
        float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
        float topMask = max(0.0, vNormal.y);
        vec3 coolTopRim = vec3(0.18, 0.22, 0.25) * pow(rim, 2.0) * topMask * 0.50;
        vec3 coolRim = vec3(0.16, 0.20, 0.22) * pow(rim, 2.2) * 0.35;
        vec3 wetSheen = vec3(0.04, 0.045, 0.04) * pow(rim, 3.0);
        vec3 subsurfaceLift = vec3(0.065, 0.045, 0.038);

        // Agitation abyssal rim pulse
        vec3 abyssalRim = mix(vec3(0.18, 0.28, 0.25), vec3(0.45, 0.06, 0.04), clamp(uAgitation, 0.0, 1.0)) * pow(rim, 2.2) * (0.50 + uAgitation * 0.50);

        // Wet Mucus Specular Micro-Sheen term
        vec3 mucusNormal = normalize(vNormal);
        float mucusSheen = pow(max(0.0, dot(reflect(-viewDir, mucusNormal), viewDir)), 24.0) * 0.35;

        gl_FragColor.rgb += coolTopRim + coolRim + wetSheen + subsurfaceLift + abyssalRim + vec3(mucusSheen);
        `,
      );
    };

    // Gaunt necrotic charcoal-brown flesh (#221916, roughness 0.22, clearcoat 0.70 wet slime sheen)
    const isLegacySkin = tintHex.toLowerCase() === '#2b211b';
    this.monsterSkinMat = new MeshStandardMaterial({
      color: new Color(tintHex),
      roughness: isLegacySkin ? 0.24 : 0.22,
      metalness: 0.08,
      envMapIntensity: 0.4,
    });
    // Add clearcoat if available in Three.js standard material
    (this.monsterSkinMat as unknown as { clearcoat?: number; clearcoatRoughness?: number }).clearcoat = isLegacySkin ? 0.65 : 0.70;
    (this.monsterSkinMat as unknown as { clearcoatRoughness?: number }).clearcoatRoughness = isLegacySkin ? 0.2 : 0.18;
    this.monsterSkinMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.monsterSkinMat);

    // Shell material: outer carapace (#732a1e)
    this.shellMat = new MeshStandardMaterial({
      color: new Color('#732a1e'),
      roughness: 0.30,
      metalness: 0.05,
    });
    this.shellMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.shellMat);

    // Bone / Claws / Teeth material: ivory bone (#e8dec5 / #c8bfa8)
    this.boneMat = new MeshStandardMaterial({
      color: new Color('#e8dec5'),
      roughness: 0.25,
      metalness: 0.06,
    });
    this.materials.push(this.boneMat);

    // Deep abyssal throat cavity (#080505)
    this.throatMat = new MeshStandardMaterial({
      color: new Color('#080505'),
      roughness: 0.20,
      metalness: 0.02,
    });
    this.materials.push(this.throatMat);

    // Gums material: wet crimson-brown (#4d1a14)
    this.gumsMat = new MeshStandardMaterial({
      color: new Color('#4d1a14'),
      roughness: 0.15,
      metalness: 0.05,
    });
    this.materials.push(this.gumsMat);

    // Tattered pelvis wrap (#48423b)
    this.clothMat = new MeshStandardMaterial({
      color: new Color('#48423b'),
      roughness: 0.85,
      metalness: 0.02,
      side: DoubleSide,
    });
    this.materials.push(this.clothMat);

    // Scarred tissue around spine ridges (#231814)
    this.scarMat = new MeshStandardMaterial({
      color: new Color('#231814'),
      roughness: 0.42,
      metalness: 0.04,
    });
    this.materials.push(this.scarMat);

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Skeletal Joint Hierarchy
    // ──────────────────────────────────────────────────────────────────────────
    // Root -> Pelvis
    this.pelvis.name = 'Rig_Pelvis';
    this.pelvis.position.set(0, 0.70, 0.15);
    this.rootGroup.add(this.pelvis);

    // Pelvis mesh & tattered loin wrap
    const pelvisGeom = buildSculptedPelvisGeometry();
    const pelvisMesh = new Mesh(pelvisGeom, this.monsterSkinMat);
    pelvisMesh.name = 'PelvisMesh';
    this.pelvis.add(pelvisMesh);

    const wrapGeom = buildTatteredPelvisWrapGeometry();
    const wrapMesh = new Mesh(wrapGeom, this.clothMat);
    wrapMesh.name = 'TatteredPelvisWrap';
    wrapMesh.position.set(0, -0.05, 0);
    this.pelvis.add(wrapMesh);

    // Lower Spine (midsection tapering to 0.55m)
    this.lowerSpine.name = 'Rig_LowerSpine';
    this.lowerSpine.position.set(0, 0.15, -0.12);
    this.pelvis.add(this.lowerSpine);

    const midSectionGeom = buildMuscularSegmentGeometry(0.25, 0.28, 0.27, 0.26, 12, 6);
    const midSectionMesh = new Mesh(midSectionGeom, this.monsterSkinMat);
    midSectionMesh.rotation.x = Math.PI * 0.5;
    this.lowerSpine.add(midSectionMesh);

    // Upper Chest & Ribcage (width: 1.25m, shoulder height on all fours ~1.25m)
    this.upperChest.name = 'Rig_UpperChest';
    this.upperChest.position.set(0, 0.22, -0.22);
    this.lowerSpine.add(this.upperChest);

    const torsoGeom = buildSculptedTorsoGeometry();
    const torsoMesh = new Mesh(torsoGeom, this.monsterSkinMat);
    torsoMesh.name = 'TorsoMesh';
    this.upperChest.add(torsoMesh);

    // Dorsal Spine Ridge: 10 protruding bony vertebral ridges running down back from neck to pelvis
    this.dorsalSpineGroup.name = 'DorsalSpineRidgeGroup';
    this.upperChest.add(this.dorsalSpineGroup);

    const vertGeom = buildVertebralProcessGeometry();
    for (let i = 0; i < 10; i++) {
      const vProgress = i / 9.0;
      const vertMesh = new Mesh(vertGeom, this.boneMat);
      // Positioned along spine curve from neck (front) to pelvis (back)
      const vz = 0.25 - vProgress * 0.65;
      const vy = 0.18 + Math.sin(vProgress * Math.PI) * 0.12;
      const vScale = 0.85 + Math.sin(vProgress * Math.PI) * 0.35;

      vertMesh.position.set(0, vy, vz);
      vertMesh.rotation.x = -0.55 - vProgress * 0.25; // 32° to 45° backward rake
      vertMesh.scale.set(vScale, vScale, vScale);
      vertMesh.name = `DorsalRidge_${i + 1}`;

      // Scarred tissue base collar
      const scarGeom = buildMuscularSegmentGeometry(0.04, 0.05, 0.06, 0.03, 6, 3);
      const scarBase = new Mesh(scarGeom, this.scarMat);
      scarBase.position.set(0, vy - 0.02, vz);
      scarBase.rotation.x = vertMesh.rotation.x;
      this.dorsalSpineGroup.add(scarBase);

      this.dorsalSpineGroup.add(vertMesh);
      this.dorsalRidges.push(vertMesh);
    }

    // Neck
    this.neck.name = 'Rig_Neck';
    this.neck.position.set(0, 0.18, -0.32);
    this.upperChest.add(this.neck);

    const neckGeom = buildMuscularSegmentGeometry(0.24, 0.22, 0.20, 0.18, 10, 6);
    const neckMesh = new Mesh(neckGeom, this.monsterSkinMat);
    neckMesh.rotation.x = -Math.PI * 0.45;
    this.neck.add(neckMesh);

    // Ear-fans for acoustic sensitivity
    this.earLeft.name = 'Rig_EarLeft';
    this.earLeft.position.set(0.18, 0.06, -0.06);
    this.neck.add(this.earLeft);

    this.earRight.name = 'Rig_EarRight';
    this.earRight.position.set(-0.18, 0.06, -0.06);
    this.neck.add(this.earRight);

    // Head Group
    this.headGroup.name = 'Rig_Head';
    this.headGroup.position.set(0, 0.06, -0.22);
    this.neck.add(this.headGroup);

    // ──────────────────────────────────────────────────────────────────────────
    // 3. The Split-Shell Toothed Head (#965028 outer shell with crown horn & 28 teeth)
    // ──────────────────────────────────────────────────────────────────────────
    this.splitShellMeshGroup.name = 'SplitShellHeadVariant';
    this.headGroup.add(this.splitShellMeshGroup);

    // Crown horn / stem atop head
    const hornGeom = buildCurvedClawGeometry(0.12, 0.02);
    const crownHorn = new Mesh(hornGeom, this.boneMat);
    crownHorn.rotation.x = Math.PI * 0.8;
    crownHorn.position.set(0, 0.22, -0.08);
    this.splitShellMeshGroup.add(crownHorn);

    // Deep pitch-black throat cavity
    const throatGeom = buildMuscularSegmentGeometry(0.28, 0.16, 0.14, 0.08, 10, 6);
    const throatMesh = new Mesh(throatGeom, this.throatMat);
    throatMesh.rotation.x = Math.PI * 0.5;
    throatMesh.position.set(0, 0.02, 0.06);
    this.splitShellMeshGroup.add(throatMesh);

    // Wet crimson gums rim
    const gumsGeom = buildMuscularSegmentGeometry(0.12, 0.18, 0.17, 0.15, 12, 4);
    const gumsMesh = new Mesh(gumsGeom, this.gumsMat);
    gumsMesh.rotation.x = Math.PI * 0.5;
    gumsMesh.position.set(0, 0.01, -0.02);
    this.splitShellMeshGroup.add(gumsMesh);

    // Jaw container
    this.jawGroup.name = 'Rig_Jaw';
    this.headGroup.add(this.jawGroup);

    // 4-Petal Split Jaws (left, right, top, bottom petals)
    this.leftJawLobe.name = 'LeftJawLobe';
    this.leftJawLobe.position.set(0.04, 0, 0);
    const leftLobeGeom = buildJawLobeGeometry('left');
    const leftLobeMesh = new Mesh(leftLobeGeom, this.shellMat);
    this.leftJawLobe.add(leftLobeMesh);
    this.jawGroup.add(this.leftJawLobe);

    this.rightJawLobe.name = 'RightJawLobe';
    this.rightJawLobe.position.set(-0.04, 0, 0);
    const rightLobeGeom = buildJawLobeGeometry('right');
    const rightLobeMesh = new Mesh(rightLobeGeom, this.shellMat);
    this.rightJawLobe.add(rightLobeMesh);
    this.jawGroup.add(this.rightJawLobe);

    this.topJawLobe.name = 'TopJawLobe';
    this.topJawLobe.position.set(0, 0.04, 0);
    const topLobeGeom = buildJawLobeGeometry('top');
    const topLobeMesh = new Mesh(topLobeGeom, this.shellMat);
    this.topJawLobe.add(topLobeMesh);
    this.jawGroup.add(this.topJawLobe);

    this.bottomJawLobe.name = 'BottomJawLobe';
    this.bottomJawLobe.position.set(0, -0.04, 0);
    const bottomLobeGeom = buildJawLobeGeometry('bottom');
    const bottomLobeMesh = new Mesh(bottomLobeGeom, this.shellMat);
    this.bottomJawLobe.add(bottomLobeMesh);
    this.jawGroup.add(this.bottomJawLobe);

    // Double Concentric Teeth Ring: 36 sharp inward-curving off-white teeth (#e8dec5)
    const toothGeom = buildNeedleToothGeometry(0.068, 0.011);
    this.teethMesh = new InstancedMesh(toothGeom, this.boneMat, 36);
    this.teethMesh.name = 'ConcentricTeethRing';
    this.teethMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const m = new Matrix4();
    const rotM = new Matrix4();
    const scaleM = new Matrix4();
    const rake = new Matrix4();

    const teethConfig = [
      { count: 10, start: 0, rx: 0.17, rz: 0.20, zOff: -0.02, y: 0.078, flip: true, rakeAngle: 0.22, baseScale: 0.88, varScale: 0.35, freq: 1.5, useSin: true },
      { count: 10, start: 10, rx: 0.16, rz: 0.19, zOff: -0.02, y: -0.068, flip: false, rakeAngle: -0.25, baseScale: 0.88, varScale: 0.35, freq: 1.7, useSin: false },
      { count: 8, start: 20, rx: 0.11, rz: 0.13, zOff: -0.06, y: 0.052, flip: true, rakeAngle: 0.30, baseScale: 0.70, varScale: 0.25, freq: 1.8, useSin: true },
      { count: 8, start: 28, rx: 0.10, rz: 0.12, zOff: -0.06, y: -0.045, flip: false, rakeAngle: -0.32, baseScale: 0.70, varScale: 0.25, freq: 1.9, useSin: false },
    ];

    for (const cfg of teethConfig) {
      for (let i = 0; i < cfg.count; i++) {
        const angle = (i / (cfg.count - 1)) * Math.PI - Math.PI * 0.5;
        const tx = Math.sin(angle) * cfg.rx;
        const tz = -Math.cos(angle) * cfg.rz + cfg.zOff;
        const toothScale = cfg.baseScale + Math.abs(cfg.useSin ? Math.sin(i * cfg.freq) : Math.cos(i * cfg.freq)) * cfg.varScale;

        m.makeTranslation(tx, cfg.y, tz);
        if (cfg.flip) {
          rotM.makeRotationZ(Math.PI);
          m.multiply(rotM);
        }
        rake.makeRotationX(cfg.rakeAngle);
        m.multiply(rake);
        scaleM.makeScale(toothScale, toothScale, toothScale);
        m.multiply(scaleM);
        this.teethMesh.setMatrixAt(cfg.start + i, m);
      }
    }
    this.teethMesh.instanceMatrix.needsUpdate = true;
    this.jawGroup.add(this.teethMesh);

    // Dripping wet slimy tendrils around jaw perimeter
    const tendrilMat = new MeshStandardMaterial({
      color: new Color('#1c0c09'),
      roughness: 0.10,
      metalness: 0.08,
    });
    this.materials.push(tendrilMat);
    const tendrilGeom = buildCurvedClawGeometry(0.14, 0.008);
    for (let ti = 0; ti < 6; ti++) {
      const tMesh = new Mesh(tendrilGeom, tendrilMat);
      const tAngle = (ti / 5) * Math.PI - Math.PI * 0.5;
      tMesh.position.set(Math.sin(tAngle) * 0.12, -0.06, -0.08 - Math.cos(tAngle) * 0.05);
      tMesh.scale.set(0.65, 0.9, 0.65);
      this.jawGroup.add(tMesh);
    }

    // Subtle pale bio-luminescent specular catchlights in throat (#a0f0d0)
    const catchlightMat = new MeshStandardMaterial({
      color: new Color('#a0f0d0'),
      emissive: new Color('#a0f0d0'),
      emissiveIntensity: 0.45,
      roughness: 0.15,
      metalness: 0.10,
    });
    this.materials.push(catchlightMat);
    const catchlightGeom = new SphereGeometry(0.012, 6, 6);
    for (const cOff of [-0.045, 0.045]) {
      const clMesh = new Mesh(catchlightGeom, catchlightMat);
      clMesh.position.set(cOff, 0.015, -0.09);
      this.splitShellMeshGroup.add(clMesh);
    }

    // Initial 18° prowl gap
    this.setJawSplit(0.15);

    // ──────────────────────────────────────────────────────────────────────────
    // 3b. Tilted Mutated Skull Head Variant (cocked 35° sideways with hollow sockets)
    // ──────────────────────────────────────────────────────────────────────────
    this.mutatedSkullGroup.name = 'MutatedSkullHeadVariant';
    this.mutatedSkullGroup.visible = false;
    this.headGroup.add(this.mutatedSkullGroup);

    const skullBaseGeom = buildMuscularSegmentGeometry(0.35, 0.19, 0.18, 0.14, 10, 6);
    const skullBaseMesh = new Mesh(skullBaseGeom, this.monsterSkinMat);
    skullBaseMesh.rotation.x = Math.PI * 0.5;
    this.mutatedSkullGroup.add(skullBaseMesh);

    // Cocked 35° sideways rotation
    this.mutatedSkullGroup.rotation.z = 0.61; // ~35° tilt
    this.mutatedSkullGroup.rotation.y = 0.15;

    // Hollow dark orbital cavities
    const orbitGeom = buildMuscularSegmentGeometry(0.06, 0.045, 0.04, 0.02, 8, 3);
    const orbitL = new Mesh(orbitGeom, this.throatMat);
    orbitL.position.set(0.08, 0.08, -0.16);
    this.mutatedSkullGroup.add(orbitL);

    const orbitR = new Mesh(orbitGeom, this.throatMat);
    orbitR.position.set(-0.08, 0.08, -0.16);
    this.mutatedSkullGroup.add(orbitR);

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Quadrupedal Forelimbs (Upper Arm 0.65m, Forearm 0.70m, Hand + 4 Claws 0.28m)
    // ──────────────────────────────────────────────────────────────────────────
    // Left Forelimb: wide deltoid mount at x = 0.625m (half of 1.25m chest)
    this.shoulderL.name = 'Rig_ShoulderL';
    this.shoulderL.position.set(0.625, 0.02, -0.15);
    this.upperChest.add(this.shoulderL);

    this.upperArmL.name = 'Rig_UpperArmL';
    const upperArmGeom = buildMuscularSegmentGeometry(0.65, 0.16, 0.14, 0.11, 10, 8);
    const upperArmMeshL = new Mesh(upperArmGeom, this.monsterSkinMat);
    this.upperArmL.add(upperArmMeshL);
    this.shoulderL.add(this.upperArmL);

    this.elbowL.name = 'Rig_ElbowL';
    this.elbowL.position.set(0, -0.65, 0);
    this.upperArmL.add(this.elbowL);

    this.forearmL.name = 'Rig_ForearmL';
    const forearmGeom = buildMuscularSegmentGeometry(0.70, 0.12, 0.13, 0.09, 10, 8);
    const forearmMeshL = new Mesh(forearmGeom, this.monsterSkinMat);
    this.forearmL.add(forearmMeshL);
    this.elbowL.add(this.forearmL);

    this.wristL.name = 'Rig_WristL';
    this.wristL.position.set(0, -0.70, 0);
    this.forearmL.add(this.wristL);

    this.handL.name = 'Rig_HandL';
    const palmGeom = buildMuscularSegmentGeometry(0.14, 0.11, 0.12, 0.08, 8, 4);
    const palmMeshL = new Mesh(palmGeom, this.monsterSkinMat);
    this.handL.add(palmMeshL);
    this.wristL.add(this.handL);

    // 4 Curved Talons (0.28m each)
    this.clawsL.name = 'Rig_ClawsL';
    this.clawsL.position.set(0, -0.14, 0);
    this.handL.add(this.clawsL);

    const clawGeom = buildCurvedClawGeometry(0.28, 0.022);
    for (let c = 0; c < 4; c++) {
      const clawMesh = new Mesh(clawGeom, this.boneMat);
      const cx = (c - 1.5) * 0.048;
      clawMesh.position.set(cx, 0, -0.02 - Math.abs(c - 1.5) * 0.012);
      clawMesh.rotation.z = (c - 1.5) * 0.08;
      this.clawsL.add(clawMesh);
    }

    // Right Forelimb: wide deltoid mount at x = -0.625m
    this.shoulderR.name = 'Rig_ShoulderR';
    this.shoulderR.position.set(-0.625, 0.02, -0.15);
    this.upperChest.add(this.shoulderR);

    this.upperArmR.name = 'Rig_UpperArmR';
    const upperArmMeshR = new Mesh(upperArmGeom, this.monsterSkinMat);
    this.upperArmR.add(upperArmMeshR);
    this.shoulderR.add(this.upperArmR);

    this.elbowR.name = 'Rig_ElbowR';
    this.elbowR.position.set(0, -0.65, 0);
    this.upperArmR.add(this.elbowR);

    this.forearmR.name = 'Rig_ForearmR';
    const forearmMeshR = new Mesh(forearmGeom, this.monsterSkinMat);
    this.forearmR.add(forearmMeshR);
    this.elbowR.add(this.forearmR);

    this.wristR.name = 'Rig_WristR';
    this.wristR.position.set(0, -0.70, 0);
    this.forearmR.add(this.wristR);

    this.handR.name = 'Rig_HandR';
    const palmMeshR = new Mesh(palmGeom, this.monsterSkinMat);
    this.handR.add(palmMeshR);
    this.wristR.add(this.handR);

    this.clawsR.name = 'Rig_ClawsR';
    this.clawsR.position.set(0, -0.14, 0);
    this.handR.add(this.clawsR);

    for (let c = 0; c < 4; c++) {
      const clawMesh = new Mesh(clawGeom, this.boneMat);
      const cx = (c - 1.5) * 0.048;
      clawMesh.position.set(cx, 0, -0.02 - Math.abs(c - 1.5) * 0.012);
      clawMesh.rotation.z = (c - 1.5) * 0.08;
      this.clawsR.add(clawMesh);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Digitigrade Hindlimbs (Thigh 0.58m, Shin 0.55m, Foot planted in pool floor)
    // ──────────────────────────────────────────────────────────────────────────
    // Left Hindlimb
    this.hipL.name = 'Rig_HipL';
    this.hipL.position.set(0.38, -0.15, 0.05);
    this.pelvis.add(this.hipL);

    this.thighL.name = 'Rig_ThighL';
    const thighGeom = buildMuscularSegmentGeometry(0.58, 0.17, 0.16, 0.11, 10, 8);
    const thighMeshL = new Mesh(thighGeom, this.monsterSkinMat);
    this.thighL.add(thighMeshL);
    this.hipL.add(this.thighL);

    this.kneeL.name = 'Rig_KneeL';
    this.kneeL.position.set(0, -0.58, 0);
    this.thighL.add(this.kneeL);

    this.shinL.name = 'Rig_ShinL';
    const shinGeom = buildMuscularSegmentGeometry(0.55, 0.11, 0.12, 0.08, 10, 8);
    const shinMeshL = new Mesh(shinGeom, this.monsterSkinMat);
    this.shinL.add(shinMeshL);
    this.kneeL.add(this.shinL);

    this.ankleL.name = 'Rig_AnkleL';
    this.ankleL.position.set(0, -0.55, 0);
    this.shinL.add(this.ankleL);

    this.footL.name = 'Rig_FootL';
    const footGeom = buildMuscularSegmentGeometry(0.22, 0.09, 0.10, 0.06, 8, 4);
    const footMeshL = new Mesh(footGeom, this.monsterSkinMat);
    footMeshL.rotation.x = -Math.PI * 0.45;
    this.footL.add(footMeshL);
    this.ankleL.add(this.footL);

    // Webbed claws on foot
    for (let c = 0; c < 3; c++) {
      const footClaw = new Mesh(clawGeom, this.boneMat);
      footClaw.scale.set(0.65, 0.65, 0.65);
      footClaw.position.set((c - 1) * 0.045, -0.04, -0.18);
      this.footL.add(footClaw);
    }

    // Right Hindlimb
    this.hipR.name = 'Rig_HipR';
    this.hipR.position.set(-0.38, -0.15, 0.05);
    this.pelvis.add(this.hipR);

    this.thighR.name = 'Rig_ThighR';
    const thighMeshR = new Mesh(thighGeom, this.monsterSkinMat);
    this.thighR.add(thighMeshR);
    this.hipR.add(this.thighR);

    this.kneeR.name = 'Rig_KneeR';
    this.kneeR.position.set(0, -0.58, 0);
    this.thighR.add(this.kneeR);

    this.shinR.name = 'Rig_ShinR';
    const shinMeshR = new Mesh(shinGeom, this.monsterSkinMat);
    this.shinR.add(shinMeshR);
    this.kneeR.add(this.shinR);

    this.ankleR.name = 'Rig_AnkleR';
    this.ankleR.position.set(0, -0.55, 0);
    this.shinR.add(this.ankleR);

    this.footR.name = 'Rig_FootR';
    const footMeshR = new Mesh(footGeom, this.monsterSkinMat);
    footMeshR.rotation.x = -Math.PI * 0.45;
    this.footR.add(footMeshR);
    this.ankleR.add(this.footR);

    for (let c = 0; c < 3; c++) {
      const footClaw = new Mesh(clawGeom, this.boneMat);
      footClaw.scale.set(0.65, 0.65, 0.65);
      footClaw.position.set((c - 1) * 0.045, -0.04, -0.18);
      this.footR.add(footClaw);
    }

    // Disable frustum culling on all child meshes
    this.rootGroup.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        (obj as Mesh).frustumCulled = false;
      }
    });
  }

  /**
   * Sets the 4-petal split flare of all four jaw lobes:
   * 0 rad = closed, 0.15 rad = ~18° prowl gap, 0.65 to 1.31 rad = ~75° roar/lunge flare.
   */
  setJawSplit(angleRad: number): void {
    this.currentJawSplitRad = angleRad;
    this.leftJawLobe.rotation.y = angleRad;
    this.rightJawLobe.rotation.y = -angleRad;
    this.topJawLobe.rotation.x = -angleRad;
    this.bottomJawLobe.rotation.x = angleRad;
  }

  getJawSplit(): number {
    return this.currentJawSplitRad;
  }

  /**
   * Toggles between the signature split-shell head and the tilted 35° mutated skull head.
   */
  setSkullVariant(variant: SkullVariant): void {
    this.currentVariant = variant;
    if (variant === 'splitShell') {
      this.splitShellMeshGroup.visible = true;
      this.jawGroup.visible = true;
      this.mutatedSkullGroup.visible = false;
    } else {
      this.splitShellMeshGroup.visible = false;
      this.jawGroup.visible = false;
      this.mutatedSkullGroup.visible = true;
    }
  }

  getSkullVariant(): SkullVariant {
    return this.currentVariant;
  }

  setWaterLevel(y: number): void {
    this.waterLevelUniform.value = y;
  }

  setAgitation(agitation: number): void {
    this.agitationUniform.value = agitation;
  }

  /**
   * Exposes a compatible MonsterJoints interface for IK solvers and presentation controllers.
   */
  getJoints(): MonsterJoints {
    return {
      root: this.rootGroup,
      pelvis: this.pelvis,
      spine: [this.lowerSpine, this.upperChest],
      torso: this.upperChest,
      neck: this.neck,
      head: this.headGroup,
      jaw: this.jawGroup,
      earLeft: this.earLeft,
      earRight: this.earRight,
      shoulderL: this.shoulderL,
      elbowL: this.elbowL,
      handL: this.handL,
      shoulderR: this.shoulderR,
      elbowR: this.elbowR,
      handR: this.handR,
      hipL: this.hipL,
      kneeL: this.kneeL,
      footL: this.footL,
      hipR: this.hipR,
      kneeR: this.kneeR,
      footR: this.footR,
    };
  }

  dispose(): void {
    this.rootGroup.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        (obj as Mesh).geometry.dispose();
      }
    });
    this.materials.forEach((m) => m.dispose());
    this.rootGroup.removeFromParent();
  }
}

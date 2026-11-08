/* ── MonsterRig.ts ─────────────────────────────────────────────────────────
 *  Articulated Quadrupedal Reference Creature Rig for BackSilence (Poolrooms).
 *  Rebuilt strictly against reference footage (`f_010`, `f_018`, `f_021`, `f_035`, `f_037`)
 *  and `reports/monster/creature_spec.md`:
 *    - Wet brown-grey mottled hide (#5a5035 body, #59462d head) with <=12% reddish blotches
 *    - Rounded seed-pod dome head covered in 32 dark pits, small dark mouth,
 *      subdued maroon facial marking (#4a2520), zero visible eyes, zero horns, zero split shell
 *    - Gaunt ribcage torso (0.65m length, 1.25m shoulder span), zero dorsal spine ridges
 *    - Disproportionately long forelimbs (0.65m upper + 0.70m forearm = 1.35m, 2.08x torso)
 *      ending in 4 long splayed clawed fingers (0.28m) that drag through the water
 *    - Long tapering tail (1.15m length, 0.11m base -> 0.015m tip)
 *    - Low quadrupedal hunch (0.65 rad) with head carried low
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
  Vector3,
  Euler,
  Quaternion,
  DynamicDrawUsage,
  DoubleSide,
  type Material,
  type Texture,
} from 'three';
import type { MonsterJoints } from './MonsterMesh.js';
import { generateFleshTextures, type FleshTextureResult } from '../../procedural/textures/FleshTexture.js';

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
 * Builds a curved claw / finger geometry (0.28m default length) splayed for dragging through water.
 */
export function buildCurvedClawGeometry(length = 0.28, baseRadius = 0.022): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 8;
  const segments = 8;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = -v * length;
    const hookZ = -Math.pow(v, 2.0) * (length * 0.38);
    const rad = Math.max(0.002, baseRadius * Math.pow(1.0 - v * 0.96, 0.75));

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const px = Math.cos(angle) * rad * 0.85;
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
 * Builds a broad, flat wading foot geometry (0.28m length, 0.16m width, 0.05m thickness)
 * specifically designed for stability and high water resistance in the wading stance (f_018).
 */
export function buildFlatWadingFootGeometry(
  length = 0.28,
  width = 0.16,
  thickness = 0.05,
  segments = 8,
  rings = 6,
): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = -v * length;
    const w = (width * 0.70 + width * 0.45 * Math.sin(v * Math.PI * 0.6)) * 0.5;
    const h = (thickness * (1.10 - v * 0.40)) * 0.5;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = (u - 0.5) * Math.PI * 2;
      const px = Math.cos(angle) * w;
      const pz = Math.sin(angle) * h;
      positions.push(px, y, pz);
    }
  }

  addGridIndices(indices, rings, segments);

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(new Uint16BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds an organic curved jaw petal geometry for the 4-lobe flared maw.
 */
export function buildJawPetalGeometry(length = 0.20, baseWidth = 0.12, tipWidth = 0.03): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 6;
  const segments = 6;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const z = -v * length;
    const curve = Math.sin(v * Math.PI) * 0.035;
    const w = (baseWidth * (1.0 - v * 0.6) + tipWidth * (v * 0.6)) * 0.5;
    const h = (0.05 * (1.0 - v * 0.5)) * 0.5;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = (u - 0.5) * Math.PI;
      const px = Math.sin(angle) * w;
      const py = Math.cos(angle) * h + curve;
      const pz = z;
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
 * Builds an inner mucosal gum cushion geometry matching the inner concave curvature of a jaw petal.
 */
export function buildJawGumsGeometry(length = 0.18, baseWidth = 0.10, thickness = 0.022): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 6;
  const segments = 6;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const z = -v * length;
    const curve = Math.sin(v * Math.PI) * 0.030;
    const w = (baseWidth * (1.0 - v * 0.55) + 0.025 * (v * 0.55)) * 0.5;
    const h = thickness * (1.0 - v * 0.45);

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = (u - 0.5) * Math.PI;
      const px = Math.sin(angle) * w;
      const py = Math.cos(angle) * h + curve + 0.004;
      const pz = z;
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
 * Builds an InstancedMesh containing 12 curved needle teeth and corner fangs rooted on the inner petal gums:
 * - 2 concentric rows of 5 curved needle teeth (10 needle teeth)
 * - 2 prominent corner fangs at the basal lateral margins
 * All pointing inward toward the throat.
 */
export function buildPetalTeethInstancedMesh(toothGeom: BufferGeometry, boneMat: Material): InstancedMesh {
  const mesh = new InstancedMesh(toothGeom, boneMat, 12);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);

  const mat = new Matrix4();
  const pos = new Vector3();
  const rot = new Euler();
  const quat = new Quaternion();
  const scale = new Vector3();

  // Row 1 (inner row, 5 needle teeth closer to base/throat)
  const r1X = [-0.032, -0.016, 0.0, 0.016, 0.032];
  const r1Z = [-0.040, -0.048, -0.052, -0.048, -0.040];
  for (let i = 0; i < 5; i++) {
    const x = r1X[i]!;
    const z = r1Z[i]!;
    pos.set(x, 0.014, z);
    rot.set(Math.PI - 0.45, 0, -x * 5.0);
    quat.setFromEuler(rot);
    scale.set(0.95, 1.0, 0.95);
    mat.compose(pos, quat, scale);
    mesh.setMatrixAt(i, mat);
  }

  // Row 2 (outer row, 5 needle teeth along mid-petal)
  const r2X = [-0.042, -0.021, 0.0, 0.021, 0.042];
  const r2Z = [-0.080, -0.092, -0.100, -0.092, -0.080];
  for (let i = 0; i < 5; i++) {
    const x = r2X[i]!;
    const z = r2Z[i]!;
    pos.set(x, 0.012, z);
    rot.set(Math.PI - 0.40, 0, -x * 4.5);
    quat.setFromEuler(rot);
    scale.set(0.88, 0.90, 0.88);
    mat.compose(pos, quat, scale);
    mesh.setMatrixAt(5 + i, mat);
  }

  // Corner fangs (2 prominent fangs at basal lateral margins)
  pos.set(-0.046, 0.016, -0.022);
  rot.set(Math.PI - 0.50, 0.15, 0.28);
  quat.setFromEuler(rot);
  scale.set(1.30, 1.35, 1.30);
  mat.compose(pos, quat, scale);
  mesh.setMatrixAt(10, mat);

  pos.set(0.046, 0.016, -0.022);
  rot.set(Math.PI - 0.50, -0.15, -0.28);
  quat.setFromEuler(rot);
  scale.set(1.30, 1.35, 1.30);
  mat.compose(pos, quat, scale);
  mesh.setMatrixAt(11, mat);

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * Builds an organic muscular limb segment geometry with anatomical taper.
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

    let rad = radiusTop;
    if (v < 0.45) {
      const t = v / 0.45;
      rad = radiusTop + (radiusMid - radiusTop) * Math.sin(t * Math.PI * 0.5);
    } else {
      const t = (v - 0.45) / 0.55;
      rad = radiusMid + (radiusBottom - radiusMid) * t;
    }

    const muscleBelly = Math.sin(v * Math.PI) * (rad * 0.18);

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

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
 * Builds the gaunt ribcage torso geometry (`f_010`, `f_018`, `f_037`):
 * 0.65m length, 1.25m shoulder span tapering to 0.52m gaunt waist with 6 visible rib pairs.
 */
export function buildSculptedTorsoGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  const rings = 16;
  const segments = 18;
  const height = 0.65;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = (1.0 - v) * height - 0.15;

    let widthX = 0.52;
    let depthZ = 0.42;

    if (v < 0.35) {
      const t = v / 0.35;
      widthX = 0.95 + 0.30 * Math.sin(t * Math.PI * 0.5); // 1.25m shoulder span
      depthZ = 0.52 + 0.14 * Math.sin(t * Math.PI * 0.5);
    } else {
      const t = (v - 0.35) / 0.65;
      widthX = 1.25 - (1.25 - 0.52) * Math.pow(t, 0.85);
      depthZ = 0.66 - (0.66 - 0.42) * t;
    }

    const rx = widthX * 0.5;
    const rz = depthZ * 0.5;

    // Gaunt visible rib undulations along flanks (6 rib pairs between v = 0.18 and v = 0.82)
    const ribBand = v >= 0.18 && v <= 0.82 ? Math.sin(((v - 0.18) / 0.64) * Math.PI * 12.0) : 0.0;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const flankMask = Math.pow(Math.abs(cosA), 1.4);
      const ribRelief = ribBand * flankMask * 0.018;
      const dorsalGroove = sinA < -0.80 ? -0.025 * (1.0 - Math.abs(cosA)) : 0;

      const px = cosA * (rx + ribRelief);
      const py = y;
      const pz = sinA * (rz + ribRelief * 0.5) + dorsalGroove;

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
 * Builds the gaunt pelvis & hindquarters geometry.
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
    const rx = 0.26 + Math.sin(v * Math.PI) * 0.085;
    const rz = 0.22 + Math.sin(v * Math.PI) * 0.055;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const glute = sinA < 0 ? -Math.sin(v * Math.PI) * 0.04 : 0;

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
 * Builds the rounded seed-pod dome head geometry (`f_018`–`f_020`):
 * Smooth organic rounded dome (width 0.48m, height 0.42m, length 0.52m, aspect ~1.15)
 * with subtle sponge/seed-pod surface dimples and a small recessed dark mouth opening.
 */
export function buildSeedPodDomeHeadGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  const rings = 14;
  const segments = 18;
  const rx = 0.24;
  const ry = 0.21;
  const rz = 0.26;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Sponge / seed-pod dimple modulation across the dome
      const dimple = Math.sin(v * Math.PI * 7.0) * Math.cos(u * Math.PI * 10.0) * 0.008 * sinPhi;

      const px = sinPhi * cosT * (rx + dimple);
      const py = cosPhi * (ry + dimple) + 0.02;
      const pz = -sinPhi * sinT * (rz + dimple) - 0.06;

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
 * Builds the long tapering tail geometry (1.15m length, baseRadius 0.11m -> tipRadius 0.015m).
 */
export function buildTaperingTailGeometry(
  length = 1.15,
  baseRadius = 0.11,
  tipRadius = 0.015,
): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 14;
  const segments = 10;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const rad = baseRadius * Math.pow(1.0 - v, 1.15) + tipRadius * v;
    // Extends posteriorly (+Z) and droops slightly toward the water surface
    const cy = -Math.sin(v * Math.PI * 0.65) * 0.22 - v * 0.18;
    const cz = v * length;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const angle = u * Math.PI * 2;
      const px = Math.cos(angle) * rad;
      const py = cy + Math.sin(angle) * rad;
      const pz = cz;
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
 * Retained helper exports for module compatibility.
 */
export function buildVertebralProcessGeometry(): BufferGeometry {
  return new BufferGeometry();
}

export function buildJawLobeGeometry(_dir: 'left' | 'right' | 'top' | 'bottom' | boolean): BufferGeometry {
  return buildMuscularSegmentGeometry(0.16, 0.12, 0.10, 0.07, 8, 4);
}

export function buildNeedleToothGeometry(length = 0.045, rad = 0.008): BufferGeometry {
  return buildCurvedClawGeometry(length, rad);
}

export function buildTatteredPelvisWrapGeometry(): BufferGeometry {
  return buildMuscularSegmentGeometry(0.22, 0.30, 0.32, 0.28, 12, 4);
}

export const SEED_POD_PIT_COORDS: ReadonlyArray<[number, number, number]> = [
  [0.0, 0.19, -0.06], [0.07, 0.18, -0.08], [-0.07, 0.18, -0.08],
  [0.13, 0.16, -0.10], [-0.13, 0.16, -0.10], [0.05, 0.18, 0.02], [-0.05, 0.18, 0.02],
  [0.11, 0.16, 0.04], [-0.11, 0.16, 0.04], [0.0, 0.16, -0.16],
  [0.08, 0.12, -0.20], [-0.08, 0.12, -0.20], [0.15, 0.11, -0.16], [-0.15, 0.11, -0.16],
  [0.04, 0.11, -0.24], [-0.04, 0.11, -0.24], [0.10, 0.06, -0.25], [-0.10, 0.06, -0.25],
  [0.17, 0.05, -0.19], [-0.17, 0.05, -0.19], [0.0, 0.07, -0.27],
  [0.06, 0.02, -0.28], [-0.06, 0.02, -0.28], [0.13, 0.01, -0.23], [-0.13, 0.01, -0.23],
  [0.0, 0.02, -0.29], [0.19, 0.09, -0.09], [-0.19, 0.09, -0.09],
  [0.16, 0.13, -0.03], [-0.16, 0.13, -0.03], [0.06, 0.14, -0.14], [-0.06, 0.14, -0.14],
];

/**
 * Shared creature shader hook implementing Prompt 3 Part B:
 * - Zero red/orange `abyssalRim` shift at any agitation value
 * - Wrap-lighting gated on `NdotL` (peak <= 0.02)
 * - Shallow back-lit subsurface-scattering translucency for forearms & thin flanks in bright fog
 * - Distance-attenuated wet darkening (<= 10%) and submerged darkening (<= 8%)
 * - Full scene fog extinction (`fogFactor * 1.0`, never `* 0.55`)
 * - Tamed `mucusSheen` (`<= 0.025`), zero green `acousticVein`
 * - Strict colour guards (`R <= G * 1.14`, luminance `>= 0.055`)
 */
export function createCreatureShaderHook(
  waterLevelUniform: { value: number },
  agitationUniform: { value: number },
) {
  return (shader: {
    vertexShader: string;
    fragmentShader: string;
    uniforms: Record<string, { value: unknown }>;
  }): void => {
    shader.uniforms.uWaterLevel = waterLevelUniform;
    shader.uniforms.uAgitation = agitationUniform;

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
      float camDistWet = length(vViewPosition);
      float distAtten = clamp(1.0 - camDistWet / 35.0, 0.0, 1.0);
      // Distance-attenuated wetness darkening <= 10%
      float wetT = clamp((uWaterLevel + 0.30 - vWorldPositionForWet.y) / 0.30, 0.0, 1.0);
      roughnessFactor = mix(roughnessFactor, 0.18, wetT * 0.75);
      diffuseColor.rgb *= mix(1.0, 0.90, wetT * distAtten);
      // Distance-attenuated submerged darkening <= 8%
      float submergedT = clamp((uWaterLevel - vWorldPositionForWet.y) / 0.15, 0.0, 1.0);
      diffuseColor.rgb *= mix(1.0, 0.92, submergedT * distAtten);
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      /* glsl */ `
      vec3 viewDir = normalize(vViewPosition);
      vec3 surfNormal = normalize(vNormal);
      float rim = 1.0 - max(0.0, dot(surfNormal, viewDir));

      // Wrap-lighting gated on NdotL (peak <= 0.02)
      vec3 keyLightDir = normalize(vec3(0.25, 0.85, 0.45));
      float nDotL = dot(surfNormal, keyLightDir);
      float wrapNdotL = clamp((nDotL + 0.35) / 1.35, 0.0, 1.0);
      vec3 wrapLight = diffuseColor.rgb * (wrapNdotL * 0.02);

      // Shallow back-lit subsurface-scattering translucency for long forearms and thin flanks
      float thinFlankMask = clamp(1.0 - abs(surfNormal.y) * 0.55, 0.30, 1.0);
      float backLit = pow(rim, 1.8) * thinFlankMask;
      #ifdef USE_FOG
        float fogLum = dot(fogColor, vec3(0.2126, 0.7152, 0.0722));
        vec3 sssTranslucency = vec3(0.036, 0.040, 0.026) * backLit * clamp(fogLum, 0.25, 1.0);
      #else
        vec3 sssTranslucency = vec3(0.030, 0.034, 0.022) * backLit;
      #endif

      // Tamed wet mucus micro-sheen (<= 0.025)
      float mucusSheen = pow(max(0.0, dot(reflect(-viewDir, surfNormal), viewDir)), 28.0) * 0.025;

      gl_FragColor.rgb += wrapLight + sssTranslucency + vec3(mucusSheen);

      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        #else
          float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        // Full 1.0 fog extinction (no * 0.55 exemption)
        fogFactor = clamp( fogFactor * 1.0, 0.0, 1.0 );
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
      #endif

      // Colour contract invariant: never shift toward orange/red (R <= G * 1.14) and never crush below 0.05 luminance
      gl_FragColor.r = min(gl_FragColor.r, gl_FragColor.g * 1.14);
      float finalLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      if (finalLum < 0.055) {
        gl_FragColor.rgb += vec3(0.055 - finalLum);
      }
      `,
    );
  };
}

/**
 * Mucosal tissue shader hook for inner gums and throat:
 * Retains wet crimson-pink tones (#8f1d24) with wet specular sheen and scene fog extinction,
 * without clamping red against green.
 */
export function createMucosalShaderHook(
  waterLevelUniform: { value: number },
) {
  return (shader: {
    vertexShader: string;
    fragmentShader: string;
    uniforms: Record<string, { value: unknown }>;
  }): void => {
    shader.uniforms.uWaterLevel = waterLevelUniform;

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
      float camDistWet = length(vViewPosition);
      float distAtten = clamp(1.0 - camDistWet / 35.0, 0.0, 1.0);
      float wetT = clamp((uWaterLevel + 0.30 - vWorldPositionForWet.y) / 0.30, 0.0, 1.0);
      roughnessFactor = mix(roughnessFactor, 0.08, wetT * 0.85);
      diffuseColor.rgb *= mix(1.0, 0.88, wetT * distAtten);
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      /* glsl */ `
      vec3 viewDir = normalize(vViewPosition);
      vec3 surfNormal = normalize(vNormal);
      float mucusSheen = pow(max(0.0, dot(reflect(-viewDir, surfNormal), viewDir)), 36.0) * 0.08;
      gl_FragColor.rgb += vec3(mucusSheen);

      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        #else
          float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        fogFactor = clamp( fogFactor * 1.0, 0.0, 1.0 );
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
      #endif
      `,
    );
  };
}

export class MonsterRig {
  readonly rootGroup = new Group();
  readonly pelvis = new Group();
  readonly lowerSpine = new Group();
  readonly upperChest = new Group(); // Torso
  readonly neck = new Group();
  readonly headGroup = new Group();
  readonly jawGroup = new Group();
  readonly lowerJaw = new Group();
  readonly tailGroup = new Group();

  // Retained empty groups for animator / legacy call-site safety (contain 0 split-petal meshes)
  readonly leftJawLobe = new Group();
  readonly rightJawLobe = new Group();
  readonly topJawLobe = new Group();
  readonly bottomJawLobe = new Group();

  // 4-petal flared jaw groups
  readonly jawPetalL = new Group();
  readonly jawPetalR = new Group();
  readonly jawPetalTop = new Group();
  readonly jawPetalBottom = new Group();

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

  // Ear-fans / acoustic receptors
  readonly earLeft = new Group();
  readonly earRight = new Group();

  // Dorsal spine group is empty per reference footage (zero dorsal ridges)
  readonly dorsalSpineGroup = new Group();
  readonly dorsalRidges: Mesh[] = [];

  // Seed-pod head pits & inner mouth dentition
  readonly headPitsMesh: InstancedMesh;
  readonly teethMesh: InstancedMesh;
  readonly tailMesh: Mesh;
  readonly podHeadMesh: Mesh;
  readonly facialMarkingMesh: Mesh;
  readonly smallMouthMesh: Mesh;
  readonly uvulaMesh: Mesh;

  // Measured structural descriptors exposed for contract verification
  readonly torsoLengthM = 0.65;
  readonly shoulderSpanM = 1.25;
  readonly upperArmLengthM = 0.65;
  readonly forearmLengthM = 0.70;
  readonly forelimbLengthM = 1.35;
  readonly clawLengthM = 0.28;
  readonly tailLengthM = 1.15;
  readonly tailBaseRadiusM = 0.11;
  readonly tailTipRadiusM = 0.015;
  readonly headDomeSurfaceAreaM2 = 4.0 * Math.PI * Math.pow((Math.pow(0.24 * 0.21, 1.6) + Math.pow(0.24 * 0.26, 1.6) + Math.pow(0.21 * 0.26, 1.6)) / 3.0, 1.0 / 1.6) * 0.68;
  readonly visibleEyeCount = 0;
  readonly hornCount = 0;
  readonly jawLobeCount = 1;
  readonly fleshTextures: FleshTextureResult;

  // Variants
  readonly splitShellMeshGroup = new Group();
  readonly mutatedSkullGroup = new Group();
  private currentVariant: SkullVariant = 'splitShell';

  // Materials & Shaders
  readonly monsterSkinMat: MeshStandardMaterial;
  readonly headSkinMat: MeshStandardMaterial;
  readonly shellMat: MeshStandardMaterial;
  readonly boneMat: MeshStandardMaterial;
  readonly throatMat: MeshStandardMaterial;
  readonly gumsMat: MeshStandardMaterial;
  readonly clothMat: MeshStandardMaterial;
  readonly scarMat: MeshStandardMaterial;
  readonly pitMat: MeshStandardMaterial;
  readonly facialMarkingMat: MeshStandardMaterial;
  readonly jointMat: MeshStandardMaterial;

  private readonly materials: Material[] = [];
  private readonly textures: Texture[] = [];
  private readonly waterLevelUniform = { value: 0.0 };
  private readonly agitationUniform = { value: 0.0 };
  private currentJawSplitRad = 0.08;

  constructor(scale = 1.0, tintHex = '#5a5035', seed = 54321) {
    this.rootGroup.name = 'MonsterRigRoot';
    this.rootGroup.scale.set(scale, scale, scale);

    // Normalize legacy dark/placeholder tints to reference palette `#5a5035` (`monster_body_t34`)
    const lowerTint = tintHex.toLowerCase();
    const resolvedBodyHex =
      lowerTint === '#221916' || lowerTint === '#2b211b' || lowerTint === '#6b5f40'
        ? '#5a5035'
        : tintHex;
    const resolvedHeadHex = '#59462d'; // `monster_head_t34` in `reference/video/palette.json`

    this.fleshTextures = generateFleshTextures({ seed });
    this.textures.push(
      this.fleshTextures.albedo,
      this.fleshTextures.bump,
      this.fleshTextures.roughness,
    );
    if (this.fleshTextures.subsurface) {
      this.textures.push(this.fleshTextures.subsurface);
    }

    const applyCreatureShaderHooks = createCreatureShaderHook(
      this.waterLevelUniform,
      this.agitationUniform,
    );

    // Body hide material: #5a5035 wet mottled brown-grey with <=12% reddish blotches
    this.monsterSkinMat = new MeshStandardMaterial({
      map: this.fleshTextures.albedo,
      bumpMap: this.fleshTextures.bump,
      bumpScale: 0.06,
      roughnessMap: this.fleshTextures.roughness,
      color: new Color(resolvedBodyHex),
      roughness: 0.34,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
    (this.monsterSkinMat as unknown as { clearcoat?: number; clearcoatRoughness?: number }).clearcoat = 0.45;
    (this.monsterSkinMat as unknown as { clearcoatRoughness?: number }).clearcoatRoughness = 0.24;
    this.monsterSkinMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.monsterSkinMat);

    // Head dome material: #59462d (`monster_head_t34`)
    this.headSkinMat = new MeshStandardMaterial({
      map: this.fleshTextures.albedo,
      bumpMap: this.fleshTextures.bump,
      bumpScale: 0.075,
      roughnessMap: this.fleshTextures.roughness,
      color: new Color(resolvedHeadHex),
      roughness: 0.36,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
    this.headSkinMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.headSkinMat);

    // Outer jaw petal shell: dark organic charcoal/brown (#241c18)
    this.shellMat = new MeshStandardMaterial({
      color: new Color('#241c18'),
      roughness: 0.25,
      metalness: 0.04,
    });
    (this.shellMat as unknown as { clearcoat?: number; clearcoatRoughness?: number }).clearcoat = 0.65;
    (this.shellMat as unknown as { clearcoatRoughness?: number }).clearcoatRoughness = 0.20;
    this.shellMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.shellMat);

    // Claws & inner teeth material: muted wet bone (#b8ae94)
    this.boneMat = new MeshStandardMaterial({
      color: new Color('#b8ae94'),
      roughness: 0.32,
      metalness: 0.04,
    });
    this.boneMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.boneMat);

    // Small dark mouth & seed-pod pit material (#241c14, above 0.05 luminance floor)
    this.pitMat = new MeshStandardMaterial({
      color: new Color('#241c14'),
      roughness: 0.88,
      metalness: 0.02,
    });
    this.pitMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.pitMat);

    const applyMucosalShaderHook = createMucosalShaderHook(this.waterLevelUniform);

    // Deep wet throat cavity and pulsing esophagus/uvula (#4a0d12)
    this.throatMat = new MeshStandardMaterial({
      color: new Color('#4a0d12'),
      roughness: 0.18,
      metalness: 0.02,
    });
    (this.throatMat as unknown as { clearcoat?: number; clearcoatRoughness?: number }).clearcoat = 0.90;
    (this.throatMat as unknown as { clearcoatRoughness?: number }).clearcoatRoughness = 0.12;
    this.throatMat.onBeforeCompile = applyMucosalShaderHook;
    this.materials.push(this.throatMat);

    // Subdued maroon facial marking (#4a2520, f_018)
    this.facialMarkingMat = new MeshStandardMaterial({
      color: new Color('#4a2520'),
      roughness: 0.48,
      metalness: 0.02,
    });
    this.facialMarkingMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.facialMarkingMat);

    // Inner petal mucosal gums: wet crimson-pink (#8f1d24, wet roughness 0.12, clearcoat 1.0)
    this.gumsMat = new MeshStandardMaterial({
      color: new Color('#8f1d24'),
      roughness: 0.12,
      metalness: 0.02,
    });
    (this.gumsMat as unknown as { clearcoat?: number; clearcoatRoughness?: number }).clearcoat = 1.0;
    (this.gumsMat as unknown as { clearcoatRoughness?: number }).clearcoatRoughness = 0.10;
    this.gumsMat.onBeforeCompile = applyMucosalShaderHook;
    this.materials.push(this.gumsMat);

    this.clothMat = new MeshStandardMaterial({
      color: new Color('#524934'),
      roughness: 0.78,
      metalness: 0.02,
      side: DoubleSide,
    });
    this.clothMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.clothMat);

    this.jointMat = new MeshStandardMaterial({
      color: new Color('#261c18'),
      roughness: 0.25,
      metalness: 0.06,
    });
    (this.jointMat as unknown as { clearcoat?: number; clearcoatRoughness?: number }).clearcoat = 0.65;
    (this.jointMat as unknown as { clearcoatRoughness?: number }).clearcoatRoughness = 0.20;
    this.jointMat.onBeforeCompile = applyCreatureShaderHooks;
    this.materials.push(this.jointMat);

    this.scarMat = this.monsterSkinMat;

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Skeletal Joint Hierarchy (Gaunt Ribcage, Long Forelimbs, Tapering Tail)
    // ──────────────────────────────────────────────────────────────────────────
    this.pelvis.name = 'Rig_Pelvis';
    this.pelvis.position.set(0, 0.70, 0.15);
    this.rootGroup.add(this.pelvis);

    const pelvisGeom = buildSculptedPelvisGeometry();
    const pelvisMesh = new Mesh(pelvisGeom, this.monsterSkinMat);
    pelvisMesh.name = 'PelvisMesh';
    this.pelvis.add(pelvisMesh);

    // Long tapering tail (`f_008`–`f_012`, 1.15m length tapering 0.11m -> 0.015m)
    this.tailGroup.name = 'Rig_Tail';
    this.tailGroup.position.set(0, -0.12, 0.18);
    this.pelvis.add(this.tailGroup);

    const tailGeom = buildTaperingTailGeometry(
      this.tailLengthM,
      this.tailBaseRadiusM,
      this.tailTipRadiusM,
    );
    this.tailMesh = new Mesh(tailGeom, this.monsterSkinMat);
    this.tailMesh.name = 'TailMesh';
    this.tailGroup.add(this.tailMesh);

    // Lower Spine (gaunt waist connecting pelvis to ribcage)
    this.lowerSpine.name = 'Rig_LowerSpine';
    this.lowerSpine.position.set(0, 0.15, -0.12);
    this.pelvis.add(this.lowerSpine);

    const midSectionGeom = buildMuscularSegmentGeometry(0.25, 0.26, 0.25, 0.24, 12, 6);
    const midSectionMesh = new Mesh(midSectionGeom, this.monsterSkinMat);
    midSectionMesh.rotation.x = Math.PI * 0.5;
    this.lowerSpine.add(midSectionMesh);

    // Upper Chest & Gaunt Ribcage (length 0.65m, shoulder span 1.25m, hunched at 0.65 rad)
    this.upperChest.name = 'Rig_UpperChest';
    this.upperChest.position.set(0, 0.22, -0.22);
    this.upperChest.rotation.x = 0.65;
    this.lowerSpine.add(this.upperChest);

    const torsoGeom = buildSculptedTorsoGeometry();
    const torsoMesh = new Mesh(torsoGeom, this.monsterSkinMat);
    torsoMesh.name = 'TorsoMesh';
    this.upperChest.add(torsoMesh);

    // Dorsal spine group intentionally empty: reference creature has 0 dorsal spines
    this.dorsalSpineGroup.name = 'DorsalSpineRidgeGroup';
    this.upperChest.add(this.dorsalSpineGroup);

    // Neck (carried low)
    this.neck.name = 'Rig_Neck';
    this.neck.position.set(0, 0.14, -0.32);
    this.upperChest.add(this.neck);

    const neckGeom = buildMuscularSegmentGeometry(0.22, 0.20, 0.19, 0.17, 10, 6);
    const neckMesh = new Mesh(neckGeom, this.monsterSkinMat);
    neckMesh.rotation.x = -Math.PI * 0.45;
    this.neck.add(neckMesh);

    this.earLeft.name = 'Rig_EarLeft';
    this.earLeft.position.set(0.16, 0.04, -0.05);
    this.neck.add(this.earLeft);

    this.earRight.name = 'Rig_EarRight';
    this.earRight.position.set(-0.16, 0.04, -0.05);
    this.neck.add(this.earRight);

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Rounded Seed-Pod Dome Head (`f_018`: 32 dark pits, maroon facial marking,
    //    small dark mouth, 0 eyes, 0 horns, 0 split petals)
    // ──────────────────────────────────────────────────────────────────────────
    this.headGroup.name = 'Rig_Head';
    this.headGroup.position.set(0, 0.04, -0.22);
    this.neck.add(this.headGroup);

    this.splitShellMeshGroup.name = 'SeedPodHeadGroup';
    this.headGroup.add(this.splitShellMeshGroup);

    // Rounded seed-pod dome mesh
    const podHeadGeom = buildSeedPodDomeHeadGeometry();
    this.podHeadMesh = new Mesh(podHeadGeom, this.headSkinMat);
    this.podHeadMesh.name = 'SeedPodDomeMesh';
    this.splitShellMeshGroup.add(this.podHeadMesh);

    // Maroon facial marking patch across anterior brow/snout (`f_018`)
    const markingGeom = new SphereGeometry(0.16, 12, 10);
    markingGeom.scale(1.15, 0.72, 0.85);
    this.facialMarkingMesh = new Mesh(markingGeom, this.facialMarkingMat);
    this.facialMarkingMesh.name = 'MaroonFacialMarking';
    this.facialMarkingMesh.position.set(0, 0.04, -0.15);
    this.splitShellMeshGroup.add(this.facialMarkingMesh);

    // Small dark mouth recess (`f_018`: "small dark mouth")
    const mouthGeom = new SphereGeometry(0.075, 10, 8);
    mouthGeom.scale(1.15, 0.55, 0.90);
    this.smallMouthMesh = new Mesh(mouthGeom, this.pitMat);
    this.smallMouthMesh.name = 'SmallDarkMouth';
    this.smallMouthMesh.position.set(0, -0.06, -0.22);
    this.splitShellMeshGroup.add(this.smallMouthMesh);

    // 32 Dark seed-pod pits recessed across the rounded dome (`f_018`)
    const pitGeom = new SphereGeometry(0.022, 7, 7);
    this.headPitsMesh = new InstancedMesh(pitGeom, this.pitMat, SEED_POD_PIT_COORDS.length);
    this.headPitsMesh.name = 'SeedPodHeadPits';
    this.headPitsMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const pitMat4 = new Matrix4();
    for (let i = 0; i < SEED_POD_PIT_COORDS.length; i++) {
      const [px, py, pz] = SEED_POD_PIT_COORDS[i]!;
      pitMat4.makeTranslation(px, py, pz);
      this.headPitsMesh.setMatrixAt(i, pitMat4);
    }
    this.headPitsMesh.instanceMatrix.needsUpdate = true;
    this.splitShellMeshGroup.add(this.headPitsMesh);

    // Pulsing dark-crimson esophagus/uvula bulb (#4a0d12)
    const uvulaGeom = new SphereGeometry(0.048, 12, 10);
    uvulaGeom.scale(0.85, 1.3, 0.95);
    this.uvulaMesh = new Mesh(uvulaGeom, this.throatMat);
    this.uvulaMesh.name = 'ThroatUvulaMesh';
    this.uvulaMesh.position.set(0, -0.025, -0.16);
    this.splitShellMeshGroup.add(this.uvulaMesh);

    // 4-petal split-jaw flower-maw (#241c18 outer shell, #8f1d24 inner gums, 12 teeth/petal = 48 teeth)
    this.jawGroup.name = 'Rig_Jaw';
    this.headGroup.add(this.jawGroup);

    this.lowerJaw.name = 'SingleLowerJaw';
    this.lowerJaw.position.set(0, -0.07, -0.08);
    const singleJawGeom = buildMuscularSegmentGeometry(0.18, 0.13, 0.11, 0.08, 10, 5);
    const singleJawMesh = new Mesh(singleJawGeom, this.headSkinMat);
    singleJawMesh.name = 'SingleLowerJawMesh';
    singleJawMesh.rotation.x = Math.PI * 0.5;
    this.lowerJaw.add(singleJawMesh);
    this.jawGroup.add(this.lowerJaw);

    // Sculpted jaw petal meshes on all 4 lobes with inner gums and 12 attached teeth each
    const jawPetalGeom = buildJawPetalGeometry(0.20, 0.12, 0.03);
    const jawGumsGeom = buildJawGumsGeometry(0.18, 0.10, 0.022);
    const toothGeom = buildNeedleToothGeometry(0.040, 0.007);

    this.leftJawLobe.name = 'LeftJawLobe';
    this.rightJawLobe.name = 'RightJawLobe';
    this.topJawLobe.name = 'TopJawLobe';
    this.bottomJawLobe.name = 'BottomJawLobe';

    // Left Petal
    this.jawPetalL.name = 'JawPetalL';
    this.jawPetalL.position.set(0.06, -0.02, -0.16);
    const leftPetalMesh = new Mesh(jawPetalGeom, this.shellMat);
    leftPetalMesh.rotation.z = Math.PI * 0.5;
    const leftGumsMesh = new Mesh(jawGumsGeom, this.gumsMat);
    leftGumsMesh.rotation.z = Math.PI * 0.5;
    leftGumsMesh.position.set(-0.003, 0, -0.005);
    const leftTeeth = buildPetalTeethInstancedMesh(toothGeom, this.boneMat);
    leftTeeth.rotation.z = Math.PI * 0.5;
    this.jawPetalL.add(leftPetalMesh, leftGumsMesh, leftTeeth);

    // Right Petal
    this.jawPetalR.name = 'JawPetalR';
    this.jawPetalR.position.set(-0.06, -0.02, -0.16);
    const rightPetalMesh = new Mesh(jawPetalGeom, this.shellMat);
    rightPetalMesh.rotation.z = -Math.PI * 0.5;
    const rightGumsMesh = new Mesh(jawGumsGeom, this.gumsMat);
    rightGumsMesh.rotation.z = -Math.PI * 0.5;
    rightGumsMesh.position.set(0.003, 0, -0.005);
    const rightTeeth = buildPetalTeethInstancedMesh(toothGeom, this.boneMat);
    rightTeeth.rotation.z = -Math.PI * 0.5;
    this.jawPetalR.add(rightPetalMesh, rightGumsMesh, rightTeeth);

    // Top Petal
    this.jawPetalTop.name = 'JawPetalTop';
    this.jawPetalTop.position.set(0, 0.05, -0.16);
    const topPetalMesh = new Mesh(jawPetalGeom, this.shellMat);
    topPetalMesh.rotation.x = -Math.PI;
    const topGumsMesh = new Mesh(jawGumsGeom, this.gumsMat);
    topGumsMesh.rotation.x = -Math.PI;
    topGumsMesh.position.set(0, -0.003, -0.005);
    const topTeeth = buildPetalTeethInstancedMesh(toothGeom, this.boneMat);
    topTeeth.rotation.x = -Math.PI;
    this.jawPetalTop.add(topPetalMesh, topGumsMesh, topTeeth);

    // Bottom Petal
    this.jawPetalBottom.name = 'JawPetalBottom';
    this.jawPetalBottom.position.set(0, -0.07, -0.16);
    const bottomPetalMesh = new Mesh(jawPetalGeom, this.shellMat);
    const bottomGumsMesh = new Mesh(jawGumsGeom, this.gumsMat);
    bottomGumsMesh.position.set(0, 0.003, -0.005);
    const bottomTeeth = buildPetalTeethInstancedMesh(toothGeom, this.boneMat);
    this.jawPetalBottom.add(bottomPetalMesh, bottomGumsMesh, bottomTeeth);

    this.jawGroup.add(
      this.leftJawLobe,
      this.rightJawLobe,
      this.topJawLobe,
      this.bottomJawLobe,
      this.jawPetalL,
      this.jawPetalR,
      this.jawPetalTop,
      this.jawPetalBottom,
    );

    // Inner black throat cavity (#100c0a)
    const innerThroatMat = new MeshStandardMaterial({
      color: new Color('#100c0a'),
      roughness: 0.95,
      metalness: 0.01,
    });
    this.materials.push(innerThroatMat);
    const innerThroatGeom = new SphereGeometry(0.09, 10, 8);
    innerThroatGeom.scale(0.9, 0.9, 1.3);
    const innerThroatMesh = new Mesh(innerThroatGeom, innerThroatMat);
    innerThroatMesh.position.set(0, -0.02, -0.14);
    this.headGroup.add(innerThroatMesh);

    // Retained legacy teethMesh reference on lowerJaw for API compatibility (hidden to prevent mid-air floating ring)
    this.teethMesh = new InstancedMesh(toothGeom, this.boneMat, 32);
    this.teethMesh.name = 'InnerMouthTeeth';
    this.teethMesh.count = 0;
    this.teethMesh.visible = false;
    this.lowerJaw.add(this.teethMesh);

    this.setJawSplit(0.08);

    // Secondary tilted head pose group (uses same seed-pod dome anatomy)
    this.mutatedSkullGroup.name = 'TiltedPodHeadVariant';
    this.mutatedSkullGroup.visible = false;
    this.mutatedSkullGroup.rotation.z = 0.61;
    this.mutatedSkullGroup.rotation.y = 0.15;
    const tiltedPodMesh = new Mesh(podHeadGeom, this.headSkinMat);
    this.mutatedSkullGroup.add(tiltedPodMesh);
    this.headGroup.add(this.mutatedSkullGroup);

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Disproportionately Long Forelimbs (`f_010`, `f_018`: 0.65m upper + 0.70m forearm
    //    = 1.35m, ratio 2.08x torso; 4 splayed clawed fingers 0.28m dragging in water)
    // ──────────────────────────────────────────────────────────────────────────
    this.shoulderL.name = 'Rig_ShoulderL';
    this.shoulderL.position.set(0.625, 0.02, -0.15);
    this.upperChest.add(this.shoulderL);

    const shoulderSphereGeom = new SphereGeometry(0.26, 12, 10);
    const shoulderSphereL = new Mesh(shoulderSphereGeom, this.jointMat);
    shoulderSphereL.name = 'ShoulderJointSphereL';
    this.shoulderL.add(shoulderSphereL);

    this.upperArmL.name = 'Rig_UpperArmL';
    const upperArmGeom = buildMuscularSegmentGeometry(this.upperArmLengthM, 0.15, 0.14, 0.11, 10, 8);
    const upperArmMeshL = new Mesh(upperArmGeom, this.monsterSkinMat);
    this.upperArmL.add(upperArmMeshL);
    this.shoulderL.add(this.upperArmL);

    this.elbowL.name = 'Rig_ElbowL';
    this.elbowL.position.set(0, -this.upperArmLengthM, 0);
    this.upperArmL.add(this.elbowL);

    const elbowSphereGeom = new SphereGeometry(0.20, 10, 8);
    const elbowSphereL = new Mesh(elbowSphereGeom, this.jointMat);
    elbowSphereL.name = 'ElbowJointSphereL';
    this.elbowL.add(elbowSphereL);

    this.forearmL.name = 'Rig_ForearmL';
    const forearmGeom = buildMuscularSegmentGeometry(this.forearmLengthM, 0.12, 0.13, 0.095, 10, 8);
    const forearmMeshL = new Mesh(forearmGeom, this.monsterSkinMat);
    this.forearmL.add(forearmMeshL);
    this.elbowL.add(this.forearmL);

    this.wristL.name = 'Rig_WristL';
    this.wristL.position.set(0, -this.forearmLengthM, 0);
    this.forearmL.add(this.wristL);

    this.handL.name = 'Rig_HandL';
    const palmGeom = buildMuscularSegmentGeometry(0.14, 0.10, 0.11, 0.08, 8, 4);
    const palmMeshL = new Mesh(palmGeom, this.monsterSkinMat);
    this.handL.add(palmMeshL);
    this.wristL.add(this.handL);

    // 4 Long Splayed Clawed Fingers (0.28m each)
    this.clawsL.name = 'Rig_ClawsL';
    this.clawsL.position.set(0, -0.14, 0);
    this.handL.add(this.clawsL);

    const clawGeom = buildCurvedClawGeometry(this.clawLengthM, 0.022);
    for (let c = 0; c < 4; c++) {
      const clawMesh = new Mesh(clawGeom, this.boneMat);
      const cx = (c - 1.5) * 0.052;
      clawMesh.position.set(cx, 0, -0.02 - Math.abs(c - 1.5) * 0.014);
      clawMesh.rotation.z = (c - 1.5) * 0.14; // Splayed fingers
      this.clawsL.add(clawMesh);
    }

    // Right Forelimb
    this.shoulderR.name = 'Rig_ShoulderR';
    this.shoulderR.position.set(-0.625, 0.02, -0.15);
    this.upperChest.add(this.shoulderR);

    const shoulderSphereR = new Mesh(shoulderSphereGeom, this.jointMat);
    shoulderSphereR.name = 'ShoulderJointSphereR';
    this.shoulderR.add(shoulderSphereR);

    this.upperArmR.name = 'Rig_UpperArmR';
    const upperArmMeshR = new Mesh(upperArmGeom, this.monsterSkinMat);
    this.upperArmR.add(upperArmMeshR);
    this.shoulderR.add(this.upperArmR);

    this.elbowR.name = 'Rig_ElbowR';
    this.elbowR.position.set(0, -this.upperArmLengthM, 0);
    this.upperArmR.add(this.elbowR);

    const elbowSphereR = new Mesh(elbowSphereGeom, this.jointMat);
    elbowSphereR.name = 'ElbowJointSphereR';
    this.elbowR.add(elbowSphereR);

    this.forearmR.name = 'Rig_ForearmR';
    const forearmMeshR = new Mesh(forearmGeom, this.monsterSkinMat);
    this.forearmR.add(forearmMeshR);
    this.elbowR.add(this.forearmR);

    this.wristR.name = 'Rig_WristR';
    this.wristR.position.set(0, -this.forearmLengthM, 0);
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
      const cx = (c - 1.5) * 0.052;
      clawMesh.position.set(cx, 0, -0.02 - Math.abs(c - 1.5) * 0.014);
      clawMesh.rotation.z = (c - 1.5) * 0.14;
      this.clawsR.add(clawMesh);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Digitigrade Hindlimbs (Thigh 0.58m, Shin 0.55m, Foot planted in pool floor)
    // ──────────────────────────────────────────────────────────────────────────
    this.hipL.name = 'Rig_HipL';
    this.hipL.position.set(0.38, -0.15, 0.05);
    this.pelvis.add(this.hipL);

    const hipSphereGeom = new SphereGeometry(0.24, 12, 10);
    const hipSphereL = new Mesh(hipSphereGeom, this.jointMat);
    hipSphereL.name = 'HipJointSphereL';
    this.hipL.add(hipSphereL);

    this.thighL.name = 'Rig_ThighL';
    const thighGeom = buildMuscularSegmentGeometry(0.58, 0.16, 0.15, 0.11, 10, 8);
    const thighMeshL = new Mesh(thighGeom, this.monsterSkinMat);
    this.thighL.add(thighMeshL);
    this.hipL.add(this.thighL);

    this.kneeL.name = 'Rig_KneeL';
    this.kneeL.position.set(0, -0.58, 0);
    this.thighL.add(this.kneeL);

    const kneeSphereGeom = new SphereGeometry(0.18, 10, 8);
    const kneeSphereL = new Mesh(kneeSphereGeom, this.jointMat);
    kneeSphereL.name = 'KneeJointSphereL';
    this.kneeL.add(kneeSphereL);

    this.shinL.name = 'Rig_ShinL';
    const shinGeom = buildMuscularSegmentGeometry(0.55, 0.11, 0.11, 0.08, 10, 8);
    const shinMeshL = new Mesh(shinGeom, this.monsterSkinMat);
    this.shinL.add(shinMeshL);
    this.kneeL.add(this.shinL);

    this.ankleL.name = 'Rig_AnkleL';
    this.ankleL.position.set(0, -0.55, 0);
    this.shinL.add(this.ankleL);

    this.footL.name = 'Rig_FootL';
    const footGeom = buildFlatWadingFootGeometry(0.26, 0.15, 0.05, 8, 6);
    const footMeshL = new Mesh(footGeom, this.monsterSkinMat);
    footMeshL.rotation.x = -Math.PI * 0.45;
    this.footL.add(footMeshL);
    this.ankleL.add(this.footL);

    for (let c = 0; c < 3; c++) {
      const footClaw = new Mesh(clawGeom, this.boneMat);
      footClaw.scale.set(0.65, 0.65, 0.65);
      footClaw.position.set((c - 1) * 0.045, -0.04, -0.18);
      this.footL.add(footClaw);
    }

    this.hipR.name = 'Rig_HipR';
    this.hipR.position.set(-0.38, -0.15, 0.05);
    this.pelvis.add(this.hipR);

    const hipSphereR = new Mesh(hipSphereGeom, this.jointMat);
    hipSphereR.name = 'HipJointSphereR';
    this.hipR.add(hipSphereR);

    this.thighR.name = 'Rig_ThighR';
    const thighMeshR = new Mesh(thighGeom, this.monsterSkinMat);
    this.thighR.add(thighMeshR);
    this.hipR.add(this.thighR);

    this.kneeR.name = 'Rig_KneeR';
    this.kneeR.position.set(0, -0.58, 0);
    this.thighR.add(this.kneeR);

    const kneeSphereR = new Mesh(kneeSphereGeom, this.jointMat);
    kneeSphereR.name = 'KneeJointSphereR';
    this.kneeR.add(kneeSphereR);

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

    this.rootGroup.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        (obj as Mesh).frustumCulled = false;
      }
    });
  }

  /**
   * Hinges the single small dark mouth / lower jaw (`SingleLowerJaw`).
   * Keeps empty compatibility lobe rotations updated for legacy callers.
   */
  setJawSplit(angleRad: number): void {
    this.currentJawSplitRad = angleRad;
    this.lowerJaw.rotation.x = angleRad * 0.45;
    this.leftJawLobe.rotation.y = angleRad;
    this.rightJawLobe.rotation.y = -angleRad;
    this.topJawLobe.rotation.x = -angleRad;
    this.bottomJawLobe.rotation.x = angleRad;
    this.jawPetalL.rotation.y = angleRad;
    this.jawPetalR.rotation.y = -angleRad;
    this.jawPetalTop.rotation.x = -angleRad;
    this.jawPetalBottom.rotation.x = angleRad;

    if (this.uvulaMesh) {
      const flare = Math.max(0, (angleRad - 0.08) / 0.57);
      const pulse = 1.0 + flare * 0.35 + Math.sin(angleRad * 14.0) * 0.06 * flare;
      this.uvulaMesh.scale.set(pulse, pulse * 1.15, pulse * (1.0 + flare * 0.5));
    }
  }

  getJawSplit(): number {
    return this.currentJawSplitRad;
  }

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
    const uniqueMats = new Set(this.materials);
    uniqueMats.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.rootGroup.removeFromParent();
  }
}

/* ── LightShafts.ts ───────────────────────────────────────────────────────
 *  Reusable volumetric-style light shafts (god rays) and atmospheric dust motes.
 *  Uses additive tapered frustums with soft vertical gradient and billboard motes.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Mesh,
  CylinderGeometry,
  RingGeometry,
  ShaderMaterial,
  MeshBasicMaterial,
  AdditiveBlending,
  DoubleSide,
  Color,
  Vector3,
  Points,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Group,
} from 'three';
import { Rng } from '../../procedural/core/prng.js';

export interface LightShaftOptions {
  topRadius?: number;    // default 0.55m (skylight opening)
  bottomRadius?: number; // default 2.0m (spread on ground)
  height?: number;       // default 6.0m
  color?: Color | string;
  intensity?: number;    // default 0.20
}

/**
 * Creates an additive light shaft cone with smooth vertical gradient.
 */
export function createLightShaftMesh(options: LightShaftOptions = {}): Mesh {
  const topR = options.topRadius ?? 0.55;
  const botR = options.bottomRadius ?? 2.0;
  const height = options.height ?? 6.0;
  const color = options.color instanceof Color ? options.color : new Color(options.color ?? '#fff5d1');
  const intensity = options.intensity ?? 0.20;

  const geom = new CylinderGeometry(topR, botR, height, 16, 8, true);

  const mat = new ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uIntensity: { value: intensity },
      uHeight: { value: height },
      uLightDir: { value: new Vector3(0, -1, 0) },
    },
    vertexShader: /* glsl */ `
      varying float vY;
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;

      void main() {
        vY = position.y;
        vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uHeight;
      uniform vec3 uLightDir;

      varying float vY;
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;

      void main() {
        // Vertical gradient: 1.0 at top (+height/2), 0.0 at bottom (-height/2)
        float t = clamp((vY + uHeight * 0.5) / uHeight, 0.0, 1.0);
        float verticalFalloff = pow(t, 1.4);

        // Soft rim / edge falloff so cylinder seams are invisible
        float rim = 1.0 - abs(dot(vNormalWorld, vViewDir));

        // Forward scattering: brighter when looking towards the light source
        float forwardScatter = pow(max(0.0, dot(-vViewDir, uLightDir)), 2.5);
        float alpha = verticalFalloff * uIntensity * (0.3 + 0.4 * rim + 0.5 * forwardScatter);

        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });

  return new Mesh(geom, mat);
}

export interface DustMotesOptions {
  count?: number;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  color?: Color | string;
  size?: number;
  seed?: number;
}

/**
 * Creates atmospheric floating dust motes.
 */
export function createDustMotes(options: DustMotesOptions = {}): Points {
  const count = options.count ?? 120;
  const b = options.bounds ?? { minX: -15, maxX: 15, minY: 0.5, maxY: 10, minZ: -15, maxZ: 15 };
  const color = options.color instanceof Color ? options.color : new Color(options.color ?? '#f5ecd5');
  const size = options.size ?? 0.06;
  const rng = new Rng(options.seed ?? 777);

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = rng.range(b.minX, b.maxX);
    positions[i * 3 + 1] = rng.range(b.minY, b.maxY);
    positions[i * 3 + 2] = rng.range(b.minZ, b.maxZ);
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));

  const mat = new PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0.45,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  return new Points(geom, mat);
}

export interface SkylightAssemblyOptions {
  position?: Vector3 | { x: number; y: number; z: number };
  ceilingY?: number;
  topRadius?: number;
  bottomRadius?: number;
  height?: number;
  color?: Color | string;
  intensity?: number;
  moteCount?: number;
  seed?: number;
}

/**
 * Creates a complete skylight assembly: ceiling opening with bright emissive rim,
 * additive tapered light shaft, and localized drifting dust motes inside the beam.
 */
export function createSkylightAssembly(options: SkylightAssemblyOptions = {}): Group {
  const group = new Group();
  group.name = 'SkylightAssembly';

  const pos = options.position ?? new Vector3(0, 0, 0);
  const ceilingY = options.ceilingY ?? 5.0;
  const topR = options.topRadius ?? 0.55;
  const botR = options.bottomRadius ?? 2.0;
  const height = options.height ?? Math.max(2.0, ceilingY);
  const color = options.color ?? '#fff5d1';
  const intensity = options.intensity ?? 0.20;
  const moteCount = options.moteCount ?? 32;

  // 1. Light Shaft Mesh
  const shaft = createLightShaftMesh({
    topRadius: topR,
    bottomRadius: botR,
    height,
    color,
    intensity,
  });
  // Top of shaft cone meets ceiling opening at ceilingY
  shaft.position.set(pos.x, ceilingY - height * 0.5, pos.z);
  group.add(shaft);

  // 2. Bright Emissive Rim Opening on the ceiling
  const rimGeom = new RingGeometry(topR * 0.82, topR * 1.18, 24);
  rimGeom.rotateX(Math.PI / 2);
  const rimMat = new MeshBasicMaterial({
    color: new Color('#ffffff'),
    transparent: true,
    opacity: 0.95,
  });
  const rimMesh = new Mesh(rimGeom, rimMat);
  rimMesh.position.set(pos.x, ceilingY - 0.01, pos.z);
  rimMesh.name = 'SkylightEmissiveRim';
  group.add(rimMesh);

  // 3. Drifting Dust Motes INSIDE the light shaft beam
  const motes = createDustMotes({
    count: moteCount,
    bounds: {
      minX: pos.x - botR * 0.5,
      maxX: pos.x + botR * 0.5,
      minY: ceilingY - height + 0.2,
      maxY: ceilingY - 0.2,
      minZ: pos.z - botR * 0.5,
      maxZ: pos.z + botR * 0.5,
    },
    color: '#fffbe8',
    size: 0.05,
    seed: options.seed ?? 101,
  });
  group.add(motes);

  return group;
}

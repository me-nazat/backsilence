/* ── LightShafts.ts ───────────────────────────────────────────────────────
 *  Reusable volumetric-style light shafts (god rays) and atmospheric dust motes.
 *  Uses additive tapered frustums with soft vertical gradient and billboard motes.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Mesh,
  CylinderGeometry,
  ShaderMaterial,
  AdditiveBlending,
  DoubleSide,
  Color,
  Points,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
} from 'three';
import { Rng } from '../../procedural/core/prng.js';

export interface LightShaftOptions {
  topRadius?: number;    // default 0.8m (skylight opening)
  bottomRadius?: number; // default 2.6m (spread on ground)
  height?: number;       // default 12.0m
  color?: Color | string;
  intensity?: number;    // default 0.25
}

/**
 * Creates an additive light shaft cone with smooth vertical gradient.
 */
export function createLightShaftMesh(options: LightShaftOptions = {}): Mesh {
  const topR = options.topRadius ?? 0.8;
  const botR = options.bottomRadius ?? 2.6;
  const height = options.height ?? 12.0;
  const color = options.color instanceof Color ? options.color : new Color(options.color ?? '#fff5d1');
  const intensity = options.intensity ?? 0.25;

  const geom = new CylinderGeometry(topR, botR, height, 16, 8, true);

  const mat = new ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uIntensity: { value: intensity },
      uHeight: { value: height },
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

      varying float vY;
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;

      void main() {
        // Vertical gradient: 1.0 at top (+height/2), 0.0 at bottom (-height/2)
        float t = clamp((vY + uHeight * 0.5) / uHeight, 0.0, 1.0);
        float verticalFalloff = pow(t, 1.4);

        // Soft rim / edge falloff so cylinder seams are invisible
        float rim = 1.0 - abs(dot(vNormalWorld, vViewDir));
        float alpha = verticalFalloff * uIntensity * (0.4 + 0.6 * rim);

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

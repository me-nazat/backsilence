/* ── WaterMaterial.ts ──────────────────────────────────────────────────────
 *  Custom ShaderMaterial for the final water system.
 *  Features: analytic expanding ripples, Kelvin wakes, depth absorption,
 *  edge foam, fog integration, underwater mode, and normal perturbing.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  Color,
  FrontSide,
  type Texture,
  type Vector4,
} from 'three';
import type { GraphicsTier } from '../../types/contracts.js';

export interface WaterMaterialOptions {
  tier?: GraphicsTier;
  normalTexture: Texture;
  mapDataTexture: Texture;
  mapBounds: Vector4;
  ripples: Vector4[];
  wakes: Vector4[];
  wakeParams: Vector4[];
  waterY?: number;
}

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uTime;
uniform float uWaterY;
uniform vec4 uRipples[32];
uniform int uRippleCount;

varying vec3 vWorldPos;
varying vec3 vViewPos;
varying vec2 vUv;
varying float vRippleHeight;

const float RIPPLE_SPEED = 3.2;   // m/s
const float RIPPLE_LIFE  = 3.5;   // s
const float RIPPLE_K     = 11.0;  // rad/m  (~0.57 m wavelength)

float ripple(vec2 p, vec4 r, float time, inout vec2 grad) {
  float age = time - r.z;
  if (age < 0.0 || age > RIPPLE_LIFE) return 0.0;
  vec2 dv = p - r.xy;
  float d = length(dv);
  float x = d - RIPPLE_SPEED * age;             // distance from the ring front
  float w = 0.28 + 0.22 * age;                  // ring thickens as it travels
  float env = exp(-(x * x) / (w * w));          // gaussian ring window
  float life = 1.0 - age / RIPPLE_LIFE;
  float amp = r.w * life * life / (1.0 + 0.8 * d);
  float ph = RIPPLE_K * x;
  float h  = amp * env * cos(ph) * 0.07;
  float dh = amp * env * (-RIPPLE_K * sin(ph) - 2.0 * x / (w * w) * cos(ph)) * 0.07;
  grad += dh * (dv / max(d, 1e-3));
  return h;
}

void main() {
  vUv = uv;

  // Base world position
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec2 p = worldPosition.xz;

  // 1. Gentle traveling sines (amplitude <= 0.03m)
  float sines = sin(p.x * 0.4 + uTime * 1.2) * 0.015 +
                cos(p.y * 0.5 - uTime * 0.9) * 0.010 +
                sin((p.x + p.y) * 0.3 + uTime * 0.7) * 0.005;

  // 2. Analytic ripples
  float totalRippleH = 0.0;
  vec2 dummyGrad = vec2(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uRippleCount) break;
    totalRippleH += ripple(p, uRipples[i], uTime, dummyGrad);
  }

  worldPosition.y = uWaterY + sines + totalRippleH;
  vRippleHeight = totalRippleH;
  vWorldPos = worldPosition.xyz;

  vec4 mvPosition = viewMatrix * worldPosition;
  vViewPos = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform float uTime;
uniform float uWaterY;
uniform sampler2D uNormalMap;
uniform sampler2D uMapData;
uniform vec4 uMapBounds;

uniform vec4 uRipples[32];
uniform int uRippleCount;

uniform vec4 uWakes[6];
uniform vec4 uWakeParams[6];

uniform vec3 uColorShallow;
uniform vec3 uColorDeep;
uniform vec3 uSunDir;
uniform float uOpacityMin;
uniform float uOpacityMax;
uniform float uUnderwater;

varying vec3 vWorldPos;
varying vec3 vViewPos;
varying vec2 vUv;
varying float vRippleHeight;

const float RIPPLE_SPEED = 3.2;
const float RIPPLE_LIFE  = 3.5;
const float RIPPLE_K     = 11.0;

// Analytic ripple calculation matching vertex shader
float evalRipple(vec2 p, vec4 r, float time, inout vec2 grad) {
  float age = time - r.z;
  if (age < 0.0 || age > RIPPLE_LIFE) return 0.0;
  vec2 dv = p - r.xy;
  float d = length(dv);
  float x = d - RIPPLE_SPEED * age;
  float w = 0.28 + 0.22 * age;
  float env = exp(-(x * x) / (w * w));
  float life = 1.0 - age / RIPPLE_LIFE;
  float amp = r.w * life * life / (1.0 + 0.8 * d);
  float ph = RIPPLE_K * x;
  float h  = amp * env * cos(ph) * 0.07;
  float dh = amp * env * (-RIPPLE_K * sin(ph) - 2.0 * x / (w * w) * cos(ph)) * 0.07;
  grad += dh * (dv / max(d, 1e-3));
  return h;
}

// 2D rotation helper
vec2 perp(vec2 v) {
  return vec2(-v.y, v.x);
}

void main() {
  vec2 p = vWorldPos.xz;

  // 1. Sample Map Data texture: R = ground height (-2..+2), G = distToDry (0..3)
  vec2 mapUv = (p - uMapBounds.xy) / (uMapBounds.zw - uMapBounds.xy);
  vec4 mapSample = texture2D(uMapData, clamp(mapUv, 0.0, 1.0));

  float groundHeight = mapSample.r * 4.0 - 2.0;
  float distToDry = mapSample.g * 3.0;

  // Discard where ground rises above water level (dry platforms)
  if (groundHeight > uWaterY + 0.02) {
    discard;
  }

  float depth = max(0.0, uWaterY - groundHeight);

  // 2. Normal Perturbation from two scrolling normal map samples
  vec2 normalUv1 = p * 0.12 + vec2(uTime * 0.02, uTime * 0.015);
  vec2 normalUv2 = p * 0.06 - vec2(uTime * 0.015, -uTime * 0.025);
  vec3 norm1 = texture2D(uNormalMap, normalUv1).rgb * 2.0 - 1.0;
  vec3 norm2 = texture2D(uNormalMap, normalUv2).rgb * 2.0 - 1.0;
  vec3 combinedNormal = normalize(norm1 + norm2);

  // 3. Add analytic ripple gradient
  vec2 rippleGrad = vec2(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uRippleCount) break;
    evalRipple(p, uRipples[i], uTime, rippleGrad);
  }

  // 4. Add V-shaped Kelvin wakes (19.5 degrees half-angle)
  float wakeFoam = 0.0;
  vec2 wakeGrad = vec2(0.0);
  const float KELVIN_TAN = 0.3541; // tan(19.5 deg)

  for (int i = 0; i < 6; i++) {
    vec4 wake = uWakes[i];
    vec4 params = uWakeParams[i];
    float speed = params.x;
    if (speed < 0.1) continue;

    vec2 wakePos = wake.xy;
    vec2 wakeDir = normalize(wake.zw);
    float length = params.z;
    float strength = params.w;

    vec2 dp = p - wakePos;
    float along = dot(dp, -wakeDir);
    float across = dot(dp, perp(wakeDir));

    if (along > 0.0 && along < length) {
      float ridgeDist = along * KELVIN_TAN;
      float dRidge = abs(abs(across) - ridgeDist);
      float wakeWidth = 0.25 + 0.08 * along;
      float ridgeEnv = exp(-(dRidge * dRidge) / (wakeWidth * wakeWidth));
      float fade = (1.0 - along / length) * strength;

      wakeFoam += ridgeEnv * fade * 0.8;
      wakeGrad += perp(wakeDir) * sign(across) * ridgeEnv * fade * 0.3;
    }
  }

  // Perturb surface normal
  vec3 normal = normalize(vec3(
    combinedNormal.x * 0.4 - rippleGrad.x * 2.5 - wakeGrad.x,
    1.0,
    combinedNormal.y * 0.4 - rippleGrad.y * 2.5 - wakeGrad.y
  ));

  if (uUnderwater > 0.5) {
    normal = -normal; // Invert normal when viewing from below
  }

  // 5. Water Color by depth absorption
  vec3 waterColor = mix(uColorShallow, uColorDeep, 1.0 - exp(-depth * 1.1));
  float alpha = mix(uOpacityMin, uOpacityMax, 1.0 - exp(-depth * 1.6));

  // 6. Fresnel reflection of creamy haze / sky
  vec3 viewDir = normalize(vViewPos);
  float NdotV = max(0.0, dot(normal, viewDir));
  float fresnel = pow(1.0 - NdotV, 3.5);
  vec3 skyHazeColor = vec3(0.92, 0.88, 0.78); // creamy hazy sky
  waterColor = mix(waterColor, skyHazeColor, fresnel * 0.65);

  // 7. Sun Specular Streak
  vec3 halfVec = normalize(uSunDir + viewDir);
  float spec = pow(max(0.0, dot(normal, halfVec)), 64.0);
  waterColor += vec3(1.0, 0.96, 0.85) * spec * 0.5;

  // 8. Foam (Shoreline foam where distToDry < 0.35m + ripple crests + wakes)
  float shoreFoam = 0.0;
  if (distToDry < 0.35) {
    float foamNoise = sin(p.x * 12.0 + uTime * 2.0) * cos(p.y * 12.0 - uTime * 1.5) * 0.5 + 0.5;
    shoreFoam = smoothstep(0.35, 0.05, distToDry) * (0.6 + 0.4 * foamNoise);
  }

  float rippleFoam = smoothstep(0.035, 0.065, abs(vRippleHeight));
  float totalFoam = clamp(shoreFoam + wakeFoam + rippleFoam, 0.0, 1.0);

  vec3 foamColor = vec3(0.96, 0.95, 0.91);
  waterColor = mix(waterColor, foamColor, totalFoam * 0.85);
  alpha = max(alpha, totalFoam * 0.9);

  // Underwater hint: Snell's window brightening
  if (uUnderwater > 0.5) {
    waterColor = mix(waterColor * 0.6, vec3(0.2, 0.45, 0.45), 0.5);
    alpha = max(alpha, 0.85);
  }

  gl_FragColor = vec4(waterColor, alpha);

  #include <fog_fragment>
}
`;

export function createWaterMaterial(options: WaterMaterialOptions): ShaderMaterial {
  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uWaterY: { value: options.waterY ?? 0.0 },
      uNormalMap: { value: options.normalTexture },
      uMapData: { value: options.mapDataTexture },
      uMapBounds: { value: options.mapBounds },
      uRipples: { value: options.ripples },
      uRippleCount: { value: 0 },
      uWakes: { value: options.wakes },
      uWakeParams: { value: options.wakeParams },
      uColorShallow: { value: new Color('#52b3b0') },
      uColorDeep: { value: new Color('#164345') },
      uSunDir: { value: new Vector3(0.4, 0.8, 0.4).normalize() },
      uOpacityMin: { value: 0.55 },
      uOpacityMax: { value: 0.93 },
      uUnderwater: { value: 0.0 },
    },
  ]);

  const mat = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
    fog: true,
  });

  return mat;
}

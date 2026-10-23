/* ── WaterMaterial.ts ──────────────────────────────────────────────────────
 *  Water v2 ShaderMaterial for BackSilence.
 *  Features:
 *  - 4 Gerstner waves with trochoidal horizontal displacement & analytic normals
 *  - Scene depth texture access with linear depth reconstruction & soft intersections
 *  - Beer-Lambert spectral depth absorption (shallow pale milky green -> deep dark teal)
 *  - Clamped screen-space refraction with foreground leak prevention
 *  - Soft shoreline, pillar, and monster leg foam
 *  - Shallow floor & waterline wall caustics
 *  - Specular glints, light streaks, and Fresnel reflections
 *  - Low tier fallback via baked GroundGrid map data
 * ──────────────────────────────────────────────────────────────────────── */

import {
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  Color,
  FrontSide,
  type Texture,
  type Vector4,
} from 'three';
import type { GraphicsTier } from '../../types/contracts.js';
import type { WaterProfile } from './WaterProfile.js';

export interface LightStreak {
  pos: Vector3;
  dir: Vector3;
  size: number;
  color: Color;
  intensity: number;
}

export interface WaterMaterialOptions {
  tier?: GraphicsTier | undefined;
  normalTexture: Texture;
  mapDataTexture: Texture;
  mapBounds: Vector4;
  ripples: Vector4[];
  wakes: Vector4[];
  wakeParams: Vector4[];
  waterY?: number | undefined;
  profile?: WaterProfile | undefined;
  streaks?: LightStreak[] | undefined;
}

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uTime;
uniform float uWaterY;
uniform float uWaveScale;
uniform vec4 uRipples[32];
uniform int uRippleCount;

varying vec3 vWorldPos;
varying vec3 vViewPos;
varying vec2 vUv;
varying vec4 vScreenPos;
varying float vRippleHeight;
varying vec3 vGerstnerNormal;

const float RIPPLE_SPEED = 3.2;   // m/s
const float RIPPLE_LIFE  = 3.5;   // s
const float RIPPLE_K     = 11.0;  // rad/m  (~0.57 m wavelength)

float ripple(vec2 p, vec4 r, float time, inout vec2 grad) {
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

// 4-wave Gerstner wave displacement and normal accumulator
void evaluateGerstner(vec2 pos, float time, float scale, out vec3 disp, out vec3 norm) {
  disp = vec3(0.0);
  norm = vec3(0.0, 1.0, 0.0);

  // Wave 1: Primary directional swell
  vec2 d1 = normalize(vec2(0.8, 0.6));
  float a1 = 0.016 * scale;
  float w1 = 1.8;
  float s1 = 1.4;
  float q1 = 0.45;

  // Wave 2: Counter swell
  vec2 d2 = normalize(vec2(-0.7, 0.7));
  float a2 = 0.011 * scale;
  float w2 = 2.7;
  float s2 = 1.9;
  float q2 = 0.35;

  // Wave 3: Short cross chop
  vec2 d3 = normalize(vec2(0.3, -0.9));
  float a3 = 0.007 * scale;
  float w3 = 4.2;
  float s3 = 2.6;
  float q3 = 0.25;

  // Wave 4: High frequency capillary wave
  vec2 d4 = normalize(vec2(-0.4, -0.9));
  float a4 = 0.004 * scale;
  float w4 = 6.5;
  float s4 = 3.4;
  float q4 = 0.15;

  float ph1 = dot(d1, pos) * w1 + time * s1;
  float ph2 = dot(d2, pos) * w2 + time * s2;
  float ph3 = dot(d3, pos) * w3 + time * s3;
  float ph4 = dot(d4, pos) * w4 + time * s4;

  float cos1 = cos(ph1); float sin1 = sin(ph1);
  float cos2 = cos(ph2); float sin2 = sin(ph2);
  float cos3 = cos(ph3); float sin3 = sin(ph3);
  float cos4 = cos(ph4); float sin4 = sin(ph4);

  // Trochoidal horizontal and vertical displacements
  disp.x = -(q1 * a1 * d1.x * cos1 + q2 * a2 * d2.x * cos2 + q3 * a3 * d3.x * cos3 + q4 * a4 * d4.x * cos4);
  disp.z = -(q1 * a1 * d1.y * cos1 + q2 * a2 * d2.y * cos2 + q3 * a3 * d3.y * cos3 + q4 * a4 * d4.y * cos4);
  disp.y = a1 * sin1 + a2 * sin2 + a3 * sin3 + a4 * sin4;

  // Analytic Gerstner normal
  float wa1 = w1 * a1; float wa2 = w2 * a2; float wa3 = w3 * a3; float wa4 = w4 * a4;
  norm.x = -(d1.x * wa1 * cos1 + d2.x * wa2 * cos2 + d3.x * wa3 * cos3 + d4.x * wa4 * cos4);
  norm.z = -(d1.y * wa1 * cos1 + d2.y * wa2 * cos2 + d3.y * wa3 * cos3 + d4.y * wa4 * cos4);
  norm.y = 1.0 - (q1 * wa1 * sin1 + q2 * wa2 * sin2 + q3 * wa3 * sin3 + q4 * wa4 * sin4);
  norm = normalize(norm);
}

void main() {
  vUv = uv;

  // Base world position
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec2 p = worldPosition.xz;

  // Gerstner Waves
  vec3 gDisp;
  vec3 gNorm;
  evaluateGerstner(p, uTime, uWaveScale, gDisp, gNorm);
  vGerstnerNormal = gNorm;

  // Analytic ripples
  float totalRippleH = 0.0;
  vec2 dummyGrad = vec2(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uRippleCount) break;
    totalRippleH += ripple(p, uRipples[i], uTime, dummyGrad);
  }

  worldPosition.x += gDisp.x;
  worldPosition.z += gDisp.z;
  worldPosition.y = uWaterY + gDisp.y + totalRippleH;

  vRippleHeight = totalRippleH;
  vWorldPos = worldPosition.xyz;

  vec4 mvPosition = viewMatrix * worldPosition;
  vViewPos = -mvPosition.xyz;
  vec4 clipPos = projectionMatrix * mvPosition;
  gl_Position = clipPos;
  vScreenPos = clipPos;

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

// Scene Depth and Color (Water v2)
uniform sampler2D uSceneDepth;
uniform sampler2D uSceneColor;
uniform float uHasSceneDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec2 uResolution;

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
uniform float uMurk;
uniform float uNormalScale;
uniform float uScrollSpeed;

// Bioluminescence (Map 5)
uniform vec3 uBiolumColor;
uniform float uBiolumRipple;
uniform float uBiolumAmbient;

// Light Streaks (up to 16 area/line light proxies)
uniform vec3 uStreakPos[16];
uniform vec3 uStreakDir[16];
uniform float uStreakSize[16];
uniform vec3 uStreakColor[16];
uniform float uStreakIntensity[16];
uniform int uStreakCount;

varying vec3 vWorldPos;
varying vec3 vViewPos;
varying vec2 vUv;
varying vec4 vScreenPos;
varying float vRippleHeight;
varying vec3 vGerstnerNormal;

const float RIPPLE_SPEED = 3.2;
const float RIPPLE_LIFE  = 3.5;
const float RIPPLE_K     = 11.0;

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

vec2 perp(vec2 v) {
  return vec2(-v.y, v.x);
}

// Convert hardware non-linear depth to linear view Z (negative in Three.js view space)
float perspectiveDepthToLinearZ(float rawDepth, float near, float far) {
  #if defined(USE_LOGDEPTHBUF)
    return rawDepth;
  #else
    return (near * far) / ((far - near) * rawDepth - far);
  #endif
}

void main() {
  vec2 p = vWorldPos.xz;

  // 1. Screen coordinates for depth texture and refraction sampling
  vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;

  // 2. Sample Map Data texture: R = ground height (-2..+2), G = distToDry (0..3)
  vec2 mapUv = (p - uMapBounds.xy) / (uMapBounds.zw - uMapBounds.xy);
  vec4 mapSample = texture2D(uMapData, clamp(mapUv, 0.0, 1.0));
  float groundHeight = mapSample.r * 4.0 - 2.0;
  float distToDry = mapSample.g * 3.0;

  // Discard where dry ground rises above water surface
  if (groundHeight > uWaterY + 0.02) {
    discard;
  }

  // 3. Compute true physical water depth in view space
  float waterDepth = max(0.0, uWaterY - groundHeight);
  bool hasTrueDepth = (uHasSceneDepth > 0.5);

  if (hasTrueDepth) {
    float rawSceneDepth = texture2D(uSceneDepth, screenUv).r;
    float sceneLinearZ = -perspectiveDepthToLinearZ(rawSceneDepth, uCameraNear, uCameraFar);
    float waterLinearZ = vViewPos.z;
    float diffZ = sceneLinearZ - waterLinearZ;
    if (diffZ >= 0.0) {
      waterDepth = diffZ;
    }
  }

  // 4. Normal Perturbation from 3 multi-scale scrolling normal map octaves + Gerstner
  float animSpeed = max(0.04, uScrollSpeed) * 2.2;
  vec2 normalUv1 = p * 0.12 + vec2(uTime * animSpeed * 0.5, uTime * animSpeed * 0.35);
  vec2 normalUv2 = p * 0.06 - vec2(uTime * animSpeed * 0.4, -uTime * animSpeed * 0.6);
  vec2 normalUv3 = p * 0.26 + vec2(-uTime * animSpeed * 0.7, uTime * animSpeed * 0.5);

  vec3 norm1 = texture2D(uNormalMap, normalUv1).rgb * 2.0 - 1.0;
  vec3 norm2 = texture2D(uNormalMap, normalUv2).rgb * 2.0 - 1.0;
  vec3 norm3 = texture2D(uNormalMap, normalUv3).rgb * 2.0 - 1.0;
  vec3 detailNormal = normalize(norm1 * 0.5 + norm2 * 0.35 + norm3 * 0.25) * uNormalScale;

  // Add analytic ripples
  vec2 rippleGrad = vec2(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uRippleCount) break;
    evalRipple(p, uRipples[i], uTime, rippleGrad);
  }

  // Add V-shaped Kelvin wakes (19.5 degrees half-angle)
  float wakeFoam = 0.0;
  vec2 wakeGrad = vec2(0.0);
  const float KELVIN_TAN = 0.3541;

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

      wakeFoam += ridgeEnv * fade * 0.85;
      wakeGrad += perp(wakeDir) * sign(across) * ridgeEnv * fade * 0.35;
    }
  }

  // Combined perturbed surface normal
  vec3 normal = normalize(vec3(
    vGerstnerNormal.x + detailNormal.x * 0.85 - rippleGrad.x * 3.5 - wakeGrad.x * 1.6,
    vGerstnerNormal.y,
    vGerstnerNormal.z + detailNormal.y * 0.85 - rippleGrad.y * 3.5 - wakeGrad.y * 1.6
  ));

  if (uUnderwater > 0.5) {
    normal = -normal;
  }

  // 5. Beer-Lambert Absorption Color
  // Shallow edges: pale milky green / turquoise; Deep water: dark emerald / murky abyss
  vec3 extinction = -log(max(vec3(0.001), uColorDeep / max(vec3(0.001), uColorShallow))) * 0.85;
  vec3 transmittance = exp(-extinction * waterDepth);
  vec3 baseWaterColor = mix(uColorDeep, uColorShallow, transmittance);

  // 6. Refraction with clamped foreground leak protection
  vec3 sceneSample = uColorShallow;
  if (hasTrueDepth) {
    vec2 refractOffset = normal.xz * 0.035 * clamp(waterDepth, 0.0, 1.0);
    vec2 refractedUv = clamp(screenUv + refractOffset, 0.001, 0.999);
    float rawRefractDepth = texture2D(uSceneDepth, refractedUv).r;
    float refractLinearZ = -perspectiveDepthToLinearZ(rawRefractDepth, uCameraNear, uCameraFar);
    // If refracted ray hits foreground object above water, fall back to unrefracted
    if (refractLinearZ >= vViewPos.z) {
      sceneSample = texture2D(uSceneColor, refractedUv).rgb;
    } else {
      sceneSample = texture2D(uSceneColor, screenUv).rgb;
    }
  }

  // Combine refracted scene background with Beer-Lambert absorption
  vec3 waterColor = mix(baseWaterColor, sceneSample * transmittance, 0.65);
  float alpha = mix(uOpacityMin, uOpacityMax, 1.0 - exp(-waterDepth * 1.8));
  alpha = clamp(alpha + uMurk, 0.0, 1.0);

  // 7. Fresnel reflection of sky / hazy skylight
  vec3 viewDir = normalize(vViewPos);
  float NdotV = max(0.0, dot(normal, viewDir));
  float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 4.2);
  vec3 skyHazeColor = vec3(0.95, 0.92, 0.84);
  waterColor = mix(waterColor, skyHazeColor, fresnel * 0.68);

  // 8. Animated Caustics on shallow floor and waterline walls
  if (waterDepth < 2.5) {
    vec2 cUv1 = p * 0.85 + vec2(uTime * 0.08, uTime * 0.06) + detailNormal.xy * 0.08;
    vec2 cUv2 = p * 1.15 + vec2(-uTime * 0.07, uTime * 0.09) + detailNormal.yx * 0.08;
    float c1 = sin(cUv1.x * 7.0 + sin(cUv1.y * 5.0 + uTime * 0.6)) * 0.5 + 0.5;
    float c2 = cos(cUv2.x * 6.5 + cos(cUv2.y * 7.5 - uTime * 0.5)) * 0.5 + 0.5;
    float caustic = pow(min(c1, c2), 1.6) * 2.4;
    float causticFade = smoothstep(2.5, 0.15, waterDepth) * (1.0 - fresnel * 0.75);
    vec3 causticCol = mix(vec3(0.9, 1.0, 0.95), vec3(1.0, 0.98, 0.9), 0.5);
    waterColor += causticCol * caustic * causticFade * 0.42;
  }

  // 9. Sun Glint Specular
  vec3 halfVec = normalize(uSunDir + viewDir);
  float specSharp = pow(max(0.0, dot(normal, halfVec)), 128.0);
  float specWide = pow(max(0.0, dot(normal, halfVec)), 22.0);
  waterColor += vec3(1.0, 0.98, 0.92) * (specSharp * 0.95 + specWide * 0.22);

  // 10. LightStreaks (area / line light proxies)
  for (int i = 0; i < 16; i++) {
    if (i >= uStreakCount) break;
    vec3 sPos = uStreakPos[i];
    vec3 sDir = uStreakDir[i];
    float sSize = uStreakSize[i];
    vec3 sCol = uStreakColor[i];
    float sInt = uStreakIntensity[i];

    vec3 toSurf = vWorldPos - sPos;
    float tSeg = clamp(dot(toSurf, sDir), -sSize * 0.5, sSize * 0.5);
    vec3 closestP = sPos + sDir * tSeg;

    vec3 lightVec = closestP - vWorldPos;
    float distSq = dot(lightVec, lightVec);
    vec3 lDir = normalize(lightVec);

    vec3 halfV = normalize(lDir + viewDir);
    float NdotH = max(0.0, dot(normal, halfV));
    float sSpec = pow(NdotH, 32.0);
    float atten = 1.0 / (1.0 + 0.08 * distSq);

    waterColor += sCol * (sSpec * atten * sInt);
  }

  // 11. Soft Shoreline & Contact Foam (from depth difference or distToDry)
  float shoreFoam = 0.0;
  if (hasTrueDepth) {
    if (waterDepth < 0.32) {
      float foamNoise = sin(p.x * 16.0 + uTime * 2.2) * cos(p.y * 16.0 - uTime * 1.8) * 0.5 + 0.5;
      shoreFoam = smoothstep(0.32, 0.02, waterDepth) * (0.65 + 0.35 * foamNoise);
    }
  } else {
    if (distToDry < 0.42) {
      float foamNoise = sin(p.x * 14.0 + uTime * 2.2) * cos(p.y * 14.0 - uTime * 1.8) * 0.5 + 0.5;
      shoreFoam = smoothstep(0.42, 0.04, distToDry) * (0.6 + 0.4 * foamNoise);
    }
  }

  // Wave crest foam
  float crestFoam = smoothstep(0.02, 0.06, abs(vWorldPos.y - uWaterY)) * 0.45;
  float rippleFoam = smoothstep(0.007, 0.026, abs(vRippleHeight)) * 0.8;
  float totalFoam = clamp(shoreFoam + wakeFoam + rippleFoam + crestFoam, 0.0, 1.0);

  vec3 foamColor = vec3(0.98, 0.97, 0.94);
  waterColor = mix(waterColor, foamColor, totalFoam * 0.88);
  alpha = max(alpha, totalFoam * 0.92);

  // 12. Bioluminescence (Map 5: Abyssal Drainage Core)
  if (uBiolumRipple > 0.0) {
    float rippleEnergy = abs(vRippleHeight) * 14.0;
    float wakeEnergy = wakeFoam * 1.5;
    float ambientPulse = (sin(p.x * 1.5 + uTime * 0.8) * cos(p.y * 1.5 - uTime * 0.6) * 0.5 + 0.5);
    float glow = clamp(rippleEnergy * uBiolumRipple + wakeEnergy * 0.8 + ambientPulse * uBiolumAmbient, 0.0, 2.5);
    waterColor += uBiolumColor * glow;
  }

  // 13. Submerged underwater grading
  if (uUnderwater > 0.5) {
    waterColor = mix(waterColor * 0.6, vec3(0.2, 0.45, 0.45), 0.5);
    alpha = max(alpha, 0.85);
  }

  gl_FragColor = vec4(waterColor, alpha);

  #include <fog_fragment>
}
`;

export function createWaterMaterial(options: WaterMaterialOptions): ShaderMaterial {
  const prof = options.profile;

  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uWaterY: { value: options.waterY ?? 0.0 },
      uWaveScale: { value: prof?.normalStrength ?? 1.0 },
      uNormalMap: { value: options.normalTexture },
      uMapData: { value: options.mapDataTexture },
      uMapBounds: { value: options.mapBounds },
      uSceneDepth: { value: null },
      uSceneColor: { value: null },
      uHasSceneDepth: { value: 0.0 },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 120.0 },
      uResolution: { value: new Vector2(1920, 1080) },
      uRipples: { value: options.ripples },
      uRippleCount: { value: 0 },
      uWakes: { value: options.wakes },
      uWakeParams: { value: options.wakeParams },
      uColorShallow: { value: new Color(prof?.shallow ?? '#72bca5') },
      uColorDeep: { value: new Color(prof?.deep ?? '#2e6358') },
      uSunDir: { value: new Vector3(0.4, 0.8, 0.4).normalize() },
      uOpacityMin: { value: prof?.opacityMin ?? 0.55 },
      uOpacityMax: { value: prof?.opacityMax ?? 0.93 },
      uUnderwater: { value: 0.0 },
      uMurk: { value: prof?.murk ?? 0.0 },
      uNormalScale: { value: prof?.normalStrength ?? 1.0 },
      uScrollSpeed: { value: prof?.scroll ?? 0.04 },
      uBiolumColor: { value: new Color(prof?.bioluminescence?.color ?? '#3ff2c8') },
      uBiolumRipple: { value: prof?.bioluminescence?.ripple ?? 0.0 },
      uBiolumAmbient: { value: prof?.bioluminescence?.ambient ?? 0.0 },
      // LightStreaks (up to 16)
      uStreakPos: { value: Array.from({ length: 16 }, () => new Vector3()) },
      uStreakDir: { value: Array.from({ length: 16 }, () => new Vector3(0, 0, 1)) },
      uStreakSize: { value: new Float32Array(16) },
      uStreakColor: { value: Array.from({ length: 16 }, () => new Vector3(1, 1, 1)) },
      uStreakIntensity: { value: new Float32Array(16) },
      uStreakCount: { value: 0 },
    },
  ]);

  if (options.streaks && options.streaks.length > 0) {
    const count = Math.min(16, options.streaks.length);
    uniforms['uStreakCount']!.value = count;
    for (let i = 0; i < count; i++) {
      const s = options.streaks[i]!;
      (uniforms['uStreakPos']!.value as Vector3[])[i]!.copy(s.pos);
      (uniforms['uStreakDir']!.value as Vector3[])[i]!.copy(s.dir).normalize();
      (uniforms['uStreakSize']!.value as Float32Array)[i] = s.size;
      (uniforms['uStreakColor']!.value as Vector3[])[i]!.set(s.color.r, s.color.g, s.color.b);
      (uniforms['uStreakIntensity']!.value as Float32Array)[i] = s.intensity;
    }
  }

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

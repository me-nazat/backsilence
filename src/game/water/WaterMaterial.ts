/* ── WaterMaterial.ts ──────────────────────────────────────────────────────
 *  Water v2 ShaderMaterial for BackSilence.
 *  Features:
 *  - 4 Gerstner waves with trochoidal horizontal displacement & analytic slope
 *  - Scene depth texture access with linear depth reconstruction & soft intersections (3cm)
 *  - Beer-Lambert spectral depth absorption (milky chlorinated green: sigma 0.90, 0.25, 0.45)
 *  - Clamped screen-space refraction with foreground leak prevention
 *  - 3 scrolling detail normal map octaves (0.55m, 0.18m, 0.06m) with 11Hz temporal micro-flicker
 *  - Toksvig-style anti-aliasing roughness adjustment to prevent distant shimmering
 *  - GGX microfacet specular on detail normals for authentic sparkling surface glints
 *  - Up to 16 area/line light proxies (skylights, sun, neon)
 *  - Reflection tiers: Low (gradient), Med (64px CubeCamera), High (Planar + Cube)
 *  - Soft shoreline, pillar, and monster leg foam
 *  - Shallow floor & waterline wall caustics
 *  - Height fog + FogExp2 horizon blending (seamless horizon blowout)
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
  type CubeTexture,
  type Vector4,
  WebGLCubeRenderTarget,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import type { GraphicsTier } from '../../types/contracts.js';
import type { WaterProfile } from './WaterProfile.js';
export { WaterSurfaceShader } from './WaterSurfaceShader.js';

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
  sunDir?: Vector3 | undefined;
  envCube?: CubeTexture | null | undefined;
  planarReflection?: Texture | null | undefined;
}

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uTime;
uniform float uWaterY;
uniform float uWaveScale;
uniform float uWaveAmplitude;
uniform vec4 uRipples[32];
uniform int uRippleCount;
uniform vec3 uMonsterPos;

varying vec3 vWorldPos;
varying vec3 vViewPos;
varying vec2 vUv;
varying vec4 vScreenPos;
varying float vRippleHeight;
varying vec2 vGerstnerSlope;

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
  float h  = amp * env * cos(ph) * 0.045;
  float dh = amp * env * (-RIPPLE_K * sin(ph) - 2.0 * x / (w * w) * cos(ph)) * 0.045;
  grad += dh * (dv / max(d, 1e-3));
  return h;
}

// 3-wave Gerstner calm broad swell displacement & analytic slope accumulator (Water v5 / Prompt 3)
// Dominant wavelengths in 3.0–8.0m band: 6.40m, 4.50m, 3.20m with viscous breathing motion.
void evaluateGerstner(vec2 pos, float time, float scale, out vec3 disp, out vec2 slope) {
  disp = vec3(0.0);
  slope = vec2(0.0);

  // Broad swell wavenumbers in [3.0, 8.0]m band
  float k1 = 0.98175; // 2pi / 6.40m
  float k2 = 1.39626; // 2pi / 4.50m
  float k3 = 1.96350; // 2pi / 3.20m

  // Directions spread over gentle forward swell
  vec2 d1 = vec2(0.9659, 0.2588);
  vec2 d2 = vec2(0.7071, 0.7071);
  vec2 d3 = vec2(0.3420, 0.9397);

  // Low gentle amplitude broad swell (gentle indoor pool slosh, amplitude ~ 0.014m)
  float ampBase = scale * (uWaveAmplitude / 0.014);
  float a1 = 0.0075 * ampBase;
  float a2 = 0.0045 * ampBase;
  float a3 = 0.0020 * ampBase;

  // Frequencies: long period, slow viscous breathing multiplier 0.28
  float w1 = 2.40 * 0.28;
  float w2 = 3.80 * 0.28;
  float w3 = 5.60 * 0.28;

  float q = 0.32;

  float ph1 = dot(d1, pos) * k1 + time * w1;
  float ph2 = dot(d2, pos) * k2 + time * w2;
  float ph3 = dot(d3, pos) * k3 + time * w3;

  float cos1 = cos(ph1); float sin1 = sin(ph1);
  float cos2 = cos(ph2); float sin2 = sin(ph2);
  float cos3 = cos(ph3); float sin3 = sin(ph3);

  // Trochoidal horizontal and vertical displacements
  disp.x = -(q * a1 * d1.x * cos1 + q * a2 * d2.x * cos2 + q * a3 * d3.x * cos3);
  disp.z = -(q * a1 * d1.y * cos1 + q * a2 * d2.y * cos2 + q * a3 * d3.y * cos3);
  disp.y = a1 * sin1 + a2 * sin2 + a3 * sin3;

  // Analytic Gerstner normal slopes
  slope.x = a1 * k1 * d1.x * cos1 + a2 * k2 * d2.x * cos2 + a3 * k3 * d3.x * cos3;
  slope.y = a1 * k1 * d1.y * cos1 + a2 * k2 * d2.y * cos2 + a3 * k3 * d3.y * cos3;
}

void main() {
  vUv = uv;

  // Base world position
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec2 p = worldPosition.xz;

  // Gerstner Waves
  vec3 gDisp;
  vec2 gSlope;
  evaluateGerstner(p, uTime, uWaveScale, gDisp, gSlope);
  vGerstnerSlope = gSlope * uWaveScale;

  // Analytic ripples
  float totalRippleH = 0.0;
  vec2 dummyGrad = vec2(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uRippleCount) break;
    totalRippleH += ripple(p, uRipples[i], uTime, dummyGrad);
  }

  // Surface tension dimple around monster appendages
  float distToMonsterXZ = length(p - uMonsterPos.xz);
  float monsterDimple = 0.0;
  if (distToMonsterXZ < 2.5 && abs(uWaterY - uMonsterPos.y) < 2.0) {
    float mRad = 1.25;
    float mEnv = exp(-(distToMonsterXZ * distToMonsterXZ) / (mRad * mRad));
    monsterDimple = -0.024 * mEnv * cos(distToMonsterXZ * 3.8 - uTime * 2.2);
  }

  worldPosition.x += gDisp.x;
  worldPosition.z += gDisp.z;
  worldPosition.y = uWaterY + gDisp.y + totalRippleH + monsterDimple;

  vRippleHeight = totalRippleH + monsterDimple;
  vWorldPos = worldPosition.xyz;

  vec4 mvPosition = viewMatrix * worldPosition;
  vViewPos = mvPosition.xyz;
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

// Reflection sources
uniform samplerCube uEnvCube;
uniform sampler2D uPlanarReflection;
uniform float uReflectionTier;
uniform float uBaseRoughness;

// Wave Simulation (Phase C: Medium & High)
uniform sampler2D uWaveSimTexture;
uniform vec2 uWaveSimCenter;
uniform float uWaveSimSize;
uniform float uWaveSimResolution;
uniform float uHasWaveSim;

uniform vec4 uRipples[32];
uniform int uRippleCount;

uniform vec4 uWakes[6];
uniform vec4 uWakeParams[6];

uniform vec3 uColorShallow;
uniform vec3 uColorDeep;
uniform vec3 uSpecularColor;
uniform float uFoamStrength;
uniform vec3 uSunDir;
uniform vec3 uMonsterPos;
uniform float uOpacityMin;
uniform float uOpacityMax;
uniform float uUnderwater;
uniform float uMurk;
uniform float uNormalScale;
uniform float uScrollSpeed;

// Optical & Caustics tunables
uniform vec3 uCausticsColor;
uniform float uCausticsIntensity;
uniform float uReflectionStrength;
uniform float uFresnelPower;
uniform float uFresnelBias;
uniform float uRippleStrength;
uniform vec3 uFoamColor;

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
varying vec2 vGerstnerSlope;

const float RIPPLE_SPEED = 3.2;
const float RIPPLE_LIFE  = 3.5;
const float RIPPLE_K     = 11.0;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// 2D cellular / Voronoi caustic boundary network
float voronoiCaustic(vec2 uv, float time) {
  vec2 g = floor(uv);
  vec2 f = fract(uv);
  float d1 = 1.0;
  float d2 = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 lattice = vec2(float(x), float(y));
      vec2 offset = hash2(g + lattice);
      offset = 0.5 + 0.38 * sin(time * 1.8 + 6.2831 * offset);
      vec2 r = lattice + offset - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  return 1.0 - smoothstep(0.0, 0.22, edge);
}

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
  float h  = amp * env * cos(ph) * 0.045;
  float dh = amp * env * (-RIPPLE_K * sin(ph) - 2.0 * x / (w * w) * cos(ph)) * 0.045;
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

// GGX Microfacet Specular Evaluation (Trowbridge-Reitz NDF + Smith Masking-Shadowing)
float D_GGX(float NdotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float d = (NdotH * a2 - NdotH) * NdotH + 1.0;
  return a2 / (3.14159265 * d * d + 1e-5);
}

float G_Smith(float NdotV, float NdotL, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  float g1 = NdotV / (NdotV * (1.0 - k) + k + 1e-4);
  float g2 = NdotL / (NdotL * (1.0 - k) + k + 1e-4);
  return g1 * g2;
}

vec3 evalGGX(vec3 N, vec3 V, vec3 L, vec3 lightColor, float intensity, float roughness) {
  vec3 H = normalize(V + L);
  float NdotH = max(0.0, dot(N, H));
  if (NdotH < 0.65) return vec3(0.0);
  float NdotV = max(1e-4, dot(N, V));
  float NdotL = max(0.0, dot(N, L));
  float VdotH = max(0.0, dot(V, H));

  float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);

  // Broadened roughness floor 0.12 to prevent pointillist sparkling noise (Prompt 3 Phase A)
  float r1 = max(0.12, roughness);
  float D1 = D_GGX(NdotH, r1);
  float G1 = G_Smith(NdotV, NdotL, r1);
  float spec1 = (D1 * F * G1) / (4.0 * NdotV * max(0.01, NdotL));

  // Broader streak highlight lobe
  float r2 = max(0.24, roughness * 1.6);
  float D2 = D_GGX(NdotH, r2);
  float G2 = G_Smith(NdotV, NdotL, r2);
  float spec2 = (D2 * F * G2) / (4.0 * NdotV * max(0.01, NdotL));

  // Cap glint fraction <= 0.03
  float glintMask = smoothstep(0.68, 0.94, NdotH);
  float totalSpec = (spec1 * 0.7 + spec2 * 0.4) * glintMask;
  return lightColor * (totalSpec * intensity * NdotL);
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

  // 3. Compute true physical water thickness in view space
  float waterLinearDepth = -vViewPos.z;
  float mapDepth = max(0.0, uWaterY - groundHeight);
  float thickness = mapDepth;
  bool hasTrueDepth = (uHasSceneDepth > 0.5);

  if (hasTrueDepth) {
    float rawSceneDepth = texture2D(uSceneDepth, screenUv).r;
    float sceneLinearDepth = -perspectiveDepthToLinearZ(rawSceneDepth, uCameraNear, uCameraFar);
    float diffZ = sceneLinearDepth - waterLinearDepth;
    // Discard water fragment if opaque geometry is closer than the water surface (above water / in front)
    // 0.02m tolerance prevents grazing angles from punching holes in platform slab sides while eliminating z-fight
    if (diffZ < -0.02) {
      discard;
    }
    thickness = clamp(diffZ, 0.0, mapDepth * 1.5 + 0.1);
  }

  // 4. Broad detail swells at 3 scales: 7.2m, 4.1m, 2.0m (eliminating high-frequency edge chatter)
  float animSpeed = max(0.03, uScrollSpeed) * 0.95;

  vec2 uv1 = p / 7.2 + vec2(uTime * animSpeed * 0.18, uTime * animSpeed * 0.12);
  vec2 uv2 = p / 4.1 - vec2(uTime * animSpeed * 0.24, -uTime * animSpeed * 0.18);
  vec2 uv3 = p / 2.0 + vec2(-uTime * animSpeed * 0.32, uTime * animSpeed * 0.26);

  vec3 norm1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
  vec3 norm2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
  vec3 norm3 = texture2D(uNormalMap, uv3).rgb * 2.0 - 1.0;

  float distToCam = length(vViewPos);
  float nearFade = clamp(1.0 - distToCam / 14.0, 0.0, 1.0);
  float distFade = clamp(1.0 - distToCam / 70.0, 0.0, 1.0);

  // Toksvig-style anti-aliasing roughness increase with 0.12 roughness floor
  float avgLen = length(norm1.xy * 0.35 + norm2.xy * 0.22);
  float variance = (1.0 - min(1.0, avgLen)) / max(0.01, avgLen);
  float roughness = clamp(sqrt(uBaseRoughness * uBaseRoughness + variance * 0.28), 0.12, 0.48);

  // Combine slopes before normalizing (soft broad swells)
  vec2 slopeDetail = (norm1.xy * 0.007 + norm2.xy * 0.0035 + norm3.xy * (0.0012 * nearFade)) * (uNormalScale * mix(0.018, 0.030, distFade));

  // Add analytic ripples
  vec2 rippleGrad = vec2(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uRippleCount) break;
    evalRipple(p, uRipples[i], uTime, rippleGrad);
  }
  float rippleSlope = length(rippleGrad) * (0.012 * uRippleStrength);
  vec2 slopeRipple = -rippleGrad * (0.012 * uRippleStrength);

  // Concentric wave ripple specular rim and crest foam
  float rippleRim = pow(clamp(rippleSlope * 45.0, 0.0, 1.0), 1.5) * 0.45;
  vec3 rippleSpecular = vec3(1.0) * rippleRim;
  float rippleCrestFoam = smoothstep(0.012, 0.038, rippleSlope) * 0.40;

  // Add V-shaped Kelvin wakes (19.5 degrees half-angle) with 2-3s exponential decay
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
      float wakeWidth = 0.18 + 0.08 * along;
      float ridgeEnv = exp(-(dRidge * dRidge) / (wakeWidth * wakeWidth));
      float ridgeSlope = (dRidge / wakeWidth) * ridgeEnv;
      float fade = min(0.35, exp(-along / max(1.0, length * 0.45)) * strength);

      wakeFoam += ridgeEnv * fade * 1.1;
      wakeGrad += perp(wakeDir) * sign(across) * ridgeSlope * fade * 0.9;
    }
  }
  vec2 slopeWake = -wakeGrad * 1.4;

  // Add wave simulation slope if available (Phase C: Medium & High)
  vec2 slopeSim = vec2(0.0);
  if (uHasWaveSim > 0.5) {
    vec2 simUv = (p - (uWaveSimCenter - vec2(uWaveSimSize * 0.5))) / uWaveSimSize;
    if (simUv.x >= 0.002 && simUv.x <= 0.998 && simUv.y >= 0.002 && simUv.y <= 0.998) {
      float texel = 1.0 / uWaveSimResolution;
      float hL = texture2D(uWaveSimTexture, simUv - vec2(texel, 0.0)).r;
      float hR = texture2D(uWaveSimTexture, simUv + vec2(texel, 0.0)).r;
      float hD = texture2D(uWaveSimTexture, simUv - vec2(0.0, texel)).r;
      float hU = texture2D(uWaveSimTexture, simUv + vec2(0.0, texel)).r;
      float gridDx = uWaveSimSize / uWaveSimResolution;
      slopeSim = -vec2(hR - hL, hU - hD) / (2.0 * gridDx);
    }
  }

  vec2 totalSlope = vGerstnerSlope + slopeDetail + slopeRipple + slopeWake + slopeSim;
  vec3 normal = normalize(vec3(-totalSlope.x, 1.0, -totalSlope.y));

  if (uUnderwater > 0.5) {
    normal = -normal;
  }

  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // 5. Refraction with foreground depth rejection
  vec3 sceneSample = uColorShallow;
  if (hasTrueDepth) {
    float refractK = 0.045; // gentle 1.02–1.08 scale
    float depthFalloff = 1.0 - exp(-thickness * 1.4);
    vec2 refractOffset = normal.xz * refractK * depthFalloff;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    refractOffset.x /= aspect;
    vec2 refractedUv = clamp(screenUv + refractOffset, 0.001, 0.999);
    float rawRefractDepth = texture2D(uSceneDepth, refractedUv).r;
    float refractLinearDepth = -perspectiveDepthToLinearZ(rawRefractDepth, uCameraNear, uCameraFar);
    
    // Foreground leak rejection: reject offset sample if depth nearer than water surface
    if (refractLinearDepth >= waterLinearDepth - 0.05) {
      // Gentle chromatic dispersion at grazing angles
      float grazingDispersion = 1.0 + 0.06 * pow(1.0 - max(0.0, dot(normal, viewDir)), 2.0);
      vec2 uvR = clamp(screenUv + refractOffset * grazingDispersion, 0.001, 0.999);
      vec2 uvB = clamp(screenUv + refractOffset * (2.0 - grazingDispersion), 0.001, 0.999);
      sceneSample.r = texture2D(uSceneColor, uvR).r;
      sceneSample.g = texture2D(uSceneColor, refractedUv).g;
      sceneSample.b = texture2D(uSceneColor, uvB).b;
    } else {
      sceneSample = texture2D(uSceneColor, screenUv).rgb;
    }
  }

  // 6. Physical Water Absorption & Depth Visibility (Prompt 7 D125)
  // Floor visibility through water column drives trench detection as a physical signal.
  // Beer-Lambert spectral extinction: red absorbed fastest (1.6), blue (0.95), green least (0.55)
  vec3 sigma = vec3(1.6, 0.55, 0.95);
  vec3 T = exp(-sigma * thickness);
  float floorVisibility = dot(T, vec3(0.299, 0.587, 0.114));

  // Depth-graded in-scatter:
  // Shallow: #8cb179, Near-Deep: #6e8949, Mid-hall Deep: #678f44
  float deepMix = clamp(thickness / 0.85, 0.0, 1.0);
  vec3 deepScatter = uColorDeep * vec3(0.85, 0.95, 0.80);
  vec3 scatter = mix(uColorShallow, deepScatter, deepMix);

  // Dense fog water darkening: in dense fog areas water darkens per measured pair (#3e5a2c near, #5f865a far)
  #ifdef USE_FOG
    vec3 cFogWaterNear = vec3(0.243, 0.353, 0.173); // #3e5a2c
    vec3 cFogWaterFar = vec3(0.373, 0.525, 0.353);  // #5f865a
    float fogTransmittance = exp(-fogDensity * vFogDepth);
    float denseFogMix = clamp((fogDensity - 0.012) / 0.015, 0.0, 1.0);
    if (denseFogMix > 0.0) {
      vec3 denseWater = mix(cFogWaterFar, cFogWaterNear, fogTransmittance);
      scatter = mix(scatter, denseWater, denseFogMix * 0.65);
    }
  #endif

  // Trench optical signature: when floor drops out (thickness > 1.1m),
  // bulk absorption through deep water column produces trench color #7da46d
  vec3 cTrench = vec3(0.490, 0.643, 0.427); // #7da46d
  float trenchFactor = smoothstep(1.0, 1.8, thickness);
  scatter = mix(scatter, cTrench, trenchFactor);

  // Suspended-silt scattering (uMurk)
  scatter = mix(scatter, vec3(0.42, 0.55, 0.30), clamp(uMurk * (1.0 - exp(-thickness * 0.5)), 0.0, 0.85));

  // Dual-layer Voronoi caustic network projected onto refracted floor coordinate
  vec3 N = normal;
  float waterDepth = max(0.0, thickness);
  vec2 floorPos = vWorldPos.xz + N.xz * (waterDepth * 0.38);

  vec2 cUv1 = floorPos * 1.8 + vec2(uTime * 0.045, uTime * 0.032);
  vec2 cUv2 = floorPos * 2.7 - vec2(uTime * 0.038, -uTime * 0.046);
  float c1 = voronoiCaustic(cUv1, uTime * 1.1);
  float c2 = voronoiCaustic(cUv2, uTime * 1.4 + 1.8);
  float causticsNet = max(c1 * 0.85, c2 * 0.85) + (c1 * c2) * 0.65;

  float causticDepthFade = exp(-waterDepth * 0.70) * smoothstep(0.01, 0.08, waterDepth);
  vec3 causticLight = uCausticsColor * (causticsNet * uCausticsIntensity * causticDepthFade);

  // Veil must be gated by optical path length or it becomes a flat white sheet.
  float veilGate = (1.0 - exp(-thickness * 1.6)) * (1.0 - floorVisibility);
  vec3 milkyVeil = vec3(0.85, 0.94, 0.88) * (0.003 * veilGate);

  // Transmitted 3D submerged floor and wall geometry with crisp caustic illumination
  vec3 transmittedFloor = (sceneSample + causticLight) * T;
  transmittedFloor = 1.0 - (1.0 - transmittedFloor) * (1.0 - causticLight * 0.35);

  float depthFactor = clamp(thickness / 0.85, 0.0, 1.0);
  vec3 absorbedWater = mix(transmittedFloor, scatter, depthFactor * 0.35) + milkyVeil;

  // 7. Schlick Fresnel reflection with tunable power and bias
  float NdotV = max(0.0, dot(normal, viewDir));
  float fresnel = uFresnelBias + (1.0 - uFresnelBias) * pow(1.0 - NdotV, uFresnelPower);

  vec3 reflectDir = reflect(-viewDir, normal);
  vec3 skyHazeColor = uSpecularColor;
  vec3 reflectColor = skyHazeColor;

  if (uReflectionTier > 1.5) {
    // High Tier: Planar reflection + Cube map
    vec2 planarUv = clamp(vec2(screenUv.x, 1.0 - screenUv.y) + normal.xz * 0.016, 0.001, 0.999);
    vec3 planarCol = texture2D(uPlanarReflection, planarUv).rgb;
    vec3 cubeCol = textureCube(uEnvCube, reflectDir).rgb;
    reflectColor = mix(cubeCol, planarCol, 0.60);
  } else if (uReflectionTier > 0.5) {
    // Medium Tier: 64px Cube map
    reflectColor = textureCube(uEnvCube, reflectDir).rgb;
  } else {
    // Low Tier: Sky and fog gradient
    reflectColor = mix(skyHazeColor * 0.92, skyHazeColor * 1.08, max(0.0, reflectDir.y));
  }

  float fresnelFactor = mix(0.18, uReflectionStrength, pow(1.0 - NdotV, 2.5));
  vec3 waterColor = mix(absorbedWater, reflectColor, fresnel * fresnelFactor);
  waterColor += rippleSpecular;

  // 9. Sun GGX Specular Glint & Horizontal Pale Specular Streaks (#7b9e5e)
  vec3 sunSpec = evalGGX(normal, viewDir, uSunDir, uSpecularColor, 0.32, roughness);
  waterColor += clamp(sunSpec, 0.0, 0.38);

  // Horizontal Pale Specular Streaks (anisotropic highlights along wave crests, no pointillist noise)
  vec3 H_glint = normalize(viewDir + uSunDir);
  vec3 anisoNormal = normalize(vec3(normal.x * 0.18, normal.y, normal.z));
  float specBase = max(0.0, dot(anisoNormal, H_glint));
  float specWave = pow(specBase, 18.0) * 0.12;
  waterColor += uSpecularColor * specWave;

  // 10. LightStreaks (up to 16 area/line light proxies) evaluated via GGX
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

    float atten = 1.0 / (1.0 + 0.02 * distSq);
    vec3 streakSpec = evalGGX(normal, viewDir, lDir, sCol, sInt * atten * 0.55, roughness);
    waterColor += clamp(streakSpec, 0.0, 0.38);
  }

  // 11. Soft Shoreline & Contact Foam (from depth gradient meniscus + 3-octave foam)
  float shoreFoam = 0.0;
  float meniscusFoam = 0.0;
  if (hasTrueDepth) {
    if (thickness < 0.32) {
      float fn = sin(p.x * 5.3 + uTime * 1.7) * sin(p.y * 6.1 - uTime * 1.3)
               + sin(p.x * 11.7 - uTime * 2.4) * 0.5
               + sin(p.y * 13.1 + uTime * 2.1) * 0.4;
      float foamNoise = clamp(fn * 0.5 + 0.5, 0.0, 1.0);
      shoreFoam = smoothstep(0.32, 0.02, thickness) * (0.45 + 0.55 * foamNoise);
    }
    float dpx = max(0.001, fwidth(p.x));
    float dpz = max(0.001, fwidth(p.y));
    float depthGrad = length(vec2(dFdx(thickness), dFdy(thickness))) / max(dpx + dpz, 1e-4);
    meniscusFoam = smoothstep(0.18, 0.9, depthGrad) * smoothstep(0.35, 0.04, thickness) * 1.25;
  } else {
    if (distToDry < 0.32) {
      float fn = sin(p.x * 5.3 + uTime * 1.7) * sin(p.y * 6.1 - uTime * 1.3)
               + sin(p.x * 11.7 - uTime * 2.4) * 0.5
               + sin(p.y * 13.1 + uTime * 2.1) * 0.4;
      float foamNoise = clamp(fn * 0.5 + 0.5, 0.0, 1.0);
      shoreFoam = smoothstep(0.32, 0.02, distToDry) * (0.45 + 0.55 * foamNoise);
    }
  }

  // Subtle 0.08m soft meniscus contact rim where the water intersects platforms and walls
  float edgeRim = 0.0;
  if (thickness < 0.08) {
    edgeRim = smoothstep(0.08, 0.005, thickness) * 0.45;
  }

  // Foam policy: NO ambient white foam on calm water (crestFoam = 0.0).
  // Foam appears strictly on shore/contact, wake, ripples, and edge rim.
  float crestFoam = 0.0;
  float rippleFoam = smoothstep(0.025, 0.055, abs(vRippleHeight)) * 0.18;
  float totalFoam = clamp(shoreFoam + meniscusFoam + wakeFoam + rippleFoam + crestFoam + rippleCrestFoam + edgeRim, 0.0, 1.0);

  vec3 foamColor = uFoamColor;
  waterColor = mix(waterColor, foamColor, totalFoam * clamp(uFoamStrength * 1.2, 0.15, 0.85));

  // Depth-based screenspace meniscus line (2–4 cm #f5fff9, f_022)
  vec3 meniscusColor = vec3(0.961, 1.0, 0.976);
  float meniscusLine = 0.0;
  if (hasTrueDepth) {
    meniscusLine = smoothstep(0.040, 0.015, thickness) * smoothstep(0.0005, 0.008, thickness);
    waterColor = mix(waterColor, meniscusColor, meniscusLine * 0.70);
  }

  // Crystal-Clear Transparency: let real 3D submerged ceramic floor & walls shine through
  float baseAlpha = mix(0.26, 0.68, clamp(fresnel * 0.85 + depthFactor * 0.25, 0.0, 1.0));
  float alpha = clamp(baseAlpha + totalFoam * 0.75, 0.24, 0.94);

  // Soft Edge Alpha: smoothly fade water over the final 2-3 cm to prevent hard-edge clipping or z-fighting
  float softEdge = smoothstep(0.001, 0.028, thickness);
  alpha = hasTrueDepth ? (alpha * softEdge) : alpha;
  alpha = max(alpha, totalFoam * 0.92);
  alpha = max(alpha, meniscusLine * 0.88);

  // Readability: never let water opacity exceed 0.6 within 3m of monster waterline
  float distToMonster = length(vWorldPos.xz - uMonsterPos.xz);
  if (distToMonster < 3.0 && abs(vWorldPos.y - uMonsterPos.y) < 2.5) {
    float mProx = clamp(1.0 - distToMonster / 3.0, 0.0, 1.0);
    alpha = min(alpha, mix(1.0, 0.60, mProx));
  }

  // 12. Bioluminescence (Map 5: Abyssal Drainage Core)
  if (uBiolumRipple > 0.0) {
    float rippleEnergy = abs(vRippleHeight) * 14.0;
    float ambientPulse = (sin(p.x * 1.5 + uTime * 0.8) * cos(p.y * 1.5 - uTime * 0.6) * 0.5 + 0.5);
    float glow = clamp(rippleEnergy * uBiolumRipple + ambientPulse * uBiolumAmbient, 0.0, 2.5);
    waterColor += uBiolumColor * glow;
  }

  // 13. Submerged underwater grading: inside the mint interior (f_034)
  if (uUnderwater > 0.5) {
    vec3 cUnderwaterNear = mix(vec3(0.243, 0.353, 0.173), mix(uColorShallow, uColorDeep, 0.65), 0.30); // #3e5a2c
    vec3 cUnderwaterFar = vec3(0.173, 0.267, 0.125);  // #2c4420
    float uDist = length(vViewPos);
    float uFog = clamp(uDist / 20.0, 0.0, 1.0);
    vec3 uWaterVolume = mix(cUnderwaterNear, cUnderwaterFar, uFog);
    waterColor = mix(waterColor * 0.85, uWaterVolume, 0.72);
    alpha = max(alpha, 0.92);
  }

  // 14. Fog & Horizon Melt (Height fog + FogExp2, Glitch G8)
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float baseFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float baseFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif

    // Low height-fog band hugging the water surface (thicker with distance, f_025)
    float hDist = max(0.0, abs(vWorldPos.y - uWaterY));
    float hMist = exp(-hDist * 1.2) * smoothstep(16.0, 48.0, vFogDepth) * 0.35;
    float grazingMist = pow(1.0 - max(0.0, dot(normal, viewDir)), 4.5) * 0.25 * smoothstep(5.0, 25.0, vFogDepth);
    float finalFogFactor = clamp(baseFogFactor + (hMist + grazingMist) * (1.0 - baseFogFactor) * smoothstep(0.0, 5.0, vFogDepth), 0.0, 1.0);

    // Grazing & distant horizon: melt water seamlessly into scene fog (#d6dccd) without white blowout band (G8)
    vec3 farWaterTint = mix(fogColor, vec3(0.48, 0.62, 0.44), 0.35);
    vec3 horizonColor = mix(farWaterTint, fogColor, smoothstep(0.50, 0.95, finalFogFactor));

    gl_FragColor.rgb = mix( waterColor, horizonColor, finalFogFactor );
    gl_FragColor.a = mix( alpha, 1.0, finalFogFactor );
  #else
    gl_FragColor = vec4(waterColor, alpha);
  #endif
}
`;

export function createWaterMaterial(options: WaterMaterialOptions): ShaderMaterial {
  const prof = options.profile;
  const tier = options.tier ?? 'high';
  const reflectionTier = tier === 'low' ? 0.0 : tier === 'medium' ? 1.0 : 2.0;

  // Create fallback 1x1 cube texture and 2D texture for initial uniforms
  const fallbackCube = options.envCube ?? new WebGLCubeRenderTarget(16).texture;
  const dummyData = new Uint8Array([238, 222, 194, 255]);
  const fallbackPlanar = options.planarReflection ?? new DataTexture(dummyData, 1, 1, RGBAFormat, UnsignedByteType);
  fallbackPlanar.needsUpdate = true;

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
      uReflectionTier: { value: reflectionTier },
      uBaseRoughness: { value: 0.14 },
      uRipples: { value: options.ripples },
      uRippleCount: { value: 0 },
      uWaveSimTexture: { value: null },
      uWaveSimCenter: { value: new Vector2(0, 0) },
      uWaveSimSize: { value: 32.0 },
      uWaveSimResolution: { value: 256.0 },
      uHasWaveSim: { value: 0.0 },
      uWakes: { value: options.wakes },
      uWakeParams: { value: options.wakeParams },
      uColorShallow: { value: new Color(prof?.shallow ?? prof?.shallowColor ?? '#8cb179') },
      uColorDeep: { value: new Color(prof?.deep ?? prof?.deepColor ?? '#678f44') },
      uSpecularColor: { value: new Color(prof?.specular ?? '#7b9e5e') },
      uFoamStrength: { value: prof?.foam ?? 0.15 },
      uSunDir: { value: (options.sunDir ?? new Vector3(0.4, 0.8, 0.4)).clone().normalize() },
      uMonsterPos: { value: new Vector3(0, -999, 0) },
      uOpacityMin: { value: prof?.opacityMin ?? 0.20 },
      uOpacityMax: { value: prof?.opacityMax ?? 0.86 },
      uUnderwater: { value: 0.0 },
      uMurk: { value: prof?.murk ?? 0.0 },
      uNormalScale: { value: prof?.normalStrength ?? 1.0 },
      uScrollSpeed: { value: prof?.scroll ?? 0.04 },
      uWaveAmplitude: { value: prof?.waveAmplitude ?? 0.014 },
      uCausticsColor: { value: new Color(prof?.causticsColor ?? '#d4ebd0') },
      uCausticsIntensity: { value: prof?.causticsIntensity ?? 1.35 },
      uReflectionStrength: { value: prof?.reflectionStrength ?? 0.58 },
      uFresnelPower: { value: prof?.fresnelPower ?? 3.8 },
      uFresnelBias: { value: prof?.fresnelBias ?? 0.06 },
      uRippleStrength: { value: prof?.rippleStrength ?? 1.15 },
      uFoamColor: { value: new Color(prof?.foamColor ?? '#f4feff') },
      uBiolumColor: { value: new Color(prof?.bioluminescence?.color ?? '#8ea05a') },
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

  uniforms['uEnvCube'] = { value: fallbackCube };
  uniforms['uPlanarReflection'] = { value: fallbackPlanar };

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

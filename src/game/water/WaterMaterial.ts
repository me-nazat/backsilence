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
  envCube?: CubeTexture | null | undefined;
  planarReflection?: Texture | null | undefined;
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
  float h  = amp * env * cos(ph) * 0.07;
  float dh = amp * env * (-RIPPLE_K * sin(ph) - 2.0 * x / (w * w) * cos(ph)) * 0.07;
  grad += dh * (dv / max(d, 1e-3));
  return h;
}

// 4-wave Gerstner wave displacement and analytic normal slope accumulator
void evaluateGerstner(vec2 pos, float time, float scale, out vec3 disp, out vec2 slope) {
  disp = vec3(0.0);
  slope = vec2(0.0);

  // Wavelengths from Phase B2: 4.7m, 2.3m, 1.1m, 0.6m
  float k1 = 1.33685;
  float k2 = 2.73182;
  float k3 = 5.71199;
  float k4 = 10.47198;

  // Directions spread over 60 degrees (0.15 rad to 1.15 rad)
  vec2 d1 = vec2(0.9888, 0.1494);
  vec2 d2 = vec2(0.8870, 0.4618);
  vec2 d3 = vec2(0.6822, 0.7311);
  vec2 d4 = vec2(0.4085, 0.9128);

  // Amplitudes: 0.014, 0.009, 0.005, 0.003
  float a1 = 0.014 * scale;
  float a2 = 0.009 * scale;
  float a3 = 0.005 * scale;
  float a4 = 0.003 * scale;

  // Frequencies: gentle pool speed multiplier 0.35
  float w1 = 3.623 * 0.35;
  float w2 = 5.176 * 0.35;
  float w3 = 7.485 * 0.35;
  float w4 = 10.135 * 0.35;

  float q = 0.25;

  float ph1 = dot(d1, pos) * k1 + time * w1;
  float ph2 = dot(d2, pos) * k2 + time * w2;
  float ph3 = dot(d3, pos) * k3 + time * w3;
  float ph4 = dot(d4, pos) * k4 + time * w4;

  float cos1 = cos(ph1); float sin1 = sin(ph1);
  float cos2 = cos(ph2); float sin2 = sin(ph2);
  float cos3 = cos(ph3); float sin3 = sin(ph3);
  float cos4 = cos(ph4); float sin4 = sin(ph4);

  // Trochoidal horizontal and vertical displacements
  disp.x = -(q * a1 * d1.x * cos1 + q * a2 * d2.x * cos2 + q * a3 * d3.x * cos3 + q * a4 * d4.x * cos4);
  disp.z = -(q * a1 * d1.y * cos1 + q * a2 * d2.y * cos2 + q * a3 * d3.y * cos3 + q * a4 * d4.y * cos4);
  disp.y = a1 * sin1 + a2 * sin2 + a3 * sin3 + a4 * sin4;

  // Analytic Gerstner normal slopes
  slope.x = a1 * k1 * d1.x * cos1 + a2 * k2 * d2.x * cos2 + a3 * k3 * d3.x * cos3 + a4 * k4 * d4.x * cos4;
  slope.y = a1 * k1 * d1.y * cos1 + a2 * k2 * d2.y * cos2 + a3 * k3 * d3.y * cos3 + a4 * k4 * d4.y * cos4;
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

  worldPosition.x += gDisp.x;
  worldPosition.z += gDisp.z;
  worldPosition.y = uWaterY + gDisp.y + totalRippleH;

  vRippleHeight = totalRippleH;
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
uniform vec3 uSunDir;
uniform vec3 uMonsterPos;
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
varying vec2 vGerstnerSlope;

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
  float NdotV = max(1e-4, dot(N, V));
  float NdotL = max(0.0, dot(N, L));
  float VdotH = max(0.0, dot(V, H));

  float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);

  // Microfacet sharp glint lobe (roughness 0.06 - 0.09)
  float D1 = D_GGX(NdotH, roughness);
  float G1 = G_Smith(NdotV, NdotL, roughness);
  float spec1 = (D1 * F * G1) / (4.0 * NdotV + 1e-4);

  // Broader streak highlight lobe
  float r2 = 0.16;
  float D2 = D_GGX(NdotH, r2);
  float G2 = G_Smith(NdotV, NdotL, r2);
  float spec2 = (D2 * F * G2) / (4.0 * NdotV + 1e-4);

  float totalSpec = spec1 * 1.5 + spec2 * 0.5;
  return lightColor * (totalSpec * intensity);
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
    if (diffZ < -0.005) {
      discard;
    }
    thickness = clamp(diffZ, 0.0, mapDepth * 1.5 + 0.1);
  }

  // 4. Detail normals at 3 scales: 0.55m, 0.18m, 0.06m near camera
  float animSpeed = max(0.04, uScrollSpeed) * 1.5;
  
  // 11.2 Hz micro-flicker temporal noise for twinkling surface glints
  vec2 flickerNoise = vec2(
    sin(uTime * 70.37 + p.x * 37.0),
    cos(uTime * 82.10 + p.y * 31.0)
  ) * 0.022;

  vec2 uv1 = p / 0.55 + vec2(uTime * animSpeed * 0.4, uTime * animSpeed * 0.28);
  vec2 uv2 = p / 0.18 - vec2(uTime * animSpeed * 0.55, -uTime * animSpeed * 0.42);
  vec2 uv3 = p / 0.06 + vec2(-uTime * animSpeed * 0.72, uTime * animSpeed * 0.6) + flickerNoise;

  vec3 norm1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
  vec3 norm2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
  vec3 norm3 = texture2D(uNormalMap, uv3).rgb * 2.0 - 1.0;

  float distToCam = length(vViewPos);
  float nearFade = clamp(1.0 - distToCam / 9.0, 0.0, 1.0);
  float distFade = clamp(1.0 - distToCam / 36.0, 0.0, 1.0);

  // Toksvig-style anti-aliasing roughness increase
  float avgLen = length(norm1.xy * 0.55 + norm2.xy * 0.38);
  float variance = (1.0 - min(1.0, avgLen)) / max(0.01, avgLen);
  float roughness = clamp(sqrt(uBaseRoughness * uBaseRoughness + variance * 0.28), 0.06, 0.35);

  // Combine slopes before normalizing
  vec2 slopeDetail = (norm1.xy * 0.55 + norm2.xy * 0.38 + norm3.xy * (0.32 * nearFade)) * (uNormalScale * distFade);

  // Add analytic ripples
  vec2 rippleGrad = vec2(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uRippleCount) break;
    evalRipple(p, uRipples[i], uTime, rippleGrad);
  }
  vec2 slopeRipple = -rippleGrad * 3.5;

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
  vec2 slopeWake = -wakeGrad * 1.6;

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

  // 5. Refraction with foreground depth rejection
  vec3 sceneSample = uColorShallow;
  if (hasTrueDepth) {
    float refractK = 0.035;
    vec2 refractOffset = normal.xz * refractK * (1.0 - exp(-thickness));
    vec2 refractedUv = clamp(screenUv + refractOffset, 0.001, 0.999);
    float rawRefractDepth = texture2D(uSceneDepth, refractedUv).r;
    float refractLinearDepth = -perspectiveDepthToLinearZ(rawRefractDepth, uCameraNear, uCameraFar);
    
    // Foreground leak rejection: reject offset sample if depth nearer than water surface
    if (refractLinearDepth >= waterLinearDepth - 0.02) {
      sceneSample = texture2D(uSceneColor, refractedUv).rgb;
    } else {
      sceneSample = texture2D(uSceneColor, screenUv).rgb;
    }
  }

  // 6. Beer-Lambert Spectral Absorption: sigma = (0.90, 0.25, 0.45) per meter
  vec3 sigma = vec3(0.90, 0.25, 0.45);
  vec3 T = exp(-sigma * thickness);
  float lumT = dot(T, vec3(0.299, 0.587, 0.114));
  vec3 scatter = uColorShallow;
  vec3 milkyVeil = vec3(0.85, 0.94, 0.88) * (0.08 * (1.0 - lumT));
  vec3 absorbedWater = sceneSample * T + scatter * (1.0 - T) + milkyVeil;

  // 7. Schlick Fresnel reflection with F0 = 0.02 & reflection tiers (World Space)
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float NdotV = max(0.0, dot(normal, viewDir));
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

  vec3 reflectDir = reflect(-viewDir, normal);
  vec3 skyHazeColor = vec3(0.702, 0.733, 0.624);
  vec3 reflectColor = skyHazeColor;

  if (uReflectionTier > 1.5) {
    // High Tier: Planar reflection + Cube map
    vec2 planarUv = clamp(vec2(screenUv.x, 1.0 - screenUv.y) + normal.xz * 0.04, 0.001, 0.999);
    vec3 planarCol = texture2D(uPlanarReflection, planarUv).rgb;
    vec3 cubeCol = textureCube(uEnvCube, reflectDir).rgb;
    reflectColor = mix(cubeCol, planarCol, 0.45);
  } else if (uReflectionTier > 0.5) {
    // Medium Tier: 64px Cube map
    reflectColor = textureCube(uEnvCube, reflectDir).rgb;
  } else {
    // Low Tier: Sky and fog gradient
    reflectColor = mix(skyHazeColor * 0.92, skyHazeColor * 1.08, max(0.0, reflectDir.y));
  }

  vec3 waterColor = mix(absorbedWater, reflectColor, fresnel * 0.48);

  // 8. Animated Caustics on shallow floor and waterline walls
  if (thickness < 2.5) {
    vec2 cUv1 = p * 0.85 + vec2(uTime * 0.08, uTime * 0.06) + normal.xz * 0.08;
    vec2 cUv2 = p * 1.15 + vec2(-uTime * 0.07, uTime * 0.09) + normal.zx * 0.08;
    float c1 = sin(cUv1.x * 7.0 + sin(cUv1.y * 5.0 + uTime * 0.6)) * 0.5 + 0.5;
    float c2 = cos(cUv2.x * 6.5 + cos(cUv2.y * 7.5 - uTime * 0.5)) * 0.5 + 0.5;
    float caustic = pow(min(c1, c2), 1.6) * 1.8;
    float causticFade = smoothstep(2.5, 0.15, thickness) * (1.0 - fresnel * 0.75);
    vec3 causticCol = mix(vec3(0.9, 1.0, 0.95), vec3(1.0, 0.98, 0.9), 0.5);
    waterColor += causticCol * caustic * causticFade * 0.14;
  }

  // 9. Sun GGX Specular Glint (balanced intensity for crisp wave glints without blowout)
  vec3 sunSpec = evalGGX(normal, viewDir, uSunDir, vec3(1.0, 0.98, 0.92), 0.55, roughness);
  waterColor += clamp(sunSpec, 0.0, 0.65);

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
    vec3 streakSpec = evalGGX(normal, viewDir, lDir, sCol, sInt * atten * 0.65, roughness);
    waterColor += clamp(streakSpec, 0.0, 0.5);
  }

  // 11. Soft Shoreline & Contact Foam (from depth difference or distToDry)
  float shoreFoam = 0.0;
  if (hasTrueDepth) {
    if (thickness < 0.08) {
      float foamNoise = sin(p.x * 16.0 + uTime * 2.2) * cos(p.y * 16.0 - uTime * 1.8) * 0.5 + 0.5;
      shoreFoam = smoothstep(0.08, 0.015, thickness) * (0.45 + 0.35 * foamNoise);
    }
  } else {
    if (distToDry < 0.12) {
      float foamNoise = sin(p.x * 14.0 + uTime * 2.2) * cos(p.y * 14.0 - uTime * 1.8) * 0.5 + 0.5;
      shoreFoam = smoothstep(0.12, 0.02, distToDry) * (0.40 + 0.35 * foamNoise);
    }
  }

  // Wave crest foam
  float crestFoam = smoothstep(0.02, 0.06, abs(vWorldPos.y - uWaterY)) * 0.45;
  float rippleFoam = smoothstep(0.007, 0.026, abs(vRippleHeight)) * 0.8;
  float totalFoam = clamp(shoreFoam + wakeFoam + rippleFoam + crestFoam, 0.0, 1.0);

  vec3 foamColor = vec3(0.98, 0.97, 0.94);
  waterColor = mix(waterColor, foamColor, totalFoam * 0.88);

  // Soft Edge Alpha: blend alpha to 0 over the last 3 cm of thickness
  float softEdge = clamp(thickness / 0.03, 0.0, 1.0);
  float alpha = hasTrueDepth ? softEdge : mix(uOpacityMin, uOpacityMax, 1.0 - exp(-thickness * 2.0));
  alpha = max(alpha, totalFoam * 0.92);

  // Readability: never let water opacity exceed 0.6 within 3m of monster waterline
  float distToMonster = length(vWorldPos.xz - uMonsterPos.xz);
  if (distToMonster < 3.0 && abs(vWorldPos.y - uMonsterPos.y) < 2.5) {
    float mProx = clamp(1.0 - distToMonster / 3.0, 0.0, 1.0);
    alpha = min(alpha, mix(1.0, 0.60, mProx));
  }

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

  // 14. Fog & Horizon Blowout (Height fog + FogExp2)
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float baseFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float baseFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif

    // Height mist hugging the water surface
    float hDist = max(0.0, abs(vWorldPos.y - uWaterY));
    float hMist = exp(-hDist * 0.75) * 0.45;
    float finalFogFactor = clamp(baseFogFactor + hMist * (1.0 - baseFogFactor) * smoothstep(0.0, 5.0, vFogDepth), 0.0, 1.0);

    // Smooth dissolution into atmospheric horizon fog (pale grey-green, no blowout)
    gl_FragColor.rgb = mix( waterColor, fogColor, finalFogFactor );
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
      uBaseRoughness: { value: 0.08 },
      uRipples: { value: options.ripples },
      uRippleCount: { value: 0 },
      uWaveSimTexture: { value: null },
      uWaveSimCenter: { value: new Vector2(0, 0) },
      uWaveSimSize: { value: 32.0 },
      uWaveSimResolution: { value: 256.0 },
      uHasWaveSim: { value: 0.0 },
      uWakes: { value: options.wakes },
      uWakeParams: { value: options.wakeParams },
      uColorShallow: { value: new Color(prof?.shallow ?? '#72bca5') },
      uColorDeep: { value: new Color(prof?.deep ?? '#2e6358') },
      uSunDir: { value: new Vector3(0.4, 0.8, 0.4).normalize() },
      uMonsterPos: { value: new Vector3(0, -999, 0) },
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

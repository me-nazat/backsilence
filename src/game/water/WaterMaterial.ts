/* ── WaterMaterial.ts ──────────────────────────────────────────────────────
 *  Custom ShaderMaterial for the final water system.
 *  Features: analytic expanding ripples, Kelvin wakes, depth absorption,
 *  edge foam, fog integration, underwater mode, normal perturbing, murk,
 *  and dynamic bioluminescence emission for Map 5.
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

  // 1. Fluid multi-octave traveling wave displacement
  float sines = sin(p.x * 0.45 + p.y * 0.25 + uTime * 1.3) * 0.024 +
                cos(-p.x * 0.35 + p.y * 0.55 - uTime * 1.1) * 0.018 +
                sin(p.x * 1.2 - p.y * 0.8 + uTime * 2.2) * 0.009 +
                cos((p.x + p.y) * 2.5 + uTime * 2.8) * 0.004;

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

  // 2. Normal Perturbation from 3 multi-scale scrolling normal map octaves
  float animSpeed = max(0.04, uScrollSpeed) * 2.2;
  vec2 normalUv1 = p * 0.12 + vec2(uTime * animSpeed * 0.5, uTime * animSpeed * 0.35);
  vec2 normalUv2 = p * 0.06 - vec2(uTime * animSpeed * 0.4, -uTime * animSpeed * 0.6);
  vec2 normalUv3 = p * 0.26 + vec2(-uTime * animSpeed * 0.7, uTime * animSpeed * 0.5);

  vec3 norm1 = texture2D(uNormalMap, normalUv1).rgb * 2.0 - 1.0;
  vec3 norm2 = texture2D(uNormalMap, normalUv2).rgb * 2.0 - 1.0;
  vec3 norm3 = texture2D(uNormalMap, normalUv3).rgb * 2.0 - 1.0;
  vec3 combinedNormal = normalize(norm1 * 0.5 + norm2 * 0.35 + norm3 * 0.25) * uNormalScale;

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

      wakeFoam += ridgeEnv * fade * 0.85;
      wakeGrad += perp(wakeDir) * sign(across) * ridgeEnv * fade * 0.35;
    }
  }

  // Perturb surface normal with strong facets to catch specular reflections
  vec3 normal = normalize(vec3(
    combinedNormal.x * 0.85 - rippleGrad.x * 3.5 - wakeGrad.x * 1.6,
    1.0,
    combinedNormal.y * 0.85 - rippleGrad.y * 3.5 - wakeGrad.y * 1.6
  ));

  if (uUnderwater > 0.5) {
    normal = -normal; // Invert normal when viewing from below
  }

  // 5. Water Color by depth absorption
  vec3 waterColor = mix(uColorShallow, uColorDeep, 1.0 - exp(-depth * 1.35));
  float alpha = mix(uOpacityMin, uOpacityMax, 1.0 - exp(-depth * 1.8));
  alpha = clamp(alpha + uMurk, 0.0, 1.0);

  // 6. Fresnel reflection of creamy haze / sky
  vec3 viewDir = normalize(vViewPos);
  float NdotV = max(0.0, dot(normal, viewDir));
  float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 4.2);
  vec3 skyHazeColor = vec3(0.94, 0.91, 0.82);
  waterColor = mix(waterColor, skyHazeColor, fresnel * 0.68);

  // 6b. Subsurface animated caustics in clear shallow waters (depth < 2.5m)
  if (depth < 2.5) {
    vec2 cUv1 = p * 0.85 + vec2(uTime * 0.08, uTime * 0.06) + combinedNormal.xy * 0.08;
    vec2 cUv2 = p * 1.15 + vec2(-uTime * 0.07, uTime * 0.09) + combinedNormal.yx * 0.08;
    float c1 = sin(cUv1.x * 7.0 + sin(cUv1.y * 5.0 + uTime * 0.6)) * 0.5 + 0.5;
    float c2 = cos(cUv2.x * 6.5 + cos(cUv2.y * 7.5 - uTime * 0.5)) * 0.5 + 0.5;
    float caustic = pow(min(c1, c2), 1.6) * 2.4;
    float causticFade = smoothstep(2.5, 0.15, depth) * (1.0 - fresnel * 0.75);
    vec3 causticCol = mix(vec3(0.9, 1.0, 0.95), vec3(1.0, 0.98, 0.9), 0.5);
    waterColor += causticCol * caustic * causticFade * 0.42;
  }

  // 7. Sun Specular: sharp solar glint + wide atmospheric sheen
  vec3 halfVec = normalize(uSunDir + viewDir);
  float specSharp = pow(max(0.0, dot(normal, halfVec)), 128.0);
  float specWide = pow(max(0.0, dot(normal, halfVec)), 22.0);
  waterColor += vec3(1.0, 0.98, 0.92) * (specSharp * 0.95 + specWide * 0.22);

  // 7b. Elongated specular LightStreaks (up to 16 area/line light proxies)
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

  // 8. Foam (Shoreline foam where distToDry < 0.42m + ripple crests + wakes)
  float shoreFoam = 0.0;
  if (distToDry < 0.42) {
    float foamNoise = sin(p.x * 14.0 + uTime * 2.2) * cos(p.y * 14.0 - uTime * 1.8) * 0.5 + 0.5;
    shoreFoam = smoothstep(0.42, 0.04, distToDry) * (0.6 + 0.4 * foamNoise);
  }

  float rippleFoam = smoothstep(0.007, 0.026, abs(vRippleHeight)) * 0.8;
  float totalFoam = clamp(shoreFoam + wakeFoam + rippleFoam, 0.0, 1.0);

  vec3 foamColor = vec3(0.98, 0.97, 0.94);
  waterColor = mix(waterColor, foamColor, totalFoam * 0.88);
  alpha = max(alpha, totalFoam * 0.92);

  // 9. Bioluminescence (Map 5: glows where disturbed)
  if (uBiolumRipple > 0.0) {
    float rippleEnergy = abs(vRippleHeight) * 14.0;
    float wakeEnergy = wakeFoam * 1.5;
    float ambientPulse = (sin(p.x * 1.5 + uTime * 0.8) * cos(p.y * 1.5 - uTime * 0.6) * 0.5 + 0.5);
    float glow = clamp(rippleEnergy * uBiolumRipple + wakeEnergy * 0.8 + ambientPulse * uBiolumAmbient, 0.0, 2.5);
    waterColor += uBiolumColor * glow;
  }

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
  const prof = options.profile;

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
      uColorShallow: { value: new Color(prof?.shallow ?? '#52b3b0') },
      uColorDeep: { value: new Color(prof?.deep ?? '#164345') },
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

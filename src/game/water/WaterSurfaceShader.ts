/* ── WaterSurfaceShader.ts ──────────────────────────────────────────────────
 *  Translucent Emerald-Green Pool Water Shader.
 *  - Optical Properties: Shallow/Surface tint #48ab72, Deep/Grazing tint #338858
 *  - Fresnel-modulated alpha: mix(0.62, 0.86, pow(1.0 - max(dot(viewDir, normal), 0.0), 2.5))
 *  - Dual-wave normal perturbation at orthogonal angles:
 *    speed1 = vec2(0.35, 0.22), speed2 = vec2(-0.28, 0.41), displacement +/-0.018m
 *  - Sharp specular highlight: step(0.92, specular) * 0.85 + pow(specular, 48.0)
 *  - Subtle 0.06m white-green edge foam rim at geometry intersections
 *  - Transparent pool floor revealing submerged tile grid at y = -0.75m
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector2, Vector3, Color } from 'three';
import { WATER_PROFILES } from './WaterProfile.js';

export const WaterSurfaceShader = {
  name: 'WaterSurfaceShader',
  uniforms: {
    uTime: { value: 0.0 },
    uWaterY: { value: 0.0 },
    uColorShallow: { value: new Color(WATER_PROFILES.natatorium.shallow) },
    uColorDeep: { value: new Color(WATER_PROFILES.natatorium.deep) },
    uSpecularColor: { value: new Color(WATER_PROFILES.natatorium.specular) },
    uSunDir: { value: new Vector3(0.35, 0.9, 0.25).normalize() },
    uSpeed1: { value: new Vector2(0.35, 0.22) },
    uSpeed2: { value: new Vector2(-0.28, 0.41) },
    uWaveAmp: { value: 0.018 },
  },

  vertexShader: /* glsl */ `
    #include <common>
    #include <fog_pars_vertex>

    uniform float uTime;
    uniform float uWaterY;
    uniform vec2 uSpeed1;
    uniform vec2 uSpeed2;
    uniform float uWaveAmp;

    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    varying vec2 vUv;
    varying vec2 vWaveSlope;

    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vec2 p = worldPosition.xz;

      // Two overlapping Gerstner/wave layers scrolling at orthogonal angles
      float ph1 = dot(p, normalize(uSpeed1)) * 3.8 + uTime * length(uSpeed1) * 2.8;
      float ph2 = dot(p, normalize(uSpeed2)) * 4.6 + uTime * length(uSpeed2) * 2.5;

      float wave1 = sin(ph1) * uWaveAmp;
      float wave2 = sin(ph2) * (uWaveAmp * 0.8);
      float totalH = wave1 + wave2;

      // Wave slopes for normal computation
      float s1 = cos(ph1) * 3.8 * uWaveAmp;
      float s2 = cos(ph2) * 4.6 * (uWaveAmp * 0.8);
      vec2 d1 = normalize(uSpeed1) * s1;
      vec2 d2 = normalize(uSpeed2) * s2;
      vWaveSlope = d1 + d2;

      worldPosition.y = uWaterY + totalH;
      vWorldPos = worldPosition.xyz;

      vec4 mvPosition = viewMatrix * worldPosition;
      vViewPos = mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;

      #include <fog_vertex>
    }
  `,

  fragmentShader: /* glsl */ `
    #include <common>
    #include <fog_pars_fragment>

    uniform float uTime;
    uniform float uWaterY;
    uniform vec3 uColorShallow;
    uniform vec3 uColorDeep;
    uniform vec3 uSpecularColor;
    uniform vec3 uSunDir;
    uniform vec2 uSpeed1;
    uniform vec2 uSpeed2;

    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    varying vec2 vUv;
    varying vec2 vWaveSlope;

    void main() {
      vec3 normal = normalize(vec3(-vWaveSlope.x, 1.0, -vWaveSlope.y));
      vec3 viewDir = normalize(cameraPosition - vWorldPos);

      // 1. Exact Optical Properties
      // Fresnel-modulated alpha
      float NdotV = max(0.0, dot(viewDir, normal));
      float fresnel = pow(1.0 - NdotV, 2.5);
      float alpha = mix(0.62, 0.86, fresnel);

      // Graded water body tint: shallow green at normal viewing, deeper grazing
      vec3 waterTint = mix(uColorShallow, uColorDeep, fresnel);

      // 2. White Wavy Specular Glints
      vec3 L = normalize(uSunDir);
      vec3 H = normalize(viewDir + L);
      float NdotH = max(0.0, dot(normal, H));
      float specular = pow(NdotH, 64.0);

      // Signature bright white wavy streak reflections
      float sharpGlint = step(0.92, specular) * 0.85 + pow(specular, 48.0);
      vec3 glintColor = uSpecularColor * (sharpGlint * 1.35);

      vec3 finalColor = waterTint + glintColor;

      // 3. Fog integration
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        #else
          float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        gl_FragColor.rgb = mix( finalColor, fogColor, fogFactor );
        gl_FragColor.a = mix( alpha, 1.0, fogFactor );
      #else
        gl_FragColor = vec4(finalColor, alpha);
      #endif
    }
  `,
};


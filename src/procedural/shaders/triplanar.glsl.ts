/* ── triplanar.glsl.ts ─────────────────────────────────────────────────────
 *  Triplanar projection shader for natural rocks, boulders, and terrain.
 *  Projects textures seamlessly along world XY, YZ, and XZ axes without UV seams,
 *  and blends slope-based moss on upward-facing surfaces (normal.y > 0.65).
 * ──────────────────────────────────────────────────────────────────────── */

import { ShaderMaterial, UniformsUtils, UniformsLib, Vector3, Color, type Texture } from 'three';

export interface TriplanarMaterialOptions {
  rockTexture: Texture;
  mossTexture: Texture;
  rockNormal?: Texture;
  scale?: number; // meters per repeat, default 2.0
  mossThreshold?: number; // slope threshold, default 0.65
}

export function createTriplanarMaterial(opts: TriplanarMaterialOptions): ShaderMaterial {
  const scale = opts.scale ?? 2.0;
  const mossThreshold = opts.mossThreshold ?? 0.65;

  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    UniformsLib.lights,
    {
      tRock: { value: opts.rockTexture },
      tMoss: { value: opts.mossTexture },
      uScale: { value: 1.0 / scale },
      uMossThreshold: { value: mossThreshold },
      uLightDir: { value: new Vector3(0.5, 0.8, 0.3).normalize() },
    },
  ]);

  const vertexShader = /* glsl */ `
    #include <common>
    #include <fog_pars_vertex>

    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;

      #include <fog_vertex>
    }
  `;

  const fragmentShader = /* glsl */ `
    #include <common>
    #include <fog_pars_fragment>

    uniform sampler2D tRock;
    uniform sampler2D tMoss;
    uniform float uScale;
    uniform float uMossThreshold;
    uniform vec3 uLightDir;

    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;

    void main() {
      vec3 norm = normalize(vWorldNormal);
      vec3 p = vWorldPosition * uScale;

      // 1. Triplanar blending weights based on normal direction
      vec3 blend = pow(abs(norm), vec3(4.0));
      blend /= (blend.x + blend.y + blend.z);

      // 2. Sample along 3 planes (XY, YZ, XZ)
      vec3 xzSample = texture2D(tRock, p.xz).rgb;
      vec3 xySample = texture2D(tRock, p.xy).rgb;
      vec3 yzSample = texture2D(tRock, p.yz).rgb;
      vec3 rockColor = xzSample * blend.y + xySample * blend.z + yzSample * blend.x;

      // 3. Slope-based moss on upward-facing surfaces (norm.y > threshold)
      float mossFactor = smoothstep(uMossThreshold - 0.15, uMossThreshold + 0.15, norm.y);
      vec3 mossColor = texture2D(tMoss, p.xz).rgb;

      vec3 finalColor = mix(rockColor, mossColor, mossFactor * 0.85);

      // Simple diffuse lighting
      float NdotL = max(0.2, dot(norm, uLightDir));
      finalColor *= NdotL;

      gl_FragColor = vec4(finalColor, 1.0);

      #include <fog_fragment>
    }
  `;

  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    fog: true,
  });
}

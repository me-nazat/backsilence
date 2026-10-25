/* ── ParallaxOcclusion.ts ────────────────────────────────────────────────
 *  Parallax Occlusion Mapping (POM) on tile surfaces within 6 m (Medium and High tiers).
 *  Raymarches into procedural tile height map to create deep physical grout lines.
 *  Fades smoothly to standard normal mapping beyond 6 m to avoid popping and save GPU cycles.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MeshStandardMaterial, Texture } from 'three';

export interface ParallaxOcclusionOptions {
  heightMap: Texture;
  scale?: number;         // Height displacement scale (default: 0.025)
  maxDistance?: number;   // Max distance in meters before fading to 0 (default: 6.0)
  minDistance?: number;   // Distance at which full POM applies (default: 4.5)
}

/**
 * Injects Parallax Occlusion Mapping into a MeshStandardMaterial shader.
 */
export function applyParallaxOcclusion(
  material: MeshStandardMaterial,
  options: ParallaxOcclusionOptions,
): void {
  const scale = options.scale ?? 0.025;
  const maxDistance = options.maxDistance ?? 6.0;
  const minDistance = options.minDistance ?? 4.5;

  if ((material as unknown as { __pomApplied?: boolean }).__pomApplied) {
    return;
  }
  (material as unknown as { __pomApplied?: boolean }).__pomApplied = true;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const previousOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer);

    // 1. Add view position varying & height map uniform
    shader.uniforms['uPomHeightMap'] = { value: options.heightMap };
    shader.uniforms['uPomScale'] = { value: scale };
    shader.uniforms['uPomMaxDist'] = { value: maxDistance };
    shader.uniforms['uPomMinDist'] = { value: minDistance };

    // Inject varying in vertex shader
    if (!shader.vertexShader.includes('vWorldPositionForPOM')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vWorldPositionForPOM;
        `,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vWorldPositionForPOM = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );
    }

    if (!shader.fragmentShader.includes('uPomHeightMap')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vWorldPositionForPOM;
        uniform sampler2D uPomHeightMap;
        uniform float uPomScale;
        uniform float uPomMaxDist;
        uniform float uPomMinDist;

        // Approximate tangent-space parallax raymarching using screen derivatives
        vec2 getParallaxUv(vec2 uv, vec3 viewDir, float distToCamera) {
          if (distToCamera >= uPomMaxDist) return uv;
          float fade = 1.0 - smoothstep(uPomMinDist, uPomMaxDist, distToCamera);
          if (fade <= 0.001) return uv;

          // Compute surface derivatives for tangent reconstruction
          vec3 dPdx = dFdx(vWorldPositionForPOM);
          vec3 dPdy = dFdy(vWorldPositionForPOM);
          vec2 dUvdx = dFdx(uv);
          vec2 dUvdy = dFdy(uv);

          // Gram-Schmidt orthogonalization
          vec3 N = normalize(cross(dPdx, dPdy));
          vec3 T = normalize(dPdx * dUvdy.y - dPdy * dUvdx.y);
          vec3 B = normalize(cross(N, T));

          // Transform view direction into tangent space
          vec3 V_ts = normalize(vec3(dot(viewDir, T), dot(viewDir, B), dot(viewDir, N)));
          if (abs(V_ts.z) < 0.01) return uv;

          // Steep parallax mapping with 8 linear steps
          const float numLayers = 8.0;
          float layerDepth = 1.0 / numLayers;
          float currentLayerDepth = 0.0;
          vec2 P = (V_ts.xy / V_ts.z) * (uPomScale * fade);
          vec2 deltaTexCoords = P / numLayers;

          vec2 currentTexCoords = uv;
          float currentDepthMapValue = 1.0 - texture2D(uPomHeightMap, currentTexCoords).r;

          for (int i = 0; i < 8; i++) {
            if (currentLayerDepth >= currentDepthMapValue) break;
            currentTexCoords -= deltaTexCoords;
            currentDepthMapValue = 1.0 - texture2D(uPomHeightMap, currentTexCoords).r;
            currentLayerDepth += layerDepth;
          }

          // Parallax Occlusion interpolation
          vec2 prevTexCoords = currentTexCoords + deltaTexCoords;
          float afterDepth = currentDepthMapValue - currentLayerDepth;
          float beforeDepth = (1.0 - texture2D(uPomHeightMap, prevTexCoords).r) - currentLayerDepth + layerDepth;
          float weight = afterDepth / max(0.0001, (afterDepth - beforeDepth));
          return prevTexCoords * weight + currentTexCoords * (1.0 - weight);
        }
        `,
      );

      // Inject UV perturbation right before map_fragment sampling
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <uv_fragment>',
        /* glsl */ `
        #include <uv_fragment>
        #if defined( USE_UV )
          float pomDist = length(vWorldPositionForPOM - cameraPosition);
          vec3 pomViewDir = normalize(cameraPosition - vWorldPositionForPOM);
          vUv = getParallaxUv(vUv, pomViewDir, pomDist);
        #endif
        `,
      );
    }
  };

  material.needsUpdate = true;
}

/* ── HeightFog.ts ────────────────────────────────────────────────────────
 *  Custom height-dependent atmospheric mist hugging the water plane on top of FogExp2.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Material } from 'three';

export interface HeightFogOptions {
  waterY?: number;
  falloff?: number; // meters decay scale (default 0.75m)
  density?: number; // max added density at water surface (default 0.45)
}

/**
 * Patches a Three.js material with height-fog shader chunk.
 */
export function applyHeightFog(material: Material, options: HeightFogOptions = {}): void {
  const waterY = options.waterY ?? 0.0;
  const falloff = options.falloff ?? 0.75;
  const density = options.density ?? 0.45;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const prevCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    prevCompile?.(shader, renderer);

    if (!shader.vertexShader.includes('vWorldPosForHeightFog')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vWorldPosForHeightFog;
        `,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vWorldPosForHeightFog = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );
    }

    shader.uniforms['uHeightFogBaseY'] = { value: waterY };
    shader.uniforms['uHeightFogFalloff'] = { value: falloff };
    shader.uniforms['uHeightFogDensity'] = { value: density };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      /* glsl */ `
      #include <common>
      varying vec3 vWorldPosForHeightFog;
      uniform float uHeightFogBaseY;
      uniform float uHeightFogFalloff;
      uniform float uHeightFogDensity;
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      /* glsl */ `
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float baseFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        #else
          float baseFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
        #endif

        // Height mist hugging the water surface
        float hDist = max(0.0, abs(vWorldPosForHeightFog.y - uHeightFogBaseY));
        float hMist = exp(-hDist * uHeightFogFalloff) * uHeightFogDensity;
        float finalFogFactor = clamp(baseFogFactor + hMist * (1.0 - baseFogFactor) * smoothstep(0.0, 5.0, vFogDepth), 0.0, 1.0);

        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, finalFogFactor );
      #endif
      `,
    );
  };

  material.needsUpdate = true;
}

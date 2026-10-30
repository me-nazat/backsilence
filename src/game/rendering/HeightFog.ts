/* ── HeightFog.ts ────────────────────────────────────────────────────────
 *  Custom height-dependent atmospheric mist hugging the water plane on top of FogExp2.
 * ──────────────────────────────────────────────────────────────────────── */

import { Color, type Material } from 'three';

export interface HeightFogOptions {
  waterY?: number;
  height?: number; // alias for waterY
  falloff?: number; // meters decay scale (default 0.85m)
  density?: number; // max added density at water surface (default 0.32)
  color?: string | Color; // optional custom mist color (defaults to fogColor)
}

/**
 * Patches a Three.js material with height-fog shader chunk.
 */
export function applyHeightFog(material: Material, options: HeightFogOptions = {}): void {
  const waterY = options.height ?? options.waterY ?? 0.0;
  const falloff = options.falloff ?? 0.85;
  const density = options.density ?? 0.32;
  const customColor = options.color ? (options.color instanceof Color ? options.color : new Color(options.color)) : new Color('#d6dccd');
  const useCustomColor = options.color !== undefined;

  if ((material as unknown as { __heightFogApplied?: boolean }).__heightFogApplied) {
    return;
  }
  (material as unknown as { __heightFogApplied?: boolean }).__heightFogApplied = true;

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
    shader.uniforms['uHeightFogColor'] = { value: customColor };
    shader.uniforms['uUseCustomHeightFogColor'] = { value: useCustomColor ? 1.0 : 0.0 };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      /* glsl */ `
      #include <common>
      varying vec3 vWorldPosForHeightFog;
      uniform float uHeightFogBaseY;
      uniform float uHeightFogFalloff;
      uniform float uHeightFogDensity;
      uniform vec3 uHeightFogColor;
      uniform float uUseCustomHeightFogColor;
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
        // Reduce near-field fog opacity within 0m - 18m of the camera by 55% (multiplier 0.45)
        // while keeping full atmospheric depth at 25m - 75m.
        float hDist = max(0.0, abs(vWorldPosForHeightFog.y - uHeightFogBaseY));
        float hMist = exp(-hDist * uHeightFogFalloff) * uHeightFogDensity;
        float rawFogFactor = clamp(baseFogFactor + hMist * (1.0 - baseFogFactor) * smoothstep(0.0, 5.0, vFogDepth), 0.0, 1.0);
        float nearFieldSuppression = mix(0.45, 1.0, smoothstep(18.0, 25.0, vFogDepth));
        float finalFogFactor = clamp(rawFogFactor * nearFieldSuppression, 0.0, 1.0);

        vec3 activeFogColor = mix(fogColor, uHeightFogColor, uUseCustomHeightFogColor);
        gl_FragColor.rgb = mix( gl_FragColor.rgb, activeFogColor, finalFogFactor );
      #endif
      `,
    );
  };

  material.needsUpdate = true;
}

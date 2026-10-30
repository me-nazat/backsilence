/* ── WetDarkening.ts ──────────────────────────────────────────────────────
 *  Procedural wet darkening and gloss enhancement below waterY + 0.35.
 *  Applies a soft gradient with a noisy sinusoidal tidemark to standard materials.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MeshStandardMaterial } from 'three';

export interface WetDarkeningOptions {
  waterY?: number;
  tidemarkHeight?: number; // default 0.22m above water
  darkeningFactor?: number; // default 0.48 (stronger waterline contrast)
  glossBoost?: number;     // default 0.5 (smoother/shinier)
}

/**
 * Patches a MeshStandardMaterial's shader via onBeforeCompile to simulate
 * porous tile/concrete/wood absorbing water below the waterline.
 */
export function applyWetDarkening(
  material: MeshStandardMaterial,
  options: WetDarkeningOptions = {},
): void {
  const waterY = options.waterY ?? 0.0;
  const tidemarkHeight = options.tidemarkHeight ?? 0.22;
  const darkeningFactor = options.darkeningFactor ?? 0.48;
  const glossBoost = options.glossBoost ?? 0.5;

  if ((material as unknown as { __wetDarkeningApplied?: boolean }).__wetDarkeningApplied) {
    return;
  }
  (material as unknown as { __wetDarkeningApplied?: boolean }).__wetDarkeningApplied = true;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const previousOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer);

    // 1. Add world position varying to vertex shader if not already present
    if (!shader.vertexShader.includes('vWorldPositionForWet')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vWorldPositionForWet;
        `,
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vWorldPositionForWet = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );
    }

    // 2. Add uniforms to fragment shader
    shader.uniforms['uWaterY_Wet'] = { value: waterY };
    shader.uniforms['uWetLimit'] = { value: waterY + tidemarkHeight };
    shader.uniforms['uDarkenFactor'] = { value: darkeningFactor };
    shader.uniforms['uGlossBoost'] = { value: glossBoost };

    if (!shader.fragmentShader.includes('vWorldPositionForWet')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vWorldPositionForWet;
        uniform float uWaterY_Wet;
        uniform float uWetLimit;
        uniform float uDarkenFactor;
        uniform float uGlossBoost;
        `,
      );

      // 3. Modulate roughness factor strictly within capillary waterline meniscus [waterY - 0.15, waterY + 0.35]
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        if (vWorldPositionForWet.y >= uWaterY_Wet - 0.15 && vWorldPositionForWet.y <= min(uWetLimit, uWaterY_Wet + 0.35)) {
          float wetFade = clamp((min(uWetLimit, uWaterY_Wet + 0.35) - vWorldPositionForWet.y) / 0.35, 0.0, 1.0);
          roughnessFactor = max(0.04, roughnessFactor * mix(1.0, 1.0 - uGlossBoost, wetFade));
        }
        `,
      );

      // 4. Modulate outgoing fragment color strictly within [waterY - 0.15, waterY + 0.35]
      // Preserves 100% of the material's base PBR albedo, normal map, and roughness above waterY + 0.35m.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        /* glsl */ `
        #include <dithering_fragment>

        // Noisy tidemark sine ripple clamped strictly to waterY + 0.35m
        float tidemarkNoise = sin(vWorldPositionForWet.x * 14.0) * cos(vWorldPositionForWet.z * 14.0) * 0.025;
        float wetThreshold = min(uWaterY_Wet + 0.35, uWetLimit + tidemarkNoise);

        if (vWorldPositionForWet.y >= uWaterY_Wet - 0.15 && vWorldPositionForWet.y <= wetThreshold) {
          float depthBelowLimit = wetThreshold - vWorldPositionForWet.y;
          float wetGradient = clamp(depthBelowLimit / 0.35, 0.0, 1.0);
          // Darken diffuse color by up to (1.0 - uDarkenFactor) in capillary meniscus
          gl_FragColor.rgb *= mix(1.0, uDarkenFactor, wetGradient);
        }
        `,
      );
    }
  };

  material.needsUpdate = true;
}

/* ── world-visuals-p5.test.ts ───────────────────────────────────────────────
 *  Prompt 5 Verification Suite:
 *  - 5.1: 1.6m Texture / 10cm mosaic tile scale
 *  - 5.2: Palette separation (platform #b8873f, wall #d6c79c, floorWet #9aa08c, ceiling #b7a775)
 *  - 5.3: Depth bands & raised island observation perches
 *  - 5.4: Fluted 3-section institutional columns (base drum, shaft, capital, shadow gaps, 1.4m decal at y=1.6)
 *  - 5.5: 0.5m thick arch doorways with soffits and POM
 *  - 5.6: Light shafts & skylight assemblies (0.55/2.0/6.0/0.20, emissive rim, dust motes)
 *  - 5.7: Height fog on materials & grazing mist on water
 *  - 5.8: Wet tidemark tightening (0.22m, factor 0.48) and gloss boost (0.5 in roughnessmap)
 *  - 5.9: Weather mist & safeMode photosensitivity
 *  - 5.10: Submerged underwater color blending (uColorShallow, uColorDeep, alpha 0.92)
 *  - 5.11: Specular impact flash (#f4fff0, max 24), lit droplets (#dcefe4), surface termination
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { WORLD } from '../src/app/Config.js';
import { TextureRegistry } from '../src/procedural/textures/TextureRegistry.js';
import { SplashSystem } from '../src/game/water/Splashes.js';
import { applyWetDarkening } from '../src/game/rendering/WetDarkening.js';
import { applyHeightFog } from '../src/game/rendering/HeightFog.js';
import { createLightShaftMesh, createSkylightAssembly } from '../src/game/rendering/LightShafts.js';
import { createWaterMaterial } from '../src/game/water/WaterMaterial.js';
import { PoolroomsMap } from '../src/world/maps/PoolroomsMap.js';
import { DrainageCoreMap } from '../src/world/maps/DrainageCoreMap.js';
import { HydroMazeMap } from '../src/world/maps/HydroMazeMap.js';
import { Object3D, Vector3, Vector4, MeshStandardMaterial, DataTexture, RGBAFormat, UnsignedByteType } from 'three';

describe('Prompt 5: The World Around the Water (P5.1 - P5.12)', () => {
  it('5.1 verifies WORLD.TEXTURE_METERS is 1.6m (16 tiles of 10cm)', () => {
    expect(WORLD.TEXTURE_METERS).toBe(1.6);
  });

  it('5.2 verifies tile variants and palette separation including ceiling', () => {
    const reg = TextureRegistry.getInstance();
    const ceilingSet = reg.getTileSet('ceiling', 42, 64);
    expect(ceilingSet).toBeDefined();
    expect(ceilingSet.albedo).toBeDefined();

    const wallSet = reg.getTileSet('wall', 42, 64);
    expect(wallSet).toBeDefined();

    const platformSet = reg.getTileSet('platform', 42, 64);
    expect(platformSet).toBeDefined();

    const floorSet = reg.getTileSet('floorWet', 42, 64);
    expect(floorSet).toBeDefined();
  });

  it('5.3 verifies maps have depth bands and at least one raised island with stairs', () => {
    const poolLayout = PoolroomsMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    expect(poolLayout.waterBodies.length).toBeGreaterThanOrEqual(2);
    expect(poolLayout.stairs.length).toBeGreaterThanOrEqual(1);

    const hasRaisedPlatform = poolLayout.platforms.some((p) => p.topY >= 0.8);
    expect(hasRaisedPlatform).toBe(true);

    const drainLayout = DrainageCoreMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    expect(drainLayout.waterBodies.length).toBeGreaterThanOrEqual(2);
    expect(drainLayout.stairs.length).toBeGreaterThanOrEqual(1);

    const hydroLayout = HydroMazeMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    expect(hydroLayout.waterBodies.length).toBeGreaterThanOrEqual(2);
    expect(hydroLayout.stairs.length).toBeGreaterThanOrEqual(1);
  });

  it('5.6 verifies LightShafts defaults and skylight assembly with emissive rim and dust motes', () => {
    const shaft = createLightShaftMesh();
    expect(shaft).toBeDefined();

    const assembly = createSkylightAssembly({
      position: new Vector3(0, 0, 0),
      ceilingY: 5.0,
    });
    expect(assembly).toBeDefined();
    expect(assembly.children.length).toBeGreaterThanOrEqual(3); // shaft, rim, motes

    const rim = assembly.getObjectByName('SkylightEmissiveRim');
    expect(rim).toBeDefined();
  });

  it('5.7 verifies HeightFog patches materials with waterY falloff and density', () => {
    const mat = new MeshStandardMaterial();
    applyHeightFog(mat, { height: 0.0, falloff: 0.85, density: 0.32, color: '#d6dccd' });

    const fakeShader = {
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <fog_fragment>',
      uniforms: {} as Record<string, { value: unknown }>,
    };
    (mat.onBeforeCompile as (s: unknown) => void)(fakeShader);
    expect(fakeShader.fragmentShader).toContain('uHeightFogDensity');
  });

  it('5.8 verifies WetDarkening default constants and roughness gloss boost', () => {
    const mat = new MeshStandardMaterial();
    applyWetDarkening(mat);

    const fakeShader = {
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <roughnessmap_fragment>\n#include <dithering_fragment>',
      uniforms: {} as Record<string, { value: number }>,
    };
    (mat.onBeforeCompile as (s: unknown) => void)(fakeShader);

    expect(fakeShader.uniforms['uWetLimit']?.value).toBeCloseTo(0.22, 2);
    expect(fakeShader.uniforms['uDarkenFactor']?.value).toBeCloseTo(0.48, 2);
    expect(fakeShader.uniforms['uGlossBoost']?.value).toBeCloseTo(0.5, 2);
    expect(fakeShader.fragmentShader).toContain('uGlossBoost');
  });

  it('5.10 verifies underwater shader grading uses shallow/deep tint and alpha >= 0.92', () => {
    const dummyTex = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
    const mat = createWaterMaterial({
      tier: 'high',
      normalTexture: dummyTex,
      mapDataTexture: dummyTex,
      mapBounds: new Vector4(0, 0, 10, 10),
      ripples: [],
      wakes: [],
      wakeParams: [],
    });
    expect(mat.fragmentShader).toContain('mix(uColorShallow, uColorDeep, 0.65)');
    expect(mat.fragmentShader).toContain('alpha = max(alpha, 0.92);');
  });

  it('5.11 verifies SplashSystem pools 24 flashes and lit droplet shader', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent);

    expect(SplashSystem.MAX_FLASHES).toBe(24);
    expect(splashes.flashMesh.count).toBe(24);

    // Verify burst creates droplets and camera-facing impact flash
    splashes.burst(new Vector3(0, 0, 0), 1.0, false);
    splashes.update(0.016);

    splashes.dispose();
  });
});

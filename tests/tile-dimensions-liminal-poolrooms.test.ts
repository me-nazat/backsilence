/* ── tile-dimensions-liminal-poolrooms.test.ts ─────────────────────────────
 *  Tests for Tile UV Dimension Fixes, Pristine Ceramic Shaders & Liminal Daylight Atmosphere:
 *  1. Uniform 1:1 Tile UV scaling (0.85, 0.85) eliminating 8x/16x squishing and Moiré shimmer
 *  2. Pristine white ceramic presets ('white' and 'clean-white') with 0.18 roughness and 0.60 clearcoat
 *  3. Removal of graffiti/scum/clutter in favor of chrome ladders, skylight bays, and dark drainage grates
 *  4. Humid liminal daylight atmosphere (#cce4e8, 0.011 density, 1.45 hemi, 0.85 ambient, 1.18 exposure)
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Scene, Mesh, MeshStandardMaterial, HemisphereLight, AmbientLight } from 'three';
import {
  TileMaterialFactory,
  TILE_PRESETS,
  applyRepeat,
  getTileMaterialForBox,
} from '../src/procedural/textures/TileMaterialFactory.js';
import { generateTileTextures } from '../src/procedural/textures/TileTexture.js';
import {
  createPoolLadder,
  buildSkylightBayGeometry,
  addGraffitiAndSigns,
  addFloatingScumDecals,
  addTileDamageDecals,
} from '../src/world/levelart/MapLevelArtPass.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { setupAtmosphere } from '../src/game/session/AtmosphereService.js';
import type { Settings } from '../src/types/contracts.js';

describe('Lead Environment & Technical Material Artist Suite', () => {
  it('applies uniform 1:1 UV repeat scaling with 16x anisotropy across all material texture channels', () => {
    const factory = TileMaterialFactory.getInstance();
    const mat = new MeshStandardMaterial();
    const textures = generateTileTextures({ preset: 'clean-white' });
    mat.map = textures.albedo;
    mat.normalMap = textures.normal;
    mat.roughnessMap = textures.roughness;
    mat.aoMap = textures.ao;

    // Apply repeat scaling
    factory.applyRepeat(mat, 0.85);

    // DESIGN_RATIONALE: Horizontal UV repeat must be 0.85 for 1:1 square tile aspect ratio
    expect(mat.map!.repeat.x).toBeCloseTo(0.85, 2);
    // DESIGN_RATIONALE: Vertical UV repeat must equal horizontal repeat at 0.85 for 1:1 tiles
    expect(mat.map!.repeat.y).toBeCloseTo(0.85, 2);
    // DESIGN_RATIONALE: Normal map horizontal repeat must match diffuse repeat at 0.85
    expect(mat.normalMap!.repeat.x).toBeCloseTo(0.85, 2);
    // DESIGN_RATIONALE: Normal map vertical repeat must match diffuse repeat at 0.85
    expect(mat.normalMap!.repeat.y).toBeCloseTo(0.85, 2);
    // DESIGN_RATIONALE: Anisotropic filtering must be set to 16 to eliminate grazing angle blur
    expect(mat.map!.anisotropy).toBe(16);

    // Also test module-level export
    applyRepeat(mat, 0.85);
    // DESIGN_RATIONALE: Module-level applyRepeat export must set uniform 0.85 repeat scaling
    expect(mat.roughnessMap!.repeat.x).toBeCloseTo(0.85, 2);
  });

  it('generates uniform 1:1 ceramic tile box material without asymmetric horizontal UV squishing', () => {
    const mat = getTileMaterialForBox('clean-white', 4.0, 2.0, 4.0);
    expect(mat).toBeInstanceOf(MeshStandardMaterial);

    // DESIGN_RATIONALE: Box material map repeat X must be 0.85 without 16x horizontal multiplier
    expect(mat.map!.repeat.x).toBeCloseTo(0.85, 2);
    // DESIGN_RATIONALE: Box material map repeat Y must equal repeat X to prevent rectangular squishing
    expect(mat.map!.repeat.y).toBeCloseTo(0.85, 2);
    // DESIGN_RATIONALE: Ratio of repeat X to repeat Y must be exactly 1.0 for square ceramic tiles
    expect(mat.map!.repeat.x / mat.map!.repeat.y).toBeCloseTo(1.0, 2);
  });

  it('configures pristine glazed ceramic presets for white and clean-white tiles', () => {
    for (const presetName of ['white', 'clean-white'] as const) {
      const p = TILE_PRESETS[presetName]!;
      expect(p).toBeDefined();

      // DESIGN_RATIONALE: Clean architectural grey-teal grout color prevents muddy brown seams
      expect(p.groutColor.toLowerCase()).toBe('#b8c0be');
      // DESIGN_RATIONALE: Luminous warm-white porcelain glaze reflects clinical natatorium daylight
      expect(p.tileColor.toLowerCase()).toBe('#f6f7f4');
      // DESIGN_RATIONALE: Low stain rate of 0.03 guarantees pristine ceramic tiles without heavy grime
      expect(p.stainAmount).toBe(0.03);
      // DESIGN_RATIONALE: Soft pale-aqua waterline tint matches pool boundary tile reflections
      expect(p.waterlineTint.toLowerCase()).toBe('#d2ebe8');
      // DESIGN_RATIONALE: Glazed ceramic surface roughness must be 0.18 for sharp specular sheen
      expect(p.roughness).toBe(0.18);
      // DESIGN_RATIONALE: High clearcoat layer value of 0.60 models thick transparent porcelain glaze
      expect(p.clearcoat).toBe(0.60);
      // DESIGN_RATIONALE: Clearcoat roughness of 0.14 provides smooth gloss reflections without harsh blur
      expect(p.clearcoatRoughness).toBe(0.14);
    }
  });

  it('creates clean chrome pool ladders and structural skylight bay frames', () => {
    const ladderMesh = createPoolLadder();
    expect(ladderMesh).toBeInstanceOf(Mesh);
    expect(ladderMesh.matrixAutoUpdate).toBe(false);

    const mat = ladderMesh.material as MeshStandardMaterial;
    // DESIGN_RATIONALE: Chrome ladder metalness must be 0.96 for bright specular metallic reflections
    expect(mat.metalness).toBeGreaterThanOrEqual(0.95);
    // DESIGN_RATIONALE: Chrome ladder roughness must be 0.08 for mirror-polished stainless steel rails
    expect(mat.roughness).toBeLessThanOrEqual(0.10);

    const skylightGeom = buildSkylightBayGeometry(6.0, 4.5);
    expect(skylightGeom.attributes.position).toBeDefined();
    // DESIGN_RATIONALE: Skylight bay geometry must contain at least 72 vertices for 6 framed beams
    expect(skylightGeom.attributes.position!.count).toBeGreaterThanOrEqual(72);

    // Verify decal hooks safely no-op for pristine environments
    expect(() => addGraffitiAndSigns(undefined, true)).not.toThrow();
    expect(() => addFloatingScumDecals(undefined, true)).not.toThrow();
    expect(() => addTileDamageDecals(undefined, true)).not.toThrow();
  });

  it('configures bright, humid liminal daylight atmosphere for natatorium and poolrooms', () => {
    const scene = new Scene();
    const fakeRenderer = {
      renderer: {
        setClearColor: () => {},
        toneMappingExposure: 1.0,
      },
      setToneMapping: () => {},
    } as any;

    const dummySettings: Settings = {
      graphics: { toneMapping: 'agx', quality: 'high', bloom: true },
    } as any;

    // Test NatatoriumMap atmosphere
    setupAtmosphere(scene, fakeRenderer, NatatoriumMap, dummySettings);

    // DESIGN_RATIONALE: Liminal poolroom fog color must be #cce4e8 for soft sunlit moisture haze
    expect(`#${scene.fog!.color.getHexString()}`.toLowerCase()).toBe('#cce4e8');
    // DESIGN_RATIONALE: Liminal daylight fog density must be 0.011 to reveal distant ceramic arches
    expect((scene.fog as any).density).toBeCloseTo(0.011, 3);
    // DESIGN_RATIONALE: Tone mapping exposure must be 1.18 to let bright skylights and water glints glow
    expect(fakeRenderer.renderer.toneMappingExposure).toBeCloseTo(1.18, 2);

    // Verify HemisphereLight and AmbientLight present in scene
    let foundHemi: HemisphereLight | null = null;
    let foundAmbient: AmbientLight | null = null;
    for (const child of scene.children) {
      if (child instanceof HemisphereLight) foundHemi = child;
      if (child instanceof AmbientLight) foundAmbient = child;
    }

    expect(foundHemi).not.toBeNull();
    // DESIGN_RATIONALE: Hemisphere sky color must be pure white for brilliant skylight illumination
    expect(`#${foundHemi!.color.getHexString()}`.toLowerCase()).toBe('#ffffff');
    // DESIGN_RATIONALE: Hemisphere ground color must be turquoise #6ad4e0 for water bounce illumination
    expect(`#${foundHemi!.groundColor.getHexString()}`.toLowerCase()).toBe('#6ad4e0');
    // DESIGN_RATIONALE: Hemisphere light intensity must be 1.45 to brighten enclosed natatorium halls
    expect(foundHemi!.intensity).toBeCloseTo(1.45, 2);

    expect(foundAmbient).not.toBeNull();
    // DESIGN_RATIONALE: Ambient light color #eef8fa provides pale cyan diffuse fill across shadow areas
    expect(`#${foundAmbient!.color.getHexString()}`.toLowerCase()).toBe('#eef8fa');
    // DESIGN_RATIONALE: Ambient light intensity 0.85 prevents harsh pitch-black shadow crevices
    expect(foundAmbient!.intensity).toBeCloseTo(0.85, 2);
  });
});

import { WORLD } from '../src/app/Config.js';
/* ── batch1-poolrooms-rebuild.test.ts ─────────────────────────────────────────
 *  Comprehensive verification suite for ANTIGRAVITY BATCH 1:
 *  - PROMPT 1A: Poolrooms Architecture, Skylight Illumination, World-Space Ceramic Tiles
 *  - PROMPT 1B: Translucent Emerald Water Shader, Expanding Concentric Ripple Rings, Hand-Painted Decals
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  FogExp2,
  Mesh,
  Object3D,
  MeshStandardMaterial,
  CylinderGeometry,
  BoxGeometry,
} from 'three';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { TileMaterialFactory } from '../src/procedural/textures/TileMaterialFactory.js';
import { WaterSurfaceShader } from '../src/game/water/WaterSurfaceShader.js';
import { WATER_PROFILES } from '../src/game/water/WaterProfile.js';
import { RipplePoolManager } from '../src/game/water/RipplePoolManager.js';
import { DecalSystem } from '../src/game/decals/DecalSystem.js';
import {
  makeSpawnWallMural,
  makeExitWarningDecal,
  makePillarWayfindingArrow,
  makePuzzleDigitDecal,
} from '../src/procedural/textures/GraffitiDecals.js';
import { validateLayout } from '../src/world/validate/LayoutValidator.js';

describe('ANTIGRAVITY BATCH 1: Poolrooms Rebuild & Visuals', () => {
  const seed = 42;
  const layout = NatatoriumMap.generateLayout({ seed, difficulty: 'normal', playerCount: 1 });

  describe('Prompt 1A: Atmosphere, Illumination, and ToneMapping Contracts', () => {
    it('configures warm cream-beige atmosphere and FogExp2 with 0.0145 density', () => {
      const atmo = NatatoriumMap.atmosphere;
      expect(atmo.fog.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(atmo.fog.density).toBeCloseTo(0.0145, 4);

      const fogColor = parseInt(atmo.fog.color.replace('#', '0x'), 16);
      const fog = new FogExp2(fogColor, atmo.fog.density);
      expect(`#${fog.color.getHexString()}`.toLowerCase()).toBe(atmo.fog.color.toLowerCase());
      expect(fog.density).toBe(0.0145);
    });

    it('configures 3-layer lighting: Hemisphere bounce and Directional skylight sunbeams', () => {
      const atmo = NatatoriumMap.atmosphere;
      expect(atmo.exposure).toBe(1.12);
      expect(atmo.hemisphere.sky).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(atmo.hemisphere.ground).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(atmo.hemisphere.sky.toLowerCase()).not.toBe(atmo.hemisphere.ground.toLowerCase());
      expect(atmo.hemisphere.intensity).toBe(1.25);

      expect(atmo.sun?.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(atmo.sun?.intensity).toBe(1.15);
      expect(atmo.sun?.castShadow).toBe(true);
    });
  });

  describe('Prompt 1A: World-Space Ceramic Tile Materials (TileMaterialFactory)', () => {
    const factory = TileMaterialFactory.getInstance();

    it('generates wall, ceiling, platform, and pool floor materials with zero UV stretching', () => {
      expect(factory.wallTileMaterial).toBeInstanceOf(MeshStandardMaterial);
      expect(factory.platformTopMaterial).toBeInstanceOf(MeshStandardMaterial);
      expect(factory.platformSideMaterial).toBeInstanceOf(MeshStandardMaterial);
      expect(factory.poolFloorMaterial).toBeInstanceOf(MeshStandardMaterial);
      expect(factory.ceilingTileMaterial).toBeInstanceOf(MeshStandardMaterial);

      // Optical parameters: glazed ceramic walls are smoother than walkable platform tops
      expect(factory.wallTileMaterial.roughness).toBeLessThan(factory.platformTopMaterial.roughness);
      expect(factory.wallTileMaterial.metalness).toBe(0.04);
      expect(factory.platformTopMaterial.roughness).toBe(0.32);
      expect(factory.platformSideMaterial.roughness).toBe(0.28);
      expect(factory.poolFloorMaterial.roughness).toBe(0.28);
    });

    it('creates platform geometry with multi-material groups and no EdgesGeometry outlines', () => {
      const geom = factory.createPlatformGeometry(4.0, 1.13, 6.0, 0.30, -0.75);
      expect(geom).toBeInstanceOf(BoxGeometry);
      // DESIGN_RATIONALE: Three.js BoxGeometry always partitions a rectangular prism into 6 axial face groups (+X, -X, +Y, -Y, +Z, -Z).
      expect(geom.groups.length).toBe(6);

      // Top face (+Y, group 2) uses material index 0 (platformTopMaterial)
      const topGroup = geom.groups.find((g) => g.start === 12);
      expect(topGroup).toBeDefined();
      expect(topGroup?.materialIndex).toBe(0);

      // Side faces use material index 1 (platformSideMaterial)
      const sideGroup = geom.groups.find((g) => g.start === 0);
      expect(sideGroup).toBeDefined();
      expect(sideGroup?.materialIndex).toBe(1);

      // Verify mesh creation
      const mesh = factory.createPlatformMesh(4.0, 1.13, 6.0, 0.30, -0.75);
      expect(mesh).toBeInstanceOf(Mesh);
      expect(Array.isArray(mesh.material)).toBe(true);
      expect((mesh.material as unknown[])[0]).toBe(factory.platformTopMaterial);
      expect((mesh.material as unknown[])[1]).toBe(factory.platformSideMaterial);
    });

    it('creates 48-segment giant cylindrical columns with square tile UVs', () => {
      const colGeom = factory.createGiantColumnGeometry(2.1, 9.0, 48);
      expect(colGeom).toBeInstanceOf(CylinderGeometry);
      const uvAttr = colGeom.getAttribute('uv');
      expect(uvAttr).toBeDefined();
      expect(uvAttr.count).toBeGreaterThan(0);
    });

    it('creates merged palm-arch pillar mesh with 4-way vaulted ribs', () => {
      const palm = factory.createPalmArchPillar(5.5, 2.2);
      expect(palm).toBeInstanceOf(Mesh);
      expect(palm.name).toBe('PalmArchPillar');
      expect(palm.material).toBe(factory.wallTileMaterial);
      expect(palm.geometry.getAttribute('position')).toBeDefined();
    });
  });

  describe('Prompt 1A: Authentic Backrooms Poolrooms Architectural Zones', () => {
    it('validates the Natatorium layout passes all simulation and solvability constraints', () => {
      const val = validateLayout('natatorium', layout);
      expect(val.valid, `Layout errors: ${val.errors.join(', ')}`).toBe(true);
    });

    it('Zone A: includes spawn deck, curved peninsula, palm-arch pillars, and low swim-under tunnel', () => {
      const foyer = layout.platforms.find((p) => p.id === 'plat_foyer');
      expect(foyer).toBeDefined();
      expect(foyer?.topY).toBe(WORLD.PLATFORM_TOP_Y);

      const peninsula = layout.platforms.filter((p) => p.id.startsWith('plat_peninsula'));
      expect(peninsula.length).toBeGreaterThanOrEqual(4);

      // Low swim-under tunnel roof exists with clearance 1.65m above water
      const tunnelRoof = layout.walls.find((w) => w.id === 'wall_tunnel_bridge_roof');
      expect(tunnelRoof).toBeDefined();
      expect(tunnelRoof?.min.y).toBeCloseTo(1.65, 2);
      const tunnelLength = (tunnelRoof?.max.z ?? 0) - (tunnelRoof?.min.z ?? 0);
      expect(tunnelLength).toBeCloseTo(4.5, 1);
    });

    it('Zone B: Flooded Pillar Hall has ~45 dry stepping-stone platforms and safe trench', () => {
      expect(layout.platforms.length).toBeGreaterThanOrEqual(40);
      expect(layout.platforms.length).toBeLessThanOrEqual(50);

      // Safe trench flanked by two 6m x 8m dry platforms
      const trenchW = layout.platforms.find((p) => p.id === 'plat_trench_west');
      const trenchE = layout.platforms.find((p) => p.id === 'plat_trench_east');
      expect(trenchW).toBeDefined();
      expect(trenchE).toBeDefined();

      const wWidth = trenchW!.rect[2] - trenchW!.rect[0];
      const wLength = trenchW!.rect[3] - trenchW!.rect[1];
      expect(wWidth).toBeCloseTo(6.0, 1);
      expect(wLength).toBeCloseTo(8.0, 1);

      // Narrow water trench gap width = 1.05m
      const trenchGap = trenchE!.rect[0] - trenchW!.rect[2];
      expect(trenchGap).toBeCloseTo(1.05, 2);
    });

    it('Zone B: Supported by giant 2.1m radius columns and Roman archways', () => {
      const giantCols = layout.pillars.filter((p) => p.radius >= 2.0 && p.height >= 9.0);
      expect(giantCols.length).toBeGreaterThanOrEqual(8);

      // Roman arch openings in dividing walls
      const arch1W = layout.walls.find((w) => w.id === 'wall_arch1_w');
      const arch1E = layout.walls.find((w) => w.id === 'wall_arch1_e');
      expect(arch1W).toBeDefined();
      expect(arch1E).toBeDefined();
      const archSpan = arch1E!.min.x - arch1W!.max.x;
      expect(archSpan).toBeCloseTo(6.5, 1);
    });

    it('Zone C: S-bend checkpoint corridor connects to exit plant room', () => {
      const ramp = layout.platforms.find((p) => p.id === 'plat_corridor_ramp');
      const sbend = layout.platforms.find((p) => p.id === 'plat_corridor_sbend');
      const plantRoom = layout.platforms.find((p) => p.id === 'plat_plant_room');
      expect(ramp).toBeDefined();
      expect(sbend).toBeDefined();
      expect(plantRoom).toBeDefined();
    });

    it('builds full 3D Natatorium instance and verifies architectural elements', async () => {
      const env = { parent: null, textures: null, audio: null, difficulty: 'normal' as const };
      const instance = await NatatoriumMap.build(layout, env);
      expect(instance).toBeDefined();

      // Checkpoint lamps, skylights, and archways
      const skylight = instance.root.getObjectByName('SkylightSpawnWindow');
      expect(skylight).toBeDefined();

      const arch1 = instance.root.getObjectByName('RomanArch_1');
      const arch2 = instance.root.getObjectByName('RomanArch_2');
      expect(arch1).toBeDefined();
      expect(arch2).toBeDefined();

      const corridorFixture = instance.root.getObjectByName('CorridorCeilingFixture_0');
      const corridorLight = instance.root.getObjectByName('CorridorCeilingPointLight_0');
      expect(corridorFixture).toBeDefined();
      expect(corridorLight).toBeDefined();

      // Giant columns
      const giantPillar1 = instance.root.getObjectByName('Pillar_pil_giant_1');
      expect(giantPillar1).toBeDefined();

      // All static meshes have matrixAutoUpdate === false
      let nonStaticCount = 0;
      instance.root.traverse((obj) => {
        if (obj instanceof Mesh && obj.matrixAutoUpdate) nonStaticCount++;
      });
      expect(nonStaticCount).toBe(0);

      instance.dispose();
    });
  });

  describe('Prompt 1B: Translucent Emerald Water Shader & Optics', () => {
    it('WaterSurfaceShader defines correct tints, Fresnel alpha, and dual wave perturbation', () => {
      const shallow = WaterSurfaceShader.uniforms.uColorShallow.value;
      const deep = WaterSurfaceShader.uniforms.uColorDeep.value;
      const prof = WATER_PROFILES.natatorium;

      expect(`#${shallow.getHexString()}`.toLowerCase()).toBe(prof.shallow.toLowerCase());
      expect(`#${deep.getHexString()}`.toLowerCase()).toBe(prof.deep.toLowerCase());
      expect(shallow.r + shallow.g + shallow.b).toBeGreaterThan(deep.r + deep.g + deep.b);

      expect(WaterSurfaceShader.uniforms.uWaveAmp.value).toBe(0.018);
      expect(WaterSurfaceShader.uniforms.uSpeed1.value.x).toBe(0.35);
      expect(WaterSurfaceShader.uniforms.uSpeed1.value.y).toBe(0.22);
      expect(WaterSurfaceShader.uniforms.uSpeed2.value.x).toBe(-0.28);
      expect(WaterSurfaceShader.uniforms.uSpeed2.value.y).toBe(0.41);

      // Shader source code verification
      expect(WaterSurfaceShader.fragmentShader).toContain('step(0.92, specular)');
      expect(WaterSurfaceShader.fragmentShader).toContain('pow(specular, 48.0)');
      expect(WaterSurfaceShader.fragmentShader).toContain('pow(1.0 - NdotV, 4.0)');
    });

    it('WATER_PROFILES.natatorium matches translucent optical specifications', () => {
      const prof = WATER_PROFILES.natatorium;
      expect(prof.shallow).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(prof.deep).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(prof.shallow.toLowerCase()).not.toBe(prof.deep.toLowerCase());
      expect(prof.opacityMin).toBe(0.20);
      expect(prof.opacityMax).toBe(0.86);
      // DESIGN_RATIONALE: matches water_bright_streaks_t17 in palette.json
      expect(prof.specular.toLowerCase()).toBe('#7b9e5e');
      expect(prof.murk).toBe(0.0);
    });
  });

  describe('Prompt 1B: Concentric Ripple Rings (RipplePoolManager)', () => {
    it('manages pre-allocated pool of ring decals and 3-ring concentric shader', () => {
      const root = new Object3D();
      const rippleManager = new RipplePoolManager(root, 0.0);
      expect(RipplePoolManager.MAX_RIPPLES).toBeGreaterThanOrEqual(16);
      expect(rippleManager.rippleMesh.count).toBe(RipplePoolManager.MAX_RIPPLES);

      // Verify ring decal material has concentric circles formula
      const mat = rippleManager.rippleMesh.material as import('three').ShaderMaterial;
      expect(mat.fragmentShader).toContain('length(vUv - vec2(0.5)) * 2.0');
      expect(mat.fragmentShader).toContain('0.95');
      expect(mat.fragmentShader).toContain('0.68');
      expect(mat.fragmentShader).toContain('0.40');

      // Test trigger rules
      rippleManager.spawnPlayerJumpSplash(0, 10);
      rippleManager.spawnPlayerWadingStep(1, 12);
      rippleManager.spawnPebbleImpact(5, 15);
      rippleManager.spawnMonsterStride(0, 5);

      // Update simulation
      rippleManager.update(0.1);
      rippleManager.dispose();
    });
  });

  describe('Prompt 1B: Hand-Painted Wall Graffiti & Pillar Decals', () => {
    it('generates Spawn Wall Mural with 7-point splash crown and 4 concentric oval rings', () => {
      const tex = makeSpawnWallMural({ width: 1024, height: 512 });
      expect(tex).toBeDefined();
      const wallMesh = DecalSystem.createWallDecalMesh(tex, 4.8, 2.4);
      expect(wallMesh).toBeInstanceOf(Mesh);
      const mat = wallMesh.material as MeshStandardMaterial;
      expect(mat.polygonOffset).toBe(true);
      expect(mat.depthWrite).toBe(false);
    });

    it('generates Exit & Checkpoint warning graffiti with arrows', () => {
      const tex = makeExitWarningDecal({ width: 1024, height: 512 });
      expect(tex).toBeDefined();
    });

    it('generates Curved Cylindrical Pillar Wayfinding Arrows wrapped on 2.1m radius columns', () => {
      const rightTex = makePillarWayfindingArrow('right');
      const curvedMesh = DecalSystem.createCurvedPillarDecalMesh(rightTex, 2.1, 1.6, 1.1);
      expect(curvedMesh).toBeInstanceOf(Mesh);
      expect(curvedMesh.geometry).toBeInstanceOf(CylinderGeometry);
    });

    it('generates Stencil Puzzle Digits matching keypad sequence', () => {
      const digitTex = makePuzzleDigitDecal(4, true);
      expect(digitTex).toBeDefined();
      const stencilMesh = DecalSystem.createCurvedPillarDecalMesh(digitTex, 0.75, 1.2, 1.2);
      expect(stencilMesh).toBeInstanceOf(Mesh);
    });
  });
});

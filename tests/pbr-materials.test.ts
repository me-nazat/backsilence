import { describe, it, expect } from 'vitest';
import { makePbrMaterialSet, type PbrMaterialKind } from '../src/procedural/textures/PbrMaterialKit.js';
import { TextureRegistry } from '../src/procedural/textures/TextureRegistry.js';
import { DecalSystem } from '../src/game/decals/DecalSystem.js';
import { createTriplanarMaterial } from '../src/procedural/shaders/triplanar.glsl.js';
import { Vector3, Color } from 'three';

describe('Phase D: Procedural PBR Materials & Detail Surfaces', () => {
  const KINDS: PbrMaterialKind[] = [
    'tile',
    'concrete',
    'marble',
    'metal',
    'wood',
    'parquet',
    'linoleum',
    'moss',
    'mud',
    'bark',
    'asphalt',
    'subway_tile',
    'stained_glass',
  ];

  it('generates all 13 procedural PBR material sets with albedo, normal, roughness, and ao', () => {
    expect(KINDS.length).toBe(13);

    for (const kind of KINDS) {
      const set = makePbrMaterialSet({ kind, seed: 12345, size: 64, anisotropy: 4 });
      expect(set.kind).toBe(kind);
      expect(set.albedo).toBeDefined();
      expect(set.normal).toBeDefined();
      expect(set.roughness).toBeDefined();
      expect(set.ao).toBeDefined();

      expect(set.albedo.anisotropy).toBe(4);
      expect(set.normal.anisotropy).toBe(4);
      expect(set.roughness.anisotropy).toBe(4);
      expect(set.ao.anisotropy).toBe(4);
    }
  });

  it('TextureRegistry caches and retrieves PBR material sets cleanly', () => {
    const reg = TextureRegistry.getInstance();
    const setA = reg.getPbrSet('subway_tile', 42, 64);
    const setB = reg.getPbrSet('subway_tile', 42, 64);
    expect(setA).toBe(setB); // cached instance
  });

  it('DecalSystem manages up to 400 decals with polygonOffset to prevent z-fighting', () => {
    const decals = new DecalSystem(400);
    expect(decals.maxDecals).toBe(400);
    expect(decals.getCount()).toBe(0);

    const mat = decals.root.material as import('three').MeshStandardMaterial;
    expect(mat.polygonOffset).toBe(true);
    expect(mat.polygonOffsetFactor).toBe(-1.0);
    expect(mat.polygonOffsetUnits).toBe(-1.0);
    expect(mat.depthWrite).toBe(false);

    // Place several test decals
    decals.addDecal({
      position: new Vector3(5, 1, 10),
      normal: new Vector3(0, 0, 1),
      size: 1.5,
      kind: 'graffiti',
      color: new Color('#e9dca8'),
    });

    decals.addDecal({
      position: new Vector3(12, 0.05, 4),
      normal: new Vector3(0, 1, 0),
      size: 0.8,
      kind: 'stain',
      color: new Color('#22201b'),
    });

    expect(decals.getCount()).toBe(2);
    decals.dispose();
  });

  it('createTriplanarMaterial creates triplanar mapping material with slope-based moss', () => {
    const pbr = makePbrMaterialSet({ kind: 'concrete', size: 64 });
    const mossPbr = makePbrMaterialSet({ kind: 'moss', size: 64 });

    const triplanarMat = createTriplanarMaterial({
      rockTexture: pbr.albedo,
      mossTexture: mossPbr.albedo,
      scale: 2.0,
      mossThreshold: 0.65,
    });

    expect(triplanarMat).toBeDefined();
    expect(triplanarMat.vertexShader).toContain('vWorldPosition');
    expect(triplanarMat.fragmentShader).toContain('tRock');
    expect(triplanarMat.fragmentShader).toContain('tMoss');
    expect(triplanarMat.fragmentShader).toContain('mossFactor');
    triplanarMat.dispose();
  });
});

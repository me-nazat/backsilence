/* ── MaterialCache.ts ────────────────────────────────────────────────────────
 *  Singleton Procedural Texture & Material Cache for BackSilence:
 *  - Caches compiled Three.js MeshStandardMaterial instances in a global Map
 *  - Reuses 512x512 procedural tile textures with RepeatWrapping & anisotropic filtering
 *  - Pools unit BoxGeometry(1, 1, 1) and CylinderGeometry(1, 1, 1, 32)
 *  - Never disposes or regenerates cached tile materials across sector swaps
 * ────────────────────────────────────────────────────────────────────────── */

import {
  BoxGeometry,
  CylinderGeometry,
  CanvasTexture,
  type Material,
  type WebGLRenderer,
} from 'three';
import { TileMaterialFactory, type TileMaterialKit } from '../procedural/textures/TileMaterialFactory.js';
import { TextureRegistry } from '../procedural/textures/TextureRegistry.js';

export class MaterialCache {
  private static instance: MaterialCache | null = null;

  private materials = new Map<string, Material>();
  private textures = new Map<string, CanvasTexture>();
  private unitBox: BoxGeometry | null = null;
  private unitCylinder: CylinderGeometry | null = null;
  private isWarmedUp = false;

  private constructor() {}

  static getInstance(renderer?: WebGLRenderer): MaterialCache {
    if (!MaterialCache.instance) {
      MaterialCache.instance = new MaterialCache();
      if (renderer) {
        MaterialCache.instance.warmup(renderer);
      }
    }
    return MaterialCache.instance;
  }

  getMaterial(key: string): Material | undefined {
    return this.materials.get(key);
  }

  setMaterial(key: string, mat: Material): void {
    this.materials.set(key, mat);
  }

  hasMaterial(key: string): boolean {
    return this.materials.has(key);
  }

  getOrCreateMaterial<T extends Material>(key: string, factory: () => T): T {
    let mat = this.materials.get(key) as T | undefined;
    if (!mat) {
      mat = factory();
      this.materials.set(key, mat);
    }
    return mat;
  }

  getTexture(key: string): CanvasTexture | undefined {
    return this.textures.get(key);
  }

  setTexture(key: string, tex: CanvasTexture): void {
    this.textures.set(key, tex);
  }

  /**
   * Return pooled unit BoxGeometry(1, 1, 1) for matrix-scaled assembly.
   */
  getUnitBox(): BoxGeometry {
    if (!this.unitBox) {
      this.unitBox = new BoxGeometry(1, 1, 1);
    }
    return this.unitBox;
  }

  /**
   * Return pooled unit CylinderGeometry(1, 1, 1, 32) for matrix-scaled assembly.
   */
  getUnitCylinder(): CylinderGeometry {
    if (!this.unitCylinder) {
      this.unitCylinder = new CylinderGeometry(1, 1, 1, 32);
    }
    return this.unitCylinder;
  }

  /**
   * Retrieve the core TileMaterialKit (wall, platform top, side, pool floor, ceiling).
   */
  getTileMaterials(renderer?: WebGLRenderer): TileMaterialKit {
    const factory = TileMaterialFactory.getInstance(renderer);
    this.materials.set('wallTile', factory.wallTileMaterial);
    this.materials.set('platformTop', factory.platformTopMaterial);
    this.materials.set('platformSide', factory.platformSideMaterial);
    this.materials.set('poolFloor', factory.poolFloorMaterial);
    this.materials.set('ceilingTile', factory.ceilingTileMaterial);
    return factory;
  }

  /**
   * Warm up standard procedural textures and materials once at boot.
   */
  warmup(renderer?: WebGLRenderer): void {
    if (this.isWarmedUp) return;
    this.isWarmedUp = true;

    // 1. Core tile materials from TileMaterialFactory
    this.getTileMaterials(renderer);

    // 2. Core procedural texture sets from TextureRegistry with canonical seed 42
    const texReg = TextureRegistry.getInstance();
    texReg.getConcreteSet('tunnel', 42, 512);
    texReg.getRustMetalSet(42, 512);
    texReg.getTileSet('ceiling', 42, 512);
    texReg.getTileSet('platform', 42, 512);
    texReg.getPbrSet('wood', 42, 128);
    texReg.getMarbleSet(42, 512);

    // 3. Pre-create standard sector materials
    const stationKit = TileMaterialFactory.getInstance(renderer).getThemeKit('station');
    this.getOrCreateMaterial('drainage_core:platform', () => stationKit.platformTopMaterial);
    this.getOrCreateMaterial('drainage_core:wall', () => stationKit.wallTileMaterial);
    this.getOrCreateMaterial('drainage_core:floor', () => stationKit.poolFloorMaterial);
  }

  /**
   * Clear transient materials while strictly preserving persistent procedural tile textures.
   */
  clearTransientOnly(): void {
    const persistent = new Set([
      'wallTile',
      'platformTop',
      'platformSide',
      'poolFloor',
      'ceilingTile',
      'drainage_core:platform',
      'drainage_core:wall',
      'drainage_core:floor',
    ]);

    for (const [key, mat] of this.materials.entries()) {
      if (!persistent.has(key)) {
        mat.dispose();
        this.materials.delete(key);
      }
    }
  }

  /**
   * Full disposal for testing/teardown only.
   */
  disposeAll(): void {
    for (const mat of this.materials.values()) {
      mat.dispose();
    }
    this.materials.clear();
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    this.textures.clear();
    this.unitBox?.dispose();
    this.unitBox = null;
    this.unitCylinder?.dispose();
    this.unitCylinder = null;
    this.isWarmedUp = false;
  }
}

/* ── TextureRegistry.ts ───────────────────────────────────────────────────
 *  Single entry point for all procedural textures in BackSilence.
 *  Manages caching, time-sliced warm-up, GPU memory tracking, and disposal.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Texture, WebGLRenderer } from 'three';
import { makeTileSet, type TileVariant, type TileSetResult } from './TileTexture.js';
import { makeCausticsTexture } from './CausticsBaker.js';
import { makeWaterNormalMap } from './WaterNormal.js';
import { makeRippleStamp } from './RippleStamp.js';
import { makeTaglineDecal, makeWarningDecal, type WarningKind } from './GraffitiDecals.js';
import { makeNumberDecal, type NumberDecalOptions } from './NumberDecals.js';
import { makeConcreteSet, type ConcreteVariant, type ConcreteSetResult } from './ConcreteTexture.js';
import { makeRustMetalSet, makeGrateTexture, type MetalSetResult } from './RustMetalTexture.js';
import { makeMarbleSet, type MarbleSetResult } from './MarbleTexture.js';
import { makeBronzeSet, type BronzeSetResult } from './BronzeTexture.js';
import { makeAlgaeGlowTexture } from './AlgaeGlowMask.js';
import { makePaintedLabel, makePipeDiagramTexture, type LabelOptions } from './PaintedLabel.js';
import { runJobQueue, type CooperativeJob } from '../core/scheduler.js';
import { makePbrMaterialSet, type PbrMaterialKind, type PbrSetResult } from './PbrMaterialKit.js';

export interface TextureStats {
  count: number;
  totalEstimatedBytes: number;
  memoryMB: string;
}

export class TextureRegistry {
  private static instance: TextureRegistry | null = null;

  private tileSets = new Map<string, TileSetResult>();
  private causticsMap = new Map<string, Texture>();
  private waterNormals = new Map<string, Texture>();
  private rippleStamps = new Map<string, Texture>();
  private taglineMap = new Map<string, Texture>();
  private warningMap = new Map<string, Texture>();
  private numberMap = new Map<string, Texture>();
  private concreteSets = new Map<string, ConcreteSetResult>();
  private metalSets = new Map<string, MetalSetResult>();
  private grateMap = new Map<string, Texture>();
  private marbleSets = new Map<string, MarbleSetResult>();
  private bronzeSets = new Map<string, BronzeSetResult>();
  private algaeGlowMap = new Map<string, Texture>();
  private labelMap = new Map<string, Texture>();

  private registeredTextures = new Set<Texture>();

  static getInstance(): TextureRegistry {
    if (!TextureRegistry.instance) {
      TextureRegistry.instance = new TextureRegistry();
    }
    return TextureRegistry.instance;
  }

  private trackTexture(tex: Texture, width = 512, height = 512): void {
    (tex as unknown as { _estimatedBytes?: number })._estimatedBytes = Math.round(
      width * height * 4 * 1.333,
    );
    this.registeredTextures.add(tex);
  }

  getTileSet(variant: TileVariant, seed = 42, size = 512): TileSetResult {
    const key = `${variant}:${seed}:${size}`;
    let set = this.tileSets.get(key);
    if (!set) {
      set = makeTileSet({ variant, seed, size });
      this.trackTexture(set.albedo, size, size);
      this.trackTexture(set.height, size, size);
      this.trackTexture(set.normal, size, size);
      this.trackTexture(set.roughness, size, size);
      this.tileSets.set(key, set);
    }
    return set;
  }

  getCaustics(renderer?: WebGLRenderer, seed = 42, size = 512): Texture {
    const key = `caustics:${seed}:${size}`;
    let tex = this.causticsMap.get(key);
    if (!tex) {
      tex = makeCausticsTexture(renderer, { seed, size });
      this.trackTexture(tex, size, size);
      this.causticsMap.set(key, tex);
    }
    return tex;
  }

  getWaterNormal(seed = 101, size = 512): Texture {
    const key = `waterNormal:${seed}:${size}`;
    let tex = this.waterNormals.get(key);
    if (!tex) {
      tex = makeWaterNormalMap({ seed, size });
      this.trackTexture(tex, size, size);
      this.waterNormals.set(key, tex);
    }
    return tex;
  }

  getRippleStamp(size = 256): Texture {
    const key = `ripple:${size}`;
    let tex = this.rippleStamps.get(key);
    if (!tex) {
      tex = makeRippleStamp({ size });
      this.trackTexture(tex, size, size);
      this.rippleStamps.set(key, tex);
    }
    return tex;
  }

  getTagline(seed = 77, width = 1024, height = 512): Texture {
    const key = `tagline:${seed}:${width}x${height}`;
    let tex = this.taglineMap.get(key);
    if (!tex) {
      tex = makeTaglineDecal({ seed, width, height });
      this.trackTexture(tex, width, height);
      this.taglineMap.set(key, tex);
    }
    return tex;
  }

  getNumber(n: number, options: NumberDecalOptions = {}): Texture {
    const seed = options.seed ?? 100 + n;
    const style = options.style ?? 'spray';
    const key = `num:${n}:${seed}:${style}`;

    let tex = this.numberMap.get(key);
    if (!tex) {
      tex = makeNumberDecal(n, options);
      this.trackTexture(tex, 512, 768);
      this.numberMap.set(key, tex);
    }
    return tex;
  }

  getWarning(kind: WarningKind, seed = 55, size = 256): Texture {
    const key = `warn:${kind}:${seed}:${size}`;
    let tex = this.warningMap.get(key);
    if (!tex) {
      tex = makeWarningDecal(kind, { seed, size });
      this.trackTexture(tex, size, size);
      this.warningMap.set(key, tex);
    }
    return tex;
  }

  getConcreteSet(variant: ConcreteVariant = 'tunnel', seed = 42, size = 512): ConcreteSetResult {
    const key = `concrete:${variant}:${seed}:${size}`;
    let set = this.concreteSets.get(key);
    if (!set) {
      set = makeConcreteSet(variant, seed, size);
      this.trackTexture(set.albedo, size, size);
      this.trackTexture(set.normal, size, size);
      this.trackTexture(set.roughness, size, size);
      this.concreteSets.set(key, set);
    }
    return set;
  }

  getRustMetalSet(seed = 42, size = 512): MetalSetResult {
    const key = `rustMetal:${seed}:${size}`;
    let set = this.metalSets.get(key);
    if (!set) {
      set = makeRustMetalSet(seed, size);
      this.trackTexture(set.albedo, size, size);
      this.trackTexture(set.normal, size, size);
      this.trackTexture(set.roughness, size, size);
      this.trackTexture(set.metalness, size, size);
      this.metalSets.set(key, set);
    }
    return set;
  }

  getGrateTexture(size = 256): Texture {
    const key = `grate:${size}`;
    let tex = this.grateMap.get(key);
    if (!tex) {
      tex = makeGrateTexture(size);
      this.trackTexture(tex, size, size);
      this.grateMap.set(key, tex);
    }
    return tex;
  }

  getMarbleSet(seed = 42, size = 512): MarbleSetResult {
    const key = `marble:${seed}:${size}`;
    let set = this.marbleSets.get(key);
    if (!set) {
      set = makeMarbleSet(seed, size);
      this.trackTexture(set.albedo, size, size);
      this.trackTexture(set.normal, size, size);
      this.trackTexture(set.roughness, size, size);
      this.marbleSets.set(key, set);
    }
    return set;
  }

  getBronzeSet(seed = 88, size = 256): BronzeSetResult {
    const key = `bronze:${seed}:${size}`;
    let set = this.bronzeSets.get(key);
    if (!set) {
      set = makeBronzeSet(seed, size);
      this.trackTexture(set.albedo, size, size);
      this.trackTexture(set.normal, size, size);
      this.trackTexture(set.roughness, size, size);
      this.trackTexture(set.metalness, size, size);
      this.bronzeSets.set(key, set);
    }
    return set;
  }

  getAlgaeGlow(seed = 105, size = 256): Texture {
    const key = `algae:${seed}:${size}`;
    let tex = this.algaeGlowMap.get(key);
    if (!tex) {
      tex = makeAlgaeGlowTexture(seed, size);
      this.trackTexture(tex, size, size);
      this.algaeGlowMap.set(key, tex);
    }
    return tex;
  }

  getPaintedLabel(opts: LabelOptions): Texture {
    const key = `label:${opts.text}:${opts.subtext ?? ''}:${opts.color ?? ''}`;
    let tex = this.labelMap.get(key);
    if (!tex) {
      tex = makePaintedLabel(opts);
      this.trackTexture(tex, opts.width ?? 512, opts.height ?? 256);
      this.labelMap.set(key, tex);
    }
    return tex;
  }

  getPipeDiagram(order: string[]): Texture {
    const key = `diagram:${order.join(',')}`;
    let tex = this.labelMap.get(key);
    if (!tex) {
      tex = makePipeDiagramTexture(order);
      this.trackTexture(tex, 512, 256);
      this.labelMap.set(key, tex);
    }
    return tex;
  }

  getPbrSet(kind: PbrMaterialKind, seed = 42, size = 256, anisotropy = 4): PbrSetResult {
    const res = makePbrMaterialSet({ kind, seed, size, anisotropy });
    this.trackTexture(res.albedo, size, size);
    this.trackTexture(res.normal, size, size);
    this.trackTexture(res.roughness, size, size);
    this.trackTexture(res.ao, size, size);
    return res;
  }

  /**
   * Warm up baseline Map 1 textures cooperatively using the time-slicer.
   */
  async warmUp(
    progressCb?: (pct: number) => void,
    renderer?: WebGLRenderer,
  ): Promise<void> {
    const jobs: Array<CooperativeJob<void>> = [
      {
        name: 'tiles_platform',
        run: () => {
          this.getTileSet('platform', 42, 512);
        },
      },
      {
        name: 'tiles_wall',
        run: () => {
          this.getTileSet('wall', 42, 512);
        },
      },
      {
        name: 'tiles_floorWet',
        run: () => {
          this.getTileSet('floorWet', 42, 512);
        },
      },
      {
        name: 'caustics',
        run: () => {
          this.getCaustics(renderer, 42, 512);
        },
      },
      {
        name: 'water_normal',
        run: () => {
          this.getWaterNormal(101, 512);
        },
      },
      {
        name: 'ripple_stamp',
        run: () => {
          this.getRippleStamp(256);
        },
      },
      {
        name: 'tagline_decal',
        run: () => {
          this.getTagline(77, 1024, 512);
        },
      },
      {
        name: 'number_2',
        run: () => {
          this.getNumber(2);
        },
      },
    ];

    await runJobQueue(jobs, {
      sliceBudgetMs: 6.0,
      onProgress: progressCb,
    });
  }

  stats(): TextureStats {
    let totalBytes = 0;
    for (const tex of this.registeredTextures) {
      const b = (tex as unknown as { _estimatedBytes?: number })._estimatedBytes ?? 512 * 512 * 4 * 1.333;
      totalBytes += b;
    }
    return {
      count: this.registeredTextures.size,
      totalEstimatedBytes: totalBytes,
      memoryMB: (totalBytes / (1024 * 1024)).toFixed(2) + ' MB',
    };
  }

  disposeAll(): void {
    for (const tex of this.registeredTextures) {
      tex.dispose();
    }
    this.registeredTextures.clear();
    this.tileSets.clear();
    this.causticsMap.clear();
    this.waterNormals.clear();
    this.rippleStamps.clear();
    this.taglineMap.clear();
    this.warningMap.clear();
    this.numberMap.clear();
    this.concreteSets.clear();
    this.metalSets.clear();
    this.grateMap.clear();
    this.marbleSets.clear();
    this.bronzeSets.clear();
    this.algaeGlowMap.clear();
    this.labelMap.clear();
  }
}

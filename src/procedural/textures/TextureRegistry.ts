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
import { runJobQueue, type CooperativeJob } from '../core/scheduler.js';

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
  }
}

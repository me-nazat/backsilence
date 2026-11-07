/* ── TileMaterialFactory.ts ───────────────────────────────────────────────
 *  World-space ceramic tile materials and geometry generator.
 *  - Procedural canvas textures with anisotropic filtering & RepeatWrapping
 *  - Single authoritative tile pitch sourced from WORLD.TILE_METERS (0.15m)
 *  - 2.4m texture repeat = 16 x 16 ceramic tiles at WORLD.TILE_METERS
 *  - Wall, pillar, ceiling & archway ceramic tile (#c8b580, #6e6550 grout)
 *  - Dry stepping-stone platform top (#c29b56, #4a3b22 grout)
 *  - Vertical side trim with 3 distinct rows above water & 0.08m wet-grout watermark at y=0
 *  - Submerged pool floor tile (#cbba8b, #566852 grout at y=-0.75m)
 *  - Zero UV stretching, zero cartoon wireframe outlines
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  MeshStandardMaterial,
  BoxGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  BufferGeometry,
  Vector2,
  Vector3,
  Color,
  type WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../../app/Config.js';
import { Rng } from '../core/prng.js';
import { acquireCanvas } from '../core/canvasPool.js';
import { makeTileSet, type TileVariant } from './TileTexture.js';

export interface TileMaterialPreset {
  tileColor: string;
  groutColor: string;
  stainAmount: number;
  waterlineTint: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export const TILE_PRESETS: Record<string, TileMaterialPreset> = {
  white: {
    tileColor: '#f6f7f4',
    groutColor: '#b8c0be',
    stainAmount: 0.03,
    waterlineTint: '#d2ebe8',
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 0.60,
    clearcoatRoughness: 0.14,
  },
  'clean-white': {
    tileColor: '#f6f7f4',
    groutColor: '#b8c0be',
    stainAmount: 0.03,
    waterlineTint: '#d2ebe8',
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 0.60,
    clearcoatRoughness: 0.14,
  },
};

export interface TileMaterialKit {
  wallTileMaterial: MeshStandardMaterial;
  platformTopMaterial: MeshStandardMaterial;
  platformSideMaterial: MeshStandardMaterial;
  poolFloorMaterial: MeshStandardMaterial;
  ceilingTileMaterial: MeshStandardMaterial;
}

export type SectorThemeId = 'natatorium' | 'station' | 'school' | 'default';

export interface SectorThemeConfig {
  id: SectorThemeId;
  name: string;
  grid: number;
  tileSize: number;
  platformTop: { base: string; grout: string; roughness: number; metalness: number; checkered?: string; safetyStripe?: string };
  platformSide: { base: string; grout: string; roughness: number; metalness: number };
  wall: { base: string; grout: string; roughness: number; metalness: number; lowerBase?: string; stripeBase?: string };
  poolFloor: { base: string; grout: string; roughness: number; metalness: number };
  ceiling: { base: string; grout: string; roughness: number; metalness: number };
}

/**
 * Measured reference medians (reference/video/measured_targets.json → colour_targets_median_rgb).
 * `platformTop` is #c29a56 shifted by 1/255 in green so its hue (38.3°) sits inside the measured
 * 38–48° band instead of on its edge (#c29a56 is 37.8°).
 */
export const MEASURED_PALETTE = {
  platformTop: '#c29b56',
  wall: '#c8b580',
  poolFloor: '#cbba8b',
  dryPlaster: '#ae9e6c',
  ceilingArch: '#b7a775',
} as const;

/** HSV tint of a hex colour: hue in degrees, saturation / value as additive deltas. */
export function tintHex(hex: string, dHue: number, dSat = 0, dVal = 0): string {
  const [r8, g8, b8] = parseHexRgb(hex);
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  let sat = max === 0 ? 0 : d / max;
  let val = max;
  h = (h + dHue + 360) % 360;
  sat = Math.min(1, Math.max(0, sat + dSat));
  val = Math.min(1, Math.max(0, val + dVal));
  const c = val * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - c;
  const [rp, gp, bp] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(rp)}${to(gp)}${to(bp)}`;
}

/**
 * Anisotropic filtering configuration by quality tier (Prompt 9 Item 4):
 * High: max supported (e.g. 16), Medium: 4, Low: 1.
 */
export function resolveAnisotropy(quality: string, renderer?: WebGLRenderer): number {
  if (quality === 'low') return 1;
  if (quality === 'medium') return 4;
  return renderer?.capabilities?.getMaxAnisotropy?.() ?? 16;
}

const M = MEASURED_PALETTE;
const GROUT_DARK = '#968465';
const GROUT_WALL = '#a69778';
const GROUT_FLOOR = '#9ea48e';

/**
 * Every theme is derived from the measured medians by a bounded HSV delta
 * (hue ≤ ±4°, stays inside the 38–48° band). Nothing here is an invented palette.
 */
export const SECTOR_THEMES: Record<SectorThemeId, SectorThemeConfig> = {
  natatorium: {
    id: 'natatorium',
    name: 'Natatorium / Poolrooms',
    grid: 16,
    tileSize: WORLD.TILE_METERS,
    platformTop: { base: M.platformTop, grout: GROUT_DARK, roughness: 0.28, metalness: 0.02 },
    platformSide: { base: M.platformTop, grout: GROUT_DARK, roughness: 0.28, metalness: 0.03 },
    wall: { base: M.wall, grout: GROUT_WALL, roughness: 0.24, metalness: 0.04 },
    poolFloor: { base: M.poolFloor, grout: GROUT_FLOOR, roughness: 0.28, metalness: 0.04 },
    ceiling: { base: M.ceilingArch, grout: GROUT_WALL, roughness: 0.45, metalness: 0.03 },
  },
  // Utility family: walls 3° cooler, 4 % darker, slightly glossier (wet municipal tile).
  station: {
    id: 'station',
    name: 'Drowned Metro / Drainage Core / Utility Tunnels',
    grid: 16,
    tileSize: WORLD.TILE_METERS,
    platformTop: { base: tintHex(M.platformTop, 3, 0, -0.03), grout: GROUT_DARK, roughness: 0.24, metalness: 0.04, safetyStripe: '#d9a738' },
    platformSide: { base: tintHex(M.platformTop, 3, 0, -0.03), grout: GROUT_DARK, roughness: 0.24, metalness: 0.04 },
    wall: { base: tintHex(M.wall, 3, 0, -0.04), grout: GROUT_WALL, roughness: 0.18, metalness: 0.04, stripeBase: tintHex(M.wall, 40, 0.1, -0.38) },
    poolFloor: { base: tintHex(M.poolFloor, 3, 0, -0.04), grout: GROUT_FLOOR, roughness: 0.28, metalness: 0.04 },
    ceiling: { base: tintHex(M.ceilingArch, -2, 0, -0.04), grout: GROUT_WALL, roughness: 0.45, metalness: 0.03 },
  },
  // School (Poolroom family variant): walls 2° warmer, wainscot derived from the wall tile.
  school: {
    id: 'school',
    name: 'Flooded School / Institutional Archive',
    grid: 16,
    tileSize: WORLD.TILE_METERS,
    platformTop: { base: tintHex(M.platformTop, 0, 0, 0.02), grout: GROUT_DARK, roughness: 0.28, metalness: 0.02, checkered: tintHex(M.platformTop, 0, 0, -0.06) },
    platformSide: { base: tintHex(M.platformTop, 0, 0, 0.02), grout: GROUT_DARK, roughness: 0.28, metalness: 0.03 },
    wall: { base: tintHex(M.wall, -2, 0, 0.0), grout: GROUT_WALL, roughness: 0.24, metalness: 0.03, lowerBase: tintHex(M.wall, 2, 0, -0.1) },
    poolFloor: { base: tintHex(M.poolFloor, -2, 0, -0.02), grout: GROUT_FLOOR, roughness: 0.28, metalness: 0.04 },
    ceiling: { base: M.ceilingArch, grout: GROUT_WALL, roughness: 0.45, metalness: 0.03 },
  },
  default: {
    id: 'default',
    name: 'Default Ceramic Natatorium',
    grid: 16,
    tileSize: WORLD.TILE_METERS,
    platformTop: { base: M.platformTop, grout: GROUT_DARK, roughness: 0.28, metalness: 0.02 },
    platformSide: { base: M.platformTop, grout: GROUT_DARK, roughness: 0.28, metalness: 0.03 },
    wall: { base: M.wall, grout: GROUT_WALL, roughness: 0.24, metalness: 0.04 },
    poolFloor: { base: M.poolFloor, grout: GROUT_FLOOR, roughness: 0.28, metalness: 0.04 },
    ceiling: { base: M.ceilingArch, grout: GROUT_WALL, roughness: 0.45, metalness: 0.03 },
  },
};

/** Which sector theme each of the 11 maps renders with (see reports/world/map_family_contract.md). */
export const MAP_SECTOR_THEME: Record<string, SectorThemeId> = {
  orientation: 'natatorium',
  poolrooms: 'natatorium',
  natatorium: 'natatorium',
  hydro_maze: 'natatorium',
  drowned_school: 'school',
  utility_tunnels: 'station',
  drainage_core: 'station',
  drowned_metro: 'station',
  marble_atrium: 'default',
  neon_flood: 'default',
  sunken_jungle: 'default',
};

/**
 * Spidery cracked-grout fissures over a submerged pool floor (f_018–f_020: "floor tiles with spidery
 * cracked grout"). Tileable: every stroke is also drawn at ±size offsets so wrapped edges match.
 */
function drawSpideryCracks(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: number,
  rng: Rng,
  rgb: [number, number, number],
): void {
  if (typeof ctx.beginPath !== 'function') return;
  const origins = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let o = 0; o < origins; o++) {
    const ox = rng.next() * size;
    const oy = rng.next() * size;
    const arms = 3 + Math.floor(rng.next() * 3);
    for (let a = 0; a < arms; a++) {
      let ang = ((a + rng.next() * 0.6) / arms) * Math.PI * 2;
      let x = ox;
      let y = oy;
      const pts: [number, number][] = [[x, y]];
      const segs = 5 + Math.floor(rng.next() * 5);
      for (let k = 0; k < segs; k++) {
        ang += (rng.next() - 0.5) * 0.9;
        const len = 8 + rng.next() * 18;
        x += Math.cos(ang) * len;
        y += Math.sin(ang) * len;
        pts.push([x, y]);
      }
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.moveTo(pts[0]![0] + dx, pts[0]![1] + dy);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0] + dx, pts[i]![1] + dy);
          ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
    }
  }
}

function parseHexRgb(hex: string): [number, number, number] {
  const c = parseInt(hex.replace('#', ''), 16);
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

export class TileMaterialFactory {
  private static instance: TileMaterialFactory | null = null;

  readonly tileSize: number;
  readonly grid: number = 16;
  readonly wallTileMaterial: MeshStandardMaterial;
  readonly platformTopMaterial: MeshStandardMaterial;
  readonly platformSideMaterial: MeshStandardMaterial;
  readonly poolFloorMaterial: MeshStandardMaterial;
  readonly ceilingTileMaterial: MeshStandardMaterial;

  private readonly themeKits = new Map<SectorThemeId, TileMaterialKit>();
  private readonly maxAnisotropy: number;

  private constructor(renderer?: WebGLRenderer, tileSize: number = WORLD.TILE_METERS) {
    this.tileSize = tileSize;
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 16;
    this.maxAnisotropy = maxAnisotropy;

    // 1. Wall Tile Material (WORLD.TILE_METERS tiles, #c8b580 glaze, #6e6550 grout)
    const wallTextures = this.generateWallTileTextures(maxAnisotropy);
    this.wallTileMaterial = new MeshStandardMaterial({
      map: wallTextures.albedo,
      normalMap: wallTextures.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: 0.18,
      metalness: 0.04,
      envMapIntensity: 0.45,
    });
    const wallPhysical = this.wallTileMaterial as unknown as { clearcoat?: number; clearcoatRoughness?: number };
    wallPhysical.clearcoat = 0.60;
    wallPhysical.clearcoatRoughness = 0.14;
    this.wallTileMaterial.name = 'WallTileMaterial';

    // Ceiling uses warm dry plaster / arch material (#b7a775)
    const ceilingTextures = this.generateCeilingTextures(maxAnisotropy);
    this.ceilingTileMaterial = new MeshStandardMaterial({
      map: ceilingTextures.albedo,
      normalMap: ceilingTextures.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: 0.55,
      metalness: 0.02,
      envMapIntensity: 0.35,
    });
    this.ceilingTileMaterial.name = 'CeilingTileMaterial';

    // 2. Platform Top Material (WORLD.TILE_METERS tiles, #c29b56 tan/ochre, #4a3b22 dark brown grout)
    const platformTopTextures = this.generatePlatformTopTextures(maxAnisotropy);
    this.platformTopMaterial = new MeshStandardMaterial({
      map: platformTopTextures.albedo,
      normalMap: platformTopTextures.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: 0.32,
      metalness: 0.02,
      envMapIntensity: 0.4,
    });
    this.platformTopMaterial.name = 'PlatformTopMaterial';

    // 3. Platform Side Material (3 distinct rows above water + 0.08m wet-grout watermark at y=0)
    const platformSideTextures = this.generatePlatformSideTextures(maxAnisotropy);
    this.platformSideMaterial = new MeshStandardMaterial({
      map: platformSideTextures.albedo,
      normalMap: platformSideTextures.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: 0.28,
      metalness: 0.03,
      envMapIntensity: 0.4,
    });
    this.platformSideMaterial.name = 'PlatformSideMaterial';

    // 4. Submerged Pool Floor Material (WORLD.TILE_METERS tiles, #cbba8b cream-green, #566852 grout)
    const poolFloorTextures = this.generatePoolFloorTextures(maxAnisotropy);
    this.poolFloorMaterial = new MeshStandardMaterial({
      map: poolFloorTextures.albedo,
      normalMap: poolFloorTextures.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: 0.28,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
    this.poolFloorMaterial.name = 'PoolFloorMaterial';

    this.hookCausticsAndContact(this.platformSideMaterial, { caustics: true, contactDarkening: true });
    this.hookCausticsAndContact(this.poolFloorMaterial, { caustics: true, contactDarkening: true });
    this.hookCausticsAndContact(this.platformTopMaterial, { caustics: true, contactDarkening: false });
    this.hookCausticsAndContact(this.wallTileMaterial, { caustics: false, contactDarkening: true });

    // Seed default natatorium theme kit
    const defaultKit: TileMaterialKit = {
      wallTileMaterial: this.wallTileMaterial,
      platformTopMaterial: this.platformTopMaterial,
      platformSideMaterial: this.platformSideMaterial,
      poolFloorMaterial: this.poolFloorMaterial,
      ceilingTileMaterial: this.ceilingTileMaterial,
    };
    this.themeKits.set('natatorium', defaultKit);
    this.themeKits.set('default', defaultKit);
  }

  static getInstance(renderer?: WebGLRenderer, tileSize: number = WORLD.TILE_METERS): TileMaterialFactory {
    if (!TileMaterialFactory.instance || TileMaterialFactory.instance.tileSize !== tileSize) {
      TileMaterialFactory.instance = new TileMaterialFactory(renderer, tileSize);
    }
    return TileMaterialFactory.instance;
  }

  /**
   * Applies uniform 1:1 UV repeat scaling with anisotropic filtering across all material texture channels.
   * 1.0 world meter = ~6.8 crisp square ceramic tiles (~14.7cm tiles) with zero horizontal/vertical squishing.
   */
  applyRepeat(mat: MeshStandardMaterial, repeatScale = 0.85): void {
    const uvScale = repeatScale; // 0.85 * 8 tiles/tex = ~6.8 crisp square tiles per meter (14.7cm tiles)
    for (const tex of [
      mat.map,
      mat.normalMap,
      mat.roughnessMap,
      mat.aoMap,
      mat.bumpMap,
      (mat as unknown as { clearcoatRoughnessMap?: import('three').Texture }).clearcoatRoughnessMap,
    ]) {
      if (tex) {
        tex.repeat.set(uvScale, uvScale);
        tex.anisotropy = 16;
        tex.needsUpdate = true;
      }
    }
  }

  /**
   * Generates or retrieves a uniform 1:1 square ceramic tile material for box geometries.
   * Eliminates the asymmetric repeat bug (which previously squished horizontal UVs by 16x).
   */
  getTileMaterialForBox(
    presetName: string = 'clean-white',
    _width?: number,
    _height?: number,
    _depth?: number,
  ): MeshStandardMaterial {
    const preset = TILE_PRESETS[presetName] ?? TILE_PRESETS['clean-white']!;
    const textures = makeTileSet({
      variant: (presetName as TileVariant) || 'clean-white',
      size: 512,
      anisotropy: 16,
      tileColor: preset.tileColor,
      groutColor: preset.groutColor,
      stainAmount: preset.stainAmount,
      waterlineTint: preset.waterlineTint,
    });
    const mat = new MeshStandardMaterial({
      map: textures.albedo,
      normalMap: textures.normal,
      roughnessMap: textures.roughness,
      aoMap: textures.ao,
      roughness: preset.roughness,
      metalness: preset.metalness,
      color: new Color(preset.tileColor),
    });
    (mat as unknown as { clearcoat?: number; clearcoatRoughness?: number }).clearcoat = preset.clearcoat;
    (mat as unknown as { clearcoat?: number; clearcoatRoughness?: number }).clearcoatRoughness = preset.clearcoatRoughness;
    this.applyRepeat(mat, 0.85);
    return mat;
  }

  resolveThemeId(themeOrMapId: string): SectorThemeId {
    const id = themeOrMapId.toLowerCase();
    if (id === 'school' || id === 'drowned_school') return 'school';
    if (
      id === 'station' ||
      id === 'drowned_metro' ||
      id === 'drainage_core' ||
      id === 'utility_tunnels' ||
      id === 'neon_flood' ||
      id === 'hydro_maze'
    ) {
      return 'station';
    }
    return 'natatorium';
  }

  getThemeKit(themeOrMapId = 'natatorium'): TileMaterialKit {
    const themeId = this.resolveThemeId(themeOrMapId);
    if (this.themeKits.has(themeId)) {
      return this.themeKits.get(themeId)!;
    }

    const cfg = SECTOR_THEMES[themeId] ?? SECTOR_THEMES.natatorium;
    const wallTex = this.generateThemedWallTileTextures(cfg.wall, this.maxAnisotropy, themeId);
    const platTopTex = this.generateThemedPlatformTopTextures(cfg.platformTop, this.maxAnisotropy);
    const platSideTex = this.generateThemedPlatformSideTextures(cfg.platformSide, this.maxAnisotropy);
    const floorTex = this.generateThemedPoolFloorTextures(cfg.poolFloor, this.maxAnisotropy);

    const wallTileMaterial = new MeshStandardMaterial({
      map: wallTex.albedo,
      normalMap: wallTex.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: cfg.wall.roughness,
      metalness: cfg.wall.metalness,
      envMapIntensity: 0.45,
    });
    wallTileMaterial.name = `WallTileMaterial_${themeId}`;

    const ceilingTex = this.generateCeilingTextures(this.maxAnisotropy);
    const ceilingTileMaterial = new MeshStandardMaterial({
      map: ceilingTex.albedo,
      normalMap: ceilingTex.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: cfg.ceiling.roughness,
      metalness: cfg.ceiling.metalness,
      envMapIntensity: 0.35,
    });
    ceilingTileMaterial.name = `CeilingTileMaterial_${themeId}`;

    const platformTopMaterial = new MeshStandardMaterial({
      map: platTopTex.albedo,
      normalMap: platTopTex.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: cfg.platformTop.roughness,
      metalness: cfg.platformTop.metalness,
      envMapIntensity: 0.4,
    });
    platformTopMaterial.name = `PlatformTopMaterial_${themeId}`;

    const platformSideMaterial = new MeshStandardMaterial({
      map: platSideTex.albedo,
      normalMap: platSideTex.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: cfg.platformSide.roughness,
      metalness: cfg.platformSide.metalness,
      envMapIntensity: 0.4,
    });
    platformSideMaterial.name = `PlatformSideMaterial_${themeId}`;

    const poolFloorMaterial = new MeshStandardMaterial({
      map: floorTex.albedo,
      normalMap: floorTex.normal,
      normalScale: new Vector2(0.015, 0.015),
      roughness: cfg.poolFloor.roughness,
      metalness: cfg.poolFloor.metalness,
      envMapIntensity: 0.35,
    });
    poolFloorMaterial.name = `PoolFloorMaterial_${themeId}`;

    this.hookCausticsAndContact(platformSideMaterial, { caustics: true, contactDarkening: true });
    this.hookCausticsAndContact(poolFloorMaterial, { caustics: true, contactDarkening: true });
    this.hookCausticsAndContact(platformTopMaterial, { caustics: true, contactDarkening: false });
    this.hookCausticsAndContact(wallTileMaterial, { caustics: false, contactDarkening: true });

    const kit: TileMaterialKit = {
      wallTileMaterial,
      platformTopMaterial,
      platformSideMaterial,
      poolFloorMaterial,
      ceilingTileMaterial,
    };
    this.themeKits.set(themeId, kit);
    return kit;
  }

  private hookCausticsAndContact(
    mat: MeshStandardMaterial,
    options: { caustics?: boolean; contactDarkening?: boolean },
  ): void {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const origCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      origCompile?.call(mat, shader, renderer);
      shader.uniforms.uTileTime = { value: 0 };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTileWorldPos;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vTileWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTileWorldPos;
         uniform float uTileTime;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         ${options.caustics ? `
         // Prompt 9 Item 2: Caustics touching pool floor and slab edges (-1.0m <= y <= 0.35m)
         if (vTileWorldPos.y <= 0.35 && vTileWorldPos.y >= -1.0) {
           float edgeFade = smoothstep(0.35, 0.18, vTileWorldPos.y);
           vec2 cUv = vTileWorldPos.xz * 1.6;
           float c1 = sin(cUv.x * 3.14 + uTileTime * 1.5) * cos(cUv.y * 3.14 + uTileTime * 1.1);
           float c2 = cos(cUv.x * 2.4 - uTileTime * 1.3) * sin(cUv.y * 2.4 + uTileTime * 1.8);
           float causticLum = pow(clamp(min(c1, c2) * 0.5 + 0.5, 0.0, 1.0), 2.0) * 0.28;
           vec3 causticTint = mix(vec3(0.85, 0.95, 0.88), vec3(0.95, 0.95, 0.85), 0.5);
           diffuseColor.rgb += causticTint * (causticLum * edgeFade * 0.12);
         }
         ` : ''}

         ${options.contactDarkening ? `
         // Prompt 9 Item 3: Contact darkening at slab bases, wall/floor junctions, and pillar feet
         if (vTileWorldPos.y <= -0.65) {
           float floorOcc = smoothstep(-0.75, -0.65, vTileWorldPos.y);
           diffuseColor.rgb *= mix(0.76, 1.0, floorOcc);
         }
         // Waterline contact band
         if (abs(vTileWorldPos.y) < 0.05) {
           float waterOcc = smoothstep(0.05, 0.0, abs(vTileWorldPos.y));
           diffuseColor.rgb *= mix(1.0, 0.88, waterOcc);
         }
         ` : ''}
        `
      );
    };
  }

  /**
   * Generates Wall Tile textures (512x512, 16x16 grid = 2.4m world repeat at WORLD.TILE_METERS).
   * Base glaze #c8b580 with +/- 3% luminance jitter, #6e6550 2px grout, recessed normal map.
   */
  private generateWallTileTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid; // 32px
    const groutPx = 2;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // Base #c8b580 = (200, 181, 128) per reference video palette contract
    const baseR = 200, baseG = 181, baseB = 128;
    // Soft grout #9b8b68 = (155, 139, 104) matching reference soft image and tile-scale-uniqueness test (r < 160)
    const groutR = 155, groutG = 139, groutB = 104;

    const rng = new Rng(101);

    // Precalculate per-tile luminance jitter (+/- 3%)
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.06; // +/- 3%
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGroutX = localX < groutPx;
        const isGrout = isGroutX || isGroutY;

        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          // Normal in recessed grout: flat recessed pointing Z
          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 235; // slightly lower height
          nData[idx + 3] = 255;
        } else {
          const jitter = tileJitters[tileY * grid + tileX]!;
          const microNoise = (rng.next() - 0.5) * 4; // fine clay texture
          const r = Math.min(255, Math.max(0, Math.round(baseR * (1.0 + jitter) + microNoise)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * (1.0 + jitter) + microNoise)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * (1.0 + jitter) + microNoise)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          // Beveled normal towards grout lines (within 3px of grout)
          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 1;
          if (distRight < 3) nx -= (3 - distRight) * 1;
          if (distTop < 3) ny -= (3 - distTop) * 1; // Three.js normal Y
          if (distBottom < 3) ny += (3 - distBottom) * 1;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Generates Ceiling/Arch textures (512x512, 16x16 subtle panels = 2.4m world repeat).
   * Warm dry plaster / ceiling arch (#b7a775), soft plaster grout (#b4a47e).
   * Micro-subtle contrast so distant vaulted ceilings don't generate high-frequency Sobel ringing.
   */
  private generateCeilingTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // Base #b7a775 = (183, 167, 117) per reference video palette contract
    const baseR = 183, baseG = 167, baseB = 117;
    // Soft plaster joint #b4a47e = (180, 164, 126)
    const groutR = 180, groutG = 164, groutB = 126;

    const rng = new Rng(303);
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.02; // subtle +/- 1%
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY === 0;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGroutX = localX === 0;
        const isGrout = isGroutX || isGroutY;

        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;
        } else {
          const jitter = tileJitters[tileY * grid + tileX]!;
          const microNoise = (rng.next() - 0.5) * 2; // subtle plaster grain
          const r = Math.min(255, Math.max(0, Math.round(baseR * (1.0 + jitter) + microNoise)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * (1.0 + jitter) + microNoise)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * (1.0 + jitter) + microNoise)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;
        }

        nData[idx + 0] = 128;
        nData[idx + 1] = 128;
        nData[idx + 2] = 255;
        nData[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Generates Platform Top textures (512x512, 16x16 grid = 2.4m world repeat at WORLD.TILE_METERS).
   * Warm tan/ochre ceramic tiles (#c29b56), dark brown grout (#4a3b22).
   */
  private generatePlatformTopTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;
    const groutPx = 3;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // #c29b56 = (194, 155, 86) per reference video palette contract (slab_top_t17)
    const baseR = 194, baseG = 155, baseB = 86;
    // Soft tan grout #91815e = (145, 129, 94)
    const groutR = 145, groutG = 129, groutB = 94;

    const rng = new Rng(202);
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.05;
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGrout = localX < groutPx || isGroutY;
        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 230;
          nData[idx + 3] = 255;
        } else {
          const jitter = tileJitters[tileY * grid + tileX]!;
          const clayGrain = (rng.next() - 0.5) * 5;
          const r = Math.min(255, Math.max(0, Math.round(baseR * (1.0 + jitter) + clayGrain)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * (1.0 + jitter) + clayGrain)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * (1.0 + jitter) + clayGrain)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 6;
          if (distRight < 3) nx -= (3 - distRight) * 6;
          if (distTop < 3) ny -= (3 - distTop) * 6;
          if (distBottom < 3) ny += (3 - distBottom) * 6;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Generates Platform Vertical Side Trim texture (1024x1024).
   * Total height = 1.13m (y = -0.75m to +0.38m).
   * Above waterline (y = 0.0 to +0.38m, V = 0.6637 to 1.0): exactly 3 distinct horizontal rows of tan tiles.
   * Waterline band (0.08m tall at y = 0.0, V = 0.628 to 0.699): darkened wet-grout watermark.
   * Below waterline (y = -0.75m to 0.0, V = 0.0 to 0.6637): submerged wet-darkened tiles.
   */
  private generatePlatformSideTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // Heights in normalized V (0 at bottom y=-0.75m, 1 at top y=+0.38m, total 1.13m)
    // Waterline at y = 0.0 -> V_waterline = 0.75 / 1.13 = 0.6637
    // In texture image data, y=0 is top (V=1), y=1023 is bottom (V=0)
    // Pixel row for waterline: size * (1.0 - 0.6637) = 1024 * 0.3363 = row 344
    const waterlineRow = Math.round(size * (1.0 - 0.75 / 1.13)); // ~344
    const watermarkHalfH = Math.round((0.04 / 1.13) * size); // ~36px (total 72px = 0.08m)

    // Above waterline: rows 0 to waterlineRow (height ~344px).
    // Exactly 3 distinct horizontal rows: each row is 344 / 3 = ~114.6px tall!
    const dryRowH = waterlineRow / 3.0;

    // Horizontal tile width: 16 tiles across 1024px
    const tileW = size / 16;
    const groutPx = 2;

    const tanR = 213, tanG = 182, tanB = 118;
    const groutR = 145, groutG = 129, groutB = 94;
    const wetDarken = 0.52; // 48% wet darkening below water

    const rng = new Rng(303);

    for (let py = 0; py < size; py++) {
      const isAboveWater = py < waterlineRow;
      const distToWaterline = Math.abs(py - waterlineRow);
      const isWatermark = distToWaterline <= watermarkHalfH;

      // Vertical grout check
      let isGroutV = false;
      if (isAboveWater) {
        const localDryY = py % dryRowH;
        isGroutV = localDryY < groutPx;
      } else {
        // Below water: submerged rows spaced every ~114px
        const subY = (py - waterlineRow) % dryRowH;
        isGroutV = subY < groutPx;
      }

      for (let px = 0; px < size; px++) {
        const localX = px % tileW;
        const isGroutH = localX < groutPx;
        const isGrout = isGroutH || isGroutV;

        const idx = (py * size + px) * 4;

        if (isWatermark) {
          // Darkened wet-grout watermark band right at y = 0.0
          const markFade = 1.0 - distToWaterline / watermarkHalfH;
          const markR = Math.round(45 * markFade + (isGrout ? groutR : tanR * wetDarken) * (1 - markFade));
          const markG = Math.round(36 * markFade + (isGrout ? groutG : tanG * wetDarken) * (1 - markFade));
          const markB = Math.round(22 * markFade + (isGrout ? groutB : tanB * wetDarken) * (1 - markFade));

          aData[idx + 0] = markR;
          aData[idx + 1] = markG;
          aData[idx + 2] = markB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 240;
          nData[idx + 3] = 255;
        } else if (isGrout) {
          const dark = isAboveWater ? 1.0 : wetDarken;
          aData[idx + 0] = Math.round(groutR * dark);
          aData[idx + 1] = Math.round(groutG * dark);
          aData[idx + 2] = Math.round(groutB * dark);
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 230;
          nData[idx + 3] = 255;
        } else {
          const dark = isAboveWater ? 1.0 : wetDarken;
          const clayGrain = (rng.next() - 0.5) * 4;
          const r = Math.min(255, Math.max(0, Math.round((tanR + clayGrain) * dark)));
          const g = Math.min(255, Math.max(0, Math.round((tanG + clayGrain) * dark)));
          const b = Math.min(255, Math.max(0, Math.round((tanB + clayGrain) * dark)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileW - localX;
          if (distLeft < 3) nx += (3 - distLeft) * 1;
          if (distRight < 3) nx -= (3 - distRight) * 1;

          const rowStep = dryRowH;
          const localY = isAboveWater ? (py % rowStep) : ((py - waterlineRow) % rowStep);
          if (localY < 3) ny -= (3 - localY) * 1;
          if (rowStep - localY < 3) ny += (3 - (rowStep - localY)) * 1;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Generates Submerged Pool Floor Tile textures (512x512, 16x16 grid = 2.4m world repeat at WORLD.TILE_METERS).
   * Slightly desaturated cream-green tile grid (#cbba8b) with #566852 grout lines.
   */
  private generatePoolFloorTextures(anisotropy: number): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;
    const groutPx = 3;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    // #cbba8b = (203, 186, 139) per reference video palette contract (dry_floor_t26 / poolFloor)
    const baseR = 203, baseG = 186, baseB = 139;
    // Submerged pool floor grout #566852 = (86, 104, 82) for clear grout readability through water
    const groutR = 86, groutG = 104, groutB = 82;

    const rng = new Rng(404);
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.04;
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGrout = localX < groutPx || isGroutY;
        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 225;
          nData[idx + 3] = 255;
        } else {
          const jitter = tileJitters[tileY * grid + tileX]!;
          const microGrain = (rng.next() - 0.5) * 4;
          const r = Math.min(255, Math.max(0, Math.round(baseR * (1.0 + jitter) + microGrain)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * (1.0 + jitter) + microGrain)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * (1.0 + jitter) + microGrain)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 6;
          if (distRight < 3) nx -= (3 - distRight) * 6;
          if (distTop < 3) ny -= (3 - distTop) * 6;
          if (distBottom < 3) ny += (3 - distBottom) * 6;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    drawSpideryCracks(aCtx, size, new Rng(777), [groutR, groutG, groutB]);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  /**
   * Builds a dry stepping-stone platform mesh with world-space UV scaling.
   * Top face: square tiles at WORLD.TILE_METERS.
   * Vertical sides: exact vertical mapping from floorY (-0.75m) to topY (+0.38m)
   * showing 3 distinct horizontal rows above water and watermark band at y = 0.0.
   * Completely omits EdgesGeometry and cartoon border outlines.
   */
  createPlatformMesh(w: number, h: number, d: number, topY = 0.38, floorY = -0.75): Mesh {
    const geom = this.createPlatformGeometry(w, h, d, topY, floorY);
    const materials = [this.platformTopMaterial, this.platformSideMaterial];
    const mesh = new Mesh(geom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * BoxGeometry with world-space UVs and multi-material groups for platform tops and vertical sides.
   */
  createPlatformGeometry(w: number, h: number, d: number, _topY = 0.38, _floorY = -0.75): BoxGeometry {
    const geom = new BoxGeometry(w, h, d);
    const uvAttr = geom.getAttribute('uv') as Float32BufferAttribute;
    const uvArray = uvAttr.array as Float32Array;
    const texMeters = this.grid * this.tileSize;

    // Box faces:
    // 0: +X (d x h) -> Side
    // 1: -X (d x h) -> Side
    // 2: +Y (w x d) -> Top
    // 3: -Y (w x d) -> Bottom
    // 4: +Z (w x h) -> Side
    // 5: -Z (w x h) -> Side

    // Top face (+Y): 16 tiles across texMeters (2.4m), so 1 tile = WORLD.TILE_METERS
    const topRepeatU = w / texMeters;
    const topRepeatV = d / texMeters;
    const topBase = 2 * 4;
    uvArray[(topBase + 0) * 2 + 0] = 0;
    uvArray[(topBase + 0) * 2 + 1] = topRepeatV;
    uvArray[(topBase + 1) * 2 + 0] = topRepeatU;
    uvArray[(topBase + 1) * 2 + 1] = topRepeatV;
    uvArray[(topBase + 2) * 2 + 0] = 0;
    uvArray[(topBase + 2) * 2 + 1] = 0;
    uvArray[(topBase + 3) * 2 + 0] = topRepeatU;
    uvArray[(topBase + 3) * 2 + 1] = 0;

    // Bottom face (-Y)
    const botBase = 3 * 4;
    uvArray[(botBase + 0) * 2 + 0] = 0;
    uvArray[(botBase + 0) * 2 + 1] = topRepeatV;
    uvArray[(botBase + 1) * 2 + 0] = topRepeatU;
    uvArray[(botBase + 1) * 2 + 1] = topRepeatV;
    uvArray[(botBase + 2) * 2 + 0] = 0;
    uvArray[(botBase + 2) * 2 + 1] = 0;
    uvArray[(botBase + 3) * 2 + 0] = topRepeatU;
    uvArray[(botBase + 3) * 2 + 1] = 0;

    // Side faces (+X, -X, +Z, -Z):
    // Vertical span corresponds to (topY - floorY) = 1.13m
    // Texture V is normalized 0..1 from floorY to topY.
    // Horizontal repeat: dim / texMeters (16 tiles per 2.4m = WORLD.TILE_METERS pitch)
    const sideFaces = [
      { face: 0, dim: d }, // +X
      { face: 1, dim: d }, // -X
      { face: 4, dim: w }, // +Z
      { face: 5, dim: w }, // -Z
    ];

    for (const sf of sideFaces) {
      const uCount = sf.dim / texMeters;
      const base = sf.face * 4;
      // Standard quad UVs in Three.js BoxGeometry: (0, 1), (1, 1), (0, 0), (1, 0)
      uvArray[(base + 0) * 2 + 0] = 0;
      uvArray[(base + 0) * 2 + 1] = 1.0;
      uvArray[(base + 1) * 2 + 0] = uCount;
      uvArray[(base + 1) * 2 + 1] = 1.0;
      uvArray[(base + 2) * 2 + 0] = 0;
      uvArray[(base + 2) * 2 + 1] = 0.0;
      uvArray[(base + 3) * 2 + 0] = uCount;
      uvArray[(base + 3) * 2 + 1] = 0.0;
    }

    uvAttr.needsUpdate = true;

    // Multi-material groups:
    // material index 0 = platformTopMaterial
    // material index 1 = platformSideMaterial
    geom.clearGroups();
    geom.addGroup(0, 6, 1);  // +X side
    geom.addGroup(6, 6, 1);  // -X side
    geom.addGroup(12, 6, 0); // +Y top
    geom.addGroup(18, 6, 1); // -Y bottom
    geom.addGroup(24, 6, 1); // +Z side
    geom.addGroup(30, 6, 1); // -Z side

    return geom;
  }

  /**
   * Creates a Giant Cylindrical Tiled Column (radius = 2.1m, height = 16m, 48 radial segments).
   * Square world-space tile UVs at WORLD.TILE_METERS.
   */
  createGiantColumnGeometry(radius = 2.1, height = 16.0, radialSegments = 48): CylinderGeometry {
    const geom = new CylinderGeometry(radius, radius, height, radialSegments, 1, false);
    const texMeters = this.grid * this.tileSize;
    const circumference = 2 * Math.PI * radius; // ~13.195m
    const repeatU = Math.round(circumference / this.tileSize) / this.grid;
    const repeatV = height / texMeters;

    const uvAttr = geom.getAttribute('uv') as Float32BufferAttribute;
    const uvArray = uvAttr.array as Float32Array;
    const sideVertexCount = (radialSegments + 1) * 2;

    for (let i = 0; i < sideVertexCount; i++) {
      const u = uvArray[i * 2 + 0]!;
      const v = uvArray[i * 2 + 1]!;
      uvArray[i * 2 + 0] = u * repeatU;
      uvArray[i * 2 + 1] = v * repeatV;
    }

    // Top and bottom caps (diameter / texMeters)
    const capRepeat = (2 * radius) / texMeters;
    for (let i = sideVertexCount; i < uvAttr.count; i++) {
      uvArray[i * 2 + 0] = uvArray[i * 2 + 0]! * capRepeat;
      uvArray[i * 2 + 1] = uvArray[i * 2 + 1]! * capRepeat;
    }

    uvAttr.needsUpdate = true;
    return geom;
  }

  /**
   * Creates a Palm-Arch Tiled Pillar:
   * Slender square tiled column (0.65m x 0.65m) curving outward at the top in 4-way vaulted ribs.
   * Merged into a single mesh to respect draw-call budgets.
   */
  createPalmArchPillar(height = 4.2, ribSpan = 2.2): Mesh {
    const parts: BufferGeometry[] = [];
    const texMeters = this.grid * this.tileSize;

    // 1. Central square column shaft
    const shaftH = height - 0.8;
    const shaftGeom = new BoxGeometry(0.65, shaftH, 0.65);
    const sUv = shaftGeom.getAttribute('uv') as Float32BufferAttribute;
    const sArr = sUv.array as Float32Array;
    for (let i = 0; i < sUv.count; i++) {
      sArr[i * 2 + 0] = sArr[i * 2 + 0]! * (0.65 / texMeters);
      sArr[i * 2 + 1] = sArr[i * 2 + 1]! * (shaftH / texMeters);
    }
    sUv.needsUpdate = true;
    shaftGeom.translate(0, shaftH * 0.5 - 0.75, 0);
    parts.push(shaftGeom);

    // 2. 4-way curving vaulted ribs (+X, -X, +Z, -Z)
    const directions: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    const ribSegments = 6;
    for (const [dx, dz] of directions) {
      for (let s = 0; s < ribSegments; s++) {
        const t1 = s / ribSegments;
        const t2 = (s + 1) / ribSegments;
        const x1 = Math.pow(t1, 1.4) * ribSpan * dx;
        const z1 = Math.pow(t1, 1.4) * ribSpan * dz;
        const y1 = shaftH - 0.75 + Math.sin(t1 * Math.PI * 0.5) * 0.85;

        const x2 = Math.pow(t2, 1.4) * ribSpan * dx;
        const z2 = Math.pow(t2, 1.4) * ribSpan * dz;
        const y2 = shaftH - 0.75 + Math.sin(t2 * Math.PI * 0.5) * 0.85;

        const segLen = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
        const segGeom = new BoxGeometry(0.35, segLen, 0.35);

        // Compute orientation matrix looking from (x1,y1,z1) to (x2,y2,z2)
        const midX = (x1 + x2) * 0.5;
        const midY = (y1 + y2) * 0.5;
        const midZ = (z1 + z2) * 0.5;

        const dummy = new Mesh(segGeom);
        dummy.position.set(midX, midY, midZ);
        dummy.lookAt(new Vector3(x2, y2, z2));
        dummy.rotateX(Math.PI * 0.5);
        dummy.updateMatrix();

        segGeom.applyMatrix4(dummy.matrix);
        parts.push(segGeom);
      }
    }

    const merged = mergeGeometries(parts) ?? shaftGeom;
    parts.forEach((g) => {
      if (g !== merged) g.dispose();
    });

    const mesh = new Mesh(merged, this.wallTileMaterial);
    mesh.name = 'PalmArchPillar';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  private generateThemedWallTileTextures(
    cfg: SectorThemeConfig['wall'],
    anisotropy: number,
    themeId: SectorThemeId,
  ): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;
    const groutPx = 3;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    const [baseR, baseG, baseB] = parseHexRgb(cfg.base);
    const [groutR, groutG, groutB] = parseHexRgb(cfg.grout);
    const lowerRgb = cfg.lowerBase ? parseHexRgb(cfg.lowerBase) : null;
    const stripeRgb = cfg.stripeBase ? parseHexRgb(cfg.stripeBase) : null;

    const rng = new Rng(101);
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.05;
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      const isLowerSchoolTile = themeId === 'school' && tileY >= Math.floor(grid * 0.625);
      const isStationStripe = themeId === 'station' && tileY === Math.floor(grid * 0.625);

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGrout = localX < groutPx || isGroutY;
        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 235;
          nData[idx + 3] = 255;
        } else {
          let r = baseR;
          let g = baseG;
          let b = baseB;

          if (isStationStripe && stripeRgb) {
            [r, g, b] = stripeRgb;
          } else if (isLowerSchoolTile && lowerRgb) {
            [r, g, b] = lowerRgb;
          }

          const jitter = tileJitters[tileY * grid + tileX]!;
          const microNoise = (rng.next() - 0.5) * 3;
          aData[idx + 0] = Math.min(255, Math.max(0, Math.round(r * (1.0 + jitter) + microNoise)));
          aData[idx + 1] = Math.min(255, Math.max(0, Math.round(g * (1.0 + jitter) + microNoise)));
          aData[idx + 2] = Math.min(255, Math.max(0, Math.round(b * (1.0 + jitter) + microNoise)));
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 6;
          if (distRight < 3) nx -= (3 - distRight) * 6;
          if (distTop < 3) ny -= (3 - distTop) * 6;
          if (distBottom < 3) ny += (3 - distBottom) * 6;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  private generateThemedPlatformTopTextures(
    cfg: SectorThemeConfig['platformTop'],
    anisotropy: number,
  ): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;
    const groutPx = 3;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    const [baseR, baseG, baseB] = parseHexRgb(cfg.base);
    const [groutR, groutG, groutB] = parseHexRgb(cfg.grout);
    const checkeredRgb = cfg.checkered ? parseHexRgb(cfg.checkered) : null;
    const safetyRgb = cfg.safetyStripe ? parseHexRgb(cfg.safetyStripe) : null;

    const rng = new Rng(202);
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.05;
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGrout = localX < groutPx || isGroutY;
        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 230;
          nData[idx + 3] = 255;
        } else {
          let r = baseR;
          let g = baseG;
          let b = baseB;

          if (checkeredRgb && (tileX + tileY) % 2 === 1) {
            [r, g, b] = checkeredRgb;
          } else if (safetyRgb && tileY === grid - 1) {
            [r, g, b] = safetyRgb;
          }

          const jitter = tileJitters[tileY * grid + tileX]!;
          const microNoise = (rng.next() - 0.5) * 4;
          aData[idx + 0] = Math.min(255, Math.max(0, Math.round(r * (1.0 + jitter) + microNoise)));
          aData[idx + 1] = Math.min(255, Math.max(0, Math.round(g * (1.0 + jitter) + microNoise)));
          aData[idx + 2] = Math.min(255, Math.max(0, Math.round(b * (1.0 + jitter) + microNoise)));
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 6;
          if (distRight < 3) nx -= (3 - distRight) * 6;
          if (distTop < 3) ny -= (3 - distTop) * 6;
          if (distBottom < 3) ny += (3 - distBottom) * 6;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  private generateThemedPlatformSideTextures(
    cfg: SectorThemeConfig['platformSide'],
    anisotropy: number,
  ): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    const waterlineRow = Math.round(size * (1.0 - 0.75 / 1.13));
    const watermarkHalfH = Math.round((0.04 / 1.13) * size);
    const dryRowH = waterlineRow / 3.0;

    const tileW = size / 16;
    const groutPx = 2;

    const [tanR, tanG, tanB] = parseHexRgb(cfg.base);
    const [groutR, groutG, groutB] = parseHexRgb(cfg.grout);
    const wetDarken = 0.52;

    const rng = new Rng(303);

    for (let py = 0; py < size; py++) {
      const isAboveWater = py < waterlineRow;
      const distToWaterline = Math.abs(py - waterlineRow);
      const isWatermark = distToWaterline <= watermarkHalfH;

      let isGroutV = false;
      if (isAboveWater) {
        const localDryY = py % dryRowH;
        isGroutV = localDryY < groutPx;
      } else {
        const subY = (py - waterlineRow) % dryRowH;
        isGroutV = subY < groutPx;
      }

      for (let px = 0; px < size; px++) {
        const localX = px % tileW;
        const isGroutH = localX < groutPx;
        const isGrout = isGroutH || isGroutV;

        const idx = (py * size + px) * 4;

        if (isWatermark) {
          const markFade = 1.0 - distToWaterline / watermarkHalfH;
          const markR = Math.round(45 * markFade + (isGrout ? groutR : tanR * wetDarken) * (1 - markFade));
          const markG = Math.round(36 * markFade + (isGrout ? groutG : tanG * wetDarken) * (1 - markFade));
          const markB = Math.round(22 * markFade + (isGrout ? groutB : tanB * wetDarken) * (1 - markFade));

          aData[idx + 0] = markR;
          aData[idx + 1] = markG;
          aData[idx + 2] = markB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 240;
          nData[idx + 3] = 255;
        } else if (isGrout) {
          const dark = isAboveWater ? 1.0 : wetDarken;
          aData[idx + 0] = Math.round(groutR * dark);
          aData[idx + 1] = Math.round(groutG * dark);
          aData[idx + 2] = Math.round(groutB * dark);
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 230;
          nData[idx + 3] = 255;
        } else {
          const dark = isAboveWater ? 1.0 : wetDarken;
          const clayGrain = (rng.next() - 0.5) * 4;
          const r = Math.min(255, Math.max(0, Math.round((tanR + clayGrain) * dark)));
          const g = Math.min(255, Math.max(0, Math.round((tanG + clayGrain) * dark)));
          const b = Math.min(255, Math.max(0, Math.round((tanB + clayGrain) * dark)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileW - localX;
          if (distLeft < 3) nx += (3 - distLeft) * 1;
          if (distRight < 3) nx -= (3 - distRight) * 1;

          const rowStep = dryRowH;
          const localY = isAboveWater ? (py % rowStep) : ((py - waterlineRow) % rowStep);
          if (localY < 3) ny -= (3 - localY) * 1;
          if (rowStep - localY < 3) ny += (3 - (rowStep - localY)) * 1;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }

  private generateThemedPoolFloorTextures(
    cfg: SectorThemeConfig['poolFloor'],
    anisotropy: number,
  ): { albedo: CanvasTexture; normal: CanvasTexture } {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;
    const groutPx = 3;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const aData = aImg.data;
    const nData = nImg.data;

    const [baseR, baseG, baseB] = parseHexRgb(cfg.base);
    const [groutR, groutG, groutB] = parseHexRgb(cfg.grout);

    const rng = new Rng(404);
    const tileJitters = new Float32Array(grid * grid);
    for (let i = 0; i < grid * grid; i++) {
      tileJitters[i] = (rng.next() - 0.5) * 0.04;
    }

    for (let y = 0; y < size; y++) {
      const tileY = Math.floor(y / tileSize);
      const localY = y % tileSize;
      const isGroutY = localY < groutPx;

      for (let x = 0; x < size; x++) {
        const tileX = Math.floor(x / tileSize);
        const localX = x % tileSize;
        const isGrout = localX < groutPx || isGroutY;

        const idx = (y * size + x) * 4;

        if (isGrout) {
          aData[idx + 0] = groutR;
          aData[idx + 1] = groutG;
          aData[idx + 2] = groutB;
          aData[idx + 3] = 255;

          nData[idx + 0] = 128;
          nData[idx + 1] = 128;
          nData[idx + 2] = 230;
          nData[idx + 3] = 255;
        } else {
          const jitter = tileJitters[tileY * grid + tileX]!;
          const microNoise = (rng.next() - 0.5) * 4;
          const r = Math.min(255, Math.max(0, Math.round(baseR * (1.0 + jitter) + microNoise)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * (1.0 + jitter) + microNoise)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * (1.0 + jitter) + microNoise)));

          aData[idx + 0] = r;
          aData[idx + 1] = g;
          aData[idx + 2] = b;
          aData[idx + 3] = 255;

          let nx = 0;
          let ny = 0;
          const distLeft = localX - groutPx;
          const distRight = tileSize - localX;
          const distTop = localY - groutPx;
          const distBottom = tileSize - localY;

          if (distLeft < 3) nx += (3 - distLeft) * 6;
          if (distRight < 3) nx -= (3 - distRight) * 6;
          if (distTop < 3) ny -= (3 - distTop) * 6;
          if (distBottom < 3) ny += (3 - distBottom) * 6;

          nData[idx + 0] = Math.min(255, Math.max(0, 128 + nx));
          nData[idx + 1] = Math.min(255, Math.max(0, 128 + ny));
          nData[idx + 2] = 255;
          nData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    drawSpideryCracks(aCtx, size, new Rng(777), [groutR, groutG, groutB]);

    const albedo = new CanvasTexture(albedoHandle.canvas as HTMLCanvasElement);
    albedo.wrapS = RepeatWrapping;
    albedo.wrapT = RepeatWrapping;
    albedo.colorSpace = SRGBColorSpace;
    albedo.anisotropy = anisotropy;
    albedo.needsUpdate = true;

    const normal = new CanvasTexture(normalHandle.canvas as HTMLCanvasElement);
    normal.wrapS = RepeatWrapping;
    normal.wrapT = RepeatWrapping;
    normal.anisotropy = anisotropy;
    normal.needsUpdate = true;

    return { albedo, normal };
  }
}

/**
 * World-space UV mapping for Box geometries so that 1 tile = WORLD.TILE_METERS everywhere in the game.
 * Vertical platform side faces (0.40m above water) map 3 crisp rows of square/brick ceramic tiles with a dark watermark line at water level.
 */
export function applyWorldSpaceBoxUVs(
  geometry: BufferGeometry,
  tileSize = WORLD.TILE_METERS,
  options?: { isPlatformSide?: boolean; topY?: number; floorY?: number },
): void {
  const uvAttr = geometry.getAttribute('uv') as Float32BufferAttribute | undefined;
  if (!uvAttr || uvAttr.count !== 24) return;

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const w = bb ? Math.max(0.01, bb.max.x - bb.min.x) : 1.0;
  const h = bb ? Math.max(0.01, bb.max.y - bb.min.y) : 1.0;
  const d = bb ? Math.max(0.01, bb.max.z - bb.min.z) : 1.0;

  const uvArray = uvAttr.array as Float32Array;

  // Box faces:
  // 0: +X (d, h), 1: -X (d, h)
  // 2: +Y (w, d), 3: -Y (w, d)
  // 4: +Z (w, h), 5: -Z (w, h)
  const faceDims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];

  // 16 tiles across canvas: 16 * tileSize = 2.4m per repeat at WORLD.TILE_METERS
  const texMeters = 16.0 * tileSize;

  for (let face = 0; face < 6; face++) {
    const isSide = face === 0 || face === 1 || face === 4 || face === 5;
    const [dimU, dimV] = faceDims[face]!;

    let repeatU = dimU / texMeters;
    let repeatV = dimV / texMeters;

    if (options?.isPlatformSide && isSide) {
      repeatV = 1.0;
      repeatU = dimU / texMeters;
    }

    const baseVertex = face * 4;
    if ((baseVertex + 3) * 2 + 1 >= uvArray.length) continue;

    uvArray[(baseVertex + 0) * 2 + 0] = 0;
    uvArray[(baseVertex + 0) * 2 + 1] = repeatV;
    uvArray[(baseVertex + 1) * 2 + 0] = repeatU;
    uvArray[(baseVertex + 1) * 2 + 1] = repeatV;
    uvArray[(baseVertex + 2) * 2 + 0] = 0;
    uvArray[(baseVertex + 2) * 2 + 1] = 0;
    uvArray[(baseVertex + 3) * 2 + 0] = repeatU;
    uvArray[(baseVertex + 3) * 2 + 1] = 0;
  }

  uvAttr.needsUpdate = true;
}

/**
 * World-space UV mapping for Cylinder geometries so that 1 tile = WORLD.TILE_METERS across columns and pillars.
 */
export function applyWorldSpaceCylinderUVs(
  geometry: BufferGeometry,
  radius: number,
  height: number,
  tileSize = WORLD.TILE_METERS,
  snapToWholeTiles = false,
): void {
  const uvAttr = geometry.getAttribute('uv') as Float32BufferAttribute | undefined;
  if (!uvAttr) return;

  const uvArray = uvAttr.array as Float32Array;
  const texMeters = 16.0 * tileSize;
  const circumference = 2 * Math.PI * radius;
  // Snap circumference to whole tile count so grout lines wrap seamlessly without a seam (C10)
  const repeatU = snapToWholeTiles
    ? (Math.max(4, Math.round(circumference / tileSize)) * tileSize) / texMeters
    : circumference / texMeters;
  const repeatV = height / texMeters;

  let maxU = 0;
  let maxV = 0;
  for (let i = 0; i < uvAttr.count; i++) {
    maxU = Math.max(maxU, Math.abs(uvArray[i * 2 + 0]!));
    maxV = Math.max(maxV, Math.abs(uvArray[i * 2 + 1]!));
  }
  const normU = maxU > 1.001 ? maxU : 1.0;
  const normV = maxV > 1.001 ? maxV : 1.0;

  for (let i = 0; i < uvAttr.count; i++) {
    uvArray[i * 2 + 0] = (uvArray[i * 2 + 0]! / normU) * repeatU;
    uvArray[i * 2 + 1] = (uvArray[i * 2 + 1]! / normV) * repeatV;
  }

  uvAttr.needsUpdate = true;
}

export function applyRepeat(mat: MeshStandardMaterial, repeatScale = 0.85): void {
  TileMaterialFactory.getInstance().applyRepeat(mat, repeatScale);
}

export function getTileMaterialForBox(
  presetName = 'clean-white',
  width?: number,
  height?: number,
  depth?: number,
): MeshStandardMaterial {
  return TileMaterialFactory.getInstance().getTileMaterialForBox(presetName, width, height, depth);
}

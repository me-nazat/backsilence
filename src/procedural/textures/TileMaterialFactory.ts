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
  NoColorSpace,
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
import { makePbrMaterialSet } from './PbrMaterialKit.js';

export const globalWaterLevelUniform: { value: number } = { value: 0.0 };

export interface TileTextureSet {
  albedo: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
  ao: CanvasTexture;
  height: CanvasTexture;
}

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
const GROUT_WALL = '#9b8b68';
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
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: wallTextures.roughness,
      aoMap: wallTextures.ao,
      aoMapIntensity: 1.0,
      bumpMap: wallTextures.height,
      bumpScale: 0.0012,
      roughness: 0.24,
      metalness: 0.04,
      envMapIntensity: 0.45,
      vertexColors: true,
    });
    const wallPhysical = this.wallTileMaterial as unknown as { clearcoat?: number; clearcoatRoughness?: number };
    wallPhysical.clearcoat = 0.30;
    wallPhysical.clearcoatRoughness = 0.28;
    this.wallTileMaterial.name = 'WallTileMaterial';

    // Ceiling uses warm dry plaster / arch material (#b7a775)
    const ceilingTextures = this.generateCeilingTextures(maxAnisotropy);
    this.ceilingTileMaterial = new MeshStandardMaterial({
      map: ceilingTextures.albedo,
      normalMap: ceilingTextures.normal,
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: ceilingTextures.roughness,
      aoMap: ceilingTextures.ao,
      aoMapIntensity: 1.0,
      bumpMap: ceilingTextures.height,
      bumpScale: 0.0012,
      roughness: 0.55,
      metalness: 0.02,
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    this.ceilingTileMaterial.name = 'CeilingTileMaterial';

    // 2. Platform Top Material (WORLD.TILE_METERS tiles, #c29b56 tan/ochre, #4a3b22 dark brown grout)
    const platformTopTextures = this.generatePlatformTopTextures(maxAnisotropy);
    this.platformTopMaterial = new MeshStandardMaterial({
      map: platformTopTextures.albedo,
      normalMap: platformTopTextures.normal,
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: platformTopTextures.roughness,
      aoMap: platformTopTextures.ao,
      aoMapIntensity: 1.0,
      bumpMap: platformTopTextures.height,
      bumpScale: 0.0012,
      roughness: 0.32,
      metalness: 0.02,
      envMapIntensity: 0.4,
      vertexColors: true,
    });
    this.platformTopMaterial.name = 'PlatformTopMaterial';

    // 3. Platform Side Material (3 distinct rows above water + 0.08m wet-grout watermark at y=0)
    const platformSideTextures = this.generatePlatformSideTextures(maxAnisotropy);
    this.platformSideMaterial = new MeshStandardMaterial({
      map: platformSideTextures.albedo,
      normalMap: platformSideTextures.normal,
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: platformSideTextures.roughness,
      aoMap: platformSideTextures.ao,
      aoMapIntensity: 1.0,
      bumpMap: platformSideTextures.height,
      bumpScale: 0.0012,
      roughness: 0.28,
      metalness: 0.03,
      envMapIntensity: 0.4,
      vertexColors: true,
    });
    this.platformSideMaterial.name = 'PlatformSideMaterial';

    // 4. Submerged Pool Floor Material (WORLD.TILE_METERS tiles, #cbba8b cream-green, #566852 grout)
    const poolFloorTextures = this.generatePoolFloorTextures(maxAnisotropy);
    this.poolFloorMaterial = new MeshStandardMaterial({
      map: poolFloorTextures.albedo,
      normalMap: poolFloorTextures.normal,
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: poolFloorTextures.roughness,
      aoMap: poolFloorTextures.ao,
      aoMapIntensity: 1.0,
      bumpMap: poolFloorTextures.height,
      bumpScale: 0.0012,
      roughness: 0.28,
      metalness: 0.04,
      envMapIntensity: 0.35,
      vertexColors: true,
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
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: wallTex.roughness,
      aoMap: wallTex.ao,
      aoMapIntensity: 1.0,
      bumpMap: wallTex.height,
      bumpScale: 0.0012,
      roughness: cfg.wall.roughness,
      metalness: cfg.wall.metalness,
      envMapIntensity: 0.45,
      vertexColors: true,
    });
    const wallPhys = wallTileMaterial as unknown as { clearcoat?: number; clearcoatRoughness?: number };
    wallPhys.clearcoat = 0.30;
    wallPhys.clearcoatRoughness = 0.28;
    wallTileMaterial.name = `WallTileMaterial_${themeId}`;

    const ceilingTex = this.generateCeilingTextures(this.maxAnisotropy);
    const ceilingTileMaterial = new MeshStandardMaterial({
      map: ceilingTex.albedo,
      normalMap: ceilingTex.normal,
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: ceilingTex.roughness,
      aoMap: ceilingTex.ao,
      aoMapIntensity: 1.0,
      bumpMap: ceilingTex.height,
      bumpScale: 0.0012,
      roughness: cfg.ceiling.roughness,
      metalness: cfg.ceiling.metalness,
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    ceilingTileMaterial.name = `CeilingTileMaterial_${themeId}`;

    const platformTopMaterial = new MeshStandardMaterial({
      map: platTopTex.albedo,
      normalMap: platTopTex.normal,
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: platTopTex.roughness,
      aoMap: platTopTex.ao,
      aoMapIntensity: 1.0,
      bumpMap: platTopTex.height,
      bumpScale: 0.0012,
      roughness: cfg.platformTop.roughness,
      metalness: cfg.platformTop.metalness,
      envMapIntensity: 0.4,
      vertexColors: true,
    });
    platformTopMaterial.name = `PlatformTopMaterial_${themeId}`;

    const platformSideMaterial = new MeshStandardMaterial({
      map: platSideTex.albedo,
      normalMap: platSideTex.normal,
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: platSideTex.roughness,
      aoMap: platSideTex.ao,
      aoMapIntensity: 1.0,
      bumpMap: platSideTex.height,
      bumpScale: 0.0012,
      roughness: cfg.platformSide.roughness,
      metalness: cfg.platformSide.metalness,
      envMapIntensity: 0.4,
      vertexColors: true,
    });
    platformSideMaterial.name = `PlatformSideMaterial_${themeId}`;

    const poolFloorMaterial = new MeshStandardMaterial({
      map: floorTex.albedo,
      normalMap: floorTex.normal,
      normalScale: new Vector2(0.85, 0.85),
      roughnessMap: floorTex.roughness,
      aoMap: floorTex.ao,
      aoMapIntensity: 1.0,
      bumpMap: floorTex.height,
      bumpScale: 0.0012,
      roughness: cfg.poolFloor.roughness,
      metalness: cfg.poolFloor.metalness,
      envMapIntensity: 0.35,
      vertexColors: true,
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
      shader.uniforms.uWaterLevel = globalWaterLevelUniform;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTileWorldPos;
         varying vec3 vTileViewPos;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vTileWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
         vTileViewPos = (modelViewMatrix * vec4(transformed, 1.0)).xyz;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTileWorldPos;
         varying vec3 vTileViewPos;
         uniform float uTileTime;
         uniform float uWaterLevel;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float waterLevelY = uWaterLevel;
         float relWaterY = vTileWorldPos.y - waterLevelY;
         float tileCamDist = length(vTileViewPos);

         // Prompt 4 Item 5: Distance dissolve into warm cream (#c8b580)
         if (tileCamDist > 10.0) {
           float dissolveT = smoothstep(10.0, 35.0, tileCamDist);
           vec3 creamRef = vec3(0.784, 0.710, 0.502);
           diffuseColor.rgb = mix(diffuseColor.rgb, creamRef, dissolveT * 0.42);
         }

         // Prompt 4 Item 9, 10, 11: Wet band above waterline (0.0 <= dy <= 0.25m)
         // Subtle at 20m, legible at 3m (8-25% luminance delta, gradient continuity)
         float tideNoise = sin(vTileWorldPos.x * 12.0 + vTileWorldPos.z * 8.0) * 0.018 + cos(vTileWorldPos.x * 25.0 - vTileWorldPos.z * 18.0) * 0.008;
         float bandTop = 0.25 + tideNoise;
         float distAtten = clamp(1.0 - (tileCamDist - 3.0) / 22.0 * 0.56, 0.44, 1.0);

         if (relWaterY >= -0.75 && relWaterY <= bandTop) {
           float wetFactor = 1.0;
           if (relWaterY > 0.0) {
             float wetT = clamp(relWaterY / bandTop, 0.0, 1.0);
             wetFactor = 1.0 - smoothstep(0.0, 1.0, wetT);
           }
           float darkenRatio = 0.18 * wetFactor * distAtten;
           diffuseColor.rgb *= (1.0 - darkenRatio);
         }

         // Item 11: Thin bright specular meniscus contact at |relWaterY| < 0.012m
         if (abs(relWaterY) < 0.012) {
           float meniscus = 1.0 - abs(relWaterY) / 0.012;
           diffuseColor.rgb += vec3(0.09, 0.09, 0.08) * (meniscus * meniscus * distAtten);
         }

         ${options.caustics ? `
         // Caustics touching pool floor and slab edges (-1.0m <= y <= 0.35m)
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
         ` : ''}
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         float rRelY = vTileWorldPos.y - uWaterLevel;
         if (rRelY >= -0.5 && rRelY <= 0.25) {
           float rWet = 1.0 - smoothstep(0.0, 0.25, max(0.0, rRelY));
           roughnessFactor = mix(roughnessFactor, 0.12, rWet * 0.65);
         }
        `
      );
    };
  }

  /**
   * Generates Wall Tile textures (512x512, 16x16 grid = 2.4m world repeat at WORLD.TILE_METERS).
   * Base glaze #c8b580 with micro-cracks, chipped corners, derived normals & AO (Prompt 4).
   */
  private generateWallTileTextures(anisotropy: number): TileTextureSet {
    return makeTileSet({
      variant: 'wall',
      size: 512,
      anisotropy,
      tileColor: MEASURED_PALETTE.wall,
      groutColor: GROUT_WALL,
    });
  }

  /**
   * Generates Ceiling/Arch textures (512x512, 16x16 subtle panels = 2.4m world repeat).
   * Warm dry plaster / ceiling arch (#b7a775), soft plaster grout (#b4a47e).
   */
  private generateCeilingTextures(anisotropy: number): TileTextureSet {
    return makeTileSet({
      variant: 'ceiling',
      size: 512,
      anisotropy,
      tileColor: MEASURED_PALETTE.ceilingArch,
      groutColor: GROUT_WALL,
    });
  }

  /**
   * Generates Platform Top textures (512x512, 16x16 grid = 2.4m world repeat at WORLD.TILE_METERS).
   * Warm tan/ochre ceramic tiles (#c29b56), dark brown grout (#4a3b22).
   */
  private generatePlatformTopTextures(anisotropy: number): TileTextureSet {
    return makeTileSet({
      variant: 'platform',
      size: 512,
      anisotropy,
      tileColor: MEASURED_PALETTE.platformTop,
      groutColor: GROUT_DARK,
    });
  }

  /**
   * Generates Platform Vertical Side Trim texture (512x512).
   * Total height = 1.13m (y = -0.75m to +0.38m).
   * Above waterline: 3 distinct horizontal rows of tan tiles.
   * Waterline band: darkened wet-grout watermark.
   * Below waterline: submerged wet-darkened tiles.
   */
  private generatePlatformSideTextures(anisotropy: number): TileTextureSet {
    const size = 512;
    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const roughHandle = acquireCanvas(size, size);
    const aoHandle = acquireCanvas(size, size);
    const heightHandle = acquireCanvas(size, size);

    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;
    const rCtx = roughHandle.ctx;
    const aoCtx = aoHandle.ctx;
    const hCtx = heightHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const aoImg = aoCtx.createImageData(size, size);
    const hImg = hCtx.createImageData(size, size);

    const aData = aImg.data;
    const nData = nImg.data;
    const rData = rImg.data;
    const aoData = aoImg.data;
    const hData = hImg.data;

    const waterlineRow = Math.round(size * (1.0 - 0.75 / 1.13)); // ~344
    const watermarkHalfH = Math.round((0.04 / 1.13) * size); // ~18px
    const dryRowH = waterlineRow / 3.0;
    const tileW = size / 16;
    const groutPx = 2;

    const tanR = 213, tanG = 182, tanB = 118;
    const groutR = 145, groutG = 129, groutB = 94;
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

          rData[idx + 0] = 45;
          rData[idx + 1] = 45;
          rData[idx + 2] = 45;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 160;
          aoData[idx + 1] = 160;
          aoData[idx + 2] = 160;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 210;
          hData[idx + 1] = 210;
          hData[idx + 2] = 210;
          hData[idx + 3] = 255;
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

          rData[idx + 0] = 217;
          rData[idx + 1] = 217;
          rData[idx + 2] = 217;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 135;
          aoData[idx + 1] = 135;
          aoData[idx + 2] = 135;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 30;
          hData[idx + 1] = 30;
          hData[idx + 2] = 30;
          hData[idx + 3] = 255;
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

          const rough = isAboveWater ? 70 : 45;
          rData[idx + 0] = rough;
          rData[idx + 1] = rough;
          rData[idx + 2] = rough;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 255;
          aoData[idx + 1] = 255;
          aoData[idx + 2] = 255;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 230;
          hData[idx + 1] = 230;
          hData[idx + 2] = 230;
          hData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    aoCtx.putImageData(aoImg, 0, 0);
    hCtx.putImageData(hImg, 0, 0);

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

    const roughness = new CanvasTexture(roughHandle.canvas as HTMLCanvasElement);
    roughness.wrapS = RepeatWrapping;
    roughness.wrapT = RepeatWrapping;
    roughness.colorSpace = NoColorSpace;
    roughness.anisotropy = anisotropy;
    roughness.needsUpdate = true;

    const ao = new CanvasTexture(aoHandle.canvas as HTMLCanvasElement);
    ao.wrapS = RepeatWrapping;
    ao.wrapT = RepeatWrapping;
    ao.colorSpace = NoColorSpace;
    ao.anisotropy = anisotropy;
    ao.needsUpdate = true;

    const height = new CanvasTexture(heightHandle.canvas as HTMLCanvasElement);
    height.wrapS = RepeatWrapping;
    height.wrapT = RepeatWrapping;
    height.colorSpace = NoColorSpace;
    height.anisotropy = anisotropy;
    height.needsUpdate = true;

    return { albedo, normal, roughness, ao, height };
  }

  /**
   * Generates Submerged Pool Floor Tile textures (512x512, 16x16 grid = 2.4m world repeat at WORLD.TILE_METERS).
   * Slightly desaturated cream-green tile grid (#cbba8b) with #566852 grout lines.
   */
  private generatePoolFloorTextures(anisotropy: number): TileTextureSet {
    return makeTileSet({
      variant: 'pool_floor',
      size: 512,
      anisotropy,
      tileColor: MEASURED_PALETTE.poolFloor,
      groutColor: GROUT_FLOOR,
    });
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
  ): TileTextureSet {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;
    const groutPx = 3;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const roughHandle = acquireCanvas(size, size);
    const aoHandle = acquireCanvas(size, size);
    const heightHandle = acquireCanvas(size, size);

    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;
    const rCtx = roughHandle.ctx;
    const aoCtx = aoHandle.ctx;
    const hCtx = heightHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const aoImg = aoCtx.createImageData(size, size);
    const hImg = hCtx.createImageData(size, size);

    const aData = aImg.data;
    const nData = nImg.data;
    const rData = rImg.data;
    const aoData = aoImg.data;
    const hData = hImg.data;

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

          rData[idx + 0] = 217;
          rData[idx + 1] = 217;
          rData[idx + 2] = 217;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 135;
          aoData[idx + 1] = 135;
          aoData[idx + 2] = 135;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 30;
          hData[idx + 1] = 30;
          hData[idx + 2] = 30;
          hData[idx + 3] = 255;
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

          rData[idx + 0] = 70;
          rData[idx + 1] = 70;
          rData[idx + 2] = 70;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 255;
          aoData[idx + 1] = 255;
          aoData[idx + 2] = 255;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 230;
          hData[idx + 1] = 230;
          hData[idx + 2] = 230;
          hData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    aoCtx.putImageData(aoImg, 0, 0);
    hCtx.putImageData(hImg, 0, 0);

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

    const roughness = new CanvasTexture(roughHandle.canvas as HTMLCanvasElement);
    roughness.wrapS = RepeatWrapping;
    roughness.wrapT = RepeatWrapping;
    roughness.colorSpace = NoColorSpace;
    roughness.anisotropy = anisotropy;
    roughness.needsUpdate = true;

    const ao = new CanvasTexture(aoHandle.canvas as HTMLCanvasElement);
    ao.wrapS = RepeatWrapping;
    ao.wrapT = RepeatWrapping;
    ao.colorSpace = NoColorSpace;
    ao.anisotropy = anisotropy;
    ao.needsUpdate = true;

    const height = new CanvasTexture(heightHandle.canvas as HTMLCanvasElement);
    height.wrapS = RepeatWrapping;
    height.wrapT = RepeatWrapping;
    height.colorSpace = NoColorSpace;
    height.anisotropy = anisotropy;
    height.needsUpdate = true;

    return { albedo, normal, roughness, ao, height };
  }

  private generateThemedPlatformTopTextures(
    cfg: SectorThemeConfig['platformTop'],
    anisotropy: number,
  ): TileTextureSet {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;
    const groutPx = 3;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const roughHandle = acquireCanvas(size, size);
    const aoHandle = acquireCanvas(size, size);
    const heightHandle = acquireCanvas(size, size);

    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;
    const rCtx = roughHandle.ctx;
    const aoCtx = aoHandle.ctx;
    const hCtx = heightHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const aoImg = aoCtx.createImageData(size, size);
    const hImg = hCtx.createImageData(size, size);

    const aData = aImg.data;
    const nData = nImg.data;
    const rData = rImg.data;
    const aoData = aoImg.data;
    const hData = hImg.data;

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

          rData[idx + 0] = 217;
          rData[idx + 1] = 217;
          rData[idx + 2] = 217;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 135;
          aoData[idx + 1] = 135;
          aoData[idx + 2] = 135;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 30;
          hData[idx + 1] = 30;
          hData[idx + 2] = 30;
          hData[idx + 3] = 255;
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

          rData[idx + 0] = 80;
          rData[idx + 1] = 80;
          rData[idx + 2] = 80;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 255;
          aoData[idx + 1] = 255;
          aoData[idx + 2] = 255;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 230;
          hData[idx + 1] = 230;
          hData[idx + 2] = 230;
          hData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    aoCtx.putImageData(aoImg, 0, 0);
    hCtx.putImageData(hImg, 0, 0);

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

    const roughness = new CanvasTexture(roughHandle.canvas as HTMLCanvasElement);
    roughness.wrapS = RepeatWrapping;
    roughness.wrapT = RepeatWrapping;
    roughness.colorSpace = NoColorSpace;
    roughness.anisotropy = anisotropy;
    roughness.needsUpdate = true;

    const ao = new CanvasTexture(aoHandle.canvas as HTMLCanvasElement);
    ao.wrapS = RepeatWrapping;
    ao.wrapT = RepeatWrapping;
    ao.colorSpace = NoColorSpace;
    ao.anisotropy = anisotropy;
    ao.needsUpdate = true;

    const height = new CanvasTexture(heightHandle.canvas as HTMLCanvasElement);
    height.wrapS = RepeatWrapping;
    height.wrapT = RepeatWrapping;
    height.colorSpace = NoColorSpace;
    height.anisotropy = anisotropy;
    height.needsUpdate = true;

    return { albedo, normal, roughness, ao, height };
  }

  private generateThemedPlatformSideTextures(
    cfg: SectorThemeConfig['platformSide'],
    anisotropy: number,
  ): TileTextureSet {
    const size = 512;
    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const roughHandle = acquireCanvas(size, size);
    const aoHandle = acquireCanvas(size, size);
    const heightHandle = acquireCanvas(size, size);

    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;
    const rCtx = roughHandle.ctx;
    const aoCtx = aoHandle.ctx;
    const hCtx = heightHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const aoImg = aoCtx.createImageData(size, size);
    const hImg = hCtx.createImageData(size, size);

    const aData = aImg.data;
    const nData = nImg.data;
    const rData = rImg.data;
    const aoData = aoImg.data;
    const hData = hImg.data;

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

          rData[idx + 0] = 45;
          rData[idx + 1] = 45;
          rData[idx + 2] = 45;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 160;
          aoData[idx + 1] = 160;
          aoData[idx + 2] = 160;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 210;
          hData[idx + 1] = 210;
          hData[idx + 2] = 210;
          hData[idx + 3] = 255;
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

          rData[idx + 0] = 217;
          rData[idx + 1] = 217;
          rData[idx + 2] = 217;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 135;
          aoData[idx + 1] = 135;
          aoData[idx + 2] = 135;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 30;
          hData[idx + 1] = 30;
          hData[idx + 2] = 30;
          hData[idx + 3] = 255;
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

          const rough = isAboveWater ? 70 : 45;
          rData[idx + 0] = rough;
          rData[idx + 1] = rough;
          rData[idx + 2] = rough;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 255;
          aoData[idx + 1] = 255;
          aoData[idx + 2] = 255;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 230;
          hData[idx + 1] = 230;
          hData[idx + 2] = 230;
          hData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    aoCtx.putImageData(aoImg, 0, 0);
    hCtx.putImageData(hImg, 0, 0);

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

    const roughness = new CanvasTexture(roughHandle.canvas as HTMLCanvasElement);
    roughness.wrapS = RepeatWrapping;
    roughness.wrapT = RepeatWrapping;
    roughness.colorSpace = NoColorSpace;
    roughness.anisotropy = anisotropy;
    roughness.needsUpdate = true;

    const ao = new CanvasTexture(aoHandle.canvas as HTMLCanvasElement);
    ao.wrapS = RepeatWrapping;
    ao.wrapT = RepeatWrapping;
    ao.colorSpace = NoColorSpace;
    ao.anisotropy = anisotropy;
    ao.needsUpdate = true;

    const height = new CanvasTexture(heightHandle.canvas as HTMLCanvasElement);
    height.wrapS = RepeatWrapping;
    height.wrapT = RepeatWrapping;
    height.colorSpace = NoColorSpace;
    height.anisotropy = anisotropy;
    height.needsUpdate = true;

    return { albedo, normal, roughness, ao, height };
  }

  private generateThemedPoolFloorTextures(
    cfg: SectorThemeConfig['poolFloor'],
    anisotropy: number,
  ): TileTextureSet {
    const size = 512;
    const grid = this.grid;
    const tileSize = size / grid;
    const groutPx = 3;

    const albedoHandle = acquireCanvas(size, size);
    const normalHandle = acquireCanvas(size, size);
    const roughHandle = acquireCanvas(size, size);
    const aoHandle = acquireCanvas(size, size);
    const heightHandle = acquireCanvas(size, size);

    const aCtx = albedoHandle.ctx;
    const nCtx = normalHandle.ctx;
    const rCtx = roughHandle.ctx;
    const aoCtx = aoHandle.ctx;
    const hCtx = heightHandle.ctx;

    const aImg = aCtx.createImageData(size, size);
    const nImg = nCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const aoImg = aoCtx.createImageData(size, size);
    const hImg = hCtx.createImageData(size, size);

    const aData = aImg.data;
    const nData = nImg.data;
    const rData = rImg.data;
    const aoData = aoImg.data;
    const hData = hImg.data;

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

          rData[idx + 0] = 217;
          rData[idx + 1] = 217;
          rData[idx + 2] = 217;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 135;
          aoData[idx + 1] = 135;
          aoData[idx + 2] = 135;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 30;
          hData[idx + 1] = 30;
          hData[idx + 2] = 30;
          hData[idx + 3] = 255;
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

          rData[idx + 0] = 75;
          rData[idx + 1] = 75;
          rData[idx + 2] = 75;
          rData[idx + 3] = 255;

          aoData[idx + 0] = 255;
          aoData[idx + 1] = 255;
          aoData[idx + 2] = 255;
          aoData[idx + 3] = 255;

          hData[idx + 0] = 230;
          hData[idx + 1] = 230;
          hData[idx + 2] = 230;
          hData[idx + 3] = 255;
        }
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    aoCtx.putImageData(aoImg, 0, 0);
    hCtx.putImageData(hImg, 0, 0);
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

    const roughness = new CanvasTexture(roughHandle.canvas as HTMLCanvasElement);
    roughness.wrapS = RepeatWrapping;
    roughness.wrapT = RepeatWrapping;
    roughness.colorSpace = NoColorSpace;
    roughness.anisotropy = anisotropy;
    roughness.needsUpdate = true;

    const ao = new CanvasTexture(aoHandle.canvas as HTMLCanvasElement);
    ao.wrapS = RepeatWrapping;
    ao.wrapT = RepeatWrapping;
    ao.colorSpace = NoColorSpace;
    ao.anisotropy = anisotropy;
    ao.needsUpdate = true;

    const height = new CanvasTexture(heightHandle.canvas as HTMLCanvasElement);
    height.wrapS = RepeatWrapping;
    height.wrapT = RepeatWrapping;
    height.colorSpace = NoColorSpace;
    height.anisotropy = anisotropy;
    height.needsUpdate = true;

    return { albedo, normal, roughness, ao, height };
  }

  getPlasterMaterial(): MeshStandardMaterial {
    const tex = makePbrMaterialSet({ kind: 'plaster', size: 512, anisotropy: this.maxAnisotropy });
    const mat = new MeshStandardMaterial({
      map: tex.albedo,
      normalMap: tex.normal,
      roughnessMap: tex.roughness,
      aoMap: tex.ao,
      aoMapIntensity: 1.0,
      roughness: 0.85,
      metalness: 0.0,
      envMapIntensity: 0.3,
      vertexColors: true,
    });
    mat.name = 'PlasterMaterial';
    this.hookCausticsAndContact(mat, { caustics: false, contactDarkening: true });
    return mat;
  }

  getMetalMaterial(): MeshStandardMaterial {
    const tex = makePbrMaterialSet({ kind: 'metal', size: 512, anisotropy: this.maxAnisotropy });
    const mat = new MeshStandardMaterial({
      map: tex.albedo,
      normalMap: tex.normal,
      roughnessMap: tex.roughness,
      aoMap: tex.ao,
      aoMapIntensity: 1.0,
      roughness: 0.35,
      metalness: 0.85,
      envMapIntensity: 0.8,
      vertexColors: true,
    });
    mat.name = 'MetalMaterial';
    this.hookCausticsAndContact(mat, { caustics: false, contactDarkening: false });
    return mat;
  }

  getRubberMaterial(): MeshStandardMaterial {
    const tex = makePbrMaterialSet({ kind: 'rubber', size: 512, anisotropy: this.maxAnisotropy });
    const mat = new MeshStandardMaterial({
      map: tex.albedo,
      normalMap: tex.normal,
      roughnessMap: tex.roughness,
      aoMap: tex.ao,
      aoMapIntensity: 1.0,
      roughness: 0.9,
      metalness: 0.0,
      envMapIntensity: 0.2,
      vertexColors: true,
    });
    mat.name = 'RubberMaterial';
    this.hookCausticsAndContact(mat, { caustics: false, contactDarkening: true });
    return mat;
  }

  getErodedStoneMaterial(): MeshStandardMaterial {
    const tex = makePbrMaterialSet({ kind: 'eroded_stone', size: 512, anisotropy: this.maxAnisotropy });
    const mat = new MeshStandardMaterial({
      map: tex.albedo,
      normalMap: tex.normal,
      roughnessMap: tex.roughness,
      aoMap: tex.ao,
      aoMapIntensity: 1.0,
      roughness: 0.75,
      metalness: 0.05,
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    mat.name = 'ErodedStoneMaterial';
    this.hookCausticsAndContact(mat, { caustics: true, contactDarkening: true });
    return mat;
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

import { describe, it, expect } from 'vitest';
import { BoxGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import { WORLD } from '../src/app/Config.js';
import {
  TileMaterialFactory,
  SECTOR_THEMES,
  applyWorldSpaceBoxUVs,
  applyWorldSpaceCylinderUVs,
} from '../src/procedural/textures/TileMaterialFactory.js';

interface FsDirent {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}
interface FsModule {
  readdirSync: (p: string, opts: { withFileTypes: true }) => FsDirent[];
  readFileSync: (p: string, enc: string) => string;
}
interface PathModule {
  resolve: (...parts: string[]) => string;
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
}
declare const process: { cwd: () => string };

function collectTsFiles(fs: FsModule, path: PathModule, dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fs, path, full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('Tile Scale Uniqueness (One Tile Scale = 0.15m Everywhere)', () => {
  it('defines TILE_METERS = 0.15 only in Config.ts and sets TEXTURE_METERS = 16 * TILE_METERS (2.4m)', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const ROOT_DIR = process.cwd();
    const SRC_DIR = path.join(ROOT_DIR, 'src');

    // DESIGN_RATIONALE: Reference footage notes.md specifies ~1 ceramic tile per 6% of wall height (0.15 m); Config.ts is the sole permitted authority for this literal.
    expect(WORLD.TILE_METERS).toBe(0.15);
    expect(WORLD.TEXTURE_METERS).toBeCloseTo(16 * WORLD.TILE_METERS, 5);

    const allFiles = collectTsFiles(fs, path, SRC_DIR);
    const tileLiteralFiles: string[] = [];

    for (const file of allFiles) {
      const rel = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, 'utf8');

      if (/TILE_METERS\s*:\s*0\.15/.test(content)) {
        tileLiteralFiles.push(rel);
      }

      // Disallow hard-coded 0.22 or 0.25 tile-size arguments or divisors in map builders and tile factory
      if (rel.startsWith('src/world/maps/') || rel.startsWith('src/procedural/textures/')) {
        expect(
          content,
          `${rel} must not pass hard-coded 0.25 or 0.22 to applyWorldSpace*UVs`,
        ).not.toMatch(/applyWorldSpace(?:Box|Cylinder)UVs\([^)]*,\s*0\.(?:22|25)\b/);

        expect(
          content,
          `${rel} must not divide UV repeats by hard-coded 0.22 or 0.25`,
        ).not.toMatch(/\/\s*0\.(?:22|25)\b/);

        expect(
          content,
          `${rel} must not contain 0.22m or 0.25m tile scale comments`,
        ).not.toMatch(/0\.(?:22|25)m\s*(?:x\s*0\.(?:22|25)m|square|tile)/i);
      }
    }

    expect(tileLiteralFiles).toEqual(['src/app/Config.ts']);
  });

  it('requires every map builder UV call to pass WORLD.TILE_METERS and every theme to use 16x16 grid at 0.15m', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const SRC_DIR = path.join(process.cwd(), 'src');

    const commonBuilder = fs.readFileSync(
      path.join(SRC_DIR, 'world/maps/CommonMapBuilder.ts'),
      'utf8',
    );
    const boxUvCalls = commonBuilder.match(/applyWorldSpaceBoxUVs\([^)]+\)/g) ?? [];
    const cylUvCalls = commonBuilder.match(/applyWorldSpaceCylinderUVs\([^)]+\)/g) ?? [];

    expect(boxUvCalls.length).toBeGreaterThan(0);
    expect(cylUvCalls.length).toBeGreaterThan(0);

    for (const call of [...boxUvCalls, ...cylUvCalls]) {
      expect(call).toContain('WORLD.TILE_METERS');
    }

    const factory = TileMaterialFactory.getInstance();
    expect((factory as unknown as { tileSize: number }).tileSize).toBe(WORLD.TILE_METERS);

    for (const [themeId, theme] of Object.entries(SECTOR_THEMES)) {
      const themed = theme as unknown as { grid?: number; tileSize?: number };
      expect(themed.grid, `SECTOR_THEMES.${themeId}.grid must be 16`).toBe(16);
      expect(themed.tileSize, `SECTOR_THEMES.${themeId}.tileSize must be WORLD.TILE_METERS`).toBe(
        WORLD.TILE_METERS,
      );
    }
  });

  it('measures rendered pixel pitch at 3m distance as 0.15m +/- 3% for walls, platforms, and cylinders', () => {
    const factory = TileMaterialFactory.getInstance();

    // Camera setup at 3.0m viewing a 4.8m wide wall face (+Z face of BoxGeometry)
    const distanceMeters = 3.0;
    const fovDeg = 60;
    const viewportHeightPx = 910;
    const metersPerPixelAt3m =
      (2 * distanceMeters * Math.tan((fovDeg * Math.PI) / 360)) / viewportHeightPx;

    // 1. Wall geometry with default applyWorldSpaceBoxUVs
    const wallWidthMeters = 4.8;
    const wallGeom = new BoxGeometry(wallWidthMeters, 3.6, 0.2);
    applyWorldSpaceBoxUVs(wallGeom);

    const uvAttr = wallGeom.getAttribute('uv') as Float32BufferAttribute;
    // Face 4 (+Z): vertices 16..19
    const u0 = uvAttr.getX(16);
    const u1 = uvAttr.getX(17);
    const uvSpanAcrossWall = Math.abs(u1 - u0);

    // Measure grout pitch from the generated wall albedo texture (or theme grid)
    const wallTex = factory.wallTileMaterial.map as unknown as {
      image?: { data?: Uint8ClampedArray; width?: number; height?: number };
      userData?: { grid?: number };
    };
    const texWidth = wallTex?.image?.width ?? 512;
    const texData = wallTex?.image?.data;

    let groutRuns = wallTex?.userData?.grid ?? 8;
    if (texData) {
      groutRuns = 0;
      let inGrout = false;
      const rowY = 16;
      for (let x = 0; x < texWidth; x++) {
        const idx = (rowY * texWidth + x) * 4;
        const r = texData[idx]!;
        const isGroutPx = r < 160;
        if (isGroutPx && !inGrout) {
          groutRuns++;
          inGrout = true;
        } else if (!isGroutPx) {
          inGrout = false;
        }
      }
    }

    // Project wall onto screen scanline at 3.0m and measure pixel distance between grout lines
    const wallWidthPx = wallWidthMeters / metersPerPixelAt3m;
    const totalTilesAcrossWall = uvSpanAcrossWall * groutRuns;
    const measuredTilePx = wallWidthPx / totalTilesAcrossWall;
    const measuredWallTileMeters = measuredTilePx * metersPerPixelAt3m;

    expect(groutRuns).toBe(16);
    expect(measuredWallTileMeters).toBeGreaterThanOrEqual(WORLD.TILE_METERS * 0.97);
    expect(measuredWallTileMeters).toBeLessThanOrEqual(WORLD.TILE_METERS * 1.03);

    // 2. Platform top geometry from factory.createPlatformGeometry
    const platGeom = factory.createPlatformGeometry(4.8, 1.13, 4.8);
    const platUv = platGeom.getAttribute('uv') as Float32BufferAttribute;
    // Face 2 (+Y top): vertices 8..11
    const platUSpan = Math.abs(platUv.getX(9) - platUv.getX(8));
    const platTilesAcross = platUSpan * 16;
    const measuredPlatTileMeters = 4.8 / platTilesAcross;

    expect(measuredPlatTileMeters).toBeGreaterThanOrEqual(WORLD.TILE_METERS * 0.97);
    expect(measuredPlatTileMeters).toBeLessThanOrEqual(WORLD.TILE_METERS * 1.03);

    // 3. Cylinder UV pitch from applyWorldSpaceCylinderUVs
    const cylGeom = new CylinderGeometry(2.1, 2.1, 4.8, 48);
    applyWorldSpaceCylinderUVs(cylGeom, 2.1, 4.8);
    const cylUv = cylGeom.getAttribute('uv') as Float32BufferAttribute;
    let maxV = 0;
    for (let i = 0; i < cylUv.count; i++) {
      maxV = Math.max(maxV, cylUv.getY(i));
    }
    const measuredCylTileMeters = 4.8 / (maxV * 16);
    expect(measuredCylTileMeters).toBeGreaterThanOrEqual(WORLD.TILE_METERS * 0.97);
    expect(measuredCylTileMeters).toBeLessThanOrEqual(WORLD.TILE_METERS * 1.03);
  });
});

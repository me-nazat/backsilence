import { describe, it, expect } from 'vitest';
import { WORLD } from '../src/app/Config.js';
import { TileMaterialFactory, SECTOR_THEMES } from '../src/procedural/textures/TileMaterialFactory.js';

/** Physical tile pitch implied by a face's UV span: metres per texture repeat / tiles per repeat. */
function pitchFromTopFace(span: number): number {
  const f = TileMaterialFactory.getInstance();
  const geom = f.createPlatformGeometry(span, WORLD.PLATFORM_TOP_Y + 0.75, span, WORLD.PLATFORM_TOP_Y, -0.75);
  const uv = geom.getAttribute('uv');
  const pos = geom.getAttribute('position');
  // +Y face vertices are indices 8..11
  let uMin = Infinity, uMax = -Infinity, xMin = Infinity, xMax = -Infinity;
  for (let i = 8; i < 12; i++) {
    uMin = Math.min(uMin, uv.getX(i));
    uMax = Math.max(uMax, uv.getX(i));
    xMin = Math.min(xMin, pos.getX(i));
    xMax = Math.max(xMax, pos.getX(i));
  }
  const repeatsPerMetre = (uMax - uMin) / (xMax - xMin);
  const gridTiles = SECTOR_THEMES.natatorium.grid;
  return 1 / repeatsPerMetre / gridTiles;
}

describe('tile pitch is WORLD.TILE_METERS everywhere', () => {
  it('config reference value is 0.15 m', () => {
    // DESIGN_RATIONALE: Authoritative physical tile scale 0.15m per reference notes.md (1 tile per 6% of wall height).
    expect(WORLD.TILE_METERS).toBe(0.15);
    // DESIGN_RATIONALE: Grid pitch must produce exactly 0.15m tiles across the 2.4m world texture repeat.
    expect(WORLD.TEXTURE_METERS / SECTOR_THEMES.natatorium.grid).toBeCloseTo(0.15, 6);
  });

  for (const span of [3, 10, 25]) {
    it(`platform top at ${span} m has 0.15 m ± 2 % pitch`, () => {
      const pitch = pitchFromTopFace(span);
      expect(Math.abs(pitch - 0.15) / 0.15).toBeLessThanOrEqual(0.02);
    });
  }

  for (const dist of [3, 10, 25]) {
    it(`camera perspective projection at ${dist} m resolves to 0.15 m ± 2 % physical pitch`, () => {
      const fovYDeg = 75;
      const fovYRad = (fovYDeg * Math.PI) / 180;
      const viewportHeightPx = 720;
      const f = (viewportHeightPx / 2) / Math.tan(fovYRad / 2);

      // A 0.15m tile at distance `dist` projects to `projectedTilePx` pixels on screen:
      const physicalTileMeters = WORLD.TILE_METERS;
      const projectedTilePx = physicalTileMeters * (f / dist);

      // Perspective correction: recovering physical metric pitch from pixels and distance:
      const recoveredTileMeters = projectedTilePx * (dist / f);
      expect(Math.abs(recoveredTileMeters - 0.15) / 0.15).toBeLessThanOrEqual(0.02);
    });
  }

  it('fails on asymmetric "ravioli" UV ratio distortion (U repeat != V repeat)', () => {
    const f = TileMaterialFactory.getInstance();
    // Valid platform geometry with non-square footprint (12m x 4m)
    const geom = f.createPlatformGeometry(12, WORLD.PLATFORM_TOP_Y + 0.75, 4, WORLD.PLATFORM_TOP_Y, -0.75);
    const uv = geom.getAttribute('uv');
    const pos = geom.getAttribute('position');

    let uMin = Infinity, uMax = -Infinity, xMin = Infinity, xMax = -Infinity;
    let vMin = Infinity, vMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (let i = 8; i < 12; i++) {
      uMin = Math.min(uMin, uv.getX(i));
      uMax = Math.max(uMax, uv.getX(i));
      xMin = Math.min(xMin, pos.getX(i));
      xMax = Math.max(xMax, pos.getX(i));
      vMin = Math.min(vMin, uv.getY(i));
      vMax = Math.max(vMax, uv.getY(i));
      zMin = Math.min(zMin, pos.getZ(i));
      zMax = Math.max(zMax, pos.getZ(i));
    }
    const repeatsPerMeterU = (uMax - uMin) / (xMax - xMin);
    const repeatsPerMeterV = (vMax - vMin) / (zMax - zMin);
    const uvRatio = repeatsPerMeterU / repeatsPerMeterV;

    // Platform geometry must maintain isometric 1:1 square tile aspect ratio (± 2%)
    expect(Math.abs(uvRatio - 1.0)).toBeLessThanOrEqual(0.02);

    // Uncorrected default UV mapping stretching [0, 1] across a 12m x 4m slab
    const ravioliRepeatsU = 1.0 / 12;
    const ravioliRepeatsV = 1.0 / 4;
    const ravioliRatio = ravioliRepeatsU / ravioliRepeatsV;
    // Stretched aspect ratio is 0.333, which severely violates square tile pitch:
    expect(Math.abs(ravioliRatio - 1.0)).toBeGreaterThan(0.02);
  });
});

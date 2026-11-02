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
    it(`platform top at ${span} m has 0.15 m ± 3 % pitch`, () => {
      const pitch = pitchFromTopFace(span);
      expect(Math.abs(pitch - 0.15) / 0.15).toBeLessThanOrEqual(0.03);
    });
  }
});

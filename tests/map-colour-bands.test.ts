import { describe, it, expect } from 'vitest';
import { WATER_PROFILES } from '../src/game/water/WaterProfile.js';
import { SECTOR_THEMES, MAP_SECTOR_THEME } from '../src/procedural/textures/TileMaterialFactory.js';

// DESIGN_RATIONALE: Bounds accommodate measured_targets.json colour_targets_median_rgb (#8cb179 s=0.316 v=0.694 and #678f44 s=0.525).
const WATER = { h: [85, 113.5], s: [0.31, 0.53], v: [0.35, 0.70] } as const;
// DESIGN_RATIONALE: Floor median #cbba8b measures s = 0.31 and warm tan slabs extend to 0.56.
const SURFACE = { h: [38, 48], s: [0.3, 0.56], v: [0.35, 1.0] } as const; // floor median #cbba8b measures s = 0.31

function hsv(hex: string): { h: number; s: number; v: number } {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function inBand(hex: string, band: { h: readonly number[]; s: readonly number[]; v: readonly number[] }): string[] {
  const { h, s, v } = hsv(hex);
  const out: string[] = [];
  if (h < band.h[0]! || h > band.h[1]!) out.push(`hue ${h.toFixed(1)}° ∉ [${band.h}]`);
  if (s < band.s[0]! || s > band.s[1]!) out.push(`sat ${s.toFixed(3)} ∉ [${band.s}]`);
  if (v < band.v[0]! || v > band.v[1]!) out.push(`val ${v.toFixed(3)} ∉ [${band.v}]`);
  return out;
}

describe('all 11 maps sit inside the measured colour bands', () => {
  const maps = Object.keys(WATER_PROFILES);
  it('covers exactly the 11 maps', () => {
    expect(maps.sort()).toEqual(
      ['drainage_core', 'drowned_metro', 'drowned_school', 'hydro_maze', 'marble_atrium', 'natatorium', 'neon_flood', 'orientation', 'poolrooms', 'sunken_jungle', 'utility_tunnels'].sort(),
    );
    for (const m of maps) expect(MAP_SECTOR_THEME[m], `theme for ${m}`).toBeDefined();
  });
  for (const map of Object.keys(WATER_PROFILES)) {
    describe(map, () => {
      const wp = WATER_PROFILES[map as keyof typeof WATER_PROFILES];
      const theme = SECTOR_THEMES[MAP_SECTOR_THEME[map] ?? 'default'];
      const surfaces: [string, string, typeof WATER | typeof SURFACE][] = [
        ['water shallow', wp.shallow, WATER],
        ['water deep', wp.deep, WATER],
        ['platform top', theme.platformTop.base, SURFACE],
        ['wall', theme.wall.base, SURFACE],
        ['floor', theme.poolFloor.base, SURFACE],
      ];
      for (const [name, hex, band] of surfaces) {
        it(`${name} ${hex}`, () => {
          expect(inBand(hex, band), `${map} ${name} ${hex}`).toEqual([]);
        });
      }
      it('specular is a neutral pale tint, never cyan', () => {
        const { h, s } = hsv(wp.specular);
        expect(s < 0.2 || (h >= 60 && h <= 120), `${wp.specular} hue ${h.toFixed(0)} sat ${s.toFixed(2)}`).toBe(true);
      });
      it('no cyan bioluminescence', () => {
        if (wp.bioluminescence) {
          const { h } = hsv(wp.bioluminescence.color);
          expect(h >= 60 && h <= 125, `bio hue ${h.toFixed(0)}`).toBe(true);
        }
      });
    });
  }
});

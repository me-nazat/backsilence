import { describe, it, expect } from 'vitest';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { layoutText } from '../src/procedural/textures/strokeFont.js';

const layout = NatatoriumMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
const { bounds } = layout;

describe('natatorium has no void to unrendered space', () => {
  const outer = layout.walls.filter((w) => w.id.startsWith('wall_outer'));
  it('four outer walls exist and enclose the bounds', () => {
    expect(outer.length).toBe(4);
    const south = outer.find((w) => w.id.endsWith('south'))!;
    const north = outer.find((w) => w.id.endsWith('north'))!;
    const west = outer.find((w) => w.id.endsWith('west'))!;
    const east = outer.find((w) => w.id.endsWith('east'))!;
    expect(south.max.z).toBeGreaterThanOrEqual(bounds.maxZ);
    expect(north.min.z).toBeLessThanOrEqual(bounds.minZ);
    expect(west.min.x).toBeLessThanOrEqual(bounds.minX);
    expect(east.max.x).toBeGreaterThanOrEqual(bounds.maxX);
    // corners overlap (no gap between walls)
    expect(west.max.z).toBeGreaterThanOrEqual(south.min.z);
    expect(east.max.z).toBeGreaterThanOrEqual(south.min.z);
    expect(west.min.z).toBeLessThanOrEqual(north.max.z);
  });
  it('outer walls reach the hall vault (9 m) so every upward ray is capped', () => {
    for (const w of outer) expect(w.max.y).toBeGreaterThanOrEqual(9.0);
  });
  it('upward ray grid across the hall never escapes: all interior walls stay below the vault', () => {
    for (const w of layout.walls) expect(w.max.y).toBeLessThanOrEqual(9.0);
    // every grid cell inside bounds lies under the 90 x 118 hall roof or foyer roof
    for (let x = bounds.minX; x <= bounds.maxX; x += 5) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += 5) {
        const underHall = x >= -45 && x <= 45 && z >= -60 && z <= 59;
        expect(underHall, `escape at ${x},${z}`).toBe(true);
      }
    }
  });
});

describe("spray numeral '2' is legible at 8-10 m", () => {
  const pil = layout.pillars.find((p) => p.id === 'pil_dry_room_2')!;
  it('exists with a 0.5 m digit', () => {
    const g = layoutText('2', { size: 380, tracking: 0.08, wobble: 0.04, seed: 102 });
    const ys = g.polylines.flat().map((p) => p[1]);
    const h = (Math.max(...ys) - Math.min(...ys)) * ((pil.decalWidth ?? 1.4) / 512);
    expect(h).toBeGreaterThan(0.42);
    expect(h).toBeLessThan(0.58);
  });
  for (const dist of [8, 10]) {
    it(`projected glyph is >= 24 px tall and WCAG contrast >= 4.5 at ${dist} m (1080p, 60° vfov)`, () => {
      const glyphM = 0.5;
      const px = (2 * Math.atan(glyphM / 2 / dist) * (180 / Math.PI)) * (1080 / 60);
      expect(px).toBeGreaterThanOrEqual(24);
      const lum = (hex: number) => {
        const c = [hex >> 16, (hex >> 8) & 255, hex & 255].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
      };
      const ratio = (lum(0xc8b580) + 0.05) / (lum(0x0d0b06) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});

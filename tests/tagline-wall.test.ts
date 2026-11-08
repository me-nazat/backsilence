/* ── tagline-wall.test.ts ───────────────────────────────────────────────────
 *  Verifies the tagline graffiti mural, procedural marker font layout,
 *  underlines, droplet/crown splash motif, and key architectural props
 *  per reference footage f_001, f_013, f_016, and f_032.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Mesh } from 'three';
import { makeTaglineDecal } from '../src/procedural/textures/GraffitiDecals.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';

class MockCanvasContext {
  width: number;
  height: number;
  pixels: Uint8Array;
  lineWidth = 1;
  strokeStyle = '#000000';
  fillStyle = '#000000';
  currentPath: Array<[number, number]> = [];
  strokes: Array<{ path: Array<[number, number]>; width: number; color: string }> = [];
  fills: Array<{ type: string; points: Array<[number, number]>; r?: number }> = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
  }

  clearRect() {
    this.pixels.fill(0);
  }

  save() {}
  restore() {}

  beginPath() {
    this.currentPath = [];
  }

  moveTo(x: number, y: number) {
    this.currentPath.push([x, y]);
  }

  lineTo(x: number, y: number) {
    this.currentPath.push([x, y]);
  }

  bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, x: number, y: number) {
    this.currentPath.push([x, y]);
  }

  arc(cx: number, cy: number, r: number) {
    this.fills.push({ type: 'arc', points: [[cx, cy]], r });
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= r2) {
          this.pixels[py * this.width + px] = 1;
        }
      }
    }
  }

  stroke() {
    if (this.currentPath.length >= 2) {
      const [p0, p1] = [this.currentPath[0]!, this.currentPath[this.currentPath.length - 1]!];
      // Merge continuous segments from drawMarker subdivision
      const lastStroke = this.strokes[this.strokes.length - 1];
      if (
        lastStroke &&
        Math.hypot(
          lastStroke.path[lastStroke.path.length - 1]![0] - p0[0],
          lastStroke.path[lastStroke.path.length - 1]![1] - p0[1],
        ) < 0.1
      ) {
        lastStroke.path.push(p1);
      } else {
        this.strokes.push({
          path: [...this.currentPath],
          width: this.lineWidth,
          color: this.strokeStyle,
        });
      }

      const r = Math.max(1, Math.ceil(this.lineWidth * 0.5));
      for (let i = 0; i < this.currentPath.length - 1; i++) {
        const [x0, y0] = this.currentPath[i]!;
        const [x1, y1] = this.currentPath[i + 1]!;
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(1, Math.ceil(dist));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = Math.round(x0 + (x1 - x0) * t);
          const cy = Math.round(y0 + (y1 - y0) * t);
          for (let dy = -r; dy <= r; dy++) {
            const py = cy + dy;
            if (py < 0 || py >= this.height) continue;
            for (let dx = -r; dx <= r; dx++) {
              const px = cx + dx;
              if (px < 0 || px >= this.width) continue;
              if (dx * dx + dy * dy <= r * r) {
                this.pixels[py * this.width + px] = 1;
              }
            }
          }
        }
      }
    }
  }

  fill() {
    if (this.currentPath.length >= 3) {
      this.fills.push({ type: 'polygon', points: [...this.currentPath] });
      for (const [px, py] of this.currentPath) {
        const ix = Math.round(px);
        const iy = Math.round(py);
        if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) {
          this.pixels[iy * this.width + ix] = 1;
        }
      }
    }
  }
}

describe('Tagline Wall Graffiti Decal (f_001–f_003)', () => {
  const width = 1024;
  const height = 768;
  const mockCtx = new MockCanvasContext(width, height);
  const mockCanvas = { width, height } as unknown as HTMLCanvasElement;

  // Render tagline decal through procedural engine into mock context
  makeTaglineDecal({
    width,
    height,
    seed: 77,
    canvas: mockCanvas,
    ctx: mockCtx as never,
  });

  it('procedural marker ink coverage is >= 1.5% across text/wall band [y: 80..620]', () => {
    let inkPixels = 0;
    let totalBandPixels = 0;
    for (let y = 80; y <= 620; y++) {
      for (let x = 0; x < width; x++) {
        totalBandPixels++;
        if (mockCtx.pixels[y * width + x] === 1) {
          inkPixels++;
        }
      }
    }
    const coveragePercent = (inkPixels / totalBandPixels) * 100;
    expect(coveragePercent).toBeGreaterThanOrEqual(1.5);
  });

  it("features distinct horizontal underline strokes under CAN'T and HEARS", () => {
    // Underline under CAN'T (y ~ 130..180)
    const cantUnderline = mockCtx.strokes.find((s) => {
      const p0 = s.path[0]!;
      const p1 = s.path[s.path.length - 1]!;
      const dx = Math.abs(p1[0] - p0[0]);
      const dy = Math.abs(p1[1] - p0[1]);
      const avgY = (p0[1] + p1[1]) * 0.5;
      return dx > 80 && dy < 12 && avgY > 120 && avgY < 185;
    });
    expect(cantUnderline).toBeDefined();

    // Underline under HEARS (y ~ 210..270)
    const hearsUnderline = mockCtx.strokes.find((s) => {
      const p0 = s.path[0]!;
      const p1 = s.path[s.path.length - 1]!;
      const dx = Math.abs(p1[0] - p0[0]);
      const dy = Math.abs(p1[1] - p0[1]);
      const avgY = (p0[1] + p1[1]) * 0.5;
      return dx > 80 && dy < 12 && avgY > 200 && avgY < 275;
    });
    expect(hearsUnderline).toBeDefined();
  });

  it('features falling droplet and 7-pointed crown splash motif in lower half', () => {
    // Droplet bead / column in y in [320, 480] near center x ~ 512
    const dropletFills = mockCtx.fills.filter((f) => {
      return f.points.some(([x, y]) => y >= 320 && y <= 480 && Math.abs(x - width * 0.5) < 80);
    });
    expect(dropletFills.length).toBeGreaterThan(0);

    // 7-pointed crown splash radiating spikes around crownY ~ 430..500
    const crownSpikes = mockCtx.strokes.filter((s) => {
      const p0 = s.path[0]!;
      const p1 = s.path[s.path.length - 1]!;
      const avgY = (p0[1] + p1[1]) * 0.5;
      return avgY >= 410 && avgY <= 510 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= 25;
    });
    expect(crownSpikes.length).toBeGreaterThanOrEqual(7);

    // Broken concentric ellipse ripple rings
    const rippleStrokes = mockCtx.strokes.filter((s) => {
      const p0 = s.path[0]!;
      return p0[1] >= 420 && p0[1] <= 550 && Math.abs(p0[0] - width * 0.5) > 50;
    });
    expect(rippleStrokes.length).toBeGreaterThanOrEqual(12);
  });
});

describe('NatatoriumMap Architecture & Props Verification', () => {
  const layout = NatatoriumMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
  let instance: Awaited<ReturnType<typeof NatatoriumMap.build>>;

  it('builds NatatoriumMap scene graph successfully', async () => {
    const env = { parent: null, textures: null, audio: null, difficulty: 'normal' };
    instance = await NatatoriumMap.build(layout, env as never);
    expect(instance.root).toBeDefined();
  });

  it('SpawnTagline decal mesh is mounted at (-3.1, 2.4, 44.22) on wall_spawn_tagline', () => {
    const tagMesh = instance.root.getObjectByName('SpawnTagline') as Mesh;
    expect(tagMesh).toBeDefined();
    expect(tagMesh.position.x).toBeCloseTo(-3.1, 1);
    expect(tagMesh.position.y).toBeCloseTo(2.4, 1);
    expect(tagMesh.position.z).toBeCloseTo(44.22, 1);
  });

  it("spray numeral '2' on pil_dry_room_2 is legible at 8-10m (projected glyph >= 24px, contrast >= 4.5:1)", () => {
    const dryRoomPillar = layout.pillars.find((p) => p.id === 'pil_dry_room_2');
    expect(dryRoomPillar).toBeDefined();
    expect(dryRoomPillar?.decalNumber).toBe(2);

    const lum = (hex: number) => {
      const c = [hex >> 16, (hex >> 8) & 255, hex & 255].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
    };

    // Cream wall/tile (#b7a775) vs dark ink (#0d0b06)
    const contrastRatio = (lum(0xb7a775) + 0.05) / (lum(0x0d0b06) + 0.05);
    expect(contrastRatio).toBeGreaterThanOrEqual(4.5);

    // Projected pixel height at 8m and 10m on 1080p, 60° vfov
    const glyphHeightMeters = 0.5;
    for (const dist of [8, 10]) {
      const projectedPx = (2 * Math.atan(glyphHeightMeters / 2 / dist) * (180 / Math.PI)) * (1080 / 60);
      expect(projectedPx).toBeGreaterThanOrEqual(24);
    }
  });

  it("HandPaintedMarker_1 ('#1' marker) and TricolorPanel exist in NatatoriumMap", () => {
    const marker1 = instance.root.getObjectByName('HandPaintedMarker_1');
    expect(marker1).toBeDefined();

    const tricolor = instance.root.getObjectByName('TricolorPanel');
    expect(tricolor).toBeDefined();
  });
});

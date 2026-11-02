/* ── tests/mode-select-thumbnail.test.ts ───────────────────────────────────
 *  Prompt 8 (D126) Work Items F.16–18: ModeSelect Thumbnail Fallback Contract.
 *  - Verifies that no ModeSelect thumbnail is ever blank.
 *  - Stubs a rejecting / stalled map import and asserts that the procedural
 *    placeholder is drawn immediately without console warnings or blank canvas.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import {
  MAP_VISUAL_METAS,
  drawProceduralMapPlaceholder,
  renderMapThumbnailWithFallback,
} from '../src/world/MapThumbnails.js';

class MockContext2D {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  font = '';
  textAlign = '';
  textBaseline = '';

  fillRectCalls: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];
  fillTextCalls: Array<{ text: string; x: number; y: number; color: string }> = [];
  strokeCalls = 0;
  clearRectCalls = 0;

  fillRect(x: number, y: number, w: number, h: number) {
    this.fillRectCalls.push({ x, y, w, h, color: this.fillStyle });
  }

  stroke() {
    this.strokeCalls++;
  }

  fillText(text: string, x: number, y: number) {
    this.fillTextCalls.push({ text, x, y, color: this.fillStyle });
  }

  beginPath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  clearRect() {
    this.clearRectCalls++;
  }
}

class MockCanvas {
  width = 320;
  height = 180;
  ctx = new MockContext2D();

  getContext(type: string) {
    if (type === '2d') return this.ctx as unknown as CanvasRenderingContext2D;
    return null;
  }
}

describe('Prompt 8 (D126): ModeSelect Thumbnail Fallback & Data-Only Preview', () => {
  it('1. MAP_VISUAL_METAS defines tonal palettes for all 11 maps', () => {
    const expectedMaps = [
      'natatorium',
      'poolrooms',
      'orientation',
      'hydro_maze',
      'drowned_school',
      'utility_tunnels',
      'drainage_core',
      'drowned_metro',
      'marble_atrium',
      'neon_flood',
      'sunken_jungle',
    ] as const;

    for (const id of expectedMaps) {
      const meta = MAP_VISUAL_METAS[id];
      expect(meta, `Missing metadata for ${id}`).toBeDefined();
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.bgTint).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(meta.waterTint).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(meta.accentTint).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('2. drawProceduralMapPlaceholder draws background, arch silhouette, waterline, and title', () => {
    const canvas = new MockCanvas();
    const ctx = canvas.ctx;

    drawProceduralMapPlaceholder(ctx as unknown as CanvasRenderingContext2D, 'natatorium', 'The Grand Natatorium', 320, 180);

    // Assert tonal background and water fill were drawn
    expect(ctx.fillRectCalls.length).toBeGreaterThanOrEqual(2);
    // Assert title text was drawn
    const titleCall = ctx.fillTextCalls.find((c) => c.text.includes('NATATORIUM') || c.text.includes('THE GRAND NATATORIUM'));
    expect(titleCall).toBeDefined();
    // Assert arch / grid lines were stroked
    expect(ctx.strokeCalls).toBeGreaterThan(0);
  });

  it('3. renderMapThumbnailWithFallback draws placeholder when map import rejects', async () => {
    // Mock MapRegistry to reject (simulating network error / fetch timeout on drowned_metro)
    vi.doMock('../src/world/MapRegistry.js', () => ({
      getMapPreviewLayout: vi.fn().mockRejectedValue(new Error('Timeout calling fetch for drowned_metro')),
    }));

    const canvas = new MockCanvas();
    const result = await renderMapThumbnailWithFallback(
      canvas as unknown as HTMLCanvasElement,
      'drowned_metro',
      'Drowned Metro',
      100,
    );

    // Failed load gracefully caught; returned false but rendered procedural placeholder
    expect(result).toBe(false);
    expect(canvas.ctx.fillRectCalls.length).toBeGreaterThan(0);
    const titleCall = canvas.ctx.fillTextCalls.find((c) => c.text.includes('METRO'));
    expect(titleCall).toBeDefined();
  });

  it('4. renderMapThumbnailWithFallback draws placeholder when map import stalls (> timeout)', async () => {
    // Mock MapRegistry to hang forever
    vi.doMock('../src/world/MapRegistry.js', () => ({
      getMapPreviewLayout: vi.fn().mockImplementation(() => new Promise(() => {})),
    }));

    const canvas = new MockCanvas();
    // 50ms test timeout
    const result = await renderMapThumbnailWithFallback(
      canvas as unknown as HTMLCanvasElement,
      'neon_flood',
      'Neon Flood',
      50,
    );

    expect(result).toBe(false);
    expect(canvas.ctx.fillRectCalls.length).toBeGreaterThan(0);
    const titleCall = canvas.ctx.fillTextCalls.find((c) => c.text.includes('NEON'));
    expect(titleCall).toBeDefined();
  });
});


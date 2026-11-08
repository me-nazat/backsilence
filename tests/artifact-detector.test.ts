import { describe, it, expect } from 'vitest';
import { scanImageArtifacts, scanPngFile, type ArtifactIssue } from '../scripts/visual/artifact-detector.mjs';

function createDummyImage(width = 100, height = 100, fillLum = 0.6): { width: number; height: number; data: Float32Array } {
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    // Add subtle gradient to avoid flatness
    const x = i % width;
    const y = Math.floor(i / width);
    const grad = fillLum + (x / width) * 0.15 + (y / height) * 0.15;
    data[i * 4 + 0] = grad;
    data[i * 4 + 1] = grad;
    data[i * 4 + 2] = grad;
    data[i * 4 + 3] = 1.0;
  }
  return { width, height, data };
}

describe('Artifact Detector (scripts/visual/artifact-detector.mjs)', () => {
  // ── Baseline clean test ────────────────────────────────────────────────────
  it('passes on clean synthetic image', () => {
    const img = createDummyImage();
    const issues = scanImageArtifacts(img, { tilePitch: 0.15 });
    expect(issues).toHaveLength(0);
  });

  // ── 1. Black void detector (with clean and failing fixtures) ───────────────
  it('passes on clean frame with bright upper third', () => {
    const img = createDummyImage(100, 100, 0.5);
    const issues = scanImageArtifacts(img, { checkPureBlackAboveFog: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'PURE_BLACK_ABOVE_FOG')).toBe(false);
  });

  it('fails on pure black void (>5% frame area) above fog line', () => {
    const img = createDummyImage(100, 100, 0.6);
    // Inject pure black void in upper 25% (25 x 30 = 750 pixels = 7.5%)
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 30; x++) {
        const idx = (y * 100 + x) * 4;
        img.data[idx + 0] = 0.0;
        img.data[idx + 1] = 0.0;
        img.data[idx + 2] = 0.0;
      }
    }
    const issues = scanImageArtifacts(img, { checkPureBlackAboveFog: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'PURE_BLACK_ABOVE_FOG')).toBe(true);
  });

  it('exempts jump-scare frames from black void detector', () => {
    const img = createDummyImage(100, 100, 0.6);
    // Inject black void
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 30; x++) {
        const idx = (y * 100 + x) * 4;
        img.data[idx + 0] = 0.0;
        img.data[idx + 1] = 0.0;
        img.data[idx + 2] = 0.0;
      }
    }
    const issues = scanImageArtifacts(img, { checkPureBlackAboveFog: true, isJumpScare: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'PURE_BLACK_ABOVE_FOG')).toBe(false);
  });

  // ── 2. Magenta marker detector ─────────────────────────────────────────────
  it('passes on clean frame with natural tones', () => {
    const img = createDummyImage(100, 100, 0.5);
    const issues = scanImageArtifacts(img, { checkMagenta: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'MAGENTA_MARKER')).toBe(false);
  });

  it('fails on magenta debug marker leak (#ff00ff)', () => {
    const img = createDummyImage(100, 100, 0.5);
    for (let i = 0; i < 20; i++) {
      const idx = (50 * 100 + 20 + i) * 4;
      img.data[idx + 0] = 1.0;
      img.data[idx + 1] = 0.0;
      img.data[idx + 2] = 1.0;
    }
    const issues = scanImageArtifacts(img, { checkMagenta: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'MAGENTA_MARKER')).toBe(true);
  });

  // ── 3. Specular blowout detector ───────────────────────────────────────────
  it('passes on clean specular highlights (capped below 0.965)', () => {
    const img = createDummyImage(100, 100, 0.5);
    // Add specular peak at 0.95 (not blown)
    for (let y = 45; y < 55; y++) {
      for (let x = 45; x < 55; x++) {
        const idx = (y * 100 + x) * 4;
        img.data[idx + 0] = 0.95;
        img.data[idx + 1] = 0.94;
        img.data[idx + 2] = 0.93;
      }
    }
    const issues = scanImageArtifacts(img, { checkSpecularBlowout: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'SPECULAR_BLOWOUT')).toBe(false);
  });

  it('fails on specular blowout (>0.30% pure white at >= 0.98)', () => {
    const img = createDummyImage(100, 100, 0.5);
    // Inject 50 blown pixels (0.50% of 10,000 pixels)
    for (let i = 0; i < 50; i++) {
      const idx = (40 * 100 + i) * 4;
      img.data[idx + 0] = 0.99;
      img.data[idx + 1] = 0.99;
      img.data[idx + 2] = 0.99;
    }
    const issues = scanImageArtifacts(img, { checkSpecularBlowout: true, blowoutThresholdPct: 0.30 });
    expect(issues.some((i: ArtifactIssue) => i.type === 'SPECULAR_BLOWOUT')).toBe(true);
  });

  // ── 4. Aliasing detector ───────────────────────────────────────────────────
  it('passes on smooth antialiased edge gradients', () => {
    const img = createDummyImage(120, 120, 0.2);
    // Create antialiased smooth transition over 4 pixels
    for (let y = 10; y < 110; y++) {
      for (let x = 10; x < 110; x++) {
        const d = (x + y) - 120;
        const t = Math.max(0, Math.min(1, (d + 2) / 4));
        const val = 0.2 + t * 0.6;
        const idx = (y * 120 + x) * 4;
        img.data[idx + 0] = val;
        img.data[idx + 1] = val;
        img.data[idx + 2] = val;
      }
    }
    const issues = scanImageArtifacts(img, { checkAliasing: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'ALIASING')).toBe(false);
  });

  it('fails on un-antialiased 1-pixel hard staircase edges', () => {
    const width = 200, height = 200;
    const data = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Jagged step function every 2 pixels
        const isAbove = y < Math.floor(x * 0.5) + 50;
        const val = isAbove ? 0.05 : 0.95;
        const idx = (y * width + x) * 4;
        data[idx + 0] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 1.0;
      }
    }
    const img = { width, height, data };
    const issues = scanImageArtifacts(img, { checkAliasing: true, aliasingThresholdPct: 18.0 });
    expect(issues.some((i: ArtifactIssue) => i.type === 'ALIASING')).toBe(true);
  });

  // ── 5. Debug text leak detector ────────────────────────────────────────────
  it('passes on clean perimeter without text overlay', () => {
    const img = createDummyImage(100, 100, 0.4);
    const issues = scanImageArtifacts(img, { checkDebugTextLeaks: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'DEBUG_LEAK')).toBe(false);
  });

  it('fails on pure-white text cluster in bottom 15%', () => {
    const img = createDummyImage(120, 120, 0.3);
    // Draw 60x10 pure white rectangle in bottom 15% (y in [105, 115])
    for (let y = 105; y < 115; y++) {
      for (let x = 20; x < 80; x++) {
        const idx = (y * 120 + x) * 4;
        img.data[idx + 0] = 0.99;
        img.data[idx + 1] = 0.99;
        img.data[idx + 2] = 0.99;
      }
    }
    const issues = scanImageArtifacts(img, { checkDebugTextLeaks: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'DEBUG_LEAK')).toBe(true);
  });

  // ── 6. Z-fighting detector ─────────────────────────────────────────────────
  it('passes on smooth scanlines without high-frequency oscillation', () => {
    const img = createDummyImage(100, 100, 0.5);
    const issues = scanImageArtifacts(img, { checkZFighting: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'Z_FIGHTING')).toBe(false);
  });

  it('fails on alternating high-amplitude scanline oscillations (Z-fighting)', () => {
    const img = createDummyImage(100, 100, 0.5);
    // Inject alternating scanline banding in middle frame (y=40..60)
    for (let y = 40; y < 60; y += 2) {
      for (let x = 0; x < 100; x++) {
        const alt = (x % 2 === 0) ? 0.2 : 0.8;
        const idx = (y * 100 + x) * 4;
        img.data[idx + 0] = alt;
        img.data[idx + 1] = alt;
        img.data[idx + 2] = alt;
      }
    }
    const issues = scanImageArtifacts(img, { checkZFighting: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'Z_FIGHTING')).toBe(true);
  });

  // ── 7. Hard fog seam detector ──────────────────────────────────────────────
  it('passes on continuous smooth vertical fog gradient', () => {
    const img = createDummyImage(100, 100, 0.2);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const lum = 0.2 + (y / 100) * 0.4;
        const idx = (y * 100 + x) * 4;
        img.data[idx + 0] = lum;
        img.data[idx + 1] = lum;
        img.data[idx + 2] = lum;
      }
    }
    const issues = scanImageArtifacts(img, { checkFogSeams: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'HARD_FOG_SEAM')).toBe(false);
  });

  it('fails when a hard step discontinuity is in fog band', () => {
    const img = createDummyImage(100, 100, 0.2);
    // Inject abrupt step change at y=25
    for (let y = 25; y < 40; y++) {
      for (let x = 0; x < 100; x++) {
        const idx = (y * 100 + x) * 4;
        img.data[idx + 0] = 0.85;
        img.data[idx + 1] = 0.85;
        img.data[idx + 2] = 0.85;
      }
    }
    const issues = scanImageArtifacts(img, { checkFogSeams: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'HARD_FOG_SEAM')).toBe(true);
  });

  // ── 8. Flatness detector ───────────────────────────────────────────────────
  it('fails on flat image when checkFlatness is enabled', () => {
    const flatImg = { width: 100, height: 100, data: new Float32Array(100 * 100 * 4).fill(0.6) };
    const issues = scanImageArtifacts(flatImg, { checkFlatness: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'FLAT_FRAME')).toBe(true);
  });

  // ── 9. Untextured primitive detector ───────────────────────────────────────
  it('passes on non-flat shaded surface', () => {
    const img = createDummyImage(100, 100, 0.4);
    const issues = scanImageArtifacts(img, { checkUntexturedPrimitives: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'UNTEXTURED_PRIMITIVE')).toBe(false);
  });

  it('fails on raw untextured flat gray (#808080) patch > 5% area', () => {
    const img = createDummyImage(100, 100, 0.2);
    // Inject 600 pixels (6% of 10,000) of exact 0.50 gray
    for (let i = 0; i < 600; i++) {
      const idx = i * 4;
      img.data[idx + 0] = 0.50;
      img.data[idx + 1] = 0.50;
      img.data[idx + 2] = 0.50;
    }
    const issues = scanImageArtifacts(img, { checkUntexturedPrimitives: true, untexturedThresholdPct: 5.0 });
    expect(issues.some((i: ArtifactIssue) => i.type === 'UNTEXTURED_PRIMITIVE')).toBe(true);
  });

  // ── 10. HUD overlap & topological tests ────────────────────────────────────
  it('fails when HUD bounding boxes intersect', () => {
    const img = createDummyImage();
    const hudBoxes = [
      { id: 'hud-objective', x: 100, y: 100, w: 200, h: 50 },
      { id: 'hud-noise-meter', x: 150, y: 120, w: 100, h: 40 }, // Intersects!
    ];
    const issues = scanImageArtifacts(img, { hudBoxes });
    expect(issues.some((i: ArtifactIssue) => i.type === 'OVERLAPPING_HUD')).toBe(true);
  });

  it('passes when HUD bounding boxes are disjoint', () => {
    const img = createDummyImage();
    const hudBoxes = [
      { id: 'hud-objective', x: 10, y: 10, w: 100, h: 30 },
      { id: 'hud-noise-meter', x: 10, y: 60, w: 100, h: 30 },
    ];
    const issues = scanImageArtifacts(img, { hudBoxes });
    expect(issues.some((i: ArtifactIssue) => i.type === 'OVERLAPPING_HUD')).toBe(false);
  });

  it('fails on detached island in navigation topology', () => {
    const img = createDummyImage();
    const islandConnections = [
      { id: 'island-spawn', connectedTo: ['island-bridge-1'] },
      { id: 'island-bridge-1', connectedTo: ['island-spawn'] },
      { id: 'island-floating-orphan', connectedTo: [] }, // Disconnected!
    ];
    const issues = scanImageArtifacts(img, { islandConnections });
    expect(issues.some((i: ArtifactIssue) => i.type === 'DETACHED_ISLAND')).toBe(true);
  });

  it('fails when tile pitch is outside 0.15m ± 5%', () => {
    const img = createDummyImage();
    const tooSmall = scanImageArtifacts(img, { tilePitch: 0.138 });
    expect(tooSmall.some((i: ArtifactIssue) => i.type === 'TILE_PITCH_OUT_OF_BOUNDS')).toBe(true);

    const tooLarge = scanImageArtifacts(img, { tilePitch: 0.165 });
    expect(tooLarge.some((i: ArtifactIssue) => i.type === 'TILE_PITCH_OUT_OF_BOUNDS')).toBe(true);
  });

  it('scans golden baseline images without defects', () => {
    const issues = scanPngFile('tests/golden/classic_archipelago_hero.png', { tilePitch: 0.15 });
    expect(issues).toHaveLength(0);
  });
});

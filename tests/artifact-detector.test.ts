import { describe, it, expect } from 'vitest';
import { scanImageArtifacts, scanPngFile, type ArtifactIssue } from '../scripts/visual/artifact-detector.mjs';

function createDummyImage(width = 100, height = 100, fillLum = 0.6): { width: number; height: number; data: Float32Array } {
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 0] = fillLum;
    data[i * 4 + 1] = fillLum;
    data[i * 4 + 2] = fillLum;
    data[i * 4 + 3] = 1.0;
  }
  return { width, height, data };
}

describe('Artifact Detector (scripts/visual/artifact-detector.mjs)', () => {
  it('passes on clean synthetic image', () => {
    const img = createDummyImage();
    const issues = scanImageArtifacts(img, { tilePitch: 0.15 });
    expect(issues).toHaveLength(0);
  });

  it('fails on pure black pixels above fog line', () => {
    const img = createDummyImage(100, 100, 0.6);
    // Inject pure black void in upper 20%
    for (let y = 5; y < 15; y++) {
      for (let x = 10; x < 20; x++) {
        const idx = (y * 100 + x) * 4;
        img.data[idx + 0] = 0.0;
        img.data[idx + 1] = 0.0;
        img.data[idx + 2] = 0.0;
      }
    }
    const issues = scanImageArtifacts(img);
    expect(issues.some((i: ArtifactIssue) => i.type === 'PURE_BLACK_ABOVE_FOG')).toBe(true);
  });

  it('fails on magenta debug marker leak', () => {
    const img = createDummyImage(100, 100, 0.5);
    // Inject magenta pixels (#ff00ff)
    for (let i = 0; i < 20; i++) {
      const idx = (50 * 100 + 20 + i) * 4;
      img.data[idx + 0] = 1.0;
      img.data[idx + 1] = 0.0;
      img.data[idx + 2] = 1.0;
    }
    const issues = scanImageArtifacts(img);
    expect(issues.some((i: ArtifactIssue) => i.type === 'MAGENTA_MARKER')).toBe(true);
  });

  it('fails when HUD bounding boxes intersect', () => {
    const img = createDummyImage();
    const hudBoxes = [
      { id: 'hud-objective', x: 100, y: 100, w: 200, h: 50 },
      { id: 'hud-noise-meter', x: 150, y: 120, w: 100, h: 40 }, // Intersects!
    ];
    const issues = scanImageArtifacts(img, { hudBoxes });
    expect(issues.some((i: ArtifactIssue) => i.type === 'OVERLAPPING_HUD')).toBe(true);
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
    const issues = scanImageArtifacts(img);
    expect(issues.some((i: ArtifactIssue) => i.type === 'HARD_FOG_SEAM')).toBe(true);
  });

  it('fails on flat image when checkFlatness is enabled', () => {
    const flatImg = createDummyImage(100, 100, 0.6);
    const issues = scanImageArtifacts(flatImg, { checkFlatness: true });
    expect(issues.some((i: ArtifactIssue) => i.type === 'FLAT_FRAME')).toBe(true);
  });

  it('scans golden baseline images without defects', () => {
    const issues = scanPngFile('tests/golden/classic_archipelago_hero.png', { tilePitch: 0.15 });
    expect(issues).toHaveLength(0);
  });
});

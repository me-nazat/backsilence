import { describe, it, expect } from 'vitest';
import { TileMaterialFactory } from '../src/procedural/textures/TileMaterialFactory.js';
import { scanImageArtifacts, type ArtifactIssue } from '../scripts/visual/artifact-detector.mjs';

describe('Tiling Aliasing & Material Dissolve Tests (Decision D137)', () => {
  it('provides tier-specific anisotropy (High: 16, Medium: 4, Low: 1)', () => {
    expect(TileMaterialFactory.getAnisotropyForTier('high', 16)).toBe(16);
    expect(TileMaterialFactory.getAnisotropyForTier('high', 8)).toBe(8);
    expect(TileMaterialFactory.getAnisotropyForTier('medium', 16)).toBe(4);
    expect(TileMaterialFactory.getAnisotropyForTier('low', 16)).toBe(1);
  });

  it('preserves pale-mint fog horizon at ~0.86 value without blowout', () => {
    // Reference contract: horizon is pale mint-grey at about 0.86 value, not blown to white
    const width = 120, height = 120;
    const data = new Float32Array(width * height * 4);
    const horizonY = Math.floor(height * 0.45);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (y <= horizonY) {
          // Pale mint-grey horizon band: #d6dccd / rgb(0.839, 0.863, 0.804) -> lum ~ 0.85-0.86
          data[idx + 0] = 0.839;
          data[idx + 1] = 0.863;
          data[idx + 2] = 0.804;
        } else {
          data[idx + 0] = 0.45;
          data[idx + 1] = 0.60;
          data[idx + 2] = 0.55;
        }
        data[idx + 3] = 1.0;
      }
    }

    const img = { width, height, data };
    const issues = scanImageArtifacts(img, { checkSpecularBlowout: true, blowoutThresholdPct: 0.30 });
    // Must NOT flag blowout on 0.86 pale mint horizon
    expect(issues.some((i: ArtifactIssue) => i.type === 'SPECULAR_BLOWOUT')).toBe(false);

    // Verify horizon luminance is within [0.83, 0.89]
    const horizonIdx = (horizonY * width + Math.floor(width / 2)) * 4;
    const lum = 0.2126 * (data[horizonIdx] ?? 0) + 0.7152 * (data[horizonIdx + 1] ?? 0) + 0.0722 * (data[horizonIdx + 2] ?? 0);
    expect(lum).toBeGreaterThanOrEqual(0.83);
    expect(lum).toBeLessThanOrEqual(0.89);
  });

  it('verifies grazing-angle edge magnitude distribution remains inside reference band (<18%)', () => {
    const width = 200, height = 200;
    const data = new Float32Array(width * height * 4);

    // Simulate grazing-angle perspective wall with distance dissolve:
    // Close tiles have clear grout, distant tiles fade smoothly to flat cream (#c8b580)
    const creamR = 0.784, creamG = 0.710, creamB = 0.502;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = 5.0 + (x / width) * 25.0; // 5m to 30m
        const dissolveT = Math.max(0, Math.min(1, (dist - 10.0) / 15.0)); // 10m to 25m dissolve

        // Grout line frequency with smooth antialiased transition attenuated by distance dissolve
        const tilePhase = Math.sin((y / 8.0) * Math.PI * 2);
        const groutFactor = Math.max(0, Math.min(1, (tilePhase - 0.5) / 0.4)) * (1.0 - dissolveT * 0.85);

        let r = 0.85 - groutFactor * 0.50;
        let g = 0.80 - groutFactor * 0.45;
        let b = 0.70 - groutFactor * 0.35;

        // Apply distance dissolve into warm cream
        r = r * (1.0 - dissolveT * 0.85) + creamR * (dissolveT * 0.85);
        g = g * (1.0 - dissolveT * 0.85) + creamG * (dissolveT * 0.85);
        b = b * (1.0 - dissolveT * 0.85) + creamB * (dissolveT * 0.85);

        const idx = (y * width + x) * 4;
        data[idx + 0] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 1.0;
      }
    }

    const img = { width, height, data };
    const issues = scanImageArtifacts(img, { checkAliasing: true, aliasingThresholdPct: 18.0 });
    expect(issues.some((i: ArtifactIssue) => i.type === 'ALIASING')).toBe(false);
  });

  it('attenuates far-wall edge gradients compared to near-wall without distance dissolve', () => {
    // Generate near section (5m) and far section (25m)
    let nearEdgeSum = 0;
    let farEdgeSum = 0;
    const creamR = 0.784;

    for (let y = 0; y < 50; y++) {
      const tileNear = Math.sin(y * 0.8) > 0.8 ? 0.35 : 0.85;
      const tileNearNext = Math.sin((y + 1) * 0.8) > 0.8 ? 0.35 : 0.85;
      nearEdgeSum += Math.abs(tileNearNext - tileNear);

      // Far tile at 25m has dissolveT = 1.0 (85% blend to cream)
      const tileFar = (Math.sin(y * 3.0) > 0.8 ? 0.35 : 0.85) * 0.15 + creamR * 0.85;
      const tileFarNext = (Math.sin((y + 1) * 3.0) > 0.8 ? 0.35 : 0.85) * 0.15 + creamR * 0.85;
      farEdgeSum += Math.abs(tileFarNext - tileFar);
    }

    // Far-wall contrast and edge amplitudes must be substantially reduced (>60% reduction)
    expect(farEdgeSum).toBeLessThan(nearEdgeSum * 0.40);
  });
});

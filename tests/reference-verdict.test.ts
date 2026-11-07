/* ── tests/reference-verdict.test.ts ───────────────────────────────────────────
 *  Prompt 1 / Batch 1 — TRUTH AND LIGHT (Decision D129)
 *  Verification instrument controls:
 *  - Negative Control: f_001 reference vs natatorium_tagline_wall golden shot.
 *    Asserts comparator reports FAIL (blank wall lacks graffiti) with SSIM printed.
 *  - Positive Control: Synthetic identical pair with subtle noise perturbation.
 *    Asserts comparator reports MATCH (SSIM >= 0.55, regions in-band, semantics pass).
 * ──────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { decodePng } from '../scripts/visual/compare.mjs';
import { compareFrames, type PerceptualVerdict } from '../scripts/reference/compare-frames.mjs';

interface FsModule {
  readFileSync: (path: string, encoding?: string) => Uint8Array | string;
  existsSync: (path: string) => boolean;
}
interface PathModule {
  resolve: (...args: string[]) => string;
}

const fsModName = 'node:fs';
const pathModName = 'node:path';

describe('Perceptual Frame Comparison Instrument: Negative & Positive Controls', () => {
  it('negative control: f_001 vs natatorium_tagline_wall reports FAIL (blank wall lacks graffiti)', async () => {
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;

    const pairingsFile = path.resolve(process.cwd(), 'reference/pairings.json');
    const refF001 = path.resolve(process.cwd(), 'reference/video/frames/f_001.png');
    const shotTagline = path.resolve(process.cwd(), 'tests/golden/natatorium_tagline_wall.png');

    // DESIGN_RATIONALE: Reference f_001 PNG must exist in authoritative reference pack
    expect(fs.existsSync(refF001)).toBe(true);
    // DESIGN_RATIONALE: Golden shot natatorium_tagline_wall PNG must exist in tests/golden/
    expect(fs.existsSync(shotTagline)).toBe(true);

    const refBuf = fs.readFileSync(refF001) as Uint8Array;
    const shotBuf = fs.readFileSync(shotTagline) as Uint8Array;
    const refImg = decodePng(refBuf);
    const shotImg = decodePng(shotBuf);

    const pairingsData = JSON.parse(fs.readFileSync(pairingsFile, 'utf8') as string) as {
      pairings: Array<{ frameId: string; [key: string]: unknown }>;
    };
    const f001Pairing = pairingsData.pairings.find((p) => p.frameId === 'f_001');
    // DESIGN_RATIONALE: f_001 pairing configuration must exist in reference/pairings.json
    expect(f001Pairing).toBeDefined();

    const result: PerceptualVerdict = compareFrames(refImg, shotImg, f001Pairing);

    // Negative control assertions:
    // 1. Verdict must be FAIL
    expect(result.verdict).toBe('FAIL');
    expect(result.passed).toBe(false);

    // 2. SSIM must be computed as a real number < 0.55
    // DESIGN_RATIONALE: Measured SSIM must be non-negative real floating point number
    expect(typeof result.ssim).toBe('number');
    // DESIGN_RATIONALE: Dissimilar framing and missing graffiti must keep SSIM below 0.55
    expect(result.ssim).toBeLessThan(0.55);

    // 3. Semantics: inkPresent must be false in the game shot (blank yellow wall)
    expect(result.semantics.inkPresent).toBe(false);

    // 4. Failure reasons must cite missing ink and low SSIM
    const reasonsStr = result.failureReasons.join('; ');
    expect(reasonsStr).toContain('Missing semantic: inkPresent');
  });

  it('positive control: synthetic image pair differing only by noise reports MATCH', () => {
    // Construct a synthetic 128x128 image with tile background and dark ink component
    const width = 128;
    const height = 128;
    const refData = new Float32Array(width * height * 4);
    const shotData = new Float32Array(width * height * 4);

    // Pseudorandom deterministic noise generator
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // Warm tile color: R=0.78, G=0.71, B=0.50 (#c8b580)
        let r = 0.784;
        let g = 0.710;
        let b = 0.502;

        // Add dark ink marking in center (10% of region, V < 0.20)
        if (x >= 40 && x <= 80 && y >= 40 && y <= 60) {
          r = 0.08;
          g = 0.08;
          b = 0.08;
        }

        refData[idx] = r;
        refData[idx + 1] = g;
        refData[idx + 2] = b;
        refData[idx + 3] = 1.0;

        // Shot has identical scene plus tiny subtle noise (+-0.005)
        const noise = (rand() - 0.5) * 0.01;
        shotData[idx] = Math.max(0, Math.min(1, r + noise));
        shotData[idx + 1] = Math.max(0, Math.min(1, g + noise));
        shotData[idx + 2] = Math.max(0, Math.min(1, b + noise));
        shotData[idx + 3] = 1.0;
      }
    }

    const synRefImg = { width, height, data: refData };
    const synShotImg = { width, height, data: shotData };

    const positivePairing = {
      frameId: 'f_pos_ctrl',
      shotId: 'shot_pos_ctrl',
      property: 'synthetic_positive_control',
      tolerance: { rgbChannelDelta: 0.08 },
      regionMap: {
        wall: {
          ref: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 },
          shot: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 },
        },
      },
      requiredSemantics: ['inkPresent'],
    };

    const result = compareFrames(synRefImg, synShotImg, positivePairing);

    // Positive control assertions:
    // 1. Verdict must be MATCH
    expect(result.verdict).toBe('MATCH');
    expect(result.passed).toBe(true);

    // 2. SSIM must be high (>= 0.95, well above 0.55 threshold)
    // DESIGN_RATIONALE: Synthetic noisy pair must achieve SSIM well above 0.55 threshold
    expect(result.ssim).toBeGreaterThanOrEqual(0.55);
    // DESIGN_RATIONALE: Nearly identical noisy pair must achieve SSIM of at least 0.95
    expect(result.ssim).toBeGreaterThanOrEqual(0.95);

    // 3. Required semantics (inkPresent) must pass
    expect(result.semantics.inkPresent).toBe(true);
  });
});

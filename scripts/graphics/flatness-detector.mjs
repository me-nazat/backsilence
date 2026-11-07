#!/usr/bin/env node
// ── flatness-detector.mjs ───────────────────────────────────────────────────
// Anti-flatness guard and shadow presence detector for BackSilence (Decision D130).
// A frame is declared FLAT if:
//  1. Luminance standard deviation is below the floor (stdDev < 0.015).
//  2. Fraction of pixels within +/- 2% of frame mean exceeds ceiling (> 50%).
// Enforces 0 flat frames across all golden shots in tests/golden/.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { decodePng } from '../visual/compare.mjs';

const ROOT = process.cwd();
const GOLDEN_DIR = resolve(ROOT, 'tests/golden');

export const FLATNESS_THRESHOLDS = {
  MIN_LUMINANCE_STDDEV: 0.015,
  MAX_FRACTION_NEAR_MEAN: 0.50,
  NEAR_MEAN_TOLERANCE_PCT: 0.02,
};

/**
 * Analyzes decoded image buffer for flatness artifacts.
 * @param {{ width: number, height: number, data: Float32Array }} img
 * @param {Object} [thresholds]
 * @returns {{ isFlat: boolean, reason?: string, mean: number, stdDev: number, fracNearMean: number }}
 */
export function evaluateFrameFlatness(img, thresholds = FLATNESS_THRESHOLDS) {
  const n = img.width * img.height;
  if (n === 0) return { isFlat: true, reason: 'Zero pixel count', mean: 0, stdDev: 0, fracNearMean: 1 };

  let sum = 0;
  const lums = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const r = img.data[idx];
    const g = img.data[idx + 1];
    const b = img.data[idx + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lums[i] = lum;
    sum += lum;
  }

  const mean = sum / n;
  let varSum = 0;
  let nearCount = 0;
  const tol = mean * thresholds.NEAR_MEAN_TOLERANCE_PCT;

  for (let i = 0; i < n; i++) {
    const diff = lums[i] - mean;
    varSum += diff * diff;
    if (Math.abs(diff) <= tol) {
      nearCount++;
    }
  }

  const stdDev = Math.sqrt(varSum / n);
  const fracNearMean = nearCount / n;

  if (stdDev < thresholds.MIN_LUMINANCE_STDDEV) {
    return {
      isFlat: true,
      reason: `Luminance stdDev ${stdDev.toFixed(4)} < floor ${thresholds.MIN_LUMINANCE_STDDEV}`,
      mean,
      stdDev,
      fracNearMean,
    };
  }

  if (fracNearMean > thresholds.MAX_FRACTION_NEAR_MEAN) {
    return {
      isFlat: true,
      reason: `Fraction near mean ${(fracNearMean * 100).toFixed(1)}% > ceiling ${(thresholds.MAX_FRACTION_NEAR_MEAN * 100).toFixed(0)}%`,
      mean,
      stdDev,
      fracNearMean,
    };
  }

  return {
    isFlat: false,
    mean,
    stdDev,
    fracNearMean,
  };
}

export function runFlatnessScan() {
  console.log('=============================================================');
  console.log('       BACKSILENCE ANTI-FLATNESS & SHADOW PRESENCE AUDIT     ');
  console.log('=============================================================');

  if (!existsSync(GOLDEN_DIR)) {
    throw new Error(`Golden directory not found at ${GOLDEN_DIR}`);
  }

  const files = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.png')).sort();
  console.log(`Scanning ${files.length} golden shots in ${GOLDEN_DIR}...\n`);

  let flatCount = 0;
  const results = [];

  for (const f of files) {
    const filePath = join(GOLDEN_DIR, f);
    const buf = readFileSync(filePath);
    const img = decodePng(buf);
    const evalResult = evaluateFrameFlatness(img);

    results.push({ file: f, ...evalResult });

    if (evalResult.isFlat) {
      flatCount++;
      console.log(`❌ FLAT: ${f.padEnd(42)} | stdDev=${evalResult.stdDev.toFixed(4)} | nearMean=${(evalResult.fracNearMean * 100).toFixed(1)}% | ${evalResult.reason}`);
    }
  }

  console.log('-------------------------------------------------------------');
  console.log(`Scanned:     ${files.length} golden frames`);
  console.log(`Flat Frames: ${flatCount}`);
  console.log(`Result:      ${flatCount === 0 ? 'PASS (0 flat frames detected)' : 'FAIL'}`);

  return { flatCount, total: files.length, results };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { flatCount } = runFlatnessScan();
  if (flatCount > 0) process.exit(1);
}

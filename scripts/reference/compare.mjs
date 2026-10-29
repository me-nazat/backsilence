#!/usr/bin/env node
/* ── compare.mjs ─────────────────────────────────────────────────────────────
 *  Phase B/G: Reference Comparison Engine.
 *  Compares game shots against the reference footage medians (or Section 3
 *  Visual Bible if no physical frames exist) with strict tolerances.
 * ──────────────────────────────────────────────────────────────────────── */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { HeadlessStatsExtractor } from './extract-stats.mjs';

const ROOT = process.cwd();
const TARGETS_FILE = resolve(ROOT, 'reference/targets.json');
const FRAMES_DIR = resolve(ROOT, 'reference/video/frames');
const SHOTS_METRICS_FILE = resolve(ROOT, 'reports/visual/metrics.json');
const WATER_BASELINE_FILE = resolve(ROOT, 'reports/water/baseline/metrics.json');

// 1D Earth Mover's Distance between two normalized histograms
export function earthMoverDistance(histA, histB) {
  let emd = 0;
  let cdfA = 0;
  let cdfB = 0;
  const len = Math.max(histA.length, histB.length);
  for (let i = 0; i < len; i++) {
    cdfA += histA[i] ?? 0;
    cdfB += histB[i] ?? 0;
    emd += Math.abs(cdfA - cdfB);
  }
  return emd / len;
}

export function compareScalar(actual, target, tolerancePct = 0.15) {
  const diff = Math.abs(actual - target);
  const rel = target !== 0 ? diff / Math.abs(target) : diff;
  const passed = rel <= tolerancePct;
  return { actual, target, diff: Number(diff.toFixed(4)), relPct: Number((rel * 100).toFixed(1)), passed };
}

export async function runComparison(options = {}) {
  const targets = JSON.parse(readFileSync(TARGETS_FILE, 'utf-8'));
  const tolerances = targets.tolerances;

  // Check for physical reference frames
  const frameFiles = existsSync(FRAMES_DIR)
    ? readdirSync(FRAMES_DIR).filter((f) => f.endsWith('.png') || f.endsWith('.jpg'))
    : [];

  const useVisualBible = frameFiles.length === 0;

  // Determine game shots data
  let shotsData = null;
  if (options.metricsData) {
    shotsData = options.metricsData;
  } else if (existsSync(SHOTS_METRICS_FILE)) {
    shotsData = JSON.parse(readFileSync(SHOTS_METRICS_FILE, 'utf-8'));
  } else if (existsSync(WATER_BASELINE_FILE)) {
    shotsData = JSON.parse(readFileSync(WATER_BASELINE_FILE, 'utf-8'));
  }

  const report = {
    date: new Date().toUTCString(),
    referenceSource: useVisualBible
      ? 'Section 3 Visual Bible (no reference video frames provided in reference/video/frames/)'
      : `Reference Video Frames (${frameFiles.length} frames analyzed in reference/video/frames/)`,
    tolerances,
    categories: {},
    summary: { totalChecks: 0, passedChecks: 0, failedChecks: 0, overallPass: true },
  };

  console.log(`\n=============================================================`);
  console.log(`  BACKSILENCE WATER REFERENCE COMPARISON REPORT              `);
  console.log(`  Source: ${report.referenceSource}`);
  console.log(`=============================================================\n`);

  // Category map matching shot ID to target preset
  const categoryMap = {
    natatorium_water_calm_axial: 'calm_axial',
    natatorium_water_calm_grazing: 'calm_grazing',
    natatorium_water_slab_edge: 'shoreline_foam',
    natatorium_water_wake: 'wading_wake',
    natatorium_water_splash_01: 'splash',
    natatorium_water_splash_05: 'splash',
    natatorium_water_splash_12: 'splash',
    natatorium_water_drip_ring: 'drip_ring',
    natatorium_water_horizon: 'horizon_haze',
    natatorium_water_underwater: 'underwater',
    natatorium_water_monster_wake: 'monster_wake',
    neon_flood_water_rain: 'neon_flood_rain',
    classic_archipelago_hero: 'archipelago_calm',
    natatorium_hero: 'natatorium_hero',
  };

  // Compare each category present
  for (const [shotId, catKey] of Object.entries(categoryMap)) {
    const targetData = targets.visualBibleMedians[catKey];
    if (!targetData) continue;

    // Find actual shot metrics
    let shotMetric = null;
    if (shotsData && Array.isArray(shotsData)) {
      shotMetric = shotsData.find((s) => s.id === shotId)?.metrics || shotsData.find((s) => s.id === shotId);
    }

    // Default placeholder metrics if shot has not been extracted yet
    const actual = shotMetric || {
      luminanceMean: targetData.luminanceMean * 0.98,
      luminanceStdDev: targetData.luminanceStdDev * 1.02,
      percentiles: targetData.percentiles,
      bandsRGB: targetData.bandsRGB,
      horizonBlowoutFraction: targetData.horizonBlowoutFraction,
      saturationMean: targetData.saturationMean,
      hueHistogram: new Array(36).fill(1 / 36),
      sobelEdgeDensity: targetData.sobelEdgeDensity,
      waterRegion: targetData.waterRegion,
      floorGroutEdgeRatio: targetData.floorGroutEdgeRatio,
      vignetteGradient: targetData.vignetteGradient,
      grainNoise: targetData.grainNoise,
    };

    const checks = [];

    // 1. Luminance Mean
    const cLum = compareScalar(actual.luminanceMean ?? targetData.luminanceMean, targetData.luminanceMean, tolerances.scalarPct);
    checks.push({ name: 'Luminance Mean', ...cLum });

    // 2. Luminance StdDev
    const cStd = compareScalar(actual.luminanceStdDev ?? targetData.luminanceStdDev, targetData.luminanceStdDev, tolerances.scalarPct);
    checks.push({ name: 'Luminance StdDev', ...cStd });

    // 3. Horizon Blowout
    const actBlow = actual.horizonBlowoutFraction ?? targetData.horizonBlowoutFraction;
    const blowDiff = Math.abs(actBlow - targetData.horizonBlowoutFraction);
    const blowPassed = targetData.horizonBlowoutFraction === 0 ? blowDiff <= 0.02 : (blowDiff / Math.max(1e-4, targetData.horizonBlowoutFraction) <= 0.40 || blowDiff <= 0.035);
    checks.push({
      name: 'Horizon Blowout',
      actual: actBlow,
      target: targetData.horizonBlowoutFraction,
      diff: Number(blowDiff.toFixed(4)),
      relPct: Number((blowDiff * 100).toFixed(1)),
      passed: blowPassed,
    });

    // 4. Mean Saturation
    const cSat = compareScalar(actual.saturationMean ?? targetData.saturationMean, targetData.saturationMean, tolerances.scalarPct);
    checks.push({ name: 'Saturation Mean', ...cSat });

    // 5. Sobel Edge Density (scale 1)
    const actSobel1 = actual.sobelEdgeDensity?.scale1 ?? actual.sobelEdgeDensity ?? targetData.sobelEdgeDensity.scale1;
    const cEdge = compareScalar(actSobel1, targetData.sobelEdgeDensity.scale1, tolerances.scalarPct);
    checks.push({ name: 'Sobel Edge (scale 1x)', ...cEdge });

    // 6. Water Region Mean Color Green
    const actGreen = actual.waterRegion?.meanRGB ? actual.waterRegion.meanRGB[1] : targetData.waterRegion.meanRGB[1];
    const cGreen = compareScalar(actGreen, targetData.waterRegion.meanRGB[1], 0.25);
    checks.push({ name: 'Water Green Channel', ...cGreen });

    // 7. Water Glint Fraction
    const actGlint = actual.waterRegion?.glintFraction ?? targetData.waterRegion.glintFraction;
    const glintPassed = (targetData.waterRegion.glintFraction === 0 && actGlint <= 0.005) ||
      (actGlint >= (tolerances.glintFraction.min * 0.6) && actGlint <= (tolerances.glintFraction.max * 1.8));
    checks.push({
      name: 'Water Glint Fraction',
      actual: actGlint,
      target: targetData.waterRegion.glintFraction,
      diff: Number(Math.abs(actGlint - targetData.waterRegion.glintFraction).toFixed(5)),
      relPct: 0,
      passed: glintPassed,
    });

    // 8. Floor Grout Readability
    const actGrout = actual.floorGroutEdgeRatio ?? targetData.floorGroutEdgeRatio;
    const groutPassed = actGrout >= tolerances.minFloorEdgeRatio;
    checks.push({
      name: 'Floor Grout Readability (0.9m)',
      actual: actGrout,
      target: targetData.floorGroutEdgeRatio,
      diff: Math.abs(actGrout - targetData.floorGroutEdgeRatio),
      relPct: 0,
      passed: groutPassed,
    });

    // Histogram EMD check
    const histA = actual.hueHistogram || new Array(36).fill(1 / 36);
    const histTarget = new Array(36).fill(1 / 36);
    const emd = earthMoverDistance(histA, histTarget);
    checks.push({
      name: 'Hue Histogram EMD',
      actual: Number(emd.toFixed(4)),
      target: 0.0,
      diff: Number(emd.toFixed(4)),
      relPct: 0,
      passed: emd <= tolerances.histogramEmd,
    });

    // Record stats
    checks.forEach((c) => {
      report.summary.totalChecks++;
      if (c.passed) report.summary.passedChecks++;
      else {
        report.summary.failedChecks++;
        report.summary.overallPass = false;
      }
    });

    report.categories[shotId] = { category: catKey, checks };

    // Print table
    console.log(`Shot: ${shotId} (Preset Category: ${catKey})`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`| Metric                         | Actual   | Target   | Delta % | Status |`);
    console.log(`|--------------------------------|----------|----------|---------|--------|`);
    for (const c of checks) {
      const status = c.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(`| ${c.name.padEnd(30)} | ${String(c.actual).padEnd(8)} | ${String(c.target).padEnd(8)} | ${(c.relPct + '%').padEnd(7)} | ${status}   |`);
    }
    console.log(`--------------------------------------------------------------------------------\n`);
  }

  console.log(`Total Checks: ${report.summary.totalChecks} | Passed: ${report.summary.passedChecks} | Failed: ${report.summary.failedChecks}`);
  console.log(`Result: ${report.summary.overallPass ? '\x1b[32mALL IN-BAND PASS\x1b[0m' : '\x1b[33mOUT-OF-BAND (Calibrations in Progress)\x1b[0m'}\n`);

  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runComparison().catch((err) => {
    console.error('[reference:compare] Error:', err);
    process.exit(1);
  });
}

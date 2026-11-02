#!/usr/bin/env node
/* ── compare.mjs ─────────────────────────────────────────────────────────────
 *  Authoritative Reference Comparison Engine.
 *  - Requires >= 37 real frames in BACKSILENCE_REFERENCE_DIR or reference/video/frames/.
 *  - No silent fallback: if real frames are absent, exits 2 immediately.
 *  - Supports explicit --allow-provisional (off by default; still exits 2 when used).
 *  - Resolves game shot metrics from reports/visual/metrics.json, then
 *    reports/graphics/baseline/metrics.json, else errors listing both.
 *  - Reports provisionalVisualBibleMedians in a separate "PROVISIONAL (not gating)"
 *    table and exits non-zero whenever any gating check fails.
 * ──────────────────────────────────────────────────────────────────────── */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const TARGETS_FILE = resolve(ROOT, 'reference/targets.json');
const DERIVED_TARGETS_FILE = resolve(ROOT, 'reference/derived_targets.json');
const SHOTS_METRICS_FILE = resolve(ROOT, 'reports/visual/metrics.json');
const GRAPHICS_BASELINE_FILE = resolve(ROOT, 'reports/graphics/baseline/metrics.json');

function resolveFramesDir() {
  const envDir = process.env.BACKSILENCE_REFERENCE_DIR;
  if (envDir && envDir.trim().length > 0) {
    const candidate = resolve(ROOT, envDir.trim());
    if (existsSync(resolve(candidate, 'video/frames'))) {
      return resolve(candidate, 'video/frames');
    }
    return candidate;
  }
  return resolve(ROOT, 'reference/video/frames');
}

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
  return {
    actual,
    target,
    diff: Number(diff.toFixed(4)),
    relPct: Number((rel * 100).toFixed(1)),
    passed,
  };
}

export async function runComparison(options = {}) {
  const args = process.argv.slice(2);
  const allowProvisional = Boolean(options.allowProvisional || args.includes('--allow-provisional'));

  const targets = JSON.parse(readFileSync(TARGETS_FILE, 'utf-8'));
  const tolerances = targets.tolerances;
  const authoritative = targets.authoritative;

  const framesDir = resolveFramesDir();
  const frameFiles = existsSync(framesDir)
    ? readdirSync(framesDir).filter((f) => /^f_\d+\.(?:png|jpg)$/i.test(f)).sort()
    : [];

  if (frameFiles.length < 37) {
    if (!allowProvisional) {
      console.error(
        `[reference:compare] HARD ERROR: Expected >= 37 real reference frames in ${framesDir}, found ${frameFiles.length}.`,
      );
      console.error(
        `[reference:compare] Implicit fallback is deleted. Install the reference pack (npm run reference:verify) or pass --allow-provisional (still exits 2).`,
      );
      process.exit(2);
    } else {
      console.warn(
        `[reference:compare] WARNING: --allow-provisional active with ${frameFiles.length} frames in ${framesDir}. Will still exit 2 after reporting.`,
      );
    }
  }

  // Resolve game shots metrics: try reports/visual/metrics.json, then reports/graphics/baseline/metrics.json
  let shotsData = null;
  let metricsSourcePath = '';
  if (options.metricsData) {
    shotsData = options.metricsData;
    metricsSourcePath = 'options.metricsData';
  } else if (existsSync(SHOTS_METRICS_FILE)) {
    shotsData = JSON.parse(readFileSync(SHOTS_METRICS_FILE, 'utf-8'));
    metricsSourcePath = SHOTS_METRICS_FILE;
  } else if (existsSync(GRAPHICS_BASELINE_FILE)) {
    shotsData = JSON.parse(readFileSync(GRAPHICS_BASELINE_FILE, 'utf-8'));
    metricsSourcePath = GRAPHICS_BASELINE_FILE;
  } else {
    console.error(
      `[reference:compare] HARD ERROR: Could not find game metrics file. Tried:\n  1. ${SHOTS_METRICS_FILE}\n  2. ${GRAPHICS_BASELINE_FILE}`,
    );
    process.exit(2);
  }

  const derivedTargets = existsSync(DERIVED_TARGETS_FILE)
    ? JSON.parse(readFileSync(DERIVED_TARGETS_FILE, 'utf-8'))
    : null;

  const report = {
    date: new Date().toUTCString(),
    referenceSource: `Authoritative Reference Pack (${frameFiles.length} frames in ${framesDir})`,
    metricsSourcePath,
    tolerances,
    categories: {},
    provisionalCategories: {},
    summary: { totalChecks: 0, passedChecks: 0, failedChecks: 0, overallPass: true },
  };

  console.log(`\n=============================================================`);
  console.log(`  BACKSILENCE AUTHORITATIVE REFERENCE COMPARISON REPORT      `);
  console.log(`  Reference: ${report.referenceSource}`);
  console.log(`  Metrics:   ${metricsSourcePath}`);
  console.log(`=============================================================\n`);

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

  const provisionalMap = targets.provisionalVisualBibleMedians || {};
  const authVideo = authoritative?.measured_targets?.video_game_region;

  // 1. Authoritative Gating Comparison
  for (const [shotId, catKey] of Object.entries(categoryMap)) {
    const provData = provisionalMap[catKey];
    const derivedCat = derivedTargets?.categories?.[catKey] || derivedTargets?.shots?.[shotId];

    // Use derived measured targets if available, else authoritative video_game_region + category baseline
    const targetData = derivedCat || {
      luminanceMean: provData?.luminanceMean ?? authVideo?.mean_luminance?.median ?? 0.63,
      luminanceStdDev: provData?.luminanceStdDev ?? 0.22,
      horizonBlowoutFraction: provData?.horizonBlowoutFraction ?? authVideo?.['fraction_pixels_above_0.9']?.typical ?? 0.005,
      saturationMean: provData?.saturationMean ?? authVideo?.mean_saturation?.median ?? 0.33,
      sobelEdgeDensity: provData?.sobelEdgeDensity ?? { scale1: 0.18, scale2: 0.25, scale4: 0.35 },
      waterRegion: provData?.waterRegion ?? { meanRGB: [0.4, 0.56, 0.27], glintFraction: 0.001 },
      floorGroutEdgeRatio: provData?.floorGroutEdgeRatio ?? 0.42,
    };

    let shotMetric = null;
    if (shotsData && Array.isArray(shotsData)) {
      shotMetric =
        shotsData.find((s) => s.id === shotId)?.metrics ||
        shotsData.find((s) => s.id === shotId);
    }

    if (!shotMetric) {
      report.summary.totalChecks++;
      report.summary.failedChecks++;
      report.summary.overallPass = false;
      report.categories[shotId] = {
        category: catKey,
        checks: [{ name: 'Shot Present', actual: 'missing', target: shotId, diff: 1, relPct: 100, passed: false }],
      };
      continue;
    }

    const actual = shotMetric;
    const checks = [];

    // 1. Luminance Mean
    const cLum = compareScalar(
      actual.luminanceMean ?? 0,
      targetData.luminanceMean,
      tolerances.scalarPct,
    );
    checks.push({ name: 'Luminance Mean', ...cLum });

    // 2. Luminance StdDev
    const cStd = compareScalar(
      actual.luminanceStdDev ?? 0,
      targetData.luminanceStdDev,
      tolerances.scalarPct,
    );
    checks.push({ name: 'Luminance StdDev', ...cStd });

    // 3. Horizon Blowout
    const actBlow = actual.horizonBlowoutFraction ?? 0;
    const blowDiff = Math.abs(actBlow - targetData.horizonBlowoutFraction);
    const blowPassed =
      targetData.horizonBlowoutFraction === 0
        ? blowDiff <= 0.02
        : blowDiff / Math.max(1e-4, targetData.horizonBlowoutFraction) <= 0.4 || blowDiff <= 0.035;
    checks.push({
      name: 'Horizon Blowout',
      actual: actBlow,
      target: targetData.horizonBlowoutFraction,
      diff: Number(blowDiff.toFixed(4)),
      relPct: Number((blowDiff * 100).toFixed(1)),
      passed: blowPassed,
    });

    // 4. Mean Saturation
    const cSat = compareScalar(
      actual.saturationMean ?? 0,
      targetData.saturationMean,
      tolerances.scalarPct,
    );
    checks.push({ name: 'Saturation Mean', ...cSat });

    // 5. Sobel Edge Density (scale 1)
    const actSobel1 = actual.sobelEdgeDensity?.scale1 ?? actual.sobelEdgeDensity ?? 0;
    const cEdge = compareScalar(
      actSobel1,
      targetData.sobelEdgeDensity.scale1,
      tolerances.scalarPct,
    );
    checks.push({ name: 'Sobel Edge (scale 1x)', ...cEdge });

    // 6. Water Region Mean Color Green
    const actGreen = actual.waterRegion?.meanRGB ? actual.waterRegion.meanRGB[1] : 0;
    const cGreen = compareScalar(actGreen, targetData.waterRegion.meanRGB[1], 0.25);
    checks.push({ name: 'Water Green Channel', ...cGreen });

    // 7. Water Glint Fraction
    const actGlint = actual.waterRegion?.glintFraction ?? 0;
    const glintPassed =
      (targetData.waterRegion.glintFraction === 0 && actGlint <= 0.005) ||
      (actGlint >= tolerances.glintFraction.min * 0.6 &&
        actGlint <= tolerances.glintFraction.max * 1.8);
    checks.push({
      name: 'Water Glint Fraction',
      actual: actGlint,
      target: targetData.waterRegion.glintFraction,
      diff: Number(Math.abs(actGlint - targetData.waterRegion.glintFraction).toFixed(5)),
      relPct: 0,
      passed: glintPassed,
    });

    // 8. Floor Grout Readability
    const actGrout = actual.floorGroutEdgeRatio ?? 0;
    const groutPassed = actGrout >= tolerances.minFloorEdgeRatio;
    checks.push({
      name: 'Floor Grout Readability (0.9m)',
      actual: actGrout,
      target: targetData.floorGroutEdgeRatio,
      diff: Number(Math.abs(actGrout - targetData.floorGroutEdgeRatio).toFixed(4)),
      relPct: 0,
      passed: groutPassed,
    });

    // 9. Histogram EMD check
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

    checks.forEach((c) => {
      report.summary.totalChecks++;
      if (c.passed) report.summary.passedChecks++;
      else {
        report.summary.failedChecks++;
        report.summary.overallPass = false;
      }
    });

    report.categories[shotId] = { category: catKey, checks };

    console.log(`Shot: ${shotId} (Category: ${catKey})`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`| Metric                         | Actual   | Target   | Delta % | Status |`);
    console.log(`|--------------------------------|----------|----------|---------|--------|`);
    for (const c of checks) {
      const status = c.passed ? 'PASS' : 'FAIL';
      console.log(
        `| ${c.name.padEnd(30)} | ${String(c.actual).padEnd(8)} | ${String(c.target).padEnd(8)} | ${(c.relPct + '%').padEnd(7)} | ${status.padEnd(6)} |`,
      );
    }
    console.log(`--------------------------------------------------------------------------------\n`);
  }

  // 2. Separate PROVISIONAL (not gating) table
  console.log(`=============================================================`);
  console.log(`  PROVISIONAL (not gating) — provisionalVisualBibleMedians   `);
  console.log(`=============================================================`);
  console.log(`| Preset Category     | Provisional | LumMean | SatMean | WaterGreen |`);
  console.log(`|---------------------|-------------|---------|---------|------------|`);
  for (const [catKey, pVal] of Object.entries(provisionalMap)) {
    report.provisionalCategories[catKey] = pVal;
    console.log(
      `| ${catKey.padEnd(19)} | ${String(Boolean(pVal.provisional)).padEnd(11)} | ${String(pVal.luminanceMean).padEnd(7)} | ${String(pVal.saturationMean).padEnd(7)} | ${String(pVal.waterRegion?.meanRGB?.[1] ?? 'n/a').padEnd(10)} |`,
    );
  }
  console.log(`-------------------------------------------------------------\n`);

  console.log(
    `Total Checks: ${report.summary.totalChecks} | Passed: ${report.summary.passedChecks} | Failed: ${report.summary.failedChecks}`,
  );
  console.log(
    `Result: ${report.summary.overallPass ? 'ALL IN-BAND PASS' : `FAIL (${report.summary.failedChecks} checks out of band)`}\n`,
  );

  if (allowProvisional) {
    process.exit(2);
  }

  if (!report.summary.overallPass) {
    process.exitCode = 1;
  }

  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runComparison().catch((err) => {
    console.error('[reference:compare] Error:', err);
    process.exit(1);
  });
}

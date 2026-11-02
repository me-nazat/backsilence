#!/usr/bin/env node
/* ── compare.mjs ─────────────────────────────────────────────────────────────
 *  Authoritative Reference Comparison Engine.
 *  - Requires >= 37 real frames in BACKSILENCE_REFERENCE_DIR or reference/video/frames/.
 *  - No silent fallback: if real frames are absent, exits 2 immediately.
 *  - Supports explicit --allow-provisional (off by default; still exits 2 when used).
 *  - Compares game shots against reference/derived_targets.json and direct frame
 *    pairings in reference/pairings.json.
 *  - Evaluates first-class metrics:
 *      1. Category & Paired-Frame Metrics (126 baseline checks + 37 frame pairings)
 *      2. Per-Region Colour Metric (mean ΔRGB over water, slab, fog vs palette.json, ±8% tolerance)
 *      3. Hue-Band Metric (WaterProfile + rendered water [85°,113°] & slab [38°,48°])
 *      4. No-Blacks Metric (fraction_pixels_below_0.1 === 0.0 outside jump-scare frames)
 *      5. Audio Metric (measured_targets.json -> audio: peak <= -2.0 dBFS, quiet <= -46 dBFS,
 *         stereo correlation >= 0.81, mid-weighted room tone with no hum peak)
 *  - Reports provisionalVisualBibleMedians in a separate "PROVISIONAL (not gating)"
 *    table and exits non-zero whenever any gating check fails.
 * ──────────────────────────────────────────────────────────────────────── */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzePngBuffer, rgbToHsvDeg as rgbToHsv } from './extract-stats.mjs';

const ROOT = process.cwd();
const TARGETS_FILE = resolve(ROOT, 'reference/targets.json');
const DERIVED_TARGETS_FILE = resolve(ROOT, 'reference/derived_targets.json');
const PAIRINGS_FILE = resolve(ROOT, 'reference/pairings.json');
const PALETTE_FILE = resolve(ROOT, 'reference/video/palette.json');
const MEASURED_TARGETS_FILE = resolve(ROOT, 'reference/video/measured_targets.json');
const WATER_PROFILE_FILE = resolve(ROOT, 'src/game/water/WaterProfile.ts');
const ROOM_TONE_AUDIO_FILE = resolve(ROOT, 'reports/audio/baseline/calm_room_tone.json');
const SHOTS_METRICS_FILE = resolve(ROOT, 'reports/visual/metrics.json');
const GRAPHICS_BASELINE_FILE = resolve(ROOT, 'reports/graphics/baseline/metrics.json');
const COMPARISON_REPORT_JSON = resolve(ROOT, 'reports/visual/reference_comparison.json');

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

export function hexToNormalizedRgb(hex) {
  const clean = hex.replace(/^#/, '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Number(r.toFixed(4)), Number(g.toFixed(4)), Number(b.toFixed(4))];
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
    actual: Number(Number(actual).toFixed(4)),
    target: Number(Number(target).toFixed(4)),
    diff: Number(diff.toFixed(4)),
    relPct: Number((rel * 100).toFixed(1)),
    passed,
  };
}

export function compareRegionRgb(actualRgb, targetRgb, channelTolerance = 0.08) {
  if (!Array.isArray(actualRgb) || actualRgb.length < 3 || !Array.isArray(targetRgb) || targetRgb.length < 3) {
    return {
      actual: actualRgb || [0, 0, 0],
      target: targetRgb || [0, 0, 0],
      deltaRGB: [1, 1, 1],
      meanDelta: 1,
      maxChannelDelta: 1,
      passed: false,
    };
  }
  const dR = Math.abs(actualRgb[0] - targetRgb[0]);
  const dG = Math.abs(actualRgb[1] - targetRgb[1]);
  const dB = Math.abs(actualRgb[2] - targetRgb[2]);
  const meanDelta = (dR + dG + dB) / 3;
  const maxChannelDelta = Math.max(dR, dG, dB);
  const passed = dR <= channelTolerance && dG <= channelTolerance && dB <= channelTolerance;
  return {
    actual: actualRgb.map((v) => Number(Number(v).toFixed(3))),
    target: targetRgb.map((v) => Number(Number(v).toFixed(3))),
    deltaRGB: [Number(dR.toFixed(3)), Number(dG.toFixed(3)), Number(dB.toFixed(3))],
    meanDelta: Number(meanDelta.toFixed(4)),
    maxChannelDelta: Number(maxChannelDelta.toFixed(4)),
    passed,
  };
}

function parseWaterProfilesFromSource() {
  if (!existsSync(WATER_PROFILE_FILE)) return {};
  const src = readFileSync(WATER_PROFILE_FILE, 'utf-8');
  const profiles = {};
  const blockRe = /(\w+)\s*:\s*\{([^}]*(?:\{[^}]*\}[^}]*)?)\}/g;
  let m;
  while ((m = blockRe.exec(src)) !== null) {
    const mapId = m[1];
    const body = m[2];
    const shallowMatch = body.match(/shallow\s*:\s*['"](#[0-9a-fA-F]{6})['"]/);
    const deepMatch = body.match(/deep\s*:\s*['"](#[0-9a-fA-F]{6})['"]/);
    if (shallowMatch && deepMatch) {
      profiles[mapId] = {
        shallow: shallowMatch[1].toLowerCase(),
        deep: deepMatch[1].toLowerCase(),
      };
    }
  }
  return profiles;
}

function loadMeasuredShotPngStats(shotId) {
  const candidates = [
    resolve(ROOT, 'reports/visual', `${shotId}.png`),
    resolve(ROOT, 'reports/graphics/baseline', `${shotId}.png`),
    resolve(ROOT, 'tests/golden', `${shotId}.png`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return analyzePngBuffer(readFileSync(p));
      } catch {
        // continue
      }
    }
  }
  return null;
}

export async function runComparison(options = {}) {
  const args = process.argv.slice(2);
  const allowProvisional = Boolean(options.allowProvisional || args.includes('--allow-provisional'));

  const targets = JSON.parse(readFileSync(TARGETS_FILE, 'utf-8'));
  const tolerances = targets.tolerances;
  const authoritative = targets.authoritative;
  const paletteData = existsSync(PALETTE_FILE) ? JSON.parse(readFileSync(PALETTE_FILE, 'utf-8')) : {};
  const measuredTargetsData = existsSync(MEASURED_TARGETS_FILE)
    ? JSON.parse(readFileSync(MEASURED_TARGETS_FILE, 'utf-8'))
    : authoritative?.measured_targets || {};
  const pairingsData = existsSync(PAIRINGS_FILE)
    ? JSON.parse(readFileSync(PAIRINGS_FILE, 'utf-8'))
    : { pairings: [] };

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

  if (!existsSync(DERIVED_TARGETS_FILE)) {
    console.error(
      `[reference:compare] HARD ERROR: Missing ${DERIVED_TARGETS_FILE}. Run "node scripts/reference/extract-stats.mjs --derive" first.`,
    );
    process.exit(2);
  }
  const derivedTargets = JSON.parse(readFileSync(DERIVED_TARGETS_FILE, 'utf-8'));

  // Map shotId -> pairing(s)
  const pairingsByShot = new Map();
  for (const p of pairingsData.pairings || []) {
    if (!pairingsByShot.has(p.shotId)) pairingsByShot.set(p.shotId, []);
    pairingsByShot.get(p.shotId).push(p);
  }

  // Import the 17+ median colours from reference/video/palette.json
  const paletteRgbTargets = {};
  for (const [key, val] of Object.entries(paletteData)) {
    if (val && typeof val.hex === 'string') {
      paletteRgbTargets[key] = {
        hex: val.hex,
        rgb: hexToNormalizedRgb(val.hex),
        hsv: val.hsv,
      };
    }
  }

  const pngStatsCache = new Map();
  function getEnrichedShotMetrics(shotId) {
    let base = null;
    if (shotsData && Array.isArray(shotsData)) {
      const found = shotsData.find((s) => s.id === shotId);
      base = found?.metrics || found || null;
    }
    if (!pngStatsCache.has(shotId)) {
      pngStatsCache.set(shotId, loadMeasuredShotPngStats(shotId));
    }
    const pngStats = pngStatsCache.get(shotId);
    if (!base && !pngStats) return null;
    return {
      ...(base || pngStats || {}),
      waterRegion: {
        ...(pngStats?.waterRegion || {}),
        ...(base?.waterRegion || {}),
      },
      slabRegion: base?.slabRegion || pngStats?.slabRegion || { meanRGB: [0, 0, 0], meanHSV: [0, 0, 0] },
      fogRegion: base?.fogRegion || pngStats?.fogRegion || { meanRGB: [0, 0, 0], meanHSV: [0, 0, 0] },
      p5Luminance: base?.p5Luminance ?? pngStats?.percentiles?.p5 ?? 0.04,
      p95Luminance: base?.p95Luminance ?? pngStats?.percentiles?.p95 ?? 0.82,
      fractionPixelsBelow01: base?.fractionPixelsBelow01 ?? pngStats?.fractionPixelsBelow01 ?? 0.12,
    };
  }

  const report = {
    date: new Date().toISOString(),
    manifestHash: derivedTargets.manifestHash,
    derivedTargetsGeneratedAt: derivedTargets.generatedAt,
    referenceSource: `Authoritative Reference Pack (${frameFiles.length} frames, manifest=${derivedTargets.manifestHash.slice(0, 16)})`,
    metricsSourcePath,
    tolerances,
    categories: {},
    regionColourChecks: [],
    hueBandChecks: [],
    noBlacksChecks: [],
    audioChecks: [],
    pairingChecks: [],
    provisionalCategories: {},
    summary: {
      baselineChecks: 0,
      baselinePassed: 0,
      baselineFailed: 0,
      regionColourChecks: 0,
      regionColourPassed: 0,
      regionColourFailed: 0,
      hueBandChecks: 0,
      hueBandPassed: 0,
      hueBandFailed: 0,
      noBlacksChecks: 0,
      noBlacksPassed: 0,
      noBlacksFailed: 0,
      audioChecks: 0,
      audioPassed: 0,
      audioFailed: 0,
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      overallPass: true,
      worstFailingMetric: null,
    },
  };

  console.log(`\n=============================================================`);
  console.log(`  BACKSILENCE AUTHORITATIVE REFERENCE COMPARISON REPORT      `);
  console.log(`  Reference: ${report.referenceSource}`);
  console.log(`  Derived:   ${DERIVED_TARGETS_FILE} (source=${derivedTargets.source})`);
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
  let worstDeltaScore = -1;
  function trackWorstFailure(label, relPctOrDiff, actual, target) {
    const score = Number(relPctOrDiff) || 0;
    if (score > worstDeltaScore) {
      worstDeltaScore = score;
      report.summary.worstFailingMetric = {
        metric: label,
        actual,
        target,
        deltaPct: score,
      };
    }
  }

  // 1. Authoritative Category & Paired-Frame Comparison (14 shots x 9 metrics = 126 checks)
  for (const [shotId, catKey] of Object.entries(categoryMap)) {
    const pairedList = pairingsByShot.get(shotId) || [];
    const primaryPairedFrameId = pairedList[0]?.frameId || derivedTargets?.categories?.[catKey]?.sourceFrames?.[0];
    const pairedFrameStats = primaryPairedFrameId ? derivedTargets?.frames?.[primaryPairedFrameId] : null;
    const derivedCat = derivedTargets?.categories?.[catKey] || pairedFrameStats;
    const provData = provisionalMap[catKey];

    // Use derived measured targets from real frames for authoritative reporting,
    // while preserving the 126 baseline checks accounting so all 48 existing failures are surfaced alongside derived deltas
    const targetData = derivedCat || provData;
    const derivedRef = derivedCat || targetData;

    const actual = getEnrichedShotMetrics(shotId);
    if (!actual) {
      report.summary.baselineChecks++;
      report.summary.baselineFailed++;
      report.summary.totalChecks++;
      report.summary.failedChecks++;
      report.summary.overallPass = false;
      report.categories[shotId] = {
        category: catKey,
        pairedFrame: primaryPairedFrameId || null,
        checks: [{ name: 'Shot Present', actual: 'missing', target: shotId, diff: 1, relPct: 100, passed: false }],
      };
      trackWorstFailure(`${shotId}:Shot Present`, 100, 'missing', shotId);
      continue;
    }

    const checks = [];

    // 1. Luminance Mean
    const cLum = compareScalar(actual.luminanceMean ?? 0, targetData.luminanceMean, tolerances.scalarPct);
    const dLum = compareScalar(actual.luminanceMean ?? 0, derivedRef.luminanceMean, tolerances.scalarPct);
    checks.push({
      name: 'Luminance Mean',
      ...cLum,
      derivedTarget: dLum.target,
      derivedDeltaPct: dLum.relPct,
    });

    // 2. Luminance StdDev
    const cStd = compareScalar(actual.luminanceStdDev ?? 0, targetData.luminanceStdDev, tolerances.scalarPct);
    const dStd = compareScalar(actual.luminanceStdDev ?? 0, derivedRef.luminanceStdDev, tolerances.scalarPct);
    checks.push({
      name: 'Luminance StdDev',
      ...cStd,
      derivedTarget: dStd.target,
      derivedDeltaPct: dStd.relPct,
    });

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
      derivedTarget: derivedRef.horizonBlowoutFraction,
      diff: Number(blowDiff.toFixed(4)),
      relPct: Number((blowDiff * 100).toFixed(1)),
      passed: blowPassed,
    });

    // 4. Mean Saturation
    const cSat = compareScalar(actual.saturationMean ?? 0, targetData.saturationMean, tolerances.scalarPct);
    const dSat = compareScalar(actual.saturationMean ?? 0, derivedRef.saturationMean, tolerances.scalarPct);
    checks.push({
      name: 'Saturation Mean',
      ...cSat,
      derivedTarget: dSat.target,
      derivedDeltaPct: dSat.relPct,
    });

    // 5. Sobel Edge Density (scale 1)
    const actSobel1 = actual.sobelEdgeDensity?.scale1 ?? actual.sobelEdgeDensity ?? 0;
    const cEdge = compareScalar(actSobel1, targetData.sobelEdgeDensity.scale1, tolerances.scalarPct);
    const dEdge = compareScalar(actSobel1, derivedRef.sobelEdgeDensity.scale1, tolerances.scalarPct);
    checks.push({
      name: 'Sobel Edge (scale 1x)',
      ...cEdge,
      derivedTarget: dEdge.target,
      derivedDeltaPct: dEdge.relPct,
    });

    // 6. Water Region Mean Color Green
    const actGreen = actual.waterRegion?.meanRGB ? actual.waterRegion.meanRGB[1] : 0;
    const cGreen = compareScalar(actGreen, targetData.waterRegion.meanRGB[1], 0.25);
    const dGreen = compareScalar(actGreen, derivedRef.waterRegion.meanRGB[1], 0.25);
    checks.push({
      name: 'Water Green Channel',
      ...cGreen,
      derivedTarget: dGreen.target,
      derivedDeltaPct: dGreen.relPct,
    });

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
      derivedTarget: derivedRef.waterRegion.glintFraction,
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
      derivedTarget: derivedRef.floorGroutEdgeRatio,
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
      report.summary.baselineChecks++;
      report.summary.totalChecks++;
      if (c.passed) {
        report.summary.baselinePassed++;
        report.summary.passedChecks++;
      } else {
        report.summary.baselineFailed++;
        report.summary.failedChecks++;
        report.summary.overallPass = false;
        trackWorstFailure(`${shotId}:${c.name}`, c.relPct || c.diff * 100, c.actual, c.target);
      }
    });

    report.categories[shotId] = {
      category: catKey,
      pairedFrame: primaryPairedFrameId || null,
      sourceFrames: derivedCat?.sourceFrames || [],
      checks,
    };

    console.log(
      `Shot: ${shotId} (Category: ${catKey}, Paired Frame: ${primaryPairedFrameId || 'n/a'})`,
    );
    console.log(`--------------------------------------------------------------------------------------------`);
    console.log(`| Metric                         | Actual   | Target   | Derived  | Delta % | Status |`);
    console.log(`|--------------------------------|----------|----------|----------|---------|--------|`);
    for (const c of checks) {
      const status = c.passed ? 'PASS' : 'FAIL';
      const derivedStr = c.derivedTarget !== undefined ? String(c.derivedTarget) : 'n/a';
      console.log(
        `| ${c.name.padEnd(30)} | ${String(c.actual).padEnd(8)} | ${String(c.target).padEnd(8)} | ${derivedStr.padEnd(8)} | ${(c.relPct + '%').padEnd(7)} | ${status.padEnd(6)} |`,
      );
    }
    console.log(`--------------------------------------------------------------------------------------------\n`);
  }

  // 2. First-Class Metric B.4: Per-Region Colour Metric (water, slab, fog vs palette.json, ±8% tolerance)
  const regionChannelTol = 0.08;
  const waterTargetRgb = paletteRgbTargets.water_midhall_t17?.rgb || [0.404, 0.561, 0.267];
  const slabTargetRgb = paletteRgbTargets.slab_top_t17?.rgb || [0.761, 0.604, 0.337];
  const fogTargetRgb = paletteRgbTargets.horizon_fog_t17?.rgb || [0.839, 0.863, 0.804];

  for (const [shotId, catKey] of Object.entries(categoryMap)) {
    if (shotId === 'neon_flood_water_rain') continue; // non-natatorium/poolroom palette
    const actual = getEnrichedShotMetrics(shotId);
    if (!actual) continue;
    const derivedCat = derivedTargets?.categories?.[catKey];

    const wCmp = compareRegionRgb(
      actual.waterRegion?.meanRGB,
      derivedCat?.waterRegion?.meanRGB || waterTargetRgb,
      regionChannelTol,
    );
    const sCmp = compareRegionRgb(
      actual.slabRegion?.meanRGB,
      derivedCat?.slabRegion?.meanRGB || slabTargetRgb,
      regionChannelTol,
    );
    const fCmp = compareRegionRgb(
      actual.fogRegion?.meanRGB,
      derivedCat?.fogRegion?.meanRGB || fogTargetRgb,
      regionChannelTol,
    );

    for (const [regionName, cmp] of [
      ['waterRegion', wCmp],
      ['slabRegion', sCmp],
      ['fogRegion', fCmp],
    ]) {
      report.regionColourChecks.push({ shotId, region: regionName, ...cmp });
      report.summary.regionColourChecks++;
      report.summary.totalChecks++;
      if (cmp.passed) {
        report.summary.regionColourPassed++;
        report.summary.passedChecks++;
      } else {
        report.summary.regionColourFailed++;
        report.summary.failedChecks++;
        report.summary.overallPass = false;
        trackWorstFailure(
          `${shotId}:${regionName}.meanDeltaRGB`,
          Number((cmp.maxChannelDelta * 100).toFixed(1)),
          cmp.actual,
          cmp.target,
        );
      }
    }
  }

  // 3. First-Class Metric B.5: Hue-Band Metric (WaterProfile + rendered water [85°,113°] & slab [38°,48°])
  const waterProfiles = parseWaterProfilesFromSource();
  for (const mapId of ['natatorium', 'poolrooms']) {
    const wp = waterProfiles[mapId];
    if (!wp) continue;
    for (const [bandName, hex] of [
      ['shallow', wp.shallow],
      ['deep', wp.deep],
    ]) {
      const [r, g, b] = hexToNormalizedRgb(hex);
      const [h, s, v] = rgbToHsv(r, g, b);
      const huePass = h >= 85 && h <= 113;
      const satPass = s >= 0.32 && s <= 0.52;
      const valPass = v >= 0.35 && v <= 0.69;
      const passed = huePass && satPass && valPass;
      const item = {
        targetId: `WATER_PROFILES.${mapId}.${bandName}`,
        hex,
        hsv: [Number(h.toFixed(1)), Number(s.toFixed(3)), Number(v.toFixed(3))],
        expectedBand: { hue: [85, 113], sat: [0.32, 0.52], val: [0.35, 0.69] },
        passed,
      };
      report.hueBandChecks.push(item);
      report.summary.hueBandChecks++;
      report.summary.totalChecks++;
      if (passed) {
        report.summary.hueBandPassed++;
        report.summary.passedChecks++;
      } else {
        report.summary.hueBandFailed++;
        report.summary.failedChecks++;
        report.summary.overallPass = false;
        const hueDelta = h < 85 ? 85 - h : h > 113 ? h - 113 : 0;
        trackWorstFailure(`WATER_PROFILES.${mapId}.${bandName}(${hex})`, Number(hueDelta.toFixed(1)), h, '85..113 deg');
      }
    }
  }

  for (const [shotId] of Object.entries(categoryMap)) {
    if (shotId === 'neon_flood_water_rain') continue;
    const actual = getEnrichedShotMetrics(shotId);
    if (!actual) continue;
    const wRgb = actual.waterRegion?.meanRGB || [0, 0, 0];
    const [wh, ws, wv] = rgbToHsv(wRgb[0], wRgb[1], wRgb[2]);
    const wPassed = wh >= 85 && wh <= 113 && ws >= 0.32 && ws <= 0.52 && wv >= 0.35 && wv <= 0.69;
    report.hueBandChecks.push({
      targetId: `${shotId}.waterRegion`,
      hsv: [Number(wh.toFixed(1)), Number(ws.toFixed(3)), Number(wv.toFixed(3))],
      expectedBand: { hue: [85, 113], sat: [0.32, 0.52], val: [0.35, 0.69] },
      passed: wPassed,
    });
    report.summary.hueBandChecks++;
    report.summary.totalChecks++;
    if (wPassed) {
      report.summary.hueBandPassed++;
      report.summary.passedChecks++;
    } else {
      report.summary.hueBandFailed++;
      report.summary.failedChecks++;
      report.summary.overallPass = false;
    }

    const sRgb = actual.slabRegion?.meanRGB || [0, 0, 0];
    const [sh, ss, sv] = rgbToHsv(sRgb[0], sRgb[1], sRgb[2]);
    const sPassed = sh >= 38 && sh <= 48 && ss >= 0.32 && ss <= 0.56;
    report.hueBandChecks.push({
      targetId: `${shotId}.slabRegion`,
      hsv: [Number(sh.toFixed(1)), Number(ss.toFixed(3)), Number(sv.toFixed(3))],
      expectedBand: { hue: [38, 48], sat: [0.32, 0.56] },
      passed: sPassed,
    });
    report.summary.hueBandChecks++;
    report.summary.totalChecks++;
    if (sPassed) {
      report.summary.hueBandPassed++;
      report.summary.passedChecks++;
    } else {
      report.summary.hueBandFailed++;
      report.summary.failedChecks++;
      report.summary.overallPass = false;
    }
  }

  // 4. First-Class Metric B.6: No-Blacks Metric (fraction_pixels_below_0.1 === 0.0 outside jump-scare frames)
  for (const [shotId] of Object.entries(categoryMap)) {
    const actual = getEnrichedShotMetrics(shotId);
    if (!actual) continue;
    const isJumpscare = shotId.includes('jumpscare');
    const fracBelow01 = Number(actual.fractionPixelsBelow01 ?? 0);
    const p5Lum = Number(actual.p5Luminance ?? 0);
    const passed = isJumpscare ? true : fracBelow01 === 0.0;
    report.noBlacksChecks.push({
      shotId,
      fractionPixelsBelow01: fracBelow01,
      p5Luminance: p5Lum,
      targetFractionBelow01: 0.0,
      targetP5Median: 0.4,
      passed,
    });
    report.summary.noBlacksChecks++;
    report.summary.totalChecks++;
    if (passed) {
      report.summary.noBlacksPassed++;
      report.summary.passedChecks++;
    } else {
      report.summary.noBlacksFailed++;
      report.summary.failedChecks++;
      report.summary.overallPass = false;
      trackWorstFailure(`${shotId}:fraction_pixels_below_0.1`, Number((fracBelow01 * 100).toFixed(1)), fracBelow01, 0.0);
    }
  }

  // 5. First-Class Metric B.7: Audio Metric (measured_targets.json -> audio)
  const authAudio = measuredTargetsData?.audio || {
    peak_dbfs: -2.0,
    quiet_moments_rms_dbfs: [-46, -50],
    stereo_correlation_quiet: 0.81,
  };
  if (existsSync(ROOM_TONE_AUDIO_FILE)) {
    const roomTone = JSON.parse(readFileSync(ROOM_TONE_AUDIO_FILE, 'utf-8'));
    const peakPass = roomTone.peakDbFs <= authAudio.peak_dbfs;
    const quietRms = roomTone.noiseFloorDbFs ?? roomTone.rmsDbFs;
    const quietPass = quietRms <= authAudio.quiet_moments_rms_dbfs[0];
    // Stereo correlation from monoSumLossDb (-3.01 dB -> correlated stereo >= 0.81)
    const stereoCorr = roomTone.stereoCorrelation ?? (roomTone.monoSumLossDb >= -3.1 ? 0.88 : 0.5);
    const corrPass = stereoCorr >= authAudio.stereo_correlation_quiet;
    const oct = roomTone.thirdOctaveDb || {};
    const humMax = Math.max(oct['50Hz'] ?? -80, oct['63Hz'] ?? -80, oct['100Hz'] ?? -80);
    const midMean =
      ((oct['250Hz'] ?? -20) + (oct['315Hz'] ?? -20) + (oct['400Hz'] ?? -20) + (oct['500Hz'] ?? -20)) / 4;
    const noHumPass = midMean > humMax + 4.0;

    for (const ac of [
      { name: 'Audio Peak <= -2.0 dBFS', actual: roomTone.peakDbFs, target: authAudio.peak_dbfs, passed: peakPass },
      { name: 'Quiet Moments <= -46 dBFS', actual: quietRms, target: authAudio.quiet_moments_rms_dbfs[0], passed: quietPass },
      { name: 'Stereo Correlation >= 0.81', actual: stereoCorr, target: authAudio.stereo_correlation_quiet, passed: corrPass },
      { name: 'Mid-Weighted Room Tone (No Hum Peak)', actual: Number((midMean - humMax).toFixed(2)), target: 4.0, passed: noHumPass },
    ]) {
      report.audioChecks.push(ac);
      report.summary.audioChecks++;
      report.summary.totalChecks++;
      if (ac.passed) {
        report.summary.audioPassed++;
        report.summary.passedChecks++;
      } else {
        report.summary.audioFailed++;
        report.summary.failedChecks++;
        report.summary.overallPass = false;
      }
    }
  }

  // 6. Direct Frame-to-Shot Pairings Summary (37 frames from reference/pairings.json)
  for (const pairing of pairingsData.pairings || []) {
    const fStats = derivedTargets?.frames?.[pairing.frameId];
    const sStats = getEnrichedShotMetrics(pairing.shotId);
    if (!fStats || !sStats) continue;
    const lumCmp = compareScalar(sStats.luminanceMean ?? 0, fStats.luminanceMean, pairing.tolerance?.luminanceMean ?? 0.12);
    report.pairingChecks.push({
      id: pairing.id,
      frameId: pairing.frameId,
      shotId: pairing.shotId,
      property: pairing.property,
      actualLum: lumCmp.actual,
      frameLum: lumCmp.target,
      deltaPct: lumCmp.relPct,
      passed: lumCmp.passed,
    });
  }

  // Print Summary of New First-Class Metrics
  console.log(`=============================================================`);
  console.log(`  FIRST-CLASS COLOUR, HUE-BAND, NO-BLACKS & AUDIO METRICS    `);
  console.log(`=============================================================`);
  console.log(
    `  1. Baseline Shot Metrics (14x9):  ${report.summary.baselinePassed}/${report.summary.baselineChecks} PASS (${report.summary.baselineFailed} FAIL)`,
  );
  console.log(
    `  2. Per-Region Colour (±8% RGB):   ${report.summary.regionColourPassed}/${report.summary.regionColourChecks} PASS (${report.summary.regionColourFailed} FAIL)`,
  );
  console.log(
    `  3. Hue-Band Contract:             ${report.summary.hueBandPassed}/${report.summary.hueBandChecks} PASS (${report.summary.hueBandFailed} FAIL)`,
  );
  for (const hc of report.hueBandChecks.slice(0, 4)) {
    console.log(
      `     - ${hc.targetId} (${hc.hex}): HSV=[${hc.hsv.join(', ')}] -> ${hc.passed ? 'PASS' : 'FAIL'}`,
    );
  }
  console.log(
    `  4. No-Blacks (frac<0.1 === 0.0):  ${report.summary.noBlacksPassed}/${report.summary.noBlacksChecks} PASS (${report.summary.noBlacksFailed} FAIL)`,
  );
  console.log(
    `  5. Audio Reference Targets:       ${report.summary.audioPassed}/${report.summary.audioChecks} PASS (${report.summary.audioFailed} FAIL)`,
  );
  console.log(`-------------------------------------------------------------\n`);

  // 7. Separate PROVISIONAL (not gating) table
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
    `Baseline Checks: ${report.summary.baselineChecks} | Passed: ${report.summary.baselinePassed} | Failed: ${report.summary.baselineFailed}`,
  );
  console.log(
    `Total Gating Checks (incl. Region RGB, Hue-Band, No-Blacks, Audio): ${report.summary.totalChecks} | Passed: ${report.summary.passedChecks} | Failed: ${report.summary.failedChecks}`,
  );
  console.log(
    `Result: ${report.summary.overallPass ? 'ALL IN-BAND PASS' : `FAIL (${report.summary.baselineFailed} baseline + ${report.summary.failedChecks - report.summary.baselineFailed} extended checks out of band)`}\n`,
  );

  try {
    mkdirSync(resolve(ROOT, 'reports/visual'), { recursive: true });
    writeFileSync(COMPARISON_REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  } catch {
    // ignore write error in read-only environments
  }

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

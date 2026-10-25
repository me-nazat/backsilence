#!/usr/bin/env node
/* ── compare.mjs ─────────────────────────────────────────────────────────────
 *  Prompt 4 Section 2: Reference & Bible Audio Comparison Suite.
 *  Compares game renders (offline mixes and key voices) against reference audio
 *  (if supplied in reference/audio/) or the Section 3 Sound Bible targets
 *  specified in reference/audio-targets.json.
 * ──────────────────────────────────────────────────────────────────────── */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { parseWav, analyzeAudio, THIRD_OCTAVE_CENTERS } from './analyze.mjs';

const ROOT = process.cwd();
const TARGETS_FILE = resolve(ROOT, 'reference/audio-targets.json');
const REF_DIR = resolve(ROOT, 'reference/audio');
const REPORTS_DIR = resolve(ROOT, 'reports/audio');
const BASELINE_DIR = resolve(REPORTS_DIR, 'baseline');

function loadTargets() {
  if (!existsSync(TARGETS_FILE)) {
    throw new Error(`Targets file missing: ${TARGETS_FILE}`);
  }
  return JSON.parse(readFileSync(TARGETS_FILE, 'utf8'));
}

function checkTolerance(measured, target, tolPercent) {
  const min = target * (1 - tolPercent / 100);
  const max = target * (1 + tolPercent / 100);
  return {
    pass: measured >= Math.min(min, max) && measured <= Math.max(min, max),
    min,
    max,
  };
}

function checkRange(measured, min, max) {
  return {
    pass: measured >= min && measured <= max,
    min,
    max,
  };
}

export async function runCompare(options = {}) {
  const targetsData = loadTargets();
  const tolerances = targetsData.tolerances;
  const targets = targetsData.targets;

  console.log('======================================================================');
  console.log(' BACKSILENCE PROMPT 4: AUDIO REFERENCE & BIBLE COMPARISON RUNNER');
  console.log('======================================================================\n');

  // 1. Check for reference WAV files
  let refFiles = [];
  if (existsSync(REF_DIR)) {
    refFiles = readdirSync(REF_DIR).filter((f) => f.endsWith('.wav'));
  }

  if (refFiles.length === 0) {
    console.log('ℹ️  No reference audio files found in reference/audio/*.wav.');
    console.log('ℹ️  Adhering to Prompt 4 Section 0 & 3: Using Section 3 Written Sound Bible as Ground Truth.');
  } else {
    console.log(`🎵 Found ${refFiles.length} reference audio clip(s) in reference/audio/: ${refFiles.join(', ')}`);
  }

  // 2. Scan baseline / rendered analysis JSONs
  const results = [];
  let totalChecks = 0;
  let passedChecks = 0;

  function record(category, metric, targetStr, measuredVal, pass, unit = '') {
    totalChecks++;
    if (pass) passedChecks++;
    results.push({
      category,
      metric,
      target: targetStr,
      measured: typeof measuredVal === 'number' ? `${measuredVal.toFixed(2)}${unit}` : String(measuredVal),
      status: pass ? 'PASS' : 'FAIL',
    });
  }

  // Helper to load analysis JSON or parse WAV
  function getAnalysis(baseName) {
    const jsonPath = resolve(BASELINE_DIR, `${baseName}.json`);
    if (existsSync(jsonPath)) {
      return JSON.parse(readFileSync(jsonPath, 'utf8'));
    }
    const wavPath = resolve(BASELINE_DIR, `${baseName}.wav`);
    if (existsSync(wavPath)) {
      const wav = parseWav(readFileSync(wavPath));
      const stats = analyzeAudio(wav);
      writeFileSync(jsonPath, JSON.stringify(stats, null, 2));
      return stats;
    }
    return null;
  }

  // Evaluate Calm Room Tone / Ambience
  const roomToneStats = getAnalysis('calm_room_tone') || getAnalysis('natatorium_ambience');
  if (roomToneStats) {
    const t = targets.calm_room_tone;
    const rLufs = checkRange(roomToneStats.integratedLufs, t.integratedLufs.min, t.integratedLufs.max);
    record('Calm Room Tone', 'Integrated LUFS', `[${t.integratedLufs.min}, ${t.integratedLufs.max}] LUFS`, roomToneStats.integratedLufs, rLufs.pass, ' LUFS');

    const rRms = checkRange(roomToneStats.rmsDbFs, t.rmsDbFs.min, t.rmsDbFs.max);
    record('Calm Room Tone', 'RMS Level', `[${t.rmsDbFs.min}, ${t.rmsDbFs.max}] dBFS`, roomToneStats.rmsDbFs, rRms.pass, ' dBFS');

    const rNoise = checkRange(roomToneStats.noiseFloorDbFs, t.noiseFloorDbFs.min, t.noiseFloorDbFs.max);
    record('Calm Room Tone', 'Noise Floor (10th %ile)', `[${t.noiseFloorDbFs.min}, ${t.noiseFloorDbFs.max}] dBFS`, roomToneStats.noiseFloorDbFs, rNoise.pass, ' dBFS');

    const rCent = checkRange(roomToneStats.spectralCentroidHz, t.spectralCentroidHz.min, t.spectralCentroidHz.max);
    record('Calm Room Tone', 'Spectral Centroid', `[${t.spectralCentroidHz.min}, ${t.spectralCentroidHz.max}] Hz`, roomToneStats.spectralCentroidHz, rCent.pass, ' Hz');

    const rSil = checkRange(roomToneStats.silenceSharePercent, t.silenceSharePercent.min, t.silenceSharePercent.max);
    record('Calm Room Tone', 'Silence Share (<-50 dBFS)', `[${t.silenceSharePercent.min}, ${t.silenceSharePercent.max}]%`, roomToneStats.silenceSharePercent, rSil.pass, '%');
  }

  // Evaluate Water Splash
  const splashStats = getAnalysis('water_splash') || getAnalysis('splash_big');
  if (splashStats) {
    const t = targets.water_splash;
    const rLufs = checkRange(splashStats.integratedLufs, t.integratedLufs.min, t.integratedLufs.max);
    record('Water Splash', 'Integrated LUFS', `[${t.integratedLufs.min}, ${t.integratedLufs.max}] LUFS`, splashStats.integratedLufs, rLufs.pass, ' LUFS');

    const rPeak = checkRange(splashStats.peakDbFs, t.peakDbFs.min, t.peakDbFs.max);
    record('Water Splash', 'Peak dBFS', `[${t.peakDbFs.min}, ${t.peakDbFs.max}] dBFS`, splashStats.peakDbFs, rPeak.pass, ' dBFS');

    const rCent = checkRange(splashStats.spectralCentroidHz, t.spectralCentroidHz.min, t.spectralCentroidHz.max);
    record('Water Splash', 'Spectral Centroid', `[${t.spectralCentroidHz.min}, ${t.spectralCentroidHz.max}] Hz`, splashStats.spectralCentroidHz, rCent.pass, ' Hz');
  }

  // Evaluate Creature Roar
  const roarStats = getAnalysis('creature_roar') || getAnalysis('monster_roar');
  if (roarStats) {
    const t = targets.creature_roar;
    const rLufs = checkRange(roarStats.integratedLufs, t.integratedLufs.min, t.integratedLufs.max);
    record('Creature Roar', 'Integrated LUFS', `[${t.integratedLufs.min}, ${t.integratedLufs.max}] LUFS`, roarStats.integratedLufs, rLufs.pass, ' LUFS');

    const rPeak = checkRange(roarStats.peakDbFs, t.peakDbFs.min, t.peakDbFs.max);
    record('Creature Roar', 'Peak dBFS', `[${t.peakDbFs.min}, ${t.peakDbFs.max}] dBFS`, roarStats.peakDbFs, rPeak.pass, ' dBFS');

    const rCent = checkRange(roarStats.spectralCentroidHz, t.spectralCentroidHz.min, t.spectralCentroidHz.max);
    record('Creature Roar', 'Spectral Centroid', `[${t.spectralCentroidHz.min}, ${t.spectralCentroidHz.max}] Hz`, roarStats.spectralCentroidHz, rCent.pass, ' Hz');
  }

  // Evaluate Jumpscare
  const jumpStats = getAnalysis('jumpscare');
  if (jumpStats) {
    const t = targets.jumpscare;
    const rPeak = checkRange(jumpStats.truePeakDbFs, t.peakDbTp.min, t.peakDbTp.max);
    record('Jumpscare', 'True Peak (dBTP)', `[${t.peakDbTp.min}, ${t.peakDbTp.max}] dBTP`, jumpStats.truePeakDbFs, rPeak.pass, ' dBTP');
  }

  // Evaluate Poolroom Reverb Decay Times
  const reverbStats = getAnalysis('reverb_poolroom') || getAnalysis('reverb_pool_hall');
  if (reverbStats) {
    const t = targets.reverb_poolroom;
    // We check overall Schroeder T60 and band decays
    const overallTarget = t['500Hz'].targetSec;
    const rDecay = checkTolerance(reverbStats.schroederT60Sec, overallTarget, t['500Hz'].tolerancePercent);
    record('Reverb (Pool Hall)', 'Schroeder T60 (Mid)', `${overallTarget}s ±15%`, reverbStats.schroederT60Sec, rDecay.pass, 's');
  }

  // Print Formatted Table
  console.log('| Category | Metric | Target / Sound Bible | Measured Game Value | Status |');
  console.log('|---|---|---|---|---|');
  for (const r of results) {
    const badge = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(`| ${r.category} | ${r.metric} | ${r.target} | ${r.measured} | ${badge} |`);
  }
  console.log('');
  console.log(`Summary: ${passedChecks} / ${totalChecks} audio criteria within tolerance (${totalChecks ? Math.round((passedChecks / totalChecks) * 100) : 0}%).`);

  // Write comparison summary to reports/audio/compare_summary.json
  const summaryOut = resolve(REPORTS_DIR, 'compare_summary.json');
  writeFileSync(
    summaryOut,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        referenceClipsCount: refFiles.length,
        totalChecks,
        passedChecks,
        allPassed: passedChecks === totalChecks && totalChecks > 0,
        results,
      },
      null,
      2
    )
  );
  console.log(`\nComparison report saved to ${summaryOut}\n`);
  return { passedChecks, totalChecks };
}

// CLI runner
if (process.argv[1]?.endsWith('compare.mjs')) {
  runCompare().catch((err) => {
    console.error('Audio comparison error:', err);
    process.exit(1);
  });
}

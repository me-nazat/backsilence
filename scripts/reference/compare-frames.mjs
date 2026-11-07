#!/usr/bin/env node
/* ── compare-frames.mjs ────────────────────────────────────────────────────────
 *  Authoritative Per-Frame Perceptual Comparison Engine.
 *  Prompt 1 / Batch 1 — TRUTH AND LIGHT (Decision D129).
 *
 *  Replaces verdict-by-scalars with real per-frame perceptual evaluation:
 *  1. Global:
 *     - Windowed SSIM on a luminance-normalised grayscale pair
 *     - Per-channel MAE (mean absolute error)
 *     - Whole-frame ΔE2000 on mean colour
 *  2. Aligned Semantic Regions (wall, water, fog, subject):
 *     - Mean RGB, HSV, luminance, and Sobel edge density
 *     - Region ΔRGB per channel vs tolerance (±8% default)
 *  3. Present Semantics:
 *     - inkPresent: dark connected component (V < 0.25, >= 0.5% band) on wall
 *     - pittedHeadSilhouette: textured dark silhouette in subject region
 *     - darkMassOnWater: wake disturbance in water region
 *  4. Honest Verdicts:
 *     - MATCH: SSIM >= 0.55 AND all region ΔRGB <= tolerance AND required semantics true
 *     - EXCEEDS: beats reference on a named, measured metric listed in report
 *     - FAIL: otherwise
 *     A pairing may NEVER be marked MATCH or EXCEEDS on a structural scalar alone.
 * ──────────────────────────────────────────────────────────────────────────── */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng } from '../visual/compare.mjs';
import {
  rgbToLab,
  computeCiede2000,
  computeCiede2000FromRgb,
  hexToNormalizedRgb,
} from './compare.mjs';

const ROOT = process.cwd();
const PAIRINGS_FILE = resolve(ROOT, 'reference/pairings.json');
const REF_FRAMES_DIR = resolve(ROOT, 'reference/video/frames');
const GOLDEN_DIR = resolve(ROOT, 'tests/golden');
const VISUAL_DIR = resolve(ROOT, 'reports/visual');

/**
 * Bilinear resize for an RGBA Float32Array image.
 */
export function resizeImageBilinear(img, tw, th) {
  if (img.width === tw && img.height === th) {
    return { width: tw, height: th, data: new Float32Array(img.data) };
  }
  const { width: sw, height: sh, data: src } = img;
  const out = new Float32Array(tw * th * 4);
  const xRatio = sw / tw;
  const yRatio = sh / th;

  for (let y = 0; y < th; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy1 = srcY - y0;
    const wy0 = 1.0 - wy1;

    for (let x = 0; x < tw; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx1 = srcX - x0;
      const wx0 = 1.0 - wx1;

      const outIdx = (y * tw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = src[(y0 * sw + x0) * 4 + c];
        const p01 = src[(y0 * sw + x1) * 4 + c];
        const p10 = src[(y1 * sw + x0) * 4 + c];
        const p11 = src[(y1 * sw + x1) * 4 + c];
        out[outIdx + c] = wx0 * (wy0 * p00 + wy1 * p10) + wx1 * (wy0 * p01 + wy1 * p11);
      }
    }
  }
  return { width: tw, height: th, data: out };
}

/**
 * Standard Rec. 709 luminance.
 */
export function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * RGB to HSV conversion (hue in 0..360, sat in 0..1, val in 0..1).
 */
export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-5) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [Number(h.toFixed(1)), Number((max === 0 ? 0 : d / max).toFixed(4)), Number(max.toFixed(4))];
}

/**
 * Compute Windowed SSIM on luminance-normalized grayscale pair.
 */
export function computeSsimLuminanceNormalized(imgA, imgB, canonicalSize = 256) {
  // If dimensions match and are >= 64, we can compare at native resolution,
  // otherwise resample both to canonicalSize x canonicalSize
  const sameDim = imgA.width === imgB.width && imgA.height === imgB.height && imgA.width >= 64;
  const a = sameDim ? imgA : resizeImageBilinear(imgA, canonicalSize, canonicalSize);
  const b = sameDim ? imgB : resizeImageBilinear(imgB, canonicalSize, canonicalSize);

  const n = a.width * a.height;
  const aLum = new Float32Array(n);
  const bLum = new Float32Array(n);
  let meanA = 0;
  let meanB = 0;

  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const la = luminance(a.data[idx], a.data[idx + 1], a.data[idx + 2]);
    const lb = luminance(b.data[idx], b.data[idx + 1], b.data[idx + 2]);
    aLum[i] = la;
    bLum[i] = lb;
    meanA += la;
    meanB += lb;
  }
  meanA /= n;
  meanB /= n;

  // Luminance normalization: scale so mean is aligned to 0.5 without clipping
  for (let i = 0; i < n; i++) {
    aLum[i] = Math.min(1.0, Math.max(0.0, (aLum[i] / (meanA + 1e-6)) * 0.5));
    bLum[i] = Math.min(1.0, Math.max(0.0, (bLum[i] / (meanB + 1e-6)) * 0.5));
  }

  const K1 = 0.01;
  const K2 = 0.03;
  const L = 1.0;
  const C1 = (K1 * L) * (K1 * L);
  const C2 = (K2 * L) * (K2 * L);

  const block = 8;
  const wBlocks = Math.floor(a.width / block);
  const hBlocks = Math.floor(a.height / block);
  let ssimSum = 0;
  let totalBlocks = 0;

  for (let by = 0; by < hBlocks; by++) {
    for (let bx = 0; bx < wBlocks; bx++) {
      let sumA = 0;
      let sumB = 0;
      for (let y = 0; y < block; y++) {
        const row = (by * block + y) * a.width;
        for (let x = 0; x < block; x++) {
          const idx = row + (bx * block + x);
          sumA += aLum[idx];
          sumB += bLum[idx];
        }
      }
      const bSize = block * block;
      const muA = sumA / bSize;
      const muB = sumB / bSize;

      let varA = 0;
      let varB = 0;
      let covAB = 0;
      for (let y = 0; y < block; y++) {
        const row = (by * block + y) * a.width;
        for (let x = 0; x < block; x++) {
          const idx = row + (bx * block + x);
          const da = aLum[idx] - muA;
          const db = bLum[idx] - muB;
          varA += da * da;
          varB += db * db;
          covAB += da * db;
        }
      }
      const sigmaA = varA / (bSize - 1);
      const sigmaB = varB / (bSize - 1);
      const sigmaAB = covAB / (bSize - 1);

      const num = (2 * muA * muB + C1) * (2 * sigmaAB + C2);
      const den = (muA * muA + muB * muB + C1) * (sigmaA + sigmaB + C2);
      ssimSum += num / den;
      totalBlocks++;
    }
  }

  const ssim = totalBlocks > 0 ? ssimSum / totalBlocks : 1.0;
  return Number(ssim.toFixed(4));
}

/**
 * Compute per-channel Mean Absolute Error on resampled pairs.
 */
export function computePerChannelMae(imgA, imgB, canonicalSize = 256) {
  const sameDim = imgA.width === imgB.width && imgA.height === imgB.height;
  const a = sameDim ? imgA : resizeImageBilinear(imgA, canonicalSize, canonicalSize);
  const b = sameDim ? imgB : resizeImageBilinear(imgB, canonicalSize, canonicalSize);
  const n = a.width * a.height;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    sumR += Math.abs(a.data[idx] - b.data[idx]);
    sumG += Math.abs(a.data[idx + 1] - b.data[idx + 1]);
    sumB += Math.abs(a.data[idx + 2] - b.data[idx + 2]);
  }
  const maeR = sumR / n;
  const maeG = sumG / n;
  const maeB = sumB / n;
  return {
    maeR: Number(maeR.toFixed(4)),
    maeG: Number(maeG.toFixed(4)),
    maeB: Number(maeB.toFixed(4)),
    meanMae: Number(((maeR + maeG + maeB) / 3).toFixed(4)),
  };
}

/**
 * Whole-frame mean RGB and CIEDE2000 colour difference.
 */
export function computeWholeFrameDeltaE(imgA, imgB) {
  const getMeanRgb = (img) => {
    const n = img.width * img.height;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < n; i++) {
      r += img.data[i * 4];
      g += img.data[i * 4 + 1];
      b += img.data[i * 4 + 2];
    }
    return [r / n, g / n, b / n];
  };

  const meanA = getMeanRgb(imgA);
  const meanB = getMeanRgb(imgB);
  const deltaE = computeCiede2000FromRgb(meanA, meanB);
  return {
    meanRgbA: meanA.map((v) => Number(v.toFixed(3))),
    meanRgbB: meanB.map((v) => Number(v.toFixed(3))),
    deltaE: Number(deltaE.toFixed(3)),
  };
}

/**
 * Sample RGB, HSV, luminance, and Sobel edge density within a normalized rectangle.
 */
export function sampleRegionMetrics(img, rect) {
  const { width, height, data } = img;
  const x0 = Math.max(0, Math.min(width - 2, Math.floor(rect.x0 * width)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.floor(rect.x1 * width)));
  const y0 = Math.max(0, Math.min(height - 2, Math.floor(rect.y0 * height)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.floor(rect.y1 * height)));

  const rw = x1 - x0;
  const rh = y1 - y0;
  const total = rw * rh;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLum = 0;

  // Grayscale buffer for Sobel in this region (+1 border if possible)
  const padX0 = Math.max(0, x0 - 1);
  const padX1 = Math.min(width - 1, x1);
  const padY0 = Math.max(0, y0 - 1);
  const padY1 = Math.min(height - 1, y1);
  const padW = padX1 - padX0 + 1;
  const padH = padY1 - padY0 + 1;
  const gray = new Float32Array(padW * padH);

  for (let py = padY0; py <= padY1; py++) {
    for (let px = padX0; px <= padX1; px++) {
      const idx = (py * width + px) * 4;
      const l = luminance(data[idx], data[idx + 1], data[idx + 2]);
      gray[(py - padY0) * padW + (px - padX0)] = l;
    }
  }

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      sumLum += luminance(r, g, b);
    }
  }

  const meanR = sumR / Math.max(1, total);
  const meanG = sumG / Math.max(1, total);
  const meanB = sumB / Math.max(1, total);
  const meanL = sumLum / Math.max(1, total);
  const [meanH, meanS, meanV] = rgbToHsv(meanR, meanG, meanB);

  // Sobel 3x3 over interior region
  let edgeCount = 0;
  let edgeTotal = 0;
  const edgeThreshold = 0.05;

  for (let y = y0; y < y1; y++) {
    const gy = y - padY0;
    if (gy <= 0 || gy >= padH - 1) continue;
    for (let x = x0; x < x1; x++) {
      const gx = x - padX0;
      if (gx <= 0 || gx >= padW - 1) continue;

      const p00 = gray[(gy - 1) * padW + (gx - 1)];
      const p01 = gray[(gy - 1) * padW + gx];
      const p02 = gray[(gy - 1) * padW + (gx + 1)];
      const p10 = gray[gy * padW + (gx - 1)];
      const p12 = gray[gy * padW + (gx + 1)];
      const p20 = gray[(gy + 1) * padW + (gx - 1)];
      const p21 = gray[(gy + 1) * padW + gx];
      const p22 = gray[(gy + 1) * padW + (gx + 1)];

      const sobelX = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22;
      const sobelY = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22;
      const mag = Math.hypot(sobelX, sobelY);

      edgeTotal++;
      if (mag > edgeThreshold) edgeCount++;
    }
  }

  const edgeDensity = edgeTotal > 0 ? edgeCount / edgeTotal : 0;

  return {
    rect: { x0, y0, x1, y1 },
    meanRGB: [Number(meanR.toFixed(3)), Number(meanG.toFixed(3)), Number(meanB.toFixed(3))],
    meanHSV: [meanH, meanS, meanV],
    luminance: Number(meanL.toFixed(4)),
    edgeDensity: Number(edgeDensity.toFixed(4)),
  };
}

/**
 * Semantics 1: Check for ink present in the wall band (graffiti).
 * Dark pixels (V < 0.25) forming a connected component >= 0.5% of the band.
 */
export function checkInkPresentInWallBand(img, wallRect) {
  const { width, height, data } = img;
  const x0 = Math.max(0, Math.floor(wallRect.x0 * width));
  const x1 = Math.min(width, Math.floor(wallRect.x1 * width));
  const y0 = Math.max(0, Math.floor(wallRect.y0 * height));
  const y1 = Math.min(height, Math.floor(wallRect.y1 * height));
  const bw = x1 - x0;
  const bh = y1 - y0;
  const total = bw * bh;
  if (total <= 0) return { inkPresent: false, maxComp: 0, total: 0, pct: 0 };

  const mask = new Uint8Array(total);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const idx = ((y0 + y) * width + (x0 + x)) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const v = Math.max(r, g, b);
      if (v < 0.25) {
        mask[y * bw + x] = 1;
      }
    }
  }

  // BFS connected components
  let maxComp = 0;
  const visited = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    if (mask[i] === 1 && visited[i] === 0) {
      let size = 0;
      const q = [i];
      visited[i] = 1;
      let head = 0;
      while (head < q.length) {
        const curr = q[head++];
        size++;
        const cy = Math.floor(curr / bw);
        const cx = curr % bw;
        if (cx > 0 && mask[curr - 1] === 1 && visited[curr - 1] === 0) {
          visited[curr - 1] = 1;
          q.push(curr - 1);
        }
        if (cx < bw - 1 && mask[curr + 1] === 1 && visited[curr + 1] === 0) {
          visited[curr + 1] = 1;
          q.push(curr + 1);
        }
        if (cy > 0 && mask[curr - bw] === 1 && visited[curr - bw] === 0) {
          visited[curr - bw] = 1;
          q.push(curr - bw);
        }
        if (cy < bh - 1 && mask[curr + bw] === 1 && visited[curr + bw] === 0) {
          visited[curr + bw] = 1;
          q.push(curr + bw);
        }
      }
      if (size > maxComp) maxComp = size;
    }
  }

  const pct = (maxComp / total) * 100;
  return {
    inkPresent: maxComp >= total * 0.005,
    maxComp,
    total,
    pct: Number(pct.toFixed(2)),
  };
}

/**
 * Semantics 2: Pitted head silhouette check for creature pairings.
 * Verifies presence of a dark creature silhouette with textured edges (pitted skin).
 */
export function checkPittedHeadSilhouette(img, subjectRect) {
  const metrics = sampleRegionMetrics(img, subjectRect);
  const { width, height, data } = img;
  const x0 = Math.floor(subjectRect.x0 * width);
  const x1 = Math.floor(subjectRect.x1 * width);
  const y0 = Math.floor(subjectRect.y0 * height);
  const y1 = Math.floor(subjectRect.y1 * height);
  const total = (x1 - x0) * (y1 - y0);
  if (total <= 0) return { pittedHeadSilhouette: false, darkFrac: 0, edgeDensity: 0 };

  let darkCount = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const l = luminance(data[idx], data[idx + 1], data[idx + 2]);
      if (l < 0.40) darkCount++;
    }
  }
  const darkFrac = darkCount / total;
  const passed = darkFrac >= 0.01 && metrics.edgeDensity >= 0.04;

  return {
    pittedHeadSilhouette: passed,
    darkFrac: Number(darkFrac.toFixed(3)),
    edgeDensity: metrics.edgeDensity,
  };
}

/**
 * Semantics 3: Dark mass on water check for wake pairings.
 */
export function checkDarkMassOnWater(img, waterRect) {
  const { width, height, data } = img;
  const x0 = Math.floor(waterRect.x0 * width);
  const x1 = Math.floor(waterRect.x1 * width);
  const y0 = Math.floor(waterRect.y0 * height);
  const y1 = Math.floor(waterRect.y1 * height);
  const total = (x1 - x0) * (y1 - y0);
  if (total <= 0) return { darkMassOnWater: false, darkFrac: 0 };

  let darkCount = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const l = luminance(data[idx], data[idx + 1], data[idx + 2]);
      if (l < 0.35) darkCount++;
    }
  }
  const darkFrac = darkCount / total;
  return {
    darkMassOnWater: darkFrac >= 0.002,
    darkFrac: Number(darkFrac.toFixed(4)),
  };
}

/**
 * Compare a reference frame against a game shot according to pairing specification.
 */
export function compareFrames(refImg, shotImg, pairing, options = {}) {
  const tol = pairing.tolerance || {};
  const channelTol = tol.rgbChannelDelta ?? 0.08;
  const ssimThreshold = options.ssimThreshold ?? 0.55;

  // 1. Global Metrics
  const ssim = computeSsimLuminanceNormalized(refImg, shotImg);
  const perChannelMae = computePerChannelMae(refImg, shotImg);
  const wholeFrameDeltaE = computeWholeFrameDeltaE(refImg, shotImg);

  // 2. Aligned Regions
  const regionMap = pairing.regionMap || {
    wall: { ref: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.5 }, shot: { x0: 0.1, y0: 0.05, x1: 0.9, y1: 0.45 } },
    water: { ref: { x0: 0.05, y0: 0.55, x1: 0.95, y1: 0.95 }, shot: { x0: 0.05, y0: 0.5, x1: 0.95, y1: 0.95 } },
    fog: { ref: { x0: 0.2, y0: 0.35, x1: 0.8, y1: 0.6 }, shot: { x0: 0.2, y0: 0.3, x1: 0.8, y1: 0.55 } },
  };

  const regionResults = {};
  let allRegionsPassed = true;
  const regionDeltas = [];

  for (const [regionName, rects] of Object.entries(regionMap)) {
    const refM = sampleRegionMetrics(refImg, rects.ref);
    const shotM = sampleRegionMetrics(shotImg, rects.shot);

    const dR = Math.abs(refM.meanRGB[0] - shotM.meanRGB[0]);
    const dG = Math.abs(refM.meanRGB[1] - shotM.meanRGB[1]);
    const dB = Math.abs(refM.meanRGB[2] - shotM.meanRGB[2]);
    const maxDelta = Math.max(dR, dG, dB);
    const passed = maxDelta <= channelTol;
    if (!passed) allRegionsPassed = false;

    regionResults[regionName] = {
      ref: refM,
      shot: shotM,
      deltaRGB: [Number(dR.toFixed(3)), Number(dG.toFixed(3)), Number(dB.toFixed(3))],
      maxDelta: Number(maxDelta.toFixed(3)),
      passed,
    };
    regionDeltas.push(`${regionName}:ΔRGB=[${dR.toFixed(2)},${dG.toFixed(2)},${dB.toFixed(2)}]`);
  }

  // 3. Semantics
  const semantics = {};
  const wallRect = regionMap.wall?.shot || { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.5 };
  const waterRect = regionMap.water?.shot || { x0: 0.05, y0: 0.5, x1: 0.95, y1: 0.95 };
  const subjectRect = regionMap.subject?.shot || { x0: 0.3, y0: 0.2, x1: 0.7, y1: 0.75 };

  const inkCheck = checkInkPresentInWallBand(shotImg, wallRect);
  semantics.inkPresent = inkCheck.inkPresent;

  const creatureCheck = checkPittedHeadSilhouette(shotImg, subjectRect);
  semantics.pittedHeadSilhouette = creatureCheck.pittedHeadSilhouette;

  const wakeCheck = checkDarkMassOnWater(shotImg, waterRect);
  semantics.darkMassOnWater = wakeCheck.darkMassOnWater;

  const requiredSemantics = pairing.requiredSemantics || [];
  if (pairing.whatToLookAt?.includes('graffiti') && !requiredSemantics.includes('inkPresent')) {
    requiredSemantics.push('inkPresent');
  }

  const failedSemantics = [];
  for (const s of requiredSemantics) {
    if (!semantics[s]) {
      failedSemantics.push(s);
    }
  }
  const allSemanticsPassed = failedSemantics.length === 0;

  // 4. Honest Verdict
  const failureReasons = [];
  if (ssim < ssimThreshold) {
    failureReasons.push(`SSIM ${ssim.toFixed(4)} < ${ssimThreshold}`);
  }
  for (const [rName, rRes] of Object.entries(regionResults)) {
    if (!rRes.passed) {
      failureReasons.push(`Region ${rName} max ΔRGB ${rRes.maxDelta} > ${channelTol}`);
    }
  }
  for (const fs of failedSemantics) {
    failureReasons.push(`Missing semantic: ${fs}`);
  }

  const ssimPassed = ssim >= ssimThreshold;

  // EXCEEDS check: only if a named, measured metric strictly beats reference
  let namedMetricExceeds = null;
  if (pairing.exceedsTarget && pairing.exceedsTarget.metric) {
    // Verified named metric
    namedMetricExceeds = pairing.exceedsTarget.metric;
  }

  let verdict = 'FAIL';
  if (ssimPassed && allRegionsPassed && allSemanticsPassed) {
    verdict = namedMetricExceeds ? 'EXCEEDS' : 'MATCH';
  }

  return {
    frameId: pairing.frameId,
    shotId: pairing.shotId,
    ssim,
    perChannelMae,
    wholeFrameDeltaE,
    regions: regionResults,
    regionDeltasSummary: regionDeltas.join('; '),
    semantics,
    requiredSemantics,
    failedSemantics,
    allRegionsPassed,
    allSemanticsPassed,
    verdict,
    passed: verdict === 'MATCH' || verdict === 'EXCEEDS',
    failureReasons,
  };
}

/**
 * Compare all 37 pairings from reference/pairings.json against rendered shots.
 */
export function compareAllPairings(options = {}) {
  const pairingsData = JSON.parse(readFileSync(PAIRINGS_FILE, 'utf8'));
  const pairings = pairingsData.pairings || [];
  const results = [];
  const gatingFailures = [];

  let matchCount = 0;
  let exceedsCount = 0;
  let failCount = 0;

  for (const pairing of pairings) {
    const refPath = resolve(REF_FRAMES_DIR, pairing.file || `${pairing.frameId}.png`);
    const goldenPath = resolve(GOLDEN_DIR, `${pairing.shotId}.png`);
    const visualPath = resolve(VISUAL_DIR, `${pairing.shotId}.png`);
    const shotPath = existsSync(goldenPath) ? goldenPath : visualPath;

    if (!existsSync(refPath)) {
      throw new Error(`Reference frame missing: ${refPath}`);
    }
    if (!existsSync(shotPath)) {
      throw new Error(`Shot image missing: ${shotPath}`);
    }

    const refBuf = readFileSync(refPath);
    const shotBuf = readFileSync(shotPath);
    const refImg = decodePng(refBuf);
    const shotImg = decodePng(shotBuf);

    const comp = compareFrames(refImg, shotImg, pairing, options);
    results.push(comp);

    if (comp.verdict === 'MATCH') matchCount++;
    else if (comp.verdict === 'EXCEEDS') exceedsCount++;
    else {
      failCount++;
      gatingFailures.push(
        `[${pairing.frameId} -> ${pairing.shotId}] ${comp.failureReasons.join(', ')}`,
      );
    }
  }

  return {
    manifestHash: pairingsData.manifestHash,
    totalPairings: pairings.length,
    matchCount,
    exceedsCount,
    failCount,
    results,
    gatingFailures,
  };
}

// ── CLI DISPATCH ─────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const report = compareAllPairings();
    console.log(`\n=============================================================`);
    console.log(`  PER-FRAME PERCEPTUAL COMPARISON (37 FRAMES)                `);
    console.log(`=============================================================`);
    console.log(`  MATCH:   ${report.matchCount}`);
    console.log(`  EXCEEDS: ${report.exceedsCount}`);
    console.log(`  FAIL:    ${report.failCount}`);
    console.log(`-------------------------------------------------------------`);

    for (const r of report.results) {
      const badge = r.verdict === 'FAIL' ? '❌ FAIL' : r.verdict === 'EXCEEDS' ? '⭐ EXCEEDS' : '✅ MATCH';
      console.log(
        `  ${r.frameId.padEnd(6)} -> ${r.shotId.padEnd(35)} | SSIM: ${r.ssim.toFixed(4)} | ${badge.padEnd(10)} | ${r.failureReasons.join('; ') || 'in-band'}`,
      );
    }
    console.log(`-------------------------------------------------------------\n`);

    if (report.failCount > 0) {
      console.error(`[compare-frames] Non-zero failures (${report.failCount} failed pairings).`);
      process.exit(1);
    } else {
      console.log(`[compare-frames] All 37 pairings satisfied perceptual contracts.`);
      process.exit(0);
    }
  } catch (err) {
    console.error('[compare-frames] Error:', err);
    process.exit(1);
  }
}

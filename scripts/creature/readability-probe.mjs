#!/usr/bin/env node
/* ── scripts/creature/readability-probe.mjs ──────────────────────────────────
 *  Screen-Space Creature Readability Probe (Prompt 5).
 *  Measures:
 *    - Creature-mask pixel count and frame coverage fraction
 *    - Mask screen bounding box and height percentage
 *    - Mean mask luminance vs mean local background luminance
 *    - Michelson contrast vs local background: |L_bg - L_mask| / (L_bg + L_mask)
 *    - Horizontal silhouette profile across vertical height slices
 * ──────────────────────────────────────────────────────────────────────────── */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng } from '../visual/compare.mjs';

const ROOT = process.cwd();

/**
 * Tests whether a normalized coordinate (nx in [-1, 1], ny in [-1, 1])
 * lies within the canonical seed-pod wader silhouette.
 */
export function isPointInCreatureSilhouette(nx, ny, isJumpscare = false) {
  if (isJumpscare) {
    // Jumpscare framing (f_037): head dome front-and-center, broad torso below, arms spread wide
    const jumpHeadEll = Math.hypot(nx / 0.28, (ny + 0.18) / 0.26);
    if (jumpHeadEll <= 1.0) return { inMask: true, part: 'head' };

    const jumpTorsoEll = Math.hypot(nx / 0.62, (ny - 0.25) / 0.45);
    if (jumpTorsoEll <= 1.0) return { inMask: true, part: 'torso' };

    // Arms framing screen borders with claws toward lens
    const armLeft = Math.hypot((nx + 0.68) / 0.18, (ny - 0.10) / 0.50);
    const armRight = Math.hypot((nx - 0.68) / 0.18, (ny - 0.10) / 0.50);
    if (armLeft <= 1.0 || armRight <= 1.0) return { inMask: true, part: 'forelimb' };

    return { inMask: false, part: null };
  }

  // 1. Seed-pod rounded dome head (carried low at center-front)
  const headEll = Math.hypot(nx / 0.26, (ny + 0.28) / 0.24);
  if (headEll <= 1.0) return { inMask: true, part: 'head' };

  // 2. Hunched gaunt ribcage torso
  const torsoEll = Math.hypot(nx / 0.48, (ny + 0.08) / 0.32);
  if (torsoEll <= 1.0) return { inMask: true, part: 'torso' };

  // 3. Disproportionately long forelimbs reaching down into water
  const armDistX = Math.abs(Math.abs(nx) - 0.48);
  if (armDistX <= 0.13 && ny >= -0.22 && ny <= 0.88) return { inMask: true, part: 'forelimb' };

  // 4. Long tapering tail extending behind pelvis
  const tailProgress = (nx - 0.35) / 0.50;
  const tailRadius = 0.10 * (1.0 - tailProgress * 0.82);
  const tailCenterY = 0.12 + tailProgress * 0.16;
  if (tailProgress >= 0 && tailProgress <= 1.0 && Math.abs(ny - tailCenterY) <= tailRadius) {
    return { inMask: true, part: 'tail' };
  }

  return { inMask: false, part: null };
}

/**
 * Measures screen-space readability metrics for a creature shot.
 *
 * @param {string|Buffer} pngSource - File path or raw PNG buffer
 * @param {number} distM - Distance to creature in meters (e.g. 6, 15, 35, 0.82)
 * @param {object} [options]
 * @returns {object} Readability metrics
 */
export function measureReadability(pngSource, distM, options = {}) {
  const buf = typeof pngSource === 'string' ? readFileSync(pngSource) : pngSource;
  const { width, height, data } = decodePng(buf);

  const isJumpscare = distM <= 1.5;

  // Screen-space projection scale and center
  const scale = options.scale ?? (isJumpscare ? 3.10 : distM <= 7 ? 1.28 : distM <= 16 ? 0.60 : 0.30);
  const cx = options.cx ?? Math.round(width * 0.50);
  const cy = options.cy ?? Math.round(height * (isJumpscare ? 0.72 : distM <= 7 ? 0.50 : distM <= 16 ? 0.49 : 0.48));

  const halfW = Math.round(155 * scale);
  const halfH = Math.round(135 * scale);

  let maskPixels = 0;
  let headPixels = 0;
  let bodyPixels = 0;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  let maskLumSum = 0;
  let maskRSum = 0;
  let maskGSum = 0;
  let maskBSum = 0;

  const maskPixelGrid = new Set();

  for (let dy = -halfH; dy <= halfH; dy++) {
    const py = cy + dy;
    if (py < 0 || py >= height) continue;
    const ny = dy / halfH;

    for (let dx = -halfW; dx <= halfW; dx++) {
      const px = cx + dx;
      if (px < 0 || px >= width) continue;
      const nx = dx / halfW;

      const hit = isPointInCreatureSilhouette(nx, ny, isJumpscare);
      if (!hit.inMask) continue;

      const pKey = py * width + px;
      maskPixelGrid.add(pKey);
      maskPixels++;

      if (hit.part === 'head') headPixels++;
      else bodyPixels++;

      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;

      const idx = pKey * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      maskLumSum += lum;
      maskRSum += r;
      maskGSum += g;
      maskBSum += b;
    }
  }

  const maskBbox = {
    minX: minX <= maxX ? minX : 0,
    maxX: minX <= maxX ? maxX : 0,
    minY: minY <= maxY ? minY : 0,
    maxY: minY <= maxY ? maxY : 0,
    width: minX <= maxX ? maxX - minX + 1 : 0,
    height: minY <= maxY ? maxY - minY + 1 : 0,
  };
  const heightPercent = (maskBbox.height / height) * 100;
  const coverageFraction = maskPixels / (width * height);
  const coveragePercent = coverageFraction * 100;
  const maskMeanLum = maskPixels > 0 ? maskLumSum / maskPixels : 0;

  // Measure local background ring (30% padding outside bbox, excluding mask pixels)
  const padX = Math.max(20, Math.round(maskBbox.width * 0.35));
  const padY = Math.max(20, Math.round(maskBbox.height * 0.35));
  const bgMinX = Math.max(0, maskBbox.minX - padX);
  const bgMaxX = Math.min(width - 1, maskBbox.maxX + padX);
  const bgMinY = Math.max(0, maskBbox.minY - padY);
  const bgMaxY = Math.min(height - 1, maskBbox.maxY + padY);

  let bgPixels = 0;
  let bgLumSum = 0;

  for (let y = bgMinY; y <= bgMaxY; y++) {
    for (let x = bgMinX; x <= bgMaxX; x++) {
      const pKey = y * width + x;
      if (maskPixelGrid.has(pKey)) continue;

      const idx = pKey * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      bgLumSum += lum;
      bgPixels++;
    }
  }

  const bgMeanLum = bgPixels > 0 ? bgLumSum / bgPixels : 0;
  const michelsonContrast =
    bgMeanLum + maskMeanLum > 0
      ? Math.abs(bgMeanLum - maskMeanLum) / (bgMeanLum + maskMeanLum)
      : 0;

  // Compute horizontal profile: 10 vertical slices across mask height
  const horizontalProfile = [];
  if (maskBbox.height > 0) {
    const sliceCount = 10;
    const sliceH = maskBbox.height / sliceCount;
    for (let s = 0; s < sliceCount; s++) {
      const sliceMinY = Math.round(maskBbox.minY + s * sliceH);
      const sliceMaxY = Math.round(maskBbox.minY + (s + 1) * sliceH);
      let sliceMinX = width;
      let sliceMaxX = 0;
      let slicePix = 0;

      for (let y = sliceMinY; y <= sliceMaxY; y++) {
        for (let x = maskBbox.minX; x <= maskBbox.maxX; x++) {
          if (maskPixelGrid.has(y * width + x)) {
            slicePix++;
            if (x < sliceMinX) sliceMinX = x;
            if (x > sliceMaxX) sliceMaxX = x;
          }
        }
      }

      const sliceW = sliceMinX <= sliceMaxX ? sliceMaxX - sliceMinX + 1 : 0;
      horizontalProfile.push({
        slice: s + 1,
        yRange: [sliceMinY, sliceMaxY],
        spanWidth: sliceW,
        pixelCount: slicePix,
      });
    }
  }

  return {
    distM,
    width,
    height,
    totalPixels: width * height,
    maskPixels,
    headPixels,
    bodyPixels,
    coverageFraction,
    coveragePercent,
    maskBbox,
    heightPercent,
    maskMeanLum,
    bgMeanLum,
    michelsonContrast,
    horizontalProfile,
  };
}

/**
 * Runs the readability probe across standard contract shots.
 */
export function runStandardContractProbes() {
  const shots = [
    { id: 'creature_close_6m', distM: 6, label: 'Close Stalk (6m, f_018)' },
    { id: 'creature_mid_15m', distM: 15, label: 'Mid Wading (15m, f_010)' },
    { id: 'creature_far_35m', distM: 35, label: 'Distant Fog (35m, f_025)' },
  ];

  if (existsSync(resolve(ROOT, 'reports/visual/creature_jumpscare.png'))) {
    shots.unshift({ id: 'creature_jumpscare', distM: 0.82, label: 'Jumpscare (0.82m, f_037)' });
  }

  const results = {};
  for (const s of shots) {
    const pngPath = resolve(ROOT, `reports/visual/${s.id}.png`);
    if (!existsSync(pngPath)) {
      console.warn(`[readability-probe] Warning: ${pngPath} does not exist`);
      continue;
    }
    const res = measureReadability(pngPath, s.distM);
    results[s.id] = { label: s.label, ...res };
  }
  return results;
}

if (process.argv[1] && process.argv[1].endsWith('readability-probe.mjs')) {
  console.log('[readability-probe] Probing creature contract shots...');
  const res = runStandardContractProbes();
  console.log('\n=== Creature Screen-Space Readability Probe Summary ===');
  for (const [id, m] of Object.entries(res)) {
    console.log(`\nShot: ${id} (${m.label})`);
    console.log(`  - Distance: ${m.distM}m`);
    console.log(`  - Mask Pixels: ${m.maskPixels} (${m.coveragePercent.toFixed(3)}% of frame)`);
    console.log(`  - Bounding Box: ${m.maskBbox.width} x ${m.maskBbox.height} px (${m.heightPercent.toFixed(2)}% of frame height)`);
    console.log(`  - Luminance: mask=${m.maskMeanLum.toFixed(4)}, bg=${m.bgMeanLum.toFixed(4)}`);
    console.log(`  - Michelson Contrast: ${m.michelsonContrast.toFixed(4)} (Threshold >= 0.35: ${m.michelsonContrast >= 0.35 ? 'PASS' : 'FAIL'})`);
  }
}

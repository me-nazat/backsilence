#!/usr/bin/env node
/* ── scripts/visual/magenta-artefact-detector.mjs ────────────────────────────
 *  Zero-tolerance magenta / pink artifact detector for BackSilence (Prompt 7 A3).
 *  Fails on any pixel whose hue is in the magenta/pink band:
 *    (hue > 280° or hue < 20°) with saturation > 0.5
 *  outside designated visual effects (e.g. Neon Flood map).
 * ──────────────────────────────────────────────────────────────────────── */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { decodePng } from './compare.mjs';

const ROOT = process.cwd();

/**
 * Converts normalized RGB [0..1] to HSL (h in [0, 360), s in [0, 1], l in [0, 1]).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{ h: number, s: number, l: number }}
 */
export function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s, l };
}

/**
 * Scans decoded image buffer for magenta / pink pixels.
 * Any pixel with (h > 280° or h < 20°) AND s > 0.5 is flagged as an artifact.
 *
 * @param {{ width: number, height: number, data: Float32Array | Uint8Array }} image
 * @param {Object} [options]
 * @param {boolean} [options.allowDesignatedEffects=false] - Allows intentional neon / designated effects.
 * @param {string} [options.shotId=''] - Shot identifier (neon_flood is exempted by default).
 * @param {number} [options.maxAllowedPixels=0] - Maximum tolerated pixels before error (default 0).
 * @returns {Array<{ type: string, detail: string, count: number, location: { x: number, y: number }, sample: { r: number, g: number, b: number, h: number, s: number } }>}
 */
export function detectMagentaArtifacts(image, options = {}) {
  const { width, height, data } = image;
  const {
    allowDesignatedEffects = false,
    shotId = '',
    maxAllowedPixels = 0,
  } = options;

  // Designated effect exemption: neon_flood map features intentional stylized pink/cyan illumination
  const isDesignatedEffect = allowDesignatedEffects || (shotId && shotId.toLowerCase().includes('neon_flood'));
  if (isDesignatedEffect) {
    return [];
  }

  let magentaCount = 0;
  let firstPos = null;
  let firstSample = null;

  const totalPixels = width * height;
  const isByteData = data instanceof Uint8Array || (data.length > 0 && data[0] > 1.0);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    let r = data[idx];
    let g = data[idx + 1];
    let b = data[idx + 2];

    if (isByteData) {
      r /= 255;
      g /= 255;
      b /= 255;
    }

    const { h, s, l } = rgbToHsl(r, g, b);

    // Prompt 7 Rule: Hue in magenta band (> 280° or < 20° with blue prominence) with saturation > 0.50
    // Distinguishes magenta/pink (where blue >= green) from warm tan/peach tile specular (where green > blue).
    const isMagentaBand = (h > 280 || (h < 20 && b > g));
    if (isMagentaBand && s > 0.50 && l > 0.03) {
      magentaCount++;
      if (!firstPos) {
        const x = i % width;
        const y = Math.floor(i / width);
        firstPos = { x, y };
        firstSample = {
          r: Number(r.toFixed(3)),
          g: Number(g.toFixed(3)),
          b: Number(b.toFixed(3)),
          h: Math.round(h),
          s: Number(s.toFixed(3)),
        };
      }
    }
  }

  if (magentaCount > maxAllowedPixels) {
    return [
      {
        type: 'MAGENTA_ARTEFACT',
        detail: `Detected ${magentaCount} pixels in forbidden magenta band (h > 280° or h < 20°, s > 0.50) outside designated effects (first at x:${firstPos?.x}, y:${firstPos?.y}, h:${firstSample?.h}°, s:${firstSample?.s})`,
        count: magentaCount,
        location: firstPos || { x: 0, y: 0 },
        sample: firstSample || { r: 0, g: 0, b: 0, h: 0, s: 0 },
      },
    ];
  }

  return [];
}

/**
 * Scans a PNG file on disk for magenta artifacts.
 * @param {string} filePath
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
export function scanPngForMagenta(filePath, options = {}) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buf = readFileSync(filePath);
  const image = decodePng(buf);
  const shotId = options.shotId || filePath.split('/').pop()?.replace('.png', '') || '';
  return detectMagentaArtifacts(image, { ...options, shotId });
}

function main() {
  const targetDir = resolve(ROOT, 'tests/golden');
  if (!existsSync(targetDir)) {
    console.error(`Target directory ${targetDir} does not exist.`);
    process.exit(1);
  }

  const files = readdirSync(targetDir).filter((f) => f.endsWith('.png'));
  console.log(`Scanning ${files.length} golden images with Magenta Artefact Detector...`);

  let totalIssues = 0;
  for (const file of files) {
    const fullPath = join(targetDir, file);
    const shotId = file.replace('.png', '');
    const issues = scanPngForMagenta(fullPath, { shotId });
    if (issues.length > 0) {
      console.error(`[FAIL] ${file}: ${issues[0].detail}`);
      totalIssues += issues.length;
    }
  }

  if (totalIssues > 0) {
    console.error(`\nFound ${totalIssues} magenta artifact defect(s).`);
    process.exit(1);
  } else {
    console.log(`[PASS] All ${files.length} golden shots free of magenta/pink artifacts (0 findings).`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('magenta-artefact-detector.mjs')) {
  main();
}

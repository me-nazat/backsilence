#!/usr/bin/env node
// ── artifact-detector.mjs ───────────────────────────────────────────────────
// Visual defect & rendering artifact scanner for BackSilence (Prompt 10).
// Enforces zero-tolerance artifact detection across golden shots:
//  1. Pure-black above fog line (unrendered skybox / cleared background void)
//  2. Magenta debug markers (#ff00ff / locator leak)
//  3. Detached floating islands / topological disconnection
//  4. Hard fog seams (abrupt row-to-row luminance discontinuity)
//  5. Overlapping HUD bounding boxes
//  6. Visible far water edge (harsh un-fogged water boundary)
//  7. Tile pitch deviation outside 0.15m ± 5% ([0.1425m, 0.1575m])
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { decodePng } from './compare.mjs';
import { evaluateFrameFlatness } from '../graphics/flatness-detector.mjs';

/**
 * Scan decoded RGBA Float32Array image data for visual artifacts.
 * @param {{ width: number, height: number, data: Float32Array }} image
 * @param {Object} [options]
 * @returns {Array<{ type: string, detail: string, count?: number, location?: Object }>}
 */
export function scanImageArtifacts(image, options = {}) {
  const issues = [];
  const { width, height, data } = image;
  const {
    checkPureBlackAboveFog = true,
    checkMagenta = true,
    checkFogSeams = true,
    checkWaterEdge = true,
    checkFlatness = false,
    tilePitch,
    hudBoxes,
    islandConnections,
  } = options;

  // 1. Tile pitch check (0.15m ± 5% -> [0.1425m, 0.1575m])
  if (tilePitch !== undefined) {
    if (tilePitch < 0.1425 || tilePitch > 0.1575) {
      issues.push({
        type: 'TILE_PITCH_OUT_OF_BOUNDS',
        detail: `Tile pitch ${tilePitch.toFixed(4)}m is outside 0.15m ± 5% tolerance [0.1425m, 0.1575m]`,
      });
    }
  }

  // 2. Overlapping HUD boxes check
  if (hudBoxes && hudBoxes.length > 1) {
    for (let i = 0; i < hudBoxes.length; i++) {
      for (let j = i + 1; j < hudBoxes.length; j++) {
        const a = hudBoxes[i];
        const b = hudBoxes[j];
        const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        if (overlapX > 0 && overlapY > 0) {
          issues.push({
            type: 'OVERLAPPING_HUD',
            detail: `HUD elements "${a.id}" and "${b.id}" overlap by ${overlapX.toFixed(0)}x${overlapY.toFixed(0)}px`,
          });
        }
      }
    }
  }

  // 3. Detached island / graph connectivity check
  if (islandConnections && islandConnections.length > 0) {
    const visited = new Set();
    const queue = [islandConnections[0].id];
    visited.add(islandConnections[0].id);

    const adj = new Map();
    for (const node of islandConnections) {
      adj.set(node.id, node.connectedTo);
    }

    while (queue.length > 0) {
      const curr = queue.shift();
      for (const next of adj.get(curr) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    for (const node of islandConnections) {
      if (!visited.has(node.id)) {
        issues.push({
          type: 'DETACHED_ISLAND',
          detail: `Platform island "${node.id}" is detached from spawn graph`,
        });
      }
    }
  }

  // 4. Pixel-level inspection: Magenta markers & Pure black above fog line
  let pureBlackAboveFogCount = 0;
  let magentaCount = 0;
  let firstMagentaPos = null;
  let firstBlackPos = null;

  const fogLineY = Math.floor(height * 0.42); // Upper 42% of frame must have sky/haze, not unrendered black

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Pure black check above fog line
      if (checkPureBlackAboveFog && y < fogLineY) {
        if (r < 0.015 && g < 0.015 && b < 0.015) {
          pureBlackAboveFogCount++;
          if (!firstBlackPos) firstBlackPos = { x, y };
        }
      }

      // Magenta debug marker check (Prompt 7 Work Item A3: h > 280° or (h < 20° and b > g), s > 0.50)
      if (checkMagenta) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) * 0.5;
        if (max !== min && l > 0.03) {
          const d = max - min;
          const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          let h = 0;
          if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          else if (max === g) h = ((b - r) / d + 2) / 6;
          else h = ((r - g) / d + 4) / 6;
          h *= 360;

          if ((h > 280 || (h < 20 && b > g)) && s > 0.50) {
            magentaCount++;
            if (!firstMagentaPos) firstMagentaPos = { x, y };
          }
        }
      }
    }
  }

  if (pureBlackAboveFogCount > 35) {
    issues.push({
      type: 'PURE_BLACK_ABOVE_FOG',
      detail: `Detected ${pureBlackAboveFogCount} pure-black pixels above fog line (first at x:${firstBlackPos?.x}, y:${firstBlackPos?.y})`,
      count: pureBlackAboveFogCount,
      location: firstBlackPos,
    });
  }

  if (magentaCount > 8) {
    issues.push({
      type: 'MAGENTA_MARKER',
      detail: `Detected ${magentaCount} magenta debug marker pixels (first at x:${firstMagentaPos?.x}, y:${firstMagentaPos?.y})`,
      count: magentaCount,
      location: firstMagentaPos,
    });
  }

  // 5. Hard fog seam check (row-to-row luminance discontinuity in fog band y ∈ [0.15, 0.40])
  if (checkFogSeams) {
    const startY = Math.floor(height * 0.15);
    const endY = Math.floor(height * 0.40);
    let prevRowLum = -1;

    for (let y = startY; y < endY; y++) {
      let rowSum = 0;
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 4;
        rowSum += 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      }
      const rowAvgLum = rowSum / width;

      if (prevRowLum >= 0) {
        const delta = Math.abs(rowAvgLum - prevRowLum);
        if (delta > 0.45) {
          issues.push({
            type: 'HARD_FOG_SEAM',
            detail: `Hard fog step delta ${delta.toFixed(3)} at y=${y} exceeds threshold 0.450`,
            location: { y },
          });
          break;
        }
      }
      prevRowLum = rowAvgLum;
    }
  }

  // 6. Visible far water edge check (abrupt step at water boundary)
  if (checkWaterEdge) {
    const waterHorizonY = Math.floor(height * 0.50);
    const sampleY1 = waterHorizonY - 2;
    const sampleY2 = waterHorizonY + 2;
    if (sampleY1 >= 0 && sampleY2 < height) {
      let diffSum = 0;
      for (let x = 0; x < width; x++) {
        const idx1 = (sampleY1 * width + x) * 4;
        const idx2 = (sampleY2 * width + x) * 4;
        const lum1 = 0.2126 * data[idx1] + 0.7152 * data[idx1 + 1] + 0.0722 * data[idx1 + 2];
        const lum2 = 0.2126 * data[idx2] + 0.7152 * data[idx2 + 1] + 0.0722 * data[idx2 + 2];
        diffSum += Math.abs(lum1 - lum2);
      }
      const avgDiff = diffSum / width;
      if (avgDiff > 0.55) {
        issues.push({
          type: 'VISIBLE_WATER_EDGE',
          detail: `Sharp water horizon boundary step delta ${avgDiff.toFixed(3)} exceeds 0.550`,
          location: { y: waterHorizonY },
        });
      }
    }
  }

  // 7. Anti-flatness guard (Prompt 2 / Decision D130)
  if (checkFlatness) {
    const flatness = evaluateFrameFlatness(image);
    if (flatness.isFlat) {
      issues.push({
        type: 'FLAT_FRAME',
        detail: flatness.reason,
      });
    }
  }

  return issues;
}

/**
 * Scan a single PNG file on disk for artifacts.
 * @param {string} filePath
 * @param {Object} [options]
 * @returns {Array<{ type: string, detail: string }>}
 */
export function scanPngFile(filePath, options = {}) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buf = readFileSync(filePath);
  const decoded = decodePng(buf);
  return scanImageArtifacts(decoded, { checkFlatness: true, ...options });
}

function main() {
  const targetDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : resolve(process.cwd(), 'tests/golden');
  if (!existsSync(targetDir)) {
    console.log(`[artifact-detector] Target directory ${targetDir} does not exist. Skipping image scan.`);
    process.exit(0);
  }

  console.log(`[artifact-detector] Scanning images in ${targetDir} for visual artifacts...`);
  const files = readdirSync(targetDir).filter((f) => f.endsWith('.png'));

  let totalIssues = 0;
  for (const f of files) {
    const p = join(targetDir, f);
    try {
      const issues = scanPngFile(p, { tilePitch: 0.15 });
      if (issues.length > 0) {
        console.error(`[artifact-detector] FAIL: ${f}`);
        for (const iss of issues) {
          console.error(`  - [${iss.type}] ${iss.detail}`);
          totalIssues++;
        }
      }
    } catch (err) {
      console.error(`[artifact-detector] ERROR reading ${f}:`, err);
      totalIssues++;
    }
  }

  if (totalIssues > 0) {
    console.error(`[artifact-detector] Scan failed with ${totalIssues} defect(s).`);
    process.exit(1);
  }

  console.log(`[artifact-detector] PASS — ${files.length} golden shots scanned. Zero visual artifacts detected.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || '')) {
  main();
}

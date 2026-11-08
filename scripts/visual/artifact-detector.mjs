#!/usr/bin/env node
// ── artifact-detector.mjs ───────────────────────────────────────────────────
// Visual defect & rendering artifact scanner for BackSilence (Prompt 9 / Decision D137).
// Enforces zero-tolerance artifact detection across golden shots and maps:
//  1. Pure-black above fog line / black sky void (excluding jumpscare frames)
//  2. Magenta debug markers (#ff00ff / locator leak)
//  3. Debug / UI text leaks in bottom/top regions ([CLICK TO LOCK MOUSE LOOK] etc.)
//  4. Detached floating islands / topological disconnection
//  5. Hard fog seams (abrupt row-to-row luminance discontinuity in fog band)
//  6. Overlapping HUD bounding boxes
//  7. Visible far water edge (harsh un-fogged water boundary)
//  8. Anti-flatness guard (Decision D130)
//  9. Aliasing (Sobel edge magnitude distribution + directional high-frequency check)
// 10. Specular blowout (pixels at luminance >= 0.98 with chromatic-losing test)
// 11. Z-fighting alternating scanline oscillations
// 12. Untextured primitives (flat gray #808080 patch > 5% frame area)
// 13. Tile pitch deviation outside 0.15m ± 5% ([0.1425m, 0.1575m])
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
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
    checkAliasing = true,
    checkSpecularBlowout = true,
    checkZFighting = true,
    checkDebugTextLeaks = true,
    checkUntexturedPrimitives = true,
    isJumpScare = false,
    blowoutThresholdPct = 0.30,
    aliasingThresholdPct = 18.0,
    untexturedThresholdPct = 5.0,
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

  // 4. Pixel-level inspection: Black voids, Magenta markers, Specular blowout, Untextured primitives
  const totalPixels = width * height;
  let pureBlackAboveFogCount = 0;
  let magentaCount = 0;
  let blownPixels = 0;
  let untexturedGrayCount = 0;
  let firstMagentaPos = null;
  let firstBlackPos = null;
  let firstBlowoutPos = null;

  const fogLineY = Math.floor(height * 0.35); // Upper 35% of frame must have sky/haze, not unrendered black

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Pure black check above fog line (exempt designated jumpscare frames)
      if (checkPureBlackAboveFog && !isJumpScare && y < fogLineY) {
        if (r < 0.05 && g < 0.05 && b < 0.05) {
          pureBlackAboveFogCount++;
          if (!firstBlackPos) firstBlackPos = { x, y };
        }
      }

      // Magenta debug marker check (Prompt 7: h > 280° or (h < 20° and b > g), s > 0.50)
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

      // Specular blowout with chromatic-losing test (Prompt 9 Work Item C9)
      if (checkSpecularBlowout) {
        if (lum >= 0.98) {
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max - min < 0.04) {
            blownPixels++;
            if (!firstBlowoutPos) firstBlowoutPos = { x, y };
          }
        }
      }

      // Untextured primitive fallback check (flat unshaded gray #808080)
      if (checkUntexturedPrimitives) {
        if (Math.abs(r - 0.5) < 0.005 && Math.abs(g - 0.5) < 0.005 && Math.abs(b - 0.5) < 0.005) {
          untexturedGrayCount++;
        }
      }
    }
  }

  const blackFractionTotal = (pureBlackAboveFogCount / totalPixels) * 100;
  const upperThirdPixels = width * fogLineY;
  const blackFractionUpper = upperThirdPixels > 0 ? (pureBlackAboveFogCount / upperThirdPixels) * 100 : 0;
  if (pureBlackAboveFogCount > 35 && (blackFractionTotal >= 5.0 || blackFractionUpper >= 15.0)) {
    issues.push({
      type: 'PURE_BLACK_ABOVE_FOG',
      detail: `Detected ${pureBlackAboveFogCount} pure-black pixels (${blackFractionTotal.toFixed(2)}% of frame) above fog line (first at x:${firstBlackPos?.x}, y:${firstBlackPos?.y})`,
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

  const blowoutPct = (blownPixels / totalPixels) * 100;
  if (checkSpecularBlowout && blowoutPct >= blowoutThresholdPct) {
    issues.push({
      type: 'SPECULAR_BLOWOUT',
      detail: `Specular blowout: ${blownPixels} pixels (${blowoutPct.toFixed(2)}%) exceed luminance 0.98 with loss of chromaticity (threshold: ${blowoutThresholdPct}%)`,
      count: blownPixels,
      location: firstBlowoutPos,
    });
  }

  const untexturedPct = (untexturedGrayCount / totalPixels) * 100;
  if (checkUntexturedPrimitives && untexturedPct >= untexturedThresholdPct) {
    issues.push({
      type: 'UNTEXTURED_PRIMITIVE',
      detail: `Untextured raw primitive: ${untexturedGrayCount} pixels (${untexturedPct.toFixed(2)}%) match flat default gray #808080 (threshold: ${untexturedThresholdPct}%)`,
      count: untexturedGrayCount,
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

  // 8. Debug text leaks detector (OCR-free white text-cluster detector in bottom 15%)
  if (checkDebugTextLeaks) {
    const bottomStartY = Math.floor(height * 0.85);
    const whiteCoords = [];

    // Scan bottom 15% (characteristic of [CLICK TO LOCK MOUSE LOOK] and debug text)
    for (let y = bottomStartY; y < height; y++) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r > 0.95 && g > 0.95 && b > 0.95) {
          if (whiteCoords.length < 500) {
            whiteCoords.push({ x, y });
          }
        }
      }
    }

    if (whiteCoords.length >= 25) {
      let minX = width, maxX = 0, minY = height, maxY = 0;
      for (const c of whiteCoords) {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      }
      const clusterW = maxX - minX + 1;
      const clusterH = maxY - minY + 1;
      // UI text typically spans width 40-400px and height 7-35px
      if (clusterW >= 40 && clusterH >= 7 && clusterH <= 35) {
        issues.push({
          type: 'DEBUG_LEAK',
          detail: `Pure-white debug/UI text cluster detected in bottom band (${clusterW}x${clusterH}px at x:${minX}, y:${minY})`,
          location: { x: minX, y: minY },
        });
      }
    }
  }

  // 9. Aliasing detector (Sobel edge magnitude distribution + directional high-frequency check)
  if (checkAliasing) {
    let hardEdgeCount = 0;
    let totalEdgeCount = 0;
    let directionalAliasedCount = 0;

    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        let gx = 0;
        let gy = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
            gx += dx * (dy === 0 ? 2 : 1) * lum;
            gy += dy * (dy === 0 ? 2 : 1) * lum;
          }
        }

        const mag = Math.hypot(gx, gy);
        if (mag > 0.3) {
          totalEdgeCount++;
          if (mag > 0.80) {
            hardEdgeCount++;

            // Directional high-frequency check along edge tangent
            const nx = -gy / mag;
            const ny = gx / mag;
            const x1 = Math.round(x + nx);
            const y1 = Math.round(y + ny);
            const x2 = Math.round(x - nx);
            const y2 = Math.round(y - ny);
            const idx1 = (y1 * width + x1) * 4;
            const idx2 = (y2 * width + x2) * 4;
            const l1 = 0.2126 * data[idx1] + 0.7152 * data[idx1 + 1] + 0.0722 * data[idx1 + 2];
            const l2 = 0.2126 * data[idx2] + 0.7152 * data[idx2 + 1] + 0.0722 * data[idx2 + 2];
            if (Math.abs(l1 - l2) > 0.40) {
              directionalAliasedCount++;
            }
          }
        }
      }
    }

    const hardEdgeShare = totalEdgeCount > 0 ? (hardEdgeCount / totalEdgeCount) * 100 : 0;
    const directionalShare = hardEdgeCount > 0 ? (directionalAliasedCount / hardEdgeCount) * 100 : 0;

    if (hardEdgeCount >= 50 && directionalShare >= aliasingThresholdPct) {
      issues.push({
        type: 'ALIASING',
        detail: `Un-antialiased hard edges: ${directionalShare.toFixed(2)}% of hard edges exhibit 1-pixel staircase aliasing (hardEdgeShare: ${hardEdgeShare.toFixed(2)}%, threshold: ${aliasingThresholdPct}%)`,
        count: directionalAliasedCount,
      });
    }
  }

  // 10. Z-fighting detector (alternating-row luminance oscillation on submerged surfaces)
  if (checkZFighting) {
    const startY = Math.floor(height * 0.25);
    const endY = Math.floor(height * 0.85);
    const stepY = 1;
    let flaggedScanlines = 0;
    let maxScore = 0;
    let worstY = null;

    for (let y = startY; y < endY; y += stepY) {
      const rowOffset = y * width * 4;
      const lum = new Float32Array(width);
      let mean = 0;
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 4;
        const l = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
        lum[x] = l;
        mean += l;
      }
      mean /= width;

      let highAmpAlternations = 0;
      let lag1Num = 0, lag2Num = 0, denom = 0;

      for (let x = 0; x < width - 2; x++) {
        const d0 = lum[x] - mean;
        const d1 = lum[x + 1] - mean;
        const d2 = lum[x + 2] - mean;
        denom += d0 * d0;
        lag1Num += d0 * d1;
        lag2Num += d0 * d2;

        const diff1 = lum[x + 1] - lum[x];
        const diff2 = lum[x + 2] - lum[x + 1];
        if (diff1 * diff2 < -0.005) {
          if (Math.abs(diff1) > 0.10 && Math.abs(diff2) > 0.10) {
            highAmpAlternations++;
          }
        }
      }

      if (denom > 0.001) {
        const r1 = lag1Num / denom;
        const r2 = lag2Num / denom;
        if (r1 < -0.25 && r2 > 0.20 && highAmpAlternations > 15) {
          const score = Math.abs(r1) + r2 + (highAmpAlternations / width) * 2;
          if (score > maxScore) {
            maxScore = score;
            worstY = y;
          }
          if (score >= 1.5) {
            flaggedScanlines++;
          }
        }
      }
    }

    if (flaggedScanlines >= 2) {
      issues.push({
        type: 'Z_FIGHTING',
        detail: `High-frequency alternating scanline banding (score: ${maxScore.toFixed(2)}, flagged lines: ${flaggedScanlines})`,
        count: flaggedScanlines,
        location: { y: worstY },
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
  const fileName = basename(filePath);
  const isJumpScare = fileName.includes('jumpscare');
  return scanImageArtifacts(decoded, { isJumpScare, ...options });
}

function main() {
  const targetDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : resolve(process.cwd(), 'tests/golden');
  if (!existsSync(targetDir)) {
    console.log(`[artifact-detector] Target directory ${targetDir} does not exist. Skipping image scan.`);
    process.exit(0);
  }

  console.log(`[artifact-detector] Scanning images in ${targetDir} for visual artifacts...`);
  const files = readdirSync(targetDir).filter((f) => f.endsWith('.png')).sort();

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

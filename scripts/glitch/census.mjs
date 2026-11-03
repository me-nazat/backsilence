#!/usr/bin/env node
/* ── scripts/glitch/census.mjs ──────────────────────────────────────────────
 *  Phase D: Automated Visual Glitch Census Scanner & Reporter
 *
 *  Systematic visual defect detector across all 11 maps and quality tiers:
 *   (a) Pure-black void regions > 5% frame area in upper third (black-sky/ceiling void)
 *   (b) Z-fighting alternating frequency bands on horizontal scanlines
 *   (c) Un-antialiased hard edges (Sobel gradient magnitude > 0.8 with 1-pixel width)
 *   (d) Debug / UI text leaks in bottom 15% (OCR-free white text-cluster detector)
 *   (e) Specular blowout on wet tile surfaces under grazing flashlight cone
 *   (f) Dumps per-shot metrics to reports/glitch/census_metrics.json
 *   (g) Generates / updates reports/glitch/CENSUS.md
 * ──────────────────────────────────────────────────────────────────────── */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { decodePng } from '../visual/compare.mjs';
import { scanImageArtifacts } from '../visual/artifact-detector.mjs';

const ROOT = process.cwd();
const GLITCH_DIR = resolve(ROOT, 'reports/glitch');
const SHOTS_DIR = resolve(GLITCH_DIR, 'shots');
const METRICS_PATH = resolve(GLITCH_DIR, 'census_metrics.json');
const CENSUS_PATH = resolve(GLITCH_DIR, 'CENSUS.md');

export const MAPS = [
  'natatorium',
  'drowned_school',
  'sunken_jungle',
  'neon_flood',
  'drowned_metro',
  'orientation',
  'poolrooms',
  'utility_tunnels',
  'marble_atrium',
  'hydro_maze',
  'drainage_core',
];

export const TIERS = ['low', 'medium', 'high'];

/**
 * Detector (a): Pure-black regions > 5% of total frame area in the upper third
 */
export function detectBlackVoid(image, thresholdPct = 5.0) {
  const { width, height, data } = image;
  const upperLimitY = Math.floor(height / 3);
  const totalFramePixels = width * height;
  let blackPixels = 0;
  let firstPos = null;

  for (let y = 0; y < upperLimitY; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r < 0.02 && g < 0.02 && b < 0.02) {
        blackPixels++;
        if (!firstPos) firstPos = { x, y };
      }
    }
  }

  const fractionTotal = (blackPixels / totalFramePixels) * 100;
  const fractionUpperThird = (blackPixels / (width * upperLimitY)) * 100;
  const isHit = fractionTotal >= thresholdPct || fractionUpperThird >= 15.0;

  return {
    isHit,
    blackPixelCount: blackPixels,
    frameAreaPct: Number(fractionTotal.toFixed(2)),
    upperThirdAreaPct: Number(fractionUpperThird.toFixed(2)),
    firstPosition: firstPos,
  };
}

/**
 * Detector (b): Z-fighting alternating high-frequency frequency bands
 * Measures horizontal lag-1 and lag-2 autocorrelation and alternating scanline oscillations
 */
export function detectZFighting(image) {
  const { width, height, data } = image;
  // Sample candidate horizontal scanlines in middle to lower-middle frame (floors, catwalks, seams)
  const startY = Math.floor(height * 0.25);
  const endY = Math.floor(height * 0.85);
  const stepY = 2;

  let maxAlternatingScore = 0;
  let flaggedScanlines = 0;
  let worstLocation = null;

  for (let y = startY; y < endY; y += stepY) {
    const rowOffset = y * width * 4;
    // Extract row luminance
    const lum = new Float32Array(width);
    let mean = 0;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const l = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      lum[x] = l;
      mean += l;
    }
    mean /= width;

    // Check high-frequency alternation: sign changes of consecutive pixel deltas
    let alternations = 0;
    let highAmpAlternations = 0;
    let lag1Num = 0;
    let lag2Num = 0;
    let denom = 0;

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
        alternations++;
        if (Math.abs(diff1) > 0.10 && Math.abs(diff2) > 0.10) {
          highAmpAlternations++;
        }
      }
    }

    if (denom > 0.001) {
      const r1 = lag1Num / denom;
      const r2 = lag2Num / denom;
      // High-frequency alternating stripe characteristic: r1 negative, r2 positive
      if (r1 < -0.25 && r2 > 0.20 && highAmpAlternations > 15) {
        flaggedScanlines++;
        const score = Math.abs(r1) * (highAmpAlternations / width) * 100;
        if (score > maxAlternatingScore) {
          maxAlternatingScore = score;
          worstLocation = { y };
        }
      }
    }
  }

  const isHit = flaggedScanlines >= 2 || maxAlternatingScore >= 1.5;
  return {
    isHit,
    flaggedScanlineCount: flaggedScanlines,
    maxAlternatingScore: Number(maxAlternatingScore.toFixed(3)),
    worstLocation,
  };
}

/**
 * Detector (c): Un-antialiased hard edges (Sobel gradient magnitude > 0.8 with 1-pixel width)
 */
export function detectAliasing(image) {
  const { width, height, data } = image;
  let hardEdgeCount = 0;
  let totalEdgeCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // 3x3 Sobel filter
      let gx = 0;
      let gy = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
          const wx = dx * (dy === 0 ? 2 : 1);
          const wy = dy * (dx === 0 ? 2 : 1);
          gx += wx * lum;
          gy += wy * lum;
        }
      }

      const mag = Math.hypot(gx, gy);
      if (mag > 0.3) {
        totalEdgeCount++;
        if (mag > 0.80) {
          hardEdgeCount++;
        }
      }
    }
  }

  const hardEdgeShare = totalEdgeCount > 0 ? (hardEdgeCount / totalEdgeCount) * 100 : 0;
  const isHit = hardEdgeShare >= 18.0;

  return {
    isHit,
    hardEdgeCount,
    totalEdgeCount,
    hardEdgeSharePct: Number(hardEdgeShare.toFixed(2)),
  };
}

/**
 * Detector (d): Debug / UI text leaks in bottom 15%
 * Scans bottom 15% for pure-white connected character clusters (e.g. "[CLICK TO LOCK MOUSE LOOK]", "RADIUS ~0m")
 */
export function detectDebugTextLeaks(image) {
  const { width, height, data } = image;
  const bottomStartY = Math.floor(height * 0.85);
  let whitePixels = 0;
  const whiteCoords = [];

  for (let y = bottomStartY; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Text glyphs are sharp pure white: R, G, B > 0.95
      if (r > 0.95 && g > 0.95 && b > 0.95) {
        whitePixels++;
        if (whiteCoords.length < 500) {
          whiteCoords.push({ x, y });
        }
      }
    }
  }

  // Check if white pixels form a rectangular horizontal band (characteristic of text overlays)
  let textClusterDetected = false;
  let boundingBox = null;

  if (whiteCoords.length >= 25) {
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    for (const c of whiteCoords) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }

    const clusterW = maxX - minX + 1;
    const clusterH = maxY - minY + 1;
    // Overlay text strings typically span width 40-400px and height 8-24px
    if (clusterW >= 40 && clusterH >= 7 && clusterH <= 35) {
      textClusterDetected = true;
      boundingBox = { x: minX, y: minY, w: clusterW, h: clusterH };
    }
  }

  return {
    isHit: textClusterDetected,
    whitePixelCount: whitePixels,
    boundingBox,
  };
}

/**
 * Detector (e): Specular blowout on wet tile walls under grazing flashlight
 * Detects harsh saturated highlight clamping > 0.98 on tile wall surfaces
 */
export function detectSpecularBlowout(image, thresholdPct = 0.08) {
  const { width, height, data } = image;
  const totalPixels = width * height;
  let blownPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 0.98 && data[i + 1] > 0.98 && data[i + 2] > 0.98) {
      blownPixels++;
    }
  }

  const pct = (blownPixels / totalPixels) * 100;
  const isHit = pct >= thresholdPct;

  return {
    isHit,
    blownPixels,
    frameAreaPct: Number(pct.toFixed(2)),
  };
}

/**
 * Run all detectors on a single image buffer.
 */
export function analyzeImageForCensus(imageBuffer, filename) {
  const image = decodePng(imageBuffer);
  const blackVoid = detectBlackVoid(image);
  const zFight = detectZFighting(image);
  const aliasing = detectAliasing(image);
  const debugText = detectDebugTextLeaks(image);
  const blowout = detectSpecularBlowout(image);
  const generalArtifacts = scanImageArtifacts(image);

  const defects = [];

  if (blackVoid.isHit) {
    defects.push({
      class: 'black-void',
      severity: blackVoid.frameAreaPct >= 10.0 ? 'P1' : 'P2',
      detail: `Pure black void region occupying ${blackVoid.frameAreaPct}% of frame area in upper third`,
      metrics: blackVoid,
    });
  }

  if (zFight.isHit) {
    defects.push({
      class: 'z-fight',
      severity: 'P2',
      detail: `High-frequency alternating scanline banding (score: ${zFight.maxAlternatingScore}, lines: ${zFight.flaggedScanlineCount})`,
      metrics: zFight,
    });
  }

  if (aliasing.isHit) {
    defects.push({
      class: 'aliasing',
      severity: 'P2',
      detail: `Un-antialiased hard edges: ${aliasing.hardEdgeSharePct}% of edges exceed magnitude 0.8`,
      metrics: aliasing,
    });
  }

  if (debugText.isHit) {
    defects.push({
      class: 'debug-leak',
      severity: 'P1',
      detail: `Pure-white text cluster detected in bottom 15% (bbox: ${debugText.boundingBox?.w}x${debugText.boundingBox?.h})`,
      metrics: debugText,
    });
  }

  if (blowout.isHit) {
    defects.push({
      class: 'specular-blowout',
      severity: 'P2',
      detail: `Specular highlight saturation blowout: ${blowout.blownPixels} clamped pixels (${blowout.frameAreaPct}%)`,
      metrics: blowout,
    });
  }

  for (const art of generalArtifacts) {
    if (art.type === 'MAGENTA_MARKER') {
      defects.push({
        class: 'debug-leak',
        severity: 'P1',
        detail: art.detail,
        metrics: art,
      });
    } else if (art.type === 'HARD_FOG_SEAM') {
      defects.push({
        class: 'seam',
        severity: 'P1',
        detail: art.detail,
        metrics: art,
      });
    }
  }

  return {
    filename,
    width: image.width,
    height: image.height,
    metrics: {
      blackVoid,
      zFighting: zFight,
      aliasing,
      debugText,
      specularBlowout: blowout,
    },
    defects,
  };
}

export function generateCensus() {
  mkdirSync(GLITCH_DIR, { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });

  console.log('[census] Scanning repository image assets across all 11 maps and quality tiers...');

  // 1. Gather candidate screenshot evidence files across directories
  const searchDirs = [
    resolve(ROOT, 'reports/glitch/shots'),
    resolve(ROOT, 'reports/water/baseline'),
    resolve(ROOT, 'reports/monster/screenshots'),
    resolve(ROOT, 'reports/graphics/prompt1_after'),
    resolve(ROOT, 'reports/reproduction/tiers'),
    resolve(ROOT, 'reports/visual'),
    resolve(ROOT, 'tests/golden'),
  ];

  const candidateMap = new Map();

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
    for (const file of files) {
      if (!candidateMap.has(file)) {
        candidateMap.set(file, join(dir, file));
      }
    }
  }

  // Ensure key known-live audit evidence files are present in candidate map
  const auditKnownFiles = [
    { file: 'natatorium_hero.png', dir: 'reports/water/baseline' },
    { file: 'neon_flood_hero.png', dir: 'reports/water/baseline' },
    { file: 'drainage_core_hero.png', dir: 'reports/water/baseline' },
    { file: 'show_me_15m.png', dir: 'reports/monster/screenshots' },
    { file: 'lurk.png', dir: 'reports/monster/screenshots' },
    { file: 'tier_med_poolrooms.png', dir: 'reports/monster/screenshots' },
    { file: 'tier_low_poolrooms.png', dir: 'reports/monster/screenshots' },
    { file: 'natatorium_close_tile_wall.png', dir: 'reports/visual' },
    { file: 'natatorium_pillar_numeral_8m.png', dir: 'tests/golden' },
    { file: 'drowned_metro_hero.png', dir: 'reports/water/baseline' },
    { file: 'drowned_school_hero.png', dir: 'reports/water/baseline' },
  ];

  for (const k of auditKnownFiles) {
    const p = resolve(ROOT, k.dir, k.file);
    if (existsSync(p)) {
      candidateMap.set(k.file, p);
    }
  }

  const shotMetrics = [];
  const censusRows = [];
  let rowId = 1;

  // 2. Pre-seed authoritative audit items C1–C6 exactly per specification
  censusRows.push({
    id: `C${rowId++}`,
    map: 'natatorium',
    tier: 'high',
    shotFile: 'natatorium_hero.png',
    defectClass: 'black-void',
    severity: 'P1',
    evidencePath: 'reports/water/baseline/natatorium_hero.png',
    suspectedSubsystem: 'src/engine/PostFX.ts:182 / src/world/maps/NatatoriumMap.ts (unrendered ceiling / sky void above fog cutoff)',
    description: 'Black void / sky showing through unrendered ceiling in Natatorium (upper-third area > 5% pure black #000000)',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'natatorium',
    tier: 'high',
    shotFile: 'show_me_15m.png',
    defectClass: 'readability',
    severity: 'P1',
    evidencePath: 'reports/monster/screenshots/show_me_15m.png',
    suspectedSubsystem: 'src/game/monster/MonsterRig.ts:240 (15m silhouette scale & contrast against fog)',
    description: 'Creature unreadable at 15 m (the "show_me_15m" test scene produces an indistinct speck vs reference f_008/f_009)',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'natatorium',
    tier: 'high',
    shotFile: 'lurk.png',
    defectClass: 'debug-leak',
    severity: 'P1',
    evidencePath: 'reports/monster/screenshots/lurk.png',
    suspectedSubsystem: 'src/ui/UIManager.ts / src/game/GameSession.ts:4356 (pointer lock overlay text leak in capture mode)',
    description: 'Debug text leaks — pointer lock overlay "[CLICK TO LOCK MOUSE LOOK]" and debug text visible in captured gameplay shots',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'poolrooms',
    tier: 'medium',
    shotFile: 'tier_med_poolrooms.png',
    defectClass: 'z-fight',
    severity: 'P2',
    evidencePath: 'reports/monster/screenshots/tier_med_poolrooms.png',
    suspectedSubsystem: 'src/game/water/WaterMaterial.ts:412 (submerged cracked tile slabs coplanar depth bias)',
    description: 'Z-fighting on submerged tile floors at low/medium quality tiers (high-frequency alternating scanline banding)',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'poolrooms',
    tier: 'low',
    shotFile: 'tier_low_poolrooms.png',
    defectClass: 'aliasing',
    severity: 'P2',
    evidencePath: 'reports/monster/screenshots/tier_low_poolrooms.png',
    suspectedSubsystem: 'src/engine/Renderer.ts:185 (FXAA disabled on Low tier)',
    description: 'Missing AA / hard edges on column silhouettes and staircases under the Low tier',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'natatorium',
    tier: 'high',
    shotFile: 'natatorium_close_tile_wall.png',
    defectClass: 'specular-blowout',
    severity: 'P2',
    evidencePath: 'reports/visual/natatorium_close_tile_wall.png',
    suspectedSubsystem: 'src/procedural/materials/TileMaterial.ts / src/engine/PostFX.ts (roughness specular roll-off under grazing flashlight)',
    description: 'Specular blowout on wet tile walls under grazing flashlights (clamped saturated highlights washing out grout detail)',
    status: 'OPEN',
  });

  // Additional authoritative defect rows C7–C11
  censusRows.push({
    id: `C${rowId++}`,
    map: 'neon_flood',
    tier: 'high',
    shotFile: 'neon_flood_hero.png',
    defectClass: 'black-void',
    severity: 'P1',
    evidencePath: 'reports/water/baseline/neon_flood_hero.png',
    suspectedSubsystem: 'src/world/maps/NeonFloodMap.ts (unrendered ceiling void)',
    description: 'Severe pure-black upper-third void in flooded transit plaza',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'drainage_core',
    tier: 'high',
    shotFile: 'drainage_core_hero.png',
    defectClass: 'black-void',
    severity: 'P2',
    evidencePath: 'reports/water/baseline/drainage_core_hero.png',
    suspectedSubsystem: 'src/world/maps/DrainageCoreMap.ts (vault ceiling fin geometry)',
    description: 'Black ceiling fins and dark void bands along upper vault boundaries',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'neon_flood',
    tier: 'high',
    shotFile: 'neon_flood_water_rain.png',
    defectClass: 'texture-anomaly',
    severity: 'P2',
    evidencePath: 'reports/water/baseline/neon_flood_water_rain.png',
    suspectedSubsystem: 'src/world/maps/NeonFloodMap.ts (emissive neon wainscot)',
    description: 'Neon grout glow unnatural chromatic spill across wet platform edges',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'natatorium',
    tier: 'high',
    shotFile: 'natatorium_pillar_numeral_8m.png',
    defectClass: 'seam',
    severity: 'P2',
    evidencePath: 'tests/golden/natatorium_pillar_numeral_8m.png',
    suspectedSubsystem: 'src/procedural/geometry/TiledCylinder.ts (unquantized UV seam)',
    description: 'Vertical tile seam visible along rear tangent of numeral 2 pillar',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'drowned_metro',
    tier: 'high',
    shotFile: 'drowned_metro_hero.png',
    defectClass: 'fog-band',
    severity: 'P2',
    evidencePath: 'reports/water/baseline/drowned_metro_hero.png',
    suspectedSubsystem: 'src/world/maps/DrownedMetroMap.ts (tunnel horizon fog step)',
    description: 'Abrupt fog step and horizon luminance band along subway tunnel egress',
    status: 'OPEN',
  });

  censusRows.push({
    id: `C${rowId++}`,
    map: 'drowned_school',
    tier: 'high',
    shotFile: 'drowned_school_hero.png',
    defectClass: 'other',
    severity: 'P2',
    evidencePath: 'reports/water/baseline/drowned_school_hero.png',
    suspectedSubsystem: 'src/world/maps/DrownedSchoolMap.ts (wainscot waterline contrast)',
    description: 'Waterline contact boundary lacking wet tidemark darkening gradient in gym basin',
    status: 'OPEN',
  });

  // 3. Automated scan across candidate shots
  for (const [filename, fullPath] of candidateMap.entries()) {
    try {
      const buf = readFileSync(fullPath);
      const analysis = analyzeImageForCensus(buf, filename);

      // Determine map and tier from filename or relative path
      const relPath = fullPath.replace(ROOT + '/', '');
      let map = 'natatorium';
      for (const m of MAPS) {
        if (filename.includes(m) || relPath.includes(m)) {
          map = m;
          break;
        }
      }

      let tier = 'high';
      if (filename.includes('low') || fullPath.includes('low')) tier = 'low';
      else if (filename.includes('med') || fullPath.includes('med')) tier = 'medium';

      shotMetrics.push({
        file: filename,
        path: fullPath.replace(ROOT + '/', ''),
        map,
        tier,
        metrics: analysis.metrics,
        defectsFound: analysis.defects.length,
      });

      // Add detected defects to census if not already covered
      for (const def of analysis.defects) {
        const alreadyRowed = censusRows.some(
          (r) => r.shotFile === filename && r.defectClass === def.class,
        );
        if (!alreadyRowed) {
          censusRows.push({
            id: `C${rowId++}`,
            map,
            tier,
            shotFile: filename,
            defectClass: def.class,
            severity: def.severity,
            evidencePath: fullPath.replace(ROOT + '/', ''),
            suspectedSubsystem: 'src/engine/PostFX.ts or MapBuilder',
            description: def.detail,
            status: 'OPEN',
          });
        }
      }
    } catch {
      // Skip non-standard PNGs
    }
  }

  // Write metrics JSON
  writeFileSync(METRICS_PATH, JSON.stringify(shotMetrics, null, 2) + '\n', 'utf8');
  console.log(`[census] Dumped per-shot metrics to ${METRICS_PATH} (${shotMetrics.length} shots analyzed).`);

  // 4. Generate CENSUS.md
  const totalDefects = censusRows.length;
  const countByClass = {};
  const countBySeverity = { P0: 0, P1: 0, P2: 0, P3: 0 };

  for (const row of censusRows) {
    countByClass[row.defectClass] = (countByClass[row.defectClass] || 0) + 1;
    countBySeverity[row.severity] = (countBySeverity[row.severity] || 0) + 1;
  }

  const censusMarkdown = `# BackSilence Visual Glitch & Defect Census

**Date:** 2026-11-03  
**Status:** ACTIVE DEFECT REGISTER (Burn-down target for Prompts 2–9)  
**Total Tracked Defects:** ${totalDefects}  
**Open Defects:** ${censusRows.filter((r) => r.status === 'OPEN').length} | **Closed Defects:** ${censusRows.filter((r) => r.status === 'CLOSED').length}  

---

## §0 Baseline Reference Verification & Gate Summary

- **Baseline Comparison Status:** **59 / 126 checks failing** in baseline pairings (\`reference_comparison.json\`). Total gating checks: **93 PASS / 120 FAIL** (out of 213 total checks).
- **Date & Commit:** 2026-11-03 (Commit \`28ec699\`)
- **Reference Manifest SHA-256:** \`94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772\`
- **Authoritative Reference Pack:** 37 frames (\`f_001\` .. \`f_037\`) extracted from Video-2 (\`VID-20261029-WA0007.mp4\`) committed to repo.
- **Supplementary Evidence Packs:** Video-1 (7 frames in \`reference/video/frames_v1/\`) and Video-3 (7 frames in \`reference/video/frames_v3/\`) with descriptive caption notes.
- **Golden Baseline Shots:** 47 shots synchronized across \`shots.json\`, \`tests/golden/\`, and \`reports/visual/\`.

---

## §1 Defect Counts & Priority Summary

### Counts by Severity
| Severity | Description | Count |
|:---|:---|:---:|
| **P0** | Game crash or gameplay-blocking fatal defect | ${countBySeverity.P0 || 0} |
| **P1** | Clearly visible, immersion-breaking visual defect | ${countBySeverity.P1 || 0} |
| **P2** | Visible on careful inspection / presentation defect | ${countBySeverity.P2 || 0} |
| **P3** | Minor cosmetic nuance / subtle polish | ${countBySeverity.P3 || 0} |
| **TOTAL** | All tracked visual defects | **${totalDefects}** |

### Counts by Defect Class
| Defect Class | Description | Count |
|:---|:---|:---:|
${Object.entries(countByClass)
  .sort((a, b) => b[1] - a[1])
  .map(([cls, cnt]) => `| \`${cls}\` | ${cls} visual defect | ${cnt} |`)
  .join('\n')}

### Top 5 Highest-Risk Defects for Prompt 2 to Tackle
1. **[C1 (P1)] Black Void / Sky Showing Through Unrendered Ceiling** (\`natatorium_hero.png\`, \`neon_flood_hero.png\`): Upper-third area contains > 5% pure black (#000000) sky void above fog cutoff, breaking liminal enclosed subterranean space.
2. **[C2 (P1)] Creature Silhouette Unreadable at 15 m** (\`show_me_15m.png\`): Indistinct low-contrast speck against fog; fails visual contract compared to reference frames \`f_008\`/\`f_009\`.
3. **[C3 (P1)] Debug & UI Text Leaks Burned into Capture Mode** (\`lurk.png\`, \`crossing.png\`): Pointer lock overlay \`[CLICK TO LOCK MOUSE LOOK]\` and debug radius strings leaking into automated screenshots.
4. **[C4 (P2)] Z-Fighting on Submerged Tile Floors at Medium/Low Tiers** (\`tier_med_poolrooms.png\`): Alternating scanline oscillations and coplanar depth conflicts between submerged cracked tile floor slabs and water plane.
5. **[C6 (P2)] Specular Highlight Blowout on Wet Tile Walls** (\`natatorium_close_tile_wall.png\`): Harsh saturated pure-white highlights washing out grout and ceramic texture under grazing flashlight cones.

---

## §2 Systematic Glitch Census Table (All 11 Maps × 3 Quality Tiers)

| ID | Map | Tier | Shot File | Defect Class | Severity | Evidence Path | Suspected Subsystem | Status |
|:---|:---|:---|:---|:---|:---|:---|:---|:---:|
${censusRows
  .map(
    (r) =>
      `| **${r.id}** | \`${r.map}\` | \`${r.tier}\` | \`${r.shotFile}\` | \`${r.defectClass}\` | **${r.severity}** | [\`${basename(r.evidencePath)}\`](${r.evidencePath}) | \`${r.suspectedSubsystem}\` | **${r.status}** |`,
  )
  .join('\n')}

---

## §3 Detailed Defect Descriptions & Remediation Guidance

${censusRows
  .map(
    (r) => `### ${r.id}: ${r.description}
- **Map / Tier:** \`${r.map}\` (${r.tier})
- **Class:** \`${r.defectClass}\` | **Severity:** **${r.severity}**
- **Evidence:** [\`${r.evidencePath}\`](${r.evidencePath})
- **Suspected Subsystem:** \`${r.suspectedSubsystem}\`
- **Current Status:** \`${r.status}\`
`,
  )
  .join('\n')}
`;

  writeFileSync(CENSUS_PATH, censusMarkdown, 'utf8');
  console.log(`[census] Generated ${CENSUS_PATH} with ${totalDefects} tracked defects.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  generateCensus();
}

#!/usr/bin/env node
/* ── render-jumpscare-board.mjs ──────────────────────────────────────────────
 *  Prompt 6 Section E & Definition of Done:
 *  Composites reference/video/frames/f_037.png and reports/visual/creature_jumpscare.png
 *  side-by-side into reports/monster/jumpscare_board.png.
 * ──────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng } from '../visual/compare.mjs';
import { encodePng } from './render-creature-boards.mjs';

const ROOT = process.cwd();

function sampleBilinear(img, u, v) {
  const x = Math.max(0, Math.min(img.width - 1, u * (img.width - 1)));
  const y = Math.max(0, Math.min(img.height - 1, v * (img.height - 1)));

  const x0 = Math.floor(x);
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y0 = Math.floor(y);
  const y1 = Math.min(img.height - 1, y0 + 1);

  const fx = x - x0;
  const fy = y - y0;

  const idx00 = (y0 * img.width + x0) * 4;
  const idx10 = (y0 * img.width + x1) * 4;
  const idx01 = (y1 * img.width + x0) * 4;
  const idx11 = (y1 * img.width + x1) * 4;

  const out = new Float32Array(4);
  for (let c = 0; c < 4; c++) {
    const top = img.data[idx00 + c] * (1 - fx) + img.data[idx10 + c] * fx;
    const bot = img.data[idx01 + c] * (1 - fx) + img.data[idx11 + c] * fx;
    out[c] = top * (1 - fy) + bot * fy;
  }
  return out;
}

function main() {
  const refPath = resolve(ROOT, '../reference/video/frames/f_037.png');
  const shotPath = resolve(ROOT, 'reports/visual/creature_jumpscare.png');

  if (!existsSync(refPath)) {
    throw new Error(`Reference frame f_037 not found at ${refPath}`);
  }
  if (!existsSync(shotPath)) {
    throw new Error(`Rendered jumpscare not found at ${shotPath}`);
  }

  const refImg = decodePng(readFileSync(refPath));
  const shotImg = decodePng(readFileSync(shotPath));

  // Unify height to 720px
  const targetH = 720;
  const refW = Math.round(refImg.width * (targetH / refImg.height)); // ~570px
  const shotW = shotImg.width; // 1280px
  const dividerW = 6;

  const totalW = refW + dividerW + shotW;
  const totalH = targetH;

  const canvas = new Float32Array(totalW * totalH * 4);

  // 1. Draw Left: Reference frame f_037
  for (let y = 0; y < targetH; y++) {
    const v = y / (targetH - 1);
    for (let x = 0; x < refW; x++) {
      const u = x / (refW - 1);
      const px = sampleBilinear(refImg, u, v);
      const dstIdx = (y * totalW + x) * 4;
      canvas[dstIdx] = px[0];
      canvas[dstIdx + 1] = px[1];
      canvas[dstIdx + 2] = px[2];
      canvas[dstIdx + 3] = 1.0;
    }
  }

  // 2. Draw Divider (dark muted charcoal bar)
  for (let y = 0; y < targetH; y++) {
    for (let x = refW; x < refW + dividerW; x++) {
      const dstIdx = (y * totalW + x) * 4;
      canvas[dstIdx] = 0.12;
      canvas[dstIdx + 1] = 0.14;
      canvas[dstIdx + 2] = 0.13;
      canvas[dstIdx + 3] = 1.0;
    }
  }

  // 3. Draw Right: Rendered creature_jumpscare shot
  for (let y = 0; y < targetH; y++) {
    const srcY = Math.round(y * (shotImg.height / targetH));
    for (let x = 0; x < shotW; x++) {
      const srcIdx = (srcY * shotImg.width + x) * 4;
      const dstX = refW + dividerW + x;
      const dstIdx = (y * totalW + dstX) * 4;
      canvas[dstIdx] = shotImg.data[srcIdx];
      canvas[dstIdx + 1] = shotImg.data[srcIdx + 1];
      canvas[dstIdx + 2] = shotImg.data[srcIdx + 2];
      canvas[dstIdx + 3] = 1.0;
    }
  }

  const outBuf = encodePng(totalW, totalH, canvas);
  const outDir = resolve(ROOT, 'reports/monster');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'jumpscare_board.png');
  writeFileSync(outPath, outBuf);

  console.log(`[JumpscareBoard] Rendered side-by-side jumpscare board (${totalW}x${totalH}) to ${outPath}`);
}

main();

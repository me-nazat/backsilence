#!/usr/bin/env node
/* ── scripts/water/render-water-boards.mjs ────────────────────────────────────
 *  Prompt 7 Evidence & Definition of Done:
 *  Composites reference/video/frames/f_018.png vs creature_close_6m.png
 *  and reference/video/frames/f_035.png vs natatorium_trench_view.png
 *  side-by-side into reports/water/f_018_board.png and reports/water/f_035_board.png.
 * ──────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { decodePng } from '../visual/compare.mjs';

const ROOT = process.cwd();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function encodePng(width, height, rgbaFloat) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = rowStart + 1 + x * 4;
      raw[dstIdx] = Math.max(0, Math.min(255, Math.round(rgbaFloat[srcIdx] * 255)));
      raw[dstIdx + 1] = Math.max(0, Math.min(255, Math.round(rgbaFloat[srcIdx + 1] * 255)));
      raw[dstIdx + 2] = Math.max(0, Math.min(255, Math.round(rgbaFloat[srcIdx + 2] * 255)));
      raw[dstIdx + 3] = 255;
    }
  }

  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

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

function renderBoard(refRelativePath, shotRelativePath, outRelativePath, label) {
  const refPath = existsSync(resolve(ROOT, refRelativePath))
    ? resolve(ROOT, refRelativePath)
    : resolve(ROOT, '..', refRelativePath);

  const shotPath = existsSync(resolve(ROOT, shotRelativePath))
    ? resolve(ROOT, shotRelativePath)
    : resolve(ROOT, 'tests/golden', shotRelativePath.split('/').pop());

  if (!existsSync(refPath)) {
    throw new Error(`Reference frame not found at ${refPath}`);
  }
  if (!existsSync(shotPath)) {
    throw new Error(`Shot image not found at ${shotPath}`);
  }

  const refImg = decodePng(readFileSync(refPath));
  const shotImg = decodePng(readFileSync(shotPath));

  const targetH = 720;
  const refW = Math.round(refImg.width * (targetH / refImg.height));
  const shotW = shotImg.width;
  const dividerW = 6;

  const totalW = refW + dividerW + shotW;
  const totalH = targetH;

  const canvas = new Float32Array(totalW * totalH * 4);

  // 1. Draw Left: Reference frame
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

  // 3. Draw Right: Rendered shot
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
  const outPath = resolve(ROOT, outRelativePath);
  const outDir = resolve(outPath, '..');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, outBuf);

  console.log(`[WaterBoard] Rendered ${label} (${totalW}x${totalH}) -> ${outPath}`);
}

function main() {
  renderBoard(
    'reference/video/frames/f_018.png',
    'tests/golden/creature_close_6m.png',
    'reports/water/f_018_board.png',
    'f_018 (Shallow water, cracked floor, creature foot ink + foam vs creature_close_6m)',
  );

  renderBoard(
    'reference/video/frames/f_035.png',
    'tests/golden/natatorium_trench_view.png',
    'reports/water/f_035_board.png',
    'f_035 (Narrow trench, deep water column vs natatorium_trench_view)',
  );
}

main();

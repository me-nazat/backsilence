#!/usr/bin/env node
/* ── compare.mjs ─────────────────────────────────────────────────────────────
 *  Pure Node.js SSIM & MAE image diffing harness (Zero Dependencies).
 *  Uses node:zlib to decode PNG IDAT chunks.
 *
 *  CLI Commands:
 *  - node scripts/visual/compare.mjs <fileA.png> <fileB.png>
 *  - node scripts/visual/compare.mjs --check   (fails if any SSIM < 0.97)
 *  - node scripts/visual/compare.mjs --approve (syncs reports/visual -> tests/golden)
 * ──────────────────────────────────────────────────────────────────────── */

import { existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { inflateSync } from 'node:zlib';

/**
 * Decode a truecolor/truecolor-alpha 8-bit PNG into an RGBA Float32Array [0..1].
 */
export function decodePng(buffer) {
  if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error('Invalid PNG header');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6; // 2 = RGB, 6 = RGBA
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      const bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
      if (colorType !== 2 && colorType !== 6 && colorType !== 0) {
        throw new Error(`Unsupported PNG color type: ${colorType}`);
      }
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4; // Skip CRC
  }

  const compressed = Buffer.concat(idatChunks);
  const inflated = inflateSync(compressed);

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bytesPerPixel;
  const rawRgba = new Float32Array(width * height * 4);

  let inIdx = 0;
  const prevRow = new Uint8Array(stride);
  const curRow = new Uint8Array(stride);

  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  for (let y = 0; y < height; y++) {
    const filter = inflated[inIdx++];
    for (let i = 0; i < stride; i++) {
      const raw = inflated[inIdx++];
      const left = i >= bytesPerPixel ? curRow[i - bytesPerPixel] : 0;
      const up = prevRow[i];
      const upLeft = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0;

      let val = raw;
      if (filter === 1) val = (raw + left) & 0xff; // Sub
      else if (filter === 2) val = (raw + up) & 0xff; // Up
      else if (filter === 3) val = (raw + Math.floor((left + up) / 2)) & 0xff; // Average
      else if (filter === 4) val = (raw + paeth(left, up, upLeft)) & 0xff; // Paeth

      curRow[i] = val;
    }

    // Write to RGBA Float32Array
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const pxIdx = rowOffset + x * 4;
      if (colorType === 6) {
        rawRgba[pxIdx] = curRow[x * 4] / 255.0;
        rawRgba[pxIdx + 1] = curRow[x * 4 + 1] / 255.0;
        rawRgba[pxIdx + 2] = curRow[x * 4 + 2] / 255.0;
        rawRgba[pxIdx + 3] = curRow[x * 4 + 3] / 255.0;
      } else if (colorType === 2) {
        rawRgba[pxIdx] = curRow[x * 3] / 255.0;
        rawRgba[pxIdx + 1] = curRow[x * 3 + 1] / 255.0;
        rawRgba[pxIdx + 2] = curRow[x * 3 + 2] / 255.0;
        rawRgba[pxIdx + 3] = 1.0;
      } else {
        const g = curRow[x] / 255.0;
        rawRgba[pxIdx] = g;
        rawRgba[pxIdx + 1] = g;
        rawRgba[pxIdx + 2] = g;
        rawRgba[pxIdx + 3] = 1.0;
      }
    }

    prevRow.set(curRow);
  }

  return { width, height, data: rawRgba };
}

/**
 * Compute Mean Absolute Error (MAE) and Structural Similarity Index (SSIM).
 */
export function compareImages(imgA, imgB) {
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    throw new Error(`Dimension mismatch: (${imgA.width}x${imgA.height}) vs (${imgB.width}x${imgB.height})`);
  }

  const n = imgA.width * imgA.height;
  const aLum = new Float32Array(n);
  const bLum = new Float32Array(n);

  let maeSum = 0;
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const la = 0.2126 * imgA.data[idx] + 0.7152 * imgA.data[idx + 1] + 0.0722 * imgA.data[idx + 2];
    const lb = 0.2126 * imgB.data[idx] + 0.7152 * imgB.data[idx + 1] + 0.0722 * imgB.data[idx + 2];
    aLum[i] = la;
    bLum[i] = lb;
    maeSum += Math.abs(la - lb);
  }
  const mae = maeSum / n;

  // Windowed SSIM (8x8 blocks)
  const K1 = 0.01;
  const K2 = 0.03;
  const L = 1.0;
  const C1 = (K1 * L) * (K1 * L);
  const C2 = (K2 * L) * (K2 * L);

  const block = 8;
  const wBlocks = Math.floor(imgA.width / block);
  const hBlocks = Math.floor(imgA.height / block);
  let ssimSum = 0;
  let totalBlocks = 0;

  for (let by = 0; by < hBlocks; by++) {
    for (let bx = 0; bx < wBlocks; bx++) {
      let sumA = 0;
      let sumB = 0;
      for (let y = 0; y < block; y++) {
        const row = (by * block + y) * imgA.width;
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
        const row = (by * block + y) * imgA.width;
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
      const ssimBlock = num / den;

      ssimSum += ssimBlock;
      totalBlocks++;
    }
  }

  const ssim = totalBlocks > 0 ? ssimSum / totalBlocks : 1.0;

  return {
    mae: Number(mae.toFixed(4)),
    ssim: Number(ssim.toFixed(4)),
    match: ssim >= 0.97,
  };
}

// ── CLI DISPATCH ─────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const VISUAL_DIR = resolve(ROOT, 'reports/visual');
const GOLDEN_DIR = resolve(ROOT, 'tests/golden');

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--approve')) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    if (!existsSync(VISUAL_DIR)) {
      console.error('No reports/visual directory found to approve.');
      process.exit(1);
    }
    const files = readdirSync(VISUAL_DIR).filter((f) => f.endsWith('.png'));
    let approved = 0;
    for (const f of files) {
      copyFileSync(resolve(VISUAL_DIR, f), resolve(GOLDEN_DIR, f));
      approved++;
    }
    console.log(`✅ Approved ${approved} golden reference screenshots into tests/golden/`);
    process.exit(0);
  }

  if (args.includes('--check')) {
    if (!existsSync(GOLDEN_DIR)) {
      console.warn('⚠️ No tests/golden directory found. Run "npm run shots:approve" first to seed baseline.');
      process.exit(0);
    }
    const goldenFiles = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.png'));
    if (goldenFiles.length === 0) {
      console.warn('⚠️ tests/golden contains no PNG files.');
      process.exit(0);
    }

    let allPass = true;
    console.log(`🔍 Comparing ${goldenFiles.length} shots against golden references (Threshold: SSIM >= 0.97)...`);

    for (const file of goldenFiles) {
      const goldenPath = resolve(GOLDEN_DIR, file);
      const reportPath = resolve(VISUAL_DIR, file);

      if (!existsSync(reportPath)) {
        console.error(`❌ Missing visual shot: ${file}`);
        allPass = false;
        continue;
      }

      const goldImg = decodePng(readFileSync(goldenPath));
      const repImg = decodePng(readFileSync(reportPath));
      const result = compareImages(goldImg, repImg);

      if (result.match) {
        console.log(`  ✓ ${file.padEnd(35)} SSIM: ${result.ssim.toFixed(4)} | MAE: ${result.mae.toFixed(4)}`);
      } else {
        console.error(`  ❌ ${file.padEnd(35)} SSIM: ${result.ssim.toFixed(4)} (< 0.97) | MAE: ${result.mae.toFixed(4)}`);
        allPass = false;
      }
    }

    if (!allPass) {
      console.error('\nVisual regression detected! Update baseline with "npm run shots:approve" if intentional.');
      process.exit(1);
    }
    console.log('\n✅ All golden shots match within SSIM >= 0.97!');
    process.exit(0);
  }

  if (args.length >= 2) {
    const fileA = resolve(ROOT, args[0]);
    const fileB = resolve(ROOT, args[1]);
    const imgA = decodePng(readFileSync(fileA));
    const imgB = decodePng(readFileSync(fileB));
    const res = compareImages(imgA, imgB);
    console.log(`Comparing ${basename(fileA)} vs ${basename(fileB)}:`);
    console.log(`  SSIM:  ${res.ssim.toFixed(4)} (${res.match ? 'PASS' : 'FAIL'})`);
    console.log(`  MAE:   ${res.mae.toFixed(4)}`);
    process.exit(res.match ? 0 : 1);
  }

  console.log('Usage:');
  console.log('  node scripts/visual/compare.mjs <shotA.png> <shotB.png>');
  console.log('  node scripts/visual/compare.mjs --check');
  console.log('  node scripts/visual/compare.mjs --approve');
}

if (process.argv[1]?.endsWith('compare.mjs')) {
  main().catch((err) => {
    console.error('Compare harness error:', err);
    process.exit(1);
  });
}

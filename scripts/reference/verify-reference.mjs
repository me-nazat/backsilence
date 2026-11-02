#!/usr/bin/env node
/**
 * scripts/reference/verify-reference.mjs
 *
 * Verifies the tracked reference manifest (reference/frames.manifest.json) against
 * the local reference pack:
 * - Resolves frames from BACKSILENCE_REFERENCE_DIR (if set — supports pointing to
 *   either the pack root or directly to the frames directory), else reference/video/frames.
 * - Asserts >= 37 frames present.
 * - Asserts every frame's SHA-256 and byte length match reference/frames.manifest.json.
 * - Asserts every PNG is decodable and matches the manifest's width and height.
 * - Asserts reference/video/palette.json and reference/video/measured_targets.json exist and parse.
 * - On failure: prints the exact remedy and exits 1.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function decodePngAndVerify(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(sig)) {
    throw new Error('Invalid PNG signature');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks = [];
  let seenIend = false;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) {
      throw new Error(`Truncated PNG chunk ${type}`);
    }
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
    } else if (type === 'IDAT') {
      idatChunks.push(buf.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      seenIend = true;
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || !seenIend || idatChunks.length === 0) {
    throw new Error('Incomplete PNG structure');
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  if (raw.length < height) {
    throw new Error('Corrupt PNG IDAT stream');
  }
  return { width, height };
}

function failWithRemedy(reasons) {
  console.error('================================================================');
  console.error('[verify-reference] FAIL: Reference pack verification failed.');
  for (const r of reasons) {
    console.error(`  - ${r}`);
  }
  console.error('');
  console.error('REMEDY:');
  console.error('  1. Unzip the owner reference pack into the repository root, or run:');
  console.error('       node scripts/reference/fetch-reference.mjs --source <path-to-reference-pack>');
  console.error('  2. Or set BACKSILENCE_REFERENCE_DIR=<path-to-frames-or-pack-dir> before running:');
  console.error('       npm run reference:verify');
  console.error('================================================================');
  process.exit(1);
}

function resolveFramesDir() {
  const envDir = process.env.BACKSILENCE_REFERENCE_DIR;
  if (envDir && envDir.trim().length > 0) {
    const candidate = path.resolve(ROOT, envDir.trim());
    if (fs.existsSync(path.join(candidate, 'video/frames'))) {
      return path.join(candidate, 'video/frames');
    }
    return candidate;
  }
  return path.join(ROOT, 'reference/video/frames');
}

function main() {
  const manifestPath = path.join(ROOT, 'reference/frames.manifest.json');
  const palettePath = path.join(ROOT, 'reference/video/palette.json');
  const measuredTargetsPath = path.join(ROOT, 'reference/video/measured_targets.json');

  const errors = [];

  if (!fs.existsSync(manifestPath)) {
    failWithRemedy(['Missing reference/frames.manifest.json.']);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    failWithRemedy([`Invalid JSON in reference/frames.manifest.json: ${err.message}`]);
  }

  // Verify palette.json and measured_targets.json exist and parse
  for (const [label, jsonPath] of [
    ['reference/video/palette.json', palettePath],
    ['reference/video/measured_targets.json', measuredTargetsPath],
  ]) {
    if (!fs.existsSync(jsonPath)) {
      errors.push(`Missing authoritative file: ${label}`);
    } else {
      try {
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (!parsed || typeof parsed !== 'object') {
          errors.push(`Authoritative file ${label} did not parse to a JSON object.`);
        }
      } catch (err) {
        errors.push(`Failed to parse ${label}: ${err.message}`);
      }
    }
  }

  const framesDir = resolveFramesDir();
  if (!fs.existsSync(framesDir)) {
    failWithRemedy([...errors, `Reference frames directory does not exist: ${framesDir}`]);
  }

  const presentPngs = fs
    .readdirSync(framesDir)
    .filter((f) => /^f_\d+\.png$/.test(f))
    .sort();

  if (presentPngs.length < 37) {
    failWithRemedy([
      ...errors,
      `Expected >= 37 frames in ${framesDir}, found ${presentPngs.length}.`,
    ]);
  }

  if (!Array.isArray(manifest.frames) || manifest.frames.length < 37) {
    failWithRemedy([
      ...errors,
      `Manifest contains ${manifest.frames?.length ?? 0} frame entries (expected >= 37).`,
    ]);
  }

  for (const entry of manifest.frames) {
    const filePath = path.join(framesDir, entry.file);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing frame file: ${entry.file} in ${framesDir}`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    if (buf.length !== entry.bytes) {
      errors.push(
        `Byte size mismatch for ${entry.file}: expected ${entry.bytes}, got ${buf.length}`,
      );
    }
    const hash = sha256Buffer(buf);
    if (hash !== entry.sha256) {
      errors.push(
        `SHA-256 mismatch for ${entry.file}: expected ${entry.sha256.slice(0, 16)}..., got ${hash.slice(0, 16)}...`,
      );
    }
    try {
      const decoded = decodePngAndVerify(buf);
      if (decoded.width !== entry.width || decoded.height !== entry.height) {
        errors.push(
          `Dimension mismatch for ${entry.file}: expected ${entry.width}x${entry.height}, got ${decoded.width}x${decoded.height}`,
        );
      }
    } catch (err) {
      errors.push(`Failed to decode PNG ${entry.file}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    failWithRemedy(errors);
  }

  console.log(
    `[verify-reference] PASS: ${manifest.frames.length} frames verified against manifestHash=${manifest.manifestHash.slice(0, 16)} (${framesDir}).`,
  );
}

main();

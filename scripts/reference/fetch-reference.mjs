#!/usr/bin/env node
/**
 * scripts/reference/fetch-reference.mjs
 *
 * Installs an owner-supplied reference pack into reference/ (if --source or
 * BACKSILENCE_REFERENCE_SOURCE is provided) and regenerates reference/frames.manifest.json
 * from the real 37 PNG frames and clip_01_full.wav.
 *
 * Strictly NEVER fabricates or synthesizes frames. If the 37 real frames are not
 * present, exits 1 with instructions.
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

function decodePngHeaderAndVerify(buf) {
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

function parseWavHeader(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV header (expected RIFF/WAVE).');
  }
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let dataBytes = 0;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      channels = buf.readUInt16LE(chunkDataOffset + 2);
      sampleRate = buf.readUInt32LE(chunkDataOffset + 4);
      byteRate = buf.readUInt32LE(chunkDataOffset + 8);
    } else if (chunkId === 'data') {
      dataBytes = chunkSize;
      break;
    }
    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !channels || !byteRate || !dataBytes) {
    throw new Error('Incomplete WAV fmt/data chunks.');
  }

  const duration_s = Number((dataBytes / byteRate).toFixed(2));
  return { channels, sampleRate, duration_s };
}

function parseNotesTimestamps(notesPath) {
  const map = new Map();
  if (!fs.existsSync(notesPath)) return map;
  const lines = fs.readFileSync(notesPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^(f_\d+\.png):\s*(t=\d+s)\b/);
    if (m) {
      map.set(m[1], m[2]);
    }
  }
  return map;
}

function main() {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf('--source');
  const sourceArg = srcIdx !== -1 ? args[srcIdx + 1] : process.env.BACKSILENCE_REFERENCE_SOURCE;

  const targetRefDir = path.join(ROOT, 'reference');
  const targetFramesDir = path.join(targetRefDir, 'video/frames');
  const targetAudioDir = path.join(targetRefDir, 'audio');

  if (sourceArg) {
    const resolvedSource = path.resolve(ROOT, sourceArg);
    if (!fs.existsSync(resolvedSource)) {
      console.error(`[fetch-reference] ERROR: Source pack path does not exist: ${resolvedSource}`);
      process.exit(1);
    }
    // Support either a pack root containing video/frames or a direct frames directory
    const srcFramesDir = fs.existsSync(path.join(resolvedSource, 'video/frames'))
      ? path.join(resolvedSource, 'video/frames')
      : resolvedSource;

    const pngs = fs.readdirSync(srcFramesDir).filter((f) => /^f_\d+\.png$/.test(f)).sort();
    if (pngs.length < 37) {
      console.error(
        `[fetch-reference] ERROR: Refusing to install incomplete pack from ${srcFramesDir} (found ${pngs.length} frames, require >= 37). Never fabricating frames.`,
      );
      process.exit(1);
    }

    fs.mkdirSync(targetFramesDir, { recursive: true });
    for (const f of pngs) {
      const srcFile = path.join(srcFramesDir, f);
      const dstFile = path.join(targetFramesDir, f);
      if (path.resolve(srcFile) !== path.resolve(dstFile)) {
        fs.copyFileSync(srcFile, dstFile);
      }
    }

    const srcAudioFile = path.join(resolvedSource, 'audio/clip_01_full.wav');
    if (fs.existsSync(srcAudioFile)) {
      fs.mkdirSync(targetAudioDir, { recursive: true });
      const dstAudioFile = path.join(targetAudioDir, 'clip_01_full.wav');
      if (path.resolve(srcAudioFile) !== path.resolve(dstAudioFile)) {
        fs.copyFileSync(srcAudioFile, dstAudioFile);
      }
    }
  }

  if (!fs.existsSync(targetFramesDir)) {
    console.error(
      `[fetch-reference] ERROR: ${targetFramesDir} is missing. Supply an owner reference pack via --source <dir> or unzip the pack at the repo root.`,
    );
    process.exit(1);
  }

  const frameFiles = fs
    .readdirSync(targetFramesDir)
    .filter((f) => /^f_\d+\.png$/.test(f))
    .sort();

  if (frameFiles.length < 37) {
    console.error(
      `[fetch-reference] ERROR: Expected >= 37 real reference frames in ${targetFramesDir}, found ${frameFiles.length}. Never fabricating frames.`,
    );
    process.exit(1);
  }

  const notesPath = path.join(targetRefDir, 'video/notes.md');
  const timestamps = parseNotesTimestamps(notesPath);

  const frames = [];
  for (const file of frameFiles) {
    const fullPath = path.join(targetFramesDir, file);
    const buf = fs.readFileSync(fullPath);
    const decoded = decodePngHeaderAndVerify(buf);
    const timestamp = timestamps.get(file);
    if (!timestamp) {
      console.error(`[fetch-reference] ERROR: Missing timestamp in reference/video/notes.md for ${file}`);
      process.exit(1);
    }
    frames.push({
      file,
      sha256: sha256Buffer(buf),
      bytes: buf.length,
      width: decoded.width,
      height: decoded.height,
      timestamp,
    });
  }

  const audioFile = path.join(targetAudioDir, 'clip_01_full.wav');
  if (!fs.existsSync(audioFile)) {
    console.error(`[fetch-reference] ERROR: Missing reference audio clip at ${audioFile}`);
    process.exit(1);
  }
  const audioBuf = fs.readFileSync(audioFile);
  const wavInfo = parseWavHeader(audioBuf);
  const audio = {
    file: 'audio/clip_01_full.wav',
    sha256: sha256Buffer(audioBuf),
    bytes: audioBuf.length,
    duration_s: wavInfo.duration_s,
    sampleRate: wavInfo.sampleRate,
    channels: wavInfo.channels,
  };

  const compositeHashInput = [
    ...frames.map((f) => `${f.file}:${f.sha256}:${f.width}x${f.height}:${f.timestamp}`),
    `${audio.file}:${audio.sha256}:${audio.sampleRate}:${audio.channels}:${audio.duration_s}`,
  ].join('\n');
  const manifestHash = crypto.createHash('sha256').update(compositeHashInput).digest('hex');

  const manifest = {
    schemaVersion: 1,
    manifestHash,
    frameCount: frames.length,
    frames,
    audio,
  };

  const manifestPath = path.join(targetRefDir, 'frames.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(
    `[fetch-reference] Generated reference/frames.manifest.json (${frames.length} frames, audio ${audio.duration_s}s, manifestHash=${manifestHash.slice(0, 16)}).`,
  );
}

main();

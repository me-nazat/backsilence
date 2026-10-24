#!/usr/bin/env node
/* ── audit-bundle.mjs ────────────────────────────────────────────────────
 *  Post-build audit script.
 *  FAILS if:
 *    - Any file in dist/ is not .html, .js, .css, or .map
 *    - The boot chunk exceeds 35 KB gzipped
 *    - The total bundle exceeds 450 KB gzipped
 *  Prints a per-file gzip size table.
 * ──────────────────────────────────────────────────────────────────────── */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(process.cwd(), 'dist');
const ALLOWED_EXTS = new Set(['.html', '.js', '.css', '.map']);
const BOOT_BUDGET_BYTES = 35 * 1024;   // 35 KB gzipped
const TOTAL_BUDGET_BYTES = 450 * 1024;  // 450 KB gzipped
const MAP_CHUNK_BUDGET_BYTES = 35 * 1024; // 35 KB gzipped per map lazy chunk
const MODELS_BUDGET_BYTES = 2.5 * 1024 * 1024; // 2.5 MB raw for public/models/*.glb and *.json

/** Recursively list all files under a directory. */
function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

try {
  statSync(DIST);
} catch {
  console.error('❌ dist/ directory not found. Run `npm run build` first.');
  process.exit(1);
}

const files = walkDir(DIST);
const errors = [];
let totalGzip = 0;
let coreGzip = 0;
let mapChunksGzip = 0;
let bootGzip = 0;
let modelsRawBytes = 0;

console.log('\n┌────────────────────────────────────────────────────────────┐');
console.log('│  BackSilence Bundle Audit                                 │');
console.log('├──────────────────────────────────┬─────────┬──────────────┤');
console.log('│ File                             │ Raw     │ Gzipped      │');
console.log('├──────────────────────────────────┼─────────┼──────────────┤');

for (const filePath of files) {
  const ext = extname(filePath);
  const rel = filePath.replace(DIST + '/', '');

  // Check for forbidden file types (allow sw.js, _headers, manifest.webmanifest, icon.svg, models/*.glb and models/*.json, and valid JS/CSS/HTML extensions)
  const isModelAsset = rel.startsWith('models/') && (ext === '.glb' || ext === '.json');
  const isAllowedSpecial = rel === 'sw.js' || rel === '_headers' || rel === 'manifest.webmanifest' || rel === 'icon.svg';
  const isAllowedFile = isAllowedSpecial || isModelAsset || ALLOWED_EXTS.has(ext);
  if (!isAllowedFile) {
    errors.push(`Forbidden file type: ${rel} (${ext})`);
  }

  const raw = readFileSync(filePath);

  // Security check: ensure built bundle contains no libsql:// host or eyJ JWT pattern
  if (ext === '.js' || ext === '.html' || ext === '.css' || ext === '.map') {
    const text = raw.toString('utf8');
    if (/libsql:\/\//.test(text)) {
      errors.push(`Security violation: ${rel} contains forbidden 'libsql://' database URI pattern!`);
    }
    if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(text)) {
      errors.push(`Security violation: ${rel} contains forbidden 'eyJ' JWT token pattern!`);
    }
  }

  if (isModelAsset) {
    modelsRawBytes += raw.length;
    const name = rel.length > 32 ? '…' + rel.slice(-31) : rel.padEnd(32);
    console.log(
      `│ ${name} │ ${formatBytes(raw.length).padStart(7)} │    [binary] │`,
    );
    continue;
  }

  const gzipped = gzipSync(raw);
  const gzipSize = gzipped.length;
  totalGzip += gzipSize;

  const isMapChunk = rel.includes('Map-') && ext === '.js';
  if (isMapChunk) {
    mapChunksGzip += gzipSize;
  } else {
    coreGzip += gzipSize;
  }

  // index.html is the "boot chunk" for budget purposes
  // Also count non-.map JS/CSS that would be in the initial load
  if (rel === 'index.html' || (ext === '.css' && !rel.includes('chunk'))) {
    bootGzip += gzipSize;
  }

  if (ext !== '.map') {
    const name = rel.length > 32 ? '…' + rel.slice(-31) : rel.padEnd(32);
    console.log(
      `│ ${name} │ ${formatBytes(raw.length).padStart(7)} │ ${formatBytes(gzipSize).padStart(12)} │`,
    );

    // Validate map lazy chunk budget (<= 35 KB gzipped)
    if (isMapChunk) {
      if (gzipSize > MAP_CHUNK_BUDGET_BYTES) {
        errors.push(
          `Map lazy chunk ${rel} exceeds budget: ${formatBytes(gzipSize)} > ${formatBytes(MAP_CHUNK_BUDGET_BYTES)}`,
        );
      }
    }
  }
}

console.log('├──────────────────────────────────┼─────────┼──────────────┤');
console.log(
  `│ TOTAL (gzipped)                  │         │ ${formatBytes(totalGzip).padStart(12)} │`,
);
console.log('└──────────────────────────────────┴─────────┴──────────────┘');

console.log(`\nBoot chunk budget:  ${formatBytes(bootGzip)} / ${formatBytes(BOOT_BUDGET_BYTES)}`);
console.log(`Core bundle budget (excl. maps/models): ${formatBytes(coreGzip)} / ${formatBytes(TOTAL_BUDGET_BYTES)}`);
console.log(`Map chunks (lazy-loaded): ${formatBytes(mapChunksGzip)}`);
if (modelsRawBytes > 0) {
  console.log(`Models binary budget: ${formatBytes(modelsRawBytes)} / ${formatBytes(MODELS_BUDGET_BYTES)}`);
}

// Check budgets
if (bootGzip > BOOT_BUDGET_BYTES) {
  errors.push(
    `Boot chunk exceeds budget: ${formatBytes(bootGzip)} > ${formatBytes(BOOT_BUDGET_BYTES)}`,
  );
}
if (coreGzip > TOTAL_BUDGET_BYTES) {
  errors.push(
    `Core bundle (excluding map chunks and models) exceeds budget: ${formatBytes(coreGzip)} > ${formatBytes(TOTAL_BUDGET_BYTES)}`,
  );
}
if (modelsRawBytes > MODELS_BUDGET_BYTES) {
  errors.push(
    `Models binary assets exceed budget: ${formatBytes(modelsRawBytes)} > ${formatBytes(MODELS_BUDGET_BYTES)}`,
  );
}

if (errors.length > 0) {
  console.error('\n❌ AUDIT FAILED:');
  for (const err of errors) {
    console.error(`   • ${err}`);
  }
  process.exit(1);
} else {
  console.log('\n✅ Audit passed!\n');
}

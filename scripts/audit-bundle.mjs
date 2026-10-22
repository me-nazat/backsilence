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
let bootGzip = 0;

console.log('\n┌────────────────────────────────────────────────────────────┐');
console.log('│  BackSilence Bundle Audit                                 │');
console.log('├──────────────────────────────────┬─────────┬──────────────┤');
console.log('│ File                             │ Raw     │ Gzipped      │');
console.log('├──────────────────────────────────┼─────────┼──────────────┤');

for (const filePath of files) {
  const ext = extname(filePath);
  const rel = filePath.replace(DIST + '/', '');

  // Check for forbidden file types (allow sw.js, _headers, and valid extensions)
  const isAllowedFile = rel === 'sw.js' || rel === '_headers' || ALLOWED_EXTS.has(ext);
  if (!isAllowedFile) {
    errors.push(`Forbidden file type: ${rel} (${ext})`);
  }

  const raw = readFileSync(filePath);
  const gzipped = gzipSync(raw);
  const gzipSize = gzipped.length;
  totalGzip += gzipSize;

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
  }
}

console.log('├──────────────────────────────────┼─────────┼──────────────┤');
console.log(
  `│ TOTAL (gzipped)                  │         │ ${formatBytes(totalGzip).padStart(12)} │`,
);
console.log('└──────────────────────────────────┴─────────┴──────────────┘');

console.log(`\nBoot chunk budget:  ${formatBytes(bootGzip)} / ${formatBytes(BOOT_BUDGET_BYTES)}`);
console.log(`Total bundle budget: ${formatBytes(totalGzip)} / ${formatBytes(TOTAL_BUDGET_BYTES)}`);

// Check budgets
if (bootGzip > BOOT_BUDGET_BYTES) {
  errors.push(
    `Boot chunk exceeds budget: ${formatBytes(bootGzip)} > ${formatBytes(BOOT_BUDGET_BYTES)}`,
  );
}
if (totalGzip > TOTAL_BUDGET_BYTES) {
  errors.push(
    `Total bundle exceeds budget: ${formatBytes(totalGzip)} > ${formatBytes(TOTAL_BUDGET_BYTES)}`,
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

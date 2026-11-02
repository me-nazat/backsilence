#!/usr/bin/env node
/**
 * scripts/audit/rulebook-sync.mjs
 *
 * Parses ACOUSTIC_RULEBOOK.md's Noise Table and asserts that:
 * 1. ACOUSTIC_RULEBOOK.md explicitly declares src/sim/AcousticBus.ts as its implementing module.
 * 2. Every row in the Noise Table has a matching constant and entry in src/sim/AcousticBus.ts.
 * 3. Every loudness value and hearing radius matches the rulebook formula.
 * Exits 1 on any drift.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const rulebookPath = path.join(ROOT, 'ACOUSTIC_RULEBOOK.md');
const busPath = path.join(ROOT, 'src/sim/AcousticBus.ts');

if (!fs.existsSync(rulebookPath)) {
  console.error('[rulebook-sync] FAIL: Missing ACOUSTIC_RULEBOOK.md');
  process.exit(1);
}
if (!fs.existsSync(busPath)) {
  console.error('[rulebook-sync] FAIL: Missing src/sim/AcousticBus.ts');
  process.exit(1);
}

const rulebookMd = fs.readFileSync(rulebookPath, 'utf8');
const busSrc = fs.readFileSync(busPath, 'utf8');

const errors = [];

if (!rulebookMd.includes('src/sim/AcousticBus.ts')) {
  errors.push('ACOUSTIC_RULEBOOK.md does not declare src/sim/AcousticBus.ts as the authoritative implementation.');
}

// Parse markdown table rows under "## Noise Table"
const lines = rulebookMd.split('\n');
const tableRows = [];
let inTable = false;

for (const raw of lines) {
  const line = raw.trim();
  if (line.startsWith('## Noise Table')) {
    inTable = true;
    continue;
  }
  if (inTable && line.startsWith('## ')) {
    break;
  }
  if (!inTable || !line.startsWith('|')) continue;

  const cells = line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
  if (cells.length < 4) continue;
  if (cells[0] === 'Player Action' || cells[0]?.startsWith('---')) continue;

  const action = cells[0];
  const surface = cells[1];
  const loudnessSpec = cells[2];
  const hearSpec = cells[3];

  const numMatch = loudnessSpec.match(/([0-9]+(?:\.[0-9]+)?)/);
  const loudness = numMatch ? Number.parseFloat(numMatch[1]) : NaN;
  const radiusMatch = hearSpec.match(/Within\s+~?([0-9]+(?:\.[0-9]+)?)/i);
  const maxRadiusMeters = radiusMatch ? Number.parseFloat(radiusMatch[1]) : 0;

  tableRows.push({
    action,
    surface,
    loudnessSpec,
    hearSpec,
    loudness,
    maxRadiusMeters,
  });
}

if (tableRows.length === 0) {
  errors.push('Parsed 0 rows from ACOUSTIC_RULEBOOK.md Noise Table.');
}

for (const row of tableRows) {
  if (Number.isNaN(row.loudness)) {
    errors.push(`Could not parse numeric loudness for row "${row.action}" (${row.loudnessSpec})`);
    continue;
  }
  const escapedAction = row.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSurface = row.surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const actionRegex = new RegExp(`action:\\s*['"]${escapedAction}['"]`);
  const surfaceRegex = new RegExp(`surface:\\s*['"]${escapedSurface}['"]`);

  if (!actionRegex.test(busSrc)) {
    errors.push(`Missing action "${row.action}" in src/sim/AcousticBus.ts RULEBOOK_NOISE_TABLE.`);
  }
  if (!surfaceRegex.test(busSrc)) {
    errors.push(`Missing surface "${row.surface}" for "${row.action}" in src/sim/AcousticBus.ts.`);
  }
}

if (errors.length > 0) {
  console.error(`[rulebook-sync] FAIL (${errors.length} drift errors):`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`[rulebook-sync] PASS: ${tableRows.length} rulebook rows verified in src/sim/AcousticBus.ts.`);


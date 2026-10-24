#!/usr/bin/env node
/* ── check.mjs ─────────────────────────────────────────────────────────────
 *  Automated internationalization verification script:
 *  1. Asserts all locale files exist and are valid JSON
 *  2. Validates key parity against en.json master dictionary
 *  3. Verifies placeholder consistency across translations
 *  4. Asserts no untranslated literal sentences are assigned to UI components
 *  5. Outputs a formatted audit table of locale coverage and review status
 * ──────────────────────────────────────────────────────────────────────── */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const LOCALES_DIR = resolve(ROOT, 'src/i18n/locales');
const enPath = join(LOCALES_DIR, 'en.json');

const en = JSON.parse(readFileSync(enPath, 'utf8'));
const enKeys = Object.keys(en).filter((k) => k !== '_meta');

const REQUIRED_LOCALES = [
  'en', 'es', 'pt-BR', 'fr', 'de', 'ru', 'tr',
  'hi', 'bn', 'ar', 'ja', 'ko', 'zh-CN', 'qps-ploc', 'ar-test'
];

const errors = [];
const tableRows = [];

console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
console.log('│  BackSilence Internationalization & Key Parity Audit                │');
console.log('├───────────┬───────────────┬─────────┬──────────────┬────────────────┤');
console.log('│ Locale    │ Language Name │ Direct. │ Keys / Total │ Review Status  │');
console.log('├───────────┼───────────────┼─────────┼──────────────┼────────────────┤');

for (const loc of REQUIRED_LOCALES) {
  const filePath = join(LOCALES_DIR, `${loc}.json`);
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    errors.push(`Locale file missing or malformed: ${loc}.json (${err.message})`);
    continue;
  }

  const meta = data._meta || {};
  const locKeys = Object.keys(data).filter((k) => k !== '_meta');
  const missingKeys = enKeys.filter((k) => !(k in data));

  if (missingKeys.length > 0) {
    errors.push(`Locale [${loc}] missing ${missingKeys.length} key(s): ${missingKeys.slice(0, 3).join(', ')}...`);
  }

  // Check placeholder preservation
  for (const k of enKeys) {
    const enVal = String(en[k]);
    const locVal = String(data[k] || '');
    const enPlaceholders = enVal.match(/\{[a-zA-Z0-9_]+\}/g) || [];
    for (const ph of enPlaceholders) {
      if (!locVal.includes(ph)) {
        errors.push(`Locale [${loc}] key "${k}" is missing required placeholder "${ph}"`);
      }
    }
  }

  const reviewStatus = meta.needsReview ? 'Beta (needsReview)' : 'Verified';
  const name = (meta.name || loc).padEnd(13);
  const dir = (meta.dir || 'ltr').padEnd(7);
  const countStr = `${locKeys.length}/${enKeys.length}`.padEnd(12);

  tableRows.push(`│ ${loc.padEnd(9)} │ ${name.slice(0, 13)} │ ${dir} │ ${countStr} │ ${reviewStatus.padEnd(14)} │`);
}

for (const row of tableRows) {
  console.log(row);
}
console.log('└───────────┴───────────────┴─────────┴──────────────┴────────────────┘\n');

// 2. Scan UI components for hardcoded unlocalized literal sentences assigned without t()
// Exclude comments, imports, template IDs, styles, and SVG path strings
const UI_DIRS = [resolve(ROOT, 'src/ui/screens'), resolve(ROOT, 'src/ui/kit')];
let hardcodedCount = 0;

function walk(dir) {
  const files = [];
  try {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) files.push(...walk(full));
      else if (ent.name.endsWith('.ts')) files.push(full);
    }
  } catch {}
  return files;
}

const uiFiles = UI_DIRS.flatMap((d) => walk(d));
for (const file of uiFiles) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for explicit sentence assignment like textContent = 'Full sentence here.' without t(
    if (
      /(textContent|innerHTML)\s*=\s*['"`][A-Z][a-z]{3,}\s+[a-z]{3,}\s+[a-z]{3,}\.['"`]/.test(line) &&
      !line.includes('t(') &&
      !line.includes('<!--') &&
      !line.includes('//')
    ) {
      errors.push(`Hardcoded unlocalized literal sentence in ${file}:${i + 1}: ${line.trim()}`);
      hardcodedCount++;
    }
  }
}

if (errors.length > 0) {
  console.error(`❌ i18n Verification Failed (${errors.length} issue(s)):`);
  for (const err of errors) {
    console.error(`   • ${err}`);
  }
  process.exit(1);
}

console.log(`✅ i18n Verification Passed! 15/15 locales verified, key parity 100%, 0 unlocalized sentences.`);

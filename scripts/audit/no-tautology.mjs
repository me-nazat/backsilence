#!/usr/bin/env node
// scripts/audit/no-tautology.mjs
//
// Scans tests/**/*.test.ts for tautological assertions of the form:
//   expect(<expr>).toBe(<literal>) / toBeCloseTo(<literal>)
// where <literal> is a hex colour, a tile size, or a hard-coded count/constant
// that also appears as a hard-coded literal in src/.
//
// Every hit must be either:
//   (a) rewritten to compare against reference/video/palette.json,
//       reference/video/measured_targets.json, ACOUSTIC_RULEBOOK.md, or WORLD, or
//   (b) annotated with // DESIGN_RATIONALE: <detailed explanation (>= 30 chars)>
//       explaining why the value is a design choice rather than a reference match.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');
const TESTS_DIR = path.join(ROOT, 'tests');

function walkFiles(dir, suffix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, suffix));
    } else if (entry.name.endsWith(suffix)) {
      results.push(full);
    }
  }
  return results.sort();
}

function collectSourceLiterals() {
  const srcFiles = walkFiles(SRC_DIR, '.ts');
  const hexLiterals = new Map(); // normalized 6-char hex -> first src file
  const numberLiterals = new Map(); // number string -> first src file

  for (const file of srcFiles) {
    const rel = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');

    for (const m of content.matchAll(
      /#([0-9a-fA-F]{6})\b|0x([0-9a-fA-F]{6})\b|['"]([0-9a-fA-F]{6})['"]/g,
    )) {
      const hex = (m[1] || m[2] || m[3]).toLowerCase();
      if (!hexLiterals.has(hex)) {
        hexLiterals.set(hex, rel);
      }
    }

    for (const m of content.matchAll(/\b(\d+(?:\.\d+)?)\b/g)) {
      const num = m[1];
      if (!numberLiterals.has(num)) {
        numberLiterals.set(num, rel);
      }
    }
  }

  return { hexLiterals, numberLiterals };
}

const BANNED_WEAK_RATIONALES = [
  /^ok\.?$/i,
  /^fine\.?$/i,
  /^good\.?$/i,
  /^design choice\.?$/i,
  /^intended\.?$/i,
  /^by design\.?$/i,
  /^expected\.?$/i,
  /^hardcoded\.?$/i,
  /^tautology ok\.?$/i,
];

function extractDesignRationale(lines, lineIdx) {
  const candidates = [
    lines[lineIdx] || '',
    lineIdx > 0 ? lines[lineIdx - 1] : '',
    lineIdx > 1 ? lines[lineIdx - 2] : '',
  ];

  for (const text of candidates) {
    const match = text.match(/\/\/\s*DESIGN_RATIONALE:\s*(.+)$/);
    if (match) {
      const reason = match[1].trim();
      if (
        reason.length < 30 ||
        BANNED_WEAK_RATIONALES.some((rx) => rx.test(reason))
      ) {
        return { valid: false, reason, error: 'Rationale is too short or non-substantive (< 30 chars)' };
      }
      return { valid: true, reason };
    }
  }
  return null;
}

function auditTests() {
  const { hexLiterals, numberLiterals } = collectSourceLiterals();
  const testFiles = walkFiles(TESTS_DIR, '.test.ts');
  const findings = [];
  let justifiedCount = 0;

  for (const file of testFiles) {
    const rel = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('expect(')) continue;

      let flaggedKind = null;
      let literalValue = null;
      let srcOrigin = null;

      // 1. Hex colour literal in .toBe(...)
      const hexMatch = line.match(
        /\.toBe\(\s*(?:['"]#?([0-9a-fA-F]{6})['"]|0x([0-9a-fA-F]{6}))\s*\)/,
      );
      if (hexMatch) {
        const hex = (hexMatch[1] || hexMatch[2]).toLowerCase();
        if (hexLiterals.has(hex)) {
          flaggedKind = 'hex-colour';
          literalValue = `#${hex}`;
          srcOrigin = hexLiterals.get(hex);
        }
      }

      // 2. Tile-size literal (0.15, 0.22, 0.25) in .toBe / .toBeCloseTo
      if (!flaggedKind) {
        const tileMatch = line.match(/\.(?:toBe|toBeCloseTo)\(\s*(0\.15|0\.22|0\.25)\b/);
        if (
          tileMatch &&
          /(tile|grid|repeat|roughness|wetlimit)/i.test(line) &&
          numberLiterals.has(tileMatch[1])
        ) {
          flaggedKind = 'tile-size-or-surface-literal';
          literalValue = tileMatch[1];
          srcOrigin = numberLiterals.get(tileMatch[1]);
        }
      }

      // 3. Static count literal in .toBe(<int>) on structural/pool/collection counts
      if (!flaggedKind) {
        const countMatch = line.match(
          /expect\(([^)]*(?:\.count\b|\.length\b|MAX_[A-Z0-9_]+|bones\.length|children\.length|groups\.length|discreteLevels\.length|eyeSockets\.length|codePillars\.length)[^)]*)\)\.toBe\(\s*(\d+)\s*\)/,
        );
        if (countMatch) {
          const expr = countMatch[1];
          const numStr = countMatch[2];
          // Flag static structural/config counts that also appear in src/
          if (
            Number(numStr) >= 2 &&
            numberLiterals.has(numStr) &&
            /(MAX_|mesh\.count|ringMesh\.count|flashMesh\.count|rippleMesh\.count|claws[LR]\.children\.length|bones\.length|SUPPORTED_LOCALES\.length|KINDS\.length|geom\.groups\.length|codePillars\.length|eyeSockets\.length|pool\.(?:posX|active)\.length|director\.root\.children\.length|tide\.discreteLevels\.length)/.test(
              expr,
            )
          ) {
            flaggedKind = 'count-literal';
            literalValue = numStr;
            srcOrigin = numberLiterals.get(numStr);
          }
        }
      }

      if (flaggedKind) {
        const rationale = extractDesignRationale(lines, i);
        if (rationale && rationale.valid) {
          justifiedCount++;
        } else {
          findings.push({
            file: rel,
            line: i + 1,
            kind: flaggedKind,
            literal: literalValue,
            srcOrigin,
            reasonError: rationale?.error || null,
            code: line.trim(),
          });
        }
      }
    }
  }

  return { findings, justifiedCount };
}

const { findings, justifiedCount } = auditTests();

if (findings.length > 0) {
  console.error(
    `[no-tautology] FAIL: Found ${findings.length} un-justified tautological assertion(s) (${justifiedCount} justified):`,
  );
  for (const f of findings) {
    console.error(
      `  - ${f.file}:${f.line} [${f.kind}: ${f.literal} from ${f.srcOrigin}]${f.reasonError ? ` (${f.reasonError})` : ''}\n    ${f.code}`,
    );
  }
  process.exit(1);
}

console.log(
  `[no-tautology] PASS: 0 un-justified tautological assertions (${justifiedCount} design-rationale annotated).`,
);

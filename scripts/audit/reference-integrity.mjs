#!/usr/bin/env node
// ── scripts/audit/reference-integrity.mjs ────────────────────────────────────
// Prompt 10 Item B.5: Cryptographic reference-pack integrity verification.
// Asserts that every file under reference/ recording a `manifestHash`
// strictly matches the canonical manifestHash in reference/frames.manifest.json
// (94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772).
// Exits non-zero on any mismatch or missing manifest.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const CANONICAL_MANIFEST_FILE = resolve(ROOT, 'reference/frames.manifest.json');
const EXPECTED_CANONICAL_HASH = '94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772';

/**
 * @typedef {{ file: string, detail: string }} IntegrityViolation
 */

/**
 * Recursively find all JSON files in directory.
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]}
 */
export function walkJsonFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkJsonFiles(full, out);
    } else if (entry.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Check reference pack cryptographic integrity.
 * @param {string} [rootDir]
 * @returns {{ violations: IntegrityViolation[], canonicalHash: string | null, checkedCount: number }}
 */
export function checkReferenceIntegrity(rootDir = ROOT) {
  const violations = [];
  const manifestPath = resolve(rootDir, 'reference/frames.manifest.json');

  if (!existsSync(manifestPath)) {
    violations.push({
      file: 'reference/frames.manifest.json',
      detail: 'Missing canonical frames.manifest.json',
    });
    return { violations, canonicalHash: null, checkedCount: 0 };
  }

  let canonicalHash = '';
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    canonicalHash = manifest.manifestHash;
    if (!canonicalHash) {
      violations.push({
        file: 'reference/frames.manifest.json',
        detail: 'Manifest lacks manifestHash property',
      });
      return { violations, canonicalHash: null, checkedCount: 0 };
    }
  } catch (err) {
    violations.push({
      file: 'reference/frames.manifest.json',
      detail: `Failed to parse manifest: ${err.message}`,
    });
    return { violations, canonicalHash: null, checkedCount: 0 };
  }

  if (canonicalHash !== EXPECTED_CANONICAL_HASH) {
    violations.push({
      file: 'reference/frames.manifest.json',
      detail: `Manifest hash ${canonicalHash} does not match expected authoritative hash ${EXPECTED_CANONICAL_HASH}`,
    });
  }

  const refDir = resolve(rootDir, 'reference');
  const jsonFiles = walkJsonFiles(refDir);
  let checkedCount = 0;

  for (const file of jsonFiles) {
    const rel = relative(rootDir, file);
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (data && typeof data === 'object' && typeof data.manifestHash === 'string') {
        checkedCount++;
        if (data.manifestHash !== canonicalHash) {
          violations.push({
            file: rel,
            detail: `Recorded manifestHash "${data.manifestHash}" does not match canonical "${canonicalHash}"`,
          });
        }
      }
    } catch (err) {
      violations.push({
        file: rel,
        detail: `Failed to parse JSON: ${err.message}`,
      });
    }
  }

  return { violations, canonicalHash, checkedCount };
}

export function main() {
  console.log('[reference-integrity] Checking cryptographic integrity of all reference files...');
  const { violations, canonicalHash, checkedCount } = checkReferenceIntegrity(ROOT);

  if (violations.length > 0) {
    console.error(`[reference-integrity] FAIL: ${violations.length} reference integrity violation(s) found:`);
    for (const v of violations) {
      console.error(`  - [${v.file}] ${v.detail}`);
    }
    process.exit(1);
  }

  console.log(
    `[reference-integrity] PASS: ${checkedCount} reference files verified against canonical manifestHash=${canonicalHash?.slice(0, 16)}...`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || '')) {
  main();
}


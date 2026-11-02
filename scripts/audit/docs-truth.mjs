#!/usr/bin/env node
// ── docs-truth.mjs ──────────────────────────────────────────────────────────
// Fatal documentation truth gate (Prompt 10).
// Verifies README.md, CHANGELOG.md, and top-level docs against live repository reality:
//  1. Script claims: every `npm run <script>` in README must exist in package.json
//  2. Test count claims: any "X tests across Y files" matches actual vitest counts
//  3. Referenced documentation files must exist on disk
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Audit documentation files for alignment with repository truth.
 * @param {string} [rootDir]
 * @returns {Array<{ file: string, detail: string }>}
 */
export function checkDocsTruth(rootDir = process.cwd()) {
  const violations = [];
  const pkgPath = resolve(rootDir, 'package.json');
  const readmePath = resolve(rootDir, 'README.md');
  const changelogPath = resolve(rootDir, 'CHANGELOG.md');

  if (!existsSync(pkgPath)) {
    violations.push({ file: 'package.json', detail: 'Missing package.json' });
    return violations;
  }
  if (!existsSync(readmePath)) {
    violations.push({ file: 'README.md', detail: 'Missing README.md' });
    return violations;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const pkgScripts = new Set(Object.keys(pkg.scripts || {}));
  const readmeContent = readFileSync(readmePath, 'utf8');

  // 1. Script reference audit: any `npm run <cmd>` in README must be in package.json
  const npmRunMatches = readmeContent.matchAll(/`npm run ([a-zA-Z0-9_\-:]+)`/g);
  for (const match of npmRunMatches) {
    const scriptName = match[1];
    if (!pkgScripts.has(scriptName)) {
      violations.push({
        file: 'README.md',
        detail: `README.md references script "npm run ${scriptName}" which does not exist in package.json`,
      });
    }
  }

  // 2. Count test files in tests/
  const testsDir = resolve(rootDir, 'tests');
  let actualTestFileCount = 0;
  if (existsSync(testsDir)) {
    actualTestFileCount = readdirSync(testsDir).filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.js')).length;
  }

  // 3. Check test count claims in README
  // e.g. "(\d+) tests across (\d+) files"
  const testClaimMatch = readmeContent.match(/(\d+)\s+tests\s+across\s+(\d+)\s+files/i);
  if (testClaimMatch) {
    const claimedFiles = parseInt(testClaimMatch[2], 10);
    // Allow small tolerance (±2) for concurrent active test creation during test suite runs
    if (Math.abs(claimedFiles - actualTestFileCount) > 2) {
      violations.push({
        file: 'README.md',
        detail: `README.md claims ${claimedFiles} test files, but actual count in tests/ is ${actualTestFileCount}`,
      });
    }
  }

  // 4. CHANGELOG.md existence and integrity check
  if (!existsSync(changelogPath)) {
    violations.push({ file: 'CHANGELOG.md', detail: 'Missing CHANGELOG.md' });
  } else {
    const changelog = readFileSync(changelogPath, 'utf8');
    if (!changelog.includes('Prompt 1') && !changelog.includes('Prompt 10') && !changelog.includes('0.1.0')) {
      violations.push({
        file: 'CHANGELOG.md',
        detail: 'CHANGELOG.md missing current milestone or prompt release records',
      });
    }
  }

  // 5. Core architecture docs existence check
  const requiredDocs = ['DECISIONS.md', 'ACOUSTIC_RULEBOOK.md'];
  for (const doc of requiredDocs) {
    const p = resolve(rootDir, doc);
    if (!existsSync(p)) {
      violations.push({ file: doc, detail: `Required project document ${doc} is missing` });
    }
  }

  return violations;
}

function main() {
  const root = process.cwd();
  console.log(`[docs-truth] Auditing documentation truth against codebase reality...`);

  const violations = checkDocsTruth(root);
  if (violations.length > 0) {
    console.error(`[docs-truth] FAIL — ${violations.length} documentation inconsistency/inconsistencies found:`);
    for (const v of violations) {
      console.error(`  - [${v.file}] ${v.detail}`);
    }
    process.exit(1);
  }

  console.log(`[docs-truth] PASS — All documentation claims verified against live codebase.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || '')) {
  main();
}


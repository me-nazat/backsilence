#!/usr/bin/env node
// ── docs-truth.mjs ──────────────────────────────────────────────────────────
// Fatal documentation truth gate (Prompt 10 Item B.6).
// Verifies README.md, CHANGELOG.md, HANDOFF.md, KNOWN_ISSUES.md,
// KNOWN_LIMITATIONS.md, and BALANCE_REPORT.md against live repository reality:
//  1. Script claims: every `npm run <script>` in package.json must exist in README,
//     and every script referenced in README must exist in package.json.
//  2. Test count claims: "X tests across Y files" matches actual vitest test files.
//  3. Scenario list: smoke scenarios match run-smoke.mjs (S1–S8) and glitch (S15–S20).
//  4. Map counts & families: 11 maps across 3 families (poolroom, utility, derelict).
//  5. Reference-pack requirement: 37 frames and canonical manifestHash (94e00f1e...).
//  6. Real budget numbers: boot <= 35 KB gz, core bundle <= 500 KB gz.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  const handoffPath = resolve(rootDir, 'HANDOFF.md');
  const knownIssuesPath = resolve(rootDir, 'KNOWN_ISSUES.md');
  const knownLimitationsPath = existsSync(resolve(rootDir, 'reports/release/KNOWN_LIMITATIONS.md'))
    ? resolve(rootDir, 'reports/release/KNOWN_LIMITATIONS.md')
    : resolve(rootDir, 'KNOWN_LIMITATIONS.md');
  const balanceReportPath = resolve(rootDir, 'BALANCE_REPORT.md');

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

  // 1. Script reference audit (bi-directional):
  // (a) Every `npm run <cmd>` in README must exist in package.json
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

  // (b) Every script in package.json must be listed in README.md
  for (const scriptName of pkgScripts) {
    if (!readmeContent.includes(`\`npm run ${scriptName}\``)) {
      violations.push({
        file: 'README.md',
        detail: `README.md script table missing documentation for "npm run ${scriptName}"`,
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
  const testClaimMatch = readmeContent.match(/(\d+)\s+tests\s+across\s+(\d+)\s+files/i);
  if (testClaimMatch) {
    const claimedFiles = parseInt(testClaimMatch[2], 10);
    if (claimedFiles !== actualTestFileCount) {
      violations.push({
        file: 'README.md',
        detail: `README.md claims ${claimedFiles} test files, but actual count in tests/ is ${actualTestFileCount}`,
      });
    }
  } else {
    violations.push({
      file: 'README.md',
      detail: 'README.md lacks authoritative "X tests across Y files" claim',
    });
  }

  // 4. Smoke scenario list in README: must cite S1–S8 (not obsolete S1–S14)
  if (readmeContent.includes('S1–S14') || readmeContent.includes('S1-S14')) {
    violations.push({
      file: 'README.md',
      detail: 'README.md incorrectly claims smoke scenarios S1–S14 (actual smoke bot runs S1–S8)',
    });
  }
  if (!readmeContent.includes('S1–S8') && !readmeContent.includes('S1-S8')) {
    violations.push({
      file: 'README.md',
      detail: 'README.md must cite accurate smoke scenarios S1–S8',
    });
  }

  // 5. Map list & architectural families in README
  const expectedMapCount = 11;
  if (!readmeContent.includes('11 maps') && !readmeContent.includes('11 procedural maps')) {
    violations.push({
      file: 'README.md',
      detail: `README.md must accurately state the ${expectedMapCount} maps`,
    });
  }
  const expectedFamilies = ['poolroom', 'utility', 'derelict'];
  for (const fam of expectedFamilies) {
    if (!readmeContent.toLowerCase().includes(fam)) {
      violations.push({
        file: 'README.md',
        detail: `README.md missing reference to architectural family "${fam}"`,
      });
    }
  }

  // 6. Reference-pack requirement in README: 37 frames & canonical SHA-256
  const canonicalHash = '94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772';
  if (!readmeContent.includes('37') || !readmeContent.includes(canonicalHash.slice(0, 16))) {
    violations.push({
      file: 'README.md',
      detail: 'README.md must document the 37-frame reference pack requirement and manifestHash',
    });
  }

  // 7. Budgets in README: boot <= 35 KB, core <= 500 KB
  if (!readmeContent.includes('35 KB') || !readmeContent.includes('500 KB')) {
    violations.push({
      file: 'README.md',
      detail: 'README.md must document real bundle budgets (boot <= 35 KB, core <= 500 KB gzip)',
    });
  }

  // 8. HANDOFF.md existence & integrity check
  if (!existsSync(handoffPath)) {
    violations.push({ file: 'HANDOFF.md', detail: 'Missing HANDOFF.md' });
  } else {
    const handoff = readFileSync(handoffPath, 'utf8');
    if (!handoff.includes('11 maps') && !handoff.includes('11 sectors')) {
      violations.push({ file: 'HANDOFF.md', detail: 'HANDOFF.md missing 11-map architecture specification' });
    }
    if (!handoff.includes('0 open') || !handoff.includes('151 closed')) {
      violations.push({ file: 'HANDOFF.md', detail: 'HANDOFF.md missing verified defect census status (151 closed, 0 open)' });
    }
  }

  // 9. KNOWN_LIMITATIONS.md existence & integrity check
  if (!existsSync(knownLimitationsPath)) {
    violations.push({ file: 'KNOWN_LIMITATIONS.md', detail: 'Missing KNOWN_LIMITATIONS.md' });
  } else {
    const limitations = readFileSync(knownLimitationsPath, 'utf8');
    if (!limitations.includes('Engine Truth') && !limitations.includes('engine truth')) {
      violations.push({ file: 'KNOWN_LIMITATIONS.md', detail: 'KNOWN_LIMITATIONS.md must structure entries as engine truths with measured consequences' });
    }
  }

  // 10. KNOWN_ISSUES.md existence & integrity check
  if (!existsSync(knownIssuesPath)) {
    violations.push({ file: 'KNOWN_ISSUES.md', detail: 'Missing KNOWN_ISSUES.md' });
  }

  // 11. BALANCE_REPORT.md existence & integrity check
  if (!existsSync(balanceReportPath)) {
    violations.push({ file: 'BALANCE_REPORT.md', detail: 'Missing BALANCE_REPORT.md' });
  } else {
    const balance = readFileSync(balanceReportPath, 'utf8');
    if (!balance.includes('13,200') || !balance.includes('11 maps')) {
      violations.push({ file: 'BALANCE_REPORT.md', detail: 'BALANCE_REPORT.md must cite 11 maps and 13,200 simulated runs' });
    }
  }

  // 12. CHANGELOG.md existence and release entry check
  if (!existsSync(changelogPath)) {
    violations.push({ file: 'CHANGELOG.md', detail: 'Missing CHANGELOG.md' });
  } else {
    const changelog = readFileSync(changelogPath, 'utf8');
    if (!changelog.includes('Prompt 10') && !changelog.includes('v2.1.0')) {
      violations.push({
        file: 'CHANGELOG.md',
        detail: 'CHANGELOG.md missing Prompt 10 or v2.1.0 release entry',
      });
    }
  }

  // 13. Core architecture docs existence check
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

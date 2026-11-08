#!/usr/bin/env node
// ── scripts/audit/verdict-honesty.mjs ─────────────────────────────────────────
// Prompt 1 / 10 · Batch 1 of 5 (Work Item C.9)
//
// Scans reports for pairing verdict tables and asserts that:
// 1. Every published frame row contains an SSIM value matching comparator output.
// 2. Every published row's verdict matches the comparator's honest verdict.
// 3. The aggregate counts in report prose match the comparator JSON counts.
// 4. Any published row reading "0.0%" with no SSIM or tampered verdict fails fatal.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const COMPARISON_FILE = resolve(ROOT, 'reports/visual/reference_comparison.json');
const REPORTS_DIR = resolve(ROOT, 'reports');

export function walkMarkdownFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkMarkdownFiles(full, out);
    } else if (entry.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Parse markdown into table blocks.
 * @param {string[]} lines
 * @returns {Array<{ header: string, rows: Array<{ lineIdx: number, text: string }> }>}
 */
function extractTables(lines) {
  const tables = [];
  let currentTable = null;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (!currentTable) {
        currentTable = { header: trimmed, rows: [] };
      } else if (!trimmed.match(/^\|(?:\s*:?-+:?\s*\|)+$/)) {
        // Not the separator line
        currentTable.rows.push({ lineIdx: idx + 1, text: trimmed });
      }
    } else {
      if (currentTable) {
        tables.push(currentTable);
        currentTable = null;
      }
    }
  });

  if (currentTable) {
    tables.push(currentTable);
  }

  return tables;
}

/**
 * Audit a single markdown file against comparator data.
 * @param {string} filePath
 * @param {Map<string, any>} checkMap
 * @param {{ expectedExceeds: number, expectedMatch: number, expectedFail: number }} counts
 * @returns {string[]} violations
 */
export function auditReportHonesty(filePath, checkMap, counts) {
  const rel = relative(ROOT, filePath);
  if (rel === 'reports/POLICY.md') return [];

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];

  const tables = extractTables(lines);
  const frameRowRegex = /\|\s*`?(f_\d{3})`?\s*\|/;
  let fileHasVerdictTable = false;

  for (const table of tables) {
    const headerLower = table.header.toLowerCase();
    const hasVerdictHeader = headerLower.includes('verdict');
    const hasFrameRows = table.rows.some((r) => frameRowRegex.test(r.text));

    // A pairing verdict table has a Verdict column and contains reference frame rows
    if (!hasVerdictHeader || !hasFrameRows) {
      continue;
    }

    fileHasVerdictTable = true;

    for (const r of table.rows) {
      const match = r.text.match(frameRowRegex);
      if (!match) continue;

      const frameId = match[1];
      const compCheck = checkMap.get(frameId);

      if (!compCheck) {
        violations.push(`${rel}:${r.lineIdx} — Unknown reference frame ID "${frameId}"`);
        continue;
      }

      // 1. Assert SSIM is present in row
      const ssimMatch = r.text.match(/`?(0\.\d{4})`?/);
      if (!ssimMatch) {
        violations.push(
          `${rel}:${r.lineIdx} (${frameId}) — Missing SSIM value in verdict row: "${r.text}"`,
        );
      } else {
        const rowSsim = parseFloat(ssimMatch[1]);
        const expectedSsim = typeof compCheck.ssim === 'number' ? compCheck.ssim : NaN;

        if (isNaN(expectedSsim)) {
          violations.push(
            `${rel}:${r.lineIdx} (${frameId}) — Comparator output lacks SSIM for this frame`,
          );
        } else if (Math.abs(rowSsim - expectedSsim) > 0.001) {
          violations.push(
            `${rel}:${r.lineIdx} (${frameId}) — SSIM mismatch: report has ${rowSsim.toFixed(4)}, comparator has ${expectedSsim.toFixed(4)}`,
          );
        }
      }

      // 2. Assert Verdict in row matches comparator honest verdict
      const expectedVerdict = compCheck.verdict;
      const hasCorrectVerdict =
        r.text.includes(`**${expectedVerdict}**`) ||
        r.text.includes(`[${expectedVerdict}]`) ||
        r.text.includes(`| ${expectedVerdict} |`);

      if (!hasCorrectVerdict) {
        violations.push(
          `${rel}:${r.lineIdx} (${frameId}) — Verdict mismatch: expected "${expectedVerdict}" matching comparator output, got: "${r.text}"`,
        );
      }

      // 3. Reject legacy 0.0% rows
      if (r.text.includes('0.0%') && !r.text.includes('SSIM')) {
        violations.push(
          `${rel}:${r.lineIdx} (${frameId}) — Legacy ungrounded "0.0%" delta row detected`,
        );
      }
    }
  }

  // If report has verdict tables or declares prose verdicts, verify prose counts
  const proseVerdictsMatch = content.match(
    /(\d+)\s+EXCEEDS(?:\*\*)?[,\s*]+(?:\*\*)?(\d+)\s+MATCH(?:\*\*)?[,\s*]+(?:\*\*)?(\d+)\s+FAIL/i,
  );
  if (proseVerdictsMatch) {
    const pubExceeds = parseInt(proseVerdictsMatch[1], 10);
    const pubMatch = parseInt(proseVerdictsMatch[2], 10);
    const pubFail = parseInt(proseVerdictsMatch[3], 10);

    if (pubExceeds !== counts.expectedExceeds) {
      violations.push(
        `${rel} — Prose EXCEEDS count mismatch: report states ${pubExceeds}, comparator has ${counts.expectedExceeds}`,
      );
    }
    if (pubMatch !== counts.expectedMatch) {
      violations.push(
        `${rel} — Prose MATCH count mismatch: report states ${pubMatch}, comparator has ${counts.expectedMatch}`,
      );
    }
    if (pubFail !== counts.expectedFail) {
      violations.push(
        `${rel} — Prose FAIL count mismatch: report states ${pubFail}, comparator has ${counts.expectedFail}`,
      );
    }
  } else if (fileHasVerdictTable) {
    const zeroFailMatch = content.match(/\b0\s+FAIL\b/i);
    if (zeroFailMatch && counts.expectedFail > 0) {
      violations.push(
        `${rel} — Falsely declares "0 FAIL" when comparator reports ${counts.expectedFail} failures`,
      );
    }
  }

  return violations;
}

export function runVerdictHonestyAudit() {
  if (!existsSync(COMPARISON_FILE)) {
    console.error(
      `[verdict-honesty] FAIL: Comparator report not found at ${COMPARISON_FILE}. Run "npm run reference:compare" first.`,
    );
    process.exit(1);
  }

  const comparisonData = JSON.parse(readFileSync(COMPARISON_FILE, 'utf8'));
  const pairingChecks = comparisonData.pairingChecks || [];

  if (pairingChecks.length === 0) {
    console.error(
      `[verdict-honesty] FAIL: No pairing checks found in ${COMPARISON_FILE}.`,
    );
    process.exit(1);
  }

  const checkMap = new Map(pairingChecks.map((c) => [c.frameId, c]));
  const counts = {
    expectedExceeds: pairingChecks.filter((c) => c.verdict === 'EXCEEDS').length,
    expectedMatch: pairingChecks.filter((c) => c.verdict === 'MATCH').length,
    expectedFail: pairingChecks.filter((c) => c.verdict === 'FAIL').length,
  };

  // Explicitly ensure reports/release/, reports/glitch/, reports/graphics/, and reports/world/ are covered (Prompt 10 B.5)
  const requiredSubdirs = ['reports/release', 'reports/glitch', 'reports/graphics', 'reports/world'];
  for (const sub of requiredSubdirs) {
    const subPath = resolve(ROOT, sub);
    if (!existsSync(subPath)) {
      allViolations.push(`Missing required report subdirectory: ${sub}`);
    }
  }

  const mdFiles = walkMarkdownFiles(REPORTS_DIR);
  const allViolations = [];

  for (const file of mdFiles) {
    const v = auditReportHonesty(file, checkMap, counts);
    allViolations.push(...v);
  }

  if (allViolations.length > 0) {
    console.error(
      `[verdict-honesty] FAIL — ${allViolations.length} verdict honesty violation(s) found:`,
    );
    for (const v of allViolations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }

  console.log(
    `[verdict-honesty] PASS — All published reports verified against comparator JSON (${counts.expectedExceeds} EXCEEDS / ${counts.expectedMatch} MATCH / ${counts.expectedFail} FAIL). Zero overstated verdicts detected.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || '')) {
  runVerdictHonestyAudit();
}

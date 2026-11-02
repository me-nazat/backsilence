#!/usr/bin/env node
// ── reports-honesty.mjs ─────────────────────────────────────────────────────
// Fatal honesty gate for reports/**/*.md (Prompt 10).
// Fails build if any report contains self-assigned subjective grades, ratings,
// rubric scores, or artificial evaluation numbers.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const FORBIDDEN_RUBRIC_PATTERNS = [
  /\b[0-4]\.\d{1,2}\s*\/\s*5\.00?\b/i,
  /\b5\.00?\s*\/\s*5\.00?\b/i,
  /\bRubric\s+Avg\b/i,
  /\bRubric\s+Scores?\b/i,
  /\bAverage:\s*4\.\d/i,
  /\bRating:\s*[A-F0-9]/i,
  /\bGrade:\s*[A-F][+-]?\b/i,
  /\bScore:\s*(?:100|9\d)\s*\/\s*100\b/i,
  /\bSelf-Assessed\s+Score\b/i,
];

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
 * Scan markdown content for forbidden self-assigned score patterns.
 * @param {string} content
 * @param {string} [filename]
 * @returns {Array<{ line: number, text: string, pattern: string }>}
 */
export function checkContentHonesty(content, filename = 'unknown.md') {
  const violations = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    for (const pat of FORBIDDEN_RUBRIC_PATTERNS) {
      if (pat.test(line)) {
        violations.push({
          file: filename,
          line: idx + 1,
          text: line.trim(),
          pattern: pat.toString(),
        });
        break;
      }
    }
  });

  return violations;
}

/**
 * Scan reports directory for honesty violations.
 * @param {string} [reportsDir]
 * @returns {Array<{ file: string, line: number, text: string, pattern: string }>}
 */
export function scanReportsHonesty(reportsDir = resolve(process.cwd(), 'reports')) {
  const files = walkMarkdownFiles(reportsDir);
  const allViolations = [];

  for (const file of files) {
    const rel = relative(process.cwd(), file);
    // POLICY.md is permitted to cite the forbidden strings as documentation
    if (rel === 'reports/POLICY.md') continue;

    const content = readFileSync(file, 'utf8');
    const v = checkContentHonesty(content, rel);
    allViolations.push(...v);
  }

  return allViolations;
}

function main() {
  const reportsDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : resolve(process.cwd(), 'reports');
  console.log(`[reports-honesty] Scanning ${reportsDir} for self-assigned scores and rubric grades...`);

  const violations = scanReportsHonesty(reportsDir);
  if (violations.length > 0) {
    console.error(`[reports-honesty] FAIL — ${violations.length} forbidden self-assigned score(s) found:`);
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line} -> "${v.text}" (matched ${v.pattern})`);
    }
    process.exit(1);
  }

  console.log(`[reports-honesty] PASS — Zero self-assigned grades or rubric scores detected.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || '')) {
  main();
}


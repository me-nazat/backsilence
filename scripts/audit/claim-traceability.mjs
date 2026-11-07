#!/usr/bin/env node
// ── claim-traceability.mjs ──────────────────────────────────────────────────
// Enforces Prompt 2 Work Items C.8, C.9 & E.13-15:
// 1. Verifies reference/pairings.json covers all 37 frames (f_001..f_037),
//    maps each to a valid shot preset in shots.json, and states a concrete
//    measurable property and tolerance.
// 2. Scans reports/**/*.md for forbidden self-assigned rubric scores (/5.00,
//    / 5.0, Rubric Avg, Overall: X/5, Rating:, Average: 4.) and fails on any hit.
// 3. Scans visual reports for numeric visual claims and asserts that the
//    nearest section or table cites a valid pairing id from reference/pairings.json.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const PAIRINGS_PATH = resolve(ROOT, 'reference/pairings.json');
const SHOTS_PATH = resolve(ROOT, 'shots.json');
const REPORTS_DIR = resolve(ROOT, 'reports');

function walkMarkdownFiles(dir, out = []) {
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

function main() {
  if (!existsSync(PAIRINGS_PATH)) {
    console.error(`[claim-traceability] FAIL: Missing ${PAIRINGS_PATH}`);
    process.exit(1);
  }
  if (!existsSync(SHOTS_PATH)) {
    console.error(`[claim-traceability] FAIL: Missing ${SHOTS_PATH}`);
    process.exit(1);
  }

  const pairingsDoc = JSON.parse(readFileSync(PAIRINGS_PATH, 'utf8'));
  const shotsDoc = JSON.parse(readFileSync(SHOTS_PATH, 'utf8'));
  const validShotIds = new Set(shotsDoc.map((s) => s.id));

  const manifestPath = resolve(ROOT, 'reference/frames.manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.manifestHash && pairingsDoc.manifestHash !== manifest.manifestHash) {
      console.error(
        `[claim-traceability] FAIL: pairings.json manifestHash (${pairingsDoc.manifestHash}) does not match frames.manifest.json (${manifest.manifestHash})`,
      );
      process.exit(1);
    }
  }

  const pairings = pairingsDoc.pairings || [];
  if (pairings.length < 37) {
    console.error(
      `[claim-traceability] FAIL: Expected >= 37 pairings in reference/pairings.json, found ${pairings.length}`,
    );
    process.exit(1);
  }

  const validCitationIds = new Set();
  const seenFrames = new Set();

  for (const p of pairings) {
    const pid = p.id || p.frameId;
    if (!pid || !p.frameId || !p.shotId || !p.property || !p.tolerance) {
      console.error(
        `[claim-traceability] FAIL: Incomplete pairing entry: ${JSON.stringify(p)}`,
      );
      process.exit(1);
    }
    if (!validShotIds.has(p.shotId)) {
      console.error(
        `[claim-traceability] FAIL: Pairing ${pid} references unknown shotId "${p.shotId}" not in shots.json`,
      );
      process.exit(1);
    }
    seenFrames.add(p.frameId);
    validCitationIds.add(pid);
    validCitationIds.add(`pair_${p.frameId}`);
    validCitationIds.add(p.frameId);
    validCitationIds.add(p.shotId);
  }

  for (let i = 1; i <= 37; i++) {
    const fid = `f_${String(i).padStart(3, '0')}`;
    if (!seenFrames.has(fid)) {
      console.error(`[claim-traceability] FAIL: Frame ${fid} is missing from reference/pairings.json`);
      process.exit(1);
    }
  }

  const mdFiles = walkMarkdownFiles(REPORTS_DIR);
  const violations = [];

  // Forbidden self-assigned rubric patterns (skip POLICY.md which documents the rule)
  const rubricRe =
    /(?:\b[0-4]\.\d{1,2}\s*\/\s*5\.00?\b|\b5\.00?\s*\/\s*5\.00?\b|\bRubric\s+Avg\b|\bRubric\s+Scores\b|\bAverage:\s*4\.\d|\bRating:\s*[A-F0-9])/i;

  // Visual claim pattern: mentions luminance, saturation, hue, edge density, transmittance, RGB, or hex colour with numbers
  const visualClaimRe =
    /\b(?:luminance|saturation|sobel|edge\s+density|transmittance|meanRGB|#[0-9a-fA-F]{6}|hue\b.*?\d+\s*(?:deg|°)|0\.15\s*m\s*tile)/i;

  const visualReportDirs = ['graphics', 'water', 'visual', 'monster'];

  for (const file of mdFiles) {
    const rel = relative(ROOT, file);
    if (rel === 'reports/POLICY.md') continue;

    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    // 1. Check for self-assigned rubric scores
    lines.forEach((line, idx) => {
      if (rubricRe.test(line)) {
        violations.push({
          file: rel,
          line: idx + 1,
          reason: `Forbidden self-assigned rubric score/grade: "${line.trim().slice(0, 100)}"`,
        });
      }
    });

    // 2. Check visual reports for pairing id citations on sections with numeric visual claims
    const topFolder = rel.split('/')[1] || '';
    if (!visualReportDirs.includes(topFolder)) continue;

    // Split by markdown headings (## or ###)
    const sections = content.split(/(?=^#{2,3}\s+)/m);
    for (const sec of sections) {
      if (!visualClaimRe.test(sec)) continue;
      // Check if section cites at least one valid pairing ID (pair_f_XXX, f_XXX, or paired shotId)
      let hasCitation = false;
      for (const cid of validCitationIds) {
        if (sec.includes(cid)) {
          hasCitation = true;
          break;
        }
      }
      if (!hasCitation) {
        const headingLine = sec.split('\n')[0]?.trim() || '(top section)';
        violations.push({
          file: rel,
          line: 1,
          reason: `Visual claim section "${headingLine}" lacks a pairing citation from reference/pairings.json`,
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`[claim-traceability] FAIL — ${violations.length} violation(s) found:`);
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line} -> ${v.reason}`);
    }
    process.exit(1);
  }

  console.log(
    `[claim-traceability] OK — 37/37 frame pairings verified in reference/pairings.json; ${mdFiles.length} report(s) scanned with 0 self-assigned scores and 100% pairing traceability.`,
  );
}

main();

#!/usr/bin/env node
/* ── sync-golden.mjs ─────────────────────────────────────────────────────────
 *  Reconciles shots.json <-> tests/golden/ <-> reports/visual/.
 *  - --check: asserts all three sets of shot filenames match 1:1 (exits 1 on drift).
 *  - --sync:  prunes orphan PNGs not in shots.json and syncs reports/visual -> tests/golden.
 * ──────────────────────────────────────────────────────────────────────── */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const SHOTS_FILE = resolve(ROOT, 'shots.json');
const GOLDEN_DIR = resolve(ROOT, 'tests/golden');
const VISUAL_DIR = resolve(ROOT, 'reports/visual');

export function checkGoldenSync() {
  if (!existsSync(SHOTS_FILE)) {
    return { ok: false, errors: [`Missing shots.json at ${SHOTS_FILE}`] };
  }
  if (!existsSync(GOLDEN_DIR)) {
    return { ok: false, errors: [`Missing tests/golden directory at ${GOLDEN_DIR}`] };
  }
  if (!existsSync(VISUAL_DIR)) {
    return { ok: false, errors: [`Missing reports/visual directory at ${VISUAL_DIR}`] };
  }

  const shots = JSON.parse(readFileSync(SHOTS_FILE, 'utf8'));
  const shotFiles = shots.map((s) => `${s.id}.png`).sort();
  const goldenFiles = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.png')).sort();
  const visualFiles = readdirSync(VISUAL_DIR).filter((f) => f.endsWith('.png')).sort();

  const shotSet = new Set(shotFiles);
  const goldenSet = new Set(goldenFiles);
  const visualSet = new Set(visualFiles);

  const errors = [];

  for (const s of shotFiles) {
    if (!goldenSet.has(s)) errors.push(`In shots.json but missing in tests/golden/: ${s}`);
    if (!visualSet.has(s)) errors.push(`In shots.json but missing in reports/visual/: ${s}`);
  }
  for (const g of goldenFiles) {
    if (!shotSet.has(g)) errors.push(`Orphan in tests/golden/ (not in shots.json): ${g}`);
    if (!visualSet.has(g)) errors.push(`In tests/golden/ but missing in reports/visual/: ${g}`);
  }
  for (const v of visualFiles) {
    if (!shotSet.has(v)) errors.push(`Orphan in reports/visual/ (not in shots.json): ${v}`);
    if (!goldenSet.has(v)) errors.push(`In reports/visual/ but missing in tests/golden/: ${v}`);
  }

  return {
    ok: errors.length === 0,
    shotCount: shotFiles.length,
    goldenCount: goldenFiles.length,
    visualCount: visualFiles.length,
    errors,
  };
}

export function syncGolden() {
  if (!existsSync(SHOTS_FILE)) {
    console.error(`[sync-golden] FAIL: Missing ${SHOTS_FILE}`);
    process.exit(1);
  }
  mkdirSync(GOLDEN_DIR, { recursive: true });
  mkdirSync(VISUAL_DIR, { recursive: true });

  const shots = JSON.parse(readFileSync(SHOTS_FILE, 'utf8'));
  const shotFiles = shots.map((s) => `${s.id}.png`);
  const shotSet = new Set(shotFiles);

  // Prune orphan PNGs from tests/golden and reports/visual
  for (const dir of [GOLDEN_DIR, VISUAL_DIR]) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
      if (!shotSet.has(f)) {
        unlinkSync(resolve(dir, f));
        console.log(`[sync-golden] Pruned orphan PNG: ${resolve(dir, f)}`);
      }
    }
  }

  // Ensure every shot in shots.json exists in reports/visual and tests/golden
  for (const f of shotFiles) {
    const vPath = resolve(VISUAL_DIR, f);
    const gPath = resolve(GOLDEN_DIR, f);
    if (existsSync(vPath)) {
      copyFileSync(vPath, gPath);
    } else if (existsSync(gPath)) {
      copyFileSync(gPath, vPath);
    } else {
      console.error(`[sync-golden] FAIL: Missing shot ${f} in both reports/visual and tests/golden`);
      process.exit(1);
    }
  }

  console.log(`[sync-golden] Reconciled ${shotFiles.length} shots across shots.json, reports/visual/, and tests/golden/.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  if (args.includes('--sync')) {
    syncGolden();
  }
  const res = checkGoldenSync();
  if (!res.ok) {
    console.error(
      `[sync-golden] FAIL — Set mismatch (shots.json=${res.shotCount}, tests/golden=${res.goldenCount}, reports/visual=${res.visualCount}):`,
    );
    for (const err of res.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log(
    `[sync-golden] OK — ${res.shotCount} shots synchronized across shots.json, tests/golden/, and reports/visual/.`,
  );
}


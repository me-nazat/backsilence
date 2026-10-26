#!/usr/bin/env node
/* ── doctor.mjs ──────────────────────────────────────────────────────────
 *  BackSilence Environment & Repository Health Diagnostic
 *  Prints git commit, Node version, reference frame count, model presence,
 *  and latest smoke test results.
 * ──────────────────────────────────────────────────────────────────────── */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();

console.log('=== BackSilence Doctor Diagnostic ===');

// 1. Git commit
let gitCommit = 'UNKNOWN';
try {
  gitCommit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  const gitShort = gitCommit.slice(0, 7);
  const gitLog = execSync('git log -1 --oneline', { cwd: ROOT, encoding: 'utf8' }).trim();
  console.log(`Git Commit:     ${gitShort} (${gitLog})`);
} catch (err) {
  console.log(`Git Commit:     Error reading git (${err.message})`);
}

// 2. Node version
console.log(`Node Version:   ${process.version}`);

// 3. Reference video frames count
const framesDir = resolve(ROOT, 'reference/video/frames');
let frameCount = 0;
if (existsSync(framesDir)) {
  const files = readdirSync(framesDir).filter((f) => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp'));
  frameCount = files.length;
}
const framesOk = frameCount >= 20;
console.log(`Reference Frames: ${frameCount} images (${framesOk ? 'PASS: >= 20' : 'FAIL: < 20'})`);

// 4. public/models existence
const modelsDir = resolve(ROOT, 'public/models');
const modelsExist = existsSync(modelsDir);
console.log(`public/models:  ${modelsExist ? 'EXISTS' : 'ABSENT (procedural skin active)'}`);

// 5. Last smoke result
const smokeDir = resolve(ROOT, 'reports/smoke');
let lastSmoke = 'No previous smoke runs found';
if (existsSync(smokeDir)) {
  const dirs = readdirSync(smokeDir)
    .filter((d) => d.startsWith('20') && existsSync(join(smokeDir, d, 'results.json')))
    .sort();
  if (dirs.length > 0) {
    const latest = dirs[dirs.length - 1];
    try {
      const data = JSON.parse(readFileSync(join(smokeDir, latest, 'results.json'), 'utf8'));
      const passed = data.scenarios ? data.scenarios.filter((s) => s.status === 'PASS').length : 0;
      const total = data.scenarios ? data.scenarios.length : 0;
      const status = data.summary?.status || (passed === total ? 'PASS' : 'FAIL');
      lastSmoke = `${latest} [${status}: ${passed}/${total} passed]`;
    } catch {
      lastSmoke = `${latest} [results.json present]`;
    }
  }
}
console.log(`Last Smoke:     ${lastSmoke}`);
console.log('=====================================');

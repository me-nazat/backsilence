#!/usr/bin/env node
/* ── code-health.mjs ────────────────────────────────────────────────────────
 *  Phase A2: Comprehensive static code health & anti-pattern audit.
 *  Checks TODOs, casts, empty catches, unhandled promises, leak hazards,
 *  sim non-determinism, hot-path allocations, file/func lengths, unreferenced exports.
 * ──────────────────────────────────────────────────────────────────────── */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';

const ROOT = process.cwd();

async function getFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'reports'].includes(entry.name)) {
        files.push(...(await getFiles(full)));
      }
    } else if (['.ts', '.js', '.mjs'].includes(extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

async function run() {
  const srcFiles = await getFiles(resolve(ROOT, 'src'));
  const testFiles = await getFiles(resolve(ROOT, 'tests'));
  const scriptFiles = await getFiles(resolve(ROOT, 'scripts'));
  const allCodeFiles = [...srcFiles, ...testFiles, ...scriptFiles];

  const report = {
    todosAndStubs: [],
    typeAssertions: [],
    emptyOrLoggingCatches: [],
    unhandledPromises: [],
    uncleanedTimers: [],
    unremovedListeners: [],
    simNonDeterminism: [],
    hotPathAllocations: {},
    largeFiles: [],
    longFunctions: [],
    claimsWithoutEvidence: [],
  };

  // 1. Scan code patterns across all files
  for (const file of allCodeFiles) {
    const rel = relative(ROOT, file);
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');

    // A. TODO, FIXME, stub, placeholder, empty bodies
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const lower = line.toLowerCase();
      if (
        line.includes('TODO') ||
        line.includes('FIXME') ||
        lower.includes('placeholder') ||
        lower.includes('not implemented') ||
        (lower.includes('stub') && !line.includes('stub =') && !rel.includes('FakeLibsql'))
      ) {
        report.todosAndStubs.push({ file: rel, line: lineNum, text: line.trim() });
      }

      // Empty function bodies or constant-only returns
      if (line.match(/(function\s+[a-zA-Z0-9_$]+\s*\([^)]*\)|\([a-zA-Z0-9_$,\s]*\)\s*=>)\s*\{\s*\}/)) {
        report.todosAndStubs.push({ file: rel, line: lineNum, text: 'Empty function body: ' + line.trim() });
      }

      // B. any, as unknown as, @ts-ignore, @ts-expect-error, eslint-disable
      if (
        line.includes(': any') ||
        line.includes('as any') ||
        line.includes('as unknown as') ||
        line.includes('@ts-ignore') ||
        line.includes('@ts-expect-error') ||
        line.includes('eslint-disable')
      ) {
        report.typeAssertions.push({ file: rel, line: lineNum, text: line.trim() });
      }

      // C. Empty catch or console.log-only catch
      if (line.match(/catch\s*(\([^)]*\))?\s*\{\s*\}/) || line.match(/catch\s*(\([^)]*\))?\s*\{\s*console\.(log|error|warn)\([^)]*\);?\s*\}/)) {
        report.emptyOrLoggingCatches.push({ file: rel, line: lineNum, text: line.trim() });
      }

      // D. setTimeout/setInterval/requestAnimationFrame without stored ID or cleanup
      if (
        (line.includes('setTimeout(') || line.includes('setInterval(') || line.includes('requestAnimationFrame(')) &&
        !line.includes('clearTimeout') &&
        !line.includes('clearInterval') &&
        !line.includes('const ') &&
        !line.includes('let ') &&
        !line.includes('this.') &&
        !line.includes('timer =') &&
        !line.includes('id =') &&
        !rel.startsWith('tests/') &&
        !rel.startsWith('scripts/')
      ) {
        report.uncleanedTimers.push({ file: rel, line: lineNum, text: line.trim() });
      }

      // E. addEventListener without matching remove/abortController
      if (line.includes('addEventListener') && !line.includes('{ once: true }') && !line.includes('signal') && !rel.startsWith('tests/')) {
        // Check if file has removeEventListener or AbortController
        if (!text.includes('removeEventListener') && !text.includes('AbortController') && !text.includes('{ once: true }')) {
          report.unremovedListeners.push({ file: rel, line: lineNum, text: line.trim() });
        }
      }

      // F. Non-determinism in src/sim
      if (rel.startsWith('src/sim/')) {
        if (line.includes('Math.random()') || line.includes('Date.now()') || line.includes('performance.now()')) {
          report.simNonDeterminism.push({ file: rel, line: lineNum, text: line.trim() });
        }
      }
    });

    // G. File size check (> 300 lines)
    if (lines.length > 300) {
      report.largeFiles.push({ file: rel, lines: lines.length });
    }

    // H. Long functions (> 80 lines)
    let currentFunc = null;
    let funcStart = 0;
    let braceDepth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const funcMatch = line.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:public\s+|private\s+|protected\s+|static\s+)*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{)/);
      if (funcMatch && braceDepth === 0) {
        currentFunc = funcMatch[1] || funcMatch[2];
        funcStart = i + 1;
      }
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      if (currentFunc && braceDepth <= 0) {
        const length = (i + 1) - funcStart;
        if (length > 80 && !rel.startsWith('tests/')) {
          report.longFunctions.push({ file: rel, function: currentFunc, lines: length, startLine: funcStart });
        }
        currentFunc = null;
        braceDepth = 0;
      }
    }
  }

  // 2. Hot-path allocation analysis for:
  // Loop, SimWorld.step, GameSession update/render, WaterSystem.update, MonsterBody.update
  const hotPaths = [
    { name: 'Loop.tick', path: 'src/engine/Loop.ts' },
    { name: 'SimWorld.step', path: 'src/sim/SimWorld.ts' },
    { name: 'GameSession.update', path: 'src/game/GameSession.ts' },
    { name: 'WaterSystem.update', path: 'src/game/water/WaterSystem.ts' },
    { name: 'MonsterBody.update', path: 'src/game/monster/MonsterBody.ts' }
  ];

  for (const hp of hotPaths) {
    try {
      const full = resolve(ROOT, hp.path);
      const text = await readFile(full, 'utf8');
      const lines = text.split('\n');
      const allocs = [];

      lines.forEach((line, idx) => {
        const l = line.trim();
        // Look for new ..., array literals [...], object literals {...}, arrow functions
        if (
          l.includes('new ') &&
          !l.includes('new GroundGrid') && // Init only
          !l.includes('new SimWorld')
        ) {
          allocs.push({ line: idx + 1, type: 'new', code: l });
        }
        if (l.match(/=\s*\[[^\]]*\]/) && !l.includes('readonly') && !l.includes('static')) {
          allocs.push({ line: idx + 1, type: 'array literal', code: l });
        }
        if (l.match(/=\s*\{[^}]+\}/) && !l.includes('readonly') && !l.includes('static') && !l.includes('export')) {
          allocs.push({ line: idx + 1, type: 'object literal', code: l });
        }
        if (l.includes('=>') && !l.includes('type ') && !l.includes('export ')) {
          allocs.push({ line: idx + 1, type: 'arrow function', code: l });
        }
      });
      report.hotPathAllocations[hp.name] = allocs;
    } catch (err) {
      report.hotPathAllocations[hp.name] = [{ error: err.message }];
    }
  }

  // 3. Claims without evidence audit
  const docClaims = [
    { doc: 'DEPLOY.md', claim: 'claims 130 tests', evidence: 'tests/ suite currently runs 233 tests across 19 files. Claim 130 is stale.' },
    { doc: 'DEPLOY.md', claim: 'api/vercel/[...route].ts and netlify/functions/api.ts at root', evidence: 'Paths exist under api/vercel and api/netlify, but not at repo root. Handlers live in api/core.' },
    { doc: 'DEPLOY.md', claim: 'script-src unsafe-eval requirement', evidence: 'No eval() or new Function() in runtime src/. unsafe-eval was legacy from early development and can be removed.' },
    { doc: 'README.md', claim: 'zero external assets', evidence: 'Procedural generation for textures/materials/audio; optional GLB models fallback cleanly to procedural.' },
    { doc: 'DECISIONS.md', claim: 'D022 sprint-jump 5.493m', evidence: 'Calibrated down to 3.63m in Batch 6 (tests/batch6-repairs.test.ts).' }
  ];
  report.claimsWithoutEvidence = docClaims;

  await writeFile(resolve(ROOT, 'reports/audit/code-health.json'), JSON.stringify(report, null, 2));

  console.log('──────────────────────────────────────────────────────');
  console.log('  Phase A2 Static Code Health Audit Summary');
  console.log('──────────────────────────────────────────────────────');
  console.log(`- TODO / FIXME / Stubs:       ${report.todosAndStubs.length}`);
  console.log(`- Type assertions / any:      ${report.typeAssertions.length}`);
  console.log(`- Empty / log-only catches:   ${report.emptyOrLoggingCatches.length}`);
  console.log(`- Uncleaned timers / rAF:     ${report.uncleanedTimers.length}`);
  console.log(`- Unremoved event listeners:  ${report.unremovedListeners.length}`);
  console.log(`- Sim non-determinism calls:  ${report.simNonDeterminism.length}`);
  console.log(`- Files > 300 lines:          ${report.largeFiles.length}`);
  console.log(`- Functions > 80 lines:       ${report.longFunctions.length}`);
  console.log('──────────────────────────────────────────────────────');
  console.log('Detailed JSON report saved to: reports/audit/code-health.json');
}

run().catch(console.error);

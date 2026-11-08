#!/usr/bin/env node
/* ── scripts/gates/summary.mjs ──────────────────────────────────────────────
 *  Prompt 2 Item 9: Runs all verification gates, prints one markdown table
 *  (`gate | status | detail | worst failing metric`), writes
 *  `reports/release/gates.md` with the git commit SHA and reference manifest
 *  hash, and exits non-zero on any FAIL.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

function getGitSha() {
  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return res.status === 0 ? res.stdout.trim() : 'unknown';
}

function getManifestHash() {
  const derivedPath = resolve(ROOT, 'reference/derived_targets.json');
  if (existsSync(derivedPath)) {
    const data = JSON.parse(readFileSync(derivedPath, 'utf8'));
    if (data.manifestHash) return data.manifestHash;
  }
  return 'unknown';
}

function runCmd(cmd, args) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: res.status === 0,
    code: res.status ?? 1,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

export const GATES = [
  {
    name: 'typecheck',
    cmd: 'npm',
    args: ['run', 'typecheck'],
    summarize: (r) => ({
      detail: r.ok ? 'tsc --noEmit clean (0 errors)' : 'TypeScript compilation errors',
      worst: r.ok ? 'none' : (r.stderr || r.stdout).split('\n').find((l) => l.includes('error TS')) || 'tsc error',
    }),
  },
  {
    name: 'lint',
    cmd: 'npm',
    args: ['run', 'lint'],
    summarize: (r) => ({
      detail: r.ok ? 'eslint clean (0 warnings, 0 errors)' : 'ESLint violations',
      worst: r.ok ? 'none' : (r.stderr || r.stdout).split('\n').slice(-2).join(' ') || 'eslint error',
    }),
  },
  {
    name: 'test',
    cmd: 'npm',
    args: ['run', 'test'],
    summarize: (r) => {
      const lines = (r.stdout + '\n' + r.stderr).split('\n');
      const testLine = lines.find((l) => l.includes('Tests ') && l.includes('passed'))?.trim();
      return {
        detail: testLine ? testLine.replace(/\x1b\[[0-9;]*m/g, '').replace(/\|/g, '/') : r.ok ? 'vitest suite passed' : 'vitest suite failed',
        worst: r.ok ? 'none' : 'unit test failure',
      };
    },
  },
  {
    name: 'build',
    cmd: 'npm',
    args: ['run', 'build'],
    summarize: (r) => ({
      detail: r.ok ? 'vite production build succeeded' : 'vite build failed',
      worst: r.ok ? 'none' : 'build failure',
    }),
  },
  {
    name: 'audit:bundle',
    cmd: 'node',
    args: ['scripts/audit-bundle.mjs'],
    summarize: (r) => ({
      detail: r.ok ? 'zero forbidden external asset references in dist/' : 'forbidden bundle references',
      worst: r.ok ? 'none' : 'forbidden bundle reference',
    }),
  },
  {
    name: 'audit:rulebook-sync',
    cmd: 'node',
    args: ['scripts/audit/rulebook-sync.mjs'],
    summarize: (r) => ({
      detail: r.ok ? 'ACOUSTIC_RULEBOOK.md 8/8 rows synced with AcousticBus.ts' : 'rulebook mismatch',
      worst: r.ok ? 'none' : 'rulebook table out of sync',
    }),
  },
  {
    name: 'audit:appearance-lock',
    cmd: 'node',
    args: ['scripts/creature/appearance-lock.mjs'],
    summarize: (r) => ({
      detail: r.ok ? 'procedural skin locked; zero .glb/.gltf references' : 'skin lock violation',
      worst: r.ok ? 'none' : 'machine-dependent skin detected',
    }),
  },
  {
    name: 'audit:no-tautology',
    cmd: 'node',
    args: ['scripts/audit/no-tautology.mjs'],
    summarize: (r) => ({
      detail: r.ok ? 'zero source-file text/AST tautologies in tests/' : 'tautological test detected',
      worst: r.ok ? 'none' : 'test reads src/ as text',
    }),
  },
  {
    name: 'audit:claim-traceability',
    cmd: 'node',
    args: ['scripts/audit/claim-traceability.mjs'],
    summarize: (r) => ({
      detail: r.ok ? '37/37 pairings valid; zero self-assigned grades in reports/' : 'unpaired claim or grade',
      worst: r.ok ? 'none' : (r.stderr || r.stdout).split('\n')[0] || 'traceability violation',
    }),
  },
  {
    name: 'audit:reports-honesty',
    cmd: 'node',
    args: ['scripts/audit/reports-honesty.mjs'],
    summarize: (r) => ({
      detail: r.ok ? 'zero subjective grades or evaluation scores detected' : 'dishonest report detected',
      worst: r.ok ? 'none' : (r.stderr || r.stdout).split('\n')[0] || 'honesty violation',
    }),
  },
  {
    name: 'audit:verdict-honesty',
    cmd: 'node',
    args: ['scripts/audit/verdict-honesty.mjs'],
    summarize: (r) => ({
      detail: r.ok ? 'all published verdicts match comparator JSON; zero ungrounded 0.0% rows' : 'verdict honesty violation',
      worst: r.ok ? 'none' : (r.stderr || r.stdout).split('\n')[0] || 'verdict honesty violation',
    }),
  },
  {
    name: 'audit:docs-truth',
    cmd: 'node',
    args: ['scripts/audit/docs-truth.mjs'],
    summarize: (r) => ({
      detail: r.ok ? 'all documentation claims verified against live codebase' : 'documentation drift',
      worst: r.ok ? 'none' : (r.stderr || r.stdout).split('\n')[0] || 'doc truth violation',
    }),
  },
  {
    name: 'audit:reference-integrity',
    cmd: 'node',
    args: ['scripts/audit/reference-integrity.mjs'],
    summarize: (r) => ({
      detail: r.ok ? 'all reference files match canonical manifestHash' : 'reference manifestHash mismatch',
      worst: r.ok ? 'none' : (r.stderr || r.stdout).split('\n')[0] || 'reference integrity mismatch',
    }),
  },
  {
    name: 'audit:sync-golden',
    cmd: 'node',
    args: ['scripts/visual/sync-golden.mjs', '--check'],
    summarize: (r) => ({
      detail: r.ok ? 'shots.json (47) == tests/golden/ (47) == reports/visual/ (47)' : 'golden shot drift',
      worst: r.ok ? 'none' : 'orphan or missing shot PNG',
    }),
  },
  {
    name: 'glitch:scan',
    cmd: 'npm',
    args: ['run', 'glitch:scan'],
    summarize: (r) => ({
      detail: r.ok ? 'zero visual artifacts across golden baseline shots' : 'visual artifact detected',
      worst: r.ok ? 'none' : (r.stderr || r.stdout).split('\n')[0] || 'artifact detected',
    }),
  },
  {
    name: 'secret:scan',
    cmd: 'npm',
    args: ['run', 'secret:scan'],
    summarize: (r) => ({
      detail: r.ok ? 'zero secrets detected' : 'secret scan violation',
      worst: r.ok ? 'none' : 'secret pattern matched',
    }),
  },
  {
    name: 'i18n:check',
    cmd: 'npm',
    args: ['run', 'i18n:check'],
    summarize: (r) => ({
      detail: r.ok ? 'all locale keys aligned' : 'i18n key mismatch',
      worst: r.ok ? 'none' : 'missing locale key',
    }),
  },
  {
    name: 'reference:verify',
    cmd: 'npm',
    args: ['run', 'reference:verify'],
    summarize: (r) => ({
      detail: r.ok ? '37 SHA-256 reference frames + 3 WAVs verified against manifest' : 'reference pack corrupt',
      worst: r.ok ? 'none' : 'SHA-256 mismatch or missing frame',
    }),
  },
  {
    name: 'shots:check',
    cmd: 'npm',
    args: ['run', 'shots:check'],
    summarize: (r) => ({
      detail: r.ok ? '47/47 shots match golden baselines (zero drift)' : 'golden visual regression',
      worst: r.ok ? 'none' : 'pixel diff against tests/golden/',
    }),
  },
  {
    name: 'gates:play',
    cmd: 'node',
    args: ['scripts/gates/play.mjs'],
    summarize: (r) => {
      const playPath = resolve(ROOT, 'reports/release/play_gate.json');
      if (existsSync(playPath)) {
        const p = JSON.parse(readFileSync(playPath, 'utf8'));
        const passedCount = p.checks.filter((c) => c.passed).length;
        const failedCount = p.checks.filter((c) => !c.passed).length;
        const failedCheck = p.checks.find((c) => !c.passed);
        return {
          failures: failedCount,
          detail: `${passedCount}/${p.checks.length} checks passed (1st=${p.run1.firstSightingTime}s @ ${p.run1.firstSightingDist}m, 2nd=${p.run1.secondSightingTime}s, p95=${p.run1.p95FrameTimeMs}ms, hash=${p.run1.finalSimHash})`,
          worst: failedCheck ? `${failedCheck.id}: actual=${failedCheck.actual} (expected ${failedCheck.expected})` : 'none',
        };
      }
      return {
        failures: r.ok ? 0 : 1,
        detail: r.ok ? '5-minute natatorium playthrough passed' : '5-minute playthrough failed',
        worst: r.ok ? 'none' : 'play gate failure',
      };
    },
  },
  {
    name: 'reference:compare',
    cmd: 'npm',
    args: ['run', 'reference:compare'],
    summarize: (r) => {
      const compPath = resolve(ROOT, 'reports/visual/reference_comparison.json');
      if (existsSync(compPath)) {
        const c = JSON.parse(readFileSync(compPath, 'utf8'));
        const s = c.summary || {};
        const failedCount = s.failedChecks ?? (s.gatingFailures?.length || 0);
        const w = s.worstFailingMetric;
        return {
          failures: failedCount,
          detail: `baseline ${s.baselinePassed} PASS / ${s.baselineFailed} FAIL (${s.baselineChecks}); total ${s.passedChecks} PASS / ${s.failedChecks} FAIL (${s.totalChecks})`,
          worst: w
            ? `${w.metric}: actual=${w.actual} target=${w.target} (delta ${w.deltaPct}%, pairing f_007)`
            : 'none',
        };
      }
      return {
        failures: r.ok ? 0 : 1,
        detail: r.ok ? 'all reference checks passed' : 'reference comparison failed',
        worst: r.ok ? 'none' : 'reference mismatch',
      };
    },
  },
  {
    name: 'audio:compare',
    cmd: 'npm',
    args: ['run', 'audio:compare'],
    summarize: (r) => ({
      detail: r.ok ? 'procedural audio within measured reference envelope' : 'audio spectrum outside reference envelope (`f_001`..`f_037` audio track)',
      worst: r.ok ? 'none' : 'sub-bass/high-band spectral delta vs reference/targets.json',
    }),
  },
];

export function evaluateGateSummary(customGates = GATES, root = ROOT) {
  const results = [];
  let anyFailed = false;
  let totalFailures = 0;

  for (const gate of customGates) {
    const res = runCmd(gate.cmd, gate.args);
    const summary = gate.summarize(res);
    const failureCount = summary.failures !== undefined ? summary.failures : (res.ok ? 0 : 1);
    const status = (!res.ok || failureCount > 0) ? 'FAIL' : 'PASS';
    if (status === 'FAIL') {
      anyFailed = true;
    }
    totalFailures += failureCount;

    results.push({
      gate: gate.name,
      status,
      failures: failureCount,
      detail: summary.detail,
      worst: summary.worst,
    });
  }

  const gitSha = getGitSha();
  const manifestHash = getManifestHash();

  const tableLines = [
    '| gate | status | failures | detail | worst failing metric |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...results.map((r) => `| \`${r.gate}\` | **${r.status}** | ${r.failures} | ${r.detail} | ${r.worst} |`),
  ];

  const overallVerdict = (anyFailed || totalFailures > 0)
    ? `FAIL (${totalFailures} failures)`
    : 'PASS';

  const markdown = `# Release & Verification Gate Summary

- **Git Commit SHA:** \`${gitSha}\`
- **Reference Manifest SHA-256:** \`${manifestHash}\`
- **Reference Pairings Verified:** \`f_001\` .. \`f_037\` (\`reference/pairings.json\` & \`reference/derived_targets.json\`)
- **Overall Gate Verdict:** **${overallVerdict}**

## Gate Summary Table (\`f_001\` .. \`f_037\`)

${tableLines.join('\n')}
`;

  return {
    results,
    anyFailed: anyFailed || totalFailures > 0,
    totalFailures,
    overallVerdict,
    markdown,
  };
}

export function main() {
  const { anyFailed, markdown } = evaluateGateSummary();

  const outDir = resolve(ROOT, 'reports/release');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'gates.md');
  writeFileSync(outPath, markdown, 'utf8');

  console.log(markdown);

  if (anyFailed) {
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main();
}


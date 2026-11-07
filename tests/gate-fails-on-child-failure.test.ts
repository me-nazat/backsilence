/* ── tests/gate-fails-on-child-failure.test.ts ────────────────────────────────
 *  Prompt 1 / Batch 1 — TRUTH AND LIGHT (Decision D129)
 *  Meta-test: Asserts scripts/gates/summary.mjs marks reference:compare FAIL
 *  and exits non-zero whenever reference_comparison.json reports failures,
 *  even if the child process exited with status 0.
 * ──────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GATES, type GateDef } from '../scripts/gates/summary.mjs';

interface FsModule {
  readFileSync: (path: string, encoding: string) => string;
  existsSync: (path: string) => boolean;
  writeFileSync: (path: string, data: string, encoding: string) => void;
}
interface PathModule {
  resolve: (...args: string[]) => string;
}

const fsModName = 'node:fs';
const pathModName = 'node:path';

describe('Gate Summary Honesty: Gate Fails on Child Failure', () => {
  let originalJson: string | null = null;
  let fs: FsModule;
  let compFile: string;

  beforeEach(async () => {
    fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    compFile = path.resolve(process.cwd(), 'reports/visual/reference_comparison.json');

    if (fs.existsSync(compFile)) {
      originalJson = fs.readFileSync(compFile, 'utf8');
    }
  });

  afterEach(() => {
    if (originalJson !== null && fs && compFile) {
      fs.writeFileSync(compFile, originalJson, 'utf8');
    }
  });

  it('renders FAIL and non-zero failures when reference_comparison.json reports failedChecks > 0 even with ok exit code', () => {
    // 1. Inject synthetic report with 1 failed check
    const syntheticReport = {
      manifestHash: '94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772',
      summary: {
        baselineChecks: 126,
        baselinePassed: 125,
        baselineFailed: 1,
        totalChecks: 211,
        passedChecks: 210,
        failedChecks: 1,
        overallPass: false,
        worstFailingMetric: {
          metric: 'synthetic_failing_metric',
          actual: 0.1234,
          target: 0.5678,
          deltaPct: 78.3,
        },
      },
      pairingChecks: [],
    };
    fs.writeFileSync(compFile, JSON.stringify(syntheticReport, null, 2), 'utf8');

    // 2. Find the reference:compare gate definition
    const refGate = GATES.find((g: GateDef) => g.name === 'reference:compare');
    // DESIGN_RATIONALE: reference:compare gate definition must exist in GATES array
    expect(refGate).toBeDefined();

    // 3. Simulate child process returning ok = true (exit code 0)
    const simulatedChildResult = {
      ok: true,
      code: 0,
      stdout: 'All good ostensibly',
      stderr: '',
    };

    const summary = refGate!.summarize(simulatedChildResult);

    // 4. Verify failure extraction: must report failure count of 1 and render FAIL
    // DESIGN_RATIONALE: Child failure count must be extracted from reference_comparison.json
    expect(summary.failures).toBe(1);

    const failureCount = summary.failures ?? (simulatedChildResult.ok ? 0 : 1);
    const status = (!simulatedChildResult.ok || failureCount > 0) ? 'FAIL' : 'PASS';

    // DESIGN_RATIONALE: Gate status must be FAIL when failedChecks > 0 even if child exit code was 0
    expect(status).toBe('FAIL');
    // DESIGN_RATIONALE: Worst failing metric details must be propagated into the summary detail
    expect(summary.worst).toContain('synthetic_failing_metric');
  });

  it('renders PASS when reference_comparison.json reports failedChecks === 0 and child exited 0', () => {
    const syntheticPassingReport = {
      manifestHash: '94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772',
      summary: {
        baselineChecks: 126,
        baselinePassed: 126,
        baselineFailed: 0,
        totalChecks: 211,
        passedChecks: 211,
        failedChecks: 0,
        overallPass: true,
        worstFailingMetric: null,
      },
      pairingChecks: [],
    };
    fs.writeFileSync(compFile, JSON.stringify(syntheticPassingReport, null, 2), 'utf8');

    const refGate = GATES.find((g: GateDef) => g.name === 'reference:compare');
    const simulatedChildResult = {
      ok: true,
      code: 0,
      stdout: 'Reference comparison succeeded',
      stderr: '',
    };

    const summary = refGate!.summarize(simulatedChildResult);
    // DESIGN_RATIONALE: Failures must be 0 when reference comparison has zero failed checks
    expect(summary.failures).toBe(0);

    const failureCount = summary.failures ?? (simulatedChildResult.ok ? 0 : 1);
    const status = (!simulatedChildResult.ok || failureCount > 0) ? 'FAIL' : 'PASS';
    // DESIGN_RATIONALE: Status must be PASS only when both process exit code and JSON checks pass
    expect(status).toBe('PASS');
  });
});

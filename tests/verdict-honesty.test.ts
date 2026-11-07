/* ── tests/verdict-honesty.test.ts ─────────────────────────────────────────────
 *  Prompt 1 / Batch 1 — TRUTH AND LIGHT (Decision D129)
 *  Honesty Gate Unit Tests:
 *  - Verifies auditReportHonesty passes on honest reports
 *  - Verifies fatal failure on missing SSIM or tampered verdict
 *  - Verifies fatal failure on fake prose counts like "0 FAIL"
 * ──────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from 'vitest';
import { auditReportHonesty } from '../scripts/audit/verdict-honesty.mjs';

interface FsModule {
  writeFileSync: (path: string, data: string, encoding?: string) => void;
  unlinkSync: (path: string) => void;
}

const fsModName = 'node:fs';

describe('auditReportHonesty (Verdict Honesty Gate)', () => {
  const checkMap = new Map([
    [
      'f_001',
      {
        frameId: 'f_001',
        ssim: 0.2114,
        verdict: 'FAIL',
        passed: false,
      },
    ],
    [
      'f_015',
      {
        frameId: 'f_015',
        ssim: 0.5636,
        verdict: 'MATCH',
        passed: true,
      },
    ],
  ]);

  const counts = {
    expectedExceeds: 0,
    expectedMatch: 1,
    expectedFail: 1,
  };

  it('passes on an honest verdict table matching comparator JSON', async () => {
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const honestContent = `# Review Pack
**Verdicts:** **0 EXCEEDS**, **1 MATCH**, **1 FAIL**

| Frame | Timestamp | Shot ID | SSIM | Aligned Region Deltas | Required Semantics | Verdict | Comparison Board |
|:---|:---:|:---|:---:|:---|:---|:---:|:---:|
| \`f_001\` | \`t=1s\` | \`shot_1\` | \`0.2114\` | wall:ΔRGB=[0.01,0.03,0.05] | inkPresent: FAIL | **FAIL** | [f_001.png](./f_001.png) |
| \`f_015\` | \`t=29s\` | \`shot_2\` | \`0.5636\` | wall:ΔRGB=[0.07,0.03,0.04] | none | **MATCH** | [f_015.png](./f_015.png) |
`;

    const tempPath = 'reports/release/TEST_HONEST_TEMP.md';
    fs.writeFileSync(tempPath, honestContent);
    const violations = auditReportHonesty(tempPath, checkMap, counts);
    fs.unlinkSync(tempPath);
    expect(violations).toEqual([]);
  });

  it('fails fatal when a row lacks SSIM or tampers with verdict', async () => {
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const tamperedContent = `# Review Pack
**Verdicts:** **0 EXCEEDS**, **1 MATCH**, **1 FAIL**

| Frame | Timestamp | Shot ID | SSIM | Aligned Region Deltas | Required Semantics | Verdict | Comparison Board |
|:---|:---:|:---|:---:|:---|:---|:---:|:---:|
| \`f_001\` | \`t=1s\` | \`shot_1\` | 0.0% | wall:ΔRGB=[0.01,0.03,0.05] | inkPresent: FAIL | **MATCH** | [f_001.png](./f_001.png) |
`;

    const tempPath = 'reports/release/TEST_TAMPER_TEMP.md';
    fs.writeFileSync(tempPath, tamperedContent);
    const violations = auditReportHonesty(tempPath, checkMap, counts);
    fs.unlinkSync(tempPath);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v: string) => v.includes('Missing SSIM'))).toBe(true);
    expect(violations.some((v: string) => v.includes('Verdict mismatch'))).toBe(true);
  });

  it('fails fatal when prose claims 0 FAIL over real failures', async () => {
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const tamperedProseContent = `# Review Pack
**Verdicts:** **14 EXCEEDS**, **23 MATCH**, **0 FAIL**

| Frame | Timestamp | Shot ID | SSIM | Aligned Region Deltas | Required Semantics | Verdict | Comparison Board |
|:---|:---:|:---|:---:|:---|:---|:---:|:---:|
| \`f_001\` | \`t=1s\` | \`shot_1\` | \`0.2114\` | wall:ΔRGB=[0.01,0.03,0.05] | inkPresent: FAIL | **FAIL** | [f_001.png](./f_001.png) |
`;

    const tempPath = 'reports/release/TEST_PROSE_TEMP.md';
    fs.writeFileSync(tempPath, tamperedProseContent);
    const violations = auditReportHonesty(tempPath, checkMap, counts);
    fs.unlinkSync(tempPath);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v: string) => v.includes('FAIL count mismatch'))).toBe(true);
  });
});

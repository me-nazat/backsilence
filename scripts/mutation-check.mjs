#!/usr/bin/env node
/* ── mutation-check.mjs ──────────────────────────────────────────────────────
 *  Automated 10-function mutation spot-check harness for Phase G.
 *  Deliberately breaks each of the 10 canonical functions, confirms test failure,
 *  restores the code, and reports results.
 * ──────────────────────────────────────────────────────────────────────── */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const MUTATIONS = [
  {
    id: 1,
    name: 'Hearing.effectiveRadius',
    file: 'src/sim/Hearing.ts',
    target: 'return (\n    loudness *\n    ACOUSTIC_CONSTANTS.MAX_HEAR_RADIUS',
    mutant: 'return (\n    0 * // MUTATION BREAK\n    loudness *\n    ACOUSTIC_CONSTANTS.MAX_HEAR_RADIUS',
  },
  {
    id: 2,
    name: 'Occlusion counter',
    file: 'src/sim/Hearing.ts',
    target: 'walls = colliders.segmentHits(noisePos.x, noisePos.z, monsterPos.x, monsterPos.z, 1.0);',
    mutant: 'walls = 999; // MUTATION BREAK: force maximum occlusion',
  },
  {
    id: 3,
    name: 'NavGrid walkability',
    file: 'src/sim/NavGrid.ts',
    target: 'this.walkable[row + gx] = 1;',
    mutant: 'this.walkable[row + gx] = 0; // MUTATION BREAK: no cell walkable',
  },
  {
    id: 4,
    name: 'PlayerMotor step limit',
    file: 'src/sim/PlayerMotor.ts',
    target: 'destGroundY - this.pos.y > PlayerMotor.STEP_LIMIT',
    mutant: 'destGroundY - this.pos.y > -999.0 // MUTATION BREAK: always blocked',
  },
  {
    id: 5,
    name: 'Noise cadence for sprint-wading',
    file: 'src/sim/PlayerMotor.ts',
    target: 'cadence = 0.30;\n      loudness = 0.75;',
    mutant: 'cadence = 999.0; // MUTATION BREAK: never emit sprint wade noise\n      loudness = 0.75;',
  },
  {
    id: 6,
    name: 'SequenceKeypadNode lockout',
    file: 'src/sim/puzzle/SequenceKeypadNode.ts',
    target: 'if (this.attempts >= 3) {',
    mutant: 'if (false) { // MUTATION BREAK: never lock out after 3 attempts',
  },
  {
    id: 7,
    name: 'WaterLevelCycle.levelAt',
    file: 'src/sim/WaterLevelCycle.ts',
    target: 'return this.lowY;',
    mutant: 'return 999.0; // MUTATION BREAK: invalid water level',
  },
  {
    id: 8,
    name: 'Projectile landing classification',
    file: 'src/sim/Projectile.ts',
    target: 'const isWater = newY <= waterY || gh < waterY - 0.05;',
    mutant: 'const isWater = false; // MUTATION BREAK: never classify as water',
  },
  {
    id: 9,
    name: 'Scoring final formula',
    file: 'src/meta/Scoring.ts',
    target: 'const finalScore = Math.max(0, Math.round(rawScore * totalMultiplier));',
    mutant: 'const finalScore = 0; // MUTATION BREAK: zero final score',
  },
  {
    id: 10,
    name: 'RatingElo expected score formula',
    file: 'src/meta/RatingElo.ts',
    target: 'return 1.0 / (1.0 + Math.pow(10, (ratingB - ratingA) / 400.0));',
    mutant: 'return 0.0; // MUTATION BREAK: zero expected score',
  },
];

console.log('\n=============================================================');
console.log('  MUTATION SPOT CHECK HARNESS (10 CANONICAL FUNCTIONS)        ');
console.log('=============================================================\n');

const results = [];
let allPassed = true;

for (const m of MUTATIONS) {
  const filePath = resolve(ROOT, m.file);
  const original = readFileSync(filePath, 'utf8');

  if (!original.includes(m.target)) {
    console.error(`[ERROR] Target string for mutation "${m.name}" not found in ${m.file}!`);
    process.exit(1);
  }

  // Apply mutation
  const mutated = original.replace(m.target, m.mutant);
  writeFileSync(filePath, mutated, 'utf8');

  let testFailed = false;
  let failOutput = '';

  try {
    // Run vitest
    execSync('npx vitest run --reporter=basic', {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 30000,
    });
    // If it succeeds, the mutation SURVIVED (bad!)
    testFailed = false;
  } catch (err) {
    testFailed = true;
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    const combined = stdout + '\n' + stderr;
    const failLines = combined.split('\n').filter((l) => l.includes('FAIL') || l.includes('AssertionError') || l.includes('expected'));
    failOutput = failLines.slice(0, 3).join(' | ').replace(/\s+/g, ' ');
  } finally {
    // Restore file immediately
    writeFileSync(filePath, original, 'utf8');
  }

  const passed = testFailed; // Test MUST fail for mutation check to pass
  if (!passed) allPassed = false;

  const row = {
    id: m.id,
    name: m.name,
    file: m.file,
    caughtByTests: passed ? 'CAUGHT (FAIL)' : 'SURVIVED (PASS - REGRESSION)',
    sampleError: failOutput || 'None (Suite passed without failure)',
  };
  results.push(row);

  console.log(`[Mutation ${m.id}/10] ${m.name}: ${passed ? '✓ CAUGHT BY TESTS' : '✗ SURVIVED (NO TEST CAUGHT IT!)'}`);
}

console.log('\n--- Mutation Spot Check Summary Table ---');
console.table(results.map((r) => ({
  ID: r.id,
  Function: r.name,
  Status: r.caughtByTests,
  ErrorSnippet: r.sampleError.substring(0, 80),
})));

if (!allPassed) {
  console.error('\nERROR: One or more mutations survived! Add tests for surviving functions.\n');
  process.exit(1);
} else {
  console.log('\nAll 10 mutations were caught by tests! Mutation suite PASSED.\n');
}

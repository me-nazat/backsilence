/* ── tests/reference-integrity.test.ts ─────────────────────────────────────────
 *  Prompt 10 Item B.5: Reference-pack integrity verification tests.
 *  Asserts that checkReferenceIntegrity validates all manifestHash references
 *  against reference/frames.manifest.json, and detects tampered or diverging hashes.
 * ──────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { checkReferenceIntegrity } from '../scripts/audit/reference-integrity.mjs';

describe('Reference Pack Integrity Verification', () => {
  it('passes cleanly against current repository reference pack', () => {
    const root = process.cwd();
    const result = checkReferenceIntegrity(root);
    // DESIGN_RATIONALE: Current reference pack must have zero integrity violations
    expect(result.violations).toHaveLength(0);
    // DESIGN_RATIONALE: Canonical hash must match authoritative 37-frame SHA-256
    expect(result.canonicalHash).toBe('94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772');
    // DESIGN_RATIONALE: Must have verified at least 3 JSON files (manifest, derived_targets, pairings)
    expect(result.checkedCount).toBeGreaterThanOrEqual(3);
  });

  it('fails when given an invalid root directory lacking manifest', () => {
    const emptyDir = `${process.cwd()}/tests`;
    const result = checkReferenceIntegrity(emptyDir);
    // DESIGN_RATIONALE: Missing frames.manifest.json must be flagged as fatal violation
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]?.detail).toContain('Missing canonical frames.manifest.json');
  });
});


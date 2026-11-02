import { describe, it, expect } from 'vitest';
import { checkDocsTruth, type DocViolation } from '../scripts/audit/docs-truth.mjs';

describe('Documentation Truth Gate (scripts/audit/docs-truth.mjs)', () => {
  it('detects missing files or false script claims in fake directory', () => {
    const violations = checkDocsTruth('/tmp/non_existent_dir_backsilence_123');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v: DocViolation) => v.file === 'package.json')).toBe(true);
  });

  it('verifies that current repository documents pass without violations', () => {
    const violations = checkDocsTruth();
    expect(violations).toHaveLength(0);
  });
});

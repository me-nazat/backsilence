import { describe, it, expect } from 'vitest';
import { checkContentHonesty, scanReportsHonesty } from '../scripts/audit/reports-honesty.mjs';

describe('Reports Honesty Gate (scripts/audit/reports-honesty.mjs)', () => {
  it('passes on honest reporting without subjective scores', () => {
    const cleanContent = `
# Performance Verification
All 11 maps exceed 60 FPS.
Draw calls: 84
Triangles: 142000
    `;
    const violations = checkContentHonesty(cleanContent, 'test.md');
    expect(violations).toHaveLength(0);
  });

  it('fails on self-assigned rubric scores like 4.8/5.00', () => {
    const badContent = `
## Evaluation
Rubric Avg: 4.95 / 5.00
Overall rating: great!
    `;
    const violations = checkContentHonesty(badContent, 'fake_report.md');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('fails on self-assigned letter grades like Grade: A+', () => {
    const badContent = `
### Verdict
Grade: A+
The graphics pass is excellent.
    `;
    const violations = checkContentHonesty(badContent, 'fake_report.md');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('fails on artificial score 100/100', () => {
    const badContent = `
### Quality Gate
Score: 100/100
Everything passed without issues.
    `;
    const violations = checkContentHonesty(badContent, 'fake_report.md');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('scans all existing repository reports with zero violations', () => {
    const violations = scanReportsHonesty();
    expect(violations).toHaveLength(0);
  });
});

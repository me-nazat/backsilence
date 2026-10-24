/* ── error-boundary.test.ts ────────────────────────────────────────────────
 *  Tests for analog-horror ErrorBoundary & ring buffer.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorBoundary } from '../src/engine/ErrorBoundary.js';

describe('ErrorBoundary & Ring Buffer', () => {
  beforeEach(() => {
    ErrorBoundary.clear();
  });

  it('records errors in ring buffer with timestamps and types', () => {
    ErrorBoundary.recordError('error', 'Test error message', 'Error: stack line 1');
    const errors = ErrorBoundary.getErrors();
    expect(errors.length).toBe(1);
    expect(errors[0]!.type).toBe('error');
    expect(errors[0]!.message).toBe('Test error message');
    expect(errors[0]!.stack).toBe('Error: stack line 1');
    expect(errors[0]!.timestamp).toBeDefined();
  });

  it('caps ring buffer at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      ErrorBoundary.recordError('error', `Error #${i}`);
    }
    const errors = ErrorBoundary.getErrors();
    expect(errors.length).toBe(50);
    // Oldest 10 dropped; first item should be #10
    expect(errors[0]!.message).toBe('Error #10');
    expect(errors[49]!.message).toBe('Error #59');
  });

  it('redacts secrets (JWTs, libsql tokens, Bearer tokens, passwords)', () => {
    const rawError = 'Failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.do_not_leak ' +
      'connecting to libsql://user:secrettoken123@turso.io with password="super_secret_val"';

    ErrorBoundary.recordError('unhandledrejection', rawError);
    const errors = ErrorBoundary.getErrors();
    const recorded = errors[0]!.message;

    expect(recorded).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(recorded).not.toContain('secrettoken123');
    expect(recorded).not.toContain('super_secret_val');
    expect(recorded).toContain('[REDACTED');
  });

  it('generates formatted diagnostics JSON without leaking credentials', () => {
    ErrorBoundary.recordError('error', 'Token auth failure: Bearer sensitive_bearer_token');
    const json = ErrorBoundary.generateDiagnostics();
    const parsed = JSON.parse(json) as { errors: Array<{ message: string }> };

    expect(parsed.errors.length).toBe(1);
    expect(parsed.errors[0]!.message).toContain('[REDACTED_TOKEN]');
    expect(json).not.toContain('sensitive_bearer_token');
  });
});

/* ── a11y-safety.test.ts ────────────────────────────────────────────────────
 *  Tests for Phase F: Accessibility (WCAG 2.2 AA) & First-Run Safety Flow.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { FirstRunSafetyFlow } from '../src/ui/safety/FirstRunSafetyFlow.js';
import { A11yAnnouncer } from '../src/ui/a11y/A11yAnnouncer.js';
import { PALETTE, HIGH_CONTRAST_PALETTE } from '../src/app/Palette.js';

interface FsModule {
  readFileSync: (path: string, encoding: string) => string;
}

interface PathModule {
  resolve: (...parts: string[]) => string;
}

declare const process: { cwd: () => string };

describe('Prompt 4 Phase F: Accessibility & Safety Compliance', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
    FirstRunSafetyFlow.reset();
  });

  it('verifies color contrast ratios meet WCAG 2.2 AA (4.5:1 text, 3:1 controls)', () => {
    // Relative luminance calculation for contrast
    function getLuminance(hex: string): number {
      const rgb = [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));

      return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
    }

    function getContrast(hex1: string, hex2: string): number {
      const l1 = getLuminance(hex1);
      const l2 = getLuminance(hex2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    // 1. Core archive cream on ink background (> 4.5:1)
    const creamContrast = getContrast(PALETTE.cream, PALETTE.ink);
    expect(creamContrast).toBeGreaterThanOrEqual(10.0);

    // 2. High contrast mode tokens meet WCAG AAA (> 7:1)
    const hcContrast = getContrast(HIGH_CONTRAST_PALETTE.cream, HIGH_CONTRAST_PALETTE.ink);
    expect(hcContrast).toBeGreaterThanOrEqual(18.0);

    // 3. Water accent contrast on ink
    const waterContrast = getContrast(PALETTE.water, PALETTE.ink);
    expect(waterContrast).toBeGreaterThanOrEqual(4.5);
  });

  it('scans index.html for skip link, canvas label, live regions, and media queries', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Skip link & landmarks
    expect(html).toContain('class="bs-skip-link"');
    expect(html).toContain('Skip to main content');
    expect(html).toContain('aria-label="Decorative hero scene"');
    expect(html).toContain('role="img"');

    // Live regions
    expect(html).toContain('id="bs-live-region"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="bs-alert-region"');
    expect(html).toContain('aria-live="assertive"');

    // Media queries
    expect(html).toContain('prefers-contrast: more');
    expect(html).toContain('forced-colors: active');
    expect(html).toContain('prefers-reduced-transparency: reduce');
    expect(html).toContain('prefers-reduced-motion:reduce');
  });

  it('FirstRunSafetyFlow checks state, auto-detects hardware quality, and acknowledges', () => {
    expect(FirstRunSafetyFlow.isNeeded()).toBe(true);

    const quality = FirstRunSafetyFlow.detectQuality();
    expect(['low', 'medium', 'high']).toContain(quality);

    FirstRunSafetyFlow.acknowledge();
    expect(FirstRunSafetyFlow.isNeeded()).toBe(false);

    FirstRunSafetyFlow.reset();
    expect(FirstRunSafetyFlow.isNeeded()).toBe(true);
  });

  it('A11yAnnouncer provides live status and alert dispatching', () => {
    const announcer = A11yAnnouncer.getInstance();
    expect(typeof announcer.announce).toBe('function');
    // Polite and assertive calls
    announcer.announce('Tape inserted into archive deck.', 'polite');
    announcer.announce('Tracking signal corrupted.', 'assertive');
  });
});

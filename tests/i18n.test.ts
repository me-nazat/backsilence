/* ── i18n.test.ts ────────────────────────────────────────────────────────────
 *  Unit tests for Phase G: Internationalization (I18n) Engine.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { I18nEngine, SUPPORTED_LOCALES } from '../src/i18n/I18n.js';

describe('Prompt 4 Phase G: Internationalization (i18n)', () => {
  let i18n: I18nEngine;

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
    i18n = new I18nEngine();
  });

  it('translates core keys and performs parameter replacement', () => {
    expect(i18n.t('action.descend')).toBe('DESCEND');
    expect(i18n.t('action.back')).toBe('ESC BACK');

    // Plural and parameter interpolation
    const single = i18n.t('plural.item_count_one', { count: 1 });
    expect(single).toBe('1 item collected');

    const multi = i18n.t('plural.item_count_other', { count: 5 });
    expect(multi).toBe('5 items collected');
  });

  it('handles plural selection correctly via Intl.PluralRules', () => {
    const zero = i18n.plural('plural.item_count', 0);
    expect(zero).toContain('0');

    const one = i18n.plural('plural.item_count', 1);
    expect(one).toBe('1 item collected');

    const many = i18n.plural('plural.item_count', 42);
    expect(many).toBe('42 items collected');
  });

  it('formats numbers, dates, relative times, and lists using Intl APIs', () => {
    // Number format
    const num = i18n.formatNumber(125000);
    expect(num).toContain('125');

    // Date time format
    const dateStr = i18n.formatDateTime(new Date(2026, 9, 24));
    expect(dateStr).toBeTruthy();

    // Relative time format
    const rel = i18n.formatRelativeTime(-2, 'hour');
    expect(rel.toLowerCase()).toContain('2');

    // List format
    const list = i18n.formatList(['Tape 01', 'Tape 02', 'Tape 03']);
    expect(list).toContain('Tape 01');
    expect(list).toContain('Tape 03');
  });

  it('detects RTL script for Arabic and updates document dir attribute', async () => {
    expect(i18n.isRtl('en')).toBe(false);
    expect(i18n.isRtl('es')).toBe(false);
    expect(i18n.isRtl('ar')).toBe(true);
    expect(i18n.isRtl('ar-test')).toBe(true);

    await i18n.setLocale('ar');
    expect(i18n.getLocale()).toBe('ar');
    expect(i18n.isRtl()).toBe(true);

    if (typeof document !== 'undefined' && document.documentElement) {
      expect(document.documentElement.lang).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
    }
  });

  it('loads pseudo-locale with accented characters and expansion', async () => {
    await i18n.setLocale('qps-ploc');
    expect(i18n.getLocale()).toBe('qps-ploc');

    const pseudoDescend = i18n.t('action.descend');
    expect(pseudoDescend.startsWith('[')).toBe(true);
    expect(pseudoDescend.endsWith(']')).toBe(true);
    expect(pseudoDescend.length).toBeGreaterThan('DESCEND'.length);
  });

  it('verifies all 15 launch locales have required meta fields', () => {
    expect(SUPPORTED_LOCALES.length).toBe(15);
    const codes = SUPPORTED_LOCALES.map((l) => l.id);
    expect(codes).toContain('en');
    expect(codes).toContain('es');
    expect(codes).toContain('pt-BR');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('ru');
    expect(codes).toContain('tr');
    expect(codes).toContain('hi');
    expect(codes).toContain('bn');
    expect(codes).toContain('ar');
    expect(codes).toContain('ja');
    expect(codes).toContain('ko');
    expect(codes).toContain('zh-CN');
    expect(codes).toContain('qps-ploc');
    expect(codes).toContain('ar-test');
  });

  it('provides daily reset time with UTC tooltip', () => {
    const info = i18n.getDailyResetInfo();
    expect(info.localTime).toBeTruthy();
    expect(info.utcTooltip).toContain('00:00 UTC');
  });
});

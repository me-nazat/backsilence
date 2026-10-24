/* ── I18n.ts ─────────────────────────────────────────────────────────────
 *  Internationalization engine:
 *  - t(key, params) string lookup with parameter interpolation
 *  - Plural rules via Intl.PluralRules
 *  - Formatting via Intl.NumberFormat, DateTimeFormat, RelativeTimeFormat, ListFormat
 *  - Lazy locale chunks <= 8 KB gzipped
 *  - Pseudo-locale and RTL (Arabic) support
 *  - lang and dir attribute management on documentElement
 *  - Persistent storage in localStorage('bs_locale')
 * ──────────────────────────────────────────────────────────────────────── */

import enLocale from './locales/en.json';

export type SupportedLocale =
  | 'en'
  | 'es'
  | 'pt-BR'
  | 'fr'
  | 'de'
  | 'ru'
  | 'tr'
  | 'hi'
  | 'bn'
  | 'ar'
  | 'ja'
  | 'ko'
  | 'zh-CN'
  | 'qps-ploc'
  | 'ar-test';

export interface LocaleMeta {
  locale: SupportedLocale;
  name: string;
  dir: 'ltr' | 'rtl';
  needsReview: boolean;
}

export interface LocaleData {
  _meta: LocaleMeta;
  [key: string]: string | LocaleMeta;
}

export const SUPPORTED_LOCALES: Array<{ id: SupportedLocale; name: string; dir: 'ltr' | 'rtl' }> = [
  { id: 'en', name: 'English', dir: 'ltr' },
  { id: 'es', name: 'Español', dir: 'ltr' },
  { id: 'pt-BR', name: 'Português (Brasil)', dir: 'ltr' },
  { id: 'fr', name: 'Français', dir: 'ltr' },
  { id: 'de', name: 'Deutsch', dir: 'ltr' },
  { id: 'ru', name: 'Русский', dir: 'ltr' },
  { id: 'tr', name: 'Türkçe', dir: 'ltr' },
  { id: 'hi', name: 'हिन्दी', dir: 'ltr' },
  { id: 'bn', name: 'বাংলা', dir: 'ltr' },
  { id: 'ar', name: 'العربية', dir: 'rtl' },
  { id: 'ja', name: '日本語', dir: 'ltr' },
  { id: 'ko', name: '한국어', dir: 'ltr' },
  { id: 'zh-CN', name: '简体中文', dir: 'ltr' },
  { id: 'qps-ploc', name: '[Ƥšêûðô-Łôçäłé]', dir: 'ltr' },
  { id: 'ar-test', name: 'Arabic (Test RTL)', dir: 'rtl' },
];

export interface ListFormatOptions {
  type?: 'conjunction' | 'disjunction' | 'unit';
  style?: 'long' | 'short' | 'narrow';
  localeMatcher?: 'lookup' | 'best fit';
}

interface ListFormatInstance {
  format(items: string[]): string;
}

interface IntlWithListFormat {
  ListFormat?: new (locale: string, options?: ListFormatOptions) => ListFormatInstance;
}

export class I18nEngine {
  private static instance: I18nEngine | null = null;
  private currentLocale: SupportedLocale = 'en';
  private localeCache = new Map<SupportedLocale, LocaleData>();
  private listeners = new Set<(locale: SupportedLocale) => void>();
  private storageKey = 'bs_locale';

  static getInstance(): I18nEngine {
    if (!this.instance) {
      this.instance = new I18nEngine();
    }
    return this.instance;
  }

  constructor() {
    this.localeCache.set('en', enLocale as unknown as LocaleData);
    this.initLocale();
  }

  private initLocale(): void {
    let saved: SupportedLocale | null = null;
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(this.storageKey);
      if (val && this.isValidLocale(val)) {
        saved = val;
      }
    }

    if (!saved) {
      saved = this.autoDetectLocale();
    }

    this.currentLocale = saved;
    this.applyDocumentAttributes(saved);

    // If not en, asynchronously preload the selected locale
    if (saved !== 'en') {
      void this.loadLocale(saved);
    }
  }

  isValidLocale(code: string): code is SupportedLocale {
    return SUPPORTED_LOCALES.some((l) => l.id === code);
  }

  autoDetectLocale(): SupportedLocale {
    if (typeof navigator === 'undefined' || !navigator.languages) return 'en';

    for (const lang of navigator.languages) {
      const exact = SUPPORTED_LOCALES.find((l) => l.id.toLowerCase() === lang.toLowerCase());
      if (exact) return exact.id;

      const prefix = lang.split('-')[0]?.toLowerCase();
      const match = SUPPORTED_LOCALES.find((l) => l.id.toLowerCase().startsWith(prefix ?? ''));
      if (match) return match.id;
    }

    return 'en';
  }

  getLocale(): SupportedLocale {
    return this.currentLocale;
  }

  isRtl(locale?: SupportedLocale): boolean {
    const loc = locale ?? this.currentLocale;
    const meta = SUPPORTED_LOCALES.find((l) => l.id === loc);
    return meta?.dir === 'rtl';
  }

  isBeta(locale?: SupportedLocale): boolean {
    const loc = locale ?? this.currentLocale;
    const data = this.localeCache.get(loc);
    if (data?._meta) {
      return Boolean(data._meta.needsReview);
    }
    return loc !== 'en' && loc !== 'qps-ploc' && loc !== 'ar-test';
  }

  async setLocale(locale: SupportedLocale): Promise<void> {
    if (locale === this.currentLocale && this.localeCache.has(locale)) return;

    await this.loadLocale(locale);
    this.currentLocale = locale;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, locale);
    }

    this.applyDocumentAttributes(locale);

    for (const fn of this.listeners) {
      fn(locale);
    }
  }

  private applyDocumentAttributes(locale: SupportedLocale): void {
    if (typeof document === 'undefined' || !document.documentElement) return;

    document.documentElement.lang = locale;
    document.documentElement.dir = this.isRtl(locale) ? 'rtl' : 'ltr';
  }

  private async loadLocale(locale: SupportedLocale): Promise<LocaleData> {
    const cached = this.localeCache.get(locale);
    if (cached) return cached;

    try {
      let data: LocaleData;
      switch (locale) {
        case 'es':
          data = (await import('./locales/es.json')).default as unknown as LocaleData;
          break;
        case 'pt-BR':
          data = (await import('./locales/pt-BR.json')).default as unknown as LocaleData;
          break;
        case 'fr':
          data = (await import('./locales/fr.json')).default as unknown as LocaleData;
          break;
        case 'de':
          data = (await import('./locales/de.json')).default as unknown as LocaleData;
          break;
        case 'ru':
          data = (await import('./locales/ru.json')).default as unknown as LocaleData;
          break;
        case 'tr':
          data = (await import('./locales/tr.json')).default as unknown as LocaleData;
          break;
        case 'hi':
          data = (await import('./locales/hi.json')).default as unknown as LocaleData;
          break;
        case 'bn':
          data = (await import('./locales/bn.json')).default as unknown as LocaleData;
          break;
        case 'ar':
          data = (await import('./locales/ar.json')).default as unknown as LocaleData;
          break;
        case 'ja':
          data = (await import('./locales/ja.json')).default as unknown as LocaleData;
          break;
        case 'ko':
          data = (await import('./locales/ko.json')).default as unknown as LocaleData;
          break;
        case 'zh-CN':
          data = (await import('./locales/zh-CN.json')).default as unknown as LocaleData;
          break;
        case 'qps-ploc':
          data = (await import('./locales/qps-ploc.json')).default as unknown as LocaleData;
          break;
        case 'ar-test':
          data = (await import('./locales/ar-test.json')).default as unknown as LocaleData;
          break;
        case 'en':
        default:
          data = enLocale as unknown as LocaleData;
          break;
      }
      this.localeCache.set(locale, data);
      return data;
    } catch (err) {
      console.warn(`[i18n] Failed to load locale "${locale}", falling back to en:`, err);
      return enLocale as unknown as LocaleData;
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    const dict = this.localeCache.get(this.currentLocale) ?? this.localeCache.get('en');
    let raw = dict?.[key];

    if (typeof raw !== 'string') {
      const fallback = this.localeCache.get('en')?.[key];
      raw = typeof fallback === 'string' ? fallback : key;
    }

    if (!params) return raw;

    let res = raw;
    for (const [k, v] of Object.entries(params)) {
      res = res.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return res;
  }

  plural(keyPrefix: string, count: number, params?: Record<string, string | number>): string {
    const rules = new Intl.PluralRules(this.currentLocale);
    const rule = rules.select(count); // 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

    let key = `${keyPrefix}_${rule}`;
    const dict = this.localeCache.get(this.currentLocale) ?? this.localeCache.get('en');

    if (!dict || typeof dict[key] !== 'string') {
      key = `${keyPrefix}_other`;
    }

    const mergedParams = { count, ...(params ?? {}) };
    return this.t(key, mergedParams);
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    try {
      return new Intl.NumberFormat(this.currentLocale, options).format(value);
    } catch {
      return String(value);
    }
  }

  formatDateTime(date: Date | number, options?: Intl.DateTimeFormatOptions): string {
    try {
      return new Intl.DateTimeFormat(this.currentLocale, options).format(date);
    } catch {
      return new Date(date).toISOString();
    }
  }

  formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string {
    try {
      return new Intl.RelativeTimeFormat(this.currentLocale, { numeric: 'auto' }).format(value, unit);
    } catch {
      return `${value} ${unit} ago`;
    }
  }

  formatList(items: string[], options?: ListFormatOptions): string {
    try {
      const intlWithList = Intl as unknown as IntlWithListFormat;
      if (intlWithList.ListFormat) {
        return new intlWithList.ListFormat(this.currentLocale, options).format(items);
      }
      return items.join(', ');
    } catch {
      return items.join(', ');
    }
  }

  onLocaleChange(listener: (locale: SupportedLocale) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns next daily reset time in local time string + UTC tooltip.
   */
  getDailyResetInfo(): { localTime: string; utcTooltip: string } {
    const now = new Date();
    const nextUtcMidnight = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0,
    ));

    const localTime = this.formatDateTime(nextUtcMidnight, {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const utcTooltip = this.t('i18n.daily_reset_tooltip');

    return { localTime, utcTooltip };
  }
}

// Global accessor shortcuts
export const i18n = I18nEngine.getInstance();
export const t = (key: string, params?: Record<string, string | number>): string => i18n.t(key, params);

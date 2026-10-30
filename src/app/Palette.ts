/* ── Palette.ts ───────────────────────────────────────────────────────────
 *  Single source of truth for design tokens, color palettes, typography stacks,
 *  8px grid dimensions, responsive breakpoints, and high-contrast / forced-colors themes.
 *  Generates CSS custom properties so TypeScript and CSS cannot drift.
 * ──────────────────────────────────────────────────────────────────────── */

export const PALETTE = {
  // Core Archive Palette
  ink: '#0d0b06',
  cream: '#e9dca8',
  tan: '#d8b36a',
  grout: '#5b4526',
  fog: '#d9d3a2',
  water: '#7d9a55',
  waterDeep: '#33502a',
  danger: '#b3261e',

  // Tile aliases for backwards compatibility
  tilePlatform: '#d8b36a',
  tileWall: '#e9dca8',

  // Functional Surfaces
  surface1: 'rgba(13, 11, 6, 0.94)',
  surface2: 'rgba(26, 21, 14, 0.90)',
  surface3: 'rgba(45, 36, 24, 0.85)',
  surfaceHover: 'rgba(58, 47, 31, 0.90)',
  surfaceActive: 'rgba(85, 68, 43, 0.95)',

  // Borders
  border: 'rgba(91, 69, 38, 0.45)',
  borderSubtle: 'rgba(91, 69, 38, 0.25)',
  borderStrong: 'rgba(216, 179, 106, 0.55)',
  borderFocus: '#86cfa0',

  // Status Tokens
  focus: '#86cfa0',
  success: '#86cfa0',
  warning: '#d8b36a',
  error: '#b3261e',
} as const;

export const HIGH_CONTRAST_PALETTE = {
  ink: '#000000',
  cream: '#ffffff',
  tan: '#ffd700',
  grout: '#8b6508',
  fog: '#ffffff',
  water: '#00ff88',
  waterDeep: '#00cc66',
  danger: '#ff3333',
  surface1: '#000000',
  surface2: '#111111',
  surface3: '#222222',
  border: '#ffffff',
  borderSubtle: '#aaaaaa',
  borderStrong: '#ffffff',
  borderFocus: '#00ff88',
  focus: '#00ff88',
  success: '#00ff88',
  warning: '#ffd700',
  error: '#ff3333',
} as const;

export const TYPOGRAPHY_STACKS = {
  latin: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'SF Mono', Monaco, Inconsolata, 'Fira Code', monospace",
  osd: "'Courier New', Courier, monospace",
  bengali: "'Noto Sans Bengali', 'Nirmala UI', sans-serif",
  devanagari: "'Noto Sans Devanagari', 'Nirmala UI', sans-serif",
  arabic: "'Noto Sans Arabic', 'Segoe UI Arabic', Tahoma, sans-serif",
  japanese: "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif",
  korean: "'Noto Sans KR', 'Malgun Gothic', sans-serif",
  chinese: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
} as const;

export const BREAKPOINTS = {
  mobile: 360,
  tablet: 768,
  desktop: 1280,
  wide: 1920,
} as const;

export const SPACING_GRID = {
  space1: 8,
  space2: 16,
  space3: 24,
  space4: 32,
  space5: 40,
  space6: 48,
  space8: 64,
  space10: 80,
} as const;

export const MOTION_TOKENS = {
  fast: 120,
  normal: 240,
  slow: 480,
  crawl: 900,
  easeOut: 'cubic-bezier(.2, .8, .2, 1)',
  easeInOut: 'cubic-bezier(.6, 0, .2, 1)',
  easeWet: 'cubic-bezier(.16, 1, .3, 1)',
} as const;

/**
 * Generate CSS Custom Properties string representing design tokens.
 */
export function generateCssTokens(): string {
  return `/* Auto-generated from src/app/Palette.ts */
:root {
  --bs-ink: ${PALETTE.ink};
  --bs-cream: ${PALETTE.cream};
  --bs-tan: ${PALETTE.tan};
  --bs-grout: ${PALETTE.grout};
  --bs-fog: ${PALETTE.fog};
  --bs-water: ${PALETTE.water};
  --bs-water-deep: ${PALETTE.waterDeep};
  --bs-danger: ${PALETTE.danger};

  --bs-surface-1: ${PALETTE.surface1};
  --bs-surface-2: ${PALETTE.surface2};
  --bs-surface-3: ${PALETTE.surface3};
  --bs-surface-hover: ${PALETTE.surfaceHover};
  --bs-surface-active: ${PALETTE.surfaceActive};

  --bs-border: ${PALETTE.border};
  --bs-border-subtle: ${PALETTE.borderSubtle};
  --bs-border-strong: ${PALETTE.borderStrong};
  --bs-border-focus: ${PALETTE.borderFocus};

  --bs-focus: ${PALETTE.focus};
  --bs-success: ${PALETTE.success};
  --bs-warning: ${PALETTE.warning};
  --bs-error: ${PALETTE.error};

  --bs-font-body: ${TYPOGRAPHY_STACKS.latin};
  --bs-font-mono: ${TYPOGRAPHY_STACKS.mono};
  --bs-font-osd: ${TYPOGRAPHY_STACKS.osd};
  --bs-font-bengali: ${TYPOGRAPHY_STACKS.bengali};
  --bs-font-devanagari: ${TYPOGRAPHY_STACKS.devanagari};
  --bs-font-arabic: ${TYPOGRAPHY_STACKS.arabic};
  --bs-font-japanese: ${TYPOGRAPHY_STACKS.japanese};
  --bs-font-korean: ${TYPOGRAPHY_STACKS.korean};
  --bs-font-chinese: ${TYPOGRAPHY_STACKS.chinese};

  --bs-space-1: ${SPACING_GRID.space1}px;
  --bs-space-2: ${SPACING_GRID.space2}px;
  --bs-space-3: ${SPACING_GRID.space3}px;
  --bs-space-4: ${SPACING_GRID.space4}px;
  --bs-space-5: ${SPACING_GRID.space5}px;
  --bs-space-6: ${SPACING_GRID.space6}px;
  --bs-space-8: ${SPACING_GRID.space8}px;
  --bs-space-10: ${SPACING_GRID.space10}px;

  --bs-duration-fast: ${MOTION_TOKENS.fast}ms;
  --bs-duration-normal: ${MOTION_TOKENS.normal}ms;
  --bs-duration-slow: ${MOTION_TOKENS.slow}ms;
  --bs-duration-crawl: ${MOTION_TOKENS.crawl}ms;
  --ease-out: ${MOTION_TOKENS.easeOut};
  --ease-inout: ${MOTION_TOKENS.easeInOut};
  --ease-wet: ${MOTION_TOKENS.easeWet};
}
`;
}

/**
 * Inject palette variables onto root in browser contexts.
 */
export function injectPaletteVars(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--bs-ink', PALETTE.ink);
  root.style.setProperty('--bs-cream', PALETTE.cream);
  root.style.setProperty('--bs-tan', PALETTE.tan);
  root.style.setProperty('--bs-grout', PALETTE.grout);
  root.style.setProperty('--bs-water', PALETTE.water);
  root.style.setProperty('--bs-water-deep', PALETTE.waterDeep);
  root.style.setProperty('--bs-danger', PALETTE.danger);
  root.style.setProperty('--bs-focus', PALETTE.focus);
}

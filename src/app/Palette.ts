/* ── Palette.ts ───────────────────────────────────────────────────────────
 *  Color palette exported as both CSS custom properties and TS constants.
 *  Derived from the visual reference bible.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Palette color definitions.
 * Each key maps to a hex string used as both a CSS variable and a TS constant.
 */
export const PALETTE = {
  tilePlatform: '#d8b36a',
  tileWall: '#e9dca8',
  grout: '#5b4526',
  fog: '#d9d3a2',
  water: '#86cfa0',
  waterDeep: '#3f9c6b',
  ink: '#0d0b06',
  danger: '#b3261e',
} as const;

/** CSS variable name map (without the leading `--`). */
export const CSS_VAR_MAP: Record<keyof typeof PALETTE, string> = {
  tilePlatform: 'tile-platform',
  tileWall: 'tile-wall',
  grout: 'grout',
  fog: 'fog',
  water: 'water',
  waterDeep: 'water-deep',
  ink: 'ink',
  danger: 'danger',
};

/**
 * Inject palette as CSS custom properties on the document root.
 * Safe to call in a browser context only.
 */
export function injectPaletteVars(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, hex] of Object.entries(PALETTE)) {
    const varName = CSS_VAR_MAP[key as keyof typeof PALETTE];
    if (varName) {
      root.style.setProperty(`--${varName}`, hex);
    }
  }
}

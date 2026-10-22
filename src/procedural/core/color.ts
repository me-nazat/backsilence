/* ── color.ts ─────────────────────────────────────────────────────────────
 *  Color space conversion, interpolation, and deterministic jittering.
 * ──────────────────────────────────────────────────────────────────────── */

export interface RgbColor {
  /** Red 0..255 */
  r: number;
  /** Green 0..255 */
  g: number;
  /** Blue 0..255 */
  b: number;
}

export interface HslColor {
  /** Hue 0..360 */
  h: number;
  /** Saturation 0..1 */
  s: number;
  /** Lightness 0..1 */
  l: number;
}

/**
 * Parse a hex color string ('#fff', '#ffffff', or without '#') to RGB (0..255).
 */
export function hexToRgb(hex: string): RgbColor {
  let clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length === 3) {
    clean = clean[0]! + clean[0]! + clean[1]! + clean[1]! + clean[2]! + clean[2]!;
  }
  const val = parseInt(clean, 16);
  return {
    r: (val >> 16) & 255,
    g: (val >> 8) & 255,
    b: val & 255,
  };
}

/**
 * Convert RGB (0..255) to a 6-digit hex string with '#'.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const cr = Math.min(255, Math.max(0, Math.round(r)));
  const cg = Math.min(255, Math.max(0, Math.round(g)));
  const cb = Math.min(255, Math.max(0, Math.round(b)));
  return (
    '#' +
    ((1 << 24) + (cr << 16) + (cg << 8) + cb)
      .toString(16)
      .slice(1)
      .toLowerCase()
  );
}

/**
 * Convert RGB (0..255) to HSL (h: 0..360, s: 0..1, l: 0..1).
 */
export function rgbToHsl(r: number, g: number, b: number): HslColor {
  const rf = r / 255.0;
  const gf = g / 255.0;
  const bf = b / 255.0;

  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2.0;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2.0 - max - min) : delta / (max + min);
    if (max === rf) {
      h = (gf - bf) / delta + (gf < bf ? 6.0 : 0.0);
    } else if (max === gf) {
      h = (bf - rf) / delta + 2.0;
    } else {
      h = (rf - gf) / delta + 4.0;
    }
    h *= 60.0;
  }

  return { h, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tc = t;
  if (tc < 0) tc += 1.0;
  if (tc > 1) tc -= 1.0;
  if (tc < 1.0 / 6.0) return p + (q - p) * 6.0 * tc;
  if (tc < 1.0 / 2.0) return q;
  if (tc < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - tc) * 6.0;
  return p;
}

/**
 * Convert HSL (h: 0..360, s: 0..1, l: 0..1) to RGB (0..255).
 */
export function hslToRgb(h: number, s: number, l: number): RgbColor {
  const normH = (((h % 360) + 360) % 360) / 360.0;
  const normS = Math.min(1.0, Math.max(0.0, s));
  const normL = Math.min(1.0, Math.max(0.0, l));

  if (normS === 0) {
    const val = Math.round(normL * 255);
    return { r: val, g: val, b: val };
  }

  const q = normL < 0.5 ? normL * (1.0 + normS) : normL + normS - normL * normS;
  const p = 2.0 * normL - q;

  return {
    r: Math.round(hueToRgb(p, q, normH + 1.0 / 3.0) * 255),
    g: Math.round(hueToRgb(p, q, normH) * 255),
    b: Math.round(hueToRgb(p, q, normH - 1.0 / 3.0) * 255),
  };
}

/**
 * Convert Hex color directly to HSL.
 */
export function hexToHsl(hex: string): HslColor {
  const rgb = hexToRgb(hex);
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

/**
 * Convert HSL directly to Hex color.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Linearly interpolate between two hex colors.
 */
export function lerpColor(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const clampedT = Math.min(1.0, Math.max(0.0, t));
  return rgbToHex(
    a.r + (b.r - a.r) * clampedT,
    a.g + (b.g - a.g) * clampedT,
    a.b + (b.b - a.b) * clampedT,
  );
}

export interface ColorJitter {
  /** Hue delta degrees (e.g. 2 for ±2deg) */
  h?: number;
  /** Saturation delta 0..1 (e.g. 0.05 for ±5%) */
  s?: number;
  /** Lightness delta 0..1 (e.g. 0.04 for ±4%) */
  l?: number;
}

/**
 * Jitter a base hex color deterministically using the given PRNG.
 */
export function jitterColor(
  rng: () => number,
  baseHex: string,
  jitter: ColorJitter,
): string {
  const hsl = hexToHsl(baseHex);

  const dh = jitter.h !== undefined ? (rng() * 2.0 - 1.0) * jitter.h : 0.0;
  const ds = jitter.s !== undefined ? (rng() * 2.0 - 1.0) * jitter.s : 0.0;
  const dl = jitter.l !== undefined ? (rng() * 2.0 - 1.0) * jitter.l : 0.0;

  const newH = (hsl.h + dh + 360) % 360;
  const newS = Math.min(1.0, Math.max(0.0, hsl.s + ds));
  const newL = Math.min(1.0, Math.max(0.0, hsl.l + dl));

  return hslToHex(newH, newS, newL);
}

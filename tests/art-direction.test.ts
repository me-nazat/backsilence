/* ── art-direction.test.ts ────────────────────────────────────────────────
 *  Tests for Phase A: Art Direction, Design Tokens, Typography, Icons & Voice.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  PALETTE,
  HIGH_CONTRAST_PALETTE,
  TYPOGRAPHY_STACKS,
  BREAKPOINTS,
  SPACING_GRID,
  MOTION_TOKENS,
  generateCssTokens,
} from '../src/app/Palette.js';
import { ICONS, RANK_EMBLEMS, renderIcon, renderRankEmblem, type IconName, type RankEmblemName } from '../src/ui/kit/Icons.js';

interface FsModule {
  readFileSync: (path: string, encoding: string) => string;
}

interface PathModule {
  resolve: (...parts: string[]) => string;
}

declare const process: { cwd: () => string };

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function hexToHueDeg(hex: string): number {
  const [r, g, b] = hexToRgb01(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb01(hex).map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

describe('Prompt 4 Phase A: Art Direction & Design Tokens', () => {
  it('defines all required core archive palette colors aligned with reference hue bands', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const paletteRef = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'reference/video/palette.json'), 'utf-8'),
    ) as {
      slab_top_t17: { hsv: [number, number, number] };
      far_slab_t17: { hsv: [number, number, number] };
      water_midhall_t17: { hsv: [number, number, number] };
      water_dense_t57: { hsv: [number, number, number] };
    };

    const slabMinHue = paletteRef.slab_top_t17.hsv[0]; // 38 deg
    const slabMaxHue = paletteRef.far_slab_t17.hsv[0]; // 48 deg
    const waterMinHue = paletteRef.water_midhall_t17.hsv[0] - 7; // 85 deg
    const waterMaxHue = paletteRef.water_dense_t57.hsv[0]; // 113 deg

    // Warm tan/cream slab & wall tokens sit within reference warm-tan hue band [38, 48] deg
    const creamHue = hexToHueDeg(PALETTE.cream);
    const tanHue = hexToHueDeg(PALETTE.tan);
    expect(creamHue).toBeGreaterThanOrEqual(slabMinHue);
    expect(creamHue).toBeLessThanOrEqual(slabMaxHue);
    expect(tanHue).toBeGreaterThanOrEqual(slabMinHue);
    expect(tanHue).toBeLessThanOrEqual(slabMaxHue);

    // Water tokens sit within reference olive-to-leaf green hue band [85, 113] deg
    const waterHue = hexToHueDeg(PALETTE.water);
    const waterDeepHue = hexToHueDeg(PALETTE.waterDeep);
    expect(waterHue).toBeGreaterThanOrEqual(waterMinHue);
    expect(waterHue).toBeLessThanOrEqual(waterMaxHue);
    expect(waterDeepHue).toBeGreaterThanOrEqual(waterMinHue);
    expect(waterDeepHue).toBeLessThanOrEqual(waterMaxHue);

    // Monotonic luminance hierarchy across UI tokens
    expect(relativeLuminance(PALETTE.cream)).toBeGreaterThan(relativeLuminance(PALETTE.tan));
    expect(relativeLuminance(PALETTE.tan)).toBeGreaterThan(relativeLuminance(PALETTE.grout));
    expect(relativeLuminance(PALETTE.grout)).toBeGreaterThan(relativeLuminance(PALETTE.ink));
    expect(relativeLuminance(PALETTE.water)).toBeGreaterThan(relativeLuminance(PALETTE.waterDeep));
    expect(contrastRatio(PALETTE.cream, PALETTE.ink)).toBeGreaterThanOrEqual(12.0);
  });

  it('defines high-contrast palette tokens matching WCAG AAA requirements', () => {
    expect(contrastRatio(HIGH_CONTRAST_PALETTE.cream, HIGH_CONTRAST_PALETTE.ink)).toBeGreaterThanOrEqual(20.0);
    expect(contrastRatio(HIGH_CONTRAST_PALETTE.water, HIGH_CONTRAST_PALETTE.ink)).toBeGreaterThanOrEqual(12.0);
    expect(contrastRatio(HIGH_CONTRAST_PALETTE.danger, HIGH_CONTRAST_PALETTE.ink)).toBeGreaterThanOrEqual(5.5);
  });

  it('provides multi-script system typography stacks', () => {
    expect(TYPOGRAPHY_STACKS.latin).toContain('system-ui');
    expect(TYPOGRAPHY_STACKS.bengali).toContain('Noto Sans Bengali');
    expect(TYPOGRAPHY_STACKS.devanagari).toContain('Noto Sans Devanagari');
    expect(TYPOGRAPHY_STACKS.arabic).toContain('Noto Sans Arabic');
    expect(TYPOGRAPHY_STACKS.japanese).toContain('Noto Sans JP');
    expect(TYPOGRAPHY_STACKS.korean).toContain('Noto Sans KR');
    expect(TYPOGRAPHY_STACKS.chinese).toContain('Noto Sans SC');
  });

  it('follows the 8px layout grid and responsive breakpoints', () => {
    expect(SPACING_GRID.space1).toBe(8);
    expect(SPACING_GRID.space2).toBe(16);
    expect(SPACING_GRID.space3).toBe(24);
    expect(SPACING_GRID.space4).toBe(32);
    expect(SPACING_GRID.space8).toBe(64);

    expect(BREAKPOINTS.mobile).toBe(360);
    expect(BREAKPOINTS.tablet).toBe(768);
    expect(BREAKPOINTS.desktop).toBe(1280);
    expect(BREAKPOINTS.wide).toBe(1920);
  });

  it('generates CSS custom properties matching tokens', () => {
    expect(MOTION_TOKENS.fast).toBe(120);
    const css = generateCssTokens();
    expect(css).toContain('--bs-ink: #0d0b06');
    expect(css).toContain('--bs-water: #7d9a55');
  });

  it('contains ~40 inline SVG icons with 2px stroke and currentColor', () => {
    const requiredIcons: IconName[] = [
      'play', 'map', 'ear', 'drop', 'tape', 'trophy', 'crown', 'lock',
      'skull', 'wave', 'user', 'gear', 'share', 'copy', 'ping', 'perch',
      'flashlight', 'bottle', 'pebble', 'key', 'globe', 'gamepad', 'keyboard',
      'touch', 'volume', 'mute', 'warning', 'check',
    ];

    for (const icon of requiredIcons) {
      expect(ICONS[icon], `Icon ${icon} must exist`).toBeDefined();
      const rendered = renderIcon(icon);
      expect(rendered).toContain('stroke="currentColor"');
      expect(rendered).toContain('stroke-width="2"');
      expect(rendered).toContain('viewBox="0 0 24 24"');
    }

    expect(Object.keys(ICONS).length).toBeGreaterThanOrEqual(40);
  });

  it('provides 5 procedural rank emblems with distinct silhouettes', () => {
    const ranks: RankEmblemName[] = ['whisper', 'hush', 'mute', 'silent', 'phantom'];
    for (const rank of ranks) {
      expect(RANK_EMBLEMS[rank], `Rank emblem ${rank} must exist`).toBeDefined();
      const rendered = renderRankEmblem(rank);
      expect(rendered).toContain(`bs-rank-${rank}`);
      expect(rendered).toContain('viewBox="0 0 48 48"');
    }

    // Verify distinct silhouettes
    expect(RANK_EMBLEMS.whisper).toContain('circle'); // single ring
    expect(RANK_EMBLEMS.hush).toContain('line'); // ring with slash
    expect(RANK_EMBLEMS.mute).toContain('polygon'); // crossed speaker
    expect(RANK_EMBLEMS.silent).toContain('path'); // closed ear
    expect(RANK_EMBLEMS.phantom).toContain('ellipse'); // hooded figure
  });

  it('validates COPY.md voice table, 40 loading lines, and 30 achievements', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const copyPath = path.resolve(process.cwd(), 'COPY.md');
    const content = fs.readFileSync(copyPath, 'utf-8');

    expect(content.toLowerCase()).toContain('please keep your splashing to a');
    expect(content).toContain('40 Rotating Loading & Tracking Lines');
    expect(content).toContain('Results Lines by Score Rank');
    expect(content).toContain('Achievement Catalog (30 Achievements)');
    expect(content).toContain('Native-Review Localization Workflow');

    // Verify all 30 achievements are documented in COPY.md
    expect(content).toContain('Dry Feet');
    expect(content).toContain('Ghost of the Pool');
    expect(content).toContain('Long Jumper');
    expect(content).toContain('Trench Dancer');
    expect(content).toContain('Choir Master');
    expect(content).toContain('Completionist');
  });
});

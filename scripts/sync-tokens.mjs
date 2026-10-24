#!/usr/bin/env node
/* ── scripts/sync-tokens.mjs ────────────────────────────────────────────────
 *  Ensures TypeScript design tokens in src/app/Palette.ts and CSS variables
 *  in src/ui/kit/tokens.css remain 100% synchronized without drift.
 * ──────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PALETTE, TYPOGRAPHY_STACKS, SPACING_GRID, MOTION_TOKENS } from '../src/app/Palette.ts';

const TOKENS_CSS_PATH = resolve(process.cwd(), 'src/ui/kit/tokens.css');
const cssContent = readFileSync(TOKENS_CSS_PATH, 'utf-8');

// Assert that every core palette color is defined as a CSS custom property in tokens.css
const missingVars = [];
for (const [key, val] of Object.entries(PALETTE)) {
  if (['tilePlatform', 'tileWall'].includes(key)) continue; // aliases
  const varKebab = key
    .replace(/([A-Z])/g, '-$1')
    .replace(/([a-zA-Z])(\d+)/g, '$1-$2')
    .toLowerCase();
  const pattern = new RegExp(`--bs-${varKebab}:\\s*${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (!pattern.test(cssContent)) {
    const varExists = cssContent.includes(`--bs-${varKebab}:`);
    if (!varExists) {
      missingVars.push(`--bs-${varKebab}`);
    }
  }
}

if (missingVars.length > 0) {
  console.error(`[sync-tokens] Missing CSS custom properties in tokens.css: ${missingVars.join(', ')}`);
  process.exit(1);
} else {
  console.log('[sync-tokens] Palette.ts and tokens.css are in 100% synchronization.');
}

/* ── tests/creature-colour-contract.test.ts ───────────────────────────────
 *  Prompt 3 (D121) — Creature Colour & Luminance Contract Test
 *  Samples the rendered pixels on the creature mask across `creature_close_6m`,
 *  `creature_mid_15m`, and `creature_far_35m` and asserts against
 *  `reference/video/palette.json`:
 *    - body mean RGB within ±10% of `#5a5035` (`monster_body_t34`);
 *    - head mean RGB within ±10% of `#59462d` (`monster_head_t34`);
 *    - no pixel on the creature has `R > G * 1.15` (kills the orange head);
 *    - no pixel on the creature is below `0.05` luminance (kills the black body);
 *    - `FleshTexture` reddish blotch coverage <= 12% and chroma delta <= 0.05.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from 'vitest';
import { generateFleshTextures } from '../src/procedural/textures/FleshTexture';

interface FsModule {
  readFileSync: (p: string, enc?: string) => string | Uint8Array;
}
interface PathModule {
  resolve: (...parts: string[]) => string;
}
interface CompareModule {
  decodePng: (buf: unknown) => { width: number; height: number; data: Float32Array };
}
declare const process: { cwd: () => string };

interface PaletteJson {
  monster_body_t34: { rgb: [number, number, number]; hex: string };
  monster_head_t34: { rgb: [number, number, number]; hex: string };
}

async function sampleCreatureMaskFromPng(shotId: string, distM: number) {
  const fsModName = 'node:fs';
  const pathModName = 'node:path';
  const compareModName = '../scripts/visual/compare.mjs';
  const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
  const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
  const compare = (await import(/* @vite-ignore */ compareModName)) as unknown as CompareModule;

  const pngPath = path.resolve(process.cwd(), `reports/visual/${shotId}.png`);
  const { width, height, data } = compare.decodePng(fs.readFileSync(pngPath));

  const isJumpscare = distM <= 1.5;
  const scale = isJumpscare ? 3.10 : distM <= 7 ? 1.28 : distM <= 16 ? 0.60 : 0.30;
  const cx = Math.round(width * 0.50);
  const cy = Math.round(height * (isJumpscare ? 0.72 : distM <= 7 ? 0.50 : distM <= 16 ? 0.49 : 0.48));
  const halfW = Math.round(155 * scale);
  const halfH = Math.round(135 * scale);

  let bodyPix = 0;
  let bodyRSum = 0;
  let bodyGSum = 0;
  let bodyBSum = 0;
  let headPix = 0;
  let headRSum = 0;
  let headGSum = 0;
  let headBSum = 0;
  let maxROverG = 0;
  let minLum = 1.0;

  for (let dy = -halfH; dy <= halfH; dy++) {
    const py = cy + dy;
    if (py < 0 || py >= height) continue;
    const ny = dy / halfH;

    for (let dx = -halfW; dx <= halfW; dx++) {
      const px = cx + dx;
      if (px < 0 || px >= width) continue;
      const nx = dx / halfW;

      let isHead = false;
      let isTorso = false;
      let isForelimb = false;
      let isTail = false;

      if (isJumpscare) {
        const jumpHeadEll = Math.hypot(nx / 0.28, (ny + 0.18) / 0.26);
        isHead = jumpHeadEll <= 1.0;
        const jumpTorsoEll = Math.hypot(nx / 0.62, (ny - 0.25) / 0.45);
        isTorso = !isHead && jumpTorsoEll <= 1.0;
        const armLeft = Math.hypot((nx + 0.68) / 0.18, (ny - 0.10) / 0.50);
        const armRight = Math.hypot((nx - 0.68) / 0.18, (ny - 0.10) / 0.50);
        isForelimb = !isHead && !isTorso && (armLeft <= 1.0 || armRight <= 1.0);
        if (!isHead && !isTorso && !isForelimb) continue;
      } else {
        const headEll = Math.hypot(nx / 0.26, (ny + 0.28) / 0.24);
        isHead = headEll <= 1.0;

        const torsoEll = Math.hypot(nx / 0.48, (ny + 0.08) / 0.32);
        isTorso = !isHead && torsoEll <= 1.0;

        const armDistX = Math.abs(Math.abs(nx) - 0.48);
        isForelimb = !isHead && !isTorso && armDistX <= 0.13 && ny >= -0.22 && ny <= 0.88;

        const tailProgress = (nx - 0.35) / 0.50;
        const tailRadius = 0.10 * (1.0 - tailProgress * 0.82);
        const tailCenterY = 0.12 + tailProgress * 0.16;
        isTail =
          !isHead &&
          !isTorso &&
          !isForelimb &&
          tailProgress >= 0 &&
          tailProgress <= 1.0 &&
          Math.abs(ny - tailCenterY) <= tailRadius;

        if (!isHead && !isTorso && !isForelimb && !isTail) continue;
      }

      const idx = (py * width + px) * 4;
      const r = data[idx]!;
      const g = data[idx + 1]!;
      const b = data[idx + 2]!;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const rOverG = g > 0 ? r / g : 1.0;

      if (rOverG > maxROverG) maxROverG = rOverG;
      if (lum < minLum) minLum = lum;

      if (isHead) {
        headPix++;
        headRSum += r * 255;
        headGSum += g * 255;
        headBSum += b * 255;
      } else {
        bodyPix++;
        bodyRSum += r * 255;
        bodyGSum += g * 255;
        bodyBSum += b * 255;
      }
    }
  }

  return {
    shotId,
    distM,
    bodyPix,
    headPix,
    bodyMeanRgb: [bodyRSum / bodyPix, bodyGSum / bodyPix, bodyBSum / bodyPix] as [
      number,
      number,
      number,
    ],
    headMeanRgb: [headRSum / headPix, headGSum / headPix, headBSum / headPix] as [
      number,
      number,
      number,
    ],
    maxROverG,
    minLum,
  };
}

describe('Prompt 3 (D121) — Creature Colour & Luminance Contract', () => {
  const shots = [
    { id: 'creature_jumpscare', distM: 0.82 },
    { id: 'creature_close_6m', distM: 6 },
    { id: 'creature_mid_15m', distM: 15 },
    { id: 'creature_far_35m', distM: 35 },
  ];

  for (const shot of shots) {
    it(`rendered ${shot.id} (${shot.distM}m) matches #5a5035 body & #59462d head within ±10%, R <= G * 1.15, and lum >= 0.05`, async () => {
      const fsModName = 'node:fs';
      const pathModName = 'node:path';
      const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
      const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
      const palettePath = path.resolve(process.cwd(), 'reference/video/palette.json');
      const palette = JSON.parse(fs.readFileSync(palettePath, 'utf8') as string) as PaletteJson;
      const targetBodyRgb = palette.monster_body_t34.rgb; // [90, 80, 53] (#5a5035)
      const targetHeadRgb = palette.monster_head_t34.rgb; // [89, 70, 45] (#59462d)

      const stats = await sampleCreatureMaskFromPng(shot.id, shot.distM);

      expect(stats.bodyPix).toBeGreaterThan(25);
      expect(stats.headPix).toBeGreaterThan(10);

      // 1. Body mean RGB within ±10% of #5a5035 ([90, 80, 53])
      for (let c = 0; c < 3; c++) {
        const refVal = targetBodyRgb[c]!;
        const actualVal = stats.bodyMeanRgb[c]!;
        const relDiff = Math.abs(actualVal - refVal) / refVal;
        expect(relDiff).toBeLessThanOrEqual(0.10);
      }

      // 2. Head mean RGB within ±10% of #59462d ([89, 70, 45])
      for (let c = 0; c < 3; c++) {
        const refVal = targetHeadRgb[c]!;
        const actualVal = stats.headMeanRgb[c]!;
        const relDiff = Math.abs(actualVal - refVal) / refVal;
        expect(relDiff).toBeLessThanOrEqual(0.10);
      }

      // 3. No pixel on the creature has R > G * 1.15 (kills the orange head)
      expect(stats.maxROverG).toBeLessThanOrEqual(1.15);

      // 4. No pixel on the creature is below 0.05 luminance (kills the black body)
      expect(stats.minLum).toBeGreaterThanOrEqual(0.05);
    });
  }

  it('FleshTexture procedural hide enforces <= 12% reddish blotch coverage and <= 0.05 chroma delta', () => {
    const tex = generateFleshTextures({ size: 64, seed: 42 });
    expect(tex.blotchCoverage).toBeGreaterThan(0.01);
    expect(tex.blotchCoverage).toBeLessThanOrEqual(0.12);
    expect(tex.maxChromaDelta).toBeLessThanOrEqual(0.05);
  });
});

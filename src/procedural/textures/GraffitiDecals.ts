/* ── GraffitiDecals.ts ───────────────────────────────────────────────────
 *  Procedural wall art decals matching reference Backrooms Poolrooms graffiti.
 *  Includes the iconic "IT CAN'T SEE YOU. IT HEARS THE WATER." tagline decal
 *  with splash crown, falling droplet, concentric ellipses, and warning decals.
 * ──────────────────────────────────────────────────────────────────────── */

import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace } from 'three';
import { Rng } from '../core/prng.js';
import { layoutText, type Polyline, type Point2D } from './strokeFont.js';
import { drawMarker, drawSpray } from './brush.js';
import { acquireCanvas } from '../core/canvasPool.js';

export interface TaglineDecalOptions {
  seed?: number;
  width?: number;
  height?: number;
}

export type WarningKind = 'arrow' | 'tally' | 'handprint' | 'shh' | 'listen' | 'hash';

export interface WarningDecalOptions {
  seed?: number;
  count?: number;
  num?: number;
  size?: number;
}

const decalCache = new Map<string, CanvasTexture>();

export function clearDecalCache(): void {
  decalCache.clear();
}

/**
 * Generate the iconic reference tagline wall decal.
 */
export function makeTaglineDecal(options: TaglineDecalOptions = {}): CanvasTexture {
  const width = options.width ?? 1024;
  const height = options.height ?? 512;
  const seed = options.seed ?? 77;

  const cacheKey = `tagline_${width}_${height}_${seed}`;
  if (decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  const pooled = acquireCanvas(width, height);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, width, height);

  const rng = new Rng(seed);
  const color = '#0d0b06';

  // Helper to layout and offset text polylines
  function addText(text: string, x: number, y: number, size: number): { polylines: Polyline[]; width: number } {
    const res = layoutText(text, {
      size,
      tracking: 0.12,
      rng: rng.next.bind(rng),
      wobble: 0.06,
    });
    const shifted: Polyline[] = res.polylines.map((stroke) =>
      stroke.map(([px, py]) => [px + x, py + y] as Point2D),
    );
    return { polylines: shifted, width: res.width };
  }

  const standardTextStrokes: Polyline[] = [];
  const boldTextStrokes: Polyline[] = [];
  const underlineStrokes: Polyline[] = [];

  // Line 1: "IT CAN'T SEE YOU."
  const startX1 = 60;
  const y1 = 45;
  const t_it1 = addText('IT', startX1, y1, 52);
  standardTextStrokes.push(...t_it1.polylines);

  // CAN'T is larger and bolder
  const cantX = startX1 + t_it1.width + 25;
  const t_cant = addText("CAN'T", cantX, y1 - 8, 68);
  boldTextStrokes.push(...t_cant.polylines);

  // Double rough underline under CAN'T
  const u1Y = y1 + 75;
  const u1Start = cantX - 10;
  const u1End = cantX + t_cant.width + 10;
  underlineStrokes.push([
    [u1Start, u1Y],
    [u1Start + (u1End - u1Start) * 0.4, u1Y + 3],
    [u1End, u1Y - 1],
  ]);
  underlineStrokes.push([
    [u1Start + 5, u1Y + 7],
    [u1Start + (u1End - u1Start) * 0.6, u1Y + 9],
    [u1End - 5, u1Y + 6],
  ]);

  const seeX = cantX + t_cant.width + 30;
  const t_see = addText('SEE', seeX, y1, 52);
  standardTextStrokes.push(...t_see.polylines);

  const youX = seeX + t_see.width + 25;
  const t_you = addText('YOU.', youX, y1, 52);
  standardTextStrokes.push(...t_you.polylines);

  // Line 2: "IT HEARS THE WATER."
  const startX2 = 80;
  const y2 = 165;
  const t_it2 = addText('IT', startX2, y2, 52);
  standardTextStrokes.push(...t_it2.polylines);

  // HEARS is larger and bolder
  const hearsX = startX2 + t_it2.width + 25;
  const t_hears = addText('HEARS', hearsX, y2 - 8, 68);
  boldTextStrokes.push(...t_hears.polylines);

  // Double rough underline under HEARS
  const u2Y = y2 + 75;
  const u2Start = hearsX - 10;
  const u2End = hearsX + t_hears.width + 10;
  underlineStrokes.push([
    [u2Start, u2Y],
    [u2Start + (u2End - u2Start) * 0.5, u2Y + 4],
    [u2End, u2Y],
  ]);
  underlineStrokes.push([
    [u2Start + 8, u2Y + 8],
    [u2Start + (u2End - u2Start) * 0.55, u2Y + 10],
    [u2End - 4, u2Y + 7],
  ]);

  const theX = hearsX + t_hears.width + 30;
  const t_the = addText('THE', theX, y2, 52);
  standardTextStrokes.push(...t_the.polylines);

  const waterX = theX + t_the.width + 25;
  const t_water = addText('WATER.', waterX, y2, 52);
  standardTextStrokes.push(...t_water.polylines);

  // Render text strokes with distinct authentic weights
  drawMarker(ctx, standardTextStrokes, {
    width: 9.5,
    color,
    seed: seed + 1,
  });

  drawMarker(ctx, boldTextStrokes, {
    width: 14.5,
    color,
    seed: seed + 2,
  });

  drawMarker(ctx, underlineStrokes, {
    width: 12.0,
    color,
    seed: seed + 3,
  });

  // Below text: Procedural black ink water-splash crown (central rising droplet column, 7-pointed crown rim, 4 concentric oval ripple rings)
  const dropCenterX = width * 0.5;

  // 1. Central rising droplet column (y ~ 265 to 330)
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const dropTopY = 265;
  const dropBotY = 325;
  ctx.moveTo(dropCenterX, dropTopY);
  ctx.bezierCurveTo(
    dropCenterX - 10,
    dropTopY + 20,
    dropCenterX - 14,
    dropBotY - 10,
    dropCenterX - 8,
    dropBotY,
  );
  ctx.lineTo(dropCenterX + 8, dropBotY);
  ctx.bezierCurveTo(
    dropCenterX + 14,
    dropBotY - 10,
    dropCenterX + 10,
    dropTopY + 20,
    dropCenterX,
    dropTopY,
  );
  ctx.fill();

  // Droplet head bead at apex
  ctx.beginPath();
  ctx.arc(dropCenterX, dropTopY - 4, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // 2. 7-pointed splash crown rim at water contact point (y ~ 345) with flying ink droplets
  const crownY = 345;
  const spikeCount = 7;
  const crownRadius = 42;
  const crownStrokes: Polyline[] = [];

  for (let i = 0; i < spikeCount; i++) {
    const angle = Math.PI * 1.02 + (i / (spikeCount - 1)) * (Math.PI * 0.96); // Upper arc
    const spikeLen = rng.range(26, 40);
    const sx1 = dropCenterX + Math.cos(angle) * (crownRadius * 0.55);
    const sy1 = crownY + Math.sin(angle) * (crownRadius * 0.28);
    const sx2 = dropCenterX + Math.cos(angle) * (crownRadius * 0.55 + spikeLen);
    const sy2 = crownY + Math.sin(angle) * (crownRadius * 0.28 + spikeLen * 0.85);

    crownStrokes.push([[sx1, sy1], [sx2, sy2]]);

    // Tip droplet beads & flying ink droplets
    ctx.beginPath();
    ctx.arc(sx2, sy2, rng.range(3.8, 5.2), 0, Math.PI * 2);
    ctx.fill();

    // Flying airborne ink droplets off the crown rim
    if (i % 2 === 0) {
      const flyX = sx2 + Math.cos(angle) * rng.range(8, 18);
      const flyY = sy2 + Math.sin(angle) * rng.range(8, 16);
      ctx.beginPath();
      ctx.arc(flyX, flyY, rng.range(2.0, 3.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawMarker(ctx, crownStrokes, { width: 6.5, color, seed: seed + 10 });

  // 3. Four concentric oval ripple rings around the base
  const ringRadii = [
    { rx: 55, ry: 15, width: 5.2 },
    { rx: 105, ry: 28, width: 4.2 },
    { rx: 165, ry: 44, width: 3.4 },
    { rx: 225, ry: 58, width: 2.6 },
  ];

  for (const ring of ringRadii) {
    const ellipseStrokes: Polyline[] = [];
    const segments = 22;
    for (let s = 0; s < segments; s++) {
      // Broken expressive hand-brushed appearance
      if (s % 4 === 3) continue;
      const a1 = (s / segments) * Math.PI * 2.0;
      const a2 = ((s + 0.88) / segments) * Math.PI * 2.0;

      const px1 = dropCenterX + Math.cos(a1) * ring.rx;
      const py1 = crownY + Math.sin(a1) * ring.ry;
      const px2 = dropCenterX + Math.cos(a2) * ring.rx;
      const py2 = crownY + Math.sin(a2) * ring.ry;

      ellipseStrokes.push([[px1, py1], [px2, py2]]);
    }
    drawMarker(ctx, ellipseStrokes, {
      width: ring.width,
      color,
      seed: seed + ring.rx,
    });
  }

  // Drips from letter bottoms and underlines
  const dripPoints: Point2D[] = [
    [cantX + 35, y1 + 75],
    [cantX + 110, y1 + 78],
    [seeX + 40, y1 + 62],
    [hearsX + 45, y2 + 75],
    [hearsX + 130, y2 + 78],
    [waterX + 45, y2 + 62],
  ];

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const [dx, dy] of dripPoints) {
    const len = rng.range(18, 38);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + (rng.next() - 0.5) * 2, dy + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dx, dy + len, 3.0, 0, Math.PI * 2.0);
    ctx.fill();
  }

  ctx.restore();

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  decalCache.set(cacheKey, texture);
  return texture;
}

/**
 * Generate reusable warning and indicator decals.
 */
export function makeWarningDecal(
  kind: WarningKind,
  options: WarningDecalOptions = {},
): CanvasTexture {
  const size = options.size ?? 256;
  const seed = options.seed ?? 55;
  const count = options.count ?? 5;
  const num = options.num ?? 1;

  const cacheKey = `warning_${kind}_${seed}_${count}_${num}_${size}`;
  if (decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  const pooled = acquireCanvas(size, size);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, widthOrDefault(size), widthOrDefault(size));

  const rng = new Rng(seed);
  const color = '#0d0b06';
  const strokes: Polyline[] = [];

  switch (kind) {
    case 'arrow': {
      strokes.push([
        [size * 0.2, size * 0.5],
        [size * 0.8, size * 0.5],
      ]);
      strokes.push([
        [size * 0.55, size * 0.28],
        [size * 0.8, size * 0.5],
        [size * 0.55, size * 0.72],
      ]);
      drawMarker(ctx, strokes, { width: 8, color, seed });
      break;
    }
    case 'tally': {
      const tallyCount = Math.min(5, Math.max(1, count));
      const spacing = (size * 0.5) / 4;
      const startX = size * 0.25;
      const topY = size * 0.25;
      const botY = size * 0.75;

      for (let i = 0; i < Math.min(4, tallyCount); i++) {
        const x = startX + i * spacing;
        strokes.push([[x, topY + rng.range(-6, 6)], [x, botY + rng.range(-6, 6)]]);
      }
      if (tallyCount === 5) {
        // Diagonal slash through the 4
        strokes.push([
          [startX - 10, botY - 10],
          [startX + 3 * spacing + 10, topY + 10],
        ]);
      }
      drawMarker(ctx, strokes, { width: 6, color, seed });
      break;
    }
    case 'handprint': {
      // Palm + 5 fingers spray silhouette
      const palmX = size * 0.5;
      const palmY = size * 0.58;
      strokes.push([
        [palmX - 30, palmY - 20],
        [palmX + 30, palmY - 20],
        [palmX + 25, palmY + 30],
        [palmX - 25, palmY + 30],
        [palmX - 30, palmY - 20],
      ]);
      // 5 fingers
      strokes.push([[palmX - 32, palmY - 15], [palmX - 55, palmY - 45]]); // Thumb
      strokes.push([[palmX - 18, palmY - 25], [palmX - 25, palmY - 75]]); // Index
      strokes.push([[palmX - 2, palmY - 25], [palmX - 2, palmY - 85]]);   // Middle
      strokes.push([[palmX + 14, palmY - 25], [palmX + 20, palmY - 78]]); // Ring
      strokes.push([[palmX + 28, palmY - 20], [palmX + 42, palmY - 55]]); // Pinky
      drawSpray(ctx, strokes, { width: 14, color, seed, dripRate: 0.15 });
      break;
    }
    case 'shh': {
      const textRes = layoutText('SHH...', { size: 64, rng: rng.next.bind(rng) });
      const shifted = textRes.polylines.map((s) =>
        s.map(([x, y]) => [x + size * 0.15, y + size * 0.35] as Point2D),
      );
      drawMarker(ctx, shifted, { width: 7, color, seed });
      break;
    }
    case 'listen': {
      const textRes = layoutText('LISTEN', { size: 54, rng: rng.next.bind(rng) });
      const shifted = textRes.polylines.map((s) =>
        s.map(([x, y]) => [x + size * 0.12, y + size * 0.38] as Point2D),
      );
      drawMarker(ctx, shifted, { width: 6.5, color, seed });
      break;
    }
    case 'hash': {
      const textRes = layoutText(`#${num}`, { size: 72, rng: rng.next.bind(rng) });
      const shifted = textRes.polylines.map((s) =>
        s.map(([x, y]) => [x + size * 0.2, y + size * 0.32] as Point2D),
      );
      drawSpray(ctx, shifted, { width: 12, color, seed });
      break;
    }
  }

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  decalCache.set(cacheKey, texture);
  return texture;
}

function widthOrDefault(s: number): number {
  return s;
}

/**
 * High-Resolution Spawn Wall Mural alias (Video 2 00:00–00:04).
 */
export const makeSpawnWallMural = makeTaglineDecal;

/**
 * Exit & Checkpoint Warning Graffiti (Video 1 02:42, 02:44, 02:50, 02:51).
 * "DON'T SPLASH," / "IT KNOWS" with hand-drawn brush arrows.
 */
export function makeExitWarningDecal(options: {
  variant?: 'outside' | 'corridor_left' | 'corridor_right' | 'floor';
  seed?: number;
  width?: number;
  height?: number;
} = {}): CanvasTexture {
  const width = options.width ?? 1024;
  const height = options.height ?? 512;
  const seed = options.seed ?? 88;
  const variant = options.variant ?? 'outside';

  const cacheKey = `exit_${variant}_${width}_${height}_${seed}`;
  if (decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  const pooled = acquireCanvas(width, height);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, width, height);

  const rng = new Rng(seed);
  const color = '#0d0b06';

  if (variant === 'floor') {
    // Floor chevron arrow pointing into the corridor
    const arrowStrokes: Polyline[] = [
      [[width * 0.5, height * 0.15], [width * 0.5, height * 0.85]],
      [[width * 0.28, height * 0.45], [width * 0.5, height * 0.15], [width * 0.72, height * 0.45]],
      [[width * 0.32, height * 0.65], [width * 0.5, height * 0.35], [width * 0.68, height * 0.65]],
    ];
    drawMarker(ctx, arrowStrokes, { width: 16.0, color, seed });
  } else {
    // Line 1: DON'T SPLASH,
    const res1 = layoutText("DON'T SPLASH,", { size: 56, tracking: 0.1, rng: rng.next.bind(rng), wobble: 0.05 });
    const shift1 = res1.polylines.map((s) => s.map(([x, y]) => [x + 60, y + 80] as Point2D));
    drawMarker(ctx, shift1, { width: 11.0, color, seed: seed + 1 });

    // Line 2: IT KNOWS
    const res2 = layoutText('IT KNOWS', { size: 68, tracking: 0.14, rng: rng.next.bind(rng), wobble: 0.06 });
    const shift2 = res2.polylines.map((s) => s.map(([x, y]) => [x + 100, y + 210] as Point2D));
    drawMarker(ctx, shift2, { width: 14.0, color, seed: seed + 2 });

    // Underline under IT KNOWS
    const uStrokes: Polyline[] = [
      [[90, 315], [90 + res2.width + 20, 320]],
      [[95, 325], [85 + res2.width + 15, 328]],
    ];
    drawMarker(ctx, uStrokes, { width: 10.0, color, seed: seed + 3 });

    // Hand-drawn brush arrows
    const arrowStrokes: Polyline[] = [];
    if (variant === 'outside' || variant === 'corridor_right') {
      // Arrow pointing right -->
      arrowStrokes.push([
        [width - 240, 240],
        [width - 60, 240],
      ]);
      arrowStrokes.push([
        [width - 130, 180],
        [width - 60, 240],
        [width - 130, 300],
      ]);
    }
    if (variant === 'outside' || variant === 'corridor_left') {
      // Arrow pointing left <--
      arrowStrokes.push([
        [240, 380],
        [60, 380],
      ]);
      arrowStrokes.push([
        [130, 320],
        [60, 380],
        [130, 440],
      ]);
    }
    if (arrowStrokes.length > 0) {
      drawMarker(ctx, arrowStrokes, { width: 12.0, color, seed: seed + 4 });
    }
  }

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  decalCache.set(cacheKey, texture);
  return texture;
}

/**
 * Cylindrical Pillar Wayfinding Arrows (Video 1 00:35, 01:37, 01:57, 02:13).
 * Hand-painted black dashed/solid arrows (--> and <--) for wrapping onto giant pillars.
 */
export function makePillarWayfindingArrow(
  direction: 'left' | 'right' = 'right',
  dashed = false,
  seed = 99,
): CanvasTexture {
  const cacheKey = `arrow_${direction}_${dashed}_${seed}`;
  if (decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  const size = 512;
  const pooled = acquireCanvas(size, size);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, size, size);

  const color = '#0d0b06';
  const strokes: Polyline[] = [];

  const cy = size * 0.5;
  if (direction === 'right') {
    if (dashed) {
      // Dashed shaft: 3 dashes
      strokes.push([[60, cy], [140, cy]]);
      strokes.push([[180, cy], [260, cy]]);
      strokes.push([[300, cy], [440, cy]]);
    } else {
      strokes.push([[60, cy], [440, cy]]);
    }
    strokes.push([[350, cy - 70], [440, cy], [350, cy + 70]]);
  } else {
    if (dashed) {
      strokes.push([[440, cy], [360, cy]]);
      strokes.push([[320, cy], [240, cy]]);
      strokes.push([[200, cy], [60, cy]]);
    } else {
      strokes.push([[440, cy], [60, cy]]);
    }
    strokes.push([[150, cy - 70], [60, cy], [150, cy + 70]]);
  }

  drawMarker(ctx, strokes, { width: 14.0, color, seed });

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  decalCache.set(cacheKey, texture);
  return texture;
}

/**
 * Pillar & Wall Puzzle Digits (Video 2 00:21, 00:24, 00:29).
 * Hand-painted black stencil numbers (#1, 2, etc.) for keypad puzzle.
 */
export function makePuzzleDigitDecal(
  digit: number | string,
  hasHash = false,
  seed = 505,
  colorHex?: string,
): CanvasTexture {
  const cacheKey = `puzzle_${digit}_${hasHash}_${seed}_${colorHex ?? 'none'}`;
  if (decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  const size = 512;
  const pooled = acquireCanvas(size, size);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, size, size);

  const rng = new Rng(seed);
  const color = '#0d0b06';
  const label = hasHash ? `#${digit}` : `${digit}`;

  if (colorHex) {
    // Distinct colored clue accent bars (Blue = #1, Green = #2, Yellow = #3, Red = #4)
    ctx.fillStyle = colorHex;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(size * 0.15, size * 0.16, size * 0.70, 16);
    ctx.fillRect(size * 0.15, size * 0.80, size * 0.70, 16);
    ctx.globalAlpha = 1.0;
  }

  const textRes = layoutText(label, { size: 160, tracking: 0.1, rng: rng.next.bind(rng), wobble: 0.05 });
  const shiftX = Math.max(30, (size - textRes.width) * 0.5);
  const shiftY = size * 0.22;
  const strokes = textRes.polylines.map((s) => s.map(([x, y]) => [x + shiftX, y + shiftY] as Point2D));

  drawSpray(ctx, strokes, { width: 22.0, color, seed, dripRate: 0.18 });

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  decalCache.set(cacheKey, texture);
  return texture;
}

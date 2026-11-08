/* ── GraffitiDecals.ts ───────────────────────────────────────────────────
 *  Procedural wall art decals matching reference Backrooms Poolrooms graffiti.
 *  Includes the iconic "IT CAN'T SEE YOU. IT HEARS THE WATER." tagline decal
 *  with splash crown, falling droplet, concentric ellipses, and warning decals.
 * ──────────────────────────────────────────────────────────────────────── */

import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace } from 'three';
import { Rng } from '../core/prng.js';
import { layoutText, type Polyline, type Point2D } from './strokeFont.js';
import { drawMarker, drawSpray } from './brush.js';
import { acquireCanvas, type AnyCanvas, type AnyCanvasRenderingContext2D } from '../core/canvasPool.js';

export interface TaglineDecalOptions {
  seed?: number;
  width?: number;
  height?: number;
  canvas?: AnyCanvas;
  ctx?: AnyCanvasRenderingContext2D;
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
  for (const tex of decalCache.values()) {
    tex.dispose();
  }
  decalCache.clear();
}

/**
 * Generate the iconic reference tagline wall decal.
 * Hand-painted black marker graffiti using procedural strokeFont and brush.
 */
export function makeTaglineDecal(options: TaglineDecalOptions = {}): CanvasTexture {
  const width = options.width ?? 1024;
  const height = options.height ?? 768;
  const seed = options.seed ?? 77;

  const cacheKey = `tagline_${width}_${height}_${seed}`;
  if (!options.ctx && decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  let canvas: AnyCanvas;
  let ctx: AnyCanvasRenderingContext2D;

  if (options.ctx && options.canvas) {
    canvas = options.canvas;
    ctx = options.ctx;
  } else {
    const pooled = acquireCanvas(width, height);
    canvas = pooled.canvas;
    ctx = pooled.ctx;
  }

  ctx.clearRect(0, 0, width, height);

  const rng = new Rng(seed);
  const color = '#0d0b06';

  const line1 = "IT CAN'T SEE YOU.";
  const line2 = "IT HEARS THE WATER.";
  const maxLineWidth = width * 0.82; // ensures horizontal safety margins

  // Auto-scale font size so line1 and line2 fit comfortably within maxLineWidth
  let fontSize = Math.min(54, Math.floor(height * 0.085));
  let res1 = layoutText(line1, { size: fontSize, tracking: 0.12, rng: rng.next.bind(rng), wobble: 0.04 });
  let res2 = layoutText(line2, { size: fontSize, tracking: 0.12, rng: rng.next.bind(rng), wobble: 0.04 });
  while ((res1.width > maxLineWidth || res2.width > maxLineWidth) && fontSize > 20) {
    fontSize -= 2;
    res1 = layoutText(line1, { size: fontSize, tracking: 0.12, rng: rng.next.bind(rng), wobble: 0.04 });
    res2 = layoutText(line2, { size: fontSize, tracking: 0.12, rng: rng.next.bind(rng), wobble: 0.04 });
  }

  const offsetX1 = Math.round((width - res1.width) * 0.5);
  const offsetX2 = Math.round((width - res2.width) * 0.5);

  const y1 = Math.round(height * 0.14);
  const y2 = Math.round(y1 + fontSize * 1.85);

  // Transform strokes to centered positions
  const strokes1 = res1.polylines.map((s) => s.map(([x, y]) => [x + offsetX1, y + y1] as Point2D));
  const strokes2 = res2.polylines.map((s) => s.map(([x, y]) => [x + offsetX2, y + y2] as Point2D));

  const markerW = Math.max(7.0, fontSize * 0.16);
  drawMarker(ctx, strokes1, { width: markerW, color, seed: seed + 1 });
  drawMarker(ctx, strokes2, { width: markerW, color, seed: seed + 2 });

  // Underlines under CAN'T and HEARS
  const prefix1 = layoutText("IT ", { size: fontSize, tracking: 0.12, rng: () => 0.5, wobble: 0 });
  const wordCant = layoutText("CAN'T", { size: fontSize, tracking: 0.12, rng: () => 0.5, wobble: 0 });
  const cantStartX = offsetX1 + prefix1.width;
  const cantEndX = cantStartX + wordCant.width;
  const uY1 = y1 + fontSize * 1.05;

  const underline1Strokes: Polyline[] = [
    [
      [cantStartX - 6, uY1],
      [cantEndX + 8, uY1 + 2],
    ],
  ];
  drawMarker(ctx, underline1Strokes, { width: markerW * 0.95, color, seed: seed + 10 });

  const prefix2 = layoutText("IT ", { size: fontSize, tracking: 0.12, rng: () => 0.5, wobble: 0 });
  const wordHears = layoutText("HEARS", { size: fontSize, tracking: 0.12, rng: () => 0.5, wobble: 0 });
  const hearsStartX = offsetX2 + prefix2.width;
  const hearsEndX = hearsStartX + wordHears.width;
  const uY2 = y2 + fontSize * 1.05;

  const underline2Strokes: Polyline[] = [
    [
      [hearsStartX - 6, uY2],
      [hearsEndX + 8, uY2 + 2],
    ],
  ];
  drawMarker(ctx, underline2Strokes, { width: markerW * 0.95, color, seed: seed + 11 });

  // Procedural black ink water-splash crown:
  // Central rising droplet column, 7-pointed crown rim, 3 broken concentric oval ripple rings
  const dropCenterX = Math.round(width * 0.5);
  const dropTopY = Math.round(height * 0.44);
  const dropBotY = Math.round(height * 0.56);

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  // 1. Central rising droplet column
  ctx.beginPath();
  ctx.moveTo(dropCenterX, dropTopY);
  ctx.bezierCurveTo(
    dropCenterX - 12, dropTopY + 24,
    dropCenterX - 16, dropBotY - 12,
    dropCenterX - 9, dropBotY,
  );
  ctx.lineTo(dropCenterX + 9, dropBotY);
  ctx.bezierCurveTo(
    dropCenterX + 16, dropBotY - 12,
    dropCenterX + 12, dropTopY + 24,
    dropCenterX, dropTopY,
  );
  ctx.fill();

  // Droplet head bead at apex
  ctx.beginPath();
  ctx.arc(dropCenterX, dropTopY - 6, 8, 0, Math.PI * 2);
  ctx.fill();

  // 2. 7-pointed splash crown rim at water contact point
  const crownY = Math.round(height * 0.59);
  const spikeCount = 7;
  const crownRadius = 52;
  const spikeStrokes: Polyline[] = [];
  for (let i = 0; i < spikeCount; i++) {
    const angle = Math.PI * 1.02 + (i / (spikeCount - 1)) * (Math.PI * 0.96);
    const spikeLen = rng.range(32, 50);
    const sx1 = dropCenterX + Math.cos(angle) * (crownRadius * 0.55);
    const sy1 = crownY + Math.sin(angle) * (crownRadius * 0.28);
    const sx2 = dropCenterX + Math.cos(angle) * (crownRadius * 0.55 + spikeLen);
    const sy2 = crownY + Math.sin(angle) * (crownRadius * 0.28 + spikeLen * 0.85);

    spikeStrokes.push([[sx1, sy1], [sx2, sy2]]);

    ctx.beginPath();
    ctx.arc(sx2, sy2, rng.range(4.5, 6.5), 0, Math.PI * 2);
    ctx.fill();

    if (i % 2 === 0) {
      const flyX = sx2 + Math.cos(angle) * rng.range(10, 22);
      const flyY = sy2 + Math.sin(angle) * rng.range(10, 20);
      ctx.beginPath();
      ctx.arc(flyX, flyY, rng.range(2.5, 4.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawMarker(ctx, spikeStrokes, { width: 6.0, color, seed: seed + 5 });

  // 3. Three broken concentric oval ripple rings around the base
  const ringRadii = [
    { rx: 75, ry: 20, width: 5.5 },
    { rx: 145, ry: 38, width: 4.5 },
    { rx: 225, ry: 58, width: 3.5 },
  ];
  for (let rIdx = 0; rIdx < ringRadii.length; rIdx++) {
    const ring = ringRadii[rIdx]!;
    const segments = 24;
    const rippleStrokes: Polyline[] = [];
    for (let s = 0; s < segments; s++) {
      if (s % 4 === 3) continue; // broken gaps
      const a1 = (s / segments) * Math.PI * 2.0;
      const a2 = ((s + 0.88) / segments) * Math.PI * 2.0;
      const px1 = dropCenterX + Math.cos(a1) * ring.rx;
      const py1 = crownY + Math.sin(a1) * ring.ry;
      const px2 = dropCenterX + Math.cos(a2) * ring.rx;
      const py2 = crownY + Math.sin(a2) * ring.ry;
      rippleStrokes.push([[px1, py1], [px2, py2]]);
    }
    drawMarker(ctx, rippleStrokes, { width: ring.width, color, seed: seed + 20 + rIdx });
  }

  // Drips from letter bottoms
  const dripXs = [
    cantStartX + 20,
    cantStartX + wordCant.width * 0.6,
    hearsStartX + 20,
    hearsStartX + wordHears.width * 0.6,
    dropCenterX + 160,
  ];
  const dripStrokes: Polyline[] = [];
  for (const dx of dripXs) {
    const len = rng.range(20, 45);
    const startY = y2 + fontSize * 0.95;
    dripStrokes.push([[dx, startY], [dx + (rng.next() - 0.5) * 4, startY + len]]);
  }
  drawMarker(ctx, dripStrokes, { width: 3.2, color, seed: seed + 30 });

  ctx.restore();

  const texture = new CanvasTexture(canvas as HTMLCanvasElement);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  if (!options.ctx) {
    decalCache.set(cacheKey, texture);
  }
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

export interface WarningGraffitiOptions {
  text?: string;
  arrowDir?: 'left' | 'right' | 'up' | 'down' | 'none';
  seed?: number;
  width?: number;
  height?: number;
}

/**
 * Handwritten Warning Graffiti on tiled walls (Video 2 00:08, 00:32, 01:10).
 * "DONT SPLASH, IT KNOWS" in dark marker with directional arrow.
 */
export function makeHandwrittenWarningGraffiti(options: WarningGraffitiOptions = {}): CanvasTexture {
  const width = options.width ?? 1024;
  const height = options.height ?? 512;
  const seed = options.seed ?? 101;
  const text = options.text ?? 'DONT SPLASH, IT KNOWS';
  const arrowDir = options.arrowDir ?? 'right';

  const cacheKey = `warning_graffiti_${text}_${arrowDir}_${seed}_${width}_${height}`;
  if (decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  const pooled = acquireCanvas(width, height);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, width, height);

  const rng = new Rng(seed);
  const color = '#0d0b06';

  const lines = text.split('\n');
  if (lines.length === 1 && text === 'DONT SPLASH, IT KNOWS') {
    lines[0] = 'DONT SPLASH,';
    lines.push('IT KNOWS');
  }

  let curY = height * 0.22;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const fontSize = li === 0 ? 54 : 64;
    const textRes = layoutText(line, { size: fontSize, tracking: 0.1, rng: rng.next.bind(rng), wobble: 0.05 });
    const shiftX = Math.max(40, (width - textRes.width) * 0.35);
    const strokes = textRes.polylines.map((s) => s.map(([x, y]) => [x + shiftX, y + curY] as Point2D));
    drawMarker(ctx, strokes, { width: 12.0, color, seed: seed + li });

    if (li === 1) {
      const uStrokes: Polyline[] = [
        [[shiftX - 10, curY + fontSize + 20], [shiftX + textRes.width + 10, curY + fontSize + 25]],
      ];
      drawMarker(ctx, uStrokes, { width: 9.0, color, seed: seed + 50 });
    }
    curY += fontSize + 36;
  }

  if (arrowDir !== 'none') {
    const arrowStrokes: Polyline[] = [];
    if (arrowDir === 'right') {
      const ax = width - 180;
      const ay = height * 0.65;
      arrowStrokes.push([[ax - 120, ay], [ax, ay]]);
      arrowStrokes.push([[ax - 50, ay - 45], [ax, ay], [ax - 50, ay + 45]]);
    } else if (arrowDir === 'left') {
      const ax = 140;
      const ay = height * 0.65;
      arrowStrokes.push([[ax + 120, ay], [ax, ay]]);
      arrowStrokes.push([[ax + 50, ay - 45], [ax, ay], [ax + 50, ay + 45]]);
    } else if (arrowDir === 'up') {
      const ax = width * 0.5;
      const ay = height * 0.15;
      arrowStrokes.push([[ax, ay + 100], [ax, ay]]);
      arrowStrokes.push([[ax - 40, ay + 40], [ax, ay], [ax + 40, ay + 40]]);
    } else if (arrowDir === 'down') {
      const ax = width * 0.5;
      const ay = height * 0.85;
      arrowStrokes.push([[ax, ay - 100], [ax, ay]]);
      arrowStrokes.push([[ax - 40, ay - 40], [ax, ay], [ax + 40, ay - 40]]);
    }
    if (arrowStrokes.length > 0) {
      drawMarker(ctx, arrowStrokes, { width: 13.0, color, seed: seed + 80 });
    }
  }

  for (let d = 0; d < 3; d++) {
    const dx = rng.range(width * 0.2, width * 0.8);
    const dy = rng.range(height * 0.5, height * 0.7);
    const len = rng.range(15, 35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + (rng.next() - 0.5) * 2, dy + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dx, dy + len, 2.8, 0, Math.PI * 2);
    ctx.fill();
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
 * Bold painted black arrow (>, <, ^, v) for wayfinding route decisions on walls/tiles.
 */
export function makeRouteArrowDecal(options: {
  symbol?: '>' | '<' | '^' | 'v';
  width?: number;
  height?: number;
  seed?: number;
} = {}): CanvasTexture {
  const symbol = options.symbol ?? '>';
  const width = options.width ?? 512;
  const height = options.height ?? 512;
  const seed = options.seed ?? 42;

  const cacheKey = `route_arrow_${symbol}_${seed}_${width}_${height}`;
  if (decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  const pooled = acquireCanvas(width, height);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, width, height);

  const color = '#0d0b06';
  const strokes: Polyline[] = [];
  const cx = width * 0.5;
  const cy = height * 0.5;

  if (symbol === '>') {
    strokes.push([[cx - 150, cy], [cx + 150, cy]]);
    strokes.push([[cx + 60, cy - 90], [cx + 150, cy], [cx + 60, cy + 90]]);
    strokes.push([[cx - 10, cy - 70], [cx + 80, cy], [cx - 10, cy + 70]]);
  } else if (symbol === '<') {
    strokes.push([[cx + 150, cy], [cx - 150, cy]]);
    strokes.push([[cx - 60, cy - 90], [cx - 150, cy], [cx - 60, cy + 90]]);
    strokes.push([[cx + 10, cy - 70], [cx - 80, cy], [cx + 10, cy + 70]]);
  } else if (symbol === '^') {
    strokes.push([[cx, cy + 150], [cx, cy - 150]]);
    strokes.push([[cx - 90, cy - 60], [cx, cy - 150], [cx + 90, cy - 60]]);
    strokes.push([[cx - 70, cy + 10], [cx, cy - 80], [cx + 70, cy + 10]]);
  } else {
    // 'v'
    strokes.push([[cx, cy - 150], [cx, cy + 150]]);
    strokes.push([[cx - 90, cy + 60], [cx, cy + 150], [cx + 90, cy + 60]]);
    strokes.push([[cx - 70, cy - 10], [cx, cy + 80], [cx + 70, cy - 10]]);
  }

  drawMarker(ctx, strokes, { width: 22.0, color, seed });

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
 * Prompt 7: Marker doodle teaching decal placed beside the first pebble pile.
 * Depicts:
 * 1. Hand throwing a stone.
 * 2. Parabolic trajectory arc dropping into water.
 * 3. Water surface ripple and splash droplets.
 * 4. Radiating acoustic sound waves.
 * 5. Arrow pointing to ear/listening entity indicating sound lure distraction.
 */
export function makeThrowLureTeachingDecal(options: {
  width?: number;
  height?: number;
  seed?: number;
} = {}): CanvasTexture {
  const width = options.width ?? 512;
  const height = options.height ?? 256;
  const seed = options.seed ?? 101;

  const cacheKey = `throw_lure_teaching_${seed}_${width}_${height}`;
  if (decalCache.has(cacheKey)) {
    return decalCache.get(cacheKey)!;
  }

  const pooled = acquireCanvas(width, height);
  const ctx = pooled.ctx;
  ctx.clearRect(0, 0, width, height);

  const color = '#0d0b06';
  const strokes: Polyline[] = [];

  // 1. Hand / fingers holding stone on left (x: 50..110, y: 120..180)
  strokes.push([
    [50, 170],
    [75, 145],
    [95, 140],
    [105, 150],
    [85, 175],
    [55, 175],
  ]);
  // Finger release
  strokes.push([[95, 140], [115, 130]]);
  strokes.push([[100, 148], [118, 142]]);
  // Stone (small polygon)
  strokes.push([
    [125, 126],
    [132, 124],
    [135, 130],
    [130, 134],
    [124, 131],
    [125, 126],
  ]);

  // 2. Parabolic flight trajectory arc (x: 135 -> 280, y: 130 -> 60 -> 180)
  strokes.push([[145, 120], [160, 105]]);
  strokes.push([[175, 92], [195, 80]]);
  strokes.push([[210, 75], [230, 80]]);
  strokes.push([[245, 95], [260, 120]]);
  strokes.push([[270, 145], [280, 175]]);

  // 3. Water line & Splash impact at (280, 180)
  strokes.push([[220, 185], [360, 185]]); // Water surface baseline
  // Splash droplet crown
  strokes.push([[270, 185], [262, 160], [268, 170]]);
  strokes.push([[280, 185], [280, 150], [284, 168]]);
  strokes.push([[290, 185], [298, 160], [292, 170]]);
  // Concentric ripples on water
  strokes.push([[255, 192], [305, 192]]);
  strokes.push([[240, 198], [320, 198]]);

  // 4. Acoustic sound wave radiating rings ((((
  strokes.push([[315, 155], [325, 170], [315, 185]]);
  strokes.push([[330, 145], [345, 170], [330, 195]]);
  strokes.push([[345, 135], [365, 170], [345, 205]]);

  // 5. Arrow from sound waves pointing to monster ear silhouette
  strokes.push([[375, 170], [425, 170]]);
  strokes.push([[415, 160], [425, 170], [415, 180]]);

  // 6. Ear / Creature Head doodle (x: 435..485)
  // Large cupped listening ear
  strokes.push([
    [440, 185],
    [435, 160],
    [445, 135],
    [465, 130],
    [478, 145],
    [475, 170],
    [460, 185],
    [450, 185],
  ]);
  // Inner ear fold
  strokes.push([[455, 145], [465, 155], [458, 170]]);

  drawMarker(ctx, strokes, { width: 5.0, color, seed });

  // Diegetic hand-scrawled text at top: "SPLASH = DISTRACTION"
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = '700 16px monospace';
  ctx.fillText('SPLASH = LURE', 180, 40);
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

/* ── brush.ts ─────────────────────────────────────────────────────────────
 *  Procedural marker and spray paint brushes for authentic hand-drawn decals.
 *  Deterministic, seeded rendering with pressure variation, overspray, and drips.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Polyline, Point2D } from './strokeFont.js';
import { Rng } from '../core/prng.js';

export interface MarkerOptions {
  width?: number;
  color?: string;
  seed?: number;
}

export interface SprayOptions {
  width?: number;
  color?: string;
  seed?: number;
  dripRate?: number;
  oversprayCount?: number;
}

type Any2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draw hand-lettered marker strokes with variable pressure and textured edges.
 */
export function drawMarker(
  ctx: Any2DContext,
  polylines: Polyline[],
  options: MarkerOptions = {},
): void {
  const baseWidth = options.width ?? 6;
  const color = options.color ?? '#0d0b06';
  const rng = new Rng(options.seed ?? 1337);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of polylines) {
    if (stroke.length < 2) continue;

    // Subdivide segments to simulate continuous pressure dynamics
    for (let i = 0; i < stroke.length - 1; i++) {
      const [x1, y1] = stroke[i]!;
      const [x2, y2] = stroke[i + 1]!;
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.ceil(dist / 3));

      for (let s = 0; s < steps; s++) {
        const t1 = s / steps;
        const t2 = (s + 1) / steps;

        const sx1 = x1 + (x2 - x1) * t1;
        const sy1 = y1 + (y2 - y1) * t1;
        const sx2 = x1 + (x2 - x1) * t2;
        const sy2 = y1 + (y2 - y1) * t2;

        const pressure = 0.8 + rng.next() * 0.4;
        ctx.lineWidth = baseWidth * pressure;
        ctx.globalAlpha = 0.88 + rng.next() * 0.12;

        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * Draw spray paint strokes with dense core, Gaussian overspray particles, and gravity drips.
 */
export function drawSpray(
  ctx: Any2DContext,
  polylines: Polyline[],
  options: SprayOptions = {},
): void {
  const coreWidth = options.width ?? 12;
  const color = options.color ?? '#0d0b06';
  const rng = new Rng(options.seed ?? 999);
  const dripRate = options.dripRate ?? 0.08;
  const oversprayCount = options.oversprayCount ?? 20;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const dripCandidates: Point2D[] = [];

  // Step 1: Draw core stroke with soft alpha falloff
  for (const stroke of polylines) {
    if (stroke.length < 2) continue;

    ctx.beginPath();
    ctx.moveTo(stroke[0]![0], stroke[0]![1]);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i]![0], stroke[i]![1]);
    }
    ctx.lineWidth = coreWidth * 0.7;
    ctx.globalAlpha = 0.85;
    ctx.stroke();

    // Step 2: Gaussian overspray particles along stroke path
    for (let i = 0; i < stroke.length - 1; i++) {
      const [x1, y1] = stroke[i]!;
      const [x2, y2] = stroke[i + 1]!;
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const stepCount = Math.max(2, Math.ceil(segLen / 2));

      for (let s = 0; s < stepCount; s++) {
        const t = s / stepCount;
        const cx = x1 + (x2 - x1) * t;
        const cy = y1 + (y2 - y1) * t;

        // Collect lower points for drip evaluation
        if (cy > y1 && cy > y2 && rng.next() < dripRate) {
          dripCandidates.push([cx, cy]);
        }

        // Particle cloud around path
        for (let p = 0; p < oversprayCount; p++) {
          const radius = rng.gaussian(0, coreWidth * 0.85);
          const angle = rng.next() * Math.PI * 2.0;
          const px = cx + Math.cos(angle) * radius;
          const py = cy + Math.sin(angle) * radius;
          const dotRadius = rng.range(0.4, 1.2);

          // Alpha decays with distance from core
          const normDist = Math.abs(radius) / (coreWidth * 1.5);
          ctx.globalAlpha = Math.max(0.02, (1.0 - normDist) * 0.25);

          ctx.beginPath();
          ctx.arc(px, py, dotRadius, 0, Math.PI * 2.0);
          ctx.fill();
        }
      }
    }
  }

  // Step 3: Draw dripping paint lines that run down from low points
  ctx.globalAlpha = 0.9;
  for (const [dx, dy] of dripCandidates) {
    const dripLen = rng.range(15, 45);
    const dripWidth = rng.range(1.2, 2.4);

    ctx.lineWidth = dripWidth;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    // Slight horizontal drift as it runs down
    const endX = dx + (rng.next() * 2.0 - 1.0) * 2;
    const endY = dy + dripLen;
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Bulbed teardrop dot at bottom
    ctx.beginPath();
    ctx.arc(endX, endY + dripWidth, dripWidth * 1.6, 0, Math.PI * 2.0);
    ctx.fill();
  }

  ctx.restore();
}

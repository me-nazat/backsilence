/* ── PaintedLabel.ts ───────────────────────────────────────────────────────
 *  Procedural stenciled and stroke-font industrial signs, valve labels, and arrows.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  CanvasTexture,
  ClampToEdgeWrapping,
  SRGBColorSpace,
} from 'three';
import { layoutText } from './strokeFont.js';
import { acquireCanvas, type AnyCanvasRenderingContext2D } from '../core/canvasPool.js';

function drawStrokeString(
  ctx: AnyCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale = 1.0,
): void {
  const layout = layoutText(text, { size: 28 * scale, tracking: 0.12, wobble: 0.02 });
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (const poly of layout.polylines) {
    if (poly.length === 0) continue;
    const first = poly[0]!;
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < poly.length; i++) {
      const pt = poly[i]!;
      ctx.lineTo(pt[0], pt[1]);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export interface LabelOptions {
  text: string;
  subtext?: string;
  color?: string;
  borderColor?: string;
  width?: number;
  height?: number;
}

export function makePaintedLabel(opts: LabelOptions): CanvasTexture {
  const w = opts.width ?? 512;
  const h = opts.height ?? 256;
  const handle = acquireCanvas(w, h);
  const ctx = handle.ctx;

  // Clear alpha
  ctx.clearRect(0, 0, w, h);

  // Metal / painted backing plate
  ctx.fillStyle = 'rgba(20, 18, 14, 0.85)';
  ctx.fillRect(8, 8, w - 16, h - 16);

  // Outer stencil border
  ctx.strokeStyle = opts.borderColor ?? '#b3261e';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  // Stencil text
  ctx.strokeStyle = opts.color ?? '#f5edd6';
  ctx.lineWidth = 5;
  drawStrokeString(ctx, opts.text, 28, Math.floor(h * 0.45), 2.2);

  if (opts.subtext) {
    ctx.strokeStyle = '#86cfa0';
    ctx.lineWidth = 3;
    drawStrokeString(ctx, opts.subtext, 28, Math.floor(h * 0.78), 1.2);
  }

  const tex = new CanvasTexture(handle.canvas);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function makePipeDiagramTexture(order: string[]): CanvasTexture {
  const w = 512;
  const h = 256;
  const handle = acquireCanvas(w, h);
  const ctx = handle.ctx;

  ctx.clearRect(0, 0, w, h);

  // Weathered metal backing
  ctx.fillStyle = '#22201b';
  ctx.fillRect(4, 4, w - 8, h - 8);

  ctx.strokeStyle = '#b3261e';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  // Header
  ctx.strokeStyle = '#f5edd6';
  ctx.lineWidth = 3;
  drawStrokeString(ctx, 'VALVE SEQUENCE', 20, 48, 1.4);

  // Order with arrows: e.g. "B -> A -> C"
  const orderStr = order.join(' -> ');
  ctx.strokeStyle = '#86cfa0';
  ctx.lineWidth = 5;
  drawStrokeString(ctx, orderStr, 32, 130, 2.2);

  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;
  drawStrokeString(ctx, 'PRESSURE SURGE ON FAULT', 24, 200, 1.0);

  const tex = new CanvasTexture(handle.canvas);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

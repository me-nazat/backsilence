/* ── canvasPool.ts ────────────────────────────────────────────────────────
 *  Canvas recycling pool preferring OffscreenCanvas when available.
 *  Avoids per-generation canvas allocations and garbage collection pressure.
 * ──────────────────────────────────────────────────────────────────────── */

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type AnyCanvasRenderingContext2D =
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D;

export interface PooledCanvas {
  canvas: AnyCanvas;
  ctx: AnyCanvasRenderingContext2D;
  width: number;
  height: number;
}

const pool = new Map<string, PooledCanvas[]>();

/**
 * Acquire a 2D canvas of the requested dimensions from the pool (or allocate one).
 */
export function acquireCanvas(width: number, height: number): PooledCanvas {
  const key = `${width}x${height}`;
  const list = pool.get(key);
  if (list && list.length > 0) {
    const item = list.pop()!;
    // Clear canvas before reuse
    item.ctx.clearRect(0, 0, width, height);
    return item;
  }

  let canvas: AnyCanvas;
  let ctx: AnyCanvasRenderingContext2D | null = null;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d') as AnyCanvasRenderingContext2D | null;
  } else if (typeof document !== 'undefined') {
    const el = document.createElement('canvas');
    el.width = width;
    el.height = height;
    canvas = el;
    ctx = el.getContext('2d');
  } else {
    throw new Error('Canvas rendering context unavailable in current environment');
  }

  if (!ctx) {
    throw new Error(`Failed to acquire 2D context for ${width}x${height}`);
  }

  return { canvas, ctx, width, height };
}

/**
 * Return a canvas to the pool for reuse.
 */
export function releaseCanvas(item: PooledCanvas): void {
  const key = `${item.width}x${item.height}`;
  let list = pool.get(key);
  if (!list) {
    list = [];
    pool.set(key, list);
  }
  // Cap pool depth to avoid runaway memory retention
  if (list.length < 12) {
    list.push(item);
  }
}

/**
 * Clear the canvas pool to release memory.
 */
export function clearCanvasPool(): void {
  pool.clear();
}

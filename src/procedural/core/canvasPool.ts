/* ── canvasPool.ts ────────────────────────────────────────────────────────
 *  Canvas recycling pool preferring OffscreenCanvas when available.
 *  Avoids per-generation canvas allocations and garbage collection pressure.
 * ──────────────────────────────────────────────────────────────────────── */

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type AnyCanvasRenderingContext2D =
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D;

if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? (dataOrWidth.length / (widthOrHeight * 4));
      }
    }
  };
}

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
    // Headless / Node testing environment stub
    const stubCtx = {
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      drawImage: () => {},
      createImageData: (w = width, h = height) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      measureText: (txt: string) => ({ width: txt.length * 10 }),
      fillText: () => {},
      strokeText: () => {},
      setLineDash: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as unknown as AnyCanvasRenderingContext2D;
    return {
      canvas: { width, height } as unknown as AnyCanvas,
      ctx: stubCtx,
      width,
      height,
    };
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

/* ── Skeleton.ts ─────────────────────────────────────────────────────────
 *  VHS static noise shimmer placeholder for asynchronous network loading.
 * ──────────────────────────────────────────────────────────────────────── */

export interface SkeletonOptions {
  width?: string;
  height?: string;
  borderRadius?: string;
}

export class Skeleton {
  readonly element: HTMLElement;

  constructor(opts: SkeletonOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = 'bs-skeleton';
    this.element.style.width = opts.width ?? '100%';
    this.element.style.height = opts.height ?? '20px';
    if (opts.borderRadius) {
      this.element.style.borderRadius = opts.borderRadius;
    }
  }

  static render(width = '100%', height = '20px', borderRadius = '2px'): string {
    return `<div class="bs-skeleton" style="width: ${width}; height: ${height}; border-radius: ${borderRadius};"></div>`;
  }
}

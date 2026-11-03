/* ── MapCard.ts ──────────────────────────────────────────────────────────
 *  Map selector card with live mini-canvas thumbnail, difficulty stars,
 *  best times, tags, and accessible focus states.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';
import { drawProceduralMapPlaceholder } from '../../world/MapThumbnails.js';
import type { MapId } from '../../types/contracts.js';

export interface MapCardOptions {
  id: string;
  name: string;
  difficulty: number; // 1..5
  tags: string[];
  bestTimeMs?: number | undefined;
  seed?: number | undefined;
  onClick?: ((id: string) => void) | undefined;
}

export class MapCard {
  readonly element: HTMLElement;
  private canvas: HTMLCanvasElement;

  constructor(private opts: MapCardOptions) {
    this.element = document.createElement('div');
    this.element.className = 'bs-map-card';
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('aria-label', `Map: ${opts.name}`);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bs-map-preview-canvas';
    this.canvas.width = 240;
    this.canvas.height = 120;

    this.render();
    this.drawProceduralThumbnail();
    this.bindEvents();
  }

  private render(): void {
    let stars = '';
    for (let i = 0; i < 5; i++) {
      stars += i < this.opts.difficulty ? renderIcon('star', 12) : '<span style="opacity:0.2;">★</span>';
    }

    const tagsHtml = this.opts.tags.map((t) => `<span class="bs-map-tag">${t}</span>`).join('');
    const bestTime = this.opts.bestTimeMs
      ? `${(this.opts.bestTimeMs / 1000).toFixed(1)}s`
      : 'NO RECORD';

    this.element.innerHTML = `
      <div class="bs-map-card-body">
        <div class="bs-map-card-header">
          <div class="bs-map-card-title">${this.opts.name}</div>
          <div style="color: var(--bs-tan); display: flex;">${stars}</div>
        </div>
        <div class="bs-map-card-tags">${tagsHtml}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-family: var(--bs-font-mono); font-size: 11px; margin-top: 8px;">
          <div>
            <span style="color: var(--bs-tan);">RECORD: </span>
            <span class="bs-osd-readout">${bestTime}</span>
          </div>
          <span class="bs-badge" style="background: rgba(134,207,160,0.18); border: 1px solid rgba(134,207,160,0.4); color: #86cfa0; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 3px;">
            DEPLOY ▶
          </span>
        </div>
      </div>
    `;

    this.element.prepend(this.canvas);
  }

  private drawProceduralThumbnail(): void {
    try {
      const ctx = this.canvas.getContext('2d');
      if (!ctx || typeof ctx.fillRect !== 'function') return;

      const w = this.canvas.width;
      const h = this.canvas.height;

      // Use full procedural tonal thumbnail from MapThumbnails
      drawProceduralMapPlaceholder(ctx, this.opts.id as MapId, this.opts.name, w, h);
    } catch {
      // Incomplete canvas environment fallback
    }
  }

  private bindEvents(): void {
    this.element.addEventListener('click', () => {
      this.opts.onClick?.(this.opts.id);
    });
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.opts.onClick?.(this.opts.id);
      }
    });
  }
}

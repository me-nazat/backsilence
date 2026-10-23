/* ── MapCard.ts ──────────────────────────────────────────────────────────
 *  Map selector card with live mini-canvas thumbnail, difficulty stars,
 *  best times, tags, and accessible focus states.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';

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
        <div style="display: flex; justify-content: space-between; font-family: var(--bs-font-mono); font-size: 11px; margin-top: 4px;">
          <span style="color: var(--bs-tan);">RECORD:</span>
          <span class="bs-osd-readout">${bestTime}</span>
        </div>
      </div>
    `;

    this.element.prepend(this.canvas);
  }

  private drawProceduralThumbnail(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0a0906';
    ctx.fillRect(0, 0, w, h);

    // Procedural poolrooms schematic / room grid
    const seed = this.opts.seed ?? 42;
    ctx.strokeStyle = 'rgba(91, 69, 38, 0.4)';
    ctx.lineWidth = 1;

    for (let x = 0; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Water channel
    ctx.fillStyle = 'rgba(134, 207, 160, 0.25)';
    ctx.fillRect(20, 30, w - 40, h - 60);

    // Pillars
    ctx.fillStyle = '#d8b36a';
    for (let i = 0; i < 4; i++) {
      const px = 40 + i * 45 + ((seed * (i + 1)) % 10);
      const py = 45 + ((seed * 7 * (i + 1)) % 30);
      ctx.fillRect(px, py, 12, 12);
    }

    // Vignette
    const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 1.5);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
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

/* ── RankBadge.ts ────────────────────────────────────────────────────────
 *  Procedural SVG rank emblem badge with glow and title.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderRankEmblem, type RankEmblemName } from './Icons.js';

export interface RankBadgeOptions {
  rank: RankEmblemName;
  title: string;
  size?: number;
}

export class RankBadge {
  readonly element: HTMLElement;

  constructor(private opts: RankBadgeOptions) {
    this.element = document.createElement('div');
    this.element.style.display = 'inline-flex';
    this.element.style.alignItems = 'center';
    this.element.style.gap = '8px';
    this.element.style.padding = '4px 10px';
    this.element.style.background = 'var(--bs-surface-2)';
    this.element.style.border = '1px solid var(--bs-border)';
    this.element.style.borderRadius = 'var(--bs-radius-sm)';
    this.render();
  }

  private render(): void {
    const size = this.opts.size ?? 32;
    this.element.innerHTML = `
      ${renderRankEmblem(this.opts.rank, size)}
      <div style="display: flex; flex-direction: column;">
        <span style="font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-tan); text-transform: uppercase;">RANK</span>
        <span style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); font-weight: bold; color: var(--bs-cream); text-transform: uppercase;">${this.opts.title}</span>
      </div>
    `;
  }
}

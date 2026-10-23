/* ── StatTile.ts ─────────────────────────────────────────────────────────
 *  Analog metric tile for player dossiers and run results.
 * ──────────────────────────────────────────────────────────────────────── */

export interface StatTileOptions {
  title: string;
  value: string | number;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export class StatTile {
  readonly element: HTMLElement;

  constructor(private opts: StatTileOptions) {
    this.element = document.createElement('div');
    this.element.className = 'bs-stat-tile';
    this.render();
  }

  private render(): void {
    const subHtml = this.opts.subtext
      ? `<div style="font-family: var(--bs-font-mono); font-size: 11px; opacity: 0.7; color: var(--bs-tan);">${this.opts.subtext}</div>`
      : '';

    this.element.innerHTML = `
      <div class="bs-stat-title">${this.opts.title}</div>
      <div class="bs-stat-value">${this.opts.value}</div>
      ${subHtml}
    `;
  }

  setValue(val: string | number, subtext?: string): void {
    this.opts.value = val;
    if (subtext !== undefined) this.opts.subtext = subtext;
    this.render();
  }
}

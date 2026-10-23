/* ── RosterChip.ts ───────────────────────────────────────────────────────
 *  Lobby player chip: displays avatar, name#tag, ping bars, and ready state.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';

export interface RosterChipOptions {
  name: string;
  tag: string;
  isHost?: boolean;
  isReady?: boolean;
  pingMs?: number;
}

export class RosterChip {
  readonly element: HTMLElement;

  constructor(private opts: RosterChipOptions) {
    this.element = document.createElement('div');
    this.element.className = 'bs-roster-chip';
    this.render();
  }

  private render(): void {
    const ping = this.opts.pingMs ?? 45;
    let pingColor = 'var(--bs-water)';
    if (ping > 150) pingColor = 'var(--bs-danger)';
    else if (ping > 80) pingColor = 'var(--bs-tan)';

    const hostIcon = this.opts.isHost
      ? `<span style="color: var(--bs-tan); margin-right: 4px;">${renderIcon('crown', 14)}</span>`
      : '';

    const readyIcon = this.opts.isReady
      ? `<span style="color: var(--bs-water);">${renderIcon('check', 16)}</span>`
      : `<span style="opacity: 0.3;">${renderIcon('clock', 16)}</span>`;

    this.element.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        ${hostIcon}
        <span style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); font-weight: bold; color: var(--bs-cream);">
          ${this.opts.name}<span style="opacity: 0.5;">#${this.opts.tag}</span>
        </span>
      </div>
      <div style="margin-left: auto; display: flex; align-items: center; gap: 10px;">
        <div class="bs-ping-bars" title="Ping: ${ping}ms">
          <div class="bs-ping-bar" style="height: 4px; background: ${pingColor};"></div>
          <div class="bs-ping-bar" style="height: 8px; background: ${pingColor};"></div>
          <div class="bs-ping-bar" style="height: 12px; background: ${ping > 150 ? 'rgba(255,255,255,0.2)' : pingColor};"></div>
        </div>
        ${readyIcon}
      </div>
    `;
  }

  setReady(isReady: boolean): void {
    this.opts.isReady = isReady;
    this.render();
  }
}

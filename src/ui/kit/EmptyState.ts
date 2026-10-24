/* ── EmptyState.ts ────────────────────────────────────────────────────────
 *  Analog archive empty state component for empty drawers, blank leaderboards,
 *  and submerged collections.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon, type IconName } from './Icons.js';
import { Button } from './Button.js';

export interface EmptyStateOptions {
  title?: string;
  description: string;
  icon?: IconName;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export class EmptyState {
  readonly element: HTMLElement;

  constructor(opts: EmptyStateOptions) {
    this.element = document.createElement('div');
    this.element.className = `bs-empty-state ${opts.className ?? ''}`;
    this.element.setAttribute('role', 'status');

    const iconHtml = opts.icon ? `<div class="bs-empty-icon">${renderIcon(opts.icon, 36)}</div>` : '';
    const titleHtml = opts.title ? `<h3 class="bs-empty-title">${opts.title}</h3>` : '';
    const descHtml = `<p class="bs-empty-desc">${opts.description}</p>`;

    this.element.innerHTML = `
      ${iconHtml}
      ${titleHtml}
      ${descHtml}
      <div class="bs-empty-action"></div>
    `;

    if (opts.actionText && opts.onAction) {
      const btn = new Button({
        text: opts.actionText,
        variant: 'primary',
        onClick: opts.onAction,
      });
      this.element.querySelector('.bs-empty-action')?.appendChild(btn.element);
    }
  }
}

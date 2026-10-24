/* ── ErrorState.ts ────────────────────────────────────────────────────────
 *  Analog archive error state displaying tracking errors, transmission loss,
 *  and retry controls.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';
import { Button } from './Button.js';

export interface ErrorStateOptions {
  title?: string;
  message: string;
  code?: string;
  retryText?: string;
  onRetry?: () => void;
  className?: string;
}

export class ErrorState {
  readonly element: HTMLElement;

  constructor(opts: ErrorStateOptions) {
    this.element = document.createElement('div');
    this.element.className = `bs-error-state ${opts.className ?? ''}`;
    this.element.setAttribute('role', 'alert');

    const iconHtml = `<div class="bs-error-icon">${renderIcon('warning', 36)}</div>`;
    const titleHtml = `<h3 class="bs-error-title">${opts.title ?? 'TRANSMISSION ERROR'}</h3>`;
    const codeHtml = opts.code ? `<div class="bs-error-code">CODE: ${opts.code}</div>` : '';
    const descHtml = `<p class="bs-error-desc">${opts.message}</p>`;

    this.element.innerHTML = `
      ${iconHtml}
      ${titleHtml}
      ${codeHtml}
      ${descHtml}
      <div class="bs-error-action"></div>
    `;

    if (opts.retryText && opts.onRetry) {
      const btn = new Button({
        text: opts.retryText,
        variant: 'danger',
        icon: renderIcon('refresh', 16),
        onClick: opts.onRetry,
      });
      this.element.querySelector('.bs-error-action')?.appendChild(btn.element);
    }
  }
}

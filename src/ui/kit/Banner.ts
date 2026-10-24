/* ── Banner.ts ────────────────────────────────────────────────────────────
 *  Analog archive status banner component (info, warning, danger, champion).
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon, type IconName } from './Icons.js';

export interface BannerOptions {
  message: string;
  variant?: 'info' | 'warning' | 'danger' | 'champion';
  icon?: IconName;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export class Banner {
  readonly element: HTMLElement;

  constructor(opts: BannerOptions) {
    this.element = document.createElement('div');
    const variant = opts.variant ?? 'info';
    this.element.className = `bs-banner bs-banner-${variant} ${opts.className ?? ''}`;
    this.element.setAttribute('role', variant === 'danger' ? 'alert' : 'status');

    const defaultIcon: IconName = variant === 'champion' ? 'crown' : variant === 'danger' ? 'warning' : 'info';
    const iconName = opts.icon ?? defaultIcon;

    this.element.innerHTML = `
      <div class="bs-banner-icon">${renderIcon(iconName, 18)}</div>
      <div class="bs-banner-text">${opts.message}</div>
      ${opts.dismissible ? `<button type="button" class="bs-banner-close" aria-label="Dismiss banner">${renderIcon('cross', 14)}</button>` : ''}
    `;

    if (opts.dismissible) {
      this.element.querySelector('.bs-banner-close')?.addEventListener('click', () => {
        this.element.remove();
        opts.onDismiss?.();
      });
    }
  }
}

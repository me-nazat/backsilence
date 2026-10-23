/* ── Toast.ts ────────────────────────────────────────────────────────────
 *  Analog archive notification toast with slide shimmer and auto-dismiss.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon, type IconName } from './Icons.js';

export type ToastVariant = 'info' | 'warning' | 'danger' | 'success';

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
}

export class Toast {
  private static instance: Toast | null = null;
  private container: HTMLElement;

  static getInstance(): Toast {
    if (!this.instance) {
      this.instance = new Toast();
    }
    return this.instance;
  }

  static show(message: string, variant: ToastVariant = 'info', durationMs = 3500): void {
    this.getInstance().show(message, variant, durationMs);
  }

  constructor() {
    let el = document.querySelector<HTMLElement>('.bs-toast-container');
    if (!el) {
      el = document.createElement('div');
      el.className = 'bs-toast-container';
      document.body.appendChild(el);
    }
    this.container = el;
  }

  show(message: string, variant: ToastVariant = 'info', durationMs = 3500): void {
    const toastEl = document.createElement('div');
    toastEl.className = `bs-toast bs-toast-${variant}`;

    let iconName: IconName = 'info';
    if (variant === 'warning') iconName = 'star';
    else if (variant === 'danger') iconName = 'skull';
    else if (variant === 'success') iconName = 'check';

    toastEl.innerHTML = `
      <span style="display: flex; align-items: center;">${renderIcon(iconName, 16)}</span>
      <span>${message}</span>
    `;

    this.container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.transition = 'opacity 300ms ease, transform 300ms ease';
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        if (toastEl.parentElement) {
          toastEl.parentElement.removeChild(toastEl);
        }
      }, 300);
    }, durationMs);
  }
}

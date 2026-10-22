/* ── ToastManager.ts ──────────────────────────────────────────────────────
 *  Non-blocking stacked notification toast system with ARIA live region.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ToastOptions {
  durationMs?: number;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export class ToastManager {
  private static instance: ToastManager | null = null;
  private container: HTMLElement;

  static getInstance(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager();
    }
    return ToastManager.instance;
  }

  constructor() {
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 20000;
        pointer-events: none;
      `;
      document.body.appendChild(el);
    }
    this.container = el;
  }

  show(message: string, options?: ToastOptions | 'info' | 'success' | 'warning' | 'error' | 'warn'): void {
    const opts: ToastOptions =
      typeof options === 'string'
        ? { type: options === 'warn' ? 'warning' : options }
        : options ?? {};
    const duration = opts.durationMs ?? 3200;
    const type = opts.type ?? 'info';

    const toast = document.createElement('div');
    toast.role = 'alert';

    const borderColor =
      type === 'success'
        ? 'var(--water, #86cfa0)'
        : type === 'error'
          ? 'var(--danger, #b3261e)'
          : type === 'warning'
            ? '#d8b36a'
            : 'var(--fog, #d9d3a2)';

    toast.style.cssText = `
      background: rgba(13, 11, 6, 0.95);
      border: 1px solid ${borderColor};
      color: var(--fog, #d9d3a2);
      padding: 10px 16px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
      pointer-events: auto;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.25s ease-out, transform 0.25s ease-out;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    toast.innerHTML = `<span>${message}</span>`;
    this.container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Dismiss timer
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      }, 300);
    }, duration);
  }
}

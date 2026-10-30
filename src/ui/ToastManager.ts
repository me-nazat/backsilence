/* ── ToastManager.ts ──────────────────────────────────────────────────────
 *  Phase C: Actionable notification toast system with ARIA live region.
 *  Supports plain causes, next steps, action buttons (Retry, Settings, Copy, Undo),
 *  and clear network status guidance (solo play unaffected).
 * ──────────────────────────────────────────────────────────────────────── */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  durationMs?: number;
  type?: 'info' | 'success' | 'warning' | 'error';
  cause?: string;
  nextStep?: string;
  action?: ToastAction;
  isNetwork?: boolean;
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
        pointer-events: none !important;
        width: auto;
        max-width: min(420px, calc(100vw - 32px));
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
    const hasAction = Boolean(opts.action);
    const duration = opts.durationMs ?? (hasAction ? 6000 : 3500);
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
      background: rgba(13, 11, 6, 0.96);
      border: 1px solid ${borderColor};
      color: var(--fog, #d9d3a2);
      padding: 12px 16px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.85);
      pointer-events: auto;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.25s ease-out, transform 0.25s ease-out;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    `;

    const icon =
      type === 'success' ? '✓ ' :
      type === 'error' ? '✕ ' :
      type === 'warning' ? '⚠ ' : 'ℹ ';

    let contentHtml = `
      <div style="display: flex; flex-direction: column; gap: 3px; line-height: 1.4;">
        <div style="display: flex; align-items: baseline; gap: 6px;">
          <span style="color: ${borderColor}; font-weight: bold;">${icon}</span>
          <span style="font-weight: 600; color: #ffffff;">${message}</span>
        </div>
    `;

    if (opts.cause) {
      contentHtml += `<div style="font-size: 11px; opacity: 0.8; padding-left: 18px;">Cause: ${opts.cause}</div>`;
    }

    if (opts.nextStep) {
      contentHtml += `<div style="font-size: 11px; color: var(--water, #86cfa0); padding-left: 18px;">Next: ${opts.nextStep}</div>`;
    }

    if (opts.isNetwork) {
      contentHtml += `<div style="font-size: 10px; color: #d8b36a; padding-left: 18px; font-style: italic;">Solo play continues unaffected offline.</div>`;
    }

    contentHtml += `</div>`;
    toast.innerHTML = contentHtml;

    if (opts.action) {
      const btn = document.createElement('button');
      btn.className = 'analog-btn primary';
      btn.textContent = opts.action.label;
      btn.style.cssText = `
        padding: 5px 12px;
        min-height: 32px;
        font-size: 11px;
        letter-spacing: 0.1em;
        white-space: nowrap;
        flex-shrink: 0;
      `;
      btn.addEventListener('click', () => {
        opts.action!.onClick();
        dismiss();
      });
      toast.appendChild(btn);
    }

    this.container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    const dismiss = () => {
      if (timer) clearTimeout(timer);
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      }, 300);
    };

    timer = setTimeout(dismiss, duration);
  }
}

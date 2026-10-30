/* ── Button.ts ─────────────────────────────────────────────────────────────
 *  Analog Archive Button: primary, ghost, danger, and hold-to-confirm variants.
 *  Touch target >= 44px, audible click callback hook, and keyboard focusable.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ButtonOptions {
  text: string;
  variant?: 'primary' | 'ghost' | 'danger';
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  holdSeconds?: number;
  className?: string;
  onClick?: () => void;
  onHoldComplete?: () => void;
}

export class Button {
  readonly element: HTMLButtonElement;
  private holdTimer: number | null = null;
  private readonly holdDurationMs: number;
  private holdProgressEl: HTMLElement | null = null;

  constructor(opts: ButtonOptions) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = `bs-btn bs-btn-${opts.variant ?? 'primary'} ${opts.className ?? ''}`;
    this.holdDurationMs = (opts.holdSeconds ?? 0) * 1000;

    this.render(opts);
    this.bindEvents(opts);
  }

  private render(opts: ButtonOptions): void {
    this.element.disabled = !!opts.disabled;
    if (opts.loading) {
      this.element.classList.add('bs-loading');
    }

    let inner = '';
    if (opts.icon) {
      inner += `<span class="bs-btn-icon">${opts.icon}</span>`;
    }
    inner += `<span class="bs-btn-text">${opts.text}</span>`;

    if (this.holdDurationMs > 0) {
      inner += `<span class="bs-btn-hold-fill"></span>`;
    }

    this.element.innerHTML = inner;
    this.holdProgressEl = this.element.querySelector('.bs-btn-hold-fill');
  }

  private bindEvents(opts: ButtonOptions): void {
    if (this.holdDurationMs > 0) {
      const startHold = (e: Event) => {
        if (this.element.disabled) return;
        e.preventDefault();
        this.element.classList.add('bs-holding');
        if (this.holdProgressEl) {
          this.holdProgressEl.style.transition = `transform ${this.holdDurationMs}ms linear`;
          this.holdProgressEl.style.transform = 'scaleX(1)';
        }

        this.holdTimer = window.setTimeout(() => {
          this.resetHold();
          opts.onHoldComplete?.();
        }, this.holdDurationMs);
      };

      const cancelHold = () => {
        if (this.holdTimer) {
          clearTimeout(this.holdTimer);
          this.holdTimer = null;
        }
        this.resetHold();
      };

      this.element.addEventListener('mousedown', startHold);
      this.element.addEventListener('touchstart', startHold, { passive: false });
      this.element.addEventListener('mouseup', cancelHold);
      this.element.addEventListener('mouseleave', cancelHold);
      this.element.addEventListener('touchend', cancelHold);
      this.element.addEventListener('touchcancel', cancelHold);
    } else {
      this.element.addEventListener('click', (e) => {
        if (this.element.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        opts.onClick?.();
      });
    }
  }

  private resetHold(): void {
    this.element.classList.remove('bs-holding');
    if (this.holdProgressEl) {
      this.holdProgressEl.style.transition = 'none';
      this.holdProgressEl.style.transform = 'scaleX(0)';
    }
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.element.classList.add('bs-loading');
    } else {
      this.element.classList.remove('bs-loading');
    }
  }
}

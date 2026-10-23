/* ── Toggle.ts ───────────────────────────────────────────────────────────
 *  Tactile analog toggle switch: accessible role="switch", keyboard operable,
 *  analog audio-ready callback hook.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ToggleOptions {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

export class Toggle {
  readonly element: HTMLElement;
  private isChecked: boolean;

  constructor(private opts: ToggleOptions) {
    this.isChecked = !!opts.checked;
    this.element = document.createElement('div');
    this.element.className = 'bs-toggle-wrap';
    this.element.setAttribute('role', 'switch');
    this.element.setAttribute('aria-checked', this.isChecked ? 'true' : 'false');
    this.element.setAttribute('tabindex', opts.disabled ? '-1' : '0');

    this.render();
    this.bindEvents();
  }

  private render(): void {
    const descHtml = this.opts.description
      ? `<div style="font-size: 11px; opacity: 0.7; font-family: var(--bs-font-mono);">${this.opts.description}</div>`
      : '';

    this.element.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <span style="font-family: var(--bs-font-mono); font-size: var(--bs-text-sm); font-weight: 600;">${this.opts.label}</span>
        ${descHtml}
      </div>
      <div class="bs-toggle-switch">
        <div class="bs-toggle-knob"></div>
      </div>
    `;

    if (this.opts.disabled) {
      this.element.style.opacity = '0.45';
      this.element.style.cursor = 'not-allowed';
    }
  }

  private bindEvents(): void {
    if (this.opts.disabled) return;

    const toggle = () => {
      this.isChecked = !this.isChecked;
      this.element.setAttribute('aria-checked', this.isChecked ? 'true' : 'false');
      this.opts.onChange?.(this.isChecked);
    };

    this.element.addEventListener('click', toggle);
    this.element.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
    });
  }

  setChecked(val: boolean): void {
    this.isChecked = val;
    this.element.setAttribute('aria-checked', val ? 'true' : 'false');
  }

  getChecked(): boolean {
    return this.isChecked;
  }
}

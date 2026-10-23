/* ── Select.ts ───────────────────────────────────────────────────────────
 *  Analog dropdown select component with accessible options.
 * ──────────────────────────────────────────────────────────────────────── */

export interface SelectOption<T = string> {
  value: T;
  label: string;
}

export interface SelectOptions<T = string> {
  label?: string;
  options: SelectOption<T>[];
  value?: T;
  disabled?: boolean;
  onChange?: (val: T) => void;
}

export class Select<T extends string = string> {
  readonly element: HTMLElement;
  private selectEl: HTMLSelectElement;

  constructor(private opts: SelectOptions<T>) {
    this.element = document.createElement('div');
    this.element.style.display = 'flex';
    this.element.style.flexDirection = 'column';
    this.element.style.gap = '4px';

    this.selectEl = document.createElement('select');
    this.selectEl.className = 'bs-select';
    this.selectEl.disabled = !!opts.disabled;

    this.render();
    this.bindEvents();
  }

  private render(): void {
    if (this.opts.label) {
      const lbl = document.createElement('label');
      lbl.style.fontFamily = 'var(--bs-font-mono)';
      lbl.style.fontSize = 'var(--bs-text-xs)';
      lbl.style.color = 'var(--bs-tan)';
      lbl.textContent = this.opts.label;
      this.element.appendChild(lbl);
    }

    this.opts.options.forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if (opt.value === this.opts.value) {
        optionEl.selected = true;
      }
      this.selectEl.appendChild(optionEl);
    });

    this.element.appendChild(this.selectEl);
  }

  private bindEvents(): void {
    this.selectEl.addEventListener('change', () => {
      this.opts.onChange?.(this.selectEl.value as T);
    });
  }

  getValue(): T {
    return this.selectEl.value as T;
  }

  setValue(val: T): void {
    this.selectEl.value = val;
  }
}

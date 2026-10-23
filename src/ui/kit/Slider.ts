/* ── Slider.ts ───────────────────────────────────────────────────────────
 *  Range slider with numerical OSD readout and analog styling.
 * ──────────────────────────────────────────────────────────────────────── */

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  format?: (val: number) => string;
  disabled?: boolean;
  onChange?: (val: number) => void;
}

export class Slider {
  readonly element: HTMLElement;
  private input: HTMLInputElement;
  private valueDisplay: HTMLElement;
  private val: number;

  constructor(private opts: SliderOptions) {
    this.val = opts.value;
    this.element = document.createElement('div');
    this.element.className = 'bs-slider-wrap';

    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.className = 'bs-slider-input';
    this.input.min = String(opts.min);
    this.input.max = String(opts.max);
    this.input.step = String(opts.step ?? 1);
    this.input.value = String(this.val);
    this.input.disabled = !!opts.disabled;

    this.valueDisplay = document.createElement('span');
    this.valueDisplay.className = 'bs-osd-readout';

    this.render();
    this.bindEvents();
  }

  private render(): void {
    const header = document.createElement('div');
    header.className = 'bs-slider-header';

    const label = document.createElement('span');
    label.textContent = this.opts.label;

    this.updateDisplay();

    header.appendChild(label);
    header.appendChild(this.valueDisplay);

    this.element.appendChild(header);
    this.element.appendChild(this.input);
  }

  private updateDisplay(): void {
    if (this.opts.format) {
      this.valueDisplay.textContent = this.opts.format(this.val);
    } else {
      this.valueDisplay.textContent = `${this.val}${this.opts.unit ?? ''}`;
    }
  }

  private bindEvents(): void {
    this.input.addEventListener('input', () => {
      this.val = parseFloat(this.input.value);
      this.updateDisplay();
      this.opts.onChange?.(this.val);
    });
  }

  setValue(val: number): void {
    this.val = val;
    this.input.value = String(val);
    this.updateDisplay();
  }

  getValue(): number {
    return this.val;
  }
}

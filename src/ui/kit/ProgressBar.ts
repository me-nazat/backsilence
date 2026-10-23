/* ── ProgressBar.ts ──────────────────────────────────────────────────────
 *  Analog VU-style needle meter and tape tracking progress bar.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ProgressBarOptions {
  label?: string;
  value?: number; // 0..100
  variant?: 'vu' | 'tracking';
}

export class ProgressBar {
  readonly element: HTMLElement;
  private needleEl: HTMLElement | null = null;
  private fillEl: HTMLElement | null = null;
  private value = 0;

  constructor(private opts: ProgressBarOptions = {}) {
    this.value = Math.max(0, Math.min(100, opts.value ?? 0));
    this.element = document.createElement('div');
    this.element.className = 'bs-vu-meter';
    this.element.setAttribute('role', 'progressbar');
    this.element.setAttribute('aria-valuenow', String(this.value));
    this.element.setAttribute('aria-valuemin', '0');
    this.element.setAttribute('aria-valuemax', '100');

    this.render();
  }

  private render(): void {
    if (this.opts.label) {
      const lbl = document.createElement('div');
      lbl.style.display = 'flex';
      lbl.style.justifyContent = 'space-between';
      lbl.style.fontFamily = 'var(--bs-font-mono)';
      lbl.style.fontSize = 'var(--bs-text-xs)';
      lbl.style.color = 'var(--bs-tan)';
      lbl.innerHTML = `<span>${this.opts.label}</span><span class="bs-osd-readout">${this.value}%</span>`;
      this.element.appendChild(lbl);
    }

    const dial = document.createElement('div');
    dial.className = 'bs-vu-dial';

    const ticks = document.createElement('div');
    ticks.className = 'bs-vu-ticks';
    dial.appendChild(ticks);

    if (this.opts.variant === 'tracking') {
      const fill = document.createElement('div');
      fill.style.position = 'absolute';
      fill.style.top = '0';
      fill.style.bottom = '0';
      fill.style.left = '0';
      fill.style.width = `${this.value}%`;
      fill.style.background = 'rgba(134, 207, 160, 0.4)';
      fill.style.transition = 'width 120ms linear';
      dial.appendChild(fill);
      this.fillEl = fill;
    } else {
      const needle = document.createElement('div');
      needle.className = 'bs-vu-needle';
      needle.style.left = `${this.value}%`;
      dial.appendChild(needle);
      this.needleEl = needle;
    }

    this.element.appendChild(dial);
  }

  setValue(val: number): void {
    this.value = Math.max(0, Math.min(100, val));
    this.element.setAttribute('aria-valuenow', String(this.value));

    if (this.needleEl) {
      this.needleEl.style.left = `${this.value}%`;
    }
    if (this.fillEl) {
      this.fillEl.style.width = `${this.value}%`;
    }
    const readout = this.element.querySelector('.bs-osd-readout');
    if (readout) readout.textContent = `${Math.round(this.value)}%`;
  }

  getValue(): number {
    return this.value;
  }
}

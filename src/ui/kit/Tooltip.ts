/* ── Tooltip.ts ──────────────────────────────────────────────────────────
 *  Accessible instant hover/focus tooltip without layout shift.
 * ──────────────────────────────────────────────────────────────────────── */

export class Tooltip {
  private static instance: Tooltip | null = null;
  private activeEl: HTMLElement | null = null;

  static getInstance(): Tooltip {
    if (!this.instance) {
      this.instance = new Tooltip();
    }
    return this.instance;
  }

  static attach(target: HTMLElement, text: string): void {
    this.getInstance().attach(target, text);
  }

  static hide(): void {
    this.getInstance().hide();
  }

  constructor() {
    this.activeEl = null;
  }

  attach(target: HTMLElement, text: string): void {
    const show = () => {
      this.hide();
      const tip = document.createElement('div');
      tip.className = 'bs-tooltip';
      tip.setAttribute('role', 'tooltip');
      tip.textContent = text;
      document.body.appendChild(tip);
      this.activeEl = tip;

      const rect = target.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();

      let left = rect.left + (rect.width - tipRect.width) / 2;
      let top = rect.top - tipRect.height - 6;

      if (top < 4) top = rect.bottom + 6;
      if (left < 4) left = 4;
      if (left + tipRect.width > window.innerWidth - 4) {
        left = window.innerWidth - tipRect.width - 4;
      }

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };

    const hide = () => this.hide();

    target.addEventListener('mouseenter', show);
    target.addEventListener('mouseleave', hide);
    target.addEventListener('focus', show);
    target.addEventListener('blur', hide);
  }

  hide(): void {
    if (this.activeEl && this.activeEl.parentElement) {
      this.activeEl.parentElement.removeChild(this.activeEl);
      this.activeEl = null;
    }
  }
}

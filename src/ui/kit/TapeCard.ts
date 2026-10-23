/* ── TapeCard.ts ─────────────────────────────────────────────────────────
 *  Tactile VHS / cassette tape card with 3D perspective tilt on hover,
 *  procedural cassette spools & label strip, difficulty stars, and lock state.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';

export interface TapeCardOptions {
  id: string;
  tapeNumber: number;
  title: string;
  subtitle?: string;
  stars?: number;
  locked?: boolean;
  scoreMultiplier?: number;
  onClick?: (id: string) => void;
}

export class TapeCard {
  readonly element: HTMLElement;
  private readonly opts: TapeCardOptions;

  constructor(opts: TapeCardOptions) {
    this.opts = opts;
    this.element = document.createElement('div');
    this.element.className = `bs-tape-card ${opts.locked ? 'bs-locked' : ''}`;
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('tabindex', opts.locked ? '-1' : '0');
    this.element.setAttribute('aria-label', `Tape ${opts.tapeNumber}: ${opts.title}`);

    this.render();
    this.bindTilt();
  }

  private render(): void {
    const starCount = this.opts.stars ?? 1;
    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
      starsHtml += i < starCount ? renderIcon('star', 12) : '<span style="opacity: 0.2;">★</span>';
    }

    const multText = this.opts.scoreMultiplier ? `${this.opts.scoreMultiplier.toFixed(1)}x` : '1.0x';

    this.element.innerHTML = `
      <div class="bs-tape-cartridge-body">
        <div class="bs-tape-spools">
          <div class="bs-tape-spool"><span style="font-size: 8px; color: var(--bs-tan);">●</span></div>
          <div class="bs-tape-spool"><span style="font-size: 8px; color: var(--bs-tan);">●</span></div>
        </div>
        <div class="bs-tape-label-strip">
          ${this.opts.locked ? renderIcon('lock', 12) + ' RESTRICTED ARCHIVE' : `TAPE 0${this.opts.tapeNumber} // ${this.opts.title}`}
        </div>
      </div>
      <div class="bs-tape-card-info">
        <div class="bs-tape-card-title">${this.opts.title}</div>
        <div class="bs-tape-card-meta">
          <div class="bs-tape-stars">${starsHtml}</div>
          <div class="bs-osd-readout" style="font-size: 11px;">${multText}</div>
        </div>
      </div>
    `;

    if (!this.opts.locked) {
      this.element.addEventListener('click', () => {
        this.opts.onClick?.(this.opts.id);
      });
      this.element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.opts.onClick?.(this.opts.id);
        }
      });
    }
  }

  private bindTilt(): void {
    if (this.opts.locked) return;

    this.element.addEventListener('mousemove', (e) => {
      const rect = this.element.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const tiltX = (y / (rect.height / 2)) * -8;
      const tiltY = (x / (rect.width / 2)) * 8;
      this.element.style.transform = `perspective(600px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(-4px)`;
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  }
}

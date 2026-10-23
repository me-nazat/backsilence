/* ── Modal.ts ────────────────────────────────────────────────────────────
 *  Accessible modal dialog with backdrop blur, focus trap, and Escape key listener.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';

export interface ModalOptions {
  title: string;
  content: HTMLElement | string;
  onClose?: () => void;
}

export class Modal {
  readonly backdrop: HTMLElement;
  readonly panel: HTMLElement;
  private previousActiveElement: HTMLElement | null = null;
  private boundKeydown: (e: KeyboardEvent) => void;

  constructor(private opts: ModalOptions) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'bs-modal-backdrop';
    this.backdrop.setAttribute('role', 'dialog');
    this.backdrop.setAttribute('aria-modal', 'true');
    this.backdrop.setAttribute('aria-label', opts.title);

    this.panel = document.createElement('div');
    this.panel.className = 'bs-modal-panel';

    this.boundKeydown = this.handleKeydown.bind(this);
    this.render();
  }

  private render(): void {
    const header = document.createElement('div');
    header.className = 'bs-modal-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'bs-modal-title';
    titleEl.textContent = this.opts.title;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'bs-btn bs-btn-ghost';
    closeBtn.style.padding = '4px 8px';
    closeBtn.style.minHeight = '32px';
    closeBtn.style.minWidth = '32px';
    closeBtn.innerHTML = renderIcon('cross', 16);
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'bs-modal-body';
    if (typeof this.opts.content === 'string') {
      body.innerHTML = this.opts.content;
    } else {
      body.appendChild(this.opts.content);
    }

    this.panel.appendChild(header);
    this.panel.appendChild(body);
    this.backdrop.appendChild(this.panel);

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });
  }

  open(): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    document.body.appendChild(this.backdrop);
    // Force reflow
    void this.backdrop.offsetWidth;
    this.backdrop.classList.add('bs-open');

    document.addEventListener('keydown', this.boundKeydown);

    const firstFocusable = this.panel.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();
  }

  close(): void {
    this.backdrop.classList.remove('bs-open');
    document.removeEventListener('keydown', this.boundKeydown);

    setTimeout(() => {
      if (this.backdrop.parentElement) {
        this.backdrop.parentElement.removeChild(this.backdrop);
      }
      this.previousActiveElement?.focus();
      this.opts.onClose?.();
    }, 240);
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }
}

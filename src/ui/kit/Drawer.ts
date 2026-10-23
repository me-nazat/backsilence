/* ── Drawer.ts ───────────────────────────────────────────────────────────
 *  Tactile slide-in drawer panel with backdrop blur and escape listener.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';

export interface DrawerOptions {
  title: string;
  content: HTMLElement | string;
  onClose?: () => void;
}

export class Drawer {
  readonly backdrop: HTMLElement;
  readonly panel: HTMLElement;
  private boundKeydown: (e: KeyboardEvent) => void;

  constructor(private opts: DrawerOptions) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'bs-modal-backdrop';

    this.panel = document.createElement('div');
    this.panel.className = 'bs-drawer-panel';

    this.boundKeydown = this.handleKeydown.bind(this);
    this.render();
  }

  private render(): void {
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '1px solid var(--bs-border)';
    header.style.paddingBottom = '8px';

    const titleEl = document.createElement('div');
    titleEl.className = 'bs-modal-title';
    titleEl.textContent = this.opts.title;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'bs-btn bs-btn-ghost';
    closeBtn.style.padding = '4px 8px';
    closeBtn.innerHTML = renderIcon('cross', 16);
    closeBtn.setAttribute('aria-label', 'Close drawer');
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.flex = '1';
    body.style.overflowY = 'auto';
    if (typeof this.opts.content === 'string') {
      body.innerHTML = this.opts.content;
    } else {
      body.appendChild(this.opts.content);
    }

    this.panel.appendChild(header);
    this.panel.appendChild(body);

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });
  }

  open(): void {
    document.body.appendChild(this.backdrop);
    document.body.appendChild(this.panel);
    void this.panel.offsetWidth;

    this.backdrop.classList.add('bs-open');
    this.panel.classList.add('bs-open');

    document.addEventListener('keydown', this.boundKeydown);
  }

  close(): void {
    this.backdrop.classList.remove('bs-open');
    this.panel.classList.remove('bs-open');
    document.removeEventListener('keydown', this.boundKeydown);

    setTimeout(() => {
      if (this.backdrop.parentElement) document.body.removeChild(this.backdrop);
      if (this.panel.parentElement) document.body.removeChild(this.panel);
      this.opts.onClose?.();
    }, 480);
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }
}

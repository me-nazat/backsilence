/* ── Accordion.ts ─────────────────────────────────────────────────────────
 *  Collapsible analog accordion component with keyboard accessibility and ARIA.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';

export interface AccordionItem {
  id: string;
  title: string;
  content: string | HTMLElement;
  open?: boolean;
}

export interface AccordionOptions {
  items: AccordionItem[];
  allowMultiple?: boolean;
  className?: string;
  onToggle?: (id: string, isOpen: boolean) => void;
}

export class Accordion {
  readonly element: HTMLElement;
  private readonly items: AccordionItem[];
  private readonly allowMultiple: boolean;
  private readonly onToggle?: ((id: string, isOpen: boolean) => void) | undefined;

  constructor(opts: AccordionOptions) {
    this.element = document.createElement('div');
    this.element.className = `bs-accordion ${opts.className ?? ''}`;
    this.items = [...opts.items];
    this.allowMultiple = !!opts.allowMultiple;
    this.onToggle = opts.onToggle;

    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';
    for (const item of this.items) {
      const itemEl = document.createElement('div');
      itemEl.className = `bs-accordion-item ${item.open ? 'bs-open' : ''}`;
      itemEl.setAttribute('data-id', item.id);

      const headerBtn = document.createElement('button');
      headerBtn.type = 'button';
      headerBtn.className = 'bs-accordion-header';
      headerBtn.setAttribute('aria-expanded', String(!!item.open));
      headerBtn.setAttribute('aria-controls', `bs-acc-panel-${item.id}`);
      headerBtn.id = `bs-acc-header-${item.id}`;

      headerBtn.innerHTML = `
        <span class="bs-accordion-title">${item.title}</span>
        <span class="bs-accordion-chevron">${renderIcon('arrow-right', 16)}</span>
      `;

      const panel = document.createElement('div');
      panel.className = 'bs-accordion-panel';
      panel.id = `bs-acc-panel-${item.id}`;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', `bs-acc-header-${item.id}`);

      if (typeof item.content === 'string') {
        panel.innerHTML = `<div class="bs-accordion-content">${item.content}</div>`;
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'bs-accordion-content';
        wrap.appendChild(item.content);
        panel.appendChild(wrap);
      }

      headerBtn.addEventListener('click', () => {
        const isOpen = itemEl.classList.contains('bs-open');
        if (isOpen) {
          itemEl.classList.remove('bs-open');
          headerBtn.setAttribute('aria-expanded', 'false');
          this.onToggle?.(item.id, false);
        } else {
          if (!this.allowMultiple) {
            this.element.querySelectorAll('.bs-accordion-item.bs-open').forEach((other) => {
              other.classList.remove('bs-open');
              other.querySelector('.bs-accordion-header')?.setAttribute('aria-expanded', 'false');
            });
          }
          itemEl.classList.add('bs-open');
          headerBtn.setAttribute('aria-expanded', 'true');
          this.onToggle?.(item.id, true);
        }
      });

      itemEl.appendChild(headerBtn);
      itemEl.appendChild(panel);
      this.element.appendChild(itemEl);
    }
  }
}

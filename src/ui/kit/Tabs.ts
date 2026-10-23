/* ── Tabs.ts ─────────────────────────────────────────────────────────────
 *  Accessible ARIA tab strip with animated indicator and keyboard navigation.
 * ──────────────────────────────────────────────────────────────────────── */

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsOptions {
  items: TabItem[];
  activeId?: string;
  onChange?: (id: string) => void;
}

export class Tabs {
  readonly element: HTMLElement;
  private activeId: string;
  private buttons: Map<string, HTMLButtonElement> = new Map();

  constructor(private opts: TabsOptions) {
    this.activeId = opts.activeId ?? opts.items[0]?.id ?? '';
    this.element = document.createElement('div');
    this.element.className = 'bs-tablist';
    this.element.setAttribute('role', 'tablist');

    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';
    this.buttons.clear();

    this.opts.items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bs-tab';
      btn.setAttribute('role', 'tab');
      btn.id = `tab-${item.id}`;
      btn.setAttribute('aria-selected', item.id === this.activeId ? 'true' : 'false');
      btn.setAttribute('tabindex', item.id === this.activeId ? '0' : '-1');

      btn.innerHTML = item.count !== undefined
        ? `${item.label} <span style="font-size: 11px; opacity: 0.6; margin-left: 4px;">(${item.count})</span>`
        : item.label;

      btn.addEventListener('click', () => this.setActive(item.id));
      btn.addEventListener('keydown', (e) => this.handleKeydown(e, item.id));

      this.buttons.set(item.id, btn);
      this.element.appendChild(btn);
    });
  }

  setActive(id: string): void {
    if (this.activeId === id) return;
    this.activeId = id;

    this.buttons.forEach((btn, itemId) => {
      const isSelected = itemId === id;
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.setAttribute('tabindex', isSelected ? '0' : '-1');
      if (isSelected) btn.focus();
    });

    this.opts.onChange?.(id);
  }

  private handleKeydown(e: KeyboardEvent, currentId: string): void {
    const ids = this.opts.items.map((i) => i.id);
    const idx = ids.indexOf(currentId);
    if (idx === -1) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextId = ids[(idx + 1) % ids.length]!;
      this.setActive(nextId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevId = ids[(idx - 1 + ids.length) % ids.length]!;
      this.setActive(prevId);
    }
  }

  getActiveId(): string {
    return this.activeId;
  }
}

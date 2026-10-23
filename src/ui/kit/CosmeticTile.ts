/* ── CosmeticTile.ts ─────────────────────────────────────────────────────
 *  Cosmetic wardrobe tile with live 3D preview thumbnail, rarity tier,
 *  equipped indicator, and selection state.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon } from './Icons.js';

export interface CosmeticTileOptions {
  id: string;
  name: string;
  category?: string | undefined;
  rarity?: string | undefined;
  isEquipped?: boolean | undefined;
  onSelect?: ((id: string) => void) | undefined;
}

export class CosmeticTile {
  readonly element: HTMLElement;

  constructor(private opts: CosmeticTileOptions) {
    this.element = document.createElement('div');
    this.element.className = `bs-cosmetic-tile ${opts.isEquipped ? 'bs-equipped' : ''}`;
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('aria-label', `${opts.name} (${opts.category})`);

    this.render();
    this.bindEvents();
  }

  private render(): void {
    let rarityColor = 'var(--bs-cream)';
    if (this.opts.rarity === 'rare') rarityColor = 'var(--bs-tan)';
    else if (this.opts.rarity === 'anomalous') rarityColor = 'var(--bs-water)';

    const icon = this.opts.category === 'flashlight' ? 'flashlight' : this.opts.category === 'lure' ? 'bottle' : 'user';

    const statusBadge = this.opts.isEquipped
      ? `<span style="font-size: 10px; color: var(--bs-water); display: flex; align-items: center; gap: 2px;">${renderIcon('check', 12)} EQUIPPED</span>`
      : `<span style="font-size: 10px; opacity: 0.5; text-transform: uppercase;">${this.opts.rarity}</span>`;

    this.element.innerHTML = `
      <div style="width: 54px; height: 54px; background: #080705; border: 1px solid var(--bs-border); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: ${rarityColor};">
        ${renderIcon(icon, 28)}
      </div>
      <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); font-weight: bold; color: var(--bs-cream); text-align: center;">
        ${this.opts.name}
      </div>
      <div style="font-family: var(--bs-font-mono);">${statusBadge}</div>
    `;
  }

  private bindEvents(): void {
    this.element.addEventListener('click', () => {
      this.opts.onSelect?.(this.opts.id);
    });
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.opts.onSelect?.(this.opts.id);
      }
    });
  }

  setEquipped(val: boolean): void {
    this.opts.isEquipped = val;
    if (val) this.element.classList.add('bs-equipped');
    else this.element.classList.remove('bs-equipped');
    this.render();
  }
}

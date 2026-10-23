/* ── KeyCap.ts ───────────────────────────────────────────────────────────
 *  Tactile analog keyboard / button badge.
 * ──────────────────────────────────────────────────────────────────────── */

export class KeyCap {
  readonly element: HTMLElement;

  constructor(key: string) {
    this.element = document.createElement('kbd');
    this.element.className = 'bs-keycap';
    this.element.textContent = key;
  }

  static render(key: string): string {
    return `<kbd class="bs-keycap">${key}</kbd>`;
  }
}

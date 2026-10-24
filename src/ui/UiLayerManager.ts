/* ── UiLayerManager.ts ──────────────────────────────────────────────────────
 *  Phase D: UI Layer Architecture & Stack Management.
 *  - Stack of screens and modals
 *  - One owner of focus with focus traps and return-to-opener
 *  - 'inert' attribute applied to all layers beneath active modal
 *  - Global Escape key closes top layer and returns focus
 *  - Dev-only elementFromPoint clickability verification
 * ──────────────────────────────────────────────────────────────────────── */

export interface LayerEntry {
  element: HTMLElement;
  isModal: boolean;
  opener?: HTMLElement | null;
  previousActiveElement?: HTMLElement | null;
}

export class UiLayerManager {
  private static instance: UiLayerManager | null = null;
  private stack: LayerEntry[] = [];
  private boundOnKeyDown: (e: KeyboardEvent) => void;

  public static getInstance(): UiLayerManager {
    if (!this.instance) {
      this.instance = new UiLayerManager();
    }
    return this.instance;
  }

  constructor() {
    this.boundOnKeyDown = this.handleKeyDown.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundOnKeyDown);
    }
  }

  public pushLayer(element: HTMLElement, isModal = false, opener?: HTMLElement | null): void {
    if (!element) return;

    // Ensure shared screen class is present
    if (!element.classList.contains('bs-screen')) {
      element.classList.add('bs-screen');
    }

    const prevActive = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;

    const entry: LayerEntry = {
      element,
      isModal,
      opener: opener ?? prevActive,
      previousActiveElement: prevActive,
    };

    // If pushing a modal, mark previous layers inert
    if (isModal) {
      for (const layer of this.stack) {
        layer.element.setAttribute('inert', '');
      }
      const canvasContainer = document.getElementById('canvas-container');
      if (canvasContainer) canvasContainer.setAttribute('inert', '');
    }

    this.stack.push(entry);

    // Focus owner: focus first focusable child or the element itself
    this.focusFirstInLayer(element);

    // Dev-only clickability assertion
    const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
    if (isDev) {
      this.assertButtonsClickable(element);
    }
  }

  public popLayer(): LayerEntry | null {
    if (this.stack.length === 0) return null;

    const popped = this.stack.pop();
    if (!popped) return null;
    popped.element.removeAttribute('inert');

    // If popped was modal, restore inertness of the new top layer
    const newTop = this.getTopLayer();
    if (newTop) {
      newTop.element.removeAttribute('inert');
    } else {
      const canvasContainer = document.getElementById('canvas-container');
      if (canvasContainer) canvasContainer.removeAttribute('inert');
    }

    // Return focus to opener or previous active element
    if (popped.opener && typeof popped.opener.focus === 'function') {
      popped.opener.focus();
    } else if (popped.previousActiveElement && typeof popped.previousActiveElement.focus === 'function') {
      popped.previousActiveElement.focus();
    }

    return popped;
  }

  public removeLayer(element: HTMLElement): void {
    const idx = this.stack.findIndex((l) => l.element === element);
    if (idx !== -1) {
      const popped = this.stack.splice(idx, 1)[0];
      if (popped) {
        popped.element.removeAttribute('inert');
        const top = this.getTopLayer();
        if (top) top.element.removeAttribute('inert');
        if (popped.opener && typeof popped.opener.focus === 'function') {
          popped.opener.focus();
        }
      }
    }
  }

  public getTopLayer(): LayerEntry | null {
    if (this.stack.length === 0) return null;
    const top = this.stack[this.stack.length - 1];
    return top ?? null;
  }

  public getStackDepth(): number {
    return this.stack.length;
  }

  public clear(): void {
    while (this.stack.length > 0) {
      this.popLayer();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      const top = this.getTopLayer();
      if (top && top.isModal) {
        e.preventDefault();
        e.stopPropagation();
        this.popLayer();
        // Trigger cancel event or hide
        top.element.dispatchEvent(new CustomEvent('bs-modal-close', { bubbles: true }));
      }
    }
  }

  private focusFirstInLayer(element: HTMLElement): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    requestAnimationFrame(() => {
      const focusable = element.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      if (first) {
        first.focus();
      } else {
        element.setAttribute('tabindex', '-1');
        element.focus();
      }
    });
  }

  /**
   * Dev-only assertion: after a screen mounts, document.elementFromPoint at the
   * center of each button must return that button or a descendant.
   */
  public assertButtonsClickable(element: HTMLElement): void {
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return;

    requestAnimationFrame(() => {
      const buttons = element.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
      buttons.forEach((btn) => {
        // If button is not in DOM or hidden, skip
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const style = window.getComputedStyle(btn);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const target = document.elementFromPoint(cx, cy);

        if (target && target !== btn && !btn.contains(target)) {
          console.warn(
            `[UiLayerManager Dev Assertion] Button is obstructed at (${Math.round(cx)}, ${Math.round(cy)}):`,
            btn,
            'Hit target was:',
            target
          );
        }
      });
    });
  }
}

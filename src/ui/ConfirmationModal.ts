/* ── ConfirmationModal.ts ────────────────────────────────────────────────
 *  Phase C: Destructive Action Confirmation Modal with plain consequences
 *  and Undo action support. Registers with UiLayerManager as an inert modal.
 * ──────────────────────────────────────────────────────────────────────── */

import { UiLayerManager } from './UiLayerManager.js';
import { ToastManager } from './ToastManager.js';

export interface ConfirmationOptions {
  title: string;
  consequences: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  undoable?: boolean;
  undoMessage?: string;
  onUndo?: () => void;
}

export class ConfirmationModal {
  private el: HTMLElement;
  private options: ConfirmationOptions;

  constructor(options: ConfirmationOptions) {
    this.options = options;
    this.el = document.createElement('div');
    this.el.id = 'bs-confirmation-modal';
    this.el.className = 'bs-screen';
    this.el.setAttribute('role', 'alertdialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'bs-confirm-title');
    this.el.setAttribute('aria-describedby', 'bs-confirm-desc');

    this.el.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(13, 11, 6, 0.88);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      pointer-events: auto;
      padding: 20px;
      box-sizing: border-box;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
    `;

    this.render();
  }

  private render(): void {
    const isDanger = this.options.isDanger !== false;
    const confirmLabel = this.options.confirmLabel ?? (isDanger ? 'CONFIRM' : 'PROCEED');
    const cancelLabel = this.options.cancelLabel ?? 'CANCEL';
    const borderCol = isDanger ? 'var(--danger, #b3261e)' : 'var(--water, #86cfa0)';

    this.el.innerHTML = `
      <div style="
        width: min(440px, 92vw);
        background: #0d0b06;
        border: 2px solid ${borderCol};
        padding: 28px 24px;
        border-radius: 4px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.9), 0 0 24px rgba(179,38,30,0.25);
        display: flex;
        flex-direction: column;
        gap: 16px;
      ">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 11px; letter-spacing: 0.2em; color: ${isDanger ? 'var(--danger, #ff8a80)' : 'var(--water, #86cfa0)'}; font-weight: bold; text-transform: uppercase;">
            ⚠️ ACTION VERIFICATION
          </div>
          <h2 id="bs-confirm-title" style="margin: 0; font-size: clamp(1.2rem, 3.5vw, 1.6rem); color: #ffffff; letter-spacing: 0.08em;">
            ${this.options.title}
          </h2>
        </div>

        <div id="bs-confirm-desc" style="font-size: 13px; line-height: 1.5; opacity: 0.85; color: var(--fog, #d9d3a2); border-left: 2px solid rgba(217,211,162,0.25); padding-left: 12px;">
          ${this.options.consequences}
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
          <button id="bs-confirm-btn-cancel" class="analog-btn" style="min-width: 100px; padding: 8px 16px;">
            ${cancelLabel}
          </button>
          <button id="bs-confirm-btn-confirm" class="analog-btn ${isDanger ? 'danger' : 'primary'}" style="min-width: 120px; padding: 8px 16px;">
            ${confirmLabel}
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const cancelBtn = this.el.querySelector<HTMLButtonElement>('#bs-confirm-btn-cancel');
    const confirmBtn = this.el.querySelector<HTMLButtonElement>('#bs-confirm-btn-confirm');

    cancelBtn?.addEventListener('click', () => {
      this.close();
      if (this.options.onCancel) this.options.onCancel();
    });

    confirmBtn?.addEventListener('click', () => {
      this.close();
      this.options.onConfirm();

      if (this.options.undoable && this.options.onUndo) {
        ToastManager.getInstance().show(this.options.undoMessage ?? 'Action completed.', {
          type: 'warning',
          durationMs: 5000,
          action: {
            label: 'UNDO',
            onClick: () => {
              if (this.options.onUndo) this.options.onUndo();
            },
          },
        });
      }
    });

    // Safe default focus on Cancel
    requestAnimationFrame(() => {
      cancelBtn?.focus();
    });
  }

  mount(container: HTMLElement = document.body): void {
    container.appendChild(this.el);
    UiLayerManager.getInstance().pushLayer(this.el, true);
  }

  close(): void {
    UiLayerManager.getInstance().removeLayer(this.el);
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

/* ── PauseMenu.ts ─────────────────────────────────────────────────────────
 *  In-game Pause overlay with Resume, Settings, Audio Lab, and Quit.
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';

export interface PauseMenuCallbacks {
  onResume: () => void;
  onSettings: () => void;
  onAudioLab: () => void;
  onQuit: () => void;
}

export class PauseMenu {
  private el: HTMLElement | null = null;
  private callbacks: PauseMenuCallbacks;

  constructor(callbacks: PauseMenuCallbacks) {
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'pause-menu-view';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(13, 11, 6, 0.85);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 500;
      pointer-events: auto;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
    `;

    el.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        width: min(340px, 85vw);
        padding: 30px 20px;
        border: 1px solid rgba(134,207,160,0.3);
        background: rgba(13, 11, 6, 0.95);
        box-shadow: 0 0 30px rgba(0,0,0,0.8);
      ">
        <div style="text-align: center;">
          <h2 style="
            font-size: clamp(1.8rem, 4vw, 2.4rem);
            margin: 0;
            letter-spacing: 0.15em;
            color: var(--water, #86cfa0);
            text-shadow: 0 0 15px rgba(134,207,160,0.4);
          ">PAUSED</h2>
          <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">ACOUSTIC ANOMALY SUSPENDED</div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <button id="pause-btn-resume" class="analog-btn primary">RESUME (ESC)</button>
          <button id="pause-btn-settings" class="analog-btn">SETTINGS</button>
          <button id="pause-btn-audiolab" class="analog-btn">AUDIO LAB (B)</button>
          <button id="pause-btn-quit" class="analog-btn">QUIT TO MENU</button>
        </div>
      </div>
    `;

    container.appendChild(el);
    this.el = el;
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.el) return;
    const engine = AudioEngine.getInstance();

    const buttons = this.el.querySelectorAll('.analog-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('mouseenter', () => engine.play('ui_hover'));
      btn.addEventListener('focus', () => engine.play('ui_hover'));
    });

    this.el.querySelector('#pause-btn-resume')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.callbacks.onResume();
    });

    this.el.querySelector('#pause-btn-settings')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onSettings();
    });

    this.el.querySelector('#pause-btn-audiolab')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onAudioLab();
    });

    this.el.querySelector('#pause-btn-quit')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.callbacks.onQuit();
    });
  }

  show(): void {
    if (this.el) {
      this.el.style.display = 'flex';
      const resumeBtn = this.el.querySelector<HTMLButtonElement>('#pause-btn-resume');
      resumeBtn?.focus();
    }
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none';
  }

  dispose(): void {
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

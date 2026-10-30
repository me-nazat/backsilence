/* ── DeathScreen.ts ───────────────────────────────────────────────────────
 *  Game over overlay: "YOU MADE A SOUND", "It heard the water."
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';

export interface DeathScreenCallbacks {
  onRetry: () => void;
  onMenu: () => void;
}

export class DeathScreen {
  private el: HTMLElement | null = null;
  private callbacks: DeathScreenCallbacks;

  constructor(callbacks: DeathScreenCallbacks) {
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'death-screen-view';
    el.className = 'bs-screen';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(13, 11, 6, 0.95);
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 600;
      pointer-events: auto;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
    `;

    el.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        width: min(420px, 90vw);
        padding: 40px 24px;
        border: 1px solid rgba(179,38,30,0.5);
        background: radial-gradient(circle, rgba(20,5,5,0.95) 0%, rgba(13,11,6,0.98) 100%);
        box-shadow: 0 0 50px rgba(179,38,30,0.4);
        text-align: center;
      ">
        <div style="
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: 2px solid var(--danger, #b3261e);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(179,38,30,0.6);
        ">
          <span style="font-size: 24px; color: var(--danger, #b3261e);">✕</span>
        </div>

        <div>
          <h1 style="
            font-size: clamp(1.8rem, 5vw, 2.8rem);
            margin: 0;
            letter-spacing: 0.1em;
            color: var(--danger, #b3261e);
            text-shadow: 0 0 20px rgba(179,38,30,0.8);
          ">YOU MADE A SOUND</h1>
          <div class="death-subtitle" style="
            font-size: 13px;
            color: var(--fog, #d9d3a2);
            opacity: 0.8;
            margin-top: 8px;
            letter-spacing: 0.05em;
          ">It heard the water.</div>
          <div id="death-cause-line" style="
            font-size: 12px;
            font-weight: bold;
            color: #ff9100;
            margin-top: 6px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            display: none;
          "></div>
        </div>

        <div id="death-stats-container" style="
          width: 100%;
          display: flex;
          justify-content: space-around;
          background: rgba(0, 0, 0, 0.4);
          padding: 10px 8px;
          border-radius: 4px;
          border: 1px solid rgba(179,38,30,0.2);
          font-size: 11px;
        ">
          <div>
            <div style="opacity: 0.6; font-size: 9px; text-transform: uppercase;">Survived</div>
            <div id="stat-time" style="font-size: 14px; font-weight: bold; color: var(--fog);">0.0s</div>
          </div>
          <div>
            <div style="opacity: 0.6; font-size: 9px; text-transform: uppercase;">Noises</div>
            <div id="stat-noises" style="font-size: 14px; font-weight: bold; color: var(--danger);">0</div>
          </div>
          <div>
            <div style="opacity: 0.6; font-size: 9px; text-transform: uppercase;">Closest Call</div>
            <div id="stat-closest" style="font-size: 14px; font-weight: bold; color: #ffb74d;">--</div>
          </div>
        </div>

        <div style="
          width: 100%;
          height: 1px;
          background: rgba(179,38,30,0.3);
          margin: 4px 0;
        "></div>

        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
          <button id="death-btn-retry" class="analog-btn danger" style="border-color: rgba(179,38,30,0.8); color: #ff8a80;">
            RETRY
          </button>
          <button id="death-btn-menu" class="analog-btn">
            MAIN MENU
          </button>
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

    this.el.querySelector('#death-btn-retry')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.callbacks.onRetry();
    });

    this.el.querySelector('#death-btn-menu')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onMenu();
    });
  }

  setReason(reason: string): void {
    const sub = this.el?.querySelector('.death-subtitle');
    if (sub) sub.textContent = reason;
  }

  setCause(cause: string, soundRadiusMeters?: number): void {
    const el = this.el?.querySelector<HTMLElement>('#death-cause-line');
    if (el) {
      el.textContent = soundRadiusMeters !== undefined && soundRadiusMeters > 0
        ? `${cause} · Sound carried ~${Math.round(soundRadiusMeters)}m`
        : cause;
      el.style.display = 'block';
    }
  }

  setStats(timeSurvived: number, noisesMade: number, closestCall: number): void {
    if (!this.el) return;
    const timeEl = this.el.querySelector('#stat-time');
    const noisesEl = this.el.querySelector('#stat-noises');
    const closestEl = this.el.querySelector('#stat-closest');

    if (timeEl) timeEl.textContent = `${timeSurvived.toFixed(1)}s`;
    if (noisesEl) noisesEl.textContent = noisesMade.toString();
    if (closestEl) {
      closestEl.textContent = closestCall < 999 ? `${closestCall.toFixed(1)}m` : '--';
    }
  }

  show(): void {
    if (this.el) {
      this.el.style.display = 'flex';
      const retryBtn = this.el.querySelector<HTMLButtonElement>('#death-btn-retry');
      retryBtn?.focus();
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

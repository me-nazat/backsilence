/* ── DeathScreen.ts ───────────────────────────────────────────────────────
 *  Game over overlay: "SIGNAL FAILURE: TELEMETRY LOST", "It heard the water."
 *  Provides Retry / Respawn (Enter / R), Settings, and Main Menu (Esc).
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';
import { safeExitPointerLock } from '../engine/input/PointerLock.js';

export interface DeathScreenCallbacks {
  onRetry: () => void;
  onSettings?: () => void;
  onMenu: () => void;
}

export class DeathScreen {
  private el: HTMLElement | null = null;
  private callbacks: DeathScreenCallbacks;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private isVisible = false;

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
        gap: 20px;
        width: min(440px, 92vw);
        padding: 36px 24px;
        border: 1px solid rgba(179,38,30,0.6);
        background: radial-gradient(circle, rgba(25,6,6,0.96) 0%, rgba(13,11,6,0.98) 100%);
        box-shadow: 0 0 60px rgba(179,38,30,0.45);
        text-align: center;
      ">
        <div style="
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: 2px solid var(--danger, #b3261e);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 24px rgba(179,38,30,0.7);
        ">
          <span style="font-size: 26px; color: var(--danger, #b3261e);">✕</span>
        </div>

        <div>
          <div style="
            font-size: 11px;
            letter-spacing: 0.18em;
            color: #ff5252;
            text-transform: uppercase;
            margin-bottom: 4px;
            opacity: 0.9;
          ">SIGNAL FAILURE: TELEMETRY LOST</div>
          <h1 style="
            font-size: clamp(1.6rem, 4.5vw, 2.4rem);
            margin: 0;
            letter-spacing: 0.08em;
            color: var(--danger, #b3261e);
            text-shadow: 0 0 24px rgba(179,38,30,0.8);
          ">YOU MADE A SOUND</h1>
          <div class="death-subtitle" style="
            font-size: 13px;
            color: var(--fog, #d9d3a2);
            opacity: 0.85;
            margin-top: 6px;
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
          background: rgba(0, 0, 0, 0.45);
          padding: 10px 8px;
          border-radius: 4px;
          border: 1px solid rgba(179,38,30,0.25);
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
          margin: 2px 0;
        "></div>

        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <button id="death-btn-retry" class="analog-btn danger" style="border-color: rgba(179,38,30,0.85); color: #ff8a80; font-weight: bold;">
            RETRY / RESPAWN [Enter / R]
          </button>
          <button id="death-btn-settings" class="analog-btn">
            SETTINGS
          </button>
          <button id="death-btn-menu" class="analog-btn">
            MAIN MENU [Esc]
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
      this.hide();
      this.callbacks.onRetry();
    });

    this.el.querySelector('#death-btn-settings')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onSettings?.();
    });

    this.el.querySelector('#death-btn-menu')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.hide();
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
    safeExitPointerLock();
    this.isVisible = true;

    if (this.el) {
      this.el.style.display = 'flex';
      const retryBtn = this.el.querySelector<HTMLButtonElement>('#death-btn-retry');
      retryBtn?.focus();
    }

    if (!this.keyHandler && typeof window !== 'undefined') {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible) return;
        if (e.code === 'Enter' || e.code === 'KeyR') {
          e.preventDefault();
          e.stopPropagation();
          const engine = AudioEngine.getInstance();
          engine.play('ui_confirm');
          this.hide();
          this.callbacks.onRetry();
        } else if (e.code === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          const engine = AudioEngine.getInstance();
          engine.play('ui_click');
          this.hide();
          this.callbacks.onMenu();
        }
      };
      window.addEventListener('keydown', this.keyHandler, true);
    }
  }

  hide(): void {
    this.isVisible = false;
    if (this.el) {
      this.el.style.display = 'none';
    }
    if (this.keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  }

  dispose(): void {
    this.hide();
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

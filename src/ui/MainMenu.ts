/* ── MainMenu.ts ──────────────────────────────────────────────────────────
 *  Analog horror Main Menu rendered over the live 3D Poolrooms background.
 *  Features title flicker, tagline, navigation buttons, and calibration status pill.
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';

export interface MainMenuCallbacks {
  onPlaySolo: () => void;
  onPlayOnline: () => void;
  onTapeArchive?: () => void;
  onHowToPlay: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

export class MainMenu {
  private el: HTMLElement | null = null;
  private callbacks: MainMenuCallbacks;
  private isCalibrated = false;

  get isReady(): boolean {
    return this.isCalibrated;
  }

  constructor(callbacks: MainMenuCallbacks) {
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'main-menu-view';
    el.className = 'bs-screen';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      padding: clamp(20px, 5vw, 60px) 24px;
      z-index: 100;
      pointer-events: auto;
      box-sizing: border-box;
      user-select: none;
    `;

    el.innerHTML = `
      <!-- Header -->
      <div style="text-align: center; pointer-events: auto;">
        <h1 class="flicker-title" style="
          font-family: 'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive;
          font-size: clamp(2.8rem, 8vw, 5.5rem);
          color: var(--fog, #d9d3a2);
          margin-bottom: 6px;
          letter-spacing: 0.05em;
          text-shadow: 0 0 25px rgba(134,207,160,0.35);
        ">BACKSILENCE</h1>
        <div style="
          font-family: monospace;
          font-size: clamp(0.75rem, 2vw, 1.05rem);
          color: var(--water, #86cfa0);
          letter-spacing: 0.15em;
          opacity: 0.9;
        ">IT CAN'T SEE YOU. IT HEARS THE WATER.</div>
      </div>

      <!-- Action Buttons -->
      <div id="menu-btn-group" style="
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: min(340px, 85vw);
        pointer-events: auto;
      ">
        <button id="btn-play-solo" class="analog-btn primary">
          PLAY SOLO <span style="font-size: 11px; opacity: 0.7;">(OFFLINE)</span>
        </button>
        <button id="btn-play-online" class="analog-btn">
          PLAY ONLINE <span style="font-size: 11px; opacity: 0.7;">(MULTIPLAYER)</span>
        </button>
        <button id="btn-tape-archive" class="analog-btn">
          TAPE ARCHIVE & CAREER <span style="font-size: 11px; opacity: 0.7;">(BATCH 7)</span>
        </button>
        <button id="btn-how-to-play" class="analog-btn">
          HOW TO PLAY
        </button>
        <button id="btn-settings" class="analog-btn">
          SETTINGS
        </button>
        <button id="btn-about" class="analog-btn">
          ABOUT
        </button>
      </div>

      <!-- Footer & Status Pill -->
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        font-family: monospace;
        font-size: 11px;
        color: var(--fog, #d9d3a2);
        opacity: 0.75;
        pointer-events: auto;
      ">
        <div id="calibration-pill" style="
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(13, 11, 6, 0.75);
          border: 1px solid rgba(134,207,160,0.4);
          padding: 4px 12px;
          border-radius: 20px;
          color: var(--water, #86cfa0);
        ">
          <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--water, #86cfa0); display: inline-block;"></span>
          <span id="calibration-label">Calibrating procedural assets...</span>
        </div>
        <div>BackSilence release build · Press ESC to return</div>
      </div>
    `;

    container.appendChild(el);
    this.el = el;

    this.bindEvents();
  }

  setCalibrationProgress(pct: number): void {
    if (!this.el) return;
    const label = this.el.querySelector('#calibration-label');
    if (!label) return;

    if (pct >= 1.0) {
      this.isCalibrated = true;
      label.textContent = 'Offline-ready';
    } else {
      label.textContent = `Calibrating assets... ${Math.round(pct * 100)}%`;
    }
  }

  private bindEvents(): void {
    if (!this.el) return;
    const engine = AudioEngine.getInstance();

    const buttons = this.el.querySelectorAll('.analog-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('mouseenter', () => engine.play('ui_hover'));
      btn.addEventListener('focus', () => engine.play('ui_hover'));
    });

    this.el.querySelector('#btn-play-solo')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.callbacks.onPlaySolo();
    });

    this.el.querySelector('#btn-play-online')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.callbacks.onPlayOnline();
    });

    this.el.querySelector('#btn-tape-archive')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.callbacks.onTapeArchive?.();
    });

    this.el.querySelector('#btn-how-to-play')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onHowToPlay();
    });

    this.el.querySelector('#btn-settings')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onSettings();
    });

    this.el.querySelector('#btn-about')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onAbout();
    });
  }

  show(): void {
    if (this.el) this.el.style.display = 'flex';
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

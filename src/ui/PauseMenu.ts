/* ── PauseMenu.ts ─────────────────────────────────────────────────────────
 *  Phase C: In-game Quick-Access Pause overlay:
 *  - Order: Resume first (re-locks pointer in 1 click)
 *  - Inline quick settings (Master volume, live Sensitivity preview, Brightness, Captions)
 *  - Settings, Controls Reference, Photo Mode, Quit (with Confirmation Modal & Undo)
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { loadSettings, saveSettings } from '../app/Settings.js';

export interface PauseMenuCallbacks {
  onResume: () => void;
  onSettings: () => void;
  onAudioLab: () => void;
  onQuit: () => void;
  onControlsReference?: () => void;
  onPhotoMode?: () => void;
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
    el.className = 'bs-screen';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(13, 11, 6, 0.88);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 500;
      pointer-events: auto;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
      padding: 16px;
      box-sizing: border-box;
      overflow-y: auto;
    `;

    el.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        width: min(380px, 92vw);
        padding: 24px 20px;
        border: 1px solid rgba(134,207,160,0.35);
        background: rgba(13, 11, 6, 0.96);
        box-shadow: 0 0 36px rgba(0,0,0,0.9);
        border-radius: 4px;
      ">
        <div style="text-align: center;">
          <h2 style="
            font-size: clamp(1.6rem, 4vw, 2.2rem);
            margin: 0;
            letter-spacing: 0.15em;
            color: var(--water, #86cfa0);
            text-shadow: 0 0 16px rgba(134,207,160,0.4);
          ">PAUSED</h2>
          <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">ACOUSTIC ANOMALY SUSPENDED</div>
        </div>

        <!-- 1. Resume First -->
        <button id="pause-btn-resume" class="analog-btn primary" style="width: 100%; min-height: 48px; font-size: 1.05rem; font-weight: bold; letter-spacing: 0.12em;">
          RESUME (ESC)
        </button>

        <!-- 2. Inline Quick Settings Card -->
        <div style="
          width: 100%;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(134,207,160,0.2);
          padding: 12px 14px;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          font-size: 11px;
        ">
          <div style="font-size: 10px; color: var(--water, #86cfa0); letter-spacing: 0.15em; font-weight: bold;">
            QUICK SETTINGS
          </div>

          <!-- Master Volume -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between;">
              <label for="pause-quick-volume">Master Volume:</label>
              <span id="pause-quick-volume-val" style="color: var(--water, #86cfa0);">80%</span>
            </div>
            <input type="range" id="pause-quick-volume" min="0" max="100" value="80" style="accent-color: var(--water, #86cfa0); width: 100%; cursor: pointer;" />
          </div>

          <!-- Mouse Sensitivity -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between;">
              <label for="pause-quick-sens">Sensitivity:</label>
              <span id="pause-quick-sens-val" style="color: var(--water, #86cfa0);">1.0x</span>
            </div>
            <input type="range" id="pause-quick-sens" min="20" max="300" value="100" style="accent-color: var(--water, #86cfa0); width: 100%; cursor: pointer;" />
          </div>

          <!-- Brightness -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between;">
              <label for="pause-quick-brightness">Brightness:</label>
              <span id="pause-quick-brightness-val" style="color: var(--water, #86cfa0);">100%</span>
            </div>
            <input type="range" id="pause-quick-brightness" min="50" max="150" value="100" style="accent-color: var(--water, #86cfa0); width: 100%; cursor: pointer;" />
          </div>

          <!-- Sound Captions -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 4px; border-top: 1px dashed rgba(217,211,162,0.15);">
            <label for="pause-quick-captions" style="cursor: pointer;">Sound Captions:</label>
            <input type="checkbox" id="pause-quick-captions" style="accent-color: var(--water, #86cfa0); cursor: pointer;" />
          </div>
        </div>

        <!-- 3. Navigation & Actions -->
        <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
          <button id="pause-btn-settings" class="analog-btn" style="width: 100%;">CONFIGURATION</button>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="pause-btn-controls" class="analog-btn" style="padding: 8px 4px; font-size: 11px;">CONTROLS (H)</button>
            <button id="pause-btn-photo" class="analog-btn" style="padding: 8px 4px; font-size: 11px;">PHOTO (P)</button>
          </div>
          <button id="pause-btn-audiolab" class="analog-btn" style="width: 100%; font-size: 11px; opacity: 0.85;">AUDIO LAB (B)</button>
          <button id="pause-btn-quit" class="analog-btn danger" style="width: 100%; margin-top: 4px;">ABORT EXPEDITION</button>
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

    const resumeAction = () => {
      engine.play('ui_confirm');
      this.callbacks.onResume();
      // Re-lock pointer in 1 click
      const canvas = document.querySelector('canvas');
      if (canvas && typeof canvas.requestPointerLock === 'function') {
        try {
          void canvas.requestPointerLock();
        } catch {
          /* ignore */
        }
      }
    };

    this.el.querySelector('#pause-btn-resume')?.addEventListener('click', resumeAction);

    // Quick Settings Binds
    const volInput = this.el.querySelector<HTMLInputElement>('#pause-quick-volume');
    const volVal = this.el.querySelector<HTMLElement>('#pause-quick-volume-val');
    const sensInput = this.el.querySelector<HTMLInputElement>('#pause-quick-sens');
    const sensVal = this.el.querySelector<HTMLElement>('#pause-quick-sens-val');
    const brightInput = this.el.querySelector<HTMLInputElement>('#pause-quick-brightness');
    const brightVal = this.el.querySelector<HTMLElement>('#pause-quick-brightness-val');
    const captionsInput = this.el.querySelector<HTMLInputElement>('#pause-quick-captions');

    volInput?.addEventListener('input', () => {
      const pct = Number(volInput.value);
      if (volVal) volVal.textContent = `${pct}%`;
      const frac = pct / 100;
      engine.setBusVolume('master', frac);
      const s = loadSettings();
      s.audio.master = frac;
      saveSettings(s);
    });

    sensInput?.addEventListener('input', () => {
      const val = Number(sensInput.value) / 100;
      if (sensVal) sensVal.textContent = `${val.toFixed(1)}x`;
      const s = loadSettings();
      s.controls.sensitivity = val;
      saveSettings(s);
    });

    brightInput?.addEventListener('input', () => {
      const pct = Number(brightInput.value);
      if (brightVal) brightVal.textContent = `${pct}%`;
      const s = loadSettings();
      s.graphics.brightness = pct / 100;
      saveSettings(s);
    });

    captionsInput?.addEventListener('change', () => {
      const checked = captionsInput.checked;
      const s = loadSettings();
      s.audio.soundVisualizer = checked;
      saveSettings(s);
    });

    this.el.querySelector('#pause-btn-settings')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onSettings();
    });

    this.el.querySelector('#pause-btn-controls')?.addEventListener('click', () => {
      engine.play('ui_click');
      if (this.callbacks.onControlsReference) {
        this.callbacks.onControlsReference();
      } else {
        this.callbacks.onSettings();
      }
    });

    this.el.querySelector('#pause-btn-photo')?.addEventListener('click', () => {
      engine.play('ui_click');
      if (this.callbacks.onPhotoMode) {
        this.callbacks.onPhotoMode();
      }
    });

    this.el.querySelector('#pause-btn-audiolab')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onAudioLab();
    });

    this.el.querySelector('#pause-btn-quit')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      const modal = new ConfirmationModal({
        title: 'ABORT EXPEDITION?',
        consequences: 'Leaving now will lose unarchived sector progress and return to the main archive.',
        confirmLabel: 'ABORT RUN',
        cancelLabel: 'KEEP PLAYING',
        isDanger: true,
        undoable: true,
        undoMessage: 'Expedition aborted.',
        onConfirm: () => {
          this.callbacks.onQuit();
        },
        onUndo: () => {
          this.callbacks.onResume();
        },
      });
      modal.mount();
    });
  }

  show(): void {
    if (this.el) {
      this.el.style.display = 'flex';
      this.syncQuickSettings();
      const resumeBtn = this.el.querySelector<HTMLButtonElement>('#pause-btn-resume');
      resumeBtn?.focus();
    }
  }

  private syncQuickSettings(): void {
    if (!this.el) return;
    const s = loadSettings();

    const volInput = this.el.querySelector<HTMLInputElement>('#pause-quick-volume');
    const volVal = this.el.querySelector<HTMLElement>('#pause-quick-volume-val');
    if (volInput && volVal) {
      const pct = Math.round((s.audio.master ?? 0.8) * 100);
      volInput.value = String(pct);
      volVal.textContent = `${pct}%`;
    }

    const sensInput = this.el.querySelector<HTMLInputElement>('#pause-quick-sens');
    const sensVal = this.el.querySelector<HTMLElement>('#pause-quick-sens-val');
    if (sensInput && sensVal) {
      const sens = s.controls.sensitivity ?? 1.0;
      sensInput.value = String(Math.round(sens * 100));
      sensVal.textContent = `${sens.toFixed(1)}x`;
    }

    const brightInput = this.el.querySelector<HTMLInputElement>('#pause-quick-brightness');
    const brightVal = this.el.querySelector<HTMLElement>('#pause-quick-brightness-val');
    if (brightInput && brightVal) {
      const bright = s.graphics.brightness ?? 1.0;
      brightInput.value = String(Math.round(bright * 100));
      brightVal.textContent = `${Math.round(bright * 100)}%`;
    }

    const captionsInput = this.el.querySelector<HTMLInputElement>('#pause-quick-captions');
    if (captionsInput) {
      captionsInput.checked = Boolean(s.audio.soundVisualizer);
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

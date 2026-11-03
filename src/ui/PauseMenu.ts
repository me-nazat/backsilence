/* ── PauseMenu.ts ─────────────────────────────────────────────────────────
 *  Phase C: In-game Quick-Access Pause overlay:
 *  - Order: Resume first (re-locks pointer in 1 click)
 *  - Inline quick settings (Master volume, live Sensitivity preview, Brightness, Captions)
 *  - Settings, Controls Reference, Photo Mode, Quit (with Confirmation Modal & Undo)
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';
import { loadSettings, saveSettings } from '../app/Settings.js';
import { safeRequestPointerLock } from '../engine/input/PointerLock.js';

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
    el.className = 'bs-screen pause-modal';
    el.setAttribute('data-modal', 'pause-modal');
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
      z-index: 9999;
      pointer-events: auto;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
      padding: 16px;
      box-sizing: border-box;
      overflow-y: auto;
      user-select: none;
      -webkit-user-select: none;
    `;

    el.innerHTML = `
      <div id="pause-modal" style="
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
        pointer-events: auto;
        position: relative;
        z-index: 10000;
        user-select: none;
        -webkit-user-select: none;
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
        <button id="btn-resume-game" data-action="resume" class="analog-btn primary pause-btn-resume" style="width: 100%; min-height: 48px; font-size: 1.05rem; font-weight: bold; letter-spacing: 0.12em; cursor: pointer; pointer-events: auto; position: relative; z-index: 10000;">
          RESUME (ESC)
        </button>

        <!-- Mission Objective (Objectives live on the pause screen) -->
        <div id="pause-objective-card" style="
          width: 100%;
          background: rgba(0,0,0,0.45);
          border: 1px solid rgba(217, 211, 162, 0.25);
          padding: 10px 14px;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-sizing: border-box;
        ">
          <div style="font-size: 10px; color: var(--water, #86cfa0); letter-spacing: 0.15em; font-weight: bold;">
            MISSION OBJECTIVE
          </div>
          <div id="pause-objective-text" style="font-size: 12px; color: var(--fog, #d9d3a2); line-height: 1.4;">
            Find the numbered pillars. Avoid making splashes.
          </div>
        </div>

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

          <!-- Minimal HUD -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label for="pause-quick-minimalhud" style="cursor: pointer;">Minimal HUD:</label>
            <input type="checkbox" id="pause-quick-minimalhud" style="accent-color: var(--water, #86cfa0); cursor: pointer;" />
          </div>
        </div>

        <!-- 3. Navigation & Actions -->
        <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
          <button id="btn-pause-configuration" data-action="configuration" class="analog-btn pause-btn-settings" style="width: 100%; cursor: pointer; pointer-events: auto; position: relative; z-index: 10000;">CONFIGURATION</button>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="btn-pause-controls" data-action="controls" class="analog-btn pause-btn-controls" style="padding: 8px 4px; font-size: 11px; cursor: pointer; pointer-events: auto; position: relative; z-index: 10000;">CONTROLS (K)</button>
            <button id="btn-pause-photo" data-action="photo" class="analog-btn pause-btn-photo" style="padding: 8px 4px; font-size: 11px; cursor: pointer; pointer-events: auto; position: relative; z-index: 10000;">PHOTO (P)</button>
          </div>
          <button id="btn-pause-audiolab" data-action="audiolab" class="analog-btn pause-btn-audiolab" style="width: 100%; font-size: 11px; opacity: 0.85; cursor: pointer; pointer-events: auto; position: relative; z-index: 10000;">AUDIO LAB (N)</button>
          <button id="btn-abort-expedition" data-action="abort-expedition" class="analog-btn danger pause-btn-quit" style="width: 100%; margin-top: 4px; cursor: pointer; pointer-events: auto; position: relative; z-index: 10000;">ABORT EXPEDITION</button>
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

    const resumeAction = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      engine.play('ui_confirm');
      this.hide();
      this.callbacks.onResume();
      // Re-lock pointer in 1 click
      const canvas = document.querySelector('canvas');
      if (canvas) {
        try {
          canvas.requestPointerLock();
        } catch {
          void safeRequestPointerLock(canvas);
        }
      }
    };

    const resumeBtn = this.el.querySelector<HTMLButtonElement>(
      '#btn-resume-game, #pause-btn-resume, [data-action="resume"]',
    );
    resumeBtn?.addEventListener('click', resumeAction);
    resumeBtn?.addEventListener('pointerdown', resumeAction);

    // Quick Settings Binds
    const volInput = this.el.querySelector<HTMLInputElement>('#pause-quick-volume');
    const volVal = this.el.querySelector<HTMLElement>('#pause-quick-volume-val');
    const sensInput = this.el.querySelector<HTMLInputElement>('#pause-quick-sens');
    const sensVal = this.el.querySelector<HTMLElement>('#pause-quick-sens-val');
    const brightInput = this.el.querySelector<HTMLInputElement>('#pause-quick-brightness');
    const brightVal = this.el.querySelector<HTMLElement>('#pause-quick-brightness-val');
    const captionsInput = this.el.querySelector<HTMLInputElement>('#pause-quick-captions');

    const updateVolume = () => {
      const pct = Number(volInput?.value ?? 80);
      if (volVal) volVal.textContent = `${pct}%`;
      const frac = pct / 100;
      engine.setBusVolume('master', frac);
      const s = loadSettings();
      s.audio.master = frac;
      saveSettings(s);
    };
    volInput?.addEventListener('input', updateVolume);
    volInput?.addEventListener('change', updateVolume);

    const updateSens = () => {
      const val = Number(sensInput?.value ?? 100) / 100;
      if (sensVal) sensVal.textContent = `${val.toFixed(1)}x (${Math.round(val * 360)}°)`;
      const s = loadSettings();
      s.controls.sensitivity = val;
      saveSettings(s);
    };
    sensInput?.addEventListener('input', updateSens);
    sensInput?.addEventListener('change', updateSens);

    const updateBright = () => {
      const pct = Number(brightInput?.value ?? 100);
      if (brightVal) brightVal.textContent = `${pct}%`;
      const s = loadSettings();
      s.graphics.brightness = pct / 100;
      saveSettings(s);
      const g = window as unknown as {
        __backsilence_lab?: { renderer?: { renderer?: { toneMappingExposure?: number } } };
        __backsilence_session?: { renderer?: { renderer?: { toneMappingExposure?: number } } };
      };
      if (g.__backsilence_lab?.renderer?.renderer) {
        g.__backsilence_lab.renderer.renderer.toneMappingExposure = pct / 100;
      }
      if (g.__backsilence_session?.renderer?.renderer) {
        g.__backsilence_session.renderer.renderer.toneMappingExposure = pct / 100;
      }
    };
    brightInput?.addEventListener('input', updateBright);
    brightInput?.addEventListener('change', updateBright);

    const updateCaptions = () => {
      const checked = captionsInput?.checked ?? false;
      const s = loadSettings();
      s.audio.soundVisualizer = checked;
      saveSettings(s);
    };
    captionsInput?.addEventListener('change', updateCaptions);

    const minimalHudInput = this.el.querySelector<HTMLInputElement>('#pause-quick-minimalhud');
    const updateMinimalHud = () => {
      const checked = minimalHudInput?.checked ?? false;
      const s = loadSettings();
      s.accessibility.minimalHud = checked;
      saveSettings(s);
      const hudEl = document.querySelector('#hud-overlay');
      if (hudEl) {
        if (checked) hudEl.classList.add('minimal-hud');
        else hudEl.classList.remove('minimal-hud');
      }
    };
    minimalHudInput?.addEventListener('change', updateMinimalHud);

    const settingsBtn = this.el.querySelector<HTMLButtonElement>(
      '#btn-pause-configuration, #pause-btn-settings, [data-action="configuration"]',
    );
    const onSettingsAction = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      engine.play('ui_click');
      this.callbacks.onSettings();
    };
    settingsBtn?.addEventListener('click', onSettingsAction);
    settingsBtn?.addEventListener('pointerdown', onSettingsAction);

    const controlsBtn = this.el.querySelector<HTMLButtonElement>(
      '#btn-pause-controls, #pause-btn-controls, [data-action="controls"]',
    );
    const onControlsAction = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      engine.play('ui_click');
      if (this.callbacks.onControlsReference) {
        this.callbacks.onControlsReference();
      } else {
        this.callbacks.onSettings();
      }
    };
    controlsBtn?.addEventListener('click', onControlsAction);
    controlsBtn?.addEventListener('pointerdown', onControlsAction);

    const photoBtn = this.el.querySelector<HTMLButtonElement>(
      '#btn-pause-photo, #pause-btn-photo, [data-action="photo"]',
    );
    const onPhotoAction = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      engine.play('ui_click');
      if (this.callbacks.onPhotoMode) {
        this.callbacks.onPhotoMode();
      }
    };
    photoBtn?.addEventListener('click', onPhotoAction);
    photoBtn?.addEventListener('pointerdown', onPhotoAction);

    const audioLabBtn = this.el.querySelector<HTMLButtonElement>(
      '#btn-pause-audiolab, #pause-btn-audiolab, [data-action="audiolab"]',
    );
    const onAudioLabAction = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      engine.play('ui_click');
      this.callbacks.onAudioLab();
    };
    audioLabBtn?.addEventListener('click', onAudioLabAction);
    audioLabBtn?.addEventListener('pointerdown', onAudioLabAction);

    const abortBtn = this.el.querySelector<HTMLButtonElement>(
      '#btn-abort-expedition, #pause-btn-quit, [data-action="abort-expedition"]',
    );
    const onAbortAction = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      engine.play('ui_confirm');
      if (typeof document !== 'undefined' && document.pointerLockElement) {
        try {
          document.exitPointerLock();
        } catch {
          /* ignore */
        }
      }
      this.hide();
      this.callbacks.onQuit();
    };
    abortBtn?.addEventListener('click', onAbortAction);
    abortBtn?.addEventListener('pointerdown', onAbortAction);
  }

  show(objective?: string): void {
    if (this.el) {
      this.el.classList.add('is-open');
      this.el.style.display = 'flex';
      this.el.style.visibility = 'visible';
      this.el.style.pointerEvents = 'auto';
      this.el.removeAttribute('aria-hidden');
      this.el.removeAttribute('inert');
      this.syncQuickSettings();
      if (objective) {
        const objText = this.el.querySelector('#pause-objective-text');
        if (objText) objText.textContent = objective;
      }
      const resumeBtn = this.el.querySelector<HTMLButtonElement>(
        '#btn-resume-game, #pause-btn-resume, [data-action="resume"]',
      );
      resumeBtn?.focus();
    }
  }

  setObjective(objective: string): void {
    if (this.el) {
      const objText = this.el.querySelector('#pause-objective-text');
      if (objText) objText.textContent = objective;
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
      sensVal.textContent = `${sens.toFixed(1)}x (${Math.round(sens * 360)}°)`;
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

    const minimalHudInput = this.el.querySelector<HTMLInputElement>('#pause-quick-minimalhud');
    if (minimalHudInput) {
      minimalHudInput.checked = Boolean(s.accessibility?.minimalHud);
    }
  }

  hide(): void {
    if (this.el) {
      this.el.classList.remove('is-open');
      this.el.style.display = 'none';
      this.el.style.visibility = 'hidden';
      this.el.style.pointerEvents = 'none';
      this.el.setAttribute('aria-hidden', 'true');
    }
  }

  dispose(): void {
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

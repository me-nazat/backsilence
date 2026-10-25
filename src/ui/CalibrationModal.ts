/* ── CalibrationModal.ts ──────────────────────────────────────────────────
 *  20-Second Skippable First-Run Calibration:
 *  1. Brightness check over procedural tile contrast image
 *  2. Audio volume check with stereo left/right drip preview
 *  3. Input device selector auto-detected from active environment
 *  Saves preferences to localStorage and never interrupts again unless requested.
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';
import { loadSettings, saveSettings } from '../app/Settings.js';
import { renderIcon } from './kit/index.js';

export interface CalibrationOptions {
  onComplete: () => void;
  onSkip?: () => void;
}

export class CalibrationModal {
  private el: HTMLElement | null = null;
  private brightnessVal = 1.0;
  private volumeVal = 0.8;
  private selectedInput: 'keyboard' | 'touch' | 'gamepad' = 'keyboard';
  private testAudioTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: CalibrationOptions) {
    this.detectDefaultInput();
  }

  private detectDefaultInput(): void {
    if (typeof window !== 'undefined') {
      const hasTouch = 'ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0);
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      const hasGamepad = Array.from(pads).some((p) => p && p.connected);

      if (hasGamepad) {
        this.selectedInput = 'gamepad';
      } else if (hasTouch && window.innerWidth <= 844) {
        this.selectedInput = 'touch';
      } else {
        this.selectedInput = 'keyboard';
      }
    }
  }

  mount(container: HTMLElement): void {
    const existing = document.getElementById('bs-calibration-modal');
    if (existing) existing.remove();

    const currentSettings = loadSettings();
    this.volumeVal = currentSettings.audio.master;
    this.brightnessVal = currentSettings.graphics.brightness ?? 1.0;

    const modal = document.createElement('div');
    modal.id = 'bs-calibration-modal';
    modal.className = 'bs-screen bs-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 9500;
      background: rgba(13, 11, 6, 0.94);
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: clamp(16px, 4vw, 32px);
      box-sizing: border-box;
      pointer-events: auto;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
      animation: bsFadeIn 0.25s ease-out;
    `;

    modal.innerHTML = `
      <div style="
        width: min(540px, 92vw);
        background: rgba(20, 18, 12, 0.98);
        border: 1px solid var(--water, #86cfa0);
        border-radius: 4px;
        padding: clamp(20px, 4vw, 32px);
        box-shadow: 0 0 35px rgba(134,207,160,0.25);
        display: flex;
        flex-direction: column;
        gap: 20px;
      ">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: 1.25rem; color: var(--water, #86cfa0); letter-spacing: 0.1em; margin: 0;">SENSOR CALIBRATION</h2>
            <div style="font-size: 0.75rem; opacity: 0.75; margin-top: 4px;">20-second setup for optimal acoustic horror experience</div>
          </div>
          <button id="calib-skip-btn" class="bs-btn bs-btn-ghost" style="font-size: 0.75rem; padding: 4px 10px;">SKIP</button>
        </div>

        <!-- 1. Brightness Check -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
            <span>1. DISPLAY EXPOSURE</span>
            <span id="calib-brightness-readout">${Math.round(this.brightnessVal * 100)}%</span>
          </div>

          <!-- Procedural Test Pattern -->
          <div id="calib-test-pattern" style="
            width: 100%;
            height: 70px;
            border: 1px solid rgba(217,211,162,0.3);
            border-radius: 3px;
            position: relative;
            overflow: hidden;
            background: linear-gradient(90deg, #050402 0%, #15130b 50%, #2a2517 100%);
            display: flex;
            align-items: center;
            justify-content: space-around;
            padding: 8px;
            box-sizing: border-box;
          ">
            <div style="width: 44px; height: 44px; background: #080704; border: 1px solid #141209; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #2a2517;">DARK</div>
            <div id="calib-tile-target" style="width: 44px; height: 44px; background: #141209; border: 1px solid #201c10; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #52472e;">TILE</div>
            <div style="width: 44px; height: 44px; background: #3f3721; border: 1px solid #5a4f32; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #9c8e65;">PALE</div>
          </div>
          <div style="font-size: 0.7rem; opacity: 0.7; line-height: 1.4;">
            Adjust the slider until the middle "TILE" is just barely distinct from the background.
          </div>
          <input id="calib-brightness-slider" type="range" min="0.6" max="1.5" step="0.05" value="${this.brightnessVal}" style="width: 100%; accent-color: var(--water, #86cfa0); cursor: pointer;" />
        </div>

        <!-- 2. Audio Stereo Check -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
            <span>2. AUDIO & SPATIAL STEREO</span>
            <span id="calib-volume-readout">${Math.round(this.volumeVal * 100)}%</span>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <input id="calib-volume-slider" type="range" min="0" max="1" step="0.05" value="${this.volumeVal}" style="flex: 1; accent-color: var(--water, #86cfa0); cursor: pointer;" />
            <button id="calib-test-audio-btn" class="analog-btn" style="padding: 6px 14px; font-size: 0.75rem; white-space: nowrap;">
              ${renderIcon('ear', 14)} TEST L/R
            </button>
          </div>
          <div id="calib-audio-status" style="font-size: 0.7rem; opacity: 0.7; height: 16px;">
            Stereo HRTF check: click TEST L/R to hear droplets left then right.
          </div>
        </div>

        <!-- 3. Primary Input Choice -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 0.85rem;">3. INPUT METHOD (AUTO-DETECTED)</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <button class="calib-input-btn analog-btn ${this.selectedInput === 'keyboard' ? 'primary' : ''}" data-type="keyboard" style="padding: 8px 4px; font-size: 0.75rem;">
              KEYBOARD
            </button>
            <button class="calib-input-btn analog-btn ${this.selectedInput === 'touch' ? 'primary' : ''}" data-type="touch" style="padding: 8px 4px; font-size: 0.75rem;">
              TOUCH
            </button>
            <button class="calib-input-btn analog-btn ${this.selectedInput === 'gamepad' ? 'primary' : ''}" data-type="gamepad" style="padding: 8px 4px; font-size: 0.75rem;">
              GAMEPAD
            </button>
          </div>
        </div>

        <!-- Confirm CTA -->
        <div style="display: flex; gap: 12px; margin-top: 8px;">
          <button id="calib-confirm-btn" class="analog-btn primary" style="flex: 1; padding: 12px; font-weight: 700; font-size: 0.95rem; letter-spacing: 0.15em;">
            CONFIRM & DESCEND
          </button>
        </div>
      </div>
    `;

    container.appendChild(modal);
    this.el = modal;
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.el) return;

    // Brightness Slider
    const bSlider = this.el.querySelector<HTMLInputElement>('#calib-brightness-slider');
    const bReadout = this.el.querySelector('#calib-brightness-readout');
    const testPattern = this.el.querySelector<HTMLElement>('#calib-test-pattern');

    bSlider?.addEventListener('input', () => {
      this.brightnessVal = parseFloat(bSlider.value);
      if (bReadout) bReadout.textContent = `${Math.round(this.brightnessVal * 100)}%`;
      if (testPattern) {
        testPattern.style.filter = `brightness(${this.brightnessVal})`;
      }
    });

    // Volume Slider
    const vSlider = this.el.querySelector<HTMLInputElement>('#calib-volume-slider');
    const vReadout = this.el.querySelector('#calib-volume-readout');

    vSlider?.addEventListener('input', () => {
      this.volumeVal = parseFloat(vSlider.value);
      if (vReadout) vReadout.textContent = `${Math.round(this.volumeVal * 100)}%`;
    });

    // Audio Test L/R
    const testAudioBtn = this.el.querySelector('#calib-test-audio-btn');
    const audioStatus = this.el.querySelector('#calib-audio-status');

    testAudioBtn?.addEventListener('click', () => {
      const engine = AudioEngine.getInstance();
      void engine.init().then(() => {
        engine.setBusVolume('master', this.volumeVal);
        if (audioStatus) audioStatus.textContent = '🔊 Playing LEFT channel drip...';

        // Left channel spatialized drip
        engine.play('drip', { position: { x: -4, y: 0, z: 2 }, gain: 1.0 });

        if (this.testAudioTimeout) clearTimeout(this.testAudioTimeout);
        this.testAudioTimeout = setTimeout(() => {
          if (audioStatus) audioStatus.textContent = '🔊 Playing RIGHT channel drip...';
          engine.play('drip', { position: { x: 4, y: 0, z: 2 }, gain: 1.0 });
          setTimeout(() => {
            if (audioStatus) audioStatus.textContent = '✅ Stereo check complete.';
          }, 600);
        }, 600);
      });
    });

    // Input selector buttons
    const inputBtns = this.el.querySelectorAll<HTMLButtonElement>('.calib-input-btn');
    inputBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        inputBtns.forEach((b) => b.classList.remove('primary'));
        btn.classList.add('primary');
        this.selectedInput = btn.dataset.type as 'keyboard' | 'touch' | 'gamepad';
      });
    });

    // Skip
    this.el.querySelector('#calib-skip-btn')?.addEventListener('click', () => {
      this.finish(true);
    });

    // Confirm
    this.el.querySelector('#calib-confirm-btn')?.addEventListener('click', () => {
      this.finish(false);
    });
  }

  private finish(skipped: boolean): void {
    if (this.testAudioTimeout) clearTimeout(this.testAudioTimeout);

    try {
      localStorage.setItem('backsilence_calibration_done', 'true');
      const settings = loadSettings();
      settings.audio.master = this.volumeVal;
      settings.graphics.brightness = this.brightnessVal;
      saveSettings(settings);

      const engine = AudioEngine.getInstance();
      engine.setBusVolume('master', this.volumeVal);
    } catch {
      /* ignore */
    }

    this.dispose();

    if (skipped && this.opts.onSkip) {
      this.opts.onSkip();
    } else {
      this.opts.onComplete();
    }
  }

  dispose(): void {
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
    this.el = null;
  }
}

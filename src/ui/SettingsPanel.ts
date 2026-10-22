/* ── SettingsPanel.ts ──────────────────────────────────────────────────────
 *  Comprehensive in-game Settings panel with live hot-reloading for Graphics,
 *  Audio, Controls (with interactive key rebinding & conflict detection), and A11y.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Settings, Action, QualityTier } from '../types/contracts.js';
import {
  saveSettings,
  defaultSettings,
  DEFAULT_BINDINGS,
  findBindingConflict,
} from '../app/Settings.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { ToastManager } from './ToastManager.js';

export interface SettingsPanelCallbacks {
  onBack: () => void;
  onApplySettings: (s: Settings) => void;
  onOpenAudioTest: () => void;
}

export class SettingsPanel {
  private el: HTMLElement | null = null;
  private settings: Settings;
  private callbacks: SettingsPanelCallbacks;
  private activeTab: 'graphics' | 'audio' | 'controls' | 'a11y' = 'graphics';

  private rebindingListener: ((e: KeyboardEvent) => void) | null = null;

  constructor(settings: Settings, callbacks: SettingsPanelCallbacks) {
    this.settings = JSON.parse(JSON.stringify(settings)) as Settings;
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'settings-panel-view';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(13, 11, 6, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: clamp(20px, 4vw, 40px) 20px;
      overflow-y: auto;
      z-index: 300;
      box-sizing: border-box;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
    `;

    container.appendChild(el);
    this.el = el;
    this.render();
  }

  private render(): void {
    if (!this.el) return;

    this.el.innerHTML = `
      <div style="width: min(720px, 95vw); display: flex; flex-direction: column; gap: 20px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: clamp(1.4rem, 3vw, 2.0rem); color: var(--water, #86cfa0); margin: 0;">CONFIGURATION</h2>
            <div style="font-size: 11px; opacity: 0.7;">Adjust rendering, acoustic balance, and input bindings</div>
          </div>
          <button id="btn-settings-back" class="analog-btn" style="width: auto; padding: 6px 16px;">ESC BACK</button>
        </div>

        <!-- Tabs -->
        <div style="display: flex; gap: 8px; border-bottom: 1px solid #3d2f18; padding-bottom: 6px;">
          <button class="tab-btn ${this.activeTab === 'graphics' ? 'active' : ''}" data-tab="graphics">GRAPHICS</button>
          <button class="tab-btn ${this.activeTab === 'audio' ? 'active' : ''}" data-tab="audio">AUDIO</button>
          <button class="tab-btn ${this.activeTab === 'controls' ? 'active' : ''}" data-tab="controls">CONTROLS</button>
          <button class="tab-btn ${this.activeTab === 'a11y' ? 'active' : ''}" data-tab="a11y">ACCESSIBILITY</button>
        </div>

        <!-- Tab Content -->
        <div id="tab-content" style="background: rgba(0,0,0,0.4); border: 1px solid #3d2f18; padding: 20px; border-radius: 4px; display: flex; flex-direction: column; gap: 16px;">
          ${this.renderTabContent()}
        </div>

        <!-- Footer Actions -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #3d2f18; padding-top: 14px;">
          <button id="btn-reset-all" class="analog-btn" style="width: auto; border-color: var(--danger, #b3261e); color: #f4c2c0; font-size: 11px; padding: 6px 14px;">Reset All Defaults</button>
          <button id="btn-save-close" class="analog-btn primary" style="width: auto; padding: 8px 24px;">SAVE & EXIT</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderTabContent(): string {
    switch (this.activeTab) {
      case 'graphics':
        return `
          <div class="setting-row">
            <div>
              <div class="setting-label">QUALITY TIER</div>
              <div class="setting-sub">Resolution scaling, shadows, and shader complexity</div>
            </div>
            <select id="set-quality" class="setting-select">
              <option value="auto" ${this.settings.graphics.quality === 'auto' ? 'selected' : ''}>Auto (Hardware detected)</option>
              <option value="low" ${this.settings.graphics.quality === 'low' ? 'selected' : ''}>Low (No shadows, 256 tex)</option>
              <option value="medium" ${this.settings.graphics.quality === 'medium' ? 'selected' : ''}>Medium (PCFSoft, 512 tex)</option>
              <option value="high" ${this.settings.graphics.quality === 'high' ? 'selected' : ''}>High (Full shadows, 1024 tex)</option>
            </select>
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">RESOLUTION SCALE: <span id="lbl-res">${this.settings.graphics.resolutionScale}%</span></div>
              <div class="setting-sub">Internal render resolution percentage (50%–100%)</div>
            </div>
            <input id="set-res" type="range" min="50" max="100" step="5" value="${this.settings.graphics.resolutionScale}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">FIELD OF VIEW (FOV): <span id="lbl-fov">${this.settings.graphics.fov}°</span></div>
              <div class="setting-sub">Camera horizontal viewing angle (60°–100°)</div>
            </div>
            <input id="set-fov" type="range" min="60" max="100" step="1" value="${this.settings.graphics.fov}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">BRIGHTNESS / EXPOSURE: <span id="lbl-bright">${this.settings.graphics.brightness.toFixed(1)}</span></div>
              <div class="setting-sub">ACESFilmic tone mapping exposure</div>
            </div>
            <input id="set-bright" type="range" min="0.8" max="1.4" step="0.05" value="${this.settings.graphics.brightness}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">VHS OVERLAY INTENSITY: <span id="lbl-vhs">${Math.round(this.settings.graphics.vhsIntensity * 100)}%</span></div>
              <div class="setting-sub">Scanlines and CRT distortion</div>
            </div>
            <input id="set-vhs" type="range" min="0" max="1" step="0.05" value="${this.settings.graphics.vhsIntensity}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">HEAD-BOB ANIMATION</div>
              <div class="setting-sub">Subtle camera motion during footsteps</div>
            </div>
            <input id="set-headbob" type="checkbox" ${this.settings.graphics.headBob ? 'checked' : ''} class="setting-toggle">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">SHOW FPS & PERF OVERLAY</div>
              <div class="setting-sub">Display real-time draw calls, triangles, and frame time</div>
            </div>
            <input id="set-showfps" type="checkbox" ${this.settings.graphics.showFps ? 'checked' : ''} class="setting-toggle">
          </div>
        `;

      case 'audio':
        return `
          <div class="setting-row">
            <div>
              <div class="setting-label">MASTER VOLUME: <span id="lbl-master">${Math.round(this.settings.audio.master * 100)}%</span></div>
              <div class="setting-sub">Master gain for all audio buses</div>
            </div>
            <input id="set-master" type="range" min="0" max="1" step="0.05" value="${this.settings.audio.master}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">SFX VOLUME: <span id="lbl-sfx">${Math.round(this.settings.audio.sfx * 100)}%</span></div>
              <div class="setting-sub">Splashes, footsteps, mantling, valves</div>
            </div>
            <input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${this.settings.audio.sfx}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">AMBIENT VOLUME: <span id="lbl-amb">${Math.round(this.settings.audio.ambient * 100)}%</span></div>
              <div class="setting-sub">Water lapping, electrical hum, subtle drone</div>
            </div>
            <input id="set-amb" type="range" min="0" max="1" step="0.05" value="${this.settings.audio.ambient}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">MONSTER VOLUME: <span id="lbl-mon">${Math.round(this.settings.audio.monster * 100)}%</span></div>
              <div class="setting-sub">Creature formants, roar, snarl, heartbeat, jumpscare</div>
            </div>
            <input id="set-mon" type="range" min="0" max="1" step="0.05" value="${this.settings.audio.monster}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">MUTE ON BLUR</div>
              <div class="setting-sub">Suspend audio when browser window loses focus</div>
            </div>
            <input id="set-muteonblur" type="checkbox" ${this.settings.audio.muteOnBlur ? 'checked' : ''} class="setting-toggle">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">SOUND VISUALIZER (A11Y)</div>
              <div class="setting-sub">Render directional on-screen ripple cues for sounds</div>
            </div>
            <input id="set-soundvis" type="checkbox" ${this.settings.audio.soundVisualizer ? 'checked' : ''} class="setting-toggle">
          </div>

          <div style="margin-top: 8px;">
            <button id="btn-open-audio-test" class="analog-btn" style="width: 100%; border-color: var(--water); color: var(--water); padding: 8px;">
              TEST ALL SYNTH SOUNDS (AUDIO LAB)
            </button>
          </div>
        `;

      case 'controls':
        return `
          <div class="setting-row">
            <div>
              <div class="setting-label">MOUSE SENSITIVITY: <span id="lbl-sens">${this.settings.controls.sensitivity.toFixed(1)}</span></div>
              <div class="setting-sub">Look speed scaling</div>
            </div>
            <input id="set-sens" type="range" min="0.1" max="3.0" step="0.1" value="${this.settings.controls.sensitivity}" class="setting-slider">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">INVERT VERTICAL LOOK (Y-AXIS)</div>
              <div class="setting-sub">Invert pitch axis</div>
            </div>
            <input id="set-inverty" type="checkbox" ${this.settings.controls.invertY ? 'checked' : ''} class="setting-toggle">
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">TOGGLE CROUCH</div>
              <div class="setting-sub">Press to toggle crouch instead of holding key</div>
            </div>
            <input id="set-togglecrouch" type="checkbox" ${this.settings.controls.toggleCrouch ? 'checked' : ''} class="setting-toggle">
          </div>

          <div style="margin-top: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: bold; color: var(--water);">KEY REBINDINGS</span>
              <button id="btn-reset-bindings" class="analog-btn" style="width: auto; font-size: 10px; padding: 2px 8px;">Reset Bindings</button>
            </div>
            <div id="key-rebind-table" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
              ${Object.entries(this.settings.controls.bindings)
                .map(
                  ([action, key]) => `
                <div class="rebind-row" data-action="${action}" style="display: flex; justify-content: space-between; align-items: center; background: #080603; border: 1px solid #3d2f18; padding: 6px 10px; border-radius: 3px; cursor: pointer;">
                  <span style="font-size: 11px; text-transform: uppercase;">${action}</span>
                  <span class="bind-key" style="font-size: 11px; color: var(--water); font-weight: bold;">${key.replace('Key', '')}</span>
                </div>
              `,
                )
                .join('')}
            </div>
            <div id="rebind-status" style="font-size: 11px; color: #d8b36a; height: 16px; margin-top: 6px;"></div>
          </div>
        `;

      case 'a11y':
        return `
          <div class="setting-row">
            <div>
              <div class="setting-label">REDUCED MOTION</div>
              <div class="setting-sub">Disable camera roll, ripples, and title flicker</div>
            </div>
            <select id="set-reducedmotion" class="setting-select">
              <option value="system" ${this.settings.graphics.reducedMotion === 'system' ? 'selected' : ''}>System Default</option>
              <option value="true" ${this.settings.graphics.reducedMotion === true ? 'selected' : ''}>Enabled (Reduce)</option>
              <option value="false" ${this.settings.graphics.reducedMotion === false ? 'selected' : ''}>Disabled</option>
            </select>
          </div>

          <div class="setting-row">
            <div>
              <div class="setting-label">HIGH CONTRAST UI</div>
              <div class="setting-sub">Enhance border definition and text readability</div>
            </div>
            <input id="set-highcontrast" type="checkbox" class="setting-toggle">
          </div>
        `;
    }
  }

  private bindEvents(): void {
    if (!this.el) return;
    const engine = AudioEngine.getInstance();

    this.el.querySelector('#btn-settings-back')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onBack();
    });

    this.el.querySelector('#btn-save-close')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      saveSettings(this.settings);
      this.callbacks.onApplySettings(this.settings);
      ToastManager.getInstance().show('Settings saved successfully', { type: 'success' });
      this.callbacks.onBack();
    });

    // Tab switcher
    const tabBtns = this.el.querySelectorAll('.tab-btn');
    tabBtns.forEach((b) => {
      b.addEventListener('click', () => {
        engine.play('ui_click');
        this.activeTab = b.getAttribute('data-tab') as typeof this.activeTab;
        this.render();
      });
    });

    // Reset All Defaults
    this.el.querySelector('#btn-reset-all')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all settings to default values?')) {
        engine.play('ui_confirm');
        this.settings = defaultSettings();
        saveSettings(this.settings);
        this.callbacks.onApplySettings(this.settings);
        this.render();
        ToastManager.getInstance().show('All settings reset to defaults', { type: 'info' });
      }
    });

    this.bindTabSpecificEvents();
  }

  private bindTabSpecificEvents(): void {
    if (!this.el) return;
    const engine = AudioEngine.getInstance();

    if (this.activeTab === 'graphics') {
      const q = this.el.querySelector('#set-quality') as HTMLSelectElement;
      q?.addEventListener('change', () => {
        this.settings.graphics.quality = q.value as QualityTier;
        this.liveApply();
      });

      const res = this.el.querySelector('#set-res') as HTMLInputElement;
      res?.addEventListener('input', () => {
        this.settings.graphics.resolutionScale = parseInt(res.value, 10);
        const lbl = this.el?.querySelector('#lbl-res');
        if (lbl) lbl.textContent = `${this.settings.graphics.resolutionScale}%`;
        this.liveApply();
      });

      const fov = this.el.querySelector('#set-fov') as HTMLInputElement;
      fov?.addEventListener('input', () => {
        this.settings.graphics.fov = parseInt(fov.value, 10);
        const lbl = this.el?.querySelector('#lbl-fov');
        if (lbl) lbl.textContent = `${this.settings.graphics.fov}°`;
        this.liveApply();
      });

      const bright = this.el.querySelector('#set-bright') as HTMLInputElement;
      bright?.addEventListener('input', () => {
        this.settings.graphics.brightness = parseFloat(bright.value);
        const lbl = this.el?.querySelector('#lbl-bright');
        if (lbl) lbl.textContent = this.settings.graphics.brightness.toFixed(1);
        this.liveApply();
      });

      const vhs = this.el.querySelector('#set-vhs') as HTMLInputElement;
      vhs?.addEventListener('input', () => {
        this.settings.graphics.vhsIntensity = parseFloat(vhs.value);
        const lbl = this.el?.querySelector('#lbl-vhs');
        if (lbl) lbl.textContent = `${Math.round(this.settings.graphics.vhsIntensity * 100)}%`;
        this.liveApply();
      });

      const headbob = this.el.querySelector('#set-headbob') as HTMLInputElement;
      headbob?.addEventListener('change', () => {
        this.settings.graphics.headBob = headbob.checked;
        this.liveApply();
      });

      const showfps = this.el.querySelector('#set-showfps') as HTMLInputElement;
      showfps?.addEventListener('change', () => {
        this.settings.graphics.showFps = showfps.checked;
        this.liveApply();
      });
    } else if (this.activeTab === 'audio') {
      const setupSlider = (id: string, lblId: string, prop: keyof Settings['audio']): void => {
        const slider = this.el?.querySelector(`#${id}`) as HTMLInputElement;
        slider?.addEventListener('input', () => {
          const val = parseFloat(slider.value);
          (this.settings.audio as unknown as Record<string, number>)[prop] = val;
          const lbl = this.el?.querySelector(`#${lblId}`);
          if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
          this.liveApply();
        });
      };

      setupSlider('set-master', 'lbl-master', 'master');
      setupSlider('set-sfx', 'lbl-sfx', 'sfx');
      setupSlider('set-amb', 'lbl-amb', 'ambient');
      setupSlider('set-mon', 'lbl-mon', 'monster');

      const mute = this.el.querySelector('#set-muteonblur') as HTMLInputElement;
      mute?.addEventListener('change', () => {
        this.settings.audio.muteOnBlur = mute.checked;
        this.liveApply();
      });

      const vis = this.el.querySelector('#set-soundvis') as HTMLInputElement;
      vis?.addEventListener('change', () => {
        this.settings.audio.soundVisualizer = vis.checked;
        this.liveApply();
      });

      this.el.querySelector('#btn-open-audio-test')?.addEventListener('click', () => {
        engine.play('ui_click');
        this.callbacks.onOpenAudioTest();
      });
    } else if (this.activeTab === 'controls') {
      const sens = this.el.querySelector('#set-sens') as HTMLInputElement;
      sens?.addEventListener('input', () => {
        this.settings.controls.sensitivity = parseFloat(sens.value);
        const lbl = this.el?.querySelector('#lbl-sens');
        if (lbl) lbl.textContent = this.settings.controls.sensitivity.toFixed(1);
        this.liveApply();
      });

      const inv = this.el.querySelector('#set-inverty') as HTMLInputElement;
      inv?.addEventListener('change', () => {
        this.settings.controls.invertY = inv.checked;
        this.liveApply();
      });

      const tc = this.el.querySelector('#set-togglecrouch') as HTMLInputElement;
      tc?.addEventListener('change', () => {
        this.settings.controls.toggleCrouch = tc.checked;
        this.liveApply();
      });

      this.el.querySelector('#btn-reset-bindings')?.addEventListener('click', () => {
        engine.play('ui_confirm');
        this.settings.controls.bindings = { ...DEFAULT_BINDINGS };
        this.liveApply();
        this.render();
      });

      // Key rebind clicks
      const rebindRows = this.el.querySelectorAll('.rebind-row');
      const status = this.el.querySelector('#rebind-status');

      rebindRows.forEach((row) => {
        row.addEventListener('click', () => {
          const action = row.getAttribute('data-action') as Action;
          this.startRebinding(action, row as HTMLElement, status as HTMLElement);
        });
      });
    } else if (this.activeTab === 'a11y') {
      const rm = this.el.querySelector('#set-reducedmotion') as HTMLSelectElement;
      rm?.addEventListener('change', () => {
        this.settings.graphics.reducedMotion =
          rm.value === 'system' ? 'system' : rm.value === 'true';
        this.liveApply();
      });
    }
  }

  private startRebinding(action: Action, row: HTMLElement, status: HTMLElement): void {
    const engine = AudioEngine.getInstance();
    engine.play('ui_click');

    if (this.rebindingListener) {
      window.removeEventListener('keydown', this.rebindingListener);
    }

    const keySpan = row.querySelector('.bind-key');
    if (keySpan) keySpan.textContent = '[PRESS KEY]';
    if (status) status.textContent = `Press any key to bind to ${action.toUpperCase()}...`;

    this.rebindingListener = (e: KeyboardEvent) => {
      e.preventDefault();
      window.removeEventListener('keydown', this.rebindingListener!);
      this.rebindingListener = null;

      const newKey = e.code;
      const conflict = findBindingConflict(this.settings.controls.bindings, action, newKey);

      if (conflict) {
        engine.play('ui_error');
        if (status) status.textContent = `Warning: '${newKey.replace('Key', '')}' is already bound to ${conflict.toUpperCase()}! Overwriting.`;
        // Swap conflict
        this.settings.controls.bindings[conflict] = '';
      } else {
        engine.play('ui_confirm');
        if (status) status.textContent = `Bound ${action.toUpperCase()} to ${newKey.replace('Key', '')}`;
      }

      this.settings.controls.bindings[action] = newKey;
      this.liveApply();
      setTimeout(() => this.render(), 600);
    };

    window.addEventListener('keydown', this.rebindingListener, { once: true });
  }

  private liveApply(): void {
    this.callbacks.onApplySettings(this.settings);
  }

  show(): void {
    if (this.el) this.el.style.display = 'flex';
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none';
  }

  dispose(): void {
    if (this.rebindingListener) {
      window.removeEventListener('keydown', this.rebindingListener);
    }
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

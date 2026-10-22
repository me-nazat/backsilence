/* ── AudioLabPanel.ts ───────────────────────────────────────────────────────
 *  Interactive sound auditioning and audio diagnostic panel.
 *  Lists all 26 procedural synth voices, provides live oscilloscope waveform,
 *  reverb preset selector, tension slider, and 3D positional left/right toggles.
 * ──────────────────────────────────────────────────────────────────────── */

import type { AudioEngine, VoiceName } from '../audio/AudioEngine.js';
import type { ReverbPreset } from '../audio/Reverb.js';
import type { Vec3 } from '../types/contracts.js';

export class AudioLabPanel {
  private engine: AudioEngine;
  private panelEl: HTMLElement | null = null;
  private animFrameId: number | null = null;

  private isVisible = false;
  private intensity = 1.0;
  private positionalMode: 'center' | 'left' | 'right' = 'center';
  private isUnderwater = false;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  mount(container: HTMLElement): void {
    const panel = document.createElement('div');
    panel.id = 'audio-lab-panel';
    panel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: min(440px, 90vw);
      max-height: 85vh;
      background: rgba(13, 11, 6, 0.94);
      border: 1px solid var(--water, #86cfa0);
      border-radius: 6px;
      padding: 16px;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
      font-size: 12px;
      z-index: 10001;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.85);
      display: none;
    `;

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(134,207,160,0.3); padding-bottom:8px;">
        <span style="font-weight:bold; color:var(--water, #86cfa0); font-size:14px;">[ AUDIO LAB / VOICE TEST ]</span>
        <button id="audio-lab-close" style="background:none; border:none; color:var(--fog, #d9d3a2); cursor:pointer; font-size:16px;">✕</button>
      </div>

      <!-- Oscilloscope Canvas -->
      <canvas id="audio-osc" width="380" height="64" style="width:100%; height:64px; background:#060503; border:1px solid rgba(134,207,160,0.25); border-radius:3px; margin-bottom:12px; display:block;"></canvas>

      <!-- Live Diagnostics -->
      <div id="audio-stats" style="margin-bottom:12px; font-size:11px; opacity:0.85;">
        State: <span id="stat-state">-</span> | Active Voices: <span id="stat-voices">0</span> | Rate: <span id="stat-rate">-</span>
      </div>

      <!-- Controls Row -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px;">
        <div>
          <label style="display:block; margin-bottom:4px; font-size:11px;">REVERB PRESET</label>
          <select id="audio-reverb" style="width:100%; background:#1c170d; color:var(--fog); border:1px solid #5b4526; padding:4px; border-radius:3px;">
            <option value="poolroom" selected>poolroom (2.4s)</option>
            <option value="tunnel">tunnel (1.6s)</option>
            <option value="atrium">atrium (3.2s)</option>
            <option value="drain">drain (4.5s)</option>
          </select>
        </div>
        <div>
          <label style="display:block; margin-bottom:4px; font-size:11px;">POSITIONAL PAN</label>
          <button id="audio-pan-btn" style="width:100%; background:#1c170d; color:var(--water); border:1px solid #5b4526; padding:4px; cursor:pointer; border-radius:3px;">Center</button>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between;">
          <label style="font-size:11px;">TENSION: <span id="tension-val">0.00</span></label>
          <button id="audio-underwater-btn" style="background:none; border:1px solid #5b4526; color:var(--fog); font-size:10px; padding:2px 6px; cursor:pointer; border-radius:3px;">Underwater: OFF</button>
        </div>
        <input id="audio-tension-slider" type="range" min="0" max="1" step="0.05" value="0" style="width:100%; accent-color:var(--water); cursor:pointer;">
      </div>

      <div style="margin-bottom:12px;">
        <label style="font-size:11px; display:block; margin-bottom:2px;">INTENSITY: <span id="intensity-val">1.0</span></label>
        <input id="audio-intensity-slider" type="range" min="0.2" max="2.0" step="0.1" value="1.0" style="width:100%; accent-color:var(--water); cursor:pointer;">
      </div>

      <!-- Voice Grid -->
      <div style="font-weight:bold; margin-bottom:6px; color:var(--water); font-size:11px;">SYNTH VOICES (26 TOTAL):</div>
      <div id="voice-buttons" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:6px;"></div>
    `;

    container.appendChild(panel);
    this.panelEl = panel;

    this.bindEvents();
    this.populateVoiceButtons();
  }

  private bindEvents(): void {
    if (!this.panelEl) return;

    this.panelEl.querySelector('#audio-lab-close')?.addEventListener('click', () => {
      this.toggle(false);
    });

    const reverbSelect = this.panelEl.querySelector('#audio-reverb') as HTMLSelectElement;
    reverbSelect?.addEventListener('change', () => {
      this.engine.setReverbPreset(reverbSelect.value as ReverbPreset);
    });

    const panBtn = this.panelEl.querySelector('#audio-pan-btn') as HTMLButtonElement;
    panBtn?.addEventListener('click', () => {
      if (this.positionalMode === 'center') {
        this.positionalMode = 'left';
        panBtn.textContent = 'Left (-4m)';
      } else if (this.positionalMode === 'left') {
        this.positionalMode = 'right';
        panBtn.textContent = 'Right (+4m)';
      } else {
        this.positionalMode = 'center';
        panBtn.textContent = 'Center';
      }
    });

    const underwaterBtn = this.panelEl.querySelector('#audio-underwater-btn') as HTMLButtonElement;
    underwaterBtn?.addEventListener('click', () => {
      this.isUnderwater = !this.isUnderwater;
      this.engine.setUnderwater(this.isUnderwater ? 1.0 : 0.0);
      underwaterBtn.textContent = `Underwater: ${this.isUnderwater ? 'ON' : 'OFF'}`;
      underwaterBtn.style.color = this.isUnderwater ? 'var(--water)' : 'var(--fog)';
    });

    const tensionSlider = this.panelEl.querySelector('#audio-tension-slider') as HTMLInputElement;
    const tensionVal = this.panelEl.querySelector('#tension-val') as HTMLSpanElement;
    tensionSlider?.addEventListener('input', () => {
      const val = parseFloat(tensionSlider.value);
      tensionVal.textContent = val.toFixed(2);
      this.engine.setTension(val);
    });

    const intensitySlider = this.panelEl.querySelector('#audio-intensity-slider') as HTMLInputElement;
    const intensityVal = this.panelEl.querySelector('#intensity-val') as HTMLSpanElement;
    intensitySlider?.addEventListener('input', () => {
      this.intensity = parseFloat(intensitySlider.value);
      intensityVal.textContent = this.intensity.toFixed(1);
    });
  }

  private populateVoiceButtons(): void {
    const list: VoiceName[] = [
      'splash_small',
      'splash_big',
      'splash_jump',
      'wade_step',
      'wade_loop',
      'pebble_plink',
      'step_dry',
      'step_squeak',
      'mantle',
      'drip',
      'lap_loop',
      'hum_loop',
      'drone_loop',
      'monster_roar',
      'monster_snarl',
      'monster_breath_loop',
      'monster_sniff',
      'monster_wade',
      'jumpscare',
      'heartbeat',
      'ui_hover',
      'ui_click',
      'ui_confirm',
      'ui_error',
      'keypad_beep',
      'door_clunk',
      'vhs_glitch',
      'tape_rewind',
      'tape_eject',
      'tape_insert',
      'static_burst',
    ];

    const container = this.panelEl?.querySelector('#voice-buttons');
    if (!container) return;

    for (const name of list) {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.style.cssText = `
        background: #19140b;
        color: var(--fog, #d9d3a2);
        border: 1px solid #4a381f;
        padding: 5px 6px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        cursor: pointer;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: background 0.1s, border-color 0.1s;
      `;

      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = 'var(--water, #86cfa0)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = '#4a381f';
      });

      btn.addEventListener('click', () => {
        let pos: Vec3 | undefined;
        if (this.positionalMode === 'left') {
          pos = { x: -4.0, y: 0.0, z: -1.0 };
        } else if (this.positionalMode === 'right') {
          pos = { x: 4.0, y: 0.0, z: -1.0 };
        }

        btn.style.background = 'rgba(134,207,160,0.3)';
        setTimeout(() => {
          btn.style.background = '#19140b';
        }, 150);

        this.engine.play(name, {
          intensity: this.intensity,
          ...(pos ? { position: pos } : {}),
        });
      });

      container.appendChild(btn);
    }
  }

  toggle(visible?: boolean): void {
    this.isVisible = visible !== undefined ? visible : !this.isVisible;
    if (this.panelEl) {
      this.panelEl.style.display = this.isVisible ? 'block' : 'none';
    }

    if (this.isVisible) {
      this.startOscilloscope();
    } else {
      this.stopOscilloscope();
    }
  }

  private startOscilloscope(): void {
    const canvas = this.panelEl?.querySelector('#audio-osc') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = this.engine.analyser;
    const bufferLength = analyser?.frequencyBinCount ?? 256;
    const dataArray = new Uint8Array(bufferLength);

    const draw = (): void => {
      this.animFrameId = requestAnimationFrame(draw);

      // Update stats readout
      const stats = this.engine.stats();
      const stateEl = this.panelEl?.querySelector('#stat-state');
      const voicesEl = this.panelEl?.querySelector('#stat-voices');
      const rateEl = this.panelEl?.querySelector('#stat-rate');
      if (stateEl) stateEl.textContent = stats.contextState;
      if (voicesEl) voicesEl.textContent = String(stats.activeVoices);
      if (rateEl) rateEl.textContent = `${stats.sampleRate} Hz`;

      ctx.fillStyle = '#060503';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (analyser) {
        analyser.getByteTimeDomainData(dataArray);

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#86cfa0';
        ctx.beginPath();

        const sliceWidth = (canvas.width * 1.0) / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i]! / 128.0;
          const y = (v * canvas.height) / 2.0;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      } else {
        // Flat center line if no analyser active
        ctx.strokeStyle = '#3d2f18';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
    };

    draw();
  }

  private stopOscilloscope(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  dispose(): void {
    this.stopOscilloscope();
    if (this.panelEl?.parentElement) {
      this.panelEl.parentElement.removeChild(this.panelEl);
    }
  }
}

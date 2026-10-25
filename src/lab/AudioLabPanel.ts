/* ── AudioLabPanel.ts ───────────────────────────────────────────────────────
 *  Interactive sound auditioning and audio diagnostic panel (?lab=audio).
 *  Categorized triggers for all procedural synth voices, live oscilloscope waveform,
 *  reverb preset selector, output profile selector, bus mutes/gains, A/B reference toggles,
 *  and offline WAV rendering & downloader.
 * ──────────────────────────────────────────────────────────────────────── */

import type { AudioEngine, VoiceName } from '../audio/AudioEngine.js';
import type { ReverbPreset } from '../audio/Reverb.js';
import type { OutputProfile } from '../audio/Mixer.js';
import type { Vec3 } from '../types/contracts.js';

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = buffer.length;
  const dataByteLength = numSamples * blockAlign;
  const headerByteLength = 44;
  const totalLength = headerByteLength + dataByteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]![i]!));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export class AudioLabPanel {
  private engine: AudioEngine;
  private panelEl: HTMLElement | null = null;
  private animFrameId: number | null = null;

  private isVisible = false;
  private intensity = 1.0;
  private positionalMode: 'center' | 'left' | 'right' = 'center';
  private isUnderwater = false;
  private lastSelectedVoice: VoiceName = 'splash_small';
  private isReferenceMode = false;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  mount(container: HTMLElement): void {
    const panel = document.createElement('div');
    panel.id = 'audio-lab-panel';
    panel.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      width: min(480px, 94vw);
      max-height: 90vh;
      background: rgba(13, 11, 6, 0.96);
      border: 1px solid var(--water, #86cfa0);
      border-radius: 6px;
      padding: 16px;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
      font-size: 11px;
      z-index: 10001;
      overflow-y: auto;
      box-shadow: 0 10px 40px rgba(0,0,0,0.9);
      display: none;
    `;

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid rgba(134,207,160,0.3); padding-bottom:6px;">
        <span style="font-weight:bold; color:var(--water, #86cfa0); font-size:13px;">[ BACKSILENCE AUDIO LAB & AUDITION ]</span>
        <button id="audio-lab-close" style="background:none; border:none; color:var(--fog, #d9d3a2); cursor:pointer; font-size:16px;">✕</button>
      </div>

      <!-- Oscilloscope & Meter Canvas -->
      <canvas id="audio-osc" width="440" height="64" style="width:100%; height:64px; background:#060503; border:1px solid rgba(134,207,160,0.25); border-radius:3px; margin-bottom:8px; display:block;"></canvas>

      <!-- Live Diagnostics -->
      <div id="audio-stats" style="margin-bottom:10px; font-size:10px; opacity:0.85; display:flex; justify-content:space-between;">
        <span>State: <b id="stat-state">-</b></span>
        <span>Voices: <b id="stat-voices">0</b></span>
        <span>Rate: <b id="stat-rate">-</b></span>
        <span>Peak: <b id="stat-peak">0.00 dBTP</b></span>
      </div>

      <!-- Bus Gains & Mutes -->
      <div style="background:#141009; border:1px solid #3d2f18; border-radius:4px; padding:8px; margin-bottom:10px;">
        <div style="font-weight:bold; color:var(--water); margin-bottom:6px;">BUS MIXER & MUTES:</div>
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px;">
          <div>
            <label style="display:block; font-size:9px;">SFX</label>
            <input type="range" id="bus-sfx" min="0" max="1.5" step="0.05" value="1.0" style="width:100%; accent-color:var(--water);">
          </div>
          <div>
            <label style="display:block; font-size:9px;">AMBIENT</label>
            <input type="range" id="bus-ambient" min="0" max="1.5" step="0.05" value="0.85" style="width:100%; accent-color:var(--water);">
          </div>
          <div>
            <label style="display:block; font-size:9px;">MONSTER</label>
            <input type="range" id="bus-monster" min="0" max="1.5" step="0.05" value="1.0" style="width:100%; accent-color:var(--water);">
          </div>
          <div>
            <label style="display:block; font-size:9px;">UI</label>
            <input type="range" id="bus-ui" min="0" max="1.5" step="0.05" value="0.9" style="width:100%; accent-color:var(--water);">
          </div>
        </div>
      </div>

      <!-- Controls Grid -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px;">
        <div>
          <label style="display:block; margin-bottom:3px; font-size:10px;">REVERB PRESET</label>
          <select id="audio-reverb" style="width:100%; background:#1c170d; color:var(--fog); border:1px solid #5b4526; padding:3px; border-radius:3px; font-size:10px;">
            <option value="poolroom" selected>poolroom (4.2s)</option>
            <option value="tunnel">tunnel (2.8s)</option>
            <option value="atrium">atrium (3.2s)</option>
            <option value="drain">drain (4.5s)</option>
            <option value="school">school (1.4s)</option>
            <option value="jungle">jungle (1.1s)</option>
            <option value="city">city (2.2s)</option>
            <option value="station">station (3.8s)</option>
          </select>
        </div>
        <div>
          <label style="display:block; margin-bottom:3px; font-size:10px;">OUTPUT PROFILE</label>
          <select id="audio-output-profile" style="width:100%; background:#1c170d; color:var(--fog); border:1px solid #5b4526; padding:3px; border-radius:3px; font-size:10px;">
            <option value="headphones" selected>Headphones</option>
            <option value="speakers">Studio Speakers</option>
            <option value="phone">Phone Speaker</option>
            <option value="night">Night Mode (Compressed)</option>
            <option value="mono">Mono Downmix</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px;">
        <div>
          <label style="display:block; margin-bottom:3px; font-size:10px;">PANNING</label>
          <button id="audio-pan-btn" style="width:100%; background:#1c170d; color:var(--water); border:1px solid #5b4526; padding:4px; cursor:pointer; border-radius:3px; font-size:10px;">Center</button>
        </div>
        <div>
          <label style="display:block; margin-bottom:3px; font-size:10px;">A/B REFERENCE</label>
          <button id="audio-ab-btn" style="width:100%; background:#1c170d; color:var(--fog); border:1px solid #5b4526; padding:4px; cursor:pointer; border-radius:3px; font-size:10px;">A: Active Engine</button>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between;">
          <label style="font-size:10px;">DREAD / TENSION: <span id="tension-val">0.00</span></label>
          <button id="audio-underwater-btn" style="background:none; border:1px solid #5b4526; color:var(--fog); font-size:9px; padding:2px 5px; cursor:pointer; border-radius:3px;">Underwater: OFF</button>
        </div>
        <input id="audio-tension-slider" type="range" min="0" max="1" step="0.05" value="0" style="width:100%; accent-color:var(--water); cursor:pointer;">
      </div>

      <!-- WAV Download Row -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#141009; border:1px solid #3d2f18; border-radius:4px; padding:6px 8px; margin-bottom:10px;">
        <span style="font-size:10px;">Selected: <b id="selected-voice-name" style="color:var(--water);">splash_small</b></span>
        <button id="btn-download-wav" style="background:#2a3b2b; color:var(--water); border:1px solid #86cfa0; padding:3px 8px; font-size:10px; cursor:pointer; border-radius:3px;">Render & Download WAV</button>
      </div>

      <!-- Voice Categories Container -->
      <div id="voice-categories" style="display:flex; flex-direction:column; gap:8px;"></div>
    `;

    container.appendChild(panel);
    this.panelEl = panel;

    this.bindEvents();
    this.populateVoiceCategories();
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

    const profileSelect = this.panelEl.querySelector('#audio-output-profile') as HTMLSelectElement;
    profileSelect?.addEventListener('change', () => {
      this.engine.setOutputProfile(profileSelect.value as OutputProfile);
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

    const abBtn = this.panelEl.querySelector('#audio-ab-btn') as HTMLButtonElement;
    abBtn?.addEventListener('click', () => {
      this.isReferenceMode = !this.isReferenceMode;
      abBtn.textContent = this.isReferenceMode ? 'B: Reference Sim' : 'A: Active Engine';
      abBtn.style.color = this.isReferenceMode ? '#f59e0b' : 'var(--fog)';
      // When reference mode is active, simulate target calibration filter
      this.engine.setAmbientHfTilt(this.isReferenceMode ? 0.8 : 0.0);
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
      this.engine.setDread(val);
    });

    // Bus Mixer Sliders
    const bindBusSlider = (id: string, busName: 'sfx' | 'ambient' | 'monster' | 'ui') => {
      const slider = this.panelEl?.querySelector(`#${id}`) as HTMLInputElement;
      slider?.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        this.engine.setBusVolume(busName, val);
      });
    };
    bindBusSlider('bus-sfx', 'sfx');
    bindBusSlider('bus-ambient', 'ambient');
    bindBusSlider('bus-monster', 'monster');
    bindBusSlider('bus-ui', 'ui');

    // Download WAV button
    this.panelEl.querySelector('#btn-download-wav')?.addEventListener('click', () => {
      void this.renderAndDownloadWav(this.lastSelectedVoice);
    });
  }

  private async renderAndDownloadWav(voice: VoiceName): Promise<void> {
    const OfflineContext =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineContext) {
      alert('OfflineAudioContext unsupported in this environment.');
      return;
    }

    const sampleRate = 48000;
    const duration = 2.5;
    const offlineCtx = new OfflineContext(2, Math.floor(sampleRate * duration), sampleRate);

    // Create a temporary offline engine render
    const { createNoiseBuffers } = await import('../audio/Noise.js');
    const noise = createNoiseBuffers(offlineCtx);
    const dest = offlineCtx.destination;
    const reverbSend = offlineCtx.createGain();
    reverbSend.gain.setValueAtTime(0.4, 0);
    reverbSend.connect(dest);

    const voiceCtx = {
      ctx: offlineCtx,
      destination: dest,
      reverbSend,
      noise,
      intensity: this.intensity,
      seed: 42,
    };

    // Play voice into offline context
    const { playSplash, playWadeStep, playPebblePlink } = await import('../audio/voices/Splashes.js');
    const { playStepDry, playStepSqueak, playDrip } = await import('../audio/voices/Footsteps.js');
    const { playMonsterRoar, playMonsterFootfall } = await import('../audio/voices/Monster.js');
    const { playJumpscare, playHeartbeat } = await import('../audio/voices/Jumpscare.js');
    const { playSparsePipeClank, playSparseWaterSurge, playSparseCavernDraft } = await import('../audio/voices/AmbienceBeds.js');
    const { playUiClick, playUiConfirm, playUiStamp } = await import('../audio/voices/UiSounds.js');

    if (voice === 'splash_small') playSplash('small', voiceCtx);
    else if (voice === 'splash_big') playSplash('big', voiceCtx);
    else if (voice === 'wade_step') playWadeStep(voiceCtx);
    else if (voice === 'pebble_plink') playPebblePlink(voiceCtx);
    else if (voice === 'step_dry') playStepDry(voiceCtx);
    else if (voice === 'step_squeak') playStepSqueak(voiceCtx);
    else if (voice === 'drip') playDrip(voiceCtx);
    else if (voice === 'monster_roar') playMonsterRoar(voiceCtx);
    else if (voice === 'monster_footfall') playMonsterFootfall(voiceCtx);
    else if (voice === 'jumpscare') playJumpscare(voiceCtx);
    else if (voice === 'heartbeat') playHeartbeat(voiceCtx);
    else if (voice === 'sparse_pipe_clank') playSparsePipeClank(voiceCtx);
    else if (voice === 'sparse_water_surge') playSparseWaterSurge(voiceCtx);
    else if (voice === 'sparse_cavern_draft') playSparseCavernDraft(voiceCtx);
    else if (voice === 'ui_click') playUiClick(voiceCtx);
    else if (voice === 'ui_confirm') playUiConfirm(voiceCtx);
    else if (voice === 'ui_stamp') playUiStamp(voiceCtx);
    else playSparsePipeClank(voiceCtx);

    const rendered = await offlineCtx.startRendering();
    const blob = audioBufferToWavBlob(rendered);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backsilence_${voice}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private populateVoiceCategories(): void {
    const categories: { title: string; voices: VoiceName[] }[] = [
      {
        title: 'WATER & TRAVERSAL',
        voices: [
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
        ],
      },
      {
        title: 'CREATURE & THREATS',
        voices: [
          'monster_roar',
          'monster_snarl',
          'monster_breath_loop',
          'monster_sniff',
          'monster_wade',
          'monster_footfall',
          'monster_swipe',
          'monster_collapse',
          'jumpscare',
          'heartbeat',
        ],
      },
      {
        title: 'AMBIENCE BEDS & DRONES',
        voices: [
          'lap_loop',
          'hum_loop',
          'drone_loop',
          'ambience_tunnels',
          'ambience_atrium',
          'ambience_filtration',
          'ambience_drain',
          'ambience_school',
          'ambience_jungle',
          'rain_loop',
          'neon_buzz_loop',
          'rail_sing_loop',
          'train_rumble_loop',
        ],
      },
      {
        title: 'SPARSE ENVIRONMENTAL EVENTS',
        voices: [
          'sparse_pipe_clank',
          'sparse_metal_creak',
          'sparse_steam_hiss',
          'sparse_electrical_crackle',
          'sparse_sub_shudder',
          'sparse_water_surge',
          'sparse_cavern_draft',
          'sparse_pebble_fall',
          'monster_ambient_far',
          'creak',
          'chalk_scratch',
          'piano_clunk',
          'thunder',
          'train_horn',
        ],
      },
      {
        title: 'TACTILE UI & INTERACTION',
        voices: [
          'ui_hover',
          'ui_click',
          'ui_confirm',
          'ui_error',
          'ui_stamp',
          'ui_achievement',
          'ui_ready',
          'ui_rank_up',
          'results_stinger',
          'keypad_beep',
          'door_clunk',
          'tape_insert',
          'tape_eject',
          'tape_rewind',
        ],
      },
    ];

    const container = this.panelEl?.querySelector('#voice-categories');
    if (!container) return;

    for (const cat of categories) {
      const catDiv = document.createElement('div');
      catDiv.style.marginBottom = '6px';

      const title = document.createElement('div');
      title.textContent = `${cat.title} (${cat.voices.length}):`;
      title.style.cssText = 'font-weight:bold; color:var(--water); font-size:10px; margin-bottom:4px;';
      catDiv.appendChild(title);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid; grid-template-columns: repeat(2, 1fr); gap:4px;';

      for (const name of cat.voices) {
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.style.cssText = `
          background: #19140b;
          color: var(--fog, #d9d3a2);
          border: 1px solid #4a381f;
          padding: 4px 6px;
          border-radius: 3px;
          font-family: inherit;
          font-size: 9px;
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
          this.lastSelectedVoice = name;
          const label = this.panelEl?.querySelector('#selected-voice-name');
          if (label) label.textContent = name;

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

        grid.appendChild(btn);
      }

      catDiv.appendChild(grid);
      container.appendChild(catDiv);
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

      const stats = this.engine.stats();
      const stateEl = this.panelEl?.querySelector('#stat-state');
      const voicesEl = this.panelEl?.querySelector('#stat-voices');
      const rateEl = this.panelEl?.querySelector('#stat-rate');
      const peakEl = this.panelEl?.querySelector('#stat-peak');

      if (stateEl) stateEl.textContent = stats.contextState;
      if (voicesEl) voicesEl.textContent = String(stats.activeVoices);
      if (rateEl) rateEl.textContent = `${stats.sampleRate} Hz`;

      ctx.fillStyle = '#060503';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (analyser) {
        analyser.getByteTimeDomainData(dataArray);

        let maxDev = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#86cfa0';
        ctx.beginPath();

        const sliceWidth = (canvas.width * 1.0) / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i]! / 128.0;
          const dev = Math.abs(dataArray[i]! - 128) / 128.0;
          if (dev > maxDev) maxDev = dev;

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

        if (peakEl) {
          const db = maxDev > 1e-4 ? (20 * Math.log10(maxDev)).toFixed(1) : '-inf';
          peakEl.textContent = `${db} dBFS`;
        }
      } else {
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

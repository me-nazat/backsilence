/* ── Hud.ts ───────────────────────────────────────────────────────────────
 *  In-game HUD overlay: reactive Noise Meter, stamina bar, status chips,
 *  notebook sequence strip, VHS OSD, interaction prompt, and sound captions.
 * ──────────────────────────────────────────────────────────────────────── */

export interface HudData {
  noiseLoudness: number; // 0..1
  stamina: number;       // 0..1
  status: 'DRY' | 'WET' | 'CROUCHED';
  objective: string;
  interactionPrompt?: string | null;
  notebookNumbers: string[]; // e.g. ['#1: 4', '#2: 2', '#3: ?']
  soundVisualizerCaption?: string | null;
  damageVignette: number; // 0..1
  vhsTime?: string;
  showVhsOsd?: boolean;
  multiplayerRoster?: Array<{ name: string; alive: boolean }>;
}

export class Hud {
  private el: HTMLElement | null = null;
  private noiseBarEl: HTMLElement | null = null;
  private noiseIconEl: HTMLElement | null = null;
  private staminaBarEl: HTMLElement | null = null;
  private statusChipEl: HTMLElement | null = null;
  private objectiveEl: HTMLElement | null = null;
  private promptEl: HTMLElement | null = null;
  private notebookEl: HTMLElement | null = null;
  private captionEl: HTMLElement | null = null;
  private vignetteEl: HTMLElement | null = null;
  private vhsOsdEl: HTMLElement | null = null;

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'hud-overlay';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 150;
      user-select: none;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
    `;

    el.innerHTML = `
      <!-- Red / Jumpscare Damage Vignette -->
      <div id="hud-vignette" style="
        position: absolute;
        inset: 0;
        background: radial-gradient(circle, transparent 50%, rgba(179,38,30,0.8) 100%);
        opacity: 0;
        transition: opacity 0.15s ease-out;
      "></div>

      <!-- Center Crosshair Dot -->
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--fog, #d9d3a2);
        box-shadow: 0 0 4px rgba(0,0,0,0.8);
        transform: translate(-50%, -50%);
        opacity: 0.7;
      "></div>

      <!-- Interaction Prompt -->
      <div id="hud-prompt" style="
        position: absolute;
        top: 55%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 13px;
        color: var(--water, #86cfa0);
        background: rgba(13, 11, 6, 0.75);
        padding: 4px 10px;
        border: 1px solid rgba(134,207,160,0.3);
        border-radius: 3px;
        display: none;
      "></div>

      <!-- VHS OSD Elements -->
      <div id="hud-vhs-osd" style="display: block;">
        <div style="position: absolute; top: 24px; left: 24px; font-size: 13px; letter-spacing: 0.1em; display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--danger, #b3261e); font-size: 16px;">●</span>
          <span>REC</span>
          <span id="vhs-timestamp" style="margin-left: 8px; opacity: 0.85;">00:12:44</span>
        </div>
        <div style="position: absolute; top: 24px; right: 24px; font-size: 12px; opacity: 0.75; letter-spacing: 0.1em;">
          SP 0:00:00 · POOLROOMS
        </div>
        <div style="position: absolute; bottom: 24px; left: 24px; font-size: 12px; opacity: 0.75; letter-spacing: 0.1em;">
          PLAY ▶
        </div>
      </div>

      <!-- Top-Right Notebook Sequence Strip -->
      <div style="position: absolute; top: 56px; right: 24px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em;">PILLAR SEQUENCE</div>
        <div id="hud-notebook" style="
          background: #080603;
          border: 1px solid #5b4526;
          border-radius: 3px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: bold;
          color: var(--water, #86cfa0);
          letter-spacing: 0.2em;
        ">#1: 4 · #2: 2 · #3: ?</div>
      </div>

      <!-- Top-Center Objective Line -->
      <div id="hud-objective" style="
        position: absolute;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 12px;
        background: rgba(13, 11, 6, 0.6);
        border: 1px solid rgba(217, 211, 162, 0.2);
        padding: 5px 14px;
        border-radius: 12px;
        color: var(--fog, #d9d3a2);
        letter-spacing: 0.05em;
      ">Find the numbered pillars. Avoid making splashes.</div>

      <!-- Bottom-Center: The Acoustic Noise Meter & Stamina -->
      <div style="
        position: absolute;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      ">
        <!-- Status & Stamina -->
        <div style="display: flex; align-items: center; gap: 12px; width: 220px; justify-content: space-between;">
          <span id="hud-status" class="badge" style="border-color: var(--water); color: var(--water); font-size: 10px;">DRY</span>
          
          <!-- Stamina bar -->
          <div style="width: 130px; height: 3px; background: rgba(217,211,162,0.15); border-radius: 2px; overflow: hidden;">
            <div id="hud-stamina-bar" style="width: 100%; height: 100%; background: var(--water); border-radius: 2px; transition: width 0.1s linear;"></div>
          </div>
        </div>

        <!-- Central Noise Meter -->
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(13, 11, 6, 0.85);
          border: 1px solid #3d2f18;
          padding: 6px 14px;
          border-radius: 20px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.6);
        ">
          <!-- Waveform / Ripple Icon -->
          <svg id="hud-noise-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--fog); transition: color 0.15s, transform 0.15s;">
            <path d="M12 3v18M8 8v8M4 11v2M16 6v12M20 9v6"/>
          </svg>

          <!-- Noise loudness bar -->
          <div style="width: 150px; height: 6px; background: rgba(217,211,162,0.15); border-radius: 3px; overflow: hidden;">
            <div id="hud-noise-bar" style="
              width: 0%;
              height: 100%;
              background: var(--fog, #d9d3a2);
              border-radius: 3px;
              transition: width 0.08s ease-out, background-color 0.15s;
            "></div>
          </div>
        </div>
      </div>

      <!-- Sound Visualizer Caption -->
      <div id="hud-caption" style="
        position: absolute;
        bottom: 50px;
        left: 24px;
        font-size: 12px;
        color: var(--water, #86cfa0);
        background: rgba(13, 11, 6, 0.7);
        padding: 4px 8px;
        border-radius: 3px;
        display: none;
      "></div>
    `;

    container.appendChild(el);
    this.el = el;

    this.noiseBarEl = el.querySelector('#hud-noise-bar');
    this.noiseIconEl = el.querySelector('#hud-noise-icon');
    this.staminaBarEl = el.querySelector('#hud-stamina-bar');
    this.statusChipEl = el.querySelector('#hud-status');
    this.objectiveEl = el.querySelector('#hud-objective');
    this.promptEl = el.querySelector('#hud-prompt');
    this.notebookEl = el.querySelector('#hud-notebook');
    this.captionEl = el.querySelector('#hud-caption');
    this.vignetteEl = el.querySelector('#hud-vignette');
    this.vhsOsdEl = el.querySelector('#hud-vhs-osd');
  }

  private currentData: HudData = {
    noiseLoudness: 0,
    stamina: 1,
    status: 'DRY',
    objective: '',
    interactionPrompt: null,
    notebookNumbers: [],
    soundVisualizerCaption: null,
    damageVignette: 0,
    vhsTime: 'REC ● 00:00:00',
    showVhsOsd: false,
  };

  update(incoming: Partial<HudData>): void {
    if (!this.el) return;
    this.currentData = { ...this.currentData, ...incoming };
    const data = this.currentData;

    // 1. Noise Meter update
    const loudnessPct = Math.min(100, Math.max(0, data.noiseLoudness * 100));
    if (this.noiseBarEl) {
      this.noiseBarEl.style.width = `${loudnessPct}%`;
      // Calm cream -> Warning red color transition
      if (data.noiseLoudness < 0.35) {
        this.noiseBarEl.style.background = 'var(--fog, #d9d3a2)';
      } else if (data.noiseLoudness < 0.7) {
        this.noiseBarEl.style.background = '#d8b36a';
      } else {
        this.noiseBarEl.style.background = 'var(--danger, #b3261e)';
      }
    }

    if (this.noiseIconEl) {
      if (data.noiseLoudness > 0.4) {
        this.noiseIconEl.style.color = data.noiseLoudness > 0.7 ? 'var(--danger)' : '#d8b36a';
        this.noiseIconEl.style.transform = 'scale(1.2)';
      } else {
        this.noiseIconEl.style.color = 'var(--fog)';
        this.noiseIconEl.style.transform = 'scale(1.0)';
      }
    }

    // 2. Stamina Bar
    if (this.staminaBarEl) {
      this.staminaBarEl.style.width = `${Math.round(data.stamina * 100)}%`;
    }

    // 3. Status Chip
    if (this.statusChipEl) {
      this.statusChipEl.textContent = data.status;
      if (data.status === 'WET') {
        this.statusChipEl.style.borderColor = '#d8b36a';
        this.statusChipEl.style.color = '#d8b36a';
      } else if (data.status === 'CROUCHED') {
        this.statusChipEl.style.borderColor = 'var(--fog)';
        this.statusChipEl.style.color = 'var(--fog)';
      } else {
        this.statusChipEl.style.borderColor = 'var(--water)';
        this.statusChipEl.style.color = 'var(--water)';
      }
    }

    // 4. Objective & Interaction Prompt
    if (this.objectiveEl && data.objective) {
      this.objectiveEl.textContent = data.objective;
    }

    if (this.promptEl) {
      if (data.interactionPrompt) {
        this.promptEl.textContent = data.interactionPrompt;
        this.promptEl.style.display = 'block';
      } else {
        this.promptEl.style.display = 'none';
      }
    }

    // 5. Notebook sequence strip
    if (this.notebookEl && data.notebookNumbers.length > 0) {
      this.notebookEl.textContent = data.notebookNumbers.join(' · ');
    }

    // 6. Sound visualizer caption
    if (this.captionEl) {
      if (data.soundVisualizerCaption) {
        this.captionEl.textContent = data.soundVisualizerCaption;
        this.captionEl.style.display = 'block';
      } else {
        this.captionEl.style.display = 'none';
      }
    }

    // 7. Damage Vignette
    if (this.vignetteEl) {
      this.vignetteEl.style.opacity = String(data.damageVignette);
    }

    // 8. VHS OSD
    if (this.vhsOsdEl) {
      this.vhsOsdEl.style.display = data.showVhsOsd === false ? 'none' : 'block';
    }
    if (data.vhsTime) {
      const timeSpan = this.el.querySelector('#vhs-timestamp');
      if (timeSpan) timeSpan.textContent = data.vhsTime;
    }
  }

  show(): void {
    if (this.el) this.el.style.display = 'block';
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

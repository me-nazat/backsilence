/* ── ModeSelect.ts ────────────────────────────────────────────────────────
 *  Mode and Map Selector with procedural 2D canvas thumbnails, difficulty scales,
 *  seed generator, and offline/online routing.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../types/contracts.js';
import { AudioEngine } from '../audio/AudioEngine.js';

export interface ModeSelectCallbacks {
  onBack: () => void;
  onStartSingle: (config: { mapId: MapId; difficulty: number; seed: number }) => void;
  onOpenMultiplayer: (mode: 'host' | 'join') => void;
}

interface MapDef {
  id: MapId;
  name: string;
  tagline: string;
  locked: boolean;
}

const MAPS: MapDef[] = [
  {
    id: 'poolrooms',
    name: 'The Flooded Poolrooms',
    tagline: 'Infinite warm water and damp ceramic tiles.',
    locked: false,
  },
  {
    id: 'utility_tunnels',
    name: 'Utility Tunnels',
    tagline: 'Narrow concrete maintenance crawlspaces with surging pipes.',
    locked: true,
  },
  {
    id: 'marble_atrium',
    name: 'Marble Atrium',
    tagline: 'Vast echoing hall of deep submerged statues.',
    locked: true,
  },
  {
    id: 'hydro_maze',
    name: 'Hydro Maze',
    tagline: 'Disorienting trench labyrinths with rising tides.',
    locked: true,
  },
  {
    id: 'drainage_core',
    name: 'Drainage Core',
    tagline: 'Industrial abyssal sump pits and roaring intake grates.',
    locked: true,
  },
];

export class ModeSelect {
  private el: HTMLElement | null = null;
  private callbacks: ModeSelectCallbacks;

  private selectedMode: 'single' | 'multi' = 'single';
  private selectedMap: MapId = 'poolrooms';
  private difficulty = 1.0; // 0.75 | 1.0 | 1.3
  private seed: number;

  constructor(callbacks: ModeSelectCallbacks, initialMode: 'single' | 'multi' = 'single') {
    this.callbacks = callbacks;
    this.selectedMode = initialMode;
    this.seed = Math.floor(100000 + Math.random() * 900000);
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'mode-select-view';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(13, 11, 6, 0.92);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: clamp(20px, 4vw, 40px) 20px;
      overflow-y: auto;
      z-index: 200;
      box-sizing: border-box;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
    `;

    el.innerHTML = `
      <div style="width: min(880px, 95vw); display: flex; flex-direction: column; gap: 20px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: clamp(1.4rem, 3vw, 2.0rem); color: var(--water, #86cfa0); margin: 0;">SELECT MODE & MAP</h2>
            <div style="font-size: 11px; opacity: 0.7;">Prepare your expedition into the submerged levels</div>
          </div>
          <button id="btn-mode-back" class="analog-btn" style="width: auto; padding: 6px 16px;">ESC BACK</button>
        </div>

        <!-- Mode Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
          <!-- Singleplayer Card -->
          <div id="card-mode-single" class="mode-card ${this.selectedMode === 'single' ? 'selected' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: bold; font-size: 14px;">SINGLE-PLAYER</span>
              <span class="badge">No network required</span>
            </div>
            <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
              Pure survival horror. Explore the silent labyrinth alone. Sound is your only feedback.
            </div>
          </div>

          <!-- Multiplayer Card -->
          <div id="card-mode-multi" class="mode-card ${this.selectedMode === 'multi' ? 'selected' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: bold; font-size: 14px;">MULTIPLAYER</span>
              <span class="badge" style="border-color: #d8b36a; color: #d8b36a;">Co-op Room</span>
            </div>
            <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
              Host or join a synchronized expedition with friends via 4-letter room codes.
            </div>
          </div>
        </div>

        <!-- Map Picker -->
        <div>
          <div style="font-size: 12px; font-weight: bold; color: var(--water, #86cfa0); margin-bottom: 8px;">SELECT MAP</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px;">
            ${MAPS.map((m) => `
              <div class="map-card ${m.id === this.selectedMap ? 'selected' : ''} ${m.locked ? 'locked' : ''}" data-map="${m.id}">
                <canvas id="thumb-${m.id}" width="160" height="90" style="width: 100%; height: 90px; border-radius: 3px; display: block; margin-bottom: 6px;"></canvas>
                <div style="font-weight: bold; font-size: 11px; margin-bottom: 3px;">${m.name}</div>
                <div style="font-size: 9px; opacity: 0.7; line-height: 1.3;">${m.tagline}</div>
                ${m.locked ? `
                  <div style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: #d8b36a; margin-top: 6px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                    Locked
                  </div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Parameters: Difficulty & Seed -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; background: rgba(0,0,0,0.4); padding: 16px; border-radius: 4px; border: 1px solid #3d2f18;">
          <!-- Difficulty -->
          <div>
            <label style="display: block; font-size: 11px; margin-bottom: 6px; color: var(--water, #86cfa0);">DIFFICULTY</label>
            <div style="display: flex; gap: 8px;">
              <button class="diff-btn ${this.difficulty === 0.75 ? 'active' : ''}" data-diff="0.75">Whisper (x0.75)</button>
              <button class="diff-btn ${this.difficulty === 1.0 ? 'active' : ''}" data-diff="1.0">Normal (x1.0)</button>
              <button class="diff-btn ${this.difficulty === 1.3 ? 'active' : ''}" data-diff="1.3">Deafening (x1.3)</button>
            </div>
          </div>

          <!-- Seed -->
          <div>
            <label style="display: block; font-size: 11px; margin-bottom: 6px; color: var(--water, #86cfa0);">WORLD SEED</label>
            <div style="display: flex; gap: 8px;">
              <input id="input-seed" type="number" value="${this.seed}" style="flex: 1; background: #1c170d; border: 1px solid #5b4526; color: var(--fog); padding: 6px 8px; font-family: monospace; border-radius: 3px;">
              <button id="btn-seed-random" class="analog-btn" style="width: auto; padding: 6px 12px; font-size: 11px;">Randomize</button>
            </div>
          </div>
        </div>

        <!-- Start CTA -->
        <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
          <button id="btn-start-expedition" class="analog-btn primary" style="width: 240px; padding: 12px 20px; font-size: 14px;">
            ${this.selectedMode === 'single' ? 'START EXPEDITION' : 'PROCEED TO LOBBY'}
          </button>
        </div>
      </div>
    `;

    container.appendChild(el);
    this.el = el;

    this.renderMapThumbnails();
    this.bindEvents();
  }

  private renderMapThumbnails(): void {
    if (!this.el) return;

    for (const m of MAPS) {
      const canvas = this.el.querySelector(`#thumb-${m.id}`) as HTMLCanvasElement;
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const w = canvas.width;
      const h = canvas.height;

      // Base gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      if (m.id === 'poolrooms') {
        grad.addColorStop(0, '#d9d3a2');
        grad.addColorStop(0.5, '#d8b36a');
        grad.addColorStop(1, '#3f9c6b');
      } else if (m.id === 'utility_tunnels') {
        grad.addColorStop(0, '#4a4237');
        grad.addColorStop(1, '#1f1b16');
      } else if (m.id === 'marble_atrium') {
        grad.addColorStop(0, '#e8e8e8');
        grad.addColorStop(1, '#2c4a43');
      } else if (m.id === 'hydro_maze') {
        grad.addColorStop(0, '#86cfa0');
        grad.addColorStop(1, '#1b3b2b');
      } else {
        grad.addColorStop(0, '#592e2b');
        grad.addColorStop(1, '#0d0b06');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Tiled grid preview
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1;
      const step = 14;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Procedural water reflection band
      ctx.fillStyle = 'rgba(134, 207, 160, 0.25)';
      ctx.fillRect(0, h * 0.55, w, h * 0.45);

      if (m.locked) {
        ctx.fillStyle = 'rgba(13, 11, 6, 0.65)';
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  private bindEvents(): void {
    if (!this.el) return;
    const engine = AudioEngine.getInstance();

    this.el.querySelector('#btn-mode-back')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onBack();
    });

    // Single vs Multi card selection
    const singleCard = this.el.querySelector('#card-mode-single');
    const multiCard = this.el.querySelector('#card-mode-multi');
    const startBtn = this.el.querySelector('#btn-start-expedition') as HTMLButtonElement;

    singleCard?.addEventListener('click', () => {
      engine.play('ui_click');
      this.selectedMode = 'single';
      singleCard.classList.add('selected');
      multiCard?.classList.remove('selected');
      if (startBtn) startBtn.textContent = 'START EXPEDITION';
    });

    multiCard?.addEventListener('click', () => {
      engine.play('ui_click');
      this.selectedMode = 'multi';
      multiCard.classList.add('selected');
      singleCard?.classList.remove('selected');
      if (startBtn) startBtn.textContent = 'PROCEED TO LOBBY';
    });

    // Map selection (only poolrooms is selectable)
    const mapCards = this.el.querySelectorAll('.map-card');
    mapCards.forEach((c) => {
      c.addEventListener('click', () => {
        const id = c.getAttribute('data-map') as MapId;
        if (id === 'poolrooms') {
          engine.play('ui_click');
          this.selectedMap = id;
          mapCards.forEach((mc) => mc.classList.remove('selected'));
          c.classList.add('selected');
        } else {
          engine.play('ui_error');
        }
      });
    });

    // Difficulty selection
    const diffBtns = this.el.querySelectorAll('.diff-btn');
    diffBtns.forEach((b) => {
      b.addEventListener('click', () => {
        engine.play('ui_click');
        this.difficulty = parseFloat(b.getAttribute('data-diff') ?? '1.0');
        diffBtns.forEach((db) => db.classList.remove('active'));
        b.classList.add('active');
      });
    });

    // Seed randomize
    const seedInput = this.el.querySelector('#input-seed') as HTMLInputElement;
    this.el.querySelector('#btn-seed-random')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.seed = Math.floor(100000 + Math.random() * 900000);
      if (seedInput) seedInput.value = String(this.seed);
    });

    seedInput?.addEventListener('input', () => {
      this.seed = parseInt(seedInput.value, 10) || 123456;
    });

    // Start CTA
    startBtn?.addEventListener('click', () => {
      engine.play('ui_confirm');
      if (this.selectedMode === 'single') {
        this.callbacks.onStartSingle({
          mapId: this.selectedMap,
          difficulty: this.difficulty,
          seed: this.seed,
        });
      } else {
        this.callbacks.onOpenMultiplayer('host');
      }
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

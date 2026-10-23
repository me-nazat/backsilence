/* ── ModeSelect.ts ────────────────────────────────────────────────────────
 *  Mode and Map Selector with procedural 2D canvas thumbnails, difficulty scales,
 *  seed generator, and offline/online routing.
 *  Batch 5: "Featured" tab (5 new maps) + "Archive" tab (5 classic maps).
 *  Default map: 'natatorium'. Rich metadata (stars, tags, best solo/duo times).
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../types/contracts.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { getMapPreviewLayout, FEATURED_MAP_IDS, ARCHIVE_MAP_IDS } from '../world/MapRegistry.js';
import { loadProgress } from './ResultsScreen.js';

export interface ModeSelectCallbacks {
  onBack: () => void;
  onStartSingle: (config: { mapId: MapId; difficulty: number; seed: number }) => void;
  onOpenMultiplayer: (mode: 'host' | 'join') => void;
}

interface MapDef {
  id: MapId;
  name: string;
  tagline: string;
  stars: number;
  tags: string[];
}

const FEATURED_MAPS: MapDef[] = [
  {
    id: 'natatorium',
    name: 'The Grand Natatorium',
    tagline: 'Edwardian municipal bath, Ear mosaic, 4 ordinal pillars & Drain Wheel.',
    stars: 3,
    tags: ['FEATURED', 'SILENT-SKILL', 'TILES', 'POWER'],
  },
  {
    id: 'drowned_school',
    name: 'The Drowned Schoolhouse',
    tagline: 'Shin-flooded elementary school with hop-chain perches & PA lure system.',
    stars: 4,
    tags: ['FEATURED', 'PERCH', 'TIDE', 'LURE'],
  },
  {
    id: 'sunken_jungle',
    name: 'The Sunken Jungle',
    tagline: 'River wetland with rapids masking, fauna hush, and 3-sluice flow puzzle.',
    stars: 4,
    tags: ['FEATURED', 'FLOW', 'MASK', 'SLUICE'],
  },
  {
    id: 'neon_flood',
    name: 'Neon Flood District',
    tagline: 'Cyberpunk sector with storm windows, searchlight drones, and skyways.',
    stars: 5,
    tags: ['FEATURED', 'STORM', 'DRONES', 'VERTICAL'],
  },
  {
    id: 'drowned_metro',
    name: 'Platform Zero, The Drowned Metro',
    tagline: 'Vaulted terminus with stalled train corridor & scheduled Ghost Train.',
    stars: 5,
    tags: ['FEATURED', 'EVENT', 'KILL-ZONE', 'BOTTLES'],
  },
];

const ARCHIVE_MAPS: MapDef[] = [
  {
    id: 'poolrooms',
    name: 'Classic Archipelago',
    tagline: 'Infinite warm water and damp ceramic tiles.',
    stars: 2,
    tags: ['ARCHIVE', 'CLASSIC', 'TILES', 'PILLARS'],
  },
  {
    id: 'utility_tunnels',
    name: 'Utility Tunnels',
    tagline: 'Narrow concrete maintenance crawlspaces with surging steam.',
    stars: 3,
    tags: ['ARCHIVE', 'STEAM', 'NARROW', 'VALVES'],
  },
  {
    id: 'marble_atrium',
    name: 'Marble Atrium',
    tagline: 'Vast echoing hall of bells and sinking stones.',
    stars: 3,
    tags: ['ARCHIVE', 'BELLS', 'ECHO', 'STONES'],
  },
  {
    id: 'hydro_maze',
    name: 'Hydro-Filtration Maze',
    tagline: 'Industrial labyrinth with 45-second tidal flips.',
    stars: 4,
    tags: ['ARCHIVE', 'TIDES', 'LABYRINTH', 'CHOKES'],
  },
  {
    id: 'drainage_core',
    name: 'Abyssal Drainage Core',
    tagline: 'Near-total darkness, bioluminescent water, and 3 beasts.',
    stars: 5,
    tags: ['ARCHIVE', 'DARKNESS', 'MULTI-BEAST', 'CORE'],
  },
];

function formatTimeSec(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export class ModeSelect {
  private el: HTMLElement | null = null;
  private callbacks: ModeSelectCallbacks;

  private selectedMode: 'single' | 'multi' = 'single';
  private selectedTab: 'featured' | 'archive' = 'featured';
  private selectedMap: MapId = 'natatorium';
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
      background: rgba(13, 11, 6, 0.94);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: clamp(16px, 3vw, 36px) 20px;
      overflow-y: auto;
      z-index: 200;
      pointer-events: auto;
      box-sizing: border-box;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
    `;

    this.el = el;
    this.render();
    container.appendChild(el);
  }

  private render(): void {
    if (!this.el) return;

    const progress = loadProgress();
    const currentMaps = this.selectedTab === 'featured' ? FEATURED_MAPS : ARCHIVE_MAPS;

    this.el.innerHTML = `
      <div style="width: min(920px, 95vw); display: flex; flex-direction: column; gap: 18px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: clamp(1.4rem, 3vw, 2.0rem); color: var(--water, #86cfa0); margin: 0;">SELECT SECTOR & EXPEDITION</h2>
            <div style="font-size: 11px; opacity: 0.7;">Prepare your expedition into the submerged levels</div>
          </div>
          <button id="btn-mode-back" class="analog-btn" style="width: auto; padding: 6px 16px;">ESC BACK</button>
        </div>

        <!-- Mode Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
          <!-- Singleplayer Card -->
          <div id="card-mode-single" class="mode-card ${this.selectedMode === 'single' ? 'selected' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: bold; font-size: 14px;">SOLO EXPEDITION</span>
              <span class="badge">Offline</span>
            </div>
            <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
              Pure survival horror. Explore the silent labyrinth alone. Sound is your only feedback.
            </div>
          </div>

          <!-- Multiplayer Card -->
          <div id="card-mode-multi" class="mode-card ${this.selectedMode === 'multi' ? 'selected' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: bold; font-size: 14px;">COOPERATIVE</span>
              <span class="badge" style="border-color: #d8b36a; color: #d8b36a;">Co-op Room</span>
            </div>
            <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
              Host or join a synchronized expedition with friends via 4-letter room codes.
            </div>
          </div>
        </div>

        <!-- Map Picker Tabs: Featured vs Archive -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; gap: 8px;">
              <button id="tab-featured" class="diff-btn ${this.selectedTab === 'featured' ? 'active' : ''}" style="padding: 6px 16px; font-weight: bold;">
                ★ FEATURED EXPEDITIONS (NEW)
              </button>
              <button id="tab-archive" class="diff-btn ${this.selectedTab === 'archive' ? 'active' : ''}" style="padding: 6px 16px;">
                ARCHIVE (CLASSIC POOLROOMS)
              </button>
            </div>
            <span style="font-size: 11px; opacity: 0.6;">Preselected: ${this.selectedMap}</span>
          </div>

          <!-- Map Cards Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px;">
            ${currentMaps.map((m) => {
              const bestSolo = progress.bestTimes[m.id];
              let bestDuo: number | null = null;
              try {
                const storedDuo = localStorage.getItem(`backsilence_best_duo_${m.id}`);
                if (storedDuo) bestDuo = parseFloat(storedDuo);
              } catch {
                // Ignore storage failures
              }

              return `
                <div class="map-card ${m.id === this.selectedMap ? 'selected' : ''}" data-map="${m.id}" style="cursor: pointer; padding: 10px; border: 1px solid #3d2f18; border-radius: 4px; background: rgba(0,0,0,0.45); display: flex; flex-direction: column; justify-content: space-between;">
                  <div>
                    <div style="position: relative; margin-bottom: 6px;">
                      <canvas id="thumb-${m.id}" width="160" height="90" style="width: 100%; height: 90px; border-radius: 3px; display: block; background: #080603;"></canvas>
                      <div style="position: absolute; top: 4px; right: 4px; background: rgba(8,6,3,0.85); padding: 2px 5px; border-radius: 3px; font-size: 10px; color: #ffeb3b; border: 1px solid rgba(255,235,59,0.3);">
                        ${'★'.repeat(m.stars)}${'☆'.repeat(5 - m.stars)}
                      </div>
                    </div>
                    <div style="font-weight: bold; font-size: 11px; margin-bottom: 4px; color: var(--fog);">${m.name}</div>
                    <div style="font-size: 9px; opacity: 0.75; line-height: 1.3; margin-bottom: 8px;">${m.tagline}</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
                      ${m.tags.map((t) => `<span style="font-size: 8px; padding: 2px 5px; background: rgba(134,207,160,0.12); border: 1px solid rgba(134,207,160,0.3); border-radius: 2px; color: var(--water, #86cfa0);">${t}</span>`).join('')}
                    </div>
                  </div>
                  <div style="font-size: 9px; opacity: 0.8; display: flex; justify-content: space-between; border-top: 1px solid rgba(61,47,24,0.7); padding-top: 5px;">
                    <span>Solo: <strong style="color: var(--water);">${formatTimeSec(bestSolo)}</strong></span>
                    <span>Duo: <strong style="color: #d8b36a;">${formatTimeSec(bestDuo)}</strong></span>
                  </div>
                </div>
              `;
            }).join('')}
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
        <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
          <button id="btn-start-expedition" class="analog-btn primary" style="width: 260px; padding: 12px 20px; font-size: 14px;">
            ${this.selectedMode === 'single' ? 'START EXPEDITION' : 'PROCEED TO LOBBY'}
          </button>
        </div>
      </div>
    `;

    this.renderMapThumbnails();
    this.bindEvents();
  }

  private renderMapThumbnails(): void {
    if (!this.el) return;

    const currentMaps = this.selectedTab === 'featured' ? FEATURED_MAPS : ARCHIVE_MAPS;

    for (const m of currentMaps) {
      const canvas = this.el.querySelector(`#thumb-${m.id}`) as HTMLCanvasElement;
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const w = canvas.width;
      const h = canvas.height;

      void getMapPreviewLayout(m.id).then(({ def, layout }) => {
        if (!ctx) return;
        def.drawThumbnail(ctx, layout, w, h);
      }).catch((err: unknown) => {
        console.warn(`[ModeSelect] Thumbnail error for ${m.id}:`, err);
      });
    }
  }

  private bindEvents(): void {
    if (!this.el) return;
    const engine = AudioEngine.getInstance();

    this.el.querySelector('#btn-mode-back')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onBack();
    });

    // Tab buttons: Featured vs Archive
    const tabFeatured = this.el.querySelector('#tab-featured');
    const tabArchive = this.el.querySelector('#tab-archive');

    tabFeatured?.addEventListener('click', () => {
      if (this.selectedTab === 'featured') return;
      engine.play('ui_click');
      this.selectedTab = 'featured';
      if (!FEATURED_MAP_IDS.includes(this.selectedMap)) {
        this.selectedMap = 'natatorium';
      }
      this.render();
    });

    tabArchive?.addEventListener('click', () => {
      if (this.selectedTab === 'archive') return;
      engine.play('ui_click');
      this.selectedTab = 'archive';
      if (!ARCHIVE_MAP_IDS.includes(this.selectedMap)) {
        this.selectedMap = 'poolrooms';
      }
      this.render();
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

    // Map selection
    const mapCards = this.el.querySelectorAll('.map-card');
    mapCards.forEach((c) => {
      c.addEventListener('click', () => {
        const id = c.getAttribute('data-map') as MapId;
        engine.play('ui_click');
        this.selectedMap = id;
        mapCards.forEach((mc) => mc.classList.remove('selected'));
        c.classList.add('selected');
      });
    });

    // Difficulty selection
    const diffBtns = this.el.querySelectorAll('.diff-btn[data-diff]');
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

/* ── ResultsScreen.ts ──────────────────────────────────────────────────────
 *  Analog horror Victory / Escape screen:
 *  - Displays run statistics: time, noises made, closest approach, alerts, retries
 *  - Plays soft synthesized ESCAPED chord ('escaped' voice in AudioEngine)
 *  - Persists best times per map into localStorage ('backsilence.progress.v1')
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../types/contracts.js';
import { AudioEngine } from '../audio/AudioEngine.js';

export interface CoOpPlayerResult {
  id: string;
  name: string;
  escaped: boolean;
  timeSurvived: number;
  noisesMade: number;
}

export interface RunResults {
  mapId: MapId;
  timeSurvived: number; // in seconds
  noisesMade: number;
  closestCall: number;  // in meters
  alertsCount: number;
  retries: number;
  coopPlayers?: CoOpPlayerResult[] | undefined;
  isHost?: boolean | undefined;

  // Batch 5 per-map metrics
  perchedTime?: number | undefined;
  wobblyEscapes?: number | undefined;
  rapidsCrossed?: number | undefined;
  sluiceAccuracy?: string | undefined;
  dronesEmpd?: number | undefined;
  stormSprintDist?: number | undefined;
  ghostTrainsSurvived?: number | undefined;
  nearMissCount?: number | undefined;
}

const STORAGE_KEY = 'backsilence.progress.v1';

interface StoredProgress {
  version: 1;
  bestTimes: Partial<Record<MapId, number>>;
  completions: Partial<Record<MapId, number>>;
}

export function loadProgress(): StoredProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, bestTimes: {}, completions: {} };
    const parsed = JSON.parse(raw) as StoredProgress;
    return parsed.version === 1 ? parsed : { version: 1, bestTimes: {}, completions: {} };
  } catch {
    return { version: 1, bestTimes: {}, completions: {} };
  }
}

export function saveRunCompletion(results: RunResults): { isNewBest: boolean; previousBest: number | null } {
  try {
    const progress = loadProgress();
    const prev = progress.bestTimes[results.mapId] ?? null;
    let isNewBest = false;

    if (prev === null || results.timeSurvived < prev) {
      progress.bestTimes[results.mapId] = results.timeSurvived;
      isNewBest = true;
    }

    progress.completions[results.mapId] = (progress.completions[results.mapId] ?? 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return { isNewBest, previousBest: prev };
  } catch {
    return { isNewBest: false, previousBest: null };
  }
}

export class ResultsScreen {
  private el: HTMLElement | null = null;
  private onContinue: () => void;
  private audio = AudioEngine.getInstance();

  constructor(callbacks: { onContinue: () => void }) {
    this.onContinue = callbacks.onContinue;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'results-screen';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(8, 6, 3, 0.94);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 250;
      pointer-events: auto;
      padding: 24px;
      box-sizing: border-box;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
      user-select: none;
    `;

    el.innerHTML = `
      <div style="
        width: min(520px, 90vw);
        background: #0d0b06;
        border: 1px solid rgba(134,207,160,0.4);
        padding: clamp(20px, 4vw, 36px);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        box-shadow: 0 0 40px rgba(0,0,0,0.9), inset 0 0 20px rgba(134,207,160,0.05);
      ">
        <!-- Title Badge -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
          <div style="font-size: 11px; letter-spacing: 0.3em; color: var(--water, #86cfa0); font-weight: bold;">
            SURFACE BREACH SUCCESSFUL
          </div>
          <h1 style="font-size: clamp(2.2rem, 6vw, 3.2rem); margin: 0; color: #ffffff; letter-spacing: 0.1em; text-shadow: 0 0 16px rgba(134,207,160,0.6);">
            ESCAPED
          </h1>
          <div id="results-map-name" style="font-size: 13px; opacity: 0.75; font-style: italic;">
            The Flooded Poolrooms
          </div>
        </div>

        <!-- Metrics Table -->
        <div style="width: 100%; border-top: 1px solid rgba(217,211,162,0.2); border-bottom: 1px solid rgba(217,211,162,0.2); padding: 16px 0; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 14px;">
            <span style="opacity: 0.7;">Time Elapsed:</span>
            <span id="results-time" style="color: var(--water, #86cfa0); font-weight: bold;">01:42.50</span>
          </div>
          <div id="results-best-badge" style="font-size: 11px; color: #ffeb3b; text-align: right; display: none;">
            ★ NEW PERSONAL BEST
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 14px;">
            <span style="opacity: 0.7;">Noises Produced:</span>
            <span id="results-noises" style="font-weight: bold;">4</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 14px;">
            <span style="opacity: 0.7;">Closest Encounter:</span>
            <span id="results-closest" style="font-weight: bold;">4.8 m</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 14px;">
            <span style="opacity: 0.7;">Beast Alert Count:</span>
            <span id="results-alerts" style="font-weight: bold;">1</span>
          </div>
          <!-- Map Specific Metrics -->
          <div id="results-map-specific" style="display: none; flex-direction: column; gap: 8px; border-top: 1px dashed rgba(217,211,162,0.2); padding-top: 8px;">
          </div>
        </div>

        <!-- Co-op Party Breakdown -->
        <div id="results-coop-container" style="display: none; width: 100%; flex-direction: column; gap: 6px; border-bottom: 1px solid rgba(217,211,162,0.2); padding-bottom: 12px;">
          <div style="font-size: 11px; opacity: 0.7; letter-spacing: 0.1em; color: var(--water);">EXPEDITION MEMBERS:</div>
          <div id="results-coop-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
        </div>

        <!-- Actions -->
        <div style="display: flex; gap: 12px; width: 100%;">
          <button id="btn-results-continue" class="analog-btn primary" style="flex: 1; padding: 12px;">
            PROCEED TO SECTOR SELECT
          </button>
        </div>
      </div>
    `;

    container.appendChild(el);
    this.el = el;

    el.querySelector('#btn-results-continue')?.addEventListener('click', () => {
      this.hide();
      this.onContinue();
    });
  }

  show(results: RunResults): void {
    if (!this.el) return;
    this.el.style.display = 'flex';

    // Play soft synthesized victory chord (no jumpscare!)
    this.audio.play('escaped', { gain: 0.9 });

    const { isNewBest } = saveRunCompletion(results);

    const mapNameEl = this.el.querySelector('#results-map-name');
    const timeEl = this.el.querySelector('#results-time');
    const noisesEl = this.el.querySelector('#results-noises');
    const closestEl = this.el.querySelector('#results-closest');
    const alertsEl = this.el.querySelector('#results-alerts');
    const bestBadgeEl = this.el.querySelector<HTMLElement>('#results-best-badge');

    if (mapNameEl) {
      const names: Record<MapId, string> = {
        poolrooms: 'The Flooded Poolrooms',
        utility_tunnels: 'Sub-Aquatic Utility Tunnels',
        marble_atrium: 'The Echoing Marble Atrium',
        hydro_maze: 'The Hydro-Filtration Maze',
        drainage_core: 'The Abyssal Drainage Core',
        natatorium: 'The Grand Natatorium',
        drowned_school: 'The Drowned Schoolhouse',
        sunken_jungle: 'The Sunken Jungle',
        neon_flood: 'Neon Flood District',
        drowned_metro: 'Platform Zero, The Drowned Metro',
      };
      mapNameEl.textContent = names[results.mapId] ?? results.mapId;
    }

    if (timeEl) {
      const mins = Math.floor(results.timeSurvived / 60);
      const secs = (results.timeSurvived % 60).toFixed(2).padStart(5, '0');
      timeEl.textContent = `${String(mins).padStart(2, '0')}:${secs}`;
    }

    if (bestBadgeEl) {
      bestBadgeEl.style.display = isNewBest ? 'block' : 'none';
    }

    if (noisesEl) noisesEl.textContent = String(results.noisesMade);
    if (closestEl) closestEl.textContent = `${results.closestCall.toFixed(1)} m`;
    if (alertsEl) alertsEl.textContent = String(results.alertsCount);

    const mapSpecificEl = this.el.querySelector<HTMLElement>('#results-map-specific');
    if (mapSpecificEl) {
      mapSpecificEl.innerHTML = '';
      const items: Array<{ label: string; value: string }> = [];

      if (results.mapId === 'drowned_school') {
        items.push({ label: 'Perched Time:', value: `${(results.perchedTime ?? 0).toFixed(1)} s` });
        items.push({ label: 'Wobbly Escapes:', value: String(results.wobblyEscapes ?? 0) });
      } else if (results.mapId === 'sunken_jungle') {
        items.push({ label: 'Rapids Crossed:', value: String(results.rapidsCrossed ?? 0) });
        items.push({ label: 'Sluice Accuracy:', value: results.sluiceAccuracy ?? '100%' });
      } else if (results.mapId === 'neon_flood') {
        items.push({ label: 'Drones EMP\'d:', value: String(results.dronesEmpd ?? 0) });
        items.push({ label: 'Storm Sprint Distance:', value: `${(results.stormSprintDist ?? 0).toFixed(1)} m` });
      } else if (results.mapId === 'drowned_metro') {
        items.push({ label: 'Ghost Trains Survived:', value: String(results.ghostTrainsSurvived ?? 0) });
        items.push({ label: 'Express Near-Misses (<2m):', value: String(results.nearMissCount ?? 0) });
      }

      if (items.length > 0) {
        mapSpecificEl.style.display = 'flex';
        for (const item of items) {
          const row = document.createElement('div');
          row.style.cssText = 'display: flex; justify-content: space-between; font-size: 13px;';
          row.innerHTML = `<span style="opacity: 0.7;">${item.label}</span><strong style="color: var(--water, #86cfa0);">${item.value}</strong>`;
          mapSpecificEl.appendChild(row);
        }
      } else {
        mapSpecificEl.style.display = 'none';
      }
    }

    const coopContainer = this.el.querySelector<HTMLElement>('#results-coop-container');
    const coopList = this.el.querySelector('#results-coop-list');
    if (coopContainer && coopList) {
      if (results.coopPlayers && results.coopPlayers.length > 0) {
        coopContainer.style.display = 'flex';
        coopList.innerHTML = '';
        for (const p of results.coopPlayers) {
          const row = document.createElement('div');
          row.style.cssText = 'display: flex; justify-content: space-between; font-size: 12px; align-items: center;';
          const nameSpan = document.createElement('span');
          nameSpan.textContent = p.name;
          const statusSpan = document.createElement('span');
          statusSpan.style.color = p.escaped ? 'var(--water, #86cfa0)' : 'var(--danger, #b3261e)';
          statusSpan.textContent = `${p.escaped ? 'ESCAPED' : 'FALLEN'} (${p.noisesMade} noises)`;
          row.appendChild(nameSpan);
          row.appendChild(statusSpan);
          coopList.appendChild(row);
        }
      } else {
        coopContainer.style.display = 'none';
      }
    }
  }

  hide(): void {
    if (this.el) {
      this.el.style.display = 'none';
    }
  }

  dispose(): void {
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

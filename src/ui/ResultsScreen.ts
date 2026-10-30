/* ── ResultsScreen.ts ──────────────────────────────────────────────────────
 *  Analog horror Victory / Escape screen:
 *  - Displays run statistics: time, noises made, closest approach, alerts, retries
 *  - Plays soft synthesized ESCAPED chord ('escaped' voice in AudioEngine)
 *  - Persists best times per map into localStorage ('backsilence.progress.v1')
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../types/contracts.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { computeScore, type ScoreBreakdown, type DeathReplayLine } from '../meta/Scoring.js';
import { ProfileStore } from '../meta/ProfilePersistence.js';
import { MotionEngine } from './motion/Motion.js';
import { ShareCard } from './screens/ShareCard.js';

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

  // Batch 7 scoring & progression
  scoreBreakdown?: ScoreBreakdown | undefined;
  deathReplayLine?: DeathReplayLine | undefined;
  starsEarned?: number | undefined;
  unlockNotification?: string | undefined;

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
  private onPlayAgain?: (() => void) | undefined;
  private onNextTape?: ((nextMapId: MapId) => void) | undefined;
  private audio = AudioEngine.getInstance();
  private currentResults: RunResults | null = null;

  constructor(callbacks: {
    onContinue: () => void;
    onPlayAgain?: () => void;
    onNextTape?: (nextMapId: MapId) => void;
  }) {
    this.onContinue = callbacks.onContinue;
    this.onPlayAgain = callbacks.onPlayAgain;
    this.onNextTape = callbacks.onNextTape;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'results-screen';
    el.className = 'bs-screen';
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

        <!-- Batch 7: Score Breakdown & Rank Badge -->
        <div id="results-score-container" style="width: 100%; background: rgba(0,0,0,0.5); border: 1px solid rgba(134,207,160,0.2); padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; letter-spacing: 0.15em; color: var(--water, #86cfa0); font-weight: bold;">TOTAL SILENCE SCORE</span>
            <div id="results-rank-badge" style="background: #2a3d34; border: 1px solid #86cfa0; padding: 2px 8px; font-weight: bold; font-size: 14px; color: #fff;">A</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span id="results-final-score" style="font-size: 24px; font-weight: bold; color: #ffffff;">0</span>
            <div id="results-star-stamps" style="font-size: 18px; color: #ffeb3b; letter-spacing: 4px;">★★★</div>
          </div>
          <div id="results-breakdown-details" style="font-size: 11px; opacity: 0.8; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
            <div>Time: <span id="results-score-time" style="color: #86cfa0;">+0</span></div>
            <div>Noise: <span id="results-score-noise" style="color: #86cfa0;">+0</span></div>
            <div>Objectives: <span id="results-score-obj" style="color: #86cfa0;">+0</span></div>
            <div>Style: <span id="results-score-style" style="color: #86cfa0;">+0</span></div>
          </div>
        </div>

        <!-- Batch 7: Death Replay Line / Incident Log -->
        <div id="results-death-replay-box" style="display: none; width: 100%; border-left: 3px solid #ff4444; background: rgba(40,10,10,0.4); padding: 8px 12px; font-size: 12px; flex-direction: column; gap: 4px;">
          <div style="color: #ff6666; font-weight: bold; font-size: 11px; letter-spacing: 0.1em;">INCIDENT REPLAY LINE:</div>
          <div id="results-death-explanation" style="opacity: 0.9;"></div>
          <div id="results-death-timeline" style="opacity: 0.7; font-size: 10px; display: flex; flex-direction: column; gap: 2px;"></div>
        </div>

        <!-- Batch 7: Unlock Notice -->
        <div id="results-unlock-toast" style="display: none; width: 100%; background: rgba(40,60,40,0.6); border: 1px solid #86cfa0; padding: 8px 12px; text-align: center; color: #a3ffc7; font-weight: bold; font-size: 12px;">
          ★ TAPE UNLOCKED: Tape 2 (Dry Season)
        </div>

        <!-- Co-op Party Breakdown -->
        <div id="results-coop-container" style="display: none; width: 100%; flex-direction: column; gap: 6px; border-bottom: 1px solid rgba(217,211,162,0.2); padding-bottom: 12px;">
          <div style="font-size: 11px; opacity: 0.7; letter-spacing: 0.1em; color: var(--water);">EXPEDITION MEMBERS:</div>
          <div id="results-coop-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
        </div>

        <!-- Actions -->
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%;">
            <button id="btn-results-play-again" class="analog-btn primary" style="padding: 12px; font-weight: bold; font-size: 13px;">
              ↻ PLAY AGAIN
            </button>
            <button id="btn-results-next-tape" class="analog-btn" style="padding: 12px; border-color: var(--water, #86cfa0); color: var(--water, #86cfa0); font-weight: bold; font-size: 13px;">
              NEXT TAPE →
            </button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%;">
            <button id="btn-results-share" class="analog-btn" style="padding: 10px; font-size: 11px;">
              DOWNLOAD CARD (PNG)
            </button>
            <button id="btn-results-continue" class="analog-btn" style="padding: 10px; font-size: 11px;">
              SECTOR SELECT
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(el);
    this.el = el;

    el.querySelector('#btn-results-play-again')?.addEventListener('click', () => {
      this.hide();
      if (this.onPlayAgain) {
        this.onPlayAgain();
      }
    });

    el.querySelector('#btn-results-next-tape')?.addEventListener('click', () => {
      this.hide();
      const currentMap = this.currentResults?.mapId ?? 'orientation';
      const sequence: MapId[] = [
        'orientation',
        'poolrooms',
        'utility_tunnels',
        'marble_atrium',
        'hydro_maze',
        'drainage_core',
        'natatorium',
        'drowned_school',
        'sunken_jungle',
        'neon_flood',
        'drowned_metro',
      ];
      const idx = sequence.indexOf(currentMap);
      const nextMap = sequence[idx + 1] ?? sequence[0]!;
      if (this.onNextTape) {
        this.onNextTape(nextMap);
      }
    });

    el.querySelector('#btn-results-continue')?.addEventListener('click', () => {
      this.hide();
      this.onContinue();
    });
  }

  show(results: RunResults): void {
    if (!this.el) return;
    this.currentResults = results;
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
        orientation: 'Training Pool (Orientation)',
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

    // ── Batch 7: Score Breakdown, Stars & Progression ──
    const breakdown = results.scoreBreakdown ?? computeScore({
      mapId: results.mapId,
      difficulty: 'normal',
      elapsedSeconds: results.timeSurvived,
      noiseUnits: results.noisesMade * 0.4,
      secondariesDone: 1,
      hiddenDone: results.mapId === 'natatorium' ? 1 : 0,
      cleanJumps: results.wobblyEscapes ?? 2,
      lurksSurvivedGte8s: (results.perchedTime ?? 0) >= 8 ? 1 : 0,
      lureSuccesses: 1,
      nearMissesUnder2m: results.nearMissCount ?? 0,
      deaths: 0,
    });

    const finalScoreEl = this.el.querySelector('#results-final-score');
    const rankBadgeEl = this.el.querySelector<HTMLElement>('#results-rank-badge');
    const starStampsEl = this.el.querySelector('#results-star-stamps');
    const scoreTimeEl = this.el.querySelector('#results-score-time');
    const scoreNoiseEl = this.el.querySelector('#results-score-noise');
    const scoreObjEl = this.el.querySelector('#results-score-obj');
    const scoreStyleEl = this.el.querySelector('#results-score-style');

    if (finalScoreEl) {
      MotionEngine.getInstance().animateScoreCountUp(finalScoreEl as HTMLElement, breakdown.finalScore, 800);
    }
    if (rankBadgeEl) {
      rankBadgeEl.textContent = breakdown.rank;
      const colors: Record<string, string> = { S: '#ffd700', A: '#86cfa0', B: '#64b5f6', C: '#ba68c8', D: '#9e9e9e' };
      rankBadgeEl.style.borderColor = colors[breakdown.rank] ?? '#86cfa0';
      MotionEngine.getInstance().rankStampThump(rankBadgeEl);
      this.audio.play('results_stinger', { rank: breakdown.rank });
    }

    const shareBtn = this.el.querySelector('#btn-results-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        void ShareCard.downloadShareCardPng({
          tapeTitle: results.mapId,
          tapeNumber: 1,
          playerName: 'Operator',
          playerTag: '0042',
          rankTitle: breakdown.rank,
          score: breakdown.finalScore,
          timeMs: results.timeSurvived * 1000,
          noiseDb: results.noisesMade * 0.4,
          seed: 1337,
        });
      }, { once: true });
    }

    const stars = results.starsEarned ?? (breakdown.finalScore >= 1400 ? 3 : breakdown.finalScore >= 800 ? 2 : 1);
    if (starStampsEl) {
      starStampsEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    }

    if (scoreTimeEl) scoreTimeEl.textContent = `+${breakdown.timeScore}`;
    if (scoreNoiseEl) scoreNoiseEl.textContent = `+${breakdown.noiseScore}`;
    if (scoreObjEl) scoreObjEl.textContent = `+${breakdown.objectivesScore}`;
    if (scoreStyleEl) scoreStyleEl.textContent = `+${breakdown.styleScore}`;

    // Death Replay Line
    const replayBox = this.el.querySelector<HTMLElement>('#results-death-replay-box');
    const replayExpEl = this.el.querySelector('#results-death-explanation');
    const replayTimeEl = this.el.querySelector('#results-death-timeline');

    if (results.deathReplayLine && replayBox && replayExpEl && replayTimeEl) {
      replayBox.style.display = 'flex';
      replayExpEl.textContent = results.deathReplayLine.explanation;
      replayTimeEl.innerHTML = '';
      for (const item of results.deathReplayLine.timeline) {
        const row = document.createElement('div');
        row.textContent = `[${item.t.toFixed(1)}s] ${item.description}`;
        if (item.isFatal) row.style.color = '#ff6666';
        replayTimeEl.appendChild(row);
      }
    } else if (replayBox) {
      replayBox.style.display = 'none';
    }

    // Unlocks: Update ProfileStore and show unlock toast if applicable
    const unlockToast = this.el.querySelector<HTMLElement>('#results-unlock-toast');
    if (unlockToast) {
      try {
        const profile = ProfileStore.load();
        if (results.mapId === 'natatorium' && !profile.unlockedTapes.includes(2)) {
          profile.unlockedTapes.push(2);
          profile.campaignStars[1] = Math.max(profile.campaignStars[1] ?? 0, stars);
          ProfileStore.save(profile);
          unlockToast.style.display = 'block';
          unlockToast.textContent = '★ NEXT TAPE UNLOCKED: Tape 2 (Dry Season)';
        } else if (results.unlockNotification) {
          unlockToast.style.display = 'block';
          unlockToast.textContent = results.unlockNotification;
        } else {
          unlockToast.style.display = 'none';
        }
      } catch {
        unlockToast.style.display = 'none';
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

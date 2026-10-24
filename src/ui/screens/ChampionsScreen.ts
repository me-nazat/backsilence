/* ── ChampionsScreen.ts ───────────────────────────────────────────────────
 *  Champions Shrine & Hall of Fame:
 *  - Weekly and Season reigning champions
 *  - Direct "Race Their Ghost" replay launch button
 *  - Historical crowning archive
 * ──────────────────────────────────────────────────────────────────────── */

import { Button, renderIcon, renderRankEmblem } from '../kit/index.js';

export interface ChampionRecord {
  season: string;
  board: string;
  mapId: string;
  mode: string;
  playerId: string;
  playerName: string;
  playerTag: string;
  score: number;
  timeMs: number;
  runId: string;
  crownedAt: number;
}

export interface ChampionsCallbacks {
  onBack: () => void;
  onRaceGhost: (runId: string, mapId: string) => void;
}

export class ChampionsScreen {
  readonly element: HTMLElement;

  constructor(private callbacks: ChampionsCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-champions';
    this.element.className = 'bs-root bs-screen';
    this.element.style.cssText = `
      position: absolute;
      inset: 0;
      overflow-y: auto;
      z-index: 100;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: clamp(24px, 4vw, 48px) 24px;
      box-sizing: border-box;
    `;

    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div style="width: min(1000px, 95vw); display: flex; flex-direction: column; gap: 32px;">
        <!-- Top bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              CHAMPIONS OF SILENCE // HALL OF FAME
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              CROWNED OPERATORS // REPLAY ARCHIVES
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- Reigning Champion Banner -->
        <div style="background: linear-gradient(135deg, rgba(45,36,24,0.95) 0%, rgba(13,11,6,0.98) 100%); border: 2px solid var(--bs-tan); border-radius: var(--bs-radius-md); padding: 32px; box-shadow: 0 12px 32px rgba(0,0,0,0.8), 0 0 24px rgba(216,179,106,0.25); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px;">
          <div style="display: flex; gap: 20px; align-items: center;">
            <div>${renderRankEmblem('phantom', 64)}</div>
            <div>
              <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan); letter-spacing: 0.15em; text-transform: uppercase;">
                ★ REIGNING SEASON 1 CHAMPION ★
              </div>
              <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 4px 0;">
                ECHO_STALKER<span style="opacity: 0.5;">#0001</span>
              </h2>
              <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-water);">
                RECORD SCORE: 94,820 PTS // SECTOR: THE NATATORIUM
              </div>
            </div>
          </div>
          <div id="btn-race-season-wrap"></div>
        </div>

        <!-- Weekly Champion Banner -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border-strong); border-radius: var(--bs-radius-sm); padding: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; gap: 16px; align-items: center;">
            <div>${renderRankEmblem('depth', 48)}</div>
            <div>
              <div style="font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-tan); letter-spacing: 0.12em; text-transform: uppercase;">
                CURRENT WEEKLY CHAMPION // WEEK 43
              </div>
              <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-lg); color: var(--bs-cream); margin: 2px 0;">
                WAVE_WHISPERER<span style="opacity: 0.5;">#4210</span>
              </h3>
              <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan);">
                SCORE: 89,400 PTS // DRAINAGE CORE SPEEDRUN
              </div>
            </div>
          </div>
          <div id="btn-race-weekly-wrap"></div>
        </div>

        <!-- Past Champions Archive Table -->
        <div>
          <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-tan); margin-bottom: 12px; border-bottom: 1px solid var(--bs-border); padding-bottom: 6px;">
            PAST CROWNED OPERATORS ARCHIVE
          </h3>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bs-surface-2); border: 1px solid var(--bs-border-subtle); padding: 12px 16px; border-radius: 2px; font-family: var(--bs-font-mono); font-size: var(--bs-text-xs);">
              <span style="color: var(--bs-tan);">WEEK 42</span>
              <span style="font-weight: bold; color: var(--bs-cream);">SILENT_DIVER#1092</span>
              <span>MARBLE ATRIUM</span>
              <span class="bs-osd-readout">86,200 PTS</span>
              <span style="color: var(--bs-water);">${renderIcon('check', 14)} VERIFIED</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bs-surface-2); border: 1px solid var(--bs-border-subtle); padding: 12px 16px; border-radius: 2px; font-family: var(--bs-font-mono); font-size: var(--bs-text-xs);">
              <span style="color: var(--bs-tan);">WEEK 41</span>
              <span style="font-weight: bold; color: var(--bs-cream);">NOCTURNE#3004</span>
              <span>SUNKEN JUNGLE</span>
              <span class="bs-osd-readout">82,150 PTS</span>
              <span style="color: var(--bs-water);">${renderIcon('check', 14)} VERIFIED</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const backBtn = new Button({
      text: '← RETURN',
      variant: 'ghost',
      onClick: () => this.callbacks.onBack(),
    });
    this.element.querySelector('#btn-back-wrap')?.appendChild(backBtn.element);

    const raceSeasonBtn = new Button({
      text: 'RACE SEASON CHAMPION GHOST',
      variant: 'primary',
      icon: renderIcon('ghost', 16),
      onClick: () => this.callbacks.onRaceGhost('run-champion-season', 'natatorium'),
    });
    this.element.querySelector('#btn-race-season-wrap')?.appendChild(raceSeasonBtn.element);

    const raceWeeklyBtn = new Button({
      text: 'RACE WEEKLY GHOST',
      variant: 'ghost',
      icon: renderIcon('ghost', 16),
      onClick: () => this.callbacks.onRaceGhost('run-champion-weekly', 'drainage_core'),
    });
    this.element.querySelector('#btn-race-weekly-wrap')?.appendChild(raceWeeklyBtn.element);
  }
}

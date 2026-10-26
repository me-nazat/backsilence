/* ── LeaderboardsScreen.ts ───────────────────────────────────────────────
 *  Hall of Silence (Leaderboards):
 *  - Board filters: map × mode × difficulty × period (daily/weekly/season/all)
 *  - Pinned player row
 *  - Pending vs Verified replay badges
 *  - "Race Ghost" launch button
 * ──────────────────────────────────────────────────────────────────────── */

import { Button, LeaderboardRow, Tabs } from '../kit/index.js';
import { IdentityManager } from '../../meta/Identity.js';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  tag: string;
  score: number;
  timeMs: number;
  noiseUnits: number;
  status: 'pending' | 'verified' | 'rejected';
  hasReplay?: boolean;
  runId: string;
}

export interface LeaderboardsCallbacks {
  onBack: () => void;
  onRaceGhost: (runId: string) => void;
}

export class LeaderboardsScreen {
  readonly element: HTMLElement;
  private currentPeriod: 'daily' | 'weekly' | 'season' | 'all' = 'daily';
  private currentMap = 'natatorium';
  private currentMode = 'campaign';
  private listContainer!: HTMLElement;

  constructor(private callbacks: LeaderboardsCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-leaderboards';
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
      <div style="width: min(1000px, 95vw); display: flex; flex-direction: column; gap: 24px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              HALL OF SILENCE // LEADERBOARDS
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              RECORDED ESCAPE RUNS // CRYPTOGRAPHICALLY VERIFIED
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- Period Tabs -->
        <div id="period-tabs-wrap"></div>

        <!-- Filter bar -->
        <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center; background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 10px 16px; border-radius: var(--bs-radius-sm);">
          <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan);">FILTERS:</div>
          <select id="select-map" class="bs-select" style="min-height: 32px; padding: 4px 8px;">
            <option value="natatorium">The Natatorium</option>
            <option value="drowned_school">Drowned School</option>
            <option value="sunken_jungle">Sunken Jungle</option>
            <option value="neon_flood">Neon Flood</option>
            <option value="drowned_metro">Drowned Metro</option>
            <option value="orientation">Orientation Facility</option>
            <option value="poolrooms">Poolrooms Core</option>
            <option value="marble_atrium">Marble Atrium</option>
            <option value="utility_tunnels">Utility Tunnels</option>
            <option value="hydro_maze">Hydro Maze</option>
            <option value="drainage_core">Drainage Core</option>
          </select>
          <select id="select-mode" class="bs-select" style="min-height: 32px; padding: 4px 8px;">
            <option value="campaign">Campaign Run</option>
            <option value="daily">Daily Descent</option>
            <option value="race">Silent Race</option>
            <option value="endless">Endless Tide</option>
          </select>
        </div>

        <!-- Table Scroll Container for Mobile -->
        <div style="overflow-x: auto; width: 100%; -webkit-overflow-scrolling: touch; padding-bottom: 8px;">
          <div style="min-width: 520px; display: flex; flex-direction: column; gap: 6px;">
            <!-- Table Header -->
            <div style="display: grid; grid-template-columns: 40px 48px 1fr 100px 90px 90px 40px; gap: 12px; padding: 0 12px; font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan); text-transform: uppercase;">
              <div>#</div>
              <div>TIER</div>
              <div>OPERATOR</div>
              <div style="text-align: right;">SCORE</div>
              <div style="text-align: right;">TIME</div>
              <div style="text-align: right;">NOISE</div>
              <div style="text-align: center;">GHOST</div>
            </div>

            <!-- Leaderboard Rows Container -->
            <div id="lb-rows" style="display: flex; flex-direction: column; gap: 6px;"></div>
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

    const periodTabs = new Tabs({
      items: [
        { id: 'daily', label: 'DAILY DESCENT' },
        { id: 'weekly', label: 'WEEKLY ARCHIVE' },
        { id: 'season', label: 'SEASON 1' },
        { id: 'all', label: 'ALL-TIME' },
      ],
      activeId: 'daily',
      onChange: (id) => {
        this.currentPeriod = id as 'daily' | 'weekly' | 'season' | 'all';
        void this.fetchAndRenderBoard();
      },
    });
    this.element.querySelector('#period-tabs-wrap')?.appendChild(periodTabs.element);

    this.listContainer = this.element.querySelector('#lb-rows')!;

    this.element.querySelector('#select-map')?.addEventListener('change', (e) => {
      this.currentMap = (e.target as HTMLSelectElement).value;
      void this.fetchAndRenderBoard();
    });
    this.element.querySelector('#select-mode')?.addEventListener('change', (e) => {
      this.currentMode = (e.target as HTMLSelectElement).value;
      void this.fetchAndRenderBoard();
    });

    void this.fetchAndRenderBoard();
  }

  private async fetchAndRenderBoard(): Promise<void> {
    this.listContainer.innerHTML = `
      <div class="bs-skeleton" style="height: 44px; margin-bottom: 6px;"></div>
      <div class="bs-skeleton" style="height: 44px; margin-bottom: 6px;"></div>
      <div class="bs-skeleton" style="height: 44px; margin-bottom: 6px;"></div>
    `;

    const identity = await IdentityManager.getIdentity();
    const myPlayerId = identity.playerId;

    try {
      const query = new URLSearchParams({
        board: this.currentPeriod === 'daily' ? `daily:${new Date().toISOString().slice(0, 10)}` : this.currentPeriod,
        map: this.currentMap,
        mode: this.currentMode,
        limit: '25',
        around: myPlayerId,
      });

      const res = await fetch(`/api/leaderboard?${query.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { rows?: LeaderboardEntry[]; myRow?: LeaderboardEntry; offline?: boolean };
        if (!data.offline && Array.isArray(data.rows) && data.rows.length > 0) {
          this.renderRows(data.rows, data.myRow, myPlayerId, false);
          return;
        }
      }
    } catch {
      // Offline fallback
    }

    // Default or mock offline view (calm offline state)
    const offlineRows: LeaderboardEntry[] = [
      { rank: 1, playerId: 'p1', name: 'EchoStalker', tag: '0001', score: 94820, timeMs: 38200, noiseUnits: 12.4, status: 'verified', hasReplay: true, runId: 'run-champion' },
      { rank: 2, playerId: 'p2', name: 'WaveWhisperer', tag: '4210', score: 89400, timeMs: 41200, noiseUnits: 19.8, status: 'verified', hasReplay: true, runId: 'run-p2' },
      { rank: 3, playerId: 'p3', name: 'SubmergedSoul', tag: '7721', score: 84100, timeMs: 47800, noiseUnits: 24.1, status: 'pending', hasReplay: false, runId: 'run-p3' },
    ];
    this.renderRows(offlineRows, undefined, myPlayerId, true);
  }

  private renderRows(rows: LeaderboardEntry[], myRow?: LeaderboardEntry, myPlayerId?: string, isOffline = false): void {
    this.listContainer.innerHTML = '';

    if (isOffline) {
      const banner = document.createElement('div');
      banner.className = 'bs-offline-state';
      banner.style.cssText = 'padding: 10px 14px; margin-bottom: 12px; background: rgba(216,179,106,0.08); border: 1px solid var(--bs-border); border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); display: flex; align-items: center; justify-content: space-between;';
      banner.innerHTML = `<span>ARCHIVE OFFLINE // LOCAL CACHED RECORDS</span><span style="opacity:0.6; font-size: 10px;">SOLO READY</span>`;
      this.listContainer.appendChild(banner);
    }

    rows.forEach((r) => {
      const isPinned = r.playerId === myPlayerId;
      const row = new LeaderboardRow({
        rank: r.rank,
        rankEmblem: r.rank === 1 ? 'phantom' : r.rank <= 3 ? 'depth' : 'current',
        name: r.name,
        tag: r.tag,
        score: r.score,
        timeMs: r.timeMs,
        noiseUnits: r.noiseUnits,
        status: r.status,
        isPinned,
        hasReplay: r.hasReplay,
        onPlayGhost: () => this.callbacks.onRaceGhost(r.runId),
      });
      this.listContainer.appendChild(row.element);
    });

    if (myRow && !rows.some((r) => r.playerId === myPlayerId)) {
      const myRowEl = new LeaderboardRow({
        rank: myRow.rank,
        rankEmblem: 'whisper',
        name: myRow.name,
        tag: myRow.tag,
        score: myRow.score,
        timeMs: myRow.timeMs,
        noiseUnits: myRow.noiseUnits,
        status: myRow.status,
        isPinned: true,
      });
      this.listContainer.appendChild(myRowEl.element);
    }
  }
}

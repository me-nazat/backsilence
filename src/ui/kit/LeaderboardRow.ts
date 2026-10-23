/* ── LeaderboardRow.ts ───────────────────────────────────────────────────
 *  Staggered slide-in leaderboard row with rank emblem, verified badge,
 *  score, time, noise units, and replay ghost button.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon, renderRankEmblem, type RankEmblemName } from './Icons.js';

export interface LeaderboardRowOptions {
  rank: number;
  rankEmblem?: RankEmblemName;
  name: string;
  tag: string;
  score: number;
  timeMs: number;
  noiseUnits: number;
  status: 'pending' | 'verified' | 'rejected';
  isPinned?: boolean;
  hasReplay?: boolean;
  onPlayGhost?: () => void;
}

export class LeaderboardRow {
  readonly element: HTMLElement;

  constructor(private opts: LeaderboardRowOptions) {
    this.element = document.createElement('div');
    this.element.className = `bs-lb-row ${opts.isPinned ? 'bs-lb-pinned' : ''}`;
    this.render();
  }

  private render(): void {
    const emblem = this.opts.rankEmblem ?? 'whisper';
    const statusBadge = this.opts.status === 'verified'
      ? `<span class="bs-lb-badge-verified" title="Replay Verified">${renderIcon('check', 14)}</span>`
      : `<span class="bs-lb-badge-pending" title="Pending Verification">${renderIcon('clock', 14)}</span>`;

    const timeSec = (this.opts.timeMs / 1000).toFixed(1);
    const noise = this.opts.noiseUnits.toFixed(1);

    const ghostBtn = this.opts.hasReplay
      ? `<button type="button" class="bs-btn bs-btn-ghost" style="padding: 2px 4px; min-height: 24px; min-width: 24px;" title="Race Ghost">${renderIcon('ghost', 14)}</button>`
      : '';

    this.element.innerHTML = `
      <div style="font-weight: bold; color: var(--bs-tan);">#${this.opts.rank}</div>
      <div>${renderRankEmblem(emblem, 24)}</div>
      <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        <span style="font-weight: 600; color: var(--bs-cream);">${this.opts.name}</span>
        <span style="opacity: 0.5;">#${this.opts.tag}</span>
        <span style="margin-left: 6px;">${statusBadge}</span>
      </div>
      <div class="bs-osd-readout" style="text-align: right; font-weight: bold;">${this.opts.score.toLocaleString()}</div>
      <div style="text-align: right; color: var(--bs-tan);">${timeSec}s</div>
      <div style="text-align: right; color: var(--bs-tan);">${noise} dB</div>
      <div style="display: flex; justify-content: center;">${ghostBtn}</div>
    `;

    if (this.opts.hasReplay && this.opts.onPlayGhost) {
      const btn = this.element.querySelector('button');
      btn?.addEventListener('click', () => {
        this.opts.onPlayGhost?.();
      });
    }
  }
}

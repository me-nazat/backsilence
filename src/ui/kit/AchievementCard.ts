/* ── AchievementCard.ts ──────────────────────────────────────────────────
 *  Archive achievement card: unlocked badge or locked static blur with progress.
 * ──────────────────────────────────────────────────────────────────────── */

import { renderIcon, type IconName } from './Icons.js';

export interface AchievementCardOptions {
  id: string;
  title: string;
  description: string;
  icon?: IconName;
  unlocked?: boolean;
  unlockedAt?: number;
  progress?: { current: number; max: number };
}

export class AchievementCard {
  readonly element: HTMLElement;

  constructor(private opts: AchievementCardOptions) {
    this.element = document.createElement('div');
    this.element.className = `bs-achievement-card ${opts.unlocked ? 'bs-unlocked' : 'bs-locked'}`;
    this.render();
  }

  private render(): void {
    const iconName = this.opts.icon ?? (this.opts.unlocked ? 'trophy' : 'lock');
    const iconColor = this.opts.unlocked ? 'var(--bs-water)' : 'var(--bs-tan)';

    let progressHtml = '';
    if (this.opts.progress && !this.opts.unlocked) {
      const pct = Math.round((this.opts.progress.current / this.opts.progress.max) * 100);
      progressHtml = `
        <div style="margin-top: 6px;">
          <div style="font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-tan); margin-bottom: 2px;">
            ${this.opts.progress.current} / ${this.opts.progress.max}
          </div>
          <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
            <div style="width: ${pct}%; height: 100%; background: var(--bs-tan);"></div>
          </div>
        </div>
      `;
    }

    this.element.innerHTML = `
      <div style="color: ${iconColor}; display: flex; align-items: flex-start; padding-top: 2px;">
        ${renderIcon(iconName, 24)}
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
        <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-sm); font-weight: bold; color: var(--bs-cream);">
          ${this.opts.title}
        </div>
        <div style="font-family: var(--bs-font-mono); font-size: 11px; opacity: 0.75; color: var(--bs-cream); line-height: 1.4;">
          ${this.opts.description}
        </div>
        ${progressHtml}
      </div>
    `;
  }
}

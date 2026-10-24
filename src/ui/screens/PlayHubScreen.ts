/* ── PlayHubScreen.ts ────────────────────────────────────────────────────
 *  Play Hub View:
 *  Displays 8 game mode cards with player counts, estimated length,
 *  score multipliers, and instant launch actions.
 * ──────────────────────────────────────────────────────────────────────── */

import { Button, renderIcon, type IconName } from '../kit/index.js';

export interface GameModeInfo {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  players: string;
  duration: string;
  multiplier: string;
  isOnline: boolean;
}

export const GAME_MODES: GameModeInfo[] = [
  {
    id: 'campaign',
    title: 'THE ARCHIVE TAPES',
    subtitle: '11 recovered tapes across drowned municipal facilities with star gates & mutators.',
    icon: 'tape',
    players: '1 Player',
    duration: '5–10 min',
    multiplier: '1.0x–2.5x',
    isOnline: false,
  },
  {
    id: 'daily',
    title: 'DAILY DESCENT',
    subtitle: 'Deterministic map with daily mutators. One official attempt per 24 hours for daily leaderboards.',
    icon: 'clock',
    players: 'Solo Global',
    duration: '4–8 min',
    multiplier: '1.5x Fixed',
    isOnline: true,
  },
  {
    id: 'endless',
    title: 'ENDLESS TIDE',
    subtitle: 'Survive in an infinite flooded sector. Water levels rise continuously as entities multiply.',
    icon: 'wave',
    players: '1 Player',
    duration: 'Endless',
    multiplier: 'Scales to 5.0x',
    isOnline: false,
  },
  {
    id: 'ghost',
    title: 'GHOST RUN',
    subtitle: 'Race directly against recorded replays of top leaderboard runners or reigning champions.',
    icon: 'ghost',
    players: 'Solo vs Ghost',
    duration: '3–6 min',
    multiplier: '1.2x',
    isOnline: true,
  },
  {
    id: 'training',
    title: 'TRAINING POOL',
    subtitle: 'Safe acoustic orientation room. Calibrate headphones, practice wading, and test noise radii.',
    icon: 'shield',
    players: '1 Player',
    duration: 'Casual',
    multiplier: '0.0x Practice',
    isOnline: false,
  },
  {
    id: 'coop',
    title: 'CO-OP ESCAPE',
    subtitle: 'Two players trapped together. Coordinate door buttons, carry keys, and distract the lurker.',
    icon: 'user',
    players: '2 Players',
    duration: '8–15 min',
    multiplier: '1.8x',
    isOnline: true,
  },
  {
    id: 'race',
    title: 'SILENT RACE',
    subtitle: 'Competitive ranked multiplayer. The quietest and fastest survivor claims Silence Rating (SR).',
    icon: 'trophy',
    players: '2–4 Players',
    duration: '3–5 min',
    multiplier: '2.0x Ranked',
    isOnline: true,
  },
  {
    id: 'last_dry',
    title: 'LAST ONE DRY',
    subtitle: 'Survival elimination. Platforms submerge into the depths one by one. The last dry player wins.',
    icon: 'skull',
    players: '2–4 Players',
    duration: '4–7 min',
    multiplier: '2.2x',
    isOnline: true,
  },
];

export interface PlayHubCallbacks {
  onSelectMode: (modeId: string) => void;
  onBack: () => void;
}

export class PlayHubScreen {
  readonly element: HTMLElement;

  constructor(private callbacks: PlayHubCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-playhub';
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
    const cardsHtml = GAME_MODES.map((m) => `
      <div class="mode-card bs-card" data-mode="${m.id}" style="
        background: var(--bs-surface-2);
        border: 1px solid var(--bs-border);
        border-radius: var(--bs-radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        transition: transform var(--bs-duration-fast) var(--ease-out), border-color var(--bs-duration-fast), box-shadow var(--bs-duration-fast);
      ">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="color: var(--bs-water);">${renderIcon(m.icon, 24)}</span>
            <span style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan); background: rgba(91,69,38,0.3); padding: 2px 8px; border-radius: 2px;">
              ${m.players}
            </span>
          </div>
          <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-cream); margin: 0 0 8px 0;">
            ${m.title}
          </h3>
          <p style="font-size: var(--bs-text-sm); opacity: 0.8; line-height: 1.5; margin: 0 0 16px 0;">
            ${m.subtitle}
          </p>
        </div>
        <div style="border-top: 1px solid var(--bs-border-subtle); padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-family: var(--bs-font-mono); font-size: 11px;">
          <span style="color: var(--bs-tan);">TIME: ${m.duration}</span>
          <span class="bs-osd-readout">${m.multiplier}</span>
        </div>
      </div>
    `).join('');

    this.element.innerHTML = `
      <div style="width: min(1100px, 95vw); display: flex; flex-direction: column; gap: 24px;">
        <!-- Top bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              PLAY HUB // OPERATIONAL DEPLOYMENT
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              SELECT RECONNAISSANCE PROTOCOL
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- Mode Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
          ${cardsHtml}
        </div>
      </div>
    `;

    const backBtn = new Button({
      text: '← RETURN HOME',
      variant: 'ghost',
      onClick: () => this.callbacks.onBack(),
    });
    this.element.querySelector('#btn-back-wrap')?.appendChild(backBtn.element);

    // Card hover and click handlers
    this.element.querySelectorAll<HTMLElement>('.mode-card').forEach((card) => {
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--bs-water)';
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'var(--bs-border)';
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = 'none';
      });
      card.addEventListener('click', () => {
        const mode = card.getAttribute('data-mode');
        if (mode) this.callbacks.onSelectMode(mode);
      });
    });
  }
}

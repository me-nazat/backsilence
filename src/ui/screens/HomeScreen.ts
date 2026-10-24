/* ── HomeScreen.ts ───────────────────────────────────────────────────────
 *  Home / Hero View:
 *  - Ink-in-water logo reveal and atmospheric tagline
 *  - Three main CTAs: Descend (Solo), Dive Online, Daily Descent
 *  - Daily Descent banner showing today's map, mutators, countdown, your rank
 *  - Below-the-fold scrollable strip: Featured Maps, "How it works in 3 beats", Champion Banner
 * ──────────────────────────────────────────────────────────────────────── */

import { Button, renderIcon } from '../kit/index.js';
import { MotionEngine } from '../motion/Motion.js';
import { getUtcDateKey } from '../../meta/MissionEngine.js';
import { I18nEngine, SUPPORTED_LOCALES, type SupportedLocale } from '../../i18n/I18n.js';

export interface HomeScreenCallbacks {
  onDescend: () => void;
  onDiveOnline: () => void;
  onDailyDescent: () => void;
  onOpenPlayHub: () => void;
  onOpenBestiary: () => void;
  onOpenLeaderboards: () => void;
  onOpenChampions: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenCredits: () => void;
  onOpenAbout: () => void;
}

export class HomeScreen {
  readonly element: HTMLElement;
  private motion = MotionEngine.getInstance();

  constructor(private callbacks: HomeScreenCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-home';
    this.element.className = 'bs-root bs-screen';
    this.element.style.cssText = `
      position: absolute;
      inset: 0;
      overflow-y: auto;
      overflow-x: hidden;
      z-index: 100;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      scroll-behavior: smooth;
    `;

    this.render();
  }

  private render(): void {
    const todayKey = getUtcDateKey();

    this.element.innerHTML = `
      <!-- Hero Viewport Section -->
      <section style="min-height: 100vh; width: 100%; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: clamp(24px, 5vw, 60px) 24px; box-sizing: border-box; position: relative;">
        
        <!-- Top Nav Bar -->
        <nav style="width: min(1200px, 95vw); display: flex; justify-content: space-between; align-items: center; pointer-events: auto;">
          <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); letter-spacing: 0.1em; display: flex; align-items: center; gap: 8px;">
            ${renderIcon('tape', 16)} <span>ARCHIVE FILE // 1994-BS</span>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="nav-btn-play" class="bs-btn bs-btn-ghost" style="padding: 4px 10px; min-height: 36px;">PLAY HUB</button>
            <button id="nav-btn-leaderboards" class="bs-btn bs-btn-ghost" style="padding: 4px 10px; min-height: 36px;">SILENCE</button>
            <button id="nav-btn-bestiary" class="bs-btn bs-btn-ghost" style="padding: 4px 10px; min-height: 36px;">BESTIARY</button>
            <button id="nav-btn-champions" class="bs-btn bs-btn-ghost" style="padding: 4px 10px; min-height: 36px;">CHAMPIONS</button>
            <button id="nav-btn-profile" class="bs-btn bs-btn-ghost" style="padding: 4px 10px; min-height: 36px;">PROFILE</button>
            <button id="nav-btn-settings" class="bs-btn bs-btn-ghost" style="padding: 4px 8px; min-height: 36px;" aria-label="Settings">${renderIcon('gear', 16)}</button>
          </div>
        </nav>

        <!-- Center Hero Wordmark & Tagline -->
        <div style="text-align: center; max-width: 800px; display: flex; flex-direction: column; align-items: center; pointer-events: auto; margin: auto 0;">
          <svg id="hero-logo-svg" viewBox="0 0 460 70" width="min(520px, 85vw)" height="auto" style="overflow: visible; filter: drop-shadow(0 0 16px rgba(134,207,160,0.3));">
            <!-- Coded stroke-font wordmark for BACKSILENCE -->
            <text x="50%" y="54" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="52" fill="none" stroke="var(--bs-cream)" stroke-width="2.5" letter-spacing="8">
              BACKSILENCE
            </text>
          </svg>

          <p class="bs-menu-breathing" style="font-family: var(--bs-font-mono); font-size: clamp(0.75rem, 2vw, 1.05rem); color: var(--bs-water); letter-spacing: 0.18em; margin-top: 12px; text-transform: uppercase;">
            IT CAN'T SEE YOU. IT HEARS THE WATER.
          </p>

          <div style="font-size: var(--bs-text-xs); color: var(--bs-tan); opacity: 0.8; margin-top: 6px; font-family: var(--bs-font-mono);">
            Found-footage acoustic survival in drowned municipal architecture.
          </div>

          <!-- CTAs -->
          <div style="display: flex; flex-direction: column; gap: 12px; width: min(340px, 85vw); margin-top: 32px;">
            <div id="btn-descend-wrap"></div>
            <div id="btn-dive-online-wrap"></div>
            <div id="btn-daily-descent-wrap"></div>
          </div>
        </div>

        <!-- Scroll Cue -->
        <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan); opacity: 0.75; display: flex; flex-direction: column; align-items: center; gap: 4px;">
          <span>SCROLL FOR ARCHIVE DOSSIER</span>
          <span style="font-size: 14px;">↓</span>
        </div>
      </section>

      <!-- Below the Fold Strip -->
      <section style="width: min(1200px, 92vw); padding: 48px 0 80px 0; display: flex; flex-direction: column; gap: 56px;">
        
        <!-- Daily Descent Live Pill -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); border-left: 4px solid var(--bs-water); border-radius: var(--bs-radius-sm); padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-water); letter-spacing: 0.12em; text-transform: uppercase;">TODAY'S DAILY DESCENT // ${todayKey}</div>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); font-weight: bold; color: var(--bs-cream); margin-top: 2px;">THE NATATORIUM // MUTATORS: DEEP TIDE + SILENT MONSTER</div>
          </div>
          <div style="display: flex; gap: 20px; align-items: center;">
            <div style="text-align: right; font-family: var(--bs-font-mono);">
              <div style="font-size: 10px; color: var(--bs-tan);">EXPIRES IN</div>
              <div class="bs-osd-readout" style="font-size: var(--bs-text-sm);">06:42:19</div>
            </div>
            <button id="btn-daily-action" class="bs-btn bs-btn-primary" style="padding: 6px 14px;">ENTER BOARD</button>
          </div>
        </div>

        <!-- 3 Beats: How it works -->
        <div>
          <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px;">SURVIVAL MANUAL</div>
          <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); color: var(--bs-cream); margin: 0 0 24px 0;">HOW TO SURVIVE IN THREE BEATS</h2>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
            <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 24px; border-radius: var(--bs-radius-sm);">
              <div style="color: var(--bs-tan); margin-bottom: 12px;">${renderIcon('drop', 28)}</div>
              <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-cream); margin: 0 0 8px 0;">1. STAY DRY</h3>
              <p style="font-size: var(--bs-text-sm); opacity: 0.8; line-height: 1.6; margin: 0;">
                The entity cannot reach platforms or perches. Step onto tiles to stay completely safe. Water is where danger lives.
              </p>
            </div>

            <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 24px; border-radius: var(--bs-radius-sm);">
              <div style="color: var(--bs-danger); margin-bottom: 12px;">${renderIcon('wave', 28)}</div>
              <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-cream); margin: 0 0 8px 0;">2. WATER IS LOUD</h3>
              <p style="font-size: var(--bs-text-sm); opacity: 0.8; line-height: 1.6; margin: 0;">
                Every step in water radiates acoustic ripple waves. Running echoes across entire halls. Move slowly or crouch to stay silent.
              </p>
            </div>

            <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 24px; border-radius: var(--bs-radius-sm);">
              <div style="color: var(--bs-water); margin-bottom: 12px;">${renderIcon('ear', 28)}</div>
              <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-cream); margin: 0 0 8px 0;">3. LISTEN</h3>
              <p style="font-size: var(--bs-text-sm); opacity: 0.8; line-height: 1.6; margin: 0;">
                Wear headphones. Procedural HRTF audio lets you hear heavy splashing, breathing, and distance through reverberating concrete.
              </p>
            </div>
          </div>
        </div>

        <!-- Featured Champions Banner -->
        <div style="background: linear-gradient(135deg, var(--bs-surface-2) 0%, rgba(91,69,38,0.3) 100%); border: 1px solid var(--bs-border-strong); border-radius: var(--bs-radius-sm); padding: 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
          <div>
            <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan); letter-spacing: 0.12em;">REIGNING CHAMPION // SEASON 1</div>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); font-weight: bold; color: var(--bs-cream); margin-top: 4px;">
              ECHO_STALKER#0001 — 94,820 PTS
            </div>
            <div style="font-size: var(--bs-text-xs); opacity: 0.8; margin-top: 4px;">Verified Clean Run // Natatorium (Silence Speedrun)</div>
          </div>
          <button id="btn-race-ghost" class="bs-btn bs-btn-primary" style="display: flex; gap: 8px; align-items: center;">
            ${renderIcon('ghost', 16)} RACE THEIR GHOST
          </button>
        </div>

        <!-- Footer -->
        <footer style="border-top: 1px solid var(--bs-border); padding-top: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan);">
          <div>BACKSILENCE v1.0.0-RC // MUNICIPAL ARCHIVE</div>
          <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <select id="footer-language-select" aria-label="Language selector" style="background: rgba(13,11,6,0.9); color: var(--bs-tan); border: 1px solid var(--bs-border); padding: 2px 6px; font-size: 11px; border-radius: 2px; font-family: var(--bs-font-mono);">
                ${SUPPORTED_LOCALES.map((l) => `<option value="${l.id}" ${I18nEngine.getInstance().getLocale() === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
              </select>
              <span id="footer-lang-beta" style="display: ${I18nEngine.getInstance().isBeta() ? 'inline-block' : 'none'}; font-size: 9px; padding: 1px 4px; background: rgba(216,179,106,0.2); border: 1px solid var(--bs-water); color: var(--bs-water); border-radius: 2px;">BETA</span>
            </div>
            <a href="#" id="link-credits" style="color: inherit; text-decoration: underline;">CREDITS & CC-BY</a>
            <a href="#" id="link-privacy" style="color: inherit; text-decoration: underline;">PRIVACY & STORAGE</a>
          </div>
        </footer>
      </section>
    `;

    this.mountButtons();
    this.bindEvents();
    this.playLogoAnimation();
  }

  private mountButtons(): void {
    const descendWrap = this.element.querySelector('#btn-descend-wrap')!;
    const diveWrap = this.element.querySelector('#btn-dive-online-wrap')!;
    const dailyWrap = this.element.querySelector('#btn-daily-descent-wrap')!;

    const descendBtn = new Button({
      text: 'DESCEND (SOLO)',
      variant: 'primary',
      onClick: () => this.callbacks.onDescend(),
    });
    descendBtn.element.id = 'btn-play-solo';
    this.motion.attachHoverRipple(descendBtn.element);
    descendWrap.appendChild(descendBtn.element);

    const diveBtn = new Button({
      text: 'DIVE ONLINE (CO-OP / RACE)',
      variant: 'ghost',
      onClick: () => this.callbacks.onDiveOnline(),
    });
    diveBtn.element.id = 'btn-play-online';
    this.motion.attachHoverRipple(diveBtn.element);
    diveWrap.appendChild(diveBtn.element);

    const dailyBtn = new Button({
      text: "DAILY DESCENT (TODAY'S RUN)",
      variant: 'ghost',
      onClick: () => this.callbacks.onDailyDescent(),
    });
    dailyBtn.element.id = 'btn-daily-descent';
    this.motion.attachHoverRipple(dailyBtn.element);
    dailyWrap.appendChild(dailyBtn.element);
  }

  private bindEvents(): void {
    this.element.querySelector('#nav-btn-play')?.addEventListener('click', () => this.callbacks.onOpenPlayHub());
    this.element.querySelector('#nav-btn-leaderboards')?.addEventListener('click', () => this.callbacks.onOpenLeaderboards());
    this.element.querySelector('#nav-btn-bestiary')?.addEventListener('click', () => this.callbacks.onOpenBestiary());
    this.element.querySelector('#nav-btn-champions')?.addEventListener('click', () => this.callbacks.onOpenChampions());
    this.element.querySelector('#nav-btn-profile')?.addEventListener('click', () => this.callbacks.onOpenProfile());
    this.element.querySelector('#nav-btn-settings')?.addEventListener('click', () => this.callbacks.onOpenSettings());

    this.element.querySelector('#btn-daily-action')?.addEventListener('click', () => this.callbacks.onDailyDescent());
    this.element.querySelector('#btn-race-ghost')?.addEventListener('click', () => this.callbacks.onOpenChampions());

    this.element.querySelector('#link-credits')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.callbacks.onOpenCredits();
    });
    this.element.querySelector('#link-privacy')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.callbacks.onOpenAbout();
    });

    const footerLang = this.element.querySelector('#footer-language-select') as HTMLSelectElement;
    footerLang?.addEventListener('change', () => {
      const chosen = footerLang.value as SupportedLocale;
      void I18nEngine.getInstance().setLocale(chosen).then(() => {
        const beta = this.element.querySelector('#footer-lang-beta') as HTMLElement;
        if (beta) {
          beta.style.display = I18nEngine.getInstance().isBeta(chosen) ? 'inline-block' : 'none';
        }
      });
    });
  }

  private playLogoAnimation(): void {
    const svg = this.element.querySelector<SVGElement>('#hero-logo-svg');
    if (svg) {
      this.motion.inkLogoReveal(svg);
    }
  }
}

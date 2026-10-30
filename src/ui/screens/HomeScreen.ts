/* ── HomeScreen.ts ───────────────────────────────────────────────────────
 *  Home / Hero View:
 *  - Ink-in-water logo reveal and atmospheric high-contrast tagline
 *  - Prominent Dual CTAs: CONTINUE TAPE // DESCEND and PLAY HUB // 8 MODES
 *  - Secondary CTAs: Dive Online, Daily Descent with high-contrast backing
 *  - Daily Descent banner showing today's map, mutators, countdown
 *  - Below-the-fold scrollable strip: 8 Playable Modes Dossier Grid with 1-click launch,
 *    "How it works in 3 beats", and Reigning Champion banner
 * ──────────────────────────────────────────────────────────────────────── */

import { Button, renderIcon } from '../kit/index.js';
import { MotionEngine } from '../motion/Motion.js';
import { getUtcDateKey } from '../../meta/MissionEngine.js';
import { I18nEngine, SUPPORTED_LOCALES, type SupportedLocale } from '../../i18n/I18n.js';
import { GAME_MODES } from './PlayHubScreen.js';

export interface HomeScreenCallbacks {
  onDescend: () => void;
  onDiveOnline: () => void;
  onDailyDescent: () => void;
  onOpenPlayHub: () => void;
  onSelectMode?: (modeId: string) => void;
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
      <section style="min-height: 100vh; width: 100%; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: clamp(20px, 4vw, 48px) 24px; box-sizing: border-box; position: relative;">
        
        <!-- Top Nav Bar with High-Contrast Backdrop -->
        <nav class="bs-contrast-panel" style="width: min(1200px, 95vw); display: flex; justify-content: space-between; align-items: center; pointer-events: auto; flex-wrap: wrap; gap: 8px; padding: 10px 18px; border-radius: 6px;">
          <div class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); letter-spacing: 0.12em; display: flex; align-items: center; gap: 8px;">
            ${renderIcon('tape', 16)} <span>01. NATATORIUM // MENU</span>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <button id="nav-btn-play" class="bs-btn bs-btn-ghost" style="padding: 6px 14px; min-height: 38px; font-weight: 700;">PLAY HUB (8 MODES)</button>
            <button id="nav-btn-quality" class="bs-btn bs-btn-ghost" style="padding: 6px 12px; min-height: 38px; font-size: 11px; font-family: var(--bs-font-mono); color: #86cfa0; border: 1px solid rgba(134,207,160,0.5);" title="Quality Auto-Detect (tap to change)">
              QUALITY: AUTO
            </button>
            <button id="nav-btn-leaderboards" class="bs-btn bs-btn-ghost" style="padding: 6px 12px; min-height: 38px; font-weight: 600;">SILENCE</button>
            <button id="nav-btn-bestiary" class="bs-btn bs-btn-ghost" style="padding: 6px 12px; min-height: 38px; font-weight: 600;">BESTIARY</button>
            <button id="nav-btn-champions" class="bs-btn bs-btn-ghost" style="padding: 6px 12px; min-height: 38px; font-weight: 600;">CHAMPIONS</button>
            <button id="nav-btn-profile" class="bs-btn bs-btn-ghost" style="padding: 6px 12px; min-height: 38px; font-weight: 600;">PROFILE</button>
            <button id="nav-btn-settings" class="bs-btn bs-btn-ghost" style="padding: 6px 10px; min-height: 38px;" aria-label="Settings">${renderIcon('gear', 16)}</button>
          </div>
        </nav>

        <!-- Center Hero Wordmark & High-Contrast Backdrop -->
        <div class="bs-contrast-panel" style="text-align: center; max-width: 840px; width: min(840px, 94vw); display: flex; flex-direction: column; align-items: center; pointer-events: auto; margin: auto 0; padding: clamp(24px, 5vw, 40px) clamp(20px, 5vw, 44px); border-radius: 8px;">
          <svg id="hero-logo-svg" viewBox="0 0 460 70" style="width: min(520px, 85vw); height: auto; overflow: visible; filter: drop-shadow(0 0 20px rgba(0,0,0,0.95)) drop-shadow(0 0 16px rgba(134,207,160,0.4));">
            <!-- Coded stroke-font wordmark for BACKSILENCE -->
            <text x="50%" y="54" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="52" fill="#F4F6F0" stroke="#000000" stroke-width="3" letter-spacing="8">
              BACKSILENCE
            </text>
          </svg>

          <p class="bs-menu-breathing bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: clamp(0.85rem, 2.2vw, 1.2rem); font-weight: 800; color: #86cfa0; letter-spacing: 0.20em; margin-top: 14px; text-transform: uppercase;">
            IT CAN'T SEE YOU. IT HEARS THE WATER.
          </p>

          <div class="bs-high-contrast-text" style="font-size: var(--bs-text-xs); color: #e9dca8; opacity: 0.95; margin-top: 8px; font-family: var(--bs-font-mono); letter-spacing: 0.05em;">
            Found-footage acoustic survival in drowned municipal architecture.
          </div>

          <!-- Primary CTAs: Side-by-side or stacked prominent buttons -->
          <div style="display: flex; flex-direction: column; width: 100%; max-width: 480px; margin-top: 26px; gap: 12px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;">
              <div id="btn-descend-wrap"></div>
              <div id="btn-playhub-wrap"></div>
            </div>

            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; color: #e9dca8; font-family: var(--bs-font-mono); -webkit-text-stroke: 1px rgba(0,0,0,0.8); text-shadow: 0 1px 4px #000; margin: 4px 0;">
              ${renderIcon('ear', 14)}
              <span>HEADPHONES RECOMMENDED // STEREO HRTF</span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
              <div id="btn-dive-online-wrap"></div>
              <div id="btn-daily-descent-wrap"></div>
            </div>
          </div>
        </div>

        <!-- Scroll Cue with High Contrast -->
        <a href="#archive-dossier" class="bs-contrast-panel" style="text-decoration: none; padding: 6px 14px; border-radius: 16px; font-family: var(--bs-font-mono); font-size: 11px; font-weight: 700; color: #F4F6F0; display: flex; align-items: center; gap: 6px; -webkit-text-stroke: 1px rgba(0,0,0,0.8); text-shadow: 0 1px 3px #000;">
          <span>SCROLL FOR ARCHIVE DOSSIER</span>
          <span style="font-size: 14px;">↓</span>
        </a>
      </section>

      <!-- Below the Fold Strip -->
      <section id="archive-dossier" style="width: min(1200px, 92vw); padding: 48px 0 80px 0; display: flex; flex-direction: column; gap: 48px;">
        
        <!-- 8 Classified Modes Dossier Grid -->
        <div class="bs-contrast-panel" style="padding: 28px; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.18); padding-bottom: 14px;">
            <div>
              <div class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: #86cfa0; letter-spacing: 0.14em; text-transform: uppercase;">
                ARCHIVE DOSSIER // PLAYABLE PROTOCOLS
              </div>
              <h2 class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); font-weight: 800; color: #F4F6F0; margin: 4px 0 0 0;">
                8 CLASSIFIED SIMULATION MODES
              </h2>
            </div>
            <button id="btn-open-play-hub-bottom" class="bs-btn bs-btn-primary" style="padding: 8px 18px; font-weight: 700;">
              OPEN FULL PLAY HUB →
            </button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
            ${GAME_MODES.map((mode) => `
              <div class="bs-card" style="background: rgba(13, 11, 6, 0.92); border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 6px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; transition: transform 0.15s, border-color 0.15s;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="color: #86cfa0;">${renderIcon(mode.icon, 22)}</span>
                    <span style="font-family: var(--bs-font-mono); font-size: 10px; padding: 2px 6px; background: rgba(134,207,160,0.15); border: 1px solid rgba(134,207,160,0.3); border-radius: 2px; color: #86cfa0; font-weight: 600;">
                      ${mode.players}
                    </span>
                  </div>
                  <h3 class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: 1rem; font-weight: 700; color: #F4F6F0; margin: 0 0 6px 0;">
                    ${mode.title}
                  </h3>
                  <p style="font-size: var(--bs-text-xs); color: #d9d3a2; opacity: 0.88; line-height: 1.5; margin: 0;">
                    ${mode.subtitle}
                  </p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                  <span style="font-family: var(--bs-font-mono); font-size: 11px; color: #d8b36a; font-weight: 600;">
                    ${mode.duration}
                  </span>
                  <button class="bs-btn bs-btn-primary btn-launch-mode" data-mode="${mode.id}" style="padding: 6px 14px; font-size: 11px; font-weight: 700;">
                    LAUNCH ▶
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Daily Descent Live Pill -->
        <div class="bs-contrast-panel" style="border-left: 4px solid var(--bs-water); border-radius: var(--bs-radius-sm); padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <div class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-water); letter-spacing: 0.12em; text-transform: uppercase;">TODAY'S DAILY DESCENT // ${todayKey}</div>
            <div class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); font-weight: bold; color: #F4F6F0; margin-top: 2px;">THE NATATORIUM // MUTATORS: DEEP TIDE + SILENT MONSTER</div>
          </div>
          <div style="display: flex; gap: 20px; align-items: center;">
            <div style="text-align: right; font-family: var(--bs-font-mono);">
              <div style="font-size: 10px; color: var(--bs-tan);">EXPIRES IN</div>
              <div class="bs-osd-readout bs-high-contrast-text" style="font-size: var(--bs-text-sm);">06:42:19</div>
            </div>
            <button id="btn-daily-action" class="bs-btn bs-btn-primary" style="padding: 8px 16px; font-weight: 700;">ENTER BOARD</button>
          </div>
        </div>

        <!-- 3 Beats: How it works -->
        <div class="bs-contrast-panel" style="padding: 28px; border-radius: 8px;">
          <div class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: #86cfa0; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px;">SURVIVAL MANUAL</div>
          <h2 class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); font-weight: 800; color: #F4F6F0; margin: 0 0 24px 0;">HOW TO SURVIVE IN THREE BEATS</h2>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
            <div style="background: rgba(13, 11, 6, 0.85); border: 1px solid rgba(255, 255, 255, 0.2); padding: 24px; border-radius: var(--bs-radius-sm);">
              <div style="color: var(--bs-tan); margin-bottom: 12px;">${renderIcon('drop', 28)}</div>
              <h3 class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: #F4F6F0; margin: 0 0 8px 0;">1. STAY DRY</h3>
              <p style="font-size: var(--bs-text-sm); opacity: 0.88; line-height: 1.6; margin: 0; color: #d9d3a2;">
                The entity cannot reach platforms or perches. Step onto tiles to stay completely safe. Water is where danger lives.
              </p>
            </div>

            <div style="background: rgba(13, 11, 6, 0.85); border: 1px solid rgba(255, 255, 255, 0.2); padding: 24px; border-radius: var(--bs-radius-sm);">
              <div style="color: var(--bs-danger); margin-bottom: 12px;">${renderIcon('wave', 28)}</div>
              <h3 class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: #F4F6F0; margin: 0 0 8px 0;">2. WATER IS LOUD</h3>
              <p style="font-size: var(--bs-text-sm); opacity: 0.88; line-height: 1.6; margin: 0; color: #d9d3a2;">
                Every step in water radiates acoustic ripple waves. Running echoes across entire halls. Move slowly or crouch to stay silent.
              </p>
            </div>

            <div style="background: rgba(13, 11, 6, 0.85); border: 1px solid rgba(255, 255, 255, 0.2); padding: 24px; border-radius: var(--bs-radius-sm);">
              <div style="color: var(--bs-water); margin-bottom: 12px;">${renderIcon('ear', 28)}</div>
              <h3 class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: #F4F6F0; margin: 0 0 8px 0;">3. LISTEN</h3>
              <p style="font-size: var(--bs-text-sm); opacity: 0.88; line-height: 1.6; margin: 0; color: #d9d3a2;">
                Wear headphones. Procedural HRTF audio lets you hear heavy splashing, breathing, and distance through reverberating concrete.
              </p>
            </div>
          </div>
        </div>

        <!-- Featured Champions Banner -->
        <div class="bs-contrast-panel" style="border: 1px solid var(--bs-border-strong); border-radius: var(--bs-radius-sm); padding: 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
          <div>
            <div class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan); letter-spacing: 0.12em;">REIGNING CHAMPION // SEASON 1</div>
            <div class="bs-high-contrast-text" style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); font-weight: bold; color: #F4F6F0; margin-top: 4px;">
              ECHO_STALKER#0001 — 94,820 PTS
            </div>
            <div style="font-size: var(--bs-text-xs); opacity: 0.85; margin-top: 4px; color: #d9d3a2;">Verified Clean Run // Natatorium (Silence Speedrun)</div>
          </div>
          <button id="btn-race-ghost" class="bs-btn bs-btn-primary" style="display: flex; gap: 8px; align-items: center; font-weight: 700;">
            ${renderIcon('ghost', 16)} RACE THEIR GHOST
          </button>
        </div>

        <!-- Footer -->
        <footer class="bs-contrast-panel" style="border-radius: 6px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: #d8b36a;">
          <div class="bs-high-contrast-text" style="font-weight: 600;">BACKSILENCE v1.0.0-RC // MUNICIPAL ARCHIVE</div>
          <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <select id="footer-language-select" aria-label="Language selector" style="background: rgba(13,11,6,0.9); color: #F4F6F0; border: 1px solid rgba(255,255,255,0.25); padding: 4px 8px; font-size: 11px; border-radius: 2px; font-family: var(--bs-font-mono);">
                ${SUPPORTED_LOCALES.map((l) => `<option value="${l.id}" ${I18nEngine.getInstance().getLocale() === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
              </select>
              <span id="footer-lang-beta" style="display: ${I18nEngine.getInstance().isBeta() ? 'inline-block' : 'none'}; font-size: 9px; padding: 1px 4px; background: rgba(216,179,106,0.2); border: 1px solid var(--bs-water); color: var(--bs-water); border-radius: 2px;">BETA</span>
            </div>
            <a href="#" id="link-credits" class="bs-high-contrast-text" style="text-decoration: underline;">CREDITS & CC-BY</a>
            <a href="#" id="link-privacy" class="bs-high-contrast-text" style="text-decoration: underline;">PRIVACY & STORAGE</a>
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
    const playhubWrap = this.element.querySelector('#btn-playhub-wrap')!;
    const diveWrap = this.element.querySelector('#btn-dive-online-wrap')!;
    const dailyWrap = this.element.querySelector('#btn-daily-descent-wrap')!;

    const lastTape = typeof localStorage !== 'undefined' ? localStorage.getItem('backsilence_last_tape') : null;
    const tapeLabel = lastTape ? lastTape.replace(/_/g, ' ').toUpperCase() : 'NATATORIUM';
    const descendText = lastTape ? `CONTINUE [${tapeLabel}]` : 'DESCEND // SOLO';

    const descendBtn = new Button({
      text: descendText,
      variant: 'primary',
      onClick: () => this.callbacks.onDescend(),
    });
    descendBtn.element.id = 'btn-play-solo';
    descendBtn.element.style.minHeight = '50px';
    descendBtn.element.style.width = '100%';
    descendBtn.element.style.fontSize = '0.98rem';
    descendBtn.element.style.fontWeight = '800';
    descendBtn.element.style.letterSpacing = '0.12em';
    descendBtn.element.style.boxShadow = '0 0 24px rgba(134,207,160,0.35)';
    this.motion.attachHoverRipple(descendBtn.element);
    descendWrap.appendChild(descendBtn.element);

    const playHubBtn = new Button({
      text: 'PLAY HUB (8 MODES)',
      variant: 'primary',
      onClick: () => this.callbacks.onOpenPlayHub(),
    });
    playHubBtn.element.id = 'btn-hero-playhub';
    playHubBtn.element.style.minHeight = '50px';
    playHubBtn.element.style.width = '100%';
    playHubBtn.element.style.fontSize = '0.98rem';
    playHubBtn.element.style.fontWeight = '800';
    playHubBtn.element.style.letterSpacing = '0.12em';
    playHubBtn.element.style.background = 'rgba(26, 45, 34, 0.85)';
    playHubBtn.element.style.borderColor = 'var(--bs-water)';
    playHubBtn.element.style.boxShadow = '0 0 20px rgba(134,207,160,0.25)';
    this.motion.attachHoverRipple(playHubBtn.element);
    playhubWrap.appendChild(playHubBtn.element);

    const diveBtn = new Button({
      text: 'DIVE ONLINE (CO-OP / RACE)',
      variant: 'ghost',
      onClick: () => this.callbacks.onDiveOnline(),
    });
    diveBtn.element.id = 'btn-play-online';
    diveBtn.element.style.width = '100%';
    diveBtn.element.style.minHeight = '42px';
    diveBtn.element.style.fontWeight = '700';
    this.motion.attachHoverRipple(diveBtn.element);
    diveWrap.appendChild(diveBtn.element);

    const dailyBtn = new Button({
      text: "DAILY DESCENT (TODAY'S RUN)",
      variant: 'ghost',
      onClick: () => this.callbacks.onDailyDescent(),
    });
    dailyBtn.element.id = 'btn-daily-descent';
    dailyBtn.element.style.width = '100%';
    dailyBtn.element.style.minHeight = '42px';
    dailyBtn.element.style.fontWeight = '700';
    this.motion.attachHoverRipple(dailyBtn.element);
    dailyWrap.appendChild(dailyBtn.element);
  }

  private bindEvents(): void {
    const qualityBtn = this.element.querySelector('#nav-btn-quality') as HTMLButtonElement;
    if (qualityBtn) {
      import('../../engine/QualityBenchmark.js').then(({ QualityBenchmark }) => {
        const qm = QualityBenchmark.getInstance();
        const updateText = () => {
          qualityBtn.textContent = `QUALITY: ${qm.getEffectiveTier().toUpperCase()}`;
        };
        updateText();
        qualityBtn.addEventListener('click', () => {
          qm.cycleTier();
          updateText();
        });
      }).catch(() => {});
    }

    this.element.querySelector('#nav-btn-play')?.addEventListener('click', () => this.callbacks.onOpenPlayHub());
    this.element.querySelector('#btn-open-play-hub-bottom')?.addEventListener('click', () => this.callbacks.onOpenPlayHub());
    this.element.querySelector('#nav-btn-leaderboards')?.addEventListener('click', () => this.callbacks.onOpenLeaderboards());
    this.element.querySelector('#nav-btn-bestiary')?.addEventListener('click', () => this.callbacks.onOpenBestiary());
    this.element.querySelector('#nav-btn-champions')?.addEventListener('click', () => this.callbacks.onOpenChampions());
    this.element.querySelector('#nav-btn-profile')?.addEventListener('click', () => this.callbacks.onOpenProfile());
    this.element.querySelector('#nav-btn-settings')?.addEventListener('click', () => this.callbacks.onOpenSettings());

    this.element.querySelector('#btn-daily-action')?.addEventListener('click', () => this.callbacks.onDailyDescent());
    this.element.querySelector('#btn-race-ghost')?.addEventListener('click', () => this.callbacks.onOpenChampions());

    // Wire instant Launch buttons in the 8-mode Dossier grid
    this.element.querySelectorAll<HTMLButtonElement>('.btn-launch-mode').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode) {
          if (this.callbacks.onSelectMode) {
            this.callbacks.onSelectMode(mode);
          } else {
            this.callbacks.onOpenPlayHub();
          }
        }
      });
    });

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

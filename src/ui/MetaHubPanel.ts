/* ── MetaHubPanel.ts ────────────────────────────────────────────────────────
 *  Section 10: Functional UI Hooks for Batch 7 Game Design Layer.
 *  Contains:
 *  - Tape Archive Shelf (11 tapes with star gates, objectives, loglines, remix mutators)
 *  - Pre-run Screen (loadout slots, mutators matrix, assists, score multiplier)
 *  - Field Contracts Panel (deterministic daily & weekly missions, rerolls)
 *  - Operator Profile (Level 1-60, Elo & Rank Tier, 30 Achievements, Cosmetics, Recovery Code)
 * ──────────────────────────────────────────────────────────────────────── */

import { CAMPAIGN_TAPES, Campaign } from '../meta/Campaign.js';
import { ACTIVE_LOADOUT_OPTIONS, PASSIVE_LOADOUT_OPTIONS } from '../meta/Loadout.js';
import { MUTATORS, MutatorManager } from '../meta/Mutators.js';
import { getUtcDateKey, getUtcWeekKey, MissionEngine, type MissionContract } from '../meta/MissionEngine.js';
import { calculateLevelFromXp } from '../meta/Progression.js';
import { ACHIEVEMENTS } from '../meta/Achievements.js';
import { ProfileStore, type PlayerProfileData } from '../meta/ProfilePersistence.js';
import { RatingSystem } from '../meta/RatingElo.js';
import { COSMETIC_CATALOG } from '../meta/Cosmetics.js';

export type MetaHubTab = 'tapes' | 'prerun' | 'missions' | 'profile';

export class MetaHubPanel {
  private el: HTMLElement | null = null;
  private currentTab: MetaHubTab = 'tapes';
  private selectedMutators = new Set<string>();
  private selectedAssists = new Set<string>();
  private activeSlot1 = 'pebble_pouch';
  private activeSlot2 = 'glow_sticks';
  private passiveSlot = 'steady_breath';
  private onClose: () => void;

  constructor(onClose: () => void) {
    this.onClose = onClose;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'metahub-panel';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(10, 8, 5, 0.96);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: clamp(16px, 3vw, 32px) 20px;
      overflow-y: auto;
      z-index: 210;
      pointer-events: auto;
      box-sizing: border-box;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
    `;

    this.el = el;
    container.appendChild(el);
    this.render();
  }

  show(tab: MetaHubTab = 'tapes'): void {
    this.currentTab = tab;
    if (this.el) {
      this.el.style.display = 'flex';
      this.render();
    }
  }

  hide(): void {
    if (this.el) {
      this.el.style.display = 'none';
    }
  }

  get isVisible(): boolean {
    return this.el?.style.display === 'flex';
  }

  private render(): void {
    if (!this.el) return;

    const profile = ProfileStore.load();
    const levelInfo = calculateLevelFromXp(profile.xp);
    const campaign = new Campaign();

    // Score multiplier calculation
    const baseMultiplier = MutatorManager.computeMultiplier(Array.from(this.selectedMutators));
    const assistMultiplier = this.selectedAssists.size > 0 ? 0.8 : 1.0;
    const compoundMultiplier = Number((baseMultiplier * assistMultiplier).toFixed(2));

    this.el.innerHTML = `
      <div style="width: min(940px, 95vw); display: flex; flex-direction: column; gap: 16px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: clamp(1.3rem, 2.8vw, 1.8rem); color: var(--water, #86cfa0); margin: 0; letter-spacing: 0.1em;">ARCHIVE TERMINAL // ARCHIVIST OPERATOR</h2>
            <div style="font-size: 11px; opacity: 0.75;">OPERATOR LEVEL ${levelInfo.level} // SILENCE RATING: ${profile.silenceRating} (${RatingSystem.getTier(profile.silenceRating)}) // STATIC: ${profile.staticBalance}</div>
          </div>
          <button id="btn-metahub-close" class="analog-btn" style="width: auto; padding: 6px 16px;">[ESC] BACK</button>
        </div>

        <!-- Navigation Tabs -->
        <div style="display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; flex-wrap: wrap;">
          <button class="diff-btn ${this.currentTab === 'tapes' ? 'active' : ''}" data-tab="tapes">📼 TAPE ARCHIVE SHELF</button>
          <button class="diff-btn ${this.currentTab === 'prerun' ? 'active' : ''}" data-tab="prerun">🎒 PRE-RUN & LOADOUT</button>
          <button class="diff-btn ${this.currentTab === 'missions' ? 'active' : ''}" data-tab="missions">📜 FIELD CONTRACTS</button>
          <button class="diff-btn ${this.currentTab === 'profile' ? 'active' : ''}" data-tab="profile">👤 OPERATOR DOSSIER</button>
        </div>

        <!-- Tab Content -->
        <div id="metahub-tab-content">
          ${this.renderTabContent(profile, campaign, compoundMultiplier)}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderTabContent(profile: PlayerProfileData, campaign: Campaign, compoundMultiplier: number): string {
    switch (this.currentTab) {
      case 'tapes':
        return this.renderTapesShelf(profile, campaign);
      case 'prerun':
        return this.renderPreRunScreen(compoundMultiplier);
      case 'missions':
        return this.renderMissionsPanel();
      case 'profile':
        return this.renderProfilePanel(profile);
    }
  }

  private renderTapesShelf(profile: PlayerProfileData, campaign: Campaign): string {
    return `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
          The Tape Archive holds 11 found-footage reels recovered by the Archivist. Each tape requires 2 stars on the preceding tape to decipher, or 1 star plus 300 Static credits to bypass.
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
          ${CAMPAIGN_TAPES.map((tape) => {
            const isUnlocked = campaign.isTapeUnlocked(tape.index);
            const stars = profile.campaignStars[tape.index] ?? 0;
            const tapeReelFound = profile.tapeReelsCollected.includes(tape.mapId);

            return `
              <div style="padding: 12px; border: 1px solid ${isUnlocked ? 'rgba(134,207,160,0.4)' : '#332a1c'}; background: ${isUnlocked ? 'rgba(0,0,0,0.45)' : 'rgba(15,12,8,0.7)'}; border-radius: 4px; display: flex; flex-direction: column; gap: 6px; opacity: ${isUnlocked ? 1.0 : 0.6};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: bold; color: ${isUnlocked ? 'var(--fog)' : '#776655'}; font-size: 13px;">TAPE ${tape.index}: ${tape.title}</span>
                  <span style="color: #ffeb3b; font-size: 13px;">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
                </div>
                <div style="font-size: 10px; color: var(--water, #86cfa0);">${tape.mapId.toUpperCase()}</div>
                <div style="font-size: 10px; opacity: 0.85; font-style: italic; min-height: 28px;">"${tape.logline}"</div>
                
                <div style="font-size: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px; display: flex; flex-direction: column; gap: 2px;">
                  <div>[1★] ${tape.primary.description}</div>
                  <div>[2★] ${tape.secondary.description}</div>
                  <div>[3★] ${tape.hidden.description} ${tapeReelFound ? '📼 (REEL FOUND)' : ''}</div>
                </div>

                <div style="font-size: 9px; opacity: 0.6; margin-top: 4px;">Remix Mutators: ${tape.remixMutators.join(' + ')}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  private renderPreRunScreen(compoundMultiplier: number): string {
    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
        <!-- Loadout Configuration -->
        <div style="background: rgba(0,0,0,0.4); border: 1px solid #3d2f18; padding: 14px; border-radius: 4px; display: flex; flex-direction: column; gap: 10px;">
          <div style="font-weight: bold; color: var(--water, #86cfa0); font-size: 12px; letter-spacing: 0.1em;">TACTICAL LOADOUT (2 ACTIVE + 1 PASSIVE)</div>
          
          <div>
            <label style="font-size: 10px; opacity: 0.7;">ACTIVE SLOT 1</label>
            <select id="sel-active-1" style="width: 100%; background: #16120b; border: 1px solid #55442b; color: var(--fog); padding: 6px; font-family: monospace; font-size: 11px;">
              ${ACTIVE_LOADOUT_OPTIONS.map((opt) => `<option value="${opt.id}" ${this.activeSlot1 === opt.id ? 'selected' : ''}>${opt.name} (${opt.desc})</option>`).join('')}
            </select>
          </div>

          <div>
            <label style="font-size: 10px; opacity: 0.7;">ACTIVE SLOT 2</label>
            <select id="sel-active-2" style="width: 100%; background: #16120b; border: 1px solid #55442b; color: var(--fog); padding: 6px; font-family: monospace; font-size: 11px;">
              ${ACTIVE_LOADOUT_OPTIONS.map((opt) => `<option value="${opt.id}" ${this.activeSlot2 === opt.id ? 'selected' : ''}>${opt.name} (${opt.desc})</option>`).join('')}
            </select>
          </div>

          <div>
            <label style="font-size: 10px; opacity: 0.7;">PASSIVE PERK</label>
            <select id="sel-passive" style="width: 100%; background: #16120b; border: 1px solid #55442b; color: var(--fog); padding: 6px; font-family: monospace; font-size: 11px;">
              ${PASSIVE_LOADOUT_OPTIONS.map((opt) => `<option value="${opt.id}" ${this.passiveSlot === opt.id ? 'selected' : ''}>${opt.name} (${opt.desc})</option>`).join('')}
            </select>
          </div>

          <div style="font-size: 10px; opacity: 0.7; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
            ⚠️ Competitive & Ranked modes use fixed standard loadouts (Pebble Pouch + Steady Breath) for parity.
          </div>
        </div>

        <!-- Mutators & Assists -->
        <div style="background: rgba(0,0,0,0.4); border: 1px solid #3d2f18; padding: 14px; border-radius: 4px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: bold; color: var(--water, #86cfa0); font-size: 12px; letter-spacing: 0.1em;">ACTIVE MUTATORS MATRIX</span>
            <span style="font-size: 12px; font-weight: bold; color: #ffeb3b;">SCORE: x${compoundMultiplier}</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-height: 220px; overflow-y: auto;">
            ${Object.values(MUTATORS).map((m) => {
              const checked = this.selectedMutators.has(m.id);
              return `
                <label style="font-size: 10px; display: flex; align-items: center; gap: 6px; cursor: pointer; background: rgba(0,0,0,0.3); padding: 4px 6px; border: 1px solid ${checked ? 'var(--water)' : 'rgba(255,255,255,0.1)'}; border-radius: 3px;">
                  <input type="checkbox" class="cb-mutator" data-mut="${m.id}" ${checked ? 'checked' : ''}>
                  <span>${m.name} (+${Math.round((m.scoreMultiplier - 1) * 100)}%)</span>
                </label>
              `;
            }).join('')}
          </div>

          <!-- Assists -->
          <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
            <div style="font-size: 11px; color: #ffaa55; margin-bottom: 4px;">ASSISTS (Applies 0.8x score multiplier; disabled in Ranked)</div>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 10px;">
              <label style="display: flex; align-items: center; gap: 6px;">
                <input type="checkbox" class="cb-assist" data-assist="hearing" ${this.selectedAssists.has('hearing') ? 'checked' : ''}>
                Monster Hearing -25%
              </label>
              <label style="display: flex; align-items: center; gap: 6px;">
                <input type="checkbox" class="cb-assist" data-assist="coyote" ${this.selectedAssists.has('coyote') ? 'checked' : ''}>
                Coyote Jump Forgiveness (0.18s)
              </label>
              <label style="display: flex; align-items: center; gap: 6px;">
                <input type="checkbox" class="cb-assist" data-assist="wake" ${this.selectedAssists.has('wake') ? 'checked' : ''}>
                Always-visible Entity Wake
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderMissionsPanel(): string {
    const today = new Date();
    const dailyKey = getUtcDateKey(today);
    const weeklyKey = getUtcWeekKey(today);
    const dailyMissions: MissionContract[] = MissionEngine.generateContractsForDate(dailyKey, 'daily');
    const weeklyMissions: MissionContract[] = MissionEngine.generateContractsForDate(weeklyKey, 'weekly');

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Daily Contracts -->
        <div>
          <div style="font-weight: bold; color: var(--water, #86cfa0); font-size: 12px; margin-bottom: 8px; letter-spacing: 0.1em;">DAILY RECON CONTRACTS (REFRESHES 00:00 UTC)</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px;">
            ${dailyMissions.map((m) => `
              <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(134,207,160,0.25); padding: 10px; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                    <span style="font-weight: bold;">${m.title}</span>
                    <span style="text-transform: uppercase; font-size: 9px; color: var(--water);">${m.difficulty}</span>
                  </div>
                  <div style="font-size: 10px; opacity: 0.8; margin-bottom: 8px;">${m.description}</div>
                </div>
                <div>
                  <div style="font-size: 9px; opacity: 0.7; margin-bottom: 3px;">PROGRESS: ${m.currentCount} / ${m.targetCount}</div>
                  <div style="width: 100%; height: 6px; background: #221c12; border-radius: 2px; overflow: hidden; margin-bottom: 6px;">
                    <div style="width: ${Math.min(100, Math.round((m.currentCount / m.targetCount) * 100))}%; height: 100%; background: var(--water, #86cfa0);"></div>
                  </div>
                  <div style="font-size: 9px; color: #ffeb3b;">REWARD: +${m.rewardStatic} Static, +${m.rewardXP} XP</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Weekly Contracts -->
        <div>
          <div style="font-weight: bold; color: var(--water, #86cfa0); font-size: 12px; margin-bottom: 8px; letter-spacing: 0.1em;">WEEKLY LONG-HORIZON CONTRACTS</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px;">
            ${weeklyMissions.map((m) => `
              <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(217,211,162,0.25); padding: 10px; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                    <span style="font-weight: bold;">${m.title}</span>
                    <span style="text-transform: uppercase; font-size: 9px; color: #ffaa55;">WEEKLY</span>
                  </div>
                  <div style="font-size: 10px; opacity: 0.8; margin-bottom: 8px;">${m.description}</div>
                </div>
                <div>
                  <div style="font-size: 9px; opacity: 0.7; margin-bottom: 3px;">PROGRESS: ${m.currentCount} / ${m.targetCount}</div>
                  <div style="width: 100%; height: 6px; background: #221c12; border-radius: 2px; overflow: hidden; margin-bottom: 6px;">
                    <div style="width: ${Math.min(100, Math.round((m.currentCount / m.targetCount) * 100))}%; height: 100%; background: #d8b36a;"></div>
                  </div>
                  <div style="font-size: 9px; color: #ffeb3b;">REWARD: +${m.rewardStatic} Static, +${m.rewardXP} XP</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderProfilePanel(profile: PlayerProfileData): string {
    const unlockedAchs = new Set<string>(profile.unlockedAchievements);
    const levelInfo = calculateLevelFromXp(profile.xp);

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Career Summary Header -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; background: rgba(0,0,0,0.4); padding: 12px; border: 1px solid #3d2f18; border-radius: 4px;">
          <div>
            <div style="font-size: 10px; opacity: 0.7;">CAREER RUNS</div>
            <div style="font-size: 18px; font-weight: bold; color: var(--fog);">${profile.stats.totalEscapes} Escapes / ${profile.stats.totalDeaths} Fatalities</div>
            <div style="font-size: 9px; opacity: 0.6; margin-top: 2px;">XP: ${profile.xp} / ${levelInfo.nextLevelXp}</div>
          </div>
          <div>
            <div style="font-size: 10px; opacity: 0.7;">SILENCE RATING</div>
            <div style="font-size: 18px; font-weight: bold; color: var(--water);">${profile.silenceRating} SR [${RatingSystem.getTier(profile.silenceRating)}]</div>
            <div style="font-size: 9px; opacity: 0.6; margin-top: 2px;">Static Balance: ${profile.staticBalance}</div>
          </div>
          <div>
            <div style="font-size: 10px; opacity: 0.7;">CO-OP VICTORIES</div>
            <div style="font-size: 18px; font-weight: bold; color: #d8b36a;">${profile.stats.coopWins} Wins / ${profile.stats.lastOneDryWins} LOD Wins</div>
            <div style="font-size: 9px; opacity: 0.6; margin-top: 2px;">Haunt Decoys: ${profile.stats.successfulHaunts}</div>
          </div>
          <div>
            <div style="font-size: 10px; opacity: 0.7;">RECOVERY BACKUP</div>
            <button id="btn-export-code" class="analog-btn" style="width: auto; padding: 4px 10px; font-size: 10px; margin-top: 4px;">Export Recovery Code</button>
          </div>
        </div>

        <!-- Achievements Gallery (30 Badges) -->
        <div>
          <div style="font-weight: bold; color: var(--water, #86cfa0); font-size: 12px; margin-bottom: 8px; letter-spacing: 0.1em;">
            OPERATOR ACHIEVEMENTS (${unlockedAchs.size} / ${ACHIEVEMENTS.length} UNLOCKED)
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; max-height: 260px; overflow-y: auto;">
            ${ACHIEVEMENTS.map((ach) => {
              const unlocked = unlockedAchs.has(ach.id);
              return `
                <div style="padding: 8px; border: 1px solid ${unlocked ? 'rgba(134,207,160,0.4)' : '#261f14'}; background: ${unlocked ? 'rgba(0,0,0,0.5)' : 'rgba(12,9,6,0.5)'}; border-radius: 3px; display: flex; gap: 8px; align-items: center; opacity: ${unlocked ? 1.0 : 0.5};">
                  <div style="font-size: 20px;">${ach.icon}</div>
                  <div style="display: flex; flex-direction: column;">
                    <div style="font-size: 11px; font-weight: bold; color: ${unlocked ? 'var(--fog)' : '#776655'};">${ach.title}</div>
                    <div style="font-size: 9px; opacity: 0.75;">${ach.description}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Procedural Cosmetics -->
        <div>
          <div style="font-weight: bold; color: var(--water, #86cfa0); font-size: 12px; margin-bottom: 8px; letter-spacing: 0.1em;">COSMETICS WARDROBE (ZERO PAY-TO-WIN)</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">
            ${COSMETIC_CATALOG.slice(0, 6).map((c) => {
              const owned = profile.ownedCosmetics.includes(c.id);
              return `
                <div style="padding: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); border-radius: 3px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-size: 10px; font-weight: bold;">${c.name}</div>
                    <div style="font-size: 8px; opacity: 0.6; text-transform: uppercase;">${c.category}</div>
                  </div>
                  <span style="font-size: 9px; color: ${owned ? '#86cfa0' : '#ffeb3b'};">${owned ? 'OWNED' : `${c.costStatic} Static`}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.el) return;

    // Close button
    this.el.querySelector('#btn-metahub-close')?.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });

    // Tab buttons
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset['tab'] as MetaHubTab;
        if (tab) {
          this.currentTab = tab;
          this.render();
        }
      });
    });

    // Mutator checkboxes
    this.el.querySelectorAll<HTMLInputElement>('.cb-mutator').forEach((cb) => {
      cb.addEventListener('change', () => {
        const mut = cb.dataset['mut'];
        if (mut) {
          if (cb.checked) {
            this.selectedMutators.add(mut);
          } else {
            this.selectedMutators.delete(mut);
          }
          this.render();
        }
      });
    });

    // Assist checkboxes
    this.el.querySelectorAll<HTMLInputElement>('.cb-assist').forEach((cb) => {
      cb.addEventListener('change', () => {
        const assist = cb.dataset['assist'];
        if (assist) {
          if (cb.checked) {
            this.selectedAssists.add(assist);
          } else {
            this.selectedAssists.delete(assist);
          }
          this.render();
        }
      });
    });

    // Loadout selects
    const a1 = this.el.querySelector<HTMLSelectElement>('#sel-active-1');
    const a2 = this.el.querySelector<HTMLSelectElement>('#sel-active-2');
    const p = this.el.querySelector<HTMLSelectElement>('#sel-passive');
    if (a1) a1.addEventListener('change', () => { this.activeSlot1 = a1.value; });
    if (a2) a2.addEventListener('change', () => { this.activeSlot2 = a2.value; });
    if (p) p.addEventListener('change', () => { this.passiveSlot = p.value; });

    // Export code button
    this.el.querySelector('#btn-export-code')?.addEventListener('click', () => {
      const profile = ProfileStore.load();
      const code = ProfileStore.exportRecoveryCode(profile);
      void navigator.clipboard?.writeText(code).catch(() => {});
      alert(`Recovery Code copied to clipboard!\n\n${code}`);
    });
  }
}

/* ── ProfileScreen.ts ────────────────────────────────────────────────────
 *  Operator Dossier & Profile View:
 *  - Rank emblem & SR graph
 *  - XP / level ring
 *  - Lifetime stats tiles
 *  - 30 Achievements grid
 *  - Cosmetics wardrobe with 3D avatar preview
 *  - Cryptographic Recovery Code export / import modal
 *  - "Claim Name" registration
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Button,
  Modal,
  StatTile,
  AchievementCard,
  CosmeticTile,
  Toast,
  renderRankEmblem,
} from '../kit/index.js';
import { ProfileStore } from '../../meta/ProfilePersistence.js';
import { RatingSystem } from '../../meta/RatingElo.js';
import { calculateLevelFromXp } from '../../meta/Progression.js';
import { ACHIEVEMENTS } from '../../meta/Achievements.js';
import { COSMETIC_CATALOG } from '../../meta/Cosmetics.js';
import { IdentityManager } from '../../meta/Identity.js';

export interface ProfileCallbacks {
  onBack: () => void;
}

export class ProfileScreen {
  readonly element: HTMLElement;

  constructor(private callbacks: ProfileCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-profile';
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

    void this.render();
  }

  private async render(): Promise<void> {
    const profile = ProfileStore.load();
    const levelInfo = calculateLevelFromXp(profile.xp);
    const tier = RatingSystem.getTier(profile.silenceRating);
    const identity = await IdentityManager.getIdentity();

    let emblemName: 'whisper' | 'echo' | 'current' | 'depth' | 'phantom' = 'whisper';
    if (tier.includes('Echo')) emblemName = 'echo';
    else if (tier.includes('Current')) emblemName = 'current';
    else if (tier.includes('Depth')) emblemName = 'depth';
    else if (tier.includes('Phantom')) emblemName = 'phantom';

    this.element.innerHTML = `
      <div style="width: min(1000px, 95vw); display: flex; flex-direction: column; gap: 32px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              OPERATOR DOSSIER // SERVICE RECORD
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              CRYPTOGRAPHIC IDENTITY: ${identity.playerId}
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- Identity & Rank Card -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); border-radius: var(--bs-radius-md); padding: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px;">
          <div style="display: flex; gap: 20px; align-items: center;">
            <div>${renderRankEmblem(emblemName, 64)}</div>
            <div>
              <div style="display: flex; align-items: baseline; gap: 8px;">
                <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); color: var(--bs-cream); margin: 0;">
                  ${identity.name}<span style="opacity: 0.5;">#${identity.tag}</span>
                </h2>
                <button id="btn-claim-name" class="bs-btn bs-btn-ghost" style="padding: 2px 8px; min-height: 24px; font-size: 11px;">RENAME</button>
              </div>
              <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
                LEVEL ${levelInfo.level} // TIER: ${tier} (${profile.silenceRating} SR)
              </div>
              <!-- XP progress -->
              <div style="width: 220px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-top: 8px; overflow: hidden;">
                <div style="width: ${Math.round(levelInfo.progressPercent)}%; height: 100%; background: var(--bs-water);"></div>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <button id="btn-export-recovery" class="bs-btn bs-btn-primary">EXPORT RECOVERY CODE</button>
            <button id="btn-import-recovery" class="bs-btn bs-btn-ghost">IMPORT IDENTITY</button>
          </div>
        </div>

        <!-- Lifetime Stats -->
        <div>
          <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-tan); margin-bottom: 12px;">
            LIFETIME FIELD TELEMETRY
          </h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div id="stat-runs"></div>
            <div id="stat-escapes"></div>
            <div id="stat-noise"></div>
            <div id="stat-static"></div>
          </div>
        </div>

        <!-- Cosmetics Wardrobe -->
        <div>
          <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-tan); margin-bottom: 12px;">
            WARDROBE & CUSTOMIZATION
          </h3>
          <div id="wardrobe-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px;"></div>
        </div>

        <!-- Achievements Grid -->
        <div>
          <h3 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-tan); margin-bottom: 12px;">
            SERVICE AWARDS // ACHIEVEMENTS (${profile.unlockedAchievements.length} / ${ACHIEVEMENTS.length})
          </h3>
          <div id="achievements-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;"></div>
        </div>
      </div>
    `;

    const backBtn = new Button({
      text: '← RETURN',
      variant: 'ghost',
      onClick: () => this.callbacks.onBack(),
    });
    this.element.querySelector('#btn-back-wrap')?.appendChild(backBtn.element);

    // Mount Stats
    this.element.querySelector('#stat-runs')?.appendChild(new StatTile({ title: 'EXPEDITIONS', value: profile.stats.totalEscapes + profile.stats.totalDeaths }).element);
    this.element.querySelector('#stat-escapes')?.appendChild(new StatTile({ title: 'SUCCESSFUL EXITS', value: profile.stats.totalEscapes }).element);
    this.element.querySelector('#stat-noise')?.appendChild(new StatTile({ title: 'TOTAL NOISE UNITS', value: `${profile.stats.totalNoiseUnits.toFixed(1)} dB` }).element);
    this.element.querySelector('#stat-static')?.appendChild(new StatTile({ title: 'STATIC ENERGY', value: profile.staticBalance }).element);

    // Mount Wardrobe
    const wardrobeGrid = this.element.querySelector('#wardrobe-grid')!;
    COSMETIC_CATALOG.slice(0, 6).forEach((cos) => {
      const tile = new CosmeticTile({
        id: cos.id,
        name: cos.name,
        category: cos.category,
        rarity: cos.costStatic > 500 ? 'anomalous' : cos.costStatic > 0 ? 'rare' : 'common',
        isEquipped: profile.equippedCosmetics.flashlightSkin === cos.id || profile.equippedCosmetics.jacketColor === cos.id,
        onSelect: (id) => {
          if (cos.category === 'flashlight') {
            profile.equippedCosmetics.flashlightSkin = id;
          } else if (cos.category === 'jacket') {
            profile.equippedCosmetics.jacketColor = id;
          }
          ProfileStore.save(profile);
          Toast.show(`Equipped: ${cos.name}`, 'success');
          void this.render();
        },
      });
      wardrobeGrid.appendChild(tile.element);
    });

    // Mount Achievements
    const achGrid = this.element.querySelector('#achievements-grid')!;
    ACHIEVEMENTS.forEach((ach) => {
      const isUnlocked = profile.unlockedAchievements.includes(ach.id);
      const card = new AchievementCard({
        id: ach.id,
        title: ach.title,
        description: ach.description,
        unlocked: isUnlocked,
      });
      achGrid.appendChild(card.element);
    });

    // Recovery Export / Import Handlers
    this.element.querySelector('#btn-export-recovery')?.addEventListener('click', () => {
      void (async () => {
        const passphrase = prompt('Enter a passphrase to encrypt your recovery code:') || 'backsilence';
        try {
          const code = await IdentityManager.exportRecoveryCode(passphrase);
          const modal = new Modal({
            title: 'SECURE RECOVERY CODE',
            content: `
              <p style="font-size: 13px; opacity: 0.8; line-height: 1.5; margin-bottom: 12px;">
                Copy this wrapped identity code. You will need both this code and your passphrase to restore your account on another device.
              </p>
              <textarea readonly style="width: 100%; height: 90px; background: #080705; border: 1px solid var(--bs-border); color: var(--bs-water); font-family: monospace; font-size: 11px; padding: 8px; border-radius: 2px;">${code}</textarea>
              <button id="btn-copy-code" class="bs-btn bs-btn-primary" style="margin-top: 12px;">COPY CODE</button>
            `,
          });
          modal.open();
          const copyBtn = modal.panel.querySelector<HTMLButtonElement>('#btn-copy-code');
          copyBtn?.addEventListener('click', () => {
            void (async () => {
              try {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(code);
                  copyBtn.textContent = 'COPIED TO CLIPBOARD';
                } else {
                  Toast.show('Clipboard not supported in this browser.', 'warning');
                }
              } catch {
                Toast.show('Could not copy code', 'warning');
              }
            })();
          });
        } catch {
          Toast.show('Failed to export recovery code', 'danger');
        }
      })();
    });

    this.element.querySelector('#btn-import-recovery')?.addEventListener('click', () => {
      const modal = new Modal({
        title: 'IMPORT OPERATOR IDENTITY',
        content: `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <p style="font-size: 13px; opacity: 0.8; margin: 0;">Paste your encrypted recovery code and enter your passphrase:</p>
            <textarea id="import-code-val" placeholder="Recovery Code..." style="width: 100%; height: 80px; background: #080705; border: 1px solid var(--bs-border); color: var(--bs-cream); font-family: monospace; font-size: 11px; padding: 8px;"></textarea>
            <input type="password" id="import-pass-val" placeholder="Passphrase" style="padding: 8px; background: #080705; border: 1px solid var(--bs-border); color: var(--bs-cream);" />
            <button id="btn-do-import" class="bs-btn bs-btn-primary">RESTORE IDENTITY</button>
          </div>
        `,
      });
      modal.open();

      modal.panel.querySelector('#btn-do-import')?.addEventListener('click', () => {
        void (async () => {
          const code = (modal.panel.querySelector('#import-code-val') as HTMLTextAreaElement).value.trim();
          const pass = (modal.panel.querySelector('#import-pass-val') as HTMLInputElement).value;
          if (!code || !pass) return;

          try {
            await IdentityManager.importRecoveryCode(code, pass);
            Toast.show('Identity restored successfully!', 'success');
            modal.close();
            void this.render();
          } catch {
            Toast.show('Invalid recovery code or wrong passphrase.', 'danger');
          }
        })();
      });
    });

    // Rename Handler
    this.element.querySelector('#btn-claim-name')?.addEventListener('click', () => {
      void (async () => {
        const newName = prompt('Enter new operator name (3–16 letters):', identity.name);
        if (newName && newName.trim().length >= 3) {
          try {
            await IdentityManager.rename(newName.trim());
            Toast.show(`Name updated to ${newName.trim()}!`, 'success');
            void this.render();
          } catch {
            Toast.show('Could not update name on remote registry.', 'warning');
          }
        }
      })();
    });
  }
}

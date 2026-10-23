/* ── ChangelogScreen.ts ──────────────────────────────────────────────────
 *  Release & Batch History View:
 *  Detailed log of engineering milestones from Batch 1 through Batch 8.
 * ──────────────────────────────────────────────────────────────────────── */

import { Button } from '../kit/index.js';

export interface ChangelogCallbacks {
  onBack: () => void;
}

export class ChangelogScreen {
  readonly element: HTMLElement;

  constructor(private callbacks: ChangelogCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-changelog';
    this.element.className = 'bs-root';
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
      <div style="width: min(840px, 95vw); display: flex; flex-direction: column; gap: 24px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              DEVELOPMENT CHANGELOG
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              ENGINEERING LOG // BATCHES 1 TO 8
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px;">
          <!-- Batch 8 -->
          <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); border-left: 3px solid var(--bs-water); padding: 18px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-size: var(--bs-text-sm); font-weight: bold; color: var(--bs-cream);">BATCH 8: WEBSITE ART DIRECTION & ONLINE PLATFORM</span>
              <span class="bs-osd-readout">v1.0.0-RC</span>
            </div>
            <div>• "The Archive" VHS found-footage design system and 36 inline-SVG icon set</div>
            <div>• 12 weighted analog motion signatures with WCAG AAA high contrast & photosensitive safety</div>
            <div>• Turso serverless API proxy architecture with allowlisted parameterized SQL</div>
            <div>• WebCrypto ECDSA P-256 client identities with PBKDF2/AES-GCM recovery codes</div>
            <div>• Hall of Silence leaderboards, weekly/season champions, and headless replay verification worker</div>
          </div>

          <!-- Batch 7 -->
          <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 18px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
            <div style="font-weight: bold; color: var(--bs-cream); margin-bottom: 4px;">BATCH 7: GAME DESIGN & METAGAME LAYER</div>
            <div>• 11-tape campaign progression with star gates and remix mutators</div>
            <div>• Field contracts, daily/weekly missions, and Elo/Silence Rating system</div>
            <div>• 30 achievements, 24 cosmetics catalog, and pre-run loadout assists</div>
          </div>

          <!-- Batch 6 -->
          <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 18px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
            <div style="font-weight: bold; color: var(--bs-cream); margin-bottom: 4px;">BATCH 6: PROCEDURAL WATER & CREATURE INTEGRATION</div>
            <div>• Interactive shallow water simulation with caustic shaders & ripples</div>
            <div>• Lethal Company Thumper rig and Ghost-Skull flyer flocking director</div>
          </div>

          <!-- Batches 1-5 -->
          <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 18px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
            <div style="font-weight: bold; color: var(--bs-cream); margin-bottom: 4px;">BATCHES 1–5: CORE ENGINE & MULTIPLAYER</div>
            <div>• 10 procedural tile maps with deterministic seeds & reachability guarantees</div>
            <div>• WebRTC mesh peer-to-peer data channel netcode & signaling adapters</div>
            <div>• Procedural Web Audio API sound generator and spatial acoustic engine</div>
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
  }
}

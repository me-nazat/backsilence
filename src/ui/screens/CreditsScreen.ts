/* ── CreditsScreen.ts ────────────────────────────────────────────────────
 *  Credits & Attributions View:
 *  Exact CC BY licenses, model authors, audio design, and engineering team.
 * ──────────────────────────────────────────────────────────────────────── */

import { Button } from '../kit/index.js';

export interface CreditsCallbacks {
  onBack: () => void;
}

export class CreditsScreen {
  readonly element: HTMLElement;

  constructor(private callbacks: CreditsCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-credits';
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
      <div style="width: min(840px, 95vw); display: flex; flex-direction: column; gap: 24px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              ARCHIVE ATTRIBUTIONS // CREDITS
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              CREATIVE COMMONS LICENSES & AUTHORSHIP
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- 3D Models Attribution (CC BY 4.0) -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 20px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
          <h2 style="font-size: var(--bs-text-md); color: var(--bs-water); margin: 0 0 12px 0;">3D CREATURE ASSETS (CC BY 4.0)</h2>
          
          <div style="margin-bottom: 16px;">
            <div style="font-weight: bold; color: var(--bs-cream);">"Lethal Company Thumper Rig" by NO DONT EAT ME CASEOH (Ferris wheel) (@NO.DONT.EAT.ME.CASEOH), CC BY 4.0, https://sketchfab.com/3d-models/lethal-company-thumper-rig-a6bbf5cd0d284e1abcdff82f816b62b3.</div>
            <div style="opacity: 0.85;">"Thumper is a creature from Lethal Company; this model is a fan recreation. Modified: scaled, re-skinned, animated."</div>
          </div>

          <div>
            <div style="font-weight: bold; color: var(--bs-cream);">"Hoefnagel creature" by silicat, CC BY 4.0, https://sketchfab.com/3d-models/hoefnagel-creature-9a92596a121f412299dfbc61b1bb01aa.</div>
            <div style="opacity: 0.85;">"Based on Georg Hoefnagel's painting 'Dolor. Allégorie de l'Hiver'. Modified: decimated, recolored, animated."</div>
          </div>
        </div>

        <!-- Audio Engineering -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 20px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
          <h2 style="font-size: var(--bs-text-md); color: var(--bs-tan); margin: 0 0 12px 0;">ACOUSTIC & SYNTHESIS SYSTEM</h2>
          <div style="opacity: 0.85;">
            100% Procedural Web Audio API sound design. Zero recorded mp3/wav audio files.
            Includes real-time Karplus-Strong string synthesis, pink-noise hydraulic splash convolutions,
            biquad reverberation delays, HRTF spatialization, and tape wow/flutter VHS filter emulation.
          </div>
        </div>

        <!-- Technology & Core Architecture -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 20px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
          <h2 style="font-size: var(--bs-text-md); color: var(--bs-cream); margin: 0 0 12px 0;">CORE ENGINE</h2>
          <div style="opacity: 0.85;">
            • Three.js (r172) WebGL 2.0 rendering<br>
            • WebCrypto ECDSA P-256 for non-extractable client identity<br>
            • WebRTC peer-to-peer data channels for multiplayer netcode<br>
            • Turso / libSQL serverless proxy backend with allowlisted parameterized SQL<br>
            • Deterministic simulation loop at 15 Hz with replay validation
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

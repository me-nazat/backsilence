/* ── AboutPrivacyScreen.ts ────────────────────────────────────────────────
 *  About & Privacy Transparency Dossier:
 *  - Honest casual-trust security posture
 *  - Explanation of non-extractable WebCrypto ECDSA identity
 *  - What data is stored locally vs sent to /api/*
 *  - Anonymous opt-in telemetry toggle & payload inspector
 * ──────────────────────────────────────────────────────────────────────── */

import { Button, Toggle } from '../kit/index.js';

export interface AboutPrivacyCallbacks {
  onBack: () => void;
}

export class AboutPrivacyScreen {
  readonly element: HTMLElement;
  private isTelemetryOptIn = false;

  constructor(private callbacks: AboutPrivacyCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-about-privacy';
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
              PRIVACY & SECURITY POSTURE
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              TRANSPARENCY DECLARATION // ZERO THIRD-PARTY TRACKERS
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- Casual-Trust Architecture -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 20px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
          <h2 style="font-size: var(--bs-text-md); color: var(--bs-water); margin: 0 0 10px 0;">CASUAL-TRUST ARCHITECTURE</h2>
          <p style="margin: 0 0 10px 0;">
            BackSilence operates on a <strong>casual-trust model</strong>. Every operator is identified by a client-side WebCrypto ECDSA P-256 keypair generated directly in your browser and stored in IndexedDB. Private keys are non-extractable and never transmit across the network.
          </p>
          <p style="margin: 0;">
            Requests to the serverless proxy (<code>/api/*</code>) are signed with cryptographic timestamped nonces to prevent spoofing and replay attacks. The headless validation worker re-simulates physics replays to verify legitimate runs before granting verified badges.
          </p>
        </div>

        <!-- Local vs Remote Data -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 20px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
          <h2 style="font-size: var(--bs-text-md); color: var(--bs-tan); margin: 0 0 10px 0;">DATA STORAGE AUDIT</h2>
          <ul style="padding-left: 20px; margin: 0; display: flex; flex-direction: column; gap: 6px;">
            <li><strong>Stored Locally (IndexedDB / localStorage):</strong> Private cryptographic key, display name, local offline run queue, unlocked cosmetics, achievements, audio/graphics settings.</li>
            <li><strong>Transmitted Online:</strong> Public key JWK (for registration), signed run scores + compressed simulation replay, room signaling offers/answers.</li>
            <li><strong>Never Collected:</strong> Passwords, email addresses, payment information, or device fingerprints. No third-party analytics (Google, Meta, etc.) are present.</li>
          </ul>
        </div>

        <!-- Opt-in Telemetry -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); padding: 20px; border-radius: var(--bs-radius-sm);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div>
              <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-sm); font-weight: bold; color: var(--bs-cream);">
                ANONYMOUS TELEMETRY (OFF BY DEFAULT)
              </div>
              <div style="font-family: var(--bs-font-mono); font-size: 11px; opacity: 0.7; color: var(--bs-tan);">
                Send non-identifying game metrics (death causes, time to first splash) to improve balance.
              </div>
            </div>
            <div id="telemetry-toggle-wrap"></div>
          </div>

          <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-water); background: #080705; border: 1px solid var(--bs-border-subtle); padding: 10px; border-radius: 2px;">
            SAMPLE TELEMETRY PAYLOAD: { mapId: "natatorium", deathCause: "monster_ambush", noiseLevelDb: 42.5, timeElapsedMs: 82000 }
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

    const toggle = new Toggle({
      label: '',
      checked: this.isTelemetryOptIn,
      onChange: (checked) => {
        this.isTelemetryOptIn = checked;
      },
    });
    this.element.querySelector('#telemetry-toggle-wrap')?.appendChild(toggle.element);
  }
}

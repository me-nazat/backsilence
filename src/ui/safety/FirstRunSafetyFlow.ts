/* ── FirstRunSafetyFlow.ts ──────────────────────────────────────────────────
 *  First-Run Safety Flow:
 *  - Photosensitivity notice (<=3 Hz flicker clamp, safe mode toggle)
 *  - Headphones requirement notice (binaural acoustic tracking)
 *  - Content advisory (psychological survival horror themes, no gore)
 *  - Name claim / Operator call-sign input
 *  - Quality tier auto-detection
 *  - Orientation tape offer
 *  - Can be reopened anytime from Settings
 * ──────────────────────────────────────────────────────────────────────── */

import { Button } from '../kit/Button.js';
import { Toggle } from '../kit/Toggle.js';
import { MotionEngine } from '../motion/Motion.js';

export interface SafetyFlowResult {
  handle: string;
  runOrientation: boolean;
  photosensitiveSafe: boolean;
  qualityTier: 'low' | 'medium' | 'high';
}

const STORAGE_KEY = 'bs_safety_acknowledged';

export const FirstRunSafetyFlow = {
  isNeeded(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === null;
  },

  acknowledge(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  },

  reset(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  /**
   * Auto-detects quality tier from available device hardware hints.
   */
  detectQuality(): 'low' | 'medium' | 'high' {
    if (typeof navigator === 'undefined') return 'medium';

    const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;

    if (memory <= 2 || cores <= 2) return 'low';
    if (memory >= 8 && cores >= 8) return 'high';
    return 'medium';
  },

  /**
   * Mounts the full first-run safety flow into the container.
   */
  start(
    container: HTMLElement,
    onComplete: (result: SafetyFlowResult) => void,
  ): HTMLElement {
    const root = document.createElement('div');
    root.id = 'bs-safety-flow-root';
    root.className = 'bs-screen bs-modal-backdrop';
    root.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(13, 11, 6, 0.95);
      display: flex; align-items: center; justify-content: center;
      padding: 24px; overflow-y: auto;
    `;

    const card = document.createElement('div');
    card.className = 'bs-card';
    card.style.cssText = `
      background: var(--bs-surface1, #14120c);
      border: 1px solid var(--bs-border-strong, #5b4526);
      border-radius: 4px;
      max-width: 540px; width: 100%;
      padding: 32px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.85);
    `;
    root.appendChild(card);

    let isSafe = false;
    const detectedQuality = FirstRunSafetyFlow.detectQuality();

    // ── STEP 1: SAFETY ADVISORIES ──
    const renderStep1 = () => {
      card.innerHTML = `
        <div style="border-bottom: 1px solid var(--bs-border, #5b4526); padding-bottom: 12px; margin-bottom: 20px;">
          <div class="bs-osd-readout" style="font-size: 11px; margin-bottom: 4px;">ARCHIVE ACCESS // PROTOCOL 01</div>
          <h2 style="font-family: var(--bs-font-mono, monospace); font-size: 20px; color: var(--bs-cream, #e9dca8); letter-spacing: 0.08em; text-transform: uppercase;">
            SAFETY & ACOUSTIC ADVISORY
          </h2>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; font-size: 13px; line-height: 1.6; color: var(--bs-fog, #d9d3a2);">
          <div style="border-left: 3px solid var(--bs-danger, #b3261e); padding-left: 12px;">
            <strong style="color: var(--bs-cream, #e9dca8);">1. PHOTOSENSITIVITY NOTICE</strong><br>
            BackSilence contains dynamic water caustic reflections and CRT tracking distortions. Photosensitive safe mode eliminates rapid flicker (clamped to &le; 3 Hz) and limits luminance transitions.
          </div>

          <div style="border-left: 3px solid var(--bs-water, #86cfa0); padding-left: 12px;">
            <strong style="color: var(--bs-cream, #e9dca8);">2. HEADPHONES REQUIRED</strong><br>
            The subterranean entity is completely blind and relies entirely on water acoustics. Binaural stereo audio is essential to pinpoint threats and survive.
          </div>

          <div style="border-left: 3px solid var(--bs-tan, #d8b36a); padding-left: 12px;">
            <strong style="color: var(--bs-cream, #e9dca8);">3. CONTENT ADVISORY</strong><br>
            Atmospheric psychological survival horror, drowned municipal architecture, isolation, and sensory dread. No gore or human violence.
          </div>
        </div>

        <div id="safety-safe-toggle" style="margin-bottom: 24px;"></div>
        <div id="safety-step1-action" style="display: flex; justify-content: flex-end;"></div>
      `;

      // Safe mode toggle
      const toggle = new Toggle({
        label: 'ENABLE PHOTOSENSITIVE SAFE MODE',
        checked: isSafe,
        onChange: (checked) => {
          isSafe = checked;
          MotionEngine.getInstance().setPhotosensitiveSafe(checked);
        },
      });
      card.querySelector('#safety-safe-toggle')?.appendChild(toggle.element);

      // Proceed button
      const proceedBtn = new Button({
        text: 'PROCEED [SPACE]',
        variant: 'primary',
        onClick: () => renderStep2(),
      });
      card.querySelector('#safety-step1-action')?.appendChild(proceedBtn.element);
      proceedBtn.element.focus();
    };

    // ── STEP 2: OPERATOR IDENTITY & CALIBRATION ──
    const renderStep2 = () => {
      card.innerHTML = `
        <div style="border-bottom: 1px solid var(--bs-border, #5b4526); padding-bottom: 12px; margin-bottom: 20px;">
          <div class="bs-osd-readout" style="font-size: 11px; margin-bottom: 4px;">ARCHIVE ACCESS // PROTOCOL 02</div>
          <h2 style="font-family: var(--bs-font-mono, monospace); font-size: 20px; color: var(--bs-cream, #e9dca8); letter-spacing: 0.08em; text-transform: uppercase;">
            OPERATOR INITIALIZATION
          </h2>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-family: var(--bs-font-mono, monospace); font-size: 11px; color: var(--bs-tan, #d8b36a); margin-bottom: 6px; letter-spacing: 0.1em;">
            OPERATOR CALL-SIGN (3-16 CHARACTERS):
          </label>
          <input id="safety-handle-input" type="text" maxlength="16" value="OPERATOR" style="
            width: 100%;
            background: var(--bs-ink, #0d0b06);
            border: 1px solid var(--bs-border, #5b4526);
            color: var(--bs-cream, #e9dca8);
            font-family: var(--bs-font-mono, monospace);
            font-size: 14px;
            padding: 8px 12px;
            border-radius: 2px;
            outline: none;
          ">
        </div>

        <div style="margin-bottom: 24px; font-size: 12px; color: var(--bs-fog, #d9d3a2); background: rgba(0,0,0,0.3); padding: 12px; border: 1px solid var(--bs-border, #5b4526);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>HARDWARE BENCHMARK:</span>
            <strong style="color: var(--bs-water, #86cfa0); text-transform: uppercase;">${detectedQuality} TIER</strong>
          </div>
          <p style="opacity: 0.8; font-size: 11px; margin: 0;">
            Calibrated 60 FPS target with volumetric water reflections and spatial audio reverb.
          </p>
        </div>

        <div style="border: 1px solid var(--bs-border, #5b4526); padding: 16px; margin-bottom: 24px; border-radius: 2px; background: rgba(134,207,160,0.04);">
          <strong style="color: var(--bs-water, #86cfa0); font-family: var(--bs-font-mono, monospace); font-size: 12px; letter-spacing: 0.08em; display: block; margin-bottom: 4px;">
            RECOMMENDED: ORIENTATION TAPE
          </strong>
          <p style="font-size: 12px; color: var(--bs-fog, #d9d3a2); margin-bottom: 12px; line-height: 1.5;">
            A 90-second non-lethal acoustic calibration course in Sector 0. Learn how footsteps, wading, and splashes echo before descending into the drowned complex.
          </p>
          <div id="safety-step2-actions" style="display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap;"></div>
        </div>
      `;

      const input = card.querySelector('#safety-handle-input') as HTMLInputElement;
      input?.focus();

      const actions = card.querySelector('#safety-step2-actions')!;

      // Skip button
      const skipBtn = new Button({
        text: 'SKIP TO ARCHIVE',
        variant: 'ghost',
        onClick: () => {
          FirstRunSafetyFlow.acknowledge();
          root.remove();
          onComplete({
            handle: input?.value?.trim() || 'OPERATOR',
            runOrientation: false,
            photosensitiveSafe: isSafe,
            qualityTier: detectedQuality,
          });
        },
      });
      actions.appendChild(skipBtn.element);

      // Orientation button
      const orientationBtn = new Button({
        text: 'RUN ORIENTATION TAPE',
        variant: 'primary',
        onClick: () => {
          FirstRunSafetyFlow.acknowledge();
          root.remove();
          onComplete({
            handle: input?.value?.trim() || 'OPERATOR',
            runOrientation: true,
            photosensitiveSafe: isSafe,
            qualityTier: detectedQuality,
          });
        },
      });
      actions.appendChild(orientationBtn.element);
    };

    renderStep1();
    container.appendChild(root);
    return root;
  },

  /**
   * Reopenable safety notice modal for Settings panel review.
   */
  showNoticeModal(container: HTMLElement = document.body): HTMLElement {
    const root = document.createElement('div');
    root.className = 'bs-screen bs-modal-backdrop';
    root.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(13, 11, 6, 0.95);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    `;

    const card = document.createElement('div');
    card.className = 'bs-card';
    card.style.cssText = `
      background: var(--bs-surface1, #14120c);
      border: 1px solid var(--bs-border-strong, #5b4526);
      border-radius: 4px;
      max-width: 500px; width: 100%;
      padding: 28px;
    `;
    root.appendChild(card);

    card.innerHTML = `
      <div style="border-bottom: 1px solid var(--bs-border, #5b4526); padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="font-family: var(--bs-font-mono, monospace); font-size: 16px; color: var(--bs-cream, #e9dca8); letter-spacing: 0.08em; text-transform: uppercase;">
          HEALTH, SAFETY & ACOUSTIC PROTOCOLS
        </h3>
      </div>
      <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; font-size: 12px; line-height: 1.6; color: var(--bs-fog, #d9d3a2);">
        <p><strong>Photosensitivity:</strong> Visual safe mode clamps flicker rates to &le; 3 Hz and clamps luminance delta to 0.25 per frame.</p>
        <p><strong>Acoustics:</strong> Binaural headphones recommended for accurate horizontal & vertical directional audio.</p>
        <p><strong>Content:</strong> Psychological survival horror themes, deep flooded chambers. Zero gore.</p>
      </div>
      <div id="safety-modal-close" style="display: flex; justify-content: flex-end;"></div>
    `;

    const closeBtn = new Button({
      text: 'ACKNOWLEDGE',
      variant: 'primary',
      onClick: () => root.remove(),
    });
    card.querySelector('#safety-modal-close')?.appendChild(closeBtn.element);

    container.appendChild(root);
    closeBtn.element.focus();
    return root;
  },
};

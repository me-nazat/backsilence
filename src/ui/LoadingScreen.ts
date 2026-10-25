/* ── LoadingScreen.ts ──────────────────────────────────────────────────────
 *  Phase C: Analog horror map loading screen:
 *  - Map title, tagline, difficulty indicator
 *  - Procedural 2D layout mini-map drawn live on HTML5 canvas
 *  - Cooperative progress bar driven by the scheduler / texture warm-up
 *  - Rotating atmospheric survival tips
 *  - Honest progress: after 8s shows "Still working..." with Cancel button
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapDefinition, LayoutData } from '../world/MapTypes.js';

const SURVIVAL_TIPS: string[] = [
  'Crouching in deep water suppresses ripples and splashing.',
  'Throwing pebbles creates sonic decoys that lure the blind beast.',
  'Sprinting on metal catwalks creates loud metallic clangs.',
  'Steam burst zones mask your sounds from nearby entities.',
  'Marble stepping stones cannot hold your weight indefinitely.',
  'Disturbed bioluminescent water glows in cyan waves for several seconds.',
  'The beast cannot see you. It only hears what you do.',
  'Cranking your flashlight produces mechanical noise. Choose darkness or stealth.',
  'High water flips change navigability. Seek high ground before the surge.',
];

export interface LoadingScreenCallbacks {
  onCancel?: () => void;
}

export class LoadingScreen {
  private el: HTMLElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private titleEl: HTMLElement | null = null;
  private taglineEl: HTMLElement | null = null;
  private tipEl: HTMLElement | null = null;
  private barEl: HTMLElement | null = null;
  private timeoutPromptEl: HTMLElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private tipInterval: ReturnType<typeof setInterval> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private callbacks?: LoadingScreenCallbacks) {}

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'loading-screen';
    el.className = 'bs-screen';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: #080603;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 300;
      padding: 24px;
      box-sizing: border-box;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
      user-select: none;
    `;

    el.innerHTML = `
      <div style="width: min(520px, 90vw); display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center;">
        <!-- Header -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 11px; letter-spacing: 0.25em; color: var(--danger, #b3261e); font-weight: bold;">
            INITIALIZING EXPEDITION
          </div>
          <h2 id="loading-map-title" style="font-size: clamp(1.4rem, 4vw, 2.0rem); color: var(--water, #86cfa0); margin: 0; letter-spacing: 0.05em;">
            THE FLOODED POOLROOMS
          </h2>
          <div id="loading-map-tagline" style="font-size: 12px; opacity: 0.75; font-style: italic;">
            Infinite warm water and damp ceramic tiles.
          </div>
        </div>

        <!-- Mini-Layout Preview Canvas -->
        <div style="
          position: relative;
          width: 280px;
          height: 180px;
          border: 1px solid rgba(134,207,160,0.3);
          background: #0d0b06;
          box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
          overflow: hidden;
        ">
          <canvas id="loading-preview-canvas" width="280" height="180" style="display: block; width: 100%; height: 100%;"></canvas>
          <div style="
            position: absolute;
            inset: 0;
            background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%);
            background-size: 100% 4px;
            pointer-events: none;
          "></div>
        </div>

        <!-- Progress Bar -->
        <div style="width: 100%; display: flex; flex-direction: column; gap: 6px;">
          <div style="width: 100%; height: 6px; background: rgba(217,211,162,0.15); border-radius: 3px; overflow: hidden;">
            <div id="loading-progress-bar" style="width: 10%; height: 100%; background: var(--water, #86cfa0); transition: width 0.15s ease-out;"></div>
          </div>
          <div id="loading-tip" style="font-size: 11px; opacity: 0.65; min-height: 28px; line-height: 1.4;">
            "Crouching in deep water suppresses ripples and splashing."
          </div>
        </div>

        <!-- 8s Timeout / Honest Progress Prompt -->
        <div id="loading-timeout-prompt" style="display: none; flex-direction: column; align-items: center; gap: 10px; margin-top: 6px;">
          <span style="font-size: 11px; color: var(--danger, #ff8a80); opacity: 0.9;">Still working... shader warmup or asset processing delayed.</span>
          <button id="btn-loading-cancel" class="analog-btn danger" style="padding: 6px 14px; font-size: 11px;">
            CANCEL TO MENU
          </button>
        </div>
      </div>
    `;

    container.appendChild(el);
    this.el = el;
    this.canvasEl = el.querySelector('#loading-preview-canvas');
    this.titleEl = el.querySelector('#loading-map-title');
    this.taglineEl = el.querySelector('#loading-map-tagline');
    this.tipEl = el.querySelector('#loading-tip');
    this.barEl = el.querySelector('#loading-progress-bar');
    this.timeoutPromptEl = el.querySelector('#loading-timeout-prompt');
    this.cancelBtn = el.querySelector('#btn-loading-cancel');

    this.cancelBtn?.addEventListener('click', () => {
      this.hide();
      if (this.callbacks?.onCancel) {
        this.callbacks.onCancel();
      }
    });
  }

  show(def: MapDefinition, layout: LayoutData): void {
    if (!this.el) return;
    this.el.style.display = 'flex';

    if (this.titleEl) this.titleEl.textContent = def.name.toUpperCase();
    if (this.taglineEl) this.taglineEl.textContent = def.tagline;

    if (this.canvasEl) {
      const ctx = this.canvasEl.getContext('2d');
      if (ctx) {
        def.drawThumbnail(ctx, layout, 280, 180);
      }
    }

    if (this.timeoutPromptEl) {
      this.timeoutPromptEl.style.display = 'none';
    }

    this.setProgress(10);
    this.cycleTip();

    if (this.tipInterval) clearInterval(this.tipInterval);
    this.tipInterval = setInterval(() => this.cycleTip(), 3500);

    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = setTimeout(() => {
      if (this.timeoutPromptEl) {
        this.timeoutPromptEl.style.display = 'flex';
      }
    }, 8000);
  }

  setProgress(pct: number): void {
    if (this.barEl) {
      this.barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }
  }

  hide(): void {
    if (this.tipInterval) {
      clearInterval(this.tipInterval);
      this.tipInterval = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.timeoutPromptEl) {
      this.timeoutPromptEl.style.display = 'none';
    }
    if (this.el) {
      this.el.style.display = 'none';
    }
  }

  private cycleTip(): void {
    if (!this.tipEl) return;
    const randomTip = SURVIVAL_TIPS[Math.floor(Math.random() * SURVIVAL_TIPS.length)] ?? '';
    this.tipEl.textContent = `"${randomTip}"`;
  }

  dispose(): void {
    this.hide();
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

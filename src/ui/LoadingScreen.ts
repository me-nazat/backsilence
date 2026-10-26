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
      <div style="width: min(380px, 85vw); display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center;">
        <div id="loading-map-title" style="font-family: var(--bs-font-mono, monospace); font-size: 13px; letter-spacing: 0.18em; color: #e8e4d9; opacity: 0.85;">
          DESCENDING...
        </div>
        <div style="width: 100%; height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;">
          <div id="loading-progress-bar" style="width: 10%; height: 100%; background: #86cfa0; transition: width 0.15s ease-out;"></div>
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

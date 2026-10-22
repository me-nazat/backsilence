/* ── AudioUnlock.ts ────────────────────────────────────────────────────────
 *  Atmospheric user gesture unlock overlay: "PRESS ANY KEY — HEADPHONES RECOMMENDED".
 *  Initializes and resumes AudioContext and fades in menu ambience on first interaction.
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';

export class AudioUnlock {
  private overlay: HTMLElement | null = null;
  private onUnlocked?: () => void;

  constructor(onUnlocked?: () => void) {
    if (onUnlocked) {
      this.onUnlocked = onUnlocked;
    }
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'audio-unlock-overlay';
    el.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(13, 11, 6, 0.88);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      cursor: pointer;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
      letter-spacing: 0.15em;
      text-align: center;
      user-select: none;
      transition: opacity 0.8s ease-out;
    `;

    el.innerHTML = `
      <div style="font-size: clamp(1.1rem, 3vw, 1.8rem); margin-bottom: 12px; color: var(--water, #86cfa0); text-shadow: 0 0 15px rgba(134,207,160,0.4); animation: pulse 2s infinite ease-in-out;">
        [ PRESS ANY KEY OR CLICK ]
      </div>
      <div style="font-size: clamp(0.75rem, 1.8vw, 1.0rem); opacity: 0.75; letter-spacing: 0.2em;">
        HEADPHONES RECOMMENDED
      </div>
    `;

    const unlock = async (): Promise<void> => {
      // Initialize Web Audio API
      const engine = AudioEngine.getInstance();
      await engine.init();
      engine.startAmbience();
      engine.play('ui_confirm');

      el.style.opacity = '0';
      el.style.pointerEvents = 'none';

      setTimeout(() => {
        if (el.parentElement) {
          el.parentElement.removeChild(el);
        }
        if (this.onUnlocked) this.onUnlocked();
      }, 800);
    };

    const onUserGesture = (): void => {
      window.removeEventListener('keydown', onUserGesture);
      el.removeEventListener('click', onUserGesture);
      void unlock();
    };

    window.addEventListener('keydown', onUserGesture, { once: true });
    el.addEventListener('click', onUserGesture, { once: true });

    container.appendChild(el);
    this.overlay = el;
  }

  dispose(): void {
    if (this.overlay?.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
  }
}

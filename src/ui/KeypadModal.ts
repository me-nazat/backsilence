/* ── KeypadModal.ts ────────────────────────────────────────────────────────
 *  Interactive 4-digit code keypad overlay modal:
 *  - 4 digit entry slots with tactile feedback
 *  - 12 touch/click buttons (0..9, CLEAR, ENTER) + full physical keyboard support
 *  - Audio integration: keypad_beep on keypress, keypad_buzz on failure, door_clunk on solve
 *  - 3 incorrect attempts trigger a 20s security lockout with countdown timer
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';

export interface KeypadModalCallbacks {
  onSubmit: (code: string) => boolean; // returns true if correct, false if wrong
  onCancel: () => void;
  onLockout: () => void;
}

export class KeypadModal {
  private el: HTMLElement | null = null;
  private currentCode = '';
  private callbacks: KeypadModalCallbacks;
  private audio = AudioEngine.getInstance();
  private wrongAttempts = 0;
  private lockTimer = 0;
  private lockInterval: ReturnType<typeof setInterval> | null = null;
  private onKeyDownBound: ((e: KeyboardEvent) => void) | null = null;

  constructor(callbacks: KeypadModalCallbacks) {
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'keypad-modal-overlay';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(8, 6, 3, 0.85);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 220;
      pointer-events: auto;
      user-select: none;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
    `;

    el.innerHTML = `
      <div style="
        width: 320px;
        background: #14120c;
        border: 2px solid #5b4526;
        box-shadow: 0 0 30px rgba(0,0,0,0.9), inset 0 0 15px rgba(0,0,0,0.8);
        border-radius: 6px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      ">
        <!-- Title & Status -->
        <div style="display: flex; justify-content: space-between; width: 100%; font-size: 11px; letter-spacing: 0.15em;">
          <span style="color: var(--water, #86cfa0);">DOOR ACCESS SEC-1</span>
          <span id="keypad-status" style="color: #ff8a80;">READY</span>
        </div>

        <!-- 4-Digit Display Screen -->
        <div id="keypad-display" style="
          width: 100%;
          height: 48px;
          background: #080603;
          border: 1px solid rgba(134,207,160,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          font-weight: bold;
          letter-spacing: 0.4em;
          color: var(--water, #86cfa0);
          text-shadow: 0 0 8px rgba(134,207,160,0.8);
          box-shadow: inset 0 0 10px rgba(0,0,0,0.9);
        ">_ _ _ _</div>

        <!-- Keypad Grid (3x4) -->
        <div id="keypad-buttons" style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          width: 100%;
        ">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
            .map(
              (n) => `
            <button class="keypad-btn" data-key="${n}" style="
              height: 44px;
              background: #231f16;
              border: 1px solid #4a3a24;
              color: var(--fog, #d9d3a2);
              font-size: 18px;
              font-family: monospace;
              cursor: pointer;
              border-radius: 3px;
              transition: background 0.1s;
            ">${n}</button>
          `,
            )
            .join('')}
          <button class="keypad-btn" data-key="CLEAR" style="
            height: 44px;
            background: #2a1616;
            border: 1px solid #662222;
            color: #ff8a80;
            font-size: 13px;
            font-family: monospace;
            cursor: pointer;
            border-radius: 3px;
          ">CLR</button>
          <button class="keypad-btn" data-key="0" style="
            height: 44px;
            background: #231f16;
            border: 1px solid #4a3a24;
            color: var(--fog, #d9d3a2);
            font-size: 18px;
            font-family: monospace;
            cursor: pointer;
            border-radius: 3px;
          ">0</button>
          <button class="keypad-btn" data-key="ENTER" style="
            height: 44px;
            background: #142a1e;
            border: 1px solid #22663e;
            color: var(--water, #86cfa0);
            font-size: 13px;
            font-family: monospace;
            font-weight: bold;
            cursor: pointer;
            border-radius: 3px;
          ">ENT</button>
        </div>

        <button id="btn-keypad-close" class="analog-btn" style="width: 100%; margin-top: 4px; font-size: 12px; padding: 6px;">
          CANCEL [ESC]
        </button>
      </div>
    `;

    container.appendChild(el);
    this.el = el;

    // Attach button clicks
    el.querySelectorAll('.keypad-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
        if (key) this.handleKeyInput(key);
      });
    });

    el.querySelector('#btn-keypad-close')?.addEventListener('click', () => {
      this.close();
    });

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (this.el?.style.display !== 'flex') return;
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key >= '0' && e.key <= '9') {
        this.handleKeyInput(e.key);
      } else if (e.key === 'Enter') {
        this.handleKeyInput('ENTER');
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        this.handleKeyInput('CLEAR');
      }
    };
    window.addEventListener('keydown', this.onKeyDownBound);
  }

  open(): void {
    if (!this.el) return;
    this.currentCode = '';
    this.updateDisplay();
    this.el.style.display = 'flex';
  }

  close(): void {
    if (!this.el) return;
    this.el.style.display = 'none';
    this.callbacks.onCancel();
  }

  isOpen(): boolean {
    return this.el?.style.display === 'flex';
  }

  private handleKeyInput(key: string): void {
    if (this.lockTimer > 0) return;

    if (key === 'CLEAR') {
      this.currentCode = '';
      this.audio.play('flashlight_click', { gain: 0.5 });
      this.updateDisplay();
      return;
    }

    if (key === 'ENTER') {
      if (this.currentCode.length === 4) {
        this.submitCode();
      } else {
        this.audio.play('keypad_buzz', { gain: 0.6 });
      }
      return;
    }

    if (this.currentCode.length < 4 && key >= '0' && key <= '9') {
      this.currentCode += key;
      this.audio.play('flashlight_click', { gain: 0.6 });
      this.updateDisplay();

      if (this.currentCode.length === 4) {
        // Automatically check or wait for enter? Standard requires enter or auto
        setTimeout(() => {
          if (this.currentCode.length === 4) {
            this.submitCode();
          }
        }, 200);
      }
    }
  }

  private submitCode(): void {
    const success = this.callbacks.onSubmit(this.currentCode);
    if (success) {
      this.setStatus('UNLOCKED', '#86cfa0');
      this.audio.play('door_clunk', { gain: 1.0 });
      setTimeout(() => this.close(), 600);
    } else {
      this.wrongAttempts++;
      this.audio.play('keypad_buzz', { gain: 0.9 });
      this.currentCode = '';
      this.updateDisplay();

      if (this.wrongAttempts >= 3) {
        this.startLockout(20);
        this.callbacks.onLockout();
      } else {
        this.setStatus(`DENIED (${3 - this.wrongAttempts} tries left)`, '#ff8a80');
      }
    }
  }

  private startLockout(seconds: number): void {
    this.lockTimer = seconds;
    this.setStatus(`LOCKED (${this.lockTimer}s)`, '#ff3b30');

    if (this.lockInterval) clearInterval(this.lockInterval);
    this.lockInterval = setInterval(() => {
      this.lockTimer--;
      if (this.lockTimer <= 0) {
        if (this.lockInterval) clearInterval(this.lockInterval);
        this.lockInterval = null;
        this.wrongAttempts = 0;
        this.setStatus('READY', '#ff8a80');
      } else {
        this.setStatus(`LOCKED (${this.lockTimer}s)`, '#ff3b30');
      }
    }, 1000);
  }

  private updateDisplay(): void {
    const disp = this.el?.querySelector('#keypad-display');
    if (!disp) return;
    const chars = this.currentCode.split('');
    const slots = [0, 1, 2, 3].map((i) => chars[i] ?? '_').join(' ');
    disp.textContent = slots;
  }

  private setStatus(text: string, color: string): void {
    const st = this.el?.querySelector('#keypad-status') as HTMLElement | null;
    if (st) {
      st.textContent = text;
      st.style.color = color;
    }
  }

  dispose(): void {
    if (this.lockInterval) {
      clearInterval(this.lockInterval);
      this.lockInterval = null;
    }
    if (this.onKeyDownBound) {
      window.removeEventListener('keydown', this.onKeyDownBound);
      this.onKeyDownBound = null;
    }
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

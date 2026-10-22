/* ── RoomLinkPanel.ts ──────────────────────────────────────────────────────
 *  Multiplayer Room Link Generator, 4-box code input with auto-advance,
 *  clipboard sharing, and NullNetworkAdapter-backed lobby preview.
 * ──────────────────────────────────────────────────────────────────────── */

import { SAFE_ALPHABET } from '../types/contracts.js';
import { isValidRoomCode } from '../app/Router.js';
import { ToastManager } from './ToastManager.js';
import { AudioEngine } from '../audio/AudioEngine.js';

export interface RoomLinkCallbacks {
  onBack: () => void;
  onEnterLobby: (roomCode: string, isHost: boolean) => void;
}

export class RoomLinkPanel {
  private el: HTMLElement | null = null;
  private callbacks: RoomLinkCallbacks;
  private activeTab: 'host' | 'join' = 'host';
  private currentRoomCode = '';
  private isInLobby = false;
  private isReady = false;

  constructor(
    callbacks: RoomLinkCallbacks,
    initialTab: 'host' | 'join' = 'host',
    initialCode?: string | null,
  ) {
    this.callbacks = callbacks;
    this.activeTab = initialCode ? 'join' : initialTab;
    if (initialCode && isValidRoomCode(initialCode)) {
      this.currentRoomCode = initialCode.toUpperCase();
    } else {
      this.currentRoomCode = this.generateSafeCode();
    }
  }

  private generateSafeCode(): string {
    const bytes = new Uint8Array(4);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += SAFE_ALPHABET[bytes[i]! % SAFE_ALPHABET.length];
    }
    return code;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'room-link-view';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(13, 11, 6, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: clamp(20px, 4vw, 40px) 20px;
      overflow-y: auto;
      z-index: 250;
      box-sizing: border-box;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
    `;

    container.appendChild(el);
    this.el = el;
    this.render();
  }

  private render(): void {
    if (!this.el) return;

    if (this.isInLobby) {
      this.renderLobby();
      return;
    }

    const shareUrl = `${location.origin}${location.pathname}?room=${this.currentRoomCode}`;
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;

    this.el.innerHTML = `
      <div style="width: min(540px, 95vw); display: flex; flex-direction: column; gap: 20px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: clamp(1.3rem, 2.5vw, 1.8rem); color: var(--water, #86cfa0); margin: 0;">MULTIPLAYER ROOM</h2>
            <div style="font-size: 11px; opacity: 0.7;">Create or join a synchronized exploration party</div>
          </div>
          <button id="btn-room-back" class="analog-btn" style="width: auto; padding: 6px 16px;">ESC BACK</button>
        </div>

        <!-- Host / Join Tabs -->
        <div style="display: flex; border-bottom: 1px solid #3d2f18;">
          <button id="tab-host" class="tab-btn ${this.activeTab === 'host' ? 'active' : ''}" style="flex: 1; padding: 10px; background: none; border: none; border-bottom: 2px solid ${this.activeTab === 'host' ? 'var(--water)' : 'transparent'}; color: var(--fog); cursor: pointer; font-family: inherit; font-size: 13px;">HOST A ROOM</button>
          <button id="tab-join" class="tab-btn ${this.activeTab === 'join' ? 'active' : ''}" style="flex: 1; padding: 10px; background: none; border: none; border-bottom: 2px solid ${this.activeTab === 'join' ? 'var(--water)' : 'transparent'}; color: var(--fog); cursor: pointer; font-family: inherit; font-size: 13px;">JOIN WITH CODE</button>
        </div>

        <!-- Content Area -->
        ${this.activeTab === 'host' ? `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="text-align: center; background: #080603; border: 1px solid #3d2f18; padding: 20px; border-radius: 4px;">
              <div style="font-size: 11px; opacity: 0.7; margin-bottom: 8px;">ROOM ACCESS CODE</div>
              <div style="font-size: 38px; font-weight: bold; letter-spacing: 0.3em; color: var(--water, #86cfa0);">${this.currentRoomCode}</div>
              <button id="btn-regen-code" class="analog-btn" style="width: auto; margin: 10px auto 0; font-size: 10px; padding: 4px 10px;">Regenerate</button>
            </div>

            <div>
              <label style="display: block; font-size: 11px; margin-bottom: 4px; opacity: 0.8;">SHAREABLE DIRECT LINK</label>
              <div style="display: flex; gap: 8px;">
                <input id="input-share-url" type="text" readonly value="${shareUrl}" style="flex: 1; background: #1c170d; border: 1px solid #5b4526; color: var(--fog); padding: 8px; font-family: inherit; font-size: 11px; border-radius: 3px;">
                <button id="btn-copy-link" class="analog-btn" style="width: auto; padding: 8px 14px; font-size: 11px;">Copy Link</button>
                ${canShare ? '<button id="btn-share-link" class="analog-btn" style="width: auto; padding: 8px 14px; font-size: 11px;">Share</button>' : ''}
              </div>
            </div>

            <button id="btn-launch-lobby" class="analog-btn primary" style="padding: 12px; margin-top: 10px;">ENTER LOBBY AS HOST</button>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 16px; align-items: center;">
            <div style="font-size: 12px; opacity: 0.8; text-align: center;">Enter the 4-character room code shared by the host:</div>
            
            <!-- 4-Box Code Input -->
            <div id="code-inputs" style="display: flex; gap: 12px;">
              <input type="text" maxlength="1" class="code-box" data-idx="0" value="${this.currentRoomCode[0] ?? ''}">
              <input type="text" maxlength="1" class="code-box" data-idx="1" value="${this.currentRoomCode[1] ?? ''}">
              <input type="text" maxlength="1" class="code-box" data-idx="2" value="${this.currentRoomCode[2] ?? ''}">
              <input type="text" maxlength="1" class="code-box" data-idx="3" value="${this.currentRoomCode[3] ?? ''}">
            </div>

            <div id="join-status" style="font-size: 11px; height: 16px; color: #d8b36a;"></div>

            <button id="btn-submit-join" class="analog-btn primary" style="width: 100%; padding: 12px; margin-top: 10px;">JOIN EXPEDITION</button>
          </div>
        `}
      </div>
    `;

    this.bindPanelEvents();
  }

  private renderLobby(): void {
    if (!this.el) return;

    this.el.innerHTML = `
      <div style="width: min(600px, 95vw); display: flex; flex-direction: column; gap: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: 1.6rem; color: var(--water, #86cfa0); margin: 0;">LOBBY: ROOM ${this.currentRoomCode}</h2>
            <div style="font-size: 11px; opacity: 0.7;">Waiting for players to prepare</div>
          </div>
          <button id="btn-leave-lobby" class="analog-btn" style="width: auto; padding: 6px 14px;">LEAVE</button>
        </div>

        <!-- Adapter Notice Banner -->
        <div style="background: rgba(179, 38, 30, 0.15); border: 1px solid var(--danger, #b3261e); padding: 12px 16px; border-radius: 4px; font-size: 12px; line-height: 1.5; color: #f4c2c0;">
          <strong>NOTICE:</strong> Online adapter not configured — see .env.example. Multiplayer is enabled in Batch 4.
        </div>

        <!-- Roster Slot -->
        <div>
          <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: var(--water);">EXPEDITION ROSTER (1/4):</div>
          <div style="background: #080603; border: 1px solid #3d2f18; border-radius: 4px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 13px;">Player (You) ${this.activeTab === 'host' ? '<span style="color:#d8b36a;">[HOST]</span>' : ''}</span>
              <span style="font-size: 12px; color: ${this.isReady ? 'var(--water)' : '#d8b36a'};">${this.isReady ? 'READY' : 'NOT READY'}</span>
            </div>
          </div>
        </div>

        <!-- Ready Toggle -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
          <button id="btn-toggle-ready" class="analog-btn ${this.isReady ? '' : 'primary'}" style="width: 180px; padding: 10px;">
            ${this.isReady ? 'CANCEL READY' : 'SET READY'}
          </button>
        </div>
      </div>
    `;

    const engine = AudioEngine.getInstance();
    this.el.querySelector('#btn-leave-lobby')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.isInLobby = false;
      this.render();
    });

    this.el.querySelector('#btn-toggle-ready')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.isReady = !this.isReady;
      this.renderLobby();
    });
  }

  private bindPanelEvents(): void {
    if (!this.el) return;
    const engine = AudioEngine.getInstance();

    this.el.querySelector('#btn-room-back')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.callbacks.onBack();
    });

    this.el.querySelector('#tab-host')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.activeTab = 'host';
      this.render();
    });

    this.el.querySelector('#tab-join')?.addEventListener('click', () => {
      engine.play('ui_click');
      this.activeTab = 'join';
      this.render();
    });

    // Host actions
    this.el.querySelector('#btn-regen-code')?.addEventListener('click', () => {
      engine.play('keypad_beep');
      this.currentRoomCode = this.generateSafeCode();
      this.render();
    });

    this.el.querySelector('#btn-copy-link')?.addEventListener('click', () => {
      void (async () => {
        const shareUrl = `${location.origin}${location.pathname}?room=${this.currentRoomCode}`;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = shareUrl;
            document.body.appendChild(textarea);
            textarea.select();
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            document.execCommand('copy');
            document.body.removeChild(textarea);
          }
          engine.play('ui_confirm');
          ToastManager.getInstance().show('Room link copied to clipboard!', { type: 'success' });
        } catch {
          engine.play('ui_error');
          ToastManager.getInstance().show('Failed to copy room link', { type: 'error' });
        }
      })();
    });

    this.el.querySelector('#btn-share-link')?.addEventListener('click', () => {
      const shareUrl = `${location.origin}${location.pathname}?room=${this.currentRoomCode}`;
      if (navigator.share) {
        navigator.share({
          title: 'BackSilence Room Invite',
          text: `Join my BackSilence room: ${this.currentRoomCode}`,
          url: shareUrl,
        }).catch(() => {});
      }
    });

    this.el.querySelector('#btn-launch-lobby')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.isInLobby = true;
      this.render();
      this.callbacks.onEnterLobby(this.currentRoomCode, true);
    });

    // Join Box Auto-advance and Paste Handling
    const boxes = this.el.querySelectorAll<HTMLInputElement>('.code-box');
    const joinStatus = this.el.querySelector('#join-status');

    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        const val = box.value.toUpperCase();
        box.value = val;

        if (val && !SAFE_ALPHABET.includes(val)) {
          box.value = '';
          engine.play('ui_error');
          if (joinStatus) joinStatus.textContent = 'Invalid symbol (no I, O, 0, or 1)';
          return;
        }

        if (joinStatus) joinStatus.textContent = '';
        if (val && i < 3) {
          boxes[i + 1]?.focus();
        }

        this.updateJoinValidation();
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 0) {
          boxes[i - 1]?.focus();
        }
      });

      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData?.getData('text') ?? '').trim().toUpperCase();
        if (text.length >= 4) {
          for (let c = 0; c < 4; c++) {
            const targetBox = boxes[c];
            if (targetBox && text[c]) {
              targetBox.value = text[c]!;
            }
          }
          this.updateJoinValidation();
        }
      });
    });

    this.el.querySelector('#btn-submit-join')?.addEventListener('click', () => {
      let code = '';
      boxes.forEach((b) => (code += b.value));
      if (isValidRoomCode(code)) {
        engine.play('ui_confirm');
        this.currentRoomCode = code;
        this.isInLobby = true;
        this.render();
        this.callbacks.onEnterLobby(code, false);
      } else {
        engine.play('ui_error');
        if (joinStatus) joinStatus.textContent = 'Please enter a valid 4-symbol room code';
      }
    });
  }

  private updateJoinValidation(): void {
    if (!this.el) return;
    const boxes = this.el.querySelectorAll<HTMLInputElement>('.code-box');
    let code = '';
    boxes.forEach((b) => (code += b.value));

    const isValid = isValidRoomCode(code);
    boxes.forEach((b) => {
      if (b.value) {
        b.style.borderColor = isValid ? 'var(--water, #86cfa0)' : '#5b4526';
      }
    });
  }

  show(): void {
    if (this.el) this.el.style.display = 'flex';
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none';
  }

  dispose(): void {
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

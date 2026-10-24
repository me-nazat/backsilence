/* ── LobbyScreen.ts ──────────────────────────────────────────────────────
 *  3D Waiting Room / Multiplayer Lobby:
 *  - Natatorium foyer waiting room
 *  - Player roster chips with ping bars and ready state
 *  - Mode rules card
 *  - Host start/ready controls
 *  - Room code / invite link copy
 *  - Countdown timer
 * ──────────────────────────────────────────────────────────────────────── */

import { RosterChip, Toast, renderIcon } from '../kit/index.js';

export interface LobbyPlayer {
  id: string;
  name: string;
  tag: string;
  isHost: boolean;
  isReady: boolean;
  pingMs: number;
}

export interface LobbyCallbacks {
  onReadyToggle: (ready: boolean) => void;
  onStartGame: () => void;
  onLeave: () => void;
}

export class LobbyScreen {
  readonly element: HTMLElement;
  private isReady = false;
  private isHost = false;
  private roomCode = 'K7QX';
  private countdownVal = 5;
  private countdownTimer: number | null = null;
  private players: LobbyPlayer[] = [];

  constructor(private callbacks: LobbyCallbacks, roomCode = 'K7QX', isHost = false) {
    this.roomCode = roomCode;
    this.isHost = isHost;
    this.element = document.createElement('div');
    this.element.id = 'screen-lobby';
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
      justify-content: center;
      padding: clamp(24px, 4vw, 48px) 24px;
      box-sizing: border-box;
    `;

    this.players = [
      { id: 'p1', name: isHost ? 'You' : 'HostOperator', tag: '0042', isHost: true, isReady: true, pingMs: 18 },
      { id: 'p2', name: isHost ? 'GuestDiver' : 'You', tag: '8812', isHost: false, isReady: false, pingMs: 34 },
    ];

    this.render();
  }

  private render(): void {
    const inviteUrl = `${window.location.origin}/?room=${this.roomCode}`;

    this.element.innerHTML = `
      <div style="width: min(840px, 95vw); background: var(--bs-surface-1); border: 2px solid var(--bs-border-strong); border-radius: var(--bs-radius-md); padding: 32px; box-shadow: 0 16px 40px rgba(0,0,0,0.8); display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan); letter-spacing: 0.12em;">STAGING CHAMBER // NATATORIUM FOYER</div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); color: var(--bs-cream); margin: 2px 0;">
              ROOM CODE: <span class="bs-osd-readout">${this.roomCode}</span>
            </h1>
          </div>
          <button id="btn-copy-invite" class="bs-btn bs-btn-ghost" style="display: flex; gap: 6px; align-items: center;">
            ${renderIcon('copy', 14)} COPY INVITE LINK
          </button>
        </div>

        <!-- Mode Rules Card -->
        <div style="background: var(--bs-surface-2); border: 1px solid var(--bs-border-subtle); padding: 16px; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); line-height: 1.6;">
          <div style="color: var(--bs-water); font-weight: bold; margin-bottom: 4px;">PROTOCOL: SILENT RACE (RANKED)</div>
          <div>• Map: The Natatorium // Depth: 0.85m</div>
          <div>• First survivor through the decontamination airlock claims the victory.</div>
          <div>• Extra noise slows down stamina regeneration. Stay quiet to stay fast.</div>
        </div>

        <!-- Roster of Connected Players -->
        <div>
          <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-tan); margin-bottom: 8px;">CONNECTED DIVERS (${this.players.length}/4):</div>
          <div id="roster-chips-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>

        <!-- Countdown banner (hidden until all ready) -->
        <div id="countdown-banner" style="display: none; background: rgba(134,207,160,0.15); border: 1px solid var(--bs-water); padding: 12px; text-align: center; border-radius: var(--bs-radius-sm); font-family: var(--bs-font-mono); font-size: var(--bs-text-md); color: var(--bs-cream);">
          ALL PLAYERS READY // DESCENT IN <span id="countdown-val" class="bs-osd-readout" style="font-weight: bold;">5</span> SECONDS
        </div>

        <!-- Controls footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--bs-border); padding-top: 20px; flex-wrap: wrap; gap: 12px;">
          <button id="btn-leave-room" class="bs-btn bs-btn-danger">LEAVE ROOM</button>
          <div style="display: flex; gap: 12px;">
            <button id="btn-ready-toggle" class="bs-btn bs-btn-primary">
              ${this.isReady ? 'UNREADY' : 'READY CHECK'}
            </button>
            <button id="btn-start-game" class="bs-btn bs-btn-primary" ${!this.isHost ? 'disabled' : ''}>
              DESCEND NOW
            </button>
          </div>
        </div>
      </div>
    `;

    this.renderRoster();
    this.bindEvents(inviteUrl);
  }

  private renderRoster(): void {
    const con = this.element.querySelector('#roster-chips-container')!;
    con.innerHTML = '';
    this.players.forEach((p) => {
      const chip = new RosterChip({
        name: p.name,
        tag: p.tag,
        isHost: p.isHost,
        isReady: p.isReady,
        pingMs: p.pingMs,
      });
      con.appendChild(chip.element);
    });
  }

  private bindEvents(inviteUrl: string): void {
    this.element.querySelector('#btn-copy-invite')?.addEventListener('click', () => {
      void (async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(inviteUrl);
            Toast.show('Room link copied to clipboard!', 'success');
          } else {
            Toast.show('Clipboard not supported in this browser.', 'warning');
          }
        } catch {
          Toast.show('Could not copy room link.', 'warning');
        }
      })();
    });

    this.element.querySelector('#btn-leave-room')?.addEventListener('click', () => {
      this.callbacks.onLeave();
    });

    this.element.querySelector('#btn-ready-toggle')?.addEventListener('click', () => {
      this.isReady = !this.isReady;
      const me = this.players.find((p) => p.name === 'You');
      if (me) me.isReady = this.isReady;
      this.renderRoster();
      this.callbacks.onReadyToggle(this.isReady);

      const btn = this.element.querySelector('#btn-ready-toggle');
      if (btn) btn.textContent = this.isReady ? 'UNREADY' : 'READY CHECK';

      if (this.players.every((p) => p.isReady)) {
        this.startCountdown();
      } else {
        this.cancelCountdown();
      }
    });

    this.element.querySelector('#btn-start-game')?.addEventListener('click', () => {
      this.callbacks.onStartGame();
    });
  }

  private startCountdown(): void {
    const banner = this.element.querySelector<HTMLElement>('#countdown-banner');
    const valEl = this.element.querySelector<HTMLElement>('#countdown-val');
    if (banner) banner.style.display = 'block';

    this.countdownVal = 5;
    if (valEl) valEl.textContent = String(this.countdownVal);

    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = window.setInterval(() => {
      this.countdownVal--;
      if (valEl) valEl.textContent = String(this.countdownVal);
      if (this.countdownVal <= 0) {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.callbacks.onStartGame();
      }
    }, 1000);
  }

  private cancelCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    const banner = this.element.querySelector<HTMLElement>('#countdown-banner');
    if (banner) banner.style.display = 'none';
  }
}

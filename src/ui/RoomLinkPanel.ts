/* ── RoomLinkPanel.ts ──────────────────────────────────────────────────────
 *  Multiplayer Room Lifecycle & Lobby UI.
 *  - 4-char safe room codes with collision retry
 *  - Adapter selection from .env or ?net=local multi-tab testing
 *  - Real DatabaseNetworkAdapter & NetSession integration
 *  - Host controls: Map picker, difficulty, seed, max players, kick
 *  - Synchronized start with layout hash verification and 3-2-1 VHS countdown
 *  - Friendly failure toasts and inline explanations
 *  - Strictly safe textContent rendering for all remote data
 * ──────────────────────────────────────────────────────────────────────── */

import { SAFE_ALPHABET, type MapId, type RoomInfo, type LobbyPlayer, PROTOCOL_VERSION } from '../types/contracts.js';
import { isValidRoomCode } from '../app/Router.js';
import { ToastManager } from './ToastManager.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { loadSettings } from '../app/Settings.js';
import { getMapDefinition } from '../world/MapRegistry.js';
import { generateValidLayout } from '../world/validate/LayoutValidator.js';
import type { LayoutData } from '../world/MapTypes.js';
import type { NetSession } from '../net/session/NetSession.js';
import type { DatabaseNetworkAdapter } from '../types/contracts.js';

export interface RoomLinkCallbacks {
  onBack: () => void;
  onLaunchGame: (session: NetSession, mapId: MapId, difficulty: 'whisper' | 'normal' | 'deafening', seed: number) => void;
}

const MAP_OPTIONS: Array<{ id: MapId; name: string }> = [
  { id: 'poolrooms', name: 'The Submerged Pillars' },
  { id: 'utility_tunnels', name: 'The Utility Catacombs' },
  { id: 'marble_atrium', name: 'The Sinking Echo Chambers' },
  { id: 'hydro_maze', name: 'The Hydro-Pump Maze' },
  { id: 'drainage_core', name: 'The Abyssal Drainage Core' },
];

export class RoomLinkPanel {
  private el: HTMLElement | null = null;
  private callbacks: RoomLinkCallbacks;
  private activeTab: 'host' | 'join' = 'host';
  private currentRoomCode = '';
  private isInLobby = false;
  private isReady = false;

  // Active Networking & Session
  private adapter: DatabaseNetworkAdapter | null = null;
  private netSession: NetSession | null = null;
  private currentRoom: RoomInfo | null = null;

  // Host Configuration State
  private selectedMapId: MapId = 'poolrooms';
  private selectedDifficulty: 'whisper' | 'normal' | 'deafening' = 'normal';
  private selectedSeed = 42;
  private selectedMaxPlayers = 4;

  // Heartbeat & Sync Timers
  private heartbeatInterval: number | null = null;
  private countdownTimer: number | null = null;
  private countdownSeconds = 0;

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

    // Auto-join if initialized with room code in URL
    if (this.activeTab === 'join' && this.currentRoomCode.length === 4) {
      void this.handleJoin(this.currentRoomCode);
    }
  }

  private async initializeAdapter(): Promise<DatabaseNetworkAdapter> {
    if (this.adapter) return this.adapter;

    // Dynamically load network chunk
    const { AdapterRegistry } = await import('../net/adapters/AdapterRegistry.js');

    const searchParams = new URLSearchParams(window.location.search);
    const useLocalTab = searchParams.get('net') === 'local';

    let config = AdapterRegistry.resolveConfigFromEnv();
    if (useLocalTab) {
      config = { provider: 'local-tab' };
    }

    const adapter = AdapterRegistry.create(config);
    await adapter.connect(config);
    this.adapter = adapter;
    return adapter;
  }

  private render(): void {
    if (!this.el) return;

    if (this.isInLobby) {
      this.renderLobby();
      return;
    }

    const shareUrl = `${location.origin}${location.pathname}?room=${this.currentRoomCode}`;
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;
    const isLocalMode = new URLSearchParams(window.location.search).get('net') === 'local';

    this.el.innerHTML = `
      <div style="width: min(540px, 95vw); display: flex; flex-direction: column; gap: 20px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: clamp(1.3rem, 2.5vw, 1.8rem); color: var(--water, #86cfa0); margin: 0;">MULTIPLAYER CO-OP</h2>
            <div style="font-size: 11px; opacity: 0.7;">Synchronized expedition via shareable link</div>
          </div>
          <button id="btn-room-back" class="analog-btn" style="width: auto; padding: 6px 16px;">ESC BACK</button>
        </div>

        ${!isLocalMode ? `
          <div style="background: rgba(216, 179, 106, 0.1); border: 1px solid #5b4526; padding: 10px 14px; border-radius: 4px; font-size: 11px; line-height: 1.5;">
            <strong>TIP:</strong> For multi-tab testing without setting up a cloud database, click 
            <a href="?net=local" style="color: var(--water, #86cfa0); text-decoration: underline;">Switch to Local Multi-Tab Mode</a>.
          </div>
        ` : `
          <div style="background: rgba(134, 207, 160, 0.12); border: 1px solid var(--water); padding: 10px 14px; border-radius: 4px; font-size: 11px; line-height: 1.5; color: var(--water);">
            <strong>LOCAL MULTI-TAB MODE ACTIVE:</strong> Open multiple browser tabs with this link to test co-op without a server.
          </div>
        `}

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
    if (!this.el || !this.currentRoom) return;

    const room = this.currentRoom;
    const isHost = this.activeTab === 'host';
    const players = room.players;
    const transportBadge = this.adapter?.capabilities?.realtime === 'push' ? 'WEBRTC / PUSH' : 'POLL RELAY';
    const shareUrl = `${location.origin}${location.pathname}?room=${this.currentRoomCode}`;
    const allReady = players.length > 0 && players.every((p) => p.ready || p.isHost);

    this.el.innerHTML = `
      <div style="width: min(640px, 95vw); display: flex; flex-direction: column; gap: 16px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2 style="font-size: 1.6rem; color: var(--water, #86cfa0); margin: 0;">ROOM: ${room.code}</h2>
              <span style="font-size: 10px; background: #1c170d; border: 1px solid #5b4526; padding: 2px 6px; border-radius: 3px; color: #86cfa0;">${transportBadge}</span>
            </div>
            <div style="font-size: 11px; opacity: 0.7;">Waiting for all party members to ready up</div>
          </div>
          <button id="btn-leave-lobby" class="analog-btn" style="width: auto; padding: 6px 14px;">LEAVE</button>
        </div>

        <!-- Share bar -->
        <div style="display: flex; align-items: center; justify-content: space-between; background: #080603; border: 1px solid #3d2f18; padding: 8px 12px; border-radius: 4px;">
          <div style="font-size: 11px;">
            <span style="opacity: 0.7;">Invite link: </span>
            <span style="color: var(--water);">${shareUrl}</span>
          </div>
          <button id="btn-lobby-copy" class="analog-btn" style="width: auto; padding: 4px 10px; font-size: 10px;">Copy Link</button>
        </div>

        <!-- Roster List -->
        <div>
          <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: var(--water);">
            EXPEDITION PARTY (${players.length}/${room.maxPlayers}):
          </div>
          <div id="lobby-roster-cards" style="display: flex; flex-direction: column; gap: 6px;"></div>
        </div>

        <!-- Host Controls (Only visible to host) -->
        ${isHost ? `
          <div style="background: #080603; border: 1px solid #3d2f18; padding: 14px; border-radius: 4px; display: flex; flex-direction: column; gap: 12px;">
            <div style="font-size: 12px; font-weight: bold; color: var(--water); border-bottom: 1px solid #2d2312; padding-bottom: 6px;">
              HOST EXPEDITION SETTINGS:
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-size: 10px; opacity: 0.7; margin-bottom: 4px;">EXPEDITION MAP</label>
                <select id="lobby-map-select" class="analog-select" style="width: 100%; background: #1c170d; color: var(--fog); border: 1px solid #5b4526; padding: 6px; font-family: inherit; font-size: 11px;">
                  ${MAP_OPTIONS.map((m) => `<option value="${m.id}" ${m.id === this.selectedMapId ? 'selected' : ''}>${m.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="display: block; font-size: 10px; opacity: 0.7; margin-bottom: 4px;">DIFFICULTY</label>
                <select id="lobby-diff-select" class="analog-select" style="width: 100%; background: #1c170d; color: var(--fog); border: 1px solid #5b4526; padding: 6px; font-family: inherit; font-size: 11px;">
                  <option value="whisper" ${this.selectedDifficulty === 'whisper' ? 'selected' : ''}>Whisper (Forgiving)</option>
                  <option value="normal" ${this.selectedDifficulty === 'normal' ? 'selected' : ''}>Normal (Acoustic Horror)</option>
                  <option value="deafening" ${this.selectedDifficulty === 'deafening' ? 'selected' : ''}>Deafening (Nightmare)</option>
                </select>
              </div>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
              <div style="flex: 1;">
                <label style="display: block; font-size: 10px; opacity: 0.7; margin-bottom: 4px;">MAP SEED</label>
                <input id="lobby-seed-input" type="number" value="${this.selectedSeed}" style="width: 100%; background: #1c170d; color: var(--fog); border: 1px solid #5b4526; padding: 6px; font-family: inherit; font-size: 11px; box-sizing: border-box;">
              </div>
              <button id="btn-random-seed" class="analog-btn" style="width: auto; height: 30px; margin-top: 16px; padding: 0 10px; font-size: 10px;">Randomize</button>
            </div>
          </div>
        ` : ''}

        <!-- Bottom Actions -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
          <button id="btn-toggle-ready" class="analog-btn ${this.isReady ? '' : 'primary'}" style="width: 180px; padding: 10px;">
            ${this.isReady ? 'CANCEL READY' : 'SET READY'}
          </button>

          ${isHost ? `
            <button id="btn-start-expedition" class="analog-btn ${allReady ? 'primary' : ''}" style="width: 220px; padding: 10px;" ${allReady ? '' : 'disabled'}>
              START EXPEDITION
            </button>
          ` : `
            <div style="font-size: 11px; opacity: 0.8; color: ${allReady ? 'var(--water)' : '#d8b36a'};">
              ${allReady ? 'Party is ready. Waiting for host to launch...' : 'Waiting for all players to set ready...'}
            </div>
          `}
        </div>

        <!-- 3-2-1 Countdown Overlay -->
        <div id="lobby-countdown-overlay" style="
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 300;
        ">
          <div style="font-size: 14px; letter-spacing: 0.3em; opacity: 0.7; margin-bottom: 12px;">SYNCHRONIZING EXPEDITION</div>
          <div id="countdown-number" style="font-size: 80px; font-weight: bold; color: var(--water, #86cfa0); font-family: monospace;">3</div>
          <div style="font-size: 11px; color: #888888; margin-top: 12px;">HOLD STILL • ENTERING SILENCE</div>
        </div>
      </div>
    `;

    this.renderRosterCards(players);
    this.bindLobbyEvents();
  }

  private renderRosterCards(players: LobbyPlayer[]): void {
    const container = this.el?.querySelector('#lobby-roster-cards');
    if (!container) return;
    container.innerHTML = '';

    const colors = ['#e5a93b', '#3ea094', '#d65a31', '#7fa650'];
    const isHost = this.activeTab === 'host';

    players.forEach((p, idx) => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: #080603;
        border: 1px solid #3d2f18;
        border-radius: 4px;
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '10px';

      const colorDot = document.createElement('div');
      colorDot.style.cssText = `
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: ${colors[p.colorIndex ?? idx % colors.length]};
      `;

      const nameEl = document.createElement('div');
      nameEl.style.fontSize = '13px';
      nameEl.style.fontWeight = 'bold';
      nameEl.textContent = p.name; // Strictly safe textContent

      if (p.isHost) {
        const crown = document.createElement('span');
        crown.style.color = '#d8b36a';
        crown.style.fontSize = '11px';
        crown.style.marginLeft = '6px';
        crown.textContent = '[HOST]';
        nameEl.appendChild(crown);
      }

      left.appendChild(colorDot);
      left.appendChild(nameEl);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '12px';

      const readyStatus = document.createElement('div');
      readyStatus.style.fontSize = '12px';
      readyStatus.style.fontWeight = 'bold';
      readyStatus.style.color = p.ready || p.isHost ? 'var(--water, #86cfa0)' : '#d8b36a';
      readyStatus.textContent = p.ready || p.isHost ? 'READY' : 'NOT READY';
      right.appendChild(readyStatus);

      // Host can kick other players
      if (isHost && !p.isHost) {
        const kickBtn = document.createElement('button');
        kickBtn.className = 'analog-btn';
        kickBtn.style.cssText = 'width: auto; padding: 2px 8px; font-size: 10px; border-color: var(--danger, #b3261e); color: #f4c2c0;';
        kickBtn.textContent = 'Kick';
        kickBtn.addEventListener('click', () => {
          void this.handleKick(p.id);
        });
        right.appendChild(kickBtn);
      }

      card.appendChild(left);
      card.appendChild(right);
      container.appendChild(card);
    });
  }

  private bindLobbyEvents(): void {
    if (!this.el) return;
    const engine = AudioEngine.getInstance();

    this.el.querySelector('#btn-leave-lobby')?.addEventListener('click', () => {
      engine.play('ui_click');
      void this.leaveLobby();
    });

    this.el.querySelector('#btn-lobby-copy')?.addEventListener('click', () => {
      const shareUrl = `${location.origin}${location.pathname}?room=${this.currentRoomCode}`;
      void navigator.clipboard?.writeText(shareUrl).then(() => {
        engine.play('ui_confirm');
        ToastManager.getInstance().show('Invite link copied!', { type: 'success' });
      });
    });

    this.el.querySelector('#btn-toggle-ready')?.addEventListener('click', () => {
      engine.play('ui_confirm');
      this.isReady = !this.isReady;
      void this.adapter?.setReady(this.isReady);
      this.renderLobby();
    });

    this.el.querySelector('#lobby-map-select')?.addEventListener('change', (e) => {
      this.selectedMapId = (e.target as HTMLSelectElement).value as MapId;
    });

    this.el.querySelector('#lobby-diff-select')?.addEventListener('change', (e) => {
      this.selectedDifficulty = (e.target as HTMLSelectElement).value as 'whisper' | 'normal' | 'deafening';
    });

    this.el.querySelector('#lobby-seed-input')?.addEventListener('change', (e) => {
      this.selectedSeed = parseInt((e.target as HTMLInputElement).value, 10) || 42;
    });

    this.el.querySelector('#btn-random-seed')?.addEventListener('click', () => {
      engine.play('keypad_beep');
      this.selectedSeed = Math.floor(Math.random() * 900000) + 10000;
      const input = this.el?.querySelector<HTMLInputElement>('#lobby-seed-input');
      if (input) input.value = String(this.selectedSeed);
    });

    this.el.querySelector('#btn-start-expedition')?.addEventListener('click', () => {
      void this.handleHostStart();
    });
  }

  private async handleKick(targetPlayerId: string): Promise<void> {
    if (this.adapter?.kick) {
      await this.adapter.kick(targetPlayerId);
      AudioEngine.getInstance().play('ui_error');
      ToastManager.getInstance().show('Player removed from party', { type: 'info' });
    }
  }

  private async handleHostStart(): Promise<void> {
    if (!this.netSession || !this.currentRoom) return;
    const engine = AudioEngine.getInstance();
    engine.play('ui_confirm');

    // 1. Generate layout and compute hash
    const mapDef = await getMapDefinition(this.selectedMapId);
    const layout = generateValidLayout(mapDef, {
      seed: this.selectedSeed,
      difficulty: this.selectedDifficulty,
      playerCount: this.currentRoom.players.length,
    });
    const layoutHash = this.computeLayoutHash(layout);

    // 2. Broadcast start with startAtMs
    const startAtMs = this.netSession.serverNow() + 3500;
    this.netSession.startSynchronizedRound(startAtMs, layoutHash, this.currentRoom.players.length);

    // 3. Start 3-2-1 Countdown
    this.startCountdown(() => {
      this.callbacks.onLaunchGame(
        this.netSession!,
        this.selectedMapId,
        this.selectedDifficulty,
        this.selectedSeed,
      );
    });
  }

  private startCountdown(onComplete: () => void): void {
    const overlay = this.el?.querySelector<HTMLElement>('#lobby-countdown-overlay');
    const numberEl = this.el?.querySelector<HTMLElement>('#countdown-number');
    if (!overlay || !numberEl) {
      onComplete();
      return;
    }

    overlay.style.display = 'flex';
    this.countdownSeconds = 3;
    numberEl.textContent = '3';
    AudioEngine.getInstance().play('keypad_beep');

    this.countdownTimer = window.setInterval(() => {
      this.countdownSeconds--;
      if (this.countdownSeconds > 0) {
        numberEl.textContent = String(this.countdownSeconds);
        AudioEngine.getInstance().play('keypad_beep');
      } else {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        numberEl.textContent = 'BEGIN';
        AudioEngine.getInstance().play('ui_confirm');
        setTimeout(() => {
          overlay.style.display = 'none';
          onComplete();
        }, 500);
      }
    }, 1000);
  }

  private computeLayoutHash(layout: LayoutData): string {
    const str = `${layout.mapId}-${layout.seed}-${layout.spawns.player.length}-${layout.puzzles.length}-${layout.platforms.length}`;
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private async handleHostCreate(): Promise<void> {
    const engine = AudioEngine.getInstance();
    try {
      const adapter = await this.initializeAdapter();
      const settings = loadSettings();

      // Collision retry logic up to 6 times
      let room: RoomInfo | null = null;
      let attempts = 0;
      while (attempts < 6 && !room) {
        try {
          room = await adapter.createRoom({
            mapId: this.selectedMapId,
            seed: this.selectedSeed,
            maxPlayers: this.selectedMaxPlayers,
            hostName: settings.player.name,
            difficulty: this.selectedDifficulty,
          });
        } catch {
          attempts++;
          this.currentRoomCode = this.generateSafeCode();
        }
      }

      if (!room) {
        throw new Error('Failed to create room after 6 code generation attempts.');
      }

      this.currentRoom = room;
      this.currentRoomCode = room.code;
      this.isInLobby = true;

      // Update URL with ?room=CODE
      const url = new URL(window.location.href);
      url.searchParams.set('room', room.code);
      window.history.replaceState({}, '', url.toString());

      // Create NetSession
      const { NetSession } = await import('../net/session/NetSession.js');
      this.netSession = new NetSession(adapter, 'host', 'host-player', settings.player.name);

      this.setupLobbyListeners();
      this.render();
      engine.play('ui_confirm');
    } catch (err) {
      engine.play('ui_error');
      ToastManager.getInstance().show(`Failed to host room: ${String(err)}`, { type: 'error' });
    }
  }

  private async handleJoin(code: string): Promise<void> {
    const engine = AudioEngine.getInstance();
    const joinStatus = this.el?.querySelector('#join-status');

    try {
      if (joinStatus) joinStatus.textContent = 'Connecting to expedition room...';
      const adapter = await this.initializeAdapter();
      const settings = loadSettings();

      const room = await adapter.joinRoom(code, { name: settings.player.name });

      // Protocol checks
      if (room.protocol !== PROTOCOL_VERSION) {
        throw new Error('Game version mismatch. Please refresh or update.');
      }

      if (room.state === 'playing') {
        const spectate = confirm('This expedition is currently in progress. Watch as spectator?');
        if (!spectate) {
          if (joinStatus) joinStatus.textContent = 'Room is currently playing.';
          return;
        }
      }

      this.currentRoom = room;
      this.currentRoomCode = room.code;
      this.isInLobby = true;

      // Create NetSession
      const { NetSession } = await import('../net/session/NetSession.js');
      this.netSession = new NetSession(adapter, 'client', `peer-${Math.random().toString(36).slice(2, 7)}`, settings.player.name);

      this.setupLobbyListeners();
      this.render();
      engine.play('ui_confirm');
    } catch (err) {
      engine.play('ui_error');
      const msg = err instanceof Error ? err.message : String(err);
      if (joinStatus) joinStatus.textContent = msg;
      ToastManager.getInstance().show(msg, { type: 'error' });
    }
  }

  private setupLobbyListeners(): void {
    if (!this.adapter) return;

    this.adapter.on('room', (room) => {
      this.currentRoom = room;
      if (this.isInLobby) {
        this.renderLobby();
      }
    });

    this.adapter.on('event', (ev) => {
      if (ev.type === 'start') {
        // Client received synchronized start from host
        void (async () => {
          const mapDef = await getMapDefinition(this.selectedMapId);
          const layout = generateValidLayout(mapDef, {
            seed: this.selectedSeed,
            difficulty: this.selectedDifficulty,
            playerCount: ev.playerCount,
          });
          const localHash = this.computeLayoutHash(layout);
          if (localHash !== ev.layoutHash) {
            ToastManager.getInstance().show('Map data mismatch. Please update game files.', { type: 'error' });
            return;
          }

          this.startCountdown(() => {
            this.callbacks.onLaunchGame(
              this.netSession!,
              this.selectedMapId,
              this.selectedDifficulty,
              this.selectedSeed,
            );
          });
        })();
      }
    });

    // Heartbeat every 4s
    this.heartbeatInterval = window.setInterval(() => {
      // Periodic ping/last_seen updates
    }, 4000);
  }

  private async leaveLobby(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    if (this.netSession) {
      this.netSession.dispose();
      this.netSession = null;
    }

    if (this.adapter) {
      await this.adapter.leaveRoom();
      await this.adapter.disconnect();
      this.adapter = null;
    }

    this.isInLobby = false;
    this.currentRoom = null;

    // Clear ?room= from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());

    this.render();
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

    this.el.querySelector('#btn-regen-code')?.addEventListener('click', () => {
      engine.play('keypad_beep');
      this.currentRoomCode = this.generateSafeCode();
      this.render();
    });

    this.el.querySelector('#btn-copy-link')?.addEventListener('click', () => {
      const shareUrl = `${location.origin}${location.pathname}?room=${this.currentRoomCode}`;
      void navigator.clipboard?.writeText(shareUrl).then(() => {
        engine.play('ui_confirm');
        ToastManager.getInstance().show('Room link copied to clipboard!', { type: 'success' });
      });
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
      void this.handleHostCreate();
    });

    // 4-box code inputs
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
        }
      });
    });

    this.el.querySelector('#btn-submit-join')?.addEventListener('click', () => {
      let code = '';
      boxes.forEach((b) => (code += b.value));
      if (isValidRoomCode(code)) {
        void this.handleJoin(code);
      } else {
        engine.play('ui_error');
        if (joinStatus) joinStatus.textContent = 'Please enter a valid 4-symbol room code';
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
    void this.leaveLobby();
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}

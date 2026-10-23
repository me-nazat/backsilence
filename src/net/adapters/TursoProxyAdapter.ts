/* ── TursoProxyAdapter.ts ──────────────────────────────────────────────────
 *  DatabaseNetworkAdapter implementation talking ONLY to the /api/* proxy.
 *  - Zero client-side Turso credentials or tokens.
 *  - Lobby and WebRTC signaling exchange via serverless proxy.
 *  - Gameplay uses WebRtcDbAdapter with this adapter as the signaling store.
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  AdapterCapabilities,
  AdapterConfig,
  DatabaseNetworkAdapter,
  MapId,

  NetAdapterEvents,
  NetEvent,
  NetPlayerSnapshot,
  NetStats,
  PlayerId,
  RoomCode,
  RoomInfo,
  Unsubscribe,
} from '../../types/contracts.js';
import { type NetDeps, defaultNetDeps } from '../NetDeps.js';
import { Identity } from '../../meta/Identity.js';

type Listener<T> = (value: T) => void;

export class TursoProxyAdapter implements DatabaseNetworkAdapter {
  readonly kind = 'turso' as const;
  readonly capabilities: AdapterCapabilities = {
    realtime: 'poll',
    reliableOrdered: true,
    maxMsgBytes: 65536,
    suggestedSnapshotHz: 4,
    suggestedInterpDelayMs: 400,
    supportsWebRtcSignaling: true,
  };

  private apiBase = '/api';
  private deps: NetDeps;
  readonly playerId: PlayerId;
  private currentRoom: RoomInfo | null = null;
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastSignalTime = 0;

  private inBytes = 0;
  private outBytes = 0;

  constructor(deps?: NetDeps, playerId?: PlayerId) {
    this.deps = deps ?? defaultNetDeps();
    this.playerId = playerId ?? (Identity.isInitialized() ? Identity.getPlayerId() : `p-${Math.random().toString(36).slice(2, 9)}`);
  }

  async connect(config: AdapterConfig): Promise<void> {
    const env = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env as unknown as Record<string, string | undefined>) : {};
    const raw = config.url ?? env['VITE_API_BASE'] ?? '/api';
    this.apiBase = String(raw).replace(/\/$/, '');
  }

  async disconnect(): Promise<void> {
    await this.leaveRoom();
    this.stopPolling();
    this.emit('disconnected', { reason: 'client disconnected' });
  }

  private async request<T>(path: string, method: string, body?: Record<string, unknown>): Promise<T> {
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const bodyStr = body ? JSON.stringify(body) : '';
    if (Identity.isInitialized()) {
      try {
        const signed = await Identity.signRequest(method, path, bodyStr);
        headers = { ...headers, ...signed };
      } catch {
        // Fall back to unsigned headers
        headers['X-BS-Player'] = this.playerId;
      }
    } else {
      headers['X-BS-Player'] = this.playerId;
    }

    const init: RequestInit = {
      method,
      headers,
    };
    if (body) {
      init.body = bodyStr;
    }

    const res = await this.deps.fetch(`${this.apiBase}${path}`, init);


    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const errJson = (await res.json()) as { error?: string };
        if (errJson.error) msg = errJson.error;
      } catch {
        // ignore
      }
      const err = new Error(`Proxy error: ${msg}`);
      (err as unknown as Record<string, unknown>)['status'] = res.status;
      throw err;
    }

    return (await res.json()) as T;
  }

  async createRoom(opts: {
    mapId: MapId;
    seed: number;
    maxPlayers: number;
    hostName: string;
    difficulty?: 'whisper' | 'normal' | 'deafening';
  }): Promise<RoomInfo> {
    const res = await this.request<{ room: RoomInfo }>('/room/create', 'POST', {
      playerId: this.playerId,
      name: opts.hostName,
      mapId: opts.mapId,
      seed: opts.seed,
      difficulty: opts.difficulty ?? 'normal',
      maxPlayers: opts.maxPlayers,
    });

    this.currentRoom = res.room;
    this.emit('room', res.room);
    this.startPolling(res.room.code);
    return res.room;
  }

  async joinRoom(code: RoomCode, profile: { name: string }): Promise<RoomInfo> {
    const res = await this.request<{ room: RoomInfo }>('/room/join', 'POST', {
      code,
      playerId: this.playerId,
      name: profile.name,
    });

    this.currentRoom = res.room;
    this.emit('room', res.room);
    this.startPolling(code);
    return res.room;
  }

  async leaveRoom(): Promise<void> {
    if (!this.currentRoom) return;
    const code = this.currentRoom.code;

    try {
      await this.request('/room/leave', 'POST', {
        code,
        playerId: this.playerId,
      });
    } catch {
      // ignore
    }

    this.currentRoom = null;
    this.stopPolling();
  }

  async setReady(ready: boolean): Promise<void> {
    if (!this.currentRoom) return;
    const code = this.currentRoom.code;

    await this.request('/room/ready', 'POST', {
      code,
      playerId: this.playerId,
      ready,
    });

    const p = this.currentRoom.players.find((x) => x.id === this.playerId);
    if (p) {
      p.ready = ready;
      this.emit('room', this.currentRoom);
    }
  }

  async startGame(): Promise<void> {
    if (!this.currentRoom || this.currentRoom.hostId !== this.playerId) return;
    const code = this.currentRoom.code;

    await this.request('/room/start', 'POST', {
      code,
      playerId: this.playerId,
    });

    this.currentRoom.state = 'playing';
    this.emit('room', this.currentRoom);
  }

  async sendSignal(toId: string, kind: 'offer' | 'answer' | 'ice', payload: string): Promise<void> {
    if (!this.currentRoom) return;
    await this.request('/room/signal', 'POST', {
      roomCode: this.currentRoom.code,
      fromId: this.playerId,
      toId,
      kind,
      payload,
    });
  }

  publishSnapshot(_s: NetPlayerSnapshot): void {
    // Relay is not offered on Turso proxy; gameplay requires WebRTC signaling (WebRtcDbAdapter)
  }

  publishEvent(_e: NetEvent): void {
    // Relay is not offered on Turso proxy; gameplay requires WebRTC signaling (WebRtcDbAdapter)
  }

  on<K extends keyof NetAdapterEvents>(
    k: K,
    cb: (v: NetAdapterEvents[K]) => void,
  ): Unsubscribe {
    let set = this.listeners.get(k);
    if (!set) {
      set = new Set();
      this.listeners.set(k, set);
    }
    set.add(cb as Listener<unknown>);
    return () => {
      set?.delete(cb as Listener<unknown>);
    };
  }

  serverNow(): number {
    return Date.now();
  }

  stats(): NetStats {
    return {
      rttMs: 60,
      jitterMs: 10,
      lossPct: 0,
      inBps: this.inBytes,
      outBps: this.outBytes,
      interpDelayMs: 200,
      transport: 'turso-proxy (http-pipeline)',
    };
  }

  private startPolling(code: RoomCode): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      void this.poll(code);
    }, 750);
  }

  private async poll(code: RoomCode): Promise<void> {
    try {
      // Poll signals
      const sigData = await this.request<{
        signals: Array<{ fromId: string; toId: string; kind: 'offer' | 'answer' | 'ice'; payload: string; createdAt: number }>;
      }>(`/room/signal?code=${encodeURIComponent(code)}&since=${this.lastSignalTime}`, 'GET');

      if (sigData.signals && sigData.signals.length > 0) {
        for (const sig of sigData.signals) {
          if (sig.createdAt > this.lastSignalTime) {
            this.lastSignalTime = sig.createdAt;
          }
          if (sig.toId === this.playerId || sig.toId === 'all') {
            // Signal received for this peer
          }
        }
      }
    } catch {
      // transient poll error
    }
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private emit<K extends keyof NetAdapterEvents>(k: K, value: NetAdapterEvents[K]): void {
    const set = this.listeners.get(k);
    if (set) {
      for (const cb of set) {
        (cb as Listener<NetAdapterEvents[K]>)(value);
      }
    }
  }
}

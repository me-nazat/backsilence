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
    mapId?: MapId;
    seed?: number;
    maxPlayers?: number;
    hostName?: string;
    hostId?: string;
    hostTag?: string;
    difficulty?: 'whisper' | 'normal' | 'deafening';
  }): Promise<RoomInfo & { ok: boolean; room: RoomInfo }> {
    const res = await this.request<{ ok?: boolean; code?: string; room: RoomInfo }>('/room/create', 'POST', {
      playerId: opts.hostId ?? this.playerId,
      host_id: opts.hostId ?? this.playerId,
      name: opts.hostName ?? 'Host',
      hostName: opts.hostName ?? 'Host',
      hostTag: opts.hostTag ?? '0001',
      mapId: opts.mapId ?? 'natatorium',
      seed: opts.seed ?? Date.now(),
      difficulty: opts.difficulty ?? 'normal',
      maxPlayers: opts.maxPlayers ?? 4,
    });

    const room: RoomInfo = res.room ?? {
      code: res.code ?? 'ROOM01',
      hostId: opts.hostId ?? this.playerId,
      mapId: opts.mapId ?? 'natatorium',
      seed: opts.seed ?? 12345,
      difficulty: opts.difficulty ?? 'normal',
      maxPlayers: opts.maxPlayers ?? 4,
      players: [{ id: opts.hostId ?? this.playerId, name: opts.hostName ?? 'Host', ready: true }],
      state: 'waiting',
    };

    this.currentRoom = room;
    this.emit('room', room);
    this.startPolling(room.code);
    return Object.assign(room, { ok: true, room });
  }

  async joinRoom(
    codeOrOpts: RoomCode | { code: RoomCode; playerId?: string; playerName?: string; playerTag?: string },
    profile?: { name: string },
  ): Promise<RoomInfo & { ok: boolean; room: RoomInfo }> {
    const code = typeof codeOrOpts === 'string' ? codeOrOpts : codeOrOpts.code;
    const name = typeof codeOrOpts === 'string' ? profile?.name ?? 'Guest' : codeOrOpts.playerName ?? profile?.name ?? 'Guest';
    const pId = typeof codeOrOpts === 'string' ? this.playerId : codeOrOpts.playerId ?? this.playerId;

    const res = await this.request<{ ok?: boolean; code?: string; room: RoomInfo }>('/room/join', 'POST', {
      code,
      playerId: pId,
      name,
    });

    const room = res.room ?? {
      code,
      hostId: 'host',
      mapId: 'natatorium',
      seed: 12345,
      difficulty: 'normal',
      maxPlayers: 4,
      players: [{ id: pId, name, ready: false }],
      state: 'waiting',
    };

    this.currentRoom = room;
    this.emit('room', room);
    this.startPolling(code);
    return Object.assign(room, { ok: true, room });
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

  async sendSignal(
    toIdOrOpts: string | { code: string; senderId?: string; targetId?: string; type?: string; payload: string },
    kind?: 'offer' | 'answer' | 'ice',
    payload?: string,
  ): Promise<void> {
    if (typeof toIdOrOpts === 'object') {
      await this.request('/room/signal', 'POST', {
        room_code: toIdOrOpts.code,
        sender_id: toIdOrOpts.senderId ?? this.playerId,
        type: toIdOrOpts.type ?? 'offer',
        payload: toIdOrOpts.payload,
      });
      return;
    }

    if (!this.currentRoom) return;
    await this.request('/room/signal', 'POST', {
      room_code: this.currentRoom.code,
      sender_id: this.playerId,
      type: kind ?? 'offer',
      payload: payload ?? '',
    });
  }

  async pollSignals(opts: { code: string; playerId?: string; lastId?: number }): Promise<{ signals: Array<Record<string, unknown>> }> {
    const q = new URLSearchParams({
      code: opts.code,
      after: String(opts.lastId || 0),
    });
    return this.request<{ signals: Array<Record<string, unknown>> }>(`/room/signal?${q.toString()}`, 'GET');
  }

  async registerPlayer(profile?: { name?: string }): Promise<{ ok: boolean; player?: Record<string, unknown>; error?: string }> {
    try {
      const pubkey = await Identity.exportPublicKeyJwk();
      const res = await this.request<{ player: Record<string, unknown> }>('/player/register', 'POST', {
        pubkey,
        name: profile?.name ?? (Identity.getProfile()?.name ?? 'Operator'),
      });
      return { ok: true, player: res.player };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async submitRun(run: Record<string, unknown>): Promise<{ ok: boolean; status?: string; error?: string }> {
    try {
      try {
        await this.registerPlayer();
      } catch {
        // Already registered or offline
      }

      const res = await this.request<{ success: boolean; status: string; run_id: string }>('/run/submit', 'POST', {
        run_id: run.runId ?? run.run_id,
        player_id: run.playerId ?? run.player_id ?? this.playerId,
        map_id: run.mapId ?? run.map_id,
        mode: run.mode,
        difficulty: run.difficulty,
        seed: run.seed,
        mutators: run.mutators ?? [],
        board: run.board,
        score: run.score,
        time_ms: run.timeMs ?? run.time_ms,
        noise_units: run.noiseUnits ?? run.noise_units,
        escaped: Boolean(run.escaped),
        sim_version: run.simVersion ?? run.sim_version ?? '1.0.0',
        sim_hash: run.simHash ?? run.sim_hash ?? 'sim-hash',
        replay: run.replay ?? '',
      });
      return { ok: true, status: res.status };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async fetchLeaderboard(params: { board?: string; map?: string; mode?: string; difficulty?: string }): Promise<{ runs: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>> }> {
    const q = new URLSearchParams();
    if (params.board) q.set('board', params.board);
    if (params.map) q.set('map', params.map);
    if (params.mode) q.set('mode', params.mode);
    if (params.difficulty) q.set('difficulty', params.difficulty);
    const data = await this.request<{ runs?: Array<Record<string, unknown>>; entries?: Array<Record<string, unknown>> }>(`/leaderboard?${q.toString()}`, 'GET');
    const runs = (data.runs || data.entries || []).map((r) => ({ ...r, runId: r['run_id'] ?? r['runId'] }));
    return { runs, entries: data.entries || runs };
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

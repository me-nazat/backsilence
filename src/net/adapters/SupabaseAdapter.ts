/* ── SupabaseAdapter.ts ───────────────────────────────────────────────────
 *  DatabaseNetworkAdapter implementation for Supabase.
 *  - PostgREST via fetch for rooms, room_players, and signals
 *  - Phoenix Channel WebSocket for low-latency Realtime broadcast relay
 *  - Uses dependency injection (NetDeps) for protocol-fake unit testing
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  AdapterCapabilities,
  AdapterConfig,
  DatabaseNetworkAdapter,
  LobbyPlayer,
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
import { createWithRetry, ROOM_EXPIRES_AFTER_MS } from '../core/RoomCode.js';
import {
  encodePhoenixMessage,
  decodePhoenixMessage,
  PHOENIX_TOPIC_HEARTBEAT,
  PHOENIX_EVENT_HEARTBEAT,
  PHOENIX_EVENT_JOIN,
  PHOENIX_EVENT_LEAVE,
  PHOENIX_EVENT_BROADCAST,
  SUPABASE_HEARTBEAT_INTERVAL_MS,
  SUPABASE_RECONNECT_BASE_MS,
  SUPABASE_RECONNECT_MAX_MS,
} from './supabaseProtocol.js';

type Listener<T> = (value: T) => void;

interface DbRoomRow {
  code: string;
  host_id: string;
  map_id: string;
  seed: number;
  difficulty: 'whisper' | 'normal' | 'deafening';
  max_players: number;
  state: 'lobby' | 'playing' | 'ended';
  protocol: number;
  created_at: number;
  expires_at: number;
}

interface DbPlayerRow {
  room_code: string;
  player_id: string;
  name: string;
  ready: number;
  joined_at: number;
  last_seen: number;
}

export class SupabaseAdapter implements DatabaseNetworkAdapter {
  readonly kind = 'supabase' as const;
  readonly capabilities: AdapterCapabilities = {
    realtime: 'push',
    reliableOrdered: true,
    maxMsgBytes: 65536,
    suggestedSnapshotHz: 10,
    suggestedInterpDelayMs: 200,
    supportsWebRtcSignaling: true,
  };

  private url = '';
  private key = '';
  private deps: NetDeps;
  readonly playerId: PlayerId;
  private currentRoom: RoomInfo | null = null;
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();

  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectBackoff = SUPABASE_RECONNECT_BASE_MS;
  private msgRef = 1;
  private joinRef = 1;

  private inBytes = 0;
  private outBytes = 0;
  private lastPingMs = 0;
  private measuredRtt = 45;

  constructor(deps?: NetDeps, playerId?: PlayerId) {
    this.deps = deps ?? defaultNetDeps();
    this.playerId = playerId ?? `p-${Math.random().toString(36).slice(2, 9)}`;
  }

  async connect(config: AdapterConfig): Promise<void> {
    if (!config.url || !config.key) {
      throw new Error('[SupabaseAdapter] Missing VITE_NET_URL or VITE_NET_KEY');
    }
    this.url = config.url.replace(/\/$/, '');
    this.key = config.key;
  }

  async disconnect(): Promise<void> {
    await this.leaveRoom();
    this.closeSocket();
    this.emit('disconnected', { reason: 'client disconnected' });
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
  }

  async createRoom(opts: {
    mapId: MapId;
    seed: number;
    maxPlayers: number;
    hostName: string;
    difficulty?: 'whisper' | 'normal' | 'deafening';
  }): Promise<RoomInfo> {
    return createWithRetry(
      async (code) => {
        const now = Date.now();
        const expiresAt = now + ROOM_EXPIRES_AFTER_MS;

        const body = {
          code,
          host_id: this.playerId,
          map_id: opts.mapId,
          seed: opts.seed,
          difficulty: opts.difficulty ?? 'normal',
          max_players: opts.maxPlayers,
          state: 'lobby',
          protocol: 1,
          created_at: now,
          expires_at: expiresAt,
        };

        const res = await this.deps.fetch(`${this.url}/rest/v1/rooms`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = new Error(`Supabase createRoom failed with HTTP ${res.status}`);
          (err as unknown as Record<string, unknown>)['status'] = res.status;
          throw err;
        }

        // Add host player
        await this.deps.fetch(`${this.url}/rest/v1/room_players`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            room_code: code,
            player_id: this.playerId,
            name: opts.hostName,
            ready: 1,
            joined_at: now,
            last_seen: now,
          }),
        });

        const room: RoomInfo = {
          code,
          hostId: this.playerId,
          mapId: opts.mapId,
          seed: opts.seed,
          difficulty: opts.difficulty ?? 'normal',
          maxPlayers: opts.maxPlayers,
          state: 'lobby',
          protocol: 1,
          createdAt: now,
          expiresAt,
          players: [
            {
              id: this.playerId,
              name: opts.hostName,
              ready: true,
              isHost: true,
              colorIndex: 0,
            },
          ],
        };

        this.currentRoom = room;
        this.emit('room', room);
        this.connectRealtime(code);
        return room;
      },
      6,
      this.deps.random,
    );
  }

  async joinRoom(code: RoomCode, profile: { name: string }): Promise<RoomInfo> {
    const res = await this.deps.fetch(
      `${this.url}/rest/v1/rooms?code=eq.${code}&select=*`,
      { headers: this.getHeaders() },
    );

    if (!res.ok) {
      throw new Error(`Failed to query room: HTTP ${res.status}`);
    }

    const rooms = (await res.json()) as DbRoomRow[];
    const row = rooms[0];
    if (!row) {
      throw new Error(`Room ${code} does not exist`);
    }

    if (row.expires_at < Date.now()) {
      throw new Error(`Room ${code} has expired`);
    }

    if (row.protocol !== 1) {
      throw new Error('Room protocol version mismatch. Update required.');
    }

    if (row.state !== 'lobby') {
      throw new Error(`Room is already ${row.state}`);
    }

    // Fetch players
    const pRes = await this.deps.fetch(
      `${this.url}/rest/v1/room_players?room_code=eq.${code}&select=*`,
      { headers: this.getHeaders() },
    );
    const existing = (await pRes.json()) as DbPlayerRow[];
    if (existing.length >= row.max_players) {
      throw new Error(`Room ${code} is full`);
    }

    const now = Date.now();
    await this.deps.fetch(`${this.url}/rest/v1/room_players`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        room_code: code,
        player_id: this.playerId,
        name: profile.name,
        ready: 0,
        joined_at: now,
        last_seen: now,
      }),
    });

    const players: LobbyPlayer[] = existing.map((p, idx) => ({
      id: p.player_id,
      name: p.name,
      ready: p.ready === 1,
      isHost: p.player_id === row.host_id,
      colorIndex: idx,
    }));

    players.push({
      id: this.playerId,
      name: profile.name,
      ready: false,
      isHost: false,
      colorIndex: players.length,
    });

    const room: RoomInfo = {
      code,
      hostId: row.host_id,
      mapId: row.map_id as MapId,
      seed: row.seed,
      difficulty: row.difficulty,
      maxPlayers: row.max_players,
      state: row.state,
      protocol: row.protocol,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      players,
    };

    this.currentRoom = room;
    this.emit('room', room);
    this.connectRealtime(code);
    return room;
  }

  async leaveRoom(): Promise<void> {
    if (!this.currentRoom) return;
    const code = this.currentRoom.code;

    try {
      await this.deps.fetch(
        `${this.url}/rest/v1/room_players?room_code=eq.${code}&player_id=eq.${this.playerId}`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
        },
      );
    } catch {
      // ignore
    }

    this.currentRoom = null;
    this.closeSocket();
  }

  async setReady(ready: boolean): Promise<void> {
    if (!this.currentRoom) return;
    const code = this.currentRoom.code;

    await this.deps.fetch(
      `${this.url}/rest/v1/room_players?room_code=eq.${code}&player_id=eq.${this.playerId}`,
      {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ ready: ready ? 1 : 0 }),
      },
    );

    const p = this.currentRoom.players.find((x) => x.id === this.playerId);
    if (p) {
      p.ready = ready;
      this.emit('room', this.currentRoom);
      this.sendPhoenixBroadcast('room_update', this.currentRoom);
    }
  }

  async startGame(): Promise<void> {
    if (!this.currentRoom || this.currentRoom.hostId !== this.playerId) return;
    const code = this.currentRoom.code;

    await this.deps.fetch(`${this.url}/rest/v1/rooms?code=eq.${code}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ state: 'playing' }),
    });

    this.currentRoom.state = 'playing';
    this.emit('room', this.currentRoom);
    this.sendPhoenixBroadcast('room_update', this.currentRoom);
  }

  publishSnapshot(s: NetPlayerSnapshot): void {
    this.outBytes += 48;
    this.sendPhoenixBroadcast('snap', s);
  }

  publishEvent(e: NetEvent): void {
    this.outBytes += 64;
    this.sendPhoenixBroadcast('game_event', e);
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
      rttMs: this.measuredRtt,
      jitterMs: 12,
      lossPct: 0,
      inBps: this.inBytes,
      outBps: this.outBytes,
      interpDelayMs: 200,
      transport: 'supabase-realtime (phoenix-ws)',
    };
  }

  private connectRealtime(code: RoomCode): void {
    if (!this.deps.WebSocket) return;
    this.closeSocket();

    const wsUrl = this.url
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:') + `/realtime/v1/websocket?apikey=${this.key}&vsn=2.0.0`;

    const topic = `realtime:room:${code.toLowerCase()}`;
    const ws = new this.deps.WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectBackoff = SUPABASE_RECONNECT_BASE_MS;

      // Join channel
      const joinMsg = encodePhoenixMessage({
        topic,
        event: PHOENIX_EVENT_JOIN,
        payload: { config: { broadcast: { self: false } } },
        ref: String(this.msgRef++),
        join_ref: String(this.joinRef++),
      });
      ws.send(joinMsg);

      // Heartbeats
      this.heartbeatInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          this.lastPingMs = Date.now();
          ws.send(
            encodePhoenixMessage({
              topic: PHOENIX_TOPIC_HEARTBEAT,
              event: PHOENIX_EVENT_HEARTBEAT,
              payload: {},
              ref: String(this.msgRef++),
            }),
          );
        }
      }, SUPABASE_HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      this.inBytes += ev.data.length;
      const msg = decodePhoenixMessage(ev.data);
      if (!msg) return;

      if (msg.event === 'phx_reply' && msg.topic === PHOENIX_TOPIC_HEARTBEAT) {
        if (this.lastPingMs > 0) {
          this.measuredRtt = Math.max(10, Date.now() - this.lastPingMs);
        }
      } else if (msg.event === PHOENIX_EVENT_BROADCAST) {
        const type = msg.payload['event'] as string | undefined;
        const payload = msg.payload['payload'];

        if (type === 'snap') {
          this.emit('snapshot', payload as NetPlayerSnapshot);
        } else if (type === 'game_event') {
          this.emit('event', payload as NetEvent);
        } else if (type === 'room_update') {
          this.emit('room', payload as RoomInfo);
        }
      }
    };

    ws.onclose = () => {
      if (this.currentRoom) {
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectBackoff = Math.min(this.reconnectBackoff * 2, SUPABASE_RECONNECT_MAX_MS);
          if (this.currentRoom) {
            this.connectRealtime(this.currentRoom.code);
          }
        }, this.reconnectBackoff);
      }
    };
  }

  private sendPhoenixBroadcast(event: string, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN || !this.currentRoom) return;
    const topic = `realtime:room:${this.currentRoom.code.toLowerCase()}`;
    const wire = encodePhoenixMessage({
      topic,
      event: PHOENIX_EVENT_BROADCAST,
      payload: {
        type: 'broadcast',
        event,
        payload,
      },
      ref: String(this.msgRef++),
    });
    this.ws.send(wire);
  }

  private closeSocket(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      if (this.currentRoom && this.ws.readyState === this.ws.OPEN) {
        const topic = `realtime:room:${this.currentRoom.code.toLowerCase()}`;
        this.ws.send(
          encodePhoenixMessage({
            topic,
            event: PHOENIX_EVENT_LEAVE,
            payload: {},
            ref: String(this.msgRef++),
          }),
        );
      }
      this.ws.close();
      this.ws = null;
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

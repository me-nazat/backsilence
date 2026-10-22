/* ── TursoAdapter.ts ───────────────────────────────────────────────────────
 *  DatabaseNetworkAdapter implementation for Turso / libSQL over HTTP.
 *  - Executes SQL statements via POST /v2/pipeline
 *  - Lobby and WebRTC signaling only (relay is NOT supported over HTTP polling)
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

type Listener<T> = (value: T) => void;

interface LibSqlArg {
  type: 'text' | 'integer' | 'float' | 'null';
  value: string;
}

interface LibSqlResponse {
  results: Array<{
    type: string;
    response?: {
      result?: {
        cols: Array<{ name: string }>;
        rows: LibSqlArg[][];
      };
    };
    error?: { message: string };
  }>;
}

export class TursoAdapter implements DatabaseNetworkAdapter {
  readonly kind = 'turso' as const;
  readonly capabilities: AdapterCapabilities = {
    realtime: 'poll',
    reliableOrdered: true,
    maxMsgBytes: 65536,
    suggestedSnapshotHz: 4,
    suggestedInterpDelayMs: 400,
    supportsWebRtcSignaling: true,
  };

  private url = '';
  private token = '';
  private deps: NetDeps;
  readonly playerId: PlayerId;
  private currentRoom: RoomInfo | null = null;
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  private inBytes = 0;
  private outBytes = 0;

  constructor(deps?: NetDeps, playerId?: PlayerId) {
    this.deps = deps ?? defaultNetDeps();
    this.playerId = playerId ?? `p-${Math.random().toString(36).slice(2, 9)}`;
  }

  async connect(config: AdapterConfig): Promise<void> {
    if (!config.url || !config.key) {
      throw new Error('[TursoAdapter] Missing VITE_NET_URL or VITE_NET_KEY');
    }
    this.url = config.url.replace(/\/$/, '');
    this.token = config.key;
  }

  async disconnect(): Promise<void> {
    await this.leaveRoom();
    this.stopPolling();
    this.emit('disconnected', { reason: 'client disconnected' });
  }

  private async execute(sql: string, args: LibSqlArg[] = []): Promise<LibSqlArg[][]> {
    const payload = {
      requests: [
        {
          type: 'execute',
          stmt: { sql, args },
        },
      ],
    };

    const res = await this.deps.fetch(`${this.url}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = new Error(`Turso pipeline failed: HTTP ${res.status}`);
      (err as unknown as Record<string, unknown>)['status'] = res.status;
      throw err;
    }

    const data = (await res.json()) as LibSqlResponse;
    const first = data.results[0];
    if (first?.error) {
      const err = new Error(`Turso SQL error: ${first.error.message}`);
      if (first.error.message.includes('UNIQUE constraint failed')) {
        (err as unknown as Record<string, unknown>)['status'] = 409;
      }
      throw err;
    }

    return first?.response?.result?.rows ?? [];
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

        await this.execute(
          `INSERT INTO rooms (code, host_id, map_id, seed, difficulty, max_players, state, protocol, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, 'lobby', 1, ?, ?)`,
          [
            { type: 'text', value: code },
            { type: 'text', value: this.playerId },
            { type: 'text', value: opts.mapId },
            { type: 'integer', value: String(opts.seed) },
            { type: 'text', value: opts.difficulty ?? 'normal' },
            { type: 'integer', value: String(opts.maxPlayers) },
            { type: 'integer', value: String(now) },
            { type: 'integer', value: String(expiresAt) },
          ],
        );

        await this.execute(
          `INSERT INTO room_players (room_code, player_id, name, ready, joined_at, last_seen)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [
            { type: 'text', value: code },
            { type: 'text', value: this.playerId },
            { type: 'text', value: opts.hostName },
            { type: 'integer', value: String(now) },
            { type: 'integer', value: String(now) },
          ],
        );

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
        this.startPolling(code);
        return room;
      },
      6,
      this.deps.random,
    );
  }

  async joinRoom(code: RoomCode, profile: { name: string }): Promise<RoomInfo> {
    const roomRows = await this.execute(
      `SELECT host_id, map_id, seed, difficulty, max_players, state, protocol, created_at, expires_at
       FROM rooms WHERE code = ?`,
      [{ type: 'text', value: code }],
    );

    if (roomRows.length === 0) {
      throw new Error(`Room ${code} does not exist`);
    }

    const row = roomRows[0]!;
    const expiresAt = Number(row[8]!.value);
    if (expiresAt < Date.now()) {
      throw new Error(`Room ${code} has expired`);
    }

    const protocol = Number(row[6]!.value);
    if (protocol !== 1) {
      throw new Error('Room protocol version mismatch. Update required.');
    }

    const state = row[5]!.value as RoomInfo['state'];
    if (state !== 'lobby') {
      throw new Error(`Room is already ${state}`);
    }

    const playerRows = await this.execute(
      `SELECT player_id, name, ready FROM room_players WHERE room_code = ?`,
      [{ type: 'text', value: code }],
    );

    const maxPlayers = Number(row[4]!.value);
    if (playerRows.length >= maxPlayers) {
      throw new Error(`Room ${code} is full`);
    }

    const now = Date.now();
    await this.execute(
      `INSERT INTO room_players (room_code, player_id, name, ready, joined_at, last_seen)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [
        { type: 'text', value: code },
        { type: 'text', value: this.playerId },
        { type: 'text', value: profile.name },
        { type: 'integer', value: String(now) },
        { type: 'integer', value: String(now) },
      ],
    );

    const players: LobbyPlayer[] = playerRows.map((r, idx) => ({
      id: r[0]!.value,
      name: r[1]!.value,
      ready: Number(r[2]!.value) === 1,
      isHost: r[0]!.value === row[0]!.value,
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
      hostId: row[0]!.value,
      mapId: row[1]!.value as MapId,
      seed: Number(row[2]!.value),
      difficulty: row[3]!.value as 'whisper' | 'normal' | 'deafening',
      maxPlayers,
      state,
      protocol,
      createdAt: Number(row[7]!.value),
      expiresAt,
      players,
    };

    this.currentRoom = room;
    this.emit('room', room);
    this.startPolling(code);
    return room;
  }

  async leaveRoom(): Promise<void> {
    if (!this.currentRoom) return;
    const code = this.currentRoom.code;

    try {
      await this.execute(
        `DELETE FROM room_players WHERE room_code = ? AND player_id = ?`,
        [
          { type: 'text', value: code },
          { type: 'text', value: this.playerId },
        ],
      );
    } catch {
      // ignore
    }

    this.currentRoom = null;
    this.stopPolling();
  }

  async setReady(ready: boolean): Promise<void> {
    if (!this.currentRoom) return;
    const code = this.currentRoom.code;

    await this.execute(
      `UPDATE room_players SET ready = ? WHERE room_code = ? AND player_id = ?`,
      [
        { type: 'integer', value: ready ? '1' : '0' },
        { type: 'text', value: code },
        { type: 'text', value: this.playerId },
      ],
    );

    const p = this.currentRoom.players.find((x) => x.id === this.playerId);
    if (p) {
      p.ready = ready;
      this.emit('room', this.currentRoom);
    }
  }

  async startGame(): Promise<void> {
    if (!this.currentRoom || this.currentRoom.hostId !== this.playerId) return;
    const code = this.currentRoom.code;

    await this.execute(`UPDATE rooms SET state = 'playing' WHERE code = ?`, [
      { type: 'text', value: code },
    ]);

    this.currentRoom.state = 'playing';
    this.emit('room', this.currentRoom);
  }

  publishSnapshot(_s: NetPlayerSnapshot): void {
    // Relay is not offered on Turso; gameplay requires WebRTC signaling (WebRtcDbAdapter)
  }

  publishEvent(_e: NetEvent): void {
    // Relay is not offered on Turso; gameplay requires WebRTC signaling (WebRtcDbAdapter)
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
      rttMs: 250,
      jitterMs: 50,
      lossPct: 0,
      inBps: this.inBytes,
      outBps: this.outBytes,
      interpDelayMs: 400,
      transport: 'turso-libsql (http-pipeline-poll)',
    };
  }

  private startPolling(code: RoomCode): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      void this.pollRoom(code);
    }, 500);
  }

  private async pollRoom(code: RoomCode): Promise<void> {
    try {
      const roomRows = await this.execute(
        `SELECT host_id, state FROM rooms WHERE code = ?`,
        [{ type: 'text', value: code }],
      );
      if (roomRows.length === 0) return;

      const playerRows = await this.execute(
        `SELECT player_id, name, ready FROM room_players WHERE room_code = ?`,
        [{ type: 'text', value: code }],
      );

      if (this.currentRoom) {
        this.currentRoom.hostId = roomRows[0]![0]!.value;
        this.currentRoom.state = roomRows[0]![1]!.value as RoomInfo['state'];
        this.currentRoom.players = playerRows.map((r, idx) => ({
          id: r[0]!.value,
          name: r[1]!.value,
          ready: Number(r[2]!.value) === 1,
          isHost: r[0]!.value === this.currentRoom?.hostId,
          colorIndex: idx,
        }));
        this.emit('room', this.currentRoom);
      }
    } catch {
      // ignore transient poll error
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

/* ── LocalTabAdapter.ts ───────────────────────────────────────────────────
 *  Multi-tab development adapter using BroadcastChannel and localStorage.
 *  Allows 2–4 browser tabs to play co-op on the same machine without any
 *  database or backend required (?net=local).
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
import { generateRoomCode } from '../core/RoomCode.js';

const STORAGE_PREFIX = 'backsilence.localtab.room.';

type Listener<T> = (value: T) => void;

interface WireMessage {
  type: 'snap' | 'event' | 'room' | 'ping' | 'pong';
  senderId: PlayerId;
  payload: unknown;
  t: number;
}

export class LocalTabAdapter implements DatabaseNetworkAdapter {
  readonly kind = 'local-tab' as const;
  readonly capabilities: AdapterCapabilities = {
    realtime: 'push',
    reliableOrdered: true,
    maxMsgBytes: 65536,
    suggestedSnapshotHz: 15,
    suggestedInterpDelayMs: 60,
    supportsWebRtcSignaling: false,
  };

  readonly playerId: PlayerId;
  private channel: BroadcastChannel | null = null;
  private currentRoomCode: RoomCode | null = null;
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingTime = 0;
  private measuredRtt = 2;
  private inBytes = 0;
  private outBytes = 0;

  constructor(playerId?: PlayerId) {
    this.playerId = playerId ?? `tab-${Math.random().toString(36).slice(2, 8)}`;
    this.setupUnloadHandler();
  }

  private setupUnloadHandler(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        void this.leaveRoom();
      });
      window.addEventListener('storage', (e) => {
        if (this.currentRoomCode && e.key === STORAGE_PREFIX + this.currentRoomCode && e.newValue) {
          try {
            const room = JSON.parse(e.newValue) as RoomInfo;
            this.emit('room', room);
          } catch {
            // ignore
          }
        }
      });
    }
  }

  async connect(_config: AdapterConfig): Promise<void> {
    // LocalTab requires no external server connect
  }

  async disconnect(): Promise<void> {
    await this.leaveRoom();
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.emit('disconnected', { reason: 'local-tab adapter disconnected' });
  }

  async createRoom(opts: {
    mapId: MapId;
    seed: number;
    maxPlayers: number;
    hostName: string;
    difficulty?: 'whisper' | 'normal' | 'deafening';
  }): Promise<RoomInfo> {
    const code: RoomCode = generateRoomCode();
    const host: LobbyPlayer = {
      id: this.playerId,
      name: opts.hostName,
      ready: true,
      isHost: true,
      colorIndex: 0,
    };
    const room: RoomInfo = {
      code,
      hostId: this.playerId,
      mapId: opts.mapId,
      seed: opts.seed,
      maxPlayers: opts.maxPlayers,
      difficulty: opts.difficulty ?? 'normal',
      state: 'lobby',
      protocol: 1,
      createdAt: Date.now(),
      players: [host],
    };

    this.currentRoomCode = code;
    this.saveRoom(room);
    this.openChannel(code);
    this.startHeartbeat();
    this.emit('room', room);
    return room;
  }

  async joinRoom(code: RoomCode, profile: { name: string }): Promise<RoomInfo> {
    const room = this.loadRoom(code);
    if (!room) {
      throw new Error(`Room ${code} not found in local tabs`);
    }
    if (room.players.length >= room.maxPlayers) {
      throw new Error(`Room ${code} is full`);
    }
    if (room.state !== 'lobby') {
      throw new Error(`Room ${code} is already playing`);
    }

    const player: LobbyPlayer = {
      id: this.playerId,
      name: profile.name,
      ready: false,
      isHost: false,
      colorIndex: room.players.length,
    };

    room.players.push(player);
    this.currentRoomCode = code;
    this.saveRoom(room);
    this.openChannel(code);
    this.startHeartbeat();
    this.emit('room', room);
    this.postMessage({ type: 'room', senderId: this.playerId, payload: room, t: Date.now() });
    return room;
  }

  async leaveRoom(): Promise<void> {
    if (!this.currentRoomCode) return;
    const room = this.loadRoom(this.currentRoomCode);
    if (room) {
      room.players = room.players.filter((p) => p.id !== this.playerId);
      if (room.players.length === 0) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_PREFIX + this.currentRoomCode);
        }
      } else {
        if (room.hostId === this.playerId && room.players[0]) {
          room.hostId = room.players[0].id;
          room.players[0].isHost = true;
          this.emit('host-changed', { hostId: room.hostId });
        }
        this.saveRoom(room);
        this.postMessage({ type: 'room', senderId: this.playerId, payload: room, t: Date.now() });
      }
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.currentRoomCode = null;
  }

  async setReady(ready: boolean): Promise<void> {
    if (!this.currentRoomCode) return;
    const room = this.loadRoom(this.currentRoomCode);
    if (room) {
      const p = room.players.find((x) => x.id === this.playerId);
      if (p) {
        p.ready = ready;
        this.saveRoom(room);
        this.emit('room', room);
        this.postMessage({ type: 'room', senderId: this.playerId, payload: room, t: Date.now() });
      }
    }
  }

  async startGame(): Promise<void> {
    if (!this.currentRoomCode) return;
    const room = this.loadRoom(this.currentRoomCode);
    if (room && room.hostId === this.playerId) {
      room.state = 'playing';
      this.saveRoom(room);
      this.emit('room', room);
      this.postMessage({ type: 'room', senderId: this.playerId, payload: room, t: Date.now() });
    }
  }

  publishSnapshot(s: NetPlayerSnapshot): void {
    this.outBytes += 48;
    this.postMessage({ type: 'snap', senderId: this.playerId, payload: s, t: Date.now() });
  }

  publishEvent(e: NetEvent): void {
    this.outBytes += 64;
    this.postMessage({ type: 'event', senderId: this.playerId, payload: e, t: Date.now() });
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
      jitterMs: 1,
      lossPct: 0,
      inBps: this.inBytes,
      outBps: this.outBytes,
      interpDelayMs: 60,
      transport: 'local-tab (broadcast-channel)',
    };
  }

  async claimHost(): Promise<boolean> {
    if (!this.currentRoomCode) return false;
    const room = this.loadRoom(this.currentRoomCode);
    if (!room) return false;

    room.hostId = this.playerId;
    for (const p of room.players) {
      p.isHost = p.id === this.playerId;
    }
    this.saveRoom(room);
    this.emit('room', room);
    this.emit('host-changed', { hostId: this.playerId });
    this.postMessage({ type: 'room', senderId: this.playerId, payload: room, t: Date.now() });
    return true;
  }

  private openChannel(code: RoomCode): void {
    if (typeof BroadcastChannel === 'undefined') return;
    if (this.channel) this.channel.close();

    this.channel = new BroadcastChannel(`backsilence-room-${code}`);
    this.channel.onmessage = (ev: MessageEvent<WireMessage>) => {
      const msg = ev.data;
      if (!msg || msg.senderId === this.playerId) return;

      this.inBytes += 64;
      switch (msg.type) {
        case 'snap':
          this.emit('snapshot', msg.payload as NetPlayerSnapshot);
          break;
        case 'event':
          this.emit('event', msg.payload as NetEvent);
          break;
        case 'room':
          this.emit('room', msg.payload as RoomInfo);
          break;
        case 'ping':
          this.postMessage({ type: 'pong', senderId: this.playerId, payload: msg.t, t: Date.now() });
          break;
        case 'pong':
          if (typeof msg.payload === 'number') {
            this.measuredRtt = Math.max(1, Date.now() - msg.payload);
          }
          break;
      }
    };
  }

  private postMessage(msg: WireMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch {
        // channel closed
      }
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.currentRoomCode) {
        this.lastPingTime = Date.now();
        this.postMessage({ type: 'ping', senderId: this.playerId, payload: null, t: this.lastPingTime });
      }
    }, 3000);
  }

  private loadRoom(code: RoomCode): RoomInfo | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_PREFIX + code);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RoomInfo;
    } catch {
      return null;
    }
  }

  private saveRoom(room: RoomInfo): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_PREFIX + room.code, JSON.stringify(room));
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

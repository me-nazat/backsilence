/* ── MemoryHubAdapter.ts ──────────────────────────────────────────────────
 *  In-process multi-peer adapter connected through a shared MemoryHub.
 *  Supports realistic NetSim network degradation:
 *  - Artificial latency and jitter
 *  - Packet loss percentage
 *  - Packet reordering and duplication
 *  - Simulated disconnections
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

export interface NetSimConfig {
  latencyMs?: number;
  jitterMs?: number;
  lossPct?: number;
  reorderPct?: number;
  duplicatePct?: number;
  bandwidthBps?: number;
  disconnected?: boolean;
}

type Listener<T> = (value: T) => void;

export class MemoryHub {
  private rooms = new Map<RoomCode, RoomInfo>();
  private adapters = new Map<PlayerId, MemoryHubAdapter>();
  simConfig: NetSimConfig = {};

  register(adapter: MemoryHubAdapter): void {
    this.adapters.set(adapter.playerId, adapter);
  }

  unregister(adapter: MemoryHubAdapter): void {
    this.adapters.delete(adapter.playerId);
  }

  getRoom(code: RoomCode): RoomInfo | undefined {
    return this.rooms.get(code);
  }

  setRoom(code: RoomCode, room: RoomInfo): void {
    this.rooms.set(code, room);
  }

  deleteRoom(code: RoomCode): void {
    this.rooms.delete(code);
  }

  broadcastRoom(room: RoomInfo): void {
    this.rooms.set(room.code, room);
    for (const player of room.players) {
      const adapter = this.adapters.get(player.id);
      if (adapter && adapter.currentRoomCode === room.code) {
        adapter.deliverRoom(room);
      }
    }
  }

  routeSnapshot(senderId: PlayerId, roomCode: RoomCode, snapshot: NetPlayerSnapshot): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    for (const player of room.players) {
      if (player.id !== senderId) {
        const target = this.adapters.get(player.id);
        if (target) {
          this.scheduleDelivery(() => {
            target.deliverSnapshot(snapshot);
          });
        }
      }
    }
  }

  routeEvent(senderId: PlayerId, roomCode: RoomCode, event: NetEvent): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    for (const player of room.players) {
      if (player.id !== senderId) {
        const target = this.adapters.get(player.id);
        if (target) {
          this.scheduleDelivery(() => {
            target.deliverEvent(event);
          });
        }
      }
    }
  }

  private scheduleDelivery(fn: () => void): void {
    if (this.simConfig.disconnected) return;

    // Loss simulation
    if (this.simConfig.lossPct && Math.random() * 100 < this.simConfig.lossPct) {
      return;
    }

    const base = this.simConfig.latencyMs ?? 0;
    const jitter = this.simConfig.jitterMs ? (Math.random() * 2 - 1) * this.simConfig.jitterMs : 0;
    let delay = Math.max(0, base + jitter);

    // Reorder simulation
    if (this.simConfig.reorderPct && Math.random() * 100 < this.simConfig.reorderPct) {
      delay += 80;
    }

    setTimeout(() => {
      if (!this.simConfig.disconnected) fn();
    }, delay);

    // Duplicate simulation
    if (this.simConfig.duplicatePct && Math.random() * 100 < this.simConfig.duplicatePct) {
      setTimeout(() => {
        if (!this.simConfig.disconnected) fn();
      }, delay + 20);
    }
  }

  clear(): void {
    this.rooms.clear();
    this.adapters.clear();
    this.simConfig = {};
  }
}

export class MemoryHubAdapter implements DatabaseNetworkAdapter {
  readonly kind = 'memory' as const;
  readonly capabilities: AdapterCapabilities = {
    realtime: 'push',
    reliableOrdered: true,
    maxMsgBytes: 65536,
    suggestedSnapshotHz: 15,
    suggestedInterpDelayMs: 120,
    supportsWebRtcSignaling: true,
  };

  readonly hub: MemoryHub;
  readonly playerId: PlayerId;
  currentRoomCode: RoomCode | null = null;
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  private inBytes = 0;
  private outBytes = 0;

  constructor(hub: MemoryHub, playerId: PlayerId) {
    this.hub = hub;
    this.playerId = playerId;
    hub.register(this);
  }

  async connect(_config: AdapterConfig): Promise<void> {
    // In-memory ready
  }

  async disconnect(): Promise<void> {
    await this.leaveRoom();
    this.hub.unregister(this);
    this.emit('disconnected', { reason: 'memory adapter disconnected' });
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
    this.hub.setRoom(code, room);
    this.deliverRoom(room);
    return room;
  }

  async joinRoom(code: RoomCode, profile: { name: string }): Promise<RoomInfo> {
    const room = this.hub.getRoom(code);
    if (!room) {
      throw new Error(`Room ${code} not found`);
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
    this.hub.broadcastRoom(room);
    return room;
  }

  async leaveRoom(): Promise<void> {
    if (!this.currentRoomCode) return;
    const room = this.hub.getRoom(this.currentRoomCode);
    if (room) {
      room.players = room.players.filter((p) => p.id !== this.playerId);
      if (room.players.length === 0) {
        this.hub.deleteRoom(this.currentRoomCode);
      } else {
        if (room.hostId === this.playerId && room.players[0]) {
          room.hostId = room.players[0].id;
          room.players[0].isHost = true;
          this.emit('host-changed', { hostId: room.hostId });
        }
        this.hub.broadcastRoom(room);
      }
    }
    this.currentRoomCode = null;
  }

  async setReady(ready: boolean): Promise<void> {
    if (!this.currentRoomCode) return;
    const room = this.hub.getRoom(this.currentRoomCode);
    if (room) {
      const p = room.players.find((x) => x.id === this.playerId);
      if (p) {
        p.ready = ready;
        this.hub.broadcastRoom(room);
      }
    }
  }

  async startGame(): Promise<void> {
    if (!this.currentRoomCode) return;
    const room = this.hub.getRoom(this.currentRoomCode);
    if (room && room.hostId === this.playerId) {
      room.state = 'playing';
      this.hub.broadcastRoom(room);
    }
  }

  publishSnapshot(s: NetPlayerSnapshot): void {
    if (!this.currentRoomCode) return;
    this.outBytes += 48;
    this.hub.routeSnapshot(this.playerId, this.currentRoomCode, s);
  }

  publishEvent(e: NetEvent): void {
    if (!this.currentRoomCode) return;
    this.outBytes += 64;
    this.hub.routeEvent(this.playerId, this.currentRoomCode, e);
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
    const lat = this.hub.simConfig.latencyMs ?? 0;
    const jit = this.hub.simConfig.jitterMs ?? 0;
    const loss = this.hub.simConfig.lossPct ?? 0;
    return {
      rttMs: lat * 2,
      jitterMs: jit,
      lossPct: loss,
      inBps: this.inBytes,
      outBps: this.outBytes,
      interpDelayMs: Math.max(120, 2 * jit + 40),
      transport: 'memory-hub',
    };
  }

  async kick(id: PlayerId): Promise<void> {
    if (!this.currentRoomCode) return;
    const room = this.hub.getRoom(this.currentRoomCode);
    if (room && room.hostId === this.playerId) {
      room.players = room.players.filter((p) => p.id !== id);
      this.hub.broadcastRoom(room);
    }
  }

  async claimHost(): Promise<boolean> {
    if (!this.currentRoomCode) return false;
    const room = this.hub.getRoom(this.currentRoomCode);
    if (!room) return false;

    // Atomically take over host
    room.hostId = this.playerId;
    for (const p of room.players) {
      p.isHost = p.id === this.playerId;
    }
    this.hub.broadcastRoom(room);
    this.emit('host-changed', { hostId: this.playerId });
    return true;
  }

  deliverRoom(room: RoomInfo): void {
    this.inBytes += 128;
    this.emit('room', room);
  }

  deliverSnapshot(snap: NetPlayerSnapshot): void {
    this.inBytes += 48;
    this.emit('snapshot', snap);
  }

  deliverEvent(event: NetEvent): void {
    this.inBytes += 64;
    this.emit('event', event);
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

/* ── LoopbackAdapter.ts ───────────────────────────────────────────────────
 *  In-process single-player DatabaseNetworkAdapter with zero network I/O.
 *  Serves as the host for solo mode, ensuring the single-player path
 *  shares the exact same architecture as multiplayer.
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
  RoomCode,
  RoomInfo,
  Unsubscribe,
} from '../../types/contracts.js';
import { generateRoomCode } from '../core/RoomCode.js';

type Listener<T> = (value: T) => void;

export class LoopbackAdapter implements DatabaseNetworkAdapter {
  readonly kind = 'loopback' as const;
  readonly capabilities: AdapterCapabilities = {
    realtime: 'push',
    reliableOrdered: true,
    maxMsgBytes: 65536,
    suggestedSnapshotHz: 15,
    suggestedInterpDelayMs: 0,
    supportsWebRtcSignaling: false,
  };

  private room: RoomInfo | null = null;
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  private localPlayerId = 'local-player';

  async connect(_config: AdapterConfig): Promise<void> {
    // Zero-network: local in-memory only
  }

  async disconnect(): Promise<void> {
    this.room = null;
    this.emit('disconnected', { reason: 'local disconnect' });
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
      id: this.localPlayerId,
      name: opts.hostName,
      ready: true,
      isHost: true,
      colorIndex: 0,
    };
    const roomInfo: RoomInfo = {
      code,
      hostId: this.localPlayerId,
      mapId: opts.mapId,
      seed: opts.seed,
      maxPlayers: opts.maxPlayers,
      difficulty: opts.difficulty ?? 'normal',
      state: 'lobby',
      protocol: 1,
      createdAt: Date.now(),
      players: [host],
    };
    this.room = roomInfo;
    this.emit('room', roomInfo);
    return roomInfo;
  }

  async joinRoom(_code: RoomCode, profile: { name: string }): Promise<RoomInfo> {
    return this.createRoom({
      mapId: 'poolrooms',
      seed: Date.now(),
      maxPlayers: 1,
      hostName: profile.name,
    });
  }

  async leaveRoom(): Promise<void> {
    this.room = null;
  }

  async setReady(ready: boolean): Promise<void> {
    if (this.room) {
      const player = this.room.players[0];
      if (player) {
        player.ready = ready;
        this.emit('room', this.room);
      }
    }
  }

  async startGame(): Promise<void> {
    if (this.room) {
      this.room.state = 'playing';
      this.emit('room', this.room);
    }
  }

  publishSnapshot(_s: NetPlayerSnapshot): void {
    // Loopback has no remote peers
  }

  publishEvent(e: NetEvent): void {
    // In loopback, event echoes back immediately if needed
    this.emit('event', e);
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
      rttMs: 0,
      jitterMs: 0,
      lossPct: 0,
      inBps: 0,
      outBps: 0,
      interpDelayMs: 0,
      transport: 'loopback',
    };
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

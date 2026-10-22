/* ── NullNetworkAdapter.ts ────────────────────────────────────────────────
 *  A working offline implementation of DatabaseNetworkAdapter.
 *  Simulates a one-player room locally with no network dependency.
 *  Used for single-player mode and as a development fallback.
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  AdapterConfig,
  DatabaseNetworkAdapter,
  LobbyPlayer,
  MapId,
  NetAdapterEvents,
  NetEvent,
  NetPlayerSnapshot,
  RoomCode,
  RoomInfo,
  Unsubscribe,
} from '../../types/contracts.js';
import { generateRoomCode } from '../../app/Router.js';
import { mulberry32 } from '../../procedural/core/prng.js';

type Listener<T> = (value: T) => void;

export class NullNetworkAdapter implements DatabaseNetworkAdapter {
  readonly kind = 'null' as const;

  private room: RoomInfo | null = null;
  private readonly listeners: Map<string, Set<Listener<unknown>>> = new Map();
  private localPlayerId = 'local-player';

  async connect(_config: AdapterConfig): Promise<void> {
    // No-op: offline mode
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
  }): Promise<RoomInfo> {
    const rng = mulberry32(Date.now());
    const code: RoomCode = generateRoomCode(rng);
    const host: LobbyPlayer = {
      id: this.localPlayerId,
      name: opts.hostName,
      ready: true,
      isHost: true,
    };
    this.room = {
      code,
      hostId: this.localPlayerId,
      mapId: opts.mapId,
      seed: opts.seed,
      maxPlayers: opts.maxPlayers,
      state: 'lobby',
      createdAt: Date.now(),
      players: [host],
    };
    this.emit('room', this.room);
    return this.room;
  }

  async joinRoom(_code: RoomCode, profile: { name: string }): Promise<RoomInfo> {
    // In offline mode, "joining" a room just creates one
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

  async setReady(_ready: boolean): Promise<void> {
    if (this.room) {
      const player = this.room.players[0];
      if (player) {
        player.ready = _ready;
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
    // No-op: no remote peers in offline mode
  }

  publishEvent(_e: NetEvent): void {
    // No-op: no remote peers in offline mode
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

  private emit<K extends keyof NetAdapterEvents>(k: K, value: NetAdapterEvents[K]): void {
    const set = this.listeners.get(k);
    if (set) {
      for (const cb of set) {
        (cb as Listener<NetAdapterEvents[K]>)(value);
      }
    }
  }
}

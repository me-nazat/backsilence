/* ── CustomAdapter.example.ts ─────────────────────────────────────────────
 *  Custom DatabaseNetworkAdapter template for BackSilence.
 *  Follow these 5 steps to connect any custom backend (e.g. Cloudflare D1/DO,
 *  PocketBase, Convex, custom WebSocket server):
 *
 *  1. Implement DatabaseNetworkAdapter interface.
 *  2. Call AdapterRegistry.register('my-backend', (config, deps) => new MyAdapter(config, deps)).
 *  3. In .env set VITE_NET_PROVIDER=my-backend.
 *  4. In .env set VITE_NET_URL and VITE_NET_KEY.
 *  5. Run `npm run verify` to test your adapter.
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

type Listener<T> = (value: T) => void;

export class CustomDatabaseAdapter implements DatabaseNetworkAdapter {
  readonly kind = 'null'; // Use your provider identifier
  readonly capabilities: AdapterCapabilities = {
    realtime: 'push',
    reliableOrdered: true,
    maxMsgBytes: 65536,
    suggestedSnapshotHz: 15,
    suggestedInterpDelayMs: 100,
    supportsWebRtcSignaling: true,
  };

  private currentRoom: RoomInfo | null = null;
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  readonly playerId: PlayerId = `player-${Math.random().toString(36).slice(2, 8)}`;

  async connect(_config: AdapterConfig): Promise<void> {
    // 1. Establish initial connection or auth token verification
  }

  async disconnect(): Promise<void> {
    // Clean up connections, timers, sockets
    this.emit('disconnected', { reason: 'custom adapter disconnected' });
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
    this.currentRoom = room;
    this.emit('room', room);
    return room;
  }

  async joinRoom(code: RoomCode, profile: { name: string }): Promise<RoomInfo> {
    // Fetch room from your backend, append player, subscribe to room channel
    const room: RoomInfo = {
      code,
      hostId: 'host-id',
      mapId: 'poolrooms',
      seed: 12345,
      maxPlayers: 4,
      state: 'lobby',
      protocol: 1,
      createdAt: Date.now(),
      players: [
        { id: 'host-id', name: 'Host', ready: true, isHost: true, colorIndex: 0 },
        { id: this.playerId, name: profile.name, ready: false, isHost: false, colorIndex: 1 },
      ],
    };
    this.currentRoom = room;
    this.emit('room', room);
    return room;
  }

  async leaveRoom(): Promise<void> {
    this.currentRoom = null;
  }

  async setReady(ready: boolean): Promise<void> {
    if (this.currentRoom) {
      const p = this.currentRoom.players.find((x) => x.id === this.playerId);
      if (p) p.ready = ready;
      this.emit('room', this.currentRoom);
    }
  }

  async startGame(): Promise<void> {
    if (this.currentRoom) {
      this.currentRoom.state = 'playing';
      this.emit('room', this.currentRoom);
    }
  }

  publishSnapshot(_s: NetPlayerSnapshot): void {
    // Stream player snapshot over UDP, WebRTC, WebSocket, or SSE
  }

  publishEvent(_e: NetEvent): void {
    // Deliver reliable gameplay event to peers
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
      rttMs: 25,
      jitterMs: 5,
      lossPct: 0,
      inBps: 1024,
      outBps: 1024,
      interpDelayMs: 100,
      transport: 'custom-backend',
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

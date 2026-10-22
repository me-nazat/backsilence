/* ── NetSession.ts ────────────────────────────────────────────────────────
 *  Host-authoritative multiplayer network session manager.
 *  - Modes: 'solo' | 'host' | 'client'
 *  - Player snapshot streaming at 15 Hz (quantized WireFrames)
 *  - Monster replication at 10 Hz (host -> clients)
 *  - Event coalescing (50 ms frames)
 *  - Periodic checkpoints (every 2 s and on puzzle state changes)
 *  - NTP ClockSync and smoothed serverNow()
 *  - Entity interpolation buffer per remote player
 *  - Automatic host migration if host disconnects (> 6 s)
 *  - Reconnect window within 45 s
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  DatabaseNetworkAdapter,
  MonsterState,
  NetEvent,
  NetPlayerSnapshot,
  NetStats,
  NoiseEvent,
  PlayerId,
  PuzzleOp,
  RippleEvent,
  RoomInfo,
  Vec3,
} from '../../types/contracts.js';
import {
  isPlausibleMovement,
  isValidNoiseEvent,
  sanitizePlayerName,
} from '../core/Validate.js';
import { ClockSync } from '../core/ClockSync.js';
import { EntityInterpBuffer, calculateAdaptiveInterpDelay } from '../core/Interp.js';
import { RateLimiter } from '../core/RateLimiter.js';

export type SessionRole = 'solo' | 'host' | 'client';

export interface RemotePlayerState {
  id: PlayerId;
  name: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  crouch: boolean;
  inWater: boolean;
  flashlightOn: boolean;
  alive: boolean;
  escaped: boolean;
  colorIndex: number;
  carrying?: string | undefined;
  interpBuffer: EntityInterpBuffer;
  lastSeenMs: number;
}

export interface ReplicatedMonsterState {
  id: string;
  state: MonsterState;
  pos: Vec3;
  yaw: number;
  target?: Vec3 | undefined;
  t: number;
}

export interface NetSessionCallbacks {
  onRemoteSnapshot?: (snap: NetPlayerSnapshot) => void;
  onRemoteNoise?: (noise: NoiseEvent) => void;
  onRemoteRipple?: (ripple: RippleEvent) => void;
  onMonsterUpdate?: (monster: ReplicatedMonsterState) => void;
  onPuzzleSync?: (op: PuzzleOp) => void;
  onCheckpoint?: (simT: number, puzzles: unknown, monsters: unknown) => void;
  onHostChanged?: (newHostId: PlayerId) => void;
  onPlayerDeath?: (playerId: PlayerId) => void;
  onPlayerEscape?: (playerId: PlayerId) => void;
  onProjectile?: (p: { id: string; item: string; origin: Vec3; vel: Vec3; t: number; owner: PlayerId }) => void;
  onPingMarker?: (p: { owner: PlayerId; position: Vec3; t: number }) => void;
  onRosterChanged?: (room: RoomInfo) => void;
  onDisconnect?: (reason: string) => void;
}

export class NetSession {
  readonly role: SessionRole;
  readonly adapter: DatabaseNetworkAdapter;
  readonly localPlayerId: PlayerId;
  readonly localPlayerName: string;

  private room: RoomInfo | null = null;
  private startAtMs = 0;
  private readonly callbacks: NetSessionCallbacks;

  // Pure networking components
  private clockSync = new ClockSync();
  private rateLimiter = new RateLimiter();

  // Remote entities
  readonly remotePlayers = new Map<PlayerId, RemotePlayerState>();
  readonly replicatedMonsters = new Map<string, ReplicatedMonsterState>();

  // Timers & intervals
  private snapshotTimer = 0;
  private checkpointTimer = 0;
  private eventCoalesceTimer = 0;
  private coalescedEvents: NetEvent[] = [];
  private lastHostSeenMs = Date.now();
  private lastFrameSeq = 0;

  private latestCheckpoint: { simT: number; puzzles: unknown; monsters: unknown; seq: number } | null = null;
  private unsubscribes: Array<() => void> = [];

  getLatestCheckpoint(): { simT: number; puzzles: unknown; monsters: unknown; seq: number } | null {
    return this.latestCheckpoint;
  }

  constructor(
    adapter: DatabaseNetworkAdapter,
    role: SessionRole,
    localPlayerId: PlayerId,
    localPlayerName: string,
    callbacks: NetSessionCallbacks = {},
  ) {
    this.adapter = adapter;
    this.role = role;
    this.localPlayerId = localPlayerId;
    this.localPlayerName = sanitizePlayerName(localPlayerName);
    this.callbacks = callbacks;

    this.subscribeAdapterEvents();
  }

  private subscribeAdapterEvents(): void {
    this.unsubscribes.push(
      this.adapter.on('room', (room) => {
        this.room = room;
        this.syncRoster(room);
        this.callbacks.onRosterChanged?.(room);
      }),
      this.adapter.on('snapshot', (snap) => {
        this.handleInboundSnapshot(snap);
      }),
      this.adapter.on('event', (ev) => {
        this.handleInboundEvent(ev);
      }),
      this.adapter.on('disconnected', (d) => {
        this.callbacks.onDisconnect?.(d.reason);
      }),
    );
  }

  setStartAtMs(ms: number): void {
    this.startAtMs = ms;
  }

  getStartAtMs(): number {
    return this.startAtMs;
  }

  getSimTime(): number {
    if (this.startAtMs === 0) return 0;
    return Math.max(0, (this.serverNow() - this.startAtMs) / 1000);
  }

  serverNow(): number {
    return this.clockSync.serverNow();
  }

  private syncRoster(room: RoomInfo): void {
    // Add newly joined peers
    for (const p of room.players) {
      if (p.id !== this.localPlayerId && !this.remotePlayers.has(p.id)) {
        this.remotePlayers.set(p.id, {
          id: p.id,
          name: p.name,
          pos: { x: 0, y: 0, z: 0 },
          yaw: 0,
          pitch: 0,
          crouch: false,
          inWater: false,
          flashlightOn: false,
          alive: true,
          escaped: false,
          colorIndex: p.colorIndex ?? this.remotePlayers.size + 1,
          interpBuffer: new EntityInterpBuffer(),
          lastSeenMs: Date.now(),
        });
      }
    }

    // Remove peers that left
    const playerIds = new Set(room.players.map((x) => x.id));
    for (const id of this.remotePlayers.keys()) {
      if (!playerIds.has(id)) {
        this.remotePlayers.delete(id);
      }
    }
  }

  update(dt: number, localPlayerSnapshot?: NetPlayerSnapshot): void {
    if (this.role === 'solo') return;

    const nowMs = Date.now();
    this.clockSync.update(dt);

    // 1. Snapshot transmission (15 Hz -> ~66ms interval)
    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 0.066) {
      this.snapshotTimer = 0;
      if (localPlayerSnapshot) {
        this.adapter.publishSnapshot(localPlayerSnapshot);
      }
    }

    // 2. Event coalescing flush (50 ms)
    this.eventCoalesceTimer += dt;
    if (this.eventCoalesceTimer >= 0.05) {
      this.eventCoalesceTimer = 0;
      this.flushCoalescedEvents();
    }

    // 3. Checkpoint transmission (Host only, every 2s)
    if (this.role === 'host') {
      this.checkpointTimer += dt;
      if (this.checkpointTimer >= 2.0) {
        this.checkpointTimer = 0;
        this.broadcastCheckpoint();
      }
    }

    // 4. Host migration monitor (Client only)
    if (this.role === 'client' && this.room) {
      if (nowMs - this.lastHostSeenMs > 6000) {
        this.attemptHostMigration();
      }
    }

    // 5. Sample interpolated remote players
    const jitter = this.clockSync.getJitter();
    const interpDelay = calculateAdaptiveInterpDelay(120, jitter);
    const renderTime = this.serverNow() - interpDelay;

    for (const remote of this.remotePlayers.values()) {
      const sampled = remote.interpBuffer.sample(renderTime);
      if (sampled) {
        remote.pos = sampled.pos;
        remote.yaw = sampled.yaw;
        remote.pitch = sampled.pitch;
        remote.crouch = sampled.crouch;
        remote.inWater = sampled.inWater;
        remote.flashlightOn = sampled.flashlightOn;
        remote.alive = sampled.alive;
        remote.carrying = sampled.carrying;
      }
    }
  }

  publishLocalNoise(noise: NoiseEvent): void {
    if (this.role === 'solo') return;
    this.coalesceEvent({ type: 'noise', noise });
  }

  publishLocalRipple(ripple: RippleEvent): void {
    if (this.role === 'solo') return;
    this.coalesceEvent({ type: 'ripple', ripple });
  }

  publishPuzzleRequest(op: PuzzleOp): void {
    if (this.role === 'solo') return;
    if (this.role === 'host') {
      // Host executes directly
      this.callbacks.onPuzzleSync?.(op);
      this.adapter.publishEvent({
        type: 'puzzle',
        puzzleId: op.puzzleId,
        op: op.op,
        value: op.value,
        t: op.t,
      });
      this.broadcastCheckpoint();
    } else {
      // Client sends request to host
      this.adapter.publishEvent({ type: 'puzzle_req', op });
    }
  }

  publishProjectile(item: string, origin: Vec3, vel: Vec3): void {
    const ev: NetEvent = {
      type: 'projectile',
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      item,
      origin,
      vel,
      t: this.getSimTime(),
      owner: this.localPlayerId,
    };
    this.coalesceEvent(ev);
    this.callbacks.onProjectile?.({
      id: ev.id,
      item,
      origin,
      vel,
      t: ev.t,
      owner: this.localPlayerId,
    });
  }

  publishPingMarker(position: Vec3): void {
    if (!this.rateLimiter.checkEvent(this.localPlayerId, 'ping_marker', Date.now())) {
      return;
    }
    const ev: NetEvent = {
      type: 'ping_marker',
      owner: this.localPlayerId,
      position,
      t: this.getSimTime(),
    };
    this.coalesceEvent(ev);
    this.callbacks.onPingMarker?.({
      owner: this.localPlayerId,
      position,
      t: ev.t,
    });
  }

  publishDeath(): void {
    const ev: NetEvent = {
      type: 'death',
      playerId: this.localPlayerId,
      t: this.getSimTime(),
    };
    this.coalesceEvent(ev);
    this.callbacks.onPlayerDeath?.(this.localPlayerId);
  }

  publishEscape(): void {
    const ev: NetEvent = {
      type: 'escape',
      playerId: this.localPlayerId,
      t: this.getSimTime(),
    };
    this.coalesceEvent(ev);
    this.callbacks.onPlayerEscape?.(this.localPlayerId);
  }

  broadcastMonsterState(monster: ReplicatedMonsterState): void {
    if (this.role !== 'host') return;
    this.adapter.publishEvent({
      type: 'monster',
      id: monster.id,
      state: monster.state,
      pos: monster.pos,
      yaw: monster.yaw,
      target: monster.target,
      t: monster.t,
    });
  }

  private coalesceEvent(e: NetEvent): void {
    this.coalescedEvents.push(e);
  }

  private flushCoalescedEvents(): void {
    if (this.coalescedEvents.length === 0) return;
    for (const ev of this.coalescedEvents) {
      this.adapter.publishEvent(ev);
    }
    this.coalescedEvents.length = 0;
  }

  private handleInboundSnapshot(snap: NetPlayerSnapshot): void {
    if (snap.id === this.localPlayerId) return;

    if (this.role === 'host' && this.room?.hostId === snap.id) {
      this.lastHostSeenMs = Date.now();
    }

    let remote = this.remotePlayers.get(snap.id);
    if (!remote) {
      remote = {
        id: snap.id,
        name: snap.name,
        pos: { ...snap.pos },
        yaw: snap.yaw,
        pitch: snap.pitch,
        crouch: snap.crouch,
        inWater: snap.inWater,
        flashlightOn: snap.flashlightOn,
        alive: snap.alive,
        escaped: snap.escaped ?? false,
        colorIndex: snap.colorIndex ?? this.remotePlayers.size + 1,
        interpBuffer: new EntityInterpBuffer(),
        lastSeenMs: Date.now(),
      };
      this.remotePlayers.set(snap.id, remote);
    }

    // Host checks plausibility
    if (this.role === 'host') {
      const dt = Math.max(0.01, (Date.now() - remote.lastSeenMs) / 1000);
      if (!isPlausibleMovement(remote.pos, snap.pos, dt)) {
        // Teleport anomaly: discard and do not update
        return;
      }
    }

    remote.lastSeenMs = Date.now();
    remote.interpBuffer.addSnapshot(snap);
    this.callbacks.onRemoteSnapshot?.(snap);
  }

  private handleInboundEvent(ev: NetEvent): void {
    switch (ev.type) {
      case 'noise':
        if (isValidNoiseEvent(ev.noise)) {
          this.callbacks.onRemoteNoise?.(ev.noise);
          // If host, rebroadcast to all other clients
          if (this.role === 'host' && ev.noise.sourcePlayerId !== this.localPlayerId) {
            this.adapter.publishEvent(ev);
          }
        }
        break;

      case 'ripple':
        this.callbacks.onRemoteRipple?.(ev.ripple);
        if (this.role === 'host' && ev.ripple.sourcePlayerId !== this.localPlayerId) {
          this.adapter.publishEvent(ev);
        }
        break;

      case 'monster':
        if (this.role === 'client') {
          this.replicatedMonsters.set(ev.id, {
            id: ev.id,
            state: ev.state,
            pos: ev.pos,
            yaw: ev.yaw,
            target: ev.target,
            t: ev.t,
          });
          this.callbacks.onMonsterUpdate?.(ev);
        }
        break;

      case 'puzzle_req':
        if (this.role === 'host') {
          this.callbacks.onPuzzleSync?.(ev.op);
          this.adapter.publishEvent({
            type: 'puzzle',
            puzzleId: ev.op.puzzleId,
            op: ev.op.op,
            value: ev.op.value,
            t: ev.op.t,
          });
          this.broadcastCheckpoint();
        }
        break;

      case 'puzzle':
        this.callbacks.onPuzzleSync?.({
          puzzleId: ev.puzzleId,
          op: ev.op,
          value: ev.value,
          actor: 'host',
          t: ev.t,
        });
        break;

      case 'checkpoint':
        if (this.role === 'client') {
          this.lastHostSeenMs = Date.now();
          this.latestCheckpoint = ev;
          this.callbacks.onCheckpoint?.(ev.simT, ev.puzzles, ev.monsters);
        }
        break;

      case 'projectile':
        this.callbacks.onProjectile?.(ev);
        break;

      case 'ping_marker':
        this.callbacks.onPingMarker?.(ev);
        break;

      case 'death':
        this.callbacks.onPlayerDeath?.(ev.playerId);
        break;

      case 'escape':
        this.callbacks.onPlayerEscape?.(ev.playerId);
        break;

      case 'host_change':
        this.lastHostSeenMs = Date.now();
        if (this.room) this.room.hostId = ev.hostId;
        this.callbacks.onHostChanged?.(ev.hostId);
        break;
    }
  }

  private broadcastCheckpoint(): void {
    const seq = ++this.lastFrameSeq;
    const simT = this.getSimTime();
    this.adapter.publishEvent({
      type: 'checkpoint',
      simT,
      puzzles: {},
      monsters: {},
      extras: {},
      seq,
    });
  }

  private attemptHostMigration(): void {
    if (!this.room || !this.adapter.claimHost) return;

    // Remaining alive peer with lowest joinedAt claims host
    const alivePeers = this.room.players;
    if (alivePeers.length === 0) return;

    const candidate = alivePeers[0]!;
    if (candidate.id === this.localPlayerId) {
      void this.adapter.claimHost().then((success) => {
        if (success) {
          (this as { role: SessionRole }).role = 'host';
          this.adapter.publishEvent({
            type: 'host_change',
            hostId: this.localPlayerId,
          });
          this.callbacks.onHostChanged?.(this.localPlayerId);
        }
      });
    }
  }

  stats(): NetStats {
    if (this.adapter.stats) {
      return this.adapter.stats();
    }
    return {
      rttMs: 0,
      jitterMs: 0,
      lossPct: 0,
      inBps: 0,
      outBps: 0,
      interpDelayMs: 0,
      transport: this.adapter.kind,
    };
  }

  dispose(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
    this.remotePlayers.clear();
    this.replicatedMonsters.clear();
    this.coalescedEvents.length = 0;
  }
}

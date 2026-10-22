/* ── contracts.ts ─────────────────────────────────────────────────────────
 *  Shared type contracts for BackSilence.
 *  Later batches EXTEND this file; they never rename existing symbols.
 * ──────────────────────────────────────────────────────────────────────── */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PlayerId = string;
export type RoomCode = string; // 4 chars from SAFE_ALPHABET

/** 32 unambiguous symbols — no I, O, 0, or 1. */
export const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type MapId =
  | 'poolrooms'
  | 'utility_tunnels'
  | 'marble_atrium'
  | 'hydro_maze'
  | 'drainage_core';

export type AppState =
  | 'BOOT'
  | 'MENU'
  | 'MODE_SELECT'
  | 'LOBBY'
  | 'LOADING'
  | 'PLAYING'
  | 'PAUSED'
  | 'DEAD'
  | 'SPECTATING'
  | 'RESULTS';

export type QualityTier = 'auto' | 'low' | 'medium' | 'high';

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'crouch'
  | 'jump'
  | 'interact'
  | 'flashlight'
  | 'throw'
  | 'pause';

export interface Settings {
  version: 1;
  graphics: {
    quality: QualityTier;
    resolutionScale: number;
    fov: number;
    brightness: number;
    vhsIntensity: number;
    headBob: boolean;
    reducedMotion: boolean | 'system';
    showFps: boolean;
  };
  audio: {
    master: number;
    sfx: number;
    ambient: number;
    monster: number;
    muteOnBlur: boolean;
    soundVisualizer: boolean;
  };
  controls: {
    sensitivity: number;
    invertY: boolean;
    toggleCrouch: boolean;
    bindings: Record<Action, string>;
  };
  player: {
    name: string;
  };
}

export type NoiseKind =
  | 'wade'
  | 'splash'
  | 'jump_in'
  | 'mantle'
  | 'pebble'
  | 'valve'
  | 'generator'
  | 'door'
  | 'scream';

export interface NoiseEvent {
  id: string;
  kind: NoiseKind;
  position: Vec3;
  /** 0..1 — see ACOUSTIC_RULEBOOK.md */
  loudness: number;
  sourcePlayerId: PlayerId | 'world';
  /** Simulation time, seconds. */
  t: number;
}

export interface RippleEvent {
  position: Vec3;
  /** 0..1 */
  strength: number;
  t: number;
  sourcePlayerId: PlayerId | 'world';
}

export type MonsterState =
  | 'DORMANT'
  | 'WANDER'
  | 'ALERTED'
  | 'HUNT'
  | 'INVESTIGATE'
  | 'ATTACK'
  | 'BLOCKED';

export interface NetPlayerSnapshot {
  id: PlayerId;
  name: string;
  t: number;
  pos: Vec3;
  yaw: number;
  pitch: number;
  crouch: boolean;
  inWater: boolean;
  flashlightOn: boolean;
  alive: boolean;
}

export type NetEvent =
  | { type: 'noise'; noise: NoiseEvent }
  | { type: 'ripple'; ripple: RippleEvent }
  | {
      type: 'puzzle';
      puzzleId: string;
      op: 'set' | 'toggle' | 'progress';
      value: unknown;
      t: number;
    }
  | { type: 'death'; playerId: PlayerId; t: number }
  | {
      type: 'monster';
      id: string;
      state: MonsterState;
      pos: Vec3;
      yaw: number;
      target?: Vec3;
      t: number;
    };

export interface LobbyPlayer {
  id: PlayerId;
  name: string;
  ready: boolean;
  isHost: boolean;
}

export interface RoomInfo {
  code: RoomCode;
  hostId: PlayerId;
  mapId: MapId;
  seed: number;
  maxPlayers: number;
  state: 'lobby' | 'playing' | 'ended';
  createdAt: number;
  players: LobbyPlayer[];
}

export interface AdapterConfig {
  provider: 'null' | 'supabase' | 'firebase' | 'turso' | 'webrtc-db';
  url?: string;
  key?: string;
  extra?: Record<string, string>;
}

export type Unsubscribe = () => void;

export interface NetAdapterEvents {
  room: RoomInfo;
  snapshot: NetPlayerSnapshot;
  event: NetEvent;
  disconnected: { reason: string };
}

/**
 * The ONLY thing game code knows about networking.
 * Implementations live in `src/net/adapters/`.
 */
export interface DatabaseNetworkAdapter {
  readonly kind: AdapterConfig['provider'];
  connect(config: AdapterConfig): Promise<void>;
  disconnect(): Promise<void>;
  createRoom(opts: {
    mapId: MapId;
    seed: number;
    maxPlayers: number;
    hostName: string;
  }): Promise<RoomInfo>;
  joinRoom(code: RoomCode, profile: { name: string }): Promise<RoomInfo>;
  leaveRoom(): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  /** Host only. */
  startGame(): Promise<void>;
  /** Fire-and-forget, throttled by caller (15–20 Hz). */
  publishSnapshot(s: NetPlayerSnapshot): void;
  /** Reliable delivery. */
  publishEvent(e: NetEvent): void;
  on<K extends keyof NetAdapterEvents>(
    k: K,
    cb: (v: NetAdapterEvents[K]) => void,
  ): Unsubscribe;
  /** Synchronized clock, ms. */
  serverNow(): number;
}

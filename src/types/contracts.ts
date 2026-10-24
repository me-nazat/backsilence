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
  | 'orientation'
  | 'poolrooms'
  | 'utility_tunnels'
  | 'marble_atrium'
  | 'hydro_maze'
  | 'drainage_core'
  | 'natatorium'
  | 'drowned_school'
  | 'sunken_jungle'
  | 'neon_flood'
  | 'drowned_metro';

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

export const PROTOCOL_VERSION = 1;

export type QualityTier = 'auto' | 'low' | 'medium' | 'high';
export type GraphicsTier = 'low' | 'medium' | 'high';

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
  | 'crank'
  | 'cycleItem'
  | 'ping'
  | 'pause';

export interface Settings {
  version: 2;
  graphics: {
    quality: QualityTier;
    resolutionScale: number;
    fov: number;
    brightness: number;
    vhsIntensity: number;
    headBob: boolean;
    reducedMotion: boolean | 'system';
    showFps: boolean;
    photosensitiveSafe: boolean;
    vhsOsd: boolean;
    vhsLines: number;
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
  accessibility: {
    reducedMotion: 'system' | 'on' | 'off';
    uiScale: number;
    highContrast: boolean;
    language?: string;
  };
  player: {
    name: string;
  };
  net?: {
    interpolationBias: number;
    showNetStats: boolean;
  };
  creatures?: {
    waterMonsterSkin?: 'auto' | 'model' | 'procedural';
    ambientFlyers?: number;
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
  | 'scream'
  | 'roar'
  | 'clang'
  | 'alarm'
  | 'bell'
  | 'beacon'
  | 'clack'
  | 'creak'
  | 'locker'
  | 'chain'
  | 'siren'
  | 'terminal'
  | 'shatter'
  | 'lever'
  | 'train'
  | 'haunt';

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
  /** If true, cosmetic only and ignored by simulation hearing/monsters */
  cosmetic?: boolean;
}

export type MonsterState =
  | 'DORMANT'
  | 'WANDER'
  | 'ALERTED'
  | 'HUNT'
  | 'INVESTIGATE'
  | 'ATTACK'
  | 'BLOCKED'
  | 'LURK'
  | 'STUNNED';

export interface PuzzleOp {
  puzzleId: string;
  op: 'set' | 'toggle' | 'progress' | 'reset';
  value?: unknown;
  actor: PlayerId;
  t: number;
}

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
  seq?: number | undefined;
  carrying?: string | undefined;
  escaped?: boolean | undefined;
  colorIndex?: number | undefined;
}

export type NetEvent =
  | { type: 'noise'; noise: NoiseEvent }
  | { type: 'ripple'; ripple: RippleEvent }
  | {
      type: 'puzzle';
      puzzleId: string;
      op: 'set' | 'toggle' | 'progress' | 'reset';
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
      target?: Vec3 | undefined;
      t: number;
    }
  | { type: 'start'; startAtMs: number; layoutHash: string; playerCount: number }
  | { type: 'checkpoint'; simT: number; puzzles: unknown; monsters: unknown; extras: unknown; seq: number }
  | { type: 'puzzle_req'; op: PuzzleOp }
  | { type: 'escape'; playerId: PlayerId; t: number }
  | { type: 'projectile'; id: string; item: string; origin: Vec3; vel: Vec3; t: number; owner: PlayerId }
  | { type: 'ping_marker'; owner: PlayerId; position: Vec3; t: number }
  | { type: 'host_change'; hostId: PlayerId }
  | { type: 'round'; state: 'results' | 'lobby'; payload?: unknown };

export interface LobbyPlayer {
  id: PlayerId;
  name: string;
  ready: boolean;
  isHost: boolean;
  colorIndex?: number | undefined;
}

export interface RoomInfo {
  code: RoomCode;
  hostId: PlayerId;
  mapId: MapId;
  seed: number;
  maxPlayers: number;
  difficulty?: 'whisper' | 'normal' | 'deafening' | undefined;
  state: 'lobby' | 'playing' | 'ended';
  protocol: number;
  createdAt: number;
  expiresAt?: number | undefined;
  players: LobbyPlayer[];
}

export interface AdapterCapabilities {
  realtime: 'push' | 'poll' | 'none';
  reliableOrdered: boolean;
  maxMsgBytes: number;
  suggestedSnapshotHz: number;
  suggestedInterpDelayMs: number;
  supportsWebRtcSignaling: boolean;
}

export interface NetStats {
  rttMs: number;
  jitterMs: number;
  lossPct: number;
  inBps: number;
  outBps: number;
  interpDelayMs: number;
  transport: string;
}

export interface AdapterConfig {
  provider: 'null' | 'loopback' | 'memory' | 'local-tab' | 'supabase' | 'firebase' | 'turso' | 'turso-proxy' | 'webrtc-db';
  url?: string | undefined;
  key?: string | undefined;
  signalProvider?: 'supabase' | 'firebase' | 'turso' | 'turso-proxy' | undefined;
  iceServers?: RTCIceServer[] | undefined;
  extra?: Record<string, string> | undefined;
}


export type Unsubscribe = () => void;

export interface NetAdapterEvents {
  room: RoomInfo;
  snapshot: NetPlayerSnapshot;
  event: NetEvent;
  disconnected: { reason: string };
  'peer-state': { id: PlayerId; state: 'connecting' | 'online' | 'lagging' | 'gone' };
  'host-changed': { hostId: PlayerId };
}

/**
 * The ONLY thing game code knows about networking.
 * Implementations live in `src/net/adapters/`.
 */
export interface DatabaseNetworkAdapter {
  readonly kind: AdapterConfig['provider'];
  readonly capabilities?: AdapterCapabilities;
  connect(config: AdapterConfig): Promise<void>;
  disconnect(): Promise<void>;
  createRoom(opts: {
    mapId: MapId;
    seed: number;
    maxPlayers: number;
    hostName: string;
    difficulty?: 'whisper' | 'normal' | 'deafening';
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
  stats?(): NetStats;
  kick?(id: PlayerId): Promise<void>;
  claimHost?(): Promise<boolean>;
}

export interface PostGrade {
  lift?: [number, number, number];
  gamma?: [number, number, number];
  gain?: [number, number, number];
  saturation?: number;
  tint?: [number, number, number];
}

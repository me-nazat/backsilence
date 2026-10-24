/* ── api/core/Types.ts ───────────────────────────────────────────────────────
 *  Common type definitions for the BackSilence serverless API proxy.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ServerEnv {
  TURSO_DATABASE_URL?: string | undefined;
  TURSO_AUTH_TOKEN?: string | undefined;
  ALLOWED_ORIGINS?: string | undefined;
  SESSION_SECRET?: string | undefined;
  ADMIN_JOB_TOKEN?: string | undefined;
  TURN_URL?: string | undefined;
  TURN_USERNAME?: string | undefined;
  TURN_CREDENTIAL?: string | undefined;
  /** In-memory fake database instance (for testing and offline dev proxy) */
  fakeDb?: unknown | undefined;
}


export interface PlayerRecord {
  player_id: string;
  pubkey: string;
  name: string;
  tag: string;
  created_at: number;
  last_seen: number;
  sr: number;
  ranked_matches: number;
  banned: number;
}

export interface RunRecord {
  run_id: string;
  player_id: string;
  map_id: string;
  mode: string;
  difficulty: string;
  seed: number;
  mutators: string;
  board: string;
  score: number;
  time_ms: number;
  noise_units: number;
  escaped: number;
  sim_version: string;
  sim_hash: string;
  replay: string;
  replay_bytes: number;
  status: 'pending' | 'verified' | 'rejected';
  rejection_reason?: string;
  created_at: number;
}

export interface ChampionRecord {
  season: string;
  board: string;
  map_id: string;
  mode: string;
  player_id: string;
  player_name?: string;
  score: number;
  run_id: string;
  crowned_at: number;
}

export interface RoomRecord {
  code: string;
  map_id: string;
  seed: number;
  max_players: number;
  host_id: string;
  public?: number | undefined;
  mode?: string | undefined;
  difficulty?: string | undefined;
  state?: 'lobby' | 'waiting' | 'playing' | 'closed' | undefined;
  created_at: number;
  expires_at: number;
}

export interface SignalRecord {
  id: number;
  room_code: string;
  sender_id: string;
  type: string;
  payload: string;
  created_at: number;
}

export interface ReportRecord {
  report_id: string;
  reporter_id: string;
  target_id: string;
  kind: string;
  note?: string | undefined;
  created_at: number;
}

export interface NonceRecord {
  nonce: string;
  expires_at: number;
}

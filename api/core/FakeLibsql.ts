/* ── api/core/FakeLibsql.ts ─────────────────────────────────────────────────
 *  Deterministic in-memory SQLite / libSQL emulator.
 *  Used for:
 *  1. Unit and integration tests (zero network / zero external db dependencies)
 *  2. Local dev proxy (npm run dev:api) when running without live Turso secrets
 * ──────────────────────────────────────────────────────────────────────── */

import type { PlayerRecord, RunRecord, ChampionRecord, RoomRecord, SignalRecord } from './Types.js';

export class FakeLibsql {
  private static defaultInstance: FakeLibsql | null = null;

  static getDefault(): FakeLibsql {
    if (!this.defaultInstance) {
      this.defaultInstance = new FakeLibsql();
    }
    return this.defaultInstance;
  }

  static reset(): void {
    this.getDefault().reset();
  }

  readonly players = new Map<string, PlayerRecord>();
  readonly runs = new Map<string, RunRecord>();
  readonly champions = new Map<string, ChampionRecord>();
  readonly rateLimits = new Map<string, { count: number; window: number }>();
  readonly rooms = new Map<string, RoomRecord>();
  readonly roomPlayers = new Map<string, Array<{ id: string; name: string; joined_at: number }>>();
  readonly signals: SignalRecord[] = [];
  private nextSignalId = 1;

  reset(): void {

    this.players.clear();
    this.runs.clear();
    this.champions.clear();
    this.rateLimits.clear();
    this.rooms.clear();
    this.roomPlayers.clear();
    this.signals.length = 0;
    this.nextSignalId = 1;
  }

  async execute(sql: string, params: (string | number | null)[] = []): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }> {
    const trimmed = sql.trim().replace(/;\s*$/, '');
    const upper = trimmed.toUpperCase();

    // ── SELECT ──────────────────────────────────────────────────────────────
    if (upper.startsWith('SELECT')) {
      if (upper.includes('FROM PLAYERS') && upper.includes('WHERE PLAYER_ID = ?')) {
        const id = String(params[0]);
        const p = this.players.get(id);
        return { rows: p ? [{ ...p }] : [], rowsAffected: 0 };
      }

      if (upper.includes('FROM RUNS') && upper.includes('WHERE RUN_ID = ?')) {
        const id = String(params[0]);
        const r = this.runs.get(id);
        return { rows: r ? [{ ...r }] : [], rowsAffected: 0 };
      }

      if (upper.includes('FROM RUNS')) {
        // Leaderboard query
        let list = Array.from(this.runs.values());
        let paramIdx = 0;

        if (upper.includes('BOARD = ?')) {
          const board = String(params[paramIdx++]);
          list = list.filter((r) => r.board === board);
        }
        if (upper.includes('MAP_ID = ?')) {
          const mapId = String(params[paramIdx++]);
          list = list.filter((r) => r.map_id === mapId);
        }
        if (upper.includes('MODE = ?')) {
          const mode = String(params[paramIdx++]);
          list = list.filter((r) => r.mode === mode);
        }
        if (upper.includes('DIFFICULTY = ?')) {
          const diff = String(params[paramIdx++]);
          list = list.filter((r) => r.difficulty === diff);
        }
        if (upper.includes("STATUS = 'VERIFIED'")) {
          list = list.filter((r) => r.status === 'verified');
        }

        // Order by score DESC, time_ms ASC
        list.sort((a, b) => b.score - a.score || a.time_ms - b.time_ms);

        // Limit
        const limitMatch = trimmed.match(/LIMIT\s+(\d+|\?)/i);
        let limit = 50;
        if (limitMatch) {
          if (limitMatch[1] === '?') {
            limit = Number(params[paramIdx++]) || 50;
          } else {
            limit = parseInt(limitMatch[1]!, 10);
          }
        }

        const rows = list.slice(0, limit).map((r) => {
          const p = this.players.get(r.player_id);
          return {
            ...r,
            player_name: p ? `${p.name}#${p.tag}` : 'Unknown',
            player_sr: p ? p.sr : 1000,
          };
        });

        return { rows, rowsAffected: 0 };
      }

      if (upper.includes('FROM CHAMPIONS')) {
        let list = Array.from(this.champions.values());
        if (upper.includes('SEASON = ?') && params.length > 0) {
          const s = String(params[0]);
          list = list.filter((c) => c.season === s);
        }
        list.sort((a, b) => b.crowned_at - a.crowned_at);
        const rows = list.map((c) => {
          const p = this.players.get(c.player_id);
          return {
            ...c,
            player_name: p ? `${p.name}#${p.tag}` : c.player_name || 'Champion',
          };
        });
        return { rows, rowsAffected: 0 };
      }

      if (upper.includes('FROM RATE_LIMITS')) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        const entry = this.rateLimits.get(key);
        return { rows: entry ? [{ count: entry.count }] : [], rowsAffected: 0 };
      }

      if (upper.includes('FROM BACKSILENCE_ROOMS') && upper.includes('WHERE CODE = ?')) {
        const code = String(params[0]);
        const room = this.rooms.get(code);
        return { rows: room ? [{ ...room }] : [], rowsAffected: 0 };
      }

      if (upper.includes('FROM BACKSILENCE_SIGNALS')) {
        const roomCode = String(params[0]);
        const afterId = Number(params[1]) || 0;
        const matching = this.signals
          .filter((s) => s.room_code === roomCode && s.id > afterId)
          .map((s) => ({ ...s }));
        return { rows: matching, rowsAffected: 0 };
      }

      return { rows: [], rowsAffected: 0 };
    }

    // ── INSERT / UPSERT ─────────────────────────────────────────────────────
    if (upper.startsWith('INSERT') || upper.startsWith('REPLACE')) {
      if (upper.includes('INTO PLAYERS')) {
        const p: PlayerRecord = {
          player_id: String(params[0]),
          pubkey: String(params[1]),
          name: String(params[2]),
          tag: String(params[3]),
          created_at: Number(params[4]),
          last_seen: Number(params[5]),
          sr: Number(params[6] ?? 1000),
          ranked_matches: Number(params[7] ?? 0),
          banned: Number(params[8] ?? 0),
        };
        this.players.set(p.player_id, p);
        return { rows: [], rowsAffected: 1 };
      }

      if (upper.includes('INTO RUNS')) {
        const r: RunRecord = {
          run_id: String(params[0]),
          player_id: String(params[1]),
          map_id: String(params[2]),
          mode: String(params[3]),
          difficulty: String(params[4]),
          seed: Number(params[5]),
          mutators: String(params[6]),
          board: String(params[7]),
          score: Number(params[8]),
          time_ms: Number(params[9]),
          noise_units: Number(params[10]),
          escaped: Number(params[11]),
          sim_version: String(params[12]),
          sim_hash: String(params[13]),
          replay: String(params[14]),
          replay_bytes: Number(params[15]),
          status: (params[16] as 'pending' | 'verified' | 'rejected') || 'pending',
          created_at: Number(params[17]),
        };
        this.runs.set(r.run_id, r);
        return { rows: [], rowsAffected: 1 };
      }

      if (upper.includes('INTO CHAMPIONS')) {
        const c: ChampionRecord = {
          season: String(params[0]),
          board: String(params[1]),
          map_id: String(params[2]),
          mode: String(params[3]),
          player_id: String(params[4]),
          score: Number(params[5]),
          run_id: String(params[6]),
          crowned_at: Number(params[7]),
        };
        this.champions.set(`${c.season}:${c.board}:${c.map_id}:${c.mode}`, c);
        return { rows: [], rowsAffected: 1 };
      }

      if (upper.includes('INTO RATE_LIMITS')) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        const existing = this.rateLimits.get(key)?.count ?? 0;
        this.rateLimits.set(key, { count: existing + 1, window: Number(params[2]) });
        return { rows: [], rowsAffected: 1 };
      }

      if (upper.includes('INTO BACKSILENCE_ROOMS')) {
        const rm: RoomRecord = {
          code: String(params[0]),
          map_id: String(params[1]),
          seed: Number(params[2]),
          max_players: Number(params[3]),
          host_id: String(params[4]),
          created_at: Number(params[5]),
          expires_at: Number(params[6]),
        };
        this.rooms.set(rm.code, rm);
        return { rows: [], rowsAffected: 1 };
      }

      if (upper.includes('INTO BACKSILENCE_SIGNALS')) {
        const sig: SignalRecord = {
          id: this.nextSignalId++,
          room_code: String(params[0]),
          sender_id: String(params[1]),
          type: String(params[2]),
          payload: String(params[3]),
          created_at: Number(params[4]),
        };
        this.signals.push(sig);
        return { rows: [], rowsAffected: 1 };
      }
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (upper.startsWith('UPDATE')) {
      if (upper.includes('PLAYERS SET NAME = ?') && upper.includes('WHERE PLAYER_ID = ?')) {
        const name = String(params[0]);
        const id = String(params[1]);
        const p = this.players.get(id);
        if (p) {
          p.name = name;
          return { rows: [], rowsAffected: 1 };
        }
        return { rows: [], rowsAffected: 0 };
      }

      if (upper.includes('RUNS SET STATUS = ?') && upper.includes('WHERE RUN_ID = ?')) {
        const status = params[0] as 'pending' | 'verified' | 'rejected';
        const id = String(params[1]);
        const r = this.runs.get(id);
        if (r) {
          r.status = status;
          return { rows: [], rowsAffected: 1 };
        }
        return { rows: [], rowsAffected: 0 };
      }
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (upper.startsWith('DELETE')) {
      if (upper.includes('FROM BACKSILENCE_ROOMS WHERE CODE = ?')) {
        const code = String(params[0]);
        const deleted = this.rooms.delete(code);
        return { rows: [], rowsAffected: deleted ? 1 : 0 };
      }
      if (upper.includes('FROM BACKSILENCE_SIGNALS WHERE CREATED_AT < ?')) {
        const cutoff = Number(params[0]);
        const initialLen = this.signals.length;
        const kept = this.signals.filter((s) => s.created_at >= cutoff);
        this.signals.length = 0;
        this.signals.push(...kept);
        return { rows: [], rowsAffected: initialLen - kept.length };
      }
    }

    return { rows: [], rowsAffected: 0 };
  }
}

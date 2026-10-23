/* ── api/core/Endpoints.ts ─────────────────────────────────────────────────
 *  Pure standard Request -> Response handlers for all /api/* endpoints.
 *  CORS locked to ALLOWED_ORIGINS, parameterized SQL queries, strict body bounds.
 * ──────────────────────────────────────────────────────────────────────── */

import type { ServerEnv } from './Types.js';
import { TursoClient } from './TursoClient.js';
import { verifyRequestSignature, derivePlayerId } from './Auth.js';
import { RateLimiter } from './RateLimiter.js';

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function errorJson(message: string, status = 400, extraHeaders: Record<string, string> = {}): Response {
  return json({ error: message, success: false }, status, extraHeaders);
}

function getCorsHeaders(req: Request, env: ServerEnv): Record<string, string> {
  const origin = req.headers.get('Origin') || '*';
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : ['*'];
  const allowOrigin = allowed.includes('*') || allowed.includes(origin) ? origin : allowed[0] || '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-BS-Player, X-BS-Ts, X-BS-Nonce, X-BS-Sig',
    'Access-Control-Max-Age': '86400',
  };
}

// ── PROFANITY FILTER (Small coded list) ──────────────────────────────────────
const PROFANITY_LIST = ['ADMIN', 'MODERATOR', 'SYSTEM', 'OFFICIAL', 'FUCK', 'SHIT', 'BITCH', 'ASSHOLE', 'NIGGER', 'FAGGOT'];
function sanitizeName(raw: string): string {
  let cleaned = raw.replace(/[^\w\s-]/g, '').trim().substring(0, 16);
  if (!cleaned) cleaned = 'Operator';
  const upper = cleaned.toUpperCase();
  for (const word of PROFANITY_LIST) {
    if (upper.includes(word)) {
      return 'Operator';
    }
  }
  return cleaned;
}

export async function handleApiRequest(req: Request, env: ServerEnv): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/api/, '');
  const corsHeaders = getCorsHeaders(req, env);

  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // ── HEALTH CHECK ────────────────────────────────────────────────────────
    if (pathname === '/health' && req.method === 'GET') {
      const t0 = performance.now();
      await TursoClient.query('SELECT 1', [], env);
      const latencyMs = Number((performance.now() - t0).toFixed(1));
      return json({
        status: 'ok',
        engine: env.TURSO_DATABASE_URL ? 'turso' : 'fake-libsql',
        serverTime: Math.floor(Date.now() / 1000),
        dbLatencyMs: latencyMs,
      }, 200, corsHeaders);
    }

    // ── GET DAILY BOARD INFO ────────────────────────────────────────────────
    if (pathname === '/daily' && req.method === 'GET') {
      const now = new Date();
      const dateKey = now.toISOString().substring(0, 10);
      const year = now.getUTCFullYear();
      const oneJan = new Date(Date.UTC(year, 0, 1));
      const weekNum = Math.ceil(((now.getTime() - oneJan.getTime()) / 86400000 + oneJan.getUTCDay() + 1) / 7);
      const weeklyBoard = `weekly:${year}-W${String(weekNum).padStart(2, '0')}`;
      // Seconds until midnight UTC
      const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
      const secondsRemaining = Math.max(0, Math.floor((tomorrowUtc.getTime() - now.getTime()) / 1000));

      return json({
        date: dateKey,
        dateKey,
        boardKey: `daily:${dateKey}`,
        dailyBoard: `daily:${dateKey}`,
        weeklyBoard,
        seasonBoard: 'season:S3',
        secondsRemaining,
        serverTime: Math.floor(now.getTime() / 1000),
      }, 200, corsHeaders);
    }

    // ── PLAYER REGISTRATION ─────────────────────────────────────────────────
    if (pathname === '/player/register' && req.method === 'POST') {
      const bodyText = await req.text();
      const body = JSON.parse(bodyText) as { pubkey: string; name?: string };

      if (!body.pubkey) {
        return errorJson('Missing public key JWK in request body', 400, corsHeaders);
      }

      // If signed headers are provided, verify signature
      if (req.headers.has('X-BS-Sig') || req.headers.has('x-bs-sig')) {
        const sigVerify = await verifyRequestSignature(req.method, pathname, bodyText, req.headers, body.pubkey);
        if (!sigVerify.valid) {
          return errorJson(`Signature verification rejected: ${sigVerify.reason}`, 401, corsHeaders);
        }
      }

      const playerId = await derivePlayerId(body.pubkey);
      const name = sanitizeName(body.name || 'Operator');
      const tag = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit numeric tag
      const now = Math.floor(Date.now() / 1000);

      // Check if already registered
      const existing = await TursoClient.query('SELECT player_id, name, tag, sr, ranked_matches, banned FROM players WHERE player_id = ?', [playerId], env);
      if (existing.rows.length > 0) {
        const row = existing.rows[0]!;
        const pObj = {
          player_id: String(row['player_id']),
          name: String(row['name']),
          tag: String(row['tag']),
          sr: Number(row['sr']),
          ranked_matches: Number(row['ranked_matches']),
          banned: Number(row['banned']),
        };
        return json({
          player: pObj,
          ...pObj,
          isNew: false,
        }, 200, corsHeaders);
      }

      // Insert new player
      await TursoClient.query(
        'INSERT INTO players (player_id, pubkey, name, tag, created_at, last_seen, sr, ranked_matches, banned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [playerId, body.pubkey, name, tag, now, now, 1000, 0, 0],
        env,
      );

      const pObj = {
        player_id: playerId,
        name,
        tag,
        sr: 1000,
        ranked_matches: 0,
        banned: 0,
      };
      return json({
        player: pObj,
        ...pObj,
        isNew: true,
      }, 201, corsHeaders);
    }


    // ── PLAYER RENAME ───────────────────────────────────────────────────────
    if (pathname === '/player/rename' && req.method === 'POST') {
      const bodyText = await req.text();
      const body = JSON.parse(bodyText) as { player_id: string; new_name: string };
      const playerId = req.headers.get('X-BS-Player') || body.player_id;

      if (!playerId || !body.new_name) {
        return errorJson('Missing player_id or new_name', 400, corsHeaders);
      }

      const playerRes = await TursoClient.query('SELECT pubkey, banned FROM players WHERE player_id = ?', [playerId], env);
      if (playerRes.rows.length === 0) {
        return errorJson('Player not found', 404, corsHeaders);
      }
      if (Number(playerRes.rows[0]?.['banned']) === 1) {
        return errorJson('Account suspended', 403, corsHeaders);
      }

      // Verify signature
      const pubkey = String(playerRes.rows[0]?.['pubkey']);
      const sigVerify = await verifyRequestSignature(req.method, pathname, bodyText, req.headers, pubkey);
      if (!sigVerify.valid) {
        return errorJson(`Signature verification rejected: ${sigVerify.reason}`, 401, corsHeaders);
      }

      const newName = sanitizeName(body.new_name);
      await TursoClient.query('UPDATE players SET name = ? WHERE player_id = ?', [newName, playerId], env);

      return json({ success: true, player_id: playerId, name: newName }, 200, corsHeaders);
    }

    // ── GET PLAYER PROFILE ──────────────────────────────────────────────────
    if (pathname.startsWith('/player/') && req.method === 'GET') {
      const playerId = pathname.replace('/player/', '').trim();
      const res = await TursoClient.query(
        'SELECT player_id, name, tag, created_at, last_seen, sr, ranked_matches, banned FROM players WHERE player_id = ?',
        [playerId],
        env,
      );
      if (res.rows.length === 0) {
        return errorJson('Player not found', 404, corsHeaders);
      }
      return json(res.rows[0], 200, corsHeaders);
    }

    // ── SUBMIT RUN ──────────────────────────────────────────────────────────
    if (pathname === '/run/submit' && req.method === 'POST') {
      const bodyText = await req.text();
      const body = JSON.parse(bodyText) as {
        run_id: string;
        player_id: string;
        map_id: string;
        mode: string;
        difficulty: string;
        seed: number;
        mutators?: string[];
        board: string;
        score: number;
        time_ms: number;
        noise_units: number;
        escaped: boolean;
        sim_version: string;
        sim_hash: string;
        replay?: string;
      };

      const playerId = req.headers.get('X-BS-Player') || body.player_id;
      if (!playerId || !body.run_id) {
        return errorJson('Missing player_id or run_id', 400, corsHeaders);
      }

      // 1. Query player
      const playerRes = await TursoClient.query('SELECT pubkey, banned FROM players WHERE player_id = ?', [playerId], env);
      if (playerRes.rows.length === 0) {
        return errorJson('Unregistered player public key', 404, corsHeaders);
      }
      if (Number(playerRes.rows[0]?.['banned']) === 1) {
        return errorJson('Player account is suspended', 403, corsHeaders);
      }

      // 2. Cryptographic signature check
      const pubkey = String(playerRes.rows[0]?.['pubkey']);
      const sigVerify = await verifyRequestSignature(req.method, pathname, bodyText, req.headers, pubkey);
      if (!sigVerify.valid) {
        return errorJson(`Cryptographic signature verification failed: ${sigVerify.reason}`, 401, corsHeaders);
      }

      // 3. Physical feasibility clamping & anti-cheat validations
      if (body.score > 50000) {
        return errorJson('Score exceeds theoretical maximum for map objectives', 400, corsHeaders);
      }
      if (body.time_ms < 15000) {
        return errorJson('Completion time below physical traversal sprint minimum (15.0s)', 400, corsHeaders);
      }

      // 4. Rate limiting (20 runs/hour/player)
      const limit = await RateLimiter.checkLimit(playerId, 'run_submit', env);
      if (!limit.allowed) {
        return errorJson(`Submission rate limit exceeded. Retry after ${limit.retryAfterSec}s`, 429, corsHeaders);
      }

      // 5. Idempotent submission: return existing if run_id already exists
      const existing = await TursoClient.query('SELECT run_id, status FROM runs WHERE run_id = ?', [body.run_id], env);
      if (existing.rows.length > 0) {
        return json({
          success: true,
          run_id: body.run_id,
          status: existing.rows[0]?.['status'],
          message: 'Run already recorded (idempotent)',
        }, 200, corsHeaders);
      }

      // 6. Record run with status 'pending'
      const now = Math.floor(Date.now() / 1000);
      const replayStr = body.replay || '';
      const replayBytes = replayStr ? replayStr.length : 0;
      const mutatorsStr = Array.isArray(body.mutators) ? body.mutators.join(',') : '';

      await TursoClient.query(
        `INSERT INTO runs (
          run_id, player_id, map_id, mode, difficulty, seed, mutators, board,
          score, time_ms, noise_units, escaped, sim_version, sim_hash, replay, replay_bytes, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          body.run_id,
          playerId,
          body.map_id,
          body.mode,
          body.difficulty,
          body.seed,
          mutatorsStr,
          body.board,
          body.score,
          body.time_ms,
          body.noise_units,
          body.escaped ? 1 : 0,
          body.sim_version,
          body.sim_hash,
          replayStr,
          replayBytes,
          now,
        ],
        env,
      );

      return json({
        success: true,
        run_id: body.run_id,
        status: 'pending',
        remainingQuota: limit.remaining,
      }, 201, corsHeaders);
    }


    // ── GET LEADERBOARDS ────────────────────────────────────────────────────
    if (pathname === '/leaderboard' && req.method === 'GET') {
      const board = url.searchParams.get('board') || 'all';
      const mapId = url.searchParams.get('map');
      const mode = url.searchParams.get('mode');
      const diff = url.searchParams.get('difficulty');
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

      let sql = 'SELECT * FROM runs WHERE board = ?';
      const params: (string | number)[] = [board];

      if (mapId) {
        sql += ' AND map_id = ?';
        params.push(mapId);
      }
      if (mode) {
        sql += ' AND mode = ?';
        params.push(mode);
      }
      if (diff) {
        sql += ' AND difficulty = ?';
        params.push(diff);
      }

      sql += ' ORDER BY score DESC, time_ms ASC LIMIT ?';
      params.push(limit);

      const res = await TursoClient.query(sql, params, env);
      return json({ board, count: res.rows.length, entries: res.rows }, 200, corsHeaders);
    }

    // ── GET CHAMPIONS ───────────────────────────────────────────────────────
    if (pathname === '/champions' && req.method === 'GET') {
      const res = await TursoClient.query('SELECT * FROM champions ORDER BY crowned_at DESC LIMIT 10', [], env);
      return json({ champions: res.rows }, 200, corsHeaders);
    }

    // ── ROOM LIFECYCLE (WebRTC Matchmaking & Signaling) ─────────────────────
    if (pathname === '/room/create' && req.method === 'POST') {
      const body = (await req.json()) as { code: string; map_id: string; seed: number; max_players?: number; host_id: string };
      const now = Math.floor(Date.now() / 1000);
      const expires = now + 6 * 3600; // 6-hour TTL

      await TursoClient.query(
        'INSERT INTO backsilence_rooms (code, map_id, seed, max_players, host_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [body.code.toUpperCase(), body.map_id, body.seed, body.max_players ?? 4, body.host_id, now, expires],
        env,
      );

      return json({ success: true, code: body.code.toUpperCase() }, 201, corsHeaders);
    }

    if (pathname === '/room/signal' && req.method === 'POST') {
      const body = (await req.json()) as { room_code: string; sender_id: string; type: string; payload: string };
      const now = Math.floor(Date.now() / 1000);

      await TursoClient.query(
        'INSERT INTO backsilence_signals (room_code, sender_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
        [body.room_code.toUpperCase(), body.sender_id, body.type, body.payload, now],
        env,
      );

      return json({ success: true }, 201, corsHeaders);
    }

    if (pathname === '/room/signal' && req.method === 'GET') {
      const code = url.searchParams.get('code')?.toUpperCase();
      const afterId = parseInt(url.searchParams.get('after') || '0', 10);
      if (!code) return errorJson('Missing room code', 400, corsHeaders);

      const res = await TursoClient.query(
        'SELECT * FROM backsilence_signals WHERE room_code = ? AND id > ? ORDER BY id ASC LIMIT 100',
        [code, afterId],
        env,
      );

      return json({ signals: res.rows }, 200, corsHeaders);
    }

    return errorJson(`Endpoint not found: ${req.method} ${pathname}`, 404, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorJson(`Internal server proxy error: ${message}`, 500, corsHeaders);
  }
}

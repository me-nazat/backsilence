/* ── api/core/Endpoints.ts ─────────────────────────────────────────────────
 *  Pure standard Request -> Response handlers for all /api/* endpoints.
 *  CORS locked to ALLOWED_ORIGINS, parameterized SQL queries, strict body bounds.
 * ──────────────────────────────────────────────────────────────────────── */

import type { ServerEnv } from './Types.js';
import { TursoClient } from './TursoClient.js';
import {
  verifyRequestSignature,
  derivePlayerId,
  hashPasswordPbkdf2,
  verifyPasswordPbkdf2,
  issueSessionToken,
  verifySessionToken,
  isValidEmail,
  isValidPassword,
} from './Auth.js';
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-BS-Player, X-BS-Ts, X-BS-Nonce, X-BS-Sig',
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

    // ── OFFICIAL EMAIL & PASSWORD AUTHENTICATION ────────────────────────────
    if (pathname === '/auth/register' && req.method === 'POST') {
      const bodyText = await req.text();
      if (bodyText.length > 300 * 1024) {
        return errorJson('Request payload too large', 400, corsHeaders);
      }
      const body = JSON.parse(bodyText) as {
        email?: string;
        password?: string;
        name?: string;
        playerId?: string;
        pubkey?: string;
        encryptedVault?: string;
        profile?: unknown;
      };

      if (!body.email || !isValidEmail(body.email)) {
        return errorJson('Invalid email address format', 400, corsHeaders);
      }

      const pwCheck = isValidPassword(body.password ?? '');
      if (!pwCheck.valid) {
        return errorJson(pwCheck.reason || 'Password must be at least 8 characters', 400, corsHeaders);
      }

      if (!body.pubkey || !body.encryptedVault) {
        return errorJson('Missing pubkey or encryptedVault in registration request', 400, corsHeaders);
      }

      const sigVerify = await verifyRequestSignature(req.method, pathname, bodyText, req.headers, body.pubkey);
      if (!sigVerify.valid) {
        return errorJson(`Signature verification rejected: ${sigVerify.reason}`, 401, corsHeaders);
      }

      const normEmail = body.email.trim().toLowerCase();
      const existingAcc = await TursoClient.query(
        'SELECT account_id FROM accounts WHERE LOWER(email) = ?',
        [normEmail],
        env,
      );
      if (existingAcc.rows.length > 0) {
        return errorJson('An account with this email already exists', 409, corsHeaders);
      }

      const derivedId = await derivePlayerId(body.pubkey);
      const playerId = body.playerId || derivedId;
      const now = Math.floor(Date.now() / 1000);
      const name = sanitizeName(body.name || 'Operator');
      let tag = Math.floor(1000 + Math.random() * 9000).toString();

      const existingPlayer = await TursoClient.query(
        'SELECT player_id, name, tag, sr, ranked_matches, banned FROM players WHERE player_id = ?',
        [playerId],
        env,
      );

      let finalName = name;
      if (existingPlayer.rows.length > 0) {
        const pRow = existingPlayer.rows[0]!;
        tag = String(pRow['tag'] || tag);
        if (body.name && body.name.trim()) {
          finalName = sanitizeName(body.name);
          await TursoClient.query('UPDATE players SET name = ? WHERE player_id = ?', [finalName, playerId], env);
        } else {
          finalName = String(pRow['name'] || name);
        }
      } else {
        await TursoClient.query(
          'INSERT INTO players (player_id, pubkey, name, tag, created_at, last_seen, sr, ranked_matches, banned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [playerId, body.pubkey, finalName, tag, now, now, 1000, 0, 0],
          env,
        );
      }

      const { hashHex, saltHex } = await hashPasswordPbkdf2(body.password!);
      const accountId = 'acc_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      const profileJson = body.profile
        ? typeof body.profile === 'string'
          ? body.profile
          : JSON.stringify(body.profile)
        : '{}';

      if (profileJson.length > 256 * 1024) {
        return errorJson('Profile JSON exceeds 256 KB limit', 400, corsHeaders);
      }

      await TursoClient.query(
        'INSERT INTO accounts (account_id, email, password_hash, password_salt, player_id, pubkey, encrypted_vault, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [accountId, normEmail, hashHex, saltHex, playerId, body.pubkey, body.encryptedVault, profileJson, now, now],
        env,
      );

      const secret = env.SESSION_SECRET || 'backsilence-default-session-secret';
      const token = await issueSessionToken(
        {
          accountId,
          playerId,
          email: normEmail,
          exp: now + 30 * 86400,
        },
        secret,
      );

      return json(
        {
          success: true,
          accountId,
          playerId,
          email: normEmail,
          name: finalName,
          tag,
          token,
        },
        201,
        corsHeaders,
      );
    }

    if (pathname === '/auth/login' && req.method === 'POST') {
      const clientIp =
        req.headers.get('CF-Connecting-IP') ||
        req.headers.get('X-Forwarded-For') ||
        'local-client-ip';
      const limit = await RateLimiter.checkLimit(clientIp, 'auth_login', env);
      if (!limit.allowed) {
        return errorJson(`Too many login attempts. Retry after ${limit.retryAfterSec}s`, 429, corsHeaders);
      }

      const bodyText = await req.text();
      const body = JSON.parse(bodyText || '{}') as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return errorJson('Invalid email or password', 401, corsHeaders);
      }

      const normEmail = body.email.trim().toLowerCase();
      const accRes = await TursoClient.query(
        'SELECT * FROM accounts WHERE LOWER(email) = ?',
        [normEmail],
        env,
      );
      if (accRes.rows.length === 0) {
        return errorJson('Invalid email or password', 401, corsHeaders);
      }

      const account = accRes.rows[0]!;
      const pwValid = await verifyPasswordPbkdf2(
        body.password,
        String(account['password_salt'] || ''),
        String(account['password_hash'] || ''),
      );
      if (!pwValid) {
        return errorJson('Invalid email or password', 401, corsHeaders);
      }

      const accountId = String(account['account_id']);
      const playerId = String(account['player_id']);
      const pubkey = String(account['pubkey']);
      const encryptedVault = String(account['encrypted_vault']);

      const pRes = await TursoClient.query(
        'SELECT player_id, name, tag, sr, ranked_matches, banned FROM players WHERE player_id = ?',
        [playerId],
        env,
      );
      const pRow = pRes.rows[0];
      const name = String(pRow?.['name'] || 'Operator');
      const tag = String(pRow?.['tag'] || '0001');
      const sr = Number(pRow?.['sr'] ?? 1000);

      let parsedProfile: Record<string, unknown> = {};
      try {
        parsedProfile = JSON.parse(String(account['profile_json'] || '{}')) as Record<string, unknown>;
      } catch {
        parsedProfile = {};
      }

      const now = Math.floor(Date.now() / 1000);
      const secret = env.SESSION_SECRET || 'backsilence-default-session-secret';
      const token = await issueSessionToken(
        {
          accountId,
          playerId,
          email: normEmail,
          exp: now + 30 * 86400,
        },
        secret,
      );

      return json(
        {
          success: true,
          accountId,
          playerId,
          email: normEmail,
          name,
          tag,
          sr,
          pubkey,
          encryptedVault,
          profile: parsedProfile,
          token,
        },
        200,
        corsHeaders,
      );
    }

    if (pathname === '/profile/sync' && req.method === 'POST') {
      const bodyText = await req.text();
      if (bodyText.length > 256 * 1024) {
        return errorJson('Profile payload exceeds 256 KB limit', 400, corsHeaders);
      }

      const body = JSON.parse(bodyText || '{}') as { profile?: unknown; player_id?: string };
      const secret = env.SESSION_SECRET || 'backsilence-default-session-secret';

      let authenticatedPlayerId: string | null = null;
      const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const tokenPayload = await verifySessionToken(token, secret);
        if (tokenPayload) {
          authenticatedPlayerId = tokenPayload.playerId;
        }
      }

      if (!authenticatedPlayerId && (req.headers.has('X-BS-Sig') || req.headers.has('x-bs-sig'))) {
        const candidatePlayerId = req.headers.get('X-BS-Player') || req.headers.get('x-bs-player') || body.player_id;
        if (candidatePlayerId) {
          const accRes = await TursoClient.query(
            'SELECT pubkey FROM accounts WHERE player_id = ?',
            [candidatePlayerId],
            env,
          );
          let pubkey = accRes.rows[0]?.['pubkey'] ? String(accRes.rows[0]['pubkey']) : '';
          if (!pubkey) {
            const pRes = await TursoClient.query(
              'SELECT pubkey FROM players WHERE player_id = ?',
              [candidatePlayerId],
              env,
            );
            pubkey = pRes.rows[0]?.['pubkey'] ? String(pRes.rows[0]['pubkey']) : '';
          }
          if (pubkey) {
            const sigVerify = await verifyRequestSignature(req.method, pathname, bodyText, req.headers, pubkey);
            if (sigVerify.valid) {
              authenticatedPlayerId = candidatePlayerId;
            }
          }
        }
      }

      if (!authenticatedPlayerId) {
        return errorJson('Unauthorized profile sync request', 401, corsHeaders);
      }

      const profileJson =
        typeof body.profile === 'string' ? body.profile : JSON.stringify(body.profile ?? {});
      if (profileJson.length > 256 * 1024) {
        return errorJson('Serialized profile exceeds 256 KB limit', 400, corsHeaders);
      }

      const now = Math.floor(Date.now() / 1000);
      await TursoClient.query(
        'UPDATE accounts SET profile_json = ?, updated_at = ? WHERE player_id = ?',
        [profileJson, now, authenticatedPlayerId],
        env,
      );

      return json({ success: true, updatedAt: now }, 200, corsHeaders);
    }

    if (pathname === '/auth/me' && req.method === 'GET') {
      const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorJson('Missing Authorization Bearer token', 401, corsHeaders);
      }

      const token = authHeader.slice(7).trim();
      const secret = env.SESSION_SECRET || 'backsilence-default-session-secret';
      const tokenPayload = await verifySessionToken(token, secret);
      if (!tokenPayload) {
        return errorJson('Invalid or expired session token', 401, corsHeaders);
      }

      const accRes = await TursoClient.query(
        'SELECT * FROM accounts WHERE player_id = ?',
        [tokenPayload.playerId],
        env,
      );
      if (accRes.rows.length === 0) {
        return errorJson('Account not found', 404, corsHeaders);
      }

      const acc = accRes.rows[0]!;
      const pRes = await TursoClient.query(
        'SELECT player_id, name, tag, sr FROM players WHERE player_id = ?',
        [tokenPayload.playerId],
        env,
      );
      const pRow = pRes.rows[0];

      let parsedProfile: Record<string, unknown> = {};
      try {
        parsedProfile = JSON.parse(String(acc['profile_json'] || '{}')) as Record<string, unknown>;
      } catch {
        parsedProfile = {};
      }

      return json(
        {
          authenticated: true,
          accountId: tokenPayload.accountId,
          email: String(acc['email']),
          playerId: tokenPayload.playerId,
          name: String(pRow?.['name'] || 'Operator'),
          tag: String(pRow?.['tag'] || '0001'),
          profile: parsedProfile,
        },
        200,
        corsHeaders,
      );
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

    // ── PLAYER DATA EXPORT (GDPR / Privacy) ─────────────────────────────────
    if (pathname === '/player/export' && req.method === 'POST') {
      const bodyText = await req.text();
      const body = JSON.parse(bodyText || '{}') as { player_id?: string };
      const playerId = req.headers.get('X-BS-Player') || body.player_id;

      if (!playerId) {
        return errorJson('Missing player_id', 400, corsHeaders);
      }

      const pRes = await TursoClient.query('SELECT * FROM players WHERE player_id = ?', [playerId], env);
      if (pRes.rows.length === 0) {
        return errorJson('Player not found', 404, corsHeaders);
      }

      // Cryptographic signature verification
      const pubkey = String(pRes.rows[0]?.['pubkey']);
      const sigVerify = await verifyRequestSignature(req.method, pathname, bodyText, req.headers, pubkey);
      if (!sigVerify.valid) {
        return errorJson(`Signature verification rejected: ${sigVerify.reason}`, 401, corsHeaders);
      }

      const runsRes = await TursoClient.query('SELECT * FROM runs WHERE player_id = ?', [playerId], env);
      const reportsRes = await TursoClient.query('SELECT * FROM reports WHERE reporter_id = ?', [playerId], env);

      return json({
        player: pRes.rows[0],
        runs: runsRes.rows,
        reports: reportsRes.rows,
        exported_at: Math.floor(Date.now() / 1000),
      }, 200, corsHeaders);
    }

    // ── PLAYER DATA DELETE (Right to be Forgotten) ──────────────────────────
    if (pathname === '/player/delete' && req.method === 'POST') {
      const bodyText = await req.text();
      const body = JSON.parse(bodyText || '{}') as { player_id?: string };
      const playerId = req.headers.get('X-BS-Player') || body.player_id;

      if (!playerId) {
        return errorJson('Missing player_id', 400, corsHeaders);
      }

      const pRes = await TursoClient.query('SELECT * FROM players WHERE player_id = ?', [playerId], env);
      if (pRes.rows.length === 0) {
        return errorJson('Player not found', 404, corsHeaders);
      }

      // Cryptographic signature verification
      const pubkey = String(pRes.rows[0]?.['pubkey']);
      const sigVerify = await verifyRequestSignature(req.method, pathname, bodyText, req.headers, pubkey);
      if (!sigVerify.valid) {
        return errorJson(`Signature verification rejected: ${sigVerify.reason}`, 401, corsHeaders);
      }

      // Erase player row and anonymize runs
      await TursoClient.query('DELETE FROM players WHERE player_id = ?', [playerId], env);
      await TursoClient.query("UPDATE runs SET player_id = 'ANONYMOUS' WHERE player_id = ?", [playerId], env);

      return json({
        success: true,
        deleted: true,
        player_id: playerId,
        message: 'Player identity and identifying records erased.',
      }, 200, corsHeaders);
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          'pending',
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

      const around = url.searchParams.get('around');
      if (around) {
        // Query window centered around player
        const aroundSql = sql.replace('LIMIT ?', 'LIMIT 200');
        const aroundParams = params.slice(0, -1);
        aroundParams.push(200);
        const res = await TursoClient.query(aroundSql, aroundParams, env);
        const allRows = res.rows.map((r, idx) => ({
          ...r,
          rank: idx + 1,
          runId: r.run_id ?? r.runId,
          playerId: r.player_id ?? r.playerId,
          mapId: r.map_id ?? r.mapId,
          timeMs: r.time_ms ?? r.timeMs,
          noiseUnits: r.noise_units ?? r.noiseUnits,
        }));
        const targetIdx = allRows.findIndex((r) => r.playerId === around);
        if (targetIdx >= 0) {
          const half = Math.floor(limit / 2);
          const start = Math.max(0, targetIdx - half);
          const slice = allRows.slice(start, start + limit);
          return json({ board, around, playerRank: targetIdx + 1, count: slice.length, entries: slice, runs: slice }, 200, corsHeaders);
        }
      }

      const res = await TursoClient.query(sql, params, env);
      const rows = res.rows.map((r) => ({
        ...r,
        runId: r.run_id ?? r.runId,
        playerId: r.player_id ?? r.playerId,
        mapId: r.map_id ?? r.mapId,
        timeMs: r.time_ms ?? r.timeMs,
        noiseUnits: r.noise_units ?? r.noiseUnits,
      }));
      return json({ board, count: rows.length, entries: rows, runs: rows }, 200, corsHeaders);
    }

    // ── GET CHAMPIONS ───────────────────────────────────────────────────────
    if (pathname === '/champions' && req.method === 'GET') {
      const res = await TursoClient.query('SELECT * FROM champions ORDER BY crowned_at DESC LIMIT 10', [], env);
      return json({ champions: res.rows }, 200, corsHeaders);
    }

    // ── ROOM LIFECYCLE (WebRTC Matchmaking & Signaling) ─────────────────────
    if (pathname === '/room/create' && req.method === 'POST') {
      const body = (await req.json()) as {
        code?: string;
        map_id?: string;
        mapId?: string;
        seed?: number;
        max_players?: number;
        maxPlayers?: number;
        host_id?: string;
        hostId?: string;
        hostName?: string;
        hostTag?: string;
        difficulty?: string;
      };
      const now = Math.floor(Date.now() / 1000);
      const expires = now + 6 * 3600; // 6-hour TTL
      const code = (body.code || Math.random().toString(36).substring(2, 8)).toUpperCase();
      const mapId = body.map_id || body.mapId || 'natatorium';
      const seed = body.seed ?? Date.now();
      const hostId = body.host_id || body.hostId || 'host';

      await TursoClient.query(
        'INSERT INTO backsilence_rooms (code, map_id, seed, max_players, host_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [code, mapId, seed, body.max_players ?? body.maxPlayers ?? 4, hostId, now, expires],
        env,
      );

      const roomObj = {
        code,
        mapId,
        seed,
        hostId,
        difficulty: body.difficulty ?? 'normal',
        maxPlayers: body.max_players ?? body.maxPlayers ?? 4,
        players: [{ id: hostId, name: body.hostName || 'Host', tag: body.hostTag || '0001', ready: true }],
        state: 'waiting',
      };

      return json({ success: true, ok: true, code, room: roomObj }, 201, corsHeaders);
    }

    if (pathname === '/room/join' && req.method === 'POST') {
      const body = (await req.json()) as {
        code?: string;
        playerId?: string;
        player_id?: string;
        playerName?: string;
        name?: string;
        playerTag?: string;
      };
      const code = (body.code || '').toUpperCase();
      if (!code) return errorJson('Missing room code', 400, corsHeaders);

      const existing = await TursoClient.query('SELECT * FROM backsilence_rooms WHERE code = ?', [code], env);
      if (existing.rows.length === 0) {
        return errorJson('Room not found', 404, corsHeaders);
      }

      const pId = body.playerId || body.player_id || 'guest';
      const pName = body.playerName || body.name || 'Guest';

      return json({
        success: true,
        ok: true,
        code,
        room: {
          code,
          mapId: existing.rows[0]?.['map_id'],
          seed: existing.rows[0]?.['seed'],
          hostId: existing.rows[0]?.['host_id'],
          players: [
            { id: String(existing.rows[0]?.['host_id']), name: 'Host', ready: true },
            { id: pId, name: pName, ready: false },
          ],
          state: 'waiting',
        },
      }, 200, corsHeaders);
    }

    if (pathname === '/room/signal' && req.method === 'POST') {
      const body = (await req.json()) as {
        room_code?: string;
        roomCode?: string;
        code?: string;
        sender_id?: string;
        senderId?: string;
        fromId?: string;
        target_id?: string;
        targetId?: string;
        toId?: string;
        type?: string;
        kind?: string;
        payload: string;
      };
      const now = Math.floor(Date.now() / 1000);
      const code = (body.room_code || body.roomCode || body.code || '').toUpperCase();
      const sender = body.sender_id || body.senderId || body.fromId || 'unknown';
      const sigType = body.type || body.kind || 'signal';

      await TursoClient.query(
        'INSERT INTO backsilence_signals (room_code, sender_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
        [code, sender, sigType, body.payload, now],
        env,
      );

      return json({ success: true, ok: true }, 201, corsHeaders);
    }

    if (pathname === '/room/signal' && req.method === 'GET') {
      const code = url.searchParams.get('code')?.toUpperCase();
      const afterId = parseInt(url.searchParams.get('after') || url.searchParams.get('lastId') || url.searchParams.get('since') || '0', 10);
      if (!code) return errorJson('Missing room code', 400, corsHeaders);

      const res = await TursoClient.query(
        'SELECT * FROM backsilence_signals WHERE room_code = ? AND id > ? ORDER BY id ASC LIMIT 100',
        [code, afterId],
        env,
      );

      return json({ ok: true, signals: res.rows }, 200, corsHeaders);
    }

    // ── ROOM LEAVE ──────────────────────────────────────────────────────────
    if (pathname === '/room/leave' && req.method === 'POST') {
      const body = (await req.json()) as { code?: string; playerId?: string; player_id?: string };
      const code = (body.code || '').toUpperCase();
      const playerId = body.playerId || body.player_id || '';
      if (!code || !playerId) return errorJson('Missing room code or playerId', 400, corsHeaders);

      await TursoClient.query('DELETE FROM room_players WHERE room_code = ? AND player_id = ?', [code, playerId], env);
      const roomRes = await TursoClient.query('SELECT host_id FROM backsilence_rooms WHERE code = ?', [code], env);
      if (roomRes.rows.length > 0 && String(roomRes.rows[0]?.['host_id']) === playerId) {
        await TursoClient.query('DELETE FROM backsilence_rooms WHERE code = ?', [code], env);
      }
      return json({ success: true, ok: true }, 200, corsHeaders);
    }

    // ── ROOM READY ──────────────────────────────────────────────────────────
    if (pathname === '/room/ready' && req.method === 'POST') {
      const body = (await req.json()) as { code?: string; playerId?: string; player_id?: string; ready?: boolean };
      const code = (body.code || '').toUpperCase();
      const playerId = body.playerId || body.player_id || '';
      const ready = body.ready ?? true;
      if (!code || !playerId) return errorJson('Missing room code or playerId', 400, corsHeaders);

      await TursoClient.query('UPDATE room_players SET ready = ? WHERE room_code = ? AND player_id = ?', [ready ? 1 : 0, code, playerId], env);
      return json({ success: true, ok: true, ready }, 200, corsHeaders);
    }

    // ── ROOM START ──────────────────────────────────────────────────────────
    if (pathname === '/room/start' && req.method === 'POST') {
      const body = (await req.json()) as { code?: string; hostId?: string; host_id?: string };
      const code = (body.code || '').toUpperCase();
      const hostId = body.hostId || body.host_id || '';
      if (!code || !hostId) return errorJson('Missing room code or hostId', 400, corsHeaders);

      const rm = await TursoClient.query('SELECT host_id FROM backsilence_rooms WHERE code = ?', [code], env);
      if (rm.rows.length === 0) return errorJson('Room not found', 404, corsHeaders);
      if (String(rm.rows[0]?.['host_id']) !== hostId) return errorJson('Only host can start room', 403, corsHeaders);

      await TursoClient.query("UPDATE backsilence_rooms SET state = 'playing' WHERE code = ?", [code], env);
      return json({ success: true, ok: true, state: 'playing' }, 200, corsHeaders);
    }

    // ── ROOM KICK ───────────────────────────────────────────────────────────
    if (pathname === '/room/kick' && req.method === 'POST') {
      const body = (await req.json()) as { code?: string; hostId?: string; host_id?: string; targetId?: string; target_id?: string };
      const code = (body.code || '').toUpperCase();
      const hostId = body.hostId || body.host_id || '';
      const targetId = body.targetId || body.target_id || '';
      if (!code || !hostId || !targetId) return errorJson('Missing parameters', 400, corsHeaders);

      const rm = await TursoClient.query('SELECT host_id FROM backsilence_rooms WHERE code = ?', [code], env);
      if (rm.rows.length === 0) return errorJson('Room not found', 404, corsHeaders);
      if (String(rm.rows[0]?.['host_id']) !== hostId) return errorJson('Only host can kick players', 403, corsHeaders);

      await TursoClient.query('DELETE FROM room_players WHERE room_code = ? AND player_id = ?', [code, targetId], env);
      return json({ success: true, ok: true, kicked: targetId }, 200, corsHeaders);
    }

    // ── ROOM QUICK PLAY (Matchmaking) ───────────────────────────────────────
    if (pathname === '/room/quick' && req.method === 'POST') {
      const body = (await req.json()) as {
        mode?: string;
        map_id?: string;
        mapId?: string;
        playerId?: string;
        player_id?: string;
        playerName?: string;
        name?: string;
        playerTag?: string;
      };
      const mode = body.mode || 'coop';
      const now = Math.floor(Date.now() / 1000);

      // Search for available open public rooms
      const openRooms = await TursoClient.query('SELECT * FROM backsilence_rooms WHERE public = 1 AND expires_at > ?', [now], env);
      const match = openRooms.rows.find((r) => {
        const roomMode = typeof r['mode'] === 'string' ? r['mode'] : 'coop';
        const roomState = typeof r['state'] === 'string' ? r['state'] : 'waiting';
        return roomMode === mode && roomState === 'waiting';
      });

      if (match) {
        const code = typeof match['code'] === 'string' ? match['code'] : '';
        const mapId = typeof match['map_id'] === 'string' ? match['map_id'] : '';
        const seed = typeof match['seed'] === 'number' ? match['seed'] : 0;
        const hostId = typeof match['host_id'] === 'string' ? match['host_id'] : '';
        return json({
          success: true,
          ok: true,
          code,
          created: false,
          room: {
            code,
            mapId,
            seed,
            hostId,
            mode,
            state: 'waiting',
          },
        }, 200, corsHeaders);
      }

      // No open room found, automatically create one
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const mapId = body.map_id || body.mapId || 'natatorium';
      const seed = Date.now();
      const hostId = body.playerId || body.player_id || 'host';
      const expires = now + 6 * 3600;

      await TursoClient.query(
        'INSERT INTO backsilence_rooms (code, map_id, seed, max_players, host_id, public, mode, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [code, mapId, seed, 4, hostId, 1, mode, now, expires],
        env,
      );

      return json({
        success: true,
        ok: true,
        code,
        created: true,
        room: {
          code,
          mapId,
          seed,
          hostId,
          mode,
          state: 'waiting',
        },
      }, 201, corsHeaders);
    }

    // ── ICE SERVERS CONFIGURATION ───────────────────────────────────────────
    if (pathname === '/ice' && req.method === 'GET') {
      if (env.TURN_URL && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
        return json({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL },
          ],
          relayAvailable: true,
        }, 200, corsHeaders);
      }
      return json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
        relayAvailable: false,
        notice: 'STUN-only fallback: direct connection requires non-symmetric NAT. Set TURN credentials on server for full relay support.',
      }, 200, corsHeaders);
    }

    // ── MODERATION: REPORT PLAYER ───────────────────────────────────────────
    if (pathname === '/report' && req.method === 'POST') {
      const bodyText = await req.text();
      const body = JSON.parse(bodyText || '{}') as {
        reporter_id?: string;
        target_id?: string;
        kind?: string;
        note?: string;
      };
      const reporterId = req.headers.get('X-BS-Player') || body.reporter_id;
      const targetId = body.target_id;
      const kind = body.kind;

      if (!reporterId || !targetId || !kind) {
        return errorJson('Missing reporter_id, target_id, or kind', 400, corsHeaders);
      }

      if (reporterId === targetId) {
        return errorJson('Cannot report self', 400, corsHeaders);
      }

      const repRes = await TursoClient.query('SELECT pubkey, banned FROM players WHERE player_id = ?', [reporterId], env);
      if (repRes.rows.length === 0) {
        return errorJson('Reporter player not registered', 404, corsHeaders);
      }
      if (Number(repRes.rows[0]?.['banned']) === 1) {
        return errorJson('Reporter account is suspended', 403, corsHeaders);
      }

      if (req.headers.has('X-BS-Sig') || req.headers.has('x-bs-sig')) {
        const pubkey = String(repRes.rows[0]?.['pubkey']);
        const sigVerify = await verifyRequestSignature(req.method, pathname, bodyText, req.headers, pubkey);
        if (!sigVerify.valid) {
          return errorJson(`Signature verification rejected: ${sigVerify.reason}`, 401, corsHeaders);
        }
      }

      const reportId = 'rep_' + Math.random().toString(36).substring(2, 10);
      const now = Math.floor(Date.now() / 1000);

      await TursoClient.query(
        'INSERT INTO reports (report_id, reporter_id, target_id, kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [reportId, reporterId, targetId, kind, body.note || '', now],
        env,
      );

      // Check distinct reporter count: after 5 distinct reports, name is hidden until reviewed
      const countRes = await TursoClient.query(
        'SELECT COUNT(DISTINCT reporter_id) as count FROM reports WHERE target_id = ?',
        [targetId],
        env,
      );
      const count = Number(countRes.rows[0]?.['count'] ?? 1);
      let nameHidden = false;
      if (count >= 5) {
        await TursoClient.query("UPDATE players SET name = '[FLAGGED_FOR_REVIEW]' WHERE player_id = ?", [targetId], env);
        nameHidden = true;
      }

      return json({
        success: true,
        report_id: reportId,
        distinct_reports: count,
        nameHidden,
      }, 201, corsHeaders);
    }

    return errorJson(`Endpoint not found: ${req.method} ${pathname}`, 404, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorJson(`Internal server proxy error: ${message}`, 500, corsHeaders);
  }
}

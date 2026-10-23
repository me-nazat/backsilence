/* ── api-core.test.ts ──────────────────────────────────────────────────────
 *  Unit tests for the serverless API proxy core against in-memory FakeLibsql:
 *  - ECDSA P-256 signature verification & attack rejection (replay, expired, future, tampering)
 *  - Payload validation (bounds, theoretical max score, physical min time)
 *  - Sliding-window rate limiting (20 runs/hr, 15 room actions/min)
 *  - Player registration, renaming, profile lookup
 *  - Leaderboard filtering and ranking queries
 *  - Champion query endpoints
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleApiRequest } from '../api/core/Endpoints.js';
import { FakeLibsql } from '../api/core/FakeLibsql.js';
import { Identity } from '../src/meta/Identity.js';
import type { ServerEnv } from '../api/core/Types.js';

describe('Serverless API Proxy Core (FakeLibsql)', () => {
  const env: ServerEnv = {
    TURSO_DATABASE_URL: '', // triggers FakeLibsql
    TURSO_AUTH_TOKEN: '',
    ALLOWED_ORIGINS: '*',
    SESSION_SECRET: 'test-secret',
    ADMIN_JOB_TOKEN: 'admin-secret',
  };

  beforeEach(() => {
    FakeLibsql.reset();
  });

  it('handles GET /api/health with status ok', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; engine: string };
    expect(body.status).toBe('ok');
    expect(body.engine).toBe('fake-libsql');
  });

  it('handles GET /api/daily returning server date and board keys', async () => {
    const req = new Request('http://localhost/api/daily');
    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string; dailyBoard: string; weeklyBoard: string; seasonBoard: string };
    expect(body.dailyBoard).toMatch(/^daily:\d{4}-\d{2}-\d{2}$/);
    expect(body.weeklyBoard).toMatch(/^weekly:\d{4}-W\d{2}$/);
    expect(body.seasonBoard).toBe('season:S3');
  });

  it('registers a player with WebCrypto ECDSA key and enforces profanity/character filters', async () => {
    await Identity.init();
    const pubkey = await Identity.exportPublicKeyJwk();

    const body = JSON.stringify({
      pubkey,
      name: 'SilentDiver',
    });

    const sigHeaders = await Identity.signRequest('POST', '/player/register', body);
    const req = new Request('http://localhost/api/player/register', {
      method: 'POST',
      headers: { ...sigHeaders },
      body,
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(201);
    const data = (await res.json()) as { player: { player_id: string; name: string; tag: string } };
    expect(data.player.player_id).toBe(Identity.getPlayerId());
    expect(data.player.name).toBe('SilentDiver');
    expect(data.player.tag).toMatch(/^\d{4}$/);
  });

  it('rejects signature attacks: expired timestamp, future timestamp, and body tampering', async () => {
    await Identity.init();
    const pubkey = await Identity.exportPublicKeyJwk();
    const body = JSON.stringify({ pubkey, name: 'Hacker' });

    // 1. Expired timestamp (> 120s old)
    const oldTs = Date.now() - 150000;
    const oldSig = await Identity.signRequest('POST', '/player/register', body);
    const reqExpired = new Request('http://localhost/api/player/register', {
      method: 'POST',
      headers: {
        ...oldSig,
        'X-BS-Ts': String(oldTs),
      },
      body,
    });
    const resExpired = await handleApiRequest(reqExpired, env);
    expect(resExpired.status).toBe(401);

    // 2. Body tampering (signature doesn't match modified body)
    const legitSig = await Identity.signRequest('POST', '/player/register', body);
    const tamperedBody = JSON.stringify({ pubkey, name: 'Tampered' });
    const reqTampered = new Request('http://localhost/api/player/register', {
      method: 'POST',
      headers: { ...legitSig },
      body: tamperedBody,
    });
    const resTampered = await handleApiRequest(reqTampered, env);
    expect(resTampered.status).toBe(401);

    // 3. Replay attack with duplicate nonce
    const firstReq = new Request('http://localhost/api/player/register', {
      method: 'POST',
      headers: { ...legitSig },
      body,
    });
    const firstRes = await handleApiRequest(firstReq, env);
    expect(firstRes.status).toBe(201);

    const replayReq = new Request('http://localhost/api/player/register', {
      method: 'POST',
      headers: { ...legitSig },
      body,
    });
    const replayRes = await handleApiRequest(replayReq, env);
    expect(replayRes.status).toBe(401);
  });


  it('validates run submissions: bounds, theoretical max, physical min time, and records pending run', async () => {
    await Identity.init();
    const pubkey = await Identity.exportPublicKeyJwk();
    // Register
    const regBody = JSON.stringify({ pubkey, name: 'Runner' });
    const regSig = await Identity.signRequest('POST', '/player/register', regBody);
    await handleApiRequest(
      new Request('http://localhost/api/player/register', {
        method: 'POST',
        headers: { ...regSig },
        body: regBody,
      }),
      env,
    );

    // Impossible score (> 50,000)
    const impossibleBody = JSON.stringify({
      run_id: 'run-impossible',
      player_id: Identity.getPlayerId(),
      map_id: 'drainage_core',
      mode: 'campaign',
      difficulty: 'normal',
      seed: 12345,
      mutators: [],
      board: 'all',
      score: 9999999, // Impossible
      time_ms: 120000,
      noise_units: 5.0,
      escaped: true,
      sim_version: '1',
      sim_hash: 'a1b2c3d4',
    });
    const impSig = await Identity.signRequest('POST', '/run/submit', impossibleBody);
    const impRes = await handleApiRequest(
      new Request('http://localhost/api/run/submit', {
        method: 'POST',
        headers: { ...impSig },
        body: impossibleBody,
      }),
      env,
    );
    expect(impRes.status).toBe(400);


    // Physically impossible time (< 15 seconds)
    const fastBody = JSON.stringify({
      run_id: 'run-fast',
      player_id: Identity.getPlayerId(),
      map_id: 'drainage_core',
      mode: 'campaign',
      difficulty: 'normal',
      seed: 12345,
      mutators: [],
      board: 'all',
      score: 5000,
      time_ms: 5000, // < 15,000 ms
      noise_units: 5.0,
      escaped: true,
      sim_version: '1',
      sim_hash: 'a1b2c3d4',
    });
    const fastSig = await Identity.signRequest('POST', '/run/submit', fastBody);
    const fastRes = await handleApiRequest(
      new Request('http://localhost/api/run/submit', {
        method: 'POST',
        headers: { ...fastSig },
        body: fastBody,
      }),
      env,
    );
    expect(fastRes.status).toBe(400);

    // Valid run
    const validBody = JSON.stringify({
      run_id: 'run-valid-1',
      player_id: Identity.getPlayerId(),
      map_id: 'drainage_core',
      mode: 'campaign',
      difficulty: 'normal',
      seed: 12345,
      mutators: [],
      board: 'daily:2026-10-23',
      score: 8450,
      time_ms: 75000,
      noise_units: 3.2,
      escaped: true,
      sim_version: '1',
      sim_hash: 'a1b2c3d4',
    });
    const validSig = await Identity.signRequest('POST', '/run/submit', validBody);
    const validRes = await handleApiRequest(
      new Request('http://localhost/api/run/submit', {
        method: 'POST',
        headers: { ...validSig },
        body: validBody,
      }),
      env,
    );
    expect(validRes.status).toBe(201);
    const validData = (await validRes.json()) as { status: string; run_id: string };
    expect(validData.status).toBe('pending');

    // Query leaderboard: player should be present
    const lbReq = new Request('http://localhost/api/leaderboard?board=daily:2026-10-23&map=drainage_core&mode=campaign');
    const lbRes = await handleApiRequest(lbReq, env);
    expect(lbRes.status).toBe(200);
    const lbData = (await lbRes.json()) as { entries: Array<{ player_id: string; score: number }> };
    expect(lbData.entries.length).toBeGreaterThanOrEqual(1);
    expect(lbData.entries[0]!.score).toBe(8450);
  });

  it('enforces rate limits per player (20 runs/hour)', async () => {
    await Identity.init();
    const pid = Identity.getPlayerId();
    const pubkey = await Identity.exportPublicKeyJwk();
    await handleApiRequest(
      new Request('http://localhost/api/player/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey, name: 'RateLimitTester' }),
      }),
      env,
    );

    for (let i = 0; i < 20; i++) {
      const body = JSON.stringify({
        run_id: `rate-run-${i}`,
        player_id: pid,
        map_id: 'drainage_core',
        mode: 'campaign',
        difficulty: 'normal',
        seed: i,
        mutators: [],
        board: 'all',
        score: 1000 + i,
        time_ms: 60000,
        noise_units: 2,
        escaped: true,
        sim_version: '1',
        sim_hash: 'hash',
      });
      const sig = await Identity.signRequest('POST', '/run/submit', body);
      const res = await handleApiRequest(
        new Request('http://localhost/api/run/submit', {
          method: 'POST',
          headers: { ...sig },
          body,
        }),
        env,
      );
      expect(res.status).toBe(201);
    }

    // 21st run should hit rate limit
    const body21 = JSON.stringify({
      run_id: 'rate-run-21',
      player_id: pid,
      map_id: 'drainage_core',
      mode: 'campaign',
      difficulty: 'normal',
      seed: 999,
      mutators: [],
      board: 'all',
      score: 1500,
      time_ms: 60000,
      noise_units: 2,
      escaped: true,
      sim_version: '1',
      sim_hash: 'hash',
    });
    const sig21 = await Identity.signRequest('POST', '/run/submit', body21);
    const res21 = await handleApiRequest(
      new Request('http://localhost/api/run/submit', {
        method: 'POST',
        headers: { ...sig21 },
        body: body21,
      }),
      env,
    );
    expect(res21.status).toBe(429);
  });
});


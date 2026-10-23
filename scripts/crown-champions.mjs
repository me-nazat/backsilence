/* ── crown-champions.mjs ───────────────────────────────────────────────────
 *  Automated worker for crowning Weekly and Season champions.
 *  - Weekly: Top verified run for the preceding weekly board
 *  - Season: Top verified run for the active season board with player ranked_matches >= 20
 *  Schedule: Every Monday at 00:00 UTC via GitHub Actions / cloud scheduler.
 * ──────────────────────────────────────────────────────────────────────── */

import { TursoClient } from '../api/core/TursoClient.js';

function getPriorWeekKey() {
  const d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const year = d.getUTCFullYear();
  const oneJan = new Date(Date.UTC(year, 0, 1));
  const weekNum = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getUTCDay() + 1) / 7);
  return `weekly:${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getCurrentSeason() {
  return 'S3';
}

async function run() {
  const dbUrl = process.env['TURSO_DATABASE_URL'] || '';
  const token = process.env['TURSO_AUTH_TOKEN'] || '';

  const client = new TursoClient(dbUrl, token);
  const now = Date.now();
  const season = getCurrentSeason();
  const weekBoard = getPriorWeekKey();
  const seasonBoard = `season:${season}`;

  console.log(`[crown-champions] Crowning champions for week ${weekBoard} and season ${seasonBoard}...`);

  // 1. Weekly Champions per map and mode
  const weeklyRuns = await client.execute(
    `SELECT r.run_id, r.player_id, r.map_id, r.mode, r.score, r.board
     FROM runs r
     WHERE r.board = ? AND r.status = 'verified'
     GROUP BY r.map_id, r.mode
     HAVING MAX(r.score)`,
    [weekBoard],
  );

  for (const row of weeklyRuns) {
    const mapId = String(row['map_id']);
    const mode = String(row['mode']);
    const playerId = String(row['player_id']);
    const score = Number(row['score']);
    const runId = String(row['run_id']);

    await client.execute(
      `INSERT OR REPLACE INTO champions (season, board, map_id, mode, player_id, score, run_id, crowned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [season, weekBoard, mapId, mode, playerId, score, runId, now],
    );
    console.log(`[crown-champions] Crowned Weekly Champion: Player ${playerId} on ${mapId} (${mode}) with score ${score}`);
  }

  // 2. Season Champions (requires ranked_matches >= 20)
  const seasonRuns = await client.execute(
    `SELECT r.run_id, r.player_id, r.map_id, r.mode, r.score, r.board
     FROM runs r
     JOIN players p ON r.player_id = p.player_id
     WHERE r.board = ? AND r.status = 'verified' AND p.ranked_matches >= 20
     GROUP BY r.map_id, r.mode
     HAVING MAX(r.score)`,
    [seasonBoard],
  );

  for (const row of seasonRuns) {
    const mapId = String(row['map_id']);
    const mode = String(row['mode']);
    const playerId = String(row['player_id']);
    const score = Number(row['score']);
    const runId = String(row['run_id']);

    await client.execute(
      `INSERT OR REPLACE INTO champions (season, board, map_id, mode, player_id, score, run_id, crowned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [season, seasonBoard, mapId, mode, playerId, score, runId, now],
    );
    console.log(`[crown-champions] Crowned Season Champion: Player ${playerId} on ${mapId} (${mode}) with score ${score}`);
  }

  console.log('[crown-champions] Champion crowning cycle complete.');
}

run().catch((err) => {
  console.error('[crown-champions] Fatal error:', err);
  process.exit(1);
});

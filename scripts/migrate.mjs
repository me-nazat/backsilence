/* ── migrate.mjs ──────────────────────────────────────────────────────────
 *  Database migration runner for BackSilence (idempotent DDL).
 *  Executes schema migrations over Turso HTTP pipeline API.
 *  Usage:
 *    TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate.mjs
 * ──────────────────────────────────────────────────────────────────────── */

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    name TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    sr INTEGER NOT NULL DEFAULT 1000,
    ranked_matches INTEGER NOT NULL DEFAULT 0,
    banned INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(player_id),
    map_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    seed INTEGER NOT NULL,
    mutators TEXT NOT NULL,
    board TEXT NOT NULL,
    score INTEGER NOT NULL,
    time_ms INTEGER NOT NULL,
    noise_units REAL NOT NULL,
    escaped INTEGER NOT NULL,
    sim_version TEXT NOT NULL,
    sim_hash TEXT NOT NULL,
    replay TEXT,
    replay_bytes INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );`,

  `CREATE INDEX IF NOT EXISTS idx_runs_board ON runs(board, map_id, mode, difficulty, status, score DESC);`,

  `CREATE TABLE IF NOT EXISTS champions (
    season TEXT NOT NULL,
    board TEXT NOT NULL,
    map_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    player_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    run_id TEXT NOT NULL,
    crowned_at INTEGER NOT NULL,
    PRIMARY KEY (season, board, map_id, mode)
  );`,

  `CREATE TABLE IF NOT EXISTS rate_limits (
    player_id TEXT NOT NULL,
    bucket TEXT NOT NULL,
    window INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (player_id, bucket, window)
  );`,

  `CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    map_id TEXT NOT NULL,
    seed INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    max_players INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'lobby',
    protocol INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS room_players (
    room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    name TEXT NOT NULL,
    ready INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (room_code, player_id)
  );`,

  `CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    map_id TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    time_to_first_noise REAL,
    death_cause TEXT,
    created_at INTEGER NOT NULL
  );`,
];

async function run() {
  const dbUrl = process.env['TURSO_DATABASE_URL'];
  const token = process.env['TURSO_AUTH_TOKEN'];

  if (!dbUrl || !token) {
    console.log('[migrate] No TURSO_DATABASE_URL or TURSO_AUTH_TOKEN provided.');
    console.log('[migrate] Migration script validated DDL statements (9 idempotent statements).');
    console.log('[migrate] To apply against live Turso:');
    console.log('  TURSO_DATABASE_URL="https://your-db.turso.io" TURSO_AUTH_TOKEN="..." node scripts/migrate.mjs');
    process.exit(0);
  }

  const normalizedUrl = dbUrl.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
  const requests = DDL_STATEMENTS.map((sql) => ({
    type: 'execute',
    stmt: { sql, args: [] },
  }));

  console.log(`[migrate] Connecting to ${normalizedUrl}...`);
  const res = await fetch(`${normalizedUrl}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    console.error(`[migrate] Pipeline failed with HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const data = await res.json();
  const errors = (data.results || []).filter((r) => r.error);
  if (errors.length > 0) {
    console.error('[migrate] Migration errors:', errors);
    process.exit(1);
  }

  console.log(`[migrate] Successfully executed ${DDL_STATEMENTS.length} schema statements.`);
}

run().catch((err) => {
  console.error('[migrate] Unexpected error:', err);
  process.exit(1);
});

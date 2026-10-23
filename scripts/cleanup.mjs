/* ── cleanup.mjs ───────────────────────────────────────────────────────────
 *  Automated maintenance worker for purging stale rooms, signals, and rate limits.
 *  Schedule: Hourly via GitHub Actions / cloud scheduler.
 * ──────────────────────────────────────────────────────────────────────── */

import { TursoClient } from '../api/core/TursoClient.js';

async function run() {
  const dbUrl = process.env['TURSO_DATABASE_URL'] || '';
  const token = process.env['TURSO_AUTH_TOKEN'] || '';

  const client = new TursoClient(dbUrl, token);
  const now = Date.now();

  console.log('[cleanup] Starting database cleanup cycle...');

  // 1. Delete expired rooms (expires_at < now)
  await client.execute(
    `DELETE FROM rooms WHERE expires_at < ?`,
    [now],
  );
  console.log('[cleanup] Cleaned up expired rooms.');

  // 2. Delete signals older than 1 hour (3600000 ms)
  const oneHourAgo = now - 3600000;
  await client.execute(
    `DELETE FROM signals WHERE created_at < ?`,
    [oneHourAgo],
  );
  console.log('[cleanup] Cleaned up signals older than 1 hour.');

  // 3. Delete rate limits older than 2 hours
  const twoHoursAgo = now - 7200000;
  await client.execute(
    `DELETE FROM rate_limits WHERE window < ?`,
    [twoHoursAgo],
  );
  console.log('[cleanup] Cleaned up stale rate limit windows.');

  console.log('[cleanup] Database cleanup cycle complete.');
}

run().catch((err) => {
  console.error('[cleanup] Fatal error:', err);
  process.exit(1);
});

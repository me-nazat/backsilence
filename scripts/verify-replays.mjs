/* ── verify-replays.mjs ─────────────────────────────────────────────────────
 *  Automated headless replay verification worker.
 *  Fetches pending runs, deserializes RLE intent recordings, executes
 *  pure deterministic SimWorld replay, compares sim_hash, and updates status
 *  to 'verified' or 'rejected'.
 *  Schedule: GitHub Actions cron every 15 minutes.
 * ──────────────────────────────────────────────────────────────────────── */

import { TursoClient } from '../api/core/TursoClient.js';
import { Replay } from '../src/meta/Replay.js';
import { RunRecorder } from '../src/meta/RunRecorder.js';
import { MAP_REGISTRY } from '../src/world/MapRegistry.js';

async function run() {
  const dbUrl = process.env['TURSO_DATABASE_URL'] || '';
  const token = process.env['TURSO_AUTH_TOKEN'] || '';

  const client = new TursoClient(dbUrl, token);

  console.log('[verify-replays] Starting replay verification cycle...');

  // Fetch pending runs ordered by score desc
  const rows = await client.execute(
    `SELECT run_id, map_id, mode, difficulty, seed, score, time_ms, sim_version, sim_hash, replay
     FROM runs
     WHERE status = 'pending' AND replay IS NOT NULL
     ORDER BY score DESC
     LIMIT 50`,
    [],
  );

  console.log(`[verify-replays] Found ${rows.length} pending runs with replay payload.`);

  for (const row of rows) {
    const runId = String(row['run_id']);
    const mapId = String(row['map_id']);
    const submittedHash = String(row['sim_hash']);
    const submittedScore = Number(row['score']);
    const replayRaw = String(row['replay']);

    try {
      // Decode recording
      const jsonStr = Buffer.from(replayRaw, 'base64').toString('utf8');
      const recording = RunRecorder.deserialize(jsonStr);

      // Load map layout
      const mapLoader = MAP_REGISTRY[mapId];
      if (!mapLoader) {
        throw new Error(`Unknown mapId: ${mapId}`);
      }
      const mapDef = await mapLoader();
      const layout = mapDef.layout;

      // Execute headless replay
      const result = Replay.run(recording, layout);

      if (!result.valid) {
        console.warn(`[verify-replays] Run ${runId} invalid: ${result.error}`);
        await client.execute(
          `UPDATE runs SET status = 'rejected' WHERE run_id = ?`,
          [runId],
        );
        continue;
      }

      // Check sim_hash
      if (result.simHash !== submittedHash) {
        console.warn(`[verify-replays] Run ${runId} hash mismatch. Submitted: ${submittedHash}, Computed: ${result.simHash}`);
        await client.execute(
          `UPDATE runs SET status = 'rejected' WHERE run_id = ?`,
          [runId],
        );
        continue;
      }

      // Verified!
      console.log(`[verify-replays] Run ${runId} successfully verified! (score: ${submittedScore}, hash: ${result.simHash})`);
      await client.execute(
        `UPDATE runs SET status = 'verified' WHERE run_id = ?`,
        [runId],
      );
    } catch (err) {
      console.error(`[verify-replays] Error verifying run ${runId}:`, err);
      await client.execute(
        `UPDATE runs SET status = 'rejected' WHERE run_id = ?`,
        [runId],
      );
    }
  }

  console.log('[verify-replays] Verification cycle complete.');
}

run().catch((err) => {
  console.error('[verify-replays] Fatal error:', err);
  process.exit(1);
});

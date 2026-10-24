/* ── scripts/admin/ban.mjs ────────────────────────────────────────────────
 *  Administrative script to ban or unban players.
 *  Usage:
 *    node scripts/admin/ban.mjs <playerId> [ban|unban] [reason]
 * ──────────────────────────────────────────────────────────────────────── */

import { TursoClient } from '../../api/core/TursoClient.js';

async function main() {
  const args = process.argv.slice(2);
  const playerId = args[0];
  const action = (args[1] || 'ban').toLowerCase();
  const reason = args.slice(2).join(' ') || 'Administrative moderation action';

  if (!playerId) {
    console.error('Usage: node scripts/admin/ban.mjs <playerId> [ban|unban] [reason]');
    process.exit(1);
  }

  if (action !== 'ban' && action !== 'unban') {
    console.error(`Invalid action "${action}". Must be "ban" or "unban".`);
    process.exit(1);
  }

  const bannedVal = action === 'ban' ? 1 : 0;
  const dbUrl = process.env['TURSO_DATABASE_URL'] || '';
  const token = process.env['TURSO_AUTH_TOKEN'] || '';

  const client = new TursoClient(dbUrl, token);

  console.log(`[admin-ban] Executing ${action.toUpperCase()} for player "${playerId}"...`);
  console.log(`[admin-ban] Reason: "${reason}"`);

  // Verify player exists
  const check = await client.execute(
    'SELECT player_id, name, tag, banned FROM players WHERE player_id = ?',
    [playerId],
  );

  if (check.length === 0) {
    console.warn(`[admin-ban] Warning: player "${playerId}" not found in database. Proceeding with update anyway.`);
  } else {
    const p = check[0];
    console.log(`[admin-ban] Target player found: ${p?.name}#${p?.tag} (currently banned: ${p?.banned === 1})`);
  }

  const updateRes = await client.execute(
    'UPDATE players SET banned = ? WHERE player_id = ?',
    [bannedVal, playerId],
  );

  console.log(`[admin-ban] Successfully set banned=${bannedVal} for player "${playerId}".`);
}

main().catch((err) => {
  console.error('[admin-ban] Fatal error:', err);
  process.exit(1);
});

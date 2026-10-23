/* ── api/netlify/api.ts ────────────────────────────────────────────────────
 *  Netlify Functions entrypoint for BackSilence API proxy.
 * ──────────────────────────────────────────────────────────────────────── */

import { handleApiRequest } from '../core/Endpoints.js';
import type { ServerEnv } from '../core/Types.js';

declare const process: { env: Record<string, string | undefined> };

export default async (request: Request): Promise<Response> => {

  const env: ServerEnv = {
    TURSO_DATABASE_URL: process.env['TURSO_DATABASE_URL'],
    TURSO_AUTH_TOKEN: process.env['TURSO_AUTH_TOKEN'],
    ALLOWED_ORIGINS: process.env['ALLOWED_ORIGINS'],
    SESSION_SECRET: process.env['SESSION_SECRET'],
    ADMIN_JOB_TOKEN: process.env['ADMIN_JOB_TOKEN'],
  };
  return handleApiRequest(request, env);
};

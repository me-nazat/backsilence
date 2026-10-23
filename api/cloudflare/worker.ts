/* ── api/cloudflare/worker.ts ──────────────────────────────────────────────
 *  Cloudflare Workers entrypoint for BackSilence API proxy.
 * ──────────────────────────────────────────────────────────────────────── */

import { handleApiRequest } from '../core/Endpoints.js';
import type { ServerEnv } from '../core/Types.js';

export default {
  async fetch(request: Request, env: ServerEnv): Promise<Response> {
    return handleApiRequest(request, env);
  },
};

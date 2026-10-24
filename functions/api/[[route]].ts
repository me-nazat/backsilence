/* ── functions/api/[[route]].ts ──────────────────────────────────────────
 *  Cloudflare Pages Functions catch-all wrapper for /api/* routes.
 *  Delegates pure standard Request -> Response processing to api/core/Endpoints.
 * ──────────────────────────────────────────────────────────────────────── */

import { handleApiRequest } from '../../api/core/Endpoints.js';
import type { ServerEnv } from '../../api/core/Types.js';

export interface PagesContext {
  request: Request;
  env: ServerEnv;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: () => Promise<Response>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleApiRequest(context.request, context.env);
}

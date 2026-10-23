/* ── dev-api-proxy.mjs ──────────────────────────────────────────────────────
 *  Local development proxy for /api/* using FakeLibsql or live Turso credentials.
 *  Allows 100% offline development, testing, and Smoke Bot execution.
 *  Run via: npm run dev:api
 * ──────────────────────────────────────────────────────────────────────── */

import http from 'node:http';
import { handleApiRequest } from '../api/core/Endpoints.ts';

const PORT = Number(process.env['PORT']) || 8787;

const serverEnv = {
  TURSO_DATABASE_URL: process.env['TURSO_DATABASE_URL'] || '',
  TURSO_AUTH_TOKEN: process.env['TURSO_AUTH_TOKEN'] || '',
  ALLOWED_ORIGINS: process.env['ALLOWED_ORIGINS'] || '*',
  SESSION_SECRET: process.env['SESSION_SECRET'] || 'dev-secret-session-key',
  ADMIN_JOB_TOKEN: process.env['ADMIN_JOB_TOKEN'] || 'dev-admin-job-token',
};

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);

    const host = req.headers.host || `localhost:${PORT}`;
    const url = `http://${host}${req.url}`;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) {
        if (Array.isArray(v)) {
          for (const item of v) headers.append(k, item);
        } else {
          headers.set(k, v);
        }
      }
    }

    const init = {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method?.toUpperCase() || '') ? undefined : bodyBuffer,
    };

    const webReq = new Request(url, init);
    const webRes = await handleApiRequest(webReq, serverEnv);

    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => {
      res.setHeader(k, v);
    });

    const resArrayBuf = await webRes.arrayBuffer();
    res.end(Buffer.from(resArrayBuf));
  } catch (err) {
    console.error('[dev-api-proxy] Error handling request:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error in dev proxy' }));
  }
});

server.listen(PORT, () => {
  const mode = serverEnv.TURSO_DATABASE_URL ? 'Live Turso' : 'In-Memory FakeLibsql (Offline)';
  console.log(`[dev-api-proxy] Listening on http://localhost:${PORT}`);
  console.log(`[dev-api-proxy] Mode: ${mode}`);
});

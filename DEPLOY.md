# BackSilence — Production Deployment Guide

**BackSilence** builds into a 100% static client-side bundle containing zero binary audio, image, or 3D asset files. All geometry, textures, shaders, and sound synthesis are generated at runtime.

---

## 1. Production Build & Verification

Before deploying, run the full verification pipeline:

```bash
npm run verify
```

This executes:
1. `typecheck` (`tsc --noEmit`)
2. `lint` (`eslint .`)
3. `test` (`vitest run` — all 254 unit/integration tests across 25 suites)
4. `build` (`vite build`)
5. `audit` (Bundle budget checks: boot chunk $\le 35\text{ KB}$ gz, non-map core $\le 450\text{ KB}$ gz)

6. `deploy:preview` (`npm run deploy:preview` — builds and serves locally on port 4173 with simulated production headers)

The output directory is `dist/`.

To test the preview build locally prior to publication:
```bash
npm run deploy:preview
```

---

## 2. HTTPS Requirement

> [!IMPORTANT]
> **HTTPS is mandatory** in production for:
> - **Service Worker registration** (`/sw.js`) for full offline capability.
> - **WebRTC (`RTCPeerConnection`)** camera/data channel access.
> - **Pointer Lock API** and audio context resumption policies.

All major static hosting providers (Vercel, Netlify, Cloudflare Pages, GitHub Pages) provision automated SSL certificates out-of-the-box.

---

## 3. Platform Setup Guides

### 3.1 Cloudflare Pages + Cloudflare Workers (Recommended)
1. Link your Git repository in Cloudflare Dashboard.
2. Build command: `npm run build`
3. Output directory: `dist`
4. Node version: `20`
5. Client variables: `VITE_API_BASE=/api` (or worker custom domain)
6. Server-side secrets for the `/api/*` worker:
   - `TURSO_DATABASE_URL` (e.g. `https://your-db-slug.turso.io`)
   - `TURSO_AUTH_TOKEN` (server-only secret via `wrangler secret put`)
   - `ALLOWED_ORIGINS` (e.g. `https://yourdomain.com`)
   - `ADMIN_JOB_TOKEN` (secret for cron verifier)

### 3.2 Vercel (Edge Functions)
Deploy client to Vercel and API routes via `api/vercel/[...route].ts`:
1. Build command: `npm run build`
2. Output directory: `dist`
3. Server environment variables (Server-only, never VITE_*):
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `ALLOWED_ORIGINS`
   - `ADMIN_JOB_TOKEN`

### 3.3 Netlify (Netlify Functions)
Deploy functions via `netlify/functions/api.ts` mapping to `api/core`:
- Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Site Configuration → Environment Variables (Scope: Functions).

---

## 4. Content Security Policy (CSP)

With the `/api/*` proxy architecture, client browser network access is locked strictly to same-origin and optional WebRTC STUN servers:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://<your-api-domain>; img-src 'self' data: blob:; worker-src 'self';
```

> [!NOTE]
> Client code **never** connects directly to `turso.io` or databases. All communication flows through the authenticated `/api/*` proxy.

---

## 5. Offline Verification

Once deployed to production:
1. Open the game in Chrome / Edge / Safari / Firefox.
2. Turn on Airplane Mode (disable Wi-Fi and Cellular).
3. Reload the tab (`Cmd+R` / `F5`).
4. Verify the game loads completely from CacheStorage and plays at 60 FPS offline with zero network requests.

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
3. `test` (`vitest run` — all 130 unit/integration tests)
4. `build` (`vite build`)
5. `audit` (Bundle budget checks: boot chunk $\le 35\text{ KB}$ gz, non-map core $\le 450\text{ KB}$ gz)

The output directory is `dist/`.

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

### 3.1 Cloudflare Pages (Recommended)
1. Link your Git repository in Cloudflare Dashboard.
2. Build command: `npm run build`
3. Output directory: `dist`
4. Node version: `18` or `20`
5. Environment variables: Add your database credentials (e.g. `VITE_NET_PROVIDER=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

### 3.2 Vercel
Create `vercel.json` in root:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    }
  ]
}
```

### 3.3 Netlify
Create `public/_headers` (copied to `dist/_headers` on build):
```text
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-cache, no-store, must-revalidate
```

### 3.4 GitHub Pages
Use GitHub Actions workflow `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
```

---

## 4. Content Security Policy (CSP)

BackSilence operates safely with strict CSP headers:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.firebaseio.com wss://*.firebaseio.com https://*.turso.io; img-src 'self' data: blob:; worker-src 'self';
```

> [!NOTE]
> `'unsafe-eval'` is permitted for WebGL shader compilation and procedural noise buffer generation. No remote script execution or external CDN downloads occur.

---

## 5. Offline Verification

Once deployed to production:
1. Open the game in Chrome / Edge / Safari / Firefox.
2. Turn on Airplane Mode (disable Wi-Fi and Cellular).
3. Reload the tab (`Cmd+R` / `F5`).
4. Verify the game loads completely from CacheStorage and plays at 60 FPS offline with zero network requests.

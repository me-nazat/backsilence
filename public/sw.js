/* ── sw.js ─────────────────────────────────────────────────────────────
 *  BackSilence Offline Service Worker.
 *  - Cache-first for same-origin static chunks and assets
 *  - Caches 3D models (/models/*.glb, /models/*.json) on first online visit
 *  - Stale-while-revalidate for GET leaderboards, champions, and daily endpoints
 *  - NEVER caches /api POST or write requests
 *  - NEVER intercepts cross-origin requests or room links (?room=)
 *  - Clean eviction of legacy caches on activate
 * ──────────────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'backsilence-cache-v2';
const MODELS_CACHE = 'backsilence-models-v1';
const API_CACHE = 'backsilence-api-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const allowed = new Set([CACHE_NAME, MODELS_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (!allowed.has(key)) {
            return caches.delete(key);
          }
          return Promise.resolve();
        }),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Never intercept non-GET requests or cross-origin requests
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 2. Never cache or intercept room links needing fresh HTML/signaling
  if (url.searchParams.has('room')) {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  // 3. 3D Model Caching: Cache on first online visit
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(
      caches.open(MODELS_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            if (res.ok) {
              cache.put(req, res.clone());
            }
            return res;
          });
        }),
      ),
    );
    return;
  }

  // 4. Stale-While-Revalidate for Read-Only API Endpoints
  if (
    url.pathname.startsWith('/api/leaderboard') ||
    url.pathname.startsWith('/api/champions') ||
    url.pathname.startsWith('/api/daily')
  ) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req)
            .then((res) => {
              if (res.ok) {
                cache.put(req, res.clone());
              }
              return res;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        }),
      ),
    );
    return;
  }

  // 5. Never cache any other /api routes (e.g. /api/room, /api/run)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 6. Network-first with cache fallback for navigation (HTML)
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
    );
    return;
  }

  // 7. Cache-first for hashed static assets (.js, .css, .svg, etc.)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});

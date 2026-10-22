/* ── sw.js ─────────────────────────────────────────────────────────────
 *  BackSilence Offline Service Worker.
 *  - Cache-first for same-origin static chunks and assets
 *  - Network-first for index.html with cache fallback
 *  - NEVER intercepts cross-origin requests (database adapters) or ?room=
 *  - Clean eviction of legacy caches on activate
 * ──────────────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'backsilence-cache-v1';

const APP_SHELL = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
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

  // 2. Never cache or intercept room links needing fresh HTML/params
  if (url.searchParams.has('room')) {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  // 3. Network-first with cache fallback for navigation (HTML)
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

  // 4. Cache-first for hashed static assets (.js, .css, etc.)
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

const CACHE_NAME = 'backsilence-cache-v2';
const MODELS_CACHE = 'backsilence-models-v1';
const API_CACHE = 'backsilence-api-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  const allowed = new Set([CACHE_NAME, MODELS_CACHE, API_CACHE]);
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (allowed.has(k) ? Promise.resolve() : caches.delete(k))))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.searchParams.has('room')) {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.pathname.startsWith('/models/')) {
    e.respondWith(
      caches.open(MODELS_CACHE).then((c) =>
        c.match(req).then((cached) => cached || fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        })),
      ),
    );
    return;
  }
  if (url.pathname.startsWith('/api/leaderboard') || url.pathname.startsWith('/api/champions') || url.pathname.startsWith('/api/daily')) {
    e.respondWith(
      caches.open(API_CACHE).then((c) =>
        c.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        }),
      ),
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});

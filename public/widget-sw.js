/*
 * OLYMPUS live widget service worker (v0.0.84 edit).
 * Installability + an offline shell; the data itself is always live.
 */
const CACHE = 'olympus-widget-v1';
const SHELL = '/m/widget';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(SHELL).then((hit) => hit || Response.error())),
  );
});

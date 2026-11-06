/*
 * OLYMPUS mobile service worker (v0.0.85).
 *
 * One worker, one scope (`/m`), two installable surfaces: the companion and
 * the live widget. It caches only the two navigation shells — never API data
 * and never hashed JS chunks (a stale chunk cache is the "loading the
 * pantheon" failure the desktop gate now blocks). Data is always live.
 */
const CACHE = 'olympus-mobile-v1';
const SHELLS = ['/m', '/m/widget'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(SHELLS.map((url) => cache.add(url).catch(() => {}))))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('olympus-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(async () => (
        (await caches.match(request))
        || (await caches.match('/m'))
        || Response.error()
      )),
  );
});

/*
 * A notification is a door: tapping it focuses the installed widget or opens
 * it. The URL is always a phone surface (/m or /m/widget), never the PC app.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/m/widget';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((client) => client.url.includes('/m'));
    if (existing) {
      try { await existing.focus(); } catch { /* gone */ }
      try { await existing.navigate(target); } catch { /* cross-origin */ }
      return;
    }
    await self.clients.openWindow(target);
  })());
});

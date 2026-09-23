const CACHE_NAME = 'waffer-shell-v29';
const SHELL = ['/', '/index.html', '/app.js', '/app-module.js', '/vin-ui.js', '/parts-match.js', '/manifest.webmanifest', '/lib/i18n.js', '/lib/runtime-config.js', '/lib/total-check.js', '/lib/image-optimization.js', '/lib/identity.js', '/lib/pricing-client.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith('waffer-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache API calls or user analysis data.
  if (url.pathname.startsWith('/api/') || request.method !== 'GET') return;

  // HTML uses network-first so a new deployment is visible immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then(hit => hit || caches.match('/')))
    );
    return;
  }

  // Static shell assets use stale-while-revalidate.
  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      });
      return hit || network;
    })
  );
});

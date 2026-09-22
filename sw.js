const CACHE_NAME = 'waffer-shell-stability-20260922';
const V = '?v=20260922-stability';
const SHELL = ['/', '/index.html', '/app.js', '/manifest.webmanifest', '/lib/market-config.js',
  '/lib/client-core.js'+V, '/lib/i18n.js'+V, '/vin-ui.js'+V, '/parts-match.js'+V];
const ALLOWED = new Set(SHELL);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('waffer-shell-') && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Allowlist, not a broad catch-all: never intercept API data, external images,
  // other sites, POST bodies, or unknown query strings.
  if (request.method !== 'GET' || url.origin !== self.location.origin || !ALLOWED.has(url.pathname + url.search)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      return await cache.match(request) || Response.error();
    }
  })());
});

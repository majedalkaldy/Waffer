const CACHE = 'waffer-shell-20260922-tested-r1';
const SHELL = ['/', '/index.html', '/ui/app.js', '/ui/app.css', '/lib/client-http.js', '/lib/client-core.js', '/lib/client-matcher.js', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('waffer-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Only allowlisted, same-origin static shell files. No API, query data, or third-party caches.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || !SHELL.includes(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      // Never substitute HTML for JavaScript/CSS or an unknown request.
      return new Response('Offline', { status:503, headers:{ 'Content-Type':'text/plain;charset=utf-8' } });
    }
  })());
});

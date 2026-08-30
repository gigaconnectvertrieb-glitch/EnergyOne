const CACHE = "e1-portal-shell-v1";
const SHELL_ASSETS = ["/static/icon-192.png", "/static/icon-512.png", "/static/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

// Network-first for everything: this app shows live business data (customers,
// commissions, WebSocket updates) - we never want a stale cached response to
// silently override current data. The cache here only exists to make the app
// installable and to keep the icon/manifest available if a request briefly fails.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

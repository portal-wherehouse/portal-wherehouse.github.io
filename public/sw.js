// Installable shell (blueprint page 18). The app opens with no connection because its files are cached here.
// Data never passes through this cache; it lives in IndexedDB.
// Each build stamps its id below, so a deploy always brings a new service worker. The new one waits while
// Wherehouse is open, so an update never lands mid-scan or while queued moves are pending (page 38), until
// every Wherehouse tab closes, the person presses Reload on "New version ready", or the app finds a quiet
// moment to load it by itself: in the background, on the next screen, or when idle (src/device/pwa.ts).
// Pages always come from the network when online, so a reload shows the newest version either way.
const BUILD = '__BUILD_ID__';
const CACHE = `wherehouse-shell-${BUILD}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon.svg', './icon-192.png'])));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('pallet-locator-shell-') || k.startsWith('wherehouse-shell-')) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function keep(req, res) {
  // Whole responses only: a partial (206) video range cannot be cached.
  if (res.status === 200 || res.type === 'opaque') {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    // Fresh page when online, the cached shell when not.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  // The deployed build's id: always asked of the server, never answered from the cache.
  if (sameOrigin && url.pathname.endsWith('/version.json')) return;
  // Build files have content hashes in their names, so a cached copy is always the right one.
  if (fonts || url.pathname.includes('/assets/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res))));
    return;
  }
  // Everything else (the manifest, icons, videos) keeps its name across versions: the network first, the cache offline.
  event.respondWith(
    fetch(req)
      .then((res) => keep(req, res))
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});

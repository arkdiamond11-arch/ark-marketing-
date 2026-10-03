/* Marketing app service worker — network-first, cache as offline fallback for the app shell */
const CACHE = 'app-shell-v7';
const SHELL = ['index.html', 'styles.css', 'config.js', 'manifest.json', 'icon-192.png', 'icon.svg',
  'app.js', 'i18n.js', 'jewel.js', 'orders.js', 'util.js', 'docs.js', 'ledger.js', 'steps.js',
  'accounts.js', 'reports.js', 'catalogue.js', 'karigars.js', 'visits.js', 'targets.js', 'summary.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never intercept API traffic — only same-origin GETs inside the app's own folder
  const appDir = new URL('./', self.location.href).pathname;
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(appDir)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      // offline: the scripts are loaded as "file.js?v=7", the shell was cached without the "?v=7"
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match('index.html')))
  );
});

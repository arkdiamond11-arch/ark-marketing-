/* Marketing app service worker — network-first, cache as offline fallback for the app shell.
   The database library (from the CDN) is kept too, so the app opens without internet.
   The app's own copies of lists and pages (offline.js, cache 'ark-data-…') are left alone. */
const CACHE = 'app-shell-v19';
const LIBS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js'];
const SHELL = ['index.html', 'styles.css', 'config.js', 'manifest.json', 'icon-192.png', 'icon.svg', 'badge-96.png',
  'app.js', 'i18n.js', 'jewel.js', 'orders.js', 'util.js', 'docs.js', 'payments.js', 'vendors.js',
  'notes.js', 'crop.js', 'reports.js', 'catalogue.js', 'karigars.js', 'visits.js', 'targets.js', 'summary.js', 'flow.js', 'leads.js',
  'delivery.js', 'wishes.js', 'campaigns.js', 'repairs.js', 'approvals.js', 'offline.js', 'alerts.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).then(() => c.addAll(LIBS).catch(() => {}))).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf('app-shell-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && LIBS.indexOf(url.href) > -1) {   // the library never changes at this address: the kept copy first
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((res) => {
      const copy = res.clone();
      if (res.ok || res.type === 'opaque') caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    })));
    return;
  }
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
      // offline: the scripts are loaded as "file.js?v=9", the shell was cached without the "?v=9"
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match('index.html')))
  );
});

/* phone alerts (send-alerts function): show it; a tap opens the app on that order */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'New alert', {
    body: d.body || '', icon: 'icon-192.png',
    badge: 'badge-96.png',   // one colour, for the phone's top bar
    tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || 'index.html' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'index.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const app = (u) => { const p = u.split(/[?#]/)[0]; return p === self.registration.scope || p === self.registration.scope + 'index.html'; };
    const open = list.find((c) => app(c.url));   // the app itself (not the shops' status page)
    if (open) { open.postMessage({ type: 'open', url }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});

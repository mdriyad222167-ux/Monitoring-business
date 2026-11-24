/* Service worker: cache the app shell so the app opens offline.
   IMPORTANT: bump CACHE_VERSION whenever you change any file, so phones pick up the update. */
const CACHE_VERSION = 'mizan-v2';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/utils.js', './js/db.js', './js/inventory.js', './js/customers.js', './js/sales.js', './js/expenses.js',
  './js/analytics.js', './js/backup.js', './js/charts.js', './js/ui.js',
  './js/views_dash.js', './js/views_stock.js', './js/views_sales.js', './js/views_misc.js', './js/app.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))
  );
});

const V = 'v3', SHELL = 'shell-' + V, RUN = 'run-' + V;
const FILES = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, RUN].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return; // la API va directo a red
  if (req.mode === 'navigate') {  // red primero, caché como respaldo
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {  // stale-while-revalidate
    const net = fetch(req).then(r => { if (r.ok) caches.open(RUN).then(c => c.put(req, r.clone())); return r; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener('sync', e => {
  if (e.tag === 'sync-actividades')
    e.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'SYNC' }))));
});

self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : { title: 'Recordatorio', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icon-192.png', tag: d.tag, data: { url: './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow(e.notification.data?.url || './')));
});

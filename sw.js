// Service worker: приложение открывается без сети, постеры кэшируются.
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const IMAGES = 'posters-v1';
const SHELL_FILES = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/api.js', 'js/store.js', 'js/config.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== IMAGES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // постеры: из кэша, если есть
  if (url.pathname.includes('/images/posters/') || req.destination === 'image' && url.origin !== location.origin) {
    e.respondWith(caches.open(IMAGES).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // свои файлы: сначала сеть (чтобы обновления приходили сразу), без сети — кэш
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) caches.open(SHELL).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
  }
});

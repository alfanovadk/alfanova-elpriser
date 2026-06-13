// Service worker til Elpriser-PWA
const CACHE = 'elpriser-v6';
const SHELL = [
  'index.html',
  'pricing.js',
  'gamify.js',
  'eloverblik.js',
  'forbrug-analyse.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Priser hentes altid live fra nettet (ingen caching)
  if (url.hostname.includes('elprisenligenu')) return;

  // App-skal: network-first med cache som fallback (virker offline)
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(m => m || caches.match('index.html')))
  );
});

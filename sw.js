// オフラインでも開けるようにする仕組み（Service Worker）
// ネットにつながるときは最新のファイルを取りに行き、つながらないときは保存しておいたものを使う。
// ファイルを増やしたときは CACHE の番号を上げる。

const CACHE = 'michinote2-v2';
const FILES = [
  './',
  './index.html',
  './style.css',
  './ui.js',
  './store.js',
  './app.js',
  './manifest.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('michinote2-') && k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit =>
          hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
  );
});

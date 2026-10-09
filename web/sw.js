'use strict';
const CACHE = "finances-60a91af4999c7791";
const ASSETS = ["index.html","styles.css","connection.js","api.js","calculators.js","app.js","domain.js","queue.js","finance.js","analytics.js","dashboard.js","charts.js","pwa.js","config.json","manifest.webmanifest","icon.svg","icon-maskable.svg","icon-192.png","icon-512.png","icon-maskable-192.png","icon-maskable-512.png","install.html","install.js"];
const urls = () => ASSETS.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls()))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('finances-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('message', event => { if(event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;
  const root = new URL('./', self.registration.scope);
  const path = url.href.split(/[?#]/)[0];
  const target = event.request.mode === 'navigate' && (path === root.href || path === new URL('index.html',root).href) ? new URL('index.html',root).href : path;
  if(!urls().includes(target)) return;
  // Solo recursos públicos de la app. Datos financieros y Google nunca entran en CacheStorage.
  event.respondWith(caches.open(CACHE).then(cache => cache.match(target)).then(cached => cached || fetch(event.request)));
});

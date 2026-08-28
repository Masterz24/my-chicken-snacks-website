const CACHE_NAME = 'chicken-gray-customer-v23';
const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './signup.html',
  './forgot-password.html',
  './dashboard.html',
  './address.html',
  './checkout.html',
  './style.css',
  './css/auth.css',
  './css/location.css',
  './css/checkout.css',
  './js/mobile-app.js?v=20260828-keyboard-nav-menu-2',
  './js/app.js?v=20260827-back-menu-keyboard-4',
  './js/auth.js?v=20260828-auth-mobile-fix-1',
  './js/firebase-config.js',
  './js/cart-store.js',
  './js/address-store.js',
  './js/address-page.js',
  './js/location.js',
  './js/checkout.js',
  './js/dashboard-addresses.js',
  './js/order-store.js',
  './js/order-status.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);
  const isDocument = request.mode === 'navigate' || url.pathname.endsWith('.html');
  const isAppAsset = /\/(?:js|css)\//.test(url.pathname);

  event.respondWith(
    (isDocument || isAppAsset)
      ? fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        }).catch(() => caches.match(request).then(cached => cached || (isDocument ? caches.match('./index.html') : Promise.reject(new Error('asset unavailable')))))
      : caches.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
          });
        })
  );
});

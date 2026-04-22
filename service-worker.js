const CACHE_NAME = 'bloomie-shell-v1';
const APP_SHELL = [
  '/',
  '/bloomie-helpdesk-v1.html',
  '/manifest.webmanifest',
  '/app-assets/bloomie-icon.svg',
  '/app-assets/bloomie-icon-maskable.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isApiRequest = requestUrl.pathname.startsWith('/api/');
  const hasAuthHeader = event.request.headers.has('authorization');
  const isStaticAsset = APP_SHELL.includes(requestUrl.pathname)
    || /\.(?:css|js|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|otf|json|webmanifest)$/i.test(requestUrl.pathname);
  if (!isSameOrigin || isApiRequest || hasAuthHeader) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/bloomie-helpdesk-v1.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok && response.type === 'basic' && isStaticAsset) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match('/bloomie-helpdesk-v1.html'));
    })
  );
});

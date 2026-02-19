const SW_VERSION = '1';
const CACHE_PREFIX = 'quote-app';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v${SW_VERSION}`;
const OFFLINE_FALLBACK_URL = '/offline.html';
const ACTIVE_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css?v=40',
  '/app.js',
  '/pwa.js',
  '/manifest.webmanifest',
  '/offline.html',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon-180.png',
  '/login-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && !ACTIVE_CACHES.includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAssetRequest(url) {
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) return true;
  return /\.(css|js|png|jpg|jpeg|svg|ico|webmanifest|html)$/i.test(url.pathname);
}

async function networkOnlyApi(request) {
  try {
    return await fetch(request);
  } catch (_) {
    return new Response(
      JSON.stringify({ detail: 'Offline: API unavailable.', offline: true }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

async function networkFirstNavigation(request) {
  const shellCache = await caches.open(SHELL_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      shellCache.put(request, networkResponse.clone()).catch(() => {});
    }
    return networkResponse;
  } catch (_) {
    const cachedNavigation = await shellCache.match(request, { ignoreSearch: true });
    if (cachedNavigation) return cachedNavigation;

    const cachedIndex = await shellCache.match('/index.html');
    if (cachedIndex) return cachedIndex;

    const offlineFallback = await shellCache.match(OFFLINE_FALLBACK_URL);
    if (offlineFallback) return offlineFallback;

    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await runtimeCache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        runtimeCache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnlyApi(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAssetRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

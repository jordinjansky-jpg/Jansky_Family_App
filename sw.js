// Service Worker — cache-first for static assets, network-first for Firebase
const CACHE_NAME = 'daily-rundown-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/calendar.html',
  '/scoreboard.html',
  '/tracker.html',
  '/admin.html',
  '/kid.html',
  '/setup.html',
  '/manifest.json',
  '/styles/common.css',
  '/shared/components.js',
  '/shared/firebase.js',
  '/shared/scheduler.js',
  '/shared/scoring.js',
  '/shared/state.js',
  '/shared/theme.js',
  '/shared/utils.js'
];

// Install — pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache-first for static assets, network-only for Firebase/external
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for Firebase API calls and external CDN scripts
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebasestorage.app')
  ) {
    return; // Let the browser handle normally (network-only)
  }

  // Cache-first for same-origin static assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Return cached, but also update cache in background (stale-while-revalidate)
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          }).catch(() => cached);

          return cached;
        }
        // Not cached — fetch and cache
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});

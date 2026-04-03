// Service Worker — network-first for app shell, network-only for Firebase API
const CACHE_NAME = 'family-hub-v17';

const APP_SHELL = [
  '/',
  '/index.html',
  '/calendar.html',
  '/scoreboard.html',
  '/tracker.html',
  '/kid.html',
  '/admin.html',
  '/setup.html',
  '/manifest.json',
  '/App Icon.png',
  // CSS (modular)
  '/styles/base.css',
  '/styles/layout.css',
  '/styles/components.css',
  '/styles/dashboard.css',
  '/styles/calendar.css',
  '/styles/scoreboard.css',
  '/styles/tracker.css',
  '/styles/admin.css',
  '/styles/kid.css',
  '/styles/responsive.css',
  // JS modules
  '/shared/firebase.js',
  '/shared/scheduler.js',
  '/shared/scoring.js',
  '/shared/state.js',
  '/shared/components.js',
  '/shared/theme.js',
  '/shared/utils.js',
  '/shared/swipe.js',
  // Firebase SDK (CDN — cached cross-origin with CORS)
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];

self.addEventListener('install', (event) => {
  // Pre-cache app shell for offline use, but don't block on failures
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for Firebase API calls
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Dynamic kid-mode manifest — returns a kid-specific manifest so
  // "Add to Home Screen" launches kid.html?kid=Name instead of index.html
  if (url.pathname === '/kid-manifest.json') {
    const kid = url.searchParams.get('kid') || 'Kid';
    const manifest = {
      name: kid + "'s Tasks",
      short_name: kid,
      description: "Daily tasks for " + kid,
      start_url: "/kid.html?kid=" + encodeURIComponent(kid),
      display: "standalone",
      background_color: "#1a1a2e",
      theme_color: "#6c63ff",
      icons: [{ src: "/App Icon.png", sizes: "512x512", type: "image/png", purpose: "any" }]
    };
    event.respondWith(new Response(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/manifest+json' }
    }));
    return;
  }

  // Network-first: try network, fall back to cache for offline support
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});

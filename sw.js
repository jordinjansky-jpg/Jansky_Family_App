// Service Worker — network-first for app shell, network-only for Firebase API
//
// MAINTENANCE: When you add, rename, or remove any file in APP_SHELL below,
// you MUST bump CACHE_NAME (e.g. v28 → v29) so existing clients fetch the new
// shell. There is no build step generating this list.
//
// CACHE_BUMPS
// -----------
// Record every CACHE_NAME bump here so future readers can correlate cache
// versions to phases/PRs.
//
// v45 (2026-04-21) — Phase 0 foundation: token layer rewrite, hex purge in
//                    components.css, inline-style sweep in stable modules,
//                    reduced-motion guards on all animating CSS, retired-
//                    token sweep in HTML files.
// v44 (2026-04-xx) — prior rename to 'family-hub' branding.
// v42 (2026-04-17) — Kid mode CSS fix for status-bar layering.
// (older bumps not recorded retroactively)
const CACHE_NAME = 'family-hub-v45';

const APP_SHELL = [
  '/',
  '/index.html',
  '/person.html',
  '/dashboard.js',
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
  '/shared/dom-helpers.js',
  '/shared/theme.js',
  '/shared/utils.js',
  '/shared/calendar-views.js',
  // Firebase SDK (CDN — cached cross-origin with CORS)
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'
];

self.addEventListener('install', (event) => {
  // Pre-cache app shell for offline use
  // Cache each asset individually so one failure doesn't block all caching
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Failed to cache:', url, err.message))
        )
      ))
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

  // Dynamic person manifest — "Install" launches person.html?person=Name
  if (url.pathname === '/person-manifest.json') {
    const person = url.searchParams.get('person') || 'User';
    const manifest = {
      id: "/person/" + encodeURIComponent(person),
      name: person + "'s Family Hub",
      short_name: person,
      description: "Daily tasks for " + person,
      start_url: "/person.html?person=" + encodeURIComponent(person),
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

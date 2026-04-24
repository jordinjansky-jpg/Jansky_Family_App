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
// v56 (2026-04-24) — Fix: v55 edited the wrong rule. Task cards
//                    render with class="card task-card ...", so the
//                    later-in-file .card rule (line 1541) wins over
//                    .task-card (line 733) for shared properties.
//                    Applied the density/radius/min-height alignment
//                    to .card itself: padding 8/16 → 16 all around,
//                    min-height 56 → 68, margin-bottom xs → sm.
// v55 (2026-04-24) — Align .task-card with mockup spec: radius-md→lg,
//                    gap sm→md, owner stripe 4px→3px, min-height 64→68,
//                    avatar 28→36px, title font-weight 600→500, body
//                    gap 2→3px. Phase 1.5 density pass had diverged
//                    from mockup (mockups/01-dashboard.html) and cards
//                    felt squat and heavy.
// v54 (2026-04-24) — Fix: calendar still had the header-height double-count
//                    via .cal-page .page-content override; person mode
//                    overflow menu was missing Rewards + Admin (guarded
//                    on !linkedPerson with no good reason — the person
//                    shortcut is for adults); task-card padding bumped
//                    from 10px/16px to 16px all around with min-height
//                    48→64 so cards feel less compressed next to their
//                    avatar/check tokens.
// v53 (2026-04-24) — Fix: .page-content double-counted header-height in
//                    padding-top. .app-header is position:sticky and
//                    already reserves its own height in flow, so the
//                    extra header-height in .page-content produced a
//                    large blank gap below the header on every page
//                    that uses .page-content (calendar, scoreboard,
//                    tracker, admin, kid, person).
// v52 (2026-04-24) — Fix: person.html was missing <div id="fabMount">,
//                    causing dashboard.js to throw on
//                    document.getElementById('fabMount').innerHTML and
//                    halt module init — stuck loading spinner on PWA
//                    person shortcut. That was the Phase 1+1.5 mobile
//                    bug (bell/overflow buttons looked dead because the
//                    module never finished wiring them).
// v51 (2026-04-24) — Diagnostic: on-page error overlay in index.html +
//                    /test.html sanity check page. Temp — removed once
//                    the Phase 1+1.5 mobile load bug is understood.
// v50 (2026-04-24) — Theme fix #2: applyTheme now strips stale inline
//                    var overrides on switch, so a previous dark preset's
//                    --text/--bg/etc. can't linger on root when switching
//                    to a light preset that doesn't redeclare them.
// v49 (2026-04-24) — Theme fix: data-theme now follows preset.mode, not
//                    themeConfig.mode, so a light preset can never inherit
//                    dark base.css token overrides (and vice versa).
// v48 (2026-04-24) — Phase 1.5 dashboard polish: completed-card mute
//                    (no strikethrough), check hover+press, section
//                    head grid + divider + muted meta, larger header
//                    title + narrow-phone subtitle, FAB depth + nav
//                    active rail, Back-to-Today chevron + entrance,
//                    filter chip dot/verb + section cue, bell pulse.
// v47 (2026-04-23) — Phase 1 polish hotfix: light theme contrast
//                    (data-theme guard), Back-to-Today centering,
//                    card density + stripe geometry + shadow leak.
// v46 (2026-04-23) — Phase 1 dashboard rework: mockup-aligned header,
//                    card slot DOM, priority banner queue, FAB + 5-tab
//                    nav with More sheet, person filter chip, owner
//                    left-stripe, empty state.
// v45 (2026-04-21) — Phase 0 foundation: token layer rewrite, hex purge in
//                    components.css, inline-style sweep in stable modules,
//                    reduced-motion guards on all animating CSS, retired-
//                    token sweep in HTML files.
// v44 (2026-04-xx) — prior rename to 'family-hub' branding.
// v42 (2026-04-17) — Kid mode CSS fix for status-bar layering.
// (older bumps not recorded retroactively)
const CACHE_NAME = 'family-hub-v56';

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

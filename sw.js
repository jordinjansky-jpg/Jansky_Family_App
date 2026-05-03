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
// v130 (2026-05-01) — "+ New recipe" opens inline recipe form on dashboard (no navigation), same form as kitchen.
// v129 (2026-05-01) — Dashboard meal picker rewritten to match kitchen: date picker, slot select, kp-* layout.
// v102 (2026-05-01) — Event form redesign: ef2-* CSS, renderEventForm v2, import flows, repeat sub-sheet.
// v94 (2026-04-29) — Kitchen shell: add kitchen.html + styles/kitchen.css to
//                    precache. No kitchen.js in APP_SHELL (entry + CSS only).
// v93 (2026-04-28) — Calendar, scoreboard, tracker now read linkedPerson.theme
//                    on load and write theme changes to person.theme in Firebase
//                    (same fix as v92 for rewards). initNavMore gains personOpts
//                    so the More → Theme path also syncs correctly.
// v92 (2026-04-28) — Rewards theme now reads/writes person.theme in Firebase
//                    (same store as dashboard) so theme syncs across all pages.
// v91 (2026-04-28) — Center text in view-as select dropdown.
// v90 (2026-04-28) — View-as dropdown replaces person chip + sheet; filter badge
//                    no longer counts sort (cost is default, not a filter).
// v89 (2026-04-28) — Increase .list-row gap sm→md, default shop sort = cost (cheap first).
// v88 (2026-04-28) — Fix sb-balances layout (display:block so rows stack), add
//                    gap to .list-row so avatar doesn't cramp the name.
// v87 (2026-04-28) — Card gap fix (reset legacy margin-top), emoji picker CSS moved
//                    to components.css so FAB reward form matches admin.
// v86 (2026-04-28) — Rewards layout (remove double padding, tab spacing), dashboard
//                    overflow replaces Rewards→Calendar, event form matches admin,
//                    backdrop close on reward create, filter/tab gap tightened.
// v85 (2026-04-27) — Rewards page bug fixes: person switcher, filter sheets, pricing
//                    helper in FAB form, filter-chips CSS, admin label tweak.
// v84 (2026-04-27) — Phase 6 Rewards Unification: add rewards.html, rewards.js,
//                    styles/rewards.css to precache.
// v83 (2026-04-27) — tracker: Back to Today pill + slide animation on period nav
// v82 (2026-04-27) — tracker: compact person pills (font-xs, tighter padding + gap)
// v81 (2026-04-27) — admin library: unified Filter & Sort chip across all 6 sections
//                    (Tasks, Events, Meals, Categories, Rewards, Badges);
//                    tasks gains search; events gains time range + owner filter;
//                    meals gains favorites filter + prep time sort; rewards gains
//                    type + status filter with absorbed archived section;
//                    badges gains earned/not-earned filter + least-unlocked sort.
// v80 (2026-04-27) — tracker: remove filter chip and category/status filter
// v79 (2026-04-27) — fix tracker: person pills scroll on mobile, swipe works on empty periods
// v78 (2026-04-27) — tracker redesign: 2-row top chrome, status sections (weekly),
//                    completion ratios (monthly), tap-to-complete, swipe-only nav
// v75 (2026-04-26) — cpick popover flips above button when too close to screen bottom
// v74 (2026-04-26) — fix cpick popover positioning: sheet active state now uses
//                    transform:none so position:fixed pops use viewport coords
// v73 (2026-04-26) — move cpick CSS from admin.css → components.css so color
//                    button is visible in More/overflow theme sheet on all pages
// v72 (2026-04-26) — cpick button+popover replaces native color picker everywhere
//                    (admin person/event/category/accent, calendar event form,
//                    device theme sheet); 40-color palette; event save color fix.
// v71 (2026-04-26) — Color swatch palette replaces native color picker, spacing
//                    fix (mt-xs), admin message form matches bell pattern.
// v70 (2026-04-26) — Polish pass 2: banner full-width, admin tabs fill space,
//                    FAB rename, More sort alpha, remove back-online toast,
//                    PIN placeholder fix, stat card wrap + dot, native color
//                    pickers, More nav on all pages, bell message upgrade
//                    (custom default + reward send), weather AM/PM + pop%.
// v68 (2026-04-26) — Admin settings redesign: section-divider layout CSS,
//                    balance ID fix (person.id→personId), data-person-id fix.
// v67 (2026-04-25) — Admin polish: task selection highlight, task filters
//                    2-column grid (compact), search+sort for Events/Meals/
//                    Categories/Rewards/Badges, all checkboxes → form-toggle,
//                    balance uses calculateBalance() (full store balance),
//                    person detail nav padding fix.
// v66 (2026-04-25) — Admin redesign: 11 tabs → 4 (Library · People ·
//                    Settings · Tools), shared list-row pattern, Person
//                    detail page with isAdmin toggle, PIN bypass for
//                    admin-flagged users, Theme controls merged into
//                    Settings, Debug/Templates/Archive removed, auto-prune
//                    on load.
// v63 (2026-04-25) — Sort fix: a task moved to today (via overdue review or
//                    Move) was getting bumped to top-of-owner via the
//                    "late-today" branch, but using the move flow IS the
//                    resolution — it shouldn't re-flag the task as late.
//                    sortEntries no longer treats movedFromDate as late;
//                    moved tasks now sort normally by time-of-day. Genuinely
//                    overdue tasks still surface via the overdue banner +
//                    review sheet (the dedicated late/missed surface).
// v62 (2026-04-25) — Hotfix: person.html still had the old loadingState +
//                    is-hidden shell, but dashboard.js (Task 4) stopped
//                    managing them. mainContent stayed hidden -> blank
//                    screen on PWA person shortcuts. Updated person.html
//                    to match index.html's new shell (just <div id="mainContent">).
// v61 (2026-04-25) — Dashboard final-form rework: Coming up rail (3.3),
//                    ambient strip slot, store-pt + grade meta chips
//                    when filtered, banner queue gains --info offline +
//                    cross-page mount on scoreboard/tracker, removed
//                    settings.showPoints (and per-card Npt chip), bumped
//                    long-press default 500 -> 800ms on dashboard,
//                    loading skeleton replaces inline spinner. Bounty
//                    tag relabeled "+5 pt" without emoji. Spec:
//                    docs/superpowers/specs/2026-04-25-dashboard-final-design.md
// v60 (2026-04-24) — Remove v51 diagnostic overlay from index.html and
//                    delete /test.html. The mobile load bug (person.html
//                    missing #fabMount) has been understood and fixed in
//                    v52; the diagnostic scaffolding has served its
//                    purpose. No behavior change for users — just
//                    removes an orange error-overlay script that only
//                    rendered when something was already broken.
// v59 (2026-04-24) — Fix: Phase 1.5 .section--filtered ::before accent
//                    bar was positioned inside the section's old 16px
//                    margin gutter; v57 removed that margin so the
//                    cue now overlapped the cards (the "random blue
//                    line behind pills"). Retired the cue — filter
//                    chip + owner-color stripe already carry signal.
// v58 (2026-04-24) — Fix: notification bell + person filter chip were
//                    both hidden in person link mode (!linkedPerson
//                    guards). Person shortcut is for adults and
//                    should have the same controls as Home. Also
//                    fixed the remaining !linkedPerson guards
//                    elsewhere in dashboard.js header.
// v57 (2026-04-24) — Fix: .section had a 16px horizontal margin on
//                    top of the 16px .page-content padding, so cards
//                    sat 32px in from each edge. Dropped horizontal
//                    margin on .section and .section__head inner
//                    padding. Also walked card min-height back from
//                    68 → 60 and padding to spacing-sm/spacing-md
//                    after the 68 felt too tall.
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
// v64 (2026-04-25) — 1.3 Meal Planning: meal library, plan/detail/editor sheets,
//                    calendar day view meals section, admin Meals tab, kid Tonight
//                    tile, dashboard ambient strip wiring, ambientStrip setting.
// v65 (2026-04-25) — 1.4 Weather Widget: add shared/weather.js to cache.
// v69 (2026-04-26) — Admin polish: category/rewards/badges Add button merged into
//                    filter toolbar row; category/events/meals/rewards/badges all
//                    open as task-form-backdrop modals; balance anchor inline;
//                    bonus/deduction side-by-side; send-message replaced with
//                    openMsgModal (select templates); schedule stats icon-tile
//                    pattern; settings theme preset → select dropdown.
// v68 (2026-04-26) — Admin settings redesign: section-divider layout CSS,
//                    balance ID fix (person.id→personId), data-person-id fix.
// v95 (2026-04-29) — Kitchen UX polish: tabs--pill CSS, sheet__header/footer/content CSS,
//                    field/field__label CSS, recipe-pick-list CSS, kitchen.css padding fix,
//                    initNavMore wires headerOverflow, click-outside sheets, slot edit sheet,
//                    recipe picker replaces datalist.
// v101 (2026-04-29) — AI features polish: add shared/ai-helpers.js to cache.
// v103 (2026-05-01) — Event form: photo source action sheet (Camera / Gallery / Files).
// v104 (2026-05-01) — Event form polish: repeat header, Every/units inline, color dots on chips,
//                     time button focus fix, scroll fade indicator, all-day pill outlined, checkmarks vs radios.
// v105 (2026-05-01) — Event form: tighter person chips, custom time picker (hour/min/AMPM selects), icon focus tint.
// v106 (2026-05-01) — Event form: Family chip up next to For label, single-line time picker, tighter add chips, balanced padding.
// v107 (2026-05-01) — Event form: remove duplicate horizontal padding on sections, shrink time selects to fit phone width.
// v108 (2026-05-01) — Kitchen: preserve recipe qty on add to list, show qty on shopping cards, dedup ingredients, auto-create list, categorize from recipe.
// v109 (2026-05-01) — Kitchen: AI mergeQty handler for smart unit-aware ingredient combination.
// v110 (2026-05-01) — Kitchen: cleanIngredientName heuristic + dedupIngredients AI handler — clean names on every entry, smart name+qty merge.
// v111 (2026-05-01) — Kitchen: list cleanup wand button (cleanList Worker handler) — drop per-add AI for heuristic-only.
// v112 (2026-05-01) — Event form photo: explicit context note input in source sheet (was relying on title field, undiscoverable).
// v113 (2026-05-01) — Kitchen: drop per-add categorize (wand only), editable qty in shopping list edit, editable ingredient name+qty in recipe form.
// v114 (2026-05-01) — Kitchen: shopping list qty inline before name (matches recipe form layout).
// v115 (2026-05-01) — Kitchen: revert list display, fix edit sheet to inline qty+name row instead.
// v116 (2026-05-01) — Kitchen: TikTok URL import (rehydration JSON + oEmbed + meta tags), partial-failure preserves URL.
// v117 (2026-05-01) — Kitchen: port all 7 forms to Event Form pattern (sticky footer, per-prefix CSS, focus tint, delete zones).
// v135 (2026-05-03) — Kitchen: meal dates show month, FAB week context, recipe CSS classes, list undo/clear.
// v136 (2026-05-03) — Kitchen: staples chip style, icons right-aligned, recipe count + find ideas layout.
// v137 (2026-05-03) — Kitchen: find ideas uses chip style to match staples button.
const CACHE_NAME = 'family-hub-v137';

const APP_SHELL = [
  '/',
  '/index.html',
  '/person.html',
  '/dashboard.js',
  '/rewards.js',
  '/calendar.html',
  '/scoreboard.html',
  '/tracker.html',
  '/kid.html',
  '/admin.html',
  '/setup.html',
  '/rewards.html',
  '/kitchen.html',
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
  '/styles/rewards.css',
  '/styles/kitchen.css',
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
  '/shared/weather.js',
  '/shared/calendar-views.js',
  '/shared/ai-helpers.js',
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

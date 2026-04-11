# UX Polish & Technical Improvements

**Date:** 2026-04-03
**Scope:** 6 features — 3 UX (micro-animations, empty states, swipe gestures) + 3 technical (offline-first, modular CSS, real-time listeners)

---

## 1. Micro-animations on completion

### Goal
Make task completion feel satisfying and alive rather than a static toggle.

### Behavior

**Per-task completion animation:**
- When a card receives `task-card--done`, an intermediate class `task-card--completing` triggers:
  - Checkmark: scale 0 -> 1.2 -> 1.0 bounce over 300ms (`@keyframes check-pop`)
  - Card background: brief green tint (`--success-bg`) fading to the done state over 300ms
  - Card body: subtle compress to 98% scale for 100ms then spring back to 100% (`@keyframes card-press`)
- The `task-card--completing` class is added by JS on tap, then after 400ms the full re-render fires (moving the done card to the bottom of the list). This delay lets the animation play in the card's current position before it relocates.

**Progress bar fill:**
- Add `transition: width 400ms ease-out` to the progress bar's fill element so it animates smoothly when the width percentage changes.

**100% celebration (confetti):**
- Replace the static celebration overlay. Keep the "All Done!" text but add CSS-only confetti:
  - 12-15 `<span>` elements with randomized colors, sizes, positions
  - `@keyframes confetti-fall`: start clustered at center-top, fall outward with rotation and opacity fade
  - Total duration: 2.5s. Auto-dismiss the overlay at 3s with a fade-out.
- No canvas, no libraries. Pure CSS animations on inline `<span>` elements.

**Streak counter:**
- When the streak number updates on the scoreboard, apply a `@keyframes flip-up` animation (translate Y from 10px to 0 + opacity 0 to 1, 300ms).

### Files changed
- `styles/components.css` — new `@keyframes` for check-pop, card-press, confetti-fall, flip-up
- `styles/dashboard.css` — celebration overlay confetti styles
- `index.html` — 400ms delay before re-render on completion toggle
- `kid.html` — same 400ms delay
- `shared/components.js` — `renderCelebration()` updated with confetti spans
- `scoreboard.html` — streak flip class on render

### Constraints
- All animations are CSS-only. JS only adds/removes classes.
- Animations must not block visibility of the completed task — effects are background-level, text stays readable.
- `prefers-reduced-motion: reduce` media query disables all animations.

---

## 2. Context-aware empty states

### Goal
Replace generic empty states with contextual, personality-rich messages that tell you *why* the list is empty.

### Variants

| Variant | Icon | Title | Subtitle |
|---------|------|-------|----------|
| `all-done` | Trophy | "Nothing left — you crushed it!" | Shows daily grade if available |
| `free-day` | Beach/relaxed | "Free day!" | "Nothing scheduled — enjoy it." |
| `future-empty` | Calendar | "Nothing planned yet" | "" |
| `no-match` | Filter | "No tasks for [Name]" | "Try a different filter." |
| `kid-done` | Party | "You're all done!" | "Go play!" |
| `kid-free` | Sunshine | "No chores today!" | "Lucky you!" |

### Implementation
- Extend `renderEmptyState(icon, title, subtitle)` to accept an optional `variant` string. When a variant is passed, it overrides icon/title/subtitle with the table above. The function signature becomes `renderEmptyState(icon, title, subtitle, options)` where `options.variant` and `options.personName` are optional.
- The `.empty-state` class gets a CSS entrance animation: icon gently scales from 0.8 to 1.0 with a slight bob over 600ms.
- Pages determine which variant to pass based on their logic (all done vs. no schedule vs. filtered).

### Files changed
- `shared/components.js` — extend `renderEmptyState`
- `index.html`, `calendar.html`, `kid.html` — pass appropriate variant
- `styles/components.css` — entrance animation on `.empty-state`

---

## 3. Swipe-to-complete on task cards

### Goal
Add swipe gestures on task cards for quick completion (right) and detail access (left), making the app feel more native.

### Behavior

**Swipe right — complete task:**
- As the user drags a task card to the right, a green strip with a checkmark is revealed behind the card.
- Card translates horizontally following the finger at 0.8x drag distance (slight resistance).
- Release past 30% of card width: complete the task (triggers completion animation from Section 1, then re-render after 400ms).
- Release before 30%: card snaps back to origin (200ms ease-out).
- On already-completed cards: swipe right shows a red "Undo" strip and uncompletes the task.

**Swipe left — open details:**
- Reveals an orange "Details" strip with an info icon.
- Release past 30%: opens the task detail bottom sheet.
- Release before 30%: snap back.
- Long-press (500ms) still works as a fallback for opening details.

**Conflict resolution with day navigation:**
- Touch start on a `.task-card` element = card swipe mode.
- Touch start on empty space, headers, progress bar, etc. = day navigation swipe mode.
- Detection: `e.target.closest('.task-card')` at `touchstart`.
- Vertical scroll guard: if vertical movement exceeds horizontal movement by more than 15px before the swipe engages, cancel the swipe entirely.
- Minimum 15px horizontal movement before engaging swipe (dead zone to prevent accidental triggers).

**Visual implementation:**
- Each task card gets wrapped in a `.task-card-swipe-container` with `overflow: hidden`.
- The green/orange/red strips are positioned absolutely behind the card.
- Card movement uses `transform: translateX()` for GPU-accelerated animation.
- The strip content (icon + label) fades in as the card is dragged past 15% width.

**Kid mode:** Same behavior, no changes needed (touch targets are already larger in kid mode).

### Files changed
- `index.html`, `calendar.html`, `kid.html` — touch event handlers for card swiping
- `shared/components.js` — `renderTaskCard` wraps output in swipe container with hidden strips
- `styles/components.css` — swipe container, strip styles, translateX transitions

### Edge cases
- Scrolling: vertical movement cancels horizontal swipe.
- Rapid swipes: debounce completion writes (same 400ms window as animation).
- Event tasks: swipe-to-complete works the same (events can be completed).
- Overdue cards: swipe-to-complete works, uses the existing overdue completion logic.

---

## 4. Offline-first with sync

### Goal
Make the app fully functional without an internet connection — loads instantly, completions queue offline, syncs when reconnected.

### Architecture

**Firebase RTDB offline persistence:**
- Add `firebase.database().setPersistenceEnabled(true)` in `initFirebase()` before any reads.
- This is the compat SDK's built-in disk cache. It automatically:
  - Caches all read data to IndexedDB
  - Queues all writes when offline
  - Syncs queued writes when connection returns
  - Resolves conflicts via last-write-wins (appropriate for completion toggles)
- No custom offline queue needed.

**Service worker — app shell caching:**
- Rewrite `sw.js` from the current network-only stub to a cache-first service worker.
- **Versioned cache name:** `family-hub-v1` (bump version on deploy to invalidate).
- **Install event:** Pre-cache the app shell:
  - HTML: `index.html`, `calendar.html`, `scoreboard.html`, `tracker.html`, `kid.html`, `admin.html`, `setup.html`
  - CSS: `styles/common.css` (or all modular CSS files after split)
  - JS: `shared/firebase.js`, `shared/scheduler.js`, `shared/scoring.js`, `shared/state.js`, `shared/components.js`, `shared/theme.js`, `shared/utils.js`
  - Assets: `manifest.json`, `App Icon.png`
  - CDN: Firebase SDK compat scripts (2 files, pinned to 10.12.2) — these serve with CORS headers, allowing cross-origin caching
- **Fetch strategy:**
  - App shell files (same-origin, non-API): cache-first, fall back to network. On network success, update the cache.
  - Firebase API calls (`firebaseio.com`, `googleapis.com`): network-only (Firebase SDK manages its own caching via persistence).
  - Everything else: network-first with cache fallback.
- **Activate event:** Delete old versioned caches.

**Offline indicator:**
- Enhance the existing connection dot behavior.
- On disconnect: show a subtle banner at the top "Working offline — changes will sync" for 3 seconds, then auto-dismiss. The connection dot stays orange.
- On reconnect: brief "Back online" banner for 2 seconds, dot turns green.
- New `renderOfflineBanner(message)` function in components.js.

### Files changed
- `sw.js` — full rewrite: cache-first app shell strategy
- `shared/firebase.js` — add `setPersistenceEnabled(true)` in `initFirebase()`
- `shared/components.js` — add `renderOfflineBanner()`
- All pages — show offline/online banner on connection change events

### Constraints
- Firebase CDN scripts are cached at their pinned version URL. SDK upgrades require SW cache version bump.
- `setPersistenceEnabled(true)` must be called before any database operations — it goes right after `firebase.initializeApp()`.
- The SW cache list must be updated when files are added/renamed (manual, no build step).

---

## 5. Modular CSS

### Goal
Split the 2,856-line `common.css` into logical files for maintainability. No build step — just multiple `<link>` tags.

### File structure

```
styles/
├── base.css          — Reset, CSS variables, typography, body, utilities (~200 lines)
├── layout.css        — Header, nav bar, page-content, spacing, safe-area (~150 lines)
├── components.css    — Task cards, grade badges, progress bars, avatars, buttons,
│                       forms, toasts, bottom sheets, connection dot (~800 lines)
├── dashboard.css     — Overdue banner, time headers, celebration, day nav (~200 lines)
├── calendar.css      — Calendar grid, day cells, event dots, month nav, sheet (~300 lines)
├── scoreboard.css    — Leaderboard cards, sparklines, category breakdown (~200 lines)
├── tracker.css       — Status rows, filters, weekly/monthly grids (~200 lines)
├── admin.css         — Form styles, tabs, PIN screen, debug panel (~400 lines)
├── kid.css           — Kid header, error states, celebrations, simplified UI (~200 lines)
└── responsive.css    — All @media breakpoints consolidated (~200 lines)
```

### Page loading map

| Page | CSS files loaded |
|------|-----------------|
| `index.html` | base, layout, components, dashboard, responsive |
| `calendar.html` | base, layout, components, calendar, responsive |
| `scoreboard.html` | base, layout, components, scoreboard, responsive |
| `tracker.html` | base, layout, components, tracker, responsive |
| `admin.html` | base, layout, components, admin, responsive |
| `kid.html` | base, components, kid, responsive |
| `setup.html` | base, layout, components, admin, responsive |

### Migration approach
- Purely mechanical extraction: cut sections from `common.css` into the target files.
- No style changes, no refactoring, no renaming.
- CSS variables remain in `base.css` so all files inherit them.
- Delete `common.css` after migration is verified.
- Update the SW cache list (Section 4) to include all new CSS files.

### Constraints
- No build step. HTTP/2 multiplexing handles the extra requests.
- Order of `<link>` tags matters: base first, then layout, then components, then page-specific, then responsive last (so media queries can override).

---

## 6. Real-time listeners

### Goal
Family members see each other's task completions and schedule changes in real-time without refreshing.

### What gets live listeners

| Path | Why | Pages |
|------|-----|-------|
| `completions/` | Someone completes a task, everyone sees it | index, calendar, kid |
| `schedule/{dateKey}` | Parent adds/edits task, kids see new entries | index, calendar, kid |
| `settings` | Theme changes propagate live | all |

### What stays one-shot
- `people/`, `tasks/`, `categories/` — admin-only changes, infrequent. Full page nav after admin edits is acceptable.
- `snapshots/`, `streaks/` — historical data, read on page load.
- `schedule/` for date ranges (scoreboard, tracker) — bulk historical reads, live updates not critical.

### Implementation

**New convenience wrappers in `firebase.js`:**
```js
export function onCompletions(cb) {
  return onValue('completions', cb);
}

export function onScheduleDay(dateKey, cb) {
  return onValue(`schedule/${dateKey}`, cb);
}

export function onSettings(cb) {
  return onValue('settings', cb);
}
```

**Page integration pattern:**
```js
// Replace:
const completions = await readCompletions();

// With:
let completions = {};
const unsubCompletions = onCompletions((val) => {
  completions = val || {};
  debouncedRender();
});
```

**Debounced rendering:**
- Add a `debounce(fn, ms)` utility to `utils.js`.
- Wrap the `render()` call in each page with `const debouncedRender = debounce(render, 100)`.
- Prevents rapid-fire re-renders during bulk operations (e.g., schedule rebuild writes 50+ entries).

**Date change handling:**
- When the user swipes to a different day, unsubscribe from the old date's schedule listener and subscribe to the new one.
- Completions listener stays global (not date-scoped), so no change needed on day swipe.

**Interaction with offline persistence (Section 4):**
- `onValue` automatically fires with cached data first when Firebase persistence is enabled.
- On reconnect, it fires again with the server state.
- This gives instant page loads (cached data) + live sync — no extra code needed.

### Files changed
- `shared/firebase.js` — add `onCompletions`, `onScheduleDay`, `onSettings` wrappers
- `shared/utils.js` — add `debounce(fn, ms)` utility
- `index.html` — replace one-shot reads with listeners, debounced render
- `calendar.html` — same
- `kid.html` — same
- `scoreboard.html` — keep one-shot (historical data)
- `tracker.html` — keep one-shot (historical data)

### Constraints
- Listeners are cleaned up automatically on page navigation (full page loads).
- Schedule listener must be re-bound when `viewDate` changes.
- Debounce window of 100ms balances responsiveness vs. render thrashing.

---

## Dependencies between sections

```
Section 5 (Modular CSS) should be done FIRST — it's a mechanical refactor that
all other sections touch CSS on top of. Doing it last would mean editing a file
that's about to be split.

Section 4 (Offline) should be done BEFORE Section 6 (Real-time listeners) —
persistence + listeners pair naturally and Section 6's design assumes persistence
is already enabled.

Section 1 (Animations) and Section 3 (Swipe) share the 400ms render delay
concept — implement Section 1 first, then Section 3 builds on the same timing.

Section 2 (Empty states) is independent and can be done at any point.
```

**Recommended order:**
1. Modular CSS (Section 5)
2. Micro-animations (Section 1)
3. Empty states (Section 2)
4. Swipe-to-complete (Section 3)
5. Offline-first (Section 4)
6. Real-time listeners (Section 6)

# Codebase Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all verified bugs, consolidate duplicated patterns, standardize CSS, fix service worker reliability, and add detailed backlog entries for future features.

**Architecture:** Small, targeted changes across many files. Bug fixes are isolated. Architecture changes extract duplicated code into shared helpers. CSS changes standardize hardcoded values to use existing CSS variables. Backlog entries go into CLAUDE.md.

**Tech Stack:** Vanilla JS (ES modules), CSS variables, Firebase RTDB compat SDK, Service Worker

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `styles/base.css:63-67` | Add missing `--radius-xl` and `--bg-hover` variables |
| Modify | `shared/firebase.js:17` | Remove dead `connectionListeners` |
| Modify | `kid.html:14-19` | Sanitize title from URL param |
| Modify | `kid.html:586` | Sanitize title from Firebase data |
| Modify | `person.html:14-19` | Sanitize title from URL param |
| Modify | `dashboard.js:77` | Sanitize title from Firebase data |
| Modify | `shared/components.js` | Add `initOfflineBanner()` helper |
| Modify | `dashboard.js:93-119` | Replace inline offline banner with helper |
| Modify | `calendar.html:103-119` | Replace inline offline banner with helper |
| Modify | `scoreboard.html:112-130` | Replace inline offline banner with helper |
| Modify | `tracker.html:122-138` | Replace inline offline banner with helper |
| Modify | `admin.html:194-211` | Replace inline offline banner with helper |
| Modify | `kid.html:588-607` | Replace inline offline banner with helper |
| Create | `styles/kid.css` | Move inline styles from kid.html |
| Modify | `kid.html:26-503` | Remove inline `<style>` block |
| Modify | `styles/components.css:102,130,148` | Standardize transitions to CSS variable |
| Modify | `styles/calendar.css` | Replace hardcoded `#2e7d32` with `var(--success-text)` |
| Modify | `sw.js:44-45` | Fix silent `cache.addAll` failure |
| Modify | `CLAUDE.md:147+` | Add backlog entries for 9 future features |

---

## Task 1: Fix missing CSS variables (`--radius-xl`, `--bg-hover`)

**Files:**
- Modify: `styles/base.css:63-67`

- [ ] **Step 1: Add `--radius-xl` and `--bg-hover` to base.css**

In `styles/base.css`, after `--radius-lg: 16px;` (line 66), add the missing variables:

```css
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;
```

And in the Colors section (after `--border-subtle` on line 18), add:

```css
  --border-subtle: #f3f0eb;
  --bg-hover: rgba(0,0,0,0.04);
  --overlay-bg: rgba(0,0,0,0.4);
```

- [ ] **Step 2: Remove fallback from calendar.css**

In `styles/calendar.css:273`, replace:
```css
  border-radius: var(--radius-xl, 20px) var(--radius-xl, 20px) 0 0;
```
with:
```css
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
```

- [ ] **Step 3: Remove fallback from admin.css**

In `styles/admin.css:193` and `:197`, replace:
```css
  background: var(--bg-hover, var(--border-light));
```
with:
```css
  background: var(--bg-hover);
```

- [ ] **Step 4: Add `--bg-hover` to all theme presets in theme.js**

In `shared/theme.js`, add `'--bg-hover'` to each preset's `vars` object. Use `rgba(0,0,0,0.04)` for light themes and `rgba(255,255,255,0.06)` for dark themes. Add it after `'--overlay-bg'` in each preset.

- [ ] **Step 5: Commit**

```bash
git add styles/base.css styles/calendar.css styles/admin.css shared/theme.js
git commit -m "fix: add missing --radius-xl and --bg-hover CSS variables"
```

---

## Task 2: Remove dead `connectionListeners` array

**Files:**
- Modify: `shared/firebase.js:17`

- [ ] **Step 1: Remove the dead variable**

In `shared/firebase.js`, delete line 17:
```js
let connectionListeners = [];
```

- [ ] **Step 2: Verify no references exist**

Search for `connectionListeners` in the codebase. It should only appear in this one location. If found elsewhere, investigate before deleting.

- [ ] **Step 3: Commit**

```bash
git add shared/firebase.js
git commit -m "fix: remove dead connectionListeners array from firebase.js"
```

---

## Task 3: Sanitize `document.title` from URL params

**Files:**
- Modify: `kid.html:14-19`
- Modify: `kid.html:586`
- Modify: `person.html:14-19`
- Modify: `dashboard.js:77`

- [ ] **Step 1: Sanitize kid.html early title (line 14-19)**

Replace the inline script:
```html
  <script>
    // Set page title to kid's name for "Add to Home Screen" label on iOS
    (function() {
      var kid = new URLSearchParams(window.location.search).get('kid');
      if (kid) document.title = kid + "'s Tasks";
    })();
  </script>
```
with:
```html
  <script>
    // Set page title to kid's name for "Add to Home Screen" label on iOS
    (function() {
      var kid = new URLSearchParams(window.location.search).get('kid');
      if (kid) {
        var safe = kid.replace(/[<>"'&]/g, '');
        document.title = safe + "'s Tasks";
      }
    })();
  </script>
```

- [ ] **Step 2: Sanitize kid.html Firebase title (line 586)**

Replace:
```js
        document.title = `${kid.name}'s Daily Rundown`;
```
with:
```js
        document.title = `${esc(kid.name)}'s Daily Rundown`;
```

- [ ] **Step 3: Sanitize person.html early title (line 14-19)**

Replace:
```js
      document.title = person + "'s " + appName;
```
with:
```js
      var safe = person.replace(/[<>"'&]/g, '');
      document.title = safe + "'s " + appName;
```

- [ ] **Step 4: Sanitize dashboard.js linked person title (line 77)**

Replace:
```js
if (linkedPerson) document.title = `${linkedPerson.name}'s ${settings?.appName || 'Daily Rundown'}`;
```
with:
```js
if (linkedPerson) document.title = `${esc(linkedPerson.name)}'s ${settings?.appName || 'Daily Rundown'}`;
```

- [ ] **Step 5: Commit**

```bash
git add kid.html person.html dashboard.js
git commit -m "fix: sanitize document.title from URL params and Firebase data"
```

---

## Task 4: Extract offline banner to shared helper

**Files:**
- Modify: `shared/components.js` (add export)
- Modify: `dashboard.js:93-119`
- Modify: `calendar.html:103-119`
- Modify: `scoreboard.html:112-130`
- Modify: `tracker.html:122-138`
- Modify: `admin.html:194-211`
- Modify: `kid.html:588-607`

- [ ] **Step 1: Add `initOfflineBanner` to components.js**

At the end of `shared/components.js`, before the closing of the module, add:

```js
/**
 * Initialize the offline/online banner and connection dot.
 * Creates a mount element, subscribes to connection changes, and auto-hides banners.
 * 
 * @param {Function} onConnectionChange - Firebase connection listener function
 * @param {object} options - { showConnectionDot: boolean } — dot updates the header
 * @returns {Function} unsubscribe function
 */
export function initOfflineBanner(onConnectionChange, options = {}) {
  const { showConnectionDot = true } = options;
  const mount = document.createElement('div');
  mount.id = 'offlineBannerMount';
  document.body.appendChild(mount);

  let timer = null;
  let wasOffline = false;

  return onConnectionChange((connected) => {
    // Update connection dot in header
    if (showConnectionDot) {
      const existing = document.querySelector('.connection-dot');
      const dotHtml = renderConnectionStatus(connected);
      if (existing) existing.outerHTML = dotHtml;
      else document.querySelector('.header__right')?.insertAdjacentHTML('afterbegin', dotHtml);
    }

    // Show offline/online banner
    if (timer) clearTimeout(timer);
    if (!connected) {
      wasOffline = true;
      mount.innerHTML = renderOfflineBanner('Working offline — changes will sync');
      timer = setTimeout(() => { mount.innerHTML = ''; }, 3000);
    } else if (wasOffline) {
      mount.innerHTML = renderOfflineBanner('Back online');
      mount.querySelector('.offline-banner')?.classList.add('offline-banner--online');
      timer = setTimeout(() => { mount.innerHTML = ''; }, 2000);
    }
  });
}
```

Add `initOfflineBanner` to the existing exports.

- [ ] **Step 2: Replace in dashboard.js**

Replace lines 93-119 (the `bannerMount` creation through the `onConnectionChange` block) with:

```js
initOfflineBanner(onConnectionChange);
```

Update the import line at the top of `dashboard.js` to include `initOfflineBanner` and remove `renderConnectionStatus` and `renderOfflineBanner` (they're now used internally by the helper).

Note: dashboard.js uses `renderConnectionStatus` and `renderOfflineBanner` only in this block, so they can be removed from the import. Double-check no other usage exists first.

- [ ] **Step 3: Replace in calendar.html**

Replace the offline banner block (~lines 103-119) with:

```js
    initOfflineBanner(onConnectionChange);
```

Update the import line to add `initOfflineBanner`. Remove `renderConnectionStatus` and `renderOfflineBanner` from the import if they aren't used elsewhere in the file.

- [ ] **Step 4: Replace in scoreboard.html**

Replace the offline banner block (~lines 112-130) with:

```js
    initOfflineBanner(onConnectionChange);
```

Update imports similarly.

- [ ] **Step 5: Replace in tracker.html**

Replace the offline banner block (~lines 122-138) with:

```js
    initOfflineBanner(onConnectionChange);
```

Update imports similarly.

- [ ] **Step 6: Replace in admin.html**

Replace the offline banner block (~lines 194-211) with:

```js
    initOfflineBanner(onConnectionChange);
```

Update imports similarly.

- [ ] **Step 7: Replace in kid.html**

Replace the offline banner block (~lines 588-607) with:

```js
        initOfflineBanner(onConnectionChange, { showConnectionDot: false });
```

Kid mode has no header, so pass `showConnectionDot: false`. Update imports to add `initOfflineBanner` and remove `renderOfflineBanner`.

- [ ] **Step 8: Commit**

```bash
git add shared/components.js dashboard.js calendar.html scoreboard.html tracker.html admin.html kid.html
git commit -m "refactor: extract offline banner to shared initOfflineBanner helper"
```

---

## Task 5: Move kid.html inline CSS to kid.css

**Files:**
- Create (overwrite): `styles/kid.css`
- Modify: `kid.html:26-503`

- [ ] **Step 1: Copy inline styles to kid.css**

Replace the entire contents of `styles/kid.css` with the contents of the `<style>` block from `kid.html` (lines 27-502). Add a file header:

```css
/* v2 */
/* kid.css — Kid mode specific styles */

body {
  padding-bottom: 0;
}
/* Kid mode has no nav bar, lower the undo toast */
.undo-toast {
  bottom: var(--spacing-md);
}

/* (continue with all styles from kid.html lines 35-502...) */
```

Copy every rule from lines 27-502 of the `<style>` block. Do not modify any selectors or values — this is a pure extraction.

- [ ] **Step 2: Remove inline `<style>` block from kid.html**

Delete lines 26-503 (the entire `<style>...</style>` block) from `kid.html`.

- [ ] **Step 3: Verify kid.css is already linked**

`kid.html` already has `<link rel="stylesheet" href="styles/kid.css">` on line 24 (which will shift after the style block removal). Confirm it's still present.

- [ ] **Step 4: Update SW cache version**

In `sw.js`, bump the cache name from `'family-hub-v26'` to `'family-hub-v27'` since kid.css now has real content that needs caching.

- [ ] **Step 5: Commit**

```bash
git add styles/kid.css kid.html sw.js
git commit -m "refactor: extract kid.html inline styles to kid.css"
```

---

## Task 6: Standardize hardcoded CSS transitions

**Files:**
- Modify: `styles/components.css:102,130,148`

- [ ] **Step 1: Replace hardcoded transitions in components.css**

Line 102 — replace:
```css
  transition: all 0.15s ease;
```
with:
```css
  transition: all var(--transition-fast);
```

Line 130 — replace:
```css
  transition: all 0.15s;
```
with:
```css
  transition: all var(--transition-fast);
```

Line 148 — replace:
```css
  transition: all 0.15s;
```
with:
```css
  transition: all var(--transition-fast);
```

Note: Do NOT change line 857 (`transition: transform 0.15s cubic-bezier(...)`) — that uses a custom easing curve, not the standard fast transition.

- [ ] **Step 2: Replace hardcoded colors in calendar.css**

Search `styles/calendar.css` for `#2e7d32` and replace all instances with `var(--success-text)`. These should be in the checkmark SVG background and completion indicators.

- [ ] **Step 3: Commit**

```bash
git add styles/components.css styles/calendar.css
git commit -m "fix: standardize hardcoded transitions and colors to CSS variables"
```

---

## Task 7: Fix service worker silent `cache.addAll` failure

**Files:**
- Modify: `sw.js:41-48`

- [ ] **Step 1: Replace `cache.addAll` with individual caching**

Replace the install event handler (lines 41-48):

```js
self.addEventListener('install', (event) => {
  // Pre-cache app shell for offline use, but don't block on failures
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});
```

with:

```js
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
```

This way, if one asset fails (e.g., a CDN URL), the rest still cache successfully, and failures are logged to the console for debugging.

- [ ] **Step 2: Commit**

```bash
git add sw.js
git commit -m "fix: service worker caches assets individually to prevent silent failures"
```

---

## Task 8: Add feature backlog entries to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:147+`

- [ ] **Step 1: Expand the Backlog section**

Replace the current Backlog section in `CLAUDE.md` (line 147 onwards) with the expanded version below. Keep the existing push notifications entry and add the new ones:

```markdown
## Backlog
- **Push notifications** — Daily reminders, task delegation alerts. Requires FCM + server-side trigger (Cloud Function or Cloudflare Worker). High effort (~2-3 sessions). See notifications uplift assessment from 2026-04-03.
- **Rewards & milestones** — Achievement badges for streaks (10-day, 30-day, 100-day), grade milestones (first A+ week), and cumulative point thresholds. Parent-defined rewards linked to grade or point targets ("A+ this week → pick Friday's dinner"). Optional rewards store where kids spend earned points. Data: `rundown/rewards/{pushId}` for definitions, `rundown/achievements/{personId}/{achievementKey}` for unlocked badges. UI: new tab or scoreboard sub-section. Medium effort (~2 sessions).
- **Task timer / stopwatch** — Visible countdown in kid mode and dashboard using the existing `estMin` field. Start button on task card or detail sheet launches a timer overlay. Optional: auto-complete when timer finishes. Sounds/vibration at completion. Consider: timer should persist across page navigation (use sessionStorage or a small state module). Purely client-side — no schema changes. Medium effort (~1-2 sessions).
- **Week view on calendar** — Dense 7-day view showing tasks by time-of-day slot (AM/PM/Anytime rows). Swipe to navigate weeks (reuse existing swipe infra). Toggle between month and week view via a button in the calendar header. Uses the same schedule data — just a different rendering layout. Medium effort (~1-2 sessions).
- **Bulk admin actions** — Multi-select mode in admin tasks tab. Select multiple tasks via checkboxes, then batch-change rotation, owner, category, status, or delete. Batch edit opens a form with only the fields being changed (others show "—no change—"). After batch write, auto-rebuild schedule. UI: "Select" toggle button in tasks tab header, floating action bar when items selected. Medium effort (~1 session).
- **Category-level daily limits** — Per-category cap on scheduled minutes per person per day (e.g., "max 30 min of chores per kid"). Schema: add `dailyLimitMin` field to category definition. Scheduler checks accumulated category load per person when placing tasks; if limit would be exceeded, defer to next eligible day. Only affects weekly/monthly/once placement (daily tasks are always placed). Low-medium effort (~1 session).
- **Flexible recurrence** — Support "every N days", "every other week", "1st and 15th of month", "every other Tuesday" beyond the current daily/weekly/monthly/once. Schema: add `recurrenceRule` object to task (e.g., `{ type: 'interval', every: 14 }` or `{ type: 'dates', days: [1, 15] }`). Scheduler interprets the rule during placement. High complexity — the scheduler is already ~850 lines. Consider: extend `placeDailyTask` with interval support, add new `placeCustomTask` for date-based rules. High effort (~2 sessions).
- **Task delegation / swaps** — Family members propose trades ("I'll do your dishes if you do my laundry"). Schema: `rundown/trades/{pushId}` with `{ proposerId, proposerTaskKey, targetId, targetTaskKey, status: 'pending'|'accepted'|'declined', createdAt }`. Accepting a trade swaps `ownerId` on the two schedule entries. UI: notification badge on dashboard, trade proposal from detail sheet, accept/decline in a trades list. Medium-high effort (~2 sessions).
- **Vacation / skip mode** — Mark a person as "away" for a date range. Schema: `rundown/people/{id}/away: [{ start, end }]`. Scheduler skips placing tasks for away people in their date range. Optionally redistribute their tasks to other owners (rotate-mode only) or mark as exempt for scoring. UI: per-person "Away" toggle in admin with date picker. Admin could also set a family-wide "vacation mode" that pauses all non-daily tasks. Medium effort (~1-2 sessions).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add detailed backlog entries for 9 future features"
```

---

## Summary

| Task | Type | Files changed |
|------|------|---------------|
| 1. Missing CSS variables | Bug fix | base.css, calendar.css, admin.css, theme.js |
| 2. Dead `connectionListeners` | Cleanup | firebase.js |
| 3. Sanitize `document.title` | Bug fix | kid.html, person.html, dashboard.js |
| 4. Extract offline banner | Architecture | components.js, 6 page files |
| 5. Kid.html CSS extraction | Architecture | kid.css, kid.html, sw.js |
| 6. CSS standardization | CSS | components.css, calendar.css |
| 7. SW cache reliability | Bug fix | sw.js |
| 8. Feature backlog | Docs | CLAUDE.md |

# Dashboard Final-Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-04-25-dashboard-final-design.md](../specs/2026-04-25-dashboard-final-design.md)

**Goal:** Bring `index.html` + `dashboard.js` into the final-form layout and behavior defined by the 2026-04-25 design spec — Coming up rail, Ambient strip slot, store-pt + grade meta chips, banner-queue cross-page persistence, removed `settings.showPoints`, and bumped long-press default — without breaking any current behavior.

**Architecture:** Pure-render shared components ([shared/components.js](../../../shared/components.js)) + dashboard-controller pattern in [dashboard.js](../../../dashboard.js) (existing). New layout-only classes `.coming-up`, `.coming-up__row`, `.coming-up__blocks`, `.cal-day-block` (ported from the shelved Phase 2 calendar plan), `.ambient-row`, `.ambient-chip`. New banner sub-uses (`--info` for offline + running-activity placeholder). No Firebase schema changes. No new listeners.

**Tech Stack:** Vanilla JS ES modules (no bundler), hand-written CSS with tokens from Phase 0/1.5, Firebase RTDB compat (unchanged).

**Branch:** `dashboard-final-form` cut from `main` post-spec commit `008c8ed`.

**Verification model:** No test runner in this repo (per [CLAUDE.md](../../../CLAUDE.md): "no build step, no test suite"). Each task uses the Phase 1.5 / Phase 2 verification pattern: (a) focused grep recipe for CSS/DOM invariants, (b) runtime measurement via `getComputedStyle` / `getBoundingClientRect` (when sizing matters), (c) manual visual smoke at 375px in light + dark themes against the spec's expected outcome. Tasks end with a commit; CI gate is Cloudflare's auto-deploy on push to `main` after the PR merges.

---

## Scope (locked — do not extend without spec amendment)

**In scope (11 tasks + pre-task setup + final cache bump):**
1. Remove `settings.showPoints` and per-card scoring-pt rendering (cards + detail sheet + admin toggle).
2. Bump `settings.longPressMs` default 500 → 800ms (override preserved).
3. Move Back-to-Today pill between Banner and Ambient strip.
4. Loading skeleton (3.0) replaces inline spinner on first paint.
5. Banner queue extensions: `--info` variant live for offline; `--vacation` and `--info`-running-activity dead variants reserved; overdue body becomes tappable; `renderBanner` supports `bodyClickable`.
6. Banner mount on `scoreboard.html` + `tracker.html` (cross-page persistence per DESIGN.md §7.3 amendment).
7. Ambient strip section slot + `renderAmbientStrip` component (renders zero pixels until `settings.ambientStrip === true`; chip leading icons are SVG glyphs).
8. Coming up rail (3.3): `renderComingUp` component + dashboard integration; collapsed by default; events-only count; day-block heads jump `viewDate`; `localStorage['dr-coming-up-state']`.
9. Today section meta: `X of Y done · NN pt · GRADE` when filtered to one person; `pt` = today's percentage × multiplier (store-economy).
10. FAB pre-fills `activePerson` as default owner.
11. Bounty tag relabel: `🎯 5 pts` → `+5 pt` (per spec §7.9; emoji removed per chrome rule).

**Out of scope (deferred to owning PRs — listed so they aren't rediscovered mid-PR):**
- 1.3 Meals data wiring → adds dinner data + admin toggle for `settings.ambientStrip`.
- 1.4 Weather data wiring → adds weather fetcher + cache + admin toggle wiring.
- 1.6 Activities running-session feed → wires real data into the `--info` running-activity sub-variant.
- 2.4 Vacation `away[]` schema + scheduler integration → wires real data into the `--vacation` banner.
- Tablet two-pane layout (Phase 7 owns).
- Kiosk reflection (own PR; spec table is reference only).

---

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| [index.html](../../../index.html) | Dashboard shell markup | 4 (skeleton mount swap), 7 (slot), 8 (slot) |
| [dashboard.js](../../../dashboard.js) | Dashboard controller + render orchestration | 1, 2, 3, 5, 7, 8, 9, 10 |
| [shared/components.js](../../../shared/components.js) | Reusable renderers | 1, 5, 7, 8, 9, 11 |
| [shared/state.js](../../../shared/state.js) | Filtering / sorting helpers | 8 (add `getEventsInRange`) |
| [styles/dashboard.css](../../../styles/dashboard.css) | Dashboard-only styles | 4, 7, 8 |
| [styles/components.css](../../../styles/components.css) | Component catalog CSS | 5, 7 (ambient chip), 8 (coming-up + cal-day-block), 11 |
| [styles/responsive.css](../../../styles/responsive.css) | Breakpoint overrides | 7, 8 |
| [scoreboard.html](../../../scoreboard.html) | Scoreboard shell | 1 (drop showPoints conditional), 6 (banner mount + init) |
| [scoreboard.js](../../../scoreboard.js) | Scoreboard controller | 6 (init banner queue) |
| [tracker.html](../../../tracker.html) | Tracker shell | 1 (drop showPoints), 6 (banner mount + init) |
| [tracker.js](../../../tracker.js) | Tracker controller | 6 (init banner queue) |
| [calendar.html](../../../calendar.html) | Calendar shell | 1 (drop showPoints) |
| [kid.html](../../../kid.html) | Kid view | 1 (drop showPoints) |
| [admin.html](../../../admin.html) | Admin (settings UI) | 1 (remove the toggle) |
| [sw.js](../../../sw.js) | Service worker cache | Final cache bump |

`shared/scheduler.js`, `shared/scoring.js`, `shared/firebase.js`, `shared/theme.js`, `shared/utils.js` — **NOT modified.**

---

## Pre-task setup

Run once at the start of the phase:

- [ ] **Cut the branch off `main` and verify clean state**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b dashboard-final-form
git status
```

Expected: clean working tree on branch `dashboard-final-form`. Most recent commit on main is `008c8ed` (the spec + doc updates).

- [ ] **Verify pre-existing primitives the plan depends on**

```bash
grep -n "export function renderEmptyState\|export function renderSectionHead\|export function renderFilterChip\|export function renderBanner\|export function renderTaskCard\|export function renderFab\|applyDataColors" shared/components.js
grep -n "^const CACHE_NAME" sw.js
grep -n "from './shared/state.js'" dashboard.js
```

Expected:
- `renderEmptyState` at line ~277.
- `renderSectionHead` at line ~519, signature `(title, meta, options)`.
- `renderFilterChip` at line ~556.
- `renderBanner` at line ~488, signature `(variant, { title, message, action })`.
- `renderTaskCard` at line ~357, accepts `options` with `showPoints` (about to be removed).
- `renderFab` at line ~510.
- `applyDataColors` at line ~18.
- `CACHE_NAME = 'family-hub-v60'` (will bump to v61 in the final task).
- `dashboard.js` imports `isComplete, filterByPerson, filterEventsByPerson, getEventsForDate, sortEvents, groupByFrequency, dayProgress, getOverdueEntries, getOverdueCooldownTaskIds, isAllDone, sortEntries` from `state.js`.

If any signature differs or any export is missing, **stop and reconcile with the spec before proceeding**. The plan assumes Phase 1.5's shipped state.

---

## Task 1: Remove `settings.showPoints` and per-card scoring-pt rendering

**Goal:** Per spec §6.2 *Removed* row 1, delete the `showPoints` setting + every callsite. The `settings.showPoints` toggle in admin is removed; per-card `Npt` chip and detail-sheet `Npt` chip are removed; override-direction (▲/▼) icons survive (they aren't the scoring number, they're a *direction* cue when an override is active).

**Files:**
- Modify: [shared/components.js:357-459](../../../shared/components.js#L357-L459) — `renderTaskCard`
- Modify: [shared/components.js:844-986](../../../shared/components.js#L844-L986) — `renderTaskDetailSheet`
- Modify: [dashboard.js:333](../../../dashboard.js#L333), [dashboard.js:410](../../../dashboard.js#L410), [dashboard.js:1004](../../../dashboard.js#L1004)
- Modify: [calendar.html:802](../../../calendar.html#L802)
- Modify: [kid.html:855](../../../kid.html#L855), [kid.html:922](../../../kid.html#L922), [kid.html:962](../../../kid.html#L962), [kid.html:997](../../../kid.html#L997)
- Modify: [tracker.html:628](../../../tracker.html#L628)
- Modify: [scoreboard.html:573](../../../scoreboard.html#L573), [scoreboard.html:594](../../../scoreboard.html#L594)
- Modify: [admin.html:956](../../../admin.html#L956), [admin.html:3568](../../../admin.html#L3568)

- [ ] **Step 1: Remove the `showPoints` parameter and code branch from `renderTaskCard`**

In [shared/components.js](../../../shared/components.js), find the destructure on line 358:

```js
const { entryKey, entry, task, person, category, completed, overdue, dateLabel, points, isEvent, showPoints = true, isPastDaily = false } = options;
```

Replace with:

```js
const { entryKey, entry, task, person, category, completed, overdue, dateLabel, points, isEvent, isPastDaily = false } = options;
```

Then replace the points-label block (lines 370–385) with a simpler block that only renders the override-direction (▲/▼) cue when an override is active and never the bare `Npt`:

```js
// Override-direction cue: ▲ if override raises points, ▼ if it lowers them.
// No bare scoring-pt chip — store-economy points live in the section meta only (spec 2026-04-25 §3.7).
let ptsLabel = '';
if (points && !isEvent && !task.exempt && points.override != null && points.override !== 100) {
  const colorClass = points.override > 100 ? 'task-card__pts--up' : 'task-card__pts--down';
  const icon = points.override > 100 ? '▲' : '▼';
  ptsLabel = `<span class="${colorClass}">${icon}</span>`;
}
```

- [ ] **Step 2: Remove `showPoints` from `renderTaskDetailSheet`**

In [shared/components.js:848](../../../shared/components.js#L848), find:

```js
people, showDelegate, showMove, showEdit, dateKey, showPoints = true,
```

Remove `showPoints = true,`. The destructure becomes:

```js
people, showDelegate, showMove, showEdit, dateKey,
```

Then in the same function (line ~873), find:

```js
${points && !task.exempt && showPoints ? `<span class="chip">${points.possible}pt</span>` : ''}
```

Remove that template fragment entirely. The points slider remains visible (line 961 comment is correct — slider is independent of the removed chip).

Also delete the now-stale comment on line 961:

```js
  // Points slider — always visible regardless of showPoints (that only hides card labels)
```

Replace with:

```js
  // Points slider (override slider for late-credit / boost).
```

- [ ] **Step 3: Remove `showPoints:` keys from every callsite**

Run this grep recipe to confirm the callsite list:

```bash
grep -rn "showPoints:" --include='*.js' --include='*.html' . | grep -v 'docs/'
```

Expected before edit: 11 matches (3 in dashboard.js, 1 in calendar.html, 4 in kid.html, 1 in tracker.html, 2 in scoreboard.html — though scoreboard's are inline string templates, see below).

Edit each match to remove the `showPoints: settings?.showPoints !== false,` line entirely.

Files to edit:
- [dashboard.js:333](../../../dashboard.js#L333), [dashboard.js:410](../../../dashboard.js#L410), [dashboard.js:1004](../../../dashboard.js#L1004) — three `renderTaskCard` calls and one `renderTaskDetailSheet` call.
- [calendar.html:802](../../../calendar.html#L802) — one `renderTaskCard` call.
- [kid.html:855](../../../kid.html#L855), [kid.html:922](../../../kid.html#L922), [kid.html:962](../../../kid.html#L962), [kid.html:997](../../../kid.html#L997) — four calls.
- [tracker.html:628](../../../tracker.html#L628) — one call.

For [scoreboard.html:573](../../../scoreboard.html#L573):

```js
<span class="sb-drilldown__stats">${settings?.showPoints !== false ? `${grade.earned}/${grade.possible} pts · ` : ''}${grade.percentage}%</span>
```

Replace with:

```js
<span class="sb-drilldown__stats">${grade.earned}/${grade.possible} pts · ${grade.percentage}%</span>
```

For [scoreboard.html:594](../../../scoreboard.html#L594):

```js
${settings?.showPoints !== false ? `<span class="sb-drilldown__task-pts">${item.earned}/${item.pts}</span>` : ''}
```

Replace with:

```js
<span class="sb-drilldown__task-pts">${item.earned}/${item.pts}</span>
```

(Scoreboard drilldown is the *grading* surface — these are scoring-points-in-context, which is allowed there. The spec only banned scoring-pt display on cards/dashboard chrome.)

- [ ] **Step 4: Remove the admin toggle**

In [admin.html:956](../../../admin.html#L956), find:

```html
<label class="admin-checkbox" style="margin-top:24px"><input type="checkbox" id="sf_showPoints"${settings?.showPoints !== false ? ' checked' : ''}> Show points on tasks</label>
```

Delete that entire `<label>` line.

In [admin.html:3568](../../../admin.html#L3568), find:

```js
showPoints: main.querySelector('#sf_showPoints')?.checked !== false,
```

Delete that line. (Note: the existing inline-style `style="margin-top:24px"` on the deleted label is the only inline style on that label. Removing the label removes the inline style — no separate cleanup needed. Verify no other rule depends on `#sf_showPoints` adjacent layout.)

- [ ] **Step 5: Grep recipe — verify zero `showPoints` references remain in code paths**

```bash
grep -rn "showPoints" --include='*.js' --include='*.html' . | grep -v 'docs/'
```

Expected: 0 matches.

- [ ] **Step 6: Visual smoke**

Hard-refresh the dashboard (375px). Verify:
- Task cards render normally; no `Npt` chip in the meta row.
- A task with an override (set via the detail sheet slider, e.g., 80%) shows `▼` in the meta row.
- A task with a 120% override shows `▲`.
- Detail sheet header: no `Npt` chip; slider still works.
- Admin → Settings: the "Show points on tasks" checkbox is gone.
- Scoreboard drilldown: still shows `earned/possible pts · percentage%` (this is intentional — scoreboard is the grading surface).

- [ ] **Step 7: Commit**

```bash
git add shared/components.js dashboard.js calendar.html kid.html tracker.html scoreboard.html admin.html
git commit -m "$(cat <<'EOF'
refactor: remove settings.showPoints and per-card scoring-pt chip

Per dashboard final-form spec (2026-04-25-dashboard-final-design.md §6.2):
scoring points on cards conflate with rewards-store points and create
ambiguity. The bare Npt chip is removed from renderTaskCard and
renderTaskDetailSheet; ▲/▼ direction cues for active overrides survive
(they aren't a number, they're a direction). The settings.showPoints
toggle is removed from admin. Scoreboard drilldown keeps explicit
earned/possible pts — that's the grading surface, not chrome.

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Bump `settings.longPressMs` default 500 → 800ms

**Goal:** Per spec §3.7 + DESIGN.md §7.8, dashboard long-press timing aligns with calendar/kid (touch-scroll-heavy parity). Tracker stays at 500ms (status-table, not scroll-heavy). Existing `settings.longPressMs` overrides preserved — only the default changes.

**Files:**
- Modify: [dashboard.js:519](../../../dashboard.js#L519) — `settings?.longPressMs ?? 500` → `?? 800`

- [ ] **Step 1: Update the default**

In [dashboard.js](../../../dashboard.js), find:

```js
activePressTimer = setTimeout(() => {
  didLongPress = true;
  activePressTimer = null;
  openTaskSheet(btn.dataset.entryKey, btn.dataset.dateKey);
}, settings?.longPressMs ?? 500);
```

Replace `?? 500` with `?? 800`:

```js
}, settings?.longPressMs ?? 800);
```

- [ ] **Step 2: Grep recipe — verify the only longPressMs default in dashboard.js is 800**

```bash
grep -n "longPressMs" dashboard.js
```

Expected: one match, with `?? 800`.

Verify tracker.js still uses 500:

```bash
grep -n "longPressMs\|longPress" tracker.js | head -5
```

Expected: tracker keeps `?? 500` (or a `500` literal in its long-press setup).

- [ ] **Step 3: Visual smoke**

On dashboard at 375px: tap a task card — toggles complete (fast). Press and hold for ~700ms — does NOT open the detail sheet. Press and hold for ~900ms — opens the detail sheet. Confirms 800ms threshold.

On tracker at 375px: long-press at ~600ms opens detail sheet (confirms tracker still 500ms).

- [ ] **Step 4: Commit**

```bash
git add dashboard.js
git commit -m "$(cat <<'EOF'
fix(dashboard): bump long-press default to 800ms

Aligns dashboard long-press with calendar + kid (DESIGN.md §7.8) for
touch-scroll-heavy surface parity. Accidental long-press fires were
more disruptive on the dashboard's longer task list with the 500ms
default. Tracker stays at 500ms — it's a status-table, not scroll-heavy.

settings.longPressMs override preserved; only the fallback changed.

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Move Back-to-Today pill between Banner and Ambient strip

**Goal:** Per spec §3.5, the pill sits at a stable position regardless of ambient state. Today the pill is rendered in `dashboard.js` between the `bannerMount` and the first content section. The reorder is a single block move; the pill's own DOM and animation are unchanged.

**Files:**
- Modify: [dashboard.js:251-269](../../../dashboard.js#L251-L269) — render order block in `render()`

- [ ] **Step 1: Read the current render order**

In [dashboard.js](../../../dashboard.js), the `render()` function builds `html` in this order today (lines 251–353):
1. `bannerMount` placeholder div
2. Back-to-Today pill (when `!isToday`)
3. Events section (when present)
4. Today section
5. Debug overlay (when enabled)
6. Banner queue mount call (after `main.innerHTML = html`)

The Phase 1.5 layout is correct — the pill is *already* between Banner and the first section. Task 3's purpose in the spec is to **lock this position** even after we add the Ambient strip and Coming up rail in later tasks. The pill must remain immediately after `bannerMount` and BEFORE the ambient strip / coming-up rail / events / today.

For this task: no code change is needed YET — but add an inline comment that documents the invariant so Tasks 7 and 8 don't accidentally reorder things.

In [dashboard.js](../../../dashboard.js), find the line that currently reads `html += `<div id="bannerMount"></div>`;` (around line 254) and the back-to-today block immediately following. Add a comment block above the `bannerMount` line:

```js
// === DASHBOARD RENDER ORDER (spec 2026-04-25 §2.1) ===
// Hard order, top to bottom:
//   1. #bannerMount                     (single banner, queued)
//   2. .back-to-today                   (when viewDate !== today)
//   3. #ambientStripMount               (Task 7)
//   4. #comingUpMount                   (Task 8)
//   5. .section--events                 (when events present)
//   6. .section--today                  (always)
//   7. .debug-panel                     (when debug enabled)
// Anything inserted here must respect that order. The pill anchors
// to position 2 regardless of which sections below it are populated.
```

- [ ] **Step 2: Grep recipe — verify pill render is in the right place**

```bash
grep -n "back-to-today\|bannerMount" dashboard.js
```

Expected: `bannerMount` insertion immediately precedes the back-to-today block in the render flow. The order above is documented in the comment.

- [ ] **Step 3: Visual smoke**

At 375px, swipe forward one day (Back-to-Today pill appears). Pill sits directly under any active banner. Returning to today removes the pill.

- [ ] **Step 4: Commit**

```bash
git add dashboard.js
git commit -m "$(cat <<'EOF'
docs(dashboard): document render-order invariant for final-form

Adds an inline comment block in dashboard.js render() locking the
top-to-bottom order: banner -> back-to-today pill -> ambient ->
coming-up -> events -> today -> debug. Subsequent tasks (Ambient
strip, Coming up rail) must respect that order so the pill keeps a
stable position regardless of which sections below it are populated.

No render change in this task — comment-only invariant.

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Loading skeleton replaces inline spinner

**Goal:** Per backlog 3.0 + spec §6.1 *added items*, the first-paint loading state is a card-shaped skeleton matching the populated layout, not a centered spinner.

**Files:**
- Modify: [index.html:24-27](../../../index.html#L24-L27) — replace `loading-inline` with skeleton markup
- Modify: [styles/dashboard.css](../../../styles/dashboard.css) — add skeleton CSS (or in components.css if it'll be reused; spec §5.18 already specs `skeleton-card-row` as a generic shape — put it in components.css)
- Modify: [dashboard.js:48-53, 192-196](../../../dashboard.js#L192-L196) — adjust the show/hide logic to match the new mount

- [ ] **Step 1: Add skeleton CSS to `styles/components.css`**

Add to the bottom of [styles/components.css](../../../styles/components.css):

```css
/* === Loading skeleton (spec 2026-04-25 §5.18) === */
.skeleton {
  /* Single accent-soft shimmer; no custom keyframes per theme. */
  background: linear-gradient(90deg,
    var(--surface) 0%,
    var(--surface-2) 50%,
    var(--surface) 100%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: var(--radius-md);
}
@keyframes skeleton-shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}
.skeleton-card-row {
  display: grid;
  grid-template-columns: 36px 1fr 30px;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  margin-bottom: var(--spacing-sm);
  align-items: center;
  min-height: 64px;
}
.skeleton-card-row__avatar { width: 36px; height: 36px; border-radius: 50%; }
.skeleton-card-row__bars   { display: flex; flex-direction: column; gap: 6px; }
.skeleton-card-row__bar    { height: 12px; border-radius: var(--radius-sm); }
.skeleton-card-row__bar--title { width: 70%; }
.skeleton-card-row__bar--meta  { width: 45%; height: 10px; }
.skeleton-card-row__check  { width: 30px; height: 30px; border-radius: 50%; }

.skeleton-section-head {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  margin-bottom: var(--spacing-md);
}
.skeleton-section-head__title { width: 80px; height: 18px; border-radius: var(--radius-sm); }
.skeleton-section-head__chip  { width: 64px; height: 30px; border-radius: var(--radius-full); }
```

- [ ] **Step 2: Add `renderDashboardSkeleton` helper to `shared/components.js`**

Append to [shared/components.js](../../../shared/components.js) (above the `initOfflineBanner` block):

```js
/**
 * Dashboard loading skeleton — card-shaped placeholders matching the
 * populated layout. Used during first paint before Firebase resolves
 * (typically <500ms in cached + fresh cases). Replaces the inline
 * spinner per spec 2026-04-25 §3.7 + §5.18.
 */
export function renderDashboardSkeleton() {
  const row = `<div class="skeleton-card-row">
    <div class="skeleton skeleton-card-row__avatar"></div>
    <div class="skeleton-card-row__bars">
      <div class="skeleton skeleton-card-row__bar skeleton-card-row__bar--title"></div>
      <div class="skeleton skeleton-card-row__bar skeleton-card-row__bar--meta"></div>
    </div>
    <div class="skeleton skeleton-card-row__check"></div>
  </div>`;
  return `<section class="section">
    <div class="skeleton-section-head">
      <div class="skeleton skeleton-section-head__title"></div>
      <div class="skeleton skeleton-section-head__chip"></div>
    </div>
    ${row}${row}${row}${row}
  </section>`;
}
```

- [ ] **Step 3: Update `index.html` shell — drop inline spinner, mount skeleton**

In [index.html:23-29](../../../index.html#L23-L29), find:

```html
<main class="app-shell" id="app">
    <div class="loading-inline" id="loadingState">
      <div class="loading-spinner loading-spinner--small"></div>
      <span>Loading...</span>
    </div>
    <div id="mainContent" class="is-hidden"></div>
  </main>
```

Replace with:

```html
<main class="app-shell" id="app">
    <div id="mainContent"></div>
  </main>
```

(The skeleton renders into `#mainContent` directly, so the separate `loadingState` element is no longer needed. The `is-hidden` class is also removed — content is the only child of `#mainContent` from first paint.)

- [ ] **Step 4: Update `dashboard.js` to mount skeleton on first paint**

In [dashboard.js:1](../../../dashboard.js#L1), add `renderDashboardSkeleton` to the imports from `./shared/components.js`:

```js
import { renderNavBar, renderHeader, renderEmptyState, renderPersonFilter, renderProgressBar, renderTaskCard, renderTimeHeader, renderOverdueBanner, renderCelebration, renderUndoToast, renderGradeBadge, renderTaskDetailSheet, renderBottomSheet, renderQuickAddSheet, renderEditTaskSheet, renderEventBubble, renderEventDetailSheet, renderEventForm, renderAddMenu, openDeviceThemeSheet, initOfflineBanner, initBell, showConfirm, applyDataColors, renderBanner, renderFab, renderSectionHead, renderOverflowMenu, renderFilterChip, renderPersonFilterSheet, renderDashboardSkeleton } from './shared/components.js';
```

Right after the imports and `applyTheme(...)` call (around line 14), add an immediate skeleton mount that runs before any async work:

```js
// Paint the skeleton immediately, before any async Firebase call.
// First paint is now <50ms; skeleton resolves into real content on first render().
{
  const earlyMain = document.getElementById('mainContent');
  if (earlyMain) earlyMain.innerHTML = renderDashboardSkeleton();
}
```

Then in [dashboard.js:48-60](../../../dashboard.js#L48-L60) (the person-not-found branch), update the early-error handler that currently does:

```js
const loadingEl = document.getElementById('loadingState');
loadingEl.classList.add('is-hidden');
loadingEl.style.display = 'none';
const errMain = document.getElementById('mainContent');
errMain.classList.remove('is-hidden');
errMain.style.display = '';
errMain.innerHTML = `…error markup…`;
```

Replace the `loadingState` lookups with a no-op (the element no longer exists). The block becomes:

```js
const errMain = document.getElementById('mainContent');
errMain.innerHTML = `
  <div class="error-placeholder">
    <div class="error-placeholder__icon">🤔</div>
    <h2 class="error-placeholder__title">Who's ${esc(personParam)}?</h2>
    <p class="error-placeholder__body">We couldn't find anyone with that name.<br>Check the link or ask an admin.</p>
    <a href="index.html" class="btn btn--secondary mt-md">Go to Dashboard</a>
  </div>`;
```

Then in [dashboard.js:192-196](../../../dashboard.js#L192-L196), the block that hides loading and shows main becomes a single line:

```js
// Skeleton is replaced by render() below; no show/hide needed.
const main = document.getElementById('mainContent');
```

(Delete the `loadingStateEl` variable + its `classList.add('is-hidden')` line + the `main.classList.remove('is-hidden')` line.)

- [ ] **Step 5: Grep recipe — verify the old loading machinery is gone**

```bash
grep -n "loadingState\|loading-inline\|is-hidden" index.html dashboard.js
```

Expected: zero matches in `index.html`. In `dashboard.js`, only matches that survive should be in the celebration / sheet code, not for `loadingState`.

- [ ] **Step 6: Visual smoke**

Hard-refresh `index.html` with the network tab in "slow 3G" emulation. The skeleton paints immediately (no spinner flash). Once Firebase resolves, the skeleton is replaced with the real Today section + cards smoothly. With `prefers-reduced-motion`, the skeleton renders static (no shimmer).

- [ ] **Step 7: Commit**

```bash
git add styles/components.css shared/components.js index.html dashboard.js
git commit -m "$(cat <<'EOF'
feat(dashboard): card-shaped loading skeleton replaces inline spinner

Backlog 3.0 — closed in this commit per spec §3.7. Skeleton paints
synchronously before any async Firebase call, so first paint is
~50ms instead of the spinner-flash + content-pop sequence. Skeleton
shape matches the populated layout (section head + 4 card rows +
filter chip placeholder), so the transition to real content is
visually quiet. Respects prefers-reduced-motion (static, no shimmer).

Drops the loadingState element and is-hidden gating from index.html;
mainContent is the single mount.

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Banner queue extensions — `--info` + body tappable

**Goal:** Per spec §3.2 + §5.9, the existing `renderBanner` gains:
1. A `bodyClickable` option that wraps the body in a button (used for `--overdue`'s body-tappable behavior).
2. The `--info` variant goes live for the offline case (existing offline banner gets the standard banner shape).
3. `--vacation` and `--info`-running-activity remain dead variants (their resolver branches are added to `resolveBanner` but data sources are gated on backlog 1.6 / 2.4).

The resolver in `dashboard.js` is extended to walk the full priority order.

**Files:**
- Modify: [shared/components.js:488-503](../../../shared/components.js#L488-L503) — `renderBanner`
- Modify: [styles/components.css](../../../styles/components.css) — new `.banner__body--clickable` rule
- Modify: [dashboard.js:357-377](../../../dashboard.js#L357-L377) — `resolveBanner`
- Modify: [dashboard.js:379-392](../../../dashboard.js#L379-L392) — `mountBannerQueue`

- [ ] **Step 1: Extend `renderBanner` to support `bodyClickable`**

In [shared/components.js:488](../../../shared/components.js#L488), replace the existing function with:

```js
/**
 * Render a single banner (priority-queued; only one renders per page).
 * `bodyClickable: true` wraps the body in a button; the page binds clicks
 * via `[data-banner-body]` selector. Used by --overdue per spec §3.2.
 */
export function renderBanner(variant, { title, message, action, bodyClickable = false } = {}) {
  const iconMap = { overdue: '!', multiplier: '*', vacation: 'V', freeze: '-', info: 'i' };
  const icon = iconMap[variant] ?? 'i';
  const actionHtml = action
    ? `<button class="banner__action" data-banner-action="1" type="button">${esc(action.label)}</button>`
    : '';
  const msgHtml = message ? `<div class="banner__message">${esc(message)}</div>` : '';
  const bodyTag = bodyClickable ? 'button' : 'div';
  const bodyAttrs = bodyClickable
    ? ' class="banner__body banner__body--clickable" data-banner-body="1" type="button"'
    : ' class="banner__body"';
  return `<div class="banner banner--${esc(variant)}" role="status">
    <div class="banner__icon" aria-hidden="true">${icon}</div>
    <${bodyTag}${bodyAttrs}>
      <div class="banner__title">${esc(title)}</div>
      ${msgHtml}
    </${bodyTag}>
    ${actionHtml}
  </div>`;
}
```

- [ ] **Step 2: Add `.banner__body--clickable` CSS**

In [styles/components.css](../../../styles/components.css), find the existing `.banner__body` rule. Append immediately after it:

```css
.banner__body--clickable {
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  width: 100%;
  padding: 0;
  font: inherit;
  color: inherit;
}
.banner__body--clickable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Extend `resolveBanner` in `dashboard.js`**

In [dashboard.js:355-377](../../../dashboard.js#L355-L377), replace `resolveBanner` with the full priority walker:

```js
// Banner queue — priority: vacation > freeze > overdue > multiplier > info-activity > info-offline.
// Phase 1 + 1.5 wired overdue + multiplier; this rev adds vacation, freeze,
// running-activity (dead until 1.6/2.4 ship), and pre-existing offline as
// a banner sub-use. (Spec 2026-04-25 §3.2.)
function resolveBanner(overdueIncomplete, isOffline) {
  // 1. Vacation (dead until 2.4 wires people[].away[]; resolver branch present so
  // the data hookup is one-line in that PR).
  if (typeof window !== 'undefined' && window.__activeVacation) {
    const v = window.__activeVacation; // { personName, endDate, isLinkedPerson? }
    return {
      variant: 'vacation',
      title: `${v.personName} is away until ${v.endDate}`,
      message: undefined,
      action: v.isLinkedPerson ? { label: 'End early', onClick: () => window.__endVacationEarly?.() } : undefined
    };
  }
  // 2. Freeze (future feature; placeholder data hook).
  if (typeof window !== 'undefined' && window.__scheduleFrozen) {
    return { variant: 'freeze', title: 'Schedule frozen', message: undefined };
  }
  // 3. Overdue.
  if (overdueIncomplete.length > 0) {
    const n = overdueIncomplete.length;
    return {
      variant: 'overdue',
      title: `${n} overdue ${n === 1 ? 'task' : 'tasks'}`,
      message: 'Tap to review.',
      action: { label: 'Review', onClick: () => openOverdueSheet(overdueIncomplete) },
      bodyClickable: true,
      onBodyClick: () => openOverdueSheet(overdueIncomplete)
    };
  }
  // 4. Multiplier.
  const todayMultipliers = multipliers?.[today] || {};
  const scope = activePerson || 'all';
  const m = todayMultipliers[scope] || todayMultipliers.all;
  if (m && Number(m.multiplier) !== 1) {
    const n = Number(m.multiplier);
    const label = n === 2 ? 'Double-points day' : `${n}× points today`;
    const msg = m.note || `All tasks count ${n}× until midnight.`;
    return { variant: 'multiplier', title: label, message: msg };
  }
  // 5. Info — running activity (dead until 1.6).
  if (typeof window !== 'undefined' && window.__activeActivitySession) {
    const s = window.__activeActivitySession; // { name, elapsed: 'mm:ss' }
    return {
      variant: 'info',
      title: `${s.name} · ${s.elapsed}`,
      message: undefined,
      action: { label: 'Stop', onClick: () => window.__stopActivitySession?.() }
    };
  }
  // 6. Info — offline (live).
  if (isOffline) {
    return { variant: 'info', title: 'Offline', message: 'Changes will sync when you reconnect.' };
  }
  return null;
}
```

- [ ] **Step 4: Update `mountBannerQueue` to receive offline state and bind body-tap**

In [dashboard.js:379-392](../../../dashboard.js#L379-L392), replace `mountBannerQueue` with:

```js
let __isOffline = false;
function mountBannerQueue({ overdueItems: overdueIncomplete }) {
  const mount = document.getElementById('bannerMount');
  if (!mount) return;
  const b = resolveBanner(overdueIncomplete, __isOffline);
  if (!b) { mount.innerHTML = ''; return; }
  mount.innerHTML = renderBanner(b.variant, {
    title: b.title,
    message: b.message,
    action: b.action ? { label: b.action.label } : undefined,
    bodyClickable: !!b.bodyClickable
  });
  if (b.action) {
    mount.querySelector('[data-banner-action]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      b.action.onClick?.();
    });
  }
  if (b.bodyClickable && b.onBodyClick) {
    mount.querySelector('[data-banner-body]')?.addEventListener('click', b.onBodyClick);
  }
}
```

In [dashboard.js:187](../../../dashboard.js#L187), find the `initOfflineBanner` call. Replace with code that updates `__isOffline` and re-renders the banner queue:

```js
// Offline state feeds the banner queue (spec §3.2 --info offline sub-variant).
initOfflineBanner((connected) => {
  __isOffline = !connected;
  // If the dashboard has rendered, refresh the banner mount.
  if (document.getElementById('bannerMount')) {
    const overdueActive = overdueItems.filter(e => !isComplete(e.entryKey, completions));
    const overdueFiltered = activePerson
      ? overdueActive.filter(e => e.ownerId === activePerson)
      : overdueActive;
    mountBannerQueue({ overdueItems: overdueFiltered });
  }
});
```

(This replaces the prior `initOfflineBanner(onConnectionChange)` call. The function `onConnectionChange` was a Firebase-direct helper; we route through our own offline state now.)

- [ ] **Step 5: Grep recipe — verify the new banner machinery**

```bash
grep -n "bodyClickable\|data-banner-body\|__isOffline\|window.__active" dashboard.js shared/components.js styles/components.css
```

Expected:
- `dashboard.js`: at least one `bodyClickable: true` (in resolveBanner overdue branch), `__isOffline` set + read, `window.__activeVacation`, `window.__scheduleFrozen`, `window.__activeActivitySession` references.
- `shared/components.js`: `bodyClickable` parameter handling.
- `styles/components.css`: `.banner__body--clickable` rule.

- [ ] **Step 6: Visual smoke**

Set up an overdue task (set `viewDate` to a past day, leave a non-daily task incomplete; back to today shows the overdue banner). Tap the banner *body* (not the Review button) — opens overdue sheet. Tap the Review button — opens overdue sheet. Both work.

Disable network in devtools. Wait 5 seconds. The banner queue shows `Offline · Changes will sync when you reconnect.` (no action button). Re-enable network — banner clears (or returns to overdue/multiplier if those are active).

In devtools console, set `window.__activeVacation = { personName: 'Jordin', endDate: 'Apr 25' }; render();` — vacation banner appears (highest priority, shows over overdue). Clear with `window.__activeVacation = null; render();`.

In devtools console, set `window.__activeActivitySession = { name: 'Reading session', elapsed: '12:34' }; render();` — info banner appears with `Stop` button (lowest priority — only when nothing else active).

- [ ] **Step 7: Commit**

```bash
git add shared/components.js styles/components.css dashboard.js
git commit -m "$(cat <<'EOF'
feat(banner): add --info variants + body-tappable + full priority queue

Spec 2026-04-25 §3.2 + §5.9: renderBanner gains bodyClickable option;
.banner__body--clickable variant added in components.css. dashboard.js
resolveBanner walks the full priority order vacation > freeze > overdue
> multiplier > info-activity > info-offline. Vacation and running-
activity branches read window.__active* hooks — dead today, one-line
wiring for backlog 2.4 / 1.6 PRs. Offline goes live as an --info
sub-variant via initOfflineBanner -> __isOffline -> mountBannerQueue.

Overdue banner body becomes tappable (same effect as Review button).

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Banner mount on Scoreboard + Tracker

**Goal:** Per spec §4.6 + DESIGN.md §7.3 amendment, the banner mount lives on Scoreboard and Tracker so the running-activity `--info` banner persists while the user navigates. This task adds the mount + a thin `initBanner` helper that those pages can call (like `initBell` and `initOfflineBanner`).

**Files:**
- Modify: [shared/components.js](../../../shared/components.js) — add `initBanner({ getOverdueItems, getMultipliers, getActivePerson, getToday })` exported helper
- Modify: [scoreboard.html](../../../scoreboard.html) — add `<div id="bannerMount">` near top of page-content; add `initBanner` call in the page's bootstrap script
- Modify: [tracker.html](../../../tracker.html) — same

- [ ] **Step 1: Add `initBanner` helper to `shared/components.js`**

This helper is a thin reusable wrapper around `mountBannerQueue` that any page can call. Append to [shared/components.js](../../../shared/components.js) (above `initBell`):

```js
/**
 * Cross-page banner queue mount. Caller passes data getters; helper
 * mounts/refreshes the banner on demand. Pages: scoreboard, tracker
 * (dashboard + calendar already manage their own queues with richer
 * data; those keep their inline implementations).
 */
export function initBanner({ getIsOffline = () => false } = {}) {
  const mount = document.getElementById('bannerMount');
  if (!mount) return null;
  const refresh = () => {
    let banner = null;
    // Vacation (dead until 2.4).
    if (typeof window !== 'undefined' && window.__activeVacation) {
      const v = window.__activeVacation;
      banner = { variant: 'vacation', title: `${v.personName} is away until ${v.endDate}` };
    }
    // Freeze (placeholder).
    else if (typeof window !== 'undefined' && window.__scheduleFrozen) {
      banner = { variant: 'freeze', title: 'Schedule frozen' };
    }
    // Running activity (dead until 1.6).
    else if (typeof window !== 'undefined' && window.__activeActivitySession) {
      const s = window.__activeActivitySession;
      banner = {
        variant: 'info',
        title: `${s.name} · ${s.elapsed}`,
        action: { label: 'Stop', onClick: () => window.__stopActivitySession?.() }
      };
    }
    // Offline.
    else if (getIsOffline()) {
      banner = { variant: 'info', title: 'Offline', message: 'Changes will sync when you reconnect.' };
    }
    if (!banner) { mount.innerHTML = ''; return; }
    mount.innerHTML = renderBanner(banner.variant, {
      title: banner.title,
      message: banner.message,
      action: banner.action ? { label: banner.action.label } : undefined
    });
    if (banner.action) {
      mount.querySelector('[data-banner-action]')?.addEventListener('click', banner.action.onClick);
    }
  };
  refresh();
  return { refresh };
}
```

(Note: `initBanner` deliberately does NOT include overdue/multiplier — those are dashboard-scoped data and would be misleading on Scoreboard/Tracker. Only the cross-page banners — vacation, freeze, running-activity, offline — are surfaced here.)

- [ ] **Step 2: Add banner mount + init to `scoreboard.html`**

In [scoreboard.html](../../../scoreboard.html), find the page-content shell (similar to `<div class="page-content" id="...">`). Insert immediately above the first content section:

```html
<div id="bannerMount"></div>
```

Add to the imports in the page's `<script type="module">`:

```js
import { initBanner } from './shared/components.js';
```

After the existing init calls, add:

```js
// Cross-page banner queue (vacation / freeze / running-activity / offline).
let __pageIsOffline = !navigator.onLine;
window.addEventListener('online',  () => { __pageIsOffline = false; bannerCtl?.refresh(); });
window.addEventListener('offline', () => { __pageIsOffline = true;  bannerCtl?.refresh(); });
const bannerCtl = initBanner({ getIsOffline: () => __pageIsOffline });
// Refresh on a 5s interval to update running-activity elapsed time.
setInterval(() => bannerCtl?.refresh(), 5000);
```

`navigator.onLine` is the cross-page proxy for connection state — it's not Firebase-aware, but the cross-page banner only needs a basic offline cue. The dashboard keeps its richer Firebase-specific offline banner from Task 5; if scoreboard.html or tracker.html already runs an `initOfflineBanner(onConnectionChange)` flow, leave that intact and let `initBanner` handle vacation/freeze/activity only. (Audit during build: if both fire, drop the older inline offline banner from those pages.)

- [ ] **Step 3: Repeat for `tracker.html`**

Same as Step 2, applied to [tracker.html](../../../tracker.html).

- [ ] **Step 4: Grep recipe — verify mounts and inits**

```bash
grep -n "bannerMount\|initBanner" scoreboard.html tracker.html
```

Expected: one `<div id="bannerMount">` per file, one `initBanner({...})` call per file.

- [ ] **Step 5: Visual smoke**

In devtools, set `window.__activeActivitySession = { name: 'Reading session', elapsed: '12:34' }` on Dashboard. Navigate to Scoreboard — banner persists with the same activity info. Navigate to Tracker — same. Clear the session (`window.__activeActivitySession = null`) — banner disappears within 5 seconds on both pages (refresh interval).

- [ ] **Step 6: Commit**

```bash
git add shared/components.js scoreboard.html tracker.html
git commit -m "$(cat <<'EOF'
feat(banner): cross-page mount on scoreboard + tracker

Spec 2026-04-25 §4.6 (DESIGN.md §7.3 amendment): the running-activity
--info banner from 1.6 needs to stay visible while the user navigates,
so scoreboard.html and tracker.html now mount #bannerMount + init
the cross-page queue via the new shared initBanner helper.

initBanner deliberately omits overdue/multiplier (dashboard-scoped
data); it only surfaces vacation, freeze, running-activity, offline.
Refreshes every 5s for elapsed-time + offline-state updates.

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Ambient strip section slot + `renderAmbientStrip` component

**Goal:** Per spec §3.3, add the section slot to `dashboard.js` render() between the Back-to-Today pill and Coming up rail, gated on `settings.ambientStrip === true`. Component returns the strip markup; data sources are not yet wired (1.3 + 1.4 PRs do that). For dev testing, the developer can set `settings.ambientStrip = true` in Firebase to verify the component renders.

**Files:**
- Modify: [shared/components.js](../../../shared/components.js) — add `renderAmbientStrip({ weather, dinner })`
- Modify: [styles/components.css](../../../styles/components.css) — add `.ambient-row` and `.ambient-chip` rules
- Modify: [dashboard.js](../../../dashboard.js) — render-order slot, gated on `settings?.ambientStrip === true`

- [ ] **Step 1: Add `renderAmbientStrip` to `shared/components.js`**

Append to [shared/components.js](../../../shared/components.js) (above `initBanner`):

```js
/**
 * Ambient strip — 2-up chip row: Weather + Dinner. Both chips are
 * tappable. Empty-state nudges shown when data is absent (chip still
 * renders, with prompt copy). Caller passes data; component is pure.
 *
 * weather: { tempLabel: '72°', conditionLabel: 'Sunny', glyph: 'sun'|'cloud'|'rain'|'snow'|'fog', isPast?: bool, isFuture?: bool } | null
 * dinner:  { name: 'Spaghetti', source?: 'manual'|'school' } | null
 *
 * Returns '' when both chips have no data AND no nudges should render
 * (i.e., entire strip suppressed by caller). Otherwise renders both
 * chips with nudges as needed.
 *
 * Per spec 2026-04-25 §3.3: chip leading icons are SVG glyphs (no emoji
 * in chrome). Meal names may include emoji as user-authored text.
 */
export function renderAmbientStrip({ weather = null, dinner = null } = {}) {
  // SVG glyph map (Lucide-style, monochrome).
  const weatherGlyphs = {
    sun:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.78A6 6 0 0 0 4 13.5 5.5 5.5 0 0 0 9.5 19h8z"/></svg>',
    rain:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0-1-7.87A6 6 0 0 0 4 11"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="16" y1="19" x2="16" y2="21"/></svg>',
    snow:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>',
    fog:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="3" y1="18" x2="15" y2="18"/></svg>'
  };
  const utensilsGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>';

  // Weather chip
  let weatherValue = '—° · Set location';
  let weatherGlyph = weatherGlyphs.cloud;
  if (weather) {
    if (weather.isPast) weatherValue = 'Past day';
    else if (weather.isFuture) weatherValue = '—° · No forecast yet';
    else {
      weatherValue = `${esc(weather.tempLabel)} · ${esc(weather.conditionLabel)}`;
      weatherGlyph = weatherGlyphs[weather.glyph] || weatherGlyphs.cloud;
    }
  }

  // Dinner chip
  let dinnerValue = 'Not planned · Plan dinner';
  if (dinner) dinnerValue = esc(dinner.name);

  return `<div class="ambient-row">
    <button class="ambient-chip" data-chip="weather" type="button">
      <span class="ambient-chip__icon" aria-hidden="true">${weatherGlyph}</span>
      <span class="ambient-chip__body">
        <span class="ambient-chip__label">Weather</span>
        <span class="ambient-chip__value">${weatherValue}</span>
      </span>
    </button>
    <button class="ambient-chip" data-chip="dinner" type="button">
      <span class="ambient-chip__icon" aria-hidden="true">${utensilsGlyph}</span>
      <span class="ambient-chip__body">
        <span class="ambient-chip__label">Dinner</span>
        <span class="ambient-chip__value">${dinnerValue}</span>
      </span>
    </button>
  </div>`;
}
```

- [ ] **Step 2: Add ambient-strip CSS to `styles/components.css`**

Append to [styles/components.css](../../../styles/components.css):

```css
/* === Ambient strip (spec 2026-04-25 §3.3) === */
.ambient-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}
.ambient-chip {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: var(--spacing-sm);
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  min-height: 56px;
}
.ambient-chip:hover { background: var(--surface-2); }
.ambient-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ambient-chip__icon {
  width: 28px; height: 28px;
  background: var(--surface-2);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
}
.ambient-chip__icon svg { width: 16px; height: 16px; }
.ambient-chip__body { display: flex; flex-direction: column; min-width: 0; }
.ambient-chip__label {
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 600;
}
.ambient-chip__value {
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--text);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (prefers-reduced-motion: reduce) {
  .ambient-chip { transition: none; }
}
```

- [ ] **Step 3: Wire the slot in `dashboard.js`**

In [dashboard.js:1](../../../dashboard.js#L1), add `renderAmbientStrip` to the imports.

In [dashboard.js render()](../../../dashboard.js#L213) (around the comment block from Task 3), add the ambient strip slot between the Back-to-Today pill and the first content section. Find:

```js
lastRenderedIsToday = isToday;

let firstSectionRendered = false;
```

Insert before `let firstSectionRendered`:

```js
// === Ambient strip (spec §3.3) ===
// Gated on settings.ambientStrip; renders zero pixels until 1.3 + 1.4 wire data.
// Both chips render with nudge copy when their data source is absent.
if (settings?.ambientStrip === true) {
  // Both data sources are nullable; component handles empty-state internally.
  const weatherData = null; // Wired by 1.4.
  const dinnerData  = null; // Wired by 1.3.
  html += renderAmbientStrip({ weather: weatherData, dinner: dinnerData });
}
```

Below `bindEvents()` in dashboard.js, add a small ambient-chip click handler. Find the section that binds `.task-card` events. After it, add:

```js
// Ambient chips (Task 7 — strip is gated on settings.ambientStrip).
main.querySelectorAll('.ambient-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const which = chip.dataset.chip;
    if (which === 'weather') {
      // Open forecast sheet — wired in 1.4. Show nudge route in placeholder branch.
      // Until 1.4: route to admin Settings → Family → Location if no weather data.
      // Empty-state nudge wires the same target.
      // No-op for now; implementation lives in 1.4 PR.
    } else if (which === 'dinner') {
      // Open meal detail sheet — wired in 1.3. Empty-state nudge opens meal form.
      // No-op for now; implementation lives in 1.3 PR.
    }
  });
});
```

(The chips are clickable but inert until 1.3/1.4 ship. This is acceptable because the strip itself is gated on `settings.ambientStrip === true` which is also unset by default, so the inert chips never reach a user without dev opt-in.)

- [ ] **Step 4: Grep recipe — verify the strip is wired and gated**

```bash
grep -n "renderAmbientStrip\|ambient-row\|ambient-chip\|settings\?\.ambientStrip" dashboard.js shared/components.js styles/components.css
```

Expected: each file has the relevant references; the dashboard.js render() has exactly one `if (settings?.ambientStrip === true)` block.

- [ ] **Step 5: Visual smoke**

In Firebase, set `rundown/settings/ambientStrip = true`. Refresh the dashboard. The ambient strip appears between the (optional) Back-to-Today pill and the Events section, with empty-state nudges in both chips ("—° · Set location" and "Not planned · Plan dinner"). At 375px, the row is 2-up; the chips have proper height (≥56px tap target). Tap a chip — no-op (placeholder). Tap-target audit: chips ≥44×44.

Set `ambientStrip` back to `false` (or delete the key). Refresh. Strip renders zero pixels.

- [ ] **Step 6: Commit**

```bash
git add shared/components.js styles/components.css dashboard.js
git commit -m "$(cat <<'EOF'
feat(dashboard): ambient strip slot + renderAmbientStrip component

Spec 2026-04-25 §3.3: ships the empty 2-up Weather/Dinner chip row
gated on settings.ambientStrip === true. Component is pure; data
sources are nullable and the chips render empty-state nudges (no
SVG glyph mapping is missing — sun/cloud/rain/snow/fog covered).

Tap handlers are no-ops today; wired by 1.3 (dinner detail) and 1.4
(forecast sheet). Until those ship, the strip is dev-opt-in only.

Per spec, chip leading icons are SVG glyphs not emoji (chrome rule).
ambient-chip min-height 56px clears the 44x44 tap-target audit.

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Coming up rail (3.3) — component + integration

**Goal:** Per spec §3.4, ship the Coming up rail. Collapsed by default; events-only count; expanded view shows day-blocks (today excluded; days with zero events collapse out); tap day-block head jumps `viewDate`; tap event row opens existing `renderEventDetailSheet`. Filter-aware. State persists in `localStorage['dr-coming-up-state']`.

**Files:**
- Modify: [shared/state.js](../../../shared/state.js) — add `getEventsInRange(events, startDate, endDate)` helper
- Modify: [shared/components.js](../../../shared/components.js) — add `renderComingUp({ days, isExpanded, summary, filterPersonName })`
- Modify: [styles/components.css](../../../styles/components.css) — add `.coming-up`, `.coming-up__row`, `.coming-up__chev`, `.coming-up__blocks`, `.cal-day-block`, `.cal-day-block__head`, `.event-row`
- Modify: [dashboard.js](../../../dashboard.js) — slot in render order; wire toggle + day-block-head + event-row click handlers; persist state

- [ ] **Step 1: Add `getEventsInRange` to `shared/state.js`**

In [shared/state.js](../../../shared/state.js), add:

```js
/**
 * Get events between two ISO date strings (inclusive). Used by the
 * dashboard Coming up rail to fetch the next 7 days starting from
 * today + 1.
 */
export function getEventsInRange(events, startDate, endDate) {
  if (!events) return [];
  const result = [];
  for (const [eventId, event] of Object.entries(events)) {
    if (!event?.date) continue;
    if (event.date >= startDate && event.date <= endDate) {
      result.push([eventId, event]);
    }
  }
  return result;
}
```

- [ ] **Step 2: Add `renderComingUp` to `shared/components.js`**

Append to [shared/components.js](../../../shared/components.js) (above `initBanner`):

```js
/**
 * Coming up rail — 7-day forward look. Collapsed by default; expanded
 * shows day-blocks for the next 7 days starting today+1 (today excluded).
 * Days with zero events render zero rows. Spec 2026-04-25 §3.4.
 *
 * Args:
 *   days: Array<{ dateKey, dayLabel, events: Array<[eventId, event]> }>
 *     Sorted ascending; only days with events.
 *   isExpanded: boolean — current expand state.
 *   summary: string — pre-built summary line ("3 events this week" /
 *     "clear week" / "2 events for Noah this week" / etc.).
 *   filterPersonName: string — used by empty-state copy ("for Noah").
 */
export function renderComingUp({ days = [], isExpanded = false, summary = '', filterPersonName = '' } = {}) {
  const chevSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>`;
  const expandedAttr = isExpanded ? 'true' : 'false';
  const dataExpanded = isExpanded ? 'true' : 'false';

  let blocksHtml = '';
  if (days.length === 0) {
    const emptyCopy = filterPersonName
      ? `No events for ${esc(filterPersonName)} in the next 7 days`
      : 'No events in the next 7 days';
    blocksHtml = `<div class="coming-up__empty">${emptyCopy}</div>`;
  } else {
    blocksHtml = days.map(d => {
      const eventsHtml = d.events.map(([eventId, ev]) => {
        const time = ev.allDay ? 'All day' : (ev.startTime ? formatEventTime12h(ev.startTime) : '');
        const meta = [ev.location].filter(Boolean).map(esc).join(' · ');
        const metaHtml = meta ? `<span class="event-row__meta">${meta}</span>` : '';
        return `<button class="event-row" data-event-id="${esc(eventId)}" type="button">
          <span class="event-row__time">${esc(time)}</span>
          <span class="event-row__title">${esc(ev.name || '')}</span>
          ${metaHtml}
        </button>`;
      }).join('');
      return `<div class="cal-day-block">
        <button class="cal-day-block__head" data-date="${esc(d.dateKey)}" type="button">
          <strong>${esc(d.dayLabel.dow)}</strong> ${esc(d.dayLabel.monthDay)}
        </button>
        ${eventsHtml}
      </div>`;
    }).join('');
  }

  return `<section class="coming-up" data-expanded="${dataExpanded}">
    <button class="coming-up__row" id="comingUpToggle" aria-expanded="${expandedAttr}" aria-controls="comingUpBlocks" type="button">
      <span class="coming-up__text">
        <span class="coming-up__label">Coming up</span>
        <span class="coming-up__summary">${esc(summary)}</span>
      </span>
      <span class="coming-up__chev" aria-hidden="true">${chevSvg}</span>
    </button>
    <div class="coming-up__blocks" id="comingUpBlocks"${isExpanded ? '' : ' hidden'}>
      ${blocksHtml}
    </div>
  </section>`;
}

// Internal helper — 24h "07:00" -> "7:00 AM".
function formatEventTime12h(t24) {
  if (!t24) return '';
  const [hStr, mStr] = t24.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}
```

- [ ] **Step 3: Add Coming up CSS to `styles/components.css`**

Append to [styles/components.css](../../../styles/components.css):

```css
/* === Coming up rail (spec 2026-04-25 §3.4) === */
.coming-up {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-top: var(--spacing-md);
  overflow: hidden;
}
.coming-up__row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-md);
  background: transparent;
  border: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  min-height: 56px;
}
.coming-up__row:hover { background: var(--surface-2); }
.coming-up__row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.coming-up__text { display: flex; flex-direction: column; min-width: 0; }
.coming-up__label {
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 600;
}
.coming-up__summary {
  font-size: var(--font-sm);
  color: var(--text);
  margin-top: 2px;
}
.coming-up__chev {
  width: 24px; height: 24px;
  color: var(--text-faint);
  display: flex; align-items: center; justify-content: center;
  transition: transform var(--t-base);
}
.coming-up__chev svg { width: 18px; height: 18px; }
.coming-up[data-expanded="true"] .coming-up__chev { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) {
  .coming-up__chev { transition: none; }
}
.coming-up__blocks {
  border-top: 1px solid var(--border);
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
}
.coming-up__empty {
  font-size: var(--font-sm);
  color: var(--text-muted);
  padding: var(--spacing-sm) 0;
}

/* Day block (ported from shelved Phase 2 calendar plan) */
.cal-day-block {
  padding: var(--spacing-sm) 0;
}
.cal-day-block + .cal-day-block { border-top: 1px solid var(--border); }
.cal-day-block__head {
  display: block;
  width: 100%;
  background: transparent;
  border: none;
  padding: var(--spacing-xs) 0;
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: left;
  font: inherit;
  cursor: pointer;
  min-height: 36px;
}
.cal-day-block__head strong { color: var(--text); font-size: var(--font-md); font-weight: 600; margin-right: var(--spacing-xs); }
.cal-day-block__head:hover { color: var(--text); }
.cal-day-block__head:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }

/* Event row inside a day block (mini event card) */
.event-row {
  display: grid;
  grid-template-columns: 64px 1fr;
  column-gap: var(--spacing-sm);
  width: 100%;
  background: transparent;
  border: none;
  padding: var(--spacing-xs) 0;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  min-height: 44px;
  align-items: baseline;
}
.event-row:hover { background: var(--surface-2); border-radius: var(--radius-sm); }
.event-row__time {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.event-row__title {
  font-size: var(--font-md);
  color: var(--text);
  font-weight: 500;
}
.event-row__meta {
  grid-column: 2;
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
```

- [ ] **Step 4: Wire the slot in `dashboard.js`**

In [dashboard.js:1](../../../dashboard.js#L1), add `renderComingUp` and `getEventsInRange` to the imports.

After the ambient strip block (Task 7), add the Coming up slot. Insert after the ambient-strip `}` block:

```js
// === Coming up rail (spec §3.4) ===
const comingUpExpanded = localStorage.getItem('dr-coming-up-state') === 'expanded';
const start = addDays(today, 1);
const end = addDays(today, 7);
const inRange = getEventsInRange(events, start, end);
const filteredEvents = filterEventsByPerson(Object.fromEntries(inRange), activePerson);
// Group by date.
const byDate = {};
for (const [id, ev] of Object.entries(filteredEvents)) {
  if (!byDate[ev.date]) byDate[ev.date] = [];
  byDate[ev.date].push([id, ev]);
}
// Sort each day's events by time.
const dayKeys = Object.keys(byDate).sort();
const days = dayKeys.map(dk => {
  const dt = new Date(dk + 'T00:00:00');
  return {
    dateKey: dk,
    dayLabel: {
      dow: DAY_NAMES[dt.getDay()].slice(0, 3),
      monthDay: dt.toLocaleString('en-US', { month: 'short', day: 'numeric' })
    },
    events: byDate[dk].sort((a, b) => {
      // All-day first, then chronological.
      const [, ea] = a, [, eb] = b;
      if (ea.allDay && !eb.allDay) return -1;
      if (!ea.allDay && eb.allDay) return 1;
      return (ea.startTime || '').localeCompare(eb.startTime || '');
    })
  };
});
// Summary copy.
const totalEvents = Object.keys(filteredEvents).length;
const filterPersonName = activePerson
  ? (people.find(p => p.id === activePerson)?.name || '')
  : '';
let summary;
if (totalEvents === 0) {
  summary = filterPersonName ? `clear week for ${filterPersonName}` : 'clear week';
} else {
  const noun = totalEvents === 1 ? 'event' : 'events';
  summary = filterPersonName
    ? `${totalEvents} ${noun} for ${filterPersonName} this week`
    : `${totalEvents} ${noun} this week`;
}
html += renderComingUp({
  days,
  isExpanded: comingUpExpanded,
  summary,
  filterPersonName
});
```

(Verify `DAY_NAMES` is already imported from `./shared/utils.js` — it is, per dashboard.js line 5.)

- [ ] **Step 5: Wire toggle + day-block-head + event-row clicks**

In `bindEvents()`, after the existing card-binding block (around line 552), add:

```js
// Coming up rail (Task 8)
const comingUpEl = main.querySelector('.coming-up');
if (comingUpEl) {
  document.getElementById('comingUpToggle')?.addEventListener('click', () => {
    const isExpanded = comingUpEl.dataset.expanded === 'true';
    const next = !isExpanded;
    comingUpEl.dataset.expanded = next ? 'true' : 'false';
    document.getElementById('comingUpToggle')?.setAttribute('aria-expanded', next ? 'true' : 'false');
    const blocks = document.getElementById('comingUpBlocks');
    if (blocks) blocks.hidden = !next;
    localStorage.setItem('dr-coming-up-state', next ? 'expanded' : 'collapsed');
  });
  comingUpEl.querySelectorAll('.cal-day-block__head').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      if (!date) return;
      viewDate = date;
      celebrationShown = false;
      updateHeaderSubtitle();
      subscribeSchedule(viewDate);
      loadData();
    });
  });
  comingUpEl.querySelectorAll('.event-row').forEach(btn => {
    btn.addEventListener('click', () => {
      openEventDetailSheet(btn.dataset.eventId);
    });
  });
}
```

- [ ] **Step 6: Grep recipe — verify the rail wiring**

```bash
grep -n "renderComingUp\|coming-up\|comingUpToggle\|cal-day-block\|getEventsInRange\|dr-coming-up-state" dashboard.js shared/components.js shared/state.js styles/components.css
```

Expected: matches across all four files for each respective concern.

- [ ] **Step 7: Visual smoke**

Create test data: 2-3 events on Mon, Wed, Sat over the next 7 days. On dashboard at 375px:
- Collapsed row: `Coming up · 3 events this week`. Tap → expands. Persists across refresh.
- Expanded: 3 day-blocks (Mon/Wed/Sat); empty Tue/Thu/Fri don't render.
- Tap "Mon Apr 20" → dashboard `viewDate` jumps to that day. Back-to-Today pill appears.
- Tap an event row → existing event detail sheet opens.
- Switch filter to a person — summary updates: `Coming up · 1 event for Noah this week`.
- Filter to a person with zero upcoming events → `Coming up · clear week for Noah`. Expanded → empty-state line.
- Reduced motion: chevron rotates instantly (no animation).

- [ ] **Step 8: Commit**

```bash
git add shared/state.js shared/components.js styles/components.css dashboard.js
git commit -m "$(cat <<'EOF'
feat(dashboard): Coming up rail (backlog 3.3)

Spec 2026-04-25 §3.4: 7-day forward look replaces the phone-side need
for the shelved Calendar page. Collapsed by default; events-only count
in the summary; expanded view shows day-blocks for the next 7 days
(today excluded). Days with zero events collapse out.

- shared/state.js getEventsInRange (new helper)
- shared/components.js renderComingUp (pure renderer)
- styles/components.css .coming-up, .cal-day-block, .event-row (ports
  the .cal-day-block primitive from the shelved Phase 2 plan)
- dashboard.js render-order slot + click bindings + localStorage
  persistence under dr-coming-up-state

Tap day-block head -> jumps viewDate (preserves expand state). Tap
event row -> existing renderEventDetailSheet. Filter-aware via
activePerson; summary copy adapts ("clear week for Noah", etc.).
prefers-reduced-motion respected (chevron rotation -> instant).

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Today section meta — store-pt + grade chips when filtered

**Goal:** Per spec §3.7 + canonical table, the Today section meta shows `X of Y done` (family) or `X of Y done · NN pt · GRADE` (filtered to one person), where `pt` = `dailyScore.percentage × multiplier` (the snapshot-equivalent value).

**Files:**
- Modify: [shared/components.js:519](../../../shared/components.js#L519) — `renderSectionHead` — accept `metaHtml` option
- Modify: [dashboard.js:303-312](../../../dashboard.js#L303-L312) — compute meta line based on filter and pass `metaHtml`

- [ ] **Step 1: Extend `renderSectionHead` to accept raw HTML**

In [shared/components.js:519](../../../shared/components.js#L519), replace:

```js
export function renderSectionHead(title, meta, options = {}) {
  const { divider = false, trailingHtml = '' } = options;
  const metaHtml = meta ? `<div class="section__meta">${esc(meta)}</div>` : '';
  const trailing = trailingHtml ? `<div class="section__head-trailing">${trailingHtml}</div>` : '';
  const dividerCls = divider ? ' section__head--divider' : '';
  return `<div class="section__head${dividerCls}">
    <div class="section__title">${esc(title)}</div>
    ${metaHtml}
    ${trailing}
  </div>`;
}
```

with:

```js
export function renderSectionHead(title, meta, options = {}) {
  const { divider = false, trailingHtml = '', metaHtml: rawMetaHtml = '' } = options;
  // metaHtml (raw) takes precedence over meta (escaped text). Caller is responsible
  // for escaping any user-authored content inside metaHtml.
  let metaHtml = '';
  if (rawMetaHtml) {
    metaHtml = `<div class="section__meta">${rawMetaHtml}</div>`;
  } else if (meta) {
    metaHtml = `<div class="section__meta">${esc(meta)}</div>`;
  }
  const trailing = trailingHtml ? `<div class="section__head-trailing">${trailingHtml}</div>` : '';
  const dividerCls = divider ? ' section__head--divider' : '';
  return `<div class="section__head${dividerCls}">
    <div class="section__title">${esc(title)}</div>
    ${metaHtml}
    ${trailing}
  </div>`;
}
```

- [ ] **Step 2: Add a `.section__meta__grade` styling rule**

In [styles/components.css](../../../styles/components.css), find the `.section__meta` rule. Add immediately after it:

```css
.section__meta__grade {
  color: var(--success);
  font-weight: 600;
}
.section__meta__dot {
  display: inline-block;
  width: 3px; height: 3px;
  background: currentColor;
  opacity: 0.4;
  border-radius: 50%;
  margin: 0 var(--spacing-xs);
  vertical-align: middle;
}
```

- [ ] **Step 3: Compute the meta in `dashboard.js`**

In [dashboard.js:288-340](../../../dashboard.js#L288-L340), find the Today section render block. Replace the `sectionMeta` calculation and the `renderSectionHead` call with:

```js
// === Today section meta (spec §3.7) ===
// Family view: "X of Y done"
// Filtered to person: "X of Y done · NN pt · GRADE" (NN = today's pt, store-economy)
const isFiltered = !!activePerson && people.length >= 2;
const metaPieces = [];
const doneVerb = (totalCount > 0 && doneCount === totalCount) ? 'All done' : `${doneCount} of ${totalCount} done`;
const futureVerb = (totalCount > 0 && doneCount === 0 && isFuture) ? `0 of ${totalCount} scheduled` : null;
metaPieces.push(futureVerb || doneVerb);

if (isFiltered && !isFuture && totalCount > 0) {
  // Today's earned pt (store-economy): percentage × multiplier; cap not enforced
  // (multiplier days legitimately push past 100). Computed live; matches the
  // snapshot value at midnight.
  const todayMul = (multipliers?.[today]?.[activePerson]?.multiplier
                    ?? multipliers?.[today]?.all?.multiplier
                    ?? 1);
  const earnedPt = Math.round(score.percentage * todayMul);
  metaPieces.push(`${earnedPt} pt`);
  metaPieces.push(`<span class="section__meta__grade">${esc(gd.grade)}</span>`);
}

const metaHtmlPieces = metaPieces.map((p, i) => {
  if (i === 0) return esc(p);
  // Already-escaped span passes through; raw text is escaped here.
  const isHtml = p.startsWith('<');
  return `<span class="section__meta__dot" aria-hidden="true"></span>${isHtml ? p : esc(p)}`;
});
const metaHtmlStr = metaHtmlPieces.join('');

// Replace prior `sectionMeta` use:
html += renderSectionHead('Today', null, {
  divider: firstSectionRendered,
  trailingHtml: getTodayFilterChipHtml(),
  metaHtml: metaHtmlStr
});
firstSectionRendered = true;
```

(Note: `score` and `gd` are already computed in `render()` from `dailyScore(...)` and `gradeDisplay(...)`. Verify they remain in scope where the meta line is built.)

Also update the empty-state branch (around [dashboard.js:288-303](../../../dashboard.js#L288-L303)). When `totalCount === 0 && sortedEvents.length === 0`, the section's `renderSectionHead` should pass `meta: null` (no chips) since there's nothing to score.

- [ ] **Step 4: Grep recipe — verify section meta wiring**

```bash
grep -n "section__meta__grade\|metaHtml\|renderSectionHead" dashboard.js shared/components.js styles/components.css
```

Expected: each file has the relevant wiring.

- [ ] **Step 5: Visual smoke**

At 375px, family view: `Today` section meta reads `4 of 7 done` (or `All done` if all complete).

Tap filter chip → switch to one person. Meta updates to `4 of 7 done · 28 pt · B+`. Grade is colored success-green. The dot separators are subtle (3px, 40% opacity). Truncates without breaking on 320px viewport.

Switch to a 2× multiplier day (set `rundown/multipliers/{today}/all = { multiplier: 2 }`). Filtered: meta reads `All done · 200 pt · A+` when fully complete (2× the 100 baseline for a perfect day).

Switch to a future day. Meta reads `0 of 7 scheduled` — no pt or grade, regardless of filter.

Switch to a past day. Meta reads `4 of 7 done · 28 pt · B+` based on historical snapshot.

Switch back to family view. Meta drops back to `4 of 7 done`.

- [ ] **Step 6: Commit**

```bash
git add shared/components.js styles/components.css dashboard.js
git commit -m "$(cat <<'EOF'
feat(dashboard): Today section meta gains store-pt + grade when filtered

Spec 2026-04-25 §3.7 + canonical table: when the dashboard is filtered
to one person, the Today section meta reads "X of Y done · NN pt ·
GRADE" where NN = score.percentage × multiplier (today's store-economy
points; matches the snapshot value at midnight). Family view (filter =
All) keeps the existing "X of Y done". Future days show only the count.

renderSectionHead now accepts options.metaHtml for raw HTML in the
meta line; existing meta (escaped text) callers are untouched.
.section__meta__grade colored success-green; .section__meta__dot is
the 3px subtle separator.

This is the "earn the dashboard" surface for the rewards economy +
grading work — visible only when the user has chosen a person to
focus on, calm by default.

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: FAB pre-fills `activePerson`

**Goal:** Per spec §3.8.1, when filter is set to one person, the FAB pre-selects that person as the default owner in the new task/event form. (`viewDate` pre-fill already works — verify and confirm.)

**Files:**
- Modify: [dashboard.js:142-143](../../../dashboard.js#L142-L143) — `openAddMenuFromFab`
- Modify: [shared/components.js:713](../../../shared/components.js#L713) — verify `renderAddMenu` accepts a `defaultOwnerId` arg
- Modify: dashboard.js form-open paths to pass `defaultOwnerId` through

- [ ] **Step 1: Inspect `renderAddMenu` signature**

```bash
grep -n "export function renderAddMenu" shared/components.js
```

Read the function. If it doesn't currently accept a `defaultOwnerId` arg, add one. Reading [shared/components.js:713](../../../shared/components.js#L713) and the `renderEventForm` and `renderTaskFormCompact` signatures will show how owner selection is currently passed.

- [ ] **Step 2: Thread `activePerson` through to the form opens**

In [dashboard.js](../../../dashboard.js) `openAddMenu` and the related event/task open-form helpers, pass `defaultOwnerId: activePerson || null` whenever the user opens the add-task or add-event form via the FAB.

For the **task form** (renderTaskFormCompact / renderEditTaskSheet), the `task.owners[]` field carries the assignment. When `defaultOwnerId` is set and the form is for a NEW task (mode === 'create'), pre-populate `task.owners = [defaultOwnerId]` in the initial render.

For the **event form** (renderEventForm), the `event.people[]` array. Same pattern: when create-mode and `defaultOwnerId` is set, default the people-chip to that person checked.

The exact wiring:
- In [dashboard.js renderAddMenu / openAddMenu code path](../../../dashboard.js), add `defaultOwnerId: activePerson || null` to the args.
- In [dashboard.js openEventForm](../../../dashboard.js#L861), the `event` param defaults to `{}` (line 862). When event is `{}` and `activePerson` exists, set `event.people = [activePerson]` before rendering.

```js
function openEventForm(existingEventId = null) {
  const event = existingEventId
    ? events[existingEventId]
    : (activePerson ? { people: [activePerson] } : {});
  // …rest unchanged
}
```

- [ ] **Step 3: Verify `viewDate` pre-fill is already correct**

Read [dashboard.js openEventForm](../../../dashboard.js#L861-L924) — note line 914: `date: document.getElementById('ef_date')?.value || viewDate`. Existing behavior already pre-fills `viewDate`. No code change needed for date.

For the task form: confirm `renderTaskFormCompact` defaults the date field to today when no date is provided. If it doesn't pre-fill `viewDate`, add a similar default in the dashboard call site.

- [ ] **Step 4: Grep recipe**

```bash
grep -n "activePerson\|defaultOwnerId\|event.people" dashboard.js
```

Expected: at least one `defaultOwnerId: activePerson` (or equivalent `event.people = [activePerson]`) in the FAB / open-form code path.

- [ ] **Step 5: Visual smoke**

Filter dashboard to Noah. Tap FAB → "Add event". The event form opens with Noah's people-chip pre-checked. Save the event. Return to dashboard. New event appears with Noah's color stripe.

Switch filter to All. Tap FAB → "Add event". Event form opens with no people-chip pre-selected (the default behavior).

Repeat with "Add task": filtered = Noah's owner pre-selected; All = no pre-select.

- [ ] **Step 6: Commit**

```bash
git add dashboard.js shared/components.js
git commit -m "$(cat <<'EOF'
feat(dashboard): FAB pre-fills activePerson as default owner

Spec 2026-04-25 §3.8.1: when the dashboard filter is set to one
person, the FAB's add-task / add-event flow now pre-selects that
person. Family view (filter = All) opens with no pre-select (the
default).

viewDate pre-fill was already correct (event form line ~914).

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Bounty tag relabel — `+5 pt`

**Goal:** Per spec §7.9, bounty tag currently reads `🎯 5 pts` (line 415 of `renderTaskCard`). The emoji violates the chrome rule, and the label can be tightened to `+5 pt` to match the store-economy framing.

**Files:**
- Modify: [shared/components.js:413-416](../../../shared/components.js#L413-L416)

- [ ] **Step 1: Update the bounty-tag rendering**

In [shared/components.js:413-416](../../../shared/components.js#L413-L416), find:

```js
if (task?.bounty) {
  const bountyLabel = task.bounty.type === 'points' ? `${task.bounty.amount} pts` : 'Reward';
  actionTags += `<span class="task-card__tag task-card__bounty">🎯 ${esc(bountyLabel)}</span>`;
}
```

Replace with:

```js
if (task?.bounty) {
  const bountyLabel = task.bounty.type === 'points'
    ? `+${task.bounty.amount} pt`
    : '+ Reward';
  actionTags += `<span class="task-card__tag task-card__bounty">${esc(bountyLabel)}</span>`;
}
```

(The 🎯 emoji is removed — bounty status is conveyed by the label `+N pt` and the existing `task-card__bounty` color treatment.)

- [ ] **Step 2: Grep recipe**

```bash
grep -n "🎯\|bounty.*pts" shared/components.js
```

Expected: zero matches.

- [ ] **Step 3: Visual smoke**

Create a task with `bounty = { type: 'points', amount: 5 }`. Card meta row shows `+5 pt` tag (no emoji). Color treatment from `task-card__bounty` class still applies. Reward-type bounty (`bounty = { type: 'reward', rewardId: '...' }`) shows `+ Reward`.

- [ ] **Step 4: Commit**

```bash
git add shared/components.js
git commit -m "$(cat <<'EOF'
chore(card): bounty tag reads "+N pt" without emoji

Spec 2026-04-25 §7.9: drops the 🎯 prefix (emoji in chrome violates
DESIGN.md §7.6) and tightens the label to "+5 pt" to match the
store-economy framing. The existing task-card__bounty class still
provides color treatment so the bounty status remains visually
distinct without the emoji.

Bounty.amount is already store-economy (flows into balance via the
bonus message); the label now correctly says "pt" instead of "pts".

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Final task: SW cache bump + CACHE_BUMPS comment

**Goal:** Bump the service-worker cache version so users on existing devices fetch the new files.

**Files:**
- Modify: [sw.js](../../../sw.js)

- [ ] **Step 1: Bump `CACHE_NAME`**

In [sw.js](../../../sw.js), find:

```js
const CACHE_NAME = 'family-hub-v60';
```

Change to:

```js
const CACHE_NAME = 'family-hub-v61';
```

- [ ] **Step 2: Add CACHE_BUMPS comment row**

At the top of `sw.js`, add (above the `// v60` row):

```
// v61 (2026-04-25) — Dashboard final-form rework: Coming up rail (3.3),
//                    ambient strip slot, store-pt + grade meta chips
//                    when filtered, banner queue gains --info offline +
//                    cross-page mount on scoreboard/tracker, removed
//                    settings.showPoints (and per-card Npt chip), bumped
//                    long-press default 500 -> 800ms on dashboard,
//                    loading skeleton replaces inline spinner. Bounty
//                    tag relabeled "+5 pt" without emoji. Spec:
//                    docs/superpowers/specs/2026-04-25-dashboard-final-design.md
```

- [ ] **Step 3: Verify cache-list completeness**

If any new files were created (none in this plan — only modifications), update the cache file list. Run:

```bash
grep -n "shared/components.js\|shared/state.js\|styles/components.css\|dashboard.js\|index.html\|scoreboard.html\|tracker.html" sw.js | head -10
```

Expected: all modified files are already in the cache list (they should be — these are existing files).

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "$(cat <<'EOF'
chore(sw): bump cache to v61 for dashboard final-form rework

Forces clients to fetch the rewritten dashboard.js, components.js,
state.js, components.css, dashboard.css, index.html, scoreboard.html,
and tracker.html. CACHE_BUMPS comment row added documenting the
dashboard final-form spec.

Part of dashboard final-form rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## PR-level audit (before merge)

After all 12 commits land on `dashboard-final-form`, run these audits before opening the PR:

### Audit 1 — Tap targets ≥44×44

Open dashboard at 375px in devtools. In console:

```js
const targets = [
  ['#headerBell', 'Bell'],
  ['#headerOverflow', 'Overflow'],
  ['#fabAdd', 'FAB'],
  ['.check', 'Card check'],
  ['#openFilterSheet', 'Filter chip'],
  ['.bottom-nav__item', 'Nav item'],
  ['.coming-up__row', 'Coming up toggle'],
  ['.cal-day-block__head', 'Day block head'],
  ['.event-row', 'Event row'],
  ['.ambient-chip', 'Ambient chip'],
  ['[data-banner-action]', 'Banner action'],
  ['[data-banner-body]', 'Banner body'],
  ['.back-to-today__btn', 'Back-to-today']
];
targets.forEach(([sel, name]) => {
  const el = document.querySelector(sel);
  if (!el) { console.log(name, 'MISSING (may be conditional)'); return; }
  const r = el.getBoundingClientRect();
  console.log(name, r.width, 'x', r.height, r.width >= 44 && r.height >= 44 ? '✓' : '✗');
});
```

Expected: every present element passes ≥44×44.

### Audit 2 — Reduced-motion

Devtools → emulate `prefers-reduced-motion: reduce`. Re-test:
- Coming up chevron: rotates instantly, no transition.
- Skeleton: static, no shimmer.
- Card check toggle: no scale animation.
- Celebration: collapses to toast.
- Back-to-Today pill `.is-entering`: fade-only.

### Audit 3 — Theme + dark-mode parity

Switch through all 5 theme presets (Sage, Ocean, Rose, Amber, Iris) in light + dark. Verify:
- Section meta grade color is readable in all 10 combinations (4.5:1 contrast).
- Coming up summary text is readable.
- Ambient chip values are readable (especially in dark themes).
- Skeleton shimmer is visible but subtle in light + dark.

### Audit 4 — Hex sweep

```bash
grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/components.css styles/dashboard.css | grep -v '#fff\|#000\|color-mix'
```

Expected: zero new raw-hex literals from this rework. (Pre-existing exceptions documented inline are allowed.)

### Audit 5 — Manual smoke at 375 + 768

At **375px**: complete dashboard cycle (load skeleton → resolve → see content → swipe to tomorrow → see tomorrow's events + Coming up → return to today → toggle a task → check undo toast → open detail sheet → close → switch filter to person → see score-meta → switch back).

At **768px**: dashboard renders single column (no two-pane in this PR — Phase 7 owns tablet two-pane). Layout looks intentional, not stretched-phone.

### Audit 6 — Person-mode parity

Open `person.html?person=Jordin`. Verify:
- Header title: `Jordin`. No "Viewing as Jordin" pill (retired).
- Bell, ⋯, filter chip, FAB all render.
- Filter chip defaults to Jordin; flippable to All.
- Score-meta appears when filtered; disappears when All.
- All 8 sections render in correct order.

---

## Self-review checklist

After all tasks land, walk through the spec sections one more time and confirm:

- [ ] Spec §3.1 Header — no changes; person-link pill retirement confirmed (Task 0 already shipped via the spec PR DESIGN.md amendment).
- [ ] Spec §3.2 Banner queue — Task 5 covers `--info` + body-tappable + dead variants. Cross-page mount = Task 6.
- [ ] Spec §3.3 Ambient strip — Task 7 covers component, slot gating, SVG glyphs.
- [ ] Spec §3.4 Coming up rail — Task 8 covers it end-to-end.
- [ ] Spec §3.5 Back-to-Today pill — Task 3 documents the invariant.
- [ ] Spec §3.6 Events section — no behavior change in this rework.
- [ ] Spec §3.7 Today section — Task 9 covers score-meta; Task 1 removes `showPoints`.
- [ ] Spec §3.8 FAB + Bottom nav — Task 10 covers FAB pre-fill; nav unchanged in this rework.
- [ ] Spec §6.1 Added items: Coming up = Task 8; Ambient = Task 7; Score chips = Task 9; Banner variants = Task 5.
- [ ] Spec §6.2 Removed items: `settings.showPoints` = Task 1; "Viewing as" pill = already shipped in spec PR.
- [ ] Spec §6.3 Restructured: long-press = Task 2; Back-to-Today position = Task 3; Phase 1 decision #16 mooting = no code change (calendar tab gone).
- [ ] Spec §7.9 Bounty relabel = Task 11.

If any spec requirement above lacks a corresponding task, **stop and add the task** before opening the PR.

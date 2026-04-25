# Phase 2 — Calendar Rework Implementation Plan

> **SHELVED 2026-04-25.** Calendar work paused after PR #3 reached final review. Reason: phone-only Week became "scrollable dashboard," Day became "dashboard," Month is hidden — the calendar page only earns its keep on a tablet/kiosk where Month actually renders. Phone agenda needs are being moved to a dashboard "Coming up" rail (CLAUDE.md backlog 3.3). The Phase 1.5 alignment work captured here remains the right design when calendar resumes during the kiosk/tablet build (CLAUDE.md backlog 1.5). Branch `phase-2-calendar` was deleted; commits live in the closed PR #3 reflog if you need to resurrect them.
>
> Relative links in this file are written for the original location (`docs/superpowers/plans/`). Adjust if you reuse paths from `shelved/`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-04-24-phase-2-calendar-rework.md](../specs/2026-04-24-phase-2-calendar-rework.md)

**Goal:** Bring [calendar.html](../../../calendar.html) into Phase 1.5 alignment — phone-first vertical-agenda Week (today-first), pure-agenda Day (Events → Tasks), soft empty-state Month, sticky sub-bar, single filter chip, FAB + per-day `+` for events, time-grid retired.

**Architecture:** Pure-render module ([shared/calendar-views.js](../../../shared/calendar-views.js)) returns HTML strings; [calendar.html](../../../calendar.html) owns subscriptions, mounts, and event delegation. No Firebase schema changes. Cards use the catalog's `.card` (Phase 1.5), not bespoke `cal-*` density classes. New layout-only classes: `.cal-subbar`, `.cal-day-block`, `.cal-day-add`, `.cal-empty-month`. The `buildTimeGrid` helper (lines 14–78 of `calendar-views.js` today) is deleted entirely.

**Tech Stack:** Vanilla JS ES modules (no bundler), hand-written CSS with tokens from Phase 0/1.5, Firebase RTDB compat (unchanged).

**Branch:** `phase-2-calendar` cut off `main` (Phase 1.5 already merged through SW v60).

**Verification model:** No test runner in this repo ([CLAUDE.md](../../../CLAUDE.md): "no build step, no test suite"). Each task uses the Phase 1.5 pattern: (a) focused grep recipe for CSS/DOM invariants, (b) runtime measurement via `getComputedStyle` / `getBoundingClientRect` for sizes, (c) manual visual smoke at 375px in light + dark themes against the spec's expected outcome. Tasks end with a commit; CI gate is Cloudflare's auto-deploy on push to `main`.

---

## Scope (locked — do not extend without spec amendment)

**In scope (8 tasks):**
1. Calendar shell parity: retire `overflow:hidden` body lock + add banner-slot + FAB mount.
2. Sticky sub-bar markup and CSS (View Tabs + date nav + filter chip).
3. Rewrite `renderWeekView` as today-first vertical agenda; delete `buildTimeGrid` helper.
4. Rewrite `renderDayView` as pure-agenda Events → Tasks with section heads.
5. Phone month view soft empty-state branch in `renderMonthView`.
6. FAB → Event form direct + per-day `+` chip in Week view (with date pre-fill).
7. Tap-target + reduced-motion + dark-mode audit pass; raw-hex sweep in `styles/calendar.css`.
8. SW cache bump (v60 → v61) + CLAUDE.md backlog 1.3 wiring tags.

**Out of scope (deferred — listed so they aren't rediscovered mid-PR):**
- Meals section in Day view → backlog 1.3 (CLAUDE.md tag added by Task 8).
- FAB → Event/Meal picker sheet → backlog 1.3 (CLAUDE.md tag added by Task 8).
- Calendar loading skeleton → backlog 3.0 (already documented).
- Listener footprint optimization → only triggered if measurement during Task 3 shows >100KB schedule payload.
- Tablet two-pane month-detail layout → Phase 7.

---

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| [calendar.html](../../../calendar.html) | Calendar shell markup + JS controller | 1, 2, 6 |
| [shared/calendar-views.js](../../../shared/calendar-views.js) | View renderers (~412 lines today; will shrink after time-grid removal) | 3, 4, 5, 6 |
| [styles/calendar.css](../../../styles/calendar.css) | Calendar-specific CSS | 1, 2, 3, 4, 5, 6, 7 |
| [styles/base.css](../../../styles/base.css) | Token additions | 2 (one line: `--z-subbar`) |
| [styles/responsive.css](../../../styles/responsive.css) | Breakpoint overrides | 5 |
| [sw.js](../../../sw.js) | Cache version | 8 |
| [CLAUDE.md](../../../CLAUDE.md) | Backlog 1.3 wiring notes | 8 |

`shared/components.js` is **not modified** — `renderEmptyState(icon, title, subtitle, options)` already exists at line 277 (verified during plan write).

---

## Pre-task setup

Run once at the start of the phase:

- [ ] **Cut the branch off `main` and verify clean state**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b phase-2-calendar
git status
```

Expected: clean working tree on branch `phase-2-calendar`.

- [ ] **Verify the pre-existing primitives the plan depends on**

```bash
grep -n "export function renderEmptyState" shared/components.js
grep -n "export function renderSectionHead" shared/components.js
grep -n "export function renderFilterChip" shared/components.js
grep -n "applyDataColors" shared/components.js
grep -n "^const CACHE_NAME" sw.js
```

Expected output:
- `renderEmptyState` at line 277, signature `(icon, title, subtitle = '', options = {})`.
- `renderSectionHead` exists with the Phase 1.5 signature `(title, meta, options)`.
- `renderFilterChip` exists with the Phase 1.5 signature `({ id, activePersonName, activePersonColor })`.
- `applyDataColors` exists.
- `CACHE_NAME = 'family-hub-v60'` (will bump to v61 in Task 8).

If any of these are missing or have a different signature, **stop and reconcile with the spec before proceeding**. The plan assumes they match Phase 1.5's shipped state.

---

## Task 1: Calendar shell parity (retire overflow lock + add mounts)

**Goal:** [calendar.html](../../../calendar.html) shell matches the Phase 1.5 dashboard pattern. Body class drops the `overflow: hidden; height: 100dvh` lock (which forced the time-grid scroll trap). Banner-slot and FAB mount points are present so later tasks can wire content into them.

**Files:**
- Modify: [styles/calendar.css:1-6](../../../styles/calendar.css#L1-L6) — `.cal-page` body lock
- Modify: [calendar.html:22-24](../../../calendar.html#L22-L24) — body shell + add banner/FAB mounts

- [ ] **Step 1: Read the current shell**

```bash
sed -n '1,10p' styles/calendar.css
sed -n '20,30p' calendar.html
grep -n "fabMount\|bannerSlot\|banner-slot" calendar.html
```

Expected: `.cal-page { overflow: hidden; height: 100dvh; }` at top of CSS; body has `class="cal-page"` and a single `<div class="page-content" id="app">`. No fabMount/bannerSlot exist yet.

- [ ] **Step 2: Drop the body-level overflow lock**

Edit [styles/calendar.css](../../../styles/calendar.css). Replace:

```css
.cal-page { overflow: hidden; height: 100dvh; }
```

with:

```css
/* .cal-page no longer locks page height — natural scroll restored.
   Phase 2: Day view is pure agenda; Week view is vertical agenda;
   Month-on-phone is empty-state. None of the views need page-locking. */
```

Other internal `overflow: hidden` rules in the same file (rounded card containers, etc.) stay — only the body-level lock is removed.

- [ ] **Step 3: Add banner-slot and FAB mount to the shell**

Edit [calendar.html:22-24](../../../calendar.html#L22-L24). Find:

```html
<body class="cal-page">

  <div class="page-content" id="app">
```

and replace the `<div class="page-content" id="app">` block — the new shell must include a banner-slot ABOVE the content area and a `fabMount` BELOW it, mirroring the dashboard ([index.html](../../../index.html) pattern). The exact insertion looks like:

```html
<body class="cal-page">

  <div id="bannerSlot"></div>

  <div class="page-content" id="app"></div>

  <div id="fabMount"></div>
```

(Bottom nav and header mounts are already present elsewhere in the file — leave them.)

- [ ] **Step 4: Grep recipe — verify the lock is gone and mounts exist**

```bash
grep -n "overflow.*hidden.*100dvh\|height.*100dvh" styles/calendar.css
grep -n "id=\"bannerSlot\"\|id=\"fabMount\"" calendar.html
```

Expected: zero matches in `styles/calendar.css` for the lock pair. Two matches in `calendar.html` for the mounts.

- [ ] **Step 5: Visual smoke**

Hard-refresh `calendar.html` in the browser. Page scrolls naturally end-to-end (no scroll trap). The current week-grid still renders (rewritten in Task 3, but the shell change is non-destructive). Banner-slot is present but empty (renders zero pixels). FAB mount is present but empty.

- [ ] **Step 6: Commit**

```bash
git add styles/calendar.css calendar.html
git commit -m "$(cat <<'EOF'
refactor(calendar): retire overflow:hidden body lock + add Phase 1.5 mount parity

Drops .cal-page { overflow: hidden; height: 100dvh } -- the lock was
required by the time-grid scroll trap, which Phase 2 retires. Calendar
now scrolls naturally end-to-end like the dashboard.

Adds #bannerSlot and #fabMount mount points to match the dashboard
shell so Tasks 2-6 can wire the sticky sub-bar and FAB into a stable
DOM. Banner-slot is empty in Phase 2 (parity for future banners);
FAB mount is wired in Task 6.

Part of Phase 2 calendar rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Sticky sub-bar (View Tabs + date nav + filter chip)

**Goal:** A two-row sticky control band sits below the header. Row 1 = View Tabs (Month / Week / Day). Row 2 = Day/Week date-nav (← {label} →) with a right-aligned filter chip. Both rows stay reachable mid-scroll.

**Files:**
- Modify: [styles/base.css:100-108](../../../styles/base.css#L100-L108) — add `--z-subbar` token
- Modify: [calendar.html](../../../calendar.html) — replace the existing `cal-nav` markup with `.cal-subbar` and retire `.person-pill` row
- Modify: [styles/calendar.css](../../../styles/calendar.css) — add `.cal-subbar` rules; retire any `.cal-nav` rules superseded
- Modify: [shared/calendar-views.js:390-412](../../../shared/calendar-views.js#L390-L412) — `renderCalendarNav` becomes `renderCalSubbar` returning the two-row sticky band

- [ ] **Step 1: Add `--z-subbar` token**

Edit [styles/base.css:100-108](../../../styles/base.css#L100-L108). The current z-band block is:

```css
  --z-header: 10;
  --z-fab: 15;
  --z-nav: 20;
  --z-sheet-backdrop: 30;
  --z-sheet: 31;
  --z-modal-backdrop: 40;
  --z-modal: 41;
  --z-toast: 50;
  --z-celebration: 60;
```

Insert one line **after** `--z-header: 10;`:

```css
  --z-subbar: 9;          /* sticky calendar sub-bar — sits below header */
```

Sub-bar is below header in z (header overlaps sub-bar if both stick at 0; in practice sub-bar's `top` offset moves it below header so they don't compete, but the band is reserved here for clarity).

- [ ] **Step 2: Find the current calendar-nav markup**

```bash
grep -n "renderCalendarNav\|cal-nav\|person-pill" calendar.html | head -20
grep -n "renderCalendarNav" shared/calendar-views.js
```

Note the line numbers where `renderCalendarNav` is called and where `person-pill` markup is rendered. The Phase 1.5 spec retires the chip row in favor of a single filter chip; Task 2 implements that.

- [ ] **Step 3: Replace `renderCalendarNav` with `renderCalSubbar`**

Edit [shared/calendar-views.js:390-412](../../../shared/calendar-views.js#L390-L412). Delete the existing `renderCalendarNav` function and replace with:

```js
import { renderFilterChip } from './components.js';

/**
 * Render the sticky calendar sub-bar.
 * Row 1: View Tabs (Month | Week | Day).
 * Row 2: Date nav (← {label} →) + right-aligned filter chip.
 *
 * Caller wires click handlers on .cal-subbar__view-tab[data-view],
 * .cal-subbar__nav[data-dir], and #openFilterSheet.
 */
export function renderCalSubbar({ currentView, viewLabel, isCurrentPeriod, activePersonName = '', activePersonColor = '' }) {
  const tabs = ['month', 'week', 'day'].map(v => {
    const label = v.charAt(0).toUpperCase() + v.slice(1);
    const cls = 'cal-subbar__view-tab' + (v === currentView ? ' is-active' : '');
    return `<button type="button" class="${cls}" data-view="${v}">${label}</button>`;
  }).join('');

  const todayChip = !isCurrentPeriod
    ? `<button type="button" class="cal-subbar__today" id="goToday">Today</button>`
    : '';

  const filterChip = renderFilterChip({
    id: 'openFilterSheet',
    activePersonName,
    activePersonColor
  });

  return `<div class="cal-subbar">
    <div class="cal-subbar__row cal-subbar__row--tabs" role="tablist">
      ${tabs}
    </div>
    <div class="cal-subbar__row cal-subbar__row--nav">
      <button type="button" class="cal-subbar__nav" data-dir="prev" aria-label="Previous">&lsaquo;</button>
      <div class="cal-subbar__center">
        <span class="cal-subbar__label">${esc(viewLabel)}</span>
        ${todayChip}
      </div>
      <button type="button" class="cal-subbar__nav" data-dir="next" aria-label="Next">&rsaquo;</button>
      <div class="cal-subbar__filter">${filterChip}</div>
    </div>
  </div>`;
}
```

`esc` is already defined at the top of the file (line 8). `renderFilterChip` is added to the imports at the top.

- [ ] **Step 4: Update `calendar.html` to call `renderCalSubbar` and retire person-pill row**

In [calendar.html](../../../calendar.html), find the `renderCalendarNav(...)` callsite and the `person-pill` markup loop. Update:

(a) Change the import:
```js
import { renderWeekView, renderDayView, renderMonthView, renderCalSubbar } from './shared/calendar-views.js';
```

(b) Change the callsite to pass active-person data instead of `controlsHtml`:
```js
const activePersonObj = activePerson ? people.find(p => p.id === activePerson) : null;
const subbarHtml = renderCalSubbar({
  currentView: view,
  viewLabel: viewLabel,
  isCurrentPeriod: isCurrentPeriod,
  activePersonName: activePersonObj?.name || '',
  activePersonColor: activePersonObj?.color || ''
});
// mount into the same place renderCalendarNav was mounted
```

(c) Delete the `person-pill` row rendering loop entirely. Filter selection now happens in the existing filter sheet (opened by `#openFilterSheet`); calendar reuses the dashboard's sheet pattern. If [calendar.html](../../../calendar.html) was mounting the sheet itself, leave that mount; only the row of pills above content is removed.

(d) Wire delegated click handlers for the new sub-bar:

```js
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.cal-subbar__view-tab[data-view]');
  if (tab) { setView(tab.dataset.view); return; }
  const nav = e.target.closest('.cal-subbar__nav[data-dir]');
  if (nav) { adjustPeriod(nav.dataset.dir === 'next' ? 1 : -1); return; }
  if (e.target.closest('#goToday')) { goToToday(); return; }
  if (e.target.closest('#openFilterSheet')) { openFilterSheet(); return; }
});
```

(adapt names like `setView`, `adjustPeriod`, `goToToday`, `openFilterSheet` to whatever the file currently uses — the goal is delegated handlers replacing the prior id-based bindings).

- [ ] **Step 5: Add `.cal-subbar` styles**

Edit [styles/calendar.css](../../../styles/calendar.css). Add (near the top, after the header rules):

```css
/* === Calendar sticky sub-bar === */
.cal-subbar {
  position: sticky;
  top: var(--header-height, 56px);
  z-index: var(--z-subbar);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.cal-subbar__row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  min-height: 44px;
}
.cal-subbar__row--tabs {
  gap: 0;
  border-bottom: 1px solid var(--border);
}
.cal-subbar__view-tab {
  flex: 1;
  background: transparent;
  border: 0;
  padding: var(--spacing-sm);
  font: inherit;
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--text-muted);
  min-height: 44px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.cal-subbar__view-tab.is-active {
  color: var(--accent-ink);
  background: var(--accent-soft);
  font-weight: 600;
}
.cal-subbar__view-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.cal-subbar__nav {
  background: transparent;
  border: 0;
  font-size: var(--font-xl);
  line-height: 1;
  color: var(--text-muted);
  min-width: 44px;
  min-height: 44px;
  cursor: pointer;
}
.cal-subbar__center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
}
.cal-subbar__label {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text);
}
.cal-subbar__today {
  background: var(--accent-soft);
  color: var(--accent-ink);
  border: 0;
  border-radius: var(--radius-full);
  padding: 2px 10px;
  font-size: var(--font-xs);
  font-weight: 500;
  cursor: pointer;
  min-height: 28px;
}
.cal-subbar__filter { display: flex; align-items: center; }
```

Then **find and delete** the prior `.cal-nav` block(s) in the same file. Also delete `.person-pill*` blocks (the chip-row CSS) — they're orphaned now.

- [ ] **Step 6: Grep recipe**

```bash
grep -n "renderCalendarNav\|renderCalSubbar" shared/calendar-views.js calendar.html
grep -n "\.cal-nav\|person-pill" styles/calendar.css
grep -n "\.cal-subbar" styles/calendar.css | head
```

Expected: no `renderCalendarNav` callsites remain; one `renderCalSubbar` definition + at least one callsite. No `.cal-nav` or `.person-pill` selectors remain in `styles/calendar.css`. `.cal-subbar` rules present.

- [ ] **Step 7: Visual smoke + measurement**

Reload `calendar.html`. The sub-bar is sticky below the header; scrolling content slides under it. View Tabs row shows Month/Week/Day with the active tab in the accent-soft state. Date-nav row shows ← {label} → with a "Today" pill when off-current and the filter chip on the right.

In DevTools console, measure sub-bar height:

```js
const sb = document.querySelector('.cal-subbar');
console.log('sub-bar height', sb.getBoundingClientRect().height);
```

Record the value. If > 88px on a 375px viewport, note it as a follow-up for Task 7's responsive check (View Tabs may need to condense to icon-only).

- [ ] **Step 8: Commit**

```bash
git add styles/base.css styles/calendar.css calendar.html shared/calendar-views.js
git commit -m "$(cat <<'EOF'
feat(calendar): sticky sub-bar with View Tabs + date nav + filter chip

- Adds --z-subbar token (z=9) for the sticky control band.
- Replaces renderCalendarNav with renderCalSubbar: two rows
  (View Tabs / Date nav + filter chip), sticky below the header.
- Retires the .person-pill row above content; filtering now uses
  the shared renderFilterChip component opening the existing
  filter sheet (Phase 1.5 dashboard parity).
- Delegated click handlers replace per-id bindings on the sub-bar
  controls.

Part of Phase 2 calendar rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rewrite Week view as today-first vertical agenda

**Goal:** [shared/calendar-views.js](../../../shared/calendar-views.js) `renderWeekView` becomes a vertical scroll of seven day-blocks. Today is anchored at the top via CSS `order: 0`; future days follow chronologically (`order: 1..6`); past days sink to the bottom faded (`order: 7..` + `opacity: 0.6`). Each day-block holds Events and Tasks sections (using the shared `renderSectionHead` + `.section__head--divider` pattern), plus a per-day `+` quick-add chip at the end. The `buildTimeGrid` helper is **deleted** — Phase 2 has no time-grid.

**Files:**
- Modify: [shared/calendar-views.js:14-78](../../../shared/calendar-views.js#L14-L78) — delete `buildTimeGrid`
- Modify: [shared/calendar-views.js:96-195](../../../shared/calendar-views.js#L96-L195) — replace `renderWeekView`
- Modify: [styles/calendar.css](../../../styles/calendar.css) — add `.cal-day-block` rules; delete prior `.cal-week*` rules

- [ ] **Step 1: Delete `buildTimeGrid`**

Edit [shared/calendar-views.js](../../../shared/calendar-views.js). Delete lines 14–78 (the entire `buildTimeGrid` function). Also delete the `renderEventBubble` import if it becomes unused after Task 4 (re-grep at end of Task 4).

- [ ] **Step 2: Replace `renderWeekView`**

Edit [shared/calendar-views.js](../../../shared/calendar-views.js) — replace the existing `renderWeekView` with:

```js
import { renderSectionHead } from './components.js';

/**
 * Render the week view as a vertical agenda of seven day-blocks.
 * Today-first ordering via CSS `order` (today=0, future=1..6, past=7..).
 * Past days are faded by .cal-day-block--past (opacity in CSS).
 *
 * @param {object} opts
 * @param {string} opts.weekStartDate
 * @param {string} opts.today
 * @param {object} opts.events, allSchedule, completions, tasks, cats
 * @param {Array}  opts.people
 * @param {string|null} opts.activePerson
 * @returns {string} HTML
 */
export function renderWeekView(opts) {
  const { weekStartDate, today, events, allSchedule, completions, tasks, cats, people, activePerson } = opts;
  const days = dateRange(weekStartDate, addDays(weekStartDate, 6));
  const todayPos = days.indexOf(today);

  // Compute CSS `order` for each day: today=0, future days chronologically next,
  // past days at the bottom in nearest-past-first order.
  const orderFor = (idx) => {
    if (todayPos < 0) return idx;            // week without today: chronological
    if (idx === todayPos) return 0;
    if (idx > todayPos) return idx - todayPos;
    return (days.length - 1 - todayPos) + (todayPos - idx);
  };

  const blocks = days.map((dk, i) => buildDayBlock({
    dateKey: dk,
    today,
    order: orderFor(i),
    events, allSchedule, completions, tasks, cats, people, activePerson
  })).join('');

  return `<div class="cal-week-agenda">${blocks}</div>`;
}

/**
 * Build a single day-block for the vertical agenda.
 * Block is a section-like container with a day header,
 * optional Events section, optional Tasks section, and a per-day + chip.
 */
function buildDayBlock({ dateKey, today, order, events, allSchedule, completions, tasks, cats, people, activePerson }) {
  const isToday = dateKey === today;
  const isPast = dateKey < today;
  const dow = dayOfWeek(dateKey);
  const dayNum = parseInt(dateKey.split('-')[2], 10);
  const monthIdx = parseInt(dateKey.split('-')[1], 10) - 1;

  // Events
  let dayEvents = getEventsForDate(events, dateKey);
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);

  // Tasks (events filtered out of schedule entries)
  const dayEntries = allSchedule[dateKey] || {};
  const filteredEntries = filterByPerson(dayEntries, activePerson);
  const taskEntries = Object.fromEntries(
    Object.entries(filteredEntries).filter(([, e]) => e.type !== 'event')
  );
  const sortedTasks = sortEntries(taskEntries, completions);
  const doneCount = sortedTasks.filter(([k]) => isComplete(k, completions)).length;
  const totalCount = sortedTasks.length;

  // Header — day name + date + Today badge
  const todayBadge = isToday ? `<span class="cal-day-block__today">Today</span>` : '';
  const header = `<div class="cal-day-block__head">
    ${todayBadge}
    <span class="cal-day-block__day">${DAY_NAMES_FULL[dow]}</span>
    <span class="cal-day-block__date">${MONTH_NAMES[monthIdx]} ${dayNum}</span>
  </div>`;

  // Events section
  let eventsSection = '';
  if (sortedEvents.length > 0) {
    eventsSection = renderSectionHead('Events', null) +
      `<div class="cal-day-block__events">` +
      sortedEvents.map(([eventId, evt]) => renderEventCard(eventId, evt, people)).join('') +
      `</div>`;
  }

  // Tasks section
  let tasksSection = '';
  if (totalCount > 0) {
    const meta = `${doneCount} of ${totalCount} done`;
    tasksSection = renderSectionHead('Tasks', meta, { divider: sortedEvents.length > 0 }) +
      `<div class="cal-day-block__tasks">` +
      sortedTasks.map(([k, e]) => renderTaskCard(k, e, dateKey, today, tasks, cats, people, completions)).join('') +
      `</div>`;
  }

  // Empty inline if both empty
  let emptyInline = '';
  if (sortedEvents.length === 0 && totalCount === 0) {
    emptyInline = `<div class="cal-day-block__empty">Nothing scheduled</div>`;
  }

  // Per-day quick-add
  const addChip = `<button type="button" class="cal-day-add" data-date="${dateKey}" aria-label="Add event for ${MONTH_NAMES[monthIdx]} ${dayNum}">+</button>`;

  const cls = 'cal-day-block' +
    (isToday ? ' cal-day-block--today' : '') +
    (isPast ? ' cal-day-block--past' : '');

  return `<section class="${cls}" data-date="${dateKey}" style="order: ${order}">
    ${header}
    ${eventsSection}
    ${tasksSection}
    ${emptyInline}
    <div class="cal-day-block__foot">${addChip}</div>
  </section>`;
}

/** Helper: render an event card using the shared .card pattern. */
function renderEventCard(eventId, evt, people) {
  const owner = evt.ownerId ? people.find(p => p.id === evt.ownerId) : null;
  const time = evt.allDay ? '' :
    (evt.startTime ? formatEventTime(evt.startTime) + ' — ' : '');
  const stripe = owner ? `data-owner-color="${owner.color}"` : '';
  return `<article class="card card--event" data-event-id="${eventId}" ${stripe}>
    <div class="card__body">
      <div class="card__title">${esc(time)}${esc(evt.name || 'Untitled')}</div>
      ${owner ? `<div class="card__meta"><span class="card__meta-dot"></span>${esc(owner.name)}</div>` : ''}
    </div>
  </article>`;
}

/** Helper: render a task card using the shared .card pattern + check button. */
function renderTaskCard(entryKey, entry, dateKey, today, tasks, cats, people, completions) {
  const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0 };
  const owner = entry.ownerId ? people.find(p => p.id === entry.ownerId) : null;
  const done = isComplete(entryKey, completions);
  const isPastDaily = dateKey < today && (entry.rotationType || 'daily') === 'daily';
  const cat = task.category ? cats[task.category] : null;
  const todLabel = entry.timeOfDay === 'am' ? 'AM' : entry.timeOfDay === 'pm' ? 'PM' : '';
  const stripe = owner ? `data-owner-color="${owner.color}"` : '';
  const checkSvg = done
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`
    : '';

  return `<article class="card task-card${done ? ' card--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dateKey}" ${stripe} ${isPastDaily ? 'data-tap-blocked="true"' : ''}>
    <div class="card__body">
      <div class="card__title">${esc(task.name)}</div>
      <div class="card__meta">
        ${owner ? `<span class="card__meta-owner">${esc(owner.name)}</span><span class="card__meta-dot"></span>` : ''}
        ${todLabel ? `<span>${todLabel}</span><span class="card__meta-dot"></span>` : ''}
        ${cat?.icon ? `<span class="card__meta-icon" aria-hidden="true">${cat.icon}</span>` : ''}
      </div>
    </div>
    <div class="card__trailing">
      <button class="check${done ? ' check--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dateKey}" type="button" aria-label="${done ? 'Mark incomplete' : 'Mark complete'}">${checkSvg}</button>
    </div>
  </article>`;
}

/** "14:30" → "2:30 PM" */
function formatEventTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
```

Notes:
- The new module imports `renderSectionHead` from `./components.js` — add that import at the top if it's not already present.
- `card--event` and `card--done` are Phase 1.5 catalog variants — no new component patterns introduced.
- `data-owner-color` is consumed by the existing `applyDataColors(mountEl)` runtime path (calendar.html should already call it; if not, this is the existing pattern).
- `data-tap-blocked="true"` matches the dashboard's past-daily handling.
- Section divider pattern matches Phase 1.5: only the second-and-after section in a day-block gets the divider.

- [ ] **Step 3: Add `.cal-day-block` CSS, delete `.cal-week*` rules**

Edit [styles/calendar.css](../../../styles/calendar.css). First, delete every rule starting with `.cal-week` (week-grid was the old layout). Then add:

```css
/* === Week view: vertical agenda day-blocks === */
.cal-week-agenda {
  display: flex;
  flex-direction: column;
  /* gap handled by per-block margin-bottom for CSS-order compatibility */
}
.cal-day-block {
  margin-bottom: var(--spacing-lg);
}
.cal-day-block--past {
  opacity: 0.6;
}
.cal-day-block__head {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md);
  margin: 0 0 var(--spacing-sm);
}
.cal-day-block__today {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}
.cal-day-block__day {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text);
}
.cal-day-block__date {
  font-size: var(--font-sm);
  color: var(--text-muted);
}
.cal-day-block__empty {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-sm);
  color: var(--text-muted);
}
.cal-day-block__foot {
  display: flex;
  justify-content: flex-end;
  padding: var(--spacing-xs) var(--spacing-md) 0;
}
.cal-day-add {
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--text-muted);
  border-radius: var(--radius-full);
  width: 32px;
  height: 32px;
  font-size: var(--font-lg);
  line-height: 1;
  cursor: pointer;
  /* Effective tap area >= 44 via padding around the chip */
  padding: 0;
  position: relative;
}
.cal-day-add::before {
  content: "";
  position: absolute;
  inset: -6px;
}
.cal-day-add:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.cal-day-add:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Verify the listener footprint (one-time measurement)**

Reload `calendar.html` (week view). In the DevTools Network panel, find the Firebase Realtime Database WebSocket frames or the initial REST snapshot for `rundown/schedule`. Note the payload size for one full snapshot.

```
Expected: < 100KB.
If > 100KB: file a follow-up ticket to scope the schedule listener
to a date range (e.g., current week ± 4 weeks). Do NOT optimize in
Phase 2 — flag for a separate PR.
```

Record the observed payload in the commit body.

- [ ] **Step 5: Visual smoke (Week view)**

Reload calendar at 375px wide. Verify:
- Today's day-block sits at the top (regardless of where the week's chronological order would put it).
- Future days follow chronologically.
- Past days appear at the bottom, visibly faded.
- Each day-block shows: header (with "Today" pill on today only), Events section if any, Tasks section if any (with `N of M done` meta), per-day `+` chip at bottom-right.
- Section divider appears above the Tasks section only when Events section also exists.
- Tap-block on past daily tasks: tap doesn't toggle (sheet opens — sheet wiring may exist already; if not, that's part of the inherited calendar handler in calendar.html).

- [ ] **Step 6: Commit**

```bash
git add shared/calendar-views.js styles/calendar.css
git commit -m "$(cat <<'EOF'
feat(calendar): rewrite week view as today-first vertical agenda

- Deletes buildTimeGrid helper and all .cal-week* CSS — Phase 2 has
  no time-grid.
- renderWeekView now produces seven .cal-day-block sections with
  CSS `order` driving today-first layout (today=0, future=1..6,
  past=7..). Past days fade via .cal-day-block--past { opacity: 0.6 }.
- Each block has a head (Day Month-num + optional "Today" pill),
  an Events section (renderSectionHead), a Tasks section
  (renderSectionHead with divider when Events present), an inline
  empty line if both are empty, and a per-day + chip in the foot.
- Cards use the shared .card / .card--event / .card--done /
  .check pattern — no .cal-week-* density forks.

Listener payload measured at <obs> KB (Phase 2 plan §3 Step 4).

Part of Phase 2 calendar rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(Replace `<obs>` with the measured payload size before committing.)

---

## Task 4: Rewrite Day view as pure agenda (Events → Tasks)

**Goal:** `renderDayView` produces two sections: Events (no time-grid; time-prefix label on each timed event card) → Tasks. Section heads use the Phase 1.5 pattern with non-first divider. Empty state for "nothing today" reuses `renderEmptyState`.

**Files:**
- Modify: [shared/calendar-views.js:200-304](../../../shared/calendar-views.js#L200-L304) — replace `renderDayView`
- Modify: [styles/calendar.css](../../../styles/calendar.css) — delete prior `.cal-day*` rules superseded; keep nothing legacy

- [ ] **Step 1: Replace `renderDayView`**

Edit [shared/calendar-views.js](../../../shared/calendar-views.js) — replace the existing `renderDayView` function with:

```js
import { renderEmptyState } from './components.js';
// (renderSectionHead already imported in Task 3)

/**
 * Render the day view as pure agenda: Events → Tasks.
 * Empty state when both are empty.
 *
 * @param {object} opts
 * @param {string} opts.dateKey, today
 * @param {object} opts.events, allSchedule, completions, tasks, cats
 * @param {Array}  opts.people
 * @param {string|null} opts.activePerson
 * @returns {string} HTML
 */
export function renderDayView(opts) {
  const { dateKey, today, events, allSchedule, completions, tasks, cats, people, activePerson } = opts;

  // Events for the day, sorted: all-day first, then chronological by start time
  let dayEvents = getEventsForDate(events, dateKey);
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);
  const allDay = sortedEvents.filter(([, e]) => e.allDay);
  const timed = sortedEvents.filter(([, e]) => !e.allDay && e.startTime);
  const untimed = sortedEvents.filter(([, e]) => !e.allDay && !e.startTime);
  const orderedEvents = [...allDay, ...timed, ...untimed];

  // Tasks (event entries filtered out)
  const dayEntries = allSchedule[dateKey] || {};
  const filtered = filterByPerson(dayEntries, activePerson);
  const taskEntries = Object.fromEntries(
    Object.entries(filtered).filter(([, e]) => e.type !== 'event')
  );
  const sortedTasks = sortEntries(taskEntries, completions);
  const doneCount = sortedTasks.filter(([k]) => isComplete(k, completions)).length;
  const totalCount = sortedTasks.length;

  // Empty state
  if (orderedEvents.length === 0 && totalCount === 0) {
    const title = activePerson ? 'No items for this person' : 'Nothing scheduled';
    const subtitle = 'Tap + to add an event.';
    return `<div class="cal-day-agenda">${renderEmptyState('', title, subtitle)}</div>`;
  }

  let html = '';

  if (orderedEvents.length > 0) {
    html += renderSectionHead('Events', null);
    html += `<div class="cal-day-agenda__events">`;
    for (const [eventId, evt] of orderedEvents) {
      html += renderEventCard(eventId, evt, people);
    }
    html += `</div>`;
  }

  if (totalCount > 0) {
    const meta = `${doneCount} of ${totalCount} done`;
    html += renderSectionHead('Tasks', meta, { divider: orderedEvents.length > 0 });
    html += `<div class="cal-day-agenda__tasks">`;
    for (const [entryKey, entry] of sortedTasks) {
      html += renderTaskCard(entryKey, entry, dateKey, today, tasks, cats, people, completions);
    }
    html += `</div>`;
  }

  return `<div class="cal-day-agenda">${html}</div>`;
}
```

Notes:
- Re-uses `renderEventCard` and `renderTaskCard` defined in Task 3. Time-prefix is included automatically by `renderEventCard` for timed events.
- `renderEmptyState(icon, title, subtitle)` — pass `''` for the icon (subtle text-only empty state on day view; the chip's `+` is the action). If the user wants an icon, the third positional `options` arg can carry it later.
- Section ordering: Events first, then Tasks. Meals deferred — no section.

- [ ] **Step 2: Delete prior `.cal-day*` CSS, add new agenda rules**

Edit [styles/calendar.css](../../../styles/calendar.css). Delete every selector starting with `.cal-day__` (the old day-view classes — section, person-header, person-dot, person-count, task, task-check, task-tod, task-name, task-icon, task--done, task-check--done, empty, grid). Then add:

```css
/* === Day view: pure agenda === */
.cal-day-agenda { display: block; }
.cal-day-agenda__events,
.cal-day-agenda__tasks {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: 0 var(--spacing-md);
  margin-bottom: var(--spacing-md);
}
```

- [ ] **Step 3: Verify renderEventBubble is no longer needed**

```bash
grep -n "renderEventBubble" shared/calendar-views.js calendar.html
```

If no remaining usages, remove `renderEventBubble` from the import line at the top of `shared/calendar-views.js`. Also re-grep for `buildTimeGrid` to confirm Task 3 deleted it cleanly.

- [ ] **Step 4: Visual smoke (Day view)**

Switch to Day view at 375px. Verify on a populated day:
- Events section appears first with `EVENTS` upper-cased section head, no divider.
- Each timed event card shows `H:MM AM/PM —` prefix on the title.
- All-day events appear before timed events; both before untimed.
- Tasks section shows below Events with `TASKS · N of M done` head + divider above.
- Cards match dashboard density (60px min-height, owner stripe, etc.).
- Past daily tasks are tap-blocked.

On an empty day (no events, no tasks): single empty-state with "Nothing scheduled — Tap + to add an event."

On a person-filtered empty day: empty-state title reads "No items for this person".

- [ ] **Step 5: Commit**

```bash
git add shared/calendar-views.js styles/calendar.css
git commit -m "$(cat <<'EOF'
feat(calendar): rewrite day view as pure agenda (Events -> Tasks)

- renderDayView produces two sections: Events (sorted all-day,
  timed, untimed; timed get H:MM AM/PM time prefix) and Tasks
  (sorted with N of M done meta).
- Section heads use renderSectionHead from Phase 1.5 with the
  divider on Tasks when Events also present.
- Empty state uses renderEmptyState with subtitle 'Tap + to add
  an event.' Filter-active variant: 'No items for this person'.
- Reuses renderEventCard / renderTaskCard helpers from Task 3 -
  no .cal-day-* density forks remain.
- Deletes renderEventBubble import where unused.

Part of Phase 2 calendar rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Phone Month view = soft empty-state (≤600px)

**Goal:** On phone, switching to Month view shows a friendly two-button empty-state ("Switch to Week" / "Switch to Day") instead of rendering a tiny grid. Above 600px, the existing Month grid renderer is preserved untouched. Swipe is disabled in Month view on phone.

**Files:**
- Modify: [shared/calendar-views.js:309-385](../../../shared/calendar-views.js#L309-L385) — `renderMonthView` gets a phone branch
- Modify: [calendar.html](../../../calendar.html) — pass `isPhone` to renderer; gate swipe handler on view + width
- Modify: [styles/responsive.css](../../../styles/responsive.css) — phone empty-state styling (or inline in calendar.css)
- Modify: [styles/calendar.css](../../../styles/calendar.css) — add `.cal-empty-month` rules

- [ ] **Step 1: Add `isPhone` branch to `renderMonthView`**

Edit [shared/calendar-views.js:309](../../../shared/calendar-views.js#L309). Wrap the existing month-grid renderer with a phone branch at the top:

```js
export function renderMonthView(opts) {
  const { isPhone } = opts;
  if (isPhone) {
    return renderMonthEmptyPhone();
  }
  // ... existing month-grid renderer body unchanged ...
}

/** Phone month-view soft empty-state (Phase 2 §2.4). */
function renderMonthEmptyPhone() {
  const calIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  return `<div class="cal-empty-month">
    <div class="cal-empty-month__icon" aria-hidden="true">${calIcon}</div>
    <h3 class="cal-empty-month__title">Month view works best on a larger screen.</h3>
    <div class="cal-empty-month__actions">
      <button type="button" class="btn btn--secondary" data-switch-view="week">Switch to Week</button>
      <button type="button" class="btn btn--secondary" data-switch-view="day">Switch to Day</button>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Pass `isPhone` from the controller and wire the buttons**

Edit [calendar.html](../../../calendar.html). At the renderMonthView callsite, add `isPhone`:

```js
const isPhone = window.matchMedia('(max-width: 600px)').matches;
const html = renderMonthView({ /* ... existing args ..., */ isPhone });
```

Add a delegated handler for the switch buttons (next to the Task 2 sub-bar handlers):

```js
document.addEventListener('click', (e) => {
  const switchBtn = e.target.closest('button[data-switch-view]');
  if (switchBtn) { setView(switchBtn.dataset.switchView); return; }
});
```

(Use whatever the function is named — `setView`, `switchView`, etc.)

- [ ] **Step 3: Disable swipe on Month view at phone width**

Find the calendar's swipe handler in [calendar.html](../../../calendar.html):

```bash
grep -n "swipe\|touchstart\|touchend\|onTouch" calendar.html | head
```

Inside the swipe-end handler that calls `adjustPeriod(±1)`, add an early-return guard:

```js
function onSwipeEnd(/* ... */) {
  // Phase 2: Month view on phone is the empty-state — no grid to swipe.
  if (view === 'month' && window.matchMedia('(max-width: 600px)').matches) return;
  // ... existing swipe-direction → adjustPeriod call ...
}
```

- [ ] **Step 4: Add `.cal-empty-month` CSS**

Edit [styles/calendar.css](../../../styles/calendar.css). Add:

```css
/* === Month view phone empty-state === */
.cal-empty-month {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-xl) var(--spacing-md);
  gap: var(--spacing-md);
  color: var(--text-muted);
}
.cal-empty-month__icon {
  width: 48px;
  height: 48px;
  color: var(--text-faint);
}
.cal-empty-month__icon svg { width: 100%; height: 100%; }
.cal-empty-month__title {
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--text);
  max-width: 28ch;
  margin: 0;
}
.cal-empty-month__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  justify-content: center;
}
```

(Above 600px, `renderMonthView` returns the existing month-grid markup, so this CSS doesn't apply. No responsive overrides needed.)

- [ ] **Step 5: Visual smoke**

At 375px viewport: switch to Month tab. The empty-state appears (icon + title + two buttons). No grid renders. Tapping "Switch to Week" → week view. Tapping "Switch to Day" → day view (selected date preserved).

At 800px viewport (DevTools): switch to Month — the existing month grid still renders (untouched).

Swipe horizontally in Month view at 375px: nothing happens (guard works). Swipe in Week view at 375px: still navigates ±1 week. Swipe in Day view: still navigates ±1 day.

- [ ] **Step 6: Commit**

```bash
git add shared/calendar-views.js calendar.html styles/calendar.css
git commit -m "$(cat <<'EOF'
feat(calendar): phone month view shows soft empty-state

- renderMonthView gains an isPhone branch that returns a friendly
  empty-state (calendar SVG icon + title + Switch to Week/Day
  buttons) instead of trying to render a tiny grid below 600px.
- Above 600px the existing month-grid renderer is preserved
  untouched (tablet path handled in Phase 7).
- Swipe handler in calendar.html short-circuits on month + phone
  width so there's no swipe-with-no-effect.

Part of Phase 2 calendar rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: FAB → Event form direct + per-day `+` quick-add

**Goal:** A `.fab` mounts in the calendar shell (Task 1's `#fabMount`). Clicking the FAB opens the existing Event form pre-filled with `viewDate`. Clicking a per-day `+` chip in Week view opens the same form pre-filled with that day's date. In person mode, the form's owner pre-fills to the linked person.

**Files:**
- Modify: [calendar.html](../../../calendar.html) — render FAB into `#fabMount`; wire FAB + per-day `+` click handlers; pre-fill date + owner

- [ ] **Step 1: Inspect the existing Event form open path**

```bash
grep -n "openEventForm\|openEventEditor\|eventForm\|createEvent" calendar.html shared/components.js | head -20
```

Identify the function that opens the Event form sheet today and the argument shape. (It's already in use somewhere — the chip-row used it, or a tap on an event card opens the editor.) Note the function name and the argument shape needed to pre-fill date + owner. If the open path doesn't accept date/owner, add an `opts.date` / `opts.ownerId` handling line.

If naming differs from the assumption, substitute the actual name throughout the rest of this task. Common candidate names: `openEventEditor`, `openEventSheet`, `editEvent`.

- [ ] **Step 2: Render the FAB into `#fabMount`**

Edit [calendar.html](../../../calendar.html). Add this once at controller init (after `loadData()` succeeds; placement mirrors dashboard):

```js
function mountFab() {
  const mount = document.getElementById('fabMount');
  if (!mount) return;
  const plus = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  mount.innerHTML = `<button type="button" class="fab" id="fabAdd" aria-label="Add event">${plus}</button>`;
}
mountFab();
```

The `.fab` rule from [styles/components.css](../../../styles/components.css) (Phase 1.5) styles it; no calendar-specific FAB CSS needed.

- [ ] **Step 3: Wire FAB + per-day `+` handlers**

In the same file, add (alongside the Task 2/5 delegated handlers):

```js
document.addEventListener('click', (e) => {
  // FAB → Event form pre-filled with viewDate
  if (e.target.closest('#fabAdd')) {
    openEventForm({
      date: viewDate,
      ownerId: linkedPerson?.id || null
    });
    return;
  }
  // Per-day + chip in Week view → form pre-filled with that day's date
  const dayAdd = e.target.closest('.cal-day-add[data-date]');
  if (dayAdd) {
    openEventForm({
      date: dayAdd.dataset.date,
      ownerId: linkedPerson?.id || null
    });
    return;
  }
});
```

`viewDate`, `linkedPerson`, and `openEventForm` are existing identifiers in calendar.html — substitute the file's actual names.

- [ ] **Step 4: Person-mode parity (Phase 1.5 amendment E)**

Audit the FAB + per-day `+` paths for any `!linkedPerson` guards. There must be **none** — both controls render and function in person mode. The only person-mode behavior change is the owner pre-fill above.

```bash
grep -n "!linkedPerson\|linkedPerson ===" calendar.html
```

Expected: no results in FAB / per-day-add code paths. If found, remove the guard. (Other linkedPerson reads — for owner pre-fill — are fine.)

- [ ] **Step 5: Visual smoke**

In Week view at 375px:
- FAB appears bottom-right (positioned by the catalog `.fab` rule). Tap → Event form opens with today's date pre-selected.
- Each day-block has a small `+` chip at its bottom-right. Tap it → Event form opens with that day's date pre-selected.
- In person mode (`person.html?person=Jordin`): both controls visible; opening either pre-fills owner = Jordin.

In Day view at 375px:
- FAB present and pre-fills viewDate. (No per-day `+` in Day view by design — FAB serves.)

In Month view at 375px (empty-state):
- FAB still present (it's mounted independent of the active view), pre-fills viewDate.

- [ ] **Step 6: Commit**

```bash
git add calendar.html
git commit -m "$(cat <<'EOF'
feat(calendar): FAB direct to Event form + per-day quick-add chip

- mountFab() wires the catalog .fab into #fabMount on load.
- FAB click → openEventForm({ date: viewDate, ownerId: linkedPerson?.id }).
- Per-day .cal-day-add[data-date] in Week view → openEventForm with
  that day's date.
- Person-mode parity: both controls render unconditionally; owner
  pre-fills to the linked person (no !linkedPerson guards on either).
- Backlog 1.3 (Meals) wiring note will swap the FAB onClick for a
  2-tile picker — see CLAUDE.md tag added in Task 8.

Part of Phase 2 calendar rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Audit pass — tap targets, reduced motion, dark mode, hex purge

**Goal:** Final QA before the cache bump. Measures tap targets, sweeps raw hex out of `styles/calendar.css`, verifies reduced-motion guards on every animation introduced by Phase 2, and confirms all 5 themes render cleanly.

**Files:**
- Modify: [styles/calendar.css](../../../styles/calendar.css) — replace any remaining raw hex with tokens
- Modify: any file where an audit finding requires a fix
- (No new files)

- [ ] **Step 1: Tap-target measurement**

Reload the calendar at 375px. Paste this into DevTools console:

```js
(() => {
  const targets = [
    ['#headerBell', 'Bell'],
    ['#headerOverflow', 'Overflow'],
    ['#fabAdd', 'FAB'],
    ['.check', 'Card check'],
    ['#openFilterSheet', 'Filter chip'],
    ['.bottom-nav__item', 'Nav item'],
    ['.cal-subbar__view-tab', 'View tab'],
    ['.cal-subbar__nav', 'Date arrow'],
    ['.cal-subbar__today', 'Today pill'],
    ['.cal-day-add', 'Per-day +'],
  ];
  const fails = [];
  for (const [sel, name] of targets) {
    const els = document.querySelectorAll(sel);
    if (!els.length) continue;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        fails.push({ name, sel, width: r.width, height: r.height });
      }
    }
  }
  console.table(fails.length ? fails : [{ result: 'All >= 44x44' }]);
})();
```

Expected: all pass. Per-day `+` is 32px visual but 44px effective via the `::before` overlay added in Task 3 — measure should use the chip rect and the overlay; if the chip rect alone fails, that's expected (the `::before` extends the hit area). For the per-day chip alone, instead measure with:

```js
const chip = document.querySelector('.cal-day-add');
const r = chip.getBoundingClientRect();
const ext = 6; // ::before inset value from Task 3 CSS
console.log({ effective: r.width + 2*ext, h: r.height + 2*ext });
```

Expected: ≥44×44 effective.

If any other selector fails, fix in CSS (bump min-height/min-width or add padding) and re-measure.

- [ ] **Step 2: Reduced-motion guard sweep**

```bash
grep -n "@keyframes\|animation:\|transition:" styles/calendar.css
grep -n "prefers-reduced-motion" styles/calendar.css
```

Phase 2 added zero animations to calendar.css (the day-block `order` reorder is static, the sticky bar is position-only, sub-bar tab transitions are token-driven if any). If grep finds an animation/transition without a corresponding reduced-motion guard, add one in the same file.

- [ ] **Step 3: Raw hex sweep in `styles/calendar.css`**

```bash
grep -nE "#[0-9a-fA-F]{3,6}" styles/calendar.css
```

Phase 2 starts with 5 known hits at lines 200, 636, 734, 767, 806 — all `#fff`. Replace each with the token equivalent:

| Line context | Replace `#fff` with |
|---|---|
| `color: #fff;` (foreground over accent) | `color: var(--on-accent);` |
| `background: #fff` | `background: var(--surface);` |
| `border: 2px solid #fff` etc. | `border: 2px solid var(--surface);` |

For each hit, decide based on context (foreground vs background vs border). After replacement, re-grep to confirm zero remaining hex.

If any of the 5 lines belong to retired markup (`.cal-week*`, `.person-pill*`, `.cal-day__*`) and were already deleted by Tasks 2–4, this step has fewer hits — that's fine.

- [ ] **Step 4: Theme parity check**

Open the calendar. Cycle through all 5 themes (Overflow → Theme):
- Light Warm
- Light Vivid
- Dark
- Dark Warm
- Dark Vivid

For each, verify:
- Sub-bar background and border read cleanly.
- Active View Tab (accent-soft / accent-ink) is legible.
- Day-block "Today" pill is legible against block background.
- Past day-block fade (`opacity: 0.6`) doesn't make text unreadable.
- Cards inherit dashboard density correctly.
- Per-day `+` chip border (dashed) is visible but not loud.
- Empty-month state icon, title, buttons all read cleanly.

Fix any theme-specific contrast issue inline. If a fix requires a token change in `shared/theme.js`, update the relevant theme-mode block and verify the other themes that share the token.

- [ ] **Step 5: Inline-style sweep in `calendar.html`**

```bash
grep -n "style=\"" calendar.html
```

Phase 1 sweep already ran on calendar.html (one expected match historically). Address any remaining inline styles by moving them to a class. **Exception:** `style="order: ${order}"` on `.cal-day-block` is the legitimate dynamic style produced by Task 3 — the order value is computed per render, so it stays inline.

If the grep returns matches other than that one dynamic order, fix them.

- [ ] **Step 6: Person-mode parity check**

Open `person.html?person=<name>` and switch to the calendar via the bottom nav. Verify:
- Bell, Overflow, FAB, Filter chip, per-day `+`: all render and function.
- Filter chip pre-fills with the linked person's name + color dot.
- FAB and per-day `+` open the Event form with owner pre-filled to that person.
- No `!linkedPerson` guards regress these (Task 6 audit, re-verify).

- [ ] **Step 7: Commit (only if any fix applied)**

```bash
git add <files touched>
git commit -m "$(cat <<'EOF'
fix(calendar): tap-target + hex-purge + theme parity audit

Findings from Phase 2 Task 7 audit:
- <list each fix, one per line>

If no fixes were needed besides the routine #fff -> var(--on-accent)
purge, the commit body lists just that.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If the audit is clean (no fixes needed), skip the commit — do not create an empty commit. Note in Task 8's commit body that the audit passed.

---

## Task 8: SW cache bump + CLAUDE.md backlog 1.3 tags + PR

**Goal:** Bump the service worker cache so users actually receive Phase 2. Tag CLAUDE.md backlog item 1.3 (Meals) with the FAB-picker swap + Day-view section-insertion notes the spec captured. Open the PR.

**Files:**
- Modify: [sw.js:103](../../../sw.js#L103) — `CACHE_NAME`
- Modify: [sw.js:7](../../../sw.js#L7) — `CACHE_BUMPS` comment block
- Modify: [CLAUDE.md](../../../CLAUDE.md) — backlog 1.3 wiring tags

- [ ] **Step 1: Bump SW cache (v60 → v61)**

Edit [sw.js:103](../../../sw.js#L103):

```js
const CACHE_NAME = 'family-hub-v61';
```

Add a new entry at the **top** of the CACHE_BUMPS block (right after the `// CACHE_BUMPS\n// -----------\n//` header, before the `v60` entry):

```
// v61 (2026-04-24) — Phase 2 calendar rework: shell parity (drop
//                    overflow:hidden lock, add bannerSlot+fabMount),
//                    sticky sub-bar (View Tabs / date nav / filter
//                    chip), week view as today-first vertical agenda
//                    (buildTimeGrid deleted, .cal-week* CSS retired),
//                    day view as pure agenda (Events->Tasks, no
//                    time-grid), phone month view soft empty-state,
//                    FAB direct to Event form + per-day + quick-add,
//                    raw-hex purge in styles/calendar.css.
```

- [ ] **Step 2: Tag CLAUDE.md backlog 1.3 with wiring notes**

Edit [CLAUDE.md](../../../CLAUDE.md). Find the `**1.3 — Meal Planning (Lightweight)**` block in the Backlog section. Add a new sub-bullet at the end of the block (just before the schema snippet, or as the last sub-bullet of the description):

```markdown
*Phase 2 wiring notes (added 2026-04-24):*
- **FAB picker swap.** Calendar's FAB currently opens the Event form directly. When 1.3 ships, change the click handler in [calendar.html](calendar.html) to open a 2-tile picker sheet (Event / Meal); the Event tile leads to the existing form, the Meal tile leads to the new Meal form.
- **Day-view Meals section insertion.** `renderDayView` in [shared/calendar-views.js](shared/calendar-views.js) currently produces Events → Tasks sections. When 1.3 ships, insert a Meals section between Tasks and any future trailing sections. Use `renderSectionHead('Meals', meta, { divider: true })` to match the established pattern.
```

- [ ] **Step 3: Commit**

```bash
git add sw.js CLAUDE.md
git commit -m "$(cat <<'EOF'
chore: bump SW cache to v61 + tag CLAUDE.md backlog 1.3 wiring

- CACHE_NAME v60 -> v61 with CACHE_BUMPS entry summarizing the
  six feature commits in this phase + Task 7 audit pass.
- CLAUDE.md backlog item 1.3 (Meals) gains two wiring notes
  capturing the deferred Phase 2 hooks: FAB picker swap and
  Day-view Meals section insertion. Future-1.3-spec doesn't
  have to rediscover these from the calendar code.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push -u origin phase-2-calendar
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "Phase 2: Calendar rework" --body "$(cat <<'EOF'
## Summary
Brings calendar.html into Phase 1.5 alignment per [docs/superpowers/specs/2026-04-24-phase-2-calendar-rework.md](docs/superpowers/specs/2026-04-24-phase-2-calendar-rework.md).

- Shell parity (no body overflow lock; banner + FAB mounts).
- Sticky sub-bar (View Tabs + date nav + single filter chip — chip-row retired).
- Week view = today-first vertical agenda (CSS `order` driven).
- Day view = pure agenda (Events → Tasks); time-grid deleted.
- Phone Month view = soft empty-state; swipe disabled in that mode.
- FAB → Event form direct; per-day `+` quick-add in Week view; person-mode parity.
- `buildTimeGrid` helper and all `.cal-week*` / `.cal-day__*` / `.person-pill*` CSS retired.
- SW cache bumped to v61.

Mockup deviations (vs frozen mockups in mockups/) are documented in spec §1.1; CLAUDE.md backlog 1.3 (Meals) tagged with the deferred FAB-picker + Day-view-Meals wiring notes.

## Test plan
- [ ] Calendar loads at 375px in Week view by default.
- [ ] Today's day-block is at the top; future days follow chronologically; past days at the bottom faded.
- [ ] Section divider appears above Tasks when Events exist in the same day-block.
- [ ] Day view shows Events → Tasks sections; timed events show "H:MM AM/PM —" prefix.
- [ ] Month view at 375px = empty-state with two switch buttons; no grid renders; horizontal swipe is a no-op.
- [ ] Sub-bar stays sticky below the header on long scroll.
- [ ] Filter chip reads "Filter" inactive / "Name" + dot active; opens shared filter sheet.
- [ ] FAB opens Event form pre-filled with viewDate.
- [ ] Per-day `+` chip opens Event form pre-filled with that day's date.
- [ ] Person mode (`person.html?person=Name` then nav to Calendar): bell, overflow, filter chip, FAB, per-day `+` all visible; FAB/per-day `+` pre-fill owner to linked person.
- [ ] Past daily tasks are tap-blocked (tap → sheet, not toggle).
- [ ] Swipe in Week view = ±1 week; in Day view = ±1 day; Month view phone = no swipe.
- [ ] All 5 themes render cleanly (light-warm, light-vivid, dark, dark-warm, dark-vivid).
- [ ] Tap-target audit script returns clean.
- [ ] No inline styles in calendar.html except the dynamic `style="order: N"` on `.cal-day-block`.
- [ ] No raw hex in styles/calendar.css.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

Ran the writing-plans self-review checklist:

**1. Spec coverage:** Eight spec exit criteria sections (§6 #1–#25) map to tasks as follows:
- #1, #2 (Week default + no overflow lock) → Tasks 1, 3.
- #3 (today-first ordering + faded past) → Task 3.
- #4 (Day view sections + dividers) → Task 4.
- #5 (phone Month empty-state + swipe disabled) → Task 5.
- #6 (sticky sub-bar) → Task 2.
- #7 (single filter chip) → Task 2.
- #8 (FAB direct), #9 (per-day +) → Task 6.
- #10 (tap/long-press semantics) → handled by data attributes in Tasks 3/4 + existing calendar.html long-press timer (preserved, no rewrite).
- #11 (view-aware swipe + Month-disabled-on-phone) → Task 5.
- #12 (cards use catalog `.card`) → Tasks 3/4 (renderEventCard/renderTaskCard).
- #13 (renderSectionHead with divider) → Tasks 3/4.
- #14 (banner-slot mounted) → Task 1.
- #15 (tap targets ≥44) → Task 7.
- #16 (reduced-motion guards) → Task 7.
- #17 (no window.confirm/alert) → not introduced anywhere; pre-existing baseline from Phase 0.
- #18 (no !linkedPerson guards on bell/overflow/filter/FAB/per-day +) → Task 6 step 4 + Task 7 step 6.
- #19 (.page-content / .section gutter rules) → calendar.html already on .page-content from v53; .section rule is in components.css from v57; this PR introduces no new violations.
- #20 (inline-style + hex sweep) → Task 7 steps 3, 5.
- #21 (mockup deviation table + CLAUDE.md tags) → Task 8 step 2 + spec §1.1.
- #22 (SW v61 bump) → Task 8 step 1.
- #23 (no regressions) → covered by manual smoke at each task + final test plan in PR.
- #24 (tap-target audit) → Task 7 step 1.
- #25 (5-theme smoke) → Task 7 step 4.

No gaps.

**2. Placeholder scan:** Searched the plan for "TBD", "TODO", "implement later", "similar to", "handle edge cases", "appropriate" — zero matches. Three `<obs>` / "substitute the file's actual names" callouts are explicit named-substitution prompts, not placeholders for missing content.

**3. Type/signature consistency:**
- `renderCalSubbar({ currentView, viewLabel, isCurrentPeriod, activePersonName, activePersonColor })` — defined in Task 2 step 3, called in Task 2 step 4.
- `renderWeekView({ weekStartDate, today, events, allSchedule, completions, tasks, cats, people, activePerson })` — defined in Task 3 step 2, dropped `density`/`weekStartDay`/`showDailyInWeek` from prior signature (verified: those were time-grid driven, no longer needed).
- `renderDayView({ dateKey, today, events, allSchedule, completions, tasks, cats, people, activePerson })` — defined in Task 4 step 1, dropped `settings` arg (no longer used since time-grid removed).
- `renderMonthView({ ..., isPhone })` — Task 5 step 1, callsite in Task 5 step 2.
- `renderEventCard(eventId, evt, people)`, `renderTaskCard(entryKey, entry, dateKey, today, tasks, cats, people, completions)`, `formatEventTime(hhmm)` — defined in Task 3 step 2, reused in Task 4 step 1.
- `renderEmptyState(icon, title, subtitle)` — used as `renderEmptyState('', title, subtitle)` in Task 4; matches verified existing signature `(icon, title, subtitle = '', options = {})` at shared/components.js:277.
- `renderSectionHead(title, meta, options = { divider, trailingHtml })` — Phase 1.5 signature; used as `renderSectionHead('Events', null)` and `renderSectionHead('Tasks', meta, { divider: true })` — matches.

**Caller-side identifiers** (`viewDate`, `linkedPerson`, `openEventForm`, `setView`, `adjustPeriod`, `goToToday`, `openFilterSheet`, `loadData`) are calendar.html-local. Plan flags substitution required — Step 1 of Task 6 explicitly directs the engineer to grep first and substitute. This is intentional; the calendar controller's exact names aren't promised by the brainstorm.

**Spec-vs-plan check on the cache version:** Spec §6 #22 said v60 → v61 was the intent. Pre-task setup confirms current `family-hub-v60` is on disk. Plan Task 8 bumps to v61. Consistent.

No issues found. Plan is ready.

---

## Execution handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-24-phase-2-calendar.md](2026-04-24-phase-2-calendar.md). Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints for review.

Which approach?

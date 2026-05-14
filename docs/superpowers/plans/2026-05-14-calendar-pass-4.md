# Calendar Pass 4 — Skylight-style visual rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Make the calendar look like a calendar, not a task list. Match the visual DNA of Skylight / Google Calendar Material 3 / Apple iOS 18: full-color event blocks, persistent avatar filter, chronological agenda as the default mobile view, de-tasked grids.

**Research:** [Skylight + competitor research summary](#) — captured the consensus that mobile family calendars need (1) one color per person used as fill, (2) persistent avatar filter, (3) agenda as default mobile view, (4) variable month density, (5) color-block events not text-with-borders.

**Sequencing (5 tasks):**

1. **Agenda view, make it the default** — new chronological list with person-color blocks. Replaces Week as the default for new users. (This task)
2. **Solid color-fill event blocks** — port the new visual treatment to week + day grid pills.
3. **Persistent avatar strip filter** — replace person chip row with always-visible avatars.
4. **De-task week + month views** — calendar is events-first. Tasks stay on day view (secondary section) and Dashboard.
5. **Month-view density toggle** — Compact (dots) ↔ Stacked (titles). Apple pattern.

This document specs Task 1 in detail. Tasks 2-5 get their own plans when ready (lets each pass incorporate live feedback from prior).

---

## Task 1: Agenda view (new default for mobile)

**Files (4):**
- `shared/calendar-views.js` — add `renderAgendaView` helper; add `formatTimeRange` import if not present
- `calendar.html` — add `agenda` to currentView state; default to 'agenda' when no pref; render the new view; segmented switcher gains "Agenda" as the first option
- `styles/calendar.css` — agenda list + event card styles
- `sw.js` — bump cache (currently v303; verify)

### Step 1: `shared/calendar-views.js` — add `renderAgendaView`

At the END of `shared/calendar-views.js` (after `renderCalendarNav`), ADD:

```js
/**
 * Render the agenda view — a chronological scrollable list of upcoming events.
 * - Range: from today through addDays(today, 60). Empty days hidden.
 * - Each event renders as a card: time | name | location (if any) with a fat
 *   person-color left stripe and a tinted background.
 * - Date headers group events by day; today gets a "Today" pill.
 * - Tap an event → opens the event detail sheet (handled by the existing
 *   delegated event-gesture listener that looks for [data-event-id]).
 *
 * @param {object} opts - { today, events, people, activePerson }
 */
export function renderAgendaView(opts) {
  const { today, events, people, activePerson } = opts;

  // 60-day forward window. Anything past that won't show — user can switch to
  // week/month for far-future browsing.
  const rangeEnd = addDays(today, 60);

  // getEventsForRange returns a map keyed by id (or virtual id for repeats);
  // each value has a date field. Use the date from the (possibly virtual) entry.
  // Note: getEventsForRange is imported via state.js — already in this file.
  const inRange = filterEventsByPerson(
    Object.fromEntries(
      Object.entries(events).filter(([, e]) => {
        const endDate = e.endDate || e.date;
        return e.date <= rangeEnd && endDate >= today;
      })
    ),
    activePerson
  );

  // Expand recurring + multi-day occurrences in the window.
  // Direct call to expandEventRepeats would create circular import; use
  // state.getEventsForRange which already handles both.
  // We re-import below to avoid the indirection cost.
  // (Implementer note: import getEventsForRange + filterEventsByPerson at top
  // of this file as needed.)

  const expandedMap = getEventsForRange(events, today, rangeEnd, addDays);
  const expanded = filterEventsByPerson(expandedMap, activePerson);

  // Group by date.
  const byDate = new Map();
  for (const [id, evt] of Object.entries(expanded)) {
    // For multi-day events, surface them on every spanned day so a 3-day camp
    // shows under Mon, Tue, Wed. getEventsForRange already returns the same
    // event once per overlap range; we need to fan out across spanned dates
    // explicitly for agenda.
    const startDate = evt.date < today ? today : evt.date;
    const endDate = evt.endDate || evt.date;
    const finalEnd = endDate > rangeEnd ? rangeEnd : endDate;
    let cur = startDate;
    while (cur <= finalEnd) {
      if (!byDate.has(cur)) byDate.set(cur, []);
      byDate.get(cur).push([id, evt]);
      cur = addDays(cur, 1);
    }
  }

  // Sort each day chronologically.
  for (const [, items] of byDate) {
    items.sort(([, a], [, b]) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }

  // Render sorted date groups.
  const sortedDates = Array.from(byDate.keys()).sort();
  if (sortedDates.length === 0) {
    return `<div class="cal-agenda"><div class="cal-agenda__empty">
      <div class="cal-agenda__empty-icon">📅</div>
      <div class="cal-agenda__empty-title">Nothing on the calendar</div>
      <div class="cal-agenda__empty-body">Events in the next 60 days will appear here.</div>
    </div></div>`;
  }

  let html = `<div class="cal-agenda">`;
  for (const dk of sortedDates) {
    const items = byDate.get(dk);
    const d = new Date(`${dk}T00:00:00Z`);
    const monthName = MONTH_NAMES[d.getUTCMonth()];
    const dayNum = d.getUTCDate();
    const dowName = DAY_NAMES_FULL[d.getUTCDay()];
    const todayPill = dk === today ? ` <span class="cal-agenda__today-pill">Today</span>` : '';
    html += `<div class="cal-agenda__date" data-date="${esc(dk)}">
      <span class="cal-agenda__date-dow">${dowName}</span>
      <span class="cal-agenda__date-num">${monthName} ${dayNum}</span>
      ${todayPill}
    </div>`;
    for (const [id, evt] of items) {
      html += renderAgendaEvent(id, evt, people);
    }
  }
  html += `</div>`;
  return html;
}

function renderAgendaEvent(id, event, people) {
  const personColor = event.color
    || (people.find(p => event.people?.includes(p.id))?.color)
    || '#5b7fd6';
  const isMulti = (event.people || []).length > 1;
  const otherColors = isMulti
    ? (event.people || [])
        .map(pid => people.find(p => p.id === pid)?.color)
        .filter(Boolean)
    : [];

  let timeStr;
  if (event.allDay) timeStr = 'All day';
  else if (event.startTime && event.endTime) timeStr = `${event.startTime} – ${event.endTime}`;
  else if (event.startTime) timeStr = event.startTime;
  else timeStr = '';

  // Multi-day badge for events that span more than one day
  const startDate = event.date;
  const endDate = event.endDate || event.date;
  const spans = endDate > startDate;
  const spanBadge = spans ? `<span class="cal-agenda__event-span">${esc(startDate)} – ${esc(endDate)}</span>` : '';

  const peopleBadges = isMulti
    ? `<div class="cal-agenda__event-people">${otherColors.map(c => `<span class="cal-agenda__event-dot" data-bg-color="${esc(c)}"></span>`).join('')}</div>`
    : '';

  return `<button class="cal-agenda__event" data-event-id="${esc(id)}" data-bg-color="${esc(personColor)}" type="button">
    <div class="cal-agenda__event-time">${esc(timeStr)}</div>
    <div class="cal-agenda__event-body">
      <div class="cal-agenda__event-name">${esc(event.name || 'Untitled event')}</div>
      ${event.location ? `<div class="cal-agenda__event-loc">${esc(event.location)}</div>` : ''}
      ${spanBadge}
    </div>
    ${peopleBadges}
  </button>`;
}
```

Imports needed at top of file:
- `getEventsForRange` — likely already imported from state.js. If not, add.

### Step 2: `calendar.html` — wire `agenda` view

Find where `currentView` is initialized (around the loadData/init section). The current logic likely reads from `calPrefs.defaultView` or falls back to 'week'. Change the fallback to 'agenda':

Search for `currentView =`. The init likely looks like:

```js
let currentView = calPrefs.defaultView || 'week';
```

CHANGE to:

```js
let currentView = calPrefs.defaultView || 'agenda';
```

Find the view-rendering switch (around line ~225 where `currentView === 'week'` branches). Add a branch for agenda BEFORE the others (so it's the default-feeling option):

```js
if (currentView === 'agenda') {
  html += renderAgendaView({
    today, events, people, activePerson,
  });
} else if (currentView === 'week') {
  // ...existing week branch
} else if (currentView === 'month') {
  // ...existing month branch
} else {
  // ...existing day branch
}
```

Make sure `renderAgendaView` is imported at the top:

```js
import { renderWeekView, renderDayView, renderMonthView, renderCalendarNav, renderAgendaView } from './shared/calendar-views.js';
```

### Step 3: `calendar.html` — segmented switcher gets "Agenda" as the first option

In `renderCalendarNav` in calendar-views.js (around the segmented control we built in Pass 2):

```js
<div class="segmented-control cal-nav__view-seg" role="tablist" aria-label="View">
  <button class="segmented-btn${currentView === 'week'  ? ' segmented-btn--active' : ''}" data-cal-view="week"  type="button" role="tab">Week</button>
  <button class="segmented-btn${currentView === 'month' ? ' segmented-btn--active' : ''}" data-cal-view="month" type="button" role="tab">Month</button>
  <button class="segmented-btn${currentView === 'day'   ? ' segmented-btn--active' : ''}" data-cal-view="day"   type="button" role="tab">Day</button>
</div>
```

REPLACE with (4 options, Agenda first):

```js
<div class="segmented-control cal-nav__view-seg" role="tablist" aria-label="View">
  <button class="segmented-btn${currentView === 'agenda' ? ' segmented-btn--active' : ''}" data-cal-view="agenda" type="button" role="tab">Agenda</button>
  <button class="segmented-btn${currentView === 'week'   ? ' segmented-btn--active' : ''}" data-cal-view="week"   type="button" role="tab">Week</button>
  <button class="segmented-btn${currentView === 'month'  ? ' segmented-btn--active' : ''}" data-cal-view="month"  type="button" role="tab">Month</button>
  <button class="segmented-btn${currentView === 'day'    ? ' segmented-btn--active' : ''}" data-cal-view="day"    type="button" role="tab">Day</button>
</div>
```

### Step 4: `calendar.html` — header subtitle / title for agenda view

In the `render()` function where `navLabel` and `navSubtitle` are computed (Pass 1 Task 4 added these), add a branch for agenda. The agenda view doesn't have a "period" — show "Next 60 days" or similar:

Find the nav-label computation. Add:

```js
if (currentView === 'agenda') {
  navLabel = 'Upcoming';
  navSubtitle = '';
  isCurrentPeriod = true; // no prev/next concept for agenda
}
```

(Adjust to match the existing variable names in the render function.)

For the prev/next buttons: in agenda view they don't navigate periods. Hide them or no-op them. Simplest: hide via CSS class on the nav.

If hiding via CSS is too involved, just no-op the click handlers when in agenda view — clicking does nothing. Acceptable for v1.

Actually cleanest: add a class to `.cal-nav` when in agenda mode, and CSS hides prev/next. Set in render() before mounting:

```js
const navHtml = renderCalendarNav({ ...opts, navMode: currentView === 'agenda' ? 'agenda' : 'period' });
```

Then in `renderCalendarNav` accept `navMode` and add a class:

```js
return `<div class="cal-nav${navMode === 'agenda' ? ' cal-nav--agenda' : ''}">...`;
```

CSS: `.cal-nav--agenda .date-nav__btn { visibility: hidden; }` — keeps layout, hides controls.

### Step 5: `styles/calendar.css` — agenda styles

At the END of `styles/calendar.css`, append:

```css
/* ── Agenda view (Pass 4 — Task 1) ── */
.cal-agenda {
  padding: var(--spacing-sm) 0 calc(var(--nav-height) + var(--spacing-lg));
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.cal-agenda__empty {
  padding: var(--spacing-xl) var(--spacing-md);
  text-align: center;
  color: var(--text-muted);
}

.cal-agenda__empty-icon {
  font-size: 2.5rem;
  margin-bottom: var(--spacing-sm);
}

.cal-agenda__empty-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.cal-agenda__empty-body {
  font-size: var(--font-sm);
  color: var(--text-muted);
}

.cal-agenda__date {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-xs) var(--spacing-xs);
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 2;
}

.cal-agenda__date:first-child {
  padding-top: var(--spacing-xs);
}

.cal-agenda__date-dow {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--text);
}

.cal-agenda__date-num {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.cal-agenda__today-pill {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--on-accent);
  background: var(--accent);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.cal-agenda__event {
  display: flex;
  align-items: stretch;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: color-mix(in srgb, var(--bg-color, var(--accent)) 16%, var(--surface));
  border: none;
  border-left: 5px solid var(--bg-color, var(--accent));
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  font: inherit;
  margin: 0 var(--spacing-xs);
  min-height: 56px;
}

.cal-agenda__event:hover,
.cal-agenda__event:focus-visible {
  background: color-mix(in srgb, var(--bg-color, var(--accent)) 24%, var(--surface));
  outline: none;
}

.cal-agenda__event-time {
  flex-shrink: 0;
  width: 64px;
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  padding-top: 3px;
}

.cal-agenda__event-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cal-agenda__event-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-agenda__event-loc,
.cal-agenda__event-span {
  font-size: var(--font-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-agenda__event-people {
  display: flex;
  gap: 3px;
  align-items: center;
  flex-shrink: 0;
}

.cal-agenda__event-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-color, var(--accent));
  border: 1px solid var(--surface);
}

/* Hide prev/next in agenda mode (no period concept) */
.cal-nav--agenda .date-nav__btn {
  visibility: hidden;
}
```

### Step 6: `calendar.html` — add agenda branch in view-switcher click handler

The view-switcher click handler from Pass 2 Task 2:

```js
document.querySelectorAll('.cal-nav__view-seg [data-cal-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.calView;
    if (view === currentView) return;
    currentView = view;
    if (currentView === 'day') viewDay = today;
    saveCalPrefs();
    render();
  });
});
```

No change needed — `'agenda'` flows through automatically. The `if (currentView === 'day')` branch stays since agenda doesn't need a default-date adjustment.

### Step 7: `sw.js` — bump cache

Find `const CACHE_NAME = 'family-hub-v303'` and change to v304.

**Commit:**

```bash
git add shared/calendar-views.js calendar.html styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): agenda view (new default for mobile)

Adds a chronological scrollable list of upcoming events for the
next 60 days. Each event is a card with a 5px owner-color left
stripe, tinted background derived from the owner color, time on
the left, event name + optional location on the right. Date
headers group by day with a 'Today' pill for the current date.

Multi-day events appear on every spanned day (not just the start).
Recurring events expand via the existing getEventsForRange/
expandEventRepeats path. Empty state shows a friendly message.

New view added as 'Agenda' in the segmented switcher (first option).
Default view for new users (existing users keep their saved
preference). Prev/next nav buttons hide in agenda mode since
there's no period to navigate.

This is the first of 5 visual-rebuild tasks (Pass 4). Color-block
events on week/day grids, persistent avatar strip, de-tasked
grids, and month density modes are coming in follow-up tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Self-review checklist:**
- 4 files modified
- `renderAgendaView` exported, uses existing `getEventsForRange` (Pass 1 + Pass 3 paths handle recurring + multi-day)
- Multi-day events fanned across all spanned days in the agenda
- Sort within day: all-day first, then by startTime
- Empty state when no events in 60-day window
- Date headers sticky (mobile)
- Event cards use `data-event-id` so existing delegated event-gesture handler (Pass 2 Task 3) opens detail on tap
- Hover/focus state increases tint slightly
- Person dots for multi-person events
- Default view falls back to 'agenda' (was 'week')
- Cache bumped v303 → v304

**Report:**
- DONE — commit SHA
- DONE_WITH_CONCERNS — flag them
- NEEDS_CONTEXT
- BLOCKED

Under 150 words.

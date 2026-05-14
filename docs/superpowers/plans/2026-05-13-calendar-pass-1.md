# Calendar Pass 1 — Fix the embarrassments

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Stop the calendar from feeling half-finished. Render recurring events. Fix the documented task order in day view. Replace native checkboxes with buttons. Add three small navigation affordances (back arrow, date jump, range subtitle). Drop the wrong-page CSS import and a stray `console.log`.

**Files touched:**
- `shared/state.js` — new `expandRepeats(events, startDate, endDate, addDaysFn)` helper; `getEventsForDate` and `getEventsForRange` now accept optional `[startDate, endDate]` for expansion
- `shared/calendar-views.js` — day view uses `groupByFrequency`; week view checkbox → button + enforce `maxPills`
- `calendar.html` — drop dashboard.css import; remove console.log; back-arrow icon; tap-to-date-jump on month title; add range subtitle; pass expansion range to view renderers
- `sw.js` — cache bumps per task

**Commits:** 5 (4 feature + 1 docs).

---

## Task 1: Render recurring events

**Files:**
- `shared/state.js` — add `expandRepeats` helper; update `getEventsForDate` + `getEventsForRange`
- `shared/calendar-views.js` — pass range into the getter calls (small adjustment)
- `calendar.html` — wherever the views call event getters, pass the visible date range
- `sw.js` — bump cache

**Why:** [calendar.html:1164](../../../calendar.html#L1164) saves a `repeat` field on events. The `openRepeatSubsheet` UI lets users pick daily/weekly/monthly/yearly/custom rules with end-after-N or end-on-date. But [shared/state.js:282-322](../../../shared/state.js#L282) only matches `event.date === dateKey` — recurring events appear only on their first occurrence. The schema, form, and UI all exist; only the renderer-side expansion is missing.

### Repeat rule shape (already exists)

```js
{
  type: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom',
  days: ['S','M','T','W','Th','F','Sa'], // weekly subset
  every: N,                                // for custom
  unit: 'days' | 'weeks' | 'months' | 'years', // for custom
  end: {
    type: 'never' | 'date' | 'count',
    date: 'YYYY-MM-DD',
    count: N
  }
}
```

### Step 1: Add `expandRepeats` to state.js

In [shared/state.js](../../../shared/state.js), AFTER `getEventsForRange` (around line 323), ADD:

```js
/**
 * Expand a single event's repeat rule into individual occurrences within
 * the [startDate, endDate] range. Each occurrence is a virtual event copy
 * carrying the parent event's data plus the occurrence date.
 *
 * The parent event itself (on event.date) is always included if it falls
 * in the range — repeats add only subsequent occurrences.
 *
 * @param {object} event - { date, repeat?, ... }
 * @param {string} eventId
 * @param {string} startDate - YYYY-MM-DD inclusive
 * @param {string} endDate - YYYY-MM-DD inclusive
 * @param {function} addDaysFn - util.addDays (passed in to keep state.js pure)
 * @returns {Array<[string, object]>} array of [virtualId, virtualEvent] pairs
 */
export function expandEventRepeats(event, eventId, startDate, endDate, addDaysFn) {
  const out = [];
  if (!event || !event.date) return out;

  const rule = event.repeat;
  // Always include the original occurrence if in range
  if (event.date >= startDate && event.date <= endDate) {
    out.push([eventId, event]);
  }

  if (!rule || rule.type === 'none' || !rule.type) return out;

  // End conditions
  const endType = rule.end?.type || 'never';
  const endDateRule = rule.end?.date || null;
  const endCount = rule.end?.count || null;

  // Iteration helpers
  const DOW = ['S', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  const dateToDOW = (dateKey) => {
    const d = new Date(`${dateKey}T00:00:00Z`);
    return DOW[d.getUTCDay()];
  };

  let cur = event.date;
  let occurrences = 1; // counts the original
  let safety = 0;
  while (safety++ < 5000) {
    let next;
    if (rule.type === 'daily') {
      next = addDaysFn(cur, 1);
    } else if (rule.type === 'weekly') {
      // If specific days picked, find next matching day within next 7 days;
      // else add 7 days.
      const days = rule.days && rule.days.length > 0 ? new Set(rule.days) : null;
      if (days) {
        let probe = cur;
        for (let i = 0; i < 7; i++) {
          probe = addDaysFn(probe, 1);
          if (days.has(dateToDOW(probe))) { next = probe; break; }
        }
        if (!next) next = addDaysFn(cur, 7);
      } else {
        next = addDaysFn(cur, 7);
      }
    } else if (rule.type === 'monthly') {
      // Same day-of-month as event.date; skip if month doesn't have it
      const [, , dayStr] = cur.split('-');
      const targetDay = parseInt(dayStr, 10);
      const d = new Date(`${cur}T00:00:00Z`);
      const probe = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, targetDay));
      next = probe.toISOString().slice(0, 10);
    } else if (rule.type === 'yearly') {
      const d = new Date(`${cur}T00:00:00Z`);
      const probe = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
      next = probe.toISOString().slice(0, 10);
    } else if (rule.type === 'custom') {
      const every = rule.every || 1;
      const unit = rule.unit || 'days';
      if (unit === 'days') {
        next = addDaysFn(cur, every);
      } else if (unit === 'weeks') {
        next = addDaysFn(cur, every * 7);
      } else if (unit === 'months') {
        const d = new Date(`${cur}T00:00:00Z`);
        const probe = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + every, d.getUTCDate()));
        next = probe.toISOString().slice(0, 10);
      } else if (unit === 'years') {
        const d = new Date(`${cur}T00:00:00Z`);
        const probe = new Date(Date.UTC(d.getUTCFullYear() + every, d.getUTCMonth(), d.getUTCDate()));
        next = probe.toISOString().slice(0, 10);
      } else {
        break;
      }
    } else {
      break;
    }

    if (!next || next <= cur) break;
    cur = next;

    // Stop conditions
    if (cur > endDate) break;
    if (endType === 'date' && endDateRule && cur > endDateRule) break;
    occurrences += 1;
    if (endType === 'count' && endCount && occurrences > endCount) break;

    if (cur >= startDate && cur <= endDate) {
      // Virtual event — same data, different date. ID gets a suffix.
      const virtual = { ...event, date: cur };
      out.push([`${eventId}__rpt_${cur}`, virtual]);
    }
  }
  return out;
}
```

### Step 2: Update `getEventsForDate` to accept expansion

Replace:

```js
export function getEventsForDate(events, dateKey) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.date === dateKey) {
      result[id] = event;
    }
  }
  return result;
}
```

With:

```js
export function getEventsForDate(events, dateKey, addDaysFn = null) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.date === dateKey) {
      result[id] = event;
      continue;
    }
    // If a repeat rule exists and the caller provided addDaysFn, expand and check.
    if (event.repeat && event.repeat.type && event.repeat.type !== 'none' && addDaysFn) {
      const occurrences = expandEventRepeats(event, id, dateKey, dateKey, addDaysFn);
      for (const [vid, vev] of occurrences) {
        result[vid] = vev;
      }
    }
  }
  return result;
}
```

### Step 3: Update `getEventsForRange` to accept expansion

Replace:

```js
export function getEventsForRange(events, startKey, endKey) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.date >= startKey && event.date <= endKey) {
      result[id] = event;
    }
  }
  return result;
}
```

With:

```js
export function getEventsForRange(events, startKey, endKey, addDaysFn = null) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.date >= startKey && event.date <= endKey) {
      result[id] = event;
    }
    if (event.repeat && event.repeat.type && event.repeat.type !== 'none' && addDaysFn) {
      const occurrences = expandEventRepeats(event, id, startKey, endKey, addDaysFn);
      for (const [vid, vev] of occurrences) {
        if (vid !== id) result[vid] = vev; // skip duplicate of base occurrence
      }
    }
  }
  return result;
}
```

### Step 4: Pass `addDays` into the view callers

In [shared/calendar-views.js](../../../shared/calendar-views.js), find every `getEventsForDate` / `getEventsForRange` call and ADD `addDays` as the new third argument. `addDays` is already imported at the top.

Then in [calendar.html](../../../calendar.html), find every direct call to `getEventsForDate` / `getEventsForRange` (there should be a few — including the day-view event tap mapping). ADD `addDays` to each.

Search:
```bash
grep -n "getEventsForDate\|getEventsForRange" calendar.html shared/calendar-views.js
```

For each match, the third arg is `addDays`.

### Step 5: Handle virtual event IDs in click/edit paths

Virtual occurrence IDs are `${parentId}__rpt_${dateKey}`. When the user taps a recurring occurrence and tries to edit/delete, the existing logic looks up `events[id]` which will fail for virtual IDs. Handle this:

In `openEventDetailSheet` (around [calendar.html:1683](../../../calendar.html#L1683)), at the top of the function ADD:

```js
function openEventDetailSheet(eventId) {
  // Resolve virtual occurrence ID (e.g. "abc123__rpt_2026-05-20") to its parent.
  const baseEventId = eventId.includes('__rpt_') ? eventId.split('__rpt_')[0] : eventId;
  const occurrenceDate = eventId.includes('__rpt_') ? eventId.split('__rpt_')[1] : null;
  const event = events[baseEventId];
  if (!event) return;
  // ... rest of the existing function, but use `baseEventId` for edit/delete and
  //     `event` for the data. Optionally surface `occurrenceDate` in the title.
}
```

(The existing function reads `events[eventId]` — change to `events[baseEventId]`. For delete, use `baseEventId`. For "Edit this occurrence" vs "Edit series" — defer to Pass 2; for now, edits affect the whole series.)

### Step 6: Bump cache + commit

Bump `sw.js` cache to next version.

```bash
git add shared/state.js shared/calendar-views.js calendar.html sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): render recurring events from existing repeat rules

The event form has saved a repeat rule field for some time and
openRepeatSubsheet exposes daily/weekly/monthly/yearly/custom +
end-after-N + end-on-date UI. But state.js's getEventsForDate /
getEventsForRange only matched event.date === dateKey, so each
recurring event showed on its first occurrence only.

New state.expandEventRepeats(event, id, startDate, endDate,
addDaysFn) expands a rule into in-range occurrences. Each is a
virtual copy with the same data and a date-suffixed id
(parentId__rpt_YYYY-MM-DD).

getEventsForDate/Range take addDays as an optional 3rd arg; when
present, they auto-expand. View renderers + calendar.html call
sites updated.

openEventDetailSheet resolves the virtual id to the parent so
edit / delete still hit the source event. Per-occurrence edits
deferred to Pass 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Day view task order matches spec

**Why:** CLAUDE.md and DESIGN.md §6.2: "Calendar day sheet = Events → Monthly → Weekly → One-Time → Daily." Current implementation ([calendar-views.js:243-302](../../../shared/calendar-views.js#L243)) groups by person, then incomplete/complete. Frequency grouping missing.

**Files:**
- `shared/calendar-views.js` — refactor task section of `renderDayView`
- `sw.js` — bump cache

### Step 1: Replace the per-person grouping with frequency grouping

In [shared/calendar-views.js](../../../shared/calendar-views.js), find the Tasks section (line 229 onwards). The current structure:

```js
// Tasks section — grouped by person
const dayEntries = allSchedule[dateKey] || {};
let filteredEntries = filterByPerson(dayEntries, activePerson);
// Exclude event schedule entries
filteredEntries = Object.fromEntries(
  Object.entries(filteredEntries).filter(([, e]) => e.type !== 'event')
);

let tasksHtml = '';
if (Object.keys(filteredEntries).length > 0) {
  tasksHtml += `<div class="cal-day__section">
    <div class="cal-day__section-header cal-day__section-header--sticky">Tasks</div>`;

  // Group by person
  const byPerson = {};
  // ... etc
```

REPLACE the entire Tasks section (lines 229-302 area, up to the end of the for-person loop) with frequency-grouped rendering:

```js
  // Tasks section — grouped by frequency per DESIGN.md §6.2:
  //   Events → Monthly → Weekly → One-Time → Daily
  // (Events have their own section above; here we render the 4 non-event groups.)
  const dayEntries = allSchedule[dateKey] || {};
  let filteredEntries = filterByPerson(dayEntries, activePerson);
  filteredEntries = Object.fromEntries(
    Object.entries(filteredEntries).filter(([, e]) => e.type !== 'event')
  );

  let tasksHtml = '';
  if (Object.keys(filteredEntries).length > 0) {
    tasksHtml += `<div class="cal-day__section">
      <div class="cal-day__section-header cal-day__section-header--sticky">Tasks</div>`;

    const groups = groupByFrequency(filteredEntries, tasks, cats);
    const groupOrder = [
      { key: 'monthly', label: 'Monthly' },
      { key: 'weekly',  label: 'Weekly' },
      { key: 'once',    label: 'One-Time' },
      { key: 'daily',   label: 'Daily' },
    ];

    function renderTaskRow(entryKey, entry) {
      const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0, difficulty: 'medium' };
      const cat = task.category ? cats[task.category] : null;
      const done = isComplete(entryKey, completions);
      const isPastDaily = dateKey < today && entry.rotationType === 'daily';
      const todLabel = entry.timeOfDay === 'am' ? 'AM' : entry.timeOfDay === 'pm' ? 'PM' : '';
      const doneClass = done ? ' cal-day__task--done' : '';
      const checkClass = done ? 'cal-day__task-check cal-day__task-check--done' : 'cal-day__task-check';
      const person = people.find(p => p.id === entry.ownerId);
      const personDot = person ? `<span class="cal-day__task-dot" data-bg-color="${person.color}"></span>` : '';
      return `<div class="cal-day__task${doneClass}" data-entry-key="${entryKey}" data-date-key="${dateKey}">
        <button class="${checkClass}" data-entry-key="${entryKey}" data-date-key="${dateKey}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button"></button>
        ${personDot}
        ${todLabel ? `<span class="cal-day__task-tod">${todLabel}</span>` : ''}
        <span class="cal-day__task-name">${esc(task.name)}</span>
        ${cat?.icon ? `<span class="cal-day__task-icon">${cat.icon}</span>` : ''}
      </div>`;
    }

    for (const { key, label } of groupOrder) {
      const groupEntries = groups[key];
      if (!groupEntries || Object.keys(groupEntries).length === 0) continue;
      const sorted = sortEntries(groupEntries, completions, tasks, people, today);
      const incomplete = sorted.filter(([k]) => !isComplete(k, completions));
      const completed  = sorted.filter(([k]) =>  isComplete(k, completions));
      tasksHtml += `<div class="cal-day__freq-group">
        <div class="cal-day__freq-label">${label}</div>`;
      for (const [k, e] of incomplete) tasksHtml += renderTaskRow(k, e);
      for (const [k, e] of completed)  tasksHtml += renderTaskRow(k, e);
      tasksHtml += `</div>`;
    }

    tasksHtml += `</div>`;
  }
```

Note: this introduces a person-dot adjacent to each task (since per-person sections are gone). The dot is small enough to coexist with the existing layout. CSS may need a tiny `.cal-day__task-dot` rule if not already present — check `styles/calendar.css` for one.

Also ensure `groupByFrequency` and `sortEntries` are imported at the top of calendar-views.js. Find the existing import line and add them if missing:

```js
import { groupByFrequency, sortEntries, ... } from './state.js';
```

### Step 2: Append CSS for the frequency-group label

In [styles/calendar.css](../../../styles/calendar.css), append:

```css
/* ── Day view frequency groups (Pass 1) ── */
.cal-day__freq-group {
  margin-bottom: var(--spacing-md);
}

.cal-day__freq-label {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: var(--spacing-xs) 0;
}

.cal-day__task-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--person-color, var(--accent));
}
```

### Step 3: Bump cache + commit

```bash
git add shared/calendar-views.js styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): day view groups tasks by frequency per spec

DESIGN.md §6.2 + CLAUDE.md: 'Calendar day sheet = Events →
Monthly → Weekly → One-Time → Daily.' Existing renderer grouped
by person instead.

Refactored to use the existing groupByFrequency helper. Each
frequency group renders a small label header (uppercase) then
incomplete tasks followed by completed. Owner color appears as
a small dot adjacent to the task name (preserves at-a-glance
ownership signal that per-person grouping previously provided).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Week view buttons + bundled cleanups

**Files:**
- `shared/calendar-views.js` — checkbox → button; enforce `maxPills`
- `calendar.html` — drop dashboard.css import; remove console.log
- `styles/calendar.css` — minor adjustments for the new button rows (if needed)
- `sw.js` — bump cache

### Step 1: Replace week-view checkbox with button

In [shared/calendar-views.js:164-168](../../../shared/calendar-views.js#L164):

```js
function taskRow(entryKey, entry) {
  const task = tasks[entry.taskId] || { name: 'Unknown' };
  const person = people.find(p => p.id === entry.ownerId);
  const done = isComplete(entryKey, completions);
  return `<label class="cal-week__task${done ? ' cal-week__task--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dk}">
    <input type="checkbox" class="cal-week__task-check" ${done ? 'checked' : ''} data-entry-key="${entryKey}" data-date-key="${dk}">
    ${person ? `<span class="cal-week__task-dot" data-bg-color="${person.color}"></span>` : ''}
    <span class="cal-week__task-name">${esc(task.name)}</span>
  </label>`;
}
```

REPLACE with:

```js
function taskRow(entryKey, entry) {
  const task = tasks[entry.taskId] || { name: 'Unknown' };
  const person = people.find(p => p.id === entry.ownerId);
  const done = isComplete(entryKey, completions);
  const isPastDaily = dk < today && entry.rotationType === 'daily';
  return `<div class="cal-week__task${done ? ' cal-week__task--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dk}">
    <button class="cal-week__task-check${done ? ' cal-week__task-check--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dk}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button" aria-pressed="${done}"></button>
    ${person ? `<span class="cal-week__task-dot" data-bg-color="${person.color}"></span>` : ''}
    <span class="cal-week__task-name">${esc(task.name)}</span>
  </div>`;
}
```

Two changes:
1. `<label>` becomes `<div>`; `<input type="checkbox">` becomes `<button>`. Matches the day view pattern.
2. Past daily tasks get `data-tap-blocked="true"` so the existing gesture handler in dom-helpers honors them.

### Step 2: Enforce `maxPills`

In `renderWeekView`, find around line 99-100 where `maxPills` is computed but never used. After the `sortedRecurring` and `sortedDaily` arrays are built (search for `const sortedRecurring` and `const sortedDaily`), apply slicing:

```js
const visibleRecurring = sortedRecurring.slice(0, maxPills);
const visibleDaily = sortedDaily.slice(0, maxPills);
const overflowCount = (sortedRecurring.length - visibleRecurring.length) + (sortedDaily.length - visibleDaily.length);
```

Then in the for-loops that build `recurringHtml` / `dailyHtml`, iterate `visibleRecurring` / `visibleDaily` instead. After both blocks, if overflow > 0, append a small "+N more" row:

```js
const overflowRow = overflowCount > 0
  ? `<div class="cal-week__task cal-week__task--overflow">+${overflowCount} more</div>`
  : '';
```

Add `${overflowRow}` to the column return string.

### Step 3: Drop dashboard.css import + remove console.log

In [calendar.html:18](../../../calendar.html#L18):

```html
    <link rel="stylesheet" href="styles/dashboard.css">
```

DELETE this line. The page should still look correct — if anything breaks, it means a rule was depended on; flag in commit message and move the rule to `styles/calendar.css`.

In [calendar.html:2381](../../../calendar.html#L2381), find the `console.log(...)` in the migrateEventCategories block and DELETE it.

### Step 4: CSS adjustments (if needed)

Add a CSS rule for the new button in calendar.css (only if `.cal-week__task-check` isn't already styled as a button — verify by searching):

```css
/* Week-view task check button (Pass 1 — replaces <input type=checkbox>) */
.cal-week__task-check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--border);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  padding: 0;
  position: relative;
}

.cal-week__task-check--done {
  background: var(--accent);
  border-color: var(--accent);
}

.cal-week__task-check--done::after {
  content: '';
  position: absolute;
  inset: 2px;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 8 7 12 13 4'/></svg>") center/contain no-repeat;
}

.cal-week__task-check[data-tap-blocked="true"] {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Overflow row */
.cal-week__task--overflow {
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-style: italic;
  padding: 2px 4px;
}
```

(Drop the old `.cal-week__task input[type="checkbox"]` rules if any exist.)

### Step 5: Bump cache + commit

```bash
git add shared/calendar-views.js calendar.html styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
fix(calendar): week-view checkbox → button + maxPills + cleanups

- Week-view task rows used a native <input type=checkbox> that
  bypassed the data-tap-blocked rule for past daily tasks. Replace
  with the button pattern day view already uses.
- maxPills was computed (3 cozy / 5 snug) but never applied —
  slice sortedRecurring/sortedDaily and show a '+N more' overflow
  row.
- Drop styles/dashboard.css import — calendar shouldn't load
  another page's CSS.
- Remove stray console.log from the migrateEventCategories block.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Nav polish — back arrow + date jump + range subtitle

**Files:**
- `shared/calendar-views.js` — back-arrow icon; range subtitle in `renderCalendarNav`
- `calendar.html` — wire date-input change handler on the month title
- `styles/calendar.css` — small spacing if needed
- `sw.js` — bump cache

### Step 1: Replace × with back arrow on day view

Find the day-view header in `renderDayView` or wherever `#backToWeek` is rendered. Search for `backToWeek` or `cal-sheet__close`. The current button likely contains an `×` character. Replace with a left-arrow SVG:

```html
<button class="date-nav__btn" id="backToWeek" aria-label="Back" type="button">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
</button>
```

### Step 2: Add range subtitle to the nav

Find `renderCalendarNav` at [shared/calendar-views.js:434](../../../shared/calendar-views.js#L434). The current nav renders the period label ("May 2026"). UPDATE to also include a small subtitle for week view showing the date range, e.g. "May 11 – 17". For month view show nothing extra. For day view show the day-of-week.

The render needs the current view + a date range computed by the caller. Find where the nav is rendered (likely a `render()` function in calendar.html) and pass a subtitle through.

Concrete approach: extend `renderCalendarNav` to accept an optional `subtitle` string:

```js
export function renderCalendarNav({ label, subtitle = '', view, isCurrentPeriod, ... }) {
  // existing markup
  // After the label, add:
  // ${subtitle ? `<div class="cal-nav__subtitle">${esc(subtitle)}</div>` : ''}
}
```

Pass the subtitle from calendar.html `render()`:

```js
let subtitle = '';
if (currentView === 'week') {
  const end = addDays(viewWeekStart, 6);
  subtitle = `${formatDateShort(viewWeekStart)} – ${formatDateShort(end)}`;
} else if (currentView === 'day') {
  subtitle = new Date(`${viewDay}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}
// Pass to renderCalendarNav
```

(Match the actual signature of `renderCalendarNav` — adapt the wrap.)

### Step 3: Tap-to-jump-date on the month/week title

In `renderCalendarNav`, the period label is plain text. Wrap it in a button + hidden date input so a tap opens the native date picker:

```html
<button class="cal-nav__title-btn" id="calTitleBtn" type="button">
  ${esc(label)}
  <input type="date" id="calTitleDateInput" class="cal-nav__title-date-input" value="${esc(today)}">
</button>
```

The `<input type="date">` is visually hidden but accepts the picker. Style with:

```css
.cal-nav__title-btn {
  position: relative;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.cal-nav__title-btn:hover {
  background: var(--surface-2);
}

.cal-nav__title-date-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
```

Bind in calendar.html:

```js
document.getElementById('calTitleDateInput')?.addEventListener('change', (e) => {
  const newDate = e.target.value;
  if (!newDate) return;
  if (currentView === 'week') {
    viewWeekStart = weekStartForDay(newDate, settings?.weekStartDay ?? 0);
  } else if (currentView === 'month') {
    viewMonth = newDate.slice(0, 7) + '-01';
  } else {
    viewDay = newDate;
  }
  render();
});
```

(Use whatever utilities for week-start computation match the page; the example uses `weekStartForDay`.)

### Step 4: Bump cache + commit

```bash
git add shared/calendar-views.js calendar.html styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): nav polish — back arrow + date jump + range subtitle

- Day-view exit button: x → left-arrow icon. The page is a
  navigation, not a modal; the back-arrow communicates that.
- Calendar header title is now tappable: opens a native date
  picker, jumps the cursor to the selected date. Same behavior
  for week / month / day views.
- Week and day views show a small subtitle under the main label:
  'May 11 – 17' for week, 'Wednesday' for day. Month view stays
  unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Docs + push

- [ ] Stage + commit the plan doc and push.

```bash
git add docs/superpowers/plans/2026-05-13-calendar-pass-1.md
git commit -m "$(cat <<'EOF'
docs(calendar): Pass 1 plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-review

1. **Recurring events**: schema + form + sheet all exist; only renderer was missing. `expandEventRepeats` is a pure helper; the only behavior change to existing callers is that they now expand events with a `repeat` rule. ✓
2. **Day view re-order**: matches the spec verbatim. Person-dot preserves owner signal. ✓
3. **Week view button**: matches the day-view pattern. `data-tap-blocked` now actually enforced. ✓
4. **`maxPills`**: was dead code; now actually used. ✓
5. **Back arrow + date jump + range subtitle**: 3 small additive UX wins. ✓
6. **No schema changes.** All work reads existing data.
7. **Cache bumps**: 4 sequential.

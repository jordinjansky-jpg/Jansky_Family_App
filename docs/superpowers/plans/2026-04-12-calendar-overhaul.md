# 1.1 Calendar Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the calendar page from a month-only task grid into a Skylight-quality family hub with week/day/month views, a separate events system, and configurable display settings.

**Architecture:** The calendar page (calendar.html) gets a complete rewrite with three view modes rendered by a central state machine. Events become a new Firebase node (`rundown/events/`) with dedicated CRUD helpers in firebase.js. New shared rendering functions in components.js produce the week/day/month HTML. A migration script converts existing isEvent category tasks to the new events node.

**Tech Stack:** Vanilla JS (ES modules), Firebase RTDB compat SDK (CDN global), CSS custom properties, no build step.

**Design spec:** `docs/superpowers/specs/2026-04-12-calendar-overhaul-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `shared/events.js` | Event CRUD helpers, event-specific query/filter/sort functions. Pure functions + Firebase calls. No DOM. |
| `shared/calendar-views.js` | Render functions for week/month/day views. Pure HTML string generators. No DOM manipulation. |

### Modified files
| File | Changes |
|------|---------|
| `shared/firebase.js` | Add event CRUD: `readEvents`, `readEvent`, `pushEvent`, `writeEvent`, `removeEvent`, `onEvents`. Add `readCalendarSettings`, `writeCalendarSettings`. |
| `shared/utils.js` | Add `weekStartForDay(dateKey, startDay)` helper that respects configurable week start day (0=Sun, 1=Mon). |
| `shared/state.js` | Add `filterEventsByPerson(events, personId)`, update `filterByPerson` to handle event schedule entries (no `ownerId`). Update `groupByFrequency` to handle `type: 'event'` schedule entries. |
| `shared/components.js` | Add `renderEventCard`, `renderEventDetailSheet`, `renderEventForm`, `renderAddMenu`, `renderViewSwitcher`, `renderCalendarPrefsSheet`. Modify `renderHeader` to support view switcher slot. |
| `shared/dom-helpers.js` | Add `initPersonChips(containerId)` for multi-select person chips in event form (similar to existing `initOwnerChips`). |
| `calendar.html` | Complete rewrite of the inline `<script>` — new state machine, three view renderers, event creation/editing, swipe handlers per view. HTML structure unchanged (same mount points). |
| `styles/calendar.css` | Complete rewrite — week grid, day scroll layout, redesigned month grid, event pills, task rows, sticky headers, transitions, density variants. |
| `styles/components.css` | Add styles for event cards, event form, add menu, view switcher, calendar preferences sheet. |
| `styles/responsive.css` | Add breakpoints for side-by-side day view on tablet+, density auto-detection. |
| `admin.html` | Add calendar defaults to Settings tab (default view, density, week start day). Add migration button. |
| `CLAUDE.md` | Update backlog items per spec section 10. |

### Unchanged files (verified no changes needed)
- `dashboard.js`, `index.html` — dashboard stays as-is
- `scoreboard.html`, `tracker.html` — no calendar dependencies
- `kid.html` — separate view, no calendar integration in 1.1
- `shared/scheduler.js` — task scheduling logic unchanged, events don't use scheduler
- `shared/scoring.js` — events excluded from scoring, no changes needed
- `shared/theme.js` — theme system unchanged

---

## Task Sequence

Tasks are ordered so each produces a working, testable increment. The app remains functional after every commit.

---

### Task 1: Event CRUD in Firebase

**Files:**
- Modify: `shared/firebase.js` (add ~40 lines after the streaks section, around line 285)

- [ ] **Step 1: Add event read helpers to firebase.js**

Add after the `writeStreaks` function (line 282):

```js
// --- Events ---

export async function readEvents() {
  return readOnce('events');
}

export async function readEvent(eventId) {
  return readOnce(`events/${eventId}`);
}

export function onEvents(callback) {
  return onValue('events', callback);
}
```

- [ ] **Step 2: Add event write helpers to firebase.js**

Add immediately after the read helpers:

```js
export async function pushEvent(data) {
  return pushData('events', data);
}

export async function writeEvent(eventId, data) {
  return writeData(`events/${eventId}`, data);
}

export async function removeEvent(eventId) {
  return removeData(`events/${eventId}`);
}
```

- [ ] **Step 3: Add calendar settings helpers to firebase.js**

Add after the event helpers:

```js
export async function readCalendarDefaults() {
  return readOnce('settings/calendarDefaults');
}

export async function writeCalendarDefaults(defaults) {
  return writeData('settings/calendarDefaults', defaults);
}
```

- [ ] **Step 4: Verify firebase.js loads without errors**

Open any page (e.g., dashboard) in the browser. Open the console. Confirm no import errors or syntax errors. The new functions are exported but not yet called — this is a pure additive change.

- [ ] **Step 5: Commit**

```bash
git add shared/firebase.js
git commit -m "feat(firebase): add event CRUD and calendar settings helpers"
```

---

### Task 2: Utility — Configurable Week Start Day

**Files:**
- Modify: `shared/utils.js` (add new function, modify `weekStart` and `weekEnd`)

- [ ] **Step 1: Add weekStartForDay function to utils.js**

Add after the existing `weekEnd` function (around line 99):

```js
/**
 * Get the start date key of the week containing dateKey,
 * using a configurable start day (0=Sunday, 1=Monday, ...).
 * Default is 0 (Sunday).
 */
export function weekStartForDay(dateKey, startDay = 0) {
  const dow = dayOfWeek(dateKey);
  const diff = (dow - startDay + 7) % 7;
  return addDays(dateKey, -diff);
}

/**
 * Get the end date key (6 days after start) of the week containing dateKey,
 * using a configurable start day.
 */
export function weekEndForDay(dateKey, startDay = 0) {
  return addDays(weekStartForDay(dateKey, startDay), 6);
}
```

- [ ] **Step 2: Verify by testing in browser console**

Open dashboard, then in the console:

```js
import('./shared/utils.js').then(u => {
  // Sunday April 12 2026
  console.log(u.weekStartForDay('2026-04-12', 0)); // should be 2026-04-12 (Sunday)
  console.log(u.weekStartForDay('2026-04-12', 1)); // should be 2026-04-06 (Monday)
  console.log(u.weekEndForDay('2026-04-12', 0));   // should be 2026-04-18 (Saturday)
});
```

- [ ] **Step 3: Commit**

```bash
git add shared/utils.js
git commit -m "feat(utils): add configurable week start/end helpers"
```

---

### Task 3: State Helpers — Event Filtering

**Files:**
- Modify: `shared/state.js` (add event-aware filtering functions)

- [ ] **Step 1: Add event filtering function**

Add at the end of `state.js`:

```js
/**
 * Filter events by person. Events use `people[]` array, not `ownerId`.
 * @param {object} events - { eventId: eventObject }
 * @param {string|null} personId
 * @returns {object} filtered events
 */
export function filterEventsByPerson(events, personId) {
  if (!personId || !events) return events || {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.people && event.people.includes(personId)) {
      result[id] = event;
    }
  }
  return result;
}

/**
 * Get events for a specific date.
 * @param {object} events - { eventId: eventObject }
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {object} filtered events for that date
 */
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

/**
 * Sort events chronologically. All-day events first, then by startTime.
 * Returns array of [eventId, event] pairs.
 */
export function sortEvents(events) {
  if (!events) return [];
  return Object.entries(events).sort(([, a], [, b]) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    if (a.allDay && b.allDay) return (a.name || '').localeCompare(b.name || '');
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
}

/**
 * Get events for a date range (inclusive).
 * @param {object} events - { eventId: eventObject }
 * @param {string} startKey - YYYY-MM-DD
 * @param {string} endKey - YYYY-MM-DD
 * @returns {object} filtered events
 */
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

- [ ] **Step 2: Commit**

```bash
git add shared/state.js
git commit -m "feat(state): add event filtering, sorting, and date range helpers"
```

---

### Task 4: Event Rendering Components

**Files:**
- Create: `shared/calendar-views.js`
- Modify: `shared/components.js` (add event card, event form, add menu, view switcher)

- [ ] **Step 1: Add renderEventPill to components.js**

Add after `renderGradeBadge` (around line 317):

```js
/**
 * Render an event pill for week/month views.
 * event: { name, startTime, allDay, color, people[] }
 * people: array of { id, name, color }
 */
export function renderEventPill(event, people = []) {
  const bg = event.color || '#5b7fd6';
  const timeStr = event.allDay ? '' : event.startTime ? formatTime12(event.startTime) + ' ' : '';
  const peopleDots = (event.people || []).map(pid => {
    const person = people.find(p => p.id === pid);
    return person ? `<span class="event-pill__dot" style="background:${person.color}" title="${esc(person.name)}"></span>` : '';
  }).join('');

  return `<div class="event-pill" style="background:${bg}">
    <span class="event-pill__text">${esc(timeStr + event.name)}</span>
    ${peopleDots ? `<span class="event-pill__people">${peopleDots}</span>` : ''}
  </div>`;
}

/**
 * Render an event bubble for day view (larger, more detail than pill).
 */
export function renderEventBubble(eventId, event, people = []) {
  const bg = event.color || '#5b7fd6';
  const timeStr = event.allDay ? 'All Day' : formatTimeRange(event.startTime, event.endTime);
  const assignedPeople = (event.people || []).map(pid => people.find(p => p.id === pid)).filter(Boolean);
  const peopleDots = assignedPeople.map(p =>
    `<span class="event-bubble__dot" style="background:${p.color}" title="${esc(p.name)}"></span>`
  ).join('');
  const locationHtml = event.location ? `<span class="event-bubble__location">${esc(event.location)}</span>` : '';

  return `<button class="event-bubble" data-event-id="${eventId}" style="--event-color:${bg}" type="button">
    <div class="event-bubble__time">${esc(timeStr)}</div>
    <div class="event-bubble__name">${esc(event.name)}</div>
    ${locationHtml}
    <div class="event-bubble__people">${peopleDots}</div>
  </button>`;
}

/** Format "HH:MM" 24h to "3:30pm" */
function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Format time range "3:30pm - 4:30pm" or just "3:30pm" if no end */
function formatTimeRange(start, end) {
  const s = formatTime12(start);
  if (!end) return s;
  return `${s} – ${formatTime12(end)}`;
}
```

- [ ] **Step 2: Add renderAddMenu to components.js**

Add after the event rendering functions:

```js
/**
 * Render the universal "+" add menu.
 * options: array of { key, label, icon }
 */
export function renderAddMenu(options) {
  const items = options.map(o =>
    `<button class="add-menu__item" data-action="${o.key}" type="button">
      <span class="add-menu__icon">${o.icon}</span>
      <span class="add-menu__label">${esc(o.label)}</span>
    </button>`
  ).join('');
  return `<div class="add-menu">${items}</div>`;
}

/**
 * Render the view switcher button for the calendar header.
 * currentView: 'week' | 'month'
 */
export function renderViewSwitcher(currentView) {
  const icon = currentView === 'week' ? '📅' : '📋';
  const label = currentView === 'week' ? 'Month' : 'Week';
  return `<button class="view-switcher" id="viewSwitcher" type="button" title="Switch to ${label} view">${icon}</button>`;
}
```

- [ ] **Step 3: Add renderEventForm to components.js**

Add after the add menu:

```js
/**
 * Render the new event creation/edit form.
 * options: { event?, eventId?, people, dateKey, mode: 'create'|'edit' }
 */
export function renderEventForm({ event = {}, eventId = null, people = [], dateKey = '', mode = 'create' }) {
  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit Event' : 'New Event';
  const saveLabel = isEdit ? 'Save' : 'Create';
  const peoplePills = people.map(p => {
    const selected = (event.people || []).includes(p.id);
    return `<button class="chip chip--selectable${selected ? ' chip--active' : ''}" data-person-id="${p.id}" style="--person-color:${p.color}" type="button">${esc(p.name)}</button>`;
  }).join('');

  const colorPalette = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#fdd663', '#57bb8a', '#e8710a', '#795548', '#9e9e9e', '#607d8b'];
  const currentColor = event.color || people[0]?.color || '#4285f4';
  const colorDots = colorPalette.map(c =>
    `<button class="dt-color-btn${c === currentColor ? ' dt-color-btn--active' : ''}" data-color="${c}" style="background:${c}" type="button"></button>`
  ).join('');

  return `<div class="task-detail-sheet">
    <h3 class="admin-form__title">${title}</h3>
    <div class="admin-form__group">
      <label class="form-label" for="ef_name">Event name</label>
      <input class="form-input" id="ef_name" type="text" placeholder="Soccer practice, Dentist, etc." value="${esc(event.name || '')}" autocomplete="off">
    </div>
    <div class="admin-form__group">
      <label class="form-label" for="ef_date">Date</label>
      <input class="form-input" id="ef_date" type="date" value="${event.date || dateKey}">
    </div>
    <div class="admin-form__group">
      <label class="form-label">
        <input type="checkbox" id="ef_allDay" ${event.allDay ? 'checked' : ''}> All day
      </label>
    </div>
    <div class="admin-form__group" id="ef_timeGroup" ${event.allDay ? 'style="display:none"' : ''}>
      <label class="form-label" for="ef_startTime">Start time</label>
      <input class="form-input" id="ef_startTime" type="time" value="${event.startTime || ''}">
    </div>
    <div class="admin-form__group">
      <label class="form-label">People</label>
      <div class="owner-chips" id="ef_people">${peoplePills}</div>
    </div>
    <details class="ef-more-options">
      <summary class="form-label ef-more-toggle">More options</summary>
      <div class="admin-form__group" id="ef_endTimeGroup" ${event.allDay ? 'style="display:none"' : ''}>
        <label class="form-label" for="ef_endTime">End time</label>
        <input class="form-input" id="ef_endTime" type="time" value="${event.endTime || ''}">
      </div>
      <div class="admin-form__group">
        <label class="form-label">Color</label>
        <div class="dt-colors" id="ef_colors">${colorDots}</div>
      </div>
      <div class="admin-form__group">
        <label class="form-label" for="ef_location">Location</label>
        <input class="form-input" id="ef_location" type="text" placeholder="Optional" value="${esc(event.location || '')}">
      </div>
      <div class="admin-form__group">
        <label class="form-label" for="ef_notes">Notes</label>
        <textarea class="form-input form-textarea" id="ef_notes" rows="2" placeholder="Optional">${esc(event.notes || '')}</textarea>
      </div>
      <div class="admin-form__group">
        <label class="form-label" for="ef_url">Link / URL</label>
        <input class="form-input" id="ef_url" type="url" placeholder="Optional" value="${esc(event.url || '')}">
      </div>
    </details>
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="ef_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="ef_save" type="button" ${eventId ? `data-event-id="${eventId}"` : ''}>${saveLabel}</button>
    </div>
    ${isEdit ? `<button class="btn btn--danger btn--small mt-md" id="ef_delete" type="button" data-event-id="${eventId}">Delete Event</button>` : ''}
  </div>`;
}
```

- [ ] **Step 4: Add renderEventDetailSheet to components.js**

Add after the event form:

```js
/**
 * Render event detail sheet (shown on tap in day view).
 */
export function renderEventDetailSheet(eventId, event, people = []) {
  const timeStr = event.allDay ? 'All Day' : formatTimeRange(event.startTime, event.endTime);
  const assignedPeople = (event.people || []).map(pid => people.find(p => p.id === pid)).filter(Boolean);
  const peopleHtml = assignedPeople.map(p =>
    `<span class="chip" style="--person-color:${p.color}">${esc(p.name)}</span>`
  ).join(' ');

  return `<div class="task-detail-sheet">
    <div class="event-detail__color-bar" style="background:${event.color || '#5b7fd6'}"></div>
    <h3 class="event-detail__name">${esc(event.name)}</h3>
    <div class="event-detail__time">${esc(timeStr)}</div>
    <div class="event-detail__date">${formatDateShort(event.date)}</div>
    ${peopleHtml ? `<div class="event-detail__people">${peopleHtml}</div>` : ''}
    ${event.location ? `<div class="event-detail__row"><strong>Location:</strong> ${esc(event.location)}</div>` : ''}
    ${event.notes ? `<div class="event-detail__row"><strong>Notes:</strong> ${esc(event.notes)}</div>` : ''}
    ${event.url ? `<div class="event-detail__row"><a href="${esc(event.url)}" target="_blank" rel="noopener">Open Link</a></div>` : ''}
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="eventEdit" data-event-id="${eventId}" type="button">Edit</button>
      <button class="btn btn--danger btn--small" id="eventDelete" data-event-id="${eventId}" type="button">Delete</button>
    </div>
  </div>`;
}
```

Note: `formatDateShort` is imported from utils.js at the top of components.js. Check that the existing import line includes it — it should, since it's already used by other render functions.

- [ ] **Step 5: Commit**

```bash
git add shared/components.js
git commit -m "feat(components): add event pill, bubble, form, detail sheet, add menu, view switcher"
```

---

### Task 5: Calendar View Renderers

**Files:**
- Create: `shared/calendar-views.js`

This file contains the pure HTML-generating functions for the three calendar views. No DOM manipulation — just string builders that the calendar page calls.

- [ ] **Step 1: Create calendar-views.js with week view renderer**

```js
// calendar-views.js — Pure render functions for calendar week/day/month views.
// No DOM access. Returns HTML strings. Import into calendar.html.

import { addDays, weekStartForDay, weekEndForDay, dateRange, dayOfWeek, monthNumber, yearNumber, monthStart, monthEnd, formatDateShort, escapeHtml as esc, DAY_NAMES_SHORT } from './utils.js';
import { renderEventPill, renderEventBubble, renderPersonFilter, renderGradeBadge, renderTimeHeader } from './components.js';
import { filterByPerson, filterEventsByPerson, getEventsForDate, getEventsForRange, sortEvents, dayProgress, isComplete, sortEntries, groupByFrequency } from './state.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Render the week view.
 * @param {object} opts
 * @param {string} opts.weekStartDate - YYYY-MM-DD of the first day of the displayed week
 * @param {string} opts.today - today's YYYY-MM-DD
 * @param {object} opts.events - all events { eventId: event }
 * @param {object} opts.allSchedule - full schedule { dateKey: { entryKey: entry } }
 * @param {object} opts.completions - all completions
 * @param {object} opts.tasks - all tasks { taskId: task }
 * @param {object} opts.cats - all categories
 * @param {Array} opts.people - people array [{ id, name, color }]
 * @param {string|null} opts.activePerson - filtered person ID or null
 * @param {string} opts.density - 'cozy' | 'snug'
 * @param {number} opts.weekStartDay - 0=Sun, 1=Mon
 * @returns {string} HTML
 */
export function renderWeekView(opts) {
  const { weekStartDate, today, events, allSchedule, completions, tasks, cats, people, activePerson, density, weekStartDay } = opts;
  const days = dateRange(weekStartDate, addDays(weekStartDate, 6));
  const maxPills = density === 'cozy' ? 3 : 5;

  // Day name headers — respect configurable week start
  const dayHeaders = days.map(dk => {
    const dow = dayOfWeek(dk);
    return `<div class="cal-week__dow${dk === today ? ' cal-week__dow--today' : ''}">${DAY_NAMES_SHORT[dow]}<br><span class="cal-week__date-num">${parseInt(dk.split('-')[2], 10)}</span></div>`;
  }).join('');

  const dayColumns = days.map(dk => {
    const isToday = dk === today;
    const isPast = dk < today;

    // Events for this day
    let dayEvents = getEventsForDate(events, dk);
    dayEvents = filterEventsByPerson(dayEvents, activePerson);
    const sortedEvents = sortEvents(dayEvents);

    // Tasks for this day (only weekly/monthly — no daily chores in week view)
    const dayEntries = allSchedule[dk] || {};
    const filteredEntries = filterByPerson(dayEntries, activePerson);
    const weekMonthTasks = {};
    for (const [key, entry] of Object.entries(filteredEntries)) {
      if (entry.type === 'event') continue; // skip event schedule entries
      const rt = entry.rotationType || 'daily';
      if (rt === 'weekly' || rt === 'monthly' || rt === 'once') {
        weekMonthTasks[key] = entry;
      }
    }
    const sortedTasks = sortEntries(weekMonthTasks, completions);

    // Build event pills HTML
    let eventsHtml = '';
    const allDayEvents = sortedEvents.filter(([, e]) => e.allDay);
    const timedEvents = sortedEvents.filter(([, e]) => !e.allDay);
    const visibleEvents = [...allDayEvents, ...timedEvents];
    const overflow = visibleEvents.length - maxPills;

    for (let i = 0; i < Math.min(visibleEvents.length, maxPills); i++) {
      const [, evt] = visibleEvents[i];
      eventsHtml += renderEventPill(evt, people);
    }
    if (overflow > 0) {
      eventsHtml += `<div class="cal-week__overflow">+${overflow} more</div>`;
    }

    // Build task rows HTML
    let tasksHtml = '';
    for (const [entryKey, entry] of sortedTasks) {
      const task = tasks[entry.taskId] || { name: 'Unknown' };
      const person = people.find(p => p.id === entry.ownerId);
      const done = isComplete(entryKey, completions);
      tasksHtml += `<label class="cal-week__task${done ? ' cal-week__task--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dk}">
        <input type="checkbox" class="cal-week__task-check" ${done ? 'checked' : ''} data-entry-key="${entryKey}" data-date-key="${dk}">
        ${person ? `<span class="cal-week__task-dot" style="background:${person.color}"></span>` : ''}
        <span class="cal-week__task-name">${esc(task.name)}</span>
      </label>`;
    }

    return `<div class="cal-week__col${isToday ? ' cal-week__col--today' : ''}${isPast ? ' cal-week__col--past' : ''}" data-date="${dk}">
      <div class="cal-week__events">${eventsHtml}</div>
      ${tasksHtml ? `<div class="cal-week__tasks">${tasksHtml}</div>` : ''}
    </div>`;
  }).join('');

  return `<div class="cal-week">
    <div class="cal-week__header">${dayHeaders}</div>
    <div class="cal-week__body">${dayColumns}</div>
  </div>`;
}

/**
 * Render the day view.
 */
export function renderDayView(opts) {
  const { dateKey, today, events, allSchedule, completions, tasks, cats, people, activePerson, settings } = opts;

  // Events section
  let dayEvents = getEventsForDate(events, dateKey);
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);

  let eventsHtml = '';
  if (sortedEvents.length > 0) {
    eventsHtml += `<div class="cal-day__section">
      <div class="cal-day__section-header cal-day__section-header--sticky">Events</div>`;
    for (const [eventId, event] of sortedEvents) {
      eventsHtml += renderEventBubble(eventId, event, people);
    }
    eventsHtml += `</div>`;
  }

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
    for (const [key, entry] of Object.entries(filteredEntries)) {
      const pid = entry.ownerId || '_unassigned';
      if (!byPerson[pid]) byPerson[pid] = {};
      byPerson[pid][key] = entry;
    }

    // Render each person's section
    const personOrder = people.filter(p => byPerson[p.id]).concat(
      byPerson._unassigned ? [{ id: '_unassigned', name: 'Unassigned', color: '#999' }] : []
    );

    for (const person of personOrder) {
      const personEntries = byPerson[person.id];
      if (!personEntries) continue;
      const sorted = sortEntries(personEntries, completions);
      const incomplete = sorted.filter(([k]) => !isComplete(k, completions));
      const completed = sorted.filter(([k]) => isComplete(k, completions));

      tasksHtml += `<div class="cal-day__person">
        <div class="cal-day__person-header" style="--person-color:${person.color}">
          <span class="cal-day__person-dot" style="background:${person.color}"></span>
          ${esc(person.name)}
          <span class="cal-day__person-count">${completed.length}/${sorted.length}</span>
        </div>`;

      for (const [entryKey, entry] of incomplete) {
        const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0, difficulty: 'medium' };
        const cat = task.category ? cats[task.category] : null;
        const isPastDaily = dateKey < today && entry.rotationType === 'daily';
        const todLabel = entry.timeOfDay === 'am' ? 'AM' : entry.timeOfDay === 'pm' ? 'PM' : '';
        tasksHtml += `<div class="cal-day__task" data-entry-key="${entryKey}" data-date-key="${dateKey}">
          <button class="cal-day__task-check" data-entry-key="${entryKey}" data-date-key="${dateKey}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button"></button>
          ${todLabel ? `<span class="cal-day__task-tod">${todLabel}</span>` : ''}
          <span class="cal-day__task-name">${esc(task.name)}</span>
          ${cat?.icon ? `<span class="cal-day__task-icon">${cat.icon}</span>` : ''}
        </div>`;
      }

      if (completed.length > 0) {
        for (const [entryKey, entry] of completed) {
          const task = tasks[entry.taskId] || { name: 'Unknown' };
          tasksHtml += `<div class="cal-day__task cal-day__task--done" data-entry-key="${entryKey}" data-date-key="${dateKey}">
            <button class="cal-day__task-check cal-day__task-check--done" data-entry-key="${entryKey}" data-date-key="${dateKey}" type="button"></button>
            <span class="cal-day__task-name">${esc(task.name)}</span>
          </div>`;
        }
      }

      tasksHtml += `</div>`;
    }
    tasksHtml += `</div>`;
  }

  // Empty state
  if (sortedEvents.length === 0 && Object.keys(filteredEntries).length === 0) {
    const emptyMsg = activePerson ? 'Nothing scheduled for this person' : 'Nothing scheduled';
    eventsHtml = `<div class="cal-day__empty">${emptyMsg}</div>`;
  }

  return `<div class="cal-day">${eventsHtml}${tasksHtml}</div>`;
}

/**
 * Render the month view grid.
 */
export function renderMonthView(opts) {
  const { viewMonth, today, events, allSchedule, completions, tasks, cats, people, activePerson, density, weekStartDay } = opts;
  const mStart = `${viewMonth}-01`;
  const mEnd = monthEnd(mStart);
  const firstDow = dayOfWeek(mStart);
  const days = dateRange(mStart, mEnd);
  const maxEventNames = density === 'cozy' ? 0 : 2;

  // Day-of-week headers respecting week start day
  const dowHeaders = [];
  for (let i = 0; i < 7; i++) {
    const dow = (weekStartDay + i) % 7;
    dowHeaders.push(`<div class="cal-grid__dow">${DAY_NAMES_SHORT[dow]}</div>`);
  }

  // Empty cells before first day
  const emptyBefore = (firstDow - weekStartDay + 7) % 7;
  const emptyCells = Array(emptyBefore).fill('<div class="cal-grid__cell cal-grid__cell--empty"></div>').join('');

  // Day cells
  const dayCells = days.map(dk => {
    const isToday = dk === today;
    const isPast = dk < today;

    // Events
    let dayEvents = getEventsForDate(events, dk);
    dayEvents = filterEventsByPerson(dayEvents, activePerson);
    const sortedEvents = sortEvents(dayEvents);

    // Tasks
    const dayEntries = allSchedule[dk] || {};
    const filtered = filterByPerson(dayEntries, activePerson);
    const taskEntries = Object.fromEntries(
      Object.entries(filtered).filter(([, e]) => e.type !== 'event')
    );
    const prog = dayProgress(taskEntries, completions);
    const allDone = prog.total > 0 && prog.done === prog.total;

    let cls = 'cal-grid__cell';
    if (isToday) cls += ' cal-grid__cell--today';
    if (allDone) cls += ' cal-grid__cell--alldone';
    if (isPast && !isToday && prog.total === 0 && sortedEvents.length === 0) cls += ' cal-grid__cell--past';
    else if (isPast && !isToday && !allDone && prog.total > 0) cls += ' cal-grid__cell--past-incomplete';

    const dayNum = parseInt(dk.split('-')[2], 10);

    // Event names or dots based on density
    let eventsHtml = '';
    if (maxEventNames > 0 && sortedEvents.length > 0) {
      const visible = sortedEvents.slice(0, maxEventNames);
      const overflow = sortedEvents.length - maxEventNames;
      eventsHtml = visible.map(([, e]) =>
        `<div class="cal-grid__event-name" style="color:${e.color || '#5b7fd6'}">${esc(e.name)}</div>`
      ).join('');
      if (overflow > 0) eventsHtml += `<div class="cal-grid__overflow">+${overflow}</div>`;
    } else if (sortedEvents.length > 0) {
      // Cozy: just dots
      const dots = sortedEvents.slice(0, 4).map(([, e]) =>
        `<span class="cal-grid__event-dot" style="background:${e.color || '#5b7fd6'}"></span>`
      ).join('');
      eventsHtml = `<div class="cal-grid__dots">${dots}</div>`;
    }

    // Progress indicator
    let progressHtml = '';
    if (prog.total > 0) {
      const pct = Math.round((prog.done / prog.total) * 100);
      progressHtml = `<div class="cal-grid__progress"><div class="cal-grid__progress-fill" style="width:${pct}%"></div></div>`;
    }

    return `<button class="${cls}" data-date="${dk}" type="button">
      <span class="cal-grid__day">${dayNum}</span>
      ${eventsHtml}
      ${progressHtml}
    </button>`;
  }).join('');

  return `<div class="cal-month">
    <div class="cal-grid">
      ${dowHeaders.join('')}
      ${emptyCells}
      ${dayCells}
    </div>
  </div>`;
}

/**
 * Render the calendar page header with view navigation.
 */
export function renderCalendarNav(opts) {
  const { currentView, viewLabel, isCurrentPeriod, weekStartDay } = opts;
  const switchLabel = currentView === 'week' ? 'Month' : 'Week';
  const switchIcon = currentView === 'week' ? '📅' : '📋';

  return `<div class="cal-nav">
    <div class="cal-nav__row">
      <button class="date-nav__btn" id="prevPeriod" type="button" title="Previous">&lsaquo;</button>
      <div class="cal-nav__center">
        <span class="cal-nav__label">${viewLabel}</span>
        ${!isCurrentPeriod ? `<button class="cal-today-link" id="goToday" type="button">Today</button>` : ''}
      </div>
      <button class="date-nav__btn" id="nextPeriod" type="button" title="Next">&rsaquo;</button>
      <button class="cal-nav__view-btn" id="viewSwitcher" type="button" title="Switch to ${switchLabel}">${switchIcon}</button>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Verify the module imports resolve**

Open calendar.html in the browser (it won't use these yet, but check the console for import errors if you temporarily add `import './shared/calendar-views.js'` to the top of the script block, then remove it).

- [ ] **Step 3: Commit**

```bash
git add shared/calendar-views.js
git commit -m "feat: add calendar view renderers (week, day, month, nav)"
```

---

### Task 6: Calendar CSS Overhaul

**Files:**
- Rewrite: `styles/calendar.css`
- Modify: `styles/components.css` (add event styles)
- Modify: `styles/responsive.css` (add calendar responsive rules)

- [ ] **Step 1: Rewrite calendar.css with week view styles**

Replace the contents of `styles/calendar.css`. This is a full rewrite. The file is long — here are the key sections to include:

```css
/* calendar.css — Calendar views: week, day, month */

/* ── Page shell (carried from v1) ── */
.cal-page { overflow: hidden; height: 100dvh; }
.cal-page .page-content {
  height: calc(100dvh - var(--header-height) - var(--nav-height) - env(safe-area-inset-bottom, 0px));
  padding: 0 var(--spacing-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.cal-page #mainContent {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* ── Calendar Nav ── */
.cal-nav { margin: var(--spacing-xs) 0; }
.cal-nav__row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}
.cal-nav__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cal-nav__label {
  font-size: var(--font-size-lg);
  font-weight: 800;
}
.cal-nav__view-btn {
  width: 36px; height: 36px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Week View ── */
.cal-week {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.cal-week__header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  text-align: center;
}
.cal-week__dow {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 4px 0 2px;
  line-height: 1.3;
}
.cal-week__dow--today { color: var(--accent); }
.cal-week__date-num {
  font-size: var(--font-size-base);
  font-weight: 800;
  display: block;
}
.cal-week__body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.cal-week__col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 2px;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle, var(--border-light));
  min-width: 0;
  cursor: pointer;
}
.cal-week__col--today {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 4%, var(--bg-card));
}
.cal-week__col--past { opacity: 0.65; }

/* Event pills */
.event-pill {
  padding: 2px 4px;
  border-radius: 4px;
  color: white;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 2px;
}
.event-pill__text {
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-pill__people {
  display: flex;
  gap: 1px;
  flex-shrink: 0;
}
.event-pill__dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.5);
}
.cal-week__overflow {
  font-size: 8px;
  color: var(--text-muted);
  text-align: center;
  padding: 1px 0;
}

/* Task rows in week view */
.cal-week__tasks { border-top: 1px solid var(--border-light); padding-top: 2px; }
.cal-week__task {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 8px;
  line-height: 1.3;
  cursor: pointer;
  padding: 1px 0;
}
.cal-week__task--done { opacity: 0.4; text-decoration: line-through; }
.cal-week__task-check { width: 10px; height: 10px; margin: 0; flex-shrink: 0; }
.cal-week__task-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
.cal-week__task-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Day View ── */
.cal-day {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--spacing-xs) var(--spacing-xl);
}
.cal-day__section { margin-bottom: var(--spacing-md); }
.cal-day__section-header {
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: var(--spacing-xs) 0;
  background: var(--bg-primary);
}
.cal-day__section-header--sticky {
  position: sticky;
  top: 0;
  z-index: 10;
}

/* Event bubbles */
.event-bubble {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-xs);
  border-radius: var(--radius-md);
  border: none;
  background: color-mix(in srgb, var(--event-color) 12%, var(--bg-card));
  border-left: 4px solid var(--event-color);
  cursor: pointer;
  width: 100%;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.event-bubble:active { transform: scale(0.98); }
.event-bubble__time {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--event-color);
}
.event-bubble__name {
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
}
.event-bubble__location {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.event-bubble__people {
  display: flex;
  gap: 3px;
  margin-top: 2px;
}
.event-bubble__dot {
  width: 8px; height: 8px;
  border-radius: 50%;
}

/* Person groups in day view */
.cal-day__person { margin-bottom: var(--spacing-md); }
.cal-day__person-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text-primary);
  padding: var(--spacing-xs) 0;
  border-bottom: 2px solid var(--person-color, var(--border-light));
  margin-bottom: var(--spacing-xs);
}
.cal-day__person-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cal-day__person-count {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-weight: 600;
}

/* Task rows in day view */
.cal-day__task {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-xs);
  border-radius: var(--radius-sm);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.cal-day__task:active { background: var(--bg-hover); }
.cal-day__task--done { opacity: 0.45; }
.cal-day__task--done .cal-day__task-name { text-decoration: line-through; }
.cal-day__task-check {
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  background: var(--bg-card);
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.cal-day__task-check--done {
  background: var(--success-text);
  border-color: var(--success-text);
}
.cal-day__task-check--done::after {
  content: '✓';
  color: white;
  font-size: 12px;
  font-weight: 700;
}
.cal-day__task-name {
  font-size: var(--font-size-base);
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
}
.cal-day__task-tod {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
}
.cal-day__task-icon { font-size: var(--font-size-sm); flex-shrink: 0; }
.cal-day__empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-xl) 0;
  font-size: var(--font-size-base);
}

/* ── Day view header ── */
.cal-day-header {
  padding: var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: var(--spacing-sm);
}
.cal-day-header__title {
  font-size: var(--font-size-lg);
  font-weight: 800;
}
.cal-day-header__meta {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* ── Month View (redesigned) ── */
.cal-month {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  flex: 1;
  min-height: 0;
  grid-auto-rows: minmax(48px, 1fr);
}
.cal-grid__dow {
  text-align: center;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  padding: 4px 0 2px;
}
.cal-grid__cell {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 3px 2px;
  min-height: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle, var(--border-light));
  border-radius: var(--radius-sm);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}
.cal-grid__cell--empty {
  background: transparent;
  border-color: transparent;
  cursor: default;
}
.cal-grid__cell:active:not(.cal-grid__cell--empty) { transform: scale(0.96); }
.cal-grid__cell--today {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-card));
}
.cal-grid__cell--today .cal-grid__day { color: var(--accent); font-weight: 800; }
.cal-grid__cell--alldone {
  background: color-mix(in srgb, var(--success-text) 8%, var(--bg-card));
  border-color: color-mix(in srgb, var(--success-text) 20%, var(--border-subtle, var(--border-light)));
}
.cal-grid__cell--alldone::after {
  content: '';
  position: absolute;
  top: 2px; right: 2px;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--success-text);
  opacity: 0.7;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2.5 5.5L4.5 7.5L7.5 3.5' stroke='white' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-size: 8px 8px;
}
.cal-grid__cell--past { opacity: 0.5; }
.cal-grid__cell--past-incomplete { opacity: 0.75; }
.cal-grid__day {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  margin-bottom: 1px;
}
.cal-grid__event-name {
  font-size: 8px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cal-grid__dots {
  display: flex;
  gap: 2px;
  margin-top: 1px;
}
.cal-grid__event-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
}
.cal-grid__overflow {
  font-size: 7px;
  color: var(--text-muted);
}
.cal-grid__progress {
  width: 85%;
  height: 2px;
  border-radius: 1px;
  background: var(--border-color);
  margin-top: auto;
}
.cal-grid__progress-fill {
  height: 100%;
  border-radius: 1px;
  background: var(--accent);
  transition: width 0.3s ease;
}
.cal-grid__cell--alldone .cal-grid__progress-fill { background: var(--success-text); }

/* ── View transitions ── */
.cal-view-enter { animation: calViewFadeIn 200ms ease both; }
@keyframes calViewFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Add menu ── */
.add-menu {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
}
.add-menu__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.add-menu__item:active { background: var(--bg-hover); }
.add-menu__icon { font-size: 1.5rem; }
.add-menu__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
}

/* ── Today link ── */
.cal-today-link {
  background: var(--accent-light);
  border: none;
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  cursor: pointer;
  margin-top: 1px;
}

/* ── Event detail sheet ── */
.event-detail__color-bar {
  height: 4px;
  border-radius: 2px;
  margin-bottom: var(--spacing-sm);
}
.event-detail__name {
  font-size: var(--font-size-lg);
  font-weight: 800;
  margin-bottom: var(--spacing-xs);
}
.event-detail__time {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  font-weight: 600;
}
.event-detail__date {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  margin-bottom: var(--spacing-sm);
}
.event-detail__people {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-sm);
}
.event-detail__row {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
}
.event-detail__row a { color: var(--accent); }

/* ── Event form extras ── */
.ef-more-options { margin-top: var(--spacing-sm); }
.ef-more-toggle {
  cursor: pointer;
  color: var(--accent);
  font-weight: 600;
}

/* ── Density: Cozy ── */
.cal-density--cozy .cal-week__col { padding: 6px 3px; }
.cal-density--cozy .event-pill { font-size: 10px; padding: 3px 5px; }
.cal-density--cozy .cal-week__task { font-size: 10px; }
.cal-density--cozy .cal-grid { grid-auto-rows: minmax(52px, 1fr); }
.cal-density--cozy .cal-grid__day { font-size: 13px; }

/* ── PWA standalone ── */
@media (display-mode: standalone) {
  .cal-page .page-content {
    height: calc(100dvh - var(--header-height) - var(--nav-height) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }
}
```

- [ ] **Step 2: Add calendar responsive rules to responsive.css**

Add at the end of `responsive.css`:

```css
/* ── Calendar responsive: side-by-side day view on wider screens ── */
@media (min-width: 768px) {
  .cal-day {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
    align-items: start;
  }
  .cal-day__section { margin-bottom: 0; }
  .cal-week__col { padding: 6px 4px; }
  .event-pill { font-size: 10px; }
}
```

- [ ] **Step 3: Commit**

```bash
git add styles/calendar.css styles/responsive.css
git commit -m "style: rewrite calendar CSS for week/day/month views, event pills, density"
```

---

### Task 7: Calendar Page Rewrite — Core State Machine

**Files:**
- Rewrite: `calendar.html` (the inline `<script type="module">` block — ~1300 lines)

This is the largest task. The calendar page gets a new state machine that manages three views. We'll build it incrementally within this task.

- [ ] **Step 1: Rewrite the import block and initialization**

Replace the entire `<script type="module">` contents in calendar.html. Start with imports and initialization:

```js
import { initFirebase, isFirstRun, readSettings, readPeople, readTasks, readCategories, readAllSchedule, readEvents, writeCompletion, removeCompletion, writeTask, pushTask, pushEvent, writeEvent, removeEvent, writePerson, multiUpdate, onCompletions, onEvents, onConnectionChange } from './shared/firebase.js';
import { renderNavBar, renderHeader, renderPersonFilter, renderTaskCard, renderTimeHeader, renderEmptyState, renderUndoToast, renderGradeBadge, renderTaskDetailSheet, renderBottomSheet, renderEditTaskSheet, renderEventForm, renderEventDetailSheet, renderAddMenu, initOfflineBanner } from './shared/components.js';
import { initOwnerChips, getSelectedOwners } from './shared/dom-helpers.js';
import { applyTheme, loadCachedTheme, defaultThemeConfig, resolveTheme } from './shared/theme.js';
import { todayKey, addDays, dayOfWeek, weekStartForDay, weekEndForDay, monthStart, monthEnd, dateRange, monthNumber, yearNumber, DAY_NAMES_SHORT, formatDateShort, formatDateLong, debounce } from './shared/utils.js';
import { isComplete, filterByPerson, filterEventsByPerson, getEventsForDate, sortEvents, dayProgress, getOverdueCooldownTaskIds, sortEntries, groupByFrequency } from './shared/state.js';
import { basePoints, dailyScore, dailyPossible, gradeDisplay } from './shared/scoring.js';
import { buildScheduleUpdates, getRotationOwner, rebuildSingleTaskSchedule } from './shared/scheduler.js';
import { renderWeekView, renderDayView, renderMonthView, renderCalendarNav } from './shared/calendar-views.js';

// ── Cached theme ──
applyTheme(resolveTheme());

// ── Init Firebase ──
initFirebase();
const firstRun = await isFirstRun();
if (firstRun) { window.location.href = 'setup.html'; }

// ── Load core data ──
const [settings, peopleObj, tasksObj, catsObj, eventsObj] = await Promise.all([
  readSettings(), readPeople(), readTasks(), readCategories(), readEvents()
]);

if (settings?.theme) applyTheme(resolveTheme(settings.theme));

const tz = settings?.timezone || 'America/Chicago';
const today = todayKey(tz);
const people = peopleObj ? Object.entries(peopleObj).map(([id, p]) => ({ id, ...p })) : [];
const tasks = tasksObj || {};
const cats = catsObj || {};
let events = eventsObj || {};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ── Personal preferences (localStorage) ──
const calPrefsRaw = localStorage.getItem('dr-cal-prefs');
const calPrefs = calPrefsRaw ? JSON.parse(calPrefsRaw) : {};
function saveCalPrefs() { localStorage.setItem('dr-cal-prefs', JSON.stringify(calPrefs)); }

// ── Calendar defaults (admin settings → personal override) ──
const calDefaults = settings?.calendarDefaults || {};
const weekStartDay = calPrefs.weekStartDay ?? calDefaults.weekStartDay ?? 0;
const density = calPrefs.density || calDefaults.density || 'snug';
const defaultView = calPrefs.defaultView || calDefaults.defaultView || 'week';

// ── Person link mode ──
const personParam = new URLSearchParams(window.location.search).get('person');
const linkedPerson = personParam
  ? people.find(p => p.name.toLowerCase() === personParam.toLowerCase())
  : null;

// ── App state ──
let currentView = defaultView; // 'week' | 'month' | 'day'
let viewWeekStart = weekStartForDay(today, weekStartDay);
let viewMonth = today.substring(0, 7);
let viewDay = null; // set when drilling into day view
let activePerson = calPrefs.personFilter || linkedPerson?.prefs?.calendar?.personFilter || null;
let completions = {};
let allSchedule = {};
let suppressedCooldownTaskIds = new Set();

// ── Header & Nav ──
const debugActive = localStorage.getItem('dr-debug') === 'true';
document.getElementById('headerMount').innerHTML = renderHeader({
  appName: settings?.appName || 'Daily Rundown',
  subtitle: 'Calendar',
  dateLine: formatDateLong(today),
  showAdmin: true,
  showDebug: debugActive,
  showAddTask: true,
  showThemePicker: true
});
document.getElementById('navMount').innerHTML = renderNavBar('calendar');
initOfflineBanner(onConnectionChange);

document.getElementById('loadingState').style.display = 'none';
const main = document.getElementById('mainContent');
main.style.display = '';
const sheetMount = document.getElementById('sheetMount');
const taskSheetMount = document.getElementById('taskSheetMount');
```

- [ ] **Step 2: Add data loading and main render function**

Continue the script with:

```js
// ══════════════════════════════════════════
// Data loading
// ══════════════════════════════════════════

async function loadData() {
  const sched = await readAllSchedule();
  allSchedule = sched || {};
  suppressedCooldownTaskIds = getOverdueCooldownTaskIds(allSchedule, completions, tasks, today);
}

// ══════════════════════════════════════════
// Main render — dispatches to active view
// ══════════════════════════════════════════

function render() {
  let navLabel = '';
  let isCurrentPeriod = false;

  if (currentView === 'day') {
    // Day view has its own nav — render within the view
    const dayLabel = formatDateShort(viewDay);
    const isToday = viewDay === today;
    const prog = getDayProgress(viewDay);

    let html = `<div class="cal-day-header">
      <div>
        <div class="cal-day-header__title">${dayLabel}${isToday ? ' <span class="cal-sheet__today">Today</span>' : ''}</div>
      </div>
      <div class="cal-day-header__meta">
        ${prog.total > 0 ? `<span>${prog.done}/${prog.total}</span>` : ''}
        <button class="date-nav__btn" id="backToWeek" type="button" title="Back to week">&times;</button>
      </div>
    </div>`;

    html += renderPersonFilter(people, activePerson);
    html += `<div class="cal-view-enter">`;
    html += renderDayView({
      dateKey: viewDay, today, events, allSchedule, completions, tasks, cats, people, activePerson, settings
    });
    html += `</div>`;
    main.innerHTML = html;
    bindDayViewEvents();
    return;
  }

  // Week or Month view
  if (currentView === 'week') {
    const weekEnd = addDays(viewWeekStart, 6);
    const m1 = MONTH_NAMES[monthNumber(viewWeekStart) - 1];
    const m2 = monthNumber(viewWeekStart) !== monthNumber(weekEnd) ? ' – ' + MONTH_NAMES[monthNumber(weekEnd) - 1] : '';
    navLabel = `${m1}${m2} ${yearNumber(viewWeekStart)}`;
    const todayWeekStart = weekStartForDay(today, weekStartDay);
    isCurrentPeriod = viewWeekStart === todayWeekStart;
  } else {
    navLabel = `${MONTH_NAMES[monthNumber(viewMonth + '-01') - 1]} ${yearNumber(viewMonth + '-01')}`;
    isCurrentPeriod = viewMonth === today.substring(0, 7);
  }

  let html = renderCalendarNav({ currentView, viewLabel: navLabel, isCurrentPeriod, weekStartDay });
  html += renderPersonFilter(people, activePerson);

  html += `<div class="cal-view-enter ${density === 'cozy' ? 'cal-density--cozy' : ''}">`;
  if (currentView === 'week') {
    html += renderWeekView({
      weekStartDate: viewWeekStart, today, events, allSchedule, completions, tasks, cats, people, activePerson, density, weekStartDay
    });
  } else {
    html += renderMonthView({
      viewMonth, today, events, allSchedule, completions, tasks, cats, people, activePerson, density, weekStartDay
    });
  }
  html += `</div>`;

  main.innerHTML = html;
  bindNavEvents();
  bindPersonFilterEvents();

  if (currentView === 'week') bindWeekViewEvents();
  else bindMonthViewEvents();
}

function getDayProgress(dateKey) {
  const dayEntries = allSchedule[dateKey] || {};
  const filtered = filterByPerson(dayEntries, activePerson);
  const taskEntries = Object.fromEntries(
    Object.entries(filtered).filter(([, e]) => e.type !== 'event')
  );
  return dayProgress(taskEntries, completions);
}
```

- [ ] **Step 3: Add navigation and view-switching event bindings**

```js
// ══════════════════════════════════════════
// Navigation bindings
// ══════════════════════════════════════════

function bindNavEvents() {
  document.getElementById('prevPeriod')?.addEventListener('click', () => {
    if (currentView === 'week') {
      viewWeekStart = addDays(viewWeekStart, -7);
    } else {
      const d = new Date(Date.UTC(yearNumber(viewMonth + '-01'), monthNumber(viewMonth + '-01') - 2, 1));
      viewMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    render();
  });

  document.getElementById('nextPeriod')?.addEventListener('click', () => {
    if (currentView === 'week') {
      viewWeekStart = addDays(viewWeekStart, 7);
    } else {
      const d = new Date(Date.UTC(yearNumber(viewMonth + '-01'), monthNumber(viewMonth + '-01'), 1));
      viewMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    render();
  });

  document.getElementById('goToday')?.addEventListener('click', () => {
    if (currentView === 'week') viewWeekStart = weekStartForDay(today, weekStartDay);
    else viewMonth = today.substring(0, 7);
    render();
  });

  document.getElementById('viewSwitcher')?.addEventListener('click', () => {
    currentView = currentView === 'week' ? 'month' : 'week';
    render();
  });
}

function bindPersonFilterEvents() {
  main.querySelectorAll('.person-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activePerson = btn.dataset.personId || null;
      calPrefs.personFilter = activePerson;
      saveCalPrefs();
      if (linkedPerson) {
        const prefs = { ...(linkedPerson.prefs || {}), calendar: { personFilter: activePerson } };
        linkedPerson.prefs = prefs;
        const { id, ...data } = linkedPerson;
        writePerson(id, data);
      }
      render();
    });
  });
}
```

- [ ] **Step 4: Add week view event bindings**

```js
// ══════════════════════════════════════════
// Week view bindings
// ══════════════════════════════════════════

function bindWeekViewEvents() {
  // Day column tap → drill into day view
  main.querySelectorAll('.cal-week__col[data-date]').forEach(col => {
    col.addEventListener('click', (e) => {
      // Don't drill if they tapped a checkbox
      if (e.target.classList.contains('cal-week__task-check')) return;
      viewDay = col.dataset.date;
      currentView = 'day';
      render();
    });
  });

  // Task checkboxes in week view
  main.querySelectorAll('.cal-week__task-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleTask(cb.dataset.entryKey, cb.dataset.dateKey);
    });
  });
}

function bindMonthViewEvents() {
  main.querySelectorAll('.cal-grid__cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      viewDay = cell.dataset.date;
      currentView = 'day';
      render();
    });
  });
}
```

- [ ] **Step 5: Add day view event bindings**

```js
// ══════════════════════════════════════════
// Day view bindings
// ══════════════════════════════════════════

function bindDayViewEvents() {
  bindPersonFilterEvents();

  // Back button
  document.getElementById('backToWeek')?.addEventListener('click', () => {
    currentView = defaultView;
    // Ensure week view is showing the week containing the day we were viewing
    if (currentView === 'week' && viewDay) {
      viewWeekStart = weekStartForDay(viewDay, weekStartDay);
    }
    viewDay = null;
    render();
  });

  // Event bubbles → detail sheet
  main.querySelectorAll('.event-bubble[data-event-id]').forEach(btn => {
    btn.addEventListener('click', () => openEventDetailSheet(btn.dataset.eventId));
  });

  // Task checkboxes in day view
  main.querySelectorAll('.cal-day__task-check').forEach(btn => {
    const entryKey = btn.dataset.entryKey;
    const dateKey = btn.dataset.dateKey;
    if (btn.dataset.tapBlocked === 'true') {
      btn.addEventListener('click', () => openTaskSheet(entryKey, dateKey));
    } else {
      btn.addEventListener('click', () => toggleTask(entryKey, dateKey));
    }
  });

  // Task name tap → detail sheet (long-press behavior simplified for day view)
  main.querySelectorAll('.cal-day__task').forEach(row => {
    let pressTimer = null;
    let didLongPress = false;
    const entryKey = row.dataset.entryKey;
    const dateKey = row.dataset.dateKey;

    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.cal-day__task-check')) return;
      didLongPress = false;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        openTaskSheet(entryKey, dateKey);
      }, settings?.longPressMs ?? 500);
    });
    row.addEventListener('pointerup', () => { clearTimeout(pressTimer); });
    row.addEventListener('pointerleave', () => { clearTimeout(pressTimer); });
    row.addEventListener('pointercancel', () => { clearTimeout(pressTimer); });
    row.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Swipe between days
  let sx = 0, sy = 0;
  main.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      viewDay = addDays(viewDay, dx < 0 ? 1 : -1);
      render();
    }
  }, { passive: true });
}
```

- [ ] **Step 6: Add task completion toggle (carried from current implementation)**

```js
// ══════════════════════════════════════════
// Completion toggle
// ══════════════════════════════════════════

async function toggleTask(entryKey, dateKey) {
  if (!entryKey) return;
  const wasComplete = isComplete(entryKey, completions);

  if (wasComplete) {
    delete completions[entryKey];
    await removeCompletion(entryKey);
  } else {
    const record = {
      completedAt: firebase.database.ServerValue.TIMESTAMP,
      completedBy: 'calendar'
    };
    const entry = (allSchedule[dateKey] || {})[entryKey];
    const savedVal = entry?.pointsOverride ?? null;
    if (savedVal != null && savedVal !== 100) record.pointsOverride = savedVal;

    if (dateKey < today && record.pointsOverride == null) {
      const task = entry ? tasks[entry.taskId] : null;
      const cat = task?.category ? cats[task.category] : null;
      if (!cat?.isEvent && !task?.exempt) {
        record.pointsOverride = settings?.pastDueCreditPct ?? 75;
        record.isLate = true;
      }
    }
    completions[entryKey] = record;
    await writeCompletion(entryKey, record);

    // Auto-archive one-time tasks
    if (entry) {
      const task = tasks[entry.taskId];
      if (task && task.rotation === 'once') {
        task.status = 'completed';
        await writeTask(entry.taskId, task);
      }
    }
  }

  // Cooldown task rebuild
  const toggledEntry = (allSchedule[dateKey] || {})[entryKey];
  if (toggledEntry) {
    const toggledTask = tasks[toggledEntry.taskId];
    if (toggledTask?.cooldownDays > 0) {
      const cdUpdates = rebuildSingleTaskSchedule(
        toggledEntry.taskId, toggledTask, today, allSchedule, completions, people, settings, tasks, catsObj
      );
      if (Object.keys(cdUpdates).length > 0) {
        await multiUpdate(cdUpdates);
        allSchedule = await readAllSchedule() || {};
        suppressedCooldownTaskIds = getOverdueCooldownTaskIds(allSchedule, completions, tasks, today);
      }
    }
  }

  render();
}
```

- [ ] **Step 7: Add swipe navigation for week/month views**

```js
// ══════════════════════════════════════════
// Swipe navigation (week/month)
// ══════════════════════════════════════════

let swipeStartX = 0, swipeStartY = 0;
main.addEventListener('touchstart', (e) => {
  if (currentView === 'day') return; // day view has its own swipe
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
}, { passive: true });
main.addEventListener('touchend', (e) => {
  if (currentView === 'day') return;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  const dy = e.changedTouches[0].clientY - swipeStartY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const delta = dx < 0 ? 1 : -1;
    if (currentView === 'week') {
      viewWeekStart = addDays(viewWeekStart, delta * 7);
    } else {
      const d = new Date(Date.UTC(yearNumber(viewMonth + '-01'), monthNumber(viewMonth + '-01') - 1 + delta, 1));
      viewMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    render();
  }
}, { passive: true });
```

- [ ] **Step 8: Add real-time listeners and initial load**

```js
// ══════════════════════════════════════════
// Real-time listeners
// ══════════════════════════════════════════

const debouncedRender = debounce(() => render(), 100);

onCompletions((val) => {
  completions = val || {};
  suppressedCooldownTaskIds = getOverdueCooldownTaskIds(allSchedule, completions, tasks, today);
  debouncedRender();
});

onEvents((val) => {
  events = val || {};
  debouncedRender();
});

// ══════════════════════════════════════════
// Initial load
// ══════════════════════════════════════════

await loadData();
render();
```

- [ ] **Step 9: Test the three views in browser**

1. Open calendar.html — should show week view by default.
2. Click the view switcher → should toggle to month view.
3. Click a day in either view → should drill into day view.
4. Click the X/back button in day view → should return to week view.
5. Swipe left/right in week view → should navigate weeks.
6. Person filter should work across all views.

- [ ] **Step 10: Commit**

```bash
git add calendar.html
git commit -m "feat(calendar): rewrite with week/day/month views and state machine"
```

---

### Task 8: Event Creation Flow (Universal Add Menu)

**Files:**
- Modify: `calendar.html` (add event creation/editing functions to the script block)

- [ ] **Step 1: Add the universal add menu handler**

Add before the real-time listeners section in calendar.html:

```js
// ══════════════════════════════════════════
// Universal Add Menu
// ══════════════════════════════════════════

function openAddMenu() {
  const options = [
    { key: 'event', label: 'New Event', icon: '📅' },
    { key: 'task', label: 'New Task', icon: '✅' }
  ];
  const html = renderAddMenu(options);
  taskSheetMount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
  });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });

  taskSheetMount.querySelectorAll('.add-menu__item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      closeTaskSheet();
      if (action === 'event') {
        setTimeout(() => openEventForm(), 320);
      } else if (action === 'task') {
        setTimeout(() => openQuickAddSheet(), 320);
      }
    });
  });
}

// Replace the old header add-task button handler
document.getElementById('headerAddTask')?.addEventListener('click', openAddMenu);
```

- [ ] **Step 2: Add event creation form handler**

```js
// ══════════════════════════════════════════
// Event Form (Create / Edit)
// ══════════════════════════════════════════

function openEventForm(existingEventId = null) {
  const event = existingEventId ? events[existingEventId] : {};
  const mode = existingEventId ? 'edit' : 'create';
  // Pre-fill date from current view context
  const dateKey = viewDay || (currentView === 'week' ? today : today);
  const html = renderEventForm({ event, eventId: existingEventId, people, dateKey, mode });
  taskSheetMount.innerHTML = renderBottomSheet(html);

  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
    if (mode === 'create') document.getElementById('ef_name')?.focus();
  });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });

  // All day toggle
  document.getElementById('ef_allDay')?.addEventListener('change', (e) => {
    const hide = e.target.checked;
    document.getElementById('ef_timeGroup').style.display = hide ? 'none' : '';
    document.getElementById('ef_endTimeGroup').style.display = hide ? 'none' : '';
  });

  // Color picker
  document.querySelectorAll('#ef_colors .dt-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ef_colors .dt-color-btn').forEach(b => b.classList.remove('dt-color-btn--active'));
      btn.classList.add('dt-color-btn--active');
    });
  });

  // People chips (multi-select)
  document.querySelectorAll('#ef_people .chip--selectable').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('chip--active'));
  });

  // Cancel
  document.getElementById('ef_cancel')?.addEventListener('click', closeTaskSheet);

  // Save
  document.getElementById('ef_save')?.addEventListener('click', async () => {
    const name = document.getElementById('ef_name')?.value.trim();
    if (!name) { document.getElementById('ef_name')?.focus(); return; }

    const selectedPeople = [];
    document.querySelectorAll('#ef_people .chip--active').forEach(c => {
      if (c.dataset.personId) selectedPeople.push(c.dataset.personId);
    });

    const selectedColor = document.querySelector('#ef_colors .dt-color-btn--active')?.dataset.color
      || (selectedPeople[0] ? people.find(p => p.id === selectedPeople[0])?.color : null)
      || '#4285f4';

    const eventData = {
      name,
      date: document.getElementById('ef_date')?.value || today,
      allDay: document.getElementById('ef_allDay')?.checked || false,
      startTime: document.getElementById('ef_allDay')?.checked ? null : (document.getElementById('ef_startTime')?.value || null),
      endTime: document.getElementById('ef_allDay')?.checked ? null : (document.getElementById('ef_endTime')?.value || null),
      color: selectedColor,
      people: selectedPeople,
      location: document.getElementById('ef_location')?.value.trim() || null,
      notes: document.getElementById('ef_notes')?.value.trim() || null,
      url: document.getElementById('ef_url')?.value.trim() || null,
      recurrence: null,
      reminders: null,
      createdDate: today
    };

    const eventId = existingEventId || document.getElementById('ef_save')?.dataset.eventId;
    if (eventId) {
      await writeEvent(eventId, eventData);
      events[eventId] = eventData;
    } else {
      const newId = await pushEvent(eventData);
      events[newId] = eventData;

      // Create schedule entry for the event
      const schedKey = `sched_${Date.now()}_event`;
      await multiUpdate({
        [`schedule/${eventData.date}/${schedKey}`]: { type: 'event', eventId: newId }
      });
    }

    closeTaskSheet();
    await loadData();
    render();
  });

  // Delete (edit mode only)
  document.getElementById('ef_delete')?.addEventListener('click', async () => {
    if (!existingEventId) return;
    if (!confirm('Delete this event?')) return;
    await removeEvent(existingEventId);
    delete events[existingEventId];

    // Remove schedule entries for this event
    const updates = {};
    for (const [dateKey, dayEntries] of Object.entries(allSchedule)) {
      for (const [entryKey, entry] of Object.entries(dayEntries || {})) {
        if (entry.type === 'event' && entry.eventId === existingEventId) {
          updates[`schedule/${dateKey}/${entryKey}`] = null;
        }
      }
    }
    if (Object.keys(updates).length > 0) await multiUpdate(updates);

    closeTaskSheet();
    await loadData();
    render();
  });
}
```

- [ ] **Step 3: Add event detail sheet handler**

```js
function openEventDetailSheet(eventId) {
  const event = events[eventId];
  if (!event) return;
  const html = renderEventDetailSheet(eventId, event, people);
  taskSheetMount.innerHTML = renderBottomSheet(html);

  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
  });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });

  document.getElementById('eventEdit')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openEventForm(eventId), 320);
  });

  document.getElementById('eventDelete')?.addEventListener('click', async () => {
    if (!confirm('Delete this event?')) return;
    await removeEvent(eventId);
    delete events[eventId];
    const updates = {};
    for (const [dk, dayEntries] of Object.entries(allSchedule)) {
      for (const [ek, entry] of Object.entries(dayEntries || {})) {
        if (entry.type === 'event' && entry.eventId === eventId) {
          updates[`schedule/${dk}/${ek}`] = null;
        }
      }
    }
    if (Object.keys(updates).length > 0) await multiUpdate(updates);
    closeTaskSheet();
    await loadData();
    render();
  });
}
```

- [ ] **Step 4: Port the existing task sheet functions**

Carry over `openTaskSheet`, `closeTaskSheet`, `openQuickAddSheet`, and `openEditTaskSheet` from the current calendar.html. These are largely unchanged — they still render task detail/edit sheets. The main change is that `closeTaskSheet` is shared between event and task sheets.

```js
function closeTaskSheet() {
  const overlay = document.getElementById('bottomSheet');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => { taskSheetMount.innerHTML = ''; }, 300);
  } else {
    taskSheetMount.innerHTML = '';
  }
}
```

The full task sheet functions (`openTaskSheet`, `openQuickAddSheet`, `openEditTaskSheet`) should be carried from the current calendar.html code (lines 557-1266 approximately). They reference `allSchedule`, `completions`, `tasks`, `cats`, `people`, `settings`, `today`, `activePerson` — all of which exist in the new state machine. No changes needed to their logic.

- [ ] **Step 5: Test event creation flow**

1. Click "+" → should show "New Event" and "New Task" options.
2. Tap "New Event" → event form appears with name, date, time, people.
3. Fill in an event and save → should appear in the week/day views.
4. Tap the event in day view → detail sheet appears.
5. Edit the event → form appears pre-filled.
6. Delete the event → removed from views.

- [ ] **Step 6: Commit**

```bash
git add calendar.html
git commit -m "feat(calendar): add universal add menu, event create/edit/delete"
```

---

### Task 9: Admin Settings for Calendar Defaults

**Files:**
- Modify: `admin.html` (add calendar defaults to Settings tab)

- [ ] **Step 1: Find the Settings tab content in admin.html**

Search for the Settings tab rendering section. Add a "Calendar Defaults" fieldset within it.

- [ ] **Step 2: Add calendar defaults fields to the Settings tab**

Add inside the settings form (after existing settings fields):

```html
<fieldset class="admin-form__fieldset">
  <legend>Calendar Defaults</legend>
  <div class="admin-form__group">
    <label class="form-label" for="set_calView">Default View</label>
    <select class="form-input" id="set_calView">
      <option value="week">Week</option>
      <option value="month">Month</option>
    </select>
  </div>
  <div class="admin-form__group">
    <label class="form-label" for="set_calDensity">Display Density</label>
    <select class="form-input" id="set_calDensity">
      <option value="snug">Snug (more detail)</option>
      <option value="cozy">Cozy (larger, wall-friendly)</option>
    </select>
  </div>
  <div class="admin-form__group">
    <label class="form-label" for="set_weekStart">Week Starts On</label>
    <select class="form-input" id="set_weekStart">
      <option value="0">Sunday</option>
      <option value="1">Monday</option>
    </select>
  </div>
</fieldset>
```

- [ ] **Step 3: Wire up the save logic**

In the settings save handler, read the new fields and include them in the settings write:

```js
const calendarDefaults = {
  defaultView: document.getElementById('set_calView')?.value || 'week',
  density: document.getElementById('set_calDensity')?.value || 'snug',
  weekStartDay: parseInt(document.getElementById('set_weekStart')?.value, 10) || 0
};
// Include in the settings object being saved
settings.calendarDefaults = calendarDefaults;
```

- [ ] **Step 4: Pre-fill the fields when settings load**

When the Settings tab populates, set the values:

```js
const calDefs = settings?.calendarDefaults || {};
if (document.getElementById('set_calView')) document.getElementById('set_calView').value = calDefs.defaultView || 'week';
if (document.getElementById('set_calDensity')) document.getElementById('set_calDensity').value = calDefs.density || 'snug';
if (document.getElementById('set_weekStart')) document.getElementById('set_weekStart').value = String(calDefs.weekStartDay ?? 0);
```

- [ ] **Step 5: Test in browser**

1. Open admin → Settings tab.
2. Calendar Defaults section should appear with dropdowns.
3. Change values and save → should persist to Firebase.
4. Open calendar → should respect the new defaults.

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "feat(admin): add calendar defaults settings (view, density, week start)"
```

---

### Task 10: Migration — isEvent Categories to Events Node

**Files:**
- Modify: `admin.html` (add migration button to Data tab)
- Modify: `calendar.html` (add auto-migration on first load)

- [ ] **Step 1: Add migration function to calendar.html**

Add before the initial load section:

```js
// ══════════════════════════════════════════
// Migration: isEvent categories → events/ node
// ══════════════════════════════════════════

async function migrateEventCategories() {
  const migrated = localStorage.getItem('dr-events-migrated');
  if (migrated) return;

  const eventCatKeys = Object.entries(cats)
    .filter(([, c]) => c.isEvent)
    .map(([key]) => key);

  if (eventCatKeys.length === 0) {
    localStorage.setItem('dr-events-migrated', 'true');
    return;
  }

  const updates = {};
  let counter = 0;

  for (const [taskId, task] of Object.entries(tasks)) {
    if (!eventCatKeys.includes(task.category)) continue;

    const cat = cats[task.category];
    const eventData = {
      name: task.name,
      date: task.dedicatedDate || today,
      allDay: !task.eventTime,
      startTime: task.eventTime || null,
      endTime: null,
      color: cat?.eventColor || '#4285f4',
      people: task.owners || [],
      location: null,
      notes: task.notes || null,
      url: null,
      recurrence: null,
      reminders: null,
      createdDate: task.createdDate || today
    };

    // Push to events/
    const eventRef = firebase.database().ref(`rundown/events`).push();
    const eventId = eventRef.key;
    updates[`events/${eventId}`] = eventData;

    // Update schedule entries
    for (const [dateKey, dayEntries] of Object.entries(allSchedule)) {
      for (const [entryKey, entry] of Object.entries(dayEntries || {})) {
        if (entry.taskId === taskId) {
          updates[`schedule/${dateKey}/${entryKey}`] = { type: 'event', eventId };
        }
      }
    }

    // Remove completions for this task's entries
    for (const [entryKey, comp] of Object.entries(completions)) {
      const schedEntry = Object.values(allSchedule).flatMap(d => Object.entries(d || {})).find(([k]) => k === entryKey);
      if (schedEntry && schedEntry[1]?.taskId === taskId) {
        updates[`completions/${entryKey}`] = null;
      }
    }

    // Remove the task
    updates[`tasks/${taskId}`] = null;
    counter++;
  }

  if (counter > 0) {
    await multiUpdate(updates);
    // Reload data after migration
    const [newTasks, newEvents, newSched] = await Promise.all([
      readTasks(), readEvents(), readAllSchedule()
    ]);
    Object.keys(tasks).forEach(k => delete tasks[k]);
    Object.assign(tasks, newTasks || {});
    events = newEvents || {};
    allSchedule = newSched || {};
    console.log(`Migrated ${counter} event tasks to events/ node`);
  }

  localStorage.setItem('dr-events-migrated', 'true');
}
```

- [ ] **Step 2: Call migration before initial render**

In the initial load section, add the migration call:

```js
await loadData();
await migrateEventCategories();
render();
```

- [ ] **Step 3: Test migration**

If you have existing isEvent category tasks:
1. Open calendar → migration runs silently.
2. Events should appear in the week/day views as event pills/bubbles.
3. They should no longer appear as task cards.
4. Subsequent loads should skip migration (localStorage flag).

If you don't have existing event tasks, the migration is a no-op — still verify no errors in console.

- [ ] **Step 4: Commit**

```bash
git add calendar.html
git commit -m "feat(calendar): add isEvent category migration to events/ node"
```

---

### Task 11: Update CLAUDE.md Backlog

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the 1.1 backlog entry**

Replace the 1.1 description with a reference to the design spec and summarize the key architectural decisions (events node, three views, universal add menu).

- [ ] **Step 2: Update dependent backlog items**

- **1.3 (Meal Planning):** Add note: "Day view's sticky-section architecture supports a 'Meals' section. Universal '+' menu has a slot for 'Add Meal.'"
- **1.5 (Kiosk):** Add "person-as-navigation / avatar tap" to feature list. Note density settings and responsive side-by-side day view lay groundwork.
- **2.1 (Push Notifications):** Add note: "`reminders` field reserved on `events/` schema."
- **2.2 (Flexible Recurrence):** Add note: "`recurrence` field reserved on `events/` schema. Recurrence applies to events (new `rundown/events/` node) as well as tasks."

- [ ] **Step 3: Update the Firebase Schema section**

Add the `events/` node to the schema documentation. Update the `schedule/` entry documentation to include the `type` field.

- [ ] **Step 4: Update the Architecture Decisions section**

Add: "Events are a separate Firebase node (`rundown/events/`), not tasks with an `isEvent` flag. Events have their own color, people array, and CRUD flow. They do not participate in scoring, completions, or scheduler rotation."

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update backlog and schema for calendar overhaul (events node, three views)"
```

---

### Task 12: Update Service Worker Cache

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Add new files to the cache list**

Add `shared/calendar-views.js` and `shared/events.js` (if created) to the SW cache list. Bump `CACHE_NAME` version.

- [ ] **Step 2: Commit**

```bash
git add sw.js
git commit -m "chore(sw): add calendar view modules to cache, bump version"
```

---

### Task 13: Final Integration Test

No files changed — this is a verification task.

- [ ] **Step 1: Full test pass — Week view**

1. Open calendar.html — week view loads as default.
2. Events show as colored pills in day columns.
3. Weekly/monthly tasks show as compact checkable rows below events.
4. Daily tasks are NOT visible in week view.
5. Swiping left/right navigates weeks.
6. Person filter works — filters both events and tasks.
7. Today column is highlighted.

- [ ] **Step 2: Full test pass — Day view**

1. Tap a day column → day view slides in.
2. Events section shows with sticky header, colored bubbles.
3. Tasks section shows grouped by person with sticky header.
4. Task checkboxes work — completion toggles.
5. Long-press on task opens detail sheet.
6. Tap event bubble opens event detail sheet.
7. Swiping left/right navigates between days.
8. Back button returns to week view.

- [ ] **Step 3: Full test pass — Month view**

1. Click view switcher → month grid appears.
2. Day cells show event names (snug) or dots (cozy).
3. Progress bars show on cells with tasks.
4. Tap a day → drills into day view.
5. Swiping left/right navigates months.
6. Person filter applies to month cells.

- [ ] **Step 4: Full test pass — Event CRUD**

1. Click "+" → add menu shows "New Event" and "New Task".
2. Create an event with name, date, time, people → appears in views.
3. Tap event → detail sheet with edit/delete.
4. Edit event → changes reflected.
5. Delete event → removed from all views.

- [ ] **Step 5: Full test pass — Settings**

1. Admin → Settings → Calendar Defaults section exists.
2. Change default view to Month → calendar opens in month view.
3. Change density to Cozy → cells/pills are larger.
4. Change week start to Monday → week columns start on Monday.
5. Personal preferences via theme button override admin defaults.

- [ ] **Step 6: Full test pass — Migration**

1. If isEvent categories existed, they've been migrated to events/ node.
2. Old task cards for events no longer appear.
3. Events appear in the new pill/bubble format.
4. Migration is idempotent (second load doesn't re-migrate).

- [ ] **Step 7: Full test pass — Edge cases**

1. Calendar works with zero events and zero tasks (empty states).
2. Person filter with no matching content shows appropriate empty state.
3. Past dates are dimmed appropriately.
4. All-day events render correctly (no time shown, banner at top of day).
5. Events with multiple people show person dots.
6. Offline behavior — cached page loads, writes queue.

---

## Summary

| Task | Description | Key files |
|------|-------------|-----------|
| 1 | Event CRUD in Firebase | `shared/firebase.js` |
| 2 | Configurable week start utility | `shared/utils.js` |
| 3 | Event filtering/sorting state helpers | `shared/state.js` |
| 4 | Event rendering components | `shared/components.js` |
| 5 | Calendar view renderers | `shared/calendar-views.js` (new) |
| 6 | Calendar CSS overhaul | `styles/calendar.css`, `styles/responsive.css` |
| 7 | Calendar page rewrite — state machine | `calendar.html` |
| 8 | Event creation flow + add menu | `calendar.html` |
| 9 | Admin calendar defaults | `admin.html` |
| 10 | isEvent migration | `calendar.html` |
| 11 | Backlog updates | `CLAUDE.md` |
| 12 | Service worker cache | `sw.js` |
| 13 | Integration testing | — |

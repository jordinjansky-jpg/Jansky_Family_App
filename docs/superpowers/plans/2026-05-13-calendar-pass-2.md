# Calendar Pass 2 — Raise the design floor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Move the calendar from "functional" to "Skylight-quality." Month view shows event names. View switching becomes a real segmented control. Day view becomes a true time-axis hour grid. Week-view pills are individually tappable. Long-press an event surfaces quick actions.

**Files touched:**
- `shared/calendar-views.js` — month event names; new `buildTimeAxisGrid` for day view; per-pill data-event-id wiring
- `calendar.html` — segmented view switcher; per-pill click handler; long-press menu; CSS injection for absolute-positioned events
- `styles/calendar.css` — month-cell layout, time-axis grid, segmented control, quick-actions menu
- `sw.js` — cache bumps per task

**Commits:** 5 (4 feature + 1 docs).

---

## Task 1: Month view shows event names

**Why:** Currently month cells show 4 dot/pill stubs + a 2px progress bar at the bottom. Skylight standard is event NAMES with owner-color accents. With phone-width cells we can fit 1-2 names per cell + an overflow count.

**Files:**
- `shared/calendar-views.js` — modify `renderMonthView`
- `styles/calendar.css` — compact event-name styling for month cells
- `sw.js` — bump cache

### Step 1: Update month-cell event rendering

In [shared/calendar-views.js:401-408](../../../shared/calendar-views.js#L401), the current event pills section is:

```js
    // Event pills (condensed for month cells)
    let eventsHtml = '';
    if (sortedEvents.length > 0) {
      const visible = sortedEvents.slice(0, maxEventPills);
      const overflow = sortedEvents.length - maxEventPills;
      eventsHtml = visible.map(([, e]) => renderEventPill(e, people)).join('');
      if (overflow > 0) eventsHtml += `<div class="cal-grid__overflow">+${overflow}</div>`;
    }
```

The cell shows full `renderEventPill` markup which is too dense for a 56-pixel-wide cell. REPLACE with compact, name-first rendering. Also reduce `maxEventPills` to 2 (truncated) on mobile.

```js
    // Event pills (compact for month cells — show names with owner-color accents)
    const maxEventPills = 2;
    let eventsHtml = '';
    if (sortedEvents.length > 0) {
      const visible = sortedEvents.slice(0, maxEventPills);
      const overflow = sortedEvents.length - maxEventPills;
      eventsHtml = visible.map(([id, e]) => {
        const accentColor = e.color || (people.find(p => e.people?.includes(p.id))?.color) || '#5b7fd6';
        const timeStr = !e.allDay && e.startTime ? e.startTime.replace(/:00$/, '') + ' ' : '';
        return `<div class="cal-grid__event" data-event-id="${esc(id)}" data-bg-color="${esc(accentColor)}">
          ${timeStr ? `<span class="cal-grid__event-time">${esc(timeStr)}</span>` : ''}
          <span class="cal-grid__event-name">${esc(e.name)}</span>
        </div>`;
      }).join('');
      if (overflow > 0) eventsHtml += `<div class="cal-grid__overflow">+${overflow}</div>`;
    }
```

Also remove the dead `const maxEventPills = 4;` declaration at the top of `renderMonthView` (line 361). Move it to inline as shown above.

### Step 2: CSS for the compact month event

In [styles/calendar.css](../../../styles/calendar.css), find existing `.cal-grid__cell` rules. Append at the end of the file:

```css
/* ── Month-cell compact event rows (Pass 2) ── */
.cal-grid__event {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  line-height: 1.2;
  padding: 1px 3px 1px 4px;
  margin-top: 2px;
  border-left: 2px solid var(--bg-color, var(--accent));
  background: color-mix(in srgb, var(--bg-color, var(--accent)) 18%, transparent);
  border-radius: 0 3px 3px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.cal-grid__event-time {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  flex-shrink: 0;
}

.cal-grid__event-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.cal-grid__overflow {
  font-size: 9px;
  color: var(--text-muted);
  padding: 1px 4px;
  margin-top: 1px;
  font-weight: 600;
}
```

Note: `data-bg-color` triggers the existing `applyDataColors` machinery that maps the attribute to a CSS variable. If the existing implementation uses a different attribute name (e.g. it might set the background directly), verify by grepping for `data-bg-color` usage in `applyDataColors`.

### Step 3: Bump cache + commit

```bash
git add shared/calendar-views.js styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): month-view cells show event names (Skylight standard)

Replaces the dense renderEventPill output (overflows 56px cells on
mobile) with a compact name-first row: optional time prefix, event
name with ellipsis, owner-color left accent stripe. 2 events visible
per cell, '+N' overflow count.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Segmented view switcher (Week / Month / Day)

**Why:** Today the view switcher is a single icon button that toggles week ↔ month, and day view is only reachable by tapping a cell. Replace with a real segmented control with three options. Day becomes a first-class view in the switcher.

**Files:**
- `shared/calendar-views.js` — modify `renderCalendarNav`
- `calendar.html` — wire the new switcher; handle `currentView = 'day'` selection (it already works internally, just need the entry point)
- `styles/calendar.css` — segmented control style (likely use existing `.segmented-control` if it fits)
- `sw.js` — bump cache

### Step 1: Replace view-switcher button with segmented control

In `shared/calendar-views.js`, find `renderCalendarNav` at line 436. The current view-switcher button is:

```js
<button class="cal-nav__view-btn" id="viewSwitcher" type="button" title="Switch to ${switchLabel}">${switchIcon}</button>
```

REPLACE the whole `cal-nav__controls` block (lines around 452-455) with a segmented control. Find:

```js
      <div class="cal-nav__controls">
        <button class="cal-nav__view-btn" id="viewSwitcher" type="button" title="Switch to ${switchLabel}">${switchIcon}</button>
        ${controlsHtml}
      </div>
```

REPLACE with:

```js
      <div class="cal-nav__controls">
        <div class="segmented-control cal-nav__view-seg" role="tablist" aria-label="View">
          <button class="segmented-btn${currentView === 'week'  ? ' segmented-btn--active' : ''}" data-cal-view="week"  type="button" role="tab">Week</button>
          <button class="segmented-btn${currentView === 'month' ? ' segmented-btn--active' : ''}" data-cal-view="month" type="button" role="tab">Month</button>
          <button class="segmented-btn${currentView === 'day'   ? ' segmented-btn--active' : ''}" data-cal-view="day"   type="button" role="tab">Day</button>
        </div>
        ${controlsHtml}
      </div>
```

Delete the `switchLabel` and `switchIcon` local declarations (lines 438-442) since they're no longer used.

### Step 2: Wire the new segmented buttons in calendar.html

Find the existing viewSwitcher click handler in `calendar.html`. Search for `viewSwitcher` and the bind that toggles week ↔ month. It probably looks like:

```js
document.getElementById('viewSwitcher')?.addEventListener('click', () => {
  currentView = currentView === 'week' ? 'month' : 'week';
  saveCalPrefs();
  render();
});
```

REPLACE with a handler on the new buttons:

```js
document.querySelectorAll('.cal-nav__view-seg [data-cal-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.calView;
    if (view === currentView) return;
    currentView = view;
    // When user picks Day from the switcher, default to today.
    if (currentView === 'day') viewDay = today;
    saveCalPrefs();
    render();
  });
});
```

### Step 3: CSS for the segmented control sizing

In `styles/calendar.css`, find or append:

```css
/* ── Cal nav segmented view switcher (Pass 2) ── */
.cal-nav__view-seg {
  flex-shrink: 0;
}

.cal-nav__view-seg .segmented-btn {
  font-size: var(--font-xs);
  padding: 4px 10px;
  min-height: 28px;
}
```

(If `.segmented-control` already exists in components.css, the above just sizes it for the calendar nav.)

The `.cal-nav__view-btn` rule may have its own styling that conflicts — delete or update.

### Step 4: Bump cache + commit

```bash
git add shared/calendar-views.js calendar.html styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): segmented view switcher — Week / Month / Day

Replaces the single icon button (that toggled week ↔ month only,
required cell-tap to reach day) with a three-segment control.
Day view is now a first-class entry point — selecting it defaults
to today. View choice persists via the existing calPrefs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Per-pill click + long-press quick actions

**Files:**
- `shared/calendar-views.js` — events in week view's `eventsHtml` already get `data-event-id` from buildTimeGrid; add it to all-day pills too. Month-view events already have `data-event-id` from Task 1.
- `calendar.html` — add a delegated click handler that opens detail when an event element is tapped; add long-press handler that opens quick-actions menu
- `styles/calendar.css` — quick-actions menu style
- `sw.js` — bump cache

### Step 1: Make all-day pills carry data-event-id in week view

In `shared/calendar-views.js`, find where all-day events are appended in `renderWeekView`. Around line 151:

```js
let allDayHtml = '';
for (const [, evt] of allDayEvents) {
  allDayHtml += renderEventPill(evt, people);
}
```

UPDATE to wrap each pill with an outer button that carries the event ID:

```js
let allDayHtml = '';
for (const [id, evt] of allDayEvents) {
  allDayHtml += `<div class="cal-week__event-allday" data-event-id="${id}">${renderEventPill(evt, people)}</div>`;
}
```

Repeat for the day view's all-day rendering (around line 215-218 in `renderDayView`):

```js
for (const [, evt] of allDayEvents) {
  eventsHtml += renderEventPill(evt, people);
}
```

UPDATE to:

```js
for (const [id, evt] of allDayEvents) {
  eventsHtml += `<div class="cal-day__event-allday" data-event-id="${id}">${renderEventPill(evt, people)}</div>`;
}
```

(`buildTimeGrid` already wraps timed events with `data-event-id`. Month view's `cal-grid__event` already has it from Task 1.)

### Step 2: Add delegated click + long-press handlers in calendar.html

Find where event-related listeners are bound after `render()` runs. Search for `cal-grid__cell` click handler or `event-bubble` listeners.

Add a single delegated listener on `main` (or wherever the calendar content mounts) that handles event taps + long-press across all views:

```js
      let evtPressTimer = null;
      let evtPressDidLong = false;
      function attachEventGestures() {
        const root = document.getElementById('app') || document.body;
        root.addEventListener('click', (e) => {
          if (evtPressDidLong) { evtPressDidLong = false; return; }
          const evtEl = e.target.closest('[data-event-id]');
          if (!evtEl) return;
          // Don't intercept if this is a calendar cell (those open day view)
          if (evtEl.matches('.cal-grid__cell')) return;
          e.stopPropagation();
          openEventDetailSheet(evtEl.dataset.eventId);
        }, { capture: true });

        root.addEventListener('pointerdown', (e) => {
          const evtEl = e.target.closest('[data-event-id]');
          if (!evtEl || evtEl.matches('.cal-grid__cell')) return;
          if (evtPressTimer) clearTimeout(evtPressTimer);
          evtPressDidLong = false;
          evtPressTimer = setTimeout(() => {
            evtPressDidLong = true;
            navigator.vibrate?.(20);
            openEventQuickActions(evtEl.dataset.eventId);
          }, 800);
        });
        const cancelLong = () => { if (evtPressTimer) { clearTimeout(evtPressTimer); evtPressTimer = null; } };
        root.addEventListener('pointerup', cancelLong);
        root.addEventListener('pointercancel', cancelLong);
        root.addEventListener('pointermove', cancelLong);
      }
```

Call `attachEventGestures()` once after the initial render (in init, not on every render — the listener is delegated so a single registration covers all future renders).

### Step 3: Add openEventQuickActions sheet

Add this new function in `calendar.html`:

```js
      function openEventQuickActions(eventId) {
        const baseEventId = eventId.includes('__rpt_') ? eventId.split('__rpt_')[0] : eventId;
        const event = events[baseEventId];
        if (!event) return;
        const sheet = `<div class="quick-actions-sheet">
          <div class="quick-actions-sheet__title">${esc(event.name)}</div>
          <button class="quick-actions-sheet__btn" data-action="edit" type="button">Edit</button>
          <button class="quick-actions-sheet__btn" data-action="duplicate" type="button">Duplicate</button>
          <button class="quick-actions-sheet__btn quick-actions-sheet__btn--danger" data-action="delete" type="button">Delete</button>
          <button class="quick-actions-sheet__btn quick-actions-sheet__btn--cancel" id="qaCancel" type="button">Cancel</button>
        </div>`;
        taskSheetMount.innerHTML = renderBottomSheet(sheet);
        requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
        document.getElementById('bottomSheet')?.addEventListener('click', (e) => {
          if (e.target.id === 'bottomSheet') taskSheetMount.innerHTML = '';
        });
        document.getElementById('qaCancel')?.addEventListener('click', () => { taskSheetMount.innerHTML = ''; });
        taskSheetMount.querySelectorAll('[data-action]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            taskSheetMount.innerHTML = '';
            if (action === 'edit') {
              openEventForm(baseEventId);
            } else if (action === 'duplicate') {
              const copy = { ...event, name: event.name + ' (copy)' };
              delete copy.id;
              const newId = await pushEvent(copy);
              events[newId] = { ...copy, id: newId };
              render();
              showToast('Event duplicated');
            } else if (action === 'delete') {
              if (await showConfirm({ title: `Delete "${event.name}"?`, danger: true, confirmLabel: 'Delete' })) {
                await removeEvent(baseEventId);
                delete events[baseEventId];
                render();
                showToast('Event deleted');
              }
            }
          });
        });
      }
```

Note: `pushEvent` must be imported (check the firebase imports). `removeEvent`, `showConfirm`, `showToast` should already be imported.

### Step 4: CSS for the quick-actions menu

In `styles/calendar.css`, append:

```css
/* ── Event quick-actions menu (Pass 2) ── */
.quick-actions-sheet {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.quick-actions-sheet__title {
  font-size: var(--font-md);
  font-weight: 700;
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--spacing-xs);
}

.quick-actions-sheet__btn {
  padding: var(--spacing-md);
  font-size: var(--font-md);
  text-align: left;
  background: var(--surface-2);
  border: none;
  border-radius: var(--radius-md);
  color: var(--text);
  cursor: pointer;
  font: inherit;
}

.quick-actions-sheet__btn:hover { background: var(--surface-3); }
.quick-actions-sheet__btn--danger { color: var(--danger); }
.quick-actions-sheet__btn--cancel { background: none; text-align: center; color: var(--text-muted); }
```

### Step 5: Bump cache + commit

```bash
git add shared/calendar-views.js calendar.html styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): per-pill tap opens detail; long-press → quick actions

Event pills in week / day / month all carry data-event-id now.
Single delegated click handler opens the event detail sheet
directly (previously week pills required a column tap → day view
detour). Long-press 800ms opens a quick-actions menu with
Edit / Duplicate / Delete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Time-based day view

**Why:** Day view is currently a flat list. Google Calendar / Skylight show events on a scrollable hour grid. Add hour labels + dividers + absolute-positioned events + a current-time line.

**Files:**
- `shared/calendar-views.js` — new `buildTimeAxisGrid` helper; replace day-view timed-events render
- `styles/calendar.css` — time-axis grid styles
- `sw.js` — bump cache

### Step 1: Add `buildTimeAxisGrid` helper

In `shared/calendar-views.js`, AFTER the existing `buildTimeGrid` function (around line 78), ADD a new helper:

```js
/**
 * Build a time-axis grid for the day view: hour labels on the left, hour
 * dividers across, events absolutely positioned by their start/end times.
 *
 * Visible range: clamped to [min(6am, earliest event), max(10pm, latest event)].
 *
 * @param {Array} timedEvents - [[id, event], ...]
 * @param {Array} people
 * @param {string} todayKey - today's date key
 * @param {string} dateKey - the day being rendered
 */
function buildTimeAxisGrid(timedEvents, people, todayKey, dateKey) {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fmtHour = (h) => {
    const period = h < 12 || h === 24 ? 'AM' : 'PM';
    const display = h === 0 || h === 24 ? 12 : (h > 12 ? h - 12 : h);
    return `${display} ${period}`;
  };

  let minMin = 6 * 60;
  let maxMin = 22 * 60;
  for (const [, evt] of timedEvents) {
    const s = toMin(evt.startTime);
    const e = evt.endTime ? toMin(evt.endTime) : s + 30;
    if (s < minMin) minMin = Math.max(0, Math.floor(s / 60) * 60);
    if (e > maxMin) maxMin = Math.min(24 * 60, Math.ceil(e / 60) * 60);
  }
  const startHour = Math.floor(minMin / 60);
  const endHour = Math.ceil(maxMin / 60);
  const totalMin = (endHour - startHour) * 60;
  const PX_PER_MIN = 0.9; // 54px/hr
  const gridHeight = totalMin * PX_PER_MIN;

  // Hour rows
  let hoursHtml = '';
  for (let h = startHour; h <= endHour; h++) {
    const top = (h - startHour) * 60 * PX_PER_MIN;
    hoursHtml += `<div class="cal-day__hour" style="top:${top}px"><span class="cal-day__hour-label">${fmtHour(h)}</span></div>`;
  }

  // Overlap / column assignment (reuse logic from buildTimeGrid)
  const parsed = timedEvents.map(([id, evt]) => {
    const start = toMin(evt.startTime);
    const end = evt.endTime ? toMin(evt.endTime) : start + 30;
    return { id, evt, start, end };
  });
  parsed.sort((a, b) => a.start - b.start || a.end - b.end);
  const groups = [];
  let curGroup = [], groupEnd = 0;
  for (const ev of parsed) {
    if (curGroup.length > 0 && ev.start >= groupEnd) { groups.push(curGroup); curGroup = []; }
    curGroup.push(ev);
    groupEnd = Math.max(groupEnd, ev.end);
  }
  if (curGroup.length > 0) groups.push(curGroup);

  const layout = new Map();
  for (const group of groups) {
    const cols = [];
    for (const ev of group) {
      let placed = false;
      for (let ci = 0; ci < cols.length; ci++) {
        if (ev.start >= cols[ci]) { cols[ci] = ev.end; layout.set(ev, { col: ci }); placed = true; break; }
      }
      if (!placed) { layout.set(ev, { col: cols.length }); cols.push(ev.end); }
    }
    const tc = cols.length;
    for (const ev of group) layout.get(ev).totalCols = tc;
  }

  // Event blocks
  let eventsHtml = '';
  for (const ev of parsed) {
    const { col, totalCols } = layout.get(ev);
    const top = (ev.start - startHour * 60) * PX_PER_MIN;
    const height = Math.max((ev.end - ev.start) * PX_PER_MIN, 24);
    const leftPct = (col / totalCols) * 100;
    const widthPct = (1 / totalCols) * 100;
    const pill = renderEventPill(ev.evt, people);
    eventsHtml += `<div class="cal-day__time-event" data-event-id="${ev.id}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 56px);width:calc(${widthPct}% - 56px)">${pill}</div>`;
  }

  // Current-time line (only if viewing today)
  let nowLineHtml = '';
  if (dateKey === todayKey) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin >= startHour * 60 && nowMin <= endHour * 60) {
      const top = (nowMin - startHour * 60) * PX_PER_MIN;
      nowLineHtml = `<div class="cal-day__now-line" style="top:${top}px"></div>`;
    }
  }

  return `<div class="cal-day__time-axis" style="height:${gridHeight}px">
    ${hoursHtml}
    ${eventsHtml}
    ${nowLineHtml}
  </div>`;
}
```

### Step 2: Use `buildTimeAxisGrid` in `renderDayView`

Find `renderDayView` (around line 200). The current timed-events render is:

```js
    // Timed events — same compact time grid as week view, slightly larger scale for day view
    eventsHtml += buildTimeGrid(timedEvents, people, { scale: 2, minHeight: 32 });
```

REPLACE with:

```js
    // Timed events — true time-axis grid with hour labels and current-time line
    eventsHtml += buildTimeAxisGrid(timedEvents, people, today, dateKey);
```

### Step 3: CSS for the time-axis grid

In `styles/calendar.css`, append:

```css
/* ── Day view time-axis grid (Pass 2) ── */
.cal-day__time-axis {
  position: relative;
  width: 100%;
  margin: var(--spacing-sm) 0;
  border-top: 1px solid var(--border);
  padding-left: 56px; /* room for hour labels */
}

.cal-day__hour {
  position: absolute;
  left: 0;
  right: 0;
  border-bottom: 1px solid var(--border);
  height: 0;
  pointer-events: none;
}

.cal-day__hour-label {
  position: absolute;
  left: 4px;
  top: -8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-faint);
  background: var(--bg);
  padding: 0 4px;
  white-space: nowrap;
}

.cal-day__time-event {
  position: absolute;
  overflow: hidden;
  border-radius: var(--radius-sm);
}

.cal-day__time-event .event-pill {
  width: 100%;
  height: 100%;
  margin: 0;
}

/* Current-time indicator (only on today) */
.cal-day__now-line {
  position: absolute;
  left: 56px;
  right: 0;
  height: 2px;
  background: var(--danger);
  pointer-events: none;
  z-index: 5;
}

.cal-day__now-line::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}
```

### Step 4: Bump cache + commit

```bash
git add shared/calendar-views.js styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): time-axis day view with hour labels + now-line

Day view's timed-events section is now a scrollable hour grid:
- Hour labels (6 AM, 7 AM, ...) on the left axis
- Subtle horizontal dividers every hour
- Events absolutely positioned by start/end time
- Width split when events overlap (existing column-assignment logic)
- Red 'now' indicator line and dot when viewing today
- Visible range adapts: clamps to [min(6am, earliest), max(10pm, latest)]

All-day events still pill above; tasks still group below.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Docs + push

```bash
git add docs/superpowers/plans/2026-05-13-calendar-pass-2.md
git commit -m "$(cat <<'EOF'
docs(calendar): Pass 2 plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-review checklist

1. **Spec coverage:** #12 month event names → Task 1. #13 segmented switcher → Task 2. #4 event-tappable pills + Feature F long-press quick actions → Task 3. #20 time-based day view → Task 4. ✓
2. **No schema changes.** All work consumes existing event fields.
3. **Cache bumps:** 4 sequential.
4. **Time-axis grid skips when no timed events** — if `timedEvents` is empty, the grid HTML is still returned but with no event blocks. The hour rows still render, occupying ~860px of empty space if `timedEvents.length === 0`. Verify: probably want an early-return `if (timedEvents.length === 0) return '';` at the top of `buildTimeAxisGrid` so the day view doesn't show a giant empty grid when there are no timed events.

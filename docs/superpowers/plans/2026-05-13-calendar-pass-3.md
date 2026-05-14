# Calendar Pass 3 — Multi-day events + Search

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Two catalog-completeness features. Multi-day events appear on every date they span. Tap a search icon → live event search across the family.

**Scope:**
- **Multi-day events** — events get an optional `endDate` field. Renderers show the event on every spanned date. Visual span bars (continuous bars across cells) deferred — Pass 4 polish.
- **Search** — search icon in nav, tap → bottom sheet with live results.
- **Color-by-category** is deferred — needs a calendar customize sheet to land alongside, which is itself a separate effort.

**Files touched:**
- `shared/state.js` — `getEventsForDate` / `getEventsForRange` match on `event.date <= dateKey <= (event.endDate || event.date)`; `expandEventRepeats` preserves event duration
- `shared/components.js` — `renderEventForm` adds an end-date chip + picker
- `calendar.html` — wire the end-date picker; add search icon + `openCalendarSearchSheet` function
- `styles/calendar.css` — search sheet styles
- `sw.js` — cache bumps per task

**Commits:** 3 (2 feature + 1 docs).

---

## Task 1: Multi-day event support

### Step 1: `shared/state.js` — match against date range

In [shared/state.js:282-291](../../../shared/state.js#L282), find the current `getEventsForDate`:

```js
export function getEventsForDate(events, dateKey, addDaysFn = null) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.date === dateKey) {
      result[id] = event;
      continue;
    }
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

REPLACE the body to match ranges:

```js
export function getEventsForDate(events, dateKey, addDaysFn = null) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    const endDate = event.endDate || event.date;
    if (event.date <= dateKey && dateKey <= endDate) {
      result[id] = event;
      continue;
    }
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

Similarly, update `getEventsForRange` (line 314):

```js
export function getEventsForRange(events, startKey, endKey, addDaysFn = null) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    const endDate = event.endDate || event.date;
    // Range overlap: event spans [event.date, endDate]; we want [startKey, endKey].
    if (event.date <= endKey && endDate >= startKey) {
      result[id] = event;
    }
    if (event.repeat && event.repeat.type && event.repeat.type !== 'none' && addDaysFn) {
      const occurrences = expandEventRepeats(event, id, startKey, endKey, addDaysFn);
      for (const [vid, vev] of occurrences) {
        if (vid !== id) result[vid] = vev;
      }
    }
  }
  return result;
}
```

### Step 2: `shared/state.js` — `expandEventRepeats` preserves endDate

In [shared/state.js](../../../shared/state.js), find `expandEventRepeats` (added in Pass 1). The current virtual-event creation is:

```js
    if (cur >= startDate && cur <= endDate) {
      const virtual = { ...event, date: cur };
      out.push([`${eventId}__rpt_${cur}`, virtual]);
    }
```

UPDATE so the virtual occurrence preserves the event's duration. Compute the event's duration (in days) once at the top of `expandEventRepeats` and apply it to each occurrence:

At the top of `expandEventRepeats`, after the early returns, add:

```js
  // Preserve multi-day duration across occurrences
  let durationDays = 0;
  if (event.endDate && event.endDate > event.date) {
    const start = new Date(`${event.date}T00:00:00Z`);
    const end = new Date(`${event.endDate}T00:00:00Z`);
    durationDays = Math.round((end - start) / 86400000);
  }
```

Then in the virtual-event-creation block, attach an adjusted endDate:

```js
    if (cur >= startDate && cur <= endDate) {
      const virtual = { ...event, date: cur };
      if (durationDays > 0) {
        virtual.endDate = addDaysFn(cur, durationDays);
      }
      out.push([`${eventId}__rpt_${cur}`, virtual]);
    }
```

ALSO: the first-occurrence inclusion at the top of the function should also preserve endDate (it already does because we spread `event`). Just verify:

```js
  if (event.date >= startDate && event.date <= endDate) {
    out.push([eventId, event]);
  }
```

Leave that line alone — the original event already has `endDate` if set.

### Step 3: `shared/components.js` — event form end-date picker

In `renderEventForm` (around line 2861-2960), the current secondary-row chips include "+ Notes", "+ Location", "+ Link", "All day", and the repeat chip. ADD an "+ End date" chip and its reveal.

Find the secondary row (around line 2953-2959):

```js
  <div class="ef2-secondary-row">
    <button class="ef2-add-chip${event.allDay ? ' is-active' : ''}" id="ef2_allDay" type="button">All day</button>
    <button class="ef2-add-chip${notesOpen ? ' is-active' : ''}" id="ef2_notesChip" type="button">+ Notes</button>
    <button class="ef2-add-chip${locOpen ? ' is-active' : ''}" id="ef2_locChip" type="button">+ Location</button>
    <button class="ef2-add-chip${urlOpen ? ' is-active' : ''}" id="ef2_urlChip" type="button">+ Link</button>
    <button class="ef2-add-chip${repeatActive}" id="ef2_repeatChip" type="button">${esc(repeatLabel)}</button>
  </div>
```

INSERT an end-date chip after "All day":

```js
  <div class="ef2-secondary-row">
    <button class="ef2-add-chip${event.allDay ? ' is-active' : ''}" id="ef2_allDay" type="button">All day</button>
    <button class="ef2-add-chip${event.endDate ? ' is-active' : ''}" id="ef2_endDateChip" type="button">${event.endDate ? '✓ Ends ' + esc(event.endDate) : '+ End date'}</button>
    <button class="ef2-add-chip${notesOpen ? ' is-active' : ''}" id="ef2_notesChip" type="button">+ Notes</button>
    <button class="ef2-add-chip${locOpen ? ' is-active' : ''}" id="ef2_locChip" type="button">+ Location</button>
    <button class="ef2-add-chip${urlOpen ? ' is-active' : ''}" id="ef2_urlChip" type="button">+ Link</button>
    <button class="ef2-add-chip${repeatActive}" id="ef2_repeatChip" type="button">${esc(repeatLabel)}</button>
  </div>
```

### Step 4: `calendar.html` — wire the end-date picker

In `openEventForm` (around calendar.html line 944), find where other reveal-chips are bound (search for `ef2_notesChip` or `ef2_locChip` event listeners). ADD a handler for the end-date chip:

```js
      // End-date chip — opens a native date picker, sets event.endDate
      document.getElementById('ef2_endDateChip')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'date';
        input.style.position = 'absolute';
        input.style.opacity = '0';
        input.style.pointerEvents = 'auto';
        const startDateInput = document.getElementById('ef2_date');
        const startVal = startDateInput?.value || dateKey;
        input.value = event.endDate || startVal;
        input.min = startVal;
        document.body.appendChild(input);
        input.addEventListener('change', () => {
          const newEnd = input.value;
          if (newEnd && newEnd >= startVal) {
            event.endDate = newEnd;
            const chip = document.getElementById('ef2_endDateChip');
            if (chip) {
              chip.textContent = '✓ Ends ' + newEnd;
              chip.classList.add('is-active');
            }
          } else if (!newEnd) {
            delete event.endDate;
            const chip = document.getElementById('ef2_endDateChip');
            if (chip) {
              chip.textContent = '+ End date';
              chip.classList.remove('is-active');
            }
          }
          input.remove();
        });
        // Open the picker
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.click();
      });
```

### Step 5: `calendar.html` — include endDate in the save path

In `openEventForm`, find the save handler. Search for `ef2_save` click handler. Inside, there's a section where event data is assembled (lines around 1136-1170, including the `repeat: currentRepeat` field). ADD `endDate`:

The save object construction has multiple call sites (Save new + Save edit). Find each and add:

```js
const endDate = event.endDate || null;
// In the event data object being saved:
{
  ...
  endDate,
  ...
}
```

For "delete the field when not set," ensure that if `event.endDate` is undefined or empty, the saved object doesn't include `endDate: null` (or does — depends on Firebase semantics; null vs missing is interchangeable here).

Recommended: add `endDate: event.endDate || null` to the event data object literal at every save site. Search for `repeat: currentRepeat` to find the save sites; add `endDate` adjacent.

### Step 6: `sw.js` — bump cache

Find `const CACHE_NAME = 'family-hub-v300'` and change to v301.

### Step 7: Commit

```bash
git add shared/state.js shared/components.js calendar.html sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): multi-day event support

Events get an optional endDate field. State helpers match the
event on every date in [date, endDate]; getEventsForRange
overlaps ranges. expandEventRepeats preserves duration across
recurrences (a Mon-Wed soccer camp that repeats weekly stays
Mon-Wed every week).

Event form gains a '+ End date' chip that opens a native date
picker with min=start. Save path persists endDate.

Visual span bars (continuous bars across week/month cells)
deferred to Pass 4 polish — for now each spanned day shows the
event independently.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Search

### Step 1: `shared/calendar-views.js` — search icon in nav controls

Find `renderCalendarNav` and the `cal-nav__controls` block (where Pass 2 added the segmented switcher). The structure is:

```js
      <div class="cal-nav__controls">
        <div class="segmented-control cal-nav__view-seg" ...>
          <button data-cal-view="week">Week</button>
          <button data-cal-view="month">Month</button>
          <button data-cal-view="day">Day</button>
        </div>
        ${controlsHtml}
      </div>
```

INSERT a search button BEFORE the segmented control:

```js
      <div class="cal-nav__controls">
        <button class="cal-nav__icon-btn" id="calSearchBtn" type="button" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <div class="segmented-control cal-nav__view-seg" role="tablist" aria-label="View">
          <button class="segmented-btn${currentView === 'week'  ? ' segmented-btn--active' : ''}" data-cal-view="week"  type="button" role="tab">Week</button>
          <button class="segmented-btn${currentView === 'month' ? ' segmented-btn--active' : ''}" data-cal-view="month" type="button" role="tab">Month</button>
          <button class="segmented-btn${currentView === 'day'   ? ' segmented-btn--active' : ''}" data-cal-view="day"   type="button" role="tab">Day</button>
        </div>
        ${controlsHtml}
      </div>
```

### Step 2: `calendar.html` — `openCalendarSearchSheet` helper

ADD a new function near other sheet helpers:

```js
      function openCalendarSearchSheet() {
        const sheet = `<div class="cal-search">
          <div class="cal-search__header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="calSearchInput" placeholder="Search events…" autocomplete="off" autofocus>
            <button id="calSearchClose" class="ef2-icon-btn" type="button" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="cal-search__results" id="calSearchResults">
            <div class="cal-search__empty">Type to search across all events.</div>
          </div>
        </div>`;
        taskSheetMount.innerHTML = renderBottomSheet(sheet);
        requestAnimationFrame(() => {
          document.getElementById('bottomSheet')?.classList.add('active');
          document.getElementById('calSearchInput')?.focus();
        });
        document.getElementById('bottomSheet')?.addEventListener('click', (e) => {
          if (e.target.id === 'bottomSheet') taskSheetMount.innerHTML = '';
        });
        document.getElementById('calSearchClose')?.addEventListener('click', () => { taskSheetMount.innerHTML = ''; });

        const input = document.getElementById('calSearchInput');
        const results = document.getElementById('calSearchResults');
        const renderResults = (query) => {
          const q = query.trim().toLowerCase();
          if (!q) {
            results.innerHTML = `<div class="cal-search__empty">Type to search across all events.</div>`;
            return;
          }
          const matches = Object.entries(events).filter(([, e]) => {
            const haystack = `${e.name || ''} ${e.location || ''} ${e.notes || ''}`.toLowerCase();
            return haystack.includes(q);
          });
          matches.sort(([, a], [, b]) => (a.date || '').localeCompare(b.date || ''));
          if (matches.length === 0) {
            results.innerHTML = `<div class="cal-search__empty">No events match "${esc(query)}".</div>`;
            return;
          }
          // Group by date
          const byDate = new Map();
          for (const [id, evt] of matches) {
            const dk = evt.date || '';
            if (!byDate.has(dk)) byDate.set(dk, []);
            byDate.get(dk).push([id, evt]);
          }
          let html = '';
          for (const [dk, items] of byDate) {
            html += `<div class="cal-search__date">${esc(formatDateLong(dk))}</div>`;
            for (const [id, evt] of items) {
              const timeStr = !evt.allDay && evt.startTime ? evt.startTime.replace(/:00$/, '') : (evt.allDay ? 'All day' : '');
              const locStr = evt.location ? ` · ${esc(evt.location)}` : '';
              html += `<button class="cal-search__result" data-event-id="${esc(id)}" type="button">
                <span class="cal-search__result-name">${esc(evt.name || '(untitled)')}</span>
                <span class="cal-search__result-meta">${esc(timeStr)}${locStr}</span>
              </button>`;
            }
          }
          results.innerHTML = html;
          results.querySelectorAll('.cal-search__result').forEach(btn => {
            btn.addEventListener('click', () => {
              const eventId = btn.dataset.eventId;
              taskSheetMount.innerHTML = '';
              setTimeout(() => openEventDetailSheet(eventId), 200);
            });
          });
        };
        input.addEventListener('input', (e) => renderResults(e.target.value));
      }
```

### Step 3: `calendar.html` — wire the search button

Find where the segmented view-switcher buttons get their click handler (from Pass 2 Task 2):

```js
document.querySelectorAll('.cal-nav__view-seg [data-cal-view]').forEach(btn => {
  btn.addEventListener('click', () => { ... });
});
```

ADD nearby:

```js
document.getElementById('calSearchBtn')?.addEventListener('click', openCalendarSearchSheet);
```

### Step 4: `styles/calendar.css` — search sheet styles

At the END of `styles/calendar.css`, append:

```css
/* ── Cal nav icon button (Pass 3 — search) ── */
.cal-nav__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.cal-nav__icon-btn:hover,
.cal-nav__icon-btn:focus-visible {
  background: var(--surface-2);
  outline: none;
}

/* ── Calendar search sheet (Pass 3) ── */
.cal-search {
  display: flex;
  flex-direction: column;
  height: 70vh;
}

.cal-search__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border);
}

.cal-search__header svg:first-child {
  color: var(--text-muted);
  flex-shrink: 0;
}

.cal-search__header input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text);
  font-size: var(--font-md);
  outline: none;
  font: inherit;
}

.cal-search__results {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm) 0;
}

.cal-search__empty {
  padding: var(--spacing-xl) var(--spacing-md);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.cal-search__date {
  font-size: var(--font-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-xs);
}

.cal-search__result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  border-bottom: 1px solid var(--border);
  font: inherit;
}

.cal-search__result:hover { background: var(--surface-2); }
.cal-search__result:last-child { border-bottom: none; }

.cal-search__result-name {
  font-weight: 600;
  font-size: var(--font-sm);
}

.cal-search__result-meta {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
```

### Step 5: `sw.js` — bump cache

Change v301 to v302.

### Step 6: Commit

```bash
git add shared/calendar-views.js calendar.html styles/calendar.css sw.js
git commit -m "$(cat <<'EOF'
feat(calendar): event search

Search icon in nav controls opens a bottom sheet with a live
search input. Matches across event.name, event.location, and
event.notes (case-insensitive substring). Results group by date,
sorted ascending; tap a result to open the event detail sheet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Docs + push

```bash
git add docs/superpowers/plans/2026-05-13-calendar-pass-3.md
git commit -m "$(cat <<'EOF'
docs(calendar): Pass 3 plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-review

1. **Multi-day events**: state-level matching done; form gains end-date chip; recurring events preserve duration. ✓
2. **Search**: surface added; results sorted by date; tap → detail. ✓
3. **No schema migration needed** — events without `endDate` continue to behave exactly as before.
4. **Cache bumps**: 2 (v300 → v302).
5. **Deferred**: visual span bars (continuous bars across cells), color-by-category, calendar customize sheet — separate work.

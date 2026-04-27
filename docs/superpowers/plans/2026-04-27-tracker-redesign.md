# Tracker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the tracker's top chrome from 4 rows to 2, restructure the weekly view into named status sections, make the monthly view show completion ratios in always-expanded week groups, and add tap-to-complete on all tracker cards.

**Architecture:** All changes are contained to `tracker.html` (JS logic) and `styles/tracker.css` (styles). No shared components, Firebase schema, or other pages are modified. Swipe navigation already exists in `tracker.html` (lines 1061–1079) — the nav arrow buttons are simply removed from the rendered HTML and their click handlers removed from `bindEvents()`.

**Tech Stack:** Vanilla JS ES modules, Firebase RTDB compat SDK (global `firebase.`), hand-written CSS with design tokens.

---

## File Map

| File | What changes |
|------|-------------|
| `styles/tracker.css` | Remove period nav + summary bar classes; add `.tracker-top-bar`, `.tracker-period-label`, `.tracker-person-summary`, `.tracker-section--overdue`, `.tracker-week-meta`, `.tracker-week-meta--overdue` |
| `tracker.html` | Rewrite `render()`, `renderWeeklyView()`, `renderMonthlyView()`; update `bindEvents()` and `toggleCompletion()`; delete `renderSummary()` |
| `sw.js` | Bump cache version |

---

## Task 1: Replace tracker.css (v3 → v4)

**Files:**
- Modify: `styles/tracker.css`

- [ ] **Step 1: Replace the entire file**

Open `styles/tracker.css` and replace all contents with:

```css
/* v4 */
/* tracker.css — Tracker page styles */

/* ── Top bar (period label left + compact toggle right) ── */
.tracker-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.tracker-period-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text);
}

/* Constrain the segmented toggle to fit-content when inside the top bar */
.tracker-top-bar .tabs--segmented {
  width: fit-content;
  min-width: 140px;
}

/* ── Filter area (person pills + filter chip) ── */
.tracker-filter-area {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  padding-bottom: var(--spacing-sm);
}

/* ── Filter chip ── */
.chip--filter {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 6px var(--spacing-sm);
  border-radius: var(--radius-full);
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-faint);
  font-size: var(--font-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--t-fast);
  white-space: nowrap;
  min-height: 36px;
}

.chip--filter--active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

/* ── Per-person summary line (shown when person filter active) ── */
.tracker-person-summary {
  font-size: var(--font-sm);
  color: var(--text-muted);
  padding: var(--spacing-xs) 0 var(--spacing-sm);
}

/* ── Overdue section — color the section title red ── */
.tracker-section--overdue .section__title {
  color: var(--danger);
}

/* ── Monthly week group completion meta ── */
.tracker-week-meta { color: var(--text-muted); font-size: var(--font-sm); }
.tracker-week-meta--overdue { color: var(--danger); }

/* ── Task rows container ── */
.tracker-rows { display: flex; flex-direction: column; }
.tracker-content { padding-bottom: var(--spacing-lg); }

/* ── Monthly week groups ── */
.tracker-week-group {
  margin-bottom: var(--spacing-md);
}

.tracker-week-group--current {
  border-left: 3px solid var(--accent);
  padding-left: var(--spacing-sm);
}

.tracker-week-current-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: var(--font-xs);
  font-weight: 600;
}

/* ── Status badges ── */
.tracker-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--font-xs);
  font-weight: 600;
  white-space: nowrap;
}

.tracker-status--done     { background: var(--success-soft, var(--surface-2)); color: var(--success); }
.tracker-status--late     { background: var(--warning-soft); color: var(--warning); }
.tracker-status--overdue  { background: var(--danger-soft);  color: var(--danger); }
.tracker-status--upcoming { background: var(--surface-2);    color: var(--text-faint); }
.tracker-status--cooldown { background: var(--surface-2);    color: var(--text-faint); }
.tracker-status--skipped  { background: var(--surface-2);    color: var(--text-faint); }
```

- [ ] **Step 2: Commit**

```bash
git add styles/tracker.css
git commit -m "style(tracker): replace tracker.css v3→v4 — new top-bar + section classes"
```

---

## Task 2: Rewrite `render()` — new top bar, remove period nav

**Files:**
- Modify: `tracker.html` (lines ~461–496)

The current `render()` builds 4 rows of chrome: full-width segmented tabs, period nav with arrows, filter area, and calls `renderSummary` inside the view functions. Replace it with 2 rows: period label + compact toggle on one line, filter area on the next. Remove all period nav button HTML.

- [ ] **Step 1: Replace the `render()` function body**

Find this block in `tracker.html` (starts at `function render() {`, approximately line 463):

```javascript
    function render() {
      const weeklyActive = activeView === 'weekly';
      const monthlyActive = activeView === 'monthly';
      const activeFilterCount = (activeCategory ? 1 : 0) + (activeStatus ? 1 : 0);
      const filterLabel = activeFilterCount > 0 ? `Filter · ${activeFilterCount}` : 'Filter';
      const sliders = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`;

      let html = `
        <nav class="tabs tabs--segmented">
          <button class="tab${weeklyActive ? ' is-active' : ''}" data-view="weekly" type="button">Weekly</button>
          <button class="tab${monthlyActive ? ' is-active' : ''}" data-view="monthly" type="button">Monthly</button>
        </nav>
        <div class="tracker-period">
          <div class="tracker-period__row">
            <button class="tracker-period__nav" data-period-nav="prev" type="button" aria-label="Previous"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <span class="tracker-period__label">${renderPeriodLabel()}</span>
            <button class="tracker-period__nav" data-period-nav="next" type="button" aria-label="Next"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          <button class="tracker-period__today" data-period-nav="today" type="button">Today</button>
        </div>
        <div class="tracker-filter-area">
          ${renderPersonFilter(people, activePerson)}
          <button class="chip chip--filter${activeFilterCount > 0 ? ' chip--filter--active' : ''}" id="trackerFilterChip" type="button">
            ${sliders} ${filterLabel}
          </button>
        </div>
        <div class="tracker-content">
          ${activeView === 'weekly' ? renderWeeklyView() : renderMonthlyView()}
        </div>`;

      main.innerHTML = html;
      applyDataColors(main);
      bindEvents();
    }
```

Replace with:

```javascript
    function render() {
      const weeklyActive = activeView === 'weekly';
      const monthlyActive = activeView === 'monthly';
      const activeFilterCount = (activeCategory ? 1 : 0) + (activeStatus ? 1 : 0);
      const filterLabel = activeFilterCount > 0 ? `Filter · ${activeFilterCount}` : 'Filter';
      const sliders = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`;

      let html = `
        <div class="tracker-top-bar">
          <span class="tracker-period-label">${renderPeriodLabel()}</span>
          <nav class="tabs tabs--segmented">
            <button class="tab${weeklyActive ? ' is-active' : ''}" data-view="weekly" type="button">Weekly</button>
            <button class="tab${monthlyActive ? ' is-active' : ''}" data-view="monthly" type="button">Monthly</button>
          </nav>
        </div>
        <div class="tracker-filter-area">
          ${renderPersonFilter(people, activePerson)}
          <button class="chip chip--filter${activeFilterCount > 0 ? ' chip--filter--active' : ''}" id="trackerFilterChip" type="button">
            ${sliders} ${filterLabel}
          </button>
        </div>
        <div class="tracker-content">
          ${activeView === 'weekly' ? renderWeeklyView() : renderMonthlyView()}
        </div>`;

      main.innerHTML = html;
      applyDataColors(main);
      bindEvents();
    }
```

- [ ] **Step 2: Remove period nav click handlers from `bindEvents()`**

Find and delete this block inside `bindEvents()` (approximately lines 591–599):

```javascript
      // Period navigation buttons
      for (const btn of main.querySelectorAll('[data-period-nav]')) {
        btn.addEventListener('click', () => {
          const nav = btn.dataset.periodNav;
          if (nav === 'prev') shiftPeriod(-1);
          else if (nav === 'next') shiftPeriod(1);
          else if (nav === 'today') snapToToday();
        });
      }
```

The `shiftPeriod` and `snapToToday` functions themselves are kept — they are still used by the swipe handlers (lines 1067–1079).

- [ ] **Step 3: Verify in browser**

Open `tracker.html`. Expected:
- Top of page shows period label ("Mon, Apr 27 – Sun, May 3") on the left and a compact Weekly/Monthly toggle on the right
- No arrow buttons visible
- Swiping left/right changes the period (swipe was already wired)
- Person pills + Filter chip row appears below

- [ ] **Step 4: Commit**

```bash
git add tracker.html
git commit -m "refactor(tracker): new top-bar chrome — period label + compact toggle, remove nav arrows"
```

---

## Task 3: Rewrite `renderWeeklyView()` — status sections + delete `renderSummary()`

**Files:**
- Modify: `tracker.html` (lines ~358–384 for renderWeeklyView, ~336–356 for renderSummary)

Replace the flat sorted list with four named sections: Overdue, Upcoming, Done, Skipped. Add per-person summary when `activePerson` is set. Delete `renderSummary()` entirely (no longer called anywhere after this task).

- [ ] **Step 1: Replace `renderSummary()` — delete the entire function**

Find and delete this function (approximately lines 336–356):

```javascript
    // ── Summary bar ──

    function renderSummary(rows) {
      const counts = { done: 0, late: 0, overdue: 0, upcoming: 0, cooldown: 0, skipped: 0 };
      for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
      const total = rows.length;
      const completed = counts.done + counts.late;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      return `<div class="tracker-summary">
        <div class="tracker-summary__bar">
          <div class="tracker-summary__fill" style="width:${pct}%"></div>
        </div>
        <div class="tracker-summary__counts">
          <span class="tracker-summary__count tracker-summary__count--done">${counts.done} Done</span>
          ${counts.late > 0 ? `<span class="tracker-summary__count tracker-summary__count--late">${counts.late} Late</span>` : ''}
          <span class="tracker-summary__count tracker-summary__count--overdue">${counts.overdue} Overdue</span>
          <span class="tracker-summary__count tracker-summary__count--upcoming">${counts.upcoming} Upcoming</span>
          ${counts.cooldown > 0 ? `<span class="tracker-summary__count tracker-summary__count--cooldown">${counts.cooldown} Cooldown</span>` : ''}
          ${counts.skipped > 0 ? `<span class="tracker-summary__count tracker-summary__count--skipped">${counts.skipped} Skipped</span>` : ''}
        </div>
      </div>`;
    }
```

- [ ] **Step 2: Replace `renderWeeklyView()`**

Find and replace the entire `renderWeeklyView()` function (approximately lines 358–384):

```javascript
    // ── Weekly view ──

    function renderWeeklyView() {
      const { start, end } = currentRange();
      const rows = collectRows('weekly', start, end);
      const skipped = start > today ? [] : findSkippedTasks('weekly', start, end, rows);
      const allRows = [...rows, ...skipped];
      const filtered = filterRows(allRows);

      if (filtered.length === 0) {
        return renderEmptyState('', 'No weekly tasks', 'Nothing scheduled for this period.');
      }

      const overdueRows  = filtered.filter(r => r.status === 'overdue');
      const upcomingRows = filtered.filter(r => r.status === 'upcoming');
      const doneRows     = filtered.filter(r => r.status === 'done' || r.status === 'late');
      const skippedRows  = filtered.filter(r => r.status === 'skipped' || r.status === 'cooldown');

      let html = '';

      if (activePerson) {
        const person = people.find(p => p.id === activePerson);
        const scheduled = filtered.filter(r => r.status !== 'skipped' && r.status !== 'cooldown');
        const done = scheduled.filter(r => r.status === 'done' || r.status === 'late').length;
        html += `<div class="tracker-person-summary">${esc(person?.name || '')} · ${done}/${scheduled.length} done this week</div>`;
      }

      if (overdueRows.length > 0) {
        html += `<div class="tracker-section--overdue">
          ${renderSectionHead('Overdue', String(overdueRows.length))}
          <div class="card-stack">${overdueRows.map(renderRow).join('')}</div>
        </div>`;
      }

      if (upcomingRows.length > 0) {
        html += renderSectionHead('Upcoming', String(upcomingRows.length));
        html += `<div class="card-stack">${upcomingRows.map(renderRow).join('')}</div>`;
      }

      if (doneRows.length > 0) {
        html += renderSectionHead('Done', String(doneRows.length));
        html += `<div class="card-stack">${doneRows.map(renderRow).join('')}</div>`;
      }

      if (skippedRows.length > 0) {
        html += renderSectionHead('Skipped', String(skippedRows.length));
        html += `<div class="card-stack">${skippedRows.map(renderRow).join('')}</div>`;
      }

      return `<div class="tracker-rows">${html}</div>`;
    }
```

- [ ] **Step 3: Verify in browser**

Open `tracker.html` on the Weekly tab. Expected:
- No summary bar (progress bar + counts row) at the top
- Tasks grouped under "Overdue", "Upcoming", "Done", "Skipped" section heads
- "Overdue" section title appears in red when overdue tasks exist
- Section heads show count on the right ("3", "15", etc.)
- No gaps between adjacent cards within a section (card-stack)
- When a person pill is selected, a muted summary line appears ("Jordin · 3/8 done this week")

- [ ] **Step 4: Commit**

```bash
git add tracker.html
git commit -m "feat(tracker): weekly view — status sections with counts, per-person summary, card-stack"
```

---

## Task 4: Rewrite `renderMonthlyView()` — completion ratio + card-stack + per-person summary

**Files:**
- Modify: `tracker.html` (lines ~388–447)

Update monthly week group section heads to show "X/Y done" meta text (red if any overdue in the group). Replace inner `tracker-rows` div with `card-stack`. Add per-person summary line. Remove `renderSummary()` call.

- [ ] **Step 1: Replace `renderMonthlyView()`**

Find and replace the entire `renderMonthlyView()` function (approximately lines 388–447):

```javascript
    // ── Monthly view ──

    function renderMonthlyView() {
      const { start, end } = currentRange();
      const rows = collectRows('monthly', start, end);
      const skipped = start > today ? [] : findSkippedTasks('monthly', start, end, rows);
      const allRows = [...rows, ...skipped];
      const filtered = filterRows(allRows);

      if (filtered.length === 0) {
        return renderEmptyState('', 'No monthly tasks', 'Nothing scheduled for this period.');
      }

      let html = '';

      if (activePerson) {
        const person = people.find(p => p.id === activePerson);
        const scheduled = filtered.filter(r => r.status !== 'skipped' && r.status !== 'cooldown');
        const done = scheduled.filter(r => r.status === 'done' || r.status === 'late').length;
        html += `<div class="tracker-person-summary">${esc(person?.name || '')} · ${done}/${scheduled.length} done this month</div>`;
      }

      // Group by week start date key
      const weekGroups = {};
      const todayWeekStart = weekStart(today);
      for (const row of filtered) {
        const wkStart = row.dateKey ? weekStart(row.dateKey) : '0000-00-00';
        const wkLabel = row.dateKey
          ? `Week of ${formatDateShort(weekStart(row.dateKey))}`
          : 'Unscheduled';
        if (!weekGroups[wkStart]) weekGroups[wkStart] = { label: wkLabel, rows: [], isCurrent: wkStart === todayWeekStart };
        weekGroups[wkStart].rows.push(row);
      }

      // Sort: current week first, then future weeks ascending, then past weeks descending
      const sortedWeeks = Object.keys(weekGroups).sort((a, b) => {
        const aIsCurrent = a === todayWeekStart ? 1 : 0;
        const bIsCurrent = b === todayWeekStart ? 1 : 0;
        if (aIsCurrent !== bIsCurrent) return bIsCurrent - aIsCurrent;
        const aIsFuture = a > todayWeekStart ? 1 : 0;
        const bIsFuture = b > todayWeekStart ? 1 : 0;
        if (aIsFuture !== bIsFuture) return bIsFuture - aIsFuture;
        if (aIsFuture) return a < b ? -1 : 1;
        return a > b ? -1 : 1;
      });

      for (const wkKey of sortedWeeks) {
        const group = weekGroups[wkKey];
        const statusOrder = { overdue: 0, upcoming: 1, late: 2, done: 3, cooldown: 4, skipped: 5 };
        group.rows.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

        const scheduled = group.rows.filter(r => r.status !== 'skipped' && r.status !== 'cooldown');
        const doneCount = scheduled.filter(r => r.status === 'done' || r.status === 'late').length;
        const hasOverdue = group.rows.some(r => r.status === 'overdue');
        const metaText = scheduled.length > 0 ? `${doneCount}/${scheduled.length} done` : '';
        const metaClass = hasOverdue ? 'tracker-week-meta tracker-week-meta--overdue' : 'tracker-week-meta';
        const metaHtml = metaText ? `<span class="${metaClass}">${esc(metaText)}</span>` : '';

        const currentClass = group.isCurrent ? ' tracker-week-group--current' : '';
        const tagHtml = group.isCurrent
          ? `<span class="tracker-week-current-tag">This Week</span>`
          : '';

        html += `<div class="tracker-week-group${currentClass}">
          ${renderSectionHead(group.label, null, { trailingHtml: tagHtml, metaHtml })}
          <div class="card-stack">`;
        for (const row of group.rows) {
          html += renderRow(row);
        }
        html += `</div></div>`;
      }

      return html;
    }
```

- [ ] **Step 2: Verify in browser**

Switch to the Monthly tab. Expected:
- Each week group section head shows "Week of Apr 28" on the left and "2/3 done" on the right
- "X/Y done" text turns red when the group has overdue tasks
- "This Week" tag still shows on the current week group
- No gaps between adjacent cards within a week group (card-stack)
- When a person pill is selected, "Jordin · 1/4 done this month" appears above the first week group

- [ ] **Step 3: Commit**

```bash
git add tracker.html
git commit -m "feat(tracker): monthly view — completion ratio in week heads, card-stack, per-person summary"
```

---

## Task 5: Tap-to-complete — update `bindEvents()` and `toggleCompletion()`

**Files:**
- Modify: `tracker.html` (lines ~568–618 for bindEvents card section, ~1028–1054 for toggleCompletion)

Add a `click` handler on each `.card--tracker[data-entry-key]` card that calls `toggleCompletion`. Update `toggleCompletion` to set `isLate: true` and `pointsOverride: pastDueCreditPct` for past-date completions (matching dashboard behavior for non-daily tasks).

- [ ] **Step 1: Update the card long-press block in `bindEvents()` to include a click handler**

Find this block inside `bindEvents()` (approximately lines 601–618):

```javascript
      // Long-press on tracker cards to open detail sheet (500ms per spec)
      for (const card of main.querySelectorAll('.card--tracker[data-entry-key]')) {
        if (!card.dataset.entryKey) continue;
        let pressTimer = null;
        let didLongPress = false;

        card.addEventListener('pointerdown', () => {
          didLongPress = false;
          pressTimer = setTimeout(() => {
            didLongPress = true;
            openTaskSheet(card.dataset.entryKey, card.dataset.dateKey);
          }, settings?.longPressMs ?? 500);
        });

        card.addEventListener('pointerup', () => { clearTimeout(pressTimer); });
        card.addEventListener('pointerleave', () => { clearTimeout(pressTimer); });
        card.addEventListener('contextmenu', (e) => e.preventDefault());
      }
```

Replace with:

```javascript
      // Tap = complete/uncomplete. Long-press (500ms) = detail sheet.
      for (const card of main.querySelectorAll('.card--tracker[data-entry-key]')) {
        if (!card.dataset.entryKey) continue;
        let pressTimer = null;
        let didLongPress = false;

        card.addEventListener('pointerdown', () => {
          didLongPress = false;
          pressTimer = setTimeout(() => {
            didLongPress = true;
            openTaskSheet(card.dataset.entryKey, card.dataset.dateKey);
          }, settings?.longPressMs ?? 500);
        });

        card.addEventListener('pointerup', () => { clearTimeout(pressTimer); });
        card.addEventListener('pointerleave', () => { clearTimeout(pressTimer); });
        card.addEventListener('contextmenu', (e) => e.preventDefault());

        card.addEventListener('click', () => {
          if (didLongPress) { didLongPress = false; return; }
          toggleCompletion(card.dataset.entryKey, card.dataset.dateKey);
        });
      }
```

- [ ] **Step 2: Update `toggleCompletion()` to handle late completions**

Find the `toggleCompletion` function (approximately lines 1028–1054):

```javascript
    async function toggleCompletion(entryKey, dateKey) {
      if (!entryKey) return;
      const wasComplete = !!comps[entryKey];

      if (wasComplete) {
        delete comps[entryKey];
        await removeCompletion(entryKey);
      } else {
        const record = {
          completedAt: firebase.database.ServerValue.TIMESTAMP,
          completedBy: 'tracker'
        };
        const pendingVal = pendingSliderOverride?.entryKey === entryKey ? pendingSliderOverride.value : null;
        const savedVal = (schedule[dateKey] || {})[entryKey]?.pointsOverride;
        const overrideVal = pendingVal ?? savedVal ?? null;
        if (overrideVal != null && overrideVal !== 100) {
          record.pointsOverride = overrideVal;
        }
        pendingSliderOverride = null;
        comps[entryKey] = record;
        await writeCompletion(entryKey, record);
      }

      render();
    }
```

Replace with:

```javascript
    async function toggleCompletion(entryKey, dateKey) {
      if (!entryKey) return;
      const wasComplete = !!comps[entryKey];

      if (wasComplete) {
        delete comps[entryKey];
        await removeCompletion(entryKey);
      } else {
        const record = {
          completedAt: firebase.database.ServerValue.TIMESTAMP,
          completedBy: 'tracker'
        };
        if (dateKey < today) {
          record.isLate = true;
          record.pointsOverride = settings?.pastDueCreditPct ?? 75;
        }
        const pendingVal = pendingSliderOverride?.entryKey === entryKey ? pendingSliderOverride.value : null;
        const savedVal = (schedule[dateKey] || {})[entryKey]?.pointsOverride;
        const overrideVal = pendingVal ?? savedVal ?? null;
        if (overrideVal != null && overrideVal !== 100) {
          record.pointsOverride = overrideVal;
        }
        pendingSliderOverride = null;
        comps[entryKey] = record;
        await writeCompletion(entryKey, record);
      }

      render();
    }
```

- [ ] **Step 3: Verify in browser**

Open `tracker.html`. Expected:
- Tapping an Upcoming card toggles it to Done (card moves to Done section, status badge changes)
- Tapping a Done card toggles it back to Upcoming
- Tapping an Overdue card marks it done (moves to Done section, status shows "Done Late")
- Long-pressing any card still opens the detail sheet
- Skipped/cooldown cards (no `data-entry-key`) are not tappable

- [ ] **Step 4: Commit**

```bash
git add tracker.html
git commit -m "feat(tracker): tap-to-complete on tracker cards with late penalty for past dates"
```

---

## Task 6: Bump SW cache + deploy

**Files:**
- Modify: `sw.js` (line 165)

- [ ] **Step 1: Bump the cache version**

In `sw.js`, find:
```javascript
const CACHE_NAME = 'family-hub-v77';
```
Change to:
```javascript
const CACHE_NAME = 'family-hub-v78';
```

- [ ] **Step 2: Commit and push**

```bash
git add sw.js
git commit -m "feat(tracker): bump SW cache to v78 after tracker redesign"
git push origin main
```

- [ ] **Step 3: Verify deployment**

Open `https://jansky-family-app.pages.dev/tracker` in browser (hard refresh to pick up new SW). Confirm:
- 2-row top chrome (period label + compact toggle / person pills + filter chip)
- Weekly view: Overdue / Upcoming / Done / Skipped sections
- Monthly view: week groups with "X/Y done" meta, red when overdue
- Tap to complete works
- Swipe navigation changes the period

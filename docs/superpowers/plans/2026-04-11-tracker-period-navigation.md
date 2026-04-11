# Tracker Period Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add past/future week and month navigation to the tracker page via arrow buttons, a Today snap-back button, and horizontal swipe.

**Architecture:** Replace the const date-range variables in `tracker.html` with a mutable `periodAnchor` state. Compute the active range per render. Wire up arrow buttons, a Today button, and a swipe handler (all bound to the single `main` element) that shift `periodAnchor` by ±1 week or ±1 calendar month and re-render. Switching tabs resets the anchor. Suppress "Skipped" detection for future periods. No schema changes, no new files, one small CSS block.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database (compat SDK), plain CSS. No build step, no test framework. Verification is manual browser testing per project convention.

**Spec:** `docs/superpowers/specs/2026-04-11-tracker-period-navigation-design.md`

---

## Context for the implementer

- **No test framework.** The project has no npm, no build step, and no test suite. "Tests" in this plan are manual browser verification steps.
- **Deploy flow:** `git push origin main` auto-deploys via Cloudflare Pages. For local dev, open `tracker.html` directly in a browser — it connects to the live Firebase database.
- **Service worker cache:** The SW caches the app shell. When iterating locally, hard-reload (Ctrl+Shift+R) or use DevTools "Disable cache" in the Network tab, otherwise you'll see stale JS/CSS. You do NOT need to bump `CACHE_NAME` in `sw.js` for this change — no files are added or renamed.
- **Commit style:** Follow the existing convention visible in `git log --oneline` — Conventional Commits (`fix(tracker): …`, `feat(tracker): …`, `style: …`).
- **Single file for the logic:** All JavaScript changes are in `tracker.html` (it's an ES module inline script). Only CSS goes in `styles/tracker.css`.
- **Existing patterns to mirror:**
  - Day swipe: `dashboard.js:477-490`
  - Month swipe with sheet guard: `calendar.html:1007-1022`
  - Calendar month-nav buttons (visual reference for styling): look at calendar's period header rendering.

---

### Task 1: Introduce `periodAnchor` state and a range helper

**Files:**
- Modify: `tracker.html` (~lines 79-83)

Replace the four constant date-range vars with a mutable anchor and a per-render range helper. The rest of the file will be updated in subsequent tasks to read from the helper.

- [ ] **Step 1: Replace the const date ranges**

In `tracker.html`, find this block (around line 79-83):

```javascript
    // ── Date ranges ──
    const wStart = weekStart(today);
    const wEnd = weekEnd(today);
    const mStart = monthStart(today);
    const mEnd = monthEnd(today);
```

Replace it with:

```javascript
    // ── Period anchor (in-memory only, resets to today on reload) ──
    let periodAnchor = today;

    function currentRange() {
      if (activeView === 'weekly') {
        return { start: weekStart(periodAnchor), end: weekEnd(periodAnchor) };
      }
      return { start: monthStart(periodAnchor), end: monthEnd(periodAnchor) };
    }
```

- [ ] **Step 2: Verify the file still parses**

Open `tracker.html` in a browser with DevTools open. It will likely show runtime errors about `wStart`, `wEnd`, `mStart`, `mEnd` being undefined — that is expected and will be fixed in Task 2. The goal of this step is only to confirm there is no syntax error.

Expected: Page loads far enough to start executing the module script; the errors mention undefined `wStart`/`wEnd`/`mStart`/`mEnd`, not a SyntaxError.

- [ ] **Step 3: Do NOT commit yet**

This task intentionally leaves the file in a broken runtime state. Task 2 fixes it, and both tasks commit together at the end of Task 2.

---

### Task 2: Read the range from `currentRange()` in the render functions

**Files:**
- Modify: `tracker.html` — `renderWeeklyView`, `renderMonthlyView`, `renderPeriodLabel`

Update all three functions to call `currentRange()` instead of reading the removed constants.

- [ ] **Step 1: Update `renderWeeklyView`**

Find (around line 335):

```javascript
    function renderWeeklyView() {
      const rows = collectRows('weekly', wStart, wEnd);
      const skipped = findSkippedTasks('weekly', wStart, wEnd, rows);
```

Replace with:

```javascript
    function renderWeeklyView() {
      const { start, end } = currentRange();
      const rows = collectRows('weekly', start, end);
      const skipped = findSkippedTasks('weekly', start, end, rows);
```

- [ ] **Step 2: Update `renderMonthlyView`**

Find (around line 362):

```javascript
    function renderMonthlyView() {
      const rows = collectRows('monthly', mStart, mEnd);
      const skipped = findSkippedTasks('monthly', mStart, mEnd, rows);
```

Replace with:

```javascript
    function renderMonthlyView() {
      const { start, end } = currentRange();
      const rows = collectRows('monthly', start, end);
      const skipped = findSkippedTasks('monthly', start, end, rows);
```

- [ ] **Step 3: Update `renderPeriodLabel`**

Find (around line 409):

```javascript
    function renderPeriodLabel() {
      if (activeView === 'weekly') {
        return `${formatDateShort(wStart)} – ${formatDateShort(wEnd)}`;
      }
      const monthName = new Date(mStart + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return monthName;
    }
```

Replace with:

```javascript
    function renderPeriodLabel() {
      const { start, end } = currentRange();
      if (activeView === 'weekly') {
        return `${formatDateShort(start)} – ${formatDateShort(end)}`;
      }
      const monthName = new Date(start + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return monthName;
    }
```

- [ ] **Step 4: Verify tracker renders again**

Hard-reload `tracker.html` in the browser. Expected: tracker loads the current week's rows (weekly view) or current month (monthly view), identical to before. No console errors. The period label reads e.g. `Apr 5 – Apr 11` or `April 2026`.

- [ ] **Step 5: Commit**

```bash
git add tracker.html
git commit -m "refactor(tracker): replace const date ranges with periodAnchor state

No behavior change. Prepares for upcoming period navigation by moving
week/month range computation to a render-time helper."
```

---

### Task 3: Suppress skipped-task detection for future periods

**Files:**
- Modify: `tracker.html` — `renderWeeklyView`, `renderMonthlyView`

A task not yet placed in a future week is "unplaced", not "skipped". Flagging it as Skipped would confuse the user. Suppress the skipped pass when the range starts after today.

- [ ] **Step 1: Guard `findSkippedTasks` in `renderWeeklyView`**

Find the updated block from Task 2:

```javascript
    function renderWeeklyView() {
      const { start, end } = currentRange();
      const rows = collectRows('weekly', start, end);
      const skipped = findSkippedTasks('weekly', start, end, rows);
```

Replace with:

```javascript
    function renderWeeklyView() {
      const { start, end } = currentRange();
      const rows = collectRows('weekly', start, end);
      const skipped = start > today ? [] : findSkippedTasks('weekly', start, end, rows);
```

- [ ] **Step 2: Guard `findSkippedTasks` in `renderMonthlyView`**

Same change in `renderMonthlyView`:

```javascript
    function renderMonthlyView() {
      const { start, end } = currentRange();
      const rows = collectRows('monthly', start, end);
      const skipped = start > today ? [] : findSkippedTasks('monthly', start, end, rows);
```

- [ ] **Step 3: Verify current period still shows skipped tasks**

Hard-reload the tracker. On the current week, any existing "Skipped" badges should still appear. (If there are none for your test data, skip to the next step — this step is only a regression check.)

- [ ] **Step 4: Commit**

```bash
git add tracker.html
git commit -m "refactor(tracker): suppress skipped detection for future periods

Prepares for period navigation: 'Skipped' only makes sense for the
current period and earlier. Future periods with unplaced tasks should
not surface them as skipped."
```

---

### Task 4: Add `shiftPeriod` and `snapToToday`

**Files:**
- Modify: `tracker.html` — insert just below `currentRange()` (top of module, near line 90)

These are pure state mutators. They update `periodAnchor` and call `render()`.

- [ ] **Step 1: Add the helpers**

Directly below the `currentRange` function added in Task 1, add:

```javascript
    function shiftPeriod(delta) {
      // delta is -1 (previous) or +1 (next)
      if (activeView === 'weekly') {
        periodAnchor = addDays(periodAnchor, delta * 7);
      } else {
        // Step to the adjacent calendar month, then normalise to its start
        // so repeated taps are stable regardless of month length.
        const anchor = monthStart(periodAnchor);
        const stepped = delta < 0
          ? addDays(anchor, -1)                 // day before this month's start
          : addDays(monthEnd(anchor), 1);       // day after this month's end
        periodAnchor = monthStart(stepped);
      }
      render();
    }

    function snapToToday() {
      periodAnchor = today;
      render();
    }
```

- [ ] **Step 2: Do a one-off smoke test from the browser console**

Reload the tracker, open DevTools console, and run:

```javascript
// These are module-scope, not on window — use a debugger-style check instead.
// From the tracker tab's inline script you cannot access them from the console,
// so the smoke test is: call shiftPeriod via the arrow buttons (wired in Task 6).
// Skip the smoke test and move on — manual verification happens in Task 6.
```

Expected: no change yet; `shiftPeriod` and `snapToToday` exist but nothing calls them. The page should still render the current period correctly.

- [ ] **Step 3: Commit**

```bash
git add tracker.html
git commit -m "feat(tracker): add shiftPeriod and snapToToday helpers

Unused until Task 5 wires up the UI."
```

---

### Task 5: Render the period header with nav buttons

**Files:**
- Modify: `tracker.html` — inside `render()` (around line 423-440)

Replace the single `<div class="tracker-period">` with a three-button header.

- [ ] **Step 1: Update the `render()` HTML**

Find (around line 423):

```javascript
    function render() {
      const weeklyActive = activeView === 'weekly' ? ' tracker-tab--active' : '';
      const monthlyActive = activeView === 'monthly' ? ' tracker-tab--active' : '';

      let html = `
        <div class="tracker-tabs">
          <button class="tracker-tab${weeklyActive}" data-view="weekly" type="button">Weekly</button>
          <button class="tracker-tab${monthlyActive}" data-view="monthly" type="button">Monthly</button>
        </div>
        <div class="tracker-period">${renderPeriodLabel()}</div>
        ${renderPersonFilter(people, activePerson)}
```

Replace the `tracker-period` line with:

```javascript
        <div class="tracker-period">
          <button class="tracker-period__nav" data-period-nav="prev" type="button" aria-label="Previous">◀</button>
          <span class="tracker-period__label">${renderPeriodLabel()}</span>
          <button class="tracker-period__nav" data-period-nav="next" type="button" aria-label="Next">▶</button>
          <button class="tracker-period__today" data-period-nav="today" type="button">Today</button>
        </div>
```

- [ ] **Step 2: Hard-reload and verify the buttons appear**

Expected: the period label now has `◀` and `▶` next to it and a `Today` button on the right. Clicking them does nothing yet (handlers come in Task 6). Unstyled buttons are fine — styling comes in Task 8.

- [ ] **Step 3: Commit**

```bash
git add tracker.html
git commit -m "feat(tracker): render period header with prev/next/today buttons

Markup only; handlers and styling land in the next two tasks."
```

---

### Task 6: Bind the period nav button clicks

**Files:**
- Modify: `tracker.html` — inside `bindEvents()` (around line 452)

- [ ] **Step 1: Add the click handler binding**

Find the end of `bindEvents()` — the last `for` loop handles long-press on tracker rows. Add the new block *before* that long-press loop so the control buttons are wired whenever rows are re-rendered. Place this block right after the Status filter `if (statusSelect) { ... }` block (around line 489):

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

- [ ] **Step 2: Manual verification — weekly navigation**

Hard-reload the tracker in weekly mode. Click `◀` three times. Expected: period label shows a week three weeks in the past; rows reflect that older range; summary bar updates counts.

Click `Today`. Expected: label snaps back to the current week.

Click `▶` once. Expected: label shows next week; rows (if any scheduled) appear.

- [ ] **Step 3: Manual verification — monthly navigation**

Switch to Monthly tab. Click `◀` once. Expected: label shows the previous month name/year. Click `◀` 12 more times. Expected: label correctly lands in the same month of the previous year (e.g. `April 2026` → `March 2025` after 13 presses).

Click `Today`. Expected: snaps to current month.

- [ ] **Step 4: Manual verification — skipped suppression**

In weekly mode, click `▶` to advance to a future week. Expected: no "Skipped" badges are displayed even if active unscheduled tasks exist. Click `◀` back to the current or a past week. Expected: if any skipped tasks exist in your data, they reappear.

- [ ] **Step 5: Commit**

```bash
git add tracker.html
git commit -m "feat(tracker): wire prev/next/today buttons to period navigation

Arrow buttons shift the period by one week or one calendar month. The
Today button snaps back to the period containing today."
```

---

### Task 7: Reset `periodAnchor` on tab switch + add swipe handler

**Files:**
- Modify: `tracker.html` — tab click handler (around line 455) and just before the final `render()` call at the bottom (around line 915)

The tab reset is a one-line addition. The swipe handler must be bound **once** to the stable `main` element — not inside `bindEvents()`, which runs on every render and would stack listeners.

- [ ] **Step 1: Reset `periodAnchor` when switching tabs**

Find the tab click handler in `bindEvents()`:

```javascript
      // View tabs
      for (const tab of main.querySelectorAll('.tracker-tab')) {
        tab.addEventListener('click', () => {
          activeView = tab.dataset.view;
          saveTrackerPrefs();
          render();
        });
      }
```

Add a `periodAnchor = today;` line:

```javascript
      // View tabs
      for (const tab of main.querySelectorAll('.tracker-tab')) {
        tab.addEventListener('click', () => {
          activeView = tab.dataset.view;
          periodAnchor = today;  // Reset to current period on tab switch
          saveTrackerPrefs();
          render();
        });
      }
```

- [ ] **Step 2: Add the swipe handler (bound once)**

Find the bottom of the module script (around line 910-915):

```javascript
    // ── Show content ──
    document.getElementById('loadingState').style.display = 'none';
    const main = document.getElementById('mainContent');
    main.style.display = '';
    render();
```

Insert the swipe handler **between** `main.style.display = '';` and `render();`:

```javascript
    // ── Show content ──
    document.getElementById('loadingState').style.display = 'none';
    const main = document.getElementById('mainContent');
    main.style.display = '';

    // ── Swipe to change period ──
    // Bound once to the stable `main` element (its innerHTML is replaced per
    // render, but the node itself persists). Do NOT move this into bindEvents
    // or listeners will stack on every render.
    let swipeStartX = 0;
    let swipeStartY = 0;
    main.addEventListener('touchstart', (e) => {
      if (e.target.closest('#taskSheetMount') || e.target.closest('.bottom-sheet')) return;
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    }, { passive: true });
    main.addEventListener('touchend', (e) => {
      if (e.target.closest('#taskSheetMount') || e.target.closest('.bottom-sheet')) return;
      const dx = e.changedTouches[0].clientX - swipeStartX;
      const dy = e.changedTouches[0].clientY - swipeStartY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        shiftPeriod(dx < 0 ? 1 : -1);
      }
    }, { passive: true });

    render();
```

- [ ] **Step 3: Manual verification — tab reset**

Hard-reload the tracker. In Weekly mode click `◀` four times (now four weeks in the past). Switch to the Monthly tab. Expected: the monthly view opens on the **current** month, not the month containing "four weeks ago".

- [ ] **Step 4: Manual verification — swipe gesture**

Open DevTools and switch to mobile emulation (device toolbar, iPhone preset is fine). Touch-drag horizontally across the tracker rows. Expected: swiping right moves to the previous period, swiping left moves to the next. Short or vertical drags do nothing.

Open a long-press detail sheet on any row, then try to swipe horizontally *inside the sheet*. Expected: the period does not change.

- [ ] **Step 5: Commit**

```bash
git add tracker.html
git commit -m "feat(tracker): reset period on tab switch and add swipe navigation

Swipe handler is bound once to the stable main element to avoid listener
stacking on re-render. Taps inside the detail bottom sheet are excluded."
```

---

### Task 8: Style the period header

**Files:**
- Modify: `styles/tracker.css`

Current `.tracker-period` is a plain text line. It now contains four children (two arrows, a label span, and a Today button) and needs flexbox layout plus button styling.

- [ ] **Step 1: Find the existing `.tracker-period` rule**

Open `styles/tracker.css` and locate the `.tracker-period` selector. Read the current rule so the new rules match the file's style (spacing, variable names).

- [ ] **Step 2: Update `.tracker-period` to be a flex container**

Replace the existing `.tracker-period` rule with (merge any existing margin/font-size properties into the new rule — do not remove them):

```css
.tracker-period {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0.5rem 0 0.75rem;
  font-size: var(--font-size-md);
  color: var(--text-secondary);
}

.tracker-period__label {
  min-width: 10ch;
  text-align: center;
  font-weight: 600;
  color: var(--text-primary);
}

.tracker-period__nav {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  line-height: 1;
}

.tracker-period__nav:hover,
.tracker-period__nav:focus-visible {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.05));
  color: var(--text-primary);
  outline: none;
}

.tracker-period__today {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--border-color, var(--text-secondary));
  color: var(--text-secondary);
  font-size: 0.8125rem;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
}

.tracker-period__today:hover,
.tracker-period__today:focus-visible {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.05));
  color: var(--text-primary);
  outline: none;
}
```

If any of the CSS variables above (`--bg-secondary`, `--border-color`, `--radius-sm`) don't exist in `styles/base.css`, the `var(…, fallback)` second argument handles it — verify by searching `styles/base.css` for `--bg-secondary` and `--border-color`. If they exist, the fallbacks are inert; if they don't, the fallbacks kick in. No further change needed either way.

- [ ] **Step 3: Hard-reload and visually check**

Expected: the period header is a single centered row with `◀ Apr 5 – Apr 11 ▶` centered and a `Today` pill pushed to the right side (because of `margin-left: auto` on `.tracker-period__today`). Hover states highlight subtly. Tap targets feel finger-sized.

If the `Today` button sitting on the right looks odd paired with centered arrows, a reasonable alternative is to move it to the left — either is fine. The spec did not mandate a position. Pick whichever looks better and leave a short note in the commit message.

- [ ] **Step 4: Responsive check at 400px width**

In DevTools device toolbar, set the viewport to 400px wide. Expected: the header still fits on one line without wrapping; the label does not collide with the Today button. If it wraps, reduce `.tracker-period__label` min-width to `8ch` or drop the label's `min-width` entirely.

- [ ] **Step 5: Commit**

```bash
git add styles/tracker.css
git commit -m "style(tracker): layout for period navigation header

Flex row with arrow buttons around the period label and a Today snap
button on the right. Uses existing color and radius tokens with
inline fallbacks for any not defined in base.css."
```

---

### Task 9: End-to-end verification walkthrough

**Files:** none — this is a manual test pass.

Run through the full test matrix from the spec. If any step fails, stop and fix before moving on.

- [ ] **Step 1: Reload starts on today**

Hard-reload tracker.html. Expected: weekly view on the current week, monthly on the current month.

- [ ] **Step 2: Weekly back 3 / forward 3**

In Weekly mode, click `◀` three times, then `▶` three times. Expected: label and rows return to the original current-week state; summary counts match the initial load.

- [ ] **Step 3: Today button snaps back**

Click `◀` five times, then `Today`. Expected: period label matches the current week.

- [ ] **Step 4: Monthly cross-year navigation**

Switch to Monthly tab (should land on current month). Click `◀` 12 times. Expected: lands on the same month one year earlier (e.g. `April 2026` → `April 2025`). Click `◀` once more. Expected: `March 2025`. This verifies the month-stepping math is stable across year boundaries and doesn't skip or duplicate months.

- [ ] **Step 5: Tab switch resets**

In Weekly mode click `◀` 4 times. Switch to Monthly. Expected: lands on the current month, not March.

- [ ] **Step 6: Skipped-task visibility**

In Weekly mode, navigate to the current week. If any "Skipped" badges are visible, note the count. Click `▶` once. Expected: those skipped badges are gone. Click `◀` back to the current week. Expected: they reappear.

- [ ] **Step 7: Filters persist across navigation**

Select a person filter. Navigate to a past week. Expected: the person filter stays active and filters the past week's rows.

- [ ] **Step 8: Long-press on a past-week row**

Navigate back one week. Long-press any row. Expected: detail sheet opens for that row. Close it.

- [ ] **Step 9: Swipe inside the bottom sheet is inert**

Open the detail sheet, then touch-swipe horizontally inside the sheet. Expected: period does not change.

- [ ] **Step 10: Swipe gesture on rows**

Close all sheets. In mobile-emulation mode, drag horizontally across the rows list. Expected: period advances or rewinds by one unit per swipe.

- [ ] **Step 11: Reload after navigating**

Navigate three weeks into the past, then hard-reload. Expected: snaps back to the current week (no persistence).

- [ ] **Step 12: Final commit (if any fixes were needed)**

If any step above required a code fix, commit it:

```bash
git add tracker.html styles/tracker.css
git commit -m "fix(tracker): <specific issue found during verification>"
```

Otherwise this task produces no commit.

---

## Rollout

- No service worker cache bump is needed — `sw.js` cache list is keyed on filenames, and only existing files (`tracker.html`, `styles/tracker.css`) are modified.
- No schema migration.
- No data backfill.
- Deploy by pushing to `main` (Cloudflare Pages auto-deploys).
- After deploy, do one post-deploy sanity check on the live site: open the tracker, click `◀` once, click `Today`. Confirm the period changes and snaps back. This catches any SW cache oddity on a real device.

---

## Out of scope (documented for reference)

- No date picker — arrow buttons + Today button only.
- No keyboard shortcuts.
- No persistence — reload always returns to today.
- No animated transitions between periods.
- No "Jump to period containing event X" feature.

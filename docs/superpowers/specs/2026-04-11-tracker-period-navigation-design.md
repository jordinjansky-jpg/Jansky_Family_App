# Tracker Period Navigation — Design

**Date:** 2026-04-11
**Scope:** `tracker.html`

## Goal

Let users navigate to past and future weeks/months on the tracker page, the same way they already can on the dashboard (day swipe) and calendar (month swipe). Today, the tracker is locked to the current week or month — useful for "am I on track right now?" but not for reviewing past performance or previewing upcoming work.

## User-facing behavior

- Above the tracker rows, the period label (e.g. `Apr 5 – Apr 11` for weekly, `April 2026` for monthly) is flanked by `◀` and `▶` buttons and followed by a **Today** button.
- Tapping `◀` shifts the view back one week (weekly mode) or one calendar month (monthly mode). Tapping `▶` shifts forward by the same amount.
- Horizontal swipe anywhere on the tracker content has the same effect: swipe right → previous period, swipe left → next period.
- The **Today** button snaps the view back to the period containing today. It is always visible (not hidden when already on today) so the affordance is discoverable.
- Switching the Weekly/Monthly tab always resets to the current week or current month. So jumping from "three weeks ago" on the weekly view to the monthly view does not drop you into "March" — it drops you into "April" (the month containing today).
- Filters (person, category, status) are preserved across period navigation.
- The position is session-only — reloading the page snaps back to today. This matches dashboard and calendar.

## Implementation

Single file: `tracker.html`. No CSS file, no schema, no new modules.

### State

Replace the four `const` date-range variables at [tracker.html:80-83](tracker.html#L80-L83) with a mutable `periodAnchor` date key that starts at `today`:

```js
let periodAnchor = today;
```

Date ranges are computed per-render from `periodAnchor`:

```js
function currentRange() {
  if (activeView === 'weekly') {
    return { start: weekStart(periodAnchor), end: weekEnd(periodAnchor) };
  }
  return { start: monthStart(periodAnchor), end: monthEnd(periodAnchor) };
}
```

`renderWeeklyView`, `renderMonthlyView`, and `renderPeriodLabel` read from `currentRange()` instead of the removed constants.

### Period shift

```js
function shiftPeriod(delta) {
  // delta: -1 or +1
  if (activeView === 'weekly') {
    periodAnchor = addDays(periodAnchor, delta * 7);
  } else {
    // Jump to previous/next calendar month. Use the current month's start,
    // then step one day before/after to land in the adjacent month, then
    // re-normalize to that month's start so repeated taps are stable.
    const anchor = monthStart(periodAnchor);
    const stepped = delta < 0 ? addDays(anchor, -1) : addDays(monthEnd(anchor), 1);
    periodAnchor = monthStart(stepped);
  }
  render();
}

function snapToToday() {
  periodAnchor = today;
  render();
}
```

Stepping month-by-month using `monthStart → addDays(-1) → monthStart` avoids the "add 30 days" trap where February would land on March 2nd.

### Period header markup

Replace the current single-line label at [tracker.html:428](tracker.html#L428):

```js
// was: <div class="tracker-period">${renderPeriodLabel()}</div>
<div class="tracker-period">
  <button class="tracker-period__nav" data-period-nav="prev" type="button" aria-label="Previous">◀</button>
  <span class="tracker-period__label">${renderPeriodLabel()}</span>
  <button class="tracker-period__nav" data-period-nav="next" type="button" aria-label="Next">▶</button>
  <button class="tracker-period__today" data-period-nav="today" type="button">Today</button>
</div>
```

### Event binding

Add to `bindEvents()`:

```js
for (const btn of main.querySelectorAll('[data-period-nav]')) {
  btn.addEventListener('click', () => {
    const nav = btn.dataset.periodNav;
    if (nav === 'prev') shiftPeriod(-1);
    else if (nav === 'next') shiftPeriod(1);
    else if (nav === 'today') snapToToday();
  });
}
```

### Tab switch reset

In the existing tab-click handler ([tracker.html:455-459](tracker.html#L455-L459)):

```js
tab.addEventListener('click', () => {
  activeView = tab.dataset.view;
  periodAnchor = today;  // NEW — reset to current period on tab switch
  saveTrackerPrefs();
  render();
});
```

### Swipe handler

Add once (outside `bindEvents`, near the bottom of the module alongside the `render()` call at [tracker.html:915](tracker.html#L915)) so it is bound a single time to the stable `main` element:

```js
let swipeStartX = 0;
let swipeStartY = 0;
main.addEventListener('touchstart', (e) => {
  // Ignore swipes that originate inside the bottom sheet
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
```

Thresholds match dashboard ([dashboard.js:487](dashboard.js#L487)) and calendar ([calendar.html:1019](calendar.html#L1019)) for consistency. Binding once on `main` (which re-renders its `innerHTML` but persists as a node) avoids rebinding the handler every render.

### Skipped-task suppression for future periods

In `renderWeeklyView` and `renderMonthlyView`, skip the `findSkippedTasks` call when the period start is after today:

```js
const { start, end } = currentRange();
const rows = collectRows('weekly', start, end);
const skipped = start > today ? [] : findSkippedTasks('weekly', start, end, rows);
```

Rationale: a task that isn't on next week's schedule hasn't been skipped — it may simply not be placed yet (cooldown, rotation). Flagging it as "Skipped" would be alarming and wrong. For the current period and any past period the existing meaning still holds.

### Styling

Minimal CSS in `styles/tracker.css` for the new `.tracker-period__nav` and `.tracker-period__today` buttons. Use existing color tokens (`--text-secondary`, `--accent`) and match the visual weight of the existing `.tracker-period` text. The exact rules will come out of the implementation plan; no new variables needed.

## Non-goals / explicit exclusions

- No persistence of the period offset. Reload = today. This is intentional and matches dashboard/calendar.
- No "jump to date" picker. Arrows + Today button are sufficient; a picker can be added later if users ask.
- No keyboard shortcuts. Dashboard and calendar don't have them either.
- No visual indicator of "you are N weeks away from today." The label itself plus the always-visible Today button is enough.
- No animated transition between periods — existing full-re-render pattern is kept.

## Risks

- **Swipe conflict with bottom sheet.** Mitigated by the `.bottom-sheet` / `#taskSheetMount` guard in the swipe handler, mirroring calendar's existing pattern.
- **Row long-press vs. horizontal swipe.** Not a real conflict: long-press fires on a stationary pointer, swipe requires horizontal movement >60px. Both dashboard and calendar have long-press + swipe coexisting already.
- **Skipped logic.** The suppression rule is simple (`start > today`) but worth manually verifying against a period that straddles today — e.g. the current week should still show skipped tasks, and navigating forward one week should stop showing them.

## Testing

Manual, since there's no test suite:

1. Load tracker in weekly view → label shows current week, `◀ ▶ Today` visible.
2. Tap `◀` three times → label shows 3 weeks ago, rows reflect that range, summary updates.
3. Tap `Today` → snaps back to current week.
4. Swipe left → advances one week forward (future).
5. Switch to Monthly tab → resets to current month even though weekly was on a past week.
6. In monthly view, tap `◀` 13 times → should land on March of the previous year, not a broken date.
7. Navigate to a future period → no "Skipped" chips visible.
8. Navigate to a past period → "Skipped" chips still appear for tasks that were genuinely never placed.
9. Open bottom sheet on a past row → swiping inside the sheet does not change period.
10. Person/category/status filters persist across period navigation.

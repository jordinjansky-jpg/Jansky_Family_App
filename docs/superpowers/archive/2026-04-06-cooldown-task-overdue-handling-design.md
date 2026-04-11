# Cooldown Task Overdue Handling

**Date**: 2026-04-06
**Status**: Approved

## Problem

When a cooldown task (any rotation with `cooldownDays > 0`) is not completed on its scheduled date:

1. **Weekly/monthly cooldown tasks** show as overdue, but future instances remain on the schedule at their original dates. If the user completes the overdue task late, the next scheduled instance may violate the cooldown window (too soon after actual completion).
2. **Daily cooldown tasks** are excluded from overdue entirely (`rotationType !== 'daily'` filter). Missed ones silently disappear — the user gets no visibility.
3. **Future instances render normally** even while an older instance is overdue, which is confusing — the user sees the same task both overdue and upcoming.

## Solution: Display-time suppression + completion-anchored rebuild

Three coordinated changes enforce the rule: **one active instance at a time for cooldown tasks, with cooldown measured from actual completion.**

### 1. Display-time suppression of future cooldown entries

While a cooldown task has an uncompleted entry on a past date, all future instances of that task are suppressed from rendering.

**Changes to `shared/state.js`:**

- New export: `getOverdueCooldownTaskIds(schedule, completions, tasks, today)` — returns a `Set<taskId>` of cooldown tasks that have at least one uncompleted schedule entry on a past date. Covers all rotation types (daily, weekly, monthly).
- Pages (dashboard, calendar, kid mode) call this alongside existing `getOverdueEntries` and filter out any entry whose `taskId` is in the returned set before rendering a day's tasks.

**What "suppress" means:** The entry stays in the schedule (Firebase unchanged). It is not rendered. The overdue banner shows the original missed entry. Once completed, the rebuild (section 2) replaces stale entries with correctly-spaced ones.

### 2. Targeted single-task rebuild on completion

When a cooldown task is completed (including from the overdue banner), delete its stale future schedule entries and re-place them anchored from the actual completion date.

**Changes to `shared/scheduler.js`:**

- New export: `rebuildSingleTaskSchedule(taskId, task, anchorDate, existingSchedule, completions, people, settings, allTasks)`.
- Returns a flat updates object: `{ 'schedule/YYYY-MM-DD/entryKey': entry | null }`.
  - `null` values delete stale future entries for this task.
  - New entries are placed starting from `anchorDate + cooldownDays + 1`.
- Internally:
  1. Scans `existingSchedule` for all entries with matching `taskId` on dates after `anchorDate` and marks them for deletion (null).
  2. Calls the appropriate placement function (`placeDailyTask` / `placeWeeklyTask` / `placeMonthlyTask`) for this single task, using `anchorDate` as the last-placed reference point.
  3. Merges new entries into the updates object.
- Load balancing is preserved: the full `existingSchedule` (minus the stale entries being deleted) is visible to `findLightestDay` and `balanceCtx`, so day selection and owner assignment respect the real load across all other tasks.

**Changes to completion surfaces — `dashboard.js`, `calendar.html`, `kid.html`:**

- After `writeCompletion`, check if the completed entry's task has `cooldownDays > 0`. If so:
  - Call `rebuildSingleTaskSchedule` with today's date as the anchor.
  - `multiUpdate` the returned updates object.
  - Reload schedule data and re-render.
- Undo path: if un-completing a cooldown task, trigger another rebuild with no anchor override. The scheduler falls back to normal placement logic, restoring the original cadence as if the task was never completed late.

**Why anchor from completion date:** The cooldown should measure from when the work was actually done, not when it was originally scheduled. Since completion always happens "now," the anchor is always today.

### 3. Daily+cooldown tasks included in overdue

Daily tasks with `cooldownDays > 0` should appear in the overdue banner when missed, rather than being silently excluded.

**Change to `shared/state.js` — `getOverdueEntries`:**

Current filter:
```js
if (!isComplete(entryKey, completions) && entry.rotationType !== 'daily')
```

New filter:
```js
if (!isComplete(entryKey, completions) && (entry.rotationType !== 'daily' || hasCooldown(entry, tasks)))
```

Where `hasCooldown` looks up the task by `entry.taskId` in `tasks` and returns `task.cooldownDays > 0`.

**Signature change:** `getOverdueEntries` gains a `tasks` parameter. All callers (dashboard, calendar, kid mode, tracker) already have `tasks` in scope.

**What stays unchanged:** Regular daily tasks (no cooldown) remain excluded from overdue. They repeat every day — showing them as overdue makes no sense. Only daily+cooldown tasks get this treatment since they behave like weekly/monthly in terms of spacing.

## Files affected

| File | Change |
|------|--------|
| `shared/state.js` | New `getOverdueCooldownTaskIds` export; modify `getOverdueEntries` filter + signature |
| `shared/scheduler.js` | New `rebuildSingleTaskSchedule` export |
| `dashboard.js` | Suppress future cooldown entries in render; trigger rebuild on cooldown task completion/undo |
| `calendar.html` | Same suppression + rebuild logic |
| `kid.html` | Same suppression + rebuild logic |
| `tracker.html` | Pass `tasks` to updated `getOverdueEntries` signature |

## Edge cases

- **Undo after completion**: Un-completing triggers a rebuild that restores original cadence. Schedule returns to pre-completion state.
- **Multiple overdue instances**: If a cooldown task is missed across multiple periods (e.g., missed 2 weeks in a row), only the oldest overdue entry matters — all future instances stay suppressed until the oldest is completed. On completion, rebuild anchors from today regardless.
- **Task with no cooldown**: Unaffected. No suppression, no rebuild-on-completion. Existing behavior preserved.
- **One-time tasks with cooldown**: Not applicable — one-time tasks have no future instances to suppress or rebuild. `cooldownDays` on a one-time task is a no-op.
- **Completion on future dates**: Users can complete tasks on any date (no future-date blocking per CLAUDE.md). The anchor date for rebuild is still today (the date the completion action was taken).

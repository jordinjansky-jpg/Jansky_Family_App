# Cooldown Task Overdue Handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one-active-instance-at-a-time for cooldown tasks: suppress future instances while overdue, rebuild from actual completion date on complete.

**Architecture:** Three changes — (1) `state.js` gets updated overdue filter + new suppression helper, (2) `scheduler.js` gets a single-task rebuild function, (3) all three completion surfaces (dashboard, calendar, kid) add suppression filtering and post-completion rebuild.

**Tech Stack:** Vanilla JS (ES modules), Firebase Realtime Database (compat SDK)

---

### Task 1: Update `getOverdueEntries` to include daily+cooldown tasks

**Files:**
- Modify: `shared/state.js:48-59`

- [ ] **Step 1: Update `getOverdueEntries` signature and filter**

Add `tasks` parameter. Change the filter so daily tasks with cooldown are included in overdue.

```js
// In shared/state.js, replace the existing getOverdueEntries function (lines 48-60):

/**
 * Find overdue entries — past dates with incomplete tasks.
 * Excludes daily tasks UNLESS they have a cooldown (cooldown tasks behave like weekly/monthly).
 * @param {object} schedule - Full schedule { dateKey: { entryKey: entry } }
 * @param {object} completions - All completions
 * @param {string} today - Today's date key (YYYY-MM-DD)
 * @param {object} tasks - All tasks { taskId: taskObject }
 * @returns {Array<{ dateKey, entryKey, ...entry }>} sorted oldest first
 */
export function getOverdueEntries(schedule, completions, today, tasks) {
  const overdue = [];
  if (!schedule) return overdue;
  for (const [dateKey, dayEntries] of Object.entries(schedule)) {
    if (dateKey >= today || !dayEntries) continue;
    for (const [entryKey, entry] of Object.entries(dayEntries)) {
      if (isComplete(entryKey, completions)) continue;
      const isDailyNoCooldown = entry.rotationType === 'daily'
        && !(tasks && tasks[entry.taskId]?.cooldownDays > 0);
      if (!isDailyNoCooldown) {
        overdue.push({ dateKey, entryKey, ...entry });
      }
    }
  }
  return overdue.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
```

- [ ] **Step 2: Verify the change compiles**

Open the app in browser, check console for import errors. No functional test yet — callers still pass 3 args (the new `tasks` param is optional/undefined, which is safe since the `tasks &&` guard handles it).

- [ ] **Step 3: Commit**

```bash
git add shared/state.js
git commit -m "feat: include daily+cooldown tasks in overdue entries"
```

---

### Task 2: Add `getOverdueCooldownTaskIds` to state.js

**Files:**
- Modify: `shared/state.js` (add new export after `getOverdueEntries`)

- [ ] **Step 1: Add the new function**

Append after the `getOverdueEntries` function (after line 60):

```js
/**
 * Get task IDs of cooldown tasks that have an overdue (uncompleted, past-date) entry.
 * Used by pages to suppress future instances of these tasks from rendering.
 * @param {object} schedule - Full schedule { dateKey: { entryKey: entry } }
 * @param {object} completions - All completions
 * @param {object} tasks - All tasks { taskId: taskObject }
 * @param {string} today - Today's date key (YYYY-MM-DD)
 * @returns {Set<string>} taskIds with overdue cooldown entries
 */
export function getOverdueCooldownTaskIds(schedule, completions, tasks, today) {
  const ids = new Set();
  if (!schedule || !tasks) return ids;
  for (const [dateKey, dayEntries] of Object.entries(schedule)) {
    if (dateKey >= today || !dayEntries) continue;
    for (const [entryKey, entry] of Object.entries(dayEntries)) {
      if (isComplete(entryKey, completions)) continue;
      const task = tasks[entry.taskId];
      if (task?.cooldownDays > 0) {
        ids.add(entry.taskId);
      }
    }
  }
  return ids;
}
```

- [ ] **Step 2: Verify no console errors**

Open app in browser. The function is exported but not called yet — just verify no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add shared/state.js
git commit -m "feat: add getOverdueCooldownTaskIds helper for display suppression"
```

---

### Task 3: Add `rebuildSingleTaskSchedule` to scheduler.js

**Files:**
- Modify: `shared/scheduler.js` (add new export before `buildScheduleUpdates` at line 757)

- [ ] **Step 1: Add the rebuild function**

Insert before the `buildScheduleUpdates` function (before line 750):

```js
/**
 * Rebuild future schedule entries for a single cooldown task, anchored from a
 * specific date (typically the actual completion date). Deletes stale future
 * entries and re-places the task using its rotation's placement logic.
 *
 * Returns a flat Firebase multi-update object:
 *   { 'schedule/YYYY-MM-DD/entryKey': entry | null }
 * where null deletes stale entries.
 */
export function rebuildSingleTaskSchedule(taskId, task, anchorDate, existingSchedule, completions, people, settings, allTasks) {
  if (!task || !task.cooldownDays || !settings) return {};

  const timezone = settings.timezone || 'America/Chicago';
  const today = todayKey(timezone);
  const startDate = addDays(anchorDate, 1);
  const endDate = addDays(today, SCHEDULE_DAYS);
  if (startDate > endDate) return {};

  const futureDates = dateRange(startDate, endDate);
  const updates = {};

  // 1. Find and null-out all future entries for this task
  for (const dk of futureDates) {
    const dayEntries = existingSchedule[dk];
    if (!dayEntries) continue;
    for (const [ek, entry] of Object.entries(dayEntries)) {
      if (entry.taskId === taskId) {
        updates[`schedule/${dk}/${ek}`] = null;
      }
    }
  }

  // 2. Build a cleaned existingSchedule (without stale entries for this task)
  //    so placement functions see accurate load from other tasks
  const cleanedSchedule = {};
  for (const [dk, dayEntries] of Object.entries(existingSchedule || {})) {
    if (!dayEntries) continue;
    const cleaned = {};
    for (const [ek, entry] of Object.entries(dayEntries)) {
      // Keep entries from other tasks, and completed entries for this task
      if (entry.taskId !== taskId || (completions && completions[ek])) {
        cleaned[ek] = entry;
      }
    }
    if (Object.keys(cleaned).length > 0) cleanedSchedule[dk] = cleaned;
  }

  // 3. Place the task using its rotation logic
  const newSchedule = {};
  for (const dk of futureDates) {
    newSchedule[dk] = {};
  }

  let keyCounter = 0;
  function nextKey() {
    keyCounter++;
    return `sched_${Date.now()}_${String(keyCounter).padStart(5, '0')}`;
  }

  const weekendWeightWeekly = settings.weekendWeightWeekly ?? settings.weekendWeight ?? 1.5;
  const weekendWeightMonthly = settings.weekendWeightMonthly ?? settings.weekendWeight ?? 3;
  const balanceCtx = { newSchedule, existingSchedule: cleanedSchedule, allTasks };

  // Inject a synthetic entry at anchorDate so placeDailyTask sees it as the
  // most recent placement and spaces cooldown from there.
  // For weekly/monthly, isInCooldown already checks completions + schedule.
  const anchoredSchedule = { ...cleanedSchedule };
  if (!anchoredSchedule[anchorDate]) anchoredSchedule[anchorDate] = {};
  anchoredSchedule[anchorDate] = { ...anchoredSchedule[anchorDate], _cooldownAnchor: { taskId } };

  switch (task.rotation) {
    case 'daily':
      placeDailyTask(taskId, task, futureDates, newSchedule, anchoredSchedule, completions, weekendWeightWeekly, allTasks, nextKey);
      break;
    case 'weekly':
      placeWeeklyTask(taskId, task, futureDates, newSchedule, anchoredSchedule, completions, weekendWeightWeekly, allTasks, nextKey, balanceCtx);
      break;
    case 'monthly':
      placeMonthlyTask(taskId, task, futureDates, newSchedule, anchoredSchedule, completions, weekendWeightMonthly, allTasks, nextKey, balanceCtx);
      break;
  }

  // 4. Merge new entries into updates
  for (const [dk, dayEntries] of Object.entries(newSchedule)) {
    for (const [ek, entry] of Object.entries(dayEntries)) {
      updates[`schedule/${dk}/${ek}`] = entry;
    }
  }

  return updates;
}
```

**Note on cooldown anchoring:** For daily tasks, `placeDailyTask` scans the existing schedule for the most recent entry matching the taskId to set `lastPlacedDate`. By injecting a synthetic entry at `anchorDate` into the schedule copy, the cooldown spacing starts from the anchor date. The synthetic entry has `{ taskId }` which is all `placeDailyTask` checks (line 594: `entry.taskId === taskId`). For weekly/monthly tasks, the same synthetic entry helps `isInCooldown` see a recent "placement" at the anchor date, preventing scheduling too soon after completion.

- [ ] **Step 2: Verify no console errors**

Open app, check for import/syntax issues. Function isn't called yet.

- [ ] **Step 3: Commit**

```bash
git add shared/scheduler.js
git commit -m "feat: add rebuildSingleTaskSchedule for cooldown task completion"
```

---

### Task 4: Wire up dashboard — suppression + rebuild on completion

**Files:**
- Modify: `dashboard.js:1` (imports)
- Modify: `dashboard.js:6` (state import)
- Modify: `dashboard.js:8` (scheduler import)
- Modify: `dashboard.js:135` (loadData)
- Modify: `dashboard.js:141` (render — filter viewEntries)
- Modify: `dashboard.js:500-517` (toggleTask — add rebuild)

- [ ] **Step 1: Update imports**

In `dashboard.js` line 6, add `getOverdueCooldownTaskIds` to the state import:
```js
import { isComplete, filterByPerson, groupByFrequency, dayProgress, getOverdueEntries, getOverdueCooldownTaskIds, isAllDone, sortEntries } from './shared/state.js';
```

In `dashboard.js` line 8, add `rebuildSingleTaskSchedule` to the scheduler import:
```js
import { buildScheduleUpdates, getRotationOwner, rebuildSingleTaskSchedule } from './shared/scheduler.js';
```

- [ ] **Step 2: Add suppressed task tracking and update loadData**

Add a module-level variable near line 71 (after `let overdueItems = [];`):
```js
let suppressedCooldownTaskIds = new Set();
```

Update `loadData` (line 133-136) to compute suppressed IDs and pass `tasks` to `getOverdueEntries`:
```js
async function loadData() {
  const allSched = await readAllSchedule();
  overdueItems = getOverdueEntries(allSched || {}, completions, today, tasks);
  suppressedCooldownTaskIds = getOverdueCooldownTaskIds(allSched || {}, completions, tasks, today);
}
```

- [ ] **Step 3: Filter suppressed entries in render**

In the `render` function (line 141), change:
```js
const filtered = filterByPerson(viewEntries, activePerson);
```
to:
```js
// Filter out future instances of cooldown tasks that have overdue entries
let displayEntries = viewEntries;
if (suppressedCooldownTaskIds.size > 0 && viewDate > today) {
  displayEntries = {};
  for (const [key, entry] of Object.entries(viewEntries)) {
    if (!suppressedCooldownTaskIds.has(entry.taskId)) {
      displayEntries[key] = entry;
    }
  }
}
const filtered = filterByPerson(displayEntries, activePerson);
```

**Important:** Only suppress on future dates (`viewDate > today`). Today's entries should still show. The overdue banner handles past entries.

- [ ] **Step 4: Add cooldown rebuild to toggleTask**

In `toggleTask` (around line 500-517), after the `writeCompletion` call and one-time archive logic, add the cooldown rebuild. Replace the existing `toggleTask` function:

```js
async function toggleTask(entryKey, dateKey) {
  if (!entryKey) return;
  const wasComplete = isComplete(entryKey, completions);

  if (wasComplete) {
    // Uncomplete
    delete completions[entryKey];
    await removeCompletion(entryKey);
    celebrationShown = false;
  } else {
    // Complete
    const record = {
      completedAt: firebase.database.ServerValue.TIMESTAMP,
      completedBy: 'dashboard'
    };
    completions[entryKey] = record;
    await writeCompletion(entryKey, record);
  }

  // Auto-archive one-time tasks on completion
  let archivedTaskId = null;
  if (!wasComplete) {
    const entry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
    if (entry) {
      const task = tasks[entry.taskId];
      if (task && task.rotation === 'once') {
        archivedTaskId = entry.taskId;
        task.status = 'completed';
        await writeTask(entry.taskId, task);
      }
    }
  }

  // Cooldown task rebuild: re-place future entries anchored from today
  const entry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
  if (entry) {
    const task = tasks[entry.taskId];
    if (task?.cooldownDays > 0) {
      const allSched = await readAllSchedule() || {};
      const updates = rebuildSingleTaskSchedule(
        entry.taskId, task, today, allSched, completions, people, settings, tasks
      );
      if (Object.keys(updates).length > 0) {
        await multiUpdate(updates);
      }
    }
  }

  const doRenderAndToast = () => {
```

Note: the rest of the function (from `doRenderAndToast` onward) stays the same. The cooldown rebuild fires on both complete and uncomplete — on uncomplete, it restores the original cadence; on complete, it anchors from today.

- [ ] **Step 5: Update undo handler for cooldown rebuild**

In the undo callback inside `toggleTask` (the `showUndoToast` callback, around line 539-555), add a cooldown rebuild after the undo write. After the existing undo logic (restore completion or remove it), add:

```js
// Rebuild cooldown task schedule after undo
const undoEntry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
if (undoEntry) {
  const undoTask = tasks[undoEntry.taskId];
  if (undoTask?.cooldownDays > 0) {
    const allSched = await readAllSchedule() || {};
    const undoUpdates = rebuildSingleTaskSchedule(
      undoEntry.taskId, undoTask, today, allSched, completions, people, settings, tasks
    );
    if (Object.keys(undoUpdates).length > 0) {
      await multiUpdate(undoUpdates);
    }
  }
}
```

- [ ] **Step 6: Reload data after render to pick up schedule changes**

The existing `doRenderAndToast` calls `render()` but doesn't reload `loadData()`. After the cooldown rebuild, the suppressed set and overdue items need refreshing. Add `await loadData();` before the `render()` call inside `doRenderAndToast`:

Actually, looking at the flow more carefully — the `render()` call happens synchronously in `doRenderAndToast`, and `loadData()` is async. The simpler approach: call `loadData()` then `render()` after the cooldown rebuild completes, which already happens before `doRenderAndToast`. The `loadData` + `render` at the end of the flow will pick up the new state. Verify this works as-is; if the overdue banner doesn't update, add an explicit `await loadData()` before the final `render()`.

- [ ] **Step 7: Test manually**

1. Find or create a weekly task with `cooldownDays: 2`
2. Use admin to place it on a past date (or wait for it to become overdue naturally)
3. Verify it shows in the overdue banner on dashboard
4. Navigate to a future date — verify the task's future instance is NOT shown
5. Complete the overdue task via the banner
6. Verify future instances reappear on correctly-spaced dates (today + cooldownDays + 1)
7. Hit undo — verify future instances revert to original spacing

- [ ] **Step 8: Commit**

```bash
git add dashboard.js
git commit -m "feat: dashboard cooldown suppression and completion-anchored rebuild"
```

---

### Task 5: Wire up calendar — suppression + rebuild on completion

**Files:**
- Modify: `calendar.html:45` (state import)
- Modify: `calendar.html:47` (scheduler import)
- Modify: `calendar.html` (render path for day sheet entries)
- Modify: `calendar.html:969-998` (toggleTask)

- [ ] **Step 1: Update imports**

Line 45 — add `getOverdueCooldownTaskIds` to state import:
```js
import { isComplete, filterByPerson, groupByFrequency, dayProgress, getOverdueCooldownTaskIds, sortEntries } from './shared/state.js';
```

Line 47 — add `rebuildSingleTaskSchedule` to scheduler import:
```js
import { buildScheduleUpdates, getRotationOwner, rebuildSingleTaskSchedule } from './shared/scheduler.js';
```

- [ ] **Step 2: Compute suppressed IDs on data load**

Calendar uses `allSchedule` (full schedule object). Find where `allSchedule` is populated (in the data loading section) and add computation of suppressed IDs. Add a module-level variable:

```js
let suppressedCooldownTaskIds = new Set();
```

After `allSchedule` is loaded, compute:
```js
suppressedCooldownTaskIds = getOverdueCooldownTaskIds(allSchedule || {}, completions, tasks, today);
```

- [ ] **Step 3: Filter suppressed entries in day sheet rendering**

In the function that renders the day detail sheet (where entries for a selected day are displayed), filter out suppressed cooldown tasks for future dates:

```js
// When building entries for the day sheet, if the day is in the future:
if (selectedDay > today && suppressedCooldownTaskIds.size > 0) {
  dayEntries = Object.fromEntries(
    Object.entries(dayEntries).filter(([_, e]) => !suppressedCooldownTaskIds.has(e.taskId))
  );
}
```

- [ ] **Step 4: Add cooldown rebuild to toggleTask**

In `toggleTask` (line 969-998), after `writeCompletion` and the one-time archive block, add:

```js
// Cooldown task rebuild
const toggleEntry = (allSchedule[dateKey] || {})[entryKey];
if (toggleEntry) {
  const task = tasks[toggleEntry.taskId];
  if (task?.cooldownDays > 0) {
    const updates = rebuildSingleTaskSchedule(
      toggleEntry.taskId, task, today, allSchedule, completions, people, settings, tasks
    );
    if (Object.keys(updates).length > 0) {
      await multiUpdate(updates);
      // Reload schedule to reflect changes
      allSchedule = await readAllSchedule() || {};
      suppressedCooldownTaskIds = getOverdueCooldownTaskIds(allSchedule, completions, tasks, today);
    }
  }
}
```

- [ ] **Step 5: Test manually**

1. Open calendar, navigate to a future date with a cooldown task
2. Verify it's suppressed if the task has an overdue instance
3. Complete the overdue instance (if calendar supports overdue completion — if not, complete via dashboard)
4. Return to calendar, verify future instances reappear correctly

- [ ] **Step 6: Commit**

```bash
git add calendar.html
git commit -m "feat: calendar cooldown suppression and completion-anchored rebuild"
```

---

### Task 6: Wire up kid mode — suppression + rebuild on completion

**Files:**
- Modify: `kid.html:532` (state import)
- Modify: `kid.html:527` (firebase import — already has `multiUpdate`)
- Add: scheduler import
- Modify: `kid.html:844-853` (loadData)
- Modify: `kid.html:859` (render)
- Modify: `kid.html:1251-1305` (toggleTask)

- [ ] **Step 1: Update imports**

Line 532 — add `getOverdueCooldownTaskIds` to state import:
```js
import { isComplete, filterByPerson, groupByFrequency, dayProgress, getOverdueEntries, getOverdueCooldownTaskIds, isAllDone, sortEntries } from './shared/state.js';
```

Add scheduler import after the scoring import (after line 533):
```js
import { rebuildSingleTaskSchedule } from './shared/scheduler.js';
```

- [ ] **Step 2: Add suppressed tracking and update loadData**

Add near line 830 (after `let overdueItems = [];`):
```js
let suppressedCooldownTaskIds = new Set();
```

Update `loadData` (line 844-853):
```js
async function loadData() {
  const [allSched, streaks] = await Promise.all([
    readAllSchedule(),
    readStreaks(kid.id)
  ]);
  const allOverdue = getOverdueEntries(allSched || {}, completions, today, tasks);
  overdueItems = allOverdue.filter(e => e.ownerId === kid.id);
  suppressedCooldownTaskIds = getOverdueCooldownTaskIds(allSched || {}, completions, tasks, today);
  streakData = streaks || { current: 0, best: 0 };
}
```

- [ ] **Step 3: Filter suppressed entries in render**

In the `render` function (line 859), find where `viewEntries` is used for display and add filtering. Near the top of `render`, before entries are processed:

```js
// Filter out future instances of cooldown tasks that have overdue entries
let displayEntries = viewEntries;
if (suppressedCooldownTaskIds.size > 0 && viewDate > today) {
  displayEntries = {};
  for (const [key, entry] of Object.entries(viewEntries)) {
    if (!suppressedCooldownTaskIds.has(entry.taskId)) {
      displayEntries[key] = entry;
    }
  }
}
```

Then use `displayEntries` instead of `viewEntries` for rendering (but keep `viewEntries` for lookups in toggleTask).

- [ ] **Step 4: Add cooldown rebuild to toggleTask**

In `toggleTask` (line 1251), after `writeCompletion` and the one-time archive block (around line 1282), add:

```js
// Cooldown task rebuild
const toggleEntry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
if (toggleEntry) {
  const toggleTask = tasks[toggleEntry.taskId];
  if (toggleTask?.cooldownDays > 0) {
    const allSched = await readAllSchedule() || {};
    const updates = rebuildSingleTaskSchedule(
      toggleEntry.taskId, toggleTask, today, allSched, completions, people, settings, tasks
    );
    if (Object.keys(updates).length > 0) {
      await multiUpdate(updates);
    }
  }
}
```

- [ ] **Step 5: Add cooldown rebuild to undo handler**

In the undo callback (around line 1292-1305), after the undo write logic, add the same rebuild:

```js
// Rebuild cooldown task schedule after undo
const undoEntry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
if (undoEntry) {
  const undoTask = tasks[undoEntry.taskId];
  if (undoTask?.cooldownDays > 0) {
    const allSched = await readAllSchedule() || {};
    const undoUpdates = rebuildSingleTaskSchedule(
      undoEntry.taskId, undoTask, today, allSched, completions, people, settings, tasks
    );
    if (Object.keys(undoUpdates).length > 0) {
      await multiUpdate(undoUpdates);
    }
  }
}
```

- [ ] **Step 6: Test manually in kid mode**

1. Open kid mode (`kid.html?kid=Name`)
2. Create an overdue cooldown task assigned to that kid
3. Verify it shows in the overdue banner
4. Navigate to a future date — verify suppression
5. Complete the overdue task
6. Verify future instances rebuild correctly

- [ ] **Step 7: Commit**

```bash
git add kid.html
git commit -m "feat: kid mode cooldown suppression and completion-anchored rebuild"
```

---

### Task 7: Update remaining callers of `getOverdueEntries`

**Files:**
- Modify: `dashboard.js:135` (already done in Task 4)
- Modify: `kid.html:850` (already done in Task 6)
- Verify: `calendar.html` (does NOT call `getOverdueEntries` — confirmed by grep)
- Verify: `tracker.html` (does NOT call `getOverdueEntries` — confirmed by grep)

This task is a verification pass. All callers were already updated in Tasks 4 and 6. Grep the codebase for any remaining 3-arg calls:

- [ ] **Step 1: Verify no remaining old-signature calls**

Search for `getOverdueEntries(` across all files. Confirm every call passes 4 arguments (schedule, completions, today, tasks).

```bash
grep -rn "getOverdueEntries(" --include="*.js" --include="*.html"
```

Expected: only `dashboard.js` and `kid.html` call it, both with 4 args. `shared/state.js` defines it.

- [ ] **Step 2: Commit (if any fixes needed)**

If any callers still use the old 3-arg signature, fix them and commit.

---

### Task 8: End-to-end manual testing

- [ ] **Step 1: Test weekly cooldown task (main scenario)**

1. In admin, create or find a weekly task with `cooldownDays: 3`
2. Ensure it's scheduled for a past date (or use admin debug to create one)
3. Dashboard: verify it shows in overdue banner
4. Dashboard: navigate to the future date where the next instance is — verify it's NOT shown
5. Dashboard: complete the overdue task
6. Dashboard: verify next instance now appears on `today + 4` (cooldownDays + 1)
7. Dashboard: undo — verify it reverts

- [ ] **Step 2: Test daily cooldown task (new overdue behavior)**

1. In admin, create a daily task with `cooldownDays: 2`
2. Wait for it to go past due (or create a past schedule entry via admin debug)
3. Dashboard: verify it NOW shows in overdue banner (previously it was silently skipped)
4. Complete it and verify rebuild

- [ ] **Step 3: Test calendar view**

1. Open calendar, find a month with a cooldown task
2. Verify suppression on future dates while overdue
3. Complete via dashboard, return to calendar — verify instances reappear

- [ ] **Step 4: Test kid mode**

1. Open kid mode for a child with cooldown tasks
2. Verify overdue + suppression + rebuild all work

- [ ] **Step 5: Test non-cooldown tasks are unaffected**

1. Verify regular daily tasks still excluded from overdue
2. Verify regular weekly/monthly tasks still show as overdue normally
3. Verify completion of non-cooldown tasks does NOT trigger any rebuild

- [ ] **Step 6: Final commit (if any fixes)**

```bash
git add -A
git commit -m "fix: address issues found in cooldown overdue e2e testing"
```

# Category-Level Daily Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional per-person and per-household daily minute caps to categories so the scheduler defers or skips weekly/monthly/once tasks that would exceed the limit.

**Architecture:** Two new optional fields on category objects (`dailyLimitPerPerson`, `dailyLimitPerHousehold`). Two new helper functions in `scheduler.js` compute category load and check limits. The three non-daily placement functions call the limit check before placing, deferring to alternative days or skipping if no day has room. Admin category form gets two number inputs.

**Tech Stack:** Vanilla JS, Firebase Realtime Database (compat SDK)

**Spec:** `docs/superpowers/specs/2026-04-06-category-daily-limits-design.md`

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `shared/scheduler.js` | Modify | Add `categoryDayLoad` + `canPlaceUnderCategoryLimit` helpers; update `generateSchedule`, `buildScheduleUpdates`, `rebuildSingleTaskSchedule` signatures to accept categories; update `placeWeeklyTask`, `placeMonthlyTask`, `placeOnceTask` to check limits |
| `admin.html` | Modify | Add limit inputs to category form, read/write limit fields on save, show limit badges in category list, hide limits when Event is checked |

No new files. No changes to firebase.js, scoring, dashboard, calendar, kid mode, scoreboard, or tracker.

---

### Task 1: Add `categoryDayLoad` helper to scheduler.js

**Files:**
- Modify: `shared/scheduler.js:384-448` (load balancing section)

- [ ] **Step 1: Add `categoryDayLoad` function after `totalDayLoad` (after line 423)**

Insert after the closing brace of `totalDayLoad` at line 423, before `findLightestDay` at line 432:

```js
/**
 * Calculate total estimated minutes for a specific category on a given day.
 * If personId is provided, returns that person's category load.
 * If personId is null, returns the household total across all people.
 */
function categoryDayLoad(categoryId, personId, dateKey, newSchedule, existingSchedule, tasks) {
  let totalMin = 0;
  const counted = new Set();
  const newDay = newSchedule[dateKey] || null;
  const existDay = existingSchedule ? existingSchedule[dateKey] : null;

  if (newDay) {
    for (const [key, entry] of Object.entries(newDay)) {
      const task = tasks[entry.taskId];
      if (!task || task.category !== categoryId) continue;
      if (personId && entry.ownerId !== personId) continue;
      counted.add(key);
      const raw = task.timeOfDay === 'both' ? Math.ceil((task.estMin || 1) / 2) : (task.estMin || 1);
      totalMin += raw;
    }
  }

  if (existDay) {
    for (const [key, entry] of Object.entries(existDay)) {
      if (counted.has(key)) continue;
      const task = tasks[entry.taskId];
      if (!task || task.category !== categoryId) continue;
      if (personId && entry.ownerId !== personId) continue;
      const raw = task.timeOfDay === 'both' ? Math.ceil((task.estMin || 1) / 2) : (task.estMin || 1);
      totalMin += raw;
    }
  }

  return totalMin;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/scheduler.js
git commit -m "feat: add categoryDayLoad helper for category limit checks"
```

---

### Task 2: Add `canPlaceUnderCategoryLimit` helper to scheduler.js

**Files:**
- Modify: `shared/scheduler.js` (immediately after `categoryDayLoad` from Task 1)

- [ ] **Step 1: Add `canPlaceUnderCategoryLimit` function after `categoryDayLoad`**

```js
/**
 * Check whether placing a task on a given day would stay within category limits.
 * Returns true if both per-person and per-household limits pass (or aren't set).
 *
 * For duplicate mode: checks each owner independently against per-person limit,
 * and checks combined total against household limit.
 * For rotate/fixed mode: checks the single assigned owner.
 */
function canPlaceUnderCategoryLimit(task, dateKey, categories, newSchedule, existingSchedule, tasks) {
  if (!categories) return true;
  const cat = categories[task.category];
  if (!cat) return true;

  const personLimit = cat.dailyLimitPerPerson;
  const householdLimit = cat.dailyLimitPerHousehold;
  if (!personLimit && !householdLimit) return true;

  const taskMin = task.timeOfDay === 'both' ? Math.ceil((task.estMin || 1) / 2) : (task.estMin || 1);
  // For duplicate mode, total household addition is taskMin * number of owners
  const mode = task.ownerAssignmentMode || 'rotate';
  const ownerCount = mode === 'duplicate' ? (task.owners?.length || 1) : 1;

  // Per-person check: each owner must have room
  if (personLimit) {
    const ownersToCheck = mode === 'duplicate' ? task.owners : [task.owners?.[0]];
    for (const ownerId of ownersToCheck) {
      if (!ownerId) continue;
      const current = categoryDayLoad(task.category, ownerId, dateKey, newSchedule, existingSchedule, tasks);
      if (current + taskMin > personLimit) return false;
    }
  }

  // Household check: total across all people
  if (householdLimit) {
    const current = categoryDayLoad(task.category, null, dateKey, newSchedule, existingSchedule, tasks);
    if (current + (taskMin * ownerCount) > householdLimit) return false;
  }

  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/scheduler.js
git commit -m "feat: add canPlaceUnderCategoryLimit helper"
```

---

### Task 3: Thread categories through scheduler entry points

**Files:**
- Modify: `shared/scheduler.js:499-581` (`generateSchedule` function)
- Modify: `shared/scheduler.js:855` (`buildScheduleUpdates` function)
- Modify: `shared/scheduler.js:761` (`rebuildSingleTaskSchedule` function)

- [ ] **Step 1: Add `categories` to `generateSchedule` signature and `balanceCtx`**

Change line 499 from:
```js
export function generateSchedule(tasks, people, settings, completions, existingSchedule, options) {
```
to:
```js
export function generateSchedule(tasks, people, settings, completions, existingSchedule, options, categories) {
```

Change line 553 from:
```js
  const balanceCtx = { newSchedule, existingSchedule, allTasks: tasks };
```
to:
```js
  const balanceCtx = { newSchedule, existingSchedule, allTasks: tasks, categories };
```

- [ ] **Step 2: Add `categories` to `buildScheduleUpdates` signature and pass it through**

Change line 855 from:
```js
export function buildScheduleUpdates(tasks, people, settings, completions, existingSchedule, options) {
```
to:
```js
export function buildScheduleUpdates(tasks, people, settings, completions, existingSchedule, options, categories) {
```

Change line 857 from:
```js
  const newSchedule = generateSchedule(tasks, people, settings, completions, existingSchedule, options);
```
to:
```js
  const newSchedule = generateSchedule(tasks, people, settings, completions, existingSchedule, options, categories);
```

- [ ] **Step 3: Add `categories` to `rebuildSingleTaskSchedule` signature and `balanceCtx`**

Change line 761 from:
```js
export function rebuildSingleTaskSchedule(taskId, task, anchorDate, existingSchedule, completions, people, settings, allTasks) {
```
to:
```js
export function rebuildSingleTaskSchedule(taskId, task, anchorDate, existingSchedule, completions, people, settings, allTasks, categories) {
```

Change line 813 from:
```js
  const balanceCtx = { newSchedule, existingSchedule: cleanedSchedule, allTasks };
```
to:
```js
  const balanceCtx = { newSchedule, existingSchedule: cleanedSchedule, allTasks, categories };
```

- [ ] **Step 4: Commit**

```bash
git add shared/scheduler.js
git commit -m "feat: thread categories parameter through scheduler entry points"
```

---

### Task 4: Add category limit checks to `placeWeeklyTask`

**Files:**
- Modify: `shared/scheduler.js` (`placeWeeklyTask` function, currently starting around line 625)

- [ ] **Step 1: Add `balanceCtx` destructuring at the top of the function for easy access to categories**

The function already receives `balanceCtx`. After the target day is selected (around the area after `findLightestDay` and the dedicated-day logic), add the limit check.

Replace the placement block in `placeWeeklyTask`. Find this code (around lines 640-667):

```js
    // 1. Pick the DAY first (global load + weekend weight)
    let targetDay;
    if (task.dedicatedDay != null) {
      targetDay = weekDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
      if (!targetDay) {
        // Dedicated day already passed this week — place on the past date
        // so it appears in the overdue banner instead of pretending it's a today task
        const wStart = weekStart(weekDates[0]);
        const fullWeek = dateRange(wStart, weekEnd(weekDates[0]));
        targetDay = fullWeek.find(dk => dayOfWeek(dk) === task.dedicatedDay);
        if (targetDay) {
          if (!newSchedule[targetDay]) newSchedule[targetDay] = {};
        }
      }
    } else {
      targetDay = findLightestDay(weekDates, newSchedule, existingSchedule, allTasks, weekendWeight);
    }

    if (!targetDay) continue;
    if (task.createdDate && targetDay < task.createdDate) continue;

    // 2. Place entries (owner assigned via day-level load balancing)
    const entries = generateRotatedEntries(task, taskId, targetDay, balanceCtx);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[targetDay][key] = entry;
    }
```

Replace with:

```js
    // 1. Pick the DAY first (global load + weekend weight)
    let targetDay;
    if (task.dedicatedDay != null) {
      targetDay = weekDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
      if (!targetDay) {
        // Dedicated day already passed this week — place on the past date
        // so it appears in the overdue banner instead of pretending it's a today task
        const wStart = weekStart(weekDates[0]);
        const fullWeek = dateRange(wStart, weekEnd(weekDates[0]));
        targetDay = fullWeek.find(dk => dayOfWeek(dk) === task.dedicatedDay);
        if (targetDay) {
          if (!newSchedule[targetDay]) newSchedule[targetDay] = {};
        }
      }
      // Dedicated-day tasks: if over category limit, skip this period
      if (targetDay && !canPlaceUnderCategoryLimit(task, targetDay, balanceCtx.categories, newSchedule, existingSchedule, allTasks)) {
        continue;
      }
    } else {
      // Try lightest day first, then fall back to other days if over category limit
      const sortedDays = [...weekDates].sort((a, b) => {
        const loadA = totalDayLoad(a, newSchedule[a], existingSchedule?.[a], allTasks);
        const loadB = totalDayLoad(b, newSchedule[b], existingSchedule?.[b], allTasks);
        return loadA - loadB;
      });
      targetDay = null;
      for (const dk of sortedDays) {
        if (task.createdDate && dk < task.createdDate) continue;
        if (canPlaceUnderCategoryLimit(task, dk, balanceCtx.categories, newSchedule, existingSchedule, allTasks)) {
          targetDay = dk;
          break;
        }
      }
    }

    if (!targetDay) continue;
    if (task.createdDate && targetDay < task.createdDate) continue;

    // 2. Place entries (owner assigned via day-level load balancing)
    const entries = generateRotatedEntries(task, taskId, targetDay, balanceCtx);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[targetDay][key] = entry;
    }
```

- [ ] **Step 2: Commit**

```bash
git add shared/scheduler.js
git commit -m "feat: add category limit check to placeWeeklyTask"
```

---

### Task 5: Add category limit checks to `placeMonthlyTask`

**Files:**
- Modify: `shared/scheduler.js` (`placeMonthlyTask` function, currently starting around line 673)

- [ ] **Step 1: Replace the placement block in `placeMonthlyTask`**

Find this code (around lines 688-716):

```js
    // 1. Pick the DAY first (global load + weekend weight)
    let targetDay;
    if (task.dedicatedDay != null) {
      targetDay = monthDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
      if (!targetDay) {
        // Dedicated day already passed this month — place on the most recent past
        // occurrence so it appears in the overdue banner
        const mStart = monthStart(monthDates[0]);
        const fullMonth = dateRange(mStart, monthEnd(monthDates[0]));
        const pastOccurrences = fullMonth.filter(dk => dayOfWeek(dk) === task.dedicatedDay && dk < monthDates[0]);
        targetDay = pastOccurrences.length > 0 ? pastOccurrences[pastOccurrences.length - 1] : null;
        if (targetDay) {
          if (!newSchedule[targetDay]) newSchedule[targetDay] = {};
        }
      }
    }
    if (!targetDay) {
      targetDay = findLightestDay(monthDates, newSchedule, existingSchedule, allTasks, weekendWeight);
    }

    if (task.createdDate && targetDay < task.createdDate) continue;

    // 2. Place entries (owner assigned via day-level load balancing)
    const entries = generateRotatedEntries(task, taskId, targetDay, balanceCtx);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[targetDay][key] = entry;
    }
```

Replace with:

```js
    // 1. Pick the DAY first (global load + weekend weight)
    let targetDay;
    if (task.dedicatedDay != null) {
      targetDay = monthDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
      if (!targetDay) {
        // Dedicated day already passed this month — place on the most recent past
        // occurrence so it appears in the overdue banner
        const mStart = monthStart(monthDates[0]);
        const fullMonth = dateRange(mStart, monthEnd(monthDates[0]));
        const pastOccurrences = fullMonth.filter(dk => dayOfWeek(dk) === task.dedicatedDay && dk < monthDates[0]);
        targetDay = pastOccurrences.length > 0 ? pastOccurrences[pastOccurrences.length - 1] : null;
        if (targetDay) {
          if (!newSchedule[targetDay]) newSchedule[targetDay] = {};
        }
      }
      // Dedicated-day tasks: if over category limit, skip this period
      if (targetDay && !canPlaceUnderCategoryLimit(task, targetDay, balanceCtx.categories, newSchedule, existingSchedule, allTasks)) {
        continue;
      }
    }
    if (!targetDay) {
      // Try days sorted by load, pick first that passes category limit
      const sortedDays = [...monthDates].sort((a, b) => {
        const loadA = totalDayLoad(a, newSchedule[a], existingSchedule?.[a], allTasks);
        const loadB = totalDayLoad(b, newSchedule[b], existingSchedule?.[b], allTasks);
        return loadA - loadB;
      });
      for (const dk of sortedDays) {
        if (task.createdDate && dk < task.createdDate) continue;
        if (canPlaceUnderCategoryLimit(task, dk, balanceCtx.categories, newSchedule, existingSchedule, allTasks)) {
          targetDay = dk;
          break;
        }
      }
    }

    if (!targetDay) continue;
    if (task.createdDate && targetDay < task.createdDate) continue;

    // 2. Place entries (owner assigned via day-level load balancing)
    const entries = generateRotatedEntries(task, taskId, targetDay, balanceCtx);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[targetDay][key] = entry;
    }
```

- [ ] **Step 2: Commit**

```bash
git add shared/scheduler.js
git commit -m "feat: add category limit check to placeMonthlyTask"
```

---

### Task 6: Add category limit checks to `placeOnceTask`

**Files:**
- Modify: `shared/scheduler.js` (`placeOnceTask` function, currently starting around line 722)

- [ ] **Step 1: Thread `balanceCtx` into `placeOnceTask`**

`placeOnceTask` currently does not receive `balanceCtx`. Update its signature and its call site.

Change the function signature from:
```js
function placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey) {
```
to:
```js
function placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey, balanceCtx) {
```

Update the call site in `generateSchedule` (around line 574) from:
```js
          placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey);
```
to:
```js
          placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey, balanceCtx);
```

- [ ] **Step 2: Replace the placement block in `placeOnceTask`**

Find this code (around lines 726-744):

```js
  const eligibleDates = futureDates.filter(dk => !task.createdDate || dk >= task.createdDate);
  if (eligibleDates.length === 0) return;

  // 1. Pick the DAY first
  let targetDay;
  if (task.dedicatedDate) {
    targetDay = eligibleDates.find(dk => dk === task.dedicatedDate);
    if (!targetDay) return; // date is in the past or out of range
  } else if (task.dedicatedDay != null) {
    targetDay = eligibleDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
  }
  if (!targetDay) {
    targetDay = findLightestDay(eligibleDates.slice(0, 14), newSchedule, existingSchedule, allTasks, weekendWeight);
  }

  const entries = generateRotatedEntries(task, taskId, targetDay);
  for (const entry of entries) {
    const key = nextKey();
    newSchedule[targetDay][key] = entry;
```

Replace with:

```js
  const eligibleDates = futureDates.filter(dk => !task.createdDate || dk >= task.createdDate);
  if (eligibleDates.length === 0) return;

  const categories = balanceCtx?.categories;

  // 1. Pick the DAY first
  let targetDay;
  if (task.dedicatedDate) {
    targetDay = eligibleDates.find(dk => dk === task.dedicatedDate);
    if (!targetDay) return; // date is in the past or out of range
    // Dedicated-date tasks: if over category limit, skip entirely
    if (!canPlaceUnderCategoryLimit(task, targetDay, categories, newSchedule, existingSchedule, allTasks)) return;
  } else if (task.dedicatedDay != null) {
    // Try the first occurrence, then subsequent ones if over limit
    const dayOccurrences = eligibleDates.filter(dk => dayOfWeek(dk) === task.dedicatedDay);
    targetDay = null;
    for (const dk of dayOccurrences) {
      if (canPlaceUnderCategoryLimit(task, dk, categories, newSchedule, existingSchedule, allTasks)) {
        targetDay = dk;
        break;
      }
    }
  }
  if (!targetDay) {
    // Try days sorted by load, pick first under category limit
    const candidates = eligibleDates.slice(0, 14);
    const sortedDays = [...candidates].sort((a, b) => {
      const loadA = totalDayLoad(a, newSchedule[a], existingSchedule?.[a], allTasks);
      const loadB = totalDayLoad(b, newSchedule[b], existingSchedule?.[b], allTasks);
      return loadA - loadB;
    });
    for (const dk of sortedDays) {
      if (canPlaceUnderCategoryLimit(task, dk, categories, newSchedule, existingSchedule, allTasks)) {
        targetDay = dk;
        break;
      }
    }
  }

  if (!targetDay) return;

  const entries = generateRotatedEntries(task, taskId, targetDay);
  for (const entry of entries) {
    const key = nextKey();
    newSchedule[targetDay][key] = entry;
```

- [ ] **Step 3: Commit**

```bash
git add shared/scheduler.js
git commit -m "feat: add category limit check to placeOnceTask"
```

---

### Task 7: Update all callers of `buildScheduleUpdates` and `rebuildSingleTaskSchedule`

**Files:**
- Modify: `admin.html:1439, 1452, 1794` (three `buildScheduleUpdates` calls)
- Modify: `dashboard.js:1062, 1240` (two `buildScheduleUpdates` calls)
- Modify: `calendar.html:921, 1219` (two `buildScheduleUpdates` calls)
- Modify: all `rebuildSingleTaskSchedule` callers

- [ ] **Step 1: Find all callers**

Search for `buildScheduleUpdates(` and `rebuildSingleTaskSchedule(` across the codebase to get exact line numbers (they may have shifted from earlier edits — verify before editing).

- [ ] **Step 2: Update `admin.html` callers**

Each page already has `catsObj` (admin) or reads categories. For admin, `catsObj` is already in scope. Add it as the last argument to all three calls:

Line ~1439:
```js
const futureUpdates = buildScheduleUpdates(tasksObj, peopleArray(), settings, allComp, allSched, undefined, catsObj);
```

Line ~1452:
```js
const futureUpdates = buildScheduleUpdates(tasksObj, peopleArray(), settings, allComp, allSched, { includeToday: true }, catsObj);
```

Line ~1794:
```js
const updates = buildScheduleUpdates(tasksObj, peopleArray(), settings, completions, existingSchedule, { includeToday: true, clearPast }, catsObj);
```

- [ ] **Step 3: Update `dashboard.js` callers**

Dashboard loads categories. Check how categories are stored (likely a variable like `categories` or read via `readCategories()`). Add categories as the last argument. If categories aren't already loaded, add a `readCategories()` call alongside the existing data reads.

Search for `readCategories` or category variable usage in `dashboard.js` to determine the variable name, then add it to both `buildScheduleUpdates` calls:

Line ~1062:
```js
const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, allSched, { includeToday: true }, categories);
```

Line ~1240:
```js
const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, allSched, undefined, categories);
```

If dashboard doesn't load categories yet, add `const categories = await readCategories() || {};` before the first `buildScheduleUpdates` call in each function, and add `readCategories` to the import from `./shared/firebase.js`.

- [ ] **Step 4: Update `calendar.html` callers**

Same pattern — check if categories are loaded, add as last argument:

Line ~921:
```js
const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, allSched, { includeToday: true }, categories);
```

Line ~1219:
```js
const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, existingSched, undefined, categories);
```

If calendar doesn't load categories yet, add `readCategories` import and load them before the calls.

- [ ] **Step 5: Update all `rebuildSingleTaskSchedule` callers**

Search for `rebuildSingleTaskSchedule(` calls. Add categories as the last argument to each. Same pattern: verify categories are in scope, add import/load if needed.

- [ ] **Step 6: Commit**

```bash
git add admin.html dashboard.js calendar.html
git commit -m "feat: pass categories to scheduler from all call sites"
```

---

### Task 8: Add limit inputs to admin category form

**Files:**
- Modify: `admin.html:676-681` (category form — after Weight % field)
- Modify: `admin.html:1657-1697` (category save handler)
- Modify: `admin.html:638-643` (category list badges)

- [ ] **Step 1: Add two number inputs after the Weight % form-row**

Find this block (around line 676-681):
```js
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label class="form-label">Weight %</label>
            <input type="number" id="cf_weight" value="${cat.weightPercent || ''}" min="0" max="100" placeholder="None">
            <p class="form-hint">Leave empty for no weighting</p>
          </div>
        </div>
```

Replace with:
```js
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label class="form-label">Weight %</label>
            <input type="number" id="cf_weight" value="${cat.weightPercent || ''}" min="0" max="100" placeholder="None">
            <p class="form-hint">Leave empty for no weighting</p>
          </div>
        </div>
        <div class="form-row" id="catLimitsRow" style="display:${cat.isEvent ? 'none' : 'flex'}">
          <div class="form-group" style="flex:1">
            <label class="form-label">Limit / Person (min)</label>
            <input type="number" id="cf_limitPerson" value="${cat.dailyLimitPerPerson || ''}" min="1" placeholder="None">
            <p class="form-hint">Leave empty for no limit</p>
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label">Limit / Household (min)</label>
            <input type="number" id="cf_limitHousehold" value="${cat.dailyLimitPerHousehold || ''}" min="1" placeholder="None">
            <p class="form-hint">Leave empty for no limit</p>
          </div>
        </div>
```

- [ ] **Step 2: Hide/show limit inputs when Event checkbox toggles**

Find the event checkbox listener (around line 1641-1645):
```js
      const eventCheckbox = main.querySelector('#cf_isEvent');
      const eventColorRow = main.querySelector('#eventColorRow');
      eventCheckbox?.addEventListener('change', () => {
        if (eventColorRow) eventColorRow.style.display = eventCheckbox.checked ? 'flex' : 'none';
      });
```

Replace with:
```js
      const eventCheckbox = main.querySelector('#cf_isEvent');
      const eventColorRow = main.querySelector('#eventColorRow');
      const catLimitsRow = main.querySelector('#catLimitsRow');
      eventCheckbox?.addEventListener('change', () => {
        if (eventColorRow) eventColorRow.style.display = eventCheckbox.checked ? 'flex' : 'none';
        if (catLimitsRow) catLimitsRow.style.display = eventCheckbox.checked ? 'none' : 'flex';
      });
```

- [ ] **Step 3: Read limit values in save handler**

Find the save handler where `catData` is built (around line 1662-1683). After line 1666:
```js
        const isEvent = main.querySelector('#cf_isEvent')?.checked || false;
```

Add:
```js
        const limitPerson = main.querySelector('#cf_limitPerson')?.value;
        const limitHousehold = main.querySelector('#cf_limitHousehold')?.value;
```

In the `catData` object (around line 1675-1683), add the two new fields. Find:
```js
          weightPercent: isEvent ? null : (weight ? parseInt(weight, 10) : null)
```

Replace with:
```js
          weightPercent: isEvent ? null : (weight ? parseInt(weight, 10) : null),
          dailyLimitPerPerson: isEvent ? null : (limitPerson ? parseInt(limitPerson, 10) : null),
          dailyLimitPerHousehold: isEvent ? null : (limitHousehold ? parseInt(limitHousehold, 10) : null)
```

- [ ] **Step 4: Add limit badges to category list**

Find the badges section (around line 638-643):
```js
        if (c.isEvent) badges.push(`<span class="admin-badge admin-badge--event" style="background:${c.eventColor || '#5b7fd6'}22;color:${c.eventColor || '#5b7fd6'}">Event</span>`);
        if (c.isDefault) badges.push('<span class="admin-badge">Default</span>');
        if (c.weightPercent) badges.push(`<span class="admin-badge admin-badge--muted">${c.weightPercent}%</span>`);
        if (c.pinProtected) badges.push('<span class="admin-badge admin-badge--muted">🔒</span>');
        if (c.showIcon === false) badges.push('<span class="admin-badge admin-badge--muted">Icon off</span>');
```

After the `pinProtected` line, add:
```js
        if (c.dailyLimitPerPerson) badges.push(`<span class="admin-badge admin-badge--muted">👤${c.dailyLimitPerPerson}m</span>`);
        if (c.dailyLimitPerHousehold) badges.push(`<span class="admin-badge admin-badge--muted">🏠${c.dailyLimitPerHousehold}m</span>`);
```

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat: add category daily limit inputs and badges to admin UI"
```

---

### Task 9: Manual smoke test

- [ ] **Step 1: Verify admin UI**

1. Open admin.html in browser
2. Go to Categories tab
3. Click Edit on a non-event category
4. Verify "Limit / Person (min)" and "Limit / Household (min)" inputs appear below Weight %
5. Set Limit / Person to 30, save
6. Verify badge shows `👤30m` in the category list
7. Edit again, set Limit / Household to 60, save
8. Verify both badges show: `👤30m` and `🏠60m`

- [ ] **Step 2: Verify event toggle hides limits**

1. Edit a category, check "Event category" checkbox
2. Verify the limits row hides
3. Uncheck "Event category"
4. Verify the limits row reappears

- [ ] **Step 3: Verify scheduler respects limits**

1. Set a category's per-person limit to a small value (e.g., 5 min)
2. Create several weekly tasks in that category with estMin > 5
3. Go to admin Schedule tab, click Rebuild
4. Check the schedule — tasks in that category should be spread across different days, not piled on one day
5. If all days in a week are full, some tasks should be skipped

- [ ] **Step 4: Verify no limits = no change**

1. Remove all limits from categories (clear the inputs)
2. Rebuild schedule
3. Verify behavior is identical to before (no regressions)

- [ ] **Step 5: Commit all work**

```bash
git add -A
git commit -m "feat: category-level daily limits — complete"
```

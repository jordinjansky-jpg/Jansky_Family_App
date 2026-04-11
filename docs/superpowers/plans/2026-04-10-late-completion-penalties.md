# Late Completion Penalties Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move late-completion penalties from invisible scoring-time detection to visible, overridable completion-time recording. Block tap-to-complete on past daily tasks.

**Architecture:** When any task is completed on a past date, `toggleTask` sets `isLate: true` + `pointsOverride: pastDueCreditPct` on the completion record. Scoring drops its own late-detection logic and just reads `pointsOverride`. Past daily tasks are tap-blocked — only completable via the long-press detail sheet.

**Tech Stack:** Vanilla JS (ES modules), Firebase RTDB compat SDK, CSS

---

### Task 1: Simplify scoring — remove late-detection logic

**Files:**
- Modify: `shared/scoring.js:1-4` (remove unused import)
- Modify: `shared/scoring.js:66-91` (simplify `earnedPoints`)
- Modify: `shared/scoring.js:169-203` (simplify `dailyScore`)
- Modify: `shared/scoring.js:219-255` (simplify `buildSnapshot`)

- [ ] **Step 1: Remove `dateToKey` import**

In `shared/scoring.js`, line 4, remove the import since it's only used by the late-detection code we're removing:

```js
// Before:
import { dateToKey } from './utils.js';

// After: (delete the line entirely)
```

- [ ] **Step 2: Simplify `earnedPoints`**

Replace the function at lines 66-91 with:

```js
/**
 * Calculate earned points for a single entry.
 * Uses pointsOverride if set (late penalty or manual slider), otherwise base points.
 *
 * @param {object} task - The task definition
 * @param {object|null} completion - The completion record (or null if incomplete)
 * @returns {number} earned points (0 if not completed)
 */
export function earnedPoints(task, completion) {
  if (!completion) return 0;
  const base = basePoints(task);

  if (completion.pointsOverride != null) {
    return Math.round(base * (completion.pointsOverride / 100));
  }

  return base;
}
```

- [ ] **Step 3: Simplify `dailyScore`**

In `shared/scoring.js`, replace lines 169-203. Remove `isOverdueDate`, `pastDueCreditPct`, and the `else if (isOverdueDate)` branch:

```js
export function dailyScore(personEntries, completions, tasks, categories, settings, dateKey, today) {
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories);
  if (possible === 0) return { earned: 0, possible: 0, percentage: 0, grade: '--', pointsMap: {} };

  let earned = 0;
  for (const [key, entry] of Object.entries(personEntries)) {
    const task = tasks[entry.taskId];
    if (!task) continue;
    const cat = task.category ? categories[task.category] : null;
    if (cat?.isEvent) continue;
    if (task.exempt) continue;
    const completion = completions?.[key] || null;
    if (!completion) continue;
    const basePts = pointsMap[key] ?? basePoints(task);
    let pts;
    if (completion.pointsOverride != null) {
      pts = Math.round(basePts * (completion.pointsOverride / 100));
    } else {
      pts = basePts;
    }
    earned += pts;
  }

  const percentage = Math.round((earned / possible) * 100);
  const grade = letterGrade(percentage);

  return { earned, possible, percentage, grade, pointsMap };
}
```

- [ ] **Step 4: Simplify `buildSnapshot`**

In `shared/scoring.js`, replace lines 219-255. Remove the `completedDateKey > dateKey` late-detection block and `pastDueCreditPct`:

```js
export function buildSnapshot(personEntries, completions, tasks, categories, settings, dateKey) {
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories);
  if (possible === 0) return null;

  let earned = 0;
  const missedKeys = [];

  for (const [key, entry] of Object.entries(personEntries)) {
    const task = tasks[entry.taskId];
    if (!task) continue;
    const cat = task.category ? categories[task.category] : null;
    if (cat?.isEvent) continue;
    if (task.exempt) continue;
    const completion = completions?.[key] || null;
    if (completion) {
      const basePts = pointsMap[key] ?? basePoints(task);
      let pts;
      if (completion.pointsOverride != null) {
        pts = Math.round(basePts * (completion.pointsOverride / 100));
      } else {
        pts = basePts;
      }
      earned += pts;
    } else {
      missedKeys.push(key);
    }
  }

  const percentage = Math.round((earned / possible) * 100);
  const grade = letterGrade(percentage);

  return { earned, possible, percentage, grade, missedKeys };
}
```

- [ ] **Step 5: Verify no other callers pass `isOverdue` or `pastDueCreditPct` to `earnedPoints`**

Search the codebase for `earnedPoints` calls. The only callers should be `dailyScore` and `buildSnapshot` (both in scoring.js). Confirm no external file imports or calls `earnedPoints` with the old options signature.

Run: `grep -rn "earnedPoints" shared/ dashboard.js calendar.html kid.html`

Expected: Only hits in `shared/scoring.js` (the function definition and its two internal call sites, now simplified).

- [ ] **Step 6: Commit**

```bash
git add shared/scoring.js
git commit -m "refactor: remove scoring-time late detection — penalty now set at completion time"
```

---

### Task 2: Add late detection to dashboard `toggleTask`

**Files:**
- Modify: `dashboard.js:489-513` (`toggleTask` function)

- [ ] **Step 1: Add late detection logic**

In `dashboard.js`, in the `toggleTask` function, after the completion record is built (around line 510, after `pendingSliderOverride = null;`), add late detection. The full `else` block (lines 498-512) becomes:

```js
  } else {
    // Complete — include pending slider override or saved override from schedule entry
    const record = {
      completedAt: firebase.database.ServerValue.TIMESTAMP,
      completedBy: 'dashboard'
    };
    const pendingVal = pendingSliderOverride?.entryKey === entryKey ? pendingSliderOverride.value : null;
    const savedVal = (viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey))?.pointsOverride;
    const overrideVal = pendingVal ?? savedVal ?? null;
    if (overrideVal != null && overrideVal !== 100) {
      record.pointsOverride = overrideVal;
    }
    pendingSliderOverride = null;

    // Late completion: apply penalty if completing a past-date task with no prior override
    const entryDateKey = dateKey || viewDate;
    if (entryDateKey < today && record.pointsOverride == null) {
      const entry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
      const task = entry ? tasks[entry.taskId] : null;
      const cat = task?.category ? cats[task.category] : null;
      if (!cat?.isEvent && !task?.exempt) {
        record.pointsOverride = settings?.pastDueCreditPct ?? 75;
        record.isLate = true;
      }
    }

    completions[entryKey] = record;
    await writeCompletion(entryKey, record);
  }
```

Key points:
- `entryDateKey` comes from the `dateKey` param (overdue items have their own dateKey) or falls back to `viewDate`
- Only applies when no prior override exists (`pendingVal` or `savedVal` already set by parent)
- Skips events and exempt tasks (not scored)

- [ ] **Step 2: Commit**

```bash
git add dashboard.js
git commit -m "feat: dashboard toggleTask applies late penalty on past-date completions"
```

---

### Task 3: Add late detection to calendar `toggleTask`

**Files:**
- Modify: `calendar.html:1019-1051` (`toggleTask` function)

- [ ] **Step 1: Add late detection logic**

In `calendar.html`, in the `toggleTask` function's `else` block (completing a task), after `pendingSliderOverride = null;` (around line 1037), add late detection. The full `else` block becomes:

```js
      } else {
        const record = {
          completedAt: firebase.database.ServerValue.TIMESTAMP,
          completedBy: 'calendar'
        };
        const pendingVal = pendingSliderOverride?.entryKey === entryKey ? pendingSliderOverride.value : null;
        const savedVal = (allSchedule[dateKey] || {})[entryKey]?.pointsOverride;
        const overrideVal = pendingVal ?? savedVal ?? null;
        if (overrideVal != null && overrideVal !== 100) {
          record.pointsOverride = overrideVal;
        }
        pendingSliderOverride = null;

        // Late completion: apply penalty if completing a past-date task with no prior override
        if (dateKey < today && record.pointsOverride == null) {
          const entry = (allSchedule[dateKey] || {})[entryKey];
          const task = entry ? tasks[entry.taskId] : null;
          const cat = task?.category ? cats[task.category] : null;
          if (!cat?.isEvent && !task?.exempt) {
            record.pointsOverride = settings?.pastDueCreditPct ?? 75;
            record.isLate = true;
          }
        }

        completions[entryKey] = record;
        await writeCompletion(entryKey, record);

        // Auto-archive one-time tasks on completion
        const dayEntries = allSchedule[dateKey] || {};
        const entry = dayEntries[entryKey];
        if (entry) {
          const task = tasks[entry.taskId];
          if (task && task.rotation === 'once') {
            task.status = 'completed';
            await writeTask(entry.taskId, task);
          }
        }
      }
```

- [ ] **Step 2: Commit**

```bash
git add calendar.html
git commit -m "feat: calendar toggleTask applies late penalty on past-date completions"
```

---

### Task 4: Add late detection to kid mode `toggleTask`

**Files:**
- Modify: `kid.html:773-810` (`toggleTask` function)

- [ ] **Step 1: Add late detection logic**

In `kid.html`, in the `toggleTask` function's `else` block, after `pendingSliderOverride = null;` (around line 798), add late detection. The full `else` block becomes:

```js
          } else {
            const record = {
              completedAt: firebase.database.ServerValue.TIMESTAMP,
              completedBy: 'kid-mode'
            };
            const pendingVal = pendingSliderOverride?.entryKey === entryKey ? pendingSliderOverride.value : null;
            const savedVal = (viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey))?.pointsOverride;
            const overrideVal = pendingVal ?? savedVal ?? null;
            if (overrideVal != null && overrideVal !== 100) {
              record.pointsOverride = overrideVal;
            }
            pendingSliderOverride = null;

            // Late completion: apply penalty if completing a past-date task with no prior override
            const entryDateKey = dateKey || viewDate;
            if (entryDateKey < today && record.pointsOverride == null) {
              const entry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
              const task = entry ? tasks[entry.taskId] : null;
              const cat = task?.category ? cats[task.category] : null;
              if (!cat?.isEvent && !task?.exempt) {
                record.pointsOverride = settings?.pastDueCreditPct ?? 75;
                record.isLate = true;
              }
            }

            completions[entryKey] = record;
            await writeCompletion(entryKey, record);

            // Auto-archive one-time tasks on completion
            const entry = viewEntries[entryKey];
            if (entry) {
              const task = tasks[entry.taskId];
              if (task && task.rotation === 'once') {
                task.status = 'completed';
                await writeTask(entry.taskId, task);
              }
            }
```

- [ ] **Step 2: Commit**

```bash
git add kid.html
git commit -m "feat: kid mode toggleTask applies late penalty on past-date completions"
```

---

### Task 5: Block tap on past daily tasks — dashboard

**Files:**
- Modify: `dashboard.js:420-426` (`endPress` handler)

- [ ] **Step 1: Add tap guard**

In `dashboard.js`, replace the `endPress` function (lines 420-426):

```js
    const endPress = (e) => {
      clearTimeout(activePressTimer);
      activePressTimer = null;
      if (!didLongPress) {
        // Block tap on past incomplete daily tasks — must use detail sheet
        const ek = btn.dataset.entryKey;
        const dk = btn.dataset.dateKey || viewDate;
        const entry = viewEntries[ek] || overdueItems.find(o => o.entryKey === ek);
        if (entry && dk < today && entry.rotationType === 'daily' && !isComplete(ek, completions)) {
          openTaskSheet(ek, dk);
          return;
        }
        toggleTask(ek, dk);
      }
    };
```

When a user taps a past daily task, instead of silently doing nothing, it opens the detail sheet where they can use "Complete (Late)". This is better UX than a dead tap.

- [ ] **Step 2: Commit**

```bash
git add dashboard.js
git commit -m "feat: block tap-complete on past daily tasks, open detail sheet instead"
```

---

### Task 6: Block tap on past daily tasks — calendar

**Files:**
- Modify: `calendar.html:510-517` (`endPress` handler)

- [ ] **Step 1: Add tap guard**

In `calendar.html`, replace the `endPress` function (lines 510-517):

```js
        const endPress = (e) => {
          e.stopPropagation();
          clearTimeout(pressTimer);
          pressTimer = null;
          if (!didLongPress) {
            // Block tap on past incomplete daily tasks — must use detail sheet
            const ek = btn.dataset.entryKey;
            const dk = btn.dataset.dateKey;
            const entry = (allSchedule[dk] || {})[ek];
            if (entry && dk < today && entry.rotationType === 'daily' && !isComplete(ek, completions)) {
              openTaskSheet(ek, dk);
              return;
            }
            toggleTask(ek, dk);
          }
        };
```

- [ ] **Step 2: Commit**

```bash
git add calendar.html
git commit -m "feat: block tap-complete on past daily tasks in calendar"
```

---

### Task 7: Block tap on past daily tasks — kid mode

**Files:**
- Modify: `kid.html:664-669` (`endPress` handler)

- [ ] **Step 1: Add tap guard**

In `kid.html`, replace the `endPress` function (lines 664-669):

```js
            const endPress = () => {
              clearTimeout(pressTimer);
              pressTimer = null;
              if (!didLongPress) {
                // Block tap on past incomplete daily tasks — must use detail sheet
                const ek = btn.dataset.entryKey;
                const dk = btn.dataset.dateKey || viewDate;
                const entry = viewEntries[ek] || overdueItems.find(o => o.entryKey === ek);
                if (entry && dk < today && entry.rotationType === 'daily' && !isComplete(ek, completions)) {
                  openTaskSheet(ek, dk);
                  return;
                }
                toggleTask(ek, dk);
              }
            };
```

- [ ] **Step 2: Commit**

```bash
git add kid.html
git commit -m "feat: block tap-complete on past daily tasks in kid mode"
```

---

### Task 8: "Complete (Late)" button label — components.js

**Files:**
- Modify: `shared/components.js:374-377` (toggle button in `renderTaskDetailSheet`)

- [ ] **Step 1: Update button label logic**

In `shared/components.js`, replace lines 374-377. The function needs to know if the task is on a past date and not an event/exempt. Add `isPastDate` to the destructured options (line 313), then update the button:

First, add `isPastDate` to the destructured options at line 310-315:

```js
export function renderTaskDetailSheet(options) {
  const {
    entryKey, entry, task, person, category, completed, points,
    sliderMin, sliderMax, currentOverride, gradePreview,
    people, showDelegate, showMove, showEdit, dateKey, showPoints = true,
    isEvent = false, readOnly = false, isPastDate = false
  } = options;
```

Then replace the toggle button lines (374-377):

```js
  // Complete/uncomplete button
  const isLateEligible = isPastDate && !completed && !isEvent && !task.exempt;
  const toggleLabel = completed ? 'Mark Incomplete' : (isLateEligible ? 'Complete (Late)' : 'Mark Complete');
  const toggleClass = completed ? 'btn--secondary' : 'btn--primary';
  html += `<button class="btn ${toggleClass} btn--full mt-md" id="sheetToggleComplete" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">${toggleLabel}</button>`;
```

- [ ] **Step 2: Pass `isPastDate` from dashboard `openTaskSheet`**

In `dashboard.js`, in `openTaskSheet` (around line 665), add `isPastDate` to the options passed to `renderTaskDetailSheet`:

```js
  const sheetContent = renderTaskDetailSheet({
    entryKey,
    entry: { ...entry, dateKey: dateKey || viewDate },
    task,
    person,
    category: cat,
    completed,
    points: { possible: pts },
    sliderMin: settings?.sliderMin ?? 0,
    sliderMax: settings?.sliderMax ?? 150,
    currentOverride: currentOverride != null ? currentOverride : 100,
    gradePreview,
    people,
    showDelegate: true,
    showMove: true,
    showEdit: true,
    showPoints: settings?.showPoints !== false,
    isEvent: !!cat?.isEvent,
    isPastDate: (dateKey || viewDate) < today
  });
```

- [ ] **Step 3: Pass `isPastDate` from calendar `openTaskSheet`**

In `calendar.html`, in `openTaskSheet` (around line 568), add `isPastDate`:

```js
      const sheetContent = renderTaskDetailSheet({
        entryKey,
        entry: { ...entry, dateKey },
        task,
        person,
        category: cat,
        completed,
        points: { possible: pts },
        sliderMin: settings?.sliderMin ?? 0,
        sliderMax: settings?.sliderMax ?? 150,
        currentOverride: currentOverride != null ? currentOverride : 100,
        gradePreview,
        people,
        showDelegate: true,
        showMove: true,
        showEdit: true,
        showPoints: settings?.showPoints !== false,
        isEvent: !!cat?.isEvent,
        isPastDate: dateKey < today
      });
```

- [ ] **Step 4: Commit**

```bash
git add shared/components.js dashboard.js calendar.html
git commit -m "feat: show 'Complete (Late)' button label on past-date tasks in detail sheet"
```

---

### Task 9: "Complete (Late)" button label — kid mode

**Files:**
- Modify: `kid.html:1143-1147` (toggle button in `renderKidTaskSheet`)

- [ ] **Step 1: Update kid mode sheet button**

In `kid.html`, in `renderKidTaskSheet` (around line 1108), the function receives `{ entryKey, entry, task, cat, completed, pts, currentOverride, people }`. We need to know if the date is past. The entry already has `dateKey` set on it. Replace lines 1143-1147:

```js
          // Complete/uncomplete button
          const isPastDate = entry.dateKey && entry.dateKey < today;
          const isLateEligible = isPastDate && !completed && !cat?.isEvent && !task.exempt;
          const isPinLocked = !completed && !isLateEligible && isTaskPinProtected(entryKey);
          const toggleLabel = completed ? 'Mark Incomplete' : (isLateEligible ? 'Complete (Late)' : (isPinLocked ? '🔒 Mark Complete' : 'Mark Complete'));
          const toggleClass = completed ? 'btn--secondary' : 'btn--primary';
          html += `<button class="btn ${toggleClass} btn--full mt-md" id="sheetToggleComplete" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">${toggleLabel}</button>`;
```

Note: PIN lock only shows when it's not a late-eligible task (late tasks on past dates don't need the PIN lock icon since the "Late" label already communicates friction).

- [ ] **Step 2: Commit**

```bash
git add kid.html
git commit -m "feat: show 'Complete (Late)' button label in kid mode detail sheet"
```

---

### Task 10: "Late" chip on past daily task cards

**Files:**
- Modify: `shared/components.js:211-272` (`renderTaskCard`)

- [ ] **Step 1: Add `isPastDaily` option and render chip**

In `shared/components.js`, add `isPastDaily` to the destructured options in `renderTaskCard` (line 212):

```js
export function renderTaskCard(options) {
  const { entryKey, entry, task, person, category, completed, overdue, dateLabel, points, isEvent, showPoints = true, isPastDaily = false } = options;
```

Then after `actionTags` (around line 245), add the Late chip:

```js
  // Late chip for incomplete past daily tasks
  if (isPastDaily && !completed) {
    actionTags += `<span class="task-card__tag task-card__tag--late">Late</span>`;
  }
```

- [ ] **Step 2: Pass `isPastDaily` from dashboard render**

In `dashboard.js`, in the render function where incomplete tasks are rendered (around line 264), add `isPastDaily` to the `renderTaskCard` call:

```js
        html += renderTaskCard({
          entryKey,
          entry: { ...entry, dateKey: viewDate },
          task,
          person,
          category: cat,
          completed: false,
          overdue: false,
          points: { possible: pts, override: ovr },
          isEvent: !!cat?.isEvent,
          showPoints: settings?.showPoints !== false,
          showTodIconBoth: !!settings?.showTodIconBoth,
          showTodIconSingle: !!settings?.showTodIconSingle,
          isPastDaily: viewDate < today && entry.rotationType === 'daily'
        });
```

- [ ] **Step 3: Pass `isPastDaily` from calendar render**

In `calendar.html`, in the day sheet rendering where incomplete task cards are built (around line 325):

```js
            html += renderTaskCard({ entryKey, entry: { ...entry, dateKey }, task, person, category: cat, completed: false, overdue: false, points: { possible: pts, override: ovr }, isEvent: !!cat?.isEvent, showPoints: settings?.showPoints !== false, showTodIconBoth: !!settings?.showTodIconBoth, showTodIconSingle: !!settings?.showTodIconSingle, isPastDaily: dateKey < today && entry.rotationType === 'daily' });
```

- [ ] **Step 4: Pass `isPastDaily` from kid mode render**

In `kid.html`, in the render function where incomplete task cards are built (around line 559):

```js
                  html += renderTaskCard({
                    entryKey,
                    entry: { ...entry, dateKey: viewDate },
                    task: kidTask(task),
                    person: kid,
                    category: cat,
                    completed: false,
                    overdue: false,
                    points: { possible: pts, override: ovr },
                    isEvent: !!cat?.isEvent,
                    showPoints: settings?.showPoints !== false,
                    isPastDaily: viewDate < today && entry.rotationType === 'daily'
                  });
```

- [ ] **Step 5: Commit**

```bash
git add shared/components.js dashboard.js calendar.html kid.html
git commit -m "feat: show 'Late' chip on incomplete past daily task cards"
```

---

### Task 11: Style the "Late" chip

**Files:**
- Modify: `styles/components.css` (add `.task-card__tag--late` style)

- [ ] **Step 1: Add CSS for the Late tag**

In `styles/components.css`, find the existing `.task-card__tag` styles (search for `task-card__tag--delegated` or `task-card__tag--moved`). Add a new rule after them:

```css
.task-card__tag--late {
  background: var(--color-warning, #f59e0b);
  color: #fff;
}
```

Uses the existing `--color-warning` CSS variable if defined, with an amber fallback. Same size/shape as existing delegated/moved tags.

- [ ] **Step 2: Commit**

```bash
git add styles/components.css
git commit -m "style: add Late chip color for past daily task cards"
```

---

### Task 12: Manual testing checklist

- [ ] **Step 1: Test dashboard — today's tasks**

Open dashboard on today's date. Tap a daily task — should toggle complete normally. No "Late" chip visible. Long-press opens detail sheet with "Mark Complete" (not "Complete (Late)").

- [ ] **Step 2: Test dashboard — past daily task**

Swipe back to yesterday on dashboard. Find an incomplete daily task. Verify:
- "Late" chip visible on the card
- Tap opens detail sheet (not toggle)
- Detail sheet shows "Complete (Late)" button
- Click "Complete (Late)" — task completes
- Reopen detail sheet — slider shows `pastDueCreditPct` value (default 75%)
- Slider is adjustable

- [ ] **Step 3: Test dashboard — past weekly/monthly task**

Swipe back to a past date with a weekly task. Verify:
- No "Late" chip (only daily gets it)
- Tap toggles complete normally
- After completing, reopen detail sheet — slider shows `pastDueCreditPct` value
- `isLate: true` is on the completion record (check Firebase console)

- [ ] **Step 4: Test calendar — past daily task**

Open calendar, tap a past day that has daily tasks. Verify same behavior as dashboard: tap opens sheet, "Complete (Late)" button, penalty applied.

- [ ] **Step 5: Test kid mode — past daily task**

Open kid mode, swipe to yesterday. Verify same behavior: tap opens sheet, "Complete (Late)" button, penalty applied.

- [ ] **Step 6: Test uncomplete and re-complete**

Complete a past daily task via override. Then uncomplete it. Then re-complete it. Verify `isLate: true` and `pointsOverride` are re-set correctly.

- [ ] **Step 7: Test pre-set slider override**

On a past daily task, open detail sheet via long-press, adjust slider to 120%, close sheet. Then tap the card (should open sheet). Click "Complete (Late)". Verify the pre-set 120% override is used (not the late penalty), and `isLate` is NOT set (parent intentionally overrode).

- [ ] **Step 8: Test scoring accuracy**

Complete a past task with late penalty. Check the scoreboard — verify the person's daily score for that date reflects the reduced points. Compare with Firebase data to confirm `pointsOverride` is stored correctly.

- [ ] **Step 9: Test events and exempt tasks**

Find an event task on a past date. Tap it — should toggle normally (no blocking). Detail sheet should show "Complete" (not "Complete (Late)"). No `isLate` flag set.

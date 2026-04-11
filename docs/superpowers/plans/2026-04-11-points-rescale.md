# Points System Rescale & Configurable Difficulty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rescale the points formula so late penalties actually land, give every task size a meaningful point value, and make difficulty multipliers a per-family admin setting. Preserve historical grades with zero migration.

**Architecture:** Replace `basePoints = round(mult × (1 + estMin/30))` with `basePoints = max(estMin, 5) × mult`. Move difficulty multipliers from a hardcoded `{easy:1, medium:2, hard:3}` constant into `rundown/settings.difficultyMultipliers`, with the same object as a fallback default. Thread the multipliers object through every `basePoints` / `earnedPoints` / `dailyPossible` / `dailyScore` / `buildSnapshot` call site in the scoring module and all seven pages. Add an admin Settings form section for the three multiplier inputs. Because `earned` and `possible` both scale by the same factor, existing snapshots produce identical percentages and grades — no backfill.

**Tech Stack:** Vanilla ES modules, Firebase Realtime Database (compat SDK via CDN), no build step, no automated test suite. Verification is manual in-browser. Deployment: `git push origin main` to Cloudflare Pages.

**Spec:** [docs/superpowers/specs/2026-04-11-points-rescale-design.md](../specs/2026-04-11-points-rescale-design.md)

---

## File Structure

**Modify:**
- `shared/scoring.js` — new formula, constants, threaded multiplier argument through `basePoints`, `earnedPoints`, `dailyPossible`, `dailyScore`, `buildSnapshot`
- `dashboard.js` — 5 `basePoints` call sites, pass `settings.difficultyMultipliers`
- `calendar.html` — 3 `basePoints` call sites
- `kid.html` — 6 `basePoints` call sites
- `tracker.html` — 1 `basePoints` call site
- `scoreboard.html` — 2 `basePoints` + 2 `earnedPoints` call sites
- `admin.html` — 2 `basePoints` call sites + new Settings form section + save handler extension
- `shared/components.js` — add `id` and classes to slider live-earned label so CSS can target it (no layout change)
- `styles/scoreboard.css` — `tabular-nums` on numeric display classes
- `styles/components.css` — `tabular-nums` + `min-width` on slider value label
- `styles/dashboard.css` — `tabular-nums` on daily progress indicator
- `sw.js` — bump `CACHE_NAME` from `family-hub-v28` to `family-hub-v29`

**Do not modify:**
- `shared/firebase.js` — `writeSettings` already handles arbitrary settings fields via merge; no new helper needed.
- Any CSS layout rules (`white-space`, `flex-wrap`, breakpoints).
- The grade bands in `shared/scoring.js`.

---

## Testing Note

This project has no automated test suite (no package.json, no test runner). Every task below replaces the typical "write a failing test" step with a **manual browser verification** step. Verification uses Chrome DevTools at 360/400/768px widths. For any task that affects scoring math, the verification includes a numeric spot-check ("task should now show X pts") so we catch regressions by inspection rather than assertion.

If an automated test suite is later added, the manual verification steps in this plan translate directly into test cases.

---

## Task 1: Add new formula + constants to scoring.js

**Files:**
- Modify: `shared/scoring.js:1-37`

- [ ] **Step 1: Replace the top constants block and `basePoints` function**

Find the existing block at `shared/scoring.js:5-37`:

```js
// ── Difficulty multipliers ──

const DIFFICULTY_MULTIPLIER = { easy: 1, medium: 2, hard: 3 };

// ── Grade table (descending order for lookup) ──

const GRADE_TABLE = [
  { min: 97, grade: 'A+' },
  // ... (unchanged)
];

// ── Core calculations ──

/**
 * Calculate base points for a task.
 * Formula: difficultyMultiplier × (1 + estMin / 30), rounded.
 */
export function basePoints(task) {
  const mult = DIFFICULTY_MULTIPLIER[task.difficulty] || 1;
  const est = task.estMin || 1;
  return Math.round(mult * (1 + est / 30));
}
```

Replace with:

```js
// ── Difficulty multipliers ──

export const DEFAULT_DIFFICULTY_MULTIPLIERS = { easy: 1, medium: 2, hard: 3 };
const MIN_EST_MIN = 5;

// ── Grade table (descending order for lookup) ──

const GRADE_TABLE = [
  { min: 97, grade: 'A+' },
  { min: 93, grade: 'A' },
  { min: 90, grade: 'A-' },
  { min: 87, grade: 'B+' },
  { min: 83, grade: 'B' },
  { min: 80, grade: 'B-' },
  { min: 77, grade: 'C+' },
  { min: 73, grade: 'C' },
  { min: 70, grade: 'C-' },
  { min: 67, grade: 'D+' },
  { min: 63, grade: 'D' },
  { min: 60, grade: 'D-' },
  { min: 0,  grade: 'F' }
];

// ── Core calculations ──

/**
 * Calculate base points for a task.
 * Formula: max(estMin, 5) × difficultyMultiplier.
 * Both operands are integers, so the result is an integer with no rounding.
 *
 * @param {object} task - The task definition
 * @param {object} [difficultyMultipliers] - Per-family multipliers; falls back to defaults
 * @returns {number} integer base points
 */
export function basePoints(task, difficultyMultipliers) {
  const mults = difficultyMultipliers || DEFAULT_DIFFICULTY_MULTIPLIERS;
  const mult = mults[task.difficulty] ?? 1;
  const est = Math.max(task.estMin || 0, MIN_EST_MIN);
  return est * mult;
}
```

**Rationale for each change:**
- `DIFFICULTY_MULTIPLIER` (private const) → `DEFAULT_DIFFICULTY_MULTIPLIERS` (exported) so callers without settings (e.g., admin task preview before settings load) can reference the canonical defaults and admin "reset" can restore them.
- `MIN_EST_MIN = 5` enforces the floor discussed in the spec; every task is worth at least `5 × mult` even if its estimate is 1-4 minutes or missing.
- `basePoints` new signature accepts optional `difficultyMultipliers`. When omitted, falls back to defaults — this lets legacy single-arg calls keep compiling during the rollout.
- The `Math.round` is gone because `Math.max(int, 5) * int` is always an integer.

- [ ] **Step 2: Manually verify scoring.js loads without syntax errors**

Open `shared/scoring.js` in an editor and confirm it still parses. Then open any page that imports it (e.g. `dashboard.js`) in a browser and check the browser console. Expected: no `SyntaxError` from `scoring.js`. Some grade values on the dashboard may temporarily look different — that's expected and will be verified properly in later tasks.

- [ ] **Step 3: Commit**

```bash
git add shared/scoring.js
git commit -m "refactor(scoring): rescale basePoints to max(estMin,5) × mult

Replaces round(mult × (1 + estMin/30)) with an integer formula
that produces larger, differentiated point values. Introduces
DEFAULT_DIFFICULTY_MULTIPLIERS as an exported constant for
fallback use during the call-site threading rollout."
```

---

## Task 2: Thread multipliers through scoring.js internal call sites

**Files:**
- Modify: `shared/scoring.js` — `earnedPoints` (lines 73-82), `dailyPossible` (lines 94-146), `dailyScore` (lines 160-187), `buildSnapshot` (lines 203-235)

- [ ] **Step 1: Update `earnedPoints` signature and internal call**

Find at `shared/scoring.js:73-82`:

```js
export function earnedPoints(task, completion) {
  if (!completion) return 0;
  const base = basePoints(task);

  if (completion.pointsOverride != null) {
    return Math.round(base * (completion.pointsOverride / 100));
  }

  return base;
}
```

Replace with:

```js
export function earnedPoints(task, completion, difficultyMultipliers) {
  if (!completion) return 0;
  const base = basePoints(task, difficultyMultipliers);

  if (completion.pointsOverride != null) {
    return Math.round(base * (completion.pointsOverride / 100));
  }

  return base;
}
```

- [ ] **Step 2: Update `dailyPossible` signature and internal call sites**

Find at `shared/scoring.js:94`:

```js
export function dailyPossible(entries, tasks, categories) {
```

Replace with:

```js
export function dailyPossible(entries, tasks, categories, difficultyMultipliers) {
```

Then find at `shared/scoring.js:127`:

```js
      const pts = basePoints(task);
```

Replace with:

```js
      const pts = basePoints(task, difficultyMultipliers);
```

Then find at `shared/scoring.js:138-141`:

```js
    const weightedPts = ownerRegular > 0
      ? Math.round(ownerRegular * (w / (100 - w)))
      : basePoints(task);
```

Replace with:

```js
    const weightedPts = ownerRegular > 0
      ? Math.round(ownerRegular * (w / (100 - w)))
      : basePoints(task, difficultyMultipliers);
```

- [ ] **Step 3: Update `dailyScore` to extract multipliers from settings and pass through**

Find at `shared/scoring.js:161`:

```js
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories);
```

Replace with:

```js
  const mults = settings?.difficultyMultipliers;
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories, mults);
```

Then find at `shared/scoring.js:173`:

```js
    const basePts = pointsMap[key] ?? basePoints(task);
```

Replace with:

```js
    const basePts = pointsMap[key] ?? basePoints(task, mults);
```

- [ ] **Step 4: Update `buildSnapshot` to extract multipliers from settings and pass through**

Find at `shared/scoring.js:204`:

```js
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories);
```

Replace with:

```js
  const mults = settings?.difficultyMultipliers;
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories, mults);
```

Then find at `shared/scoring.js:218`:

```js
      const basePts = pointsMap[key] ?? basePoints(task);
```

Replace with:

```js
      const basePts = pointsMap[key] ?? basePoints(task, mults);
```

- [ ] **Step 5: Manually verify scoring.js still loads**

Open the dashboard in a browser. Expected: page renders, no console errors from `scoring.js`. Daily scores should still display and match what they showed in Task 1. (They haven't changed yet because page call sites still pass one argument — the fallback to defaults is active everywhere.)

- [ ] **Step 6: Commit**

```bash
git add shared/scoring.js
git commit -m "refactor(scoring): thread difficultyMultipliers through internal call sites

earnedPoints, dailyPossible, dailyScore, and buildSnapshot now
accept and forward the multipliers object. dailyScore and
buildSnapshot extract it from the settings argument they already
receive. External page callers still pass one argument and fall
back to defaults — threading from page level comes in later tasks."
```

---

## Task 3: Update call sites in dashboard.js

**Files:**
- Modify: `dashboard.js` — lines 200, 262, 301, 352, 677

`settings` is already in scope at all these call sites (confirmed — line 213 already references `settings?.showPoints`). Each change is mechanical: add `settings?.difficultyMultipliers` as the second argument.

- [ ] **Step 1: Update all 5 call sites**

Find at `dashboard.js:200`:

```js
      const pts = basePoints(task);
```

Replace with:

```js
      const pts = basePoints(task, settings?.difficultyMultipliers);
```

Find at `dashboard.js:262`:

```js
        const pts = score.pointsMap[entryKey] || basePoints(task);
```

Replace with:

```js
        const pts = score.pointsMap[entryKey] || basePoints(task, settings?.difficultyMultipliers);
```

Find at `dashboard.js:301`:

```js
          const pts = score.pointsMap[entryKey] || basePoints(task);
```

Replace with:

```js
          const pts = score.pointsMap[entryKey] || basePoints(task, settings?.difficultyMultipliers);
```

Find at `dashboard.js:352`:

```js
    const bp = basePoints(task);
```

Replace with:

```js
    const bp = basePoints(task, settings?.difficultyMultipliers);
```

Find at `dashboard.js:677`:

```js
  const pts = basePoints(task);
```

Replace with:

```js
  const pts = basePoints(task, settings?.difficultyMultipliers);
```

**Note:** All five replacements are currently unique substrings (they have surrounding context that differs: variable names `pts` vs `bp`, different leading whitespace, different fallback expressions). If any edit fails because the old_string isn't unique, widen the context by including one line before/after.

- [ ] **Step 2: Manually verify dashboard scoring reflects new formula**

Reload dashboard in browser. Pick a person with a full day. Expected:
- Task cards show significantly larger point values than before (e.g., a task that showed "2pt" now shows "10pt" or "15pt")
- Daily progress indicator shows earned/possible ratio in the new scale
- Letter grade for the day is unchanged vs. what you'd expect — the percentage is preserved because `earned` and `possible` scale together
- No console errors

Spot check: a 10-minute easy task should now be 10 pts. A 15-minute medium task should be 30 pts. If you see tasks stuck at 1-2 pts, that site was missed.

- [ ] **Step 3: Commit**

```bash
git add dashboard.js
git commit -m "refactor(dashboard): thread settings.difficultyMultipliers to basePoints

Updates all 5 basePoints call sites in dashboard.js to pass the
family-configured difficulty multipliers. Falls back to defaults
when settings is absent or still loading."
```

---

## Task 4: Update call sites in calendar.html

**Files:**
- Modify: `calendar.html` — lines 323, 336, 566

`settings` is in scope at all three sites. Confirm by checking that other lines nearby reference `settings` or that `settings` is defined at module scope earlier in the file.

- [ ] **Step 1: Update the three call sites**

Find at `calendar.html:323`:

```js
            const pts = score.pointsMap[entryKey] || basePoints(task);
```

Replace with (note: this string appears twice — at lines 323 and 336. Both should be changed identically. Use `replace_all: true` for this exact string, or widen the context to make each unique if the surrounding lines differ):

```js
            const pts = score.pointsMap[entryKey] || basePoints(task, settings?.difficultyMultipliers);
```

Find at `calendar.html:566`:

```js
      const pts = basePoints(task);
```

Replace with:

```js
      const pts = basePoints(task, settings?.difficultyMultipliers);
```

- [ ] **Step 2: Manually verify calendar day sheet shows new point values**

Open `calendar.html`. Tap a day with scheduled tasks. Expected:
- The day sheet shows task point values in the new scale
- Grade bars for the month are correct (same percentages as before)
- No console errors

- [ ] **Step 3: Commit**

```bash
git add calendar.html
git commit -m "refactor(calendar): thread difficultyMultipliers to basePoints calls"
```

---

## Task 5: Update call sites in kid.html

**Files:**
- Modify: `kid.html` — lines 451, 519, 557, 590, 1102

`settings` is in scope (kid mode reads settings for per-child preferences). Six `basePoints` sites total.

- [ ] **Step 1: Update all call sites**

Find at `kid.html:451`:

```js
              const pts = basePoints(task);
```

Replace with:

```js
              const pts = basePoints(task, settings?.difficultyMultipliers);
```

Find at `kid.html:519`:

```js
                  const pts = score.pointsMap[entryKey] || basePoints(task);
```

Replace with:

```js
                  const pts = score.pointsMap[entryKey] || basePoints(task, settings?.difficultyMultipliers);
```

This same string (`score.pointsMap[entryKey] || basePoints(task)`) also appears at lines 557 and 590 with identical indentation. If `replace_all: true` is used, confirm the three locations are the only occurrences. If any differ in leading whitespace, widen the context:

At `kid.html:557`, the full line (with leading whitespace):

```js
                  const pts = score.pointsMap[entryKey] || basePoints(task);
```

Replace with:

```js
                  const pts = score.pointsMap[entryKey] || basePoints(task, settings?.difficultyMultipliers);
```

At `kid.html:590`, the full line:

```js
                    const pts = score.pointsMap[entryKey] || basePoints(task);
```

Replace with:

```js
                    const pts = score.pointsMap[entryKey] || basePoints(task, settings?.difficultyMultipliers);
```

Find at `kid.html:1102`:

```js
          const pts = basePoints(task);
```

Replace with:

```js
          const pts = basePoints(task, settings?.difficultyMultipliers);
```

- [ ] **Step 2: Manually verify kid mode shows new point values**

Open `kid.html?kid=<Name>` for a configured kid. Expected:
- Task cards show new-scale point values
- Grade / progress match the dashboard for the same person on the same day
- No console errors

- [ ] **Step 3: Commit**

```bash
git add kid.html
git commit -m "refactor(kid): thread difficultyMultipliers to basePoints calls"
```

---

## Task 6: Update call sites in tracker.html

**Files:**
- Modify: `tracker.html` — line 527

- [ ] **Step 1: Update the single call site**

Find at `tracker.html:527`:

```js
      const pts = basePoints(task);
```

Replace with:

```js
      const pts = basePoints(task, settings?.difficultyMultipliers);
```

- [ ] **Step 2: Manually verify tracker**

Open `tracker.html`. Filter by a person. Expected:
- Weekly/monthly task rows show new-scale points where visible
- Skipped task detection still works correctly (it doesn't depend on absolute point values)
- No console errors

- [ ] **Step 3: Commit**

```bash
git add tracker.html
git commit -m "refactor(tracker): thread difficultyMultipliers to basePoints call"
```

---

## Task 7: Update call sites in scoreboard.html

**Files:**
- Modify: `scoreboard.html` — lines 181, 185, 460, 461

This file calls both `basePoints` and `earnedPoints`. Both need to receive the multipliers argument.

- [ ] **Step 1: Update basePoints call at line 181**

Find at `scoreboard.html:181`:

```js
          const pts = basePoints(task);
```

Replace with:

```js
          const pts = basePoints(task, settings?.difficultyMultipliers);
```

- [ ] **Step 2: Update earnedPoints call at line 185**

Find at `scoreboard.html:185`:

```js
            catTotals[catKey].earned += earnedPoints(task, completion);
```

Replace with:

```js
            catTotals[catKey].earned += earnedPoints(task, completion, settings?.difficultyMultipliers);
```

- [ ] **Step 3: Update basePoints call at line 460**

Find at `scoreboard.html:460`:

```js
          const pts = basePoints(task);
```

**Note:** This is the same string as line 181. Either use `replace_all: true` (both sites need the same change) or widen the context to match the surrounding lines at each location.

Replace with:

```js
          const pts = basePoints(task, settings?.difficultyMultipliers);
```

- [ ] **Step 4: Update earnedPoints call at line 461**

Find at `scoreboard.html:461`:

```js
          const earned = completion ? earnedPoints(task, completion) : 0;
```

Replace with:

```js
          const earned = completion ? earnedPoints(task, completion, settings?.difficultyMultipliers) : 0;
```

- [ ] **Step 5: Manually verify scoreboard**

Open `scoreboard.html`. Expected:
- Leaderboard shows new-scale earned/possible totals
- Grades are unchanged (percentages preserved)
- Category breakdown drilldown shows new-scale numbers
- Weekly/monthly/12-month aggregated grades match the pre-change values within rounding
- No console errors

**Key check:** Open the drilldown for a date range that includes both pre-deploy and post-deploy days (if this is being tested against a real database with historical data). The aggregated percentage should remain correct even though the pre-change days have small raw numbers and post-change days have large ones — the ratio is preserved.

- [ ] **Step 6: Commit**

```bash
git add scoreboard.html
git commit -m "refactor(scoreboard): thread difficultyMultipliers to scoring calls"
```

---

## Task 8: Update call sites in admin.html

**Files:**
- Modify: `admin.html` — line 415 (sort comparator), line 1135 (task preview)

- [ ] **Step 1: Update the sort comparator at line 415**

Find at `admin.html:415`:

```js
          case 'points': return basePoints(tb) - basePoints(ta);
```

Replace with:

```js
          case 'points': return basePoints(tb, settings?.difficultyMultipliers) - basePoints(ta, settings?.difficultyMultipliers);
```

- [ ] **Step 2: Update the task preview at line 1135**

Find at `admin.html:1135`:

```js
      const pts = basePoints(task);
```

Replace with:

```js
      const pts = basePoints(task, settings?.difficultyMultipliers);
```

- [ ] **Step 3: Manually verify admin**

Open `admin.html`. Expected:
- Tasks tab: sort by points works (task list reorders by new-scale point values)
- Edit a task: the point preview (if shown in the form) reflects the new-scale value
- No console errors

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "refactor(admin): thread difficultyMultipliers to basePoints calls"
```

---

## Task 9: Add difficulty multipliers to admin Settings form

**Files:**
- Modify: `admin.html` — form markup around lines 785-808, save handler around lines 2066-2081

The Settings tab form uses `<input id="sf_...">` convention with values read via `parseIntOr` in the save handler. The new fields follow the same pattern and are placed near the other scoring knobs (`weekendWeight`, `pastDueCredit`).

- [ ] **Step 1: Add the difficulty multiplier fields to the form markup**

Find at `admin.html:795-798`:

```html
        <div class="form-group">
          <label class="admin-checkbox"><input type="checkbox" id="sf_showTodIconBoth"${settings?.showTodIconBoth ? ' checked' : ''}> Show AM/PM icons on "Both" tasks</label>
          <label class="admin-checkbox"><input type="checkbox" id="sf_showTodIconSingle"${settings?.showTodIconSingle ? ' checked' : ''}> Show AM/PM icons on dedicated AM or PM tasks</label>
        </div>
```

Insert **directly before** this block (so the new section lives between the past-due-credit row and the AM/PM icon checkboxes):

```html
        <div class="form-group">
          <label class="form-label">Difficulty Multipliers</label>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label class="form-label">Easy</label>
              <input type="number" id="sf_diffEasy" value="${settings?.difficultyMultipliers?.easy ?? 1}" min="1" max="10" step="1">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Medium</label>
              <input type="number" id="sf_diffMedium" value="${settings?.difficultyMultipliers?.medium ?? 2}" min="1" max="10" step="1">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Hard</label>
              <input type="number" id="sf_diffHard" value="${settings?.difficultyMultipliers?.hard ?? 3}" min="1" max="10" step="1">
            </div>
          </div>
          <p class="form-hint">Point multiplier per difficulty. Default: 1 / 2 / 3.</p>
          <button type="button" class="btn btn--ghost btn--sm" id="sf_diffReset">Reset to defaults</button>
        </div>
```

- [ ] **Step 2: Extend the settings save handler to persist the new fields**

Find at `admin.html:2066-2081`:

```js
        const updated = {
          ...settings,
          appName: main.querySelector('#sf_appName')?.value.trim() || 'Daily Rundown',
          familyName: main.querySelector('#sf_familyName')?.value.trim() || '',
          timezone: main.querySelector('#sf_timezone')?.value || settings?.timezone,
          weekendWeightWeekly: parseFloatOr(main.querySelector('#sf_weekendWeightWeekly')?.value, 1.5),
          weekendWeightMonthly: parseFloatOr(main.querySelector('#sf_weekendWeightMonthly')?.value, 3),
          pastDueCreditPct: parseIntOr(main.querySelector('#sf_pastDueCredit')?.value, 75),
          sliderMin: parseIntOr(main.querySelector('#sf_sliderMin')?.value, 0),
          sliderMax: parseIntOr(main.querySelector('#sf_sliderMax')?.value, 150),
          showPoints: main.querySelector('#sf_showPoints')?.checked !== false,
          showTodIconBoth: !!main.querySelector('#sf_showTodIconBoth')?.checked,
          showTodIconSingle: !!main.querySelector('#sf_showTodIconSingle')?.checked,
          longPressMs: parseIntOr(main.querySelector('#sf_longPressMs')?.value, 500),
          kidLongPressMs: parseIntOr(main.querySelector('#sf_kidLongPressMs')?.value, 500)
        };
```

Replace with:

```js
        const clampMult = (raw, fallback) => {
          const n = parseIntOr(raw, fallback);
          return Math.min(10, Math.max(1, n));
        };
        const newDiffEasy = clampMult(main.querySelector('#sf_diffEasy')?.value, 1);
        const newDiffMedium = clampMult(main.querySelector('#sf_diffMedium')?.value, 2);
        const newDiffHard = clampMult(main.querySelector('#sf_diffHard')?.value, 3);

        // Soft warning on non-monotonic multipliers
        if (newDiffEasy > newDiffMedium || newDiffMedium > newDiffHard) {
          const ok = confirm(
            `Difficulty multipliers are usually increasing (easy ≤ medium ≤ hard).\n` +
            `You entered: easy=${newDiffEasy}, medium=${newDiffMedium}, hard=${newDiffHard}.\n\n` +
            `Save anyway?`
          );
          if (!ok) return;
        }

        const updated = {
          ...settings,
          appName: main.querySelector('#sf_appName')?.value.trim() || 'Daily Rundown',
          familyName: main.querySelector('#sf_familyName')?.value.trim() || '',
          timezone: main.querySelector('#sf_timezone')?.value || settings?.timezone,
          weekendWeightWeekly: parseFloatOr(main.querySelector('#sf_weekendWeightWeekly')?.value, 1.5),
          weekendWeightMonthly: parseFloatOr(main.querySelector('#sf_weekendWeightMonthly')?.value, 3),
          pastDueCreditPct: parseIntOr(main.querySelector('#sf_pastDueCredit')?.value, 75),
          sliderMin: parseIntOr(main.querySelector('#sf_sliderMin')?.value, 0),
          sliderMax: parseIntOr(main.querySelector('#sf_sliderMax')?.value, 150),
          showPoints: main.querySelector('#sf_showPoints')?.checked !== false,
          showTodIconBoth: !!main.querySelector('#sf_showTodIconBoth')?.checked,
          showTodIconSingle: !!main.querySelector('#sf_showTodIconSingle')?.checked,
          longPressMs: parseIntOr(main.querySelector('#sf_longPressMs')?.value, 500),
          kidLongPressMs: parseIntOr(main.querySelector('#sf_kidLongPressMs')?.value, 500),
          difficultyMultipliers: { easy: newDiffEasy, medium: newDiffMedium, hard: newDiffHard }
        };
```

- [ ] **Step 3: Wire up the "Reset to defaults" button**

Still inside `bindSettingsTab` at `admin.html` (the same function being edited above), immediately after the `#settingsSave` event binding block that ends around line 2114, add a new event binding. Find the end of the save handler block:

```js
        if (msgEl) {
          msgEl.textContent = 'Settings saved!';
```

Scroll down to find where this `bindSettingsTab` function's event bindings end (look for the next `function` declaration or a closing `}`). Just before that closing brace, insert:

```js
      main.querySelector('#sf_diffReset')?.addEventListener('click', () => {
        const easyInput = main.querySelector('#sf_diffEasy');
        const mediumInput = main.querySelector('#sf_diffMedium');
        const hardInput = main.querySelector('#sf_diffHard');
        if (easyInput) easyInput.value = 1;
        if (mediumInput) mediumInput.value = 2;
        if (hardInput) hardInput.value = 3;
      });
```

**Note:** If `bindSettingsTab`'s structure makes it hard to find a clean insertion point, placing this block immediately after the `main.querySelector('#settingsSave')?.addEventListener('click', ...)` block (after its closing `});`) is equivalent and easier to locate.

- [ ] **Step 4: Manually verify the new settings UI**

Reload `admin.html`, navigate to the Settings tab. Expected:
- Three new number inputs labeled Easy / Medium / Hard appear near the scoring settings
- Values default to 1 / 2 / 3 (or the family's saved values)
- "Reset to defaults" button resets the three inputs to 1 / 2 / 3 without saving
- Entering valid values (e.g., 1/2/4) and clicking Save works with no confirmation prompt
- Entering non-monotonic values (e.g., 3/1/2) and clicking Save triggers a confirm dialog; clicking Cancel aborts the save, clicking OK proceeds
- Entering a value outside 1–10 (e.g., 0 or 15) is clamped to the nearest valid value on save
- After saving, hard-reload the dashboard and confirm hard tasks show larger point values if you bumped the hard multiplier

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat(admin): configurable difficulty multipliers in Settings

Adds three integer inputs for easy/medium/hard multipliers to the
Settings tab. Values are clamped to 1-10 and persisted under
settings.difficultyMultipliers. Non-monotonic values trigger a
soft warning confirm dialog rather than a hard block. Includes
a reset-to-defaults button."
```

---

## Task 10: CSS — tabular-nums and slider min-width

**Files:**
- Modify: `shared/components.js` — add `tabular-nums` class to slider value label (line 438)
- Modify: `styles/components.css` — slider label styling
- Modify: `styles/scoreboard.css` — tabular-nums on numeric display classes
- Modify: `styles/dashboard.css` — tabular-nums on daily progress indicator

- [ ] **Step 1: Update the slider value label in components.js**

Find at `shared/components.js:438`:

```js
        <span class="task-detail__slider-value" id="sliderValueLabel">${sliderVal}% (${earnedPts}pt)</span>
```

Replace with:

```js
        <span class="task-detail__slider-value task-detail__slider-value--numeric" id="sliderValueLabel">${sliderVal}% (${earnedPts}pt)</span>
```

The added class is a hook for CSS targeting. Backward-compatible because `task-detail__slider-value` is kept.

- [ ] **Step 2: Add the slider value CSS rule**

Open `styles/components.css` and find the existing `.task-detail__slider` block (grep for `task-detail__slider` to locate it). At the end of the file or immediately after the existing `.task-detail__slider-value` rule (if present), add:

```css
.task-detail__slider-value--numeric {
  font-variant-numeric: tabular-nums;
  min-width: 7.5ch;
  display: inline-block;
  text-align: right;
}
```

`7.5ch` accommodates `150% (180pt)` (14 chars including parens) at tabular width. The right-alignment prevents the label from jittering left/right as the numeric width changes.

**Note:** If `styles/components.css` already has a `.task-detail__slider-value` rule, do not remove it. Add this new rule as a supplementary selector; the combination of `task-detail__slider-value` + `task-detail__slider-value--numeric` in the HTML picks up both.

- [ ] **Step 3: Add tabular-nums to scoreboard numeric displays**

Open `styles/scoreboard.css`. Add the following at the end of the file:

```css
/* Larger points totals after rescale — stable digit widths prevent reflow jitter */
.sb-card__number,
.sb-drilldown__task-pts,
.sb-category__earned,
.sb-category__total {
  font-variant-numeric: tabular-nums;
}
```

**Note:** Some of these class names may not exist in the current stylesheet; that's fine, unknown selectors are harmless no-ops. The goal is to cover whatever numeric display classes the scoreboard uses. If you want to verify coverage, grep `scoreboard.html` for `class="sb-` and add any numeric-display classes you find to this rule. A safe catch-all alternative (less targeted but simpler) is:

```css
/* Any scoreboard element that will display a point count gets stable digit widths */
.sb-leaderboard__points,
.sb-leaderboard__grade-pct,
.sb-card__number,
.sb-drilldown__task-pts,
.sb-category__earned,
.sb-category__total,
.sb-period-total {
  font-variant-numeric: tabular-nums;
}
```

Use the catch-all form. Unknown selectors cost nothing.

- [ ] **Step 4: Add tabular-nums to the dashboard daily progress indicator**

Open `styles/dashboard.css`. Grep the file for classes containing `progress` or `score` or `points`. Add the following at the end of the file (catch-all approach — unknown selectors are harmless):

```css
/* Daily points total — stable digit widths after rescale */
.dashboard-progress__count,
.dashboard-progress__total,
.daily-score__earned,
.daily-score__possible {
  font-variant-numeric: tabular-nums;
}
```

If the actual classes in use are different, add the correct ones. The rule is additive; leave the unmatched selectors as insurance for any future rename.

- [ ] **Step 5: Manually verify CSS changes**

1. Open the task detail sheet on dashboard or calendar by long-pressing a task with a non-100% slider value. Drag the slider through its range. Expected: the `X% (Ypt)` label updates smoothly and does not jitter horizontally as digits change width. At `150% (180pt)` the label fits without clipping.
2. Open the scoreboard. Expected: numeric columns show stable digit widths; nothing overflows at 360px width in devtools.
3. Open the dashboard. Expected: the daily progress indicator displays cleanly with the new larger totals.

- [ ] **Step 6: Commit**

```bash
git add shared/components.js styles/components.css styles/scoreboard.css styles/dashboard.css
git commit -m "style: tabular-nums and slider min-width for larger point values

Stabilizes digit widths on numeric displays (slider value label,
scoreboard totals, dashboard progress) so values don't jitter
as they update in place. Adds a min-width to the slider value
label to accommodate three-digit point totals without clipping."
```

---

## Task 11: Bump service worker cache version

**Files:**
- Modify: `sw.js` line 6

- [ ] **Step 1: Bump CACHE_NAME**

Find at `sw.js:6`:

```js
const CACHE_NAME = 'family-hub-v28';
```

Replace with:

```js
const CACHE_NAME = 'family-hub-v29';
```

- [ ] **Step 2: Manually verify service worker reloads fresh assets**

1. Open the app in Chrome with DevTools → Application → Service Workers.
2. Click "Update" on the worker, or reload the page twice.
3. Confirm the new cache name appears under Application → Cache Storage and the old `family-hub-v28` entry is purged.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore(sw): bump cache to v29 for points rescale release"
```

---

## Task 12: End-to-end manual verification

**Files:** None (verification only)

This task has no edits. Its purpose is to run the full verification checklist against the running app in a real browser before deploy.

- [ ] **Step 1: Dashboard spot checks**

Open `index.html`. For a person with a full day of tasks:
- Task cards show new-scale point values (typical: 5-60pt, not 1-6pt)
- Specific spot check: a 5-minute easy task shows "5pt"
- Specific spot check: a 10-minute easy task shows "10pt"
- Specific spot check: a 15-minute medium task shows "30pt"
- Daily letter grade matches what you'd get given the percentage of completed tasks
- Long-press a task, drag slider to 75%. Expected: the displayed earned pts decreases by a visible amount (e.g., 10pt → 8pt). Drag to 50%. Expected: further decrease (10pt → 5pt). At 150%, earned pts increases (10pt → 15pt).

- [ ] **Step 2: Late penalty regression check**

Pick a past-date daily task that is incomplete. Open its detail sheet and tap "Complete (Late)". Expected:
- The slider initializes at `pastDueCreditPct` (default 75)
- The earned pts shown reflects 75% of the new-scale base (e.g., a 10pt task shows ~8pt)
- After completing, the task appears at the bottom with a "Late" badge and the reduced points
- The daily grade drops by a visible amount

This is the core user-facing behavior the whole feature was built to fix. If the points displayed after a 75% late completion on a small task are still identical to the base (no reduction), the feature has failed and the plan needs re-investigation.

- [ ] **Step 3: Admin settings round-trip**

Open `admin.html` → Settings tab. Change `hard` from 3 to 5. Save. Reload dashboard. Expected: hard tasks now show ~67% larger point values (e.g., a 15-min hard task goes from 45pt to 75pt). Daily grades remain computed correctly (the percentage is unchanged for days with only hard tasks, but shifts on mixed days because the relative weight of hard vs other is different).

Then change `hard` back to 3 and save.

- [ ] **Step 4: Non-monotonic warning**

In the Settings tab, enter `easy=5, medium=2, hard=3`. Click Save. Expected: confirm dialog appears. Click Cancel. Expected: no save, values remain in the form. Re-enter valid values and save.

- [ ] **Step 5: Clamping**

Enter `hard=99`. Save. Reload the Settings tab. Expected: the hard field now shows `10` (clamped at save time). Similarly enter `hard=0` → clamped to `1`.

- [ ] **Step 6: Scoreboard aggregation**

Open `scoreboard.html`. For the Weekly view, confirm letter grades are displayed and the percentages align with what was shown pre-deploy. For the 12-Month view, confirm the grade chart renders without error. If the database has pre-deploy snapshots, their contribution to the aggregate is still mathematically correct — only the raw earned/possible numbers displayed in drilldowns look small.

- [ ] **Step 7: Viewport checks**

Open Chrome DevTools → Device Mode. Test at 360px, 400px, 768px widths on:
- Dashboard (home view + task detail sheet + overdue list)
- Calendar (month view + day sheet)
- Kid mode
- Scoreboard leaderboard + drilldown
- Admin Settings tab (confirm the new form section isn't overflowing)

Expected: no clipped content, no horizontal scroll, no wrapped task-card meta rows. If any specific cell clips, fix that cell before deploy.

- [ ] **Step 8: Console / network cleanliness**

Expected: no red errors in the browser console on any page load. No failed Firebase reads/writes in the Network tab.

- [ ] **Step 9: Commit nothing (verification only), then deploy**

If all checks pass:

```bash
git log --oneline -15  # review the commit chain
git push origin main   # Cloudflare Pages deploys automatically
```

If any check fails, fix the issue in a new commit and re-run the failing check before pushing.

---

## Task 13: Update CLAUDE.md changelog

**Files:**
- Modify: `CLAUDE.md` — Changelog section

- [ ] **Step 1: Prepend a new changelog entry**

Open `CLAUDE.md` and find the `## Changelog (last 5)` section. Prepend a new bullet at the top:

```markdown
- Points system rescale: new formula `basePoints = max(estMin, 5) × difficultyMultiplier` replaces `round(mult × (1 + estMin/30))`. Produces larger, differentiated integer values so late penalties actually land on small tasks. Difficulty multipliers moved to `settings.difficultyMultipliers` (admin Settings tab, defaults `{easy:1, medium:2, hard:3}`, soft-warned if non-monotonic). Zero data migration — percentages and grades identical pre/post because `earned` and `possible` both scale by the same factor.
```

Remove the oldest entry from the list so it stays at 5 items.

Also update the **Scoring System** section's formula line. Find:

```markdown
- **Points formula:** `difficultyMultiplier × (1 + estMin / 30)`, rounded to nearest integer
```

Replace with:

```markdown
- **Points formula:** `max(estMin, 5) × difficultyMultiplier`. Both operands are integers; no rounding. Difficulty multipliers are configurable per-family via `settings.difficultyMultipliers` (default `{easy:1, medium:2, hard:3}`).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for points rescale"
```

- [ ] **Step 3: Push (if verification passed in Task 12)**

```bash
git push origin main
```

---

## Self-Review Notes

**Spec coverage:**
- New formula (spec §Design/New points formula) → Task 1 ✓
- `DEFAULT_DIFFICULTY_MULTIPLIERS` exported + `MIN_EST_MIN` constant → Task 1 ✓
- Thread multipliers through `earnedPoints`, `dailyPossible`, `dailyScore`, `buildSnapshot` (spec §Design/Plumbing) → Task 2 ✓
- Update every page call site (spec §Design/Plumbing audit path) → Tasks 3-8 ✓
- Admin Settings UI with three inputs, soft warning on non-monotonic, reset button (spec §Design/Admin UI) → Task 9 ✓
- No data migration (spec §Design/No data migration) → explicit non-step; noted throughout ✓
- `tabular-nums` on scoreboard numbers + slider `min-width`, keep `nowrap` on task-card meta (spec §Design/UI changes) → Task 10 ✓
- Rollout order matches spec → Tasks 1-11 follow spec §Rollout order ✓
- SW cache bump (spec §Gotchas/Service worker cache) → Task 11 ✓
- Manual verification checklist (spec §Testing Plan) → Task 12 ✓
- CLAUDE.md changelog (project convention) → Task 13 ✓
- `dailyPossible` extended signature (spec §Design/Plumbing, "decide in the plan") → **decided**: pass just `difficultyMultipliers` object (not full settings), for consistency with `basePoints` and `earnedPoints`. `dailyScore` and `buildSnapshot` extract it from their existing `settings` argument.
- Required vs optional multipliers argument (spec §Gotchas, "decide in the plan") → **decided**: optional with default fallback. Reason: admin task preview may need to compute `basePoints` before `settings` has loaded; requiring the argument would break that path. The fallback makes the system correct even under partial threading, and every page caller is explicitly updated to pass the argument anyway.

**Placeholder scan:** None. Every step contains concrete code, exact file paths, and specific verification criteria. The CSS selector coverage in Task 10 uses a deliberately over-inclusive list of selectors — not a placeholder, but a defensive choice to survive future class renames.

**Type consistency:**
- `basePoints(task, difficultyMultipliers)` — same signature in Task 1 (definition) and Tasks 2-8 (call sites). ✓
- `earnedPoints(task, completion, difficultyMultipliers)` — same in Task 2 (definition) and Task 7 (call site). ✓
- `dailyPossible(entries, tasks, categories, difficultyMultipliers)` — same in Task 2. ✓
- `settings.difficultyMultipliers` — consistent key name from Task 2 (scoring.js) through Task 9 (admin.html save handler). Not renamed mid-plan. ✓
- `DEFAULT_DIFFICULTY_MULTIPLIERS` — exported in Task 1, not referenced by name in later tasks (reset button uses literal values for simplicity — revisited this decision: literals are fine, the button is a one-line UI reset and importing the constant into admin.html would add an import without buying anything meaningful since admin.html doesn't use it elsewhere). ✓

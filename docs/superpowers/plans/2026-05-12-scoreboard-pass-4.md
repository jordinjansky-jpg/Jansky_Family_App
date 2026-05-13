# Scoreboard Pass 4 — Insights & Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace the broken weekly-trend sparkline with a 90-day heatmap that tells a real consistency story. Add insight rotation to Highlights (max 3 candidates, hide-when-zero) and three new insight types: streak-at-risk, day-of-week pattern, personal-best.

**Spec:** [docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md](../specs/2026-05-12-scoreboard-rebuild.md) — see "Pass 4 — Insights & Heatmap".

**Architecture:** Three new helpers in [shared/scoring.js](../../../shared/scoring.js): `streakAtRisk`, `dayOfWeekPattern`, `personalBest`. One new component in [shared/components.js](../../../shared/components.js): `renderHeatmap`. Drilldown Weekly-Trend block is replaced wholesale; main page Highlights computation is refactored into a priority queue.

**No schema changes.** All new content reads from existing `snapshots`, `schedule`, `comps`, `streaks` paths.

**Files touched:**
- `shared/scoring.js` — 3 new helpers
- `shared/components.js` — `renderHeatmap` helper
- `scoreboard.html` — drilldown heatmap replaces sparkline; Highlights rebuild
- `styles/scoreboard.css` — heatmap grid + cell tiers
- `sw.js` — cache bumps per task

**Commits:** 4 (3 feature + 1 docs).

---

## Task 1: 90-day heatmap replaces Weekly Trend sparkline

**Files:**
- Modify `shared/components.js` — add `renderHeatmap` helper
- Modify `scoreboard.html` — extend components import; replace the entire `Weekly Trend` block (currently hidden when sparse from Pass 1)
- Modify `styles/scoreboard.css` — heatmap grid + cell tiers
- Modify `sw.js` — bump cache v264 → v265

**Layout:** 13 columns (weeks) × 7 rows (days, Sun→Sat). Each cell colored by daily grade tier. Future cells and no-data cells render as a flat `var(--border)` color. Total cells = 91; with mobile 412px width and ~12px cell size, the grid fits comfortably with a 2-3px gap.

**Why "Last 90 days":** 13 weeks captures the cycle long enough to spot patterns (a kid coming back from spring break, three good weeks then a regression, etc.) while staying glanceable. Aligned to weeks for the column boundaries.

### Step 1: Add `renderHeatmap` helper to components.js

In [shared/components.js](../../../shared/components.js), find `renderAchievementBadge` (added in Pass 3 Task 3, near `renderGradeBadge`). AFTER its closing brace, add:

```js
/**
 * Render a GitHub-contributions-style heatmap for a person's daily grades.
 * 13 columns (weeks) × 7 rows (days). Each cell colored by grade tier.
 *
 * @param {object} snapshots - { dateKey: { personId: snapshot } }
 * @param {string} personId
 * @param {string} todayKey - YYYY-MM-DD today in family tz
 * @param {object} todayLive - Live today score { earned, possible, percentage, grade } from todayScore()
 * @param {function} addDaysFn
 * @param {function} weekStartForDayFn - util.weekStartForDay (Sunday start)
 * @param {function} gradeTierFn - scoring.gradeTier
 * @returns {string} HTML
 */
export function renderHeatmap(snapshots, personId, todayKey, todayLive, addDaysFn, weekStartForDayFn, gradeTierFn) {
  const WEEKS = 13;
  // Anchor the grid: rightmost column is the week (Sun-Sat) containing today.
  const todaySun = weekStartForDayFn(todayKey, 0);
  const startSun = addDaysFn(todaySun, -7 * (WEEKS - 1));

  let html = '<div class="sb-heatmap" role="img" aria-label="90-day grade heatmap">';
  // Iterate column-major: for each week column, render 7 cells (Sun to Sat).
  // The CSS uses `grid-auto-flow: column` so source order = column-major.
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < WEEKS; col++) {
      const date = addDaysFn(startSun, col * 7 + row);
      const isFuture = date > todayKey;
      let tier, title;
      if (isFuture) {
        tier = 'future';
        title = '';
      } else if (date === todayKey) {
        // Today — use live score
        const pct = todayLive.possible > 0 ? todayLive.percentage : null;
        tier = pct !== null ? gradeTierFn(pct) : 'empty';
        title = pct !== null ? `${date}: ${todayLive.grade} (${pct}%)` : `${date}: no tasks`;
      } else {
        const snap = snapshots[date]?.[personId];
        if (snap?.percentage !== undefined && snap.possible > 0) {
          tier = gradeTierFn(snap.percentage);
          title = `${date}: ${snap.grade} (${snap.percentage}%)`;
        } else {
          tier = 'empty';
          title = `${date}: no tasks`;
        }
      }
      html += `<span class="sb-heatmap-cell sb-heatmap-cell--${tier}" title="${title}"></span>`;
    }
  }
  html += '</div>';
  return html;
}
```

Note: row-major iteration in source, but the CSS uses `grid-auto-flow: column` so source position maps to a column-first layout. Each row in source = a fixed day-of-week across all 13 weeks.

Wait — the CSS approach needs verification. The simplest is column-major iteration in source matching column-major auto-flow. Let me rewrite to be unambiguous: I'll generate cells in column-major order (col 0 days, col 1 days, ...) and the CSS uses `grid-template-rows: repeat(7, 1fr); grid-auto-flow: column;`.

Rewrite the loop:

```js
  let html = '<div class="sb-heatmap" role="img" aria-label="90-day grade heatmap">';
  // Iterate column-major: col 0 (Sun→Sat), then col 1, ...
  for (let col = 0; col < WEEKS; col++) {
    for (let row = 0; row < 7; row++) {
      const date = addDaysFn(startSun, col * 7 + row);
      // ... same as above
      html += `<span class="sb-heatmap-cell sb-heatmap-cell--${tier}" title="${title}"></span>`;
    }
  }
  html += '</div>';
```

(The first attempt had the loops swapped — fix during implementation.)

### Step 2: Replace the Weekly-Trend block in scoreboard.html

In [scoreboard.html](../../../scoreboard.html), find the existing weekly-trend block inside `openDrilldown` (added/guarded in Pass 1 Task 2):

```js
      // Weekly trend sparkline — hidden when fewer than 2 weeks have data
      const weeksWithData = history.filter(h => h.possible > 0).length;
      if (weeksWithData >= 2) {
        html += renderSectionHead('Weekly Trend');
        html += `<div class="sb-sparkline sb-sparkline--labeled">`;
        const sparkFull = ['3 wks ago', '2 wks ago', 'Last wk', 'This wk'];
        const sparkShort = ['-3w', '-2w', 'Last', 'Now'];
        for (let i = 0; i < history.length; i++) {
          const h = history[i];
          const pct = h.possible > 0 ? h.percentage : 0;
          const tier = pct > 0 ? gradeDisplay(pct).tier : 'none';
          html += `<div class="sb-spark-col">
            <div class="sb-spark-bar" title="${sparkFull[i]}: ${pct}%">
              <div class="sb-spark-fill sb-spark-fill--${esc(tier)}" style="height:${Math.max(pct, 4)}%"></div>
            </div>
            <span class="sb-spark-label">${sparkShort[i]}</span>
          </div>`;
        }
        html += `</div>`;
      }
```

REPLACE with:

```js
      // ── Last 90 days heatmap (Pass 4) — replaces sparkline ──
      html += renderSectionHead('Last 90 days');
      html += renderHeatmap(snapshots, personId, today, todayScore(personId), addDays, weekStartForDay, gradeTier);
```

The `weeklyHistory(personId)` call earlier in the function and the `history` local become dead code. Find and delete the call site:

```js
      // ── Weekly sparkline (last 4 weeks) ──
      const history = weeklyHistory(personId);
```

DELETE both lines.

Also find the `weeklyHistory` function declaration (near the top of the script, alongside other helpers like `weeklyTrend`) and DELETE it. The function:

```js
    /** Get last 4 rolling-7-day windows for sparkline. */
    function weeklyHistory(personId) {
      const weeks = [];
      for (let i = 3; i >= 0; i--) {
        if (i === 0) {
          weeks.push(weeklyGrade(personId));
        } else {
          const ws = addDays(today, -(i * 7 + 6));
          const we = addDays(today, -(i * 7));
          weeks.push(periodGrade(snapshots, personId, ws, we));
        }
      }
      return weeks;
    }
```

Verify: `grep -n "weeklyHistory" scoreboard.html` after deletion — expect no matches.

### Step 3: Extend imports

In [scoreboard.html](../../../scoreboard.html), update the components.js import to add `renderHeatmap`. Find the existing line:

```js
import { renderNavBar, initNavMore, initBottomNav, renderHeader, renderEmptyState, renderErrorState, renderBottomSheet, openDeviceThemeSheet, initOfflineBanner, initBell, initBanner, applyDataColors, renderScoreCard, renderSectionHead, renderPersonAvatar, renderAchievementBadge, renderSendMessageSheet, bindSendMessageSheet } from './shared/components.js';
```

REPLACE with (adds `renderHeatmap`):

```js
import { renderNavBar, initNavMore, initBottomNav, renderHeader, renderEmptyState, renderErrorState, renderBottomSheet, openDeviceThemeSheet, initOfflineBanner, initBell, initBanner, applyDataColors, renderScoreCard, renderSectionHead, renderPersonAvatar, renderAchievementBadge, renderSendMessageSheet, bindSendMessageSheet, renderHeatmap } from './shared/components.js';
```

Update the utils.js import to add `weekStartForDay`. Find:

```js
import { todayKey, weekStart, weekEnd, monthStart, monthEnd, addDays, formatDateShort, formatMinutes, formatDateLong, escapeHtml } from './shared/utils.js';
```

REPLACE with (adds `weekStartForDay`):

```js
import { todayKey, weekStart, weekStartForDay, weekEnd, monthStart, monthEnd, addDays, formatDateShort, formatMinutes, formatDateLong, escapeHtml } from './shared/utils.js';
```

Update the scoring.js import to add `gradeTier`. Find:

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements, familyGrade, timeContributed, achievementProgress } from './shared/scoring.js';
```

REPLACE with (adds `gradeTier`):

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, gradeTier, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements, familyGrade, timeContributed, achievementProgress } from './shared/scoring.js';
```

`gradeTier` is already exported from `shared/scoring.js` (line 61). Verify it's still exported during implementation.

### Step 4: Append CSS

In [styles/scoreboard.css](../../../styles/scoreboard.css), append at the end:

```css
/* ── 90-day heatmap (Pass 4) ── */
.sb-heatmap {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 3px;
  padding: var(--spacing-sm) 0;
  width: 100%;
  /* Aspect: 13 cols × 7 rows; min height keeps cells from collapsing on narrow screens */
  min-height: 110px;
}

.sb-heatmap-cell {
  aspect-ratio: 1 / 1;
  border-radius: 2px;
  background: var(--border);
  display: block;
  cursor: default;
  min-width: 0;
  min-height: 0;
}

/* Grade tier colors — match sparkline palette */
.sb-heatmap-cell--a-plus, .sb-heatmap-cell--a, .sb-heatmap-cell--a-minus, .sb-heatmap-cell--a { background: var(--grade-a); }
.sb-heatmap-cell--b-plus, .sb-heatmap-cell--b, .sb-heatmap-cell--b-minus { background: var(--grade-b); }
.sb-heatmap-cell--c-plus, .sb-heatmap-cell--c, .sb-heatmap-cell--c-minus { background: var(--grade-c); }
.sb-heatmap-cell--d-plus, .sb-heatmap-cell--d, .sb-heatmap-cell--d-minus { background: var(--grade-d); }
.sb-heatmap-cell--f { background: var(--grade-f); }
.sb-heatmap-cell--empty { background: var(--surface-2); opacity: 0.5; }
.sb-heatmap-cell--future { background: transparent; }
```

Note: `gradeTier` returns plain `'a'`, `'b'`, `'c'`, `'d'`, `'f'` (verified earlier in this codebase). The selectors above include both bare tiers and the `--a-plus` etc. variants in case `gradeDisplay`'s tier value flows through. Worth verifying during implementation: if `gradeTier(pct)` only ever returns single letters, the `-plus`/`-minus` variants are dead CSS — harmless but can be simplified.

### Step 5: Bump cache

`v264` → `v265` in [sw.js](../../../sw.js).

### Step 6: Verify

Open `http://localhost:8080/scoreboard.html`, tap a hero card. The Weekly Trend section is gone; in its place is a "Last 90 days" header followed by a 13×7 grid of small colored squares. Cells with no snapshot data render as a muted gray; future cells are transparent. Hovering a cell shows a tooltip with the date and grade.

### Step 7: Commit

```bash
git add shared/components.js scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): 90-day heatmap replaces weekly-trend sparkline

13 weeks × 7 days grid colored by daily grade tier. Empty days
muted, future days transparent. Tooltip on hover shows date + grade
+ percentage. Replaces the broken sparkline that collapsed to 4%
bars on sparse data (hidden in Pass 1).

Added components.renderHeatmap helper (takes today's live score so
the in-progress day reflects current state). Removed dead
weeklyHistory local helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Highlights rotation refactor (priority queue)

**Files:**
- Modify `scoreboard.html` — replace the existing Highlights block in `render()` with a priority-queue driven rotation
- Modify `sw.js` — bump cache v265 → v266

**Why:** Today the Highlights section computes three fixed candidates and renders whichever fire. We want a priority queue that:
- Computes up to 7 candidate insights
- Sorts by priority (lower number = higher priority)
- Caps display at 3 rows
- Hides the section entirely when 0 candidates fire
- Hard-prevents the "single lonely row" feel

This task does the scaffolding only. New insight types come in Task 3.

### Step 1: Replace the Highlights block

In [scoreboard.html](../../../scoreboard.html), find the existing Highlights block inside `render()` (around lines 350-405 in current state — search for `// ── Highlights ──`):

```js
      // ── Highlights ──
      {
        const trendSvg = (dir) => dir === 'up'
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`;

        const hlRows = [];

        // Streak leader (≥3 days)
        const streakLeader = board.reduce((best, b) => (!best || b.streak.current > best.streak.current) ? b : best, null);
        if (streakLeader?.streak.current >= 3) {
          const flameSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
          hlRows.push(`<div class="sb-highlight-row">${flameSvg} ${esc(streakLeader.person.name)} is on a ${streakLeader.streak.current}-day streak</div>`);
        }

        // Most improved week-over-week (≥5%)
        let mostImproved = null; let bestDiff = 5;
        for (const b of board) {
          if (b.lastWeek.possible === 0 || b.week.possible === 0) continue;
          const diff = b.week.percentage - b.lastWeek.percentage;
          if (diff > bestDiff) { bestDiff = diff; mostImproved = b; }
        }
        if (mostImproved) {
          hlRows.push(`<div class="sb-highlight-row">${trendSvg('up')} ${esc(mostImproved.person.name)} is up ${Math.round(bestDiff)}% from last week</div>`);
        }

        // All done today / someone at 100%
        const withTasks = board.filter(b => b.today.possible > 0);
        const allDone = withTasks.length > 0 && withTasks.every(b => b.today.percentage === 100);
        const perfect = board.find(b => b.today.possible > 0 && b.today.percentage === 100);
        const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
        if (allDone && board.length > 1) {
          hlRows.push(`<div class="sb-highlight-row">${checkSvg} Everyone finished today</div>`);
        } else if (perfect && board.length > 1) {
          hlRows.push(`<div class="sb-highlight-row">${checkSvg} ${esc(perfect.person.name)} is at 100% today</div>`);
        }

        if (hlRows.length > 0) {
          html += renderSectionHead('Highlights');
          html += `<div class="card sb-highlights">${hlRows.join('')}</div>`;
        }
      }
```

REPLACE with a priority-queue version (same candidates, but structured as objects with priority):

```js
      // ── Highlights — priority queue, max 3 rows, hide when zero candidates ──
      {
        const trendSvg = (dir) => dir === 'up'
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`;
        const flameSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
        const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

        const candidates = [];

        // Priority 3: perfect-day-today (highest of existing)
        const withTasks = board.filter(b => b.today.possible > 0);
        const allDone = withTasks.length > 0 && withTasks.every(b => b.today.percentage === 100);
        if (allDone && board.length > 1) {
          candidates.push({ priority: 3, html: `<div class="sb-highlight-row">${checkSvg} Everyone finished today</div>` });
        } else {
          const perfect = board.find(b => b.today.possible > 0 && b.today.percentage === 100);
          if (perfect && board.length > 1) {
            candidates.push({ priority: 3, html: `<div class="sb-highlight-row">${checkSvg} ${esc(perfect.person.name)} is at 100% today</div>` });
          }
        }

        // Priority 2: streak-leader (≥3 days)
        const streakLeader = board.reduce((best, b) => (!best || b.streak.current > best.streak.current) ? b : best, null);
        if (streakLeader?.streak.current >= 3) {
          candidates.push({ priority: 2, html: `<div class="sb-highlight-row">${flameSvg} ${esc(streakLeader.person.name)} is on a ${streakLeader.streak.current}-day streak</div>` });
        }

        // Priority 5: most-improved (≥5%)
        let mostImproved = null; let bestDiff = 5;
        for (const b of board) {
          if (b.lastWeek.possible === 0 || b.week.possible === 0) continue;
          const diff = b.week.percentage - b.lastWeek.percentage;
          if (diff > bestDiff) { bestDiff = diff; mostImproved = b; }
        }
        if (mostImproved) {
          candidates.push({ priority: 5, html: `<div class="sb-highlight-row">${trendSvg('up')} ${esc(mostImproved.person.name)} is up ${Math.round(bestDiff)}% from last week</div>` });
        }

        // Sort by priority (lower = higher rank), take top 3
        candidates.sort((a, b) => a.priority - b.priority);
        const top = candidates.slice(0, 3);

        if (top.length > 0) {
          html += renderSectionHead('Highlights');
          html += `<div class="card sb-highlights">${top.map(c => c.html).join('')}</div>`;
        }
      }
```

Priority numbering reserves space for the new Pass 4 insights:
- 1: streak-at-risk (Task 3)
- 2: streak-leader
- 3: perfect-day-today / all-done-today
- 4: (reserved)
- 5: most-improved
- 6: personal-best (Task 3)
- 7: day-of-week-pattern (Task 3)

### Step 2: Bump cache

`v265` → `v266`.

### Step 3: Verify

The Highlights section should behave identically to before — same candidates, same order. (Streak-leader and perfect-day were previously rendered in the order they were computed; the priority queue formalizes ordering.) Confirm by visual diff: if the screenshot matches Pass 3's last state, the refactor is correct.

### Step 4: Commit

```bash
git add scoreboard.html sw.js
git commit -m "$(cat <<'EOF'
refactor(scoreboard): Highlights uses priority queue (no behavior change)

Existing 3 candidates restructured into { priority, html } objects.
Sorted by priority (lower = higher), max 3 rendered, section hidden
when 0 candidates fire. Priority numbers reserve slots 1/6/7 for
streak-at-risk, personal-best, day-of-week-pattern coming in Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Three new insight candidates

**Files:**
- Modify `shared/scoring.js` — add `streakAtRisk`, `dayOfWeekPattern`, `personalBest` helpers
- Modify `scoreboard.html` — extend scoring.js import; precompute per-person insights in the existing `board.map(...)` block; add candidates to Highlights queue
- Modify `sw.js` — bump cache v266 → v267

### Step 1: Add helpers to scoring.js

In [shared/scoring.js](../../../shared/scoring.js), after `achievementProgress` (added in Pass 3 Task 3), add:

```js
/**
 * Determine if a person's streak is at risk today.
 * Fires when: current streak ≥ 5, has incomplete tasks today, local time past 6pm.
 *
 * @param {string} personId
 * @param {object} schedule
 * @param {object} completions
 * @param {object} streak - { current, best }
 * @param {string} todayKey
 * @param {string} tz - family timezone
 * @returns {object|null} { incompleteCount, currentStreak } or null
 */
export function streakAtRisk(personId, schedule, completions, streak, todayKey, tz) {
  if (!streak || streak.current < 5) return null;

  // Local hour check — past 6pm only
  const nowHour = new Date().toLocaleString('en-US', { timeZone: tz || 'UTC', hour: 'numeric', hour12: false });
  if (parseInt(nowHour, 10) < 18) return null;

  const dayEntries = schedule[todayKey] || {};
  let incomplete = 0;
  for (const [k, e] of Object.entries(dayEntries)) {
    if (e.ownerId !== personId) continue;
    if (completions[k]) continue;
    incomplete += 1;
  }
  if (incomplete === 0) return null;
  return { incompleteCount: incomplete, currentStreak: streak.current };
}

/**
 * Compute day-of-week performance pattern from snapshots.
 * Returns null if fewer than 21 days of data or delta < 10%.
 *
 * @param {object} allSnapshots
 * @param {string} personId
 * @returns {object|null} { bestDay, bestPct, worstDay, worstPct, delta } or null
 */
export function dayOfWeekPattern(allSnapshots, personId) {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const buckets = Array(7).fill(null).map(() => ({ sum: 0, count: 0 }));
  let totalSnaps = 0;
  if (allSnapshots) {
    for (const [dateKey, people] of Object.entries(allSnapshots)) {
      const snap = people?.[personId];
      if (!snap || snap.possible === 0) continue;
      // Compute day of week from dateKey (Sun=0)
      const d = new Date(`${dateKey}T00:00:00Z`);
      const dow = d.getUTCDay();
      buckets[dow].sum += snap.percentage;
      buckets[dow].count += 1;
      totalSnaps += 1;
    }
  }
  if (totalSnaps < 21) return null;

  let bestIdx = -1, worstIdx = -1;
  let bestAvg = -1, worstAvg = 101;
  for (let i = 0; i < 7; i++) {
    if (buckets[i].count < 2) continue; // require at least 2 data points per day
    const avg = buckets[i].sum / buckets[i].count;
    if (avg > bestAvg) { bestAvg = avg; bestIdx = i; }
    if (avg < worstAvg) { worstAvg = avg; worstIdx = i; }
  }
  if (bestIdx === -1 || worstIdx === -1 || bestIdx === worstIdx) return null;
  const delta = Math.round(bestAvg - worstAvg);
  if (delta < 10) return null;
  return { bestDay: DAYS[bestIdx], bestPct: Math.round(bestAvg), worstDay: DAYS[worstIdx], worstPct: Math.round(worstAvg), delta };
}

/**
 * Detect personal best: this month's perfect-day count exceeds every prior month's count.
 * Requires at least 2 prior months of data with at least one perfect day each, otherwise null.
 *
 * @param {object} allSnapshots
 * @param {string} personId
 * @param {string} todayKey - YYYY-MM-DD
 * @returns {object|null} { count, monthLabel } or null
 */
export function personalBest(allSnapshots, personId, todayKey) {
  if (!allSnapshots) return null;
  // Group perfect days by month
  const byMonth = {};
  for (const [dateKey, people] of Object.entries(allSnapshots)) {
    const snap = people?.[personId];
    if (!snap || snap.possible === 0 || snap.percentage !== 100) continue;
    const month = dateKey.slice(0, 7); // YYYY-MM
    byMonth[month] = (byMonth[month] || 0) + 1;
  }
  const thisMonth = todayKey.slice(0, 7);
  const thisCount = byMonth[thisMonth] || 0;
  if (thisCount < 2) return null;
  const priorMonths = Object.keys(byMonth).filter(m => m !== thisMonth);
  if (priorMonths.length < 1) return null;
  const priorMax = Math.max(...priorMonths.map(m => byMonth[m]));
  if (thisCount <= priorMax) return null;
  const monthLabel = new Date(`${thisMonth}-15T00:00:00Z`).toLocaleString('en-US', { month: 'long' });
  return { count: thisCount, monthLabel };
}
```

### Step 2: Extend scoring import in scoreboard.html

Find:

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, gradeTier, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements, familyGrade, timeContributed, achievementProgress } from './shared/scoring.js';
```

REPLACE with (adds 3):

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, gradeTier, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements, familyGrade, timeContributed, achievementProgress, streakAtRisk, dayOfWeekPattern, personalBest } from './shared/scoring.js';
```

### Step 3: Add candidates to the Highlights queue

In `scoreboard.html`, find the `candidates` array in the Highlights block (added in Task 2). After the existing 3 candidate-pushes, ADD:

```js
        // Priority 1: streak-at-risk (highest — actionable warning)
        const warnSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        for (const b of board) {
          const risk = streakAtRisk(b.person.id, schedule, comps, b.streak, today, tz);
          if (risk) {
            const word = risk.incompleteCount === 1 ? 'task' : 'tasks';
            candidates.push({ priority: 1, html: `<div class="sb-highlight-row">${warnSvg} ${esc(b.person.name)}'s ${risk.currentStreak}-day streak ends tonight — ${risk.incompleteCount} ${word} left</div>` });
          }
        }

        // Priority 6: personal-best
        const trophySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`;
        for (const b of board) {
          const pb = personalBest(allSnapshots, b.person.id, today);
          if (pb) {
            candidates.push({ priority: 6, html: `<div class="sb-highlight-row">${trophySvg} ${esc(b.person.name)} just set a personal best — ${pb.count} perfect days in ${esc(pb.monthLabel)}</div>` });
          }
        }

        // Priority 7: day-of-week-pattern (lowest — only fills if other slots aren't full)
        const calSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
        for (const b of board) {
          const pat = dayOfWeekPattern(allSnapshots, b.person.id);
          if (pat) {
            candidates.push({ priority: 7, html: `<div class="sb-highlight-row">${calSvg} ${esc(b.person.name)} peaks on ${esc(pat.bestDay)}s (${pat.bestPct}%), dips on ${esc(pat.worstDay)}s (${pat.worstPct}%)</div>` });
          }
        }
```

The existing `candidates.sort((a, b) => a.priority - b.priority); const top = candidates.slice(0, 3);` lines remain — they handle the new candidates naturally.

### Step 4: Bump cache

`v266` → `v267`.

### Step 5: Verify

- If any person has ≥5-day current streak + incomplete tasks today + clock past 6pm local: streak-at-risk row appears with priority 1 (top).
- If a kid has 21+ days of snapshot history with ≥10% delta between best/worst day-of-week: day-of-week row may appear (priority 7, only if other rows leave room).
- If a kid has set a new monthly perfect-day record: personal-best row may appear.

If no insights fire, the Highlights section stays hidden.

### Step 6: Commit

```bash
git add shared/scoring.js scoreboard.html sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): streak-at-risk + day-of-week + personal-best insights

Three new candidates plugged into the Highlights priority queue:
- streak-at-risk (P1): ≥5-day streak, today incomplete, past 6pm
- personal-best (P6): this month's perfect-day count > all priors
- day-of-week (P7): 21+ days of data, ≥10% best/worst delta

Helpers live in scoring.js (pure, no DOM). Day-of-week label uses
en-US three-letter abbreviations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Documentation + final push

- [ ] Append a "Pass 4 — Shipped" note to [docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md](../specs/2026-05-12-scoreboard-rebuild.md) at the end of the Pass 4 section.

- [ ] Stage and commit:

```bash
git add docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md docs/superpowers/plans/2026-05-12-scoreboard-pass-4.md
git commit -m "$(cat <<'EOF'
docs(scoreboard): Pass 4 plan + shipped note

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] Push: `git push origin main`

---

## Self-review checklist

1. **Spec coverage:** 4.1 heatmap → Task 1. 4.2/4.3/4.5 insights → Task 3. 4.4 rotation refactor → Task 2. ✓
2. **No schema changes.** ✓
3. **`gradeTier` already exported** from scoring.js — verified.
4. **Heatmap uses CSS Grid with `grid-auto-flow: column`** — source order is column-major, matches visual layout.
5. **Insights use 6pm local-time gate via tz-aware `toLocaleString` parse** — important: this works on a fresh page load only; for live insights through the evening, the user would have to refresh. Acceptable for v1.
6. **Rewards spacing** — investigation found it's a textContent artifact, no actual fix needed. Removed from scope.

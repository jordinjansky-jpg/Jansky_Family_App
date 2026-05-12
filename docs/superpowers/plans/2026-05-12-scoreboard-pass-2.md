# Scoreboard Pass 2 — Hero Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The leaderboard finally reads as a leaderboard. Family score banner anchors the page as team-not-just-rivals. Rank is visible. Today's score is actionable. Hero cards reveal richer interaction without bloating chrome.

**Spec:** [docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md](../specs/2026-05-12-scoreboard-rebuild.md) — see "Pass 2 — Hero Rebuild" section for context.

**Architecture:** All work is in `scoreboard.html` + `shared/components.js` + `styles/scoreboard.css`. One small helper added to `shared/scoring.js` (`familyGrade`). No schema changes. Pass 4 will add the heatmap; Pass 3 will rebuild the drilldown.

**Tech Stack:** Vanilla JS modules. Verification = Playwright at 412×915 + visual diff (no JS test suite for these pages).

**Files touched:**
- [shared/scoring.js](../../../shared/scoring.js) — add `familyGrade` helper
- [scoreboard.html](../../../scoreboard.html) — render family banner; rank computation; time-to-grade computation; multi-zone tap binding
- [shared/components.js](../../../shared/components.js) — update `renderScoreCard` signature (add `rank`, `hint`) and HTML structure for multi-zone tap
- [styles/scoreboard.css](../../../styles/scoreboard.css) — banner, rank chip, gold-ring for #1, hint subtitle, click affordances

**Commits:** 4 (one per task) + 1 docs commit at the end.

**Pass 1 context loaded:** Pass 1 removed `renderGradeBadge` from scoreboard.html imports. Pass 2 needs to re-add it for the period-cycle interaction (or use the inline `grade-badge` HTML pattern the drilldown already uses — recommend latter for consistency with drilldown).

---

## Task 1: Family score banner

**Files:**
- Modify: `shared/scoring.js` — add `familyGrade` helper export
- Modify: `scoreboard.html` — render banner above period tabs; helper for trend
- Modify: `styles/scoreboard.css` — banner styling

**Why:** Single anchor row at the top reframes the leaderboard as a family team. ~40px added to the top of the page. The banner is tappable to open a contribution breakdown sheet (deferred to Pass 3 — for Pass 2 it's a static row, no tap target yet).

### Step 1: Add `familyGrade` helper to scoring.js

- [ ] Open [shared/scoring.js](../../../shared/scoring.js). After the existing `periodGrade` function (around line 337), add:

```js
/**
 * Aggregate grade across all people for a given period.
 * Sums earned/possible across each person's per-period grade.
 *
 * @param {Array} perPersonGrades - Array of { earned, possible, percentage } objects (one per person)
 * @returns {object} aggregated { earned, possible, percentage, grade }
 */
export function familyGrade(perPersonGrades) {
  return aggregateSnapshots(perPersonGrades);
}
```

This is intentionally a thin wrapper — semantic clarity at call sites. (Inlining `aggregateSnapshots` directly in scoreboard.html works too, but a named helper makes the call site readable.)

### Step 2: Compute the family grade + trend in scoreboard.html

- [ ] In [scoreboard.html](../../../scoreboard.html), find the import block at the top of the script (around line 48):

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements } from './shared/scoring.js';
```

Replace with (adds `familyGrade`):

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements, familyGrade } from './shared/scoring.js';
```

- [ ] Find the `render()` function. Just after the `gradeKey` computation and the sort, BEFORE the period tabs HTML build (`html += \`<nav class="tabs tabs--pill">\``), add a new block to compute family aggregate:

```js
      // ── Family score banner ──
      const familyAgg = familyGrade(board.map(b => b[gradeKey]));
      const familyGd = familyAgg.possible > 0 ? gradeDisplay(familyAgg.percentage) : null;

      // Family trend: this period vs. prior period of same length (week vs. last week, etc.)
      let familyTrendDir = null;
      if (selectedPeriod === 'week' || selectedPeriod === 'month') {
        const priorRanges = {
          week:  [addDays(today, -13), addDays(today, -7)],
          month: [addDays(today, -59), addDays(today, -30)],
        };
        const [ps, pe] = priorRanges[selectedPeriod];
        const priorAgg = familyGrade(board.map(b => periodGrade(snapshots, b.person.id, ps, pe)));
        if (familyAgg.possible > 0 && priorAgg.possible > 0) {
          const diff = familyAgg.percentage - priorAgg.percentage;
          if (diff > 2) familyTrendDir = 'up';
          else if (diff < -2) familyTrendDir = 'down';
        }
      }

      const periodLabelMap = { today: 'today', week: 'this week', month: 'this month', year: 'this year' };
      const trendArrowFamily = (dir) => {
        if (!dir) return '';
        const points = dir === 'up'
          ? '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'
          : '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>';
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${points}</svg>`;
      };

      if (familyGd) {
        html += `<div class="sb-family-banner">
          <span class="sb-family-banner__label">Family</span>
          <span class="sb-family-banner__grade grade-badge grade-badge--${esc(familyGd.tier)} grade-badge--sm">${esc(familyGd.grade)}</span>
          <span class="sb-family-banner__period">${periodLabelMap[selectedPeriod]}</span>
          ${trendArrowFamily(familyTrendDir)}
        </div>`;
      }
```

Notes:
- Banner only renders when `familyAgg.possible > 0` (avoids the empty-state issue)
- Trend only fires for week/month (today has no meaningful "prior period"; year would require 12 months of prior data)
- `grade-badge--sm` may not exist yet — see CSS step
- `trendArrowFamily` reuses the same SVG shape we adopted in Pass 1 Task 1

### Step 3: Add banner CSS

- [ ] In [styles/scoreboard.css](../../../styles/scoreboard.css), append at the end (after `.card--score__empty`):

```css
/* ── Family score banner ── */
.sb-family-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: var(--surface-2);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--accent);
}

.sb-family-banner__label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text);
}

.sb-family-banner__period {
  font-size: var(--font-sm);
  color: var(--text-muted);
}

.sb-family-banner svg {
  margin-left: auto;
  color: var(--text-muted);
}

/* Small grade badge variant for inline use */
.grade-badge--sm {
  font-size: var(--font-xs);
  padding: 2px 6px;
}
```

### Step 4: Verify

- [ ] Reload `http://localhost:8080/scoreboard.html`. On the Week tab, a slim banner should appear above the period tabs reading something like `Family  B  this week  ↑`. Tap target inactive (deferred to Pass 3). On Today tab: banner present but no trend arrow.

### Step 5: Commit

```bash
git add shared/scoring.js scoreboard.html styles/scoreboard.css
git commit -m "$(cat <<'EOF'
feat(scoreboard): family score banner above period tabs

Aggregates per-person grades for the active period into a single
family grade. Shows trend arrow when comparing week-over-week or
month-over-month. Anchors the page as 'family team' not just
'individual leaderboard'. Tap-to-open contribution sheet deferred
to Pass 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rank chips on hero cards

**Files:**
- Modify: `scoreboard.html` — compute rank after sort
- Modify: `shared/components.js` — `renderScoreCard` accepts `rank` and renders chip; #1 gets gold ring
- Modify: `styles/scoreboard.css` — rank chip + gold ring styling

**Why:** Today the cards' sort order is the only signal of rank. Adding explicit `#1`, `#2`, `#3`, `#4` chips makes the leaderboard read as a leaderboard at a glance.

### Step 1: Compute rank in scoreboard.html

- [ ] In [scoreboard.html](../../../scoreboard.html), find the sort block in `render()`:

```js
      // Sort board by selected period grade
      const gradeKey = selectedPeriod === 'today' ? 'today'
        : selectedPeriod === 'week' ? 'week'
        : selectedPeriod === 'month' ? 'month'
        : 'year';
      board.sort((a, b) => b[gradeKey].percentage - a[gradeKey].percentage);
```

After the sort, add rank assignment with tie-handling (people tied get the same rank; subsequent ranks skip):

```js
      // Assign ranks. Ties share rank; subsequent ranks skip (1, 1, 3, 4 — standard "competition" ranking).
      {
        let lastPct = null;
        let lastRank = 0;
        for (let i = 0; i < board.length; i++) {
          const pct = board[i][gradeKey].percentage;
          const possible = board[i][gradeKey].possible;
          if (possible === 0) {
            board[i].rank = null; // No tasks → no rank
          } else if (pct === lastPct) {
            board[i].rank = lastRank;
          } else {
            board[i].rank = i + 1;
            lastPct = pct;
            lastRank = i + 1;
          }
        }
      }
```

Then pass rank to `renderScoreCard`:

- [ ] Find the call site:

```js
      // ── Grade cards (hero leaderboard) ──
      html += `<div class="card-stack">`;
      for (const b of board) {
        const active = b[gradeKey];
        const gd = gradeDisplay(active.percentage);
        html += renderScoreCard(b, active, gd, b.liveBalance, b.badgeIcons);
      }
      html += `</div>`;
```

Update the call to pass `b.rank`:

```js
        html += renderScoreCard(b, active, gd, b.liveBalance, b.badgeIcons, b.rank);
```

### Step 2: Update `renderScoreCard` to accept and render rank

- [ ] In [shared/components.js](../../../shared/components.js), find `renderScoreCard` (Pass 1 left it at lines around 1858-1890). The current signature:

```js
export function renderScoreCard(b, active, gd, liveBalance, badgeIcons) {
```

Replace with (adds `rank` param) and render the rank chip in the leading zone. Full replacement:

```js
export function renderScoreCard(b, active, gd, liveBalance, badgeIcons, rank) {
  const metaParts = [
    b.streak.current > 0 ? `${b.streak.current}d streak` : null,
    `${liveBalance.toLocaleString()} pts`,
  ].filter(Boolean).join(' · ');

  const badgeRow = badgeIcons
    ? `<div class="card--score__badges">${badgeIcons}</div>`
    : '';

  const isEmpty = active.possible === 0;
  const trailing = isEmpty
    ? `<span class="card--score__empty">No tasks today</span>`
    : `<span class="grade-badge grade-badge--${esc(gd.tier)}">${esc(gd.grade)}</span>
       <span class="card--score__pct">${esc(active.percentage)}%</span>`;

  const rankChip = rank
    ? `<span class="card--score__rank">#${esc(rank)}</span>`
    : '';

  const goldRing = rank === 1 ? ' card--score--leader' : '';

  return `<button class="card card--score${goldRing}" data-person-id="${esc(b.person.id)}" type="button" style="--owner-color: ${esc(b.person.color)}">
    <div class="card__leading">
      ${renderPersonAvatar(b.person, { size: 'md' })}
      ${rankChip}
    </div>
    <div class="card__body">
      <div class="card__title">${esc(b.person.name)}</div>
      <div class="card__meta">${esc(metaParts)}</div>
      ${badgeRow}
    </div>
    <div class="card__trailing">
      ${trailing}
    </div>
  </button>`;
}
```

### Step 3: Add rank chip + gold ring CSS

- [ ] In [styles/scoreboard.css](../../../styles/scoreboard.css), append:

```css
/* ── Rank chip ── */
.card--score__rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--surface);
  border-radius: 10px;
  padding: 2px 6px;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* Leader gets a subtle gold ring + brighter rank chip */
.card--score--leader {
  box-shadow: 0 0 0 1.5px var(--grade-a) inset;
}

.card--score--leader .card--score__rank {
  color: var(--grade-a);
  background: color-mix(in srgb, var(--grade-a) 20%, transparent);
}
```

Note: `color-mix` is well-supported in modern Chromium-based browsers (which this app targets via Cloudflare Pages / PWA install). If concerns about broad support, fall back to a static hex.

### Step 4: Bump service worker cache

- [ ] In [sw.js](../../../sw.js), bump `CACHE_NAME` from `'family-hub-v253'` (set in Pass 1 Task 3) to `'family-hub-v254'`. (Required because `shared/components.js` changed.)

### Step 5: Verify

- [ ] Reload `http://localhost:8080/scoreboard.html`. Each card should display a `#1`, `#2`, etc chip near the avatar. The top card has a subtle gold ring around it. Switching period tabs should re-rank the cards.

### Step 6: Commit

```bash
git add shared/components.js scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): rank chips on hero cards with leader gold ring

Standard competition ranking (ties share rank, next skips). #1
gets a subtle gold-ring outline; rank chip color shifts to match.
Cards with no tasks for the active period have no rank.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Time-to-grade hint on Today tab

**Files:**
- Modify: `scoreboard.html` — compute hint string per person
- Modify: `shared/components.js` — `renderScoreCard` accepts `hint` and renders subtitle
- Modify: `styles/scoreboard.css` — hint styling

**Why:** A kid looking at "C  73%" today should know "1 more task → B-". Transparent grading. Pure motivation.

### Step 1: Add helper `tasksToNextGrade` in scoreboard.html

- [ ] In [scoreboard.html](../../../scoreboard.html), inside the script (after the existing helper functions, before the `board.map(...)` block), add:

```js
    /**
     * Compute the smallest number of remaining tasks that would lift this person
     * across the next grade tier boundary today. Returns a hint string or null.
     */
    function tasksToNextGrade(personId) {
      const td = todayScore(personId);
      if (td.possible === 0) return null;
      if (td.percentage >= 97) return null; // Already A+

      // Find the next grade-tier minimum above the current percentage
      const tiers = [97, 93, 90, 87, 83, 80, 77, 73, 70, 67, 63, 60];
      const nextMin = [...tiers].reverse().find(t => t > td.percentage);
      if (!nextMin) return null;

      // Collect remaining tasks (scheduled today for this person, not completed)
      const dayEntries = schedule[today] || {};
      const remaining = [];
      for (const [k, e] of Object.entries(dayEntries)) {
        if (e.ownerId !== personId) continue;
        if (comps[k]) continue; // already completed
        const task = tasks[e.taskId];
        if (!task) continue;
        const cat = task.category ? cats[task.category] : null;
        if (cat?.isEvent) continue;
        if (task.exempt) continue;
        remaining.push(basePoints(task, settings?.difficultyMultipliers));
      }
      if (remaining.length === 0) return null;

      // Greedy: sort by points desc, accumulate until next tier crossed
      remaining.sort((a, b) => b - a);
      let earned = td.earned;
      const possible = td.possible;
      let count = 0;
      for (const pts of remaining) {
        earned += pts;
        count += 1;
        const pct = Math.round((earned / possible) * 100);
        if (pct >= nextMin) {
          // Use letterGrade to get the actual tier label we'd land at
          const gd = gradeDisplay(pct);
          const word = count === 1 ? 'task' : 'tasks';
          return `${count} more ${word} → ${gd.grade}`;
        }
      }
      return null; // Even completing everything left wouldn't move the tier
    }
```

Note: uses already-imported `basePoints`, `gradeDisplay`, and module-level `schedule`, `comps`, `tasks`, `cats`, `settings`, `today`, `todayScore`.

### Step 2: Compute hint per person, only on Today tab

- [ ] In [scoreboard.html](../../../scoreboard.html), in `render()`, find the grade card loop (after the rank assignment from Task 2):

```js
      // ── Grade cards (hero leaderboard) ──
      html += `<div class="card-stack">`;
      for (const b of board) {
        const active = b[gradeKey];
        const gd = gradeDisplay(active.percentage);
        html += renderScoreCard(b, active, gd, b.liveBalance, b.badgeIcons, b.rank);
      }
      html += `</div>`;
```

Update to compute hint when selectedPeriod is 'today':

```js
      // ── Grade cards (hero leaderboard) ──
      html += `<div class="card-stack">`;
      for (const b of board) {
        const active = b[gradeKey];
        const gd = gradeDisplay(active.percentage);
        const hint = selectedPeriod === 'today' ? tasksToNextGrade(b.person.id) : null;
        html += renderScoreCard(b, active, gd, b.liveBalance, b.badgeIcons, b.rank, hint);
      }
      html += `</div>`;
```

### Step 3: Update `renderScoreCard` to render hint

- [ ] In [shared/components.js](../../../shared/components.js), replace `renderScoreCard` again to accept and render `hint`:

```js
export function renderScoreCard(b, active, gd, liveBalance, badgeIcons, rank, hint) {
  const metaParts = [
    b.streak.current > 0 ? `${b.streak.current}d streak` : null,
    `${liveBalance.toLocaleString()} pts`,
  ].filter(Boolean).join(' · ');

  const badgeRow = badgeIcons
    ? `<div class="card--score__badges">${badgeIcons}</div>`
    : '';

  const hintRow = hint
    ? `<div class="card--score__hint">${esc(hint)}</div>`
    : '';

  const isEmpty = active.possible === 0;
  const trailing = isEmpty
    ? `<span class="card--score__empty">No tasks today</span>`
    : `<span class="grade-badge grade-badge--${esc(gd.tier)}">${esc(gd.grade)}</span>
       <span class="card--score__pct">${esc(active.percentage)}%</span>`;

  const rankChip = rank
    ? `<span class="card--score__rank">#${esc(rank)}</span>`
    : '';

  const goldRing = rank === 1 ? ' card--score--leader' : '';

  return `<button class="card card--score${goldRing}" data-person-id="${esc(b.person.id)}" type="button" style="--owner-color: ${esc(b.person.color)}">
    <div class="card__leading">
      ${renderPersonAvatar(b.person, { size: 'md' })}
      ${rankChip}
    </div>
    <div class="card__body">
      <div class="card__title">${esc(b.person.name)}</div>
      <div class="card__meta">${esc(metaParts)}</div>
      ${badgeRow}
      ${hintRow}
    </div>
    <div class="card__trailing">
      ${trailing}
    </div>
  </button>`;
}
```

### Step 4: Add hint CSS

- [ ] In [styles/scoreboard.css](../../../styles/scoreboard.css), append:

```css
/* ── Time-to-grade hint ── */
.card--score__hint {
  font-size: var(--font-xs);
  color: var(--accent);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
```

### Step 5: Bump service worker cache

- [ ] In [sw.js](../../../sw.js), bump `CACHE_NAME` from `'family-hub-v254'` to `'family-hub-v255'`.

### Step 6: Verify

- [ ] Reload `http://localhost:8080/scoreboard.html`, switch to Today tab. For any person with an incomplete day below A+, the card should show a small accent-colored line under the badge row: e.g. `2 more tasks → A−`. People at 100% or 0/0 should show no hint.

### Step 7: Commit

```bash
git add shared/components.js scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): time-to-grade hint on Today tab hero cards

Computes the minimum number of incomplete tasks (greedy by basePoints
descending) that would lift the person across the next grade tier.
Renders as a small accent line under the badge emoji row. Hidden
when at A+ or no remaining tasks would move the tier.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Multi-zone tappable hero card

**Files:**
- Modify: `shared/components.js` — `renderScoreCard` switches outer `<button>` to `<div role="button">` with inner clickable zones
- Modify: `scoreboard.html` — `bindEvents` handles three actions; period-cycle helper
- Modify: `styles/scoreboard.css` — focus rings, hit area visual hint

**Why:** Card body opens drilldown (current). Tap on the balance/points text → rewards page (replaces removed Balances section). Tap on the grade badge → cycle period for that card only (Today → Week → Month → Year → Today), replacing the removed All Grades comparison utility.

### Step 1: Refactor card HTML for nested click zones

HTML doesn't allow nested `<button>` elements. We switch the outer card from `<button>` to a `<div role="button" tabindex="0">` so inner `<button>`s are valid. Click delegation in `bindEvents` handles all three actions via `data-action` attributes.

- [ ] In [shared/components.js](../../../shared/components.js), replace `renderScoreCard` again:

```js
export function renderScoreCard(b, active, gd, liveBalance, badgeIcons, rank, hint) {
  const streakPart = b.streak.current > 0 ? `${b.streak.current}d streak` : null;
  const balanceLabel = `${liveBalance.toLocaleString()} pts`;

  const metaPrefix = streakPart ? `${esc(streakPart)} · ` : '';

  const badgeRow = badgeIcons
    ? `<div class="card--score__badges">${badgeIcons}</div>`
    : '';

  const hintRow = hint
    ? `<div class="card--score__hint">${esc(hint)}</div>`
    : '';

  const isEmpty = active.possible === 0;
  const trailing = isEmpty
    ? `<span class="card--score__empty">No tasks today</span>`
    : `<button class="card--score__badge-btn" type="button" data-action="cycle-period" aria-label="Cycle period">
         <span class="grade-badge grade-badge--${esc(gd.tier)}">${esc(gd.grade)}</span>
         <span class="card--score__pct">${esc(active.percentage)}%</span>
       </button>`;

  const rankChip = rank
    ? `<span class="card--score__rank">#${esc(rank)}</span>`
    : '';

  const goldRing = rank === 1 ? ' card--score--leader' : '';

  return `<div class="card card--score${goldRing}" role="button" tabindex="0" data-person-id="${esc(b.person.id)}" data-action="drilldown" style="--owner-color: ${esc(b.person.color)}">
    <div class="card__leading">
      ${renderPersonAvatar(b.person, { size: 'md' })}
      ${rankChip}
    </div>
    <div class="card__body">
      <div class="card__title">${esc(b.person.name)}</div>
      <div class="card__meta">${metaPrefix}<button class="card--score__balance-btn" type="button" data-action="rewards" aria-label="View rewards for ${esc(b.person.name)}">${esc(balanceLabel)}</button></div>
      ${badgeRow}
      ${hintRow}
    </div>
    <div class="card__trailing">
      ${trailing}
    </div>
  </div>`;
}
```

Changes:
- Outer is `<div role="button" tabindex="0" data-action="drilldown">`
- Balance pts is a `<button data-action="rewards">` inside the meta line
- Grade badge wrapped in `<button data-action="cycle-period">`
- Empty-state path has no inner button (just the text span)

### Step 2: Style the new inner buttons + focus states

- [ ] In [styles/scoreboard.css](../../../styles/scoreboard.css), append:

```css
/* ── Inner click zones on hero card ── */
.card--score__balance-btn,
.card--score__badge-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: inherit;
}

.card--score__balance-btn {
  color: var(--accent);
  font-weight: 600;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
  text-underline-offset: 2px;
}

.card--score__balance-btn:hover,
.card--score__balance-btn:focus-visible {
  text-decoration-color: var(--accent);
}

.card--score__badge-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.card--score__badge-btn:focus-visible,
.card--score__balance-btn:focus-visible,
.card--score:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Outer card retains existing button-like styling — already in components.css for .card--score */
.card--score[role="button"] {
  cursor: pointer;
}
```

Note: `.card--score` styling was originally on the `<button>` element. Most styles inherit fine to `<div role="button">` but the implicit button reset (no default background, etc.) may not apply. Check by grep:

```bash
grep -n "card--score" styles/components.css styles/*.css
```

If `.card--score` has rules that depend on being a `<button>`, they still apply via class selector. Should be fine. Verify visually after change.

### Step 3: Update bindEvents to handle the three actions

- [ ] In [scoreboard.html](../../../scoreboard.html), find `bindEvents()`. Replace the existing grade-card click handler:

```js
      // Grade cards — single click opens drilldown (no long-press needed: no competing tap action)
      for (const card of document.querySelectorAll('.card--score[data-person-id]')) {
        card.addEventListener('click', () => openDrilldown(card.dataset.personId));
      }
```

With:

```js
      // Hero cards — three click zones: drilldown / rewards / cycle-period
      for (const card of document.querySelectorAll('.card--score[data-person-id]')) {
        // Outer click → drilldown (only when not on an inner button)
        card.addEventListener('click', (e) => {
          const inner = e.target.closest('[data-action]');
          if (!inner || inner === card) {
            openDrilldown(card.dataset.personId);
            return;
          }
          const action = inner.dataset.action;
          if (action === 'rewards') {
            e.stopPropagation();
            const name = card.querySelector('.card__title')?.textContent || '';
            location.href = `rewards.html?person=${encodeURIComponent(name.trim())}`;
          } else if (action === 'cycle-period') {
            e.stopPropagation();
            cyclePeriod(card.dataset.personId);
          } else if (action === 'drilldown') {
            openDrilldown(card.dataset.personId);
          }
        });
        // Keyboard support for the div-role-button outer
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDrilldown(card.dataset.personId);
          }
        });
      }
```

### Step 4: Implement per-card period cycling

- [ ] In [scoreboard.html](../../../scoreboard.html), near the top of the script (where `selectedPeriod` is declared, around line 236), add:

```js
    // Per-card period overrides for the badge cycle interaction.
    // Map<personId, 'today' | 'week' | 'month' | 'year'>
    const cardPeriods = new Map();
```

Add helper near the other helpers (before `render()`):

```js
    function cyclePeriod(personId) {
      const order = ['today', 'week', 'month', 'year'];
      const cur = cardPeriods.get(personId) || selectedPeriod;
      const next = order[(order.indexOf(cur) + 1) % order.length];
      cardPeriods.set(personId, next);
      render();
    }
```

Now update the hero card loop to use the per-card period when set:

- [ ] In `render()`, replace:

```js
      // ── Grade cards (hero leaderboard) ──
      html += `<div class="card-stack">`;
      for (const b of board) {
        const active = b[gradeKey];
        const gd = gradeDisplay(active.percentage);
        const hint = selectedPeriod === 'today' ? tasksToNextGrade(b.person.id) : null;
        html += renderScoreCard(b, active, gd, b.liveBalance, b.badgeIcons, b.rank, hint);
      }
      html += `</div>`;
```

With:

```js
      // ── Grade cards (hero leaderboard) ──
      html += `<div class="card-stack">`;
      for (const b of board) {
        const effectivePeriod = cardPeriods.get(b.person.id) || selectedPeriod;
        const active = b[effectivePeriod];
        const gd = gradeDisplay(active.percentage);
        const hint = effectivePeriod === 'today' ? tasksToNextGrade(b.person.id) : null;
        html += renderScoreCard(b, active, gd, b.liveBalance, b.badgeIcons, b.rank, hint);
      }
      html += `</div>`;
```

Important: when the user taps a period tab (Today/Week/Month/Year), card-level overrides should reset. Find the period-tabs click handler:

```js
      // Period tabs
      for (const btn of document.querySelectorAll('.tab[data-period]')) {
        btn.addEventListener('click', () => {
          selectedPeriod = btn.dataset.period;
          if (linkedPerson) {
            ...
          }
          render();
        });
      }
```

Add `cardPeriods.clear();` before the render call:

```js
      // Period tabs
      for (const btn of document.querySelectorAll('.tab[data-period]')) {
        btn.addEventListener('click', () => {
          selectedPeriod = btn.dataset.period;
          cardPeriods.clear(); // reset per-card overrides on global period change
          if (linkedPerson) {
            ...
          }
          render();
        });
      }
```

### Step 5: Bump service worker cache

- [ ] In [sw.js](../../../sw.js), bump `CACHE_NAME` from `'family-hub-v255'` to `'family-hub-v256'`.

### Step 6: Verify

- [ ] Reload `http://localhost:8080/scoreboard.html`. Test all four interactions:
  - Tap card body → drilldown opens (existing behavior preserved)
  - Tap the points "X,XXX pts" link → navigates to rewards.html?person=...
  - Tap the grade badge in the trailing zone → that card's grade/pct switches to the next period (its rank doesn't change because sort is still global)
  - Tap a period tab → all cards reset to that period; per-card overrides cleared
  - Keyboard: tab to a card, press Enter → drilldown opens

- [ ] Visual: the balance "pts" text has a subtle dotted underline making it look tappable. The grade badge has no special affordance but is clearly a button on hover.

### Step 7: Commit

```bash
git add shared/components.js scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): hero cards have three tap zones

Card body → drilldown (unchanged).
Balance pts → navigate to rewards page (replaces removed Balances).
Grade badge → cycle period for that card only (replaces removed
All Grades table). Period tabs reset all per-card overrides.

Outer card switched from <button> to <div role="button"> to allow
inner button elements. Keyboard support preserved via Enter/Space.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Documentation + final push

- [ ] Append a "Pass 2 — Shipped" note at the bottom of [docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md](../specs/2026-05-12-scoreboard-rebuild.md) under the Pass 2 section. Include the commit SHAs.

- [ ] Stage and commit:

```bash
git add docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md
git commit -m "$(cat <<'EOF'
docs(scoreboard): note Pass 2 shipped

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] Push:

```bash
git push origin main
```

---

## Self-review checklist

1. **Spec coverage:** Family banner (2.1), rank chips (2.2), time-to-grade hint (2.3), three-zone tappable card (2.4) — one task each. ✓
2. **Placeholders:** No "TBD", every code change shown verbatim. ✓
3. **Type consistency:** `renderScoreCard` signature evolves across Tasks 2-4: (b, active, gd, liveBalance, badgeIcons) → (...+rank) → (...+rank, hint). Final Task 4 keeps the same param list and only changes the HTML structure inside. No call site outside scoreboard.html — confirmed by inspection. ✓
4. **Cache bumps:** Three (Tasks 2, 3, 4). Pass 1 left it at v253; v254 → v255 → v256 across this pass. ✓
5. **Backward compat:** None needed — scoreboard is a single-page consumer of `renderScoreCard`. If a future page calls it with the old signature, missing params will render as falsy (no rank chip, no hint) — graceful.

# Phase 5 — Scoreboard & Tracker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework scoreboard and tracker to use the shared design language — same cards, tabs, section heads, and filter patterns as the dashboard.

**Architecture:** Retire all bespoke `sb-*` / `tracker-*` component classes. Scoreboard main page shows three sections (period tabs + grade hero cards + all-grades table + store CTA). Deep data (sparklines, category breakdown, streaks, balance) moves to an enriched per-person drilldown sheet. Tracker replaces two `<select>` dropdowns with a single filter chip that opens a bottom sheet.

**Tech Stack:** Vanilla JS ES modules, Firebase RTDB compat SDK (global `firebase.`), CSS custom properties, no build step. Testing = open HTML files directly in browser with Firebase connection.

---

## File map

| File | Change |
|---|---|
| `styles/components.css` | Add shared tab, card-stack, card--score, person-dot, card--tracker, card--overdue |
| `shared/components.js` | Add `renderScoreCard()`, `renderTrackerFilterSheet()` exports |
| `scoreboard.html` | Rewrite `render()`, enrich `openDrilldown()`, fix `openStorePicker()`/`openStore()` inline styles, update `bindEvents()` |
| `styles/scoreboard.css` | Retire bespoke sb-* classes; add grades-header/row/cell, store-cta-row, store inline-style replacements |
| `tracker.html` | Rewrite `render()`, `renderRow()`, `renderMonthlyView()`, `bindEvents()` |
| `styles/tracker.css` | Retire bespoke tracker-tab/tracker-row classes; add `.chip--filter` |
| `sw.js` | Bump `CACHE_NAME` v75 → v76 |

---

### Task 1: Shared CSS — tabs, card-stack, card--score, person-dot, card--tracker, card--overdue

**Files:**
- Modify: `styles/components.css` (append at end of file)

- [ ] **Step 1: Append shared tab component**

Open `styles/components.css`. Go to the end of the file and append:

```css
/* ── Tabs (shared segmented control) ── */
.tabs {
  display: flex;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
}

.tab {
  flex: 1;
  padding: 8px 4px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-size: var(--font-sm);
  font-weight: 600;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--t-fast);
  min-height: 36px;
}

.tab.is-active { color: var(--text); }

.tabs--segmented {
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: 3px;
}

.tabs--segmented .tab.is-active {
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 2: Append card-stack and card--score**

Continue appending to `styles/components.css`:

```css
/* ── Card stack (flex column wrapper — suppresses card self-margin) ── */
.card-stack {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--spacing-lg);
}

.card-stack > .card { margin-bottom: 0; }

/* ── Score card variant — leaderboard card with person-color stripe ── */
/* The left stripe comes from .card::before via --owner-color on the element */
.card--score {
  min-height: 64px;
  font: inherit;
  color: inherit;
  width: 100%;
  text-align: left;
}

.card--score:active { transform: scale(0.98); }

.card--score .card__trailing {
  gap: var(--spacing-xs);
}

/* Score card avatar uses solid person color (not soft-tinted like default .avatar) */
.card--score .avatar {
  background: var(--person-color, var(--accent));
  color: #fff;
  font-weight: 700;
}

.card--score__pct {
  font-size: var(--font-sm);
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Append person-dot, card--tracker, card--overdue**

Continue appending to `styles/components.css`:

```css
/* ── Person dot (28px compact colored circle with initial) ── */
.person-dot {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-xs);
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

/* ── Tracker card — no extra structural changes, just gesture props ── */
.card--tracker {
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}

/* ── Overdue card — danger left stripe + soft danger background ── */
.card--overdue {
  border-left: 3px solid var(--danger);
  background: var(--danger-soft);
}
```

- [ ] **Step 4: Browser smoke test**

Open `scoreboard.html` in browser. Expected: page loads normally, no visual change (new classes not yet referenced). DevTools console → 0 errors. Open `tracker.html` — same check.

- [ ] **Step 5: Commit**

```bash
git add styles/components.css
git commit -m "feat(phase5): add tabs, card-stack, card--score, person-dot, card--tracker, card--overdue to components.css"
```

---

### Task 2: Shared JS — renderScoreCard() and renderTrackerFilterSheet()

**Files:**
- Modify: `shared/components.js` (add two exported functions)

- [ ] **Step 1: Add renderScoreCard() after renderSectionHead()**

In `shared/components.js`, find `export function renderSectionHead(` (around line 631). Add the following immediately after its closing brace:

```js
/**
 * Scoreboard leaderboard card (.card.card--score).
 * @param {Object} b  - Board entry: { person: {id, name, color}, streak: {current}, trend: 'up'|'down'|null }
 * @param {Object} active - Grade data: { earned, possible, percentage }
 * @param {Object} gd - Grade display: { grade, tier }
 * @param {number} liveBalance - Computed reward balance for this person
 * @param {string} badgeIcons - Raw emoji string (max 5 achievement icons)
 */
export function renderScoreCard(b, active, gd, liveBalance, badgeIcons) {
  const trendIcon = b.trend === 'up' ? '↑' : b.trend === 'down' ? '↓' : '';
  const metaParts = [
    b.streak.current > 0 ? `🔥 ${b.streak.current}d` : null,
    `💰 ${liveBalance.toLocaleString()}`,
    trendIcon || null,
  ].filter(Boolean).join(' · ');

  const badges = badgeIcons
    ? `<span class="sb-badges">${esc(badgeIcons)}</span>`
    : '';

  return `<button class="card card--score" data-person-id="${esc(b.person.id)}" type="button" style="--owner-color: ${esc(b.person.color)}">
    <div class="card__leading">
      <div class="avatar" style="--person-color: ${esc(b.person.color)}">${esc(b.person.name[0].toUpperCase())}</div>
    </div>
    <div class="card__body">
      <div class="card__title">${esc(b.person.name)}${badges}</div>
      <div class="card__meta">${esc(metaParts)}</div>
    </div>
    <div class="card__trailing">
      <span class="grade-badge grade-badge--${esc(gd.tier)}">${esc(gd.grade)}</span>
      <span class="card--score__pct">${active.percentage}%</span>
    </div>
  </button>`;
}
```

- [ ] **Step 2: Add renderTrackerFilterSheet() after renderScoreCard()**

Append immediately after the closing brace of `renderScoreCard`:

```js
/**
 * Bottom sheet body for the tracker filter chip.
 * Renders category chip group + status chip group + Clear/Apply actions.
 * Mount inside renderBottomSheet(); bind #filterClear and #filterApply after mount.
 * @param {Object} cats          - Categories object from Firebase { [key]: { name|label, icon? } }
 * @param {string|null} activeCategory  - Currently selected category key, or null for All
 * @param {string|null} activeStatus    - Currently selected status value, or null for All
 */
export function renderTrackerFilterSheet(cats, activeCategory, activeStatus) {
  const catEntries = Object.entries(cats || {});
  const statusOptions = [
    { value: 'done',     label: 'Done' },
    { value: 'late',     label: 'Done Late' },
    { value: 'overdue',  label: 'Overdue' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'cooldown', label: 'Cooldown' },
    { value: 'skipped',  label: 'Skipped' },
  ];

  const catChips = [
    `<button class="chip chip--selectable${!activeCategory ? ' chip--active' : ''}" data-filter-cat="" type="button">All</button>`,
    ...catEntries.map(([key, cat]) => {
      const label = ((cat.icon || '') + ' ' + (cat.label || cat.name || key)).trim();
      return `<button class="chip chip--selectable${activeCategory === key ? ' chip--active' : ''}" data-filter-cat="${esc(key)}" type="button">${esc(label)}</button>`;
    }),
  ].join('');

  const statusChips = [
    `<button class="chip chip--selectable${!activeStatus ? ' chip--active' : ''}" data-filter-status="" type="button">All</button>`,
    ...statusOptions.map(opt =>
      `<button class="chip chip--selectable${activeStatus === opt.value ? ' chip--active' : ''}" data-filter-status="${esc(opt.value)}" type="button">${esc(opt.label)}</button>`
    ),
  ].join('');

  return `<div class="sheet-body">
    <div class="sheet-label sheet-label--spaced">Category</div>
    <div class="chip-group">${catChips}</div>
    <div class="sheet-label sheet-label--spaced">Status</div>
    <div class="chip-group">${statusChips}</div>
    <div class="sheet-actions">
      <button class="btn btn--ghost" id="filterClear" type="button">Clear all</button>
      <button class="btn btn--primary" id="filterApply" type="button">Apply</button>
    </div>
  </div>`;
}
```

- [ ] **Step 3: Add both functions to the export list at end of file**

Find the line near the end of `shared/components.js` that contains the grouped export (if one exists) or confirm both functions already export inline (`export function`). Both functions already have `export` keyword, so no additional change needed.

- [ ] **Step 4: Browser smoke test**

Open `scoreboard.html`. DevTools Console → check that the module parses without error. Check Network tab → `shared/components.js` loads with 200 (or from cache). No errors logged.

- [ ] **Step 5: Commit**

```bash
git add shared/components.js
git commit -m "feat(phase5): add renderScoreCard() and renderTrackerFilterSheet() to components.js"
```

---

### Task 3: Scoreboard — rewrite render() (tabs + grade cards + grades table + store CTA)

**Files:**
- Modify: `scoreboard.html` — `render()` function and `bindEvents()` function

- [ ] **Step 1: Update the import from components.js**

In `scoreboard.html`, find the `import { ... } from './shared/components.js'` line (around line 44). Add `renderScoreCard, renderSectionHead` to the import list:

```js
import { renderNavBar, initNavMore, renderHeader, renderEmptyState, renderPersonFilter, renderGradeBadge, renderBottomSheet, openDeviceThemeSheet, initOfflineBanner, initBell, initBanner, showConfirm, showToast, applyDataColors, renderScoreCard, renderSectionHead } from './shared/components.js';
```

- [ ] **Step 2: Refactor board-building to precompute liveBalance and badgeIcons**

Find the `const board = people.map(p => {` block (around line 266). Replace the entire `board` array construction:

```js
// Build person data for leaderboard — precompute all display values here
const board = people.map(p => {
  const td = todayScore(p.id);
  const wk = weeklyGrade(p.id);
  const mo = monthlyGrade(p.id);
  const yr = yearGrade(p.id);
  const streak = streaks[p.id] || { current: 0, best: 0 };
  const trend = weeklyTrend(p.id);
  const personMsgs = allMessages?.[p.id] || {};
  const personAnchor = allAnchors?.[p.id] || null;
  const { balance } = calculateBalance(p.id, allSnapshots, personMsgs, personAnchor, allMultipliers, tz);
  const todayMult = allMultipliers?.[today]?.[p.id]?.multiplier || 1;
  const liveBalance = Math.round(balance + (td.percentage || 0) * todayMult);
  const personAchievements = allAchievementsData?.[p.id] || {};
  const badgeIcons = Object.entries(personAchievements)
    .filter(([, a]) => !a.revoked)
    .map(([key]) => activeDefs[key]?.icon)
    .filter(Boolean)
    .slice(0, 5)
    .join('');
  return { person: p, today: td, week: wk, month: mo, year: yr, streak, trend, liveBalance, badgeIcons };
});
```

- [ ] **Step 3: Replace render() body (from the period tabs through the streaks section)**

Find the `function render()` definition (around line 245). Replace the entire function body (everything between `{` and the closing `}`) with:

```js
function render() {
  const main = document.getElementById('mainContent');

  if (people.length === 0) {
    main.innerHTML = renderEmptyState('🏆', 'No family members', 'Add people in the setup wizard.');
    return;
  }

  // Sort board by selected period grade
  const gradeKey = selectedPeriod === 'today' ? 'today'
    : selectedPeriod === 'week' ? 'week'
    : selectedPeriod === 'month' ? 'month'
    : 'year';
  board.sort((a, b) => b[gradeKey].percentage - a[gradeKey].percentage);

  let html = '';

  // ── Period tabs ──
  const periods = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year',  label: '12 Mo' },
  ];
  html += `<nav class="tabs tabs--segmented">`;
  for (const p of periods) {
    html += `<button class="tab${selectedPeriod === p.key ? ' is-active' : ''}" data-period="${p.key}" type="button">${p.label}</button>`;
  }
  html += `</nav>`;

  // ── Grade cards (hero leaderboard) ──
  html += `<div class="card-stack">`;
  for (const b of board) {
    const active = b[gradeKey];
    const gd = gradeDisplay(active.percentage);
    html += renderScoreCard(b, active, gd, b.liveBalance, b.badgeIcons);
  }
  html += `</div>`;

  // ── All Grades table ──
  html += renderSectionHead('All Grades');
  html += `<div class="card grades-card">
    <div class="grades-header">
      <span class="grades-cell grades-cell--name"></span>
      <span class="grades-cell">Today</span>
      <span class="grades-cell">Week</span>
      <span class="grades-cell">Month</span>
      <span class="grades-cell">12 Mo</span>
    </div>`;
  for (const b of board) {
    const tdG = gradeDisplay(b.today.percentage);
    const wkG = gradeDisplay(b.week.percentage);
    const moG = gradeDisplay(b.month.percentage);
    const yrG = gradeDisplay(b.year.percentage);
    html += `<div class="grades-row">
      <span class="grades-cell grades-cell--name">
        <span class="sb-mini-dot" style="--person-color: ${b.person.color}; background: var(--person-color)"></span>
        ${esc(b.person.name)}
      </span>
      <span class="grades-cell">${renderGradeBadge(tdG.grade, tdG.tier)}</span>
      <span class="grades-cell">${renderGradeBadge(wkG.grade, wkG.tier)}</span>
      <span class="grades-cell">${renderGradeBadge(moG.grade, moG.tier)}</span>
      <span class="grades-cell">${renderGradeBadge(yrG.grade, yrG.tier)}</span>
    </div>`;
  }
  html += `</div>`;

  // ── Store CTA row (Phase 6 will replace this with the unified Rewards Store) ──
  const hasRewards = sbRewards && Object.values(sbRewards).some(r => r.status === 'active');
  if (hasRewards) {
    const totalBalance = board.reduce((sum, b) => sum + b.liveBalance, 0);
    const giftIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`;
    const chevron = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
    html += `<button class="store-cta-row" type="button" id="sbStoreBtn">
      ${giftIcon}
      <span class="store-cta-row__label">Rewards Store</span>
      <span class="store-cta-row__balance">💰 ${totalBalance.toLocaleString()} pts</span>
      ${chevron}
    </button>`;
  }

  main.innerHTML = html;
  applyDataColors(main);
  bindEvents();
}
```

- [ ] **Step 4: Update bindEvents() for new element selectors**

Find `function bindEvents()` (around line 472). Replace the entire function body:

```js
function bindEvents() {
  // Period tabs
  for (const btn of document.querySelectorAll('.tab[data-period]')) {
    btn.addEventListener('click', () => {
      selectedPeriod = btn.dataset.period;
      if (linkedPerson) {
        const prefs = { ...(linkedPerson.prefs || {}), scoreboard: { period: selectedPeriod } };
        linkedPerson.prefs = prefs;
        const { id, ...data } = linkedPerson;
        writePerson(id, data);
      }
      render();
    });
  }

  // Store CTA row
  document.getElementById('sbStoreBtn')?.addEventListener('click', openStorePicker);

  // Grade cards — single click opens drilldown (no long-press needed: no competing tap action)
  for (const card of document.querySelectorAll('.card--score[data-person-id]')) {
    card.addEventListener('click', () => openDrilldown(card.dataset.personId));
  }
}
```

- [ ] **Step 5: Browser test — scoreboard main page**

Open `scoreboard.html`. Verify:
- Period tabs render as a segmented pill row (Today / Week / Month / 12 Mo)
- One grade card per person: colored left stripe, avatar circle with initial, name, meta row (streak · balance · trend), grade badge + percentage on same line
- All Grades table renders below cards
- Store CTA row appears below grades table (if family has rewards)
- Clicking a tab switches period; cards re-sort by new period
- Clicking a grade card opens drilldown (existing sparse drilldown for now)
- DevTools console → 0 errors

- [ ] **Step 6: Commit**

```bash
git add scoreboard.html
git commit -m "feat(phase5): rewrite scoreboard render() with shared tabs, card--score, grades table, store CTA"
```

---

### Task 4: Scoreboard — enrich openDrilldown() with category, sparklines, streak, balance

**Files:**
- Modify: `scoreboard.html` — `openDrilldown()` function

- [ ] **Step 1: Replace openDrilldown() body**

Find `function openDrilldown(personId)` (around line 519). Replace the entire function body with:

```js
function openDrilldown(personId) {
  const person = people.find(p => p.id === personId);
  if (!person) return;

  const periodDates = {
    today: [today, today],
    week:  [wStart, wEnd],
    month: [mStart, mEnd],
    year:  [y12Start, today],
  };
  const [dStart, dEnd] = periodDates[selectedPeriod];
  const periodLabels = { today: 'Today', week: 'This Week', month: 'This Month', year: '12 Months' };

  const grade = selectedPeriod === 'today' ? todayScore(personId)
    : selectedPeriod === 'week'  ? weeklyGrade(personId)
    : selectedPeriod === 'month' ? monthlyGrade(personId)
    : yearGrade(personId);
  const gd = gradeDisplay(grade.percentage);
  const streak = streaks[personId] || { current: 0, best: 0 };
  const personMsgs = allMessages?.[personId] || {};
  const personAnchor = allAnchors?.[personId] || null;
  const { balance } = calculateBalance(personId, allSnapshots, personMsgs, personAnchor, allMultipliers, tz);
  const todayMult = allMultipliers?.[today]?.[personId]?.multiplier || 1;
  const currentBalance = Math.round(balance + (todayScore(personId).percentage || 0) * todayMult);

  // Gather task-level detail for this person in the period
  const taskDetails = [];
  let cur = dStart;
  while (cur <= dEnd && cur <= today) {
    const dayEntries = schedule[cur] || {};
    for (const [k, e] of Object.entries(dayEntries)) {
      if (e.ownerId !== personId) continue;
      const task = tasks[e.taskId];
      if (!task) continue;
      const completion = comps[k] || null;
      const pts = basePoints(task, settings?.difficultyMultipliers);
      const earned = completion ? earnedPoints(task, completion, settings?.difficultyMultipliers) : 0;
      let status;
      if (completion) {
        status = completion.isLate ? 'Late' : 'Done';
      } else if (cur < today) {
        status = 'Missed';
      } else {
        status = 'Pending';
      }
      const catIcon = task.category ? (cats[task.category]?.icon || '') : '';
      taskDetails.push({ name: task.name, catIcon, date: cur, pts, earned, status });
    }
    cur = addDays(cur, 1);
  }

  // ── Category breakdown ──
  const breakdown = categoryBreakdown(personId, dStart, dEnd);
  const catKeys = Object.keys(breakdown).sort(
    (a, b) => breakdown[b].possible - breakdown[a].possible
  );

  // ── Weekly sparkline (last 4 weeks) ──
  const history = weeklyHistory(personId);

  // ── Balance sparkline (last 7 days) ──
  const balanceDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const filteredSnaps = {};
    if (allSnapshots) {
      for (const [dk, ppl] of Object.entries(allSnapshots)) {
        if (dk <= d) filteredSnaps[dk] = ppl;
      }
    }
    const dEnd2 = new Date(d + 'T23:59:59Z').getTime();
    const filteredMsgs = {};
    for (const [mk, m] of Object.entries(personMsgs)) {
      if (m.createdAt && m.createdAt <= dEnd2) filteredMsgs[mk] = m;
    }
    const { balance: bal } = calculateBalance(personId, filteredSnaps, filteredMsgs, personAnchor, allMultipliers, tz);
    balanceDays.push({ date: d, balance: bal });
  }
  const maxBal = Math.max(...balanceDays.map(d => Math.abs(d.balance)), 1);

  // ── Build sheet HTML ──
  let html = `<div class="sb-drilldown">`;

  // Header
  html += `<div class="sb-drilldown__header" style="--owner-color: ${person.color}">
    <div class="avatar" style="--person-color: ${person.color}">${esc(person.name[0].toUpperCase())}</div>
    <span class="sb-drilldown__name">${esc(person.name)}</span>
    <span class="sb-drilldown__period">${periodLabels[selectedPeriod]}</span>
  </div>`;

  // Summary row
  html += `<div class="sb-drilldown__summary">
    <span class="grade-badge grade-badge--${gd.tier} grade-badge--lg">${gd.grade}</span>
    <span class="sb-drilldown__stats">${grade.earned}/${grade.possible} pts · ${grade.percentage}%</span>
  </div>`;

  // Category breakdown
  if (catKeys.length > 0) {
    html += renderSectionHead('Category Breakdown');
    html += `<div class="sb-cat-bars">`;
    for (const ck of catKeys) {
      const c = breakdown[ck];
      const pct = c.possible > 0 ? Math.round((c.earned / c.possible) * 100) : 0;
      const tier = pct > 0 ? gradeDisplay(pct).tier : 'none';
      html += `<div class="sb-cat-row">
        <span class="sb-cat-label">${esc(c.icon)} ${esc(c.label)}</span>
        <div class="sb-cat-bar">
          <div class="sb-cat-bar-fill sb-cat-bar-fill--${tier}" style="width:${pct}%"></div>
        </div>
        <span class="sb-cat-pct">${pct}%</span>
      </div>`;
    }
    html += `</div>`;
  }

  // Weekly trend sparkline
  html += renderSectionHead('Weekly Trend');
  html += `<div class="sb-sparkline">`;
  const sparkLabels = ['3 wks ago', '2 wks ago', 'Last wk', 'This wk'];
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    const pct = h.possible > 0 ? h.percentage : 0;
    const tier = pct > 0 ? gradeDisplay(pct).tier : 'none';
    html += `<div class="sb-spark-bar" title="${sparkLabels[i]}: ${pct}%">
      <div class="sb-spark-fill sb-spark-fill--${tier}" style="height:${Math.max(pct, 4)}%"></div>
    </div>`;
  }
  html += `</div>`;

  // Streak
  html += renderSectionHead('Streak');
  html += `<div class="sb-drilldown__streak">
    🔥 ${streak.current}-day current · ⭐ ${streak.best}-day best
  </div>`;

  // Balance sparkline
  html += renderSectionHead('Balance');
  html += `<div class="sb-drilldown__balance-row">
    <div class="sb-sparkline">`;
  for (let i = 0; i < balanceDays.length; i++) {
    const bd = balanceDays[i];
    const pct = Math.round(Math.abs(bd.balance) / maxBal * 100);
    const label = i === 6 ? 'Today' : formatDateShort(bd.date);
    html += `<div class="sb-spark-bar" title="${label}: ${bd.balance.toLocaleString()} pts">
      <div class="sb-spark-fill sb-spark-fill--${bd.balance >= 0 ? 'a' : 'f'}" style="height:${Math.max(pct, 4)}%"></div>
    </div>`;
  }
  html += `</div>
    <span class="sb-drilldown__balance-val">💰 ${currentBalance.toLocaleString()}</span>
  </div>`;

  // Task list by status
  html += renderSectionHead(`Tasks — ${periodLabels[selectedPeriod]}`);
  const statusOrder = ['Missed', 'Late', 'Pending', 'Done'];
  const statusGroups = {};
  for (const td of taskDetails) {
    if (!statusGroups[td.status]) statusGroups[td.status] = [];
    statusGroups[td.status].push(td);
  }
  for (const status of statusOrder) {
    const items = statusGroups[status];
    if (!items?.length) continue;
    const statusClass = `sb-status--${status.toLowerCase()}`;
    html += `<div class="sb-drilldown__group">
      <div class="sb-drilldown__group-label ${statusClass}">${status} (${items.length})</div>`;
    for (const item of items) {
      html += `<div class="sb-drilldown__task">
        <span class="sb-drilldown__task-name">${item.catIcon ? esc(item.catIcon) + ' ' : ''}${esc(item.name)}</span>
        <span class="sb-drilldown__task-date">${formatDateShort(item.date)}</span>
        <span class="sb-drilldown__task-pts">${item.earned}/${item.pts}</span>
      </div>`;
    }
    html += `</div>`;
  }

  if (taskDetails.length === 0) {
    html += `<div class="sb-drilldown__empty">No tasks in this period</div>`;
  }

  html += `</div>`;

  // Mount bottom sheet
  const mount = document.getElementById('drilldownMount');
  mount.innerHTML = renderBottomSheet(html);
  applyDataColors(mount);

  requestAnimationFrame(() => {
    const overlay = document.getElementById('bottomSheet');
    if (overlay) {
      overlay.classList.add('active');
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDrilldown();
      });
    }
  });
}
```

- [ ] **Step 2: Verify closeDrilldown() is unchanged**

`closeDrilldown()` (lines after `openDrilldown`) should remain exactly as-is. Confirm it still exists below the new `openDrilldown`.

- [ ] **Step 3: Browser test — drilldown sheet**

Open `scoreboard.html`. Click any grade card. Verify the drilldown sheet contains:
- Person name + period label header
- Grade badge + stats summary row
- Category Breakdown section with bar chart rows (if data exists)
- Weekly Trend sparkline (4 bars)
- Streak section (current + best)
- Balance section (7-day sparkline)
- Tasks grouped by Missed / Late / Pending / Done
- Tap backdrop closes sheet

- [ ] **Step 4: Commit**

```bash
git add scoreboard.html
git commit -m "feat(phase5): enrich scoreboard drilldown with category breakdown, sparklines, streak, balance"
```

---

### Task 5: Scoreboard CSS — retire bespoke sb-* classes, add new, fix store inline styles

**Files:**
- Modify: `styles/scoreboard.css` (replace entire file)
- Modify: `scoreboard.html` — `openStorePicker()` and `openStore()` HTML (remove inline styles)

- [ ] **Step 1: Replace styles/scoreboard.css**

Replace the entire file content with:

```css
/* v3 */
/* scoreboard.css — Scoreboard page styles (Phase 5) */
/* Component classes (tabs, card--score, etc.) live in components.css */

/* ── Grades table (inside .card.grades-card) ── */
.grades-card {
  padding: 0;
  overflow: hidden;
  display: block;
  margin-bottom: var(--spacing-lg);
}

.grades-header {
  display: grid;
  grid-template-columns: 1.5fr repeat(4, 1fr);
  padding: var(--spacing-xs) var(--spacing-md);
  border-bottom: 1px solid var(--border);
  font-size: var(--font-xs);
  color: var(--text-faint);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.grades-row {
  display: grid;
  grid-template-columns: 1.5fr repeat(4, 1fr);
  align-items: center;
  padding: var(--spacing-xs) var(--spacing-md);
  border-bottom: 1px solid var(--border);
  min-width: 320px;
}

.grades-row:last-child { border-bottom: none; }

.grades-cell { text-align: center; }

.grades-cell--name {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  text-align: left;
  font-size: var(--font-sm);
  font-weight: 500;
}

/* ── sb-mini-dot (retained — utility, not a component class) ── */
.sb-mini-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

/* ── Score card badge icons ── */
.sb-badges {
  font-size: var(--font-sm);
  margin-left: var(--spacing-xs);
}

/* ── Store CTA row (Phase 6 will replace with unified Rewards Store) ── */
.store-cta-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
  margin-bottom: var(--spacing-lg);
}

.store-cta-row__label { flex: 1; font-size: var(--font-sm); font-weight: 500; }
.store-cta-row__balance { font-size: var(--font-xs); color: var(--accent); font-weight: 600; }

/* ── Store picker (who's shopping) ── */
.store-picker-body { padding: var(--spacing-xs) 0; }
.store-picker-title {
  font-size: var(--font-md);
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.store-person-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  cursor: pointer;
  margin-bottom: var(--spacing-sm);
  font: inherit;
  font-size: var(--font-md);
  color: inherit;
  text-align: left;
  transition: background var(--t-fast);
}

.store-person-btn:hover { background: var(--surface-2); }
.store-person-btn__name { flex: 1; font-weight: 500; }
.store-person-btn__balance { font-size: var(--font-sm); color: var(--text-muted); }

/* ── Store open (individual person store) ── */
.store-header__title { font-weight: 600; }
.store-section { margin-bottom: var(--spacing-md); }
.store-section-heading {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin-bottom: var(--spacing-xs);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.store-card--pending {
  border-color: var(--warning);
  opacity: 0.8;
}

.store-card__date {
  font-size: var(--font-xs);
  color: var(--text-muted);
}

.store-remove-token {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--danger);
}

.store-remove-token:hover { opacity: 0.75; }

/* ── Skip task picker ── */
.skip-picker-title {
  font-size: var(--font-md);
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.skip-pick-btn {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-xs);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-sm);
  color: inherit;
  transition: background var(--t-fast);
}

.skip-pick-btn:hover { background: var(--surface-2); }

/* ── Drilldown sheet ── */
.sb-drilldown { padding: 0; }

.sb-drilldown__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--spacing-sm);
}

.sb-drilldown__name {
  flex: 1;
  font-size: var(--font-lg);
  font-weight: 700;
}

.sb-drilldown__period {
  font-size: var(--font-sm);
  color: var(--text-faint);
}

.sb-drilldown__summary {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--spacing-sm);
}

.sb-drilldown__stats {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.sb-drilldown__streak {
  font-size: var(--font-sm);
  color: var(--text-muted);
  padding: var(--spacing-xs) 0 var(--spacing-sm);
}

.sb-drilldown__balance-row {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
}

.sb-drilldown__balance-val {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.sb-drilldown__group { margin-bottom: var(--spacing-sm); }

.sb-drilldown__group-label {
  font-size: var(--font-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
  padding: var(--spacing-xs) 0;
}

.sb-drilldown__task {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  border-bottom: 1px solid var(--border);
  font-size: var(--font-sm);
}

.sb-drilldown__task:last-child { border-bottom: none; }
.sb-drilldown__task-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-drilldown__task-date { color: var(--text-faint); flex-shrink: 0; }
.sb-drilldown__task-pts { color: var(--text-faint); flex-shrink: 0; font-variant-numeric: tabular-nums; }
.sb-drilldown__empty { color: var(--text-faint); font-size: var(--font-sm); padding: var(--spacing-sm) 0; }

.sb-status--missed { color: var(--danger); }
.sb-status--late   { color: var(--warning); }
.sb-status--pending { color: var(--text-faint); }
.sb-status--done   { color: var(--success); }

/* ── Sparkline bars (retained — used in drilldown) ── */
.sb-sparkline {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 48px;
  flex: 1;
}

.sb-spark-bar {
  flex: 1;
  display: flex;
  align-items: flex-end;
  height: 100%;
}

.sb-spark-fill {
  width: 100%;
  border-radius: 3px 3px 0 0;
  transition: height 0.4s ease;
}

.sb-spark-fill--a-plus, .sb-spark-fill--a { background: var(--grade-a); }
.sb-spark-fill--b-plus, .sb-spark-fill--b, .sb-spark-fill--b-minus { background: var(--grade-b); }
.sb-spark-fill--c-plus, .sb-spark-fill--c, .sb-spark-fill--c-minus { background: var(--grade-c); }
.sb-spark-fill--d-plus, .sb-spark-fill--d, .sb-spark-fill--d-minus,
.sb-spark-fill--f, .sb-spark-fill--none { background: var(--grade-f); }

/* Positive balance sparklines use grade-a color */
.sb-spark-fill--a-minus { background: var(--grade-a); }

/* ── Category breakdown bars (retained — used in drilldown) ── */
.sb-cat-bars { display: flex; flex-direction: column; gap: var(--spacing-xs); padding-bottom: var(--spacing-sm); }
.sb-cat-row { display: flex; align-items: center; gap: var(--spacing-sm); }
.sb-cat-label { font-size: var(--font-sm); min-width: 80px; flex-shrink: 0; }
.sb-cat-bar { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
.sb-cat-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.sb-cat-bar-fill--a-plus, .sb-cat-bar-fill--a, .sb-cat-bar-fill--a-minus { background: var(--grade-a); }
.sb-cat-bar-fill--b-plus, .sb-cat-bar-fill--b, .sb-cat-bar-fill--b-minus { background: var(--grade-b); }
.sb-cat-bar-fill--c-plus, .sb-cat-bar-fill--c, .sb-cat-bar-fill--c-minus { background: var(--grade-c); }
.sb-cat-bar-fill--d-plus, .sb-cat-bar-fill--d, .sb-cat-bar-fill--d-minus,
.sb-cat-bar-fill--f, .sb-cat-bar-fill--none { background: var(--grade-f); }
.sb-cat-pct { font-size: var(--font-xs); color: var(--text-faint); min-width: 28px; text-align: right; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 2: Fix openStorePicker() inline styles in scoreboard.html**

Find `function openStorePicker()` (around line 960). Replace its body with:

```js
function openStorePicker() {
  if (people.length === 1) {
    openStore(people[0].id);
    return;
  }
  let html = `<div class="store-picker-body">
    <h3 class="store-picker-title">Who's shopping?</h3>`;
  for (const p of people) {
    const personMsgs = allMessages?.[p.id] || {};
    const personAnchor = allAnchors?.[p.id] || null;
    const { balance } = calculateBalance(p.id, allSnapshots, personMsgs, personAnchor, allMultipliers, tz);
    html += `<button class="store-person-btn" data-person-id="${esc(p.id)}" type="button">
      <div class="avatar" style="--person-color: ${esc(p.color)}">${esc(p.name[0].toUpperCase())}</div>
      <span class="store-person-btn__name">${esc(p.name)}</span>
      <span class="store-person-btn__balance">💰 ${Math.round(balance).toLocaleString()}</span>
    </button>`;
  }
  html += `</div>`;

  const mount = document.getElementById('storeMount');
  mount.innerHTML = renderBottomSheet(html);
  applyDataColors(mount);
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  for (const btn of mount.querySelectorAll('.store-person-btn')) {
    btn.addEventListener('click', () => {
      mount.innerHTML = '';
      openStore(btn.dataset.personId);
    });
  }
  mount.querySelector('.bottom-sheet-overlay')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('bottom-sheet-overlay')) mount.innerHTML = '';
  });
}
```

- [ ] **Step 3: Fix openStore() inline styles in scoreboard.html**

Find `async function openStore(personId)` (around line 644). Fix the store HTML sections that have inline styles:

**Fix the header** (around line 691). Replace:
```js
      let html = `<div class="store-header">
        <span class="sb-card__initial" style="background: ${person.color}; width: 28px; height: 28px; font-size: 0.875rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff;">${person.name[0].toUpperCase()}</span>
        <span style="font-weight: 600;">${esc(person.name)}'s Store</span>
        <span class="store-balance">💰 ${Math.round(balance).toLocaleString()} pts</span>
      </div>`;
```
With:
```js
      let html = `<div class="store-header">
        <div class="avatar avatar--sm" style="--person-color: ${esc(person.color)}">${esc(person.name[0].toUpperCase())}</div>
        <span class="store-header__title">${esc(person.name)}'s Store</span>
        <span class="store-balance">💰 ${Math.round(balance).toLocaleString()} pts</span>
      </div>`;
```

**Fix the saved tokens section** (around line 701). Replace:
```js
        html += `<div style="margin-bottom: 12px;"><h4 style="font-size: var(--font-sm); color: var(--text-muted); margin-bottom: 8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg> Saved (${savedTokens.length})</h4>`;
```
With:
```js
        html += `<div class="store-section"><h4 class="store-section-heading"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg> Saved (${savedTokens.length})</h4>`;
```

**Fix the token date inside the saved token cards** (around line 714). Replace:
```js
              <div class="store-card__cost" style="color: var(--text-muted); font-size: var(--font-xs, 0.75rem);">Saved ${new Date(token.acquiredAt).toLocaleDateString('en-US', { timeZone: tz })}</div>
```
With:
```js
              <div class="store-card__date">Saved ${new Date(token.acquiredAt).toLocaleDateString('en-US', { timeZone: tz })}</div>
```

**Fix the token card border** (around line 710). Replace `style="border-color: var(--accent);"` on `.store-card` with class `store-card--available`:
```js
          html += `<div class="store-card store-card--available"
```

**Fix the remove-token button** (around line 718). Replace:
```js
              <button class="btn btn--xs btn--ghost store-remove-token" data-token-id="${esc(tokenId)}" data-token-name="${esc(typeLabel)}" type="button" style="color: var(--accent-danger, #e53e3e);"><svg ...></svg></button>
```
With (remove the `style=` attribute, keep the `btn` classes removed — just use class):
```js
              <button class="store-remove-token" data-token-id="${esc(tokenId)}" data-token-name="${esc(typeLabel)}" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
```

**Fix the pending requests section** (around line 725). Replace:
```js
        html += `<div style="margin-bottom: 12px;"><h4 style="font-size: var(--font-sm); color: var(--text-muted); margin-bottom: 8px;">Pending Requests</h4>`;
```
With:
```js
        html += `<div class="store-section"><h4 class="store-section-heading">Pending Requests</h4>`;
```

**Fix the pending card** (around line 728). Replace `style="border-color: var(--accent-warning, #ecc94b); opacity: 0.8;"`:
```js
            html += `<div class="store-card store-card--pending"
```

**Fix the skip picker** (around lines 892-895). Replace:
```js
            let skipHtml = '<h3 style="margin-bottom: 12px;">Pick a task to skip</h3>';
            for (const [key, entry] of skippable) {
              const task = tasks[entry.taskId];
              skipHtml += `<button class="skip-pick-btn" data-entry-key="${key}" type="button" style="display: block; width: 100%; text-align: left; padding: 12px; margin-bottom: 8px; border: 1px solid var(--border); border-radius: var(--radius, 8px); background: var(--surface); cursor: pointer;">${esc(task.name)}</button>`;
            }
```
With:
```js
            let skipHtml = '<h3 class="skip-picker-title">Pick a task to skip</h3>';
            for (const [key, entry] of skippable) {
              const task = tasks[entry.taskId];
              skipHtml += `<button class="skip-pick-btn" data-entry-key="${key}" type="button">${esc(task.name)}</button>`;
            }
```

- [ ] **Step 4: Verify zero inline styles remain**

Run in terminal:
```bash
grep -n 'style="' scoreboard.html
```
Expected: only lines with `style="--` CSS custom property bindings remain (like `style="--owner-color: ..."`, `style="--person-color: ..."`, `style="width:..."` in sparkline fills). Zero structural `style=""` attributes.

- [ ] **Step 5: Browser test — full scoreboard pass**

Open `scoreboard.html`. Verify:
- Main page: tabs + grade cards + grades table + store CTA (if rewards exist)
- No sparklines, category bars, or streak rows on the main page
- Grade + percentage on same line in trailing slot (not stacked)
- Clicking a card → enriched drilldown sheet
- Clicking store CTA → store picker (if 2+ people) or individual store
- Store picker: person buttons styled correctly (no inline styles visible)
- Store: saved tokens show, dates are muted (not accent-colored)
- Remove token button shows red X (styled from CSS, not inline)
- Test in light + dark theme: no color escapes

- [ ] **Step 6: Commit**

```bash
git add styles/scoreboard.css scoreboard.html
git commit -m "feat(phase5): retire sb-* CSS, add grades-header/store-cta-row, fix all inline styles in scoreboard"
```

---

### Task 6: Tracker — rewrite render() with shared tabs and filter chip

**Files:**
- Modify: `tracker.html` — import line, `render()`, `bindEvents()`, add `openFilterSheet()`

- [ ] **Step 1: Update the import from components.js**

In `tracker.html`, find the `import { ... } from './shared/components.js'` line (around line 42). Add `renderTrackerFilterSheet, renderSectionHead, renderBottomSheet` (check if `renderBottomSheet` is already imported — add only what's missing):

```js
import { renderNavBar, initNavMore, renderHeader, renderEmptyState, renderPersonFilter, renderTaskDetailSheet, renderBottomSheet, renderEditTaskSheet, openDeviceThemeSheet, initOfflineBanner, initBell, initBanner, applyDataColors, renderTrackerFilterSheet, renderSectionHead } from './shared/components.js';
```

- [ ] **Step 2: Replace the render() view tabs, filter, and content area**

Find `function render()` (around line 491). Replace its entire body with:

```js
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

- [ ] **Step 3: Add openFilterSheet() function (add before bindEvents)**

Insert the following new function immediately before `function bindEvents()`:

```js
function openFilterSheet() {
  const mount = document.getElementById('taskSheetMount');
  mount.innerHTML = renderBottomSheet(
    renderTrackerFilterSheet(cats, activeCategory, activeStatus)
  );
  applyDataColors(mount);

  // Track in-sheet state separately until Apply
  let sheetCategory = activeCategory;
  let sheetStatus = activeStatus;

  const sheet = document.getElementById('bottomSheet');

  function updateChipStates() {
    for (const btn of mount.querySelectorAll('[data-filter-cat]')) {
      btn.classList.toggle('chip--active', btn.dataset.filterCat === (sheetCategory || ''));
    }
    for (const btn of mount.querySelectorAll('[data-filter-status]')) {
      btn.classList.toggle('chip--active', btn.dataset.filterStatus === (sheetStatus || ''));
    }
  }

  for (const btn of mount.querySelectorAll('[data-filter-cat]')) {
    btn.addEventListener('click', () => {
      sheetCategory = btn.dataset.filterCat || null;
      updateChipStates();
    });
  }

  for (const btn of mount.querySelectorAll('[data-filter-status]')) {
    btn.addEventListener('click', () => {
      sheetStatus = btn.dataset.filterStatus || null;
      updateChipStates();
    });
  }

  mount.querySelector('#filterClear')?.addEventListener('click', () => {
    activeCategory = null;
    activeStatus = null;
    saveTrackerPrefs();
    mount.innerHTML = '';
    render();
  });

  mount.querySelector('#filterApply')?.addEventListener('click', () => {
    activeCategory = sheetCategory;
    activeStatus = sheetStatus;
    saveTrackerPrefs();
    mount.innerHTML = '';
    render();
  });

  requestAnimationFrame(() => {
    sheet?.classList.add('active');
    sheet?.addEventListener('click', (e) => {
      if (e.target === sheet) mount.innerHTML = '';
    });
  });
}
```

- [ ] **Step 4: Replace bindEvents() with updated selectors**

Find `function bindEvents()` (around line 532). Replace the entire function body:

```js
function bindEvents() {
  // View tabs
  for (const tab of main.querySelectorAll('.tab[data-view]')) {
    tab.addEventListener('click', () => {
      activeView = tab.dataset.view;
      periodAnchor = today;
      saveTrackerPrefs();
      render();
    });
  }

  // Person filter
  for (const pill of main.querySelectorAll('.person-pill')) {
    pill.addEventListener('click', () => {
      activePerson = pill.dataset.personId || null;
      saveTrackerPrefs();
      render();
    });
  }

  // Filter chip → opens filter sheet
  main.querySelector('#trackerFilterChip')?.addEventListener('click', openFilterSheet);

  // Period navigation buttons
  for (const btn of main.querySelectorAll('[data-period-nav]')) {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.periodNav;
      if (nav === 'prev') shiftPeriod(-1);
      else if (nav === 'next') shiftPeriod(1);
      else if (nav === 'today') snapToToday();
    });
  }

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
}
```

- [ ] **Step 5: Browser test — tracker tabs and filter**

Open `tracker.html`. Verify:
- View tabs render as segmented pill row (Weekly / Monthly)
- Period nav (‹ Apr 21–27 ›) renders below tabs, unchanged
- Person filter pills render
- Filter chip renders to the right of person filter: "Filter" when no filters active, "Filter · N" when filters set
- Clicking Filter chip opens bottom sheet with Category + Status chip groups + Clear/Apply buttons
- Selecting chips + Apply → re-renders with filters applied, chip shows count
- Clear all → resets both filters + closes sheet
- View tab switching resets to current period (today's week/month)

- [ ] **Step 6: Commit**

```bash
git add tracker.html
git commit -m "feat(phase5): rewrite tracker render() with shared tabs, filter chip, and filter sheet"
```

---

### Task 7: Tracker — rewrite renderRow() to use .card.card--tracker

**Files:**
- Modify: `tracker.html` — `renderRow()` function

- [ ] **Step 1: Replace renderRow()**

Find `function renderRow(row)` (around line 303). Replace the entire function:

```js
function renderRow(row) {
  const showIcon = row.category?.showIcon !== false;
  const catIcon = showIcon ? (row.category?.icon || '') : '';
  const ownerColor = row.person?.color || 'var(--text-muted)';
  const ownerInitial = row.person ? row.person.name[0].toUpperCase() : '↻';
  const ownerName = row.person?.name || 'Rotates';
  const taskTitle = catIcon ? `${catIcon} ${esc(row.task.name)}` : esc(row.task.name);
  const dateLabel = row.dateKey ? formatDateShort(row.dateKey) : '—';

  const isDone = row.status === 'done' || row.status === 'late';
  const isOverdue = row.status === 'overdue';

  const modifiers = [
    isDone ? 'card--done' : null,
    isOverdue ? 'card--overdue' : null,
  ].filter(Boolean).join(' ');

  return `<article class="card card--tracker${modifiers ? ' ' + modifiers : ''}" data-entry-key="${row.entryKey || ''}" data-date-key="${row.dateKey || ''}">
    <div class="card__leading">
      <span class="person-dot" style="--person-color: ${esc(ownerColor)}; background: var(--person-color)">${ownerInitial}</span>
    </div>
    <div class="card__body">
      <div class="card__title">${taskTitle}</div>
      <div class="card__meta">${esc(ownerName)} · ${dateLabel}</div>
    </div>
    <div class="card__trailing">
      ${renderStatusBadge(row.status)}
    </div>
  </article>`;
}
```

- [ ] **Step 2: Remove renderCategoryFilter() and renderStatusFilter() functions**

Find `function renderCategoryFilter()` (around line 354) and `function renderStatusFilter()` (around line 368). Delete both functions entirely — they're replaced by the filter sheet.

- [ ] **Step 3: Remove references to old state tracking vars if unused**

The variables `activeCategory` and `activeStatus` are still used — keep them. No changes needed there.

- [ ] **Step 4: Browser test — tracker rows**

Open `tracker.html`. Verify:
- Task rows render as cards with colored person dot on left, name + meta in body, status badge on right
- Done/Late rows are muted (opacity 0.75) — NO strikethrough
- Overdue rows show danger left stripe + soft danger background
- Long-press (hold ~600ms) on a row with an entry key → opens detail sheet
- Skipped/Cooldown rows (no entry key) → long-press has no effect (by design — no detail sheet)
- Cards in Weekly and Monthly views both use the new card layout

- [ ] **Step 5: Commit**

```bash
git add tracker.html
git commit -m "feat(phase5): replace tracker-row with card--tracker in renderRow()"
```

---

### Task 8: Tracker — update renderMonthlyView() to use renderSectionHead()

**Files:**
- Modify: `tracker.html` — `renderMonthlyView()` function

- [ ] **Step 1: Update the monthly view week group headers**

Find `renderMonthlyView()` (around line 418). Inside this function, find the section that builds week group headers. Replace the portion that renders group heads:

Find:
```js
        html += `<div class="tracker-week-group${currentClass}">
          <div class="tracker-week-label">${group.label}${currentTag}</div>
          <div class="tracker-rows">`;
```

Replace with:
```js
        const tagHtml = group.isCurrent
          ? `<span class="tracker-week-current-tag">This Week</span>`
          : '';
        html += `<div class="tracker-week-group${currentClass}">
          ${renderSectionHead(group.label, null, { trailingHtml: tagHtml })}
          <div class="tracker-rows">`;
```

- [ ] **Step 2: Also update renderWeeklyView() rows container**

The weekly view wraps rows in `.tracker-rows`. This class is kept in tracker.css (it's a layout container, not a component class). Confirm the line:
```js
html += `<div class="tracker-rows">`;
```
is present in `renderWeeklyView()` — no change needed.

- [ ] **Step 3: Browser test — monthly view**

Open `tracker.html`. Switch to Monthly view. Verify:
- Week group headers use `renderSectionHead()` style (uppercase muted label)
- Current week group head shows "This Week" tag to the right of the label
- Current week group still has left border accent (from `.tracker-week-group--current` CSS)
- Task cards inside each week group render correctly

- [ ] **Step 4: Commit**

```bash
git add tracker.html
git commit -m "feat(phase5): tracker monthly view uses renderSectionHead() for week group headers"
```

---

### Task 9: Tracker CSS — retire bespoke tab/row classes, add chip--filter

**Files:**
- Modify: `styles/tracker.css` (replace entire file)

- [ ] **Step 1: Replace styles/tracker.css**

Replace the entire file content with:

```css
/* v3 */
/* tracker.css — Tracker page styles (Phase 5) */
/* Tab and card-row component classes now live in components.css */

/* ── Period navigation (kept — solid, correct tap targets) ── */
.tracker-period {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  margin: 0.5rem 0 0.75rem;
  font-size: var(--font-md);
  color: var(--text-faint);
}

.tracker-period__row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.tracker-period__label {
  min-width: 10ch;
  text-align: center;
  font-weight: 600;
  color: var(--text);
}

.tracker-period__nav {
  background: transparent;
  border: none;
  color: var(--text-faint);
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: var(--radius-sm);
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tracker-period__nav:hover { background: var(--surface-2); color: var(--text); }
.tracker-period__nav:focus-visible { outline: none; color: var(--text); box-shadow: 0 0 0 2px var(--accent); }

.tracker-period__today {
  background: transparent;
  border: none;
  color: var(--text-faint);
  font-size: var(--font-sm);
  font-weight: 500;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tracker-period__today:hover { background: var(--surface-2); color: var(--text); }
.tracker-period__today:focus-visible { outline: none; color: var(--text); box-shadow: 0 0 0 2px var(--accent); }

/* ── Filter area (person filter + filter chip row) ── */
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

/* ── Summary bar ── */
.tracker-summary {
  margin-bottom: var(--spacing-sm);
}

.tracker-summary__bar {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: var(--spacing-xs);
}

.tracker-summary__fill {
  height: 100%;
  background: var(--success);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.tracker-summary__counts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.tracker-summary__count {
  font-size: var(--font-xs);
  font-weight: 600;
}

.tracker-summary__count--done     { color: var(--success); }
.tracker-summary__count--late     { color: var(--warning); }
.tracker-summary__count--overdue  { color: var(--danger); }
.tracker-summary__count--upcoming { color: var(--text-faint); }
.tracker-summary__count--cooldown { color: var(--text-faint); }
.tracker-summary__count--skipped  { color: var(--text-faint); }

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

/* ── Status badges (retained — utility, not a component class) ── */
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

- [ ] **Step 2: Browser test — full tracker pass**

Open `tracker.html`. Verify in both Weekly and Monthly views:
- No bespoke `.tracker-tab` or `.tracker-row` styles bleeding in (DevTools → Elements)
- Period nav unchanged
- Filter chip renders correctly (bordered pill)
- Summary bar renders below filter area
- Task cards use `.card.card--tracker` styling (matching dashboard density)
- Done/Late rows: muted, no strikethrough
- Overdue rows: danger left stripe + danger-soft bg
- Status badges styled correctly (colored pills)
- Monthly: week group headers use `renderSectionHead` style; current week has blue left border + "This Week" tag
- Test in 2 themes (light + dark): no color token escapes

- [ ] **Step 3: Commit**

```bash
git add styles/tracker.css
git commit -m "feat(phase5): retire tracker-tabs/tracker-row CSS, add chip--filter and tracker-filter-area"
```

---

### Task 10: Final verification pass + SW cache bump

**Files:**
- Modify: `sw.js` — bump `CACHE_NAME`

- [ ] **Step 1: Run inline style audit on both files**

```bash
grep -n 'style="' scoreboard.html | grep -v 'style="--'
grep -n 'style="' tracker.html | grep -v 'style="--'
```

Expected: 0 lines from each command. If any appear, fix them by creating CSS classes and updating the HTML.

- [ ] **Step 2: Run bespoke class audit**

```bash
grep -n 'sb-period-tabs\|sb-tab\|sb-cards\|sb-card[^_]\|sb-section-label\|sb-trends\|sb-categories\|sb-streaks' scoreboard.html scoreboard.css
grep -n 'tracker-tabs\|tracker-tab\|tracker-row[^_]' tracker.html tracker.css
```

Expected: 0 matches. If any appear, fix them.

- [ ] **Step 3: Check tap targets at 375px**

Open `scoreboard.html` in DevTools, set device to iPhone SE (375px). Verify:
- Grade cards are ≥ 44px tall ✓ (min-height: 64px)
- Period tabs are ≥ 36px tall ✓
- Store CTA row is ≥ 44px tall ✓

Open `tracker.html` at 375px. Verify:
- Filter chip is ≥ 36px tall ✓
- Task cards are ≥ 60px tall ✓
- Period nav buttons are ≥ 44px ✓

- [ ] **Step 4: Run through all 14 exit criteria from the spec**

```
[ ] No .sb-period-tabs, .sb-tab, .sb-cards, .sb-card (non-sub), .sb-section-label, .sb-trends, .sb-categories, .sb-streaks in scoreboard.css or scoreboard.html
[ ] No .tracker-tabs, .tracker-tab, .tracker-row (non-sub) in tracker.css or tracker.html
[ ] Scoreboard main page shows only: period tabs + grade cards + grades table + store CTA
[ ] Drilldown shows: summary + category breakdown + trend sparkline + streak + balance + task list
[ ] Tracker: single Filter chip (not two selects). Chip opens sheet with category + status chip groups
[ ] Tracker done/late rows: muted opacity, no strikethrough
[ ] Tracker overdue rows: danger left stripe + danger-soft background
[ ] Monthly view week group headers use renderSectionHead()
[ ] Grade card trailing: grade + percentage on the same line (not stacked)
[ ] grep 'style="' returns 0 in both files (excluding --custom-property bindings)
[ ] No raw hex in scoreboard.css or tracker.css
[ ] All tap targets ≥ 44×44. Verified at 375px.
[ ] Tested in ≥ 2 themes (light + dark). No color token escapes.
[ ] SW cache bumped.
```

- [ ] **Step 5: Bump SW cache version**

In `sw.js`, find the line:
```js
const CACHE_NAME = 'family-hub-v75';
```

Change to:
```js
const CACHE_NAME = 'family-hub-v76';
```

Also update the `urlsToCache` array if any new files were added (no new files in Phase 5 — all changes are to existing files). No array update needed.

- [ ] **Step 6: Final commit and deploy**

```bash
git add sw.js
git commit -m "feat(phase5): bump SW cache to v76 after scoreboard + tracker redesign"
git push origin main
```

Wait ~60s for Cloudflare Pages to deploy. Open the production URL and spot-check both pages.

---

## Self-review

**Spec coverage check:**
- §4.1 Scoreboard page structure → Task 3 ✓
- §4.2 Period tabs → Task 3 ✓
- §4.3 Grade cards with inline grade+% → Task 3 ✓
- §4.4 All Grades table → Task 3 ✓
- §4.5 Store CTA row → Task 3 ✓
- §4.6 Drilldown enrichment → Task 4 ✓
- §5.2 Tracker view tabs → Task 6 ✓
- §5.3 Period nav (kept) → Task 6 ✓
- §5.5 Filter chip + sheet → Tasks 6 ✓
- §5.6 Summary strip position → Task 6 (summary stays in renderWeeklyView/renderMonthlyView, rendered before rows — no change needed) ✓
- §5.7 Task rows → card--tracker → Task 7 ✓
- §5.8 Monthly section heads → Task 8 ✓
- §5.9 Status badges retained → Task 9 ✓
- §6 Inline style audit → Task 5 (scoreboard), Task 7 (tracker) ✓
- §3.1 card--score CSS → Task 1 ✓
- §3.3 renderTrackerFilterSheet → Task 2 ✓
- §7 Exit criteria → Task 10 ✓
- §8 Files touched → all tasks ✓

**Type consistency check:** `renderScoreCard(b, active, gd, liveBalance, badgeIcons)` — used in Task 3 Step 3 with the exact same signature defined in Task 2 Step 1. ✓ `renderTrackerFilterSheet(cats, activeCategory, activeStatus)` — defined in Task 2 Step 2, called in Task 6 Step 3. ✓ `renderSectionHead(title, meta, options)` — used with `(label)` in Task 3, `('Category Breakdown')` in Task 4, and `(group.label, null, { trailingHtml: tagHtml })` in Task 8. All match the confirmed signature. ✓

# Scoreboard Pass 1 — Fix + Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 4 bugs and remove the 2 redundant sections. The scoreboard page is roughly 30% leaner with no functional regressions.

**Spec:** [docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md](../specs/2026-05-12-scoreboard-rebuild.md) — see "Pass 1 — Fix + Cut" section for context.

**Architecture:** Pure UI changes in two files. No schema work. No new helpers. Pass 1 is the cheap pre-rebuild cleanup so subsequent passes start from a clean baseline.

**Tech Stack:** Vanilla JS modules, no bundler. Verification = Playwright at 412×915 + visual diff (no JS test suite for these pages).

**Files touched:**
- [scoreboard.html](../../../scoreboard.html) — 4 changes (3 fixes + 2 removals); one fix moot if All Grades is removed first
- [shared/components.js](../../../shared/components.js) — 1 change (`renderScoreCard` empty-state)
- [styles/scoreboard.css](../../../styles/scoreboard.css) — 1 change (small style for `card--score__empty`)

**Commit discipline:** One commit per task. Pass 1 lands as 6 small commits.

---

## Pre-flight

### Task 0: Confirm dev server + baseline screenshot

- [ ] **Step 1: Confirm dev server is running**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/`
Expected: `200`

If not running, start it: `node serve.js` in a background shell.

- [ ] **Step 2: Capture baseline screenshots**

Open Playwright at 412×915, navigate to `http://localhost:8080/scoreboard.html`, take three screenshots:
- `pass-1-baseline-top.png` — viewport at scroll Y=0
- `pass-1-baseline-mid.png` — viewport at scroll Y=600
- `pass-1-baseline-drilldown.png` — full page after clicking the first hero card

These exist only to compare against once Pass 1 lands. Delete after Pass 1 ships per the screenshot cleanup rule.

- [ ] **Step 3: Confirm no console errors at baseline**

In Playwright, check `list_console_messages` — expect 0 errors (the existing 1 warning is acceptable; note it down).

---

## Task 1: Fix Highlights "up" arrow — chevron → trend arrow

**Files:**
- Modify: `scoreboard.html:337-339`

The `trendSvg('up')` SVG today renders a chevron-up (looks like an accordion expand caret). Replace with a true rising trend arrow.

- [ ] **Step 1: Locate the current SVG**

In [scoreboard.html](../../../scoreboard.html), find:
```js
const trendSvg = (dir) => dir === 'up'
  ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`
  : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
```

- [ ] **Step 2: Replace with rising-arrow SVG**

Replace the entire `trendSvg` definition with:
```js
const trendSvg = (dir) => dir === 'up'
  ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`
  : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`;
```

The "up" arrow rises from bottom-left to top-right with an arrowhead in the top-right corner. The "down" variant mirrors it (kept for symmetry though no current caller uses it).

- [ ] **Step 3: Verify in Playwright**

Reload `http://localhost:8080/scoreboard.html`. The Highlights row showing "Jordin is up 11% from last week" should now have a clear rising arrow, not a chevron. Take a screenshot named `pass-1-task-1.png` and inspect.

- [ ] **Step 4: Delete the verification screenshot**

Remove `pass-1-task-1.png` per screenshot cleanup rule.

- [ ] **Step 5: Commit**

```bash
git add scoreboard.html
git commit -m "$(cat <<'EOF'
fix(scoreboard): highlight trend uses rising arrow, not chevron

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Hide Weekly Trend sparkline when sparse data

**Files:**
- Modify: `scoreboard.html:597-613`

When fewer than 2 of 4 weeks have real data, every bar collapses to ~4% height (the `Math.max(pct, 4)` floor) and the section reads as broken.

- [ ] **Step 1: Locate the Weekly Trend block**

In [scoreboard.html](../../../scoreboard.html) inside `openDrilldown()`, find:
```js
// Weekly trend sparkline
html += renderSectionHead('Weekly Trend');
html += `<div class="sb-sparkline sb-sparkline--labeled">`;
const sparkFull = ['3 wks ago', '2 wks ago', 'Last wk', 'This wk'];
const sparkShort = ['-3w', '-2w', 'Last', 'Now'];
for (let i = 0; i < history.length; i++) {
  ...
}
html += `</div>`;
```

- [ ] **Step 2: Wrap the block in a sparse-data guard**

Replace the block with:
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

- [ ] **Step 3: Verify in Playwright**

Open `http://localhost:8080/scoreboard.html`, click any hero card to open drilldown.

- If the family has < 2 weeks of snapshot history (typical dev case): Weekly Trend section should be absent entirely. Streak section now follows Category Breakdown directly.
- If the family has ≥ 2 weeks: section renders as before.

Take `pass-1-task-2.png` of the drilldown to verify. Delete after.

- [ ] **Step 4: Commit**

```bash
git add scoreboard.html
git commit -m "$(cat <<'EOF'
fix(scoreboard): hide weekly trend sparkline when sparse data

Sparkline collapsed to invisible 4% bars when fewer than 2 weeks
had data. Hide the section entirely until enough history exists.
Replaced by 90-day heatmap in Pass 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Hero card empty state — "No tasks today"

**Files:**
- Modify: `shared/components.js:1858-1882` (`renderScoreCard`)
- Modify: `styles/scoreboard.css` (add `card--score__empty`)

When `active.possible === 0` on the Today tab, the card currently shows "0%" + a `--` badge that reads as failure.

- [ ] **Step 1: Update `renderScoreCard` to branch on empty state**

In [shared/components.js](../../../shared/components.js), replace the current `renderScoreCard` function (lines 1858-1882) with:

```js
export function renderScoreCard(b, active, gd, liveBalance, badgeIcons) {
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

  return `<button class="card card--score" data-person-id="${esc(b.person.id)}" type="button" style="--owner-color: ${esc(b.person.color)}">
    <div class="card__leading">
      ${renderPersonAvatar(b.person, { size: 'md' })}
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

- [ ] **Step 2: Add the empty-state style**

In [styles/scoreboard.css](../../../styles/scoreboard.css), add at the end of the file (after the existing `.sb-cat-pct` rule):

```css
/* ── Hero card empty state ── */
.card--score__empty {
  font-size: var(--font-xs);
  color: var(--text-faint);
  text-align: right;
  line-height: 1.2;
}
```

- [ ] **Step 3: Verify in Playwright**

In Playwright, find a person who has no tasks today. Two ways to confirm:
1. Switch to the Today tab on `http://localhost:8080/scoreboard.html`. Any person with `td.possible === 0` should show "No tasks today" in the trailing slot instead of `--` and `0%`.
2. If everyone has tasks today, manually test by opening DevTools, finding their score card, and inspecting that the empty path renders.

Take `pass-1-task-3.png`. Delete after.

- [ ] **Step 4: Bump service worker cache**

In [sw.js](../../../sw.js), bump `CACHE_NAME` (existing convention in CLAUDE.md). Find the current cache version line and increment it.

- [ ] **Step 5: Commit**

```bash
git add shared/components.js styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
fix(scoreboard): hero card shows 'No tasks today' when empty

Replaces misleading 0% / -- treatment that read as failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Remove the Balances section

**Files:**
- Modify: `scoreboard.html:447-462`
- Modify: `scoreboard.html` (bindEvents — remove balance-row click handler)
- Modify: `styles/scoreboard.css` — delete `.sb-balances`, `.sb-balance-row`, `.sb-balance-row__right`, `.sb-balance-row__pts`, `.sb-balance-row__delta` (lines 63-108 of scoreboard.css)

Hero card already shows points balance. Balances section is pure duplication. Gone.

- [ ] **Step 1: Remove the Balances render block**

In [scoreboard.html](../../../scoreboard.html), find and delete the entire block starting with `// ── Balance summary` and ending with the closing `</div>` of `sb-balances`:

```js
// ── Balance summary — one tappable row per person linking to rewards.html ──
const chevron = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
html += renderSectionHead('Balances');
html += `<div class="card sb-balances">`;
for (const b of board) {
  html += `<button class="list-row sb-balance-row" type="button" data-href="rewards.html?person=${encodeURIComponent(b.person.name)}">
    ${renderPersonAvatar(b.person, { size: 'md' })}
    <span class="list-row__label">${esc(b.person.name)}</span>
    <div class="sb-balance-row__right">
      <span class="sb-balance-row__pts">${b.liveBalance.toLocaleString()} pts</span>
      ${b.week.earned > 0 ? `<span class="sb-balance-row__delta">+${b.week.earned} this wk</span>` : ''}
    </div>
    <span class="list-row__trailing">${chevron}</span>
  </button>`;
}
html += `</div>`;
```

Delete all of it.

- [ ] **Step 2: Remove the balance-row click handler**

In the same file, find inside `bindEvents()`:

```js
// Balance rows — navigate to rewards.html for that person
for (const row of document.querySelectorAll('.sb-balance-row[data-href]')) {
  row.addEventListener('click', () => { location.href = row.dataset.href; });
}
```

Delete this block.

- [ ] **Step 3: Remove the dead CSS**

In [styles/scoreboard.css](../../../styles/scoreboard.css), find and delete the section:

```css
/* ── Balance summary rows ── */
.sb-balances {
  display: block;
  padding: 0;
  overflow: hidden;
  margin-bottom: var(--spacing-lg);
  min-height: 0;
}

.sb-balance-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  border-bottom: 1px solid var(--border);
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background var(--t-fast);
}

.sb-balance-row:last-child { border-bottom: none; }
.sb-balance-row:hover { background: var(--surface-2); }

.sb-balance-row__right {
  margin-left: auto;
  text-align: right;
}

.sb-balance-row__pts {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.sb-balance-row__delta {
  display: block;
  font-size: var(--font-xs);
  color: var(--success);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Verify in Playwright**

Reload `http://localhost:8080/scoreboard.html`. Scroll down. The page should now end after "All Grades" (which we remove in Task 5, but for now still present) — no Balances section.

No new console errors. No broken layout where Balances used to be.

Take `pass-1-task-4.png`. Delete after.

- [ ] **Step 5: Commit**

```bash
git add scoreboard.html styles/scoreboard.css
git commit -m "$(cat <<'EOF'
refactor(scoreboard): remove redundant Balances section

Hero cards already show points balance. Pass 2 will add a tappable
balance zone on the hero card itself for the rewards link.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Remove the All Grades section

**Files:**
- Modify: `scoreboard.html:419-445`
- Modify: `styles/scoreboard.css` — delete `.grades-card`, `.grades-header`, `.grades-row`, `.grades-cell`, `.grades-cell--name` (lines 5-46 of scoreboard.css)

The 5-column-by-N-row table is low-signal — hero cards already show the active-period grade. Pass 2 introduces period-cycling on hero cards as the replacement for "compare periods" use case.

- [ ] **Step 1: Remove the All Grades render block**

In [scoreboard.html](../../../scoreboard.html), find and delete:

```js
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
      <span class="sb-mini-dot" style="--person-color: ${esc(b.person.color)}; background: var(--person-color)"></span>
      ${esc(b.person.name)}
    </span>
    <span class="grades-cell">${renderGradeBadge(tdG.grade, tdG.tier)}</span>
    <span class="grades-cell">${renderGradeBadge(wkG.grade, wkG.tier)}</span>
    <span class="grades-cell">${renderGradeBadge(moG.grade, moG.tier)}</span>
    <span class="grades-cell">${renderGradeBadge(yrG.grade, yrG.tier)}</span>
  </div>`;
}
html += `</div>`;
```

Delete all of it.

- [ ] **Step 2: Check whether `renderGradeBadge` import is still needed**

After this deletion, scan [scoreboard.html](../../../scoreboard.html) for other usages of `renderGradeBadge`. Grep:

Run: `grep -n "renderGradeBadge" scoreboard.html`

If zero remaining uses, remove `renderGradeBadge` from the import statement at the top of the script (line 43). If usages remain (drilldown summary still uses `grade-badge` HTML directly, not the helper), leave the import — verify with grep first.

- [ ] **Step 3: Remove the dead CSS**

In [styles/scoreboard.css](../../../styles/scoreboard.css), find and delete:

```css
/* ── Grades table (inside .card.grades-card) ── */
.grades-card {
  padding: 0;
  overflow: hidden;
  display: block;
  margin-bottom: var(--spacing-lg);
  min-height: 0;
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
```

Leave `.sb-mini-dot` — used by Category Leaders too.

- [ ] **Step 4: Verify in Playwright**

Reload `http://localhost:8080/scoreboard.html`. After Highlights and Category Leaders, the page should end — no All Grades table, no Balances. Just bottom nav.

Page should be substantially shorter — confirm by scrolling to bottom.

Take `pass-1-task-5.png` viewport + `pass-1-task-5-full.png` (fullPage: true). Compare against baseline.

Delete both after.

- [ ] **Step 5: Commit**

```bash
git add scoreboard.html styles/scoreboard.css
git commit -m "$(cat <<'EOF'
refactor(scoreboard): remove All Grades table

Low-signal — hero cards already show the active-period grade.
Pass 2 will add period-cycling on hero cards (tap grade badge to
flip Today/Week/Month/Year) as the replacement for cross-period
comparison.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification + push

- [ ] **Step 1: Full page screenshot diff**

Take a fresh main-page screenshot at 412×915:
- `pass-1-final-top.png` — viewport
- `pass-1-final-full.png` — fullPage true

Compare side-by-side with the baselines from Task 0. Confirm:
- Hero leaderboard cards unchanged in style (only empty-state condition added)
- Highlights section: same except up-arrow now rises diagonally
- Category Leaders section: unchanged
- No Balances section
- No All Grades section
- Page is roughly 30-40% shorter

- [ ] **Step 2: Drilldown screenshot diff**

Click a hero card to open the drilldown. Take `pass-1-final-drilldown.png` (fullPage true). Compare to baseline drilldown:
- If family has < 2 weeks of history: Weekly Trend section absent (was present-but-empty before)
- If family has ≥ 2 weeks: section present and bars visible (unchanged from before)
- Streak / Balance / Needs Attention sections unchanged

- [ ] **Step 3: Console error check**

Run `list_console_messages` — expect 0 new errors compared to baseline.

- [ ] **Step 4: Delete all verification screenshots**

Remove every `pass-1-*.png` file per screenshot cleanup rule.

- [ ] **Step 5: Push to main**

```bash
git push origin main
```

Cloudflare Pages will auto-deploy.

- [ ] **Step 6: Update spec**

Append a "Pass 1 — Shipped" line to [docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md](../specs/2026-05-12-scoreboard-rebuild.md) under the Pass 1 section header. Note the commit SHAs.

---

## Self-review checklist

Before declaring Pass 1 done:

1. **Spec coverage:** Each of the 4 Pass 1 bugs (1.1, 1.2, 1.4) and 2 cuts (1.5, 1.6) has a task. ✓ (1.3 "12 Mo → Year" is moot once Task 5 removes the table — confirmed in spec.)
2. **Placeholders:** No "TBD", no "add error handling", no "similar to above" — every step shows the exact code change. ✓
3. **Type consistency:** `renderScoreCard` signature unchanged (same 5 args); CSS class deletions limited to dead classes. ✓
4. **Commit hygiene:** 5 commits + push; each commit independently revertable. ✓
5. **Service worker:** Only Task 3 touches a JS file with browser caching implications (`shared/components.js`); bumped in Task 3 Step 4. ✓

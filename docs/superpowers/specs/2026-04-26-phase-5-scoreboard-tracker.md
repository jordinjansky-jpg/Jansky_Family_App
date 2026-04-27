# Phase 5 — Scoreboard & Tracker Redesign Spec

**Date:** 2026-04-26
**Status:** Approved for implementation
**Phase plan:** See `docs/superpowers/plans/2026-04-26-phase-5-scoreboard-tracker.md` (created by writing-plans)
**Design system:** `docs/DESIGN.md`
**Approach:** Option B — Hero + Drilldown. Full rework of both pages: retire all bespoke `sb-*`/`tracker-*` component classes, replace with shared `.card`/`.tabs`/`renderSectionHead()` patterns, restructure scoreboard information hierarchy, enrich drilldown sheet, consolidate tracker filters into a single chip+sheet.

---

## 1. Goals

1. **One component language.** Both pages use the same `.card`, `.tabs`, `renderSectionHead()`, status chips, and filter patterns as the dashboard. No bespoke page-specific component classes survive (exception: utility classes for sparklines and status badges that have no shared equivalent).
2. **Scoreboard: hero → drilldown.** The main page answers "how are we doing?" in one glance. Deep data (trends, category breakdown, balance, streaks) lives in the per-person drilldown sheet where it has context and room.
3. **Tracker: one filter, not two selects.** Category + status collapse into a single Filter chip that opens a bottom sheet.
4. **Visual parity with dashboard.** Same card density, same section head style, same done-card treatment (mute, no strikethrough), same overdue treatment.
5. **Phase 6 slot reserved.** The Store CTA row on the scoreboard is a named placeholder that Phase 6 replaces with the unified Rewards Store.

---

## 2. What is removed

These sections are deleted from the scoreboard main page and their data moves into the per-person drilldown sheet:

| Removed from main page | Moves to |
|---|---|
| Weekly Trends sparklines section | Drilldown sheet |
| Category Breakdown section | Drilldown sheet |
| Balance Trends sparklines section | Drilldown sheet |
| Streaks section | Drilldown sheet (+ lightly in card meta row) |

These patterns are retired from the CSS:

| File | Retired classes |
|---|---|
| `styles/scoreboard.css` | `.sb-period-tabs`, `.sb-tab`, `.sb-tab--active`, `.sb-tab--store`, `.sb-cards`, `.sb-section-label`, `.sb-trends`, `.sb-trend-row`, `.sb-trend-name`, `.sb-categories`, `.sb-cat-person`, `.sb-cat-person-name`, `.sb-cat-bars`, `.sb-streaks`, `.sb-streak-row`, `.sb-streak-name`, `.sb-streak-vals` |
| `styles/tracker.css` | `.tracker-tabs`, `.tracker-tab`, `.tracker-tab--active`, `.tracker-row`, `.tracker-row--overdue`, `.tracker-row--done`, `.tracker-row__initial`, `.tracker-row__info`, `.tracker-row__name`, `.tracker-row__meta`, `.tracker-row__right`, `.tracker-row__completed`, `.tracker-select` |

---

## 3. Shared component additions

Both pages require additions to `shared/components.js` and `styles/components.css`. These additions are reusable across all pages.

### 3.1 `.card--score` variant

New variant of `.card` for the scoreboard leaderboard card. Adds a left person-color stripe.

**CSS (styles/components.css):**
```css
.card--score {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-left: 4px solid var(--person-color, var(--accent));
  cursor: pointer;
  min-height: 64px;
}
.card--score:active { transform: scale(0.98); }

.card--score__avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--font-md);
  color: #fff;
  flex-shrink: 0;
}

.card--score__body {
  flex: 1;
  min-width: 0;
}

.card--score__name {
  display: block;
  font-weight: 600;
  font-size: var(--font-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card--score__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-xs);
  color: var(--text-faint);
  margin-top: 2px;
}

.card--score__trailing {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.card--score__pct {
  font-size: var(--font-sm);
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
```

### 3.2 Filter chip (`renderFilterChip`)

Already exists on the dashboard as `renderFilterChip`. No new component needed — reuse the existing pattern. The tracker will render one filter chip per the existing implementation.

### 3.3 Filter sheet for tracker

A new `renderTrackerFilterSheet(cats, activeCategory, activeStatus)` render function in `shared/components.js`. Returns a bottom sheet containing:
- **Category** section: chip group listing all categories + "All" default
- **Status** section: chip group with All · Done · Late · Overdue · Upcoming · Cooldown · Skipped
- **Actions**: "Clear" (ghost) + "Apply" (primary) buttons

---

## 4. Scoreboard redesign

### 4.1 Page structure

```
Header (app name · subtitle "Scoreboard" · date · bell · overflow)
Banner slot
─────────────────────────────────────
Period tabs          [Today][Week][Month][12 Mo]
─────────────────────────────────────
Grade cards          one .card--score per person, sorted desc by selected period
─────────────────────────────────────
Section head         ALL GRADES
Grades table         .card surface, list-group rows inside
─────────────────────────────────────
Store CTA row        .list-group__row · "Rewards Store" · total balance · chevron
─────────────────────────────────────
Nav bar
```

### 4.2 Period tabs

Replace `.sb-period-tabs` / `.sb-tab` with the shared tabs component:

```html
<nav class="tabs tabs--segmented">
  <button class="tab is-active" data-period="today">Today</button>
  <button class="tab" data-period="week">Week</button>
  <button class="tab" data-period="month">Month</button>
  <button class="tab" data-period="year">12 Mo</button>
</nav>
```

CSS class: `tabs--segmented` (pill background, active item gets `--surface` lift + `--shadow-sm`). This is the same segmented control used in the tracker view switcher and admin forms.

### 4.3 Grade cards (hero leaderboard)

One `.card.card--score` per person, rendered inside a `<div class="card-stack">` (flex column, `gap: --spacing-sm`). Sorted by selected period grade descending — position implies rank, no number needed.

**Card layout (single row):**
```
[stripe] [avatar] [name          ] [grade-badge · pct%]
                  [meta: streak · balance · trend     ]
```

- **Left stripe:** `border-left: 4px solid var(--person-color)`
- **Avatar:** 36×36 circle, person color bg, white initial letter
- **Name:** `--font-md`, weight 600, truncated
- **Meta row** (below name): `--font-xs`, `--text-faint`
  - 🔥 Nd streak — hidden when `streak.current === 0`
  - 💰 N balance — always shown (shows 0 if none)
  - ↑ or ↓ trend — hidden when no prior-week data
  - Items separated by `·` dot with `--spacing-sm` gap
- **Trailing** (same line as name): `grade-badge grade-badge--{tier}` then `·` then percentage in `--font-sm --text-faint`. Both on one line, no stacking.

**Interaction:**
- Single `click` event opens drilldown sheet. No long-press timer needed — there is no competing tap action on this card (no completion toggle), so a plain click is correct and simpler.
- Active press: `transform: scale(0.98)` via `--t-fast`

### 4.4 All Grades table

Replace custom `.sb-grades-table` with a `.card` surface wrapping a list-group:

```html
<div class="card" style="padding: 0; overflow: hidden;">
  <div class="grades-header"><!-- col labels --></div>
  <div class="grades-row"><!-- per person --></div>
</div>
```

**CSS (scoreboard.css — keep, renamed):**
```css
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

Person dot (`.sb-mini-dot`) is retained — it's a utility class, not a bespoke component.

### 4.5 Store CTA row

A single tappable row below the grades table that reserves the slot Phase 6 will replace with the unified Rewards Store. For now it opens the existing store picker.

```html
<button class="store-cta-row" type="button">
  <svg ...><!-- gift icon --></svg>
  <span class="store-cta-row__label">Rewards Store</span>
  <span class="store-cta-row__balance">💰 {totalBalance} pts</span>
  <svg ...><!-- chevron right --></svg>
</button>
```

```css
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
}
.store-cta-row__label { flex: 1; font-size: var(--font-sm); font-weight: 500; }
.store-cta-row__balance { font-size: var(--font-xs); color: var(--accent); font-weight: 600; }
```

`totalBalance` = sum of all person balances (gives parents a family-wide view at a glance).

### 4.6 Per-person drilldown sheet (enriched)

The drilldown now shows everything that used to live as separate main-page sections, scoped to the selected person + period.

**Sheet sections (in order):**

```
● Jordan  —  This Week
─────────────────────────────────────
  [A+]  186 / 200 pts  ·  93%          ← summary row
─────────────────────────────────────
CATEGORY BREAKDOWN
  🧹 Cleaning   ████████░  91%
  🍽 Kitchen    ██████░░░  72%

WEEKLY TREND  (last 4 weeks)
  2 wks ago  Last wk   This wk
  [▄]        [▆]       [█]             ← sparkline bars with labels

STREAK
  🔥 5-day current  ·  ⭐ 12-day best

BALANCE
  💰 340 pts
  [▃][▄][▅][▆][▆][▇][█]  7-day        ← mini sparkline

TASKS — This Week
  ─ Missed (1) ──────────────────────
  [task rows]
  ─ Late (0) ─────────────────────── (hidden if 0)
  ─ Pending (2) ──────────────────────
  [task rows]
  ─ Done (14) ────────────────────────
  [task rows]
```

**Task rows in drilldown** use a compact list format (not full `.card`):
```
  Category-icon  Task name         Apr 26  18/20pts
```
`font-size: --font-sm`, `border-bottom: 1px solid --border`, no card chrome — these are detail rows, not primary content.

**Section heads inside drilldown** use `renderSectionHead()` — same muted uppercase label pattern.

**Sparklines** retain `sb-sparkline`, `sb-spark-bar`, `sb-spark-fill--{tier}` utility classes. These have no shared equivalent and are not bespoke component classes — they're fine to keep.

---

## 5. Tracker redesign

### 5.1 Page structure

```
Header (app name · subtitle "Tracker" · date · bell · overflow)
Banner slot
─────────────────────────────────────
View tabs            [Weekly] [Monthly]
Period nav           ‹ Apr 21 – Apr 27 › · Today
Person filter        [All] [Jordan] [Noah]
Filter chip          [⧉ Filter]  or  [⧉ Filter · 2]
─────────────────────────────────────
Summary strip        progress bar + count chips
─────────────────────────────────────
Task cards           .card rows
                     (monthly: grouped by week under section heads)
─────────────────────────────────────
Nav bar
```

### 5.2 View tabs

Replace `.tracker-tabs` / `.tracker-tab` with shared tabs:

```html
<nav class="tabs tabs--segmented">
  <button class="tab is-active" data-view="weekly">Weekly</button>
  <button class="tab" data-view="monthly">Monthly</button>
</nav>
```

### 5.3 Period nav

Keep existing `.tracker-period` / `.tracker-period__row` / `.tracker-period__nav` / `.tracker-period__today` CSS — it's solid, correct tap targets, and not a bespoke component class. No change needed.

### 5.4 Person filter

Keep existing `renderPersonFilter()` output — unchanged.

### 5.5 Filter chip + sheet

Replace the two `<select>` dropdowns with a single filter chip:

```html
<button class="chip chip--filter" id="trackerFilterChip" type="button">
  <svg ...><!-- sliders icon --></svg>
  Filter{activeCount > 0 ? ` · ${activeCount}` : ''}
</button>
```

**Active state** (when any filter set): chip gets `chip--filter--active` which adds accent border + fills a small colored dot before the label.

**Filter sheet** (opens on chip tap):

```
─ Filters ──────────────────────────── (sheet title)

Category
[All] [🧹 Cleaning] [🍽 Kitchen] [📚 School] ...

Status
[All] [Done] [Late] [Overdue] [Upcoming] [Cooldown] [Skipped]

[Clear all]                               [Apply]
```

Category chips: scrollable row if many. Status chips: wrap to 2 rows if needed. "Apply" fires a re-render. "Clear all" resets both filters + closes sheet.

**CSS (styles/tracker.css):**
```css
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
}
.chip--filter--active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
```

### 5.6 Summary strip

Moves to immediately below the filter chip, above the task cards.

```html
<div class="tracker-summary">
  <div class="tracker-summary__bar">
    <div class="tracker-summary__fill" style="width:{pct}%"></div>
  </div>
  <div class="tracker-summary__chips">
    <!-- only render non-zero statuses -->
    <span class="chip chip--done">{n} Done</span>
    <span class="chip chip--late">{n} Late</span>
    <span class="chip chip--overdue">{n} Overdue</span>
    <span class="chip chip--upcoming">{n} Upcoming</span>
  </div>
</div>
```

Summary chips use semantic colors (success/warning/danger/faint) — not new classes, the existing `.tracker-summary__count--{status}` colors are retained on the chip text.

### 5.7 Task rows

Replace `.tracker-row` with `.card`:

```html
<article class="card card--tracker" data-entry-key="{key}" data-date-key="{date}">
  <div class="card__leading">
    <span class="person-dot" style="background: {color}">{initial}</span>
  </div>
  <div class="card__body">
    <div class="card__title">{catIcon} {taskName}</div>
    <div class="card__meta">{ownerName} · {dateLabel}</div>
  </div>
  <div class="card__trailing">
    {renderStatusBadge(status)}
  </div>
</article>
```

**Card variants / modifiers:**
- **Done/Late:** `card--done` modifier — pre-existing in `components.css` at `opacity: 0.75`, muted title color, no strikethrough. Consistent with dashboard completed cards.
- **Overdue:** `card--overdue` modifier — `border-left: 3px solid var(--danger)`, `background: var(--danger-soft)`.
- **Skipped/Cooldown:** no modifier — default card with appropriate status badge.

**Person dot** (`.person-dot`): 28×28 circle, person color, white initial, `--font-xs` weight 700. This is a utility class reusable across pages — add to `styles/components.css` if not already present.

**CSS additions (styles/components.css):**
```css
.person-dot {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-xs);
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.card--tracker {
  padding: var(--spacing-sm) var(--spacing-md);
  min-height: 56px;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}

.card--overdue {
  border-left: 3px solid var(--danger);
  background: var(--danger-soft);
}
```

**Interaction:** Long-press (500ms) → task detail sheet (existing behavior, unchanged).

### 5.8 Monthly view section heads

Replace `.tracker-week-group` / `.tracker-week-label` with `renderSectionHead()`:

```js
const tagHtml = isCurrent
  ? `<span class="tracker-week-current-tag">This Week</span>`
  : '';
renderSectionHead(weekLabel, null, { trailingHtml: tagHtml })
```

`renderSectionHead` accepts `options.trailingHtml` for a trailing element. The "This Week" accent tag uses the existing `.tracker-week-current-tag` class (kept in `tracker.css` — it's a utility class, not a bespoke component). Current-week group retains the visual accent but now uses the shared section head component instead of the bespoke `.tracker-week-label` pattern.

**Keep:** `.tracker-week-group--current` border accent (`border-left: 3px solid --accent`) — this is a page-level layout modifier, not a component class.

### 5.9 Status badges

Retain `.tracker-status` and `.tracker-status--{state}` — these are utility classes for status pills, not bespoke component classes. They survive Phase 5 and can be shared with other pages if needed in future.

---

## 6. Inline style audit

Both pages have inline styles that must be removed in this phase.

**scoreboard.html (store sheet):** Multiple `style="..."` on the store picker person buttons, store card dates, store header avatar, saved section header, pending section header. Move to named classes in `scoreboard.css`.

**tracker.html:** Minor inline styles on period nav and filter area — all token-driven once the selects are replaced.

After this phase, `grep 'style="'` in `scoreboard.html` and `tracker.html` should return 0 matches outside of dynamic CSS custom property bindings (e.g. `style="--person-color: {color}"`).

---

## 7. Exit criteria

- [ ] No `.sb-period-tabs`, `.sb-tab`, `.sb-cards`, `.sb-card`, `.sb-section-label`, `.sb-trends`, `.sb-categories`, `.sb-streaks` classes remain in `scoreboard.css` or `scoreboard.html`.
- [ ] No `.tracker-tabs`, `.tracker-tab`, `.tracker-row` classes remain in `tracker.css` or `tracker.html`.
- [ ] Scoreboard main page shows: period tabs + grade cards + grades table + store CTA. No sparklines, category bars, or streak rows on the main page.
- [ ] Drilldown sheet shows: summary stats + category breakdown + trend sparkline + streak + balance + task list grouped by status.
- [ ] Tracker shows a single Filter chip (not two selects). Tapping opens a sheet with category + status chip groups.
- [ ] Tracker done/late rows have no strikethrough — muted opacity only.
- [ ] Tracker overdue rows have danger left stripe + danger-soft background.
- [ ] Monthly view week group headers use `renderSectionHead()`.
- [ ] Grade card trailing shows grade + percentage on the same line (not stacked).
- [ ] `grep 'style="'` in both HTML files returns 0 (excluding `style="--person-color: ..."` and similar CSS custom property bindings).
- [ ] No raw hex in `scoreboard.css` or `tracker.css`.
- [ ] All tap targets ≥ 44×44. Verified at 375px.
- [ ] Tested in ≥ 2 themes (light + dark). No color token escapes.
- [ ] SW cache bumped.

---

## 8. Files touched

| File | Change |
|---|---|
| `scoreboard.html` | Full render rewrite (grade cards, grades table, store CTA, drilldown sheet); period tabs → shared; inline styles removed |
| `tracker.html` | View tabs → shared; filter dropdowns → chip + sheet; rows → `.card`; section heads → `renderSectionHead()` |
| `styles/scoreboard.css` | Retire bespoke sb-* classes; add `.grades-header`, `.grades-row`, `.grades-cell`, `.store-cta-row`; keep sparkline utilities |
| `styles/tracker.css` | Retire `.tracker-tabs`, `.tracker-tab`, `.tracker-row` and sub-classes; add `.chip--filter`, `.chip--filter--active`, `.card--tracker`, `.card--overdue`; keep `.tracker-status`, `.tracker-period`, `.tracker-summary` |
| `styles/components.css` | Add `.card--score` and sub-classes; add `.person-dot`; `.card--done` already exists (no change needed) |
| `shared/components.js` | Add `renderTrackerFilterSheet()`; add `renderScoreCard()` helper; ensure `renderSectionHead()` supports optional tag parameter |
| `sw.js` | Bump `CACHE_NAME` |

---

## 9. Not in scope

- Phase 6 Rewards Store unification (the store CTA row is a placeholder).
- Phase 4 Kid mode changes.
- Tablet two-pane layout (Phase 7).
- Scoreboard achievement strip (exists in Phase 6 spec, deferred).
- Any new scoring or data model changes.

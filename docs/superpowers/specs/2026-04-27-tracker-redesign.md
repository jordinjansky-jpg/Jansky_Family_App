# Tracker Redesign — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Goal

Reduce top chrome from 4 rows to 2, add inline tap-to-complete, replace nav arrows with swipe, restructure weekly view into named status sections, and make the monthly view a compact always-expanded week-grouped accountability board.

---

## 1. Top Chrome (4 rows → 2)

### Row 1: Period bar
- **Left:** Period label — "Mon, Apr 27 – Sun, May 3" (weekly) or "April 2026" (monthly)
- **Right:** Compact Weekly/Monthly segmented toggle — roughly half the current width, not full-bleed. Uses existing `.tabs.tabs--segmented` component but constrained to `width: fit-content` and floated/flex-end right.
- No nav arrows. No "Today" button. Tab switch already snaps to today; swipe handles navigation.

### Row 2: Filter bar
- Person pills (`renderPersonFilter`) + Filter chip (`#trackerFilterChip`) — same as current but tighter vertical padding.

### Removed
- Full-width segmented tab control (replaced by compact right-aligned toggle in row 1)
- `← period label →` nav row (replaced by swipe)
- "Today" button
- Standalone summary bar (`tracker-summary`)

---

## 2. Swipe Navigation

Horizontal swipe on the page body shifts the period — left swipe = next period, right swipe = previous period. Same `touchstart`/`touchend` pattern as dashboard (50px threshold, not triggered during vertical scroll). Replaces the `← →` buttons entirely.

---

## 3. Weekly View

### Per-person summary (when filter active)
When `activePerson` is set, a single muted line appears between the filter bar and the first section:
```
Jordin · 3/8 done this week
```
Uses `.tracker-person-summary` class. Hidden when `activePerson` is null.

### Status sections (replaces flat sorted list)
Four named sections, each using `renderSectionHead(label, meta)`. Sections only render when they have rows.

| Section | Head color | Count in meta | Card class |
|---------|-----------|--------------|------------|
| Overdue | `var(--danger)` | "Overdue · 3" | `card--overdue` |
| Upcoming | default | "Upcoming · 15" | — |
| Done | muted | "Done · 2" | `card--done` |
| Skipped | muted | "Skipped · 1" | `card--done` (muted) |

Cooldown tasks fold into the Skipped section.

Cards within each section use `.card-stack` (no gaps between adjacent cards). The section heads provide all the visual separation needed.

### Interaction
- **Tap** = toggle complete/incomplete (same as dashboard). Past-date tasks trigger the late-penalty slider sheet (same `pastDueCreditPct` flow). Skipped/cooldown cards are not tappable.
- **Long-press (500ms)** = task detail sheet (unchanged).
- No changes to `openTaskSheet`.

---

## 4. Monthly View

### Always-expanded week groups
Monthly tasks grouped by the week they fall in, always expanded — no collapse/expand interaction. Four or five week groups per month.

### Week group section head
```
renderSectionHead('Week of Apr 28', '2/3 done')
```
- Meta text ("2/3 done") is `var(--text-muted)` normally; `var(--danger)` when any task in the group is overdue.
- "This Week" tag on the current week (existing `.tracker-week-current-tag` retained).

### Cards
- Same `card--tracker` shape as weekly view.
- `card--overdue` applied to overdue cards within a week group — no separate overdue section needed since the week head ratio already surfaces it.
- `.card-stack` within each week group (no gaps).

### Per-person summary (when filter active)
Same pattern as weekly: "Jordin · 1/4 done this month" between filter bar and first week group.

### Interaction
Same tap-to-complete and long-press behavior as weekly view.

---

## 5. Empty States

- Weekly, no tasks: `renderEmptyState('No weekly tasks', 'Nothing scheduled for this period.')`
- Monthly, no tasks: `renderEmptyState('No monthly tasks', 'Nothing scheduled for this period.')`
- Filtered to zero results: `renderEmptyState('No matches', 'Try clearing the filters.')`
- Emoji removed from empty state calls (system chrome rule).

---

## 6. CSS Changes (`styles/tracker.css`)

### Remove
- `.tracker-summary`, `.tracker-summary__bar`, `.tracker-summary__fill`, `.tracker-summary__counts`, `.tracker-summary__count--*`
- `.tracker-period`, `.tracker-period__row`, `.tracker-period__nav`, `.tracker-period__today`, `.tracker-period__label`

### Add
- `.tracker-top-bar` — flex row, `align-items: center`, `justify-content: space-between`, `margin-bottom: var(--spacing-sm)`. Wraps period label + compact toggle.
- `.tracker-period-label` — `font-size: var(--font-sm); font-weight: 600; color: var(--text-body)`.
- `.tracker-person-summary` — `font-size: var(--font-sm); color: var(--text-muted); padding: var(--spacing-xs) 0 var(--spacing-sm)`.
- `.tracker-section--overdue` — wrapper div around the overdue section. CSS descendant selector (`.tracker-section--overdue .section-head__label`) colors the section head label `var(--danger)`. No changes to `renderSectionHead` needed.

### Modify
- `.tracker-filter-area` — reduce `padding-top` to `var(--spacing-xs)` (was `var(--spacing-sm)`).
- `.tabs.tabs--segmented` inside `.tracker-top-bar` — `width: fit-content; min-width: 140px`.

### Retain (unchanged)
- `.tracker-content`, `.tracker-rows`, `.tracker-week-group`, `.tracker-week-group--current`, `.tracker-week-current-tag`, `.tracker-status--*`

---

## 7. Files to Change

| File | Change |
|------|--------|
| `tracker.html` | Rewrite `render()` — new top bar, remove period nav, add swipe handlers, rewrite `renderWeeklyView()` into sections, update `renderMonthlyView()` section heads + card-stack, add per-person summary, add tap-to-complete handler |
| `styles/tracker.css` | Remove period/summary classes, add `.tracker-top-bar`, `.tracker-period-label`, `.tracker-person-summary` |
| `sw.js` | Bump cache version |

No changes to `shared/components.js` or `shared/scoring.js`.

---

## 8. What Is Not Changing

- `openTaskSheet` (long-press detail sheet) — unchanged
- `openFilterSheet` — unchanged
- `collectRows`, `findSkippedTasks`, `filterRows`, `entryStatus` — unchanged
- Firebase data model — no schema changes
- Person filter pills shape — same component, tighter padding only
- Kiosk: tracker renders in the slide-out menu as a standard page, no special layout

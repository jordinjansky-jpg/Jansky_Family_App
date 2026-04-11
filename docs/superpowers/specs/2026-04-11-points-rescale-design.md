# Points System Rescale & Configurable Difficulty

**Status:** Draft
**Date:** 2026-04-11

## Problem

The current points formula produces values too small for the scoring system to work as intended:

```
basePoints = round(difficultyMultiplier × (1 + estMin / 30))
```

With difficulty multipliers `{easy: 1, medium: 2, hard: 3}`, most short easy tasks round down to **1 point**. This causes three concrete problems:

1. **Late penalties don't bite.** `earnedPoints` rounds `base × (pointsOverride / 100)`. For a 1-point task, `round(1 × 0.75) = 1` and `round(1 × 0.50) = 1` — 75% and 50% late penalties both have zero effect. Parents can adjust the slider all day and the grade won't move.
2. **Easy-task compression.** A 5-minute, 10-minute, and 13-minute easy task all evaluate to 1 point. A 15-minute and 20-minute easy task both evaluate to 2. There is no gradient across the range where most daily tasks actually live.
3. **Tiny point pools amplify variance.** A kid with six dailies totalling ~8 possible points loses an entire letter grade from one missed 2-point task. Larger pools produce smoother, fairer grades.

The user wants the system to "just make sense" — meaningful differentiation across task sizes, late penalties that actually land, and grades that feel proportional to effort.

## Goals

- Base points differentiate clearly across all reasonable task sizes.
- Late penalties produce visible point reductions on every task, including the smallest.
- Difficulty multipliers are adjustable by family (per-household preference) without a schema migration.
- Historical scoring data continues to work with zero migration — no backfill, no rollback file.
- UI layouts are unaffected on any modern phone (360px+ viewport).

## Non-Goals

- Rebalancing the grade bands (A+ / A / A- thresholds). They stay as-is.
- Changing the weighted-category math (`ownerRegularPts × (W / (100 - W))`). It continues to work because weighted points scale with regular points.
- Changing how `pointsOverride` is stored or how the late-completion flow decides when to apply a penalty. Only the *effect* of the override changes, because the base it multiplies against is now large enough to matter.
- Adding a new points display format or currency (e.g., "coins", "stars"). Points remain integer points.

## Design

### New points formula

```js
// shared/scoring.js
const MIN_EST_MIN = 5;
const DEFAULT_DIFFICULTY_MULTIPLIERS = { easy: 1, medium: 2, hard: 3 };

export function basePoints(task, difficultyMultipliers) {
  const mults = difficultyMultipliers || DEFAULT_DIFFICULTY_MULTIPLIERS;
  const mult = mults[task.difficulty] ?? 1;
  const est = Math.max(task.estMin || 0, MIN_EST_MIN);
  return est * mult;
}
```

Key properties:
- `estMin` is floored at 5, so every task is worth at least `5 × difficultyMult` regardless of how short its estimate is.
- Both operands are integers, so `basePoints` returns an integer with no rounding.
- The default multipliers object is used when `settings.difficultyMultipliers` is absent, so existing families get correct behavior on first read after deploy with no settings write needed.

Example values with default multipliers `{1, 2, 3}`:

| Task | Est | Old `basePoints` | New `basePoints` |
|---|---|---|---|
| Easy, 5 min | 5 | 1 | **5** |
| Easy, 10 min | 10 | 1 | **10** |
| Easy, 15 min | 15 | 2 | **15** |
| Easy, 30 min | 30 | 2 | **30** |
| Medium, 15 min | 15 | 3 | **30** |
| Medium, 30 min | 30 | 4 | **60** |
| Hard, 60 min | 60 | 9 | **180** |
| Easy, 1 min | 1 | 1 | **5** (floored) |

Late penalty behavior with the new scale (default multipliers):

| Task | Base | 75% late | 50% late |
|---|---|---|---|
| Easy 5min | 5 | 4 (loses 1) | 3 (loses 2) |
| Easy 15min | 15 | 11 (loses 4) | 8 (loses 7) |
| Medium 30min | 60 | 45 (loses 15) | 30 (loses 30) |
| Hard 60min | 180 | 135 (loses 45) | 90 (loses 90) |

Every task, including the smallest, now experiences a visible penalty.

### Configurable difficulty multipliers

**Schema.** Add an optional field to the existing flat `rundown/settings` object:

```json
{
  "appName": "...",
  "familyName": "...",
  "timezone": "...",
  "weekendWeight": 1.0,
  "pastDueCreditPct": 75,
  "theme": { ... },
  "difficultyMultipliers": { "easy": 1, "medium": 2, "hard": 3 }
}
```

When absent, code uses `DEFAULT_DIFFICULTY_MULTIPLIERS`. No migration write is needed — the field is read-through with a fallback. Families who never touch the setting silently run on defaults forever.

**Plumbing.** Every call site of `basePoints(task)` becomes `basePoints(task, settings.difficultyMultipliers)`. Audit path:

- `shared/scoring.js` — `basePoints`, `dailyPossible`, `dailyScore`, `buildSnapshot`, and any internal helpers. `dailyPossible` already receives `categories` as a parameter; extend its signature to also accept `settings.difficultyMultipliers` (or the full settings object — decide in the plan based on consistency with other helpers).
- `dashboard.js`, `calendar.html`, `kid.html`, `tracker.html`, `scoreboard.html`, `admin.html` — any direct caller of `basePoints` from a page.
- Any admin form that previews a task's point value as the user types.

All of these already have `settings` loaded via `loadSettings()` / `onSettings()` listeners. Threading the multipliers through is a mechanical change, not an architectural one.

**Admin UI.** Add a new section to the **Settings** tab in `admin.html`, placed near `weekendWeight` and `pastDueCreditPct` since they're all scoring knobs.

Section layout:
```
Difficulty Multipliers
──────────────────────
Easy    [  1 ]
Medium  [  2 ]
Hard    [  3 ]
[Reset to defaults]
```

Validation:
- Each field accepts integers 1–10.
- Inline soft warning (not a hard block) if `easy > medium` or `medium > hard`: "Usually easy ≤ medium ≤ hard. Save anyway?" — confirm-and-save pattern rather than preventing save. Some families may deliberately want a non-monotonic curve and we shouldn't lock them out.
- Save writes to `rundown/settings.difficultyMultipliers` via the existing multi-update settings save flow. Other settings fields are unaffected.

**Live effect.** Changing multipliers does not mutate stored snapshots or completions. From the next render forward, open dashboard / calendar / kid mode recompute `basePoints` using the new multipliers. Historical snapshots already contain frozen `earned` / `possible` values, so past days show their original grades. Same behavior as editing `weekendWeight` today.

### No data migration

The critical property that makes this migration-free: `earned` and `possible` both scale by the exact same multiplier when the formula changes. For any given day:

```
oldPercentage = oldEarned / oldPossible
newPercentage = (oldEarned × k) / (oldPossible × k) = oldPercentage
```

Where `k` is the effective scaling factor for that day. Grades are percentage-driven, so they are identical before and after the change. `aggregateSnapshots` continues to work correctly across dates that straddle the deploy: a pre-rescale day with `8 / 10 = 80%` and a post-rescale day with `80 / 100 = 80%` aggregate to `88 / 110 = 80%`, still a B-.

The only cosmetic effect is that a scoreboard drilldown spanning the cutover shows noticeably smaller raw point totals on pre-rescale days than post-rescale days. The letter grades and percentages displayed are correct. This is accepted — it's a visual artifact of a rescaling event, not a bug, and it fades from view as historical days roll off the rolling windows.

**Explicitly not doing:**
- No backfill script to rewrite historical snapshots.
- No rollback flag or feature toggle.
- No versioned points schema. The snapshot structure is unchanged.

### UI changes

The meta-row character count difference is small enough (+1 to +2 characters worst case) that no layout changes are needed on task cards. The `.task-card__meta` row keeps its `white-space: nowrap` rule. On a 360px phone with typical padding, the row has ~300px of content width and the longest realistic string (`8:00 · 60m · 180pt`, 17 chars at `--font-size-xs` ≈ 11px) occupies roughly 110–120px. Headroom is ample.

**Actual CSS changes (narrow and targeted):**

1. **Scoreboard numeric columns** — add `font-variant-numeric: tabular-nums` to any class that displays a points value that can reach 4+ digits (weekly totals, monthly totals, category breakdown totals, drilldown task point cells). This prevents digit-width jitter when values change in place during re-render. Concrete classes to touch will be identified during implementation by grepping `scoreboard.html` + `styles/scoreboard.css` for point display sites.
2. **Detail sheet override slider** — `components.js` builds a live-earned label (`You'll earn: N pts`) that updates as the slider moves. Add `tabular-nums` and a `min-width` to that label so it doesn't reflow between `5pt` and `180pt`. The slider's endpoint labels get the same treatment.
3. **Dashboard "X / Y pts today" indicator** — add `tabular-nums` so the numerator doesn't jitter as completions toggle.
4. **No other CSS changes.** No flex-wrap, no nowrap removals, no responsive breakpoint adjustments. Cards, sheets, kid mode, tracker all keep their existing layouts.

**Manual verification step** (included in the implementation plan): after CSS changes are in, spot-check at 360px / 400px / 768px viewport widths in browser devtools on dashboard, calendar day sheet, kid mode, and scoreboard leaderboard. If any specific cell actually clips or overflows, fix that specific cell — but do not preemptively loosen layouts.

### Rollout order

1. Update `shared/scoring.js`: new `basePoints` signature, `MIN_EST_MIN` and `DEFAULT_DIFFICULTY_MULTIPLIERS` constants, thread `difficultyMultipliers` argument through `dailyPossible`, `dailyScore`, `buildSnapshot`.
2. Update every caller in the pages to pass `settings.difficultyMultipliers` when calling scoring functions.
3. Add admin Settings section for the three multiplier inputs with soft-warning validation and reset-to-defaults button.
4. Apply the targeted CSS changes (tabular-nums on scoreboard numbers, slider min-width).
5. Manually verify at 360/400/768 widths in the affected views.
6. Bump `CACHE_NAME` in `sw.js` so clients pick up the new JS/CSS.
7. Deploy (push to main, Cloudflare Pages auto-deploys).

## Gotchas

- **Every `basePoints` call site must be updated.** Missing one means that site keeps using default multipliers regardless of family settings — silent divergence between, say, the dashboard and the scoreboard for the same day. The audit must be exhaustive. Grep for `basePoints` across the repo before declaring the plumbing done.
- **`dailyPossible` owner-regular totals.** The weighted-category math reuses per-owner regular totals. If `basePoints` receives multipliers inconsistently inside this function, weighted categories can drift. The function must receive multipliers once and use them everywhere.
- **Admin form task preview.** If the admin task form previews a computed point value as the user edits difficulty or estMin, that preview must also thread the current settings multipliers. Otherwise parents editing tasks see wrong preview numbers even though stored scoring is correct.
- **Settings listener ordering.** Pages that load settings via `onSettings()` must wait for the first settings snapshot before computing points, or the first render will briefly use defaults. Check that existing render paths already await settings before calling scoring functions — this is how `weekendWeight` is handled today and should be the same.
- **Non-integer multiplier inputs.** Admin validation must coerce to integers. A multiplier of `2.5` would break the "integer points everywhere" invariant and produce rounded display artifacts. Force integer parsing with a reasonable range (1–10).
- **`basePoints` is currently called with a single argument.** Existing calls passing only `task` will evaluate `difficultyMultipliers` as `undefined` and fall back to defaults. This is the intended behavior for the fallback path, but it means a caller that *should* be passing multipliers but forgets to will silently use defaults. Consider a dev-time console warning if `settings.difficultyMultipliers` exists but wasn't passed — or, alternatively, make the argument required and accept the stricter contract. Decide in the plan.
- **Service worker cache.** The app's offline support depends on `CACHE_NAME` bumps whenever shared JS/CSS changes. Forgetting to bump means returning users get stale `scoring.js` for up to one refresh cycle, producing mixed-scale grades on their device until they hard-refresh.

## Testing Plan

There is no automated test suite in this project. Verification is manual and visual.

**Pre-deploy checks:**
1. Open dashboard for a person with a full day of tasks. Verify point totals display correctly (no `NaN`, no `undefined`, integer values).
2. Complete a task early, apply a late penalty via the slider, verify the earned delta is visibly non-zero on small tasks (test specifically: a 5-minute easy task, 75% slider → earned should drop from 5 to ~4).
3. Open scoreboard, verify daily/weekly/monthly grades match expectations. Aggregate a week that straddles the deploy cutover and verify percentage is consistent.
4. Open admin → Settings, change `hard` multiplier from 3 to 4. Save. Return to dashboard, verify hard tasks now show larger point values in cards and detail sheet.
5. Edit the `hard` multiplier to a non-integer or out-of-range value — confirm validation catches it.
6. Set `easy: 3, medium: 1, hard: 2` — confirm soft warning appears but save is still allowed.
7. Visual check at 360px, 400px, 768px viewports: dashboard cards, calendar day sheet, kid mode, scoreboard leaderboard, scoreboard drilldown. Nothing clips or overflows.

**Regression checks:**
- Exempt tasks continue to show no points (unchanged behavior).
- Event-category tasks continue to show no points (unchanged behavior).
- Weighted-category tasks produce sensible points that scale with owner regular totals (unchanged math, just larger inputs).
- Streaks still increment correctly on all-complete days.
- Historical snapshots (from before deploy) still produce correct period grades in weekly/monthly/12-month views.

## Open Questions

None. All knobs decided:
- `MIN_EST_MIN = 5`
- Default multipliers `{easy: 1, medium: 2, hard: 3}`
- Soft warning (not hard block) on non-monotonic multipliers
- No data migration
- `.task-card__meta` keeps `nowrap`, only tabular-nums added to specific numeric displays

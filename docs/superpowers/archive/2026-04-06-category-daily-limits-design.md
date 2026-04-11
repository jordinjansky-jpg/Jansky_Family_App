# Category-Level Daily Limits — Design Spec

**Date:** 2026-04-06
**Status:** Draft

## Summary

Add optional per-person and per-household daily minute caps to categories. The scheduler respects these limits when placing weekly, monthly, and one-time tasks — deferring tasks to other days in the period or skipping them if no day has room. Daily tasks are always placed regardless of limits.

## Schema

Two new optional fields on `rundown/categories/{pushId}`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dailyLimitPerPerson` | `number \| null` | `null` | Max estimated minutes per person per day for this category |
| `dailyLimitPerHousehold` | `number \| null` | `null` | Max estimated minutes total (all people) per day for this category |

No migration needed — `null`/missing means no limit. Both values are in minutes, matching the existing `estMin` field on tasks.

## Scheduler Changes

### New helper: `categoryDayLoad(categoryId, personId, dateKey, newSchedule, existingSchedule, tasks)`

Computes total `estMin` already placed for a category on a given day. Follows the same merge pattern as existing `personDayLoad` and `totalDayLoad` — reads from both `newSchedule` and `existingSchedule`, deduplicates by entry key.

- If `personId` is provided: returns that person's category minutes on the day
- If `personId` is `null`: returns the household total across all people

Handles `timeOfDay: 'both'` the same way existing load functions do (`Math.ceil(estMin / 2)` per half).

### New helper: `canPlaceUnderCategoryLimit(task, dateKey, categories, newSchedule, existingSchedule, tasks)`

Checks whether placing a task on a given day would stay within category limits:

1. Look up the task's category in `categories`
2. If `dailyLimitPerPerson` is set: for each owner that would be placed, verify `categoryDayLoad(cat, personId, day) + taskEstMin <= limit`
3. If `dailyLimitPerHousehold` is set: verify `categoryDayLoad(cat, null, day) + taskEstMin <= limit`
4. Returns `true` if both pass, or if neither limit is set

For `duplicate` mode tasks (one entry per owner), each owner is checked independently against the per-person limit. The household limit checks the combined total of all entries that would be added. For `rotate`/`fixed` mode (single owner), only that one owner is checked.

### Changes to placement functions

**`placeWeeklyTask`, `placeMonthlyTask`, `placeOnceTask`:**

After selecting the target day, call `canPlaceUnderCategoryLimit`. If it fails:

- **Non-dedicated-day tasks:** Try remaining days in the period (week/month) sorted by load. Pick the first day that passes the limit check. If none pass, skip the task for this period.
- **Dedicated-day tasks:** Skip this period (dedicated-day intent is preserved — the task isn't moved to a wrong day).

**`placeDailyTask`:** No changes. Daily tasks are always placed regardless of limits. If daily tasks alone exceed a category limit, that's a setup issue for the user to resolve (e.g., move tasks to weekly rotation).

### Threading categories into the scheduler

`buildSchedule` receives a new `categories` parameter. The `balanceCtx` object gets a `categories` field so placement functions can access limit data without signature changes to every helper.

## Admin UI

### Category form (admin.html)

Two new number inputs after the existing "Weight %" field:

```
Daily Limit / Person (min)    [___]   hint: "Leave empty for no limit"
Daily Limit / Household (min) [___]   hint: "Leave empty for no limit"
```

Both inputs are hidden when "Event category" is checked (events are excluded from scoring and scheduling limits — same conditional as Weight %).

### Save handler

Reads the two inputs and stores as integers or `null`:
- `dailyLimitPerPerson: value ? parseInt(value, 10) : null`
- `dailyLimitPerHousehold: value ? parseInt(value, 10) : null`

### Category list badges

Compact icon-based badges when limits are set:
- `👤30m` — per-person limit
- `🏠60m` — per-household limit

Displayed alongside existing badges (Event, weight %).

## Files Changed

| File | Change |
|------|--------|
| `shared/scheduler.js` | Add `categoryDayLoad`, `canPlaceUnderCategoryLimit`. Update `placeWeeklyTask`, `placeMonthlyTask`, `placeOnceTask` to check limits. Add `categories` to `buildSchedule` params and `balanceCtx`. |
| `admin.html` | Add two number inputs to category form. Update save handler to read/write limit fields. Add limit badges to category list. Hide limit inputs when Event is checked. |
| `shared/firebase.js` | No changes — categories are already read/written as full objects. |

## Scope Exclusions

- No changes to scoring — limits are a scheduling concern only
- No changes to dashboard, calendar, kid mode, scoreboard, or tracker
- No changes to daily task placement
- No admin warning when daily tasks already exceed a limit (could be a future enhancement)

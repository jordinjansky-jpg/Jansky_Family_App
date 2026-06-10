# Fix Log — working through docs/APP_REVIEW.md

Each batch = one commit. IDs reference findings in docs/APP_REVIEW.md.

## Batch 1 — Foundation + engines (shared/)

| ID | Fix |
|---|---|
| U2 | `escapeHtml` coerces non-strings (`String(str ?? '')`) — un-crashes every caller incl. the A8 feed-delete throw path |
| U4 | `dayOfWeek` JSDoc corrected |
| U5 | `pickWinner`: missing `addedAt` now loses ties (Infinity default) |
| U6 | `parseQtyAmount` guards zero denominators |
| U7 | `formatMinutes` clamps negatives |
| S1/S2 | `expandEventRepeats`: monthly/yearly (and custom month/year) occurrences anchor on the ORIGINAL event's day, clamped per month — no more permanent drift for day 29–31 / Feb 29 events |
| S3 | `expandEventRepeats`: occurrences emit when their [start, start+duration] span OVERLAPS the window — multi-day repeats now appear on middle/end days |
| S5 | `groupByFrequency`: `entry.type === 'event'` always routes to the events bucket |
| S8 | `getOverdueCooldownTaskIds` skips event entries (uniformity with sibling) |
| F1 | `readKitchenPlanRange`: one keyed range query instead of N sequential reads (accepts date-key strings; Date fallback keeps local-parts behavior) |
| F2/A2 (helper) | New `deletePersonCascade()` in firebase.js — push subs, earnings, timers, sessions, streaks, snapshots, lunch feed, recipe ratings, owned schedule entries + their completions, and id-stripping from tasks.owners / events.people / activities.assignedTo / achievementDefs.perPerson (chunked multiUpdate). Wired into admin in a later batch |
| F3 | Deleted dead legacy `meals/` + `mealLibrary` helper block (8 exports, zero callers) |
| F6 | `isDev` uses URLSearchParams exact match |
| K2 (helpers) | Added `updateKitchenItem` / `updateKitchenStaple` so kitchen.js can stop using raw prod-rooted refs (wired in kitchen batch) |
| T1/DB5 | `resolveTheme` priority now device > **settings** > cache > default — family theme changes propagate across devices again (cache remains the instant-paint path when called with no args at boot) |
| T3 | `applyTheme` fallback accent derives through `getThemeVars` (deleted the duplicated math) |
| T4/SR7 | Deleted dead `gradeColor` (hex map, zero callers) |
| T5 | `--accent-hover` only uses the `+ 'dd'` shorthand on 6-digit hex; color-mix otherwise |
| T6 | theme.js header documents its DOM exception + import side effect |
| SR1 | Streaks: zero-task days are now streak-neutral — `updateStreaks` accepts the person's previous task-day; `computeRollover` tracks it (incl. across already-snapshotted dates) |
| SR2 | `timeContributed` counts `ceil(estMin/2)` per 'both' entry — no more double-counted minutes |
| SR5 | Weighted-category formula clamps weight ≤ 95 (no division by zero at 100) |
| SR9 | Override math unified in one `applyOverride` helper (was inlined 3×) |
| SC1/A5 | `generateSchedule` merges a past-date placement OVER the day's existing entries before `buildScheduleUpdates` emits the node — past days are never wiped by dedicated-day placement |
| SC2/DB1/CAL4/A6 | User-pinned entries (movedFromDate / delegatedFromName / pointsOverride / edited entry notes) survive full rebuilds AND `rebuildSingleTaskSchedule`; merge dedupe matches by task+timeOfDay for rotate-mode so a delegated copy suppresses the regenerated original |
| A6 | `clearPast` keeps completed past entries (matches the button's "uncompleted only" promise); collision with past-date placements merges instead of overwriting |
| SC4 | `isInCooldown` / `isCompletedThisWeek` / `isCompletedThisMonth` scan only the window's schedule days (was O(all-completions × all-days) per candidate day) |
| SC5 | `placeOnceTask` falls back past the 14-day window instead of silently never scheduling |
| SC6 | Weekly/monthly fallback rotation uses continuous epochs (no year-boundary owner repeats) |
| SC8 | Removed orphaned duplicate JSDoc |

**Deliberately NOT fixed here:** SC3 / SB14 (one "week" definition app-wide) — behavior change that needs a product decision on Sunday vs Monday weeks; flagged in the final summary. SR4 (anchor-day double count) — needs verification of how anchors are written in rewards flows; revisit in the rewards batch.

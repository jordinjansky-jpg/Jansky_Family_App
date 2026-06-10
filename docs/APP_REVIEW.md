# App Review — Full Find-and-Document Pass

**Date started:** 2026-06-10
**Scope:** All pages, all shared modules, Cloudflare Worker, service worker, all CSS. Exhaustive — every finding logged, severity-tagged.
**Method:** Per file/page, two phases reviewed together:
- **Phase A — Bugs, code improvement, simplification, uniformity**
- **Phase B — UI, UX, polish, feature suggestions**

**This is a documentation pass only. No fixes are applied here.** Each finding is meant to be independently actionable in a later fix pass.

**Environment note:** This review ran in a remote container with no browser tooling, so Phase B findings are code/CSS-derived. Items needing on-device visual confirmation are tagged `[verify visually]`.

## Severity legend

| Tag | Meaning |
|---|---|
| 🔴 Critical | Data loss, crash, scoring/money error, or broken core flow |
| 🟠 High | Real bug or UX failure users will hit; wrong behavior |
| 🟡 Medium | Bug in edge case, meaningful code-quality or UX issue |
| 🔵 Low | Minor issue, inconsistency, small polish item |
| ⚪ Nit | Style/uniformity nitpick; fix opportunistically |

## Review order & status

| # | Area | Files | Status |
|---|---|---|---|
| 1 | Foundation modules | shared/utils.js, state.js, firebase.js, theme.js, dom-helpers.js | ✅ Done |
| 2 | Engine modules | shared/scheduler.js, scoring.js | Pending |
| 3 | Components library | shared/components.js | Pending |
| 4 | Dashboard | index.html, dashboard.js, styles/dashboard.css | Pending |
| 5 | Calendar | calendar.html, shared/calendar-views.js, styles/calendar.css | Pending |
| 6 | Kitchen | kitchen.html, kitchen.js, shared/kitchen-ical.js, styles/kitchen.css | Pending |
| 7 | Tracker | tracker.html, styles/tracker.css | Pending |
| 8 | Scoreboard | scoreboard.html, styles/scoreboard.css | Pending |
| 9 | Rewards | rewards.html, rewards.js, styles/rewards.css | Pending |
| 10 | Kid mode | kid.html, styles/kid.css | Pending |
| 11 | Person mode | person.html | Pending |
| 12 | Admin | admin.html, styles/admin.css | Pending |
| 13 | Setup wizard | setup.html, styles/setup.css | Pending |
| 14 | Activities | activities.html, shared/timer.js, styles/activities.css | Pending |
| 15 | Support modules | shared/weather.js, ai-helpers.js, push-client.js, push-ui.js, dev-banner.js | Pending |
| 16 | Worker & PWA | workers/kitchen-import.js, sw.js, manifest.json, serve.js | Pending |
| 17 | Base CSS | styles/base.css, layout.css, components.css, responsive.css | Pending |
| 18 | Docs drift | CLAUDE.md, DESIGN.md, ROADMAP.md vs reality | Pending |

---

## Pre-review observations (found during setup)

- 🔵 **CLAUDE.md file structure is stale:** `activities.html` (1,208 lines) + `styles/activities.css` exist but are missing from CLAUDE.md's file-structure tree; `shared/timer.js`, `shared/push-client.js`, `shared/push-ui.js`, `shared/kitchen-ical.js` are also absent from the tree (push-ui/kitchen-ical appear elsewhere in docs but not in the tree). CLAUDE.md also says firebase.js "~25 exports" and components.js "~4,000 lines" — both have grown. → Logged in §18 for the fix pass.

---

## 1. Foundation modules

### 1.1 shared/utils.js — Phase A (bugs / code)

- **U1 🟠 `expandEventRepeats` (state.js, but the date math pattern starts here) — see S4 below.** (Cross-ref; logged under state.js.)
- **U2 🟡 `escapeHtml` crashes on non-string input.** `str.replace(...)` throws a TypeError when `str` is `null`/`undefined`/a number. Every caller must remember to guard. Fix: first line `str = String(str ?? '');`. 51 call sites across the app depend on this function; one unguarded interpolation of a missing Firebase field = page-breaking crash.
- **U3 🔵 `weekStart`/`weekEnd` duplicate `weekStartForDay`/`weekEndForDay`.** `weekStart(k) === weekStartForDay(k, 1)`. Two parallel week-math APIs invite drift — and indeed `weekEnd` (Sunday of a Monday week) vs `weekEndForDay(k, 0)` (Saturday of a Sunday week) answer subtly different questions. Consumers: scheduler.js + tracker.html use the Monday-anchored pair; others use the configurable pair. Consolidate to the configurable pair with `startDay = 1` at call sites.
- **U4 🔵 `dayOfWeek` JSDoc lies.** Comment says "in the given timezone" but the function takes no timezone and computes in UTC from the key (which is correct — keys are timezone-resolved upstream). Fix the comment.
- **U5 🔵 `pickWinner` tie-break bias.** Ties break by *lowest* `addedAt`, but a vote option missing `addedAt` gets `0` and therefore wins every tie. Use `Infinity` as the missing-value default so options without timestamps lose ties instead of winning them.
- **U6 🔵 `parseQtyAmount` division-by-zero edge.** `"1 0/0 cup"` produces `NaN`/`Infinity` amount. Guard denominator > 0. Low likelihood, trivial fix.
- **U7 ⚪ `formatMinutes` negative input** renders e.g. `-30m`; no caller should pass negatives but a `Math.max(0, …)` would be cheap.
- **U8 ⚪ `--accent-hover` style concat appears in theme.js but `utils.detectTimezone` fallback `'America/Chicago'` is duplicated as a magic string in `formatLastCooked` too.** Single `DEFAULT_TZ` const would do.

### 1.2 shared/state.js — Phase A

- **S1 🟠 Monthly repeat on day 29–31 drifts permanently.** `expandEventRepeats` monthly: next occurrence is built as `Date.UTC(y, m+1, targetDay)` where `targetDay` comes from the *current* occurrence. Jan 31 → "Feb 31" rolls over to Mar 3; the next iteration then uses day 3 forever. A "monthly on the 31st" event becomes "monthly on the 3rd" after one bad month. Fix: carry the *original* event's day-of-month and clamp to the target month's last day each iteration.
- **S2 🟡 Yearly repeat on Feb 29 drifts permanently** (same mechanism): Feb 29 → Mar 1 next year, then stays Mar 1 even in later leap years. Carry original month/day and clamp.
- **S3 🟡 Repeating multi-day events vanish on their middle/end days.** `expandEventRepeats` only emits an occurrence when its *start* date (`cur`) falls inside `[startDate, endDate]`. A weekly 3-day occurrence whose day 2 or 3 overlaps the queried day/range is skipped. Single-day queries (`getEventsForDate`) and range starts are both affected. Fix: include the occurrence when `[cur, cur+durationDays]` overlaps the window.
- **S4 🟡 Per-day repeat expansion is O(event-age) and runs per day-cell.** `getEventsForDate` walks the rule day-by-day from `event.date` to the query date (safety cap 5,000). A year-old daily repeating event ⇒ ~365 iterations × every rendered day cell. Calendar month view multiplies this ~35×. Works today, but a single "expand range once" call per render (already exists: `getEventsForRange`) should be the only path; pages should not call `getEventsForDate` in a loop. Verify caller patterns in calendar/dashboard sections.
- **S5 🟡 `groupByFrequency` can mis-bucket schedule-entry events.** Entries with `entry.type === 'event'` (standalone schedule events) are only routed to the `events` bucket when both `tasks` *and* `cats` args are provided and the task's category has `isEvent`. An entry with `type: 'event'` but no matching task/category lands in `daily`. If any caller passes 2 args only, events leak into the Daily group. Verify per page; at minimum the function should check `entry.type === 'event'` directly.
- **S6 🔵 `filterEventsByPerson` excludes unassigned events.** An event with an empty `people[]` disappears under any person filter. Arguably an event with nobody assigned is a family event and should pass every filter (the dashboard "All" view shows it; filtering to a person hides it entirely). Product call — flag for decision.
- **S7 🔵 Weekly-repeat day tokens are bespoke** (`['S','M','T','W','Th','F','Sa']`). Works only if the event form writes identical tokens (it does — verify in components.js section), but it's a fragile string contract with no shared constant. Export one constant both sides import.
- **S8 ⚪ `getOverdueCooldownTaskIds` doesn't skip `entry.type === 'event'` rows** (harmless today because events have no `taskId` match, but the sibling function `getOverdueEntries` does skip them — uniformity).

### 1.3 shared/firebase.js — Phase A

- **F1 🟡 `readKitchenPlanRange` is N sequential round-trips.** One `await readKitchenPlan(day)` per day in a `while` loop — a 30-day history view = 30 serial Firebase reads. Use a single `orderByKey().startAt(startKey).endAt(endKey)` query on `kitchen/plan`, or at least `Promise.all`. Also uses **device-local** `getFullYear()/getMonth()` date math instead of `settings.timezone` — violates the project's own timezone rule and shifts the window around midnight.
- **F2 🟡 `deletePersonRewardsData` cascade is incomplete.** Removes messages/anchors/bank/wishlist/achievements/multipliers/reward-perPerson, but orphans: `pushSubscriptions/{personId}`, `activityEarnings/{personId}`, `activeTimers/{personId}`, `streaks/{personId}`, `snapshots/{date}/{personId}`, `kitchen/schoolLunchFeeds/{personId}`, recipe `ratings[personId]`. Whether person deletion routes through this function or admin.html does more — verify in §12; if this is the single cascade, it leaks per-person data permanently.
- **F3 🔵 Dead code: the legacy `meals/` + `mealLibrary` helper block** (`readMeals`, `readAllMeals`, `writeMeal`, `removeMeal`, `readMealLibrary`, `pushMealLibrary`, `writeMealLibrary`, `removeMealLibrary` — 8 exports, ~45 lines) has **zero callers** anywhere in the repo. Superseded by `kitchen/plan` + `kitchen/recipes`. Delete.
- **F4 🔵 `onConnectionChange` doesn't follow the `ready()` pattern** — calls `getDb()` synchronously (throws if init hasn't run) while every other helper tolerates early calls. Harmless if pages always init first, but it's the one inconsistent entry point.
- **F5 🔵 `writeSchoolLunchFeed` has write-name/update-semantics mismatch** — named `write*` (full replace convention elsewhere in this file) but implemented as `updateData` (merge). Rename to `updateSchoolLunchFeed` or document.
- **F6 ⚪ `isDev` substring match** — `location.search.includes('env=dev')` also matches `?xenv=devel`. Use `new URLSearchParams(location.search).get('env') === 'dev'`.
- **F7 ⚪ CLAUDE.md says "~25 exports"** — firebase.js now has ~150. Update doc (logged §18).

### 1.4 shared/theme.js — Phase A

- **T1 🟠 `resolveTheme` lets a stale cache beat live Firebase settings — family theme changes don't propagate across devices.** Priority is `device override > localStorage cache > settings`. Every `applyTheme` re-writes the cache, so once a device has cached *any* family theme, a later family-theme change made on another device is permanently masked on this one: pages call `applyTheme(resolveTheme(settings.theme))` after load, `resolveTheme` returns the cached old theme, and applying it re-caches it. The cache's documented purpose is *instant paint before Firebase loads* — after settings arrive, settings should win: `resolveTheme(settingsTheme) → deviceTheme || settingsTheme || cached || default`. `[needs product confirm: is per-device stickiness intended?]`
- **T2 🟡 DESIGN.md §10.1 spec drift.** Spec mandates 5 presets (Sage / Ocean / Rose / Amber / Iris), each with light+dark variants. Implementation ships `light-warm / dark / dark-warm / light-vivid / dark-vivid` + a free accent color. The implementation is arguably the better model, but the spec is the contract — update §10.1 to match reality.
- **T3 🔵 `applyTheme` duplicates the accent-token derivation** from `getThemeVars` in its fallback branch (~15 lines, byte-similar). Compute once: if no accent in config, call `getThemeVars({ ...themeConfig, accentColor: '#5b7fd6' })`.
- **T4 🔵 `gradeColor` returns hardcoded hex** (`#2e7d32` etc.) that bypasses theming entirely — grade badges will be the same colors in dark mode and any theme, and dark-mode contrast for `#f9a825` (C) on dark surfaces is unverified. Consider `--success`/`--info`/`--warning`/`--danger` token mapping or dedicated `--grade-*` tokens.
- **T5 🔵 `--accent-hover: accent + 'dd'`** assumes a 6-digit hex accent; an 8-digit hex or named color silently produces an invalid value. Validate or use `color-mix`.
- **T6 ⚪ Module header says "No DOM access"** while `applyTheme`/`applyTextSize`/`initTextSize` write to `document` (a documented exception in CLAUDE.md, but the file's own header should say so). `initTextSize()` also runs as an import side-effect — worth a comment.

### 1.5 shared/dom-helpers.js — Phase A

- **D1 🔵 `closeTaskSheet` animation timeout (300ms) doesn't match the motion tokens** (`--t-base` = 200ms). If the sheet CSS animates at 200ms there's a 100ms dead window; harmless but should reference one number. (Verify against components.css sheet transition in §17.)
- **D2 🔵 Module header claims it's "the only shared module besides theme.js permitted to touch the DOM"** — but `components.js` (showConfirm/showToast/openCookMode etc.), `push-ui.js`, `ai-helpers.js`, `dev-banner.js`, and `timer.js` all touch the DOM. The architecture comment no longer describes the codebase; CLAUDE.md's "Module rules" line has the same problem (logged §18).
- **D3 ⚪ `getSelectedOwners` builds a selector with raw string interpolation** — fine for the IDs in use; `CSS.escape` would future-proof.

### 1.x Phase B (UX) — foundation modules

Foundation modules are headless; UX implications are logged with their owning pages. One cross-cutting item:

- **X1 🟡 Monthly events created on the 29th–31st silently shift days (S1/S2)** — to the user this reads as "the calendar lost my event / moved my event," one of the most trust-damaging bug classes in a family calendar. Recommend prioritizing S1–S3 in the fix pass.

---

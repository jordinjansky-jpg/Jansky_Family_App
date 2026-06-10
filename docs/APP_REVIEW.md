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
| 2 | Engine modules | shared/scheduler.js, scoring.js | ✅ Done |
| 3 | Components library | shared/components.js | Pending |
| 4 | Dashboard | index.html, dashboard.js, styles/dashboard.css | ✅ Done |
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
| 15 | Support modules | shared/weather.js, ai-helpers.js, push-client.js, push-ui.js, dev-banner.js | ✅ Done |
| 16 | Worker & PWA | workers/kitchen-import.js, sw.js, manifest.json, serve.js | ✅ Done |
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

## 2. Engine modules

### 2.1 shared/scheduler.js — Phase A

- **SC1 🔴 Past-date placement wipes other tasks' entries on that day.** `placeWeeklyTask`/`placeMonthlyTask`: when a dedicated-day task's day has already passed in the current week/month (and the task isn't already scheduled/completed this period), the entry is placed on a **past date** (`newSchedule[pastDate] = {}` then the single entry). `generateSchedule`'s final completed-entry merge only runs over `futureDates`, and `buildScheduleUpdates` then emits `schedule/{pastDate} = { onlyTheNewEntry }` — a **full node replace** (confirmed: callers feed this directly into `multiUpdate`, e.g. calendar.html:2487, admin.html ×5). Every other task's entry on that past date is deleted: incomplete past entries vanish from the overdue banner, completed entries are deleted and their completion records orphaned (history/snapshot rebuild for that day breaks). Trigger is mundane: *create a weekly task on Wednesday with dedicated day Monday* → this week's past Monday node is replaced. Fix: merge `existingSchedule[pastDate]` entries into any past-date node before emitting, or emit per-entry update paths (`schedule/{date}/{key}`) for past dates instead of node replaces.
- **SC2 🟡 Manual schedule moves are not rebuild-stable.** `generateSchedule` strips all *uncompleted* future entries and re-places every task by load balancing. Any entry a user manually moved to a chosen future date (move flow) — unless the move also rewrote `task.dedicatedDate`/`dedicatedDay` — is silently relocated on the next full rebuild (any task save in admin triggers one). `[verify against the pages' move-flow implementation — logged to recheck in §4/§5/§12]`
- **SC3 🟡 Weekly task periods ignore the family week-start setting.** `isScheduledThisWeek` / `isCompletedThisWeek` / week grouping all use Monday-anchored `weekStart`/ISO weeks. The admin "Week start" setting (`settings.calendarDefaults.weekStartDay`, Sunday default) only affects calendar display. A family with Sunday-start weeks gets weekly tasks that reset on Monday — e.g. completing a weekly task on Sunday counts it toward the *previous* display week but blocks Mon–Sun placement of the *ISO* week. Decide one definition of "week" and use it in scheduler, scoring (`periodKeyToStartDateKey`), tracker, and scoreboard alike.
- **SC4 🟡 `isInCooldown` / `isCompletedThisWeek` / `isCompletedThisMonth` are O(all-completions × all-schedule-days)** — for each completion key ever recorded, they scan the entire schedule tree; and they're called once per candidate day per task during generation. With a year of history this is millions of iterations per rebuild. Invert the loop: scan only the window's schedule days and test `completions[entryKey]` membership (same result, ~100× cheaper). The completion *value* is never used — the outer loop is pure overhead.
- **SC5 🔵 `placeOnceTask` fallback only considers the next 14 days** (`eligibleDates.slice(0, 14)`); if every one of those days fails the category limit, the task silently isn't scheduled at all (no fallback to day 15+). Rare, but the silent drop contradicts the "tasks never vanish" principle the dedicated-date branch works hard to uphold.
- **SC6 🔵 Weekly/monthly fallback rotation is unfair at period boundaries.** `getRotationOwner` weekly uses `isoWeekNumber % owners.length` — at the 52→1 year rollover the same owner can repeat consecutive weeks. Cosmetic-fairness only (balanced path usually wins), but cheap to fix with a continuous week index (days-since-epoch ÷ 7).
- **SC7 🔵 Weekend "weight" semantics are inverted vs. its name and divides instead of multiplies.** Placement sorts by `load / weekendWeight` on weekends — a weight of 3 makes weekends *3× more attractive*. If that's the intent ("family has more time on weekends"), name it `weekendPreference`; verify the admin Scoring screen explains it this way (§12) — a parent reading "weekend weight 3" could reasonably expect the opposite.
- **SC8 ⚪ Dead params & duplicated JSDoc.** `placeDailyTask(…, completions, weekendWeight, …)` never uses either param; orphaned duplicate doc block above `totalDayLoad` (lines 388–392); `entries` variable in `generateRotatedEntries` is initialized before the duplicate-mode early return that ignores it.
- **SC9 ⚪ `canPlaceUnderCategoryLimit` rotate-mode heuristic checks `owners[0]` only** — self-acknowledged in a comment; fine, but worth a `[known approximation]` marker in the doc/spec rather than only a code comment.

### 2.2 shared/scoring.js — Phase A

- **SR1 🟡 A zero-task day resets a streak.** `computeRollover` only calls `updateStreaks` for dates where the person *has* entries; the gap leaves `lastCompleteDate` stale, so the next all-done day fails `isNextDay` and resets `current` to 1. A kid with weekly-only tasks, or anyone given a scheduled day off, can never build a streak. Decide: zero-task days should be streak-neutral (bridge the gap) — currently they're streak-fatal.
- **SR2 🟡 `timeContributed` double-counts `timeOfDay: 'both'` tasks.** Scheduler splits a 'both' task into am+pm entries each costing `ceil(estMin/2)`; `timeContributed` adds the full `estMin` for *each* completed entry → 2× the real minutes in the scoreboard drilldown stat.
- **SR3 🟡 Denied redemptions may permanently deduct points.** `calculateBalance` subtracts every `redemption-request` message's amount. If denial doesn't rewrite/remove that message, denied requests still cost the kid points. `[verify the deny flow in §9 Rewards — logged to recheck]`
- **SR4 🔵 Anchor-day double count.** Snapshots are included when `dateKey >= anchorDateKey`, but the anchor amount was set partway through that same day — the anchor day's snapshot (written later at rollover) adds on top of the anchored amount. Off-by-one-day in the kid's favor; use `>` or anchor at end-of-day.
- **SR5 🔵 `dailyPossible` weighted formula divides by `(100 - w)`** — a category weight of 100 produces `Infinity`. Clamp `w ≤ 95` (or guard) wherever the slider writes, and defensively here.
- **SR6 🔵 `achievementProgress` returns `progressPct: 0` for all grade-based achievements** — the kid trophy case can never show progress toward Perfect Day/Week/Month. Could pass current percentage (e.g. 96/97 toward A+) for a real bar.
- **SR7 🔵 Dead code: `theme.gradeColor`** (hex map) has zero callers — all grade coloring goes through `gradeTier` CSS classes. Delete (cross-ref T4: deleting it also resolves the hardcoded-hex concern).
- **SR8 ⚪ `ACHIEVEMENTS` deprecated alias** — grep for remaining users and remove.
- **SR9 ⚪ Earned-points logic is implemented three times** (`earnedPoints`, inline in `dailyScore`, inline in `buildSnapshot`) — same `pointsOverride` math; the two inline copies should call a shared helper that accepts a precomputed base (the only reason they diverged).

### 2.x Phase B (UX) — engines

- **X2 🟠 SC1's user-visible symptom:** past days' tasks disappear from the overdue banner and tracker history after an unrelated task edit. If users have reported "my old tasks vanished," this is the likely cause.
- **X3 🟡 SC3's user-visible symptom:** weekly tasks "reset" midweek relative to the calendar's Sunday-start week — e.g. a weekly task completed Sunday evening doesn't prevent it reappearing Monday.
- **X4 🔵 Streak rules (SR1) should be explained somewhere user-visible** (kid mode / scoreboard tooltip): what keeps a streak alive, what breaks it, and whether days off count. Right now the rule is implicit and slightly wrong.

---

## 4. Dashboard (index.html · dashboard.js · styles/dashboard.css)

### 4.1 Phase A — bugs, correctness, duplication

- **DB1 🔴 Move/Delegate/Skip rewrite only the schedule entry — wiped by the next schedule rebuild.** *(Confirms SC2.)* The move handler (dashboard.js:3081–3106), delegate (3019–3042), delegate+move (3046–3073), and skip (3109–3120) write only `schedule/...` paths and never touch `task.dedicatedDate`. `generateSchedule` strips ALL uncompleted future-date entries before re-placing (scheduler.js:566–588). So any task save (dashboard.js:3490 with `includeToday: true`) or any toggle of a cooldown task (1179) silently undoes a user's move/delegate, and "Skip" on a one-time task resurrects on rebuild. Fix: persist the move on the task (e.g. `dedicatedDate`/`movedTo` map) or teach the scheduler to preserve entries carrying `movedFromDate`/`delegatedFromName` keys.
- **DB2 🟠 `PRESS_MOVE_THRESHOLD` is undefined — ReferenceError in pointermove on event bubbles and Coming-up items.** dashboard.js:1000 and 1017 reference a const that is never declared or imported. Every pointermove with an active press timer throws; movement-cancel for long-press is dead on those elements. Fix: declare the const (10) or reuse `bindTaskRowGesture`.
- **DB3 🟠 Dinner vote sheet writes to TODAY's slot while the tile shows viewDate's dinner.** Tile reads `viewMeals` for `viewDate` (948, 1042) but `openVoteSheetForDinner` hardcodes `today` (1640, 1650–1674). Swipe to tomorrow, vote on tomorrow's dinner → today's plan is overwritten. Pass `viewDate` through.
- **DB4 🟠 Celebration never fires on days with a standalone event.** `checkCelebration` (1283–1284) feeds raw `viewEntries` (incl. `type:'event'` entries) into `isAllDone`, which doesn't exclude events (state.js:97–101). With an event mirror entry on today, all-done is permanently false. Filter events before the check.
- **DB5 🟠 Changed family theme from Firebase is never applied.** *(Confirms T1.)* Line 39 calls `applyTheme(resolveTheme(settings.theme))` but the `dr-theme` cache always wins and is rewritten on every apply — `settings.theme` is dead after first run. Apply `settings.theme` directly when no device override exists.
- **DB6 🟠 Task-form save can permanently disable Save with no feedback.** `tf_save` disables the button (3483) then awaits 3–4 writes with no try/catch/finally (3485–3534). Any rejection leaves a dead Save and no toast. (The event form does it right at 2442–2478.) Wrap in try/finally or use the imported-but-unused `withButtonLock`.
- **DB7 🟠 Unescaped user data in the Dinner tile (stored XSS).** `renderDashboardTile` interpolates `value`/`sub` raw (components.js:4233–4234) and the dashboard passes the recipe name unescaped (dashboard.js:369). A recipe named `<img src=x onerror=…>` executes on every dashboard load. Escape in the component.
- **DB8 🟡 Day navigation renders stale data.** `goToday` (895–902) and `changeDay` (1035–1046) await meal reload + `loadData()` but never call `render()` — they rely on a listener whose debounced render typically fires *before* the reads resolve. Dinner tile and overdue banner lag a day behind. Call `debouncedRender()` after the awaits.
- **DB9 🟡 `onCompletions` → `loadData()` race.** Every completion change triggers `readAllSchedule()` (3633–3637, also toggleTask:1178–1186) with no in-flight guard — rapid toggles can resolve out of order, leaving `overdueItems`/`suppressedCooldownTaskIds` stale. Add a sequence counter (the render path already has one at 239–247).
- **DB10 🟡 Undo of "marked incomplete" loses the original completion record.** The undo recreates `{ completedAt: TIMESTAMP, completedBy: 'dashboard' }` (1196–1199), dropping `pointsOverride`/`isLate`/original timestamp — undoing an accidental uncomplete of a late task upgrades it to on-time full credit. Snapshot and restore the original record.
- **DB11 🟡 Past-date completion contract drift between pages.** `toggleTask` applies `isLate` + `pointsOverride: pastDueCreditPct` for all rotations (1092–1102) ✓ — but skips both when a saved `pointsOverride` exists, or category `isEvent`, or task `exempt` (CLAUDE.md overstates "ALL"). And dashboard never passes `isTapBlocked` to `bindTaskRowGesture` (906–912) while calendar does (calendar.html:513/612) — tapping a past incomplete daily on dashboard completes it; on calendar it opens the sheet. Pick one contract.
- **DB12 🟡 No error handling/toast on most writes.** `toggleTask` mutates in-memory state before awaiting writes with no try/catch (1073–1106); delegate/move/skip/notes-save (3038, 3068, 3102, 3116, 3164) fire `multiUpdate` bare. A rejected write = silent UI/DB divergence, violating §7.7. Wrap with toast + reload.
- **DB13 🟡 Dead code: `openMealEditorSheet` (~165 lines, 2004–2167, never called) and the `headerThemeBtn` listener (3608–3624, matches no element).** Delete both.
- **DB14 🟡 ~14 dead imports + stale comments** (lines 2–12: `renderNavBar`, `initNavMore`, `renderPersonFilter`, `renderProgressBar`, `renderOverdueBanner`, `renderGradeBadge`, `renderOverflowMenu`, `renderAmbientStrip`, `renderMealEditorSheet`, `groupByFrequency`, `onValue`, `writeIcalFeed`, `withButtonLock`, `loadCachedTheme`, `defaultThemeConfig`); comment at 126–128 describes wiring that no longer exists.
- **DB15 🔵 Duplicate `onAllMessages` subscription; approvals driver calls `render()` directly** (207–219), bypassing the 100ms debounce the other listeners use.
- **DB16 🔵 settings/people/tasks/categories are read once at boot (34–36) with no listeners** — admin changes from another device don't appear until reload, while completions/events are live. A settings listener would also fix DB5.
- **DB17 🔵 Multi-person bounty cleanup is N sequential `removeData` calls (1152–1158) instead of one `multiUpdate`, and doesn't remove twin entries' completion records.**
- **DB18 🔵 First-run redirect doesn't halt boot** (31) — module keeps executing against an empty DB while navigation races. Early-return.
- **DB19 ⚪ Schedule "event mirror" entries are write-only decaying data.** Dashboard writes `{type:'event', eventId}` entries (2461–2469, 2769–2770), filters them out at render (263), and every rebuild strips them. Drop the writes or preserve them in the scheduler.
- **DB20 ⚪ Overdue sheet "Done today" check requires `typeof completedAt === 'number'`** (736–738) — locally-written `ServerValue.TIMESTAMP` sentinel can miss just-completed items offline.

### 4.2 Phase B — UX / spec compliance (§6.1)

- **DB21 🟡 "Today" section and person-filter chip vanish when there are events but zero tasks.** Empty-state branch requires both counts zero (464); with events present and no tasks, the Today section (and the filter chip's only mount, 468/511) is skipped entirely. Render the Today head + empty state whenever `totalCount === 0`.
- **DB22 🟡 Swipe is the only day-navigation gesture** (1051–1061) — §7.8 requires a visible non-gesture fallback. No prev/next chevrons; desktop/keyboard users can't change days. Add chevrons by the header subtitle or Today section head.
- **DB23 🟡 FAB pre-fill half-implemented vs §6.1.** Event form gets `dateKey: viewDate` (2173) but no activePerson; task form seeds `owners: [activePerson]` (3184–3186) but writes the same-day entry to `today` not `viewDate` (3498–3501) — adding a task while viewing Saturday lands it today. Cross-wire both.
- **DB24 🔵 Banner queue adds an undocumented "approvals" tier** (vacation > freeze > overdue > **approvals** > multiplier > info, 630–697). Sensible, but §7.3/§6.1 must be updated per the project's own spec-first rule. One-banner rule holds ✓ (700–710). Vacation/freeze/activity branches are dead placeholders gated on `window.__*` hooks.
- **DB25 🔵 Back-to-Today pill moved to the header center slot** (312–321) vs spec position between Banner and Ambient strip. Update DESIGN.md or move it back.
- **DB26 🔵 Coming-up rail dropped the spec'd "tap day-block head jumps viewDate"** — rows open the event detail sheet instead (427–444, 993–1006); the "clear week" copy branch (417–419) is dead because the rail hides at zero events.
- **DB27 🔵 Events render as `.event-bubble`** (454–456; components.js:2786–2801) — spec says `.card.card--event` (§6.1 item 6); a second card-ish pattern violating §12. Reconcile with DESIGN.md.
- **DB28 🔵 Emoji in chrome:** 👍 in the Dinner tile vote sub-line (364), 🍴 placeholder in recipe pick rows (1703), 🤔 in person-not-found placeholder (79), 🐛 debug title (865, arguably exempt). Swap for SVG.
- **DB29 🔵 Inline-style violations in generated HTML:** `style="padding:0 var(--spacing-md)…"` (2701), `.style` mutations (1499, 1524–1525, 1251, 1435), and the import-confirm sheet uses the banned legacy `sheet__content` wrapper (2711). dashboard.css itself is clean (tokens only).
- **DB30 🔵 Past-day score meta uses today's multiplier** (492–495) instead of `multipliers[viewDate]`.
- **DB31 🔵 Task cards are focusable but keyboard-inert.** `renderTaskCard` emits `role="button" tabindex="0"` (components.js:2094) but only pointer events are bound — Enter/Space do nothing, and long-press has no keyboard equivalent. Add a keydown path in `bindTaskRowGesture` (fixes all pages).
- **DB32 🔵 No boot error state** — if the initial `Promise.all` (34–36) rejects, the skeleton spins forever. §7.7 requires `renderErrorState` + retry.
- **DB33 🔵 Weather tile with no location set deep-links into PIN-gated admin** (961–963) with no explanation — kid/person users hit a PIN wall. Toast or inline subsheet instead.
- **DB34 ⚪ Polish:** (a) ROADMAP's Birthday & Milestone tracking would feed the Coming-up rail with zero new dashboard chrome; (b) promote the overdue-sheet per-card toggle guard (799–813) into the shared pattern DB12 asks for; (c) `timeLabel` is computed (286–293) but never rendered — use it in section meta or delete.

---

## 15. Support modules (weather, ai-helpers, push-client, push-ui, dev-banner)

- **SM1 🟠 weather.js ignores the temperature-unit setting — always Fahrenheit.** `_fetchAndCache` hardcodes `&temperature_unit=fahrenheit` (weather.js:129); no read of any `settings.temperatureUnit`. Thread the unit through from settings (the Admin spec §6.5 lists "temperature unit" as a Family setting).
- **SM2 🟡 Weather coordinate cache never refreshes when location changes.** Coords are only geocoded when absent (118–123); `clearWeatherCache()` (240) clears `dr-weather-` date entries but **not** `dr-weather-coord`. Changing `weatherLocation` leaves weather pinned to the old coordinates. Clear the coord key too, or key coords by location string.
- **SM3 🟡 weather.js has no fetch timeout.** `geocodeLocation`/`_fetchAndCache` (108, 133) await fetch with no `AbortController` — a hung Open-Meteo request blocks the widget indefinitely. Add a few-second timeout.
- **SM4 🟡 ai-helpers.js image resize drops EXIF orientation.** `resizeImageForUpload` (17–49) canvas-redraws and re-encodes, discarding the orientation tag — portrait phone photos reach Claude sideways, hurting OCR/recipe/calendar extraction. Use `createImageBitmap(file, { imageOrientation: 'from-image' })`.
- **SM5 🔵 ai-helpers escaping is correct** — `renderConfirmRow` (121–141) routes all interpolation through `esc()`. No XSS gaps here.
- **SM6 🔵 Rotated push subscriptions silently die on the bare dashboard.** `pushsubscriptionchange` re-subscribe and `silentAutoResubscribe` (push-client.js:181–205) resolve `personId` only from `?person=`/`?kid=` URL params — on plain `/index.html` a rotated subscription is never re-registered; pushes stop until the user revisits the Notifications UI. Persist the last-known personId (localStorage) as a fallback.
- **SM7 🔵 Permission-denied toast doesn't distinguish hard `denied`** (needs OS settings) from `default` (push-ui.js:192) — copy could guide the user.
- **SM8 🔵 Quiet-hours logic confirmed Worker-side and consistent** with the in-UI promise that bell messages and reward approvals bypass quiet hours (push-ui.js:155; worker `isInQuietHours` gates only time-triggered types). No action.
- **SM9 🔵 dev-banner.js can't leak into production** (gated on `?env=dev`, touches only `rundown-dev`). Minor: uses native `confirm()` (line 55) — banned by CLAUDE.md but dev-only tooling; decide whether the ban applies.
- **SM10 ⚪ serve.js: path-traversal guard adequate for a localhost dev server; `.mjs`/`.map` missing from the MIME table** (no live impact).

---

## 16. Worker & PWA (workers/kitchen-import.js · sw.js · manifest.json)

### 16.1 Cloudflare Worker

- **W1 🔴 AI handlers are unauthenticated behind wildcard CORS — anyone can spend the Claude API key.** `Access-Control-Allow-Origin: *` (kitchen-import.js:1628) and the entire `HANDLERS` map (`categorize`, `url`, `screenshot`, `scan`, `recipeSuggest`, … lines 1633–1649) runs with no auth — only `push`/`action` verify HMAC. Any script anywhere can POST `{type:"scan", input:{base64:…}}` and bill multimodal Haiku calls to the key indefinitely. Fix: lock CORS to `https://dashboard.jansky.app` and gate AI handlers behind a shared secret.
- **W2 🟠 No rate limiting anywhere.** Pairs with W1 as the cost-abuse story. Add a Cloudflare rate-limiting rule or KV/DO counter per IP.
- **W3 🟠 HMAC "auth" on `/push` + `/action` is a public secret — reward approvals can be forged.** `PUSH_HMAC_SECRET` ships verbatim in `shared/push-client.js:9` and `sw.js:728` (served to every browser). Anyone reading the JS — including a kid — can mint valid tokens and call `action`/`approve` (worker:1765) to self-approve redemptions or push arbitrary notifications. The DB-mutating reward actions raise the stakes beyond notifications. Needs a server-held secret or signed parent session.
- **W4 🟠 SSRF / open fetch proxy.** `handleUrl`/`fetchImageAsBase64` (1284, 1147) and `handleIcal` (1482) fetch arbitrary user-supplied URLs and return bodies/base64. With W1's open CORS this is a general-purpose proxy. Block private IP ranges, cap redirect depth.
- **W5 🟡 Cron-miss gaps in settlement permanently skip payouts.** `runDailySettlement` only settles *yesterday* (2472); `runWeeklySettlement` only fires when it's Monday in the family TZ (2520). A down day (or a fully missed Monday) is never back-filled — kids silently lose earned activity points. Idempotency itself is correct (2485/2535). Add a catch-up loop over the last N days/weeks.
- **W6 🟡 Settlement does O(people × activities) Firebase reads every 5-minute tick all day,** even when fully settled (2476, 2485). Gate to once/day or short-circuit when yesterday is settled.
- **W7 🟡 `runOverdueReminders` issues 7 sequential schedule-day reads** (2292–2300) inside its firing window — `Promise.all` them.
- **W8 🔵 Model ID current** (`claude-haiku-4-5-20251001`, line 872); max_tokens 4096 fine. No action.
- **W9 🔵 Claude-failure handling is safe but inconsistent:** text handlers swallow errors as HTTP 200 with fallback data; image handlers return 500. Unify or document.
- **W10 🔵 Prompt-injection blast radius contained:** AI handlers only return client-validated JSON; the single write path (`handleEmailMessage` → `emailImports`, `processed:false`, line 1653) enqueues human-review items only. Acceptable. (Note: the email handler's `FIREBASE_DB_SECRET` is full-DB-scope — worth knowing.)
- **W11 🔵 `parseJson` (886) throws on max_tokens truncation** — dense calendar images can silently fall back. Detect `stop_reason` or raise the cap for `handleScan`.
- **W12 ⚪ `RUNDOWN_ROOT` hardcoded to `rundown`** (76) — dev-mode clients still trigger production pushes/settlement; a kid testing `?env=dev` could fire real approvals. Conscious choice; documented here.

### 16.2 Service worker & PWA

- **SW1 🟠 No offline navigation fallback.** Network-first caches every OK GET (657–665), but uncached routes have no fallback page when offline. Add navigation fallback to `/index.html`.
- **SW2 🟡 `kitchen.js` is not precached but `kitchen.html` is** (APP_SHELL 525–581, intentional per v94 comment) — opening Kitchen offline before ever visiting it online loads HTML whose module 404s. Precache it or document the limitation.
- **SW3 🟡 Approve/Deny/Snooze notification actions silently no-op offline.** `notificationclick` → `postAction` (691–747) just logs on failure (744) — the notification closes, the user believes they approved, nothing happened. Background Sync or re-show the notification on failure.
- **SW4 🟡 `notificationclick` URL matching is loose** (`c.url.includes(targetPathname)`, 714–722) and drops query deep-links (`?openBell=1` etc.) when focusing an existing client — tapping a reward-approval push focuses the dashboard without opening the bell. Match pathname exactly and postMessage the deep-link.
- **SW5 🔵 `CACHE_BUMPS` changelog block (7–522) has duplicate/out-of-order version entries** (two v182/v183, v184–189 dupes, two v68) — unreliable as history; clean up or switch to date-ordered.
- **SW6 🔵 skipWaiting/clients.claim/per-asset catch on install all correct.** ✓
- **SW7 ⚪ Dynamic kid/person manifests hardcode `#141413` theme colors** (627–646) — won't follow user theme; matches static manifest.json. Fine.

### 16.3 Cross-file consistency (verified end-to-end)

Push pref-key chain is **fully consistent**: `firebase.js mapMessageTypeToPushType` → `bellMessages`/`rewardApprovals`/`rewardFyi` → `push-ui.js DEFAULT_PREFS.types` → Worker `prefs.types[type]` lookup (1724) → `sw.js` action routing (674). Payload shapes match. No drift.

---

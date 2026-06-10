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
| 3 | Components library | shared/components.js | ✅ Done |
| 4 | Dashboard | index.html, dashboard.js, styles/dashboard.css | ✅ Done |
| 5 | Calendar | calendar.html, shared/calendar-views.js, styles/calendar.css | ✅ Done |
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

## 3. Components library (shared/components.js)

### 3.1 Phase A — bugs, correctness, duplication

- **C1 🟠 `initColorButton` leaks a document-level capture listener on every call.** components.js:104–106 adds `document.addEventListener('click', closeOnOutside, { capture: true })` and never removes it — called on every open of Customize, Avatar editor, and admin person/category forms. Listeners and their closures over removed DOM accumulate for the page lifetime. Remove on popover close or use an AbortController.
- **C2 🟠 Bell approve/deny and Send Message have no in-flight guard — double-tap duplicates Firebase writes.** `.bell-approve` (4698–4761) awaits then writes approval messages + bank tokens; a second tap re-runs the whole chain → duplicate reward tokens/points. Same in `.bell-approve-use` (4815–4844) and `#msg_send` (4031–4091). Fix: disable the button at handler entry (the §5.23 saving-spinner pattern). **Real data corruption in the rewards economy.**
- **C3 🟠 `openRepeatSubsheet` renders the full Repeat UI but silently discards everything except the type.** (1770–1797 + `renderRepeatSheet` 5418–5496.) Weekly day chips have no click binding (taps do nothing) and the entire "Ends" section (end date / occurrence count) is dropped on Done — `rule = { type }` (1793). Used by calendar.html:1716 and admin.html:1833 — users set options that silently vanish. Bind the full UI (dashboard has richer wiring) or render a `simple: true` variant.
- **C4 🟡 `showConfirm`: Enter while Cancel is focused confirms.** keyHandler (4168–4177) force-confirms on Enter unless focus is in the input — even when the user has Tabbed to Cancel. Skip the shortcut when `activeElement === cancelBtn`.
- **C5 🟡 Customize pref-writes persist the `id` field into the person record.** `writeNavTabsPref` (646), `writeKitchenCustomize` (688), `writeRewardsCustomize` (738), `writeScoreboardCustomize` (797) spread the full person (incl. `id`) into `writePerson`, while `openDeviceThemeSheet` carefully strips it (3554/3630). Pollutes `rundown/people/{id}` with a redundant `id` key. Destructure it out.
- **C6 🟡 Double-escaping bugs.** (a) `renderMealEditorSheet`: `url` escaped at 4959 then again at 5023 — URLs with `&` become `&amp;amp;` and open broken. (b) `renderBankToken`: `typeLabel` contains escaped name (2353–2355) and is re-escaped at 2371.
- **C7 🟡 `openPhotoCropper` leaks document `mousemove`/`mouseup` listeners** (391–392; `close()` at 410–413 only removes the overlay).
- **C8 🟡 `openVoteSheet` vote toggles operate on a stale `options` closure with no in-flight guard** (5583–5595) — rapid taps clone the same original array; second write clobbers the first vote. Disable buttons during `await onWriteOptions`.
- **C9 🟡 `openDeviceThemeSheet.applyAndSave` crashes on a stale preset key** (3544: `presets.find(...)` then unconditional `info.mode`). Guard with `defaultThemeConfig()` fallback.
- **C10 🔵 Dead code (grep-verified zero callers):** `NAV_ITEMS` (449–454), `renderTrackerFilterSheet` (2512), `renderViewSwitcher` (2821), `renderSectionHeader` (4243), `_formatEventTime12h` (4438), and the dead `.replace('from ', '')` at 3079. Delete.
- **C11 🔵 Four duplicate 24h→12h time formatters** (`formatEventTime` 429, `formatTime12` 2692, `ef2fmt12` 2829, `_formatEventTime12h` 4438). Collapse to one.
- **C12 🔵 SVG icon constants duplicated 6–9×** — close ✕ exists as `CLOSE_SVG`/`CLOSE_SVG_TF`/`MD_CLOSE_SVG`/`DS_CLOSE`/`closeSvg` (216, 1471, 2895, 3041, 3214, 4983, 5265, 5529); same for check and trash; `chev` re-declared in each customize renderer (920, 1041, 1161). Hoist to module constants.
- **C13 🔵 The shipped form primitives aren't used by the flagship forms.** `renderEventForm` (2917–2924), `renderTaskForm` (3264–3271), `renderMealEditorSheet` (4986–4997) hand-roll identical `sheet__header` blocks instead of `renderFormSheetHeader` (1470); the `requestAnimationFrame(...add('active'))` open boilerplate appears 11× with subtly different overlay-close logic. A shared `openSheet(mount, html, onDismiss)` helper would unify both (and is the natural home for the Escape/focus-trap fix in C24).
- **C14 🔵 `renderNavBar` re-implements `readNavTabsPref`'s localStorage fallback** (485–496 vs 619–630) and skips its page-id whitelist validation. Call the helper.
- **C15 🔵 Sheet-close timing constants drifted:** CSS `--t-base` 200ms; dom-helpers 300ms; this file 220/280/300/320ms (419, 262, 3718, 1785/1795/1847/1909). Define one `SHEET_ANIM_MS` (DESIGN.md's budget is 320ms).
- **C16 🔵 `initBottomNav` re-binds `#headerAdmin` on every `dr-nav-tabs-changed`** (554–558 → 610) — accumulating listeners on a node that isn't re-rendered.
- **C17 🔵 `initBell` rapid double-click stacks two dropdowns** — existence check happens before `await readBankFn` per kid (4538–4576). Append the overlay (skeleton) before the async reads.
- **C18 ⚪ `bindEmojiPicker`: clearing the custom input leaves the stale value** (1615–1617: `if (!v) return`); `maxlength="4"` blocks ZWJ-sequence emoji (1569).
- **C19 ⚪ Eleven exports are internal-only** (grep-verified): `DEFAULT_NAV_TABS`, `readNavTabsPref`, `writeNavTabsPref`, `writeKitchenCustomize`, `writeRewardsCustomize`, `writeScoreboardCustomize`, `renderConnectionStatus`, `historyTypeIcon`, `renderBellDropdown`, `renderBonusDaySheet`, `renderOfflineBanner`. Drop `export`.
- **C20 ⚪ Tab-pref readers can return an empty `tabs` array** (`readKitchenCustomize` 675, `readRewardsCustomize` 721) — the "keep at least one" guard lives only in the toggle UI (1028); corrupted data renders a page with zero tabs. Add a non-empty fallback.

### 3.2 Phase B — UX, accessibility, spec compliance

- **C21 🟠 `renderMealPlanSheet` violates §5.24/§12 on four counts** (5059–5155, used by calendar.html:1786): banned slot tabs (5109), lone full-width Save instead of `fs-footer` Cancel+primary (5153), no `sheet__header` ✕, Save never disabled with nothing selected — plus no empty-library state (5123). It near-duplicates kitchen.js's compliant `openPlanMealSheet`; consolidating on that fixes all five.
- **C22 🟡 Emoji in chrome (banned), 7 sites:** overdue banner ⚠️/▸ (2132–2134), `renderErrorState` ⚠️ (1413), bell activity icons 🛍️➕➖✅❌🎉📋 (3866–3873) + 🏦 (3894) — `historyTypeIcon` (2384) was already converted to SVG for exactly this reason and the bell list wasn't — Bonus Day header 🎉 (4097), vote sheet 👍 (5548) + 🏆 (5543), and the app-supplied `📅 ` prefix on event card names (2063). Each has an SVG sibling in-file to swap to.
- **C23 🟡 Inline `style=""` in generated HTML, 6 sites:** showConfirm reason textarea (4144), `#dt_sectionsNudge` display:none (3481), meal-detail not-found padding (5282), `renderScoreCard` (2246) and `renderApprovalRow` (2484) owner-color (should use `data-owner-color` + `applyDataColors` like siblings), `renderDashboardTile` tile-icon-color (4228).
- **C24 🟡 Bottom sheets claim `role="dialog" aria-modal="true"` but have no focus management, no Escape, no label** (1427). Tab escapes the sheet; Escape does nothing (only showConfirm handles it). Add a shared open-helper with focus trap + Escape + `aria-labelledby` (pairs with C13).
- **C25 🟡 `showConfirm` auto-focuses the reason textarea on open** (4184) — keyboard pops immediately in deny-reason flows (4779/4860), violating §12's auto-focus rule. Focus the OK button unconditionally.
- **C26 🔵 Task form "Exempt from scoring" is a chip-toggle, should be a switch** (3341–3343; `renderSwitchToggle` exists at 1696, unused here — §5.23 names this exact control). Event form end-date chip shows raw ISO (`'✓ Ends ' + esc(event.endDate)`, 2969) instead of `formatDateShort`.
- **C27 🔵 Keyboard-unreachable controls:** `.ef2-repeat-option` are click-only `<div>`s (5428); overflow-menu buttons lack `role="menuitem"` (2565); person-filter sheet likewise (2607); `ef2-person-chip` exposes no `aria-pressed` (2887–2890, 3248–3251) so primary/attending is visual-only.
- **C28 🔵 `showToast` has no `role="status"`/aria-live and toasts stack** (4192–4198) — spec says max 1 visible, queue the rest. Add the role and reuse/replace the node.
- **C29 🔵 `renderMealDetailSheet` hero `onerror` is inline JS and bypasses the self-heal pipeline** (5386: `onerror="this.parentElement.remove()"`) — §6.10 says hero errors should fire `window.__krImgError(recipeId)`.
- **C30 🔵 `renderHeatmap` data is title-attribute only** (2682) — unreachable on touch (phone-first app) and the title is unescaped. Tap-to-show or `aria-label` summary.
- **C31 ⚪ Iconography drift:** Kitchen icon differs between `renderNavBar` (474, whisk) and `initNavMore` (567, pot); Scores too (476 vs 569). Cook mode uses text glyphs `←✕‹›` in buttons (5222–5235). Color swatches use the raw hex code as `aria-label` (56).
- **C32 ⚪ Sub-sheet dismissal inconsistency:** avatar editor / photo-source / iCal-URL overlays don't close on backdrop tap while every `renderBottomSheet` consumer does. Pick one behavior.
- **C33 ⚪ `event.url`/`meal.url` go into `href` with only HTML-escaping** (3020, 5378) — `esc()` doesn't block `javascript:` URLs. One-line `https?:` scheme check.

### 3.3 Cross-cutting answers recorded

- **XSS surface beyond DB7:** `renderEmptyState` icon/title/subtitle raw (1396–1400), `renderUndoToast` message raw (1370, current callers safe), user-authored `category.icon` raw in task card + detail sheet (2064, 3061), `renderScoreCard` badgeIcons raw (2225), `renderHeatmap` title raw (2682), plus unescaped-but-currently-safe ID/color attribute interpolations drifting from the file's own esc() convention (1945, 3941, 4103, 2795, 3022–3023, 3107, 3120, 3159, 3268).
- **Repeat-day tokens match state.js exactly** (5421 vs state.js:383) — S7 resolved as "no bug, fragile contract stands."
- **No `window.confirm`/`alert` anywhere in the file.** ✓
- **Event/Task forms are largely §5.23-compliant** (sticky footers, synced disabled saves, date pills, time picker, no auto-focus) — gaps are C26 and C13 only.

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

## 5. Calendar (calendar.html · shared/calendar-views.js · styles/calendar.css)

### 5.1 Phase A — bugs, correctness, duplication

- **CAL1 🔴 The Add flow is unreachable — calendar has no FAB.** `openAddMenu()` (calendar.html:766) and its entire downstream tree — `openImportEventsSheet` (:800), `openIcalImportSheet` (:826), `openCalendarPhotoImport` (:874), `openTextEventSheet` (:1005), `openImportEventsConfirm` (:1058) — are never called. `renderFab` isn't imported and no FAB markup exists (:21–32). Users cannot create an event or task from the calendar page at all; the month panel empty state even says "No events — tap + to add" (calendar-views.js:721) — a button that doesn't exist. §6.2 requires the FAB. Fix: render `renderFab` → `openAddMenu` (mirroring dashboard.js:180). ~400 lines of import code are currently dead.
- **CAL2 🔴 Day-view swipe listeners leak across views — multi-fire navigation.** `bindDayViewEvents` attaches touch handlers under `daySwipeController` (calendar.html:658–673) only aborted on the *next* day-view bind. After visiting Day view once, a week-view swipe mutates `viewDay`, fires an extra `render()`, *and* runs the week handlers. Abort the controller at the top of `render()` or guard on `currentView`.
- **CAL3 🔴 Week-strip swipe double-navigates — jumps two weeks.** The strip has its own swipe handler (±7 days, threshold 50, :536–556) and the page-level handler on `main` also handles week view (±7, threshold 60, :2523–2543). One gesture can advance 14 days (and between 50–60px only one fires — inconsistent feel). Remove one of the two.
- **CAL4 🟠 Full schedule rebuilds wipe calendar's moves, delegations, notes, and slider overrides.** *(Same root cause as DB1/SC2 — confirmed here too.)* Move (:2208–2226), Delegate (:2146–2177), Delegate+Move (:2180–2200) write only schedule entries; `generateSchedule` strips uncompleted future entries and `movedFromDate`/`delegatedFromName`/`notes` (:2093) appear nowhere in scheduler.js. Completing a cooldown task (:740) also nulls that task's future entries including manual moves. One fix in the scheduler (preserve entries carrying these markers) repairs both pages.
- **CAL5 🟠 Event "mirror" schedule entries are write-only decaying data — 5 write sites** (:1139, :1433, :1440, :1703, :2610); every renderer filters them out, every rebuild strips them, and they force O(all-dates) scans on event move/delete (:1425–1431, :1461–1467, :1961–1968). Matches DB19 — recommend dropping the writes entirely.
- **CAL6 🟠 `defaultView: 'day'` boots into a broken view.** Admin offers Day as a default (admin.html:2572–2575) but `viewDay` initializes to null (:103) and is only set when the user clicks the Day tab (:449) — first render calls `formatDateShort(null)`. Initialize `viewDay = today`.
- **CAL7 🟠 No error handling/toast on completion and move writes.** `toggleTask` mutates local state then awaits writes bare (:695–721); same for delegate/move/skip (:2174, :2196, :2223, :2232), notes (:2093), meal plan (:1903–1921). The event form does it right (:1445–1450) — extend that pattern.
- **CAL8 🟠 No schedule listener — cross-device task changes never appear.** Calendar subscribes to completions + events only (:2552–2561); a move/new task from another device is invisible until reload. The `closeTaskSheet` comment (:1983–1984) claims a listener that doesn't exist.
- **CAL9 🟠 Month view calls `getEventsForDate` per cell — amplifies the state.js expansion bugs and cost.** ~31 cells + day panel per render (calendar-views.js:652–685, :715), each O(event-age) from the event's origin (a year-old daily repeat ≈ 11k iterations/render, re-run per 100ms listener echo). Also makes S1/S3 user-visible: drifted monthly dots and invisible continuation days. Agenda is the only view using `getEventsForRange` (:817–832). Mitigation: one range call per month/week, bucketed by day.
- **CAL10 🟠 Editing or deleting a recurring occurrence silently affects the whole series.** Virtual `__rpt_` IDs resolve to the parent (:1935–1936, "reserved for Pass 2") and Edit/Delete rewrite the base event with no occurrence-vs-series prompt (:2719 too). Deleting one Tuesday's soccer practice deletes every week. At minimum warn in the confirm.
- **CAL11 🟡 Three divergent event-delete paths.** Form delete (:1453–1476) and detail-sheet delete (:1957–1973) clean up mirror entries; quick-actions delete (:2748–2754) doesn't (orphans mirrors); quick-actions duplicate (:2741–2747) pollutes the local cache with an `id` field. Extract one `deleteEvent(id)` helper.
- **CAL12 🟡 iCal "Subscribe (iCal URL)" doesn't subscribe and has no dedup.** The calendar flow (:826–872) is a one-shot import: no `icalFeeds` record, no source UID on imported events — importing the same URL twice duplicates everything. Persistent feeds live only in admin (:1121–1327) and calendar never syncs them on load. Rename to "Import once" or route through the feed store; store `{source, uid}` for dedup.
- **CAL13 🟡 Both density toggles are dead controls** — month renders hardcoded `monthCompact: true` (:264) and `renderMonthView` never reads it (calendar-views.js:668–678); week cozy CSS targets only legacy classes (calendar.css:690–701). §6.2 explicitly bans density modes — delete toggles, prefs, and CSS.
- **CAL14 🟡 Substantial dead code:** 15 unused imports (:41–49: `renderNavBar`, `initNavMore`, `renderTaskCard`, `renderTimeHeader`, `renderEmptyState`, `renderUndoToast`, `renderGradeBadge`, `renderPersonFilter`, `openDeviceThemeSheet`, `writeSettings`, `initColorButton`, `renderRepeatSheet`, `monthStart`, `weekEndForDay`, `renderWeekView`); `bindPersonFilterEvents` (:474–489) never called; legacy `renderWeekView` (calendar-views.js:407–462) + bindings unreachable; `suppressedCooldownTaskIds` computed 3× and never read (:155, :746, :2554); `__evtGesturesAttached` guard always false (:2802–2803); `renderWeekDayPanel` ignores 3 of its params (calendar-views.js:269).
- **CAL15 🟡 Heavy duplication:** `openImportEventsConfirm` (:1058–1148) vs `openCalEfImportConfirm` (:1644–1713) ~90% identical; delegate/move/delegate-move share the same write block 3× (:2166–2174, :2188–2196, :2214–2223) — which also exists in dashboard.js; import loops write per-event sequentially with no partial-failure feedback (one batched `multiUpdate` would be atomic); one import path refreshes `allSchedule` after writing, the other doesn't (:1141 vs :1706).
- **CAL16 🟡 `JSON.parse(calPrefsRaw)` unguarded at module top (:81–82)** — one corrupt localStorage value bricks the page on the loading spinner. Wrap in try/catch.
- **CAL17 🟡 View-switch `saveCalPrefs()` is a no-op** (:443–453 never sets `calPrefs.defaultView`) — "remember last view" never happens.
- **CAL18 🟡 Completing a task in Week view gives no press feedback** — `toggleTask` selectors (:688) and `.cal-task--completing` CSS (calendar.css:556–576) miss the live `.cal-wstrip-panel__task` rows; the row sits inert for the 400ms timeout. Add the selector + CSS variant.
- **CAL19 🔵 `attachEventGestures` rough edges (:2764–2793):** zero movement threshold cancels long-press on finger jitter (vs 10px in `bindTaskRowGesture`); 800ms hardcoded ignoring `settings.longPressMs`; capture-phase click intercepts `.cal-search__result` taps, making their handler (:2703–2709) dead and opening the detail sheet under the search sheet.
- **CAL20 🔵 Escaping gaps:** `renderDayTaskRow` injects `person.color`/`entryKey`/`cat.icon` unescaped (calendar-views.js:529–535) while the sibling grouped path escapes them (:560–571); AI/iCal-supplied `ev.date` goes into a `value` attribute (:1074, :1654) and a Firebase path (:1139) without validation.
- **CAL21 🔵 Meal-plan sheet date bugs:** `openCalMealPlanSheet` reads the slot raw (:1784) — vote-array slots yield `undefined` (this is what `normalizePlanSlot` is for); after changing `mp_date`, remove-link/slot-tab lookups still use the original date (:1816–1829) while submit uses the new one (:1892) — you can "remove" from a day you're no longer viewing.
- **CAL22 ⚪ Misc:** stale view-type comment (:100); `migrateEventCategories` gated on per-device localStorage (:2568) re-scans on every new device; quick-add focus calls + `autofocus` attr (:1167, :2263, :1025, :2648) violate the §12 no-autofocus rule (forms; search input arguably exempt).
- **CAL23 ✅ Day-sheet ordering verified spec-compliant** (Events, then Monthly → Weekly → One-Time → Daily; calendar-views.js:509–518, :339–344).
- **CAL24 ✅/🟡 Past-daily tap blocking works on calendar, missing on dashboard** (calendar-views.js:364–366, :524–531; calendar.html:513/:612) — confirms DB11; dashboard should adopt the calendar behavior.

### 5.2 Phase B — UX / spec compliance

- **CALB1 🟠 DESIGN.md §6.2 is badly stale — shipped calendar contradicts it on five points.** Spec says Month/Week/Day, default Week, month *hidden* on phone. Shipped: a 4th Agenda view, default `agenda` (:90), and a full mobile month grid with dots + day panel (calendar-views.js:636–698; commits e52728a/2c6df2f). The redesign is clearly intentional — rewrite §6.2 to match it.
- **CALB2 🟠 Two items on §6.2's own banned list are present:** `.cal-page { overflow: hidden; height: 100dvh }` (calendar.css:4 — also banned by §12 outside kiosk), and the density toggles (CAL13).
- **CALB3 🟠 Agenda (the default view) opens 30 days in the past with no scroll-to-today** (calendar-views.js:813–814) — every app open shows month-old events first. Anchor-scroll to today or hide the past behind "Show earlier."
- **CALB4 🟡 Day content is inconsistent across views** against the spec's consistency rule: month panel = events only (:704–752); week panel = events + tasks, no meals (:269–405); day view = events + tasks + meals (:467–630). Reuse one day-panel renderer.
- **CALB5 🟡 Person filter diverged from spec (header "View as" chip + switcher sheet, :282–354)** — arguably better but undocumented; and in linked-person mode every switch writes the whole person object with no error handling (:344–349).
- **CALB6 🟡 Month-cell "tap-again to open Day" is undiscoverable** (:579–592). Add a chevron/"Open day" affordance in the panel header.
- **CALB7 🟡 Emoji in interactive chrome:** `👍 Vote · N options` button (calendar-views.js:592) and raw 📅 in the agenda empty state (:847).
- **CALB8 🟡 A11y gaps:** month cells labeled by bare day number (no month, no `aria-current`, no selected state — :681–684; week strip does it right at :247); view switcher `role="tab"` without `aria-selected` (:782–786); people conveyed by color alone on dots; long-press is the only path to detail with no keyboard equivalent; prev/next rely on `title` only.
- **CALB9 🟡 No boot error state** — any rejected read at :63–65 leaves "Loading..." forever.
- **CALB10 🟡 Hardcoded colors in calendar.css:** `#fff` ~15× (:155, :782, :1259, :1639), rgba text-shadows, while siblings use `var(--on-accent)` (:1244, :1512, :1731); JS fallbacks `#5b7fd6`/`#4285f4` hardcoded. z-index all within band ✓; reduced-motion present ✓.
- **CALB11 🔵 Dead CSS ≈350+ lines:** legacy `.cal-week__*` block (calendar.css:55–292, :690–701, :723–803), avatar-strip block (:1322–1461), person-pill mobile rules, old `ef-*` form styles (:652–688), `.cal-grid__event` stacked rows (:936–973), superseded panel-time classes, `.cal-day__person*` (:317–340).
- **CALB12 🔵 The (currently dead) import/quick-add sheets predate the form system** — legacy `sheet__*` structure, inline styles, raw `<input type="date">` (:830–841, :913, :946–947, :972, :1009–1016, :1070–1075, :1654). Reviving them (CAL1) should include a §5.23 rebuild.
- **CALB13 ⚪ Polish:** agenda multi-day span badge prints raw ISO dates (calendar-views.js:902); `buildTimeAxisGrid` uses inline style positioning (:120, :162) vs the `data-timegrid-pos` pattern; nested scroll containers in month view (calendar.css:27–30, :1913–1917); weather chips per §6.2 absent (roadmap).

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

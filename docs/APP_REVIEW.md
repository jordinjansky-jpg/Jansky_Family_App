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
| 6 | Kitchen | kitchen.html, kitchen.js, shared/kitchen-ical.js, styles/kitchen.css | ✅ Done |
| 7 | Tracker | tracker.html, styles/tracker.css | ✅ Done |
| 8 | Scoreboard | scoreboard.html, styles/scoreboard.css | ✅ Done |
| 9 | Rewards | rewards.html, rewards.js, styles/rewards.css | ✅ Done |
| 10 | Kid mode | kid.html, styles/kid.css | ✅ Done |
| 11 | Person mode | person.html | ✅ Done |
| 12 | Admin | admin.html, styles/admin.css | ✅ Done |
| 13 | Setup wizard | setup.html, styles/setup.css | ✅ Done |
| 14 | Activities | activities.html, shared/timer.js, styles/activities.css | ✅ Done |
| 15 | Support modules | shared/weather.js, ai-helpers.js, push-client.js, push-ui.js, dev-banner.js | ✅ Done |
| 16 | Worker & PWA | workers/kitchen-import.js, sw.js, manifest.json, serve.js | ✅ Done |
| 17 | Base CSS | styles/base.css, layout.css, components.css, responsive.css | ✅ Done |
| 18 | Docs drift | CLAUDE.md, DESIGN.md, ROADMAP.md vs reality | ✅ Done |

---

## Fix-pass results (2026-06-11)

A fix pass has been applied on this branch (commit ledger in [FIX_LOG.md](FIX_LOG.md)).
Legend: ✅ fixed · 🔶 partially fixed · ⬜ open. Findings not listed in a row are open.
**All 🔴 criticals are fixed** except W3 (accepted risk, documented below).

| Area | ✅ Fixed | 🔶 Partial | ⬜ Open (notable) |
|---|---|---|---|
| §1 Foundation | U2, U4–U7, S1–S5, S8, F1–F3, F6, T1, T3–T6 | S7 (verified, shared constant not extracted) | U3, U8, S6 (product call), F4, F5, F7 (docs), T2 (docs), D1–D3 |
| §2 Engines | SC1, SC2, SC4–SC6, SC8, SR1–SR3, SR5, SR7, SR9 | SC7 (UI hint added; rename not) | SC3 (week-definition decision), SC9, SR4, SR6, SR8 |
| §3 Components | C1–C9, C16, C20, C22, C25, C29, C33 (+ new find: repeat END conditions were ignored app-wide — fixed) | C23 (confirm textarea done; 5 inline-style sites left), C26 (date format done; exempt switch not) | C10–C15, C17–C19, C21, C24 (sheet Escape/focus trap), C27, C28, C30–C32 |
| §4 Dashboard | DB1–DB13, DB15–DB19, DB23, DB30, DB32, DB33 | DB14 (stale comment swept; verify imports), DB28 (🤔 + tile 👍 → SVG; 🍴 left), DB29 (2701 fixed; legacy sheet__content left) | DB20, DB21 + DB22 (need visual), DB24–DB27 (doc decisions), DB31, DB34 |
| §5 Calendar | CAL1–CAL10, CAL12 (label), CAL16, CAL17, CAL22, CALB3, CALB9, CALB13 | CAL11 (dup id fixed; unified deleteEvent helper not), CAL14 (legacy view deleted; unused imports left), CALB7 (agenda+sheet SVG; day-row 👍 left) | CAL13, CAL15, CAL18–CAL21, CALB1 (docs), CALB2 (needs visual), CALB4–CALB6, CALB8, CALB10–CALB12 |
| §6 Kitchen | K1–K5, K7–K10, K12, K13, K17, K19, K23–K26, K29–K31, K36, K39, K42 | K6 (same-device serialization; cross-device tallies still whole-array), K16 (in-flight flag; loading sheet not), K22 (routing fixed via K8; gate decision open), K37 | K11 (image-storage decision), K14, K15, K18, K20, K21, K27, K28, K32–K35, K38, K40, K41, K43–K45 |
| §7 Tracker | TR1, TR2, TR6 | — | TR3–TR5, TR7–TR12 (TR9 = wire the shipped filter sheet) |
| §8 Scoreboard | SB1, SB2, SB8 | — | SB3–SB7, SB9–SB14 (SB4/SB14 ride the week decision) |
| §9 Rewards | R1, R2, R6, R9 | — | R3 (stock counting — needs a counting-rule decision), R4, R5 (refund type — product), R7, R8, R10–R18 |
| §10 Kid | KD1–KD6, KD8, KD13 | — | KD7, KD9–KD12, KD14, KB1–KB11 (celebration/CSS architecture — needs visual session) |
| §11 Person | P1, P2 | P3 (parity comment added) | — |
| §12 Admin | A1–A14, A18, A20, A23 | A16, A24–A26, AB4, AB5 | A17, A19 ✓(verified), A21, A22, A27, AB1 (docs), AB2, AB3, AB6–AB11 |
| §13 Setup | SU1, SU2, SU6, SU8 | — | SU3 (accepted), SU4, SU5, SU7, SU9–SU15 |
| §14 Activities | AC1–AC6, AC9, AC11–AC14, AC16, AC20 | — | AC7 (pace mismatch), AC8 (spec contradiction), AC10, AC15, AC17–AC19, AC21–AC31 |
| §15 Support | SM1–SM4, SM6, SM9 | — | SM7, SM10 (SM5/SM8 verified-good) |
| §16 Worker/PWA | W1, W2, W4–W7, W11, SW1–SW4 | — | W3/W9/W12 (accepted-risk, documented), SW5, SW7 (W8/W10/SW6 verified-good) |
| §17 CSS | CSS5, CSS12, CSS14, CSS15, CSS25 + scoreboard A.5 | CSS24 (confirm-message contrast only) | CSS1–CSS4 (doc/build decisions), CSS6–CSS11, CSS13, CSS16–CSS23, CSS26, CSS27 |
| §18 Docs | — | — | All (one re-sync PR) |

### Suggested next-session plan

1. **Verify on a real screen first (your machine, `node serve.js` + Playwright at 412×915).** This pass is syntax-checked and logic-reviewed but has never run in a browser. Smoke-test at `?env=dev`: dashboard toggle/move/undo, calendar FAB + month/week views + a repeating event with an end date, kitchen plan/vote/cook-mode from the dashboard tile, a reward approve/deny, admin person delete (test data!), setup wizard end-to-end. Fix anything the screenshots surface.
2. **Deploy steps:** merge → frontend auto-deploys; run `npx wrangler deploy --config workers/wrangler.toml` for the Worker (batch-2 security + settlement fixes are dormant until then); add a Cloudflare dashboard rate-limit rule on the Worker route.
3. **Three product decisions to make (10 minutes, unblocks a batch each):** (a) one "week" definition app-wide — recommend Monday everywhere, surfacing the weekStartDay setting as display-only; (b) wishlist — recommend deleting the schema; (c) recipe images — recommend 320px thumbnails on cards + lazy full image, the biggest perf win available.
4. **Visual-polish batch (needs the browser open):** DB21/DB22 (Today empty state + day chevrons), CALB2 (remove the calendar page-scroll lock), kid-mode KB1–KB7 (two-celebration consolidation, parent escape, reduced-motion toast, tap targets), CSS24/CSS26 contrast + tap-target sweeps.
5. **Mechanical sweeps batch (safe, no browser needed):** remaining emoji-in-chrome (K21, SB9, KB6, AC28, day-row 👍), inline styles (K20, AB5 rest, KD14, SB13), dead code/CSS (C10–C15, K15, K27, A21/A22/A27, CALB11, CAL14 imports), TR9 filter-sheet wiring, R3 stock counting, AC7 pace formula.
6. **Docs re-sync PR (§18):** update DESIGN.md (calendar §6.2, admin §6.5, rewards §6.7, theme §10.1, type scale §3.2, tablet §4.2 → "planned", timer §5.10, FAB contradiction) and CLAUDE.md (file tree, module rules, past-completion nuances) so future sessions stop fighting a stale spec.


**425+ findings across 18 areas: 13 critical, ~45 high.** The app is feature-rich and the recent form-system work shows; the dominant problems are (a) the schedule rebuild destroying user data, (b) dev-mode writes leaking to production, (c) an unsecured Worker, and (d) a spec that no longer describes the shipped app.

### All 🔴 Critical findings

| ID | Area | One-liner |
|---|---|---|
| SC1/A5 | Scheduler | Dedicated-day placement on a past date **replaces the whole day's schedule node** — wipes other tasks' entries + orphans completions; triggered by 5 routine admin actions |
| DB1/CAL4 | Dashboard/Calendar | Moves, delegations, skips, notes, slider overrides are **silently undone by any schedule rebuild** |
| CAL1 | Calendar | **No FAB — events/tasks cannot be created from the calendar at all**; ~400 lines of add/import code unreachable |
| CAL2/CAL3 | Calendar | Swipe-listener leak across views + double-bound week swipe (jumps 2 weeks) |
| K1 | Kitchen | "Add to list" on a planned meal calls an **undefined function** — guaranteed crash |
| K2/A1 | Kitchen/Admin | Hardcoded `rundown/` refs — **`?env=dev` testing writes to production** (list check-offs, person CRUD, autoPrune, email imports) |
| K3 | Kitchen | Vote sheet + Cook mode CSS only loads on Kitchen — **unstyled/broken on Dashboard, Calendar, Kid** |
| A2/F2 | Admin | Person deletion orphans ~12 data trees (push subs, earnings, streaks, snapshots, schedule entries, owner arrays…) |
| A8 | Admin | iCal & school-lunch **feed deletion is broken** (`showConfirm('string')` throws) |
| R1 | Rewards | Tapping a dimmed card **bypasses streak/stock/expiry gates** — kids can buy locked/out-of-stock rewards |
| W1 | Worker | AI endpoints **unauthenticated behind `*` CORS — anyone can spend the Claude API key**; no rate limiting (W2); approval HMAC forgeable (W3) |
| AC1 | Activities | Editing/deleting an older session **permanently deletes settled points** (Worker never re-settles past periods) |
| SU1 | Setup | Non-atomic settings-first final write can **brick onboarding** (half-created family, wizard locked out) |
| CSS12 | CSS | Retired token `--bg-secondary` used → confirm-row press state renders nothing |

### Recommended fix-pass order

1. **Stop the bleeding (data):** SC1 + SC2-family (one scheduler fix), K2/A1 dev→prod writes, A8 feed deletes, K1 crash, AC1+AC2+AC3 earnings, SU1 setup atomicity, R1 reward gates, C2/R2 double-tap approval guards.
2. **Security:** W1+W2+W3+W4 Worker hardening (one task).
3. **Restore broken UX:** CAL1 FAB, CAL2/3 swipes, K3 CSS move, KD1 celebration mount, DB5/T1 theme propagation, A9 badge awarding, SB2 scoreboard crash.
4. **Cross-cutting sweeps** (see "Consolidated cross-cutting themes" at the end): error-handling wrapper, escaping, emoji/inline-style sweeps, dead code, gesture consolidation, week definition, timezone audit.
5. **Docs re-sync** (§18): one PR updating DESIGN.md/CLAUDE.md to match every intentional divergence, marking the rest "planned."


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

## 6. Kitchen (kitchen.html · kitchen.js · shared/kitchen-ical.js · styles/kitchen.css)

### 6.1 Phase A — critical

- **K1 🔴 `addRecipeIngredientsToList` is called but never defined — guaranteed ReferenceError.** kitchen.js:1388 (the `mdAddToList` handler in the slot-edit sheet) calls a function that exists nowhere in the repo. Tapping "Add to list" on a planned meal from the Meals tab clears the sheet, then throws — the user silently gets nothing. Fix: route to the existing `openAddToListReviewSheet(...)` like the Recipes-tab path does (1773–1776).
- **K2 🔴 Direct `getDb().ref('rundown/...')` writes bypass the dev-mode root — dev testing writes to production.** *(Same class as A1.)* Seven hardcoded refs: toggleItem check/uncheck (3588, 3612), staple delete (4062, 4134), staple rename (4120), item/staple category (4457, 4493). Checking a list item at `?env=dev` mutates the live family list. Also violates the "firebase.js is the only DB module" rule. Add the missing helpers to firebase.js.
- **K3 🔴 `.vote-card`/`.cook-mode`/`.who-overlay` CSS lives only in kitchen.css, but those shared components open on Dashboard/Calendar/Kid.** `openVoteSheet` and `openCookMode` are called from dashboard.js:1650/1965 and calendar.html:1747, yet all their CSS sits in kitchen.css:893–1009/1175–1219 (zero matches in components.css). The vote sheet renders unstyled and Cook mode loses its full-screen `position:fixed` shell on every non-Kitchen page. §6.10 moved the `rd-*` CSS to components.css for exactly this reason — vote/cook were missed. Move the blocks + bump `CACHE_NAME`.

### 6.2 Phase A — high

- **K4 🟠 iCal re-sync misroutes its own entries.** `mapEventsToPlan` checks `dayPlan['school-lunch'].source === 'ical'` (kitchen-ical.js:75, :81) — but slots are now arrays, so `.source` is `undefined`; every re-sync treats its own prior entries as foreign, spills lunches into `school-lunch-2`, and reports phantom conflicts. Normalize with `normalizePlanSlot(...)[0]?.source`.
- **K5 🟠 "Add another option" wipes all existing votes.** `onAddAnother` (1458–1472) keeps only recipeId/name and the vote-mode save (1210–1223) writes every candidate fresh with `votes: {}`. Adding a 3rd option discards every vote cast. Carry `votes`/`addedAt`/`addedBy` forward by matching candidates to existing options.
- **K6 🟠 Vote tallies aren't race-safe — whole-array last-write-wins.** The toggle handler copies the entire options array and persists via `.set()` on the whole slot (components.js:5583–5594 → kitchen.js:1438–1439). Two family members voting near-simultaneously (the headline use case) clobber each other. Write the single vote leaf (`…/{slot}/{i}/votes/{viewerId}`) or use a transaction.
- **K7 🟠 `planCache` staleness lets single-mode saves clobber votes and misallocate school slots.** The Plan-a-meal sheet trusts `planCache` (749–756, 880–882, 741–746, 1260–1271), which is only populated by the Meals tab's visible window. Opening the planner from the Recipes tab or picking a far date sees an empty day — saves overwrite an existing vote with no confirm. `await readKitchenPlan(day)` in the save handler.
- **K8 🟠 School-lunch slot keys fall through to Dinner in the planner.** Line 770 maps unknown `preSlot` to `'dinner'`, and two real entry points pass `'school-lunch'`/`'school-lunch-2'`: the school nudge row (392–427) and "Change meal" on a planned school lunch (1391–1394) — saving replaces *dinner* and leaves the school entry untouched. Map `school-lunch*` → `'school'` first.
- **K9 🟠 `runListCleanup` deletes any item the model fails to echo back** (4374–4396) — a truncated/lossy-but-successful Claude response silently deletes groceries with no confirm or undo (hard failures are null-guarded and safe, 4336–4350). Sanity-gate: abort or confirm when removals exceed ~30%, or show a review sheet like photo→list does.
- **K10 🟠 "Highest rated" sort uses the legacy `rating` field** (603) instead of the `ratings` map — multi-person-rated recipes sort 0 vs 0. The Top-rated *filter* does it right (555–558). Sort by `avgRating(r).avg ?? 0`.
- **K11 🟠 Unbounded base64 recipe images in RTDB — every page pays for all of them.** Imports store ~100–250KB data URLs per recipe; a 100-recipe library is 10–25MB, and `readKitchenRecipes()` full-tree reads run on load of Kitchen, Dashboard (dashboard.js:53), Calendar (calendar.html:158), and Kid mode. The single biggest data-cost item in the app. Store thumbnails for cards and move originals to a lazily-loaded tree (`kitchen/recipeImages/{id}`).
- **K12 🟠 Meals window and history use device-local dates, not `settings.timezone`** (359–366 vs `todayStr` at 355; also `openMealHistorySheet` 1534–1537) — late at night the window starts on "tomorrow" and the Today pill matches nothing. Derive day 0 from `todayKey(tz)`.

### 6.3 Phase A — medium

- **K13 🟡 Meal History does 31 sequential Firebase reads** (`readKitchenPlanRange`, firebase.js:953–971; sole caller kitchen.js:1547) — 1.5–3s+ of "Loading last 30 days…". *(Confirms F1.)* Use `readAllKitchenPlan` (calendar already does), `Promise.all`, or a keyed range query.
- **K14 🟡 `syncOneFeed` repeats the same serial pattern** — 30 sequential reads + sequential per-day writes (2429–2455); school-lunch confirm save too (2389–2400). Batch with `multiUpdate`.
- **K15 🟡 Large dead-code block including a spec'd-but-unreachable feature:** `openMealFabSheet` (2667), `openListFabSheet` (4150), `openBulkAddSheet` (2697 — §6.10 line 1226 documents it as the live bulk-add path; it's unreachable, and its per-row ✕ has a latent bug that never deletes the pushed Firebase item, 2757–2762), `dedupIngredientsAi` (4405), `mergeQtyAi` (4463), `keepAddFieldOpen` (134), `staplesTopBtn` (3434), `listCleanupBtn` lookups (3472, 4354). Rewire bulk-add or delete + amend the spec.
- **K16 🟡 Auto-categorize runs with zero feedback** — the AI sheet closes itself (2654–2658), the button it tries to lock doesn't exist (4354–4355), nothing prevents a second overlapping cleanup. Show the `.ai-loading` sheet + an in-flight flag.
- **K17 🟡 No loading state for recipe URL import** (`runImport` 3072–3176) — the form sits inert for seconds and Save isn't blocked mid-import.
- **K18 🟡 Photo→list discards the AI's category and qty** (4281–4283 vs 4314–4319) then re-categorizes the same items with N more Worker calls. Pass the full item through on insert.
- **K19 🟡 Self-heal categorization retries genuine "Other" items forever** — candidates include `category === 'Other'` (4435) but the writer refuses to write `Other` back (4456): 1 Worker call/item/minute while the tab is open. Write Other or stamp `categorizedAt`. (Debounce/cap/skip-checked otherwise verified to spec, 4422–4444.)
- **K20 🟡 Inline `style=""` in HTML strings:** find-recipes sheet (2006–2009), staples sheet (4003–4005, 4019, 4023), photo-context fields (3240, 4245), photo-scan error sheets (4214, 4227–4229).
- **K21 🟡 Ten emoji-in-button violations in the AI Tools sheet** (2577–2596: 📷🖼📄🔗🔎💡🪄 …) — every other source picker in the file already uses the SVG constants.
- **K22 🟡 The `source === 'school'` read-only gate is dead** — nothing writes `source: 'school'`; kitchen writes `'school-photo'` (2398), `'ical'` (2453), `'manual'`. Imported school lunches get a "Change meal" button that then misroutes per K8. Match `startsWith('school') || 'ical'` or drop the gate deliberately.
- **K23 🟡 Filter badge/Clear fight the Customize default sort** — `filterCount` counts `sort !== 'alpha'` (612–615) so a "Recently added" default shows a permanent "· 1" badge, and Clear resets to alpha overriding the saved pref. Compare against `kPrefs.recipesSort`.
- **K24 🟡 Single-mode plan writes omit `addedAt`/`addedBy`** (1244–1254, 1277–1284; school/iCal too) — makes the U5 `pickWinner` tie-bias latent rather than impossible. Stamp every option write.
- **K25 🟡 `bindLongPress` is touch-only** (100–119) — mouse/kiosk users cannot rename/delete list items or staples at all (3559–3563, 4038–4040). Use pointer events / the shared helper.
- **K26 🟡 kitchen.css violations:** `.cook-mode` z-index 100 (899) and `.who-overlay` z-index 200 (1226) outside the 0–60 band with no audit comment; `.who-overlay` hardcodes `rgba(0,0,0,0.4)` (1225).
- **K27 🟡 Dead CSS:** `.day-block__slot--option`, `.day-block__vote-chip` (1148–1161), `.day-block__multi-badge` (1164–1173, self-admitted legacy), `.day-block__slot-school` (148–154), `.recipe-library*` (157–168), `.rl-find-btn` (289–291), `.kait-soon` (508–512), `.kp-vote-placeholder` (1283–1287), `.rrs-star__half--*` (794–807).
- **K28 🟡 Vote toggle silently no-ops when the voter prompt is cancelled** (1479–1511 → components.js:5585) — dead 👍 buttons with no hint. Re-prompt on tap or show helper text.

### 6.4 Phase A — low / nits

- **K29 🔵 Meal history shows `options[0]`, not the vote winner** (1590–1591) — `pickWinner` is already imported.
- **K30 🔵 "All done" clear removes items one-by-one** (3604–3610, 3843–3846) — each remove triggers a full re-render. One `multiUpdate`.
- **K31 🔵 Second-school picker highlights the *first* picker's selection** (1167–1190) and never shows its own.
- **K32 🔵 Import image conversion isn't awaited** (3098–3110) — fast Save stores the expiring CDN URL (self-heal eventually fixes it; avoidable).
- **K33 🔵 URL/photo import wipes hand-typed ingredients without confirmation** (3134–3140).
- **K34 🔵 Slot-edit servings stepper is display-only and "Change meal" drops `entry.servings`** (1336–1361, 1391–1394) — partial break of the §6.10 continuity chain (the main path verified working).
- **K35 🔵 File-input leak in `openListPhotoSourceSheet`** (4188–4189) — inputs linger if the OS dialog is cancelled.
- **K36 🔵 `selfHealRecipeImage` writes the whole recipe from a possibly stale snapshot** (66–75) — concurrent edits overwritten; use leaf writes. (Pipeline otherwise verified correct: sync set-before-await, global cap, banner threshold, reset-on-save.)
- **K37 ⚪ Misc:** `recipeFilter` comment says 'favorites', code does 'top-rated' (135–139); `Object.values` wrapping an array (3509–3511); unused `const id` (4144); `kr_photoCtx` escapes only `"` (3242); meal-history double `renderBottomSheet` binds `mh_close` twice. Escaping otherwise solid; no `window.confirm`/`alert`.

### 6.5 Phase B — UX / spec

- **K38 🟡 §6.10 compliance largely verified ✓** (tabs+wand, customize prefs, nudges, dinner-last, sort seeding, density, vote display rule, redirect toast, school dual-pick) — gaps: bulk-add unreachable (K15) and the flagged-recipes banner embeds un-truncated recipe names (648–651) which can wrap to 3+ lines.
- **K39 🟡 Meals tab has no empty state when all slot nudges are off** — N bare day headers with zero rows and no hint. Add a "Tap + to plan a meal" helper. (Recipes and Lists empty states are strong ✓.)
- **K40 🟡 Rating slider has no keyboard support** — `role="slider" tabindex="0"` (2068) with no keydown makes the ARIA contract false; add arrow = ±0.5. Related: vote button has no `aria-label` (components.js:5548); `.day-block__slot` rows are click-bound divs — the whole Meals tab is keyboard-inaccessible.
- **K41 🟡 AI loading/error states inconsistent across the four flows:** photo→list best-in-file ✓; school-lunch has loading but no res.ok check and a surprising "overlay closes but import continues" behavior; URL import nothing (K17); auto-categorize nothing (K16). Standardize on the `.ai-loading` pattern.
- **K42 🟡 `kp_save` lacks the `withButtonLock` every sibling save has** (1203 vs 3324, 2552, 3968) — double-tap double-runs the school second-slot write.
- **K43 🔵 Recipes search re-renders the whole tab per keystroke with a setTimeout refocus hack** (698–710) — scope to `#recipeLibrary` + count label.
- **K44 🔵 iCal feed conflicts surface only as a count** (2483–2485) with no dates; `lastSync` uses device-locale time (2481).
- **K45 🔵 Suggestions (ROADMAP-consistent):** (a) "Add this week to list" — aggregate the visible window's planned-recipe ingredients into the existing review sheet; (b) "Plan again" on Meal History rows; (c) kid-visible list peek (already spec'd future); (d) auto-resolve un-locked votes on the day via `pickWinner` + toast — today the dinner tile says "Vote" forever.

---

## 7. Tracker (tracker.html · styles/tracker.css)

### 7.1 Phase A

- **TR1 🟠 Task delete leaves orphaned schedule entries and completions.** tracker.html:1048–1059 calls `removeTask` only — the comment admits it. Violates the documented critical rule and diverges from dashboard's delete path; orphans accumulate forever. Port the cleanup multi-update.
- **TR2 🟠 Long-press fires while scrolling.** The local gesture copy (566–587) has no movement threshold and no `pointercancel` — touch-scrolling with a finger resting on a card for 500ms pops the detail sheet. Use the shared `bindTaskRowGesture` (10px move-cancel + rapid-tap window built in).
- **TR3 🟡 Editing a task in tracker never rebuilds the schedule** (1010–1045, self-admitted in a comment) — change rotation/owners/day and the grid doesn't change until another page regenerates. Import `buildScheduleUpdates` or toast the limitation.
- **TR4 🟡 `toggleCompletion` is optimistic with no error handling** (1064–1092) — failed write leaves the row showing Done until reload.
- **TR5 🔵 Schedule keys without counters:** `sched_${Date.now()}_delegate` / `_delegate_moved` / `_moved` (728, 751, 779) — the exact pattern the CLAUDE.md counter rule exists to prevent.
- **TR6 🔵 Swipe handlers bound to `document`, not `main`** (1105–1117, contradicting their own comment) — swipes on header/nav also flip periods. Scope to `main`.
- **TR7 🔵 Dead code:** `completionDate`/`formatCompletionDate` (183–187, 220 — also device-local time, a timezone-rule violation); `debugActive` (137); unused imports `openDeviceThemeSheet`, `renderNavBar`, `initNavMore`, `writeSettings`, `loadCachedTheme`, `defaultThemeConfig`, `formatDateLong`, `isComplete`, `dayOfWeek`, `DAY_NAMES_SHORT`, `isoWeekNumber`.
- **TR8 ⚪ Edit-save sets `eventTime: null` unconditionally** (1038) — an event-category task edited here silently loses its time.

### 7.2 Phase B

- **TR9 🟡 §6.4's filter spec is unimplemented and its component shipped dead.** Spec: "Filter" chip → sheet with person/category/status/rotation/completed. Page has person pills only (517–519); `renderTrackerFilterSheet` (components.js:2512) has zero callers (cross-ref C10). Wire it up or amend §6.4 — a busy month can't be filtered by status or category today.
- **TR10 🔵 Cards are keyboard-inert** — `<article>` rows, no role/tabindex/keydown (325). Same fix as TR2 via the shared gesture helper + keydown.
- **TR11 🔵 Person summary says "done this week/month" even when swiped to a past period** (366, 420) — use the period label.
- **TR12 ⚪ Long-press default 500ms ✓ via `settings?.longPressMs ?? 500`** (575) — but note a global `longPressMs` setting silently overrides the documented 500/800 split across pages.
- Empty/loading/error states all present ✓; tracker.css token-clean ✓; segmented tabs use `.tabs--segmented` ✓ (missing `aria-selected`, same nit as SB12). Week math confirmed **Monday-anchored** (90–120) — part of the SC3 week-definition inconsistency.

---

## 8. Scoreboard (scoreboard.html · styles/scoreboard.css)

### 8.1 Phase A

- **SB1 🟠 `location.reload()` after Mark Late-Done** (961–970) — direct violation of the "loadData(); render(), never location.reload()" rule; also discards the open drilldown and scroll position.
- **SB2 🟠 First-achievement unlock crashes the page for new families.** `readAllAchievements()` can return `null`; the auto-award block property-sets on it (287–288) → TypeError → the whole page falls into the error state. Default to `{}` at assignment (line 60).
- **SB3 🟡 Drilldown ignores the per-card cycled period** — cards cycle Today/Month/Year via the badge (`cardPeriods`, 320–326, 420) but `openDrilldown` (596–612) reads only the global `selectedPeriod`. Tap a Month card, get Week numbers.
- **SB4 🟡 Heatmap weeks are Sunday-anchored while everything else is Monday** (`renderHeatmap` hardcodes `weekStartForDayFn(todayKey, 0)`, components.js:2654) and the `weekStartDay` setting is ignored — third anchor in the SC3 inconsistency family.
- **SB5 🟡 "No tasks today" shown for all periods** when `possible === 0` (components.js:2234) — wrong copy on Week/Month/Year cards.
- **SB6 🔵 Dead code:** `wStart`/`wEnd`/`mStart`/`mEnd` (89–92) computed and never used; `debugActive` (96); 11 unused imports (incl. `renderPersonAvatar` — while the drilldown header hand-rolls an avatar div at 705).
- **SB7 🔵 `readScoreboardCustomize` called 6× per render** (393, 417, 429, 509, 715). Read once.
- **SB8 🔵 Period-tab tap writes the entire person record** (563–568) — last-writer-wins against concurrent pref writes (same class as C5). Also: the bell deny path writes `Math.abs(msg.amount)` unguarded (components.js:4801) — `NaN` write on legacy messages; rewards.js's own deny guards it (958).

### 8.2 Phase B (§6.3)

- **SB9 🟡 Emoji bans violated three ways:** achievement emoji strip inside leaderboard card body (307–313 → components.js:2224–2226), category emoji in Category Leaders rows (538) and drilldown bars (742), 👏 inside the kudos **button** (839). Empty-state 🏆 (332) borderline.
- **SB10 🟡 Period tabs include "Today"** — spec says Week | Month | Year. Useful addition; update DESIGN.md rather than removing. Tabs correctly use `.tabs--pill` (no bespoke `sb-period-tabs`) ✓.
- **SB11 🔵 No "Open Store" CTA** — §6.7 lists the balance-card → Store route as primary; the drilldown Balance section (830–834) is a dead end. Add a link-chip to rewards.html.
- **SB12 🔵 A11y drift:** period tabs lack `role="tab"`/`aria-selected` (410–414) while rewards' tabs have both; Late-Done sheet uses bespoke buttons and binds no Escape (944–960). Hero-card keyboard handlers ✓, heatmap `role="img"` ✓.
- **SB13 ⚪ Inline styles:** `#mainContent` display:none (29), generated `style="background:…"` (540) and owner-color (704–705) — use `data-*` + `applyDataColors`. scoreboard.css token-clean, maps grades to `--grade-*` tokens ✓.
- **SB14 🟡 Scoreboard "Week"/"Month" are rolling windows (last 7/30 days, 137–152), not calendar periods** — a fourth definition of "week" in the app (scheduler ISO-Monday, tracker Monday, heatmap Sunday, scoreboard rolling). Decide one model (SC3).

---

## 9. Rewards (rewards.html · rewards.js · styles/rewards.css)

### 9.1 Phase A

- **R1 🔴 Tapping a dimmed (ineligible) card still buys the reward.** `renderRewardCard` hides "Get it" when `canGet` is false, but the whole card is tappable (540–545) and `handleGetReward` (1186–1191) re-checks **only balance** — not `streakRequirement`, `maxRedemptions`, or `expiresAt`. A kid at streak 0 can buy a streak-locked reward; out-of-stock rewards remain purchasable. Re-validate all four gates in `handleGetReward`.
- **R2 🟠 Approvals-tab Approve/Deny have no in-flight or freshness guard** (860–933, 935–973) — this page's copy of C2. Double-tap = two bank tokens + two approved messages; two parents' devices can both approve the same request (no `seen` re-check). `withButtonLock` is already imported (used at 1774) — apply it and re-read the message before acting.
- **R3 🟠 `maxRedemptions` stock only decrements on the kid-approval path.** Stock counting (474–479) counts `redemption-approved`/`reward-used`, but adult save (1198–1227), kid self-serve (1234–1267), and kid functional (1269–1300) write neither — those flows never consume stock; "3 left" is wrong for most of the store. Count `redemption-request` (minus denials) or write a counted type everywhere.
- **R4 🟡 History "Earned" rows don't reconcile with the balance** — history shows `snap.earned` task points (165–180) while the balance credits `snap.percentage × multiplier` (scoring.js:600). A kid sees "+47" while the balance rose 95 (or 190 on a 2× day). Show percentage × multiplier and surface the multiplier.
- **R5 🟡 Denial refunds are invisible to kids and inflate `totalEarned`.** *(Resolves SR3: denied redemptions DO refund net balance via a compensating `bonus` message — both deny paths verified: rewards.js:947–968 and components.js:4784–4810.)* Caveats: `bonus` is excluded from `KID_HISTORY_TYPES` (140–144) so the kid sees "denied" with no visible refund; the refund inflates `totalEarned` and therefore lifetime-points achievements by the reward's cost on every request→deny cycle (scoring.js:636); the bell deny path doesn't guard a missing `msg.amount` (NaN write, see SB8). Consider a dedicated `refund` type counted in balance but not totalEarned, whitelisted for kid history.
- **R6 🟡 No load error state** — `init().catch(console.error)` (1815) leaves the skeleton forever. Scoreboard and tracker both render `renderErrorState` with retry; rewards is the odd one out.
- **R7 🟡 Sparkline mislabeled** — "30-day balance" (350) actually plots daily `snap.earned` task points (317–337), neither balance nor store-point earnings.
- **R8 🔵 No write error handling anywhere** — `sendRequest` (1363–1366) even clears the sheet *before* the writes; offline failure silently swallows the request.
- **R9 🔵 Long-press is 600ms and touch-only** (525–531) — a third timing beside the documented 500/800, and with `contextmenu` suppressed (539) mouse users can't edit a reward at all. Use pointer events + `settings.longPressMs`.
- **R10 🔵 Dead code:** `renderBankTab` (977–979) never called; unused imports `validateStoredId` (while 56–64 hand-rolls exactly that), `renderOverflowMenu`, `openDeviceThemeSheet`, `initNavMore`, `renderNavBar`; dead `result?.balance ?? result ?? 0` (257); local `esc()` (131–133) duplicating `utils.escapeHtml`.
- **R11 🔵 `reward.icon` injected unescaped into the form sheet** (1507 → 1531/1537) — the custom-emoji input accepts arbitrary text that round-trips into innerHTML on next edit. Wrap in `esc()` (cross-ref A13 — same data, admin side).
- **R12 ⚪ Shop search re-renders on every keystroke and re-focuses with caret jump** (502–507). Debounce or patch the list only.

### 9.2 Phase B (§6.7)

- **R13 🟡 §6.7 has fully diverged from the shipped page.** Spec tabs `Custom | Functional | Bounties | Wishlist | Bank`; shipped `Shop | Bank | History | Approve` + a type filter sheet (arguably better). Wishlist has Firebase plumbing (firebase.js:732) and **zero UI anywhere**. Update §6.7 or delete the wishlist schema.
- **R14 🟡 Balance count-up animation specified and missing** (`renderBalanceZone` 339–353 renders a static number). Cheap win.
- **R15 🟡 Kid-mode parity gap:** kid branch gets no offline banner and no bell (89–112) — a kid on flaky Wi-Fi gets silent write failures. Layout parity otherwise honored ✓.
- **R16 🔵 Emoji in empty-state icons** ('📜' 659, '✅' 789, '🎒' 993) vs `''` on the Shop tab (487) — inconsistent; align with the C22 cleanup.
- **R17 🔵 `color: white` hardcoded twice in rewards.css** (254, 305) — use `var(--on-accent)`. Otherwise token-clean, no z-index. ✓
- **R18 ⚪ Three different sheet-dismiss binding patterns in one file** (229–236, 1352–1359, 1624–1630) — candidate for the shared `openSheet` helper (C13).

### 9.3 Cross-cutting answers recorded

- **Bank-token races:** kid use-request properly guards with a fresh re-read (1149–1154) ✓; rewards' own redeem path guards double-tap (`_rewardGetInFlight` 1178–1184, `submitting` 1361–1365) ✓; instant bank "Use" (1132–1147) unguarded but confirm-gated; `removeLatestBankToken` (firebase.js:850–860) removes by type+latest — undo can delete the wrong token if another of the same type was acquired in between.
- **Balance args consistent across rewards/scoreboard** (identical 7-arg `calculateBalance` calls) except the timezone fallback (`'UTC'` vs `'America/Chicago'`) — unify; rewards' `refreshData()` (1809–1813) doesn't re-read activity earnings (stale within a session).

---

## 10. Kid mode (kid.html · styles/kid.css)

### 10.1 Phase A

- **KD1 🟠 Achievement overlay destroys the all-done celebration mount.** `showUnseenAchievements`'s dismiss sets `mount.innerHTML = ''` (kid.html:663) instead of restoring `renderCelebration()` like `showUnseenMessages` does (567–568). Once any achievement overlay has shown, `#celebration` is gone and `showFullAllDoneCelebration` (1742–1743) silently no-ops for the rest of the session — and `recheckAchievements` runs after every completion, so this is common. Restore the mount on dismiss.
- **KD2 🟠 Unescaped task name in the kid task detail sheet** (1823: `taskNameWithEmoji(task.name)` raw) — HTML in a task name renders/executes here. `taskNameWithEmoji(esc(task.name))`.
- **KD3 🟠 Undo of "marked incomplete" loses the original completion record** (1527) — identical to DB10; fix both pages by snapshotting the original record.
- **KD4 🟠 Custom-reward bounty bank token is orphaned on undo.** Kid completion writes a token for *any* bounty reward incl. custom (1462–1473) but undo only removes task-skip/penalty tokens (1538–1543) — a usable orphan token remains. Also schema drift vs dashboard's bounty path (dashboard.js:1140–1148: functional-only, missing `rewardId/rewardName/rewardIcon`) — same action, different token shapes per page.
- **KD5 🟡 Un-toggling a cooldown task doesn't rebuild the schedule** — dashboard runs the rebuild on both directions (dashboard.js:1175); kid.html's copy (1498–1512) is inside the complete-only branch. Stale future entries after un-toggle. (Other rebuild wiring verified matching.)
- **KD6 🟡 Boot-time unseen-message check uses a stale hardcoded type list** (2166, omitting `use-approved`/`use-denied` which are in `VISIBLE_MSG_TYPES` at 517) — message and achievement overlays can fight over the mount. Use the shared constant.
- **KD7 🟡 No write error handling; boot is an unguarded top-level await chain** — any read failure strands the spinner with no error state, and kid mode has no nav to escape from.
- **KD8 🟡 `checkCelebration` disagrees with `render()` about events** — render filters `type==='event'` from display (705–708); checkCelebration tests raw `viewEntries` (1763). One uncompleted event entry blocks the celebration while the victory screen shows. (Same family as DB4.)
- **KD9 🟡 "Today so far: +N pts" label is wrong on non-today views** — score is computed for `viewDate` (713) but the label always says Today (747).
- **KD10 🔵 `onBank` listener updates state without re-rendering** (2185–2187) — Saved Rewards stays stale until something else renders.
- **KD11 🔵 Dead code cluster around the missing stats row:** `streakData` loaded but never rendered (482, 506, 214); `gd` computed unused (714); unused imports `renderGradeBadge`, `loadCachedTheme`, `defaultThemeConfig`; ~30 lines of `.kid-stats` CSS (kid.css:86–116) match no markup.
- **KD12 🔵 kid.html omits styles/layout.css but its `#app` uses `.page-content`** (31) — wrapper gets no padding/max-width; works by accident, no tablet clamp. Fragile.
- **KD13 ⚪ `firstRun` redirect doesn't return** (71) — same as DB18.
- **KD14 ⚪ 25 inline `style=""` instances** in generated markup (544, 558, 647–656, 1175, 1213, 1885) + static display:none (36).

### 10.2 Phase B (§6.6)

- **KB1 🟡 Four celebration systems — explicitly banned by §6.6** ("keep two: sparkle + confetti"): emoji rain, sparkle rain, confetti+overlay, confetti+custom toast.
- **KB2 🟡 Parallel `kid-*` CSS ecosystem — explicitly banned**, including the spec's own named bad example `kid-week-tabs`. Should be `.card.kid` / `.tabs.kid` modifiers.
- **KB3 🟡 Parent escape not implemented per spec:** the gear is conditional on `ks.showGearIcon` (730) and opens the *theme sheet*, not a PIN escape; no long-press fallback, no triple-tap avatar. With the gear off there is no parent escape at all.
- **KB4 🟡 Stats row (Points/Streak/Badges) missing** — streak fetched but shown nowhere; trophy count survives only as a hover `title` (729), useless on touch. (KD11's dead CSS is its skeleton.)
- **KB5 🟡 Reduced motion produces zero feedback instead of a toast** — kid.css:537–547 forces 0.001ms animations; the animation-driven toast ends off-screen instantly. §6.6/§9 require collapse-to-toast.
- **KB6 🟡 Emoji in chrome outside the kid exceptions:** 👋 header (725), 🎉 in the multiplier banner (737), "🔒 Mark Complete" button (1855), "📅 Move too" form label (1880), 🔒 appended into card names (1041). (Balance/dinner tiles + trophies fall within the exceptions ✓.)
- **KB7 🟡 Tap targets below the 56px kid floor:** week tabs 44px (kid.css:130), header icon buttons 36px (489–492), bank tokens ~36px, `btn--xs` Use buttons. Task cards 72px ✓.
- **KB8 🔵 Today tiles incomplete vs spec** — only a full-width Tonight tile after tasks; no Weather, no Activity-goal, no 2-up grid (backlog, but reserve the grid per §6.6).
- **KB9 🔵 Trophies/Bank drift:** trophies are a header-icon sheet, not the spec'd on-page carousel; Bank shows at ≥1 token vs spec "3+". Current behavior arguably better — reconcile DESIGN.md.
- **KB10 🔵 Hardcoded colors:** `rgba(0,0,0,0.5)` (kid.css:420), `#38a169` fallback + `border-color: gold` in JS markup (647, 650).
- **KB11 ⚪ `taskNameWithEmoji` can exceed "max one emoji per card"** (up to 2 + category icon) — deliberate pre-reader feature; record as a DESIGN.md exception.
- **ROADMAP placement notes:** Kid Feelings Check-in fits the boot overlay queue (after 2166–2168) or the restored stats/tiles row; birthday countdown chip belongs beside `kid-header__date` (726).
- **Restriction posture (recorded):** no admin links; PIN overlay compares against client-held `settings.adminPin` + hardcoded `2522` (1333), no throttling; kid page imports unrestricted write primitives and ships the push HMAC secret (W3) — the restriction is presentational at the data layer. Acceptable for a family app; don't mistake it for security.

---

## 11. Person mode (person.html)

- **P1 🟠 Page wrapper drift from index.html.** person.html:36 uses `<div class="page-content" id="app">`; index.html:23 uses `<main class="app-shell" id="app">`. `.page-content` adds all-around padding + 600px clamp + fade-in; `.app-shell` is gutterless with a 560px tablet clamp — the person PWA gets doubled side gutters and a different tablet width than Home, a direct §6.9 "visually identical" violation. Copy index's wrapper verbatim.
- **P2 🔵 Mount points and gates verified compliant:** all seven §6.9 mounts present (35–43); no `!linkedPerson` gates on core controls in dashboard.js (bell unconditional at 201); unknown `?person=` gets a friendly escaped suggestion screen; missing param redirects home.
- **P3 ⚪ This file has a drift habit** — sw.js changelogs record two *prior* person.html shell-drift bugs (v52, v62); P1 is the third. Add a parity comment in both files (or a checked-in parity test). Also `<div>` vs `<main>` semantics and a missing shell-version marker.

---

## 12. Admin (admin.html · styles/admin.css)

### 12.1 Phase A — data integrity / cascades

- **A1 🔴 Person CRUD bypasses the data layer and hardcodes the production root — dev mode writes to production.** `openPersonSheet` uses raw `firebase.database().ref('rundown/people/...')` for delete (admin.html:2101), update (2143), create (2145), and balance anchor (2155). With `?env=dev` every other write goes to `rundown-dev/`, but these hit production — delete even removes a *production* person while cleaning *dev* reward data. Same hardcoded-root pattern in `autoPrune` (297–306 — a dev visit can silently prune the production schedule/snapshots) and email imports (5706, 5813, 5831). Fix: route through the shared/firebase.js helpers (`writePerson`, `pushPerson`, `writeBalanceAnchor` — already imported and unused, see A20).
- **A2 🔴 Person deletion orphans large amounts of data.** *(Confirms and expands F2.)* Delete (2093–2106) removes `people/{pid}` + `deletePersonRewardsData` only. **Not cleaned:** `pushSubscriptions/{pid}` (stale endpoints keep receiving pushes), `activityEarnings/{pid}`, `activeTimers/{pid}`, `activitySessions` rows, `activities/*/assignedTo`, `streaks/{pid}`, `snapshots/{date}/{pid}`, `kitchen/schoolLunchFeeds/{pid}` (Worker keeps syncing a deleted kid's lunch feed), recipe `ratings[pid]`, `icalFeeds/*/owners`, `achievementDefs/*/perPerson`, `events/*/people`, `tasks/*/owners`, and **all schedule entries with `ownerId === pid`** — with no rebuild, the dashboard shows ghost-owned tasks for up to 90 days. Build a full `deletePersonCascade` + rebuild; fix the understated confirm copy (2096).
- **A3 🟠 Single-task delete violates the CLAUDE.md rule: completions are not removed** (`tf_delete`, 1046–1062) — and it deletes completed past entries while leaving their completions, erasing visible history. Bulk delete (4661–4710) *does* clean completions — inconsistent paths. Recommend: keep completed past entries + completions; delete uncompleted entries + orphaned completions; share the code.
- **A4 🟠 Event deletion leaves orphaned schedule mirror entries** (`ef2_delete`, 1815–1828) — saves write mirrors (1796, 1803) and date-changes migrate them (1785–1797), but delete never removes them. Mirror the move-cleanup loop.
- **A5 🔴 Five admin actions trigger the past-date node-wipe (SC1):** task create (1028), task edit (1036), bulk edit (4641), bulk delete (4706), Tools→Schedule rebuild (5116). The fix belongs in the scheduler, but admin is the main trigger surface.
- **A6 🟠 Rebuilds destroy user moves/delegations (SC2/DB1/CAL4 — all five call sites), and the "Clear Past" copy is wrong:** `clearPast` nulls **entire past date nodes including completed entries** (scheduler.js:1023–1030) while both the hint (2672) and confirm (5102) promise "removes *uncompleted* past entries." Preserve completed entries or fix the copy (preserve them — their completions otherwise orphan).
- **A7 🟠 Saving a person can never clear `theme`, `kidSettings`, or `prefs`.** `ps_save` uses conditional spreads + `.update()` (2132–2143) — absent keys are never nulled, so "Family theme" leaves the old personal theme and Kid→Adult leaves stale `kidSettings`. Write explicit nulls like `avatarUrl` already does.

### 12.2 Phase A — functional bugs

- **A8 🔴 Delete is broken on the iCal-feed and school-lunch-feed sheets.** Both call `showConfirm('plain string')` (1324, 1414) but `showConfirm` destructures an options object → `escapeHtml(undefined)` throws (utils.js:305) → the promise never resolves → **feeds can never be deleted from these sheets.** Fix: `showConfirm({ title: '…' })`. *(Also exhibit A for U2 — escapeHtml should coerce.)*
- **A9 🟠 Badge award/revoke popup is dead code — manual awarding is impossible.** `bindAchievementsTab` binds to `.ach-badge-btn[data-key]` (4089) but `renderAchievementsTab` renders cells with no `data-key`/`data-person-id` (4802–4805); `.ach-toggle` (4192–4202) and `.ach-delete` (4205–4221) also match nothing. Add the data attributes or delete ~130 dead lines.
- **A10 🟡 Activity form "kids first" sort checks `p.kid === true`** (3398–3399) but people use `role: 'child'` (1879) — silently degrades to alphabetical. Use `p.role === 'child'`.
- **A11 🟡 Duplicate `#sf_themePreset` change handlers double-write settings** (4892 and 5015). Merge.
- **A12 🟡 Device-local/UTC date math where `settings.timezone` is mandated:** activity-earnings invalidation period key (3627–3635), school-lunch 30-day sync window (1449–1454), task-scan `formatDueDate` (5578–5582).
- **A13 🟡 Custom emoji inputs are rendered unescaped** — reward `rf_customEmoji` (3194–3201, no maxlength) and activity `af_customEmoji` (3523–3532) store arbitrary strings rendered raw via `renderEmojiTile` (356, 2870, 3371) and the badge grid (3960, 4110). Stored-XSS-ish; escape at render + add maxlength.
- **A14 🟡 Task save has no error handling and can strand a disabled Save button** (991–1037). Event save has the right try/catch/finally (1777–1812) — copy it to task, person, category, reward, achievement saves.

### 12.3 Phase A — verified behaviors

- **A15 ✅/🔵 PIN gate verified** (4-digit, 30-min sessionStorage, recovery `settings?.recoveryPin || '2522'` hardcoded *and printed in the settings hint* at 2494). Note: all data loads before the gate and the bypass flag is spoofable — the PIN is cosmetic; fine for a family app behind Zero Trust, just don't mistake it for security. No attempt throttling.
- **A16 ✅/🟡 Settings saves don't clobber siblings** — handlers spread the live `settings` object (`buildSettingsUpdate`, 4963–4968). Residual risks: concurrent-device clobber (full-object last-writer-wins) and the auto-prune handler (5144–5149) bypassing the helper. Recommend partial `updateData('settings', …)` semantics.
- **A17 ✅/🟡 Export/import confirm-gated and shallowly validated** — but import is a top-level **merge**, not a faithful restore (DB keys absent from the backup survive), has no per-key shape validation, and only reloads settings/people/tasks/cats afterward (5193–5199). Factory reset + scoreboard reset correctly typed-phrase-gated.
- **A18 🟡 Weekend weight UI doesn't convey its inverted semantic (SC7 confirmed):** bare "Weekend weight" number inputs under **Scoring** (2621–2630) with no help text, while the scheduler makes higher = *more* weekend chores. Add "Higher = more chores land on weekends" and consider relocating; update DESIGN.md §6.5 in the same pass.
- **A19 ✅ No `window.confirm`/`alert` anywhere in admin.html.**

### 12.4 Phase A — duplication / dead code

- **A20 🔵 17 unused imports** (59–92: `writePerson`, `pushPerson`, `readMessages`, `writeBalanceAnchor`, `clearMessages`, `writeBankToken`, `removeBankToken`, `generateSchedule`, `dateRange`, `detectTimezone`, `defaultThemeConfig`, `ACHIEVEMENTS`, `DEFAULT_ACHIEVEMENTS`, `renderRepeatSheet`, `openPhotoCropper`, `derivePersonInitials`); `getAccentColors` (315–323) never called; `allBankData` (154, 450–453) populated via N sequential `readBank` reads on every Rewards tab open and **never read**.
- **A21 🔵 Five nearly identical filter sheets** (~250 removable lines: 627–725, 1486–1552, 2220–2267, 2947–3012, 3868–3928) and the footer-save/title-disable duo copy-pasted six times. Extract `openFilterSheet({ sections, state, onApply })`.
- **A22 🔵 Four different emoji-picker implementations in one file** — categories use the shared primitive (2294–2299); rewards hand-roll `rf-emoji-*` (3052–3061); activities copy that (3428–3437); badges use a third grid (3959–3962). Converge on `renderEmojiPicker`.
- **A23 🔵 `showUndoToast` never gets an undo callback** (4648, 4709, 4823) — Undo button always hidden; bulk delete is irreversible despite the framing. Implement undo or use `showToast`.
- **A24 ⚪ Misc drift:** `createdBy: 'Parent'` vs IDs elsewhere (4821); email-import events omit fields other creators set (5803–5808); task-scan hardcodes `category: 'general'` (5660); event schedule keys `sched_${Date.now()}_event` without the mandated counter (1795, 1802).

### 12.5 Phase A — admin.css

- **A25 🟡 Duplicate conflicting selectors:** `.admin-color-dot` defined twice (525–532 vs 1079–1084), `.admin-list-item--selected` twice (653–656 vs 1153–1156) — later wins; delete the losers.
- **A26 🔵 Hardcoded colors / undefined tokens:** `.admin-tab--active { color: white }` (145, block appears unused); stale-accent fallbacks `rgba(108,99,255,…)`/`#6c63ff` (654–655, 832); `--surface-highlight`, `--accent-rgb`, `--border-subtle` are never defined anywhere; admin.html inline styles reference nonexistent `--accent-danger`/`--accent-success` (3810, 4104–4120) — always render the hardcoded fallback. Real tokens are `--danger`/`--success`.
- **A27 ⚪ Roughly a quarter of admin.css is dead** (grep-verified: `.admin-subnav*`, `.admin-theme-grid`, `.admin-accent*`, `.admin-checkbox*`, `.bulk-checkbox`, `.admin-form-overlay`, `.dedicated-day-select`, `.admin-badge*`, `.admin-person-detail`, `.pricing-helper`, `.achievements-grid`, `.admin-event-log`, `.admin-pre`, more). Prune (verify setup.html doesn't load admin.css for `.color-swatch`/`.step-indicator` first).

### 12.6 Phase B — UX / spec compliance

- **AB1 🟠 Top-level IA diverges from §6.5 — and the spec is the declared source of truth.** Spec: Library / People / Rewards / Settings / Advanced (with Debug). Shipped: Library / People / Settings / **Tools** (255–282), Rewards+Badges+Activities inside Library, Schedule under Tools, Settings sub-tabs Family/Style/Scoring/Connect, and **no Debug section** — `pushDebugEvent` writes a log nothing can view (5119) and the themed `.debug-panel` CSS has no consumer. The shipped IA is arguably better; update §6.5 to match before future sessions "correct" toward the stale spec.
- **AB2 🟡 One-chevron rule violated on three row types:** people rows add an open-profile icon (1857), school-lunch rows a sync button (1178), activity rows an inline Active toggle (3366–3369) — each plus the chevron. Move actions into detail sheets.
- **AB3 🟡 Form-pattern stragglers:** iCal feed sheet (1223–1258) and school-lunch sheet (1355–1376) — non-sticky footers, no `renderFormSheetHeader`, no disabled-save; message modal (4746–4779) and bulk-edit modal (4494–4565) use `.sheet-actions`/raw selects; two raw exposed `<input type="date">` in the AI-import confirm flows (5597, 5739) — banned by §12.
- **AB4 🟡 Auto-focus violation:** `openEventFormAdmin` focuses `ef2_name` inside the activation rAF in create mode (1565–1568) — explicitly banned.
- **AB5 🟡 Inline styles and emoji in chrome:** `style="display:none"` on `#pinGate`/`#mainContent` (30, 46); heavy `style=""` blocks in redemption history (2886–2940), badge popup (4109–4123), Reset-All (3809–3811), AI/email imports (5595–5599, 5737–5761). Emoji: 🔒 in the PIN gate (32), ✅/❌/⏳ status icons in redemption rows (2923–2924).
- **AB6 🟡 Search inputs re-render the whole page per keystroke and teleport the caret to the end** (4417–4422, 3340–3345, ×5). Debounce + re-render only the list container.
- **AB7 🔵 A11y:** PIN inputs lack aria-labels, error not aria-live (36–41); clickable rows are `<div>`s with no keyboard access (`renderAdminRow`, 333); sub-nav in a `role="tablist"` without `role="tab"`/`aria-selected` (375–397); text `›` chevrons; badge lock state by opacity alone.
- **AB8 🔵 Loading/error coverage uneven:** Rewards/Badges/Activities sub-tab switch awaits reads with no spinner (439–458); most saves surface no failure (A14); Events library defaults to all-time ascending — opens on the oldest past event; default to Upcoming.
- **AB9 🔵 Schedule stats: two of four cards both labeled "Avg / Day"** (2724–2733); add an overdue-entries count for Clear-Past context.
- **AB10 🔵 No dirty-form protection** — every sheet closes on backdrop tap, losing long edits to a stray thumb (748–750, 2016–2018). Dirty flag + confirm.
- **AB11 ⚪ Suggestions:** offer "download backup" inside the factory-reset confirm; promote notification log + redemption history + a `debug/eventLog` viewer into the spec'd Debug section; auto-prune copy claims it prunes "completions" (2780) but only prunes schedule/snapshots (303–306) — pruning orphaned completions would also fix A3 retroactively.

---

## 13. Setup wizard (setup.html · styles/setup.css)

### 13.1 Phase A

- **SU1 🔴 Final write is non-atomic and settings-first — a failure mid-write bricks onboarding.** `finishSetup` writes settings → categories → people sequentially (setup.html:541–574). Settings existing is the first-run sentinel AND setup's own redirect trigger (204–208): if a person push fails, "Try Again" duplicates already-written people, and a refresh redirects to index.html with a family that has zero/partial people and no way back into the wizard. Fix: one atomic multi-path `update()`, or write settings *last* as the commit marker.
- **SU2 🟠 Dev-mode env param dropped on both redirects** (206, 577) — a dev-mode setup writes to `rundown-dev` then lands on production index. Propagate `location.search`.
- **SU3 🟡 PIN stored plaintext; recovery PIN `2522` hardcoded in shipped JS** (545–546). Known/accepted posture (cross-ref A15), but consider hashing `adminPin` at least.
- **SU4 🟡 No PIN confirmation step** — §6.8 says "4-digit entry + confirm"; implementation is a single entry (137–143). A typo locks the user out of admin until they find the recovery PIN.
- **SU5 🟡 Validation is silent, not inline** — step 1's Continue is always enabled and just refocuses on empty name (258–261); spec requires inline validation with `role="alert"`. Also an all-symbol category label produces an empty key that Firebase rejects at finish time, far from the cause (422).
- **SU6 🟡 Schema linkage:** setup writes `role: 'child'` (350–369, correct) — but activities/calendar/admin sort on a `kid === true` property nothing ever writes (see AC6). Fix in the consumers.
- **SU7 🟡 Refresh mid-wizard loses everything** — all state in module variables, no `beforeunload` guard, no draft persistence. Losing 5 typed family members to a back-swipe is painful.
- **SU8 🔵 Already-set-up redirect is racy and error-blind** — fire-and-forget `readSettings().then(...)` (204–208); a read error is swallowed and `finishSetup` would overwrite an existing family. Await before showing step 1.
- **SU9 🔵 Pattern drift: the only page still on inline `onclick=` + 10 window-globals** (53–157, 256–487).
- **SU10 🔵 Dead CSS:** `.person-card__color` (setup.css:91–96), `.color-swatch--used/--positioned` (132–149, 261) — markup replaced by `openAvatarEditor`. Hardcoded `color: white` (147); `!important` triple-stack on `.role-btn` (121–130).
- **SU11 ⚪ Theme preview hexes hardcoded in JS** (449–450, 464) — will drift from theme.js presets; derive from `getPresets()`.

### 13.2 Phase B

- **SU12 🟡 Step 6 has no Back button** (152–159) — a typo spotted on the summary can't be fixed. Spec: every step has Back (ghost) | Next (primary).
- **SU13 🟡 A11y:** theme/accent pickers are click-only divs with no tabindex/role/aria-pressed and no accessible name (451–468); PIN digits unlabeled; remove buttons icon-only unlabeled. Convert to buttons and label.
- **SU14 🔵 §6.8 otherwise solid** (6 steps ✓, dots ✓ though custom `.step-dot` not the spec'd shared `.progress`, footer ✓ steps 2–5). Header 📋 and finish 🎉 emoji are in page chrome — exempt setup explicitly in DESIGN.md if the festive tone is intended.
- **SU15 🔵 Flow polish:** Enter in the name field should trigger Add Person; role resets to Adult after each add (kid-heavy families re-tap Child every time); `removeCategory` silently refuses at one remaining category (438).

---

## 14. Activities (activities.html · shared/timer.js · styles/activities.css)

### 14.1 Phase A — earnings integrity & timer sync

- **AC1 🔴 Earnings invalidation permanently deletes points for back-dated periods.** The Worker only ever settles *yesterday* (daily) and *last week on Mondays* (weekly) — but the client `removeActivityEarning`s for *any* affected period (activities.html:888–891, 1117–1120, 1143–1146). Editing/deleting a session ≥2 days old deletes a settled earning the Worker will never recompute — silent point loss in a points economy. (Compounds W5's no-catch-up gap.) Fix: Worker re-settles any unsettled past period within a lookback window, or the client writes a "needs resettle" marker.
- **AC2 🟠 Weekly periodKey computed from the UTC day, not `settings.timezone`** (`sessionPeriodKey`, 904–909) while the Worker attributes by tz-local date — a Sunday-evening Chicago session invalidates *next* week's key while the Worker counted it in *this* week. Same UTC bug in admin.html:3628–3635 (A12). Compute from `localDateKey(startedAt, tz)`.
- **AC3 🟠 Editing a session never invalidates its OLD period** (`doSave`, 1117–1120, only the new key) — moving a session across days/persons leaves the old settled earning counting phantom minutes. Delete does it right (1143–1146); edit must invalidate both.
- **AC4 🟠 Stop race: two devices stopping simultaneously double-log the session** (`stopTimer`, 872–896: read-local → push → clear, no transaction; push IDs never collide). Also non-atomic on one device (failed clear after push = retry duplicates). Claim the timer with a `transaction()` and push only after a successful claim.
- **AC5 🟠 Cross-device elapsed time uses local `Date.now()` against another device's clock** — `startedAt`/`pausedAt` are client timestamps (829–836), and `pause()` on a skewed device bakes the error into `accumulatedMs` permanently (timer.js:3–26, clamped to 0 so minutes are *lost* silently). Use `ServerValue.TIMESTAMP` + `.info/serverTimeOffset`.
- **AC6 🟠 "Kids first" sorting is dead code app-wide** — sorts on `x.kid === true` (482–484, 539–541) but people use `role: 'child'`; nothing ever writes `kid: true` (repo-wide grep). Same latent bug in calendar.html:306 and admin.html:3398 (A10). One-line fix ×3.
- **AC7 🟠 Today-tab weekly pace disagrees with the overlay's math** — the card includes today's minutes in the pace base (691–693; goal 70, log 10 → target drops to 9 and the bar shows "over") while the overlay correctly subtracts today first (214). Align the card.
- **AC8 🟠 FAB present though §6.11 says "No FAB"** (159–165, deep-links to admin) — and §5.13 separately says an Activities FAB should *start an activity*. DESIGN.md contradicts itself; resolve the spec, then the code (wiring the FAB to the manual-entry sheet would also revive AC15's dead branch).
- **AC9 🟡 Cross-device totals don't update** — the activeTimers subscription re-renders but never reloads `sessions` (168–171); device A sees the timer vanish but totals exclude the new session until reload.
- **AC10 🟡 `bindEscapeToClose` unsubscribe discarded at all four call sites** (341, 568, 1086 + re-binds) — document keydown listeners accumulate; after N opens one Escape fires N stale closures.
- **AC11 🟡 `isForgotten` defeated by pause/resume** (checks `startedAt`, which `resume()` resets — timer.js:32, 44–47) and never fires for long-paused timers. Use `originalStartedAt`.
- **AC12 🟡 Manual entry: no max duration enforced** (input `max=1440` is advisory; typing 99999 saves and inflates earnings) **and future dates allowed** (pre-banking goal credit). Enforce in `doSave` with inline errors.
- **AC13 🟡 Noon anchor parses in device timezone** (1100), not `settings.timezone` — ≥12h-offset devices land sessions on the wrong day (compounds AC2). `formatDateHeader` (634) same.
- **AC14 🟡 Editing a timer session destroys provenance** — `doSave` unconditionally sets `source:'manual'`, re-anchors `startedAt` to noon, overwrites `createdBy` (1101–1110). Fixing a Notes typo rewrites the real start time. Only re-anchor when the date changed; preserve source/createdBy.
- **AC15 🟡 ~80 lines of dead "no-preselect" code in the manual sheet** (914–963, 1024–1066) — every caller passes an activityId; the activity-picker branch is unreachable (pairs with AC8).
- **AC16 🟡 No error state on initial load** (`loadData`, 175–192) — failed read = spinner forever.
- **AC17 🟡 Stale timers for deleted people/activities linger forever** — raw push-ID rendered as the name (653); nothing GCs `activeTimers`. Add a sweep.
- **AC18 🟡 `.section-header` collides with the shared component class** (activities.css:27–34 vs components.css:2856) and, loading later, overrides it page-wide. Rename.
- **AC19 🟡 `shared/timer.js` doesn't match its §5.10 spec at all** — spec promises `openTimer({durationMin, label, onDone})` as a Sheet with chime + reduced-motion fallback; the module is pure math and the overlay is page-local (activities.html:227–363). Task Timer (3.1) consuming "the same module" will find nothing. Update §5.10 or extract the overlay.
- **AC20 🔵 First-run redirect doesn't return** (94) — same as DB18/KD13.
- **AC21 🔵 Inline styles + inconsistent escaping:** `style="width:…"` progress bars (470), person headers inject `person.color` **unescaped** (679, 738) while the chip version escapes it (524); `applyDataColors` imported and never used (63); `a.emoji` injected raw everywhere.
- **AC22 🔵 Duplicated helpers:** local `escapeHtml` (493–495) vs utils; localStorage person validation (103–110) vs `validateStoredId`; two env-param patterns three lines apart in behavior (162–163 vs 1176).
- **AC23 🔵 Interval/efficiency nits:** 250ms display interval keeps ticking when the tab is hidden and on the History tab; History renders every session ever with no pagination.
- **AC24 🔵 Only page without the dev banner** — `?env=dev` testing here shows no orange banner/clear button.
- **AC25 ⚪ Misc:** stale "Tasks 11-14" comment (activities.css:14); dead `.fs-timer__readout` 52px rule (285); hardcoded px sizes/radius in history rows (331–336); `padding-bottom:80px` hardcodes nav height; `activities-active-person` localStorage key shared dev/prod.

### 14.2 Phase B

- **AC26 🟡 §6.11 layout compliance good** (tabs ✓ grouping ✓ active-timers ✓ adaptive pace ✓ 7-dot summary ✓ history grouping ✓) **except** the FAB (AC8) and kids-first (AC6).
- **AC27 🟡 History edit is undiscoverable** — plain divs, no chevron/pencil/hint (617–623), not keyboard-accessible. Add a trailing chevron + make rows buttons.
- **AC28 🟡 Symbols in chrome:** `▶ Start` buttons (707), `✓ Goal hit` / `⚠ Forgotten?` status chips (704, 661) — §12 bans glyphs in buttons/status chips; use SVG.
- **AC29 🟡 A11y:** timer readouts have no `aria-live`; week dots convey state by color/title only; tabs lack arrow-key nav; long-press card→admin gesture has no affordance and doesn't suppress contextmenu.
- **AC30 🔵 Forgotten-timer chip offers no remediation** — Stop still credits 6+ hours. Offer "Discard"/"Trim to goal", and surface via the Bell per §7.2.
- **AC31 🔵 Polish:** wake-lock + chime + reduced-motion on the fullscreen timer; "wk: 35 / 70" is cryptic for kids ("This week: 35 of 70 min"); avatar/color on active-timer cards; empty-state copy points at admin while the FAB exists.

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

## 17. Base CSS (styles/base.css · layout.css · components.css · responsive.css)

### 17.1 base.css

- **CSS1 🟠 Type-scale tokens contradict DESIGN.md §3.2.** Doc says 12/14/16/18/22/24/36px; base.css:109–116 defines 11/13/15/17/20/23/32px plus `[data-text-size]` variants the doc never mentions (148–167) and `--font-base`/`--font-md` aliases. Rewrite §3.2 to match reality (or acknowledge silent scale drift).
- **CSS2 🟠 Webfont violates §3.2's "never import a webfont."** base.css:5–19 self-hosts Plus Jakarta Sans and `--font-family` (56) leads with it. Clearly deliberate — update the doc rule.
- **CSS3 🟠 §3.4 `--icon-*` tile tokens don't exist.** Zero definitions in base.css, zero emissions in theme.js, zero references anywhere. The spec'd token family was never implemented.
- **CSS4 🟡 `--owner-a…d` defined but never used** (100–103; no dark variants either) — per-person color flows entirely through runtime `--person-color`/`--owner-color`. Wire up or delete + update §3.4.
- **CSS5 🟡 Body + page wrapper both reserve nav height** — base.css:272 and layout.css:12 stack to ~150px of bottom clearance at the end of every scroll. One owner should win (mirror of the documented header-height gotcha).
- **CSS6 🔵 Two hand-synced dark token lists** (`[data-theme=dark]` 175–210 vs the `prefers-color-scheme` fallback 212–249) — a missed line silently diverges first-paint dark from chosen dark.
- **CSS7 🔵 Dark mode never adjusts `--overlay-bg` or `--shadow-*`** — 6–12% black shadows are nearly invisible on `#0f0f0e`.
- **CSS8 ⚪ Verified good:** `--on-accent` defined light+dark ✓; all 8 `--z-*` band tokens exist and match §3.7 ✓; six spacing tokens ✓; semantic soft pairs have dark parity ✓; `:not([data-theme])` guard correct ✓.

### 17.2 layout.css

- **CSS9 🟠 Tablet rule contradicts §4.2:** `@media (min-width:768px) { .app-shell { max-width: 560px } }` (172–174) clamps tablet to a centered phone column — the opposite of the spec'd 240px rail + two-pane + 900px content. The comment even cites a spec section that no longer matches the doc's numbering.
- **CSS10 🟡 Hardcoded `font-size: 11px` in the bottom nav** (137; `1.3rem` icon at 178) — should be tokens.
- **CSS11 🔵 Global reduced-motion block duplicated byte-identically** in layout.css:199–209 and responsive.css:40–50. Delete one — carefully: several keyframes app-wide rely solely on this global override (see CSS20).

### 17.3 components.css

- **CSS12 🔴 Retired token `--bg-secondary` is an undefined-var bug.** components.css:5359 — `.confirm-row:active { background: var(--bg-secondary) }` renders nothing (the token is on the A.2 retired list and defined nowhere). Fix: `var(--surface-2)`. Only A.2 hit without a fallback in the four target files (admin.css's 8 `--border-subtle` uses all carry fallbacks).
- **CSS13 🟠 A.3 raw-hex audit fails: 23 matches, ~19 beyond the documented color-mix anchors.** Worst: the time-pill AM/PM palette (8 hexes, 1419–1426) and the weather icon palette (7 hexes, 3505, 3537–3540, 3586–3587), plus `#fff` literals (397, 1772, 1788) and fallback hexes (2420, 3088, 3152). Tokenize the two palettes (`--time-am`, `--wf-sun`, …) so themes can redefine them.
- **CSS14 🟠 A.6 z-index audit fails: 4 untokenized, uncommented values** outside the 0–60 band: 600 (`.cpick-pop`, 215), 1100 (`.photo-cropper-overlay`, 445), 300 (`.ef2-subsheet-overlay`, 4527), 2000 (`.tf-picker-overlay`, 4850). Six siblings were properly migrated with audit comments — these four were missed.
- **CSS15 🟠 Phantom (never-defined) tokens:** `--surface-highlight` + `--accent-rgb` (1864) fall through to the pre-theming purple — pending bell items render off-brand purple on every theme (same in admin.css:832); `--c-warning` (4712) falls back to `--danger`, so the date warn label renders danger-colored. Replace with `--accent-soft` / `--warning`.
- **CSS16 🟡 ~15 ad-hoc box-shadows vs §3.5's three tokens** (223, 672, 730, 1832, 4867, 2430; 1984 hardcodes a warning-yellow glow — moot, the block is dead per CSS19). Most should be `var(--shadow-lg)`.
- **CSS17 🟡 Spacing/type/radius drift is broad but small-scale:** off-scale spacing literals (12px ×28, 14px ×13, 20px ×12, 10px ×43, 6px ×37 — §3.1 explicitly bans 12px), 52 `font-size` declarations bypassing the scale, assorted off-scale radii. Recommend ratcheting (new code clean, fix on touch) — much of it is deliberate micro-sizing the scale can't express.
- **CSS18 🟡 Sticky form footer declared three times identically:** `.ef2-footer` (4506–4517), the `k*-footer` selector list (5454–5465), `.fs-footer` (5475–5486). Collapse into the canonical `.fs-footer` list. Same for `.me-detail__action-row` vs `.task-detail__action-row` twins (3211, 3716).
- **CSS19 🟡 ~150 lines of confirmed-dead CSS** (zero references): `.form-compact` block (770–833), reward-store block `.store-header/.store-card*/.store-bounties/.store-pending/.wishlist-btn` (1977–1998), `.template-chip` (1963–1974), `.cal-day-block` (2888–2908), `.event-row` (2911–2942). (Sampled ~30 selectors; `.undo-toast`, `.add-menu`, `.segmented-control`, `.kid-tonight`, `.av-card` all still live.)
- **CSS20 🔵 Reduced-motion coverage good in-file (13 targeted blocks)** but several keyframes (ef2-shake, tf-shake, progressShimmer, bannerSlideIn, slideUp, toastFadeIn) rely solely on the global `*` override — fragile if CSS11's duplicate cleanup removes the wrong copy.
- **CSS21 🔵 No page-CSS conflicts on core components** (sampled `.tabs`, `.card`, `.bottom-sheet`, `.btn`, `.chip`) — pages only add variants; the known `.card`/`.task-card` collision is handled with a documented specificity fix (1049–1060). ✓

### 17.4 responsive.css

- **CSS22 🟠 §4.2 tablet spec is essentially unimplemented.** Exists: `--max-content` 700px@768 / 800px@1024 (wrong values vs spec's 900/1200/1600), one calendar day-grid split, narrow-phone subtitle swap. Absent: left rail, all five two-pane layouts, the `html { font-size: 18px }` type bump, the 520px sheet clamp — and layout.css's 560px clamp actively contradicts it. Build §4.2 or mark it "planned" so the spec stops describing fiction. (`display.html`/kiosk §4.3 also don't exist — known roadmap item.)
- **CSS23 ⚪ Misplaced page rules:** `.admin-tab` (14–17), `.cal-day__grid`/`.event-pill` (28–36, with a 10px font literal) belong in their page CSS files.

### 17.5 Mechanical audit results (Appendix A, run as spec'd)

- **A.2 retired tokens:** 9 hits — `--bg-secondary` ×1 (real bug, CSS12), `--border-subtle` ×8 (admin.css, safe fallbacks), plus `--accent-success` ×2 in admin.html/kid.html inline styles.
- **A.3 raw hex in components.css:** FAIL — 23 matches, ~19 violations (CSS13).
- **A.5 reduced-motion:** **scoreboard.css is MISSING** its block (has 3 transitions); the other eight required files pass.
- **A.6 z-index:** clean everywhere except components.css ×4 (CSS14) and kitchen.css 100/200 (K26).
- **Sheet animation duration (cross-cutting D1/C15 resolved):** CSS animates the bottom sheet at exactly `--t-base` = **200ms** (components.css:610, 629; sub-sheets 4530, 4544). JS teardown waits are 220/280/300/320ms in different files — all ≥ CSS today, but the 220ms waiter truncates the animation if `--t-base` is ever raised. One shared `SHEET_CLOSE_MS` constant recommended.

### 17.6 Accessibility

- **CSS24 🟠 `--text-faint` used as *text* color 47× in components.css — contrast failure.** `#9a9a9a` on white ≈ 2.8:1 (AA needs 4.5:1); it's the text color of `.form-label` (749), inactive `.tab` (3626), `.confirm-modal__message` (691), `.owner-chip` (110), `.field__label` (3700), task-card meta. Dark value similar (~2.9:1). Sweep label/message text to `--text-muted` (≈5.0:1, passes); reserve faint for decoration per §3.4's own scoping.
- **CSS25 🟡 No global `:focus-visible` rule; coverage patchy** — 28 per-component rules in components.css but base/layout/dashboard/kid/admin/tracker/setup have zero. One `:where(button, a, [tabindex]):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` in base.css closes the gap.
- **CSS26 🟡 Sub-44px tap targets:** `.notif-type-row__test` 24px (6120), `.ef2-field-close` 24×24 (4490), `.btn--xs` 28px (90), `.filter-chip` 32px (2466), `.rd-stepper-btn` 32px (4083), `.check` 32px (2268, mitigated — whole card tappable), `.tab` 36px (3632).
- **CSS27 ⚪ theme.js dark fallback writes `--accent-soft` via color-mix while base.css dark uses hand-picked values** — if a preset fails to load, dark accent-soft chips look noticeably different from the designed palette.

---

## 18. Docs drift (CLAUDE.md · DESIGN.md · ROADMAP.md vs reality)

The project's own rule is "DESIGN.md is the single source of truth — if a situation isn't covered, add it first, then build." A large share of Phase B findings are really *doc* findings: the app shipped past the spec. Consolidated here so the fix pass can do one docs sweep.

### 18.1 CLAUDE.md

- **DOC1 🟡 File-structure tree is stale:** missing `activities.html`, `styles/activities.css`, `shared/timer.js`, `shared/push-client.js`, `shared/push-ui.js`, `shared/kitchen-ical.js`. Counts stale: firebase.js "~25 exports" (now ~150), components.js "~4,000 lines" (now ~5,635).
- **DOC2 🟡 "Shared modules are pure functions — no DOM. Exceptions: theme.js, dev-banner.js"** — also DOM-touching: components.js (showConfirm/showToast/openCookMode/openVoteSheet/sheet binders), dom-helpers.js (by design), push-ui.js, ai-helpers.js, and the page-local timer overlay. Rewrite the rule to describe the real boundary (pure *renderers* return strings; *binders/openers* may touch DOM).
- **DOC3 🔵 "All past-date completions get isLate + pointsOverride … regardless of rotation"** overstates: saved pointsOverride, `isEvent` categories, `exempt` tasks, and full-credit completions are exempt (DB11) — and dashboard doesn't block past-daily taps while calendar does (CAL24).
- **DOC4 🔵 Long-press timings:** rewards uses an undocumented 600ms (R9); the documented 500/800 split can be silently overridden by a global `settings.longPressMs` (TR12).

### 18.2 DESIGN.md — sections that no longer describe the shipped app

| Spec section | Reality | Finding |
|---|---|---|
| §6.2 Calendar (views, month-hidden-on-phone, default Week) | 4th Agenda view (default), mobile month grid+dots+day panel | CALB1 |
| §6.5 Admin IA (Library/People/Rewards/Settings/Advanced + Debug) | Library/People/Settings/Tools; no Debug anywhere | AB1 |
| §6.7 Rewards tabs (Custom/Functional/Bounties/Wishlist/Bank) | Shop/Bank/History/Approve; Wishlist has schema but zero UI | R13 |
| §6.3 Scoreboard periods (Week/Month/Year) | + Today tab; "weeks" are rolling 7-day windows | SB10, SB14 |
| §6.1 Dashboard | approvals banner tier (undocumented), Back-to-Today pill in header, `.event-bubble` instead of `.card--event`, Coming-up rail behavior changed | DB24–DB27 |
| §10.1 Theme presets (Sage/Ocean/Rose/Amber/Iris) | light-warm/dark/dark-warm/light-vivid/dark-vivid + free accent | T2 |
| §3.2 Type scale + "never import a webfont" | different px values + self-hosted Plus Jakarta Sans | CSS1, CSS2 |
| §3.4 `--icon-*` tile tokens | never implemented; `--owner-a..d` defined but unused | CSS3, CSS4 |
| §4.2 Tablet two-pane (rail, 900/1200/1600, type bump) | unimplemented; 560px clamp contradicts it | CSS9, CSS22 |
| §5.10 Timer component (`openTimer` sheet, chime) | timer.js is pure math; overlay is page-local in activities.html | AC19 |
| §5.13 vs §6.11 | FAB contradiction (FAB-starts-activity vs No-FAB) — spec disagrees with itself | AC8 |
| §6.6 Kid mode (stats row, today-tile grid, on-page trophies, bank at 3+, parent escape, two celebrations, modifier CSS) | stats row absent, trophies in a sheet, bank at 1+, escape not implemented, four celebrations, parallel kid-* CSS | KB1–KB4, KB9 |
| §6.4 Tracker filter sheet | unimplemented; the shared component for it is dead code | TR9 |
| §6.10 Kitchen bulk-add | documented as live; unreachable | K15 |
| §6.8 Setup PIN confirm step | single entry, no confirm | SU4 |
| §7.3 Banner mounts/priority | approvals tier exists; vacation/freeze are dead placeholders | DB24 |

**Recommended approach:** one "spec re-sync" PR that updates DESIGN.md to match every *intentional* shipped divergence above (Agenda view, admin IA, rewards tabs, Today tab, theme system, webfont, type scale), and explicitly marks the rest as "spec'd, not yet built" (tablet §4.2, kiosk §4.3, kid stats row, tracker filter, timer component §5.10). Without this, every future session "corrects" the app toward a stale spec.

### 18.3 ROADMAP.md

- **DOC5 ⚪ Nav line is current ✓** (Home · Kitchen · Scores · Rewards · More; user-customizable slots match §10.4). Activities "shipped" status ✓. No changes needed beyond adding any fix-pass follow-ups the user adopts from this review (e.g., wishlist decision from R13).

---

## Consolidated cross-cutting themes (for the fix pass)

These patterns each appear on 3+ pages; fixing them once in shared code clears dozens of findings:

1. **Schedule-rebuild data destruction** — SC1 (past-date node wipe), SC2/DB1/CAL4/A6 (moves/delegations/notes/sliders stripped), DB19/CAL5/A4 (event mirror decay). One scheduler fix (merge past dates; preserve marked entries; drop or regenerate mirrors) clears ~10 findings across 4 pages.
2. **Dev mode writes to production** — A1 (admin person CRUD, autoPrune, email imports), K2 (kitchen items/staples), W12 (Worker root), SU2 (setup redirects). Audit rule: no `'rundown/'` string literals outside shared/firebase.js.
3. **No error handling on writes** — DB6/DB12, CAL7, TR4, R8, KD7, AC16, A14. One shared `safeWrite(fn, { toast, revert })` wrapper + adoption.
4. **Double-tap / concurrency guards missing on money paths** — C2 (bell approve), R2 (approvals tab), K6 (votes), AC4 (timer stop), K42 (plan save). `withButtonLock` exists; adopt it + transactions where two devices race.
5. **Week definition chaos** — scheduler ISO-Monday (SC3), tracker Monday, scoreboard rolling (SB14), heatmap Sunday (SB4), activities UTC-week keys (AC2), `weekStartDay` setting honored only by calendar display. Pick one family-week definition.
6. **Timezone rule violations** — F1, A12, K12, AC2, AC13, TR7, SM-adjacent. Grep for `new Date()`-based day math outside utils.
7. **Local gesture copies drifting from `bindTaskRowGesture`** — DB2 (undefined const), CAL19, TR2, R9, K25. Consolidate on the shared helper (and add the keyboard path once — DB31).
8. **Escaping gaps** — U2 (escapeHtml crashes on non-strings — fix this first, it converts crashes like A8 into rendered text), DB7, KD2, R11, A13, C6 (double-escapes), CAL20, AC21.
9. **Emoji-in-chrome sweep** — C22, DB28, CALB7, SB9, K21, KB6, AC28, SU14, R16: ~30 sites, all mechanical swaps to existing SVG constants.
10. **Inline-style sweep** — C23, DB29, SB13, K20, KD14, AB5, AC21, CALB12: move to classes / `data-*` + `applyDataColors`.
11. **Dead code** — ~15 unused imports per page (DB14, CAL14, SB6, TR7, A20, R10), dead functions (DB13, K15, A9, C10), ~500+ lines of dead CSS (CALB11, A27, K27, CSS19, KD11, SU10). One cleanup PR.
12. **Worker security posture** — W1+W2+W3+W4 should be treated as a single hardening task (CORS lock, shared secret, rate limit, SSRF guard) before any of the AI features are promoted further.

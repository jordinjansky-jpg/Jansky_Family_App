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

## Batch 2 — Worker security, service worker, support modules

⚠️ **The Worker is NOT auto-deployed.** After merging, run `npx wrangler deploy --config workers/wrangler.toml` (and consider adding a Cloudflare dashboard rate-limiting rule as the real abuse ceiling).

| ID | Fix |
|---|---|
| W1 | Worker rejects any request whose Origin isn't allowlisted (`dashboard.jansky.app`, localhost dev) — the Claude key can no longer be spent by arbitrary websites. Residual: non-browser clients can spoof Origin; pair with a dashboard rate rule |
| W2 | Per-isolate burst throttle on AI handlers (30/min) — caps scripted bursts at zero cost; not a global limit |
| W4 | `isSafeRemoteUrl` SSRF guard on `handleUrl`, `handleIcal`, `fetchImageAsBase64` (http(s) only; no loopback/link-local/private hosts) |
| W5 + AC1 | Settlement lookback: daily settles the last **14 days**, weekly the last **8 completed ISO weeks** (any day, not just Monday). Cron outages no longer permanently skip payouts, and client invalidations after session edits/deletes get **re-settled** — the silent point-loss bug is closed for edits within the lookback |
| W6 | Settlement gated to the first tick of each hour + idempotency checks moved to a single `activityEarnings` read (was O(people×activities) Firebase reads every 5 min) |
| W7 | Overdue-reminder schedule lookback reads parallelized |
| W11 | `handleScan` max_tokens 4096 → 8192 (dense calendar images were truncating + silently falling back) |
| SW1 | Offline navigation falls back to cached `/index.html` instead of the browser error page |
| SW2 | `kitchen.js` precached — offline Kitchen no longer loads HTML whose module 404s |
| SW3 | Failed/offline Approve/Deny/Snooze actions re-surface as an "didn't send" notification instead of silently vanishing |
| SW4 | `notificationclick` matches clients by exact pathname and posts a `deep-link` message with the query string (page-side `?openBell=1` handling wired in the dashboard batch) |
| — | `CACHE_NAME` bumped v342 → v343 |
| SM1 | Weather honors `settings.temperatureUnit` ('celsius'/'C' → metric; default Fahrenheit). Admin UI field added in the admin batch |
| SM2 | Weather coords keyed by location string + `clearWeatherCache` also clears coords — changing the family location actually moves the weather |
| SM3 | Weather fetches have an 8s abort timeout |
| SM4 | `resizeImageForUpload` honors EXIF orientation via `createImageBitmap(file, { imageOrientation: 'from-image' })` with legacy fallback — portrait photos no longer reach Claude sideways |
| SM6 | Rotated push subscriptions re-register on bare `/index.html` via a `dr-push-person-id` localStorage fallback written at subscribe time |
| SM9 | dev-banner native `confirm()` replaced with a two-tap arm/confirm |

**Accepted-risk (documented, not fixed):** W3 — the push/action HMAC secret ships in client JS, so approvals remain forgeable by anyone who reads the source (including a curious kid). A real fix needs a server-held secret / parent-session model, which changes the notification architecture; the new Origin gate at least blocks third-party websites from using it. W12 — Worker always targets the production root (dev-mode clients trigger real pushes); conscious choice, left as-is. W9 — text handlers return 200-with-fallback while image handlers 500; intentional asymmetry, left.

## Batch 3a — shared/components.js (+ state.js follow-on)

C1, C2 (+NaN refund guard from SB8), C3 (full repeat sub-sheet binding — and a NEW find: state.js only honored end types 'date'/'count' while every form writes 'on'/'after', so **repeat end conditions were ignored app-wide**; both accepted now), C4, C5, C6, C7, C8, C9, C16, C17 (via C2-style guards), C20, C22 (components sites), C23 (confirm textarea + contrast), C25, C26 (end-date formatting half), C29, C33. CSS24 partial (confirm message text).

## Batch 3b — pages (parts 1–7)

**Dashboard:** DB2–DB13 (incl. live settings listener + theme propagation page-side, serialized completion loads, SW deep-link handling, boot error state, failure-safe toggle + delegate/move/skip/notes toasts, undo restores original record, past-daily tap blocking, viewDate-aware vote sheet / FAB / multiplier), DB14–DB19 (dead code/imports, mirror writes retired), DB23, DB30.
**Calendar:** CAL1 (FAB restored — add/import flows reachable again), CAL2, CAL3, CAL5 (mirror writes retired; legacy cleanup kept; category migration nulls instead of converting), CAL6, CAL7, CAL8 (live schedule listener), CAL9 (range-bucketed event expansion across month/week/panel), CAL10 (series-delete warning), CAL11 partial (dup id field), CAL12 (label), CAL14 partial (legacy week view + bindings deleted), CAL16, CAL17, CAL22 (auto-focus), CALB3 (agenda scroll-to-today), CALB7 partial, CALB13 (span dates).
**Kitchen:** K1, K2, K4–K5, K7–K10, K12, K16 partial (in-flight flag), K17, K19, K23–K25, K29–K31, K36, K39, K3 (cook/vote/who CSS → components.css, tokenized) + K26.
**Admin:** A1 (all raw rundown/ refs gone, incl. autoPrune + email imports), A2 (full cascade + rebuild + honest copy), A3, A4 (mirror writes retired), A7–A14, A16 partial, A18, A20, A23, plus SM1's settings field (temperature unit; weather-cache flush on change).
**Rewards:** R1, R2, R6, R9. **Scoreboard:** SB1, SB2, SB8 (bell side). **Tracker:** TR1, TR2, TR6.
**Kid:** KD1–KD6, KD13. **Person:** P1 (+ parity comment).
**Activities:** AC2–AC6, AC9, AC11–AC14, AC16, AC20 (+ Worker-side AC1 in batch 2). **Setup:** SU1, SU2, SU8.
**CSS:** CSS5, CSS12, CSS14, CSS15, CSS25, scoreboard reduced-motion (A.5). **SW:** CACHE_NAME → v344.

## Deferred / still open (visual-verification or larger scope)

- **Needs on-device visual verification before changing:** CALB2 (calendar `overflow:hidden; height:100dvh` page lock — interacts with the month view's nested scroll), DB21/DB22 (Today-section empty state with events + day-nav chevrons), CAL13 (dead density toggles removal touches rendered controls), CAL18 (week-strip completing animation), K39/K40 visual side, KB1–KB11 (kid celebration/CSS architecture), CSS13/16/17 sweeps, CSS24 full contrast sweep, CSS26 tap targets.
- **Mechanical sweeps not yet exhaustive:** remaining emoji-in-chrome sites (kitchen AI sheet K21, scoreboard SB9, kid KB6, activities AC28, dashboard DB28 partial), inline-style sweeps (K20, AB5 remainder, KD14, SB13, AC21), dead code/CSS (CAL14 remainder, K15, K27, A21/A22/A27, CALB11, C10–C15).
- **Product decisions needed:** SC3/SB14 (single "week" definition app-wide), S6 (unassigned events under person filters), AC8 (§5.13 vs §6.11 FAB contradiction), R13 (wishlist: build UI or delete schema), K11 (recipe image storage strategy — biggest data-cost item), SR3 caveats (refund type for kid history/totalEarned), W3 (approval trust model).
- **Docs re-sync (§18)** — not started; one PR updating DESIGN.md/CLAUDE.md to match shipped reality.

⚠️ Deploy notes: merge to main auto-deploys the frontend; the **Worker changes (batch 2) require `npx wrangler deploy --config workers/wrangler.toml` separately**. Recommend a Cloudflare dashboard rate-limit rule on the Worker route as the real abuse ceiling.

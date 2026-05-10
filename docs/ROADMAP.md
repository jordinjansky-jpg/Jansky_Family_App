# Daily Rundown — Product Roadmap

**Direction:** Evolve from a task manager into a free Skylight Calendar competitor — a family hub. Superior task/scoring engine already exists; the goal is adding hub features (calendar, meals, lists, kiosk display) that make it the family's single go-to screen. Design bar: as clean as Skylight, as easy as Google Calendar. All features run on free tiers except AI features (~$0.03/month via Claude API).

**Read before feature planning.** For UI placement rules, see [DESIGN.md](DESIGN.md) §2 (feature-home map).

---

## Nav Bar
Currently **5 slots: Home · Kitchen · Scores · Rewards · More** — tab bar is capped at 5, no exceptions. Adding a slot requires retiring one.
More sheet contains: Admin · Calendar · Tracker · Theme.
Activities (1.6) would earn a slot only by retiring an existing one (Rewards is the candidate if it moves fully into Scoreboard).

---

## Tier 1 — The Family Hub Transformation

~~**1.1 — Calendar Overhaul** · DONE — shipped 2026-04-16~~
Three-view calendar (month/week/day), first-class events, quick-add, time-grid, swipe nav, person filters.

~~**1.2 — Rewards Store** · DONE — shipped 2026-04-18~~
Points economy, parent-defined rewards, notification bell, approval flow, kid store/wishlist, functional rewards (task skip, penalty removal), bounty tasks, 13 achievement badges, bonus multiplier days.

~~**1.3 — Meal Planning** · DONE — shipped 2026-04-25~~
Meal library + per-day slots. Migrated into Kitchen Hub (1.8).

~~**1.4 — Weather Widget** · DONE — shipped~~
`shared/weather.js` + dashboard ambient strip chip. OpenWeatherMap free tier, 5-day forecast, admin location/API key settings.

---

**1.5 — Kiosk / Wall Display Mode** · Medium (~1-2 sessions) · Depends on 1.1, 1.3, 1.4 · Cost: $0 (hardware ~$175-255)

`display.html` — dedicated full-screen mode for a wall-mounted touchscreen or tablet. NOT read-only — full interactivity at large scale. Default state: week overview (events + tasks + meals + weather). Larger touch targets, no browser chrome, auto-wake/sleep. No admin access. Launches via Chromium `--kiosk` flag or Android full-screen.

---

**1.6 — Activities** · Medium-high (~3-4 sessions, two phases) · No dependencies · Cost: $0

Family activity tracker — shared library of optional activities (walk, read, jog) with Firebase-persisted stopwatch. Weekly goals with tiered point payouts. Separate activity scoreboard. Timer built as `shared/timer.js` (reused by 3.1 Task Timer). Lives in More tab on phone.

Full spec: [superpowers/specs/2026-04-19-activities-design.md](superpowers/specs/2026-04-19-activities-design.md)

- **Phase 1:** Activity library, shared timer component, stopwatch, session logging, time leaderboard, admin management
- **Phase 2:** Weekly goals, tiered payouts, goal achievement scoreboard, kid mode activities page, per-kid toggles

---

~~**1.7 — Shopping Lists** · SUPERSEDED by 1.8 Kitchen Hub~~

---

**1.8 — Kitchen Hub** · Mostly shipped · In progress

`kitchen.html` / `kitchen.js` — combined hub (Lists, Recipes, Staples, Plan) superseding 1.3 + 1.7.

**Shipped:** List CRUD with AI auto-categorize, recipe library (URL + import), staples, bulk-add FAB, 7-day meal look-ahead, plan-a-meal sheet, recipe detail (hero image, two-column ingredients, metadata chips).

**Pending:**
- school-lunch-2 slot display in week view plan
- Add-from-recipe shortcut to shopping list
- `dashboard.js` `openRecipeForm` still missing the `imageUrl` field (prepTime/servings/difficulty/chip-picker shipped 2026-05-10 alongside the form-system initiative)

**1.8a — Recipe Polish (backlog sub-items)** · Low-Medium each

- **Servings scaler** — tap Serves chip to change count; all quantities recalculate in real time. Needs fraction-aware math.
- **Cook mode** — full-screen step-by-step with large text, screen-stay-on (WakeLock API), built-in per-step timer. Reuses `shared/timer.js` (1.6).
- **Pantry awareness** — mark staples as always stocked; strike in ingredient list; "Add to list" skips stocked items. Schema: `kitchen/pantry/{itemName}: true`.
- **Family ratings** — rate a meal after cooking (1–5 stars + note). `mealLibrary/{id}/ratings: [{personId, stars, note, date}]`.
- **Photo storage for manual recipes** — resize to 640px JPEG in browser, store as base64 in `imageUrl`. ~15KB each.
- **Recipe source attribution** — favicon + "from allrecipes.com" chip. `sourceDomain` partially implemented.

---

## Tier 2 — Deepening the Platform

**2.1 — Push Notifications** · High (~2-3 sessions) · Depends on 1.1 · Cost: $0

Daily reminders, event alerts (15/30/60 min before), task nudges. Requires FCM + Cloudflare Worker for server-side scheduling. Per-person preferences (types + quiet hours). This is what enables fully replacing Google Calendar — people keep GCal until it buzzes their phone before the dentist appointment.

---

**2.2 — Flexible Recurrence** · High (~2 sessions) · Depends on 1.1 · Cost: $0

"Every N days", "every other week", "1st and 15th of month". Schema: add `recurrenceRule` to task/event. Extends `shared/scheduler.js` (~850 lines).

---

~~**2.3 — AI Import Suite** · DONE — shipped incrementally through 2026-04~~

All 14 handlers live in `workers/kitchen-import.js` with frontend triggers wired across dashboard / kitchen / calendar / admin:

- **Recipe URL → recipe** (`url`) — Kitchen recipe form wand
- **Recipe photo → recipe** (`screenshot`) — Kitchen recipe photo button
- **School lunch PDF/photo** (`schoolLunch`) — Admin upload, fills `meals/{date}/school-lunch`
- **Calendar photo → events** (`calendarPhoto`) — Event Form photo button (dashboard + calendar) → confirm sheet
- **iCal subscription** (`ical`) — Worker fetch (CORS bypass) + parse — Event Form iCal button + admin iCal feed
- **Text → events** (`parseEvent`) — Event Form wand + calendar event-text-paste
- **Homework scanner** (`taskScan` / `homeworkScan` alias) — Admin upload → tasks with due dates
- **Photo → shopping list** (`photoToList`) — Kitchen list FAB photo
- **Email → calendar** (`handleEmailMessage`) — Cloudflare Email Routing → Worker email handler → confirm sheet (requires user to wire up Email Routing in Cloudflare dashboard)
- **List utilities** — `categorize`, `cleanList`, `mergeQty`, `dedupIngredients` — used throughout kitchen flows

Full UX spec (historical): [superpowers/specs/2026-04-29-ai-features-polish.md](superpowers/specs/2026-04-29-ai-features-polish.md)

---

**2.4 — Vacation / Skip Mode** · Medium (~1-2 sessions) · No dependencies · Cost: $0

Mark a person as away for a date range. Schema: `rundown/people/{id}/away: [{start, end}]`. Scheduler skips placing tasks for away people. Dashboard: `--vacation` banner (highest priority — outranks freeze/overdue/multiplier/info). Calendar shading for away days.

---

**2.5 — Birthday & Milestone Tracking** · Low (~0.5 session) · No dependencies · Cost: $0

`birthday` field on people. Auto-creates annual recurring birthday events. Countdown chip in kid mode. Extend to anniversaries, first day of school.

---

## Tier 3 — Polish & Engagement

**3.0 — Dashboard Loading Skeleton** · Low

Card-shaped skeleton (owner-stripe + title bar + meta bar + check placeholder) while Firebase loads. Respects `prefers-reduced-motion`.

---

**3.1 — Task Timer / Stopwatch** · Medium (~1-2 sessions) · Depends on 1.6 (shared timer) · Cost: $0

Visible countdown on task cards using `estMin`. Start button → timer overlay. Optional auto-complete on finish. Reuses `shared/timer.js` built in 1.6 — do not build a second timer.

---

**3.2 — Task Delegation / Swaps** · Medium-high (~2 sessions) · Depends on 2.1 · Cost: $0

Family members propose task trades. Schema: `rundown/trades/{pushId}`. UI: notification badge, proposal from detail sheet, accept/decline list.

---

**3.3 — Dashboard "Coming Up" Rail** · Medium (~1-2 sessions) · No dependencies · Cost: $0

Collapsible 7-day forward look on dashboard. Events-only in the collapsed summary. Tapping a day-block jumps `viewDate`. Filter-aware. Persists collapsed state in `localStorage['dr-coming-up-state']`.

---

**3.4 — Kid Feelings Check-in** · Low (~0.5 session) · No dependencies · Cost: $0

Daily mood check-in in kid mode — 5 emoji options. Logged once per day to `rundown/feelings/{personId}/{YYYY-MM-DD}`. Resets each morning.

---

**3.5 — Family Message Board** · Medium (~1 session) · No dependencies · Cost: $0

Shared sticky-note thread on dashboard. Any member can post short notes ("Don't forget soccer cleats!"). Notes expire after 7 days or are manually dismissed. Separate from the notification bell (which is parent→kid only).

---

## Tier — Form Polish Initiative (parked feature items)

**Context:** Form review on 2026-05-09 ([superpowers/specs/2026-05-09-form-review.md](superpowers/specs/2026-05-09-form-review.md)) surfaced both polish gaps AND feature-shaped items. The polish work is tracked in DESIGN.md §5.23 v2 + the form-system initiative (Phase 1 builds `fs-*` primitives, Phase 2 fixes Event Form, Phase 3 propagates to every form, Phase 4 dedupes copies, Phase 5 a11y sweep). The items below are **feature decisions that need product approval before implementation** — they are NOT polish blockers. Each is sized as low/medium individually.

- **Family / All-kids quick-select chip** (Task + Event forms) · Low · Adds an accent-colored chip next to the For label that selects all family members in one tap. DESIGN.md §5.23 documents the `.<prefix>-person-chip--family` style for forms that opt in.
- **Avatar / photo upload on Person form** · Low-Medium · Today people are color + first letter; add resized 96px avatar stored as base64 (~5KB each).
- **Color picker for Reward icon background** · Low · Most paid family apps offer color + emoji combo; today only emoji.
- **URL/link field on Event form** · Low · Zoom/Meet/school events commonly include a link; currently no field.
- **Recipe ingredient autocomplete** · Medium · Suggest from past ingredients + staples as user types in Recipe form.
- **Recipe optional disclosures** · Low · `+ Tags`, `+ Cook time`, `+ Yield/units` chips beyond the existing Prep / Serves / Difficulty.
- **Recipe image preview after photo upload** · Low · Today the photo is stored in a hidden `imageUrl` variable with no thumbnail in the form.
- **Badge two-step wizard** (1: name + emoji, 2: trigger + reward) · Medium · The current single-screen badge form is dense; two-step would reduce cognitive load.
- **Badge preview in scoreboard before saving** · Low-Medium · Show how the badge will appear in the trophy case + scoreboard.
- **Reward shop-card preview before saving** · Low-Medium · Show how the reward will appear in the Shop.
- **Person form: nickname / pronouns / birthdate fields** · Low · Captures more identity beyond name + color. Note: birthdate may overlap with 2.5 Birthday & Milestone Tracking — coordinate.
- **Shopping list icon/color picker** · Low · Differentiate Walmart vs Target vs Costco visually beyond the name.
- **Bulk-add inline "save to staples" star** · Low · Currently the star only appears after the item is added to the bottom list; should appear as user types.
- **Hide Badge threshold input when condition is boolean** · Low · "First Store Purchase" condition has no threshold; field should disappear.
- **Show "≥" comparison operator on Badge condition** · Low · Currently `Current Streak (days) [e.g. 7]` is ambiguous about >, =, ≥.
- **Pricing-help calculator extended to Task points** · Low-Medium · The Reward form's grade-based points calculator could help Task creators set difficulty/duration → expected points.
- **Image thumbnails on Meal Plan recipe rows** · Low · Currently recipe rows are plain text; paid meal-planning apps show small images.
- **Meal Plan default list (favorites + 3 most-recent)** · Low · DESIGN.md §5.24 already calls for this; implementation hides the list until the user types in search.
- **Recipe form: reorder so name comes above link** · Low · Today URL is at top, name second; reverse for natural-first focus.
- **Auto-collapse Recipe URL input after parse** · Low · Once AI parses the URL, fold the URL field away.

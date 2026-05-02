# Daily Rundown — Family Task Manager

A family chore/task management app with scheduling, scoring, and gamification. Each family member gets assigned daily, weekly, monthly, and one-time tasks with point-based scoring, letter grades, and streak tracking.

## Tech Stack
- **Frontend:** Vanilla JS (ES modules), HTML, CSS — no framework, no bundler, no npm
- **Database:** Firebase Realtime Database (compat SDK via CDN — `firebase.` global, not modular imports)
- **Hosting:** Cloudflare Pages — static files served as-is via `git push` to `main`
- **Auth:** Cloudflare Zero Trust / Access — family-only access via Google Sign-In. Team: `jansky-family`. App URL: `dashboard.jansky.app`.
- **Workers:** Cloudflare Workers (`workers/kitchen-import.js`) — AI features via Claude Haiku API. Deploy with `wrangler deploy workers/kitchen-import.js`.
- **Styling:** Modular CSS split by responsibility, themed via JS at runtime. Service worker caches app shell for offline support.

## Commands
```bash
# Deploy frontend (auto-deploys on push to main via Cloudflare Pages)
git push origin main

# Deploy Cloudflare Worker (requires terminal; or use Cloudflare dashboard → Workers & Pages → Edit code)
npx wrangler deploy workers/kitchen-import.js
# Note: wrangler may fail in PowerShell due to execution policy — use cmd.exe or the dashboard editor

# No build step, no test suite, no package.json
# Open any .html file directly in browser for local dev (needs Firebase connection)
```

## File Structure
```
/                         ← Served as-is by Cloudflare Pages
├── index.html            ← Dashboard shell — loads dashboard.js
├── dashboard.js          ← Dashboard logic — daily task list, completion toggling, progress, overdue banner
├── kitchen.html          ← Kitchen hub — shopping lists, recipes, staples, meal look-ahead
├── kitchen.js            ← Kitchen logic — list CRUD, auto-categorize via Worker, recipe import, staples
├── person.html           ← Per-person PWA entry (?person=Name) — installable home screen shortcut
├── calendar.html         ← Three-view calendar (month/week/day) with swipe nav, quick-add events, person filters
├── scoreboard.html       ← Leaderboard, grades table, trend sparklines, category breakdown
├── tracker.html          ← Weekly/monthly task status rows, filters, skipped task detection
├── admin.html            ← PIN-gated admin (tasks, people, categories, settings, theme, schedule, data, debug)
├── kid.html              ← Kid-friendly view (?kid=Name), emoji hints, celebrations, simplified UI
├── setup.html            ← First-run wizard (6 steps: info, people, categories, theme, PIN, finish)
├── manifest.json         ← PWA manifest for home screen installability
├── workers/
│   └── kitchen-import.js ← Cloudflare Worker — AI categorization, recipe import (URL + photo), future: school lunch PDF, iCal, email
├── shared/
│   ├── firebase.js       ← Firebase init + CRUD helpers + real-time listener wrappers (~25 exports). Only module that touches DB.
│   ├── scheduler.js      ← Schedule generation: rotation, cooldown, load balancing, duplicate mode (~850 lines)
│   ├── scoring.js        ← Points formula, letter grades, snapshots, streaks, weighted categories (~400 lines)
│   ├── state.js          ← Completion queries, entry filtering/sorting/grouping (~115 lines)
│   ├── components.js     ← All reusable HTML rendering: cards, sheets, forms, filters (~600 lines)
│   ├── dom-helpers.js    ← Small DOM-binding helpers (initOwnerChips, getSelectedOwners). Only shared module besides theme.js permitted to touch DOM.
│   ├── theme.js          ← 5 theme presets, CSS variable generation, localStorage cache (~260 lines)
│   ├── utils.js          ← Date math, timezone handling, formatting, debounce (Intl-based, no libraries)
│   └── calendar-views.js ← Month/week/day view renderers for calendar.html (~600 lines)
└── styles/
    ├── base.css          ← CSS variables, reset, typography
    ├── layout.css        ← Header, nav bar, page-content, spacing
    ├── components.css    ← Task cards, buttons, forms, badges, progress bars
    ├── dashboard.css     ← Date header, time sections, task detail sheet, celebration
    ├── calendar.css      ← Calendar grid, day cells, day sheet
    ├── scoreboard.css    ← Leaderboard, sparklines, category breakdown
    ├── tracker.css       ← Status rows, filters, weekly/monthly grids
    ├── admin.css         ← Admin forms, tabs, PIN screen, setup wizard
    ├── kitchen.css       ← Kitchen hub styles
    ├── kid.css           ← Kid mode specific styles
    └── responsive.css    ← Breakpoint overrides (400px, 768px, 1024px)
```

## Architecture Decisions
- **Firebase root:** `rundown/` — NEVER touch `cleaning/*` (separate legacy app)
- **Module rules:** Shared modules are pure functions (no DOM). Exception: `theme.js` touches `document` for CSS vars. Pages own all DOM manipulation.
- **Data flow:** Firebase is single source of truth. Theme cached in localStorage (`dr-theme`) for instant load before Firebase responds.
- **Rendering:** Full re-render on data/filter changes (not incremental). Bottom sheets mount/unmount rather than persist.
- **Imports:** All ES module imports use relative paths with `.js` extensions — bare imports break without bundler.
- **Schema:** Changes require a migration plan since data is live in production Firebase.
- **CSS split:** Styles are split into 11 files by responsibility. Each page loads only the CSS it needs via multiple `<link>` tags. Order matters: base → layout → components → page-specific → responsive.
- **Offline support:** Service worker caches the full app shell (network-first strategy). Firebase API calls are network-only. The app loads and functions offline; writes queue and sync on reconnect.
- **Real-time updates:** Dashboard, calendar, and kid mode use Firebase `onValue` listeners for completions and schedule. Renders are debounced at 100ms. Scoreboard and tracker use one-shot reads (historical data).
- **Swipe gestures:** Horizontal swipe anywhere on page navigates between days (dashboard/kid) or months (calendar).
- **Workers:** `workers/kitchen-import.js` is a Cloudflare Worker handling AI tasks. It uses `callClaude()` (shared Haiku helper) and routes on `body.type` (`categorize` | `url` | `screenshot` | future types). Secrets: `CLAUDE_API_KEY` via `wrangler secret put`.
- **Form sheets — canonical pattern is the Event Form.** All form sheets in the app must follow §5.23 of [docs/DESIGN.md](docs/DESIGN.md) (Form sheet pattern) and the §13.13 authoring recipe. Reference implementation: `renderEventForm()` in [shared/components.js](shared/components.js) + `openEventForm()` in [dashboard.js](dashboard.js). Each form gets its own CSS prefix (`ef2-*` for event, new ones like `tf-*` / `rf-*` for new forms). Non-negotiables: no `<input type="time">` (use the 6-select pattern), no horizontal padding on form sections (bottom-sheet provides it), sticky footer with negative-margin breakout, sub-sheet stacking via a second overlay, `captureFormState()` round-trip across sub-sheets.

## Firebase Schema (`rundown/`)
```
rundown/
├── settings          ← flat object { appName, familyName, timezone, weekendWeight, theme: {...} }
├── people/
│   └── {pushId}      ← { name, color }
├── categories/
│   └── {pushId}      ← { name, icon, isEvent?, eventColor?, weightPercent?, showIcon?, isDefault?, pinProtected?,
│                         dailyLimitPerPerson?, dailyLimitPerHousehold? }
├── tasks/
│   └── {pushId}      ← { name, rotation, owners[], ownerAssignmentMode,
│                         timeOfDay, dedicatedDay?, dedicatedDate?, cooldownDays?, estMin,
│                         difficulty, category, status, createdDate, exempt?, eventTime?, notes? }
│                       rotation: 'daily' | 'weekly' | 'monthly' | 'once'
│                       ownerAssignmentMode: 'rotate' | 'duplicate' | 'fixed'
│                       timeOfDay: 'am' | 'pm' | 'anytime' | 'both'
│                       eventTime: 'HH:MM' (24h) | null — appointment time for event tasks
├── schedule/
│   └── {YYYY-MM-DD}/
│       └── {entryKey} ← { taskId, ownerId, rotationType, ownerAssignmentMode, timeOfDay, notes? }
│                       entryKey format: sched_{timestamp}_{counter}
├── completions/
│   └── {entryKey}     ← { completedAt: ServerValue.TIMESTAMP, completedBy: 'dashboard'|'calendar'|'kid-mode',
│                          pointsOverride?: number (percentage 0-150, null = use base),
│                          isLate?: true (set when completing a past-date task) }
├── snapshots/
│   └── {YYYY-MM-DD}/{personId}  ← { earned, possible, percentage, grade, missedKeys[] }
├── streaks/
│   └── {personId}               ← { current, best, lastCompleteDate }
├── rewards/
│   └── {pushId}      ← { name, icon, pointCost, rewardType, perPerson?, maxRedemptions?,
│                         streakRequirement?, expiresAt?, status: 'active'|'archived' }
│                       rewardType: 'custom' | 'task-skip' | 'penalty-removal'
├── messages/
│   └── {personId}/
│       └── {pushId}  ← { type, title, body?, amount, rewardId?, entryKey?, seen, createdAt, createdBy,
│                         rewardName?, rewardIcon?, bankTokenId? }
│                       type: 'bonus' | 'deduction' | 'redemption-request' | 'redemption-approved' | 'redemption-denied'
│                             | 'use-request' | 'use-approved' | 'use-denied' | 'task-skip-used' | 'penalty-removed' | 'reward-used'
├── balanceAnchors/
│   └── {personId}    ← { amount, anchoredAt }
├── bank/
│   └── {personId}/
│       └── {pushId}  ← { rewardType, rewardId?, rewardName?, rewardIcon?,
│                         acquiredAt, used, usedAt?, targetEntryKey? }
├── wishlist/
│   └── {personId}/
│       └── {rewardId} ← { addedAt }
├── achievements/
│   └── {personId}/
│       └── {achievementKey} ← { unlockedAt, seen, revoked?, revokedAt? }
├── multipliers/
│   └── {YYYY-MM-DD}/
│       └── {personId} ← { multiplier, note?, createdBy }
├── meals/
│   └── {YYYY-MM-DD}/
│       └── {slot}     ← { mealId, source: 'manual'|'school' }
│                        slot: 'breakfast'|'lunch'|'dinner'|'snack'|'school-lunch'|'school-lunch-2'
├── mealLibrary/
│   └── {pushId}      ← { name, url?, notes?, tags?, ingredients?, isFavorite, prepTime?, createdAt, lastUsed }
├── kitchen/
│   ├── lists/
│   │   └── {listId}  ← { name, createdAt, sortOrder }
│   ├── lists/{listId}/items/
│   │   └── {itemId}  ← { name, checked, category?, addedBy?, addedAt }
│   ├── recipes/
│   │   └── {pushId}  ← { name, url?, notes?, ingredients: [{name, qty?}], createdAt, lastUsed? }
│   ├── staples/
│   │   └── {itemId}  ← { name, category? }
│   └── plan/
│       └── {YYYY-MM-DD}/
│           └── {slot} ← { mealId } (mirrors rundown/meals for kitchen context)
└── debug/eventLog/    ← { ...data, timestamp }
```

## Scoring System
- **Points formula:** `max(estMin, 5) × difficultyMultiplier`. Both operands are integers; no rounding. Difficulty multipliers are configurable per-family via `settings.difficultyMultipliers` (defaults `{easy:1, medium:2, hard:3}`, clamped 1–10 in admin UI). Floor of 5 minutes ensures every task is worth at least `5 × mult`, so late penalties (`basePoints × pointsOverride/100`) always produce a visible reduction even on the smallest tasks.
- **Grade bands:** A+ (97-100), A (93-96), A- (90-92), B+ (87-89), B (83-86), B- (80-82), C+ (77-79), C (73-76), C- (70-72), D+ (67-69), D (63-66), D- (60-62), F (0-59)
- **Daily score:** `(earnedPoints / possiblePoints) × 100` — per person
- **Weighted categories:** `ownerRegularPts × (W / (100 - W))` — uses per-person regular task totals
- **Late completion penalty:** Set at completion time, not scoring time. When completing a past-date task, `pointsOverride` is set to `pastDueCreditPct` (default 75%) and `isLate: true` is flagged. Slider shows the penalty and is adjustable by parents. Pre-set slider overrides take priority over the late penalty.
- **Streaks:** consecutive all-complete days per person (current + best). DST-safe: `Math.abs(diff - 1) < 0.01`
- **Snapshots:** immutable daily records created at rollover (fire-and-forget on dashboard load)
- **Aggregation:** weekly/monthly/12-month grades computed from snapshots at render time (not stored)
- **Exclusions:** Event categories and exempt tasks are excluded from all scoring

## Key Behavior Rules
These are non-obvious rules that can't be derived from reading the code in isolation:

- **Scheduler scope:** Generates 90 days of future entries (tomorrow onward). New tasks also get a today entry at creation time (except one-time tasks with a future dedicatedDate).
- **Schedule reset:** Ignores prior completions and cooldowns — wipes and re-places all future entries.
- **Overdue logic:** Only non-daily tasks from past dates count as overdue. Daily tasks are excluded (they repeat naturally).
- **One-time tasks:** With `dedicatedDate`, placed on that exact date. Without it, load-balanced to lightest day.
- **Completion:** Allowed on any date (no future-date blocking). Completed tasks render at the bottom of all task lists. **Past daily tasks are tap-blocked** — tapping opens the detail sheet instead of toggling. Long-press or sheet button required to complete. All past-date completions (any rotation) get `isLate: true` + `pointsOverride: pastDueCreditPct`.
- **Task grouping order (dashboard/kid):** Events → Daily → Weekly → Monthly → One-Time, then by owner within each group.
- **Task grouping order (calendar day sheet):** Events → Monthly → Weekly → One-Time → Daily. Different from dashboard intentionally — calendar emphasizes uncommon recurrences first since users open the sheet for scheduling visibility, not the daily grind.
- **Long-press:** Opens detail sheet. Tap toggles completion. Horizontal swipe navigates days (dashboard) or months (calendar). Timing: **500ms on tracker**, **800ms on calendar/kid/dashboard**.
- **Duplicate mode:** Creates one schedule entry per owner. Fixed mode always uses first owner (used for events).
- **Daily cooldown:** Tasks with `cooldownDays` are spaced at fixed intervals (`cooldownDays + 1` days apart).
- **Scoreboard blending:** Weekly grades blend snapshots (past days) + live daily score (today) for accuracy.
- **Kid mode:** Isolated view at `kid.html?kid=Name`. No nav bar, no admin access, no task editing. Per-child settings control features.
- **Admin PIN:** 4-digit PIN with 30-min session cache in sessionStorage. Recovery PIN is always `2522`.
- **Calendar sheet height:** Locks on open so person filter changes don't cause resize jitter.
- **Rewards balance:** Normalized to 100 pts/day max from daily score percentage (read from snapshots). Balance = anchor + snapshot earnings × multipliers + bonuses − deductions − redemptions. Computed on-the-fly, never stored.
- **Bounty tasks:** Scoring-exempt (`exempt: true`). Grant points or rewards automatically on completion. Multi-person bounties are first-come-first-served — completing removes other owners' schedule entries.
- **Reward bank:** ALL approved rewards go to the bank (`bank/` node), not just functional ones. Custom rewards require a second parent approval via `use-request` when the kid wants to use them. Functional rewards (Task Skip, Penalty Removal) are used immediately from the bank without re-approval. Kid approval overlay shows "Use Now" / "Save for Later" buttons.
- **Achievements revoke vs reset:** Revoking marks `{ revoked: true }` — achievement stays locked and won't re-fire. Resetting deletes the record entirely — achievement can be re-earned when criteria are met fresh (e.g., after scoreboard clear).
- **Scoreboard clear cascade:** Clears snapshots, streaks, completions, balance anchors (reset to 0), messages, and bank tokens. Achievements and tasks/schedule are preserved.
- **Notification bell:** Shared `initBell()` on all non-kid pages. Shows unseen count badge, pending approval requests, recent activity. Parents approve/deny redemptions, send bonus/deduction messages, and create bonus multiplier days from the bell dropdown.
- **Achievements:** 13 milestone badges checked on kid mode load. Unseen achievements show full-screen unlock overlays. Trophy case displays in kid mode; badge icons show on scoreboard cards.
- **Person delete cascade:** Removing a person in admin also cleans up messages, balance anchors, bank tokens, wishlist, and achievements via `deletePersonRewardsData()`.
- **Kitchen Worker routing:** `POST {type, input}` → `categorize` (item name string) | `url` (URL string) | `screenshot` ({base64, mediaType}). Returns `{category}` or `{name, ingredients:[{name,qty}], notes, url}`. CLAUDE_API_KEY secret required.

## Gotchas (Critical)
- Firebase RTDB compat SDK (not modular) — all access via `firebase.` global after CDN load
- Timezone: always use `settings.timezone` for date calculations, never local device time
- ES module imports MUST have `.js` extension — bare imports break without bundler
- `rundown/settings` is a flat object, not nested under a push ID
- Schedule key collisions: `Date.now()` returns same value in tight loops — always use counter-based keys (`sched_{timestamp}_{counter}`)
- Streak float comparison: DST can make day diff != exactly 1 — use `Math.abs(diff - 1) < 0.01`
- Rotation change handlers that modify label innerHTML must save/restore child elements (e.g., 📅 button) and re-bind listeners
- Task deletion must clean up orphaned schedule entries AND completions
- Weekend weight uses global load balancing across all owners (not per-owner)
- Category key auto-slugified from label (lowercase, hyphens, trim trailing)
- Editing an existing task in admin now auto-rebuilds the future schedule (no manual "Rebuild" click needed)
- All pages use `loadData(); render()` pattern for in-place refresh after mutations (NOT `location.reload()`)
- CSS has `--font-size-md: 1rem` between `sm` (0.8125rem) and `base` (0.9375rem) — used by scoreboard cards
- SW cache list must be updated manually when files are added/renamed (bump `CACHE_NAME` version in sw.js)
- CSS `<link>` tag order matters: base, layout, components, page-specific, responsive
- **Cloudflare Access:** App is locked to Google Sign-In via Zero Trust. The Access application is configured for `dashboard.jansky.app` (subdomain `dashboard`, domain `jansky.app`) — NOT `jansky.app` root. Session duration: 1 month. Kids use parent's login. Path-based Bypass for kid.html is unreliable on the free tier — removed; parents log in once per device.
- **Worker deploy:** Workers are NOT auto-deployed with `git push`. Must run `wrangler deploy` separately (terminal or Cloudflare dashboard editor). PowerShell may block `npx` due to execution policy — use cmd.exe or paste code directly in dashboard.

## Changelog (last 5)
- Form patterns codified (2026-05-02): dashboard meal picker rewritten to match kitchen's `openPlanMealSheet` exactly — `kp-*` CSS layout, date picker + slot `<select>`, recipe pick list, `kp-footer` Cancel+Save. `+ New recipe` opens inline recipe form (no page navigation) via close-delay-open callback: `closeTaskSheet() → openRecipeForm(onSave) → onSave reopens picker with new ID`. Recipe form is page-local in `dashboard.js` (`openRecipeForm`, `_cleanIngredientName`, `_PREP_PREFIXES`). Two form patterns now canonical: **Event Form** (§5.23) for structured-data entry, **Picker-list** (§5.24, `kp-*` classes) for pick-from-library flows. SW cache v130.
- Event Form Redesign (2026-05-01): new mobile-first form is the canonical reference for all future forms. `renderEventForm` in `shared/components.js` + `openEventForm` in `dashboard.js`. ef2-* CSS prefix. Custom 6-select time picker (no native wheel), inline date picker, person chip state machine with color dots + horizontal scroll fade, Family chip in section header, sticky footer with negative-margin breakout, sub-sheet stacking via `.ef2-subsheet-overlay`, `captureFormState()` round-trip. Photo source action sheet (Camera/Gallery/Files) with optional context note. Repeat sub-sheet (Daily/Weekly/Monthly/Yearly/Custom + ends-on). Worker handlers: `parseEvent`, `calendarPhoto` (now honors user `context`), `ical`, `cleanList`, `dedupIngredients`, `mergeQty`. Spec: [docs/superpowers/specs/2026-05-01-event-form-redesign.md](docs/superpowers/specs/2026-05-01-event-form-redesign.md). Pattern doc: DESIGN §5.23 + §13.13. SW cache v115.
- Kitchen hub (2026-04-29): kitchen.html — combined shopping lists + meals + recipes + staples (supersedes 1.3+1.7). Wand button on list does AI deep clean (cleanList Worker handler — dedup, rename, re-categorize). Per-add AI removed; heuristic-only on add (free, instant). Editable qty in shopping list edit, editable name+qty in recipe form ingredients, smart `mergeQty` for combined units, `cleanIngredientName` strips prep/parens at every entry point.
- Weather widget (1.4): `shared/weather.js` + ambient strip chip on dashboard. OpenWeatherMap free tier, 5-day forecast sheet, admin location/API key settings, `viewDate`-aware, localStorage cache. `settings.ambientStrip` now defaults to `true`.
- Meal Planning (1.3): meal library + per-day slot assignments, plan/detail/editor sheets, calendar day view, admin Meals tab, kid Tonight tile, ambient strip wired. (Schema migrated into Kitchen.) SW cache v64.

## Backlog

Product direction: evolve Daily Rundown from a task manager into a **Skylight Calendar competitor** — a free, web-based family hub. The app already has a superior task/scoring engine; the goal is to add the hub features (calendar, meals, lists, display) that make it the family's single go-to screen. Design bar: as clean as Skylight, as easy to use as Google Calendar. All features run on free tiers except AI import features (~$0.03/month via Claude API).

### Tier 1 — The Family Hub Transformation

~~**1.1 — Calendar Overhaul** · DONE — shipped 2026-04-16. Three-view calendar (month/week/day), first-class events with quick-add, time-grid layout, swipe navigation, person filters.~~

> Phase 2 calendar rework shelved 2026-04-25. Phone agenda duplicates dashboard; Month needs kiosk. Shelved plan: [docs/superpowers/plans/shelved/2026-04-24-phase-2-calendar.md](docs/superpowers/plans/shelved/2026-04-24-phase-2-calendar.md).

~~**1.2 — Rewards Store** · DONE — shipped 2026-04-18. Points economy (100 pts/day), parent-defined rewards, notification bell, approval flow, kid store/history/wishlist, functional rewards (task skip, penalty removal), bounty tasks, 13 achievement badges, bonus multiplier days, admin balance management.~~

~~**1.3 — Meal Planning** · DONE — shipped 2026-04-25. Meal library + per-day slots, plan/detail/editor sheets, calendar day view, admin Meals tab, kid Tonight tile, ambient strip wired. SW cache v64.~~

---

~~**1.4 — Weather Widget** · DONE — shipped. `shared/weather.js` + dashboard ambient strip chip. OpenWeatherMap free tier, 5-day forecast sheet, admin location/API key settings, `viewDate`-aware, localStorage cache. `settings.ambientStrip` defaults to `true`.~~

---

**1.5 — Kiosk / Wall Display Mode** · Medium (~1-2 sessions) · Depends on 1.1, 1.3, 1.4 · Cost: $0 (hardware ~$175-255 one-time)

Dedicated full-screen mode (`display.html`) for a 27" wall-mounted touchscreen (or 10" tablet). NOT read-only — full app interactivity at large scale: check off tasks, add events/meals, navigate weeks, kid mode per-child avatar. Default state: week overview (events + tasks + meals + weather). Larger touch targets, no browser chrome, auto-wake/sleep schedule, optional ambient clock mode. No admin access from this view. Launches via Raspberry Pi Chromium `--kiosk` flag or Android tablet full-screen. This is when the Calendar page earns its tab slot back.

---

**1.6 — Activities** · Medium-high (~3-4 sessions, two phases) · No dependencies · Cost: $0

Family activity tracker — shared library of optional activities (walk, read, jog) with persistent stopwatch. Weekly goals with tiered point payouts. Separate activity scoreboard. Timer built as `shared/timer.js` (reusable by 3.1). Running session surfaces as `--info` `running-activity` banner (lowest priority, visible on Scoreboard + Tracker too). Activities lives in More tab on phone. Full spec: [docs/superpowers/specs/2026-04-19-activities-design.md](docs/superpowers/specs/2026-04-19-activities-design.md).

> Dashboard wiring: see [2026-04-25-dashboard-final-design.md](docs/superpowers/specs/2026-04-25-dashboard-final-design.md) §3.2 + §4.6.

---

~~**1.7 — Shopping Lists** · SUPERSEDED — kitchen.html covers shopping lists. See 1.8 Kitchen Hub.~~

---

**1.8 — Kitchen Hub** · Mostly shipped · In progress

kitchen.html / kitchen.js — combined hub (Lists, Recipes, Staples, Plan) superseding both 1.3 Meal Planning and 1.7 Shopping Lists. **What's shipped:** list CRUD with AI auto-categorize, recipe library (URL field + link icons), staples with star/long-press-edit, bulk-add FAB, 7-day meal look-ahead, plan-a-meal sheet. **What's pending:** redeploy Worker with `url` + `screenshot` handlers (fills name + all ingredients with qty from recipe pages); school-lunch-2 slot display in week view plan; add-from-recipe shortcut to shopping list.

---

### Tier 2 — Deepening the Platform

**2.1 — Push Notifications** · High (~2-3 sessions) · Depends on 1.1 · Cost: $0

Daily reminders, upcoming event alerts (15/30/60 min before), task nudges. Requires FCM + Cloudflare Worker for server-side scheduling. Per-person notification preferences (what types, quiet hours). This is the feature that enables "replace Google Calendar" — people keep Google Calendar alongside this app until it buzzes their phone before the dentist appointment.

---

**2.2 — Flexible Recurrence** · High (~2 sessions) · Depends on 1.1 · Cost: $0

Support "every N days", "every other week", "1st and 15th of month" beyond daily/weekly/monthly/once. Schema: add `recurrenceRule` object to task/event. Essential for real Google Calendar replacement. Extends scheduler (~850 lines).

---

**2.3 — AI Import Suite** · Medium (~1-2 sessions) · Depends on 1.3, 1.8 · Cost: ~$0.03/month

All Claude Haiku-powered import features routing through `workers/kitchen-import.js`. Worker pattern is already built; each type adds a handler + UI trigger:

- **School lunch PDF** — parent uploads PDF in admin → Worker extracts menu → writes to `meals/{date}/school-lunch` + `school-lunch-2` tagged `source:'school'`. Display: school emoji, different styling, read-only.
- **Calendar photo → events** — photo of a flyer/whiteboard → Worker returns event objects → confirm sheet → write to schedule.
- **iCal subscription import** — enter TeamSnap/school iCal URL → Worker fetches (avoids browser CORS) + parses → bulk-import events.
- **Email → calendar** — forward emails to a family address (Cloudflare Email Routing, free) → Worker `email` handler extracts events → confirm sheet. Replaces Skylight's "Magic Import".
- **Text/voice → events** — type or speak "dentist Thursday 3pm" → Worker parses → event form pre-filled.
- **Homework scanner** — photo of assignment sheet → Worker extracts tasks with due dates → adds to schedule.
- **Photo → shopping list** — photo of fridge/pantry → Worker identifies what's low → adds to shopping list.

> Worker CLAUDE_API_KEY secret already set. `categorize`, `url`, `screenshot` handlers already deployed (or pending redeploy from 1.8). Add each new type as a handler in the same Worker file.

---

**2.4 — Vacation / Skip Mode** · Medium (~1-2 sessions) · No dependencies · Cost: $0

Mark a person as "away" for a date range. Schema: `rundown/people/{id}/away: [{start, end}]`. Scheduler skips placing tasks for away people. Per-person "Away" toggle in admin with date picker. Family-wide "vacation mode" pauses all non-daily tasks. Dashboard: `--vacation` banner (highest priority — outranks freeze/overdue/multiplier/info). Calendar shading for away days.

---

**2.5 — Birthday & Milestone Tracking** · Low (~0.5 session) · No dependencies · Cost: $0

Add `birthday` field to people. Auto-creates annual recurring "birthday" events. Countdown chip in kid mode and on person's profile card. Same pattern as event tasks but non-deletable + self-scheduling. Extend to family milestones (anniversaries, first day of school). Research-validated: Skylight and Cozi both feature this prominently.

---

### Tier 3 — Polish & Engagement

**3.0 — Dashboard loading skeleton** · Low · Rolled into dashboard final-form implementation plan. Card-shaped skeleton (owner-stripe + title bar + meta bar + check placeholder). Respects reduced-motion.

---

**3.1 — Task Timer / Stopwatch** · Medium (~1-2 sessions) · Depends on 1.6 (shared timer component) · Cost: $0

Visible countdown in kid mode and dashboard using `estMin`. Uses `shared/timer.js` from Activities. Start button on card → timer overlay. Optional auto-complete on finish. Timer-based bounties.

---

**3.2 — Task Delegation / Swaps** · Medium-high (~2 sessions) · Depends on 2.1 · Cost: $0

Family members propose trades. Schema: `rundown/trades/{pushId}` with proposer/target task keys + status. UI: notification badge, trade proposal from detail sheet, accept/decline list.

---

**3.3 — Dashboard "Coming up" rail** · Medium (~1-2 sessions) · No dependencies · Cost: $0

Collapsible 7-day forward look on the dashboard. Events-only count in the collapsed summary. Day-blocks expand to show upcoming events; tapping a day-block jumps `viewDate`. Filter-aware (scopes to `activePerson`). Collapsed state persists in `localStorage['dr-coming-up-state']`. Full spec: [docs/superpowers/specs/2026-04-25-dashboard-final-design.md](docs/superpowers/specs/2026-04-25-dashboard-final-design.md) §3.4.

---

**3.4 — Kid Feelings Check-in** · Low (~0.5 session) · No dependencies · Cost: $0

Quick daily mood check-in in kid mode — 5 emoji options (great/good/ok/sad/rough). Logged once per day to `rundown/feelings/{personId}/{YYYY-MM-DD}`. Parent can view in kid's profile or admin. Resets each morning. Research-validated: among top differentiators of family-focused apps vs task managers.

---

**3.5 — Family Message Board** · Medium (~1 session) · No dependencies · Cost: $0

Shared sticky-note style message thread visible on dashboard and kiosk. Any family member can post a short note ("Don't forget soccer cleats!"). Notes expire after 7 days or are manually dismissed. Distinct from the notification bell (which is parent→kid messages only). Lives on dashboard below events.

---

**Full spec:** [docs/DESIGN.md](docs/DESIGN.md) — single source of truth for all UI decisions. Read it before designing, building, or reviewing anything visual. Mockups live in [mockups/](mockups/).

This digest exists so that if context gets compacted mid-task, the non-negotiables survive. It is not a substitute for the full spec.

### Feature-home map (hard rules)
Every feature has a named home — see §2 in DESIGN.md. Enforced:
- Phone tab bar is currently **4 slots: Home · Scores · Tracker · More** (cap is 5; Calendar removed 2026-04-25. 5th slot reserved for Activities 1.6, whichever ships first).
- Meals, Weather, Kiosk, Vacation, Recurrence, Timer, AI Import, Delegation **never** become tabs.
- Activities is the only backlog feature that earns a new nav slot. Kitchen Hub already lives in More sheet.
- Kitchen Hub lives in More sheet (not a tab); accessible via nav overflow or direct URL.
- No new top-level tab without retiring capacity elsewhere.

### Hard do-not rules (non-negotiable)
- ❌ No fifth tab style; no seventh card pattern — add a variant.
- ❌ No emoji in nav, tabs, buttons, banners, status chips, headers, form labels. Emoji only in user-authored content (task names, reward icons, meal labels).
- ❌ No `overflow:hidden; height:100dvh` page-locking outside kiosk.
- ❌ No Theme/Debug/Add icons in the header — they live in overflow, admin, or a FAB.
- ❌ No gradient text in chrome.
- ❌ No `window.confirm` / `window.alert` — use `showConfirm()`.
- ❌ No hardcoded colors in component CSS — tokens only.
- ❌ No new top-level nav tab without retiring capacity elsewhere.
- ❌ No shipping a feature without empty, loading, and error states.
- ❌ No kid-only components when a modifier will do (`.card.kid`, not `.kid-card`).
- ❌ No tablet as stretched phone.
- ❌ No inline styles in HTML.
- ❌ No primary actions in the top bar on phone — use a FAB.
- ❌ No shipping a feature that doesn't declare its Kiosk appearance.
- ❌ No second timer/stopwatch — use `shared/timer.js` (built in 1.6).
- ❌ No new notification surface — route through the Bell.
- ❌ No two banners at once — use the queue (priority: vacation > freeze > overdue > multiplier > info).
- ❌ No multiple action buttons inline next to an item's name in a list — **one chevron**, detail page owns the actions.
- ❌ No breaking the `rundown/` Firebase root into subapp paths.
- ❌ No CSS framework or bundler — vanilla ES modules + hand-written CSS only.
- ❌ No `!linkedPerson` guards around core controls (bell, overflow Rewards/Admin, person filter chip, FAB). Person mode is the adult PWA shortcut with Home parity. Kid mode is the restricted variant.
- ❌ No `var(--header-height)` in a page wrapper's `padding-top`. `.app-header` is `position: sticky` and reserves its own height in flow — double-counting it leaves a large blank gap below the header.
- ❌ No horizontal margin/padding on `.section` and similar inner groups. The page wrapper (`.page-content` / `.app-shell`) owns the single horizontal gutter. Violation causes double-indentation: tabs and cards appear narrow instead of filling the content area.
- ❌ No tab bar (`tabs tabs--pill`) without verifying `tabs--pill` CSS exists in `components.css`. `tabs--pill` (pill, full-width fill) and `tabs--segmented` (box, full-width fill) are the two variants. Both require their CSS or tabs render unstyled.
- ❌ No sheet sub-structure classes (`sheet__header`, `sheet__footer`, `sheet__content`, `field`, `field__label`) without verifying they exist in `components.css`. These are the canonical classes; using them without CSS makes forms render unstyled. Sheet footer always uses `.sheet__footer` with `.btn` children — each btn gets `flex:1` automatically.
- ❌ No new form sheet without following DESIGN §5.23 (Form sheet pattern) and §13.13 (form authoring recipe). The Event Form is the canonical reference (`renderEventForm` + `openEventForm`). Specifically: (a) no `<input type="time">` — use the 6-select pattern (hour/min/AM-PM × start/end) with `ef2ParseTime` etc. helpers; (b) no horizontal padding on form sections — `.bottom-sheet__content` provides it, doubling indents content while title sits flush; (c) sticky footer must use the negative-margin breakout from §5.23 (`bottom: 0`, NOT a negative bottom value); (d) sub-flows stack via a second `<prefix>-subsheet-overlay`, never push a new bottom-sheet; (e) sub-sheet round-trip must call `captureFormState()` before opening and re-mount via `openXForm(id, savedState)` on return — capture transient UI state too (e.g. `isFamilyMode`, `notesOpen`); (f) icon focus uses background tint, not outline ring; (g) each form gets its own CSS prefix — never reuse another form's.
- ❌ No pick-from-library form using `sheet__content` wrapper or slot-tab `<nav>`. Use the `kp-*` picker-list structure (DESIGN §5.24): `kp-day-slot-row` → `kp-meal-section` / `kp-meal-header` → `recipe-pick-list` → `kp-footer`. Reference: `openPlanMealSheet()` in `kitchen.js`, `openMealPlanSheet()` in `dashboard.js`. `kp-*` CSS is in `components.css` (available on all pages).
- ❌ No page navigation away from a form to open a child form. When a form needs a `+ New X` shortcut, use the inline close-delay-open callback: `closeTaskSheet(); setTimeout(() => openChildForm((newId) => { setTimeout(() => openParentForm(args, newId), 320); }), 320);` — the 320ms gap is the sheet animation budget. The child form is page-local (copy from kitchen.js if needed, adapted to use `taskSheetMount`/`closeTaskSheet`). No sessionStorage handoffs for form flows.

### Long-press & gestures
- Tap = primary action. Long-press = detail sheet. Horizontal swipe = day/month nav.
- Timings: **500ms tracker**, **800ms calendar/kid/dashboard**.
- Every gesture has a non-gesture fallback (visible button).

### Component reuse rule
Before building any new visual element, search §5 of DESIGN.md. The catalog covers: Card, Tabs, Sheet, Modal, Button, Icon button, Chip, Field, Banner, Timer, Avatar, Check, FAB, Bottom nav, List group/row, Switch, Empty state, Loading skeleton, Error state, Toast, Celebration, Progress bar. Use it or add a variant — never fork.

### When spec is silent
If a situation isn't covered: **stop, update DESIGN.md in the same PR that adds the pattern.** Don't improvise in the component code and skip the spec — drift compounds. Deviation from the spec requires a named exception in the PR description.

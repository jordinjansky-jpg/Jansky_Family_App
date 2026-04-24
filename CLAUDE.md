# Daily Rundown — Family Task Manager

A family chore/task management app with scheduling, scoring, and gamification. Each family member gets assigned daily, weekly, monthly, and one-time tasks with point-based scoring, letter grades, and streak tracking.

## Tech Stack
- **Frontend:** Vanilla JS (ES modules), HTML, CSS — no framework, no bundler, no npm
- **Database:** Firebase Realtime Database (compat SDK via CDN — `firebase.` global, not modular imports)
- **Hosting:** Cloudflare Pages — static files served as-is via `git push` to `main`
- **Styling:** Modular CSS split by responsibility, themed via JS at runtime. Service worker caches app shell for offline support.

## Commands
```bash
# Deploy (auto-deploys on push to main via Cloudflare Pages)
git push origin main

# No build step, no test suite, no package.json
# Open any .html file directly in browser for local dev (needs Firebase connection)
```

## File Structure
```
/                         ← Served as-is by Cloudflare Pages
├── index.html            ← Dashboard shell — loads dashboard.js
├── dashboard.js          ← Dashboard logic — daily task list, completion toggling, progress, overdue banner
├── person.html           ← Per-person PWA entry (?person=Name) — installable home screen shortcut with unique manifest (served by sw.js)
├── calendar.html         ← Three-view calendar (month/week/day) with swipe nav, quick-add events, person filters
├── scoreboard.html       ← Leaderboard, grades table, trend sparklines, category breakdown
├── tracker.html          ← Weekly/monthly task status rows, filters, skipped task detection
├── admin.html            ← PIN-gated admin (tasks, people, categories, settings, theme, schedule, data, debug)
├── kid.html              ← Kid-friendly view (?kid=Name), emoji hints, celebrations, simplified UI
├── setup.html            ← First-run wizard (6 steps: info, people, categories, theme, PIN, finish)
├── manifest.json         ← PWA manifest for home screen installability
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
- **CSS split:** Styles are split into 10 files by responsibility. Each page loads only the CSS it needs via multiple `<link>` tags. Order matters: base → layout → components → page-specific → responsive.
- **Offline support:** Service worker caches the full app shell (network-first strategy). Firebase API calls are network-only. The app loads and functions offline; writes queue and sync on reconnect.
- **Real-time updates:** Dashboard, calendar, and kid mode use Firebase `onValue` listeners for completions and schedule. Renders are debounced at 100ms. Scoreboard and tracker use one-shot reads (historical data).
- **Swipe gestures:** Horizontal swipe anywhere on page navigates between days (dashboard/kid) or months (calendar).

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
- **Long-press:** Opens detail sheet. Tap toggles completion. Horizontal swipe navigates days (dashboard) or months (calendar). Timing: **500ms on tracker**, **800ms on calendar/kid mode** (longer hold required there because those views are more touch-scroll-heavy and false-fires are more disruptive).
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

## Changelog (last 5)
- Adult rewards + confirm modals: Adults skip approval for buying/using rewards (instant). "Use" button on saved tokens in scoreboard store (custom, task-skip picker, penalty removal). All browser confirm()/alert() replaced with polished in-app showConfirm() modals. Toast styles shared across all pages.
- Reward bank + fixes: All approved rewards banked (not just functional), custom rewards require parent approval to use, kid Use Now/Save overlay, bank visible in kid mode + scoreboard store + admin, achievement revoke (won't re-fire) vs reset (re-earnable), scoreboard clear now resets balances/messages/tokens
- Rewards Store polish: Bounties section in kid store, animated balance count-up, "Skipped" badge on task cards, achievements re-check on task completion, admin achievements view, redemption history in admin, balance trend sparkline on scoreboard
- Rewards Store (1.2): Points economy (100 pts/day), parent-defined rewards, bonus/deduction messages, notification bell on all pages, functional rewards (task skip, penalty removal), bounty tasks, 13 achievement badges, bonus multiplier days, balance on scoreboard, admin balance management
- Calendar mobile week view: days reorder like dashboard (today first, future next, past at bottom via CSS `order`), "Today" tag pill, past days faded, dead auto-scroll code removed
- Calendar overhaul (1.1): three-view calendar (month/week/day), first-class events with quick-add, time-grid day view, swipe navigation, person filters, `calendar-views.js` shared module
- Points system rescale: new formula `basePoints = max(estMin, 5) × difficultyMultiplier` replaces `round(mult × (1 + estMin/30))`. Difficulty multipliers configurable per-family via `settings.difficultyMultipliers`. Zero data migration — percentages identical pre/post.
- Late completion penalties: moved late penalty from scoring-time detection to completion-time recording. Past daily tasks tap-blocked. `isLate` flag + `pointsOverride` set at completion time. Slider shows penalty, parent-adjustable.
- Codebase audit fixes: XSS hardening, CSS variable fixes, scheduler bug fixes (cooldown anchor leak, past-date one-time tasks), scoring late-completion detection, calendar listener leak fix, DOM helpers extracted

## Backlog

Product direction: evolve Daily Rundown from a task manager into a **Skylight Calendar competitor** — a free, web-based family hub. The app already has a superior task/scoring engine; the goal is to add the hub features (calendar, meals, lists, display) that make it the family's single go-to screen. Design bar: as clean as Skylight, as easy to use as Google Calendar. All features below run on free tiers (Firebase Spark, Cloudflare free, OpenWeatherMap free, FCM free) except school lunch PDF import which costs ~$0.03/month via Claude API.

### Tier 1 — The Family Hub Transformation (build in order)

~~**1.1 — Calendar Overhaul (Family Hub)** · DONE — shipped 2026-04-16. Three-view calendar (month/week/day), first-class events with quick-add, time-grid layout, swipe navigation, person filters.~~

---

~~**1.2 — Rewards Store** · DONE — shipped 2026-04-18. Points economy (100 pts/day), parent-defined rewards with emoji/pricing helper, notification bell on all pages, bonus/deduction messages, approval flow, kid mode store/history/wishlist, functional rewards (task skip, penalty removal), bounty tasks, 13 achievement badges with trophy case, bonus multiplier days, balance on scoreboard, admin balance management and person delete cascade.~~

---

**1.3 — Meal Planning (Lightweight)** · Medium (~2 sessions) · Depends on 1.1 · Cost: $0

Simple "what are we eating" system — not a recipe database. Answers "what's for dinner?" at a glance from the wall display or phone.

*Core features:*
- Per-day meal slots: Breakfast, Lunch, Dinner, Snack (configurable — some families only plan dinner).
- Each entry: meal name + optional recipe URL + optional notes.
- Recipe links: tap a meal name to open the recipe website. On kiosk/wall display, show a QR code so someone can scan with their phone to pull up the recipe.
- Saved meals library: builds organically. Every meal you add gets saved. When planning a new day, autocomplete suggests from your library. "Taco Tuesday" should take 2 seconds to add after the first time.
- Quick-plan: week view in admin or calendar where you can drag saved meals onto day slots.
- School lunch entries (from PDF import, see 2.3) display distinctly — school emoji, different styling, read-only.

*Schema:*
```
rundown/meals/{YYYY-MM-DD}/{slot}  ← { name, url?, notes?, source?: 'manual'|'school' }
rundown/mealLibrary/{pushId}       ← { name, url?, tags?, lastUsed }
```

*Display:* Meals appear in the calendar day view (all three views), on the kiosk display, and in kid mode. Keep it visually light — a small section, not competing with events and tasks for attention.

---

**1.4 — Weather Widget** · Low (~0.5 session) · No dependencies · Cost: $0

Current conditions + forecast on dashboard and calendar. OpenWeatherMap free tier (1,000 calls/day — app uses ~50). Single family location from `rundown/settings`. Show temperature, conditions icon, high/low on calendar day view and kiosk display header. Cache in localStorage (refresh every 30-60 min). Small footprint — ambient info, not a weather app.

---

**1.5 — Kiosk / Wall Display Mode** · Medium (~1-2 sessions) · Depends on 1.1, 1.3, 1.4 · Cost: $0 (hardware ~$175-255 one-time: Raspberry Pi 5 + 27" touchscreen + wall mount)

A dedicated full-screen mode (`display.html`) designed for a 27" wall-mounted touchscreen. This is NOT a passive read-only dashboard — it's the full app in a large-format, always-on layout. The family can do everything from the wall: add events, check off tasks, plan meals, browse the week, drill into any day. Think of it as an iPad app permanently mounted on the kitchen wall, not a PowerPoint slide with checkboxes.

*Default state:* Week overview showing the current week's events, tasks, meals, and weather. This is what you see when you walk into the kitchen — a full picture of the family's week at a glance.

*Full interactivity:*
- Tap any day to drill into the day/agenda view with full detail.
- Tap "+" to add events or meals — same easy creation flow as the calendar hub.
- Tap tasks to check them off, open detail sheets, mark late.
- Swipe or tap arrows to navigate weeks/months.
- Access the scoreboard, rewards, shopping list from a slide-out menu or tab bar.
- Kid mode accessible per-child (tap their avatar to see their view).

*What makes it "kiosk" rather than just "the app on a big screen":*
- No browser chrome — full-screen, immersive.
- Larger touch targets and fonts optimized for arm's-length interaction on a 27" display.
- Auto-wake/sleep on configurable schedule (screen dims at 10pm, brightens at 6am).
- Optional ambient mode during sleep: clock, tomorrow's first event, weather.
- No admin access from this view (PIN-protected settings stay on phone only).
- Designed to launch on boot via Raspberry Pi Chromium `--kiosk` flag or Android tablet full-screen mode.

*Not just for the wall:* Should also work well on a 10" tablet propped on a kitchen counter. Layout adapts to both 27" landscape and 10" tablet landscape.

---

**1.6 — Activities** · Medium-high (~3-4 sessions, two phases) · No dependencies · Cost: $0

Family activity tracker — shared library of optional activities (walk, read, jog, etc.) anyone can do on-demand with a persistent stopwatch. Weekly goals with tiered point payouts into the rewards store. Separate activity scoreboard (time leaderboard + goal achievement views). Shares categories with tasks; timer built as shared component (`shared/timer.js`) reusable by backlog 3.1. Two phases: Phase 1 is core loop (library, stopwatch, session logging, time scoreboard), Phase 2 adds goals, points, goal scoreboard, kid mode, admin. See full spec: `docs/superpowers/specs/2026-04-19-activities-design.md`.

---

**1.7 — Shopping Lists** · Medium (~1-2 sessions) · No dependencies · Cost: $0

Shared grocery/shopping lists with real-time Firebase sync. Two people at the store see the same list — items checked off by one update instantly for both.

*Core features:*
- Quick-add with autocomplete from past items.
- Tap to cross off (strikethrough, item sinks to bottom of list).
- Optional category grouping (produce, dairy, frozen, etc.) — categories auto-suggested based on past categorization of the same item.
- Multiple lists (Grocery, Costco, Target, etc.).
- Anyone can add/edit — no PIN required.
- Accessible from nav bar, kiosk display menu, and as a standalone page on phone.

*Schema:*
```
rundown/lists/{listId}              ← { name, createdAt, sortOrder }
rundown/lists/{listId}/items/{id}   ← { name, checked, category?, addedBy?, addedAt }
```

---

### Tier 2 — Deepening the Platform

**2.1 — Push Notifications** · High (~2-3 sessions) · Depends on 1.1 · Cost: $0 (FCM is free unlimited; Cloudflare Workers free tier is 100K req/day)

Daily reminders, upcoming event alerts (15/30/60 min before), task nudges. Requires FCM (Firebase Cloud Messaging) + Cloudflare Worker for server-side scheduling. Per-person notification preferences (what types, quiet hours). Include in-app notification sound/vibration for the notification bell (achievement unlocks, reward approvals, bounty grants) using Web Audio API or `navigator.vibrate()`. This is the feature that enables "replace Google Calendar" — without buzzing your phone before the dentist appointment, people will keep Google Calendar alongside this app. See notifications uplift assessment from 2026-04-03.

---

**2.2 — Flexible Recurrence** · High (~2 sessions) · Depends on 1.1 · Cost: $0

Support "every N days", "every other week", "1st and 15th of month", "every other Tuesday" beyond daily/weekly/monthly/once. Schema: add `recurrenceRule` object to task/event (e.g., `{ type: 'interval', every: 14 }` or `{ type: 'dates', days: [1, 15] }`). Essential for the calendar to be a real Google Calendar replacement — family events need real recurrence rules. Extends the scheduler (~850 lines). Consider: extend `placeDailyTask` with interval support, add new `placeCustomTask` for date-based rules.

---

**2.3 — School Lunch PDF Import** · Medium (~1-2 sessions) · Depends on 1.3 · Cost: ~$0.03/month (Claude API via Haiku 4.5, one-time $5 credit lasts years)

AI-powered import of school lunch calendars. Parent uploads PDF in admin → Cloudflare Worker receives it → sends to Claude API (Haiku 4.5) with extraction prompt → structured menu data returned as JSON → written to Firebase as school lunch entries tagged with `source: "school"`. First Cloudflare Worker and first external API dependency. The Worker pattern is reusable for future AI features. Requires Anthropic API key stored as Cloudflare Worker secret.

---

**2.4 — Vacation / Skip Mode** · Medium (~1-2 sessions) · No dependencies · Cost: $0

Mark a person as "away" for a date range. Schema: `rundown/people/{id}/away: [{ start, end }]`. Scheduler skips placing tasks for away people. Optionally redistribute to other owners (rotate-mode only) or mark exempt for scoring. Per-person "Away" toggle in admin with date picker. Family-wide "vacation mode" pauses all non-daily tasks.

---

### Tier 3 — Polish & Engagement

**3.0 — Dashboard loading skeleton** · Low (~0.5 session) · No dependencies · Cost: $0

Replace the current inline "Loading..." spinner on the dashboard with a card-shaped skeleton that matches the real card layout (owner-stripe placeholder + title bar + meta bar + check placeholder). Respects reduced-motion (skeleton stays static, no shimmer). Rationale: at first paint the user sees a convincing skeleton for ~200ms before Firebase responds, which feels more polished than a centered spinner against the empty page. Noted for future upgrade during Phase 1.5 polish review (2026-04-24).

---

**3.1 — Task Timer / Stopwatch** · Medium (~1-2 sessions) · Depends on 1.6 (shared timer component) · Cost: $0

Visible countdown in kid mode and dashboard using `estMin`. Uses shared timer component from Activities (`shared/timer.js`). Start button on task card launches timer overlay. Optional auto-complete on finish. Sounds/vibration. Timer-based bounties: countdown to expiration (unclaimed = gone) and countdown to completion (read for X min).

---

**3.2 — Task Delegation / Swaps** · Medium-high (~2 sessions) · Depends on 2.1 · Cost: $0

Family members propose trades ("I'll do your dishes if you do my laundry"). Schema: `rundown/trades/{pushId}` with `{ proposerId, proposerTaskKey, targetId, targetTaskKey, status: 'pending'|'accepted'|'declined', createdAt }`. Accepting swaps `ownerId` on schedule entries. UI: notification badge, trade proposal from detail sheet, accept/decline list.

## Design Rules (digest)

**Full spec:** [docs/DESIGN.md](docs/DESIGN.md) — single source of truth for all UI decisions. Read it before designing, building, or reviewing anything visual. Mockups live in [mockups/](mockups/).

This digest exists so that if context gets compacted mid-task, the non-negotiables survive. It is not a substitute for the full spec.

### Core principles (8)
1. **Calm, confident, quiet.** No dev-tool vibes. No gradient text in chrome. No "designed for a design reel" moments.
2. **One component per shape.** One Card, one Tabs, one Sheet, one Modal, one Banner, one Timer. Variants, not forks.
3. **Mobile is the default.** Tablet is a deliberate two-pane redesign. Kiosk is a separate layout file (`display.html`). Desktop is not a target.
4. **Every area budgets for growth.** Reserve room for the backlog features that map to it. Don't ship screens with no room for what's already planned.
5. **Design the whole flow.** Every feature ships with empty, loading, error, and success states.
6. **Consistency beats cleverness.** The product should feel like one designer made it in one sitting.
7. **Accessibility is not optional.** 44×44 tap targets (56×56 kid mode). Keyboard-navigable. `prefers-reduced-motion` respected. Contrast verified.
8. **No dev-tool vibes.** No inline styles, no raw hex in component CSS, no console-flavored debug chrome, no `window.confirm`/`window.alert`.

### Feature-home map (hard rules)
Every feature (current + backlog) has a named home — see §2 in DESIGN.md. Enforced:
- Phone tab bar is capped at 5 slots: **Home · Calendar · Scores · Tracker · More**.
- Meals, Weather, Kiosk, Vacation, Recurrence, Timer, School-lunch import, Delegation **never** become tabs.
- Activities and Shopping are the only backlog features that earn nav placement (inside More on phone).
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

### Component reuse rule
Before building any new visual element, search §5 of DESIGN.md. The catalog already covers: Card (+ variants), Tabs, Sheet, Modal, Button, Icon button, Chip, Field, Banner, Timer, Avatar, Check, FAB, Bottom nav, List group/row, Switch, Empty state, Loading skeleton, Error state, Toast, Celebration, Progress bar. If the right shape exists, **use it or add a variant** — don't fork.

### Layout cheatsheet
- **≤600px (phone):** single column, bottom nav, FAB for primary action.
- **≥768px (tablet):** two-pane (left rail 280px + main), not stretched phone.
- **≥1400px (kiosk):** `display.html` — separate layout, own CSS, large touch targets, full interactivity (not read-only).

### Long-press & gestures
- Tap = primary action. Long-press = detail sheet. Horizontal swipe = day/month nav.
- Timings: **500ms tracker**, **800ms calendar/kid/dashboard**.
- Every gesture has a non-gesture fallback (visible button).

### Pre-PR checklist (abbreviated — full list in DESIGN.md §11)
- [ ] Feature-home map updated if the feature is new or moved.
- [ ] Tested at 375px, 768px, 1024px, and 1920×1080 if touching kiosk.
- [ ] 44×44 tap targets (56×56 kid mode).
- [ ] No inline styles, no raw hex in component CSS, no `window.confirm`/`window.alert`.
- [ ] Any new pattern is a variant of an existing component (or spec updated in the same PR).
- [ ] Empty, loading, error, success states designed.
- [ ] Tested in ≥2 themes, light + dark.
- [ ] `prefers-reduced-motion` respected. Focus rings visible.
- [ ] Header not gaining icons. Bottom nav not exceeding 5 tabs.
- [ ] Kid mode and kiosk appearance considered.
- [ ] Notifications routed through Bell, not ad-hoc surfaces.
- [ ] Banner budget respected (one at a time).
- [ ] Gestures have non-gesture fallbacks.

### When spec is silent
If a situation isn't covered: **stop, update DESIGN.md in the same PR that adds the pattern.** Don't improvise in the component code and skip the spec — drift compounds. Deviation from the spec requires a named exception in the PR description.

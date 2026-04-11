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
├── calendar.html         ← Single-month grid with swipe nav, day detail bottom sheet, event color bars
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
- Points system rescale: new formula `basePoints = max(estMin, 5) × difficultyMultiplier` replaces `round(mult × (1 + estMin/30))`. Produces larger integer values so late penalties actually land on small tasks (e.g. a 5-min easy task is now 5pt, so 75% late → 4pt instead of 1pt → 1pt). Difficulty multipliers are now configurable per-family via `settings.difficultyMultipliers` in the admin Settings tab (defaults `{easy:1, medium:2, hard:3}`, clamped 1–10, soft-warned if non-monotonic). Zero data migration — percentages and grades are identical pre/post because `earned` and `possible` both scale by the same factor. Tabular-nums added to stats displays so larger numbers don't jitter in place.
- Late completion penalties: moved late penalty from scoring-time detection to completion-time recording. Past daily tasks tap-blocked (opens detail sheet instead). "Complete (Late)" button label on past-date tasks. `isLate` flag + `pointsOverride` set at completion time. "Late" chip on incomplete past daily cards. Slider shows penalty, parent-adjustable. Scoring simplified (removed `isOverdue` logic from `earnedPoints`, `dailyScore`, `buildSnapshot`).
- Codebase audit fixes: XSS hardening (admin/kid name escaping), CSS variable fixes (kid PIN error, theme button), scheduler bug fixes (cooldown anchor leak in weekly/monthly, past-date one-time tasks now appear instead of vanishing), scoring late-completion detection in snapshots, calendar listener leak fix via AbortController, recovery PIN unconditional, parseIntOr/parseFloatOr helpers, DOM helpers extracted to dom-helpers.js, dead code removal
- Bulk admin actions: multi-select mode in tasks tab, batch edit (rotation, assignment mode, category, status, difficulty, time of day, est. minutes, owners), batch delete with confirmation, floating action bar, auto schedule rebuild
- Category-level daily limits: per-person and per-household minute caps on categories, scheduler defers/skips tasks over limit, admin UI with badges
- `e841314` 7 bug fixes (scheduler shadowing, scoring exempt tasks, tracker skipped filter, duplicate listeners, calendar perf), calendar single-month view with swipe nav, SW v5
- Add meta tags, manifest.json, favicon, PWA support, event time field, auto-rebuild on task edit

## Backlog
- **Push notifications** — Daily reminders, task delegation alerts. Requires FCM + server-side trigger (Cloud Function or Cloudflare Worker). High effort (~2-3 sessions). See notifications uplift assessment from 2026-04-03.
- **Rewards & milestones** — Achievement badges for streaks (10-day, 30-day, 100-day), grade milestones (first A+ week), and cumulative point thresholds. Parent-defined rewards linked to grade or point targets ("A+ this week → pick Friday's dinner"). Optional rewards store where kids spend earned points. Data: `rundown/rewards/{pushId}` for definitions, `rundown/achievements/{personId}/{achievementKey}` for unlocked badges. UI: new tab or scoreboard sub-section. Medium effort (~2 sessions).
- **Task timer / stopwatch** — Visible countdown in kid mode and dashboard using the existing `estMin` field. Start button on task card or detail sheet launches a timer overlay. Optional: auto-complete when timer finishes. Sounds/vibration at completion. Consider: timer should persist across page navigation (use sessionStorage or a small state module). Purely client-side — no schema changes. Medium effort (~1-2 sessions).
- **Week view on calendar** — Dense 7-day view showing tasks by time-of-day slot (AM/PM/Anytime rows). Swipe to navigate weeks (reuse existing swipe infra). Toggle between month and week view via a button in the calendar header. Uses the same schedule data — just a different rendering layout. Medium effort (~1-2 sessions).
- **Flexible recurrence** — Support "every N days", "every other week", "1st and 15th of month", "every other Tuesday" beyond the current daily/weekly/monthly/once. Schema: add `recurrenceRule` object to task (e.g., `{ type: 'interval', every: 14 }` or `{ type: 'dates', days: [1, 15] }`). Scheduler interprets the rule during placement. High complexity — the scheduler is already ~850 lines. Consider: extend `placeDailyTask` with interval support, add new `placeCustomTask` for date-based rules. High effort (~2 sessions).
- **Task delegation / swaps** — Family members propose trades ("I'll do your dishes if you do my laundry"). Schema: `rundown/trades/{pushId}` with `{ proposerId, proposerTaskKey, targetId, targetTaskKey, status: 'pending'|'accepted'|'declined', createdAt }`. Accepting a trade swaps `ownerId` on the two schedule entries. UI: notification badge on dashboard, trade proposal from detail sheet, accept/decline in a trades list. Medium-high effort (~2 sessions).
- **Vacation / skip mode** — Mark a person as "away" for a date range. Schema: `rundown/people/{id}/away: [{ start, end }]`. Scheduler skips placing tasks for away people in their date range. Optionally redistribute their tasks to other owners (rotate-mode only) or mark as exempt for scoring. UI: per-person "Away" toggle in admin with date picker. Admin could also set a family-wide "vacation mode" that pauses all non-daily tasks. Medium effort (~1-2 sessions).

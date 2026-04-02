# Daily Rundown Rebuild - Governance
**Current Phase:** 8 | **Status:** Complete  
**Next Milestone:** Phase 9 — Kid mode

## Architecture Decisions
- Firebase root: `rundown/` — NEVER touch `cleaning/*`
- Module rules: Shared modules are pure functions (no DOM). Pages own the DOM.
- Schema: Locked after Phase 1 validation. Changes require migration plan.
- Deployment: Cloudflare Pages via `git push` to `main`. No build step.
- Imports: All ES module imports use relative paths with `.js` extensions.
- Firebase SDK: Loaded via CDN (compat mode) — no npm, no bundler.

## File Structure
```
/                         ← Served as-is by Cloudflare Pages
├── index.html            ← Dashboard (Phase 3)
├── calendar.html         ← Calendar (Phase 4)
├── scoreboard.html       ← Scoreboard (Phase 6)
├── tracker.html          ← Task Tracker (Phase 7)
├── admin.html            ← Admin panel (Phase 8)
├── kid.html              ← Kid mode (Phase 9)
├── setup.html            ← Setup wizard (Phase 1)
├── shared/
│   ├── firebase.js       ← Firebase init + read/write helpers
│   ├── scheduler.js      ← Schedule generation (Phase 2)
│   ├── scoring.js        ← Points & grades (Phase 5)
│   ├── state.js          ← Completion state mgmt (Phase 3)
│   ├── components.js     ← Reusable UI components
│   ├── theme.js          ← Theme application
│   └── utils.js          ← Date/time helpers
└── styles/
    └── common.css        ← Shared styles & CSS variables
```

## Firebase Schema (`rundown/`)
```
rundown/
├── settings          ← flat object { appName, familyName, timezone, weekendWeight, theme: {...} }
├── people/
│   └── {pushId}      ← { name, color }
├── categories/
│   └── {pushId}      ← { name, icon }
├── tasks/
│   └── {pushId}      ← { name, rotation, owners[], ownerAssignmentMode,
│                         timeOfDay, dedicatedDay?, cooldownDays?, estMin,
│                         difficulty, category, status, createdDate, exempt? }
│                       rotation: 'daily' | 'weekly' | 'monthly' | 'once'
│                       ownerAssignmentMode: 'rotate' | 'duplicate'
│                       timeOfDay: 'am' | 'pm' | 'anytime' | 'both'
├── schedule/
│   └── {YYYY-MM-DD}/
│       └── {entryKey} ← { taskId, ownerId, rotationType, ownerAssignmentMode, timeOfDay }
│                       entryKey format: sched_{timestamp}_{counter}
├── completions/
│   └── {entryKey}     ← { completedAt: ServerValue.TIMESTAMP, completedBy: 'dashboard'|'calendar',
│                          pointsOverride?: number (percentage, null = use base) }
├── snapshots/
│   └── {YYYY-MM-DD}/{personId}  ← { earned, possible, percentage, grade, missedKeys[] }
├── streaks/
│   └── {personId}               ← { current, best, lastCompleteDate }
└── debug/eventLog/    ← { ...data, timestamp }
```

## Scoring System (Phase 5)
- **Points formula:** `difficultyMultiplier × (1 + estMin / 30)`, rounded to nearest integer
  - Difficulty multipliers: Easy = 1, Medium = 2, Hard = 3
- **Grade bands:** A+ (97-100), A (93-96), A- (90-92), B+ (87-89), B (83-86), B- (80-82), C+ (77-79), C (73-76), C- (70-72), D+ (67-69), D (63-66), D- (60-62), F (0-59)
- **Daily score:** `(earnedPoints / possiblePoints) × 100` — per person
- **Weighted categories:** `regularTaskPts × (W / (100 - W))` when category has `weightPercent`
- **Past-due credit:** `basePoints × (pastDueCreditPct / 100)` — default 75%
- **Streaks:** consecutive all-complete days per person (current + best)
- **Snapshots:** immutable daily records (earned, possible, percentage, grade, missedKeys) — created at rollover
- **Aggregation:** weekly/monthly/12-month grades derived from daily snapshots at render time (not stored)
- **Admin-configurable:** pastDueCreditPct, weekendWeight, sliderMin/Max, category weightPercent — all Phase 8

## Key Behavior Decisions
- Scheduler generates 90 days of future entries (tomorrow onward, never today/past)
- Completion allowed on any date (no future-date blocking)
- Overdue: only non-daily tasks from past dates; daily tasks are excluded
- Completed tasks render at the very bottom of any task list (below all frequency groups)
- Task grouping order: Daily → Weekly → Monthly → One-Time, then owner within group
- Task cards show point values (e.g., "3pt") alongside time estimates
- Long-press task card opens detail sheet with points slider, delegate, move, skip, and edit buttons
- Points slider stores `pointsOverride` as percentage (0–150) on completion record; 100% = null (no override)
- Daily rollover creates snapshots for past days on dashboard load (fire-and-forget)
- Calendar bottom sheet locks height on open so person filter changes don't resize it
- Category emoji on cards will be a per-category toggle (Phase 8 admin setting)
- Scoreboard period tabs: Today/Week/Month/12Mo — leaderboard sorts by selected period
- Scoreboard weekly grades blend snapshots (past days) + live daily score (today) for accuracy
- Scoreboard drill-down: tap person card → bottom sheet with task-level detail (Done/Late/Missed/Pending)
- Scoreboard trends: 4-week bar sparklines per person with grade-colored fills

## Gotchas (Critical)
- Firebase RTDB compat SDK used (not modular) — all imports via `firebase.` global after CDN load
- Timezone handling: always use `settings.timezone` for date calculations, never local device time
- ES module imports MUST have `.js` extension — bare imports break without bundler
- `rundown/settings` is a flat object, not nested under a push ID

## Changelog
2026-04-02 Phase 8 polish: Category showIcon toggle (controls icon display on task cards). Reworked admin task list UI (two-row layout with name/badges top row, owners/actions bottom row). Reworked admin people list UI (horizontal with color dot, info column). PIN session caching (30min TTL in sessionStorage). Quick-add task button (+) in header on all main pages. Long-press detail sheet now has Delegate (person chips), Move (date picker), Skip, and Edit Task buttons on dashboard/calendar/tracker — no PIN required. Edit task opens inline bottom sheet. Debug mode shows scoring breakdown panel on dashboard with copy-to-clipboard.
2026-04-02 Phase 8: Admin Panel — PIN-gated admin page with 8 tab sections. Tasks: filterable list (rotation/owner/category/status), full CRUD with ownerAssignmentMode toggle, pause/unpause, delete with confirmation. People: add/edit/remove with color picker, role toggle (adult/child), kid mode settings (showWeekView, showCalendar, canDelegate, canMoveTasks, showSlider, celebrations). Categories: CRUD with icon/label/pinProtected/weightPercent, delete reassigns tasks to fallback category. Settings: appName, familyName, timezone, weekendWeight, pastDueCreditPct, sliderMin/Max, PIN change. Theme: preset grid + accent color picker, live preview, syncs to Firebase. Schedule: 90-day summary stats (days/entries/per-person load), rebuild future schedule button. Data: JSON export, factory reset (PIN + type RESET confirmation). Debug: toggle debug mode, event log viewer (last 50), schedule inspector per task, copy-to-clipboard. Tracker also got long-press detail sheet support.
2026-04-02 Phase 7: Task Tracker — weekly and monthly recurring task status views with completion checklist. Tab toggle between weekly/monthly. Person pills, category dropdown, and status dropdown filters. Status badges (Done/Done Late/Overdue/Upcoming/Skipped). Summary progress bar with status counts. Monthly view groups tasks by ISO week. Overdue rows highlighted with red left border. Skipped task detection for active tasks missing schedule entries.
2026-04-02 Phase 6: Scoreboard — period-selectable leaderboard (today/week/month/12-month), all-grades table, 4-week trend sparklines, per-category breakdown bars, streak display. Tap person card for drill-down bottom sheet with task-level detail (Done/Late/Missed/Pending status, earned/possible points). No new shared modules needed — uses existing scoring.js aggregation helpers.
2026-04-02 Phase 5: Scoring — points formula (difficulty × (1 + estMin/30)), letter grades (A+ through F), weighted category math, past-due credit, daily snapshots, streak tracking. Points shown on task cards. Grade badge in dashboard header and calendar sheet. Long-press detail sheet with points slider (0–150%, live grade preview). Daily rollover creates snapshots + updates streaks on load. Aggregate helpers for weekly/monthly/12-month.
2026-04-02 Phase 4: Calendar — 3-month grid view with frequency breakdown labels (D/W/M), animated bottom sheet for day detail, completion toggling, person filter in sheet with locked height, smooth in-place updates. Reuses compact task cards from Phase 3.
2026-04-02 Phase 3: Dashboard — task cards, completion toggling (write/remove to rundown/completions), person filter pills, progress bar, overdue banner (collapsible), time-of-day grouping, undo toast, day-complete celebration. state.js built with pure query helpers. Temp Phase 2 testing UI removed.
2026-04-02 Phase 2: Scheduling engine — all 5 steps (basic, rotation, cooldown, load balancing, duplicate). Validated: schedule generates correctly, deterministic rebuilds, no past/today entries.
2026-04-02 Phase 1: Foundation — Firebase connection, utils, theme, common CSS, nav bar, setup wizard, empty page shells. Validated: setup writes to rundown/, nav works, theme persists, no cleaning/* writes.

## Backlog
- Phase 9: Kid mode
